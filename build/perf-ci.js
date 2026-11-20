#!/usr/bin/env node
/**
 * 性能基线 CI（软门禁 / 报告）：bundle 指标 + 冷启动指标采集、基线快照对比与 CI 归档。
 *
 * 背景（2026-11-20 全量性能扫描 scan-perf §8/§9）：
 *   - `build/perf-baseline.js` 已能采集开发构建 / 打包版的冷启动 performance marks 与
 *     外部「进程启动→窗口可见」耗时，但基线只是历史记录：不在 CI 跑、无对比、无回归提示，
 *     且脚本内参考阈值（12~25s）远高于实测（0.5~0.6s），无法防回归；
 *   - 体积侧已有 `build/check-bundle-budget.js` 硬门禁（bundle-budget job），但它是「产物体积
 *     预算」，不覆盖启动耗时，也没有趋势对比；
 *   - 本脚本把「可量化的性能基线」纳入 CI：构建后采集 bundle 指标（首屏 / 预览 / 主进程 /
 *     预加载 / 打包产物），可选触发一次冷启动采集，与仓库内基线快照
 *     `build/perf-baseline.snapshot.json` 对比，偏离超过阈值（默认 20%）只输出 GitHub
 *     warning annotation，**不改变退出码、不阻断 PR**，同时产出 JSON + Markdown 报告作为
 *     CI artifact 与 Step Summary。
 *
 * 设计约定：
 * - **非阻断**：指标偏离/回归只 warning；只有「bundle 构建产物缺失」这类采集前提不满足才
 *   返回 1（CI job 仍 `continue-on-error: true`，不会阻塞 PR）；
 * - **bundle 指标**只读 `out/build/**` 产物，不重新构建、不执行页面脚本（解析 index.html 的
 *   入口 script 与 modulepreload 本地 .js，与 `check-bundle-budget.js` 同口径）；
 * - **启动指标**复用 `build/perf-baseline.js`（`--startup` 时各跑 1 次开发构建/打包版冷启动），
 *   或读取其既有报告 `out/analysis/perf-baseline*.json`；非本次采集的启动值只作参考，不参与
 *   偏差判定，避免「旧报告 vs 新快照」产生噪声；
 * - **基线快照**入库（`build/perf-baseline.snapshot.json`，`out/` 不入库），维护方式：
 *   `npm run perf:ci:startup` 采集 → `npm run perf:snapshot` 更新 → 在 PR 中说明变化原因；
 * - 产物：`out/analysis/perf-baseline-ci.json`、`out/analysis/perf-baseline-ci.md`；CI 中额外
 *   追加 `$GITHUB_STEP_SUMMARY`（Markdown 渲染）与 warning annotation。
 *
 * 用法：
 *   node build/perf-ci.js                     # bundle 指标采集 + 快照对比（本地默认，不启动 Electron）
 *   node build/perf-ci.js --startup           # 追加开发构建 + 打包版各 1 次冷启动采集后再对比
 *   node build/perf-ci.js --startup --startup-mode=dev
 *   node build/perf-ci.js --e2e-report=out/test-results/e2e.json   # 附带 E2E readyMs 统计
 *   node build/perf-ci.js --update-snapshot   # 用本次指标重写基线快照
 *   node build/perf-ci.js --help
 *
 * 前置：
 *   bundle 指标：先 `npx electron-vite build`（CI 用 `npm run build:unpack`，同时提供 win-unpacked）；
 *   打包版启动指标：先 `npm run build:unpack`（win-unpacked/BaiZeNotes.exe）。
 */
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const ROOT = path.resolve(__dirname, '..')
const PACKAGE_JSON = path.join(ROOT, 'package.json')
const OUTPUT_DIR = path.join(ROOT, 'out', 'analysis')
const REPORT_JSON = path.join(OUTPUT_DIR, 'perf-baseline-ci.json')
const REPORT_MARKDOWN = path.join(OUTPUT_DIR, 'perf-baseline-ci.md')
const DEFAULT_SNAPSHOT = path.join(ROOT, 'build', 'perf-baseline.snapshot.json')
const PERF_BASELINE_SCRIPT = path.join(ROOT, 'build', 'perf-baseline.js')
const DEV_REPORT = path.join(OUTPUT_DIR, 'perf-baseline.json')
const PACKAGED_REPORT = path.join(OUTPUT_DIR, 'perf-baseline-packaged.json')

const RENDERER_DIR = path.join(ROOT, 'out', 'build', 'renderer')
const RENDERER_INDEX_HTML = path.join(RENDERER_DIR, 'index.html')
const RENDERER_ASSETS_DIR = path.join(RENDERER_DIR, 'assets')
const MAIN_DIR = path.join(ROOT, 'out', 'build', 'main')
const PRELOAD_DIR = path.join(ROOT, 'out', 'build', 'preload')
const DIST_DIR = path.join(ROOT, 'out', 'build', 'dist')
const UNPACKED_DIR = path.join(DIST_DIR, 'win-unpacked')
const ASAR_FILE = path.join(UNPACKED_DIR, 'resources', 'app.asar')
const LOCALES_DIR = path.join(UNPACKED_DIR, 'locales')

/** 默认告警阈值：相对基线快照偏离超过 20% 输出 warning（不 fail） */
const DEFAULT_WARN_RATIO = 0.2

/** 单次冷启动采集的超时（毫秒）：perf-baseline 自身 45s 自动退出 + 兜底，留足 CI 余量 */
const STARTUP_CHILD_TIMEOUT_MS = 240_000

/**
 * bundle 指标定义（key → 中文标签）。
 *
 * 采集全部只读构建产物：
 * - firstScreen / entry / shell / preview：渲染层首屏与主界面关键 JS（体积回归直接对应首屏成本）；
 * - mainEntry / preloadEntry / rendererAssets：进程产物与渲染层总量；
 * - asar / locales / unpacked / setup / portable：打包产物（安装包在 `build:unpack` 的 CI job 中
 *   不存在，报告里标记「未构建」，完整安装包体积由 bundle-budget job 硬门禁覆盖）。
 */
const BUNDLE_METRIC_DEFS = {
    firstScreenJsBytes: '首屏初始 JS（入口 + modulepreload 本地 JS）',
    entryJsBytes: '渲染入口 chunk（index-*.js）',
    shellJsBytes: '主界面壳 chunk（BaiZeNotes-*.js）',
    previewChunkBytes: '预览 chunk（MarkdownPreviewComponent-*.js）',
    mainEntryBytes: '主进程入口（out/build/main/index.js）',
    preloadEntryBytes: 'preload 入口（out/build/preload/index.js）',
    rendererAssetsBytes: '渲染层 assets 全部文件',
    asarBytes: 'app.asar',
    localesBytes: 'locales 语言包（zh-CN/en-US）',
    unpackedBytes: 'win-unpacked 解包目录',
    setupInstallerBytes: 'NSIS 安装包（Setup exe）',
    portableInstallerBytes: '便携版（portable exe）'
}

/** 开发构建冷启动指标（performance marks summary） */
const DEV_STARTUP_DEFS = {
    appReadyMs: 'app-ready（app.whenReady）',
    windowCreateMs: 'window-create（窗口构造）',
    rendererReadyMs: 'renderer-ready（渲染层握手）',
    mainViewMountedMs: 'main-view-mounted（主界面挂载）',
    editorReadyMs: 'editor-ready（Monaco 就绪）',
    previewReadyMs: 'preview-ready（预览首帧）'
}

/** 打包版冷启动指标（aggregate.median；后两项为外部 Win32 探测） */
const PACKAGED_STARTUP_DEFS = {
    appReadyMs: 'app-ready（主进程）',
    windowCreateMs: 'window-create（窗口构造）',
    rendererReadyMs: 'renderer-ready（渲染层握手）',
    mainViewMountedMs: 'main-view-mounted（主界面挂载）',
    editorReadyMs: 'editor-ready（Monaco 就绪）',
    previewReadyMs: 'preview-ready（预览首帧）',
    windowVisibleMs: '窗口可见（进程启动→首个可见窗口，外部探测）',
    processRuntimeMs: '进程总耗时（进程启动→退出，外部探测）'
}

/** 命令行解析（仅本脚本用到的少量参数） */
function parseArgs(argv) {
    const options = {
        startup: false,
        startupMode: 'both',
        e2eReport: null,
        snapshot: DEFAULT_SNAPSHOT,
        updateSnapshot: false,
        warnRatio: DEFAULT_WARN_RATIO,
        compare: true,
        help: false
    }
    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            options.help = true
        } else if (arg === '--startup') {
            options.startup = true
        } else if (arg.startsWith('--startup-mode=')) {
            const mode = arg.slice('--startup-mode='.length)
            if (!['both', 'dev', 'packaged'].includes(mode)) {
                throw new Error(`--startup-mode 只支持 both/dev/packaged（收到 ${mode}）`)
            }
            options.startupMode = mode
        } else if (arg.startsWith('--e2e-report=')) {
            options.e2eReport = path.resolve(ROOT, arg.slice('--e2e-report='.length))
        } else if (arg.startsWith('--snapshot=')) {
            options.snapshot = path.resolve(ROOT, arg.slice('--snapshot='.length))
        } else if (arg === '--update-snapshot') {
            options.updateSnapshot = true
        } else if (arg.startsWith('--warn-ratio=')) {
            const value = Number(arg.slice('--warn-ratio='.length))
            if (!Number.isFinite(value) || value <= 0) {
                throw new Error(`--warn-ratio 需要正数（收到 ${arg}）`)
            }
            options.warnRatio = value
        } else if (arg === '--no-compare') {
            options.compare = false
        } else {
            throw new Error(`未知参数：${arg}（--help 查看用法）`)
        }
    }
    return options
}

function printHelp() {
    console.log(`性能基线 CI（软门禁 / 报告）脚本

用法：
  node build/perf-ci.js [选项]

选项：
  --startup                 本次采集冷启动指标（调用 build/perf-baseline.js，默认 dev+packaged 各 1 次）
  --startup-mode=MODE       both / dev / packaged（默认 both；仅 --startup 时生效）
  --e2e-report=PATH         读取 Playwright JSON 报告的 startup-metrics annotation（readyMs 统计）
  --snapshot=PATH           基线快照路径（默认 build/perf-baseline.snapshot.json）
  --update-snapshot         用本次指标重写基线快照（维护基线时手动执行）
  --warn-ratio=0.2          相对基线偏离告警阈值（默认 0.2 = 20%）
  --no-compare              只采集并输出报告，不做快照对比
  -h, --help                显示本帮助

产物：
  out/analysis/perf-baseline-ci.json   机器可读报告（指标 / 偏差 / 环境 / 来源）
  out/analysis/perf-baseline-ci.md     Markdown 摘要（CI artifact 与 GitHub Step Summary）

退出码：
  0 = 采集完成（指标偏离只 warning，不阻断）
  1 = bundle 构建产物缺失，无法采集（CI job 为 continue-on-error，不会阻塞 PR）

说明：
  启动指标复用 build/perf-baseline.js；非本次采集（未加 --startup）的既有报告只作参考，
  不参与偏差判定。基线快照入库后，CI 每次构建都会输出「当前 vs 基线」并给出 warning annotation。`)
}

/* ==========================================================================================
 * 通用工具
 * ======================================================================================== */

function relativePath(targetPath) {
    return path.relative(ROOT, targetPath) || '.'
}

/** 读取 JSON（不存在/解析失败返回 null） */
function readJsonSafe(filePath) {
    if (!fs.existsSync(filePath)) {
        return null
    }
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    } catch {
        return null
    }
}

/** 递归统计目录体积（目录不存在返回 null） */
function sumDirBytes(dir) {
    if (!fs.existsSync(dir)) {
        return null
    }
    let total = 0
    const stack = [dir]
    while (stack.length > 0) {
        const current = stack.pop()
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const entryPath = path.join(current, entry.name)
            if (entry.isDirectory()) {
                stack.push(entryPath)
            } else if (entry.isFile()) {
                total += fs.statSync(entryPath).size
            }
        }
    }
    return total
}

/** 目录内按正则找体积最大的文件（无命中返回 null） */
function findLargestFile(dir, pattern) {
    if (!fs.existsSync(dir)) {
        return null
    }
    const matched = fs
        .readdirSync(dir)
        .filter((name) => pattern.test(name))
        .map((name) => path.join(dir, name))
        .filter((filePath) => fs.statSync(filePath).isFile())
        .sort((left, right) => fs.statSync(right).size - fs.statSync(left).size)
    if (matched.length === 0) {
        return null
    }
    if (matched.length > 1) {
        console.warn(
            `[perf-ci] 提示：${pattern} 命中 ${matched.length} 个文件，取体积最大者 ` +
                `${path.basename(matched[0])}（若为构建残留建议清理后重建）`
        )
    }
    return matched[0]
}

function formatBytes(bytes) {
    if (typeof bytes !== 'number' || !Number.isFinite(bytes)) {
        return '-'
    }
    if (bytes >= 1024 * 1024) {
        return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`
    }
    if (bytes >= 1024) {
        return `${(bytes / 1024).toFixed(1)} KiB`
    }
    return `${bytes} B`
}

function formatMs(value) {
    return typeof value === 'number' && Number.isFinite(value) ? `${value.toFixed(1)}ms` : '-'
}

/** 按单位格式化指标值 */
function formatMetricValue(value, unit) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '-'
    }
    return unit === 'bytes' ? formatBytes(value) : formatMs(value)
}

/** 偏差百分比文本（正数=变大） */
function formatRatio(ratio) {
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) {
        return '-'
    }
    const percent = (ratio - 1) * 100
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`
}

/** 读取 package.json 中的版本号 */
function readAppVersion() {
    const content = readJsonSafe(PACKAGE_JSON)
    return content && typeof content.version === 'string' ? content.version : null
}

/** 读取当前 git HEAD（不在 git 仓库/命令不可用时返回 null） */
function readGitHead() {
    const result = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: ROOT,
        encoding: 'utf-8',
        windowsHide: true
    })
    const output = typeof result.stdout === 'string' ? result.stdout.trim() : ''
    return output.length > 0 ? output : null
}

/** 采集机器环境（报告可复现性） */
function collectEnvironment() {
    const cpus = typeof os.cpus === 'function' ? os.cpus() : []
    let electronVersion = null
    try {
        electronVersion = JSON.parse(
            fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf-8')
        ).version
    } catch {
        /* 忽略：node_modules 未安装时报告里留 null */
    }
    return {
        capturedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        cpuModel: cpus.length > 0 ? cpus[0].model : 'unknown',
        cpuCount: cpus.length,
        totalMemMb: Math.round(os.totalmem() / 1048576),
        nodeVersion: process.version,
        electronVersion,
        appVersion: readAppVersion(),
        gitHead: readGitHead(),
        ci: process.env.GITHUB_ACTIONS === 'true'
    }
}

/* ==========================================================================================
 * bundle 指标采集（只读构建产物）
 * ======================================================================================== */

/**
 * 解析渲染层 index.html：入口 `<script type="module" src>` 与 modulepreload 本地 .js。
 *
 * 与 build/check-bundle-budget.js 的 collectFirstScreenJs() 同口径（该脚本是自执行入口，
 * 未导出函数，故在此保留一份小实现；口径变化时两处需同步）。
 */
function collectFirstScreenJs() {
    const components = []
    const seen = new Set()
    if (!fs.existsSync(RENDERER_INDEX_HTML)) {
        return { components, entryFile: null, missing: true }
    }
    const html = fs.readFileSync(RENDERER_INDEX_HTML, 'utf-8')
    const scriptTag = html.match(/<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>/i)?.[0]
    const scriptSrc = scriptTag ? /\bsrc\s*=\s*["']([^"']+)["']/i.exec(scriptTag)?.[1] : null
    const resolveLocal = (href) => {
        const clean = String(href).trim().split(/[?#]/)[0]
        if (!/\.m?js$/i.test(clean)) return null
        if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(clean) || path.isAbsolute(clean)) return null
        const resolved = path.resolve(RENDERER_DIR, clean)
        const relativeToRenderer = path.relative(RENDERER_DIR, resolved)
        if (
            relativeToRenderer.length === 0 ||
            relativeToRenderer.startsWith('..') ||
            path.isAbsolute(relativeToRenderer) ||
            !fs.existsSync(resolved)
        ) {
            return null
        }
        return resolved
    }
    const entryFile = scriptSrc ? resolveLocal(scriptSrc) : null
    if (entryFile) {
        seen.add(entryFile)
        components.push({ filePath: entryFile, kind: '入口 script' })
    }
    for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
        if (!/\brel\s*=\s*["']modulepreload["']/i.test(tag)) continue
        const hrefMatch = /\bhref\s*=\s*["']([^"']+)["']/i.exec(tag)
        if (!hrefMatch) continue
        const assetPath = resolveLocal(hrefMatch[1])
        if (!assetPath || seen.has(assetPath)) continue
        seen.add(assetPath)
        components.push({ filePath: assetPath, kind: 'modulepreload' })
    }
    return { components, entryFile, missing: false }
}

/**
 * 采集 bundle 指标。
 *
 * @returns {{metrics: object, failures: string[], notes: string[]}}
 *   metrics[key] = { label, unit: 'bytes', value, sourcePath: 相对路径 }
 */
function collectBundleMetrics() {
    const failures = []
    const notes = []
    const metrics = {}

    if (!fs.existsSync(RENDERER_ASSETS_DIR)) {
        failures.push(`缺少渲染层产物目录：${relativePath(RENDERER_ASSETS_DIR)}`)
    }
    if (!fs.existsSync(RENDERER_INDEX_HTML)) {
        failures.push(`缺少渲染层 index.html：${relativePath(RENDERER_INDEX_HTML)}`)
    }
    const mainEntryPath = path.join(MAIN_DIR, 'index.js')
    if (!fs.existsSync(mainEntryPath)) {
        failures.push(`缺少主进程入口：${relativePath(mainEntryPath)}`)
    }
    const preloadEntryPath = path.join(PRELOAD_DIR, 'index.js')
    if (!fs.existsSync(preloadEntryPath)) {
        failures.push(`缺少 preload 入口：${relativePath(preloadEntryPath)}`)
    }
    if (failures.length > 0) {
        return { metrics, failures, notes }
    }

    const record = (key, value, sourcePath) => {
        if (value === null || value === undefined) return
        metrics[key] = {
            label: BUNDLE_METRIC_DEFS[key],
            unit: 'bytes',
            value,
            sourcePath: sourcePath ? relativePath(sourcePath) : null
        }
    }

    // —— 渲染层：首屏 / 入口 / 壳 / 预览 / 全量 assets ——
    const firstScreen = collectFirstScreenJs()
    const firstScreenBytes = firstScreen.components.reduce(
        (sum, component) => sum + fs.statSync(component.filePath).size,
        0
    )
    record('firstScreenJsBytes', firstScreenBytes, RENDERER_INDEX_HTML)
    record(
        'entryJsBytes',
        firstScreen.entryFile ? fs.statSync(firstScreen.entryFile).size : null,
        firstScreen.entryFile
    )
    const shellFile = findLargestFile(RENDERER_ASSETS_DIR, /^BaiZeNotes-.*\.js$/)
    record('shellJsBytes', shellFile ? fs.statSync(shellFile).size : null, shellFile)
    const previewFile = findLargestFile(RENDERER_ASSETS_DIR, /^MarkdownPreviewComponent-.*\.js$/)
    if (previewFile) {
        record('previewChunkBytes', fs.statSync(previewFile).size, previewFile)
    } else {
        notes.push('未找到 MarkdownPreviewComponent-*.js 预览 chunk（跳过该指标）')
    }
    record('rendererAssetsBytes', sumDirBytes(RENDERER_ASSETS_DIR), RENDERER_ASSETS_DIR)

    // —— 进程产物 ——
    record('mainEntryBytes', fs.statSync(mainEntryPath).size, mainEntryPath)
    record('preloadEntryBytes', fs.statSync(preloadEntryPath).size, preloadEntryPath)

    // —— 打包产物（build:unpack 只产出 win-unpacked；安装包体积由 bundle-budget job 覆盖）——
    if (fs.existsSync(ASAR_FILE)) {
        record('asarBytes', fs.statSync(ASAR_FILE).size, ASAR_FILE)
    } else {
        notes.push(`未找到 app.asar（${relativePath(ASAR_FILE)}），跳过 asar 指标`)
    }
    if (fs.existsSync(UNPACKED_DIR)) {
        record('unpackedBytes', sumDirBytes(UNPACKED_DIR), UNPACKED_DIR)
    }
    if (fs.existsSync(LOCALES_DIR)) {
        const localesBytes = fs
            .readdirSync(LOCALES_DIR)
            .filter((name) => name.endsWith('.pak'))
            .reduce((sum, name) => sum + fs.statSync(path.join(LOCALES_DIR, name)).size, 0)
        record('localesBytes', localesBytes, LOCALES_DIR)
    }
    const version = readAppVersion()
    if (version) {
        const setupFile = path.join(DIST_DIR, `BaiZeNotes_Setup_${version}_windows_x64.exe`)
        const portableFile = path.join(DIST_DIR, `BaiZeNotes_${version}_windows_x64.exe`)
        if (fs.existsSync(setupFile)) {
            record('setupInstallerBytes', fs.statSync(setupFile).size, setupFile)
        } else {
            notes.push(`未构建当前版本 NSIS 安装包（v${version}），跳过安装包指标`)
        }
        if (fs.existsSync(portableFile)) {
            record('portableInstallerBytes', fs.statSync(portableFile).size, portableFile)
        } else {
            notes.push(`未构建当前版本 portable（v${version}），跳过便携版指标`)
        }
    } else {
        notes.push('无法读取 package.json 版本，跳过安装包指标')
    }

    return { metrics, failures, notes }
}

/* ==========================================================================================
 * 启动指标采集（复用 build/perf-baseline.js）
 * ======================================================================================== */

/** 单次调用 perf-baseline 子进程；失败只 warning，不抛出 */
function runPerfBaseline(mode) {
    const args = [PERF_BASELINE_SCRIPT, '--runs=1']
    if (mode === 'packaged') {
        args.push('--packaged')
    }
    console.log(`\n[perf-ci] 采集启动指标：node build/perf-baseline.js ${args.slice(1).join(' ')}`)
    const startedAt = Date.now()
    const result = spawnSync(process.execPath, args, {
        cwd: ROOT,
        stdio: 'inherit',
        timeout: STARTUP_CHILD_TIMEOUT_MS,
        windowsHide: true
    })
    const durationMs = Date.now() - startedAt
    if (result.error) {
        warn(`启动指标采集（${mode}）异常：${result.error.message}`)
        return { ok: false, durationMs }
    }
    if (result.status !== 0) {
        warn(`启动指标采集（${mode}）退出码 ${result.status ?? 'null'}，沿用既有报告作参考`)
        return { ok: false, durationMs }
    }
    return { ok: true, durationMs }
}

/**
 * 读取启动指标。
 *
 * @param {object} options
 * @param {boolean} options.fresh 是否本次刚采集（决定是否参与偏差判定）
 * @returns {{metrics: object, sources: object, notes: string[]}}
 */
function collectStartupMetrics(options) {
    const metrics = {}
    const sources = {}
    const notes = []

    // 开发构建：performance marks summary
    const devReport = readJsonSafe(DEV_REPORT)
    if (devReport && devReport.summary) {
        const generatedAt = devReport.generatedAt ?? null
        sources.dev = {
            path: relativePath(DEV_REPORT),
            generatedAt,
            appVersion: devReport.environment?.appVersion ?? null,
            fresh: isFresh(generatedAt, options.freshStartedAt)
        }
        for (const [key, label] of Object.entries(DEV_STARTUP_DEFS)) {
            const value = devReport.summary[key]
            if (typeof value !== 'number' || !Number.isFinite(value)) continue
            metrics[`startup.dev.${key}`] = {
                label,
                unit: 'ms',
                value,
                sourcePath: relativePath(DEV_REPORT),
                reportGeneratedAt: generatedAt,
                reportAppVersion: devReport.environment?.appVersion ?? null,
                fresh: sources.dev.fresh
            }
        }
    } else {
        notes.push(`未找到开发构建启动报告（${relativePath(DEV_REPORT)}），跳过开发构建启动指标`)
    }

    // 打包版：aggregate.median（含外部窗口可见探测）
    const packagedReport = readJsonSafe(PACKAGED_REPORT)
    if (packagedReport && packagedReport.aggregate) {
        const generatedAt = packagedReport.generatedAt ?? null
        sources.packaged = {
            path: relativePath(PACKAGED_REPORT),
            generatedAt,
            appVersion: packagedReport.environment?.appVersion ?? null,
            fresh: isFresh(generatedAt, options.freshStartedAt)
        }
        for (const [key, label] of Object.entries(PACKAGED_STARTUP_DEFS)) {
            const value = packagedReport.aggregate[key]?.median
            if (typeof value !== 'number' || !Number.isFinite(value)) continue
            metrics[`startup.packaged.${key}`] = {
                label,
                unit: 'ms',
                value,
                sourcePath: relativePath(PACKAGED_REPORT),
                reportGeneratedAt: generatedAt,
                reportAppVersion: packagedReport.environment?.appVersion ?? null,
                fresh: sources.packaged.fresh
            }
        }
    } else {
        notes.push(`未找到打包版启动报告（${relativePath(PACKAGED_REPORT)}），跳过打包版启动指标`)
    }

    return { metrics, sources, notes }
}

/** 报告生成时间是否落在本次采集窗口内（容忍 5s 时钟/写盘延迟） */
function isFresh(generatedAt, freshStartedAt) {
    if (typeof freshStartedAt !== 'number' || typeof generatedAt !== 'string') {
        return false
    }
    const parsed = Date.parse(generatedAt)
    return Number.isFinite(parsed) && parsed >= freshStartedAt - 5000
}

/* ==========================================================================================
 * E2E 启动 readyMs 统计（可选：解析 Playwright JSON 报告的 startup-metrics annotation）
 * ======================================================================================== */

/** 从 Playwright JSON 报告提取 startup-metrics annotation（launchAttempts/reloadRecoveries/readyMs） */
function collectE2EStartupMetrics(reportPath) {
    const report = readJsonSafe(reportPath)
    if (report === null) {
        warn(`无法读取 E2E JSON 报告：${relativePath(reportPath)}`)
        return null
    }
    const samples = []
    const visit = (suite) => {
        if (!suite) return
        for (const spec of suite.specs ?? []) {
            for (const test of spec.tests ?? []) {
                for (const annotation of test.annotations ?? []) {
                    if (annotation.type !== 'startup-metrics') continue
                    const description = String(annotation.description ?? '')
                    const launchAttempts = /launchAttempts=(\d+)/.exec(description)?.[1]
                    const reloadRecoveries = /reloadRecoveries=(\d+)/.exec(description)?.[1]
                    const readyMs = /readyMs=(\d+)/.exec(description)?.[1]
                    samples.push({
                        title: spec.title ?? null,
                        launchAttempts: launchAttempts ? Number(launchAttempts) : null,
                        reloadRecoveries: reloadRecoveries ? Number(reloadRecoveries) : null,
                        readyMs: readyMs ? Number(readyMs) : null
                    })
                }
            }
        }
        for (const child of suite.suites ?? []) visit(child)
    }
    for (const suite of report.suites ?? []) visit(suite)
    const readyTimes = samples
        .map((sample) => sample.readyMs)
        .filter((value) => typeof value === 'number' && Number.isFinite(value))
        .sort((left, right) => left - right)
    if (readyTimes.length === 0) {
        console.warn(
            `[perf-ci] E2E 报告（${relativePath(reportPath)}）中没有 startup-metrics readyMs 数据（跳过）`
        )
        return null
    }
    const mid = Math.floor(readyTimes.length / 2)
    return {
        path: relativePath(reportPath),
        sampleCount: samples.length,
        readySampleCount: readyTimes.length,
        launchAttemptsTotal: samples.reduce((sum, sample) => sum + (sample.launchAttempts ?? 0), 0),
        reloadRecoveriesTotal: samples.reduce(
            (sum, sample) => sum + (sample.reloadRecoveries ?? 0),
            0
        ),
        readyMsP50:
            readyTimes.length % 2 === 1
                ? readyTimes[mid]
                : (readyTimes[mid - 1] + readyTimes[mid]) / 2,
        readyMsMax: readyTimes[readyTimes.length - 1],
        samples
    }
}

/* ==========================================================================================
 * 基线快照与偏差对比
 * ======================================================================================== */

/** 读取基线快照；结构不合法返回 {snapshot:null, error} */
function loadSnapshot(snapshotPath) {
    if (!fs.existsSync(snapshotPath)) {
        return {
            snapshot: null,
            error: `基线快照不存在：${relativePath(snapshotPath)}（可用 --update-snapshot 生成）`
        }
    }
    const snapshot = readJsonSafe(snapshotPath)
    if (snapshot === null || typeof snapshot.metrics !== 'object' || snapshot.metrics === null) {
        return { snapshot: null, error: `基线快照结构不合法：${relativePath(snapshotPath)}` }
    }
    return { snapshot, error: null }
}

/**
 * 组装当前指标集合（bundle + 启动；后者只有本次采集的才标记 fresh）。
 */
function buildCurrentMetrics(bundleMetrics, startupMetrics) {
    const metrics = {}
    for (const [key, metric] of Object.entries(bundleMetrics)) {
        metrics[`bundle.${key}`] = { ...metric, fresh: true }
    }
    for (const [key, metric] of Object.entries(startupMetrics)) {
        metrics[key] = metric
    }
    return metrics
}

/**
 * 与基线快照比较。
 *
 * 判定规则（与 README / 报告一致）：
 * - 只有「本次采集」的指标参与偏差判定（bundle 总是本次读取；启动指标需 --startup 且本次生成）；
 * - 相对基线偏离超过 warnRatio（默认 +20%）→ warning；下降超过阈值 → info（改善，不告警）；
 * - 基线有、本次没有（例如 CI build:unpack 未构建安装包）→ missing（仅记录，不告警）；
 * - 本次有、基线没有 → new（仅记录）。
 */
function compareWithSnapshot(currentMetrics, snapshot, warnRatio) {
    const rows = []
    const warnings = []
    const improvements = []
    const snapshotMetrics = snapshot?.metrics ?? {}
    for (const [key, current] of Object.entries(currentMetrics)) {
        const baseline = snapshotMetrics[key]
        if (!baseline || typeof baseline.value !== 'number') {
            rows.push({
                key,
                label: current.label,
                unit: current.unit,
                current: current.value,
                baseline: null,
                delta: null,
                ratio: null,
                status: 'new',
                comparable: false
            })
            continue
        }
        const delta = current.value - baseline.value
        const ratio = baseline.value === 0 ? null : current.value / baseline.value
        let status = 'ok'
        if (!current.fresh) {
            status = 'reference'
        } else if (ratio !== null && ratio > 1 + warnRatio) {
            status = 'warn'
            warnings.push({
                key,
                label: current.label,
                unit: current.unit,
                current: current.value,
                baseline: baseline.value,
                delta,
                ratio,
                message:
                    `${current.label} 偏离基线 >${(warnRatio * 100).toFixed(0)}%：` +
                    `${formatMetricValue(current.value, current.unit)} / 基线 ` +
                    `${formatMetricValue(baseline.value, current.unit)}（${formatRatio(ratio)}）`
            })
        } else if (ratio !== null && ratio < 1 - warnRatio) {
            status = 'info'
            improvements.push({
                key,
                label: current.label,
                unit: current.unit,
                current: current.value,
                baseline: baseline.value,
                ratio
            })
        }
        rows.push({
            key,
            label: current.label,
            unit: current.unit,
            current: current.value,
            baseline: baseline.value,
            delta,
            ratio,
            status,
            comparable: current.fresh === true
        })
    }
    // 基线里有、本次未采集的指标（例如安装包）单独记录，便于报告说明
    for (const [key, baseline] of Object.entries(snapshotMetrics)) {
        if (currentMetrics[key]) continue
        rows.push({
            key,
            label: baseline.label ?? key,
            unit: baseline.unit ?? 'bytes',
            current: null,
            baseline: typeof baseline.value === 'number' ? baseline.value : null,
            delta: null,
            ratio: null,
            status: 'missing',
            comparable: false
        })
    }
    return { rows, warnings, improvements }
}

/** 生成新的基线快照（--update-snapshot） */
function buildSnapshot(currentMetrics, environment, warnRatio) {
    const metrics = {}
    for (const [key, metric] of Object.entries(currentMetrics)) {
        const isStartup = key.startsWith('startup.')
        metrics[key] = {
            label: metric.label,
            unit: metric.unit,
            value: metric.value,
            measuredAt: metric.reportGeneratedAt ?? environment.capturedAt,
            provenance: isStartup
                ? `报告 ${metric.sourcePath ?? '未知'}（generatedAt ${metric.reportGeneratedAt ?? '未知'}，` +
                  `appVersion ${metric.reportAppVersion ?? '-'}）`
                : `构建产物实测：${metric.sourcePath ?? 'out/build'}`
        }
    }
    return {
        schemaVersion: 1,
        kind: 'perf-baseline-snapshot',
        generatedAt: new Date().toISOString(),
        note:
            '仓库内性能基线快照（软门禁对比基准，非硬阈值）。维护：npm run perf:ci:startup ' +
            '→ npm run perf:snapshot，PR 中说明变化原因；CI 偏离 >' +
            `${(warnRatio * 100).toFixed(0)}% 仅 warning，不阻断。`,
        thresholds: {
            deviationRatio: warnRatio,
            policy: 'warn-only',
            annotationPrefix: '性能基线偏离'
        },
        appVersion: environment.appVersion,
        gitHead: environment.gitHead,
        environment,
        metrics
    }
}

/* ==========================================================================================
 * 报告输出
 * ======================================================================================== */

function warn(message) {
    console.warn(`[perf-ci][警告] ${message}`)
}

/** 转义 GitHub Actions annotation 特殊字符 */
function escapeAnnotation(message) {
    return String(message).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')
}

/** 输出 warning annotation（仅 GitHub Actions 环境；本地只打印警告） */
function emitWarningAnnotation(message) {
    if (process.env.GITHUB_ACTIONS === 'true') {
        console.log(`::warning title=性能基线偏离::${escapeAnnotation(message)}`)
    }
}

/** 输出 notice annotation（仅 GitHub Actions 环境） */
function emitNoticeAnnotation(message) {
    if (process.env.GITHUB_ACTIONS === 'true') {
        console.log(`::notice title=性能基线::${escapeAnnotation(message)}`)
    }
}

/** 追加 GitHub Step Summary（本地/非 CI 静默跳过） */
function appendStepSummary(markdown) {
    const summaryPath = process.env.GITHUB_STEP_SUMMARY
    if (!summaryPath) {
        return false
    }
    try {
        fs.appendFileSync(summaryPath, `${markdown}\n`, 'utf-8')
        return true
    } catch (error) {
        warn(`写入 GitHub Step Summary 失败：${error.message}`)
        return false
    }
}

function statusText(status) {
    const map = {
        ok: '✅ 正常',
        warn: '⚠️ 偏离',
        info: '🔽 改善',
        new: '· 新指标',
        missing: '· 未采集',
        reference: '· 参考'
    }
    return map[status] ?? status
}

/**
 * 生成 Markdown 报告（同时用于控制台摘要、artifact 与 GitHub Step Summary）。
 */
function buildMarkdownReport(result) {
    const lines = []
    const { environment, rows, warnings, improvements, bundleNotes, startupNotes, sources } = result
    const warnRatioPercent = (result.warnRatio * 100).toFixed(0)
    lines.push('# 性能基线 CI 报告（软门禁）')
    lines.push('')
    if (result.snapshotUpdated) {
        lines.push(
            '> 🛠️ **基线快照已更新**：本次采集指标写入新基线，未做偏差判定 ' +
                '（维护动作，PR 中需说明变化原因）。'
        )
    } else if (result.snapshotError) {
        lines.push(
            `> ⚠️ 基线快照不可用（${result.snapshotError}），本次仅采集指标，未做偏差判定（软门禁，不阻断）。`
        )
    } else if (warnings.length > 0) {
        lines.push(
            `> ⚠️ **${warnings.length} 项指标相对基线偏离 >${warnRatioPercent}%**：` +
                '仅输出 warning annotation，不阻断 CI（软门禁）。'
        )
    } else {
        lines.push(`> ✅ 本次采集指标均在基线 ${warnRatioPercent}% 偏离阈值内（软门禁，不阻断）。`)
    }
    lines.push('')
    lines.push('| 项 | 值 |')
    lines.push('| --- | --- |')
    lines.push(`| 生成时间 | ${environment.capturedAt} |`)
    lines.push(`| 版本 / HEAD | ${environment.appVersion ?? '-'} / ${environment.gitHead ?? '-'} |`)
    lines.push(
        `| 环境 | ${environment.platform} ${environment.arch} / Node ` +
            `${environment.nodeVersion} / Electron ${environment.electronVersion ?? '-'} |`
    )
    lines.push(
        `| 基线快照 | ${result.snapshotPath ? relativePath(result.snapshotPath) : '未找到'}` +
            `${
                result.snapshotMeta
                    ? `（${result.snapshotMeta.generatedAt ?? '未知时间'}，` +
                      `HEAD ${result.snapshotMeta.gitHead ?? '-'}）`
                    : ''
            } |`
    )
    lines.push(`| 判定阈值 | 相对基线偏离 >${warnRatioPercent}% 输出 warning，不 fail |`)
    lines.push('')

    if (warnings.length > 0) {
        lines.push('## 偏离告警（warning，不阻断）')
        lines.push('')
        lines.push('| 指标 | 本次 | 基线 | 偏差 |')
        lines.push('| --- | ---: | ---: | ---: |')
        for (const warning of warnings) {
            lines.push(
                `| ${warning.label} | ${formatMetricValue(warning.current, warning.unit)} | ` +
                    `${formatMetricValue(warning.baseline, warning.unit)} | ${formatRatio(warning.ratio)} |`
            )
        }
        lines.push('')
    }
    if (improvements.length > 0) {
        lines.push('## 明显改善（info）')
        lines.push('')
        lines.push('| 指标 | 本次 | 基线 | 变化 |')
        lines.push('| --- | ---: | ---: | ---: |')
        for (const improvement of improvements) {
            lines.push(
                `| ${improvement.label} | ${formatMetricValue(improvement.current, improvement.unit)} | ` +
                    `${formatMetricValue(improvement.baseline, improvement.unit)} | ` +
                    `${formatRatio(improvement.ratio)} |`
            )
        }
        lines.push('')
    }

    lines.push('## 指标明细')
    lines.push('')
    lines.push('| 指标 | 本次 | 基线 | 偏差 | 判定 |')
    lines.push('| --- | ---: | ---: | ---: | --- |')
    for (const row of rows) {
        lines.push(
            `| ${row.label} | ${formatMetricValue(row.current, row.unit)} | ` +
                `${formatMetricValue(row.baseline, row.unit)} | ` +
                `${row.ratio === null ? '-' : formatRatio(row.ratio)} | ${statusText(row.status)} |`
        )
    }
    lines.push('')
    const startupSourceLines = []
    if (sources.dev) {
        startupSourceLines.push(
            `- 开发构建：\`${sources.dev.path}\`（${sources.dev.generatedAt ?? '未知时间'}，` +
                `appVersion ${sources.dev.appVersion ?? '-'}，` +
                `${sources.dev.fresh ? '本次采集' : '既有报告，仅参考'}）`
        )
    }
    if (sources.packaged) {
        startupSourceLines.push(
            `- 打包版：\`${sources.packaged.path}\`（${sources.packaged.generatedAt ?? '未知时间'}，` +
                `appVersion ${sources.packaged.appVersion ?? '-'}，` +
                `${sources.packaged.fresh ? '本次采集' : '既有报告，仅参考'}）`
        )
    }
    if (startupSourceLines.length > 0) {
        lines.push('### 启动指标来源')
        lines.push('')
        lines.push(...startupSourceLines)
        lines.push('')
    }
    const allNotes = [...bundleNotes, ...startupNotes]
    if (allNotes.length > 0) {
        lines.push('### 采集说明')
        lines.push('')
        for (const note of allNotes) {
            lines.push(`- ${note}`)
        }
        lines.push('')
    }
    if (result.e2eStartup) {
        lines.push('## E2E 启动 readyMs 统计（可选输入）')
        lines.push('')
        lines.push('| 项 | 值 |')
        lines.push('| --- | --- |')
        lines.push(`| 报告 | ${result.e2eStartup.path} |`)
        lines.push(
            `| 样本数 / 含 readyMs | ${result.e2eStartup.sampleCount} / ${result.e2eStartup.readySampleCount} |`
        )
        lines.push(
            `| readyMs P50 / Max | ${formatMs(result.e2eStartup.readyMsP50)} / ${formatMs(result.e2eStartup.readyMsMax)} |`
        )
        lines.push(
            `| 进程启动次数 / reload 恢复 | ${result.e2eStartup.launchAttemptsTotal} / ` +
                `${result.e2eStartup.reloadRecoveriesTotal} |`
        )
        lines.push('')
    }
    lines.push('## 口径与阈值依据')
    lines.push('')
    lines.push(
        '- **bundle 指标**：只读 `out/build/**` 产物。首屏 = `index.html` 入口 `module` script + ' +
            '`modulepreload` 本地 JS 之和（与 `build/check-bundle-budget.js` 同口径）；预览 = ' +
            '`MarkdownPreviewComponent-*.js`；主进程 = `out/build/main/index.js`；打包 = ' +
            '`app.asar` / `win-unpacked` / 安装包（存在时）。'
    )
    lines.push(
        '- **启动指标**：来自 `build/perf-baseline.js` 的 performance marks summary 与打包版 ' +
            'aggregate 中位数（窗口可见/进程总耗时由 PowerShell + Win32 EnumWindows 外部探测）。'
    )
    lines.push(
        `- **阈值**：相对基线快照偏离 >${warnRatioPercent}% 输出 warning annotation，不改变退出码、` +
            '不阻塞 PR；下降 >' +
            `${warnRatioPercent}% 记为改善（info）。选择 20% 的依据：启动指标在 CI runner（共享 ` +
            'vCPU、冷缓存）天然有 ±10%~15% 波动，20% 可过滤抖动又能捕获「数十 ms / 数十 KiB 级」' +
            '的回退；体积指标产物确定性较高，20% 已是明显回归。'
    )
    lines.push(
        '- **非阻断**：本脚本只在「bundle 构建产物缺失」时返回 1，且 CI job 为 ' +
            '`continue-on-error: true`；回归以报告/annotation 形式供评审，不卡 PR。'
    )
    lines.push('')
    lines.push('## 产物与接入')
    lines.push('')
    lines.push(`- JSON：\`${relativePath(REPORT_JSON)}\``)
    lines.push(`- Markdown：\`${relativePath(REPORT_MARKDOWN)}\``)
    lines.push(
        '- CI：`.github/workflows/ci.yml` 的 `perf-baseline` job（构建后执行、软门禁、artifact 上传）'
    )
    lines.push('- 本地：`npm run perf:ci`（bundle） / `npm run perf:ci:startup`（含冷启动采样）')
    return lines.join('\n')
}

/** 控制台摘要（避免 CI 日志过长，只打印结论 + 关键表） */
function printConsoleSummary(result) {
    console.log('')
    console.log('============================================================')
    console.log(' 性能基线 CI 报告（软门禁，不阻断）')
    console.log('============================================================')
    console.log(
        `  版本 / HEAD：${result.environment.appVersion ?? '-'} / ${result.environment.gitHead ?? '-'}`
    )
    console.log(`  基线快照：${result.snapshotPath ? relativePath(result.snapshotPath) : '未找到'}`)
    console.log(`  阈值：相对基线偏离 >${(result.warnRatio * 100).toFixed(0)}% 输出 warning`)
    console.log('')
    console.log('  指标（本次 / 基线 / 偏差 / 判定）：')
    for (const row of result.rows) {
        console.log(
            `  - ${row.label.padEnd(42, ' ')} ` +
                `${formatMetricValue(row.current, row.unit).padStart(11, ' ')} / ` +
                `${formatMetricValue(row.baseline, row.unit).padStart(11, ' ')} / ` +
                `${(row.ratio === null ? '-' : formatRatio(row.ratio)).padStart(8, ' ')} / ` +
                statusText(row.status)
        )
    }
    console.log('')
    if (result.snapshotUpdated) {
        console.log('[perf-ci] 🛠️ 基线快照已更新（本次指标写入新基线，未做偏差判定）')
    } else if (result.snapshotError) {
        console.log(`[perf-ci] ⚠️ ${result.snapshotError}；本次仅采集指标，未做偏差判定`)
    } else if (result.warnings.length > 0) {
        console.log(
            `[perf-ci] ⚠️ ${result.warnings.length} 项偏离超过阈值（仅 warning，不 fail）：`
        )
        for (const warning of result.warnings) {
            console.log(`  - ${warning.message}`)
        }
    } else {
        console.log('[perf-ci] ✅ 本次采集指标均在阈值内')
    }
    if (result.improvements.length > 0) {
        console.log(`[perf-ci] 🔽 ${result.improvements.length} 项明显改善（info）`)
    }
    if (result.updateSnapshot) {
        console.log(`[perf-ci] 基线快照已更新：${relativePath(result.snapshotPath)}`)
    }
    console.log('')
    console.log(`产物：${relativePath(REPORT_JSON)} / ${relativePath(REPORT_MARKDOWN)}`)
}

/* ==========================================================================================
 * 主流程
 * ======================================================================================== */

function main() {
    let options
    try {
        options = parseArgs(process.argv.slice(2))
    } catch (error) {
        console.error(`[错误] ${error.message}`)
        process.exit(1)
    }
    if (options.help) {
        printHelp()
        process.exit(0)
    }

    console.log('============================================================')
    console.log(' 性能基线 CI（软门禁 / 报告）')
    console.log('============================================================')
    const environment = collectEnvironment()
    console.log(
        `版本 / HEAD：${environment.appVersion ?? '-'} / ${environment.gitHead ?? '-'}；` +
            `CI=${environment.ci}；阈值：偏离基线 >${(options.warnRatio * 100).toFixed(0)}% 仅 warning`
    )

    // —— 1. bundle 指标（只读构建产物）——
    const bundleResult = collectBundleMetrics()
    if (bundleResult.failures.length > 0) {
        console.error('[perf-ci] ❌ 构建产物缺失，无法采集 bundle 指标：')
        for (const failure of bundleResult.failures) {
            console.error(`  - ${failure}`)
        }
        console.error('[perf-ci] 请先构建：npm run build:unpack（或 npx electron-vite build）')
        if (process.env.GITHUB_ACTIONS === 'true') {
            console.log(
                `::warning title=性能基线::${escapeAnnotation('构建产物缺失，性能基线采集已跳过（软门禁不阻断）')}`
            )
        }
        process.exit(1)
    }
    console.log(`\n[perf-ci] bundle 指标采集完成：${Object.keys(bundleResult.metrics).length} 项`)

    // —— 2. 可选：本次采集启动指标 ——
    const startupStartedAt = Date.now()
    if (options.startup) {
        const modes = options.startupMode === 'both' ? ['dev', 'packaged'] : [options.startupMode]
        for (const mode of modes) {
            runPerfBaseline(mode)
        }
    }
    const startupResult = collectStartupMetrics({
        freshStartedAt: options.startup ? startupStartedAt : undefined
    })
    console.log(`[perf-ci] 启动指标：${Object.keys(startupResult.metrics).length} 项`)

    // —— 3. 可选：E2E readyMs 统计 ——
    let e2eStartup = null
    if (options.e2eReport) {
        e2eStartup = collectE2EStartupMetrics(options.e2eReport)
    }

    // —— 4. 组装并对齐基线快照 ——
    const currentMetrics = buildCurrentMetrics(bundleResult.metrics, startupResult.metrics)
    let comparison = { rows: [], warnings: [], improvements: [] }
    let snapshot = null
    let snapshotError = null
    if (options.compare && !options.updateSnapshot) {
        const loaded = loadSnapshot(options.snapshot)
        snapshot = loaded.snapshot
        snapshotError = loaded.error
        if (snapshotError) {
            warn(`${snapshotError}；本次仅采集不对比`)
        } else {
            comparison = compareWithSnapshot(currentMetrics, snapshot, options.warnRatio)
        }
    } else if (options.updateSnapshot) {
        // 快照更新模式：不判定偏差，报告直接列出本次采集指标（作为新基线）
        comparison = {
            rows: Object.entries(currentMetrics).map(([key, metric]) => ({
                key,
                label: metric.label,
                unit: metric.unit,
                current: metric.value,
                baseline: null,
                delta: null,
                ratio: null,
                status: 'new',
                comparable: false
            })),
            warnings: [],
            improvements: []
        }
    }

    // —— 5. 可选：更新基线快照（维护动作，不参与对比）——
    let snapshotUpdated = false
    if (options.updateSnapshot) {
        const nextSnapshot = buildSnapshot(currentMetrics, environment, options.warnRatio)
        fs.mkdirSync(path.dirname(options.snapshot), { recursive: true })
        fs.writeFileSync(options.snapshot, `${JSON.stringify(nextSnapshot, null, 2)}\n`, 'utf-8')
        snapshot = nextSnapshot
        snapshotUpdated = true
        console.log(`\n[perf-ci] 基线快照已写入：${relativePath(options.snapshot)}`)
    }

    // —— 6. 输出报告 ——
    const result = {
        environment,
        warnRatio: options.warnRatio,
        snapshotPath: options.snapshot,
        snapshotMeta: snapshot
            ? {
                  generatedAt: snapshot.generatedAt ?? null,
                  gitHead: snapshot.gitHead ?? null,
                  appVersion: snapshot.appVersion ?? null
              }
            : null,
        snapshotError,
        snapshotUpdated,
        rows: comparison.rows,
        warnings: comparison.warnings,
        improvements: comparison.improvements,
        bundleNotes: bundleResult.notes,
        startupNotes: startupResult.notes,
        sources: startupResult.sources,
        e2eStartup,
        metrics: currentMetrics
    }
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
    fs.writeFileSync(
        REPORT_JSON,
        `${JSON.stringify(
            {
                schemaVersion: 1,
                kind: 'perf-baseline-ci',
                generatedAt: environment.capturedAt,
                ...result
            },
            null,
            2
        )}\n`,
        'utf-8'
    )
    const markdown = buildMarkdownReport(result)
    fs.writeFileSync(REPORT_MARKDOWN, `${markdown}\n`, 'utf-8')
    printConsoleSummary(result)

    // —— 7. CI：warning annotation / notice / Step Summary ——
    for (const warning of warningsToEmit(result)) {
        emitWarningAnnotation(warning)
    }
    if (result.warnings.length === 0) {
        emitNoticeAnnotation(
            `性能基线采集完成：${Object.keys(currentMetrics).length} 项指标均在基线 ` +
                `${(options.warnRatio * 100).toFixed(0)}% 阈值内（软门禁，不阻断）`
        )
    }
    if (appendStepSummary(markdown)) {
        console.log('[perf-ci] 已追加 GitHub Step Summary')
    }
}

/** 需要输出 annotation 的警告文本 */
function warningsToEmit(result) {
    return result.warnings.map((warning) => warning.message)
}

main()
