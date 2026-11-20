#!/usr/bin/env node
/**
 * 白泽笔记启动性能基线脚本（P1 性能基线化 / P4 打包版基线化）。
 *
 * 两种模式：
 * 1) 开发构建模式（默认）：启动 `out/build/main/index.js`（Electron 运行时），采集主进程与渲染层
 *    `performance.mark/measure`，输出 `out/analysis/perf-baseline.json`；
 * 2) 打包版模式（`--packaged`）：直接启动 `out/build/dist/win-unpacked/BaiZeNotes.exe`，
 *    采集同样的 performance marks，并额外用外部探测记录「进程启动 → 窗口可见」耗时；
 *    默认跑 3 次冷启动并输出中位数/最小值/最大值，写入
 *    `out/analysis/perf-baseline-packaged.json`（含与开发构建基线的对比）。
 *
 * 设计约定（对应 P1/P4 任务）：
 * - **不纳入 CI 阻断**：脚本只做基线记录与「参考阈值」提示，指标超阈值不改变退出码；
 *   只有「没拿到报告 / 报告结构不合法」这类执行失败才返回非 0；
 * - 开发构建模式默认跑一次冷启动；打包版模式默认跑 3 次（可用 `--runs=N` 覆盖）；
 * - 运行完全隔离：userData 重定向到系统临时目录（开发构建经 `-r` 夹具、打包版经
 *   `--user-data-dir`）；真实 `~/.baizenotes/config` 由本脚本「备份 → 清空（写最小种子）→ 恢复」，
 *   不污染开发机配置；每次采样使用全新 userData，采样间等待并确保旧进程已退出；
 * - 打包版窗口可见探测不向应用注入任何代码：Windows 下由 PowerShell + Win32
 *   EnumWindows/IsWindowVisible 探测主进程 PID 的首个可见窗口；
 * - Windows 下开发构建模式复用 E2E 的 Electron 运行时副本（out/tmp/e2e-electron-runtime），
 *   避免受限沙箱环境中直接运行 node_modules/electron 的完整性问题。
 *
 * 用法：
 *   node build/perf-baseline.js                 # 开发构建：跑 1 次冷启动并输出报告
 *   node build/perf-baseline.js --packaged      # 打包版：跑 3 次冷启动并输出中位数/极值
 *   node build/perf-baseline.js --packaged --runs=1
 *   node build/perf-baseline.js --help          # 查看参数
 *   node build/perf-baseline.js --timeout-ms=90000 --keep
 *
 * 前置：开发构建模式先 `npx electron-vite build`；打包版模式先 `npm run build:unpack`
 * （产物 out/build/dist/win-unpacked/BaiZeNotes.exe 已存在时无需重建）。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn, spawnSync } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const MAIN_ENTRY = path.join(ROOT, 'out', 'build', 'main', 'index.js')
const OUT_DIR = path.join(ROOT, 'out', 'analysis')
const REPORT_PATH = path.join(OUT_DIR, 'perf-baseline.json')
/** 打包版基线报告（P4）：--packaged 模式输出 */
const PACKAGED_REPORT_PATH = path.join(OUT_DIR, 'perf-baseline-packaged.json')
/** electron-builder --dir 解包产物：打包版冷启动的被测对象 */
const PACKAGED_EXE = path.join(ROOT, 'out', 'build', 'dist', 'win-unpacked', 'BaiZeNotes.exe')
const USER_DATA_FIXTURE = path.join(ROOT, 'e2e', 'fixtures', 'redirect-user-data.cjs')
const ELECTRON_DIST_DIR = path.join(ROOT, 'node_modules', 'electron', 'dist')
const RUNTIME_ELECTRON_DIR = path.join(ROOT, 'out', 'tmp', 'e2e-electron-runtime')
const BAIZE_HOME_DIR = path.join(os.homedir(), '.baizenotes')
const BAIZE_CONFIG_DIR = path.join(BAIZE_HOME_DIR, 'config')

/** 采集后自动退出：preview-ready 出现后 1s 退出；45s 兜底（主进程侧读取） */
const QUIT_ON_COMPLETE_ENV = { BAIZE_PERF_QUIT_ON_COMPLETE: '1', BAIZE_PERF_QUIT_AFTER_MS: '45000' }

/** 参考阈值（毫秒）：仅打印「通过/超出」，不阻断（先基线化，后续再演进为门禁） */
const REFERENCE_THRESHOLDS = [
    { key: 'appReadyMs', label: 'app-ready', limitMs: 3000 },
    { key: 'windowCreateMs', label: 'window-create', limitMs: 4000 },
    { key: 'rendererReadyMs', label: 'renderer-ready', limitMs: 12000 },
    { key: 'mainViewMountedMs', label: 'main-view-mounted', limitMs: 15000 },
    { key: 'editorReadyMs', label: 'editor-ready', limitMs: 20000 },
    { key: 'previewReadyMs', label: 'preview-ready', limitMs: 25000 }
]

/** 命令行参数解析（仅本脚本用到的少量参数） */
function parseArgs(argv) {
    const options = {
        packaged: false,
        keep: false,
        help: false,
        runs: 1,
        runsExplicit: false,
        timeoutMs: 120000
    }
    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            options.help = true
        } else if (arg === '--keep') {
            options.keep = true
        } else if (arg === '--packaged') {
            options.packaged = true
        } else if (arg.startsWith('--runs=')) {
            options.runs = Math.max(1, Number(arg.slice('--runs='.length)) || 1)
            options.runsExplicit = true
        } else if (arg.startsWith('--timeout-ms=')) {
            options.timeoutMs = Math.max(
                10_000,
                Number(arg.slice('--timeout-ms='.length)) || 120000
            )
        }
    }
    return options
}

function printHelp() {
    console.log(`白泽笔记启动性能基线脚本

用法：
  node build/perf-baseline.js [选项]

模式：
  默认（开发构建）   启动 out/build/main/index.js（Electron 运行时）
  --packaged         启动 out/build/dist/win-unpacked/BaiZeNotes.exe（打包版解包产物）

选项：
  --packaged        打包版冷启动基线（默认 3 次，输出 out/analysis/perf-baseline-packaged.json）
  --runs=N          冷启动次数（开发构建默认 1；打包版默认 3；>1 时报告取最后一次并打印每次总耗时）
  --timeout-ms=N    单次启动超时（默认 120000）
  --keep            保留临时 userData 目录（默认运行后删除）
  -h, --help        显示本帮助

产物：
  out/analysis/perf-baseline.json            开发构建：mark/measure + 冷启动关键指标 + 参考阈值检查
  out/analysis/perf-baseline-packaged.json   打包版：3 次样本 + 中位数/最小值/最大值 + 机器环境 + 开发 vs 打包对比

前置：
  开发构建模式：npx electron-vite build（脚本会检查 out/build/main/index.js 是否存在）
  打包版模式：npm run build:unpack（脚本会检查 BaiZeNotes.exe 是否存在；已存在则不重建）`)
}

/** 输出目录准备 */
function ensureOutDir() {
    fs.mkdirSync(OUT_DIR, { recursive: true })
}

/** 写 JSON（自动建父目录） */
function writeJson(file, data) {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`, 'utf-8')
}

/**
 * 解析 Electron 可执行文件。
 *
 * Windows 优先复用 e2e-electron-runtime 副本（E2E 同款，兼容受限沙箱）；不存在时从
 * node_modules/electron/dist 复制一次。其他平台直接使用 electron 包导出的可执行路径。
 */
function resolveElectronExecutable() {
    const override = process.env.E2E_ELECTRON_EXECUTABLE
    if (override) {
        if (!fs.existsSync(override)) {
            throw new Error(`E2E_ELECTRON_EXECUTABLE 指向的文件不存在：${override}`)
        }
        return override
    }
    if (process.platform !== 'win32') {
        return require('electron')
    }
    const source = path.join(ELECTRON_DIST_DIR, 'electron.exe')
    const target = path.join(RUNTIME_ELECTRON_DIR, 'electron.exe')
    if (!fs.existsSync(source)) {
        throw new Error(`未找到 Electron 运行时：${source}（请先 npm install）`)
    }
    const needCopy =
        !fs.existsSync(target) ||
        fs.statSync(target).size !== fs.statSync(source).size ||
        fs.statSync(target).mtimeMs < fs.statSync(source).mtimeMs
    if (needCopy) {
        console.log('[准备] 复制 Electron 运行时到 out/tmp/e2e-electron-runtime（首次运行）…')
        fs.rmSync(RUNTIME_ELECTRON_DIR, { recursive: true, force: true })
        fs.mkdirSync(path.dirname(RUNTIME_ELECTRON_DIR), { recursive: true })
        fs.cpSync(ELECTRON_DIST_DIR, RUNTIME_ELECTRON_DIR, { recursive: true })
    }
    return target
}

/** 创建临时 profile（userData 落其中，结束清理） */
function createTempProfile() {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-perf-'))
    const userData = path.join(root, 'userData')
    fs.mkdirSync(userData, { recursive: true })
    return { root, userData, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) }
}

/**
 * 真实 home 配置目录沙箱（与 e2e/helpers/electron-profile.ts 同策略）。
 *
 * 只备份 `~/.baizenotes/config`（几 KB），运行结束后恢复；测试期间新增的 `.baizenotes`
 * 顶层条目（cache/logs 等）一并清理，若原本不存在则整体删除。
 * 注意：运行前请关闭正在使用的 BaiZeNotes 实例，避免两个进程同时读写真实配置。
 */
function createConfigSandbox(profile) {
    const homeExisted = fs.existsSync(BAIZE_HOME_DIR)
    const homeEntries = homeExisted ? fs.readdirSync(BAIZE_HOME_DIR) : []
    const configExisted = fs.existsSync(BAIZE_CONFIG_DIR)
    const backupDir = path.join(profile.root, 'real-config-backup')
    if (configExisted) {
        fs.cpSync(BAIZE_CONFIG_DIR, backupDir, { recursive: true })
    }
    const seed = () => {
        fs.rmSync(BAIZE_CONFIG_DIR, { recursive: true, force: true })
        fs.mkdirSync(BAIZE_CONFIG_DIR, { recursive: true })
        // settingsSchemaVersion=2：跳过 1.3.6 存量设置一次性迁移（避免迁移写盘干扰基线）
        writeJson(path.join(BAIZE_CONFIG_DIR, 'systemSetting.json'), {
            settingsSchemaVersion: 2
        })
    }
    const restore = () => {
        fs.rmSync(BAIZE_CONFIG_DIR, { recursive: true, force: true })
        if (configExisted) {
            fs.cpSync(backupDir, BAIZE_CONFIG_DIR, { recursive: true })
        }
        if (!homeExisted) {
            fs.rmSync(BAIZE_HOME_DIR, { recursive: true, force: true })
            return
        }
        if (fs.existsSync(BAIZE_HOME_DIR)) {
            for (const entry of fs.readdirSync(BAIZE_HOME_DIR)) {
                if (!homeEntries.includes(entry)) {
                    fs.rmSync(path.join(BAIZE_HOME_DIR, entry), { recursive: true, force: true })
                }
            }
        }
    }
    return { seed, restore }
}

/** 写入临时 userData 下的裸 JSON 配置种子（show-welcome=false 走「启动即主界面」路径） */
function seedUserData(profile) {
    writeJson(path.join(profile.userData, 'config', 'show-welcome.json'), false)
    writeJson(path.join(profile.userData, 'fileState.json'), {
        lastOpenedFile: null,
        lastOpenedDirectory: null,
        recentFiles: []
    })
}

/** 构造子进程环境：去除宿主/沙箱污染变量，注入诊断与路径 */
function buildChildEnv(profile) {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.BAIZE_PERF
    return {
        ...env,
        BAIZE_E2E_USER_DATA: profile.userData,
        BAIZE_PERF: '1',
        BAIZE_PERF_OUT: REPORT_PATH,
        ...QUIT_ON_COMPLETE_ENV
    }
}

/** 把子进程输出实时转发到本脚本 stdout（便于观察启动过程） */
function forwardOutput(stream, prefix) {
    let buffer = ''
    stream.setEncoding('utf-8')
    stream.on('data', (chunk) => {
        buffer += chunk
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''
        for (const line of lines) {
            const trimmed = line.trim()
            if (trimmed.length > 0) {
                console.log(`${prefix} ${trimmed}`)
            }
        }
    })
}

/** 启动一次 Electron 并等待退出（超时则强杀） */
function launchOnce(electronExecutable, profile, timeoutMs) {
    return new Promise((resolve) => {
        const startedAt = Date.now()
        const child = spawn(
            electronExecutable,
            ['-r', USER_DATA_FIXTURE, MAIN_ENTRY, '--baize-perf'],
            {
                cwd: ROOT,
                env: buildChildEnv(profile),
                stdio: ['ignore', 'pipe', 'pipe'],
                windowsHide: true
            }
        )
        forwardOutput(child.stdout, '[main]')
        forwardOutput(child.stderr, '[main:err]')
        let settled = false
        const finish = (result) => {
            if (settled) return
            settled = true
            clearTimeout(killTimer)
            resolve({ ...result, elapsedMs: Date.now() - startedAt })
        }
        const killTimer = setTimeout(() => {
            console.warn(`[警告] Electron 启动超过 ${timeoutMs}ms 未退出，强制结束进程`)
            child.kill()
            setTimeout(() => {
                try {
                    child.kill('SIGKILL')
                } catch {
                    /* 已退出 */
                }
                finish({ timedOut: true, exitCode: null })
            }, 2000)
        }, timeoutMs)
        child.on('error', (error) => finish({ error }))
        child.on('exit', (code) => finish({ exitCode: code, timedOut: false }))
    })
}

/** 读取并校验报告 JSON（不存在/结构不合法返回 null） */
function readReport() {
    if (!fs.existsSync(REPORT_PATH)) {
        return null
    }
    try {
        return JSON.parse(fs.readFileSync(REPORT_PATH, 'utf-8'))
    } catch {
        return null
    }
}

/** 从报告取 mark 时间（主进程时间轴） */
function markTime(report, name) {
    const main = report && report.main
    if (!main || !Array.isArray(main.marks)) return null
    const found = main.marks.find((mark) => mark.name === name)
    return found ? Number(found.at) : null
}

/** 从报告取渲染层时间轴 mark */
function rendererMarkTime(report, name) {
    const renderer = report && report.renderer
    if (!renderer || !Array.isArray(renderer.marks)) return null
    const found = renderer.marks.find((mark) => mark.name === name)
    return found ? Number(found.at) : null
}

/** 格式化毫秒（保留 1 位小数） */
function formatMs(value) {
    return value === null || Number.isNaN(value) ? '-' : `${value.toFixed(1)}ms`
}

/** 打印关键指标表 + 参考阈值检查（不阻断） */
function printMetrics(report) {
    const summary = (report && report.summary) || {}
    const rows = [
        ['app-ready（app.whenReady）', 'appReadyMs', 'startup:app-ready'],
        ['window-create（窗口构造）', 'windowCreateMs', 'startup:window-create'],
        ['renderer-ready（渲染层握手）', 'rendererReadyMs', 'startup:renderer-ready'],
        ['main-view-mounted（主界面挂载）', 'mainViewMountedMs', 'startup:main-view-mounted'],
        ['editor-ready（Monaco 就绪）', 'editorReadyMs', 'startup:editor-ready'],
        ['preview-ready（预览首帧）', 'previewReadyMs', 'startup:preview-ready']
    ]
    console.log('')
    console.log('冷启动关键指标（主进程时间轴 / 渲染层时间轴）')
    console.log('------------------------------------------------------------------')
    for (const [label, summaryKey, markName] of rows) {
        const mainValue =
            summary[summaryKey] === undefined ? markTime(report, markName) : summary[summaryKey]
        const rendererValue = rendererMarkTime(report, markName)
        console.log(
            `${label.padEnd(30, ' ')} 主 ${formatMs(mainValue).padStart(10, ' ')}   ` +
                `渲染 ${formatMs(rendererValue).padStart(10, ' ')}`
        )
    }
    const segment = summary.windowToRendererReadyMs
    if (segment !== undefined && segment !== null) {
        console.log('')
        console.log(`段耗时：window-create → renderer-ready = ${formatMs(segment)}`)
    }
    if (
        summary.rendererReadyToPreviewReadyMs !== undefined &&
        summary.rendererReadyToPreviewReadyMs !== null
    ) {
        console.log(
            `段耗时：renderer-ready → preview-ready = ${formatMs(summary.rendererReadyToPreviewReadyMs)}`
        )
    }

    console.log('')
    console.log('参考阈值检查（非 CI 阻断，仅提示）：')
    let exceeded = 0
    for (const threshold of REFERENCE_THRESHOLDS) {
        const value = summary[threshold.key]
        if (value === null || value === undefined) {
            console.log(`  - ${threshold.label}: 未采集到（跳过）`)
            continue
        }
        const passed = value <= threshold.limitMs
        if (!passed) exceeded += 1
        console.log(
            `  ${passed ? '✓' : '!'} ${threshold.label}: ${formatMs(value)}（参考上限 ${threshold.limitMs}ms）`
        )
    }
    if (exceeded > 0) {
        console.log(
            `\n[提示] ${exceeded} 项超出参考阈值（不阻断；请结合机器负载判断，记录在报告中即可）`
        )
    }
}

/* ============================================================================================
 * P4：打包版（electron-builder --dir 解包产物）冷启动基线
 *
 * 与开发构建模式的区别：
 * - 被测对象是 out/build/dist/win-unpacked/BaiZeNotes.exe（真实分发运行时）；
 * - 打包版 Electron 不支持 `-r` 预加载夹具，userData 经 Chromium `--user-data-dir` 重定向；
 * - 额外记录「进程启动 → 窗口可见」：不向应用注入代码，由 PowerShell 子进程用 Win32
 *   EnumWindows/IsWindowVisible 探测主进程 PID 的首个可见窗口（停止计时点）；
 * - 每次采样使用全新 userData，采样间等待并确保旧进程退出（冷启动口径）。
 * ========================================================================================== */

/** Windows PowerShell 可执行文件（窗口可见探测 helper 的运行器；非 Windows 平台不支持本模式） */
const POWERSHELL_EXE =
    typeof process.env.SystemRoot === 'string' && process.env.SystemRoot.length > 0
        ? path.join(
              process.env.SystemRoot,
              'System32',
              'WindowsPowerShell',
              'v1.0',
              'powershell.exe'
          )
        : 'powershell.exe'

/** 采样间等待（毫秒）：等系统从上次退出的 IO/CPU 抖动中恢复，保证冷启动口径一致 */
const PACKAGED_RUN_GAP_MS = 3000

/** 打包版关键指标行（窗口可见/进程总耗时为外部探测；其余取主进程时间轴 summary） */
const PACKAGED_METRIC_ROWS = [
    ['appReadyMs', 'app-ready（主进程）'],
    ['windowCreateMs', 'window-create（窗口构造）'],
    ['rendererReadyMs', 'renderer-ready（渲染层握手）'],
    ['mainViewMountedMs', 'main-view-mounted（主界面挂载）'],
    ['editorReadyMs', 'editor-ready（Monaco 就绪）'],
    ['previewReadyMs', 'preview-ready（预览首帧）'],
    ['windowVisibleMs', '窗口可见（进程启动→首个可见窗口，外部探测）'],
    ['processRuntimeMs', '进程总耗时（进程启动→退出，外部探测）']
]

/** 数值四舍五入到 0.1 ms（报告可读性） */
function roundMsValue(value) {
    return typeof value === 'number' && Number.isFinite(value) ? Math.round(value * 10) / 10 : null
}

/** 安全读取 JSON（不存在/解析失败返回 null） */
function readJsonSafe(file) {
    if (!fs.existsSync(file)) {
        return null
    }
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'))
    } catch {
        return null
    }
}

/** 睡眠（毫秒） */
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

/** 收集机器环境（OS / CPU / 内存 / Electron 版本等；报告可复现性） */
function collectEnvironmentInfo() {
    const cpus = typeof os.cpus === 'function' ? os.cpus() : []
    let appVersion = null
    let electronVersion = null
    try {
        appVersion = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf-8')).version
    } catch {
        /* 忽略 */
    }
    try {
        electronVersion = JSON.parse(
            fs.readFileSync(path.join(ROOT, 'node_modules', 'electron', 'package.json'), 'utf-8')
        ).version
    } catch {
        /* 忽略 */
    }
    return {
        capturedAt: new Date().toISOString(),
        platform: process.platform,
        arch: process.arch,
        osRelease: os.release(),
        osVersion: typeof os.version === 'function' ? os.version() : null,
        cpuModel: cpus.length > 0 ? cpus[0].model : 'unknown',
        cpuCount: cpus.length,
        totalMemMb: Math.round(os.totalmem() / 1048576),
        freeMemMb: Math.round(os.freemem() / 1048576),
        nodeVersion: process.version,
        electronVersion,
        appVersion
    }
}

/** 检测是否已有 BaiZeNotes/electron 进程（避免与其它代理的启动/E2E 并发污染基线） */
function listAppProcessNames() {
    const present = []
    for (const image of ['BaiZeNotes.exe', 'electron.exe']) {
        const result = spawnSync(
            'tasklist',
            ['/FI', `IMAGENAME eq ${image}`, '/FO', 'CSV', '/NH'],
            {
                encoding: 'utf-8',
                windowsHide: true
            }
        )
        const output = typeof result.stdout === 'string' ? result.stdout : ''
        if (output.toLowerCase().includes(image.toLowerCase())) {
            present.push(image)
        }
    }
    return present
}

/** 强杀打包版进程树（仅清理本脚本启动的 BaiZeNotes.exe） */
function killPackagedProcesses() {
    spawnSync('taskkill', ['/IM', 'BaiZeNotes.exe', '/T', '/F'], {
        encoding: 'utf-8',
        windowsHide: true
    })
}

/**
 * 等待无并发应用进程。
 *
 * - BaiZeNotes.exe：视为本脚本上次采样的残留，直接强杀；
 * - electron.exe：视为其它代理/开发者正在运行的开发构建，等它退出（不越权 kill），超时则中止，
 *   避免两个进程同时读写 `~/.baizenotes/config` 导致基线失真。
 */
async function waitForNoConflictingProcesses(timeoutMs) {
    const deadline = Date.now() + timeoutMs
    let warned = false
    while (Date.now() < deadline) {
        const present = listAppProcessNames()
        if (present.length === 0) {
            return
        }
        if (present.includes('BaiZeNotes.exe')) {
            console.warn('[等待] 检测到残留 BaiZeNotes.exe，强制结束进程树后继续…')
            killPackagedProcesses()
        }
        if (present.includes('electron.exe') && !warned) {
            warned = true
            console.warn(
                '[等待] 检测到其它 electron.exe 进程（可能是并行代理/开发构建）；' +
                    '为避免 ~/.baizenotes/config 并发污染，等待其退出（不主动 kill）…'
            )
        }
        await sleep(500)
    }
    const present = listAppProcessNames()
    if (present.length > 0) {
        throw new Error(
            `等待 ${timeoutMs}ms 后仍有进程占用应用配置：${present.join(' / ')}；` +
                '为避免基线失真与配置互相覆盖，已中止（请错峰后重试）'
        )
    }
}

/** 打包版子进程环境：注入诊断开关与输出路径，清除宿主污染变量 */
function buildPackagedChildEnv(perfOutPath) {
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.BAIZE_PERF
    delete env.BAIZE_PERF_OUT
    delete env.BAIZE_E2E_USER_DATA
    return {
        ...env,
        BAIZE_PERF: '1',
        BAIZE_PERF_OUT: perfOutPath,
        ...QUIT_ON_COMPLETE_ENV
    }
}

/**
 * 生成打包版启动探测 helper（纯 ASCII PowerShell 5.1 兼容脚本）。
 *
 * 职责：启动打包版 exe（继承父进程环境变量 + `--user-data-dir` / `--baize-perf`）→
 * 轮询首个可见窗口（Stopwatch 计时，含进程创建到窗口可见）→ 等待应用自动退出
 * （超时强杀）→ 把结果写成 JSON 供 Node 侧读取。
 */
function buildPackagedLaunchHelper() {
    const lines = [
        'param(',
        '  [Parameter(Mandatory=$true)][string]$Exe,',
        '  [Parameter(Mandatory=$true)][string]$UserData,',
        '  [Parameter(Mandatory=$true)][string]$ResultFile,',
        '  [int]$TimeoutMs = 120000',
        ')',
        "$ErrorActionPreference = 'Stop'",
        "Add-Type -TypeDefinition @'",
        'using System;',
        'using System.Runtime.InteropServices;',
        'public static class BaizeWinProbe',
        '{',
        '    private delegate bool EnumWindowsProc(IntPtr hWnd, IntPtr lParam);',
        '    [DllImport("user32.dll")] private static extern bool EnumWindows(EnumWindowsProc lpEnumFunc, IntPtr lParam);',
        '    [DllImport("user32.dll")] private static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);',
        '    [DllImport("user32.dll")] private static extern bool IsWindowVisible(IntPtr hWnd);',
        '    public static int CountVisibleWindows(uint pid)',
        '    {',
        '        int count = 0;',
        '        EnumWindows(delegate(IntPtr hWnd, IntPtr lParam)',
        '        {',
        '            uint owner;',
        '            GetWindowThreadProcessId(hWnd, out owner);',
        '            if (owner == pid && IsWindowVisible(hWnd)) { count++; }',
        '            return true;',
        '        }, IntPtr.Zero);',
        '        return count;',
        '    }',
        '}',
        "'@",
        '$sw = [System.Diagnostics.Stopwatch]::StartNew()',
        "$argLine = '--user-data-dir=\"' + $UserData + '\" --baize-perf'",
        '$exeDir = Split-Path -Path $Exe -Parent',
        '$proc = Start-Process -FilePath $Exe -ArgumentList $argLine -WorkingDirectory $exeDir -PassThru',
        '$spawnReturnedMs = $sw.Elapsed.TotalMilliseconds',
        '$visibleMs = $null',
        'while (-not $proc.HasExited) {',
        '    try { $proc.Refresh() } catch { break }',
        '    $handle = $proc.MainWindowHandle',
        '    $probeCount = 0',
        '    try { $probeCount = [BaizeWinProbe]::CountVisibleWindows([uint32]$proc.Id) } catch { $probeCount = 0 }',
        '    if (($handle -ne [IntPtr]::Zero) -or ($probeCount -gt 0)) { $visibleMs = $sw.Elapsed.TotalMilliseconds; break }',
        '    Start-Sleep -Milliseconds 5',
        '}',
        '$timedOut = $false',
        'if (-not $proc.HasExited) {',
        '    $exited = $proc.WaitForExit($TimeoutMs)',
        '    if (-not $exited) { $timedOut = $true; & taskkill.exe /PID $proc.Id /T /F | Out-Null }',
        '}',
        '$totalMs = $sw.Elapsed.TotalMilliseconds',
        '$exitCode = $null',
        'try { if ($proc.HasExited) { $exitCode = [int]$proc.ExitCode } } catch { $exitCode = $null }',
        'if (-not $proc.HasExited) { & taskkill.exe /PID $proc.Id /T /F | Out-Null }',
        '$result = [ordered]@{',
        '    visibleMs = $(if ($null -eq $visibleMs) { $null } else { [math]::Round($visibleMs, 1) })',
        '    spawnReturnedMs = [math]::Round($spawnReturnedMs, 1)',
        '    processStartToVisibleMs = $(if ($null -eq $visibleMs) { $null } else { [math]::Round($visibleMs - $spawnReturnedMs, 1) })',
        '    totalMs = [math]::Round($totalMs, 1)',
        '    processRuntimeMs = [math]::Round($totalMs - $spawnReturnedMs, 1)',
        '    exitCode = $exitCode',
        '    timedOut = $timedOut',
        "    windowDetection = $(if ($null -eq $visibleMs) { 'timeout' } else { 'user32-enumwindows-or-mainwindowhandle' })",
        '}',
        '$result | ConvertTo-Json -Compress | Set-Content -Path $ResultFile -Encoding ASCII',
        ''
    ]
    return lines.join('\r\n')
}

/**
 * 打包版单次冷启动采样。
 *
 * 前置：调用方已完成 config 沙箱 seed + userData 种子写入。
 * 输出：{ launch, report, helperExitCode, wallMs }，其中 report 为应用自采的 performance 报告。
 */
function launchPackagedOnce(profile, options, runIndex) {
    const perfOutPath = path.join(profile.root, 'perf-report.json')
    const resultFile = path.join(profile.root, 'launch-result.json')
    const helperPath = path.join(profile.root, 'launch-helper.ps1')
    fs.writeFileSync(helperPath, buildPackagedLaunchHelper(), 'utf-8')
    const env = buildPackagedChildEnv(perfOutPath)
    const args = [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        helperPath,
        '-Exe',
        PACKAGED_EXE,
        '-UserData',
        profile.userData,
        '-ResultFile',
        resultFile,
        '-TimeoutMs',
        String(options.timeoutMs)
    ]
    return new Promise((resolve) => {
        const startedAt = Date.now()
        const child = spawn(POWERSHELL_EXE, args, {
            cwd: ROOT,
            env,
            stdio: ['ignore', 'pipe', 'pipe'],
            windowsHide: true
        })
        forwardOutput(child.stdout, '[launch]')
        forwardOutput(child.stderr, '[launch:err]')
        let settled = false
        const finish = (helperExitCode, error) => {
            if (settled) return
            settled = true
            clearTimeout(killTimer)
            const launch = readJsonSafe(resultFile)
            const report = readJsonSafe(perfOutPath)
            if (error) {
                console.error(`[错误] 第 ${runIndex} 次启动 helper 失败：${error.message}`)
            }
            if (launch === null) {
                console.error(
                    `[错误] 第 ${runIndex} 次启动未拿到窗口探测结果（helper 退出码 ${helperExitCode}）`
                )
            }
            if (report === null) {
                console.error(`[错误] 第 ${runIndex} 次启动未拿到 performance 报告`)
            }
            resolve({
                run: runIndex,
                sampledAt: new Date(startedAt).toISOString(),
                wallMs: Date.now() - startedAt,
                helperExitCode,
                launch,
                report
            })
        }
        const killTimer = setTimeout(() => {
            console.warn(
                `[警告] 第 ${runIndex} 次启动超过 ${options.timeoutMs + 60000}ms，强杀 helper`
            )
            try {
                child.kill()
            } catch {
                /* 已退出 */
            }
            finish(null, new Error('helper 超时'))
        }, options.timeoutMs + 60000)
        child.on('error', (error) => finish(null, error))
        child.on('exit', (code) => finish(code, null))
    })
}

/** 从采样中取外部探测值（窗口可见 / 进程总耗时） */
function sampleExternalValue(sample, key) {
    const launch = sample && sample.launch
    if (!launch) return null
    if (key === 'windowVisibleMs') return roundMsValue(launch.processStartToVisibleMs)
    if (key === 'processRuntimeMs') return roundMsValue(launch.processRuntimeMs)
    return null
}

/** 取采样中主进程时间轴的 summary 指标 */
function sampleSummaryValue(sample, key) {
    const summary = sample && sample.report && sample.report.summary
    if (!summary) return null
    return typeof summary[key] === 'number' ? summary[key] : null
}

/** 聚合一组数值：中位数 / 最小值 / 最大值（空数组返回 null） */
function aggregateValues(values) {
    const valid = values.filter((value) => typeof value === 'number' && Number.isFinite(value))
    if (valid.length === 0) {
        return { median: null, min: null, max: null, values: [] }
    }
    const sorted = [...valid].sort((a, b) => a - b)
    const middle = Math.floor(sorted.length / 2)
    const median =
        sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
    return {
        median: roundMsValue(median),
        min: roundMsValue(sorted[0]),
        max: roundMsValue(sorted[sorted.length - 1]),
        values: valid.map((value) => roundMsValue(value))
    }
}

/** 读取开发构建基线报告（用于打包版 vs 开发构建对比；不存在返回 null） */
function readDevBaseline() {
    const report = readJsonSafe(REPORT_PATH)
    if (report === null || report.summary === null || report.summary === undefined) {
        return null
    }
    return {
        path: path.relative(ROOT, REPORT_PATH),
        generatedAt: report.generatedAt ?? null,
        summary: report.summary
    }
}

/** 组装打包版基线报告（3 次样本 + 聚合 + 环境 + 开发构建对比） */
function buildPackagedReport(samples, options, environment) {
    const aggregate = {}
    for (const [key] of PACKAGED_METRIC_ROWS) {
        const values =
            key === 'windowVisibleMs' || key === 'processRuntimeMs'
                ? samples.map((sample) => sampleExternalValue(sample, key))
                : samples.map((sample) => sampleSummaryValue(sample, key))
        aggregate[key] = aggregateValues(values)
    }
    const devBaseline = readDevBaseline()
    const comparisonDevBuild =
        devBaseline === null
            ? null
            : {
                  baselinePath: devBaseline.path,
                  baselineGeneratedAt: devBaseline.generatedAt,
                  note: '开发构建无外部窗口可见探测，仅对比 performance marks 口径指标',
                  metrics: Object.fromEntries(
                      REFERENCE_THRESHOLDS.map(({ key, label }) => {
                          const devValue =
                              typeof devBaseline.summary[key] === 'number'
                                  ? devBaseline.summary[key]
                                  : null
                          const packagedMedian = aggregate[key] ? aggregate[key].median : null
                          return [
                              key,
                              {
                                  label,
                                  devBuildMs: devValue,
                                  packagedMedianMs: packagedMedian,
                                  deltaMs:
                                      devValue === null || packagedMedian === null
                                          ? null
                                          : roundMsValue(packagedMedian - devValue),
                                  ratio:
                                      devValue === null || packagedMedian === null || devValue === 0
                                          ? null
                                          : Math.round((packagedMedian / devValue) * 1000) / 1000
                              }
                          ]
                      })
                  )
              }
    return {
        schemaVersion: 1,
        kind: 'packaged-cold-start',
        generatedAt: new Date().toISOString(),
        enabled: true,
        mode: {
            packaged: true,
            runs: samples.length,
            timeoutMs: options.timeoutMs,
            quitAfterMs: Number(QUIT_ON_COMPLETE_ENV.BAIZE_PERF_QUIT_AFTER_MS)
        },
        method: {
            executable: path.relative(ROOT, PACKAGED_EXE),
            executableBytes: fs.existsSync(PACKAGED_EXE) ? fs.statSync(PACKAGED_EXE).size : null,
            argv: ['--user-data-dir=<新临时目录>', '--baize-perf'],
            env: {
                BAIZE_PERF: '1',
                BAIZE_PERF_QUIT_ON_COMPLETE: QUIT_ON_COMPLETE_ENV.BAIZE_PERF_QUIT_ON_COMPLETE,
                BAIZE_PERF_QUIT_AFTER_MS: QUIT_ON_COMPLETE_ENV.BAIZE_PERF_QUIT_AFTER_MS
            },
            isolation:
                '每次采样独立临时 userData（--user-data-dir）+ ~/.baizenotes/config 备份→清空（最小种子）→恢复',
            betweenRuns: `确认进程退出 + 等待 ${PACKAGED_RUN_GAP_MS}ms + 全新 userData（清理缓存）`,
            windowVisibleTiming:
                'PowerShell + Win32 EnumWindows/IsWindowVisible 探测主进程 PID 首个可见窗口；' +
                '「进程启动→窗口可见」= 探测时刻 - Start-Process 返回时刻（进程创建后偏差为数毫秒）',
            processRuntimeTiming:
                '「进程总耗时」= 同一 Stopwatch 到进程退出（含 preview-ready 后 1s 自动退出延迟）',
            ciBlocking: false
        },
        environment,
        samples,
        aggregate,
        comparisonDevBuild
    }
}

/** 打印单次采样的简要结果（便于实时观察） */
function printPackagedSample(sample) {
    const visible = sampleExternalValue(sample, 'windowVisibleMs')
    const runtime = sampleExternalValue(sample, 'processRuntimeMs')
    const preview = sampleSummaryValue(sample, 'previewReadyMs')
    console.log(
        `[采样 #${sample.run}] 窗口可见 ${formatMs(visible)} / preview-ready ${formatMs(preview)} / ` +
            `进程总耗时 ${formatMs(runtime)} / helper 退出码 ${sample.helperExitCode ?? 'null'}` +
            (sample.launch && sample.launch.timedOut ? '（超时强杀）' : '')
    )
}

/** 打印打包版聚合结果 + 参考阈值（非阻断）+ 开发构建对比 */
function printPackagedSummary(report) {
    console.log('')
    console.log('打包版冷启动结果（中位数 / 最小值 / 最大值，单位 ms）')
    console.log('--------------------------------------------------------------------------')
    for (const [key, label] of PACKAGED_METRIC_ROWS) {
        const entry = report.aggregate[key] || {}
        console.log(
            `${label.padEnd(44, ' ')} ` +
                `中位 ${formatMs(entry.median).padStart(10, ' ')}  ` +
                `最小 ${formatMs(entry.min).padStart(10, ' ')}  ` +
                `最大 ${formatMs(entry.max).padStart(10, ' ')}`
        )
    }
    console.log('')
    console.log('参考阈值检查（非 CI 阻断，仅提示；取中位数）：')
    for (const threshold of REFERENCE_THRESHOLDS) {
        const entry = report.aggregate[threshold.key]
        if (!entry || entry.median === null) {
            console.log(`  - ${threshold.label}: 未采集到（跳过）`)
            continue
        }
        const passed = entry.median <= threshold.limitMs
        console.log(
            `  ${passed ? '✓' : '!'} ${threshold.label}: ${formatMs(entry.median)}（参考上限 ${threshold.limitMs}ms）`
        )
    }
    const comparison = report.comparisonDevBuild
    if (comparison === null) {
        console.log('\n开发构建对比：未找到 out/analysis/perf-baseline.json（跳过）')
        return
    }
    console.log('')
    console.log(
        `开发构建 vs 打包版（打包版中位数 − 开发构建单次值；基线文件 ${comparison.baselinePath}）：`
    )
    for (const metric of Object.values(comparison.metrics)) {
        const delta =
            metric.deltaMs === null
                ? '-'
                : `${metric.deltaMs >= 0 ? '+' : ''}${metric.deltaMs.toFixed(1)}ms`
        const ratio = metric.ratio === null ? '-' : `${metric.ratio.toFixed(2)}x`
        console.log(
            `  ${metric.label.padEnd(28, ' ')} 开发 ${formatMs(metric.devBuildMs).padStart(10, ' ')}  ` +
                `打包 ${formatMs(metric.packagedMedianMs).padStart(10, ' ')}  Δ ${delta.padStart(10, ' ')}  (${ratio})`
        )
    }
}

/** 打包版基线主流程（--packaged） */
async function runPackagedBaseline(options) {
    if (process.platform !== 'win32') {
        console.error('[错误] --packaged 模式当前仅支持 Windows（窗口可见探测依赖 Win32 API）')
        process.exit(1)
    }
    if (!fs.existsSync(PACKAGED_EXE)) {
        console.error(`[错误] 未找到打包版产物：${path.relative(ROOT, PACKAGED_EXE)}`)
        console.error('请先执行一次：npm run build:unpack')
        process.exit(1)
    }
    ensureOutDir()
    console.log('=== 白泽笔记启动性能基线：打包版冷启动（performance marks + 窗口可见）===')
    console.log(`被测可执行文件：${path.relative(ROOT, PACKAGED_EXE)}`)
    console.log(`报告路径：${path.relative(ROOT, PACKAGED_REPORT_PATH)}`)
    console.log(
        `采样次数：${options.runs}（每次全新 userData + 采样间等待 ${PACKAGED_RUN_GAP_MS}ms）`
    )
    console.log(
        '[提示] 运行前请关闭正在使用的 BaiZeNotes 实例；脚本会临时备份/恢复 ~/.baizenotes/config'
    )

    const environment = collectEnvironmentInfo()
    const samples = []
    for (let index = 0; index < options.runs; index += 1) {
        console.log(`\n--- 第 ${index + 1}/${options.runs} 次打包版冷启动 ---`)
        if (index > 0) {
            killPackagedProcesses()
            console.log(`[间隔] 等待 ${PACKAGED_RUN_GAP_MS}ms（清理缓存/等待系统恢复）…`)
            await sleep(PACKAGED_RUN_GAP_MS)
        }
        await waitForNoConflictingProcesses(30000)

        const profile = createTempProfile()
        const sandbox = createConfigSandbox(profile)
        try {
            sandbox.seed()
            seedUserData(profile)
            const sample = await launchPackagedOnce(profile, options, index + 1)
            samples.push(sample)
            printPackagedSample(sample)
        } finally {
            sandbox.restore()
            if (!options.keep) {
                profile.cleanup()
            } else {
                console.log(`[保留] 临时目录：${profile.root}`)
            }
        }
        killPackagedProcesses()
    }

    const report = buildPackagedReport(samples, options, environment)
    writeJson(PACKAGED_REPORT_PATH, report)
    printPackagedSummary(report)

    const withReport = samples.filter(
        (sample) => sample.report !== null && sample.report.summary !== null
    )
    if (withReport.length === 0) {
        console.error('[失败] 所有采样均未生成有效的 performance 报告')
        process.exit(1)
    }
    if (withReport.length < samples.length) {
        console.warn(
            `[警告] ${samples.length - withReport.length} 次采样未拿到有效报告，聚合按有效值计算`
        )
    }
    console.log('')
    console.log(`报告已写入：${PACKAGED_REPORT_PATH}`)
    console.log('[说明] 本脚本不纳入 CI 阻断；参考阈值仅用于人工判断回归。')
}

/** 主流程 */
async function runOnce(options, electronExecutable) {
    const profile = createTempProfile()
    const sandbox = createConfigSandbox(profile)
    let launchResult
    try {
        sandbox.seed()
        seedUserData(profile)
        fs.rmSync(REPORT_PATH, { force: true })
        console.log('[启动] 白泽笔记冷启动（隔离 userData / 诊断模式）…')
        launchResult = await launchOnce(electronExecutable, profile, options.timeoutMs)
        if (launchResult.error) {
            console.error(`[错误] Electron 启动失败：${launchResult.error.message}`)
        } else {
            console.log(
                `[完成] Electron 退出码 ${launchResult.exitCode ?? 'null'}，耗时 ${launchResult.elapsedMs}ms` +
                    (launchResult.timedOut ? '（采集超时，已强杀）' : '')
            )
        }
    } finally {
        sandbox.restore()
        if (!options.keep) {
            profile.cleanup()
        } else {
            console.log(`[保留] 临时目录：${profile.root}`)
        }
    }
    return launchResult
}

async function main() {
    const options = parseArgs(process.argv.slice(2))
    if (options.help) {
        printHelp()
        process.exit(0)
    }
    // P4：打包版模式（默认 3 次冷启动样本；--runs=N 可覆盖）
    if (options.packaged) {
        if (!options.runsExplicit) {
            options.runs = 3
        }
        return runPackagedBaseline(options)
    }
    if (!fs.existsSync(MAIN_ENTRY)) {
        console.error('缺少构建产物：out/build/main/index.js')
        console.error('请先执行：npx electron-vite build')
        process.exit(1)
    }
    ensureOutDir()
    console.log('=== 白泽笔记启动性能基线（performance marks）===')
    console.log(`构建产物：${path.relative(ROOT, MAIN_ENTRY)}`)
    console.log(`报告路径：${path.relative(ROOT, REPORT_PATH)}`)
    console.log(
        '[提示] 运行前请关闭正在使用的 BaiZeNotes 实例（脚本会临时备份/恢复 ~/.baizenotes/config）'
    )

    let electronExecutable
    try {
        electronExecutable = resolveElectronExecutable()
    } catch (error) {
        console.error(`[错误] ${error.message}`)
        process.exit(1)
    }

    const runs = []
    for (let index = 0; index < options.runs; index += 1) {
        if (options.runs > 1) {
            console.log(`\n--- 第 ${index + 1}/${options.runs} 次冷启动 ---`)
        }
        runs.push(await runOnce(options, electronExecutable))
    }

    const report = readReport()
    if (report === null) {
        console.error('[失败] 未生成有效的性能报告（out/analysis/perf-baseline.json）')
        console.error(
            '排查：确认构建产物为最新（npx electron-vite build），并查看上方 [main]* 日志'
        )
        process.exit(1)
    }
    const hasStartupMarks =
        markTime(report, 'startup:app-ready') !== null ||
        markTime(report, 'startup:window-create') !== null
    if (!hasStartupMarks) {
        console.error('[失败] 报告缺少启动阶段标记（app-ready/window-create 均未采集到）')
        process.exit(1)
    }

    printMetrics(report)
    console.log('')
    console.log(`报告已写入：${REPORT_PATH}`)
    console.log(
        `本次共 ${runs.length} 次启动，耗时：` +
            runs.map((run, index) => `#${index + 1}=${run.elapsedMs}ms`).join(' / ')
    )
    console.log('[说明] 本脚本不纳入 CI 阻断；参考阈值仅用于人工判断回归。')
}

main().catch((error) => {
    console.error('[错误] 基线脚本执行失败：', error)
    process.exit(1)
})
