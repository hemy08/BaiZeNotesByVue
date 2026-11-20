/**
 * P0 安全批次 A：导航边界与 shell 协议白名单 — 单元测试
 *
 * 覆盖三层：
 * 1. src/main/utils/security.ts 纯函数协议矩阵：
 *    - openExternalSafely：http/https 放行并规范化；javascript:/file:/data:/自定义协议/非法 URL 拒绝；
 *    - isSafeExternalUrl / normalizeSafeExternalUrl；shell 打开失败返回 false；
 *    - isAllowedAppNavigation：dev server 放行、打包 renderer index.html 放行、外部 URL 拒绝。
 * 2. src/main/index.ts 主窗口接线（独立 electron mock，security 模块被 mock 便于断言入参）：
 *    - 注册 will-navigate / will-redirect；外部导航 preventDefault；放行时不动；
 *    - 主窗口 setWindowOpenHandler：http/https 走 openExternalSafely、其余拒绝；
 *    - 传给 isAllowedAppNavigation 的 devUrl / rendererIndexPath 正确。
 * 3. src/main/dialogs/OpenOnlineWebPages.ts（C-08）窗口接线：
 *    - 本地窗口无 preload、sandbox 开启；
 *    - 窗口内 will-navigate 全部拦截、window.open 仅 http(s) 交给系统浏览器。
 *
 * 说明：index.ts 是应用入口（import 即注册 app.whenReady 等副作用），因此用与
 * main-index.test.ts 相同风格的依赖 mock 独立加载；security.ts 的真实实现通过
 * vi.importActual 加载，保证纯函数协议矩阵测的是真实逻辑而非 mock。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as path from 'path'
import { pathToFileURL } from 'url'

// ============ 主窗口 harness：electron mock（与 main-index.test.ts 同风格） ============
const electronMocks = vi.hoisted(() => {
    const appHandlers: Record<string, Array<(...args: never[]) => void>> = {}
    const webContentHandlers: Record<string, Array<(...args: never[]) => void>> = {}
    const openExternal = vi.fn()
    const win = {
        on: vi.fn(),
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
        webContentHandlers,
        openExternal,
        windows: [] as never[],
        capturedBrowserWindowOptions: null as unknown,
        // 批次 B #4：appState 退出标志（before-quit 置位后 close 不再被托盘拦截）
        quitFlag: { value: false },
        app: {
            on: vi.fn((event: string, handler: (...args: never[]) => void) => {
                const arr = appHandlers[event] ?? []
                arr.push(handler)
                appHandlers[event] = arr
            }),
            whenReady: vi.fn(() => Promise.resolve()),
            quit: vi.fn(),
            // P2-10：单实例锁（index.ts 模块加载时即申请）
            requestSingleInstanceLock: vi.fn(() => true)
        },
        ipcMain: {
            on: vi.fn(),
            removeListener: vi.fn(),
            handle: vi.fn(),
            removeHandler: vi.fn()
        }
    }
})

vi.mock('electron', () => ({
    app: electronMocks.app,
    shell: { openExternal: electronMocks.openExternal },
    ipcMain: electronMocks.ipcMain,
    // 批次 A：记住窗口位置和大小——createWindow 读取显示器工作区
    screen: { getAllDisplays: vi.fn(() => []) },
    // AS-9：index.ts 在 whenReady 注册远程资源外发阻断（session.defaultSession.webRequest）
    session: { defaultSession: { webRequest: { onBeforeRequest: vi.fn() } } },
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

// CMP-30：index.ts 窗口标题等文案经 tMain 读取词典（隔离 electron-store 依赖链）
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
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

// ============ index.ts 依赖 mock ============
const internalMocks = vi.hoisted(() => ({
    globalInitialize: vi.fn(),
    mainWindowListenUtilsEvent: vi.fn(),
    mainWindowListenDialogsEvent: vi.fn(),
    cleanupMainWindowDialogsEvent: vi.fn(),
    // P2 Mermaid 隐藏渲染窗：index.ts 关闭时清理 / 启动时按需创建
    createMermaidRenderFrame: vi.fn(),
    closeMermaidRenderWindow: vi.fn(),
    cleanupMermaidRender: vi.fn(),
    restoreLastOpenedFile: vi.fn(),
    // 批次 A：#1/#2 启动恢复（隔离其内部 handlers/file-utils 依赖链）
    restoreLastOpenedAtStartup: vi.fn(),
    getCurrentThemeStyles: vi.fn(),
    getThemeStylesByType: vi.fn(),
    // 结构优化 1.1（H1）：main/index.ts 启动早期向 utils/providers 注入主题/快速链接读取实现
    getAllThemes: vi.fn(),
    getAllMonacoThemes: vi.fn(),
    getQuickLinks: vi.fn(),
    getMonacoTheme: vi.fn(),
    getSeparateEditorTheme: vi.fn(),
    getSystemSetting: vi.fn(),
    // 批次 A：#5 窗口边界写回 system store
    saveSystemSetting: vi.fn(),
    getSystemSettingValString: vi.fn(),
    registerConfigIpcHandlers: vi.fn(),
    getEditorSetting: vi.fn(),
    registerShortKeys: vi.fn(),
    startAutoSaveFileTime: vi.fn(),
    stopAutoSaveFileTime: vi.fn(),
    saveActiveFile: vi.fn(),
    cleanupDirectoryWatch: vi.fn(),
    loggerError: vi.fn(),
    loggerInfo: vi.fn(),
    loggerSetMainWindow: vi.fn(),
    cleanupAll: vi.fn(),
    registerHandleOnce: vi.fn(),
    initUserDataDirectory: vi.fn(),
    // 第 4 批 P3：主窗口图标目录统一由 app-paths.getIconPath() 解析
    getIconPath: vi.fn(() => 'C:\\app\\resources\\icon'),
    registerIpcHandlers: vi.fn(),
    setMainWindow: vi.fn(),
    isDirty: vi.fn(() => false)
}))

vi.mock('../../src/main/utils/utils', () => ({
    globalInitialize: internalMocks.globalInitialize,
    MainWindowListenUtilsEvent: internalMocks.mainWindowListenUtilsEvent
}))

vi.mock('../../src/main/dialogs/dialogs', () => ({
    CreateMermaidRenderFrame: internalMocks.createMermaidRenderFrame,
    MainWindowListenDialogsEvent: internalMocks.mainWindowListenDialogsEvent,
    CleanupMainWindowDialogsEvent: internalMocks.cleanupMainWindowDialogsEvent,
    closeMermaidRenderWindow: internalMocks.closeMermaidRenderWindow,
    cleanupMermaidRender: internalMocks.cleanupMermaidRender
}))

// 结构优化第 2 批 2.4（M2）：window-security 只验证 index.ts 的窗口/导航安全接线，
// IPC 注册清单（registry）整体 mock，避免拉起 config-manager/plantuml 等重依赖链。
vi.mock('../../src/main/ipc/registry', () => ({
    registerPreWindowIpc: vi.fn(),
    registerAll: vi.fn()
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
    getMonacoTheme: internalMocks.getMonacoTheme,
    getSeparateEditorTheme: internalMocks.getSeparateEditorTheme,
    getSystemSetting: internalMocks.getSystemSetting,
    // 批次 A：窗口边界写回 system store
    saveSystemSetting: internalMocks.saveSystemSetting,
    // C-08：OpenOnlineWebPages 读取网页打开方式
    getSystemSettingValString: internalMocks.getSystemSettingValString,
    registerConfigIpcHandlers: internalMocks.registerConfigIpcHandlers,
    getEditorSetting: internalMocks.getEditorSetting,
    RegisterShortKeys: internalMocks.registerShortKeys,
    // 2026-11-19（P0 修复）：index.ts 启动时读取 show-welcome 配置（欢迎页状态同步）
    configManager: { readConfig: vi.fn(async () => null) },
    // P1-1（工作区受信根来源收敛）：index.ts 启动早期注入最近文件夹写入器并播种受信根
    ensureApprovedWorkspaceRootsInitialized: vi.fn(async () => {}),
    recordRecentFolder: vi.fn(async () => {}),
    buildFontCss: (setting: { fontFamily: string; fontSize: number }) =>
        `body, .title-bar, .menu-bar { font-family: ${setting.fontFamily} !important; font-size: ${setting.fontSize}px !important; }`
}))

vi.mock('../../src/main/utils/file-utils', () => ({
    StartAutoSaveFileTime: internalMocks.startAutoSaveFileTime,
    StopAutoSaveFileTime: internalMocks.stopAutoSaveFileTime,
    SaveActiveFile: internalMocks.saveActiveFile
}))

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
        // P1/C-04：index.ts 的主题更新/关闭回执监听已迁移到监听台账
        registerOnce: vi.fn(),
        register: vi.fn(),
        unregister: vi.fn()
    }
}))

vi.mock('../../src/main/utils/app-paths', () => ({
    initUserDataDirectory: internalMocks.initUserDataDirectory,
    // 第 4 批 P3：主窗口图标目录统一由 app-paths.getIconPath() 解析
    getIconPath: internalMocks.getIconPath
}))

// 批次 B：托盘与系统主题跟随模块单独 mock（其内部行为由 tray.test.ts /
// system-theme.test.ts 覆盖），避免拉起 theme-config → app-paths/electron-store 依赖链
vi.mock('../../src/main/utils/tray', () => ({
    ensureTrayCreated: vi.fn(),
    disposeTray: vi.fn(),
    // P2-10：单实例锁 second-instance 回调复用的窗口恢复路径
    showMainWindow: vi.fn()
}))

vi.mock('../../src/main/config/system-theme', () => ({
    startSystemThemeWatcher: vi.fn(),
    stopSystemThemeWatcher: vi.fn()
}))

vi.mock('../../src/main/utils/app-state', () => ({
    appState: {
        isDirty: internalMocks.isDirty,
        // 批次 B #4：显式退出标志（与 main-index.test.ts 一致，getter 镜像真实 AppState）
        get isQuitting() {
            return electronMocks.quitFlag.value
        },
        setQuitting: (value: boolean) => {
            electronMocks.quitFlag.value = value
        }
    }
}))

vi.mock('../../src/main/ipc', () => ({
    registerIpcHandlers: internalMocks.registerIpcHandlers,
    setMainWindow: internalMocks.setMainWindow
}))

// ============ security 模块 mock：index.ts / OpenOnlineWebPages 接线断言用 ============
const securityMocks = vi.hoisted(() => ({
    openExternalSafely: vi.fn(),
    isSafeExternalUrl: vi.fn(),
    isAllowedAppNavigation: vi.fn(),
    normalizeSafeExternalUrl: vi.fn((url: string) => url)
}))

vi.mock('../../src/main/utils/security', () => securityMocks)

// ============ C-08：windowManager mock ============
const c08Mocks = vi.hoisted(() => {
    interface RemoteWindow {
        options: Record<string, unknown>
        loadURL: ReturnType<typeof vi.fn>
        webHandlers: Record<string, Array<(...args: never[]) => void>>
        webContents: {
            on: ReturnType<typeof vi.fn>
            setWindowOpenHandler: ReturnType<typeof vi.fn>
        }
    }
    const remoteWindows: RemoteWindow[] = []
    const createWindow = vi.fn((_type: string, options: Record<string, unknown>) => {
        const webHandlers: Record<string, Array<(...args: never[]) => void>> = {}
        const window: RemoteWindow = {
            options,
            loadURL: vi.fn(),
            webHandlers,
            webContents: {
                on: vi.fn((event: string, handler: (...args: never[]) => void) => {
                    const arr = webHandlers[event] ?? []
                    arr.push(handler)
                    webHandlers[event] = arr
                }),
                setWindowOpenHandler: vi.fn()
            }
        }
        remoteWindows.push(window)
        return window
    })
    return { remoteWindows, createWindow }
})

vi.mock('../../src/main/window/window-manager', () => ({
    windowManager: { createWindow: c08Mocks.createWindow }
}))

// ============ 辅助函数 ============
async function settle(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
    await new Promise((resolve) => setTimeout(resolve, 0))
}

async function loadMainIndex(): Promise<void> {
    await import('../../src/main/index')
    await settle()
}

async function loadActualSecurity(): Promise<typeof import('../../src/main/utils/security')> {
    return vi.importActual<typeof import('../../src/main/utils/security')>(
        '../../src/main/utils/security'
    )
}

function getWebContentHandler(event: string): (...args: never[]) => void {
    const handlers = electronMocks.webContentHandlers[event]
    expect(handlers, `主窗口 webContents 应注册 ${event} 处理器`).toBeDefined()
    return handlers[0]
}

// 与源码 src/main/index.ts 的 join(__dirname, '../renderer/index.html') 对应
const RENDERER_INDEX_PATH = path.join(process.cwd(), 'src', 'renderer', 'index.html')

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    vi.resetModules()
    // 主窗口 harness 清理
    for (const key of Object.keys(electronMocks.appHandlers)) {
        electronMocks.appHandlers[key] = []
    }
    for (const key of Object.keys(electronMocks.webContentHandlers)) {
        delete electronMocks.webContentHandlers[key]
    }
    electronMocks.windows.length = 0
    electronMocks.capturedBrowserWindowOptions = null
    // 批次 B #4：退出标志复位
    electronMocks.quitFlag.value = false
    electronMocks.openExternal.mockReset()
    electronMocks.openExternal.mockResolvedValue(undefined)
    electronMocks.app.on.mockClear()
    electronMocks.app.quit.mockClear()
    electronMocks.ipcMain.on.mockClear()
    electronMocks.ipcMain.removeListener.mockClear()
    for (const mock of Object.values(electronMocks.win)) {
        if (typeof mock === 'function') mock.mockClear()
    }
    for (const key of ['send', 'insertCSS', 'on', 'setWindowOpenHandler', 'isDestroyed']) {
        const mock =
            electronMocks.win.webContents[key as keyof typeof electronMocks.win.webContents]
        if (typeof mock === 'function') mock.mockClear()
    }
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
    internalMocks.restoreLastOpenedAtStartup.mockResolvedValue(undefined)
    internalMocks.saveActiveFile.mockResolvedValue(undefined)
    // security / C-08 默认实现
    securityMocks.openExternalSafely.mockReset()
    securityMocks.openExternalSafely.mockResolvedValue(true)
    securityMocks.isSafeExternalUrl.mockReset()
    securityMocks.isSafeExternalUrl.mockReturnValue(true)
    securityMocks.isAllowedAppNavigation.mockReset()
    securityMocks.isAllowedAppNavigation.mockReturnValue(false)
    securityMocks.normalizeSafeExternalUrl.mockReset()
    securityMocks.normalizeSafeExternalUrl.mockImplementation((url: string) => url)
    c08Mocks.remoteWindows.length = 0
    c08Mocks.createWindow.mockClear()
    internalMocks.getSystemSettingValString.mockReset()
    internalMocks.getSystemSettingValString.mockReturnValue('browser')
    delete process.env.ELECTRON_RENDERER_URL
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    warnSpy.mockRestore()
})

// ============================================================================
// 1. 协议白名单纯函数（security.ts 真实实现）
// ============================================================================
describe('openExternalSafely 协议矩阵（真实实现）', () => {
    it('should allow http and https and normalize the URL', async () => {
        const security = await loadActualSecurity()
        await expect(security.openExternalSafely('https://example.com')).resolves.toBe(true)
        expect(electronMocks.openExternal).toHaveBeenCalledWith('https://example.com/')
        await expect(security.openExternalSafely('http://example.com/a')).resolves.toBe(true)
        expect(electronMocks.openExternal).toHaveBeenCalledWith('http://example.com/a')
        // 协议/主机名大小写归一化
        await expect(security.openExternalSafely('HTTPS://Example.COM/Path')).resolves.toBe(true)
        expect(electronMocks.openExternal).toHaveBeenCalledWith('https://example.com/Path')
    })

    it('should reject every non http/https protocol and invalid URL', async () => {
        const security = await loadActualSecurity()
        const rejected = [
            'javascript:alert(1)',
            'file:///C:/Windows/System32/calc.exe',
            'data:text/html,<h1>x</h1>',
            'mailto:someone@example.com',
            'baize-evil://payload',
            'not a valid url',
            '',
            '   '
        ]
        for (const url of rejected) {
            await expect(security.openExternalSafely(url), `应拒绝：${url}`).resolves.toBe(false)
        }
        expect(electronMocks.openExternal).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
    })

    it('should report failure when the shell cannot open the URL', async () => {
        const security = await loadActualSecurity()
        electronMocks.openExternal.mockRejectedValueOnce(new Error('no browser'))
        await expect(security.openExternalSafely('https://example.com/')).resolves.toBe(false)
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('打开外部链接失败'),
            expect.any(Error)
        )
    })

    it('isSafeExternalUrl should be pure and never call the shell', async () => {
        const security = await loadActualSecurity()
        expect(security.isSafeExternalUrl('https://example.com')).toBe(true)
        expect(security.isSafeExternalUrl('http://example.com')).toBe(true)
        expect(security.isSafeExternalUrl('javascript:alert(1)')).toBe(false)
        expect(security.isSafeExternalUrl('file:///C:/a.txt')).toBe(false)
        expect(security.isSafeExternalUrl('not a url')).toBe(false)
        expect(electronMocks.openExternal).not.toHaveBeenCalled()
    })
})

describe('isAllowedAppNavigation 导航边界（真实实现）', () => {
    it('should allow the dev server origin in dev mode', async () => {
        const security = await loadActualSecurity()
        expect(
            security.isAllowedAppNavigation('http://localhost:5173/index.html', {
                devUrl: 'http://localhost:5173/'
            })
        ).toBe(true)
        // dev URL 无末尾斜杠时也放行同源页面
        expect(
            security.isAllowedAppNavigation('http://localhost:5173/src/main.ts', {
                devUrl: 'http://localhost:5173'
            })
        ).toBe(true)
    })

    it('should reject other origins even when a dev URL is provided', async () => {
        const security = await loadActualSecurity()
        expect(
            security.isAllowedAppNavigation('https://evil.example.com/', {
                devUrl: 'http://localhost:5173/'
            })
        ).toBe(false)
        expect(
            security.isAllowedAppNavigation('http://localhost:5174/', {
                devUrl: 'http://localhost:5173/'
            })
        ).toBe(false)
    })

    it('should allow exactly the packaged renderer index.html file URL', async () => {
        const security = await loadActualSecurity()
        const rendererUrl = pathToFileURL(RENDERER_INDEX_PATH).href
        expect(
            security.isAllowedAppNavigation(rendererUrl, { rendererIndexPath: RENDERER_INDEX_PATH })
        ).toBe(true)
        // 同目录其他本地文件一律拒绝
        const otherFile = pathToFileURL(
            path.join(path.dirname(RENDERER_INDEX_PATH), 'other.html')
        ).href
        expect(
            security.isAllowedAppNavigation(otherFile, { rendererIndexPath: RENDERER_INDEX_PATH })
        ).toBe(false)
    })

    it('should reject external / non-app navigations', async () => {
        const security = await loadActualSecurity()
        for (const url of [
            'https://evil.example.com/',
            'http://127.0.0.1:5173/',
            'javascript:alert(1)',
            'data:text/html,<h1>x</h1>',
            'about:blank',
            'file:///C:/Windows/System32/calc.exe',
            'not a valid url',
            ''
        ]) {
            expect(
                security.isAllowedAppNavigation(url, {
                    devUrl: 'http://localhost:5173/',
                    rendererIndexPath: RENDERER_INDEX_PATH
                }),
                `应拒绝导航：${url}`
            ).toBe(false)
        }
    })
})

// ============================================================================
// 2. 主窗口接线（index.ts）
// ============================================================================
describe('main window navigation boundary (index.ts 接线)', () => {
    it('should register will-navigate and will-redirect guards', async () => {
        await loadMainIndex()
        expect(electronMocks.webContentHandlers['will-navigate']).toHaveLength(1)
        expect(electronMocks.webContentHandlers['will-redirect']).toHaveLength(1)
        expect(typeof getWebContentHandler('will-navigate')).toBe('function')
    })

    it('should prevent external navigation and keep the window open', async () => {
        await loadMainIndex()
        const event = { preventDefault: vi.fn() }
        getWebContentHandler('will-navigate')(
            event as never,
            'https://evil.example.com/steal' as never
        )
        expect(securityMocks.isAllowedAppNavigation).toHaveBeenCalledWith(
            'https://evil.example.com/steal',
            expect.objectContaining({ rendererIndexPath: RENDERER_INDEX_PATH })
        )
        expect(event.preventDefault).toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('已拦截主窗口非法导航'))
    })

    it('should allow trusted navigation without calling preventDefault', async () => {
        securityMocks.isAllowedAppNavigation.mockReturnValue(true)
        await loadMainIndex()
        const event = { preventDefault: vi.fn() }
        getWebContentHandler('will-navigate')(event as never, 'file:///trusted' as never)
        expect(event.preventDefault).not.toHaveBeenCalled()
    })

    it('should only pass a devUrl to the guard in dev mode with ELECTRON_RENDERER_URL', async () => {
        // 生产/无 dev URL：不放行 dev 地址
        await loadMainIndex()
        getWebContentHandler('will-navigate')(
            { preventDefault: vi.fn() } as never,
            'https://x/' as never
        )
        const prodOptions = securityMocks.isAllowedAppNavigation.mock.calls[0][1] as {
            devUrl?: string
            rendererIndexPath?: string
        }
        expect(prodOptions.devUrl).toBeUndefined()
        expect(prodOptions.rendererIndexPath).toBe(RENDERER_INDEX_PATH)
        // dev 模式：把 dev server 地址交给守卫
        vi.resetModules()
        process.env.ELECTRON_RENDERER_URL = 'http://localhost:5173/'
        securityMocks.isAllowedAppNavigation.mockClear()
        electronMocks.webContentHandlers['will-navigate'] = []
        await loadMainIndex()
        getWebContentHandler('will-navigate')(
            { preventDefault: vi.fn() } as never,
            'https://x/' as never
        )
        const devOptions = securityMocks.isAllowedAppNavigation.mock.calls[0][1] as {
            devUrl?: string
        }
        expect(devOptions.devUrl).toBe('http://localhost:5173/')
    })

    it('should open http/https window.open targets safely and deny the window', async () => {
        securityMocks.isSafeExternalUrl.mockReturnValue(true)
        await loadMainIndex()
        const handler = electronMocks.win.webContents.setWindowOpenHandler.mock
            .calls[0][0] as (details: { url: string }) => { action: string }
        expect(handler({ url: 'https://example.com' })).toEqual({ action: 'deny' })
        expect(securityMocks.openExternalSafely).toHaveBeenCalledWith('https://example.com')
    })

    it('should deny non http/https window.open targets without opening them', async () => {
        securityMocks.isSafeExternalUrl.mockReturnValue(false)
        await loadMainIndex()
        const handler = electronMocks.win.webContents.setWindowOpenHandler.mock
            .calls[0][0] as (details: { url: string }) => { action: string }
        expect(handler({ url: 'javascript:alert(1)' })).toEqual({ action: 'deny' })
        expect(securityMocks.openExternalSafely).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('已拦截主窗口打开非 http/https 链接')
        )
    })
})

// ============================================================================
// 3. C-08 在线网页窗口接线（OpenOnlineWebPages.ts）
// ============================================================================
describe('online web page window hardening (C-08 接线)', () => {
    async function loadAndOpen(url = 'https://example.com'): Promise<void> {
        internalMocks.getSystemSettingValString.mockReturnValue('local-dialog')
        const { OpenOnlineWebPage } = await import('../../src/main/dialogs/OpenOnlineWebPages')
        OpenOnlineWebPage(url)
    }

    it('should reject unsafe URLs before creating any window', async () => {
        internalMocks.getSystemSettingValString.mockReturnValue('local-dialog')
        securityMocks.isSafeExternalUrl.mockReturnValue(false)
        const { OpenOnlineWebPage } = await import('../../src/main/dialogs/OpenOnlineWebPages')
        OpenOnlineWebPage('javascript:alert(1)')
        expect(c08Mocks.createWindow).not.toHaveBeenCalled()
        expect(securityMocks.openExternalSafely).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
    })

    it('should create the remote window without preload and with sandbox enabled', async () => {
        securityMocks.normalizeSafeExternalUrl.mockReturnValue('https://example.com/')
        await loadAndOpen()
        expect(c08Mocks.createWindow).toHaveBeenCalledTimes(1)
        const options = c08Mocks.remoteWindows[0].options
        const webPreferences = options.webPreferences as Record<string, unknown>
        expect(webPreferences.preload).toBeUndefined()
        expect(webPreferences.sandbox).toBe(true)
        expect(webPreferences.nodeIntegration).toBe(false)
        expect(webPreferences.contextIsolation).toBe(true)
        expect(c08Mocks.remoteWindows[0].loadURL).toHaveBeenCalledWith('https://example.com/')
    })

    it('should block every navigation inside the remote window', async () => {
        await loadAndOpen()
        const handlers = c08Mocks.remoteWindows[0].webHandlers['will-navigate']
        expect(handlers).toHaveLength(1)
        const event = { preventDefault: vi.fn() }
        handlers[0](event as never, 'https://phishing.example.com/login' as never)
        expect(event.preventDefault).toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('已拦截在线网页窗口内的导航'))
    })

    it('should deny window.open in the remote window and open http(s) externally only', async () => {
        await loadAndOpen()
        const handler = c08Mocks.remoteWindows[0].webContents.setWindowOpenHandler.mock
            .calls[0][0] as (details: { url: string }) => { action: string }
        securityMocks.isSafeExternalUrl.mockReturnValue(true)
        expect(handler({ url: 'https://help.example.com/page' })).toEqual({ action: 'deny' })
        expect(securityMocks.openExternalSafely).toHaveBeenCalledWith(
            'https://help.example.com/page'
        )
        // 非 http/https：不打开，只 deny
        securityMocks.openExternalSafely.mockClear()
        securityMocks.isSafeExternalUrl.mockReturnValue(false)
        expect(handler({ url: 'file:///C:/Windows/System32/calc.exe' })).toEqual({ action: 'deny' })
        expect(securityMocks.openExternalSafely).not.toHaveBeenCalled()
    })
})
