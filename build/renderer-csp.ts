/**
 * P2-4：渲染层 CSP 的 dev/prod 拆分（构建期注入 + 校验）
 *
 * 背景（2026-11-20 全量安全扫描 P2-4）：`src/renderer/index.html` 只有一份 CSP，
 * 生产产物原样保留 `script-src 'self' 'unsafe-eval'` 与 `connect-src ... http://localhost:*
 * ws://localhost:*`。前者为 Monaco/Vite 调试链路需要，后者仅供 Vite dev HMR；
 * 打包后二者均无实际用途，却削弱了 XSS 后效阻断（unsafe-eval 扩大利用面，
 * localhost 放行可用于探测/访问本机服务）。
 *
 * 方案（最小侵入、可单测）：
 * - 源 `index.html` 继续保留「开发口径」CSP（dev server 免配置、Monaco 兼容性不变）；
 * - 构建阶段由 electron.vite.config.ts 的 `apply: 'build'` 插件调用本模块，
 *   从 CSP 中剥离仅供开发链路的 token，得到「生产口径」CSP 后再写入产物；
 * - 转换后立即执行 assertProductionCsp 自检，任何残留/关键指令缺失都会让构建失败，
 *   避免「拆分代码存在但没生效」的静默回归。
 *
 * 该模块同时被 tests/unit/renderer-csp.test.ts 直接引用，锁定 dev/prod 两套口径。
 */

/** index.html 中 CSP meta 标签的正则：捕获前缀、content 值与结尾引号（允许跨行） */
const CSP_META_PATTERN = /(<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?content=")([^"]+)(")/

/**
 * 仅开发链路需要的 CSP token：生产构建必须从对应指令中剥离。
 * - script-src：'unsafe-eval'（Monaco/Vite 开发链路；生产源码无 eval/new Function）
 * - connect-src：本地 dev server / HMR WebSocket 放行（打包后无实际用途）
 * - img-src：file:（dev server 模式 http 页面 + webSecurity=false 的本地图片口径；
 *   2026-11-20 renderer file:// → app:// 迁移后，生产本地图片统一走 app://local，
 *   file 协议特权 fuse 关闭后 file: 在发布产物中不可用，必须剥离）
 */
export const DEV_ONLY_DIRECTIVE_TOKENS: Readonly<Record<string, readonly string[]>> = {
    'script-src': ["'unsafe-eval'"],
    'connect-src': ['http://localhost:*', 'ws://localhost:*'],
    'img-src': ['file:']
}

/** CSP 解析结果：指令名 → token 列表（保持源顺序） */
function parseDirectives(csp: string): Array<{ name: string; tokens: string[] }> {
    return csp
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part.length > 0)
        .map((part) => {
            const [name, ...tokens] = part.split(/\s+/)
            return { name, tokens }
        })
}

/** 由开发口径 CSP 生成生产口径 CSP（纯函数，不校验） */
export function buildProductionCsp(sourceCsp: string): string {
    const directives = parseDirectives(sourceCsp)
    const transformed = directives.map(({ name, tokens }) => {
        const devOnlyTokens = DEV_ONLY_DIRECTIVE_TOKENS[name] ?? []
        const keptTokens = tokens.filter((token) => !devOnlyTokens.includes(token))
        return [name, ...keptTokens].join(' ')
    })
    return transformed.join('; ')
}

/**
 * 生产口径 CSP 自检（构建期门禁）：
 * - 不得残留 'unsafe-eval'、localhost/127.0.0.1 放行与 file: 放行（file 协议特权 fuse 关闭后
 *   发布产物中不可用，本地资源统一走 app://local）；
 * - 关键指令与收紧项必须保留（script-src/connect-src 的 'self'、app:// 本地资源放行
 *   app:、object-src/form-action 'none'）。
 * 任一不满足直接抛错，让构建失败而不是发布弱化配置。
 */
export function assertProductionCsp(csp: string): void {
    const directives = parseDirectives(csp)
    const getTokens = (name: string): string[] =>
        directives.find((directive) => directive.name === name)?.tokens ?? []

    if (getTokens('script-src').includes("'unsafe-eval'")) {
        throw new Error("生产 CSP 校验失败：script-src 仍包含 'unsafe-eval'")
    }
    if (/localhost|127\.0\.0\.1/i.test(csp)) {
        throw new Error('生产 CSP 校验失败：仍包含 localhost/127.0.0.1 放行')
    }
    // 2026-11-20（file:// → app:// 迁移）：发布产物不得保留 file: 放行
    if (directives.some((directive) => directive.tokens.includes('file:'))) {
        throw new Error('生产 CSP 校验失败：仍包含 file: 放行（本地资源应走 app://local）')
    }
    if (!getTokens('script-src').includes("'self'")) {
        throw new Error("生产 CSP 校验失败：script-src 缺少 'self'")
    }
    if (!getTokens('connect-src').includes("'self'")) {
        throw new Error("生产 CSP 校验失败：connect-src 缺少 'self'")
    }
    // app:// 迁移：本地用户文件（预览图片 / HTML 查看器相对资源）由 app://local 提供，
    // 'self' 仅覆盖 app://baize，故 img-src / style-src 必须保留 scheme 源 app:
    if (!getTokens('img-src').includes('app:')) {
        throw new Error('生产 CSP 校验失败：img-src 缺少 app:（本地图片 app://local 被拦截）')
    }
    if (!getTokens('style-src').includes('app:')) {
        throw new Error('生产 CSP 校验失败：style-src 缺少 app:（HTML 查看器相对样式被拦截）')
    }
    if (!getTokens('object-src').includes("'none'")) {
        throw new Error("生产 CSP 校验失败：object-src 必须为 'none'")
    }
    if (!getTokens('form-action').includes("'none'")) {
        throw new Error("生产 CSP 校验失败：form-action 必须为 'none'")
    }
}

/**
 * 把 index.html 的 CSP meta 改写为生产口径（构建插件唯一入口）。
 * 缺少 CSP meta 视为配置错误直接抛错（防止安全头被无意删除后静默构建通过）。
 */
export function applyProductionCsp(html: string): string {
    const match = CSP_META_PATTERN.exec(html)
    if (!match) {
        throw new Error('生产 CSP 注入失败：index.html 缺少 Content-Security-Policy meta')
    }
    const productionCsp = buildProductionCsp(match[2])
    assertProductionCsp(productionCsp)
    const [, prefix, , suffix] = match
    const start = match.index
    const end = start + match[0].length
    return `${html.slice(0, start)}${prefix}${productionCsp}${suffix}${html.slice(end)}`
}
