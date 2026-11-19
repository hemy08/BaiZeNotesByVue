#!/usr/bin/env node
/**
 * 白泽笔记启动性能基线脚本（P1 性能基线化）。
 *
 * 作用：真实启动一次 Electron 开发构建（out/build/main/index.js），采集主进程与渲染层的
 * `performance.mark/measure`，输出 `out/analysis/perf-baseline.json` 并打印关键指标。
 *
 * 设计约定（对应 P1 任务）：
 * - **不纳入 CI 阻断**：脚本只做基线记录与「参考阈值」提示，指标超阈值不改变退出码；
 *   只有「没拿到报告 / 报告结构不合法」这类执行失败才返回非 0；
 * - 默认只跑一次冷启动（可用 `--runs=N` 覆盖，但一般保持 1 次）；
 * - 运行完全隔离：userData 经 `-r` 夹具重定向到系统临时目录；真实 `~/.baizenotes/config`
 *   由本脚本「备份 → 清空（写最小种子）→ 恢复」，不污染开发机配置；
 * - Windows 下复用 E2E 的 Electron 运行时副本（out/tmp/e2e-electron-runtime），
 *   避免受限沙箱环境中直接运行 node_modules/electron 的完整性问题。
 *
 * 用法：
 *   node build/perf-baseline.js                 # 跑 1 次冷启动并输出报告
 *   node build/perf-baseline.js --help          # 查看参数
 *   node build/perf-baseline.js --timeout-ms=90000 --keep
 *
 * 前置：先构建开发产物 `npx electron-vite build`（或 npm run build:unpack）。
 */
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawn } = require('child_process')

const ROOT = path.resolve(__dirname, '..')
const MAIN_ENTRY = path.join(ROOT, 'out', 'build', 'main', 'index.js')
const OUT_DIR = path.join(ROOT, 'out', 'analysis')
const REPORT_PATH = path.join(OUT_DIR, 'perf-baseline.json')
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
    const options = { keep: false, help: false, runs: 1, timeoutMs: 120000 }
    for (const arg of argv) {
        if (arg === '--help' || arg === '-h') {
            options.help = true
        } else if (arg === '--keep') {
            options.keep = true
        } else if (arg.startsWith('--runs=')) {
            options.runs = Math.max(1, Number(arg.slice('--runs='.length)) || 1)
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

选项：
  --runs=N          冷启动次数（默认 1；>1 时报告取最后一次并打印每次总耗时）
  --timeout-ms=N    单次启动超时（默认 120000）
  --keep            保留临时 userData 目录（默认运行后删除）
  -h, --help        显示本帮助

产物：
  out/analysis/perf-baseline.json   mark/measure + 冷启动关键指标 + 参考阈值检查

前置：npx electron-vite build（脚本会检查 out/build/main/index.js 是否存在）`)
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

/** 主流程 */
async function runOnce(options, electronExecutable) {
    const profile = createTempProfile()
    const sandbox = createConfigSandbox(profile)
    let launchResult = null
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
