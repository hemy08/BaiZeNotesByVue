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
    const win = {
        on: vi.fn((event: string, handler: (...args: never[]) => void) => {
            const arr = winHandlers[event] ?? []
            arr.push(handler)
            winHandlers[event] = arr
        }),
        show: vi.fn(),
        close: vi.fn(),
        isDestroyed: vi.fn(() => false),
        destroy: vi.fn(),
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
        app: {
            on: vi.fn((event: string, handler: (...args: never[]) => void) => {
                const arr = appHandlers[event] ?? []
                arr.push(handler)
                appHandlers[event] = arr
            }),
            whenReady: vi.fn(() => Promise.resolve()),
            quit: vi.fn()
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

const internalMocks = vi.hoisted(() => ({
    globalInitialize: vi.fn(),
    mainWindowListenUtilsEvent: vi.fn(),
    mainWindowListenDialogsEvent: vi.fn(),
    cleanupMainWindowDialogsEvent: vi.fn(),
    restoreLastOpenedFile: vi.fn(),
    getCurrentThemeStyles: vi.fn(),
    getThemeStylesByType: vi.fn(),
    getMonacoTheme: vi.fn(),
    getSeparateEditorTheme: vi.fn(),
    getSystemSetting: vi.fn(),
    registerConfigIpcHandlers: vi.fn(),
    getEditorSetting: vi.fn(),
    registerShortKeys: vi.fn(),
    startAutoSaveFileTime: vi.fn(),
    stopAutoSaveFileTime: vi.fn(),
    saveActiveFile: vi.fn(),
    // PF-05：目录 fs.watch 监听的退出清理（index.ts 直接依赖 file-operations 单文件导出）
    cleanupDirectoryWatch: vi.fn(),
    loggerError: vi.fn(),
    loggerInfo: vi.fn(),
    loggerSetMainWindow: vi.fn(),
    cleanupAll: vi.fn(),
    // PF-08：PlantUML 本地渲染注册（index.ts → plantuml-local → ipcListenerManager）
    registerHandleOnce: vi.fn(),
    initUserDataDirectory: vi.fn(),
    registerIpcHandlers: vi.fn(),
    setMainWindow: vi.fn(),
    isDirty: vi.fn(() => false)
}))

vi.mock('../../src/main/utils/utils', () => ({
    globalInitialize: internalMocks.globalInitialize,
    MainWindowListenUtilsEvent: internalMocks.mainWindowListenUtilsEvent
}))

vi.mock('../../src/main/dialogs/dialogs', () => ({
    MainWindowListenDialogsEvent: internalMocks.mainWindowListenDialogsEvent,
    CleanupMainWindowDialogsEvent: internalMocks.cleanupMainWindowDialogsEvent
}))

vi.mock('../../src/main/utils/file-state', () => ({
    restoreLastOpenedFile: internalMocks.restoreLastOpenedFile
}))

vi.mock('../../src/main/config', () => ({
    getCurrentThemeStyles: internalMocks.getCurrentThemeStyles,
    getThemeStylesByType: internalMocks.getThemeStylesByType,
    getMonacoTheme: internalMocks.getMonacoTheme,
    getSeparateEditorTheme: internalMocks.getSeparateEditorTheme,
    getSystemSetting: internalMocks.getSystemSetting,
    registerConfigIpcHandlers: internalMocks.registerConfigIpcHandlers,
    getEditorSetting: internalMocks.getEditorSetting,
    RegisterShortKeys: internalMocks.registerShortKeys,
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
        registerHandleOnce: internalMocks.registerHandleOnce,
        // P1/C-04：index.ts 的主题更新/关闭回执监听已迁移到监听台账，
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
    initUserDataDirectory: internalMocks.initUserDataDirectory
}))

vi.mock('../../src/main/utils/app-state', () => ({
    appState: { isDirty: internalMocks.isDirty }
}))

vi.mock('../../src/main/ipc', () => ({
    registerIpcHandlers: internalMocks.registerIpcHandlers,
    setMainWindow: internalMocks.setMainWindow
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

beforeEach(() => {
    vi.resetModules()
    // 清空共享容器与全部 mock 调用记录
    electronMocks.appHandlers['browser-window-created'] = []
    electronMocks.appHandlers['activate'] = []
    electronMocks.appHandlers['window-all-closed'] = []
    electronMocks.appHandlers['before-quit'] = []
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
    electronMocks.ipcMain.on.mockClear()
    electronMocks.ipcMain.removeListener.mockClear()
    electronMocks.openExternal.mockClear()
    electronMocks.webRequestOnBeforeRequest.mockClear()
    for (const mock of Object.values(toolkitMocks)) mock.mockClear()
    for (const mock of Object.values(internalMocks)) {
        if (typeof mock === 'function') mock.mockClear()
    }
    internalMocks.isDirty.mockReturnValue(false)
    internalMocks.getSystemSetting.mockReturnValue({
        fontFamily: 'Microsoft YaHei',
        fontSize: 14,
        autoSaveEnabled: false,
        autoSaveInterval: 60
    })
    internalMocks.getCurrentThemeStyles.mockReturnValue({ dark: false })
    internalMocks.getThemeStylesByType.mockReturnValue({ dark: true })
    internalMocks.getMonacoTheme.mockReturnValue('vs-dark')
    internalMocks.getSeparateEditorTheme.mockReturnValue(false)
    internalMocks.getEditorSetting.mockReturnValue({ fontSize: 14 })
    internalMocks.restoreLastOpenedFile.mockResolvedValue(undefined)
    internalMocks.saveActiveFile.mockResolvedValue(undefined)
    delete process.env.ELECTRON_RENDERER_URL
})

describe('app whenReady startup flow', () => {
    it('should initialize user data, config IPC and app user model id', async () => {
        await loadMainIndex()
        expect(electronMocks.app.whenReady).toHaveBeenCalled()
        expect(internalMocks.initUserDataDirectory).toHaveBeenCalled()
        expect(internalMocks.registerConfigIpcHandlers).toHaveBeenCalled()
        expect(toolkitMocks.setAppUserModelId).toHaveBeenCalledWith('com.electron')
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
        expect(electronMocks.win.loadURL).toHaveBeenCalledWith('http://localhost:5173/')
        expect(electronMocks.win.loadFile).not.toHaveBeenCalled()
    })

    it('should register the window, listeners and IPC handlers once', async () => {
        await loadMainIndex()
        expect(internalMocks.setMainWindow).toHaveBeenCalledWith(electronMocks.win)
        expect(internalMocks.registerIpcHandlers).toHaveBeenCalledWith(electronMocks.win)
        expect(internalMocks.mainWindowListenDialogsEvent).toHaveBeenCalledWith(electronMocks.win)
        expect(internalMocks.mainWindowListenUtilsEvent).toHaveBeenCalledWith(electronMocks.win)
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
})

describe('ready-to-show flow', () => {
    it('should show the window, init theme, font CSS and editor settings', async () => {
        await loadMainIndex()
        triggerWindowHandler('ready-to-show')
        await settle()
        expect(electronMocks.win.show).toHaveBeenCalled()
        expect(internalMocks.loggerSetMainWindow).toHaveBeenCalledWith(electronMocks.win)
        expect(electronMocks.win.webContents.send).toHaveBeenCalledWith('baize:theme:init-styles', {
            dark: false
        })
        expect(electronMocks.win.webContents.insertCSS).toHaveBeenCalledWith(
            expect.stringContaining('font-family: Microsoft YaHei')
        )
        expect(electronMocks.win.webContents.send).toHaveBeenCalledWith(
            'baize:editor:init-setting',
            { fontSize: 14 }
        )
        expect(internalMocks.restoreLastOpenedFile).toHaveBeenCalled()
    })
})

describe('theme update broadcast', () => {
    it('should use the given theme type and broadcast to all windows', async () => {
        await loadMainIndex()
        electronMocks.windows.push(electronMocks.win as never)
        triggerIpcHandler('baize:theme:update', 'dark', 'vs-light', true)
        expect(internalMocks.getThemeStylesByType).toHaveBeenCalledWith('dark')
        expect(electronMocks.win.webContents.send).toHaveBeenCalledWith('baize:theme:updated', {
            themeStyles: { dark: true },
            monacoTheme: 'vs-light',
            separateEditorTheme: true
        })
    })

    it('should fall back to current styles and defaults when no args given', async () => {
        await loadMainIndex()
        electronMocks.windows.push(electronMocks.win as never)
        triggerIpcHandler('baize:theme:update')
        expect(internalMocks.getCurrentThemeStyles).toHaveBeenCalled()
        expect(electronMocks.win.webContents.send).toHaveBeenCalledWith('baize:theme:updated', {
            themeStyles: { dark: false },
            monacoTheme: 'vs-dark',
            separateEditorTheme: false
        })
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

    it('should save the active file before closing when dirty', async () => {
        internalMocks.isDirty.mockReturnValue(true)
        await loadMainIndex()
        triggerWindowHandler('close', { preventDefault: vi.fn() })
        triggerIpcHandler('baize:editor:flush-content-done')
        await settle()
        expect(internalMocks.saveActiveFile).toHaveBeenCalled()
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

    it('should watch window shortcuts for created windows', async () => {
        await loadMainIndex()
        triggerAppHandler('browser-window-created', {}, electronMocks.win)
        expect(toolkitMocks.watchWindowShortcuts).toHaveBeenCalledWith(electronMocks.win)
    })
})

describe('activate recreation', () => {
    it('should recreate the window without re-registering IPC handlers (ARC-06)', async () => {
        await loadMainIndex()
        internalMocks.registerIpcHandlers.mockClear()
        electronMocks.windows.length = 0
        triggerAppHandler('activate')
        // 窗口重建：再次 loadFile
        expect(electronMocks.win.loadFile.mock.calls.length).toBeGreaterThanOrEqual(2)
        // IPC 注册保持一次性，不随窗口重建重复执行
        expect(internalMocks.registerIpcHandlers).not.toHaveBeenCalled()
    })
})
