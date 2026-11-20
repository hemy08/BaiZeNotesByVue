/**
 * src/main/index.ts 单元测试（注册流程）
 * 覆盖：whenReady 后初始化（用户目录/config IPC/AppUserModelId）、
 * 窗口创建参数与 preload/loadFile、ELECTRON_RENDERER_URL 分支、
 * ready-to-show 初始化流程、自动保存定时器启动、update-theme 广播、
 * window-open-handler 拦截、P0 安全的主窗口 will-navigate/will-redirect 导航边界、
 * close 前 flush 协议（脏保存/幂等）、
 * before-quit 清理、window-all-closed 清理、activate 重建窗口不重复注册 IPC
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as path from 'path'
import { pathToFileURL } from 'url'

// CMP-30：主进程入口窗口标题等文案经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

const electronMocks = vi.hoisted(() => {
    const appHandlers: Record<string, Array<(...args: never[]) => void>> = {}
    const winHandlers: Record<string, Array<(...args: never[]) => void>> = {}
    // P0 安全：webContents.on（will-navigate / will-redirect）注册记录
    const webContentHandlers: Record<string, Array<(...args: never[]) => void>> = {}
    const ipcOnMap = new Map<string, Array<(...args: never[]) => void>>()
    const state = {
        // 「记住窗口位置和大小」：screen.getAllDisplays 返回的显示器工作区
        screenDisplays: [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }],
        // 批次 B #4：appState 退出标志（before-quit 置位后 close 不再被托盘拦截）
        quitFlag: { value: false },
        // P2-10：单实例锁申请结果（requestSingleInstanceLock 返回值）
        lockFlag: { value: true }
    }
    const win = {
        on: vi.fn((event: string, handler: (...args: never[]) => void) => {
            const arr = winHandlers[event] ?? []
            arr.push(handler)
            winHandlers[event] = arr
        }),
        // 批次 A：窗口边界持久化监听的移除（dispose 挂入 cleanupApp）
        removeListener: vi.fn(),
        show: vi.fn(),
        // 批次 B #4：托盘隐藏分支（minimizeToTray 开启时 close → hide）
        hide: vi.fn(),
        close: vi.fn(),
        isDestroyed: vi.fn(() => false),
        destroy: vi.fn(),
        // 批次 A：窗口边界写回需要的几何 API
        getBounds: vi.fn(() => ({ x: 40, y: 30, width: 1024, height: 768 })),
        isMaximized: vi.fn(() => false),
        isMinimized: vi.fn(() => false),
        isFullScreen: vi.fn(() => false),
        webContents: {
            send: vi.fn(),
            insertCSS: vi.fn(),
            on: vi.fn((event: string, handler: (...args: never[]) => void) => {
                const arr = webContentHandlers[event] ?? []
                arr.push(handler)
                webContentHandlers[event] = arr
            }),
            setWindowOpenHandler: vi.fn(),
            isDestroyed: vi.fn(() => false)
        },
        loadURL: vi.fn(),
        loadFile: vi.fn()
    }
    return {
        win,
        appHandlers,
        winHandlers,
        webContentHandlers,
        ipcOnMap,
        windows: [] as never[],
        capturedBrowserWindowOptions: null as unknown,
        openExternal: vi.fn(),
        webRequestOnBeforeRequest: vi.fn(),
        screenDisplays: state.screenDisplays,
        quitFlag: state.quitFlag,
        singleInstanceLock: state.lockFlag,
        screen: {
            getAllDisplays: vi.fn(() => state.screenDisplays)
        },
        app: {
            on: vi.fn((event: string, handler: (...args: never[]) => void) => {
                const arr = appHandlers[event] ?? []
                arr.push(handler)
                appHandlers[event] = arr
            }),
            whenReady: vi.fn(() => Promise.resolve()),
            quit: vi.fn(),
            // P2-10：单实例锁申请（默认成功；失败用例改 lockFlag.value=false）
            requestSingleInstanceLock: vi.fn(() => state.lockFlag.value)
        },
        ipcMain: {
            on: vi.fn((channel: string, handler: (...args: never[]) => void) => {
                const arr = ipcOnMap.get(channel) ?? []
                arr.push(handler)
                ipcOnMap.set(channel, arr)
            }),
            removeListener: vi.fn(),
            // PF-08：PlantUML 本地渲染经 ipcListenerManager.registerHandleOnce 注册
            handle: vi.fn(),
            removeHandler: vi.fn()
        }
    }
})

vi.mock('electron', () => ({
    app: electronMocks.app,
    shell: { openExternal: electronMocks.openExternal },
    ipcMain: electronMocks.ipcMain,
    screen: electronMocks.screen,
    // AS-9：index.ts 在 whenReady 注册远程资源外发阻断（session.defaultSession.webRequest）
    session: {
        defaultSession: { webRequest: { onBeforeRequest: electronMocks.webRequestOnBeforeRequest } }
    },
    BrowserWindow: class {
        constructor(options: unknown) {
            electronMocks.capturedBrowserWindowOptions = options
            return electronMocks.win
        }
        static getAllWindows() {
            return electronMocks.windows
        }
    }
}))

const toolkitMocks = vi.hoisted(() => ({
    setAppUserModelId: vi.fn(),
    watchWindowShortcuts: vi.fn()
}))

vi.mock('@electron-toolkit/utils', () => ({
    is: { dev: true },
    electronApp: { setAppUserModelId: toolkitMocks.setAppUserModelId },
    optimizer: { watchWindowShortcuts: toolkitMocks.watchWindowShortcuts }
}))

/**
 * 结构优化第 2 批 2.4（M2）：IPC 注册清单模块（src/main/ipc/registry.ts）。
 *
 * index.ts 已不再逐一调用各模块的注册函数——whenReady 后只调用：
 *   1) registerPreWindowIpc()：建窗前阶段（配置 IPC + 旧配置迁移）；
 *   2) registerAll(mainWindow, hooks)：建窗后一次性注册（本文件只验证编排接线）。
 * 各注册模块内部的通道清单/顺序由 tests/unit/ipc-registry.test.ts 覆盖，这里
 * mock 掉 registry 以隔离 config-manager/plantuml 等重依赖链。
 */
const registryMocks = vi.hoisted(() => {
    // index.ts 经 hooks.onRendererReady 把「渲染层就绪握手 → 启动恢复」接回入口；
    // 用例通过捕获的钩子模拟握手到达（真实 sender 校验/通道注册由 registry 单测覆盖）
    const state: { onRendererReady: (() => void) | null } = { onRendererReady: null }
    return {
        state,
        registerPreWindowIpc: vi.fn(),
        registerAll: vi.fn((_mainWindow: unknown, hooks?: { onRendererReady?: () => void }) => {
            state.onRendererReady = hooks?.onRendererReady ?? null
        })
    }
})

const internalMocks = vi.hoisted(() => ({
    globalInitialize: vi.fn(),
    cleanupMainWindowDialogsEvent: vi.fn(),
    restoreLastOpenedFile: vi.fn(),
    // 批次 A：#1/#2 启动恢复（autoOpenLastFile / autoOpenLastFolder 开启时走新流程）
    restoreLastOpenedAtStartup: vi.fn(),
    getCurrentThemeStyles: vi.fn(),
    getThemeStylesByType: vi.fn(),
    // 结构优化 1.1（H1）：main/index.ts 启动早期向 utils/providers 注入主题/快速链接读取实现
    getAllThemes: vi.fn(),
    getAllMonacoThemes: vi.fn(),
    getQuickLinks: vi.fn(),
    getSystemSetting: vi.fn(),
    // 1.3.6：存量设置迁移（旧默认 minimizeToTray/enableAutoBackup=true → false）
    migrateLegacyOptInSettings: vi.fn(() => false),
    // 1.3.6：首次隐藏到托盘的通知
    notifyMinimizedToTray: vi.fn(),
    // 批次 A：#5 记住窗口位置和大小（resize/move 防抖后写回 windowBounds）
    saveSystemSetting: vi.fn(),
    getEditorSetting: vi.fn(),
    registerShortKeys: vi.fn(),
    startAutoSaveFileTime: vi.fn(),
    stopAutoSaveFileTime: vi.fn(),
    saveActiveFile: vi.fn(),
    // 2026-11-20（用户需求）：关闭/退出未保存确认对话框（细节由 close-confirm.test.ts 覆盖）
    confirmUnsavedChangesClose: vi.fn(),
    // PF-05：目录 fs.watch 监听的退出清理（index.ts 直接依赖 file-operations 单文件导出）
    cleanupDirectoryWatch: vi.fn(),
    // 批次 B #4：托盘创建/销毁（细节由 tray.test.ts 覆盖）；
    // P2-10：showMainWindow 复用为单实例锁 second-instance 的窗口恢复路径
    ensureTrayCreated: vi.fn(),
    disposeTray: vi.fn(),
    showMainWindow: vi.fn(),
    // 批次 B #7：跟随系统主题的启动/退出清理（细节由 system-theme.test.ts 覆盖）
    startSystemThemeWatcher: vi.fn(),
    stopSystemThemeWatcher: vi.fn(),
    // 批次 C #8/#9：自动备份定时器的启动/退出清理（细节由 auto-backup.test.ts 覆盖）
    syncAutoBackupTimer: vi.fn(),
    stopAutoBackupTimer: vi.fn(),
    loggerError: vi.fn(),
    loggerInfo: vi.fn(),
    loggerSetMainWindow: vi.fn(),
    cleanupAll: vi.fn(),
    // 2026-11-18（#12）：窗口就绪后的 Monaco 主题缓存异步预热
    warmupMonacoThemeCache: vi.fn(),
    // 2026-11-19（P0 修复）：启动时读取遗留 show-welcome 配置（欢迎页状态同步）
    configRead: vi.fn(),
    initUserDataDirectory: vi.fn(),
    // 第 4 批 P3：主窗口图标目录统一由 app-paths.getIconPath() 解析
    getIconPath: vi.fn(() => 'C:\\app\\resources\\icon'),
    isDirty: vi.fn(() => false)
}))

vi.mock('../../src/main/ipc/registry', () => ({
    registerPreWindowIpc: registryMocks.registerPreWindowIpc,
    registerAll: registryMocks.registerAll
}))

vi.mock('../../src/main/utils/utils', () => ({
    globalInitialize: internalMocks.globalInitialize
}))

vi.mock('../../src/main/dialogs/dialogs', () => ({
    CleanupMainWindowDialogsEvent: internalMocks.cleanupMainWindowDialogsEvent
}))

vi.mock('../../src/main/utils/file-state', () => ({
    restoreLastOpenedFile: internalMocks.restoreLastOpenedFile
}))

// 批次 A：启动恢复流程单独 mock（其内部依赖 file-utils/handlers 等，由 startup-restore.test.ts 覆盖）
vi.mock('../../src/main/utils/startup-restore', () => ({
    restoreLastOpenedAtStartup: internalMocks.restoreLastOpenedAtStartup
}))

vi.mock('../../src/main/config', () => ({
    getCurrentThemeStyles: internalMocks.getCurrentThemeStyles,
    getThemeStylesByType: internalMocks.getThemeStylesByType,
    // 结构优化 1.1（H1）：main/index.ts 启动早期注入 utils providers 的读取实现
    getAllThemes: internalMocks.getAllThemes,
    getAllMonacoThemes: internalMocks.getAllMonacoThemes,
    getQuickLinks: internalMocks.getQuickLinks,
    getSystemSetting: internalMocks.getSystemSetting,
    // 1.3.6：存量设置迁移
    migrateLegacyOptInSettings: internalMocks.migrateLegacyOptInSettings,
    // 批次 A：窗口边界写回 system store
    saveSystemSetting: internalMocks.saveSystemSetting,
    getEditorSetting: internalMocks.getEditorSetting,
    RegisterShortKeys: internalMocks.registerShortKeys,
    // 2026-11-19（P0 修复）：启动时读取遗留 show-welcome 配置（欢迎页状态同步）
    configManager: { readConfig: internalMocks.configRead },
    // 2026-11-18（#12）：Monaco 主题缓存异步预热（细节由 theme-registry.test.ts 覆盖）
    warmupMonacoThemeCache: internalMocks.warmupMonacoThemeCache,
    // ARC-04：启动字体 CSS 组装（拼出与真实实现一致的选择器与字体系列）
    buildFontCss: (setting: { fontFamily: string; fontSize: number }) =>
        `body, .title-bar, .menu-bar { font-family: ${setting.fontFamily} !important; font-size: ${setting.fontSize}px !important; }`
}))

vi.mock('../../src/main/utils/file-utils', () => ({
    StartAutoSaveFileTime: internalMocks.startAutoSaveFileTime,
    StopAutoSaveFileTime: internalMocks.stopAutoSaveFileTime,
    SaveActiveFile: internalMocks.saveActiveFile
}))

// PF-05：index.ts 直接导入 file-operations 的目录监听清理函数，
// 单独 mock 该模块，避免测试拉起真实文件操作依赖链（electron-store/日志等）
vi.mock('../../src/main/utils/file-utils/file-operations', () => ({
    CleanupDirectoryWatch: internalMocks.cleanupDirectoryWatch
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: {
        error: internalMocks.loggerError,
        info: internalMocks.loggerInfo,
        setMainWindow: internalMocks.loggerSetMainWindow
    }
}))

vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: {
        cleanupAll: internalMocks.cleanupAll,
        // M2 起 registerHandleOnce 注册已迁入 registry（本文件已整体 mock registry），
        // index.ts 仅保留关闭落盘回执的组件级 register/unregister。
        registerHandleOnce: vi.fn(),
        // P1/C-04：index.ts 的关闭回执监听经监听台账注册，
        // mock 侧同步把注册落到 ipcOnMap，保持既有 triggerIpcHandler 触发方式可用
        registerOnce: vi.fn((channel: string, listener: (...args: never[]) => void) => {
            electronMocks.ipcMain.on(channel, listener)
            return `${channel}:once`
        }),
        register: vi.fn((channel: string, listener: (...args: never[]) => void) => {
            electronMocks.ipcMain.on(channel, listener)
            return `${channel}:register`
        }),
        unregister: vi.fn((channel: string, listener: (...args: never[]) => void) => {
            const list = electronMocks.ipcOnMap.get(channel)
            if (!list) return
            const index = list.indexOf(listener)
            if (index !== -1) {
                list.splice(index, 1)
            }
        })
    }
}))

vi.mock('../../src/main/utils/app-paths', () => ({
    initUserDataDirectory: internalMocks.initUserDataDirectory,
    // 第 4 批 P3：主窗口图标目录统一由 app-paths.getIconPath() 解析
    getIconPath: internalMocks.getIconPath
}))

// 批次 B：托盘与系统主题跟随模块单独 mock（其内部行为由 tray.test.ts /
// system-theme.test.ts 覆盖），index.ts 只验证生命周期挂接点
vi.mock('../../src/main/utils/tray', () => ({
    ensureTrayCreated: internalMocks.ensureTrayCreated,
    disposeTray: internalMocks.disposeTray,
    // 1.3.6：首次隐藏到托盘的提示（细节由 tray.test.ts 覆盖）
    notifyMinimizedToTray: internalMocks.notifyMinimizedToTray,
    // P2-10：单实例锁 second-instance 回调复用的窗口恢复路径
    showMainWindow: internalMocks.showMainWindow
}))

vi.mock('../../src/main/config/system-theme', () => ({
    startSystemThemeWatcher: internalMocks.startSystemThemeWatcher,
    stopSystemThemeWatcher: internalMocks.stopSystemThemeWatcher
}))

// 批次 C #8/#9：自动备份定时器模块单独 mock（其内部行为由 auto-backup.test.ts 覆盖），
// index.ts 只验证 whenReady 启动与 cleanupApp 停止两个生命周期挂接点
vi.mock('../../src/main/utils/auto-backup', () => ({
    syncAutoBackupTimer: internalMocks.syncAutoBackupTimer,
    stopAutoBackupTimer: internalMocks.stopAutoBackupTimer
}))

vi.mock('../../src/main/utils/app-state', () => ({
    appState: {
        isDirty: internalMocks.isDirty,
        // 批次 B #4：显式退出标志——before-quit 置位，close 拦截判断读取。
        // 真实 AppState 是 getter 属性，mock 以对象 getter 镜像（非函数），
        // 否则 index.ts 的 `appState.isQuitting` 真值判断恒为 true。
        get isQuitting() {
            return electronMocks.quitFlag.value
        },
        setQuitting: (value: boolean) => {
            electronMocks.quitFlag.value = value
        }
    }
}))

// 2026-11-20（用户需求）：关闭/退出未保存确认（原生对话框由 close-confirm.test.ts 单测）
vi.mock('../../src/main/utils/close-confirm', () => ({
    confirmUnsavedChangesClose: internalMocks.confirmUnsavedChangesClose
}))

// 等待微任务队列清空（whenReady().then 与 async handler 回调）
async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
}

async function loadMainIndex(): Promise<void> {
    await import('../../src/main/index')
    await settle()
}

// 触发窗口事件处理器（如 close/ready-to-show）
function triggerWindowHandler(event: string, ...args: unknown[]): void {
    const handlers = electronMocks.winHandlers[event]
    expect(handlers, `窗口应注册 ${event} 处理器`).toBeDefined()
    handlers[0](...(args as never[]))
}

// 触发 app 事件处理器
function triggerAppHandler(event: string, ...args: unknown[]): void {
    const handlers = electronMocks.appHandlers[event]
    expect(handlers, `app 应注册 ${event} 处理器`).toBeDefined()
    handlers[0](...(args as never[]))
}

// 触发 webContents 事件处理器（如 will-navigate / will-redirect）
function triggerWebContentHandler(event: string, ...args: unknown[]): void {
    const handlers = electronMocks.webContentHandlers[event]
    expect(handlers, `webContents 应注册 ${event} 处理器`).toBeDefined()
    handlers[0](...(args as never[]))
}

// 触发 ipcMain.on 注册的处理器（如 editor:flush-content-done）
// P1/N-05：主进程监听器统一校验发送方，事件桩需携带主窗口 webContents
function triggerIpcHandler(channel: string, ...args: unknown[]): void {
    const handlers = electronMocks.ipcOnMap.get(channel)
    expect(handlers, `ipcMain 应注册 ${channel} 处理器`).toBeDefined()
    handlers![handlers!.length - 1](
        { sender: electronMocks.win.webContents } as never,
        ...(args as never[])
    )
}

/**
 * M2：渲染层就绪握手（IPC.RENDER.READY）的注册已迁入 registry；index.ts 只提供
 * onRendererReady 钩子。这里直接调用 mock registry 捕获的钩子，模拟 registry 在
 * 收到受信主窗口握手后回调入口（通道注册/sender 校验细节由 ipc-registry.test.ts 覆盖）。
 */
function triggerRendererReady(): void {
    const hook = registryMocks.state.onRendererReady
    expect(hook, 'index.ts 应向 registerAll 提供 onRendererReady 钩子').toBeTypeOf('function')
    hook?.()
}

beforeEach(() => {
    vi.resetModules()
    // 清空共享容器与全部 mock 调用记录
    electronMocks.appHandlers['browser-window-created'] = []
    electronMocks.appHandlers['activate'] = []
    electronMocks.appHandlers['window-all-closed'] = []
    electronMocks.appHandlers['before-quit'] = []
    // P2-10：单实例锁 second-instance 回调注册记录复位
    electronMocks.appHandlers['second-instance'] = []
    for (const key of Object.keys(electronMocks.winHandlers)) {
        delete electronMocks.winHandlers[key]
    }
    // P0 安全：清空 webContents 事件监听记录
    for (const key of Object.keys(electronMocks.webContentHandlers)) {
        delete electronMocks.webContentHandlers[key]
    }
    electronMocks.ipcOnMap.clear()
    electronMocks.windows.length = 0
    electronMocks.capturedBrowserWindowOptions = null
    // 批次 B #4：退出标志复位（before-quit 置位后需恢复，避免污染后续用例）
    // 2026-11-19（P0 修复）：欢迎页状态按用例复位
    // 说明：beforeEach 会 vi.resetModules()，welcome-state 需在 loadMainIndex 之后
    // 动态 import 才能拿到与被测 index.ts 相同的模块实例（见本文件用例）。
    electronMocks.quitFlag.value = false
    // P2-10：单实例锁申请结果复位为成功
    electronMocks.singleInstanceLock.value = true
    electronMocks.screenDisplays.length = 0
    electronMocks.screenDisplays.push({ workArea: { x: 0, y: 0, width: 1920, height: 1080 } })
    electronMocks.win.isDestroyed.mockReset()
    electronMocks.win.isDestroyed.mockReturnValue(false)
    electronMocks.win.webContents.isDestroyed.mockReset()
    electronMocks.win.webContents.isDestroyed.mockReturnValue(false)
    for (const mock of Object.values(electronMocks.win)) {
        if (typeof mock === 'function') mock.mockClear()
    }
    for (const key of ['send', 'insertCSS', 'on', 'setWindowOpenHandler', 'isDestroyed']) {
        const mock =
            electronMocks.win.webContents[key as keyof typeof electronMocks.win.webContents]
        if (typeof mock === 'function') mock.mockClear()
    }
    electronMocks.app.on.mockClear()
    electronMocks.app.quit.mockClear()
    electronMocks.app.requestSingleInstanceLock.mockClear()
    electronMocks.ipcMain.on.mockClear()
    electronMocks.ipcMain.removeListener.mockClear()
    electronMocks.openExternal.mockClear()
    electronMocks.webRequestOnBeforeRequest.mockClear()
    for (const mock of Object.values(toolkitMocks)) mock.mockClear()
    for (const mock of Object.values(internalMocks)) {
        if (typeof mock === 'function') mock.mockClear()
    }
    // M2：IPC 注册清单 mock 复位（记录每次 loadMainIndex 的 registerAll 钩子）
    registryMocks.registerPreWindowIpc.mockClear()
    registryMocks.registerAll.mockClear()
    registryMocks.state.onRendererReady = null
    internalMocks.isDirty.mockReturnValue(false)
    internalMocks.getSystemSetting.mockReturnValue({
        fontFamily: 'Microsoft YaHei',
        fontSize: 14,
        autoSaveEnabled: false,
        autoSaveInterval: 60
    })
    internalMocks.getCurrentThemeStyles.mockReturnValue({ dark: false })
    internalMocks.getThemeStylesByType.mockReturnValue({ dark: true })
    internalMocks.getEditorSetting.mockReturnValue({ fontSize: 14 })
    internalMocks.restoreLastOpenedFile.mockResolvedValue(undefined)
    internalMocks.restoreLastOpenedAtStartup.mockResolvedValue(undefined)
    internalMocks.saveActiveFile.mockResolvedValue(true)
    // 未保存确认默认「取消」：仅显式声明选择的用例会关闭/退出
    internalMocks.confirmUnsavedChangesClose.mockResolvedValue('cancel')
    delete process.env.ELECTRON_RENDERER_URL
})

describe('app whenReady startup flow', () => {
    it('should initialize user data, config IPC and app user model id', async () => {
        await loadMainIndex()
        expect(electronMocks.app.whenReady).toHaveBeenCalled()
        expect(internalMocks.initUserDataDirectory).toHaveBeenCalled()
        // M2：配置 IPC（含旧配置迁移）经 registry 的建窗前阶段注册
        expect(registryMocks.registerPreWindowIpc).toHaveBeenCalledTimes(1)
        expect(toolkitMocks.setAppUserModelId).toHaveBeenCalledWith('com.electron')
        // 批次 B #7：whenReady 启动系统主题跟随监听
        expect(internalMocks.startSystemThemeWatcher).toHaveBeenCalled()
        // 批次 C #8/#9：whenReady 同步自动备份定时器（P1-2：仅启动调度，不立即执行备份）
        expect(internalMocks.syncAutoBackupTimer).toHaveBeenCalled()
    })

    // M2：注册阶段顺序——建窗前配置 IPC 必须先于窗口创建与窗口级注册执行
    // （配置注册内含旧配置迁移，createWindow 会读取系统设置/窗口边界）。
    it('should register pre-window IPC before creating the window and registering window IPC', async () => {
        await loadMainIndex()
        expect(registryMocks.registerPreWindowIpc).toHaveBeenCalledTimes(1)
        expect(registryMocks.registerAll).toHaveBeenCalledTimes(1)
        const preWindowOrder = registryMocks.registerPreWindowIpc.mock.invocationCallOrder[0]
        const loadFileOrder = electronMocks.win.loadFile.mock.invocationCallOrder[0]
        const registerAllOrder = registryMocks.registerAll.mock.invocationCallOrder[0]
        expect(preWindowOrder).toBeLessThan(loadFileOrder)
        expect(loadFileOrder).toBeLessThan(registerAllOrder)
    })

    // AS-9：启动时注册远程图表外发阻断（防止 PlantUML 源码绕道 plantuml.com 外发）
    it('should register the remote resource guard on the default session (AS-9)', async () => {
        await loadMainIndex()
        expect(electronMocks.webRequestOnBeforeRequest).toHaveBeenCalledWith(
            { urls: expect.arrayContaining(['*://*.plantuml.com/*']) },
            expect.any(Function)
        )
    })

    it('should create the main window with the expected options and preload', async () => {
        await loadMainIndex()
        const options = electronMocks.capturedBrowserWindowOptions as {
            width: number
            height: number
            show: boolean
            frame: boolean
            webPreferences: Record<string, unknown>
        }
        expect(options.width).toBe(900)
        expect(options.height).toBe(650)
        expect(options.show).toBe(false)
        expect(options.frame).toBe(false)
        expect(options.webPreferences.nodeIntegration).toBe(false)
        expect(options.webPreferences.contextIsolation).toBe(true)
        expect(options.webPreferences.sandbox).toBe(true)
        expect(String(options.webPreferences.preload)).toContain('preload')
    })

    it('should load the renderer index.html when no dev URL is set', async () => {
        await loadMainIndex()
        expect(electronMocks.win.loadFile).toHaveBeenCalledWith(expect.stringContaining('renderer'))
        expect(electronMocks.win.loadURL).not.toHaveBeenCalled()
    })

    it('should load the dev server URL when ELECTRON_RENDERER_URL is set', async () => {
        process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/'
        await loadMainIndex()
        // P1 性能基线：dev 模式自动开启诊断，主进程给渲染层 URL 追加 ?baizePerf=1
        // （普通/打包启动不追加，URL 与历史行为完全一致）
        expect(electronMocks.win.loadURL).toHaveBeenCalledWith('http://localhost:5173/?baizePerf=1')
        expect(electronMocks.win.loadFile).not.toHaveBeenCalled()
    })

    it('should register the window, listeners and IPC handlers once', async () => {
        await loadMainIndex()
        // M2：窗口级一次性 IPC 注册收敛到 registry.registerAll(mainWindow, hooks)；
        // 具体注册模块（dialogs/utils/handlers/plantuml/主题/握手）由 registry 单测覆盖
        expect(registryMocks.registerAll).toHaveBeenCalledTimes(1)
        const [registeredWindow, hooks] = registryMocks.registerAll.mock.calls[0]
        expect(registeredWindow).toBe(electronMocks.win)
        expect(hooks?.onRendererReady).toBeTypeOf('function')
        // M1：窗口级状态初始化仍由 createWindow 负责（快捷键目标窗口/AppState 复位）
        expect(internalMocks.registerShortKeys).toHaveBeenCalledWith(electronMocks.win)
        expect(internalMocks.globalInitialize).toHaveBeenCalledWith(electronMocks.win)
    })

    it('should start the auto save timer when auto save is enabled', async () => {
        internalMocks.getSystemSetting.mockReturnValue({
            fontFamily: 'A',
            fontSize: 12,
            autoSaveEnabled: true,
            autoSaveInterval: 30
        })
        await loadMainIndex()
        expect(internalMocks.startAutoSaveFileTime).toHaveBeenCalledWith(30000)
        expect(internalMocks.stopAutoSaveFileTime).not.toHaveBeenCalled()
    })

    it('should not start the auto save timer when disabled', async () => {
        await loadMainIndex()
        expect(internalMocks.startAutoSaveFileTime).not.toHaveBeenCalled()
    })

    // 2026-11-19（P0 修复）：遗留配置 show-welcome=false 时渲染层启动即进主界面，
    // 主进程必须在启动阶段同步标记，否则关闭快速路径会跳过 flush/脏保存。
    // 注意：beforeEach 会 vi.resetModules()，必须动态 import 才能拿到与 index.ts
    // 相同的 welcome-state 模块实例。
    it('should mark the main view as entered when legacy show-welcome config is false', async () => {
        internalMocks.configRead.mockResolvedValueOnce(false)
        await loadMainIndex()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(internalMocks.configRead).toHaveBeenCalledWith('show-welcome')
        const welcomeState = await import('../../src/main/ipc/welcome-state')
        expect(welcomeState.isWelcomeScreenVisible()).toBe(false)
    })

    it('should stay on the welcome screen when show-welcome is not configured', async () => {
        internalMocks.configRead.mockResolvedValueOnce(null)
        await loadMainIndex()
        await new Promise((resolve) => setTimeout(resolve, 0))
        const welcomeState = await import('../../src/main/ipc/welcome-state')
        expect(welcomeState.isWelcomeScreenVisible()).toBe(true)
    })
})

describe('ready-to-show flow', () => {
    it('should show the window, init theme, font CSS and editor settings', async () => {
        await loadMainIndex()
        triggerWindowHandler('ready-to-show')
        // P2-5：恢复等待渲染层就绪握手，握手到达前不执行
        expect(internalMocks.restoreLastOpenedFile).not.toHaveBeenCalled()
        triggerRendererReady()
        await settle()
        expect(electronMocks.win.show).toHaveBeenCalled()
        expect(internalMocks.loggerSetMainWindow).toHaveBeenCalledWith(electronMocks.win)
        expect(electronMocks.win.webContents.insertCSS).toHaveBeenCalledWith(
            expect.stringContaining('font-family: Microsoft YaHei')
        )
        expect(electronMocks.win.webContents.send).toHaveBeenCalledWith(
            'baize:editor:init-setting',
            { fontSize: 14 }
        )
        // 自动打开开关默认关闭：保持历史后台恢复行为
        expect(internalMocks.restoreLastOpenedFile).toHaveBeenCalled()
        expect(internalMocks.restoreLastOpenedAtStartup).not.toHaveBeenCalled()
    })

    // P2-5：握手早于 ready-to-show（渲染层先挂载、窗口后显示）时立即恢复
    it('should restore immediately on ready-to-show when the renderer handshake arrived first', async () => {
        await loadMainIndex()
        triggerRendererReady()
        triggerWindowHandler('ready-to-show')
        await settle()
        expect(internalMocks.restoreLastOpenedFile).toHaveBeenCalled()
    })

    // P2-5：渲染层异常未发握手时，3s 超时兜底仍执行恢复（仅推迟，不改变历史行为）
    it('should fall back to restoring 3s after ready-to-show when no handshake arrives', async () => {
        await loadMainIndex()
        vi.useFakeTimers()
        triggerWindowHandler('ready-to-show')
        vi.advanceTimersByTime(2999)
        expect(internalMocks.restoreLastOpenedFile).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(internalMocks.restoreLastOpenedFile).toHaveBeenCalled()
        vi.useRealTimers()
    })

    // 批次 A：#1/#2 autoOpenLastFile / autoOpenLastFolder 开启时走「先 WELCOME_ENTER_MAIN
    // 再投递数据事件」的启动恢复流程，不再走旧的后台恢复
    it('should use the startup restore flow when autoOpenLastFile is enabled', async () => {
        internalMocks.getSystemSetting.mockReturnValue({
            fontFamily: 'A',
            fontSize: 12,
            autoSaveEnabled: false,
            autoSaveInterval: 60,
            autoOpenLastFile: true,
            autoOpenLastFolder: false
        })
        await loadMainIndex()
        triggerWindowHandler('ready-to-show')
        triggerRendererReady()
        await settle()
        expect(internalMocks.restoreLastOpenedAtStartup).toHaveBeenCalledWith(
            electronMocks.win,
            expect.objectContaining({ autoOpenLastFile: true })
        )
        expect(internalMocks.restoreLastOpenedFile).not.toHaveBeenCalled()
    })

    it('should use the startup restore flow when autoOpenLastFolder is enabled', async () => {
        internalMocks.getSystemSetting.mockReturnValue({
            fontFamily: 'A',
            fontSize: 12,
            autoSaveEnabled: false,
            autoSaveInterval: 60,
            autoOpenLastFile: false,
            autoOpenLastFolder: true
        })
        await loadMainIndex()
        triggerWindowHandler('ready-to-show')
        triggerRendererReady()
        await settle()
        expect(internalMocks.restoreLastOpenedAtStartup).toHaveBeenCalledWith(
            electronMocks.win,
            expect.objectContaining({ autoOpenLastFolder: true })
        )
        expect(internalMocks.restoreLastOpenedFile).not.toHaveBeenCalled()
    })
})

describe('remember window size (批次 A #5)', () => {
    it('should keep the historical 900x650 default when rememberWindowSize is off', async () => {
        await loadMainIndex()
        const options = electronMocks.capturedBrowserWindowOptions as {
            width: number
            height: number
            x?: number
            y?: number
        }
        expect(options.width).toBe(900)
        expect(options.height).toBe(650)
        expect(options.x).toBeUndefined()
        expect(options.y).toBeUndefined()
    })

    it('should restore persisted window bounds when rememberWindowSize is enabled', async () => {
        internalMocks.getSystemSetting.mockReturnValue({
            fontFamily: 'A',
            fontSize: 12,
            autoSaveEnabled: false,
            autoSaveInterval: 60,
            rememberWindowSize: true,
            windowBounds: { x: 120, y: 80, width: 1366, height: 768 }
        })
        await loadMainIndex()
        const options = electronMocks.capturedBrowserWindowOptions as {
            width: number
            height: number
            x?: number
            y?: number
        }
        expect(options.x).toBe(120)
        expect(options.y).toBe(80)
        expect(options.width).toBe(1366)
        expect(options.height).toBe(768)
    })

    it('should fall back to centered 1280x800 when stored bounds are offscreen', async () => {
        internalMocks.getSystemSetting.mockReturnValue({
            fontFamily: 'A',
            fontSize: 12,
            autoSaveEnabled: false,
            autoSaveInterval: 60,
            rememberWindowSize: true,
            windowBounds: { x: 9000, y: 9000, width: 1366, height: 768 }
        })
        await loadMainIndex()
        const options = electronMocks.capturedBrowserWindowOptions as {
            width: number
            height: number
            x?: number
            y?: number
        }
        expect(options.width).toBe(1280)
        expect(options.height).toBe(800)
        expect(options.x).toBeUndefined()
        expect(options.y).toBeUndefined()
    })

    it('should debounce-save window bounds on resize when enabled', async () => {
        internalMocks.getSystemSetting.mockReturnValue({
            fontFamily: 'A',
            fontSize: 12,
            autoSaveEnabled: false,
            autoSaveInterval: 60,
            rememberWindowSize: true
        })
        await loadMainIndex()
        vi.useFakeTimers()
        triggerWindowHandler('resize')
        vi.advanceTimersByTime(499)
        expect(internalMocks.saveSystemSetting).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(internalMocks.saveSystemSetting).toHaveBeenCalledWith({
            windowBounds: { x: 40, y: 30, width: 1024, height: 768 }
        })
        vi.useRealTimers()
    })

    it('should not save window bounds when rememberWindowSize is off', async () => {
        await loadMainIndex()
        vi.useFakeTimers()
        triggerWindowHandler('resize')
        vi.advanceTimersByTime(600)
        expect(internalMocks.saveSystemSetting).not.toHaveBeenCalled()
        vi.useRealTimers()
    })
})

describe('window open handler', () => {
    it('should open external URLs in the system browser and deny the window', async () => {
        await loadMainIndex()
        const openHandler = electronMocks.win.webContents.setWindowOpenHandler.mock.calls[0][0]
        const result = openHandler({ url: 'https://example.com' })
        // P0 安全：openExternalSafely 会先规范化 URL 再交给 shell（补全根路径斜杠）
        expect(electronMocks.openExternal).toHaveBeenCalledWith('https://example.com/')
        expect(result).toEqual({ action: 'deny' })
    })

    it('should deny non http/https protocols without opening the shell', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        await loadMainIndex()
        const openHandler = electronMocks.win.webContents.setWindowOpenHandler.mock.calls[0][0]
        for (const url of [
            'javascript:alert(1)',
            'file:///C:/Windows/System32/calc.exe',
            'data:text/html,<h1>x</h1>',
            'baize-evil://x'
        ]) {
            const result = openHandler({ url })
            expect(result).toEqual({ action: 'deny' })
        }
        expect(electronMocks.openExternal).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })
})

describe('main window navigation boundary (P0 安全)', () => {
    it('should register will-navigate / will-redirect guards', async () => {
        await loadMainIndex()
        expect(electronMocks.webContentHandlers['will-navigate']).toHaveLength(1)
        expect(electronMocks.webContentHandlers['will-redirect']).toHaveLength(1)
    })

    it('should block external navigation and allow the packaged renderer index.html', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        await loadMainIndex()
        // 外部地址：拦截
        const blockedEvent = { preventDefault: vi.fn() }
        triggerWebContentHandler('will-navigate', blockedEvent, 'https://evil.example.com/steal')
        expect(blockedEvent.preventDefault).toHaveBeenCalled()
        // 打包后的 renderer index.html：放行（按 index.ts 的 join(__dirname, '../renderer/index.html') 构造）
        const allowedEvent = { preventDefault: vi.fn() }
        const rendererUrl = pathToFileURL(
            path.join(process.cwd(), 'src', 'renderer', 'index.html')
        ).href
        triggerWebContentHandler('will-navigate', allowedEvent, rendererUrl)
        expect(allowedEvent.preventDefault).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })

    it('should allow the dev server URL in dev mode', async () => {
        process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/'
        await loadMainIndex()
        const allowedEvent = { preventDefault: vi.fn() }
        triggerWebContentHandler('will-navigate', allowedEvent, 'http://localhost:5173/index.html')
        expect(allowedEvent.preventDefault).not.toHaveBeenCalled()
        // 同源之外的地址仍然拦截
        const blockedEvent = { preventDefault: vi.fn() }
        triggerWebContentHandler('will-navigate', blockedEvent, 'https://evil.example.com/')
        expect(blockedEvent.preventDefault).toHaveBeenCalled()
    })
})

describe('close flush protocol (D-3)', () => {
    it('should flush editor content before closing when clean', async () => {
        await loadMainIndex()
        const preventDefault = vi.fn()
        triggerWindowHandler('close', { preventDefault })
        // flush 请求已发送，等待渲染层回执
        expect(electronMocks.win.webContents.send).toHaveBeenCalledWith(
            'baize:editor:flush-content'
        )
        expect(preventDefault).toHaveBeenCalled()
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()
        expect(internalMocks.saveActiveFile).not.toHaveBeenCalled()
        expect(electronMocks.win.close).toHaveBeenCalled()
    })

    it('should prompt and save the active file before closing when dirty', async () => {
        internalMocks.isDirty.mockReturnValue(true)
        internalMocks.confirmUnsavedChangesClose.mockResolvedValue('save')
        await loadMainIndex()
        triggerWindowHandler('close', { preventDefault: vi.fn() })
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()
        expect(internalMocks.confirmUnsavedChangesClose).toHaveBeenCalled()
        expect(internalMocks.saveActiveFile).toHaveBeenCalled()
        expect(electronMocks.win.close).toHaveBeenCalled()
    })

    it('should keep the window open when the user cancels the unsaved prompt', async () => {
        internalMocks.isDirty.mockReturnValue(true)
        internalMocks.confirmUnsavedChangesClose.mockResolvedValue('cancel')
        await loadMainIndex()
        triggerWindowHandler('close', { preventDefault: vi.fn() })
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()
        expect(internalMocks.saveActiveFile).not.toHaveBeenCalled()
        expect(electronMocks.win.close).not.toHaveBeenCalled()
    })

    it('should close without saving when the user discards unsaved changes', async () => {
        internalMocks.isDirty.mockReturnValue(true)
        internalMocks.confirmUnsavedChangesClose.mockResolvedValue('discard')
        await loadMainIndex()
        triggerWindowHandler('close', { preventDefault: vi.fn() })
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()
        expect(internalMocks.saveActiveFile).not.toHaveBeenCalled()
        expect(electronMocks.win.close).toHaveBeenCalled()
    })

    it('should not flush again on the second close attempt', async () => {
        await loadMainIndex()
        const firstEvent = { preventDefault: vi.fn() }
        const secondEvent = { preventDefault: vi.fn() }
        const handler = electronMocks.winHandlers['close'][0]
        handler(firstEvent as never)
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()
        handler(secondEvent as never)
        expect(firstEvent.preventDefault).toHaveBeenCalled()
        expect(secondEvent.preventDefault).not.toHaveBeenCalled()
    })
})

describe('minimize to tray on close (批次 B #4)', () => {
    beforeEach(() => {
        internalMocks.getSystemSetting.mockReturnValue({
            fontFamily: 'A',
            fontSize: 12,
            autoSaveEnabled: false,
            autoSaveInterval: 60,
            minimizeToTray: true
        })
    })

    it('should hide the window instead of closing when minimizeToTray is enabled', async () => {
        await loadMainIndex()
        const preventDefault = vi.fn()
        triggerWindowHandler('close', { preventDefault })
        // flush 落盘协议先行
        expect(electronMocks.win.webContents.send).toHaveBeenCalledWith(
            'baize:editor:flush-content'
        )
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()

        expect(preventDefault).toHaveBeenCalled()
        expect(internalMocks.ensureTrayCreated).toHaveBeenCalled()
        // 1.3.6：首次隐藏到托盘时发系统通知（避免用户误判进程残留）
        expect(internalMocks.notifyMinimizedToTray).toHaveBeenCalled()
        expect(electronMocks.win.hide).toHaveBeenCalled()
        expect(electronMocks.win.close).not.toHaveBeenCalled()
    })

    it('should flush again on the next close after hiding (hide keeps the flush protocol active)', async () => {
        await loadMainIndex()
        triggerWindowHandler('close', { preventDefault: vi.fn() })
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()
        expect(electronMocks.win.hide).toHaveBeenCalledTimes(1)

        // 再次点关闭：重新走 flush（隐藏分支不置 flushedForClose）
        electronMocks.win.webContents.send.mockClear()
        triggerWindowHandler('close', { preventDefault: vi.fn() })
        expect(electronMocks.win.webContents.send).toHaveBeenCalledWith(
            'baize:editor:flush-content'
        )
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()
        expect(electronMocks.win.hide).toHaveBeenCalledTimes(2)
        expect(electronMocks.win.close).not.toHaveBeenCalled()
    })

    it('should not intercept close during explicit quit (isQuitting set)', async () => {
        await loadMainIndex()
        electronMocks.quitFlag.value = true
        const preventDefault = vi.fn()
        triggerWindowHandler('close', { preventDefault })

        expect(preventDefault).not.toHaveBeenCalled()
        expect(electronMocks.win.hide).not.toHaveBeenCalled()
        expect(electronMocks.win.webContents.send).not.toHaveBeenCalledWith(
            'baize:editor:flush-content'
        )
    })

    it('should set the quitting flag on before-quit', async () => {
        await loadMainIndex()
        const preventDefault = vi.fn()
        triggerAppHandler('before-quit', { preventDefault })
        expect(electronMocks.quitFlag.value).toBe(true)
        expect(preventDefault).toHaveBeenCalled()
    })

    // 1.3.6：whenReady 时必须先执行存量设置迁移（旧默认 true → false），
    // 否则升级用户仍会「关闭窗口 = 隐藏到托盘」（进程残留感）
    it('should run legacy opt-in migration on whenReady', async () => {
        await loadMainIndex()
        expect(internalMocks.migrateLegacyOptInSettings).toHaveBeenCalled()
    })
})

describe('app lifecycle cleanup', () => {
    it('should stop auto save and clean up on window-all-closed', async () => {
        await loadMainIndex()
        electronMocks.windows.push(electronMocks.win as never)
        triggerAppHandler('window-all-closed')
        expect(internalMocks.stopAutoSaveFileTime).toHaveBeenCalled()
        // PF-05：退出清理必须关闭目录 fs.watch 监听
        expect(internalMocks.cleanupDirectoryWatch).toHaveBeenCalled()
        expect(internalMocks.cleanupMainWindowDialogsEvent).toHaveBeenCalled()
        expect(internalMocks.cleanupAll).toHaveBeenCalled()
        expect(electronMocks.win.destroy).toHaveBeenCalled()
        // 批次 B：退出清理系统主题监听与托盘
        expect(internalMocks.stopSystemThemeWatcher).toHaveBeenCalled()
        expect(internalMocks.disposeTray).toHaveBeenCalled()
        // 批次 C #8/#9：退出停止自动备份定时器
        expect(internalMocks.stopAutoBackupTimer).toHaveBeenCalled()
        // 非 darwin 平台退出应用
        expect(electronMocks.app.quit).toHaveBeenCalled()
    })

    it('should clean up directly on before-quit when the window is destroyed', async () => {
        electronMocks.win.isDestroyed.mockReturnValue(true)
        await loadMainIndex()
        const preventDefault = vi.fn()
        triggerAppHandler('before-quit', { preventDefault })
        expect(preventDefault).not.toHaveBeenCalled()
        expect(internalMocks.cleanupAll).toHaveBeenCalled()
        // PF-05：退出清理同样关闭目录监听
        expect(internalMocks.cleanupDirectoryWatch).toHaveBeenCalled()
    })

    it('should flush and quit on before-quit when the window is alive', async () => {
        await loadMainIndex()
        const preventDefault = vi.fn()
        triggerAppHandler('before-quit', { preventDefault })
        expect(preventDefault).toHaveBeenCalled()
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()
        expect(electronMocks.app.quit).toHaveBeenCalled()
    })

    it('should prompt and save on before-quit when dirty', async () => {
        internalMocks.isDirty.mockReturnValue(true)
        internalMocks.confirmUnsavedChangesClose.mockResolvedValue('save')
        await loadMainIndex()
        triggerAppHandler('before-quit', { preventDefault: vi.fn() })
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()
        expect(internalMocks.confirmUnsavedChangesClose).toHaveBeenCalled()
        expect(internalMocks.saveActiveFile).toHaveBeenCalled()
        expect(electronMocks.app.quit).toHaveBeenCalled()
    })

    it('should cancel quit on before-quit when user cancels the unsaved prompt', async () => {
        internalMocks.isDirty.mockReturnValue(true)
        internalMocks.confirmUnsavedChangesClose.mockResolvedValue('cancel')
        await loadMainIndex()
        triggerAppHandler('before-quit', { preventDefault: vi.fn() })
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()
        expect(internalMocks.saveActiveFile).not.toHaveBeenCalled()
        expect(electronMocks.app.quit).not.toHaveBeenCalled()
        expect(electronMocks.quitFlag.value).toBe(false)
    })

    it('should watch window shortcuts for created windows', async () => {
        await loadMainIndex()
        triggerAppHandler('browser-window-created', {}, electronMocks.win)
        expect(toolkitMocks.watchWindowShortcuts).toHaveBeenCalledWith(electronMocks.win)
    })
})

describe('single instance lock (P2-10)', () => {
    it('should quit without creating a window when the lock is not acquired', async () => {
        electronMocks.singleInstanceLock.value = false
        await loadMainIndex()
        expect(electronMocks.app.requestSingleInstanceLock).toHaveBeenCalled()
        expect(electronMocks.app.quit).toHaveBeenCalled()
        // 未获得锁：不创建窗口、不注册配置 IPC、不注册 second-instance 回调
        expect(electronMocks.capturedBrowserWindowOptions).toBeNull()
        expect(registryMocks.registerPreWindowIpc).not.toHaveBeenCalled()
        expect(registryMocks.registerAll).not.toHaveBeenCalled()
        expect(electronMocks.appHandlers['second-instance']).toHaveLength(0)
    })

    it('should register the second-instance handler and restore the window', async () => {
        await loadMainIndex()
        expect(electronMocks.appHandlers['second-instance']).toHaveLength(1)
        triggerAppHandler('second-instance')
        // 复用托盘 showMainWindow（getLiveMainWindow + show/restore/focus）
        expect(internalMocks.showMainWindow).toHaveBeenCalled()
    })
})

describe('activate recreation', () => {
    it('should recreate the window without re-registering IPC handlers (ARC-06)', async () => {
        await loadMainIndex()
        registryMocks.registerAll.mockClear()
        electronMocks.windows.length = 0
        triggerAppHandler('activate')
        // 窗口重建：再次 loadFile
        expect(electronMocks.win.loadFile.mock.calls.length).toBeGreaterThanOrEqual(2)
        // IPC 注册保持一次性，不随窗口重建重复执行（M2：注册清单 registerAll 只调一次）
        expect(registryMocks.registerAll).not.toHaveBeenCalled()
        // P3（审查）：activate 重建窗口后重启系统主题跟随监听与自动备份定时器
        // （window-all-closed 的 cleanupApp 已停止两者；与 createWindow 内
        // auto-save 重启模式一致）
        expect(internalMocks.startSystemThemeWatcher).toHaveBeenCalledTimes(2)
        expect(internalMocks.syncAutoBackupTimer).toHaveBeenCalledTimes(2)
    })

    it('should not restart the theme watcher or backup timer when windows still exist', async () => {
        await loadMainIndex()
        electronMocks.windows.push(electronMocks.win as never)
        triggerAppHandler('activate')
        expect(internalMocks.startSystemThemeWatcher).toHaveBeenCalledTimes(1)
        expect(internalMocks.syncAutoBackupTimer).toHaveBeenCalledTimes(1)
    })
})
