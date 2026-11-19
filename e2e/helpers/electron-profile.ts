/**
 * E2E 共享夹具（P0 E2E 补齐：启动恢复 / 设置保存 / 打包启动）
 *
 * 目标：让所有 E2E 用例都满足「临时用户数据 + 运行后清理」，不污染开发者的真实数据，
 * 同时保证本地与 CI 使用同一套启动方式。
 *
 * ## 路径隔离方案（为什么不是一个 setPath 解决）
 * 产品代码把配置目录固定为 `app.getPath('home')/.baizenotes`，而 Electron 的
 * `app.getPath('home')` 不支持环境变量覆盖；测试侧只有两条路可走：
 * 1. 用 `-r` 预加载夹具在应用主脚本之前 `app.setPath('home', 临时目录)`；
 * 2. 保留真实 home，只把「配置目录」做备份/替换/恢复。
 *
 * 本仓库实测方案 1 **不稳定**：`app.setPath('home')` 在 ready 之前执行时，约 40%~60% 的启动
 * 会偶发 preload 未注入（`window.api` undefined → 欢迎页回退、主界面不加载），属 Electron
 * 内部路径服务时序问题，测试侧无法可靠规避。因此采用组合方案：
 * - `userData`（fileState.json / 渲染层裸 JSON 配置 / 缓存 / 单实例锁）：经 `-r` 夹具
 *   `app.setPath('userData', 临时目录)` 重定向。该操作实测稳定（0/8 失败），且完全避开真实
 *   `%APPDATA%`；
 * - `home/.baizenotes/config`（主进程 systemSetting 等 electron-store 配置）：真实目录，
 *   由 `createConfigSandbox()` 在用例内「备份 → 清空（可写种子）→ finally 恢复」，
 *   测试写入的配置由用例自己隔离并在结束后还原（config 目录仅几 KB）。
 *
 * ## Electron 可执行文件
 * Windows 下统一使用 `node_modules/electron/dist` 的**副本**（out/tmp 下，首次运行复制一次）：
 * 受限沙箱环境（如 DSH 的 Windows 沙箱）中，直接执行 node_modules 内的 electron.exe 会以
 * Low 完整性级别运行，无法写临时目录/创建 GUI 窗口。副本路径让本地与 CI 行为完全一致。
 * 可用 `E2E_ELECTRON_EXECUTABLE` 显式覆盖；非 Windows 平台回退到 Playwright 默认启动方式。
 */
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { _electron as electron } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'

/** 仓库根目录 */
export const ROOT = path.resolve(__dirname, '..', '..')
/** electron-vite 构建产物主进程入口（M7 产物治理：out/build/main） */
export const MAIN_ENTRY = path.join(ROOT, 'out', 'build', 'main', 'index.js')
/** electron-builder --dir 解包产物（打包启动用例使用） */
export const PACKAGED_EXE = path.join(
    ROOT,
    'out',
    'build',
    'dist',
    'win-unpacked',
    'BaiZeNotes.exe'
)
/** 测试专用主进程预加载夹具（重定向 userData 到临时目录） */
export const USER_DATA_FIXTURE = path.join(ROOT, 'e2e', 'fixtures', 'redirect-user-data.cjs')

/** 真实用户配置根目录（产品代码固定为 home/.baizenotes） */
const BAIZE_HOME_DIR = path.join(os.homedir(), '.baizenotes')
/** 真实主进程配置目录（electron-store 文件所在目录，由 ConfigSandbox 备份/恢复） */
const BAIZE_CONFIG_DIR = path.join(BAIZE_HOME_DIR, 'config')

const ELECTRON_DIST_DIR = path.join(ROOT, 'node_modules', 'electron', 'dist')
const RUNTIME_ELECTRON_DIR = path.join(ROOT, 'out', 'tmp', 'e2e-electron-runtime')

/** 临时用户目录集合（每个用例独立一份，finally 中整体删除） */
export interface TempProfile {
    /** 临时根目录（用例自己的 md 工作区等也放这里） */
    root: string
    /** 重定向后的 userData（app.getPath('userData')） */
    userData: string
    /** 删除整个临时目录 */
    cleanup: () => void
}

/** 创建一个临时用户目录集合：root/ 与 userData/ 均为独立空目录 */
export function createTempProfile(prefix = 'baize-e2e-'): TempProfile {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix))
    const userData = path.join(root, 'userData')
    fs.mkdirSync(userData, { recursive: true })
    return {
        root,
        userData,
        cleanup: () => fs.rmSync(root, { recursive: true, force: true })
    }
}

/** 写 JSON 文件（自动创建父目录；测试种子数据用） */
export function writeJson(file: string, data: unknown): void {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8')
}

/**
 * 真实主进程配置目录沙箱：备份 → 清空（写种子）→ 用例结束恢复。
 *
 * 仅操作 `~/.baizenotes/config`（几 KB），不触碰 `backups/` 等大目录；恢复时会把测试期间
 * 新建的 `.baizenotes` 顶层条目（cache/logs 等）一并清理；若测试前 `.baizenotes` 不存在，
 * 则结束后整体删除。
 *
 * 注意：本地运行 E2E 前请先关闭正在运行的 BaiZeNotes 应用，避免两个进程同时使用真实配置目录。
 */
export interface ConfigSandbox {
    /** 真实配置目录路径（清空后可向其中写种子 JSON） */
    configDir: string
    /** 清空真实配置目录，得到确定性初始配置（可重复调用） */
    seed: () => void
    /** 恢复测试前快照（幂等；必须在 finally 中调用） */
    restore: () => void
}

/**
 * 创建真实配置目录沙箱。
 * @param profile 临时用户目录（备份文件存放在 profile.root 内，随 profile.cleanup 一起清理）
 */
export function createConfigSandbox(profile: TempProfile): ConfigSandbox {
    const homeExisted = fs.existsSync(BAIZE_HOME_DIR)
    const homeEntries = homeExisted ? fs.readdirSync(BAIZE_HOME_DIR) : []
    const configExisted = fs.existsSync(BAIZE_CONFIG_DIR)
    const backupDir = path.join(profile.root, 'real-config-backup')
    if (configExisted) {
        fs.cpSync(BAIZE_CONFIG_DIR, backupDir, { recursive: true })
    }

    const seed = (): void => {
        fs.rmSync(BAIZE_CONFIG_DIR, { recursive: true, force: true })
        fs.mkdirSync(BAIZE_CONFIG_DIR, { recursive: true })
    }
    const restore = (): void => {
        // 1) 恢复 config：测试前不存在 → 删除测试期间创建的 config
        fs.rmSync(BAIZE_CONFIG_DIR, { recursive: true, force: true })
        if (configExisted) {
            fs.cpSync(backupDir, BAIZE_CONFIG_DIR, { recursive: true })
        }
        // 2) 清理测试期间新增的 .baizenotes 顶层条目（cache/logs 等）
        if (!homeExisted) {
            fs.rmSync(BAIZE_HOME_DIR, { recursive: true, force: true })
            return
        }
        if (fs.existsSync(BAIZE_HOME_DIR)) {
            for (const entry of fs.readdirSync(BAIZE_HOME_DIR)) {
                if (!homeEntries.includes(entry)) {
                    fs.rmSync(path.join(BAIZE_HOME_DIR, entry), {
                        recursive: true,
                        force: true
                    })
                }
            }
        }
    }
    return { configDir: BAIZE_CONFIG_DIR, seed, restore }
}

/**
 * 预置主进程 store-backed 系统设置（真实配置目录内的 systemSetting.json）。
 *
 * 调用前必须先 `createConfigSandbox(profile).seed()`。
 * 只写需要覆盖的字段：system-setting 的 electron-store 会与默认值合并，
 * 其余字段保持产品默认值；`settingsSchemaVersion: 2` 用于跳过 1.3.6 存量迁移写入。
 */
export function seedSystemSetting(
    sandbox: ConfigSandbox,
    patch: Record<string, unknown> = {}
): void {
    writeJson(path.join(sandbox.configDir, 'systemSetting.json'), {
        ...patch,
        settingsSchemaVersion: 2
    })
}

/**
 * 预置 userData/config 下的「裸 JSON」配置（show-welcome / recent-folders 等）。
 * config-manager 的 CONFIG_DIR 基于 app.getPath('userData')，即本函数的 profile.userData。
 */
export function seedUserDataConfig(profile: TempProfile, name: string, data: unknown): void {
    writeJson(path.join(profile.userData, 'config', `${name}.json`), data)
}

/** 预置启动恢复记录（`userData/fileState.json`，与主进程 file-state-store 同文件同结构） */
export function seedFileState(
    profile: TempProfile,
    state: {
        lastOpenedFile?: string | null
        lastOpenedDirectory?: string | null
        recentFiles?: string[]
    }
): void {
    writeJson(path.join(profile.userData, 'fileState.json'), {
        lastOpenedFile: state.lastOpenedFile ?? null,
        lastOpenedDirectory: state.lastOpenedDirectory ?? null,
        recentFiles: state.recentFiles ?? []
    })
}

/**
 * 解析 E2E 使用的 Electron 可执行文件（见文件头部设计说明）。
 * @returns Windows 下为 out/tmp 副本路径；非 Windows 或缺少 electron 包时返回 undefined，
 *          此时回退到 Playwright 默认启动方式（node_modules/electron + loader 注入）。
 */
export function resolveElectronExecutable(): string | undefined {
    const override = process.env.E2E_ELECTRON_EXECUTABLE
    if (override) {
        return fs.existsSync(override) ? override : undefined
    }
    if (process.platform !== 'win32') {
        return undefined
    }
    const source = path.join(ELECTRON_DIST_DIR, 'electron.exe')
    if (!fs.existsSync(source)) {
        return undefined
    }
    const target = path.join(RUNTIME_ELECTRON_DIR, 'electron.exe')
    const needCopy =
        !fs.existsSync(target) ||
        fs.statSync(target).size !== fs.statSync(source).size ||
        fs.statSync(target).mtimeMs < fs.statSync(source).mtimeMs
    if (needCopy) {
        fs.rmSync(RUNTIME_ELECTRON_DIR, { recursive: true, force: true })
        fs.mkdirSync(path.dirname(RUNTIME_ELECTRON_DIR), { recursive: true })
        fs.cpSync(ELECTRON_DIST_DIR, RUNTIME_ELECTRON_DIR, { recursive: true })
    }
    return target
}

/** 去除继承自宿主/沙箱的环境变量，避免 Electron 以纯 Node 模式启动 */
function buildChildEnv(extra: Record<string, string>): Record<string, string> {
    const env = { ...process.env } as Record<string, string>
    delete env.ELECTRON_RUN_AS_NODE
    return { ...env, ...extra }
}

/** E2E 启动选项（仅暴露常用项，其余沿用默认） */
export interface LaunchAppOptions {
    /** 启动总超时（毫秒），默认 60s */
    timeout?: number
}

/**
 * 启动开发构建（out/build/main/index.js）：userData 重定向到临时目录。
 *
 * 夹具经 `-r` 在 Electron 主进程启动早期执行，早于应用主脚本读取 userData 派生路径，
 * 因此 fileState.json / userData/config 下的裸 JSON 种子文件均落在临时目录。
 * home（`~/.baizenotes/config`）不重定向，由调用方的 ConfigSandbox 负责备份/恢复。
 */
export function launchDevApp(
    profile: TempProfile,
    options: LaunchAppOptions = {}
): Promise<ElectronApplication> {
    return electron.launch({
        executablePath: resolveElectronExecutable(),
        args: ['-r', USER_DATA_FIXTURE, MAIN_ENTRY],
        env: buildChildEnv({ BAIZE_E2E_USER_DATA: profile.userData }),
        timeout: options.timeout ?? 60_000
    })
}

/**
 * 启动打包产物（out/build/dist/win-unpacked/BaiZeNotes.exe）。
 *
 * 打包版 Electron 不支持 `-r` 预加载注入（实测被忽略），因此：
 * - Electron userData 走 `--user-data-dir=<临时目录>`；
 * - `~/.baizenotes/config` 同样由调用方的 ConfigSandbox 备份/恢复。
 */
export function launchPackagedApp(
    userDataDir: string,
    options: LaunchAppOptions = {}
): Promise<ElectronApplication> {
    return electron.launch({
        executablePath: PACKAGED_EXE,
        args: [`--user-data-dir=${userDataDir}`],
        env: buildChildEnv({}),
        timeout: options.timeout ?? 120_000
    })
}

/* ============================================================================================
 * 渲染进程就绪等待（E2E 稳定性：消除「preload 偶发未注入 / 页面尚未导航」导致的随机失败）
 *
 * 背景：`--repeat-each=3` 下 settings/smoke 偶发失败，历史现象是渲染层 `window.electron` /
 * `window.api` 读不到（页面仍是 about:blank 或 preload 尚未完成注入）时用例已开始操作。
 * Electron `_electron.launch()` 返回的窗口在 app 启动早期即可拿到，`firstWindow()` +
 * `domcontentloaded` 并不能保证「页面已导航到应用入口 + preload contextBridge 已注入 +
 * 渲染层已挂载」——固定 sleep 既慢又不可靠。
 *
 * 因此统一用 Playwright 的**条件轮询**（waitForFunction / waitForURL，自动重试、无固定 sleep）
 * 等待以下四层就绪信号，全部满足后再让用例操作界面：
 *   1. 页面已从 about:blank 导航到应用入口（file: 协议，开发构建与 asar 打包产物一致）；
 *   2. preload 单文件已执行且 contextBridge 注入完整（window.electron.ipcRenderer 的
 *      on/send/invoke + window.api.config.read/write + window.api.app.getVersion）；
 *   3. IPC 真实往返可用（window.api.app.getVersion() 能拿到主进程返回的版本字段），
 *      证明 preload 桥与主进程 handler 都已就绪，而不仅是对象存在；
 *   4. Vue 根节点已挂载（#app-root 有子节点——App.vue 渲染完成，onMounted 的监听器注册
 *      与 IPC.RENDER.READY 握手随之发生）。
 *
 * 失败时抛出带页面快照的异常（URL + 各桥函数是否存在），便于定位是「preload 未注入」
 * 还是「页面未导航/渲染崩溃」，而不是让后续断言报无关的 selector 超时。
 * ========================================================================================== */

/** 页面 preload contextBridge 注入快照（失败诊断与就绪判定共用） */
export interface RendererBridgeSnapshot {
    /** 当前页面 URL（应为应用入口 file: URL，而非 about:blank） */
    url: string
    hasElectron: boolean
    hasIpcRenderer: boolean
    hasIpcRendererOn: boolean
    hasIpcRendererSend: boolean
    hasIpcRendererInvoke: boolean
    hasApi: boolean
    hasApiConfigRead: boolean
    hasApiConfigWrite: boolean
    hasApiGetVersion: boolean
}

/** 读取当前页面 preload 桥注入快照（页面不可读时不抛异常，返回 url 供诊断） */
export async function readRendererBridgeSnapshot(page: Page): Promise<RendererBridgeSnapshot> {
    return page.evaluate(() => {
        const bridge = window as unknown as {
            electron?: { ipcRenderer?: Record<string, unknown> }
            api?: { config?: Record<string, unknown>; app?: Record<string, unknown> }
        }
        const ipc = bridge.electron?.ipcRenderer
        const api = bridge.api
        return {
            url: window.location.href,
            hasElectron: typeof bridge.electron === 'object' && bridge.electron !== null,
            hasIpcRenderer: typeof ipc === 'object' && ipc !== null,
            hasIpcRendererOn: typeof ipc?.on === 'function',
            hasIpcRendererSend: typeof ipc?.send === 'function',
            hasIpcRendererInvoke: typeof ipc?.invoke === 'function',
            hasApi: typeof api === 'object' && api !== null,
            hasApiConfigRead: typeof api?.config?.read === 'function',
            hasApiConfigWrite: typeof api?.config?.write === 'function',
            hasApiGetVersion: typeof api?.app?.getVersion === 'function'
        }
    })
}

/**
 * 等待 preload contextBridge 注入完成（条件轮询，无固定 sleep）。
 *
 * 与 e2e/smoke.spec.ts 的桥断言同口径：只检查 preload 产物契约要求的函数存在，
 * 不依赖页面业务 UI，因此可用于欢迎页/主界面/打包版等所有启动路径。
 */
export async function waitForPreloadBridge(page: Page, timeout = 30_000): Promise<void> {
    await page.waitForFunction(
        () => {
            const bridge = window as unknown as {
                electron?: { ipcRenderer?: Record<string, unknown> }
                api?: { config?: Record<string, unknown>; app?: Record<string, unknown> }
            }
            const ipc = bridge.electron?.ipcRenderer
            const api = bridge.api
            return (
                typeof ipc?.on === 'function' &&
                typeof ipc?.send === 'function' &&
                typeof ipc?.invoke === 'function' &&
                typeof api?.config?.read === 'function' &&
                typeof api?.config?.write === 'function' &&
                typeof api?.app?.getVersion === 'function'
            )
        },
        undefined,
        { timeout }
    )
}

/**
 * 等待应用入口页面 + preload 桥 + IPC 往返 + Vue 根节点全部就绪。
 *
 * 使用方：所有 E2E spec 在拿到 firstWindow() 后应先 await 本函数，再进行任何界面操作
 * （点击菜单、读取 DOM、page.evaluate 调用 window.api 等），避免固定 sleep 与竞态。
 * 任何一步超时都会抛出含页面快照的错误，直接暴露「preload 未注入 / 页面未加载」根因。
 */
export async function waitForRendererReady(
    page: Page,
    options: { timeout?: number } = {}
): Promise<void> {
    const timeout = options.timeout ?? 30_000
    try {
        // 1) 已从初始 about:blank 导航到应用入口（开发构建与 asar 打包产物均为 file:）
        await page.waitForURL((url) => url.protocol === 'file:', { timeout })
        await page.waitForLoadState('domcontentloaded')
        // 2) preload contextBridge 注入完成
        await waitForPreloadBridge(page, timeout)
        // 3) IPC 真实往返（桥 + 主进程 handler 均可用，而非仅有对象）
        await page.waitForFunction(
            async () => {
                try {
                    const api = (
                        window as unknown as {
                            api?: { app?: { getVersion?: () => Promise<unknown> } }
                        }
                    ).api
                    const version = (await api?.app?.getVersion?.()) as
                        { electronVersion?: unknown } | undefined
                    return typeof version?.electronVersion === 'string'
                } catch {
                    return false
                }
            },
            undefined,
            { timeout }
        )
        // 4) Vue 根节点已挂载（App.vue 渲染完成，onMounted 的监听器与 RENDER.READY 握手就绪）
        await page.waitForFunction(
            () => {
                const root = document.getElementById('app-root')
                return root !== null && root.childElementCount > 0
            },
            undefined,
            { timeout }
        )
    } catch (error) {
        const snapshot = await readRendererBridgeSnapshot(page).catch(() => null)
        throw new Error(
            `渲染进程未就绪（${timeout}ms 内等待 preload 注入 / renderer ready 失败）：` +
                (snapshot
                    ? JSON.stringify(snapshot)
                    : '页面状态不可读（可能尚未导航或渲染进程已崩溃）'),
            { cause: error }
        )
    }
}

/** 开发构建启动结果（统一完成「窗口 + preload/渲染就绪」等待） */
export interface LaunchedDevApp {
    app: ElectronApplication
    page: Page
    /** 启动就绪前收集到的渲染层未捕获异常（供用例断言「无异常」） */
    pageErrors: string[]
    /** 实际启动次数（1 = 首次即就绪；>1 = 发生过 preload 注入态的重试，供报告统计偶发率） */
    launchAttempts: number
    /** 失败尝试的诊断信息（重试成功时也保留，不允许「静默吞掉」失败数据） */
    launchFailures: string[]
}

/** launchDevAppWithRenderer 的启动/就绪选项 */
export interface LaunchDevAppWithRendererOptions extends LaunchAppOptions {
    /**
     * 单次启动的就绪等待超时（默认 25s）。
     * 正常启动 <1s 即就绪；超过该值基本可判定 preload 未注入（而非机器慢），
     * 因此无需像旧实现那样一次等 60s，缩短重试成本。
     */
    readyTimeout?: number
    /**
     * 最多启动尝试次数（默认 3 = 首次 + 2 次重试）。
     *
     * 实测（--repeat-each=3 环境）存在约 20% 的「窗口已显示、欢迎页已渲染但
     * window.electron/window.api 始终未注入」随机失败：这是 Electron 主进程启动期
     * preload 加载偶发失败（页面侧 catch 后回退渲染欢迎页，因此截图看似正常），
     * 与产品逻辑无关、重开进程即可恢复；重试次数与失败摘要都会记录进报告，
     * 不做静默假绿（确定性 preload 缺陷会 3 次全失败并抛错）。
     */
    maxLaunchAttempts?: number
}

/**
 * 启动开发构建并等待渲染进程就绪（各 spec 的统一入口）。
 *
 * 与 launchDevApp 的区别：
 * 1. 返回前完成 waitForRendererReady，并提前挂上 pageerror / console 监听，
 *    保证启动阶段的未捕获异常也能被用例捕获（而不是挂监听前就丢失）；
 * 2. 就绪失败时收集主进程 stdout/stderr 尾部 + 渲染层异常作为诊断，然后关闭实例重试；
 * 3. 正常启动不会重试（首次就绪即返回），重试只针对「preload 始终未注入」的随机启动失败。
 */
export async function launchDevAppWithRenderer(
    profile: TempProfile,
    options: LaunchDevAppWithRendererOptions = {}
): Promise<LaunchedDevApp> {
    const maxAttempts = Math.max(1, options.maxLaunchAttempts ?? 3)
    const readyTimeout = options.readyTimeout ?? 25_000
    const launchFailures: string[] = []

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const app = await launchDevApp(profile, options)
        // 主进程日志只在失败诊断时使用；提前挂监听避免错过 preload 加载错误输出
        const processLogs: string[] = []
        const childProcess = app.process()
        childProcess.stdout?.on('data', (chunk: unknown) =>
            processLogs.push(`[stdout] ${String(chunk)}`)
        )
        childProcess.stderr?.on('data', (chunk: unknown) =>
            processLogs.push(`[stderr] ${String(chunk)}`)
        )

        try {
            const page = await app.firstWindow()
            const pageErrors: string[] = []
            const consoleErrors: string[] = []
            page.on('pageerror', (error) => pageErrors.push(String(error)))
            page.on('console', (message) => {
                if (message.type() === 'error') {
                    consoleErrors.push(message.text())
                }
            })
            try {
                await waitForRendererReady(page, { timeout: readyTimeout })
                return {
                    app,
                    page,
                    pageErrors,
                    launchAttempts: attempt,
                    launchFailures
                }
            } catch (error) {
                const sections = [
                    `第 ${attempt}/${maxAttempts} 次启动未就绪：${
                        error instanceof Error ? error.message : String(error)
                    }`
                ]
                if (pageErrors.length > 0) {
                    sections.push(`渲染层未捕获异常：${pageErrors.join(' | ')}`)
                }
                if (consoleErrors.length > 0) {
                    sections.push(`渲染层控制台错误：${consoleErrors.slice(-5).join(' | ')}`)
                }
                if (processLogs.length > 0) {
                    sections.push(`主进程日志尾部：${processLogs.join('').slice(-2000)}`)
                }
                launchFailures.push(sections.join('\n'))
            }
        } catch (error) {
            launchFailures.push(
                `第 ${attempt}/${maxAttempts} 次启动失败（firstWindow 未返回）：${
                    error instanceof Error ? error.message : String(error)
                }`
            )
        }

        // 失败实例必须关闭，避免残留 Electron 进程影响下一次尝试/后续 repeat-each 轮次
        await app.close().catch(() => undefined)
        if (attempt < maxAttempts) {
            // 启动失败后短暂退避（非就绪等待；重试本身由上面的条件等待驱动）
            console.warn(
                `[e2e] 渲染进程未就绪（第 ${attempt}/${maxAttempts} 次启动），重新启动应用实例`
            )
            await new Promise((resolve) => setTimeout(resolve, 300))
        }
    }

    throw new Error(
        `应用启动 ${maxAttempts} 次仍未渲染就绪（preload 注入失败，非用例断言失败）：\n` +
            launchFailures.join('\n')
    )
}
