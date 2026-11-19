/**
 * HTML 查看器（ShowHtmlView）工具函数。
 *
 * 背景（2026-11-18）：HTML 查看器通过 iframe `srcdoc` 渲染文件内容，而 srcdoc 文档的
 * 基准 URL 是「父页面 URL」而非被查看文件所在目录——因此本地 HTML 中的**相对链接**
 * （如报告 HTML Wiki 顶部导航 `../README.html`）会解析到 app 安装目录，点击无反应。
 * 修复方式：读取 HTML 后注入 `<base href="file:///<文件所在目录>/">`，把相对 URL 基准
 * 指向文件真实目录（同源 iframe 内导航 `file://` → `file://` 允许）。
 *
 * 安全说明：注入 base 只改变相对 URL 解析基准，不执行脚本（sandbox 仍为
 * `allow-same-origin` 且无 `allow-scripts`），不提升跨域权限；打开本地 HTML 是用户主动行为。
 *
 * 迁移（渲染层公共接口归位）：base href 计算与 `<head>` 注入改为复用
 * `src/shared/utils/path.ts` 的 `dirToBaseHref` 与 `src/shared/utils/html.ts` 的
 * `injectIntoHead`（原实现已逐字抽取到 shared 并带等价性单测）；
 * 本函数保留原导出名/签名与输出格式，仅替换实现来源。
 *
 * 2026-11-19 追加：报告 HTML 改为共享 `assets/` 资源后，「静态导航片段注入」也放在本模块
 * （{@link hasReportNavSlot} / {@link injectReportNav} / {@link getReportNavCandidatePaths}），
 * 与 base 注入同属「读取 HTML 后的 srcdoc 内容后处理」，便于单测且保持组件精简。
 */

import { dirToBaseHref, normalizeSlashes } from '../../../../shared/utils/path'
import { injectIntoHead } from '../../../../shared/utils/html'

/**
 * 为 HTML 字符串注入 `<base href>`（基准指向 filePath 所在目录）。
 * @param html 原始 HTML 内容
 * @param filePath 被查看 HTML 的本地绝对路径（Windows 反斜杠 / POSIX 斜杠均可）
 * @returns 注入 base 后的 HTML（保持原有 <head> 优先）
 */
export function withBaseHref(html: string, filePath: string): string {
    // dirToBaseHref 内部：反斜杠归一化 → 取目录（含尾部 /）→ encodeURI → 转义 #/?，
    // 与迁移前本地实现逐字等价（含 Windows 盘符 file:/// 前缀与 POSIX file:// 前缀）。
    const tag = `<base href="${dirToBaseHref(filePath)}">`
    // injectIntoHead 的三分支（已有 head / 仅 html / 裸露片段）与原实现逐字一致。
    return injectIntoHead(html, tag)
}

/* ============================================================================
 * 报告页静态导航注入（2026-11-19：应用内 HTML 查看器 ↔ 报告 HTML 共享 assets 配套）
 *
 * 背景：报告 HTML 页面改为引用共享 `assets/` 资源，顶部导航由 `assets/report-nav.js`
 * 在浏览器打开时动态渲染；但应用内查看器用 `sandbox="allow-same-origin"`（**无**
 * `allow-scripts`）的 srcdoc iframe 展示，页面脚本不会执行 → 导航不显示。
 * 因此查看器读取 HTML 后，把生成脚本预先产出的静态导航片段注入页面占位处。
 *
 * 页面结构契约（生成脚本保证）：
 * - body 顶部：`<!-- baize-report-nav-slot -->` + `<div id="report-nav"></div>`；
 * - 页面含占位标记即视为「应用生成的报告页」；普通用户 HTML 无标记，查看器不做任何
 *   额外文件探测（零额外 IPC）；片段读取失败则保持原内容（导航缺失但页面正常）。
 *
 * 样式无需额外注入：页面 `<link>` 已引用 `assets/report.css`，`<base>` 注入后
 * srcdoc 内可正常加载；本模块只负责把 `<nav class="rgnav">` 静态片段放进占位处。
 * ========================================================================== */

/** 报告页导航占位注释（对空格/大小写容忍；注释即「应用生成报告页」的判定依据） */
const REPORT_NAV_SLOT_COMMENT_PATTERN = /<!--\s*baize-report-nav-slot\s*-->/i

/** 占位注释后的空导航容器（注入成功后清理残留，避免同一文档重复 id / 空占位） */
const REPORT_NAV_EMPTY_CONTAINER_PATTERN = /<div\s+id=["']report-nav["']\s*>\s*<\/div>/gi

/**
 * 报告导航静态片段文件名（按页面深度分两种变体）。
 *
 * - 分类页：页面位于 `docs/reports/html/<分类>/`，片段链接按分类深度编写（`../01-...`），
 *   对应 `report-nav.html`；
 * - 首页：页面位于 `docs/reports/html/README.html`（比分类页高一级），片段链接按首页
 *   深度编写（`01-...`），对应 `report-nav-home.html`。
 *
 * 两种片段放在同一个共享 `assets/` 目录，仅凭目录无法区分深度 → 由
 * {@link getReportNavCandidatePaths} 按页面类型调整同名文件的优先级。
 */
const REPORT_NAV_FILE_NAMES = {
    /** 分类页：分类深度片段优先 */
    category: ['report-nav.html', 'report-nav-home.html'],
    /** 首页：首页深度片段优先（同目录下两种片段同时存在时必须先命中首页版） */
    home: ['report-nav-home.html', 'report-nav.html']
} as const

/**
 * 判断 HTML 内容是否含报告导航占位标记。
 *
 * 仅当返回 true 时才做导航片段探测（普通 HTML 页面零额外 IPC）。
 *
 * @param html HTML 内容
 * @returns 是否含 `<!-- baize-report-nav-slot -->` 占位注释
 */
export function hasReportNavSlot(html: string): boolean {
    return REPORT_NAV_SLOT_COMMENT_PATTERN.test(html)
}

/**
 * 把静态导航片段注入报告页占位处。
 *
 * 注入规则：
 * 1. 无占位标记 / 片段为空（读取失败）→ 原样返回：普通页面不受影响，报告页静默降级；
 * 2. 占位注释替换为 `<div id="report-nav">` + 片段 + `</div>`；
 * 3. 占位注释与空容器之间若夹了其他内容，替换后空容器会残留，统一清理（避免重复 id）。
 *
 * 说明：片段内容原样插入（不做 HTML 转义）——片段由本仓库生成脚本产出，属可信内容；
 * 若将来片段改为用户可写，需要在此处加消毒。
 *
 * @param html 原 HTML 内容
 * @param navHtml 静态导航片段（形如 `<nav class="rgnav">...</nav>`）
 * @returns 注入后的 HTML；无占位或片段为空时与原内容一致
 */
export function injectReportNav(html: string, navHtml: string): string {
    const fragment = navHtml.trim()
    if (fragment.length === 0 || !hasReportNavSlot(html)) {
        return html
    }
    const injected = `<div id="report-nav">\n${fragment}\n</div>`
    // 用函数式替换：片段中若含 `$&` / `$1` 等字符，不会被 String.replace 当作替换模式
    let output = html.replace(REPORT_NAV_SLOT_COMMENT_PATTERN, () => injected)
    // 正常结构（注释 + 紧随的空容器）注入后空容器已被注释替换掉；若二者分离则此处兜底清理
    output = output.replace(REPORT_NAV_EMPTY_CONTAINER_PATTERN, '')
    return output
}

/**
 * 取路径所在目录（保留末尾 `/`；分隔符统一为 `/`）。
 *
 * @param filePath 文件路径（`/` 或 `\` 分隔符均可）
 * @returns 目录字符串（以 `/` 结尾）；无目录部分（裸文件名）时返回空串
 */
function getDirOfPath(filePath: string): string {
    const normalized = normalizeSlashes(String(filePath || ''))
    const slash = normalized.lastIndexOf('/')
    return slash >= 0 ? normalized.slice(0, slash + 1) : ''
}

/**
 * 判断被查看的 HTML 是否为报告 HTML Wiki 首页（`README.html`）。
 *
 * 首页位于报告根目录（`docs/reports/html/README.html`），比分类页高一级，导航片段
 * 需使用首页深度版本（链接少一层 `../`）。
 *
 * @param filePath 被查看 HTML 的本地绝对路径
 * @returns 文件名（不区分大小写）是否为 `README.html`
 */
export function isReportHomePage(filePath: string): boolean {
    const normalized = normalizeSlashes(String(filePath || ''))
    const slash = normalized.lastIndexOf('/')
    const fileName = slash >= 0 ? normalized.slice(slash + 1) : normalized
    return fileName.toLowerCase() === 'readme.html'
}

/**
 * 计算报告页静态导航片段的候选文件路径（按优先级排序，最多 4 个）。
 *
 * 报告 HTML 目录结构（生成脚本产出）：
 * - 分类页 `<dir>/xxx.html` → 片段在 `<dir>/../assets/`（共享 `assets/` 目录）；
 * - 首页 `<dir>/README.html`（`<dir>` 即报告根）→ 片段在 `<dir>/assets/`。
 *
 * 候选顺序：
 * 1. `<dir>/assets/<片段>`（兼容生成脚本把共享资源复制/生成到分类目录的情形）；
 * 2. `<dir>/../assets/<片段>`（当前共享目录结构；`<dir>` 为报告根时即 `<dir>/assets/`）。
 *
 * 其中 `<片段>` 按页面类型排序：分类页 `report-nav.html` → `report-nav-home.html`；
 * 首页（README.html）反转为 `report-nav-home.html` → `report-nav.html`——两种片段
 * 同时存在于同一 `assets/` 目录，只按目录顺序无法区分，必须由页面类型决定深度。
 *
 * 说明：父目录路径用词法「取父目录」实现（等价于 `<dir>/../assets/`），避免把未归一化
 * 的 `..` 传给 IPC Path Guard。
 *
 * @param filePath 被查看 HTML 的本地绝对路径（`/` 或 `\` 分隔符均可）
 * @returns 候选文件路径数组；无法解析目录（如裸文件名）时返回空数组
 */
export function getReportNavCandidatePaths(filePath: string): string[] {
    const dir = getDirOfPath(filePath)
    if (dir.length === 0) {
        return []
    }
    // 父目录：去掉末尾 `/` 后再取一次所在目录（词法等价于 `<dir>/../`）
    const parentDir = getDirOfPath(dir.endsWith('/') ? dir.slice(0, -1) : dir)
    const candidateDirs = parentDir.length > 0 ? [dir, parentDir] : [dir]
    const fileNames = isReportHomePage(filePath)
        ? REPORT_NAV_FILE_NAMES.home
        : REPORT_NAV_FILE_NAMES.category
    const candidates: string[] = []
    for (const candidateDir of candidateDirs) {
        for (const fileName of fileNames) {
            candidates.push(`${candidateDir}assets/${fileName}`)
        }
    }
    return candidates
}
