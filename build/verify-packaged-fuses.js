/**
 * 打包产物 Fuses 校验 + 硬化启动冒烟（P3-4 余项评估落地配套）
 *
 * 两个职责（同一次运行完成，均为发布产物口径）：
 * 1. **fuse 位校验**：读取 `out/build/dist/win-unpacked/BaiZeNotes.exe` 的实际 fuse 线，
 *    与 build/electron-fuses-matrix.js 的 RELEASE_FUSE_MATRIX 逐项比对——防止
 *    「electron-builder.yml 写了但构建未生效」以及后续误改配置；
 * 2. **硬化启动冒烟**：以 `BAIZE_PERF` 诊断模式直接启动打包版 exe（不依赖
 *    `--inspect`，因此可在 enableNodeCliInspectArguments:false 的发布产物上运行），
 *    轮询主进程诊断报告直到出现 `summary.rendererReadyMs`，证明「主进程启动 →
 *    创建窗口 → 渲染层握手」真实完成；随后清理进程与临时目录。
 *
 * 为什么需要本脚本：发布配置禁用 `enableNodeCliInspectArguments` 后，Playwright
 * `_electron.launch`（依赖 `--inspect=0` 连接主进程）无法用于发布产物；E2E 改用
 * `npm run build:unpack:e2e`（发布矩阵 + 仅 inspect 例外）。本脚本在**翻转例外之前**
 * 对真实发布口径产物做 fuse 断言 + 无调试器启动验证，保证硬化不牺牲可启动性。
 *
 * 2026-11-20（renderer file:// → app:// 迁移）：发布矩阵第 8 位
 * `grantFileProtocolExtraPrivileges` 已关闭，renderer 由 app:// 自定义协议加载
 * （src/main/protocol/app-protocol.ts）。启动冒烟轮询到 `rendererReadyMs` 即证明
 * 「app:// 协议注册 → 窗口加载 app://baize/index.html → 渲染层挂载握手」全链路可用；
 * 打包产物的协议安全边界与功能链路由 E2E（packaged-launch / app-protocol）覆盖。
 *
 * 用法：
 *   node build/verify-packaged-fuses.js                 # 断言 + 启动冒烟
 *   node build/verify-packaged-fuses.js --no-launch     # 仅断言 fuse 位（无需桌面环境）
 *   node build/verify-packaged-fuses.js --app <exe路径> # 指定其他打包产物
 */
const { spawn, spawnSync } = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const { RELEASE_FUSE_MATRIX, readFuseStates, diffFuseStates } = require('./electron-fuses-matrix')

const ROOT = path.resolve(__dirname, '..')
const DEFAULT_APP = path.join(ROOT, 'out', 'build', 'dist', 'win-unpacked', 'BaiZeNotes.exe')
/** 启动冒烟默认超时：冷启动通常 < 5s，CI 冷机留足余量 */
const DEFAULT_TIMEOUT_MS = 45_000
/** 轮询诊断报告间隔 */
const POLL_INTERVAL_MS = 200

/** 真实用户主目录下的应用配置（与 E2E helper 同口径：备份 → 清空 → 恢复） */
const BAIZE_HOME_DIR = path.join(os.homedir(), '.baizenotes')
const BAIZE_CONFIG_DIR = path.join(BAIZE_HOME_DIR, 'config')

function log(...args) {
    console.log('[verify-fuses]', ...args)
}

function fail(message) {
    console.error(`[verify-fuses] ✗ ${message}`)
    process.exitCode = 1
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms))
}

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

/** 解析命令行参数（仅支持本脚本用到的简单形式） */
function parseArgs(argv) {
    const options = { app: DEFAULT_APP, launch: true, timeoutMs: DEFAULT_TIMEOUT_MS }
    for (const arg of argv) {
        if (arg === '--no-launch') {
            options.launch = false
        } else if (arg.startsWith('--app=')) {
            options.app = path.resolve(ROOT, arg.slice('--app='.length))
        } else if (arg.startsWith('--timeout-ms=')) {
            const value = Number(arg.slice('--timeout-ms='.length))
            if (!Number.isFinite(value) || value <= 0) {
                throw new Error(`--timeout-ms 需要正整数，收到：${arg}`)
            }
            options.timeoutMs = value
        } else {
            throw new Error(`未知参数：${arg}（支持 --no-launch / --app= / --timeout-ms=）`)
        }
    }
    return options
}

/** 打印 fuse 矩阵对比表 */
function printFuseTable(actual) {
    const rows = Object.keys(RELEASE_FUSE_MATRIX).map((key) => {
        const match = actual[key] === RELEASE_FUSE_MATRIX[key] ? '✓' : '✗'
        const expect = RELEASE_FUSE_MATRIX[key] ? '启用' : '禁用'
        const real = actual[key] ? '启用' : '禁用'
        return `  ${match} ${key.padEnd(38)} 期望=${expect} 实际=${real}`
    })
    console.log(rows.join('\n'))
}

/** 用户主目录配置沙箱：备份 → 清空 → 恢复（避免冒烟启动污染开发者真实配置） */
function createConfigSandbox(tmpRoot) {
    const homeExisted = fs.existsSync(BAIZE_HOME_DIR)
    const homeEntries = homeExisted ? fs.readdirSync(BAIZE_HOME_DIR) : []
    const configExisted = fs.existsSync(BAIZE_CONFIG_DIR)
    const backupDir = path.join(tmpRoot, 'real-config-backup')
    if (configExisted) {
        fs.cpSync(BAIZE_CONFIG_DIR, backupDir, { recursive: true })
    }
    fs.rmSync(BAIZE_CONFIG_DIR, { recursive: true, force: true })
    fs.mkdirSync(BAIZE_CONFIG_DIR, { recursive: true })
    return () => {
        fs.rmSync(BAIZE_CONFIG_DIR, { recursive: true, force: true })
        if (configExisted) {
            fs.cpSync(backupDir, BAIZE_CONFIG_DIR, { recursive: true })
        }
        if (!homeExisted) {
            fs.rmSync(BAIZE_HOME_DIR, { recursive: true, force: true })
            return
        }
        if (!fs.existsSync(BAIZE_HOME_DIR)) {
            return
        }
        for (const entry of fs.readdirSync(BAIZE_HOME_DIR)) {
            if (!homeEntries.includes(entry)) {
                fs.rmSync(path.join(BAIZE_HOME_DIR, entry), { recursive: true, force: true })
            }
        }
    }
}

/** 删除目录（Windows 下句柄释放偶有延迟，重试后告警，不覆盖主流程结果） */
function removeDirWithRetry(dir) {
    for (let attempt = 1; attempt <= 10; attempt++) {
        try {
            fs.rmSync(dir, { recursive: true, force: true })
            return
        } catch (error) {
            if (attempt === 10) {
                console.warn(`[verify-fuses] 临时目录清理失败（已忽略）：${dir}`, error)
                return
            }
            Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200)
        }
    }
}

/** 强杀打包版进程树（仅本脚本启动的那一棵） */
function killProcessTree(child) {
    if (child === null || child.exitCode !== null || child.killed) {
        return
    }
    if (process.platform === 'win32') {
        spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    } else {
        child.kill('SIGKILL')
    }
}

/**
 * 硬化启动冒烟：启动打包版 exe，等待诊断报告出现 rendererReadyMs。
 * @param {string} appPath 打包产物 exe
 * @param {number} timeoutMs 超时
 */
async function verifyHardenedLaunch(appPath, timeoutMs) {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-verify-fuses-'))
    const userDataDir = path.join(tmpRoot, 'userData')
    const reportPath = path.join(tmpRoot, 'perf-report.json')
    fs.mkdirSync(userDataDir, { recursive: true })
    const restoreConfig = createConfigSandbox(tmpRoot)

    // 打包版日志目录（exe 同级 log/）：快照后清理本次新增文件
    const logDir = path.join(path.dirname(appPath), 'log')
    const logExisted = fs.existsSync(logDir)
    const logEntries = logExisted ? fs.readdirSync(logDir) : []

    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    delete env.NODE_OPTIONS
    const child = spawn(appPath, [`--user-data-dir=${userDataDir}`], {
        env: {
            ...env,
            BAIZE_PERF: '1',
            BAIZE_PERF_OUT: reportPath,
            // 兜底：即使渲染层未上报 preview-ready，也让进程在超时后自行退出，避免残留
            BAIZE_PERF_QUIT_AFTER_MS: String(timeoutMs)
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
    })
    const stderrTail = []
    child.stderr.on('data', (chunk) => {
        stderrTail.push(String(chunk))
        if (stderrTail.length > 40) {
            stderrTail.shift()
        }
    })
    let exited = false
    let exitCode = null
    child.on('exit', (code) => {
        exited = true
        exitCode = code
    })

    const deadline = Date.now() + timeoutMs
    let report = null
    try {
        while (Date.now() < deadline) {
            report = readJsonSafe(reportPath)
            const readyMs = report?.summary?.rendererReadyMs
            if (typeof readyMs === 'number' && Number.isFinite(readyMs)) {
                break
            }
            if (exited) {
                throw new Error(
                    `启动进程提前退出（exit=${String(exitCode)}）且未写出 rendererReady 指标：\n` +
                        stderrTail.join('').slice(-2000)
                )
            }
            await sleep(POLL_INTERVAL_MS)
        }
        if (typeof report?.summary?.rendererReadyMs !== 'number') {
            throw new Error(
                `${timeoutMs}ms 内未取得 rendererReady 指标（渲染层未就绪）：\n` +
                    stderrTail.join('').slice(-2000)
            )
        }
        const summary = report.summary
        log('✓ 硬化启动冒烟通过（无 --inspect）：')
        log(
            `  appReady=${String(summary.appReadyMs)}ms windowCreate=${String(
                summary.windowCreateMs
            )}ms rendererReady=${String(summary.rendererReadyMs)}ms`
        )
    } finally {
        killProcessTree(child)
        await new Promise((resolve) => {
            if (child.exitCode !== null) {
                resolve()
                return
            }
            const timer = setTimeout(resolve, 5000)
            child.once('exit', () => {
                clearTimeout(timer)
                resolve()
            })
        })
        restoreConfig()
        if (logExisted && fs.existsSync(logDir)) {
            for (const entry of fs.readdirSync(logDir)) {
                if (!logEntries.includes(entry)) {
                    fs.rmSync(path.join(logDir, entry), { recursive: true, force: true })
                }
            }
        } else if (!logExisted) {
            fs.rmSync(logDir, { recursive: true, force: true })
        }
        removeDirWithRetry(tmpRoot)
    }
}

async function main() {
    const options = parseArgs(process.argv.slice(2))
    if (!fs.existsSync(options.app)) {
        throw new Error(`打包产物不存在：${options.app}（请先执行 npm run build:unpack）`)
    }
    log(`app = ${path.relative(ROOT, options.app)}`)
    const actual = await readFuseStates(options.app)
    printFuseTable(actual)
    const diffs = diffFuseStates(actual, RELEASE_FUSE_MATRIX)
    if (diffs.length > 0) {
        throw new Error(
            `发布 fuse 矩阵不一致（${diffs.length} 项）：` +
                diffs
                    .map(
                        (item) =>
                            `${item.key} 期望=${String(item.expected)} 实际=${String(item.actual)}`
                    )
                    .join('；')
        )
    }
    log('✓ fuse 位与发布矩阵一致')
    if (!options.launch) {
        log('已跳过启动冒烟（--no-launch）')
        return
    }
    await verifyHardenedLaunch(options.app, options.timeoutMs)
}

main().catch((error) => {
    fail(error instanceof Error ? error.message : String(error))
})
