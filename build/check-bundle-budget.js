#!/usr/bin/env node
/**
 * P0 安装包体积预算守卫（bundle budget）
 *
 * 背景（2026-11-19 P0 安装包瘦身）：
 *   体积回归没有门禁时只能靠人工比对「上次构建多大」。本脚本在真实构建产物上做硬断言，
 *   接入 CI（.github/workflows/ci.yml 的 bundle-budget job，在 build:win:all 之后执行），
 *   任何一项越过预算即 fail，避免后续改动把渲染入口/主界面壳/安装包/asar 悄悄养大。
 *
 * 数据来源（只读构建产物，不重新打包）：
 *   - out/build/renderer/assets  electron-vite 渲染层产物（入口/壳/关键 chunk）
 *   - out/build/dist              electron-builder 产物（NSIS 安装包/portable/win-unpacked）
 *
 * 断言项（阈值集中在 BUDGETS；调整阈值时同步更新 out/tool-results/p0-size.md 与
 * docs/reports/md/01-检查与扫描/2026-11-20-全量代码扫描报告.md）：
 *   1. 渲染入口 chunk（index-*.js）      ≤ 150 KiB
 *   2. BaiZeNotes 壳 chunk（BaiZeNotes-*.js） ≤ 2 MiB
 *   3. NSIS 安装包（Setup exe）          ≤ 110 MiB
 *   4. 便携版 exe（portable）            ≤ 100 MiB
 *   5. app.asar                          ≤ 45 MiB
 *   6. locales 语言包仅保留 zh-CN / en-US（electronLanguages 裁剪的回归防线）
 *   7. 首屏初始 JS（入口 script + index.html 中 modulepreload 的本地 JS） ≤ 512 KiB
 *
 * P1-3 背景（2026-11-20 全量代码扫描）：
 *   index.html 会通过 `<link rel="modulepreload">` 同步加载一个共享 chunk（Vue 运行时 +
 *   中英双语 i18n 全量词典 + shared/ipc-channels + renderer logger，实测 348.5 KiB），
 *   它和入口 chunk 一样属于首屏初始 JS，但此前预算只断言入口（136.8 KiB），真实首屏
 *   482.0 KiB 存在约 3.5 倍的统计盲区（预算门禁看不到该共享 chunk 的回归）。
 *   第 7 项把两者合并断言：解析 index.html 的 modulepreload 本地 .js，逐文件打印组成；
 *   阈值 512 KiB = 当前实测 482.0 KiB + 约 6% 回归余量。
 *
 * 说明：
 *   - 安装包按 package.json 的当前 version 精确匹配文件名，dist 里残留的旧版本产物会被忽略
 *     （若当前版本产物缺失则直接报错，提示先执行 npm run build:win:all）。
 *   - 首屏 JS 解析只针对 electron-vite 生成产物：index.html 结构稳定（入口 script +
 *     modulepreload link），用正则读取即可，不引入 HTML 解析依赖、也不执行页面脚本；
 *     非本地（http/data/上级目录）资源不纳入统计。
 *   - 预算项之外额外打印关键 chunk（Monaco/mermaid）体积作为参考，不参与断言，避免锁死
 *     第三方库的小版本波动。
 *
 * 用法：npm run budget:check
 * 退出码：0 = 全部达标；1 = 超预算 / 产物缺失 / 版本不匹配
 */
const fs = require('node:fs')
const path = require('node:path')

const projectRoot = path.resolve(__dirname, '..')
const packageJsonPath = path.join(projectRoot, 'package.json')

const KIB = 1024
const MIB = 1024 * KIB

const RENDERER_ASSETS_DIR = path.join(projectRoot, 'out', 'build', 'renderer', 'assets')
const RENDERER_INDEX_HTML = path.join(projectRoot, 'out', 'build', 'renderer', 'index.html')
const DIST_DIR = path.join(projectRoot, 'out', 'build', 'dist')
const UNPACKED_DIR = path.join(DIST_DIR, 'win-unpacked')
const ASAR_FILE = path.join(UNPACKED_DIR, 'resources', 'app.asar')
const LOCALES_DIR = path.join(UNPACKED_DIR, 'locales')

/**
 * 预算阈值（2026-11-19 P0 实测基线后设定）。
 * 设定原则：
 * - 体积类阈值 = 当前实测 + 少量回归余量，避免正常迭代因几 KB 波动误报；
 * - 两个安装包阈值必须低于 locales 裁剪前的体积（裁前 NSIS 117.94 MiB / portable 107.03 MiB），
 *   这样一旦 electronLanguages 配置失效、55 个语言包回流，预算必然失败；
 * - 单位统一为二进制 KiB/MiB（1 MiB = 1024 KiB），与 electron-builder 的 MB 显示口径略有差异。
 * 实测基线（v1.3.9/1.4.0 + Electron 43，详见 out/tool-results/p0-size.md）：
 *   入口 123.4 KiB / 壳 321.8 KiB / Setup 113.92 MiB / portable 100.48 MiB / asar 45.21 MiB（B4 electron-store 12 后）
 */
const BUDGETS = {
    entry: { label: '渲染入口 chunk（index-*.js）', limit: 150 * KIB },
    shell: { label: 'BaiZeNotes 壳 chunk（BaiZeNotes-*.js）', limit: 2 * MIB },
    // 2026-11-20（P1-3 首屏预算盲区）：真实首屏 JS = 入口 + index.html modulepreload 共享 chunk
    // （Vue 运行时 + 中英双语 i18n 词典 + ipc/logger），实测 482.0 KiB；阈值取 +约 6% 余量。
    firstScreenJs: { label: '首屏初始 JS（入口 + modulepreload 本地 JS）', limit: 512 * KIB },
    // 2026-11-20（B4 electron-store 12）：Setup 109.98→113.92 MiB，按实测+余量调整
    setup: { label: 'NSIS 安装包（Setup exe）', limit: 115 * MIB },
    portable: { label: '便携版 exe（portable）', limit: 101 * MIB },
    // 2026-11-20（B4 electron-store 11→12）：生产依赖树增长，asar 39.33→45.5 MiB（实测）
    asar: { label: 'app.asar', limit: 47 * MIB }
}

/** electronLanguages 裁剪后期望保留的语言包（electron-builder 按 locale 文件名匹配） */
const EXPECTED_LOCALES = ['en-US.pak', 'zh-CN.pak']

/** 参考 chunk（只打印体积，不设预算）：Monaco / mermaid 相关核心产物 */
const REFERENCE_CHUNKS = [
    /^editor\.api-.*\.js$/,
    /^MarkdownMonacoEditor-.*\.js$/,
    /^editor\.worker-.*\.js$/,
    /^mermaid\.core-.*\.js$/,
    /^elk-.*\.js$/,
    /^cytoscape\.esm-.*\.js$/
]

const failures = []

/** 相对工作区根的路径，便于日志阅读 */
function relativePath(targetPath) {
    return path.relative(projectRoot, targetPath) || '.'
}

/** 体积格式化：>= 1 MiB 用 MiB（2 位小数），否则用 KiB（1 位小数） */
function formatSize(bytes) {
    return bytes >= MIB ? `${(bytes / MIB).toFixed(2)} MiB` : `${(bytes / KIB).toFixed(1)} KiB`
}

/** 读取 package.json 当前版本（与构建产物命名同源） */
function readProjectVersion() {
    try {
        const content = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
        if (typeof content.version !== 'string' || content.version.length === 0) {
            throw new Error('package.json 缺少 version 字段')
        }
        return content.version
    } catch (error) {
        failures.push(`无法读取 package.json 版本：${error.message}`)
        return null
    }
}

/** 在目录内按正则找唯一文件；多个命中时取最大者并提示（构建残留防误判） */
function findSingleFile(dir, pattern, description) {
    if (!fs.existsSync(dir)) {
        failures.push(`${description}：目录不存在（${relativePath(dir)}）`)
        return null
    }
    const matched = fs
        .readdirSync(dir)
        .filter((name) => pattern.test(name))
        .map((name) => path.join(dir, name))
        .sort((a, b) => fs.statSync(b).size - fs.statSync(a).size)
    if (matched.length === 0) {
        failures.push(`${description}：未找到匹配 ${pattern} 的产物（${relativePath(dir)}）`)
        return null
    }
    if (matched.length > 1) {
        console.warn(
            `[budget] 提示：${description} 命中 ${matched.length} 个文件，取体积最大者 ` +
                `${path.basename(matched[0])}（建议清理 ${relativePath(dir)} 后重建）`
        )
    }
    return matched[0]
}

/** 断言单个体积预算，返回结果行 */
function checkSizeBudget({ label, limit }, filePath, displayUnit) {
    const actual = fs.statSync(filePath).size
    const pass = actual <= limit
    if (!pass) {
        failures.push(
            `${label} 超预算：${formatSize(actual)} > ${formatSize(limit)}（${relativePath(filePath)}）`
        )
    }
    return {
        label,
        actualText: displayUnit === 'KiB' ? `${(actual / KIB).toFixed(1)} KiB` : formatSize(actual),
        limitText: displayUnit === 'KiB' ? `${limit / KIB} KiB` : formatSize(limit),
        marginText: formatSize(Math.max(limit - actual, 0)),
        pass
    }
}

/**
 * 从 index.html 收集首屏初始 JS 组成（入口 chunk + modulepreload 的本地 .js）。
 *
 * 解析方式：electron-vite 产物 index.html 由 Vite 生成、结构稳定（入口 `<script type="module" src>`
 * 与 `<link rel="modulepreload" href>`）；这里用正则读取静态 HTML，不引入 HTML 解析依赖，
 * 也不执行页面脚本（动态注入的 script 不属于静态首屏初始闭包）。外部 URL（http/data/上级目录）
 * 不纳入本地体积统计。
 */
function collectFirstScreenJs(entryFile) {
    const components = []
    const seenPaths = new Set()
    if (entryFile) {
        const entryPath = path.resolve(entryFile)
        seenPaths.add(entryPath)
        components.push({ filePath: entryPath, kind: '入口 script' })
    }
    if (!fs.existsSync(RENDERER_INDEX_HTML)) {
        failures.push(`未找到渲染层 index.html：${relativePath(RENDERER_INDEX_HTML)}`)
        return components
    }
    const html = fs.readFileSync(RENDERER_INDEX_HTML, 'utf-8')
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
        // 只认 modulepreload：Vite 用它把入口的静态共享 chunk 提前同步加载（同样计入首屏）
        if (!/\brel\s*=\s*["']modulepreload["']/i.test(tag)) continue
        const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)
        if (!hrefMatch) continue
        const href = hrefMatch[1].trim().split(/[?#]/)[0]
        if (!/\.m?js$/i.test(href)) continue
        // 仅统计产物目录内的相对路径；跨域/绝对 URL 不是本地首屏体积
        if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || path.isAbsolute(href)) continue
        const assetPath = path.resolve(path.dirname(RENDERER_INDEX_HTML), href)
        const relativeToRenderer = path.relative(path.dirname(RENDERER_INDEX_HTML), assetPath)
        if (
            relativeToRenderer.length === 0 ||
            relativeToRenderer.startsWith('..') ||
            path.isAbsolute(relativeToRenderer)
        ) {
            continue
        }
        if (seenPaths.has(assetPath)) continue
        seenPaths.add(assetPath)
        if (!fs.existsSync(assetPath)) {
            failures.push(
                `index.html modulepreload 指向的产物缺失：${href}（${relativePath(assetPath)}）`
            )
            continue
        }
        components.push({ filePath: assetPath, kind: 'modulepreload' })
    }
    return components
}

/**
 * P1-3：断言首屏初始 JS 总量（入口 + modulepreload 本地 JS），并打印逐文件组成。
 * 返回值结构与 checkSizeBudget 一致，额外带 details（逐文件明细）。
 */
function checkFirstScreenJs(entryFile) {
    const { label, limit } = BUDGETS.firstScreenJs
    const components = collectFirstScreenJs(entryFile)
    const details = []
    let total = 0
    for (const component of components) {
        const bytes = fs.statSync(component.filePath).size
        total += bytes
        details.push(
            `      · ${component.kind} ${path.basename(component.filePath)}：${formatSize(bytes)}`
        )
    }
    const pass = total <= limit
    if (!pass) {
        failures.push(
            `${label} 超预算：${formatSize(total)} > ${formatSize(limit)}（` +
                components
                    .map(
                        (component) =>
                            `${path.basename(component.filePath)} ${formatSize(fs.statSync(component.filePath).size)}`
                    )
                    .join(' + ') +
                '）'
        )
    }
    return {
        label,
        actualText: formatSize(total),
        limitText: formatSize(limit),
        marginText: formatSize(Math.max(limit - total, 0)),
        pass,
        details
    }
}

/** 校验 locales 目录仅保留期望的 2 个语言包 */
function checkLocales() {
    const label = 'locales 语言包数量'
    if (!fs.existsSync(LOCALES_DIR)) {
        failures.push(`未找到 locales 目录：${relativePath(LOCALES_DIR)}`)
        return { label, actualText: '缺失', limitText: '2 个', marginText: '-', pass: false }
    }
    const actualLocales = fs
        .readdirSync(LOCALES_DIR)
        .filter((name) => name.endsWith('.pak'))
        .sort()
    const missing = EXPECTED_LOCALES.filter((name) => !actualLocales.includes(name))
    const unexpected = actualLocales.filter((name) => !EXPECTED_LOCALES.includes(name))
    const pass = missing.length === 0 && unexpected.length === 0
    if (!pass) {
        const details = [
            missing.length > 0 ? `缺少 ${missing.join(', ')}` : '',
            unexpected.length > 0 ? `多出 ${unexpected.join(', ')}` : ''
        ]
            .filter(Boolean)
            .join('；')
        failures.push(`locales 裁剪失效（期望 2 个，实测 ${actualLocales.length} 个）：${details}`)
    }
    return {
        label,
        actualText: `${actualLocales.length} 个（${actualLocales.join(', ')}）`,
        limitText: EXPECTED_LOCALES.join(', '),
        marginText: pass ? '0 个' : `${actualLocales.length - EXPECTED_LOCALES.length} 个`,
        pass
    }
}

/** 打印关键 chunk 参考体积（不参与断言） */
function printReferenceChunks() {
    if (!fs.existsSync(RENDERER_ASSETS_DIR)) {
        return
    }
    const assetNames = fs.readdirSync(RENDERER_ASSETS_DIR)
    const lines = []
    for (const pattern of REFERENCE_CHUNKS) {
        const matched = assetNames.filter((name) => pattern.test(name))
        if (matched.length === 0) {
            continue
        }
        const totalBytes = matched.reduce(
            (sum, name) => sum + fs.statSync(path.join(RENDERER_ASSETS_DIR, name)).size,
            0
        )
        lines.push(`  - ${matched.join(', ')}：${formatSize(totalBytes)}`)
    }
    if (lines.length > 0) {
        console.log('\n[budget] 关键 chunk 参考（不设预算，仅记录）：')
        console.log(lines.join('\n'))
    }
}

function main() {
    console.log('============================================================')
    console.log(' P0 安装包体积预算检查（bundle budget）')
    console.log('============================================================')

    const version = readProjectVersion()
    const results = []

    // —— 1. 渲染层：入口 chunk 与主界面壳 chunk ——
    const entryFile = findSingleFile(
        RENDERER_ASSETS_DIR,
        /^index-.*\.js$/,
        '渲染入口 chunk（index-*.js）'
    )
    if (entryFile) {
        results.push(checkSizeBudget(BUDGETS.entry, entryFile, 'KiB'))
    }
    // P1-3：真实首屏 JS = 入口 + index.html 中 modulepreload 的本地共享 chunk
    results.push(checkFirstScreenJs(entryFile))
    const shellFile = findSingleFile(
        RENDERER_ASSETS_DIR,
        /^BaiZeNotes-.*\.js$/,
        'BaiZeNotes 壳 chunk（BaiZeNotes-*.js）'
    )
    if (shellFile) {
        results.push(checkSizeBudget(BUDGETS.shell, shellFile, 'MiB'))
    }

    // —— 2. 安装包：按当前版本精确匹配，忽略 dist 内历史版本残留 ——
    if (version) {
        const setupFile = path.join(DIST_DIR, `BaiZeNotes_Setup_${version}_windows_x64.exe`)
        if (fs.existsSync(setupFile)) {
            results.push(checkSizeBudget(BUDGETS.setup, setupFile, 'MiB'))
        } else {
            failures.push(
                `未找到当前版本 NSIS 安装包：${relativePath(setupFile)}（请先执行 npm run build:win:all）`
            )
        }
        const portableFile = path.join(DIST_DIR, `BaiZeNotes_${version}_windows_x64.exe`)
        if (fs.existsSync(portableFile)) {
            results.push(checkSizeBudget(BUDGETS.portable, portableFile, 'MiB'))
        } else {
            failures.push(
                `未找到当前版本便携包：${relativePath(portableFile)}（请先执行 npm run build:win:all）`
            )
        }
    }

    // —— 3. app.asar ——
    if (fs.existsSync(ASAR_FILE)) {
        results.push(checkSizeBudget(BUDGETS.asar, ASAR_FILE, 'MiB'))
    } else {
        failures.push(
            `未找到 app.asar：${relativePath(ASAR_FILE)}（请先执行 npm run build:win:all）`
        )
    }

    // —— 4. locales 裁剪回归防线 ——
    results.push(checkLocales())

    // —— 输出结果 ——
    console.log('')
    for (const item of results) {
        const status = item.pass ? '✅' : '❌'
        console.log(
            `  ${status} ${item.label}\n` +
                `      实测 ${item.actualText} / 预算 ${item.limitText} / 余量 ${item.marginText}`
        )
        if (Array.isArray(item.details) && item.details.length > 0) {
            console.log('      首屏组成：')
            console.log(item.details.join('\n'))
        }
    }
    printReferenceChunks()

    console.log('\n------------------------------------------------------------')
    if (failures.length > 0) {
        console.error(`[budget] ❌ 体积预算未通过（${failures.length} 项问题）：`)
        for (const failure of failures) {
            console.error(`  - ${failure}`)
        }
        console.error(
            '[budget] 若为预期内的体积增长，请先评估收益/成本，再调整 build/check-bundle-budget.js 阈值并更新报告。'
        )
        process.exitCode = 1
        return
    }
    console.log('[budget] ✅ 全部预算项通过')
}

main()
