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
 *   8. i18n 词典按语言拆包：语言词典不得进入首屏静态闭包，且中英各为独立异步 chunk
 *   9. KaTeX CSS 按需加载（P1-8 后续）：首屏 CSS 不得含 KaTeX 样式/字体引用，且产物中必须
 *      存在非首屏的 KaTeX 异步 CSS（含 @font-face，仅含公式文档加载）
 *
 * P1-3 背景（2026-11-20 全量代码扫描）：
 *   index.html 会通过 `<link rel="modulepreload">` 同步加载一个共享 chunk（Vue 运行时 +
 *   中英双语 i18n 全量词典 + shared/ipc-channels + renderer logger，实测 348.5 KiB），
 *   它和入口 chunk 一样属于首屏初始 JS，但此前预算只断言入口（136.8 KiB），真实首屏
 *   482.0 KiB 存在约 3.5 倍的统计盲区（预算门禁看不到该共享 chunk 的回归）。
 *   第 7 项把两者合并断言：解析 index.html 的 modulepreload 本地 .js，逐文件打印组成；
 *   阈值 512 KiB = 当前实测 482.0 KiB + 约 6% 回归余量。
 *
 * P1-3 修复（2026-11-20 首屏 i18n 拆包）：
 *   i18n 词典拆为按语言动态 import 的独立 chunk（messages/<locale>/index.ts），渲染层
 *   启动时只 await 当前语言：首屏从 487.5 KiB 降到 321.9 KiB（入口 132.3 + preload-helper
 *   3.4 + 共享 chunk 186.2），中/英词典各 83.7 / 85.3 KiB 仅在需要时加载。
 *   为防止「词典再次被静态 import 回共享 chunk」而阈值（512 KiB）仍能通过，新增第 8 项：
 *   首屏静态闭包内不得出现任何语言词典标记，且两种语言都必须存在独立异步 chunk。
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
 * 实测基线（v1.3.9/1.5.0 + Electron 43，详见 out/tool-results/p0-size.md）：
 *   入口 123.4 KiB / 壳 321.8 KiB / Setup 111.04 MiB / portable 100.25 MiB / asar 39.59 MiB（2026-11-20 裁剪后）（B4 electron-store 12 后）
 */
const BUDGETS = {
    entry: { label: '渲染入口 chunk（index-*.js）', limit: 150 * KIB },
    shell: { label: 'BaiZeNotes 壳 chunk（BaiZeNotes-*.js）', limit: 2 * MIB },
    // 2026-11-20（P1-3 首屏预算盲区）：真实首屏 JS = 入口 + index.html modulepreload 共享 chunk。
    // 修复前（双语 i18n 全量进共享 chunk）实测 482.0~487.5 KiB；首屏 i18n 拆包后实测 321.9 KiB。
    // 阈值保留 512 KiB 作为「入口+共享运行时」总量上限（不随优化收紧误伤正常迭代）；
    // 「词典不得回流首屏」由下方第 8 项 I18N 拆包断言单独、更精确地守护。
    firstScreenJs: { label: '首屏初始 JS（入口 + modulepreload 本地 JS）', limit: 512 * KIB },
    // 2026-11-20（B4 electron-store 12）：Setup 109.98→113.92 MiB，按实测+余量调整
    setup: { label: 'NSIS 安装包（Setup exe）', limit: 115 * MIB },
    portable: { label: '便携版 exe（portable）', limit: 101 * MIB },
    // 2026-11-20（B4 electron-store 11→12）：生产依赖树增长，asar 39.33→45.5 MiB（实测）
    asar: { label: 'app.asar', limit: 47 * MIB }
}

/** electronLanguages 裁剪后期望保留的语言包（electron-builder 按 locale 文件名匹配） */
const EXPECTED_LOCALES = ['en-US.pak', 'zh-CN.pak']

/**
 * P1-3 首屏 i18n 拆包断言用的「词典独有标记」。
 *
 * 每个标记只存在于对应语言词典（`src/shared/i18n/messages/<locale>/dialogRenderer.ts`
 * 的 techStack.title）中，其它源码/组件不硬编码该文案（组件经 t() 取值），因此可用
 * 文件内容判定某 chunk 是否包含该语言词典：
 * - 首屏静态闭包（入口 + modulepreload）不得包含任一标记；
 * - 每个语言必须存在一个「非首屏的独立异步 chunk」包含对应标记（按需加载单元）。
 */
const I18N_LOCALE_MARKERS = {
    'zh-CN': '技术栈',
    'en-US': 'Tech stack'
}

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
 * P1-8 后续（KaTeX CSS 按需）：收集 index.html 首屏样式表（`<link rel="stylesheet">` 本地相对路径）。
 *
 * 解析口径与 collectFirstScreenJs 一致：先剥 HTML 注释（index.html 注释里出现过
 * `<link rel="stylesheet">` 的历史说明文本，避免把注释误判为真实标签），只统计 renderer
 * 产物目录内的本地 .css；外部 URL / 绝对路径不纳入。
 */
function collectFirstScreenCss() {
    const components = []
    if (!fs.existsSync(RENDERER_INDEX_HTML)) {
        failures.push(`未找到渲染层 index.html：${relativePath(RENDERER_INDEX_HTML)}`)
        return components
    }
    const html = fs.readFileSync(RENDERER_INDEX_HTML, 'utf-8').replace(/<!--[\s\S]*?-->/g, '')
    const seenPaths = new Set()
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
        if (!/\brel\s*=\s*["']stylesheet["']/i.test(tag)) continue
        const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)
        if (!hrefMatch) continue
        const href = hrefMatch[1].trim().split(/[?#]/)[0]
        if (!/\.css$/i.test(href)) continue
        if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || path.isAbsolute(href)) continue
        const cssPath = path.resolve(path.dirname(RENDERER_INDEX_HTML), href)
        const relativeToRenderer = path.relative(path.dirname(RENDERER_INDEX_HTML), cssPath)
        if (
            relativeToRenderer.length === 0 ||
            relativeToRenderer.startsWith('..') ||
            path.isAbsolute(relativeToRenderer)
        ) {
            continue
        }
        if (seenPaths.has(cssPath)) continue
        if (!fs.existsSync(cssPath)) {
            failures.push(
                `index.html 首屏样式表指向的产物缺失：${href}（${relativePath(cssPath)}）`
            )
            continue
        }
        seenPaths.add(cssPath)
        components.push({ filePath: cssPath, href })
    }
    return components
}

/** KaTeX 样式选择器标记（`.katex {`，兼容未来压缩为 `.katex{` 的格式） */
const KATEX_CSS_SELECTOR_MARKER = /\.katex\s*\{/
/** KaTeX 字体 url() 标记（woff2/woff/ttf 任一格式） */
const KATEX_FONT_URL_MARKER = /KaTeX_[A-Za-z0-9-]+\.(?:woff2?|ttf)/

/**
 * P1-8 后续：KaTeX CSS 按需加载回归防线。
 *
 * 修复前 `katex/dist/katex.css` 由 main.ts 静态 import，进入首屏 CSS（含约 51 处 KaTeX 字体
 * url()），纯文本/普通 Markdown 笔记也要下载解析；修复后改为 preview-katex-assets.ts 中的
 * 动态 import（与 KaTeX JS 同一会话级 Promise，只有含公式文档才加载）。本断言锁定：
 * 1. 首屏 CSS（index.html 的 stylesheet link）不得包含 KaTeX 样式选择器/字体引用；
 * 2. 渲染层产物中必须仍存在「非首屏」的 KaTeX 异步 CSS（含 @font-face），防样式被误删。
 */
function checkKatexCssOnDemand() {
    const label = 'KaTeX CSS 按需加载（首屏 CSS 不含 KaTeX 样式/字体）'
    const firstScreenCss = collectFirstScreenCss()
    const firstScreenPaths = new Set(firstScreenCss.map((item) => path.resolve(item.filePath)))
    const leaked = []
    let firstScreenCssBytes = 0
    for (const component of firstScreenCss) {
        const content = fs.readFileSync(component.filePath, 'utf-8')
        firstScreenCssBytes += fs.statSync(component.filePath).size
        if (KATEX_CSS_SELECTOR_MARKER.test(content)) {
            leaked.push(`${path.basename(component.filePath)} 含 KaTeX 样式`)
        }
        if (KATEX_FONT_URL_MARKER.test(content)) {
            leaked.push(`${path.basename(component.filePath)} 含 KaTeX 字体引用`)
        }
    }
    if (firstScreenCss.length === 0) {
        failures.push(`${label}：未找到首屏样式表（index.html 无 stylesheet link）`)
    }
    if (leaked.length > 0) {
        failures.push(`${label}：${leaked.join('；')}（KaTeX CSS/字体回流首屏）`)
    }

    const asyncKatexChunks = []
    if (fs.existsSync(RENDERER_ASSETS_DIR)) {
        for (const name of fs.readdirSync(RENDERER_ASSETS_DIR)) {
            if (!/\.css$/i.test(name)) continue
            const cssPath = path.join(RENDERER_ASSETS_DIR, name)
            if (firstScreenPaths.has(path.resolve(cssPath))) continue
            const content = fs.readFileSync(cssPath, 'utf-8')
            if (KATEX_CSS_SELECTOR_MARKER.test(content) && KATEX_FONT_URL_MARKER.test(content)) {
                asyncKatexChunks.push(cssPath)
            }
        }
    }
    if (asyncKatexChunks.length === 0) {
        failures.push(`${label}：未找到含 KaTeX 样式的非首屏异步 CSS 产物（按需加载单元缺失）`)
    }

    const pass = leaked.length === 0 && asyncKatexChunks.length > 0 && firstScreenCss.length > 0
    const asyncText = asyncKatexChunks
        .map((cssPath) => `${path.basename(cssPath)} ${formatSize(fs.statSync(cssPath).size)}`)
        .join(', ')
    return {
        label,
        actualText: `首屏 CSS ${formatSize(firstScreenCssBytes)}（KaTeX 0 处）/ 按需 chunk ${asyncText || '缺失'}`,
        limitText: '首屏 CSS 无 KaTeX 样式/字体，KaTeX CSS 为按需异步 chunk',
        marginText: pass ? '按需生效' : '回流/缺失',
        pass
    }
}

/**
 * P1-3：断言首屏初始 JS 总量（入口 + modulepreload 本地 JS），并打印逐文件组成。
 * @param components collectFirstScreenJs() 的返回（入口 script + modulepreload 明细）
 * 返回值结构与 checkSizeBudget 一致，额外带 details（逐文件明细）。
 */
function checkFirstScreenJs(components) {
    const { label, limit } = BUDGETS.firstScreenJs
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
        details,
        detailsHeader: '首屏组成：'
    }
}

/**
 * P1-3：i18n 词典按语言拆包的回归防线。
 *
 * 1. 首屏静态闭包（入口 + modulepreload）内不得出现任何语言的词典独有标记——
 *    否则说明词典又被静态 import 回首屏共享 chunk（中文/英文用户白加载）；
 * 2. 中英两种语言都必须存在「不在首屏闭包内的独立异步 chunk」且内容含对应标记——
 *    保证 Vite/Rollup 仍把 messages/<locale> 拆成按需加载单元。
 *
 * @param firstScreenComponents collectFirstScreenJs() 的返回
 */
function checkI18nDictionarySplit(firstScreenComponents) {
    const label = 'i18n 词典按语言拆包（首屏不装双语词典）'
    const firstScreenPaths = new Set(
        firstScreenComponents.map((item) => path.resolve(item.filePath))
    )
    const leaked = []
    const localeChunkDetails = []
    let pass = true

    // 1) 首屏闭包内不得出现词典标记
    for (const component of firstScreenComponents) {
        const content = fs.readFileSync(component.filePath)
        for (const [locale, marker] of Object.entries(I18N_LOCALE_MARKERS)) {
            if (content.includes(marker)) {
                leaked.push(
                    `${locale} 词典「${marker}」出现在首屏 ${path.basename(component.filePath)}`
                )
            }
        }
    }
    if (leaked.length > 0) {
        pass = false
        failures.push(`${label}：${leaked.join('；')}`)
    }

    // 2) 每种语言各有一个非首屏的独立异步 chunk（一次遍历资产目录，避免重复读大文件）
    const assetNames = fs.existsSync(RENDERER_ASSETS_DIR)
        ? fs.readdirSync(RENDERER_ASSETS_DIR).filter((name) => /\.js$/i.test(name))
        : []
    const localeChunks = Object.fromEntries(
        Object.keys(I18N_LOCALE_MARKERS).map((locale) => [locale, []])
    )
    for (const name of assetNames) {
        const assetPath = path.join(RENDERER_ASSETS_DIR, name)
        if (firstScreenPaths.has(assetPath)) continue
        const content = fs.readFileSync(assetPath)
        for (const [locale, marker] of Object.entries(I18N_LOCALE_MARKERS)) {
            if (content.includes(marker)) {
                localeChunks[locale].push(assetPath)
            }
        }
    }
    for (const [locale, marker] of Object.entries(I18N_LOCALE_MARKERS)) {
        const matched = localeChunks[locale].sort(
            (left, right) => fs.statSync(right).size - fs.statSync(left).size
        )
        if (matched.length === 0) {
            pass = false
            failures.push(`${label}：未找到 ${locale} 词典（「${marker}」）的独立异步 chunk`)
            continue
        }
        const bytes = fs.statSync(matched[0]).size
        localeChunkDetails.push(
            `      · ${locale} 按需 chunk ${path.basename(matched[0])}：${formatSize(bytes)}`
        )
    }

    return {
        label,
        actualText:
            localeChunkDetails.length > 0
                ? localeChunkDetails.map((line) => line.replace(/^ {6}· /, '')).join(' / ')
                : '未找到语言 chunk',
        limitText: '词典均不进首屏，中英各为按需 chunk',
        marginText: pass ? '中英词典均按需加载' : '存在回流/缺失',
        pass,
        details: localeChunkDetails,
        detailsHeader: '按需语言 chunk：'
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

/**
 * P1-3：从 index.html 的入口 `<script type="module" src>` 解析真实渲染入口 chunk。
 *
 * 旧口径用 `index-*.js` 正则取最大文件：一旦出现多个以 `index` 命名的异步 chunk
 * （例如懒加载目录的 index.ts），就会产生「命中多个文件」的告警并依赖体积启发式。
 * 现在是确定性的：入口以 electron-vite 生成的 index.html 为准，解析失败再回退旧口径。
 *
 * @returns 入口产物绝对路径；index.html 缺失/无入口 script/目标不存在时返回 null
 */
function findEntryScriptFromIndexHtml() {
    if (!fs.existsSync(RENDERER_INDEX_HTML)) {
        return null
    }
    const html = fs.readFileSync(RENDERER_INDEX_HTML, 'utf-8')
    const scriptTag = html.match(/<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>/i)?.[0]
    if (!scriptTag) {
        return null
    }
    const src = /\bsrc\s*=\s*["']([^"']+)["']/i.exec(scriptTag)?.[1]?.trim()
    if (!src) {
        return null
    }
    const href = src.split(/[?#]/)[0]
    // 与 collectFirstScreenJs 同口径：仅接受 renderer 目录内的相对路径
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(href) || path.isAbsolute(href)) {
        return null
    }
    const scriptPath = path.resolve(path.dirname(RENDERER_INDEX_HTML), href)
    const relativeToRenderer = path.relative(path.dirname(RENDERER_INDEX_HTML), scriptPath)
    if (
        relativeToRenderer.length === 0 ||
        relativeToRenderer.startsWith('..') ||
        path.isAbsolute(relativeToRenderer) ||
        !fs.existsSync(scriptPath)
    ) {
        return null
    }
    return scriptPath
}

function main() {
    console.log('============================================================')
    console.log(' P0 安装包体积预算检查（bundle budget）')
    console.log('============================================================')

    const version = readProjectVersion()
    const results = []

    // —— 1. 渲染层：入口 chunk 与主界面壳 chunk ——
    // P1-3：入口优先从 index.html 解析，避免多个 index-*.js 异步 chunk 造成误判
    const entryFile =
        findEntryScriptFromIndexHtml() ??
        findSingleFile(RENDERER_ASSETS_DIR, /^index-.*\.js$/, '渲染入口 chunk（index-*.js）')
    if (entryFile) {
        results.push(checkSizeBudget(BUDGETS.entry, entryFile, 'KiB'))
    }
    // P1-3：真实首屏 JS = 入口 + index.html 中 modulepreload 的本地共享 chunk
    const firstScreenComponents = collectFirstScreenJs(entryFile)
    results.push(checkFirstScreenJs(firstScreenComponents))
    // P1-3：i18n 词典按语言拆包（词典不得进首屏静态闭包，中英各为按需 chunk）
    results.push(checkI18nDictionarySplit(firstScreenComponents))
    // P1-8 后续：KaTeX CSS 按需（首屏 CSS 不含 KaTeX 样式/字体，且存在按需异步 CSS 产物）
    results.push(checkKatexCssOnDemand())
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
            console.log(item.detailsHeader ?? '组成明细：')
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
