import { app, BrowserWindow, session, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as utils from './utils/utils'
import * as dialogs from './dialogs/dialogs'
import { restoreLastOpenedFile } from './utils/file-state'
import {
    getCurrentThemeStyles,
    getThemeStylesByType,
    getMonacoTheme,
    getSeparateEditorTheme,
    getSystemSetting,
    saveSystemSetting,
    registerConfigIpcHandlers,
    getEditorSetting,
    buildFontCss
} from './config'
import type { ThemeType } from './config'
import { StartAutoSaveFileTime, StopAutoSaveFileTime, SaveActiveFile } from './utils/file-utils'
// PF-05：目录树 fs.watch 监听的退出清理（仅新增生命周期管理，不改变原有落盘/清理逻辑）
import { CleanupDirectoryWatch } from './utils/file-utils/file-operations'
import { RegisterShortKeys } from './config'
import { logger } from './utils/logger'
import { ipcListenerManager } from './ipc/ipc-listener-manager'
// P1/C-03：主进程主题广播唯一实现（禁止再出现渲染层 window.electronAPI.broadcastTheme）
import { broadcastThemeToAllWindows } from './ipc/theme-broadcast'
// P1/N-05：IPC 发送方授权校验（主窗口登记 + 监听器包装）
import { setTrustedMainWindow, withSenderCheck } from './utils/ipc-security'
import { initUserDataDirectory } from './utils/app-paths'
import { registerIpcHandlers, setMainWindow } from './ipc'
import { appState } from './utils/app-state'
import { IPC } from '../shared/ipc-channels'
// PF-08：PlantUML 本地离线渲染的注册与隐藏窗口清理
import {
    registerPlantumlLocalRenderIpc,
    disposePlantumlLocalWindows
} from './renders/plantuml-local'
import { tMain } from './utils/i18n'
// P0 安全（导航边界 + shell 协议白名单）：窗口导航与外部链接打开统一走安全封装
import { isAllowedAppNavigation, isSafeExternalUrl, openExternalSafely } from './utils/security'
// AS-9：远程图表外发阻断（PlantUML 本地渲染不可用时的 plantuml.com 远程降级请求）
import { registerRemoteResourceGuard } from './utils/remote-resource-guard'
// 系统设置补充实现批次 A：
// - 启动恢复上次文件/目录（autoOpenLastFile / autoOpenLastFolder）
import { restoreLastOpenedAtStartup } from './utils/startup-restore'
// - 记住窗口位置和大小（rememberWindowSize / windowBounds）
import { attachWindowBoundsPersistence, resolveInitialWindowOptions } from './utils/window-bounds'
// 系统设置补充实现批次 B：
// - 关闭时最小化到系统托盘（minimizeToTray）
import { disposeTray, ensureTrayCreated } from './utils/tray'
// - 跟随系统主题（useSystemTheme）：nativeTheme 监听 + 应用/广播
import { startSystemThemeWatcher, stopSystemThemeWatcher } from './config/system-theme'
// 系统设置补充实现批次 C：
// - 自动备份（enableAutoBackup + backupInterval）：启动定时器（whenReady）+ 退出清理
import { stopAutoBackupTimer, syncAutoBackupTimer } from './utils/auto-backup'

// D-3/FUN-03：关闭/退出落盘协议通道名（ARC-03：收口到共享 IPC 常量）
const EDITOR_FLUSH_CHANNEL = IPC.EDITOR.FLUSH_CONTENT
const EDITOR_FLUSH_DONE_CHANNEL = IPC.EDITOR.FLUSH_CONTENT_DONE
// 等待渲染层回执的超时时间（毫秒），超时后兜底继续关闭流程
const EDITOR_FLUSH_TIMEOUT_MS = 2000

// P1/C-04：监听台账组件 ID——进程级主题更新监听为 palette 级（persistent）注册；
// 关闭前 flush 回执为"主窗口一次关闭流程"级（随 finish/cleanupAll 清理）
const GLOBAL_MAIN_INDEX_COMPONENT_ID = 'global-main-index'
const MAIN_WINDOW_FLUSH_COMPONENT_ID = 'main-window-flush'

let mainWindow: Electron.CrossProcessExports.BrowserWindow

// 「记住窗口位置和大小」的持久化监听清理函数（挂入 cleanupApp；activate 重建窗口时随
// createWindow 重新挂接，旧窗口的监听随窗口销毁失效、dispose 函数仅负责清计时器）
let disposeWindowBoundsPersistence: (() => void) | null = null

/**
 * 通知渲染层立即 flush 编辑器内容（取消防抖并把当前内容发到既有内容同步通道）。
 * 等待渲染层回发 'baize:editor:flush-content-done'，2 秒超时兜底（D-3）。
 *
 * P1/C-04：回执监听由直连 ipcMain.on 迁移到 ipcListenerManager（组件级注册，
 * finish 时 unregister 精确移除；异常/退出场景由 cleanupAll 清理非 persistent 残留）。
 * P1/N-05：回执通道同样校验发送方——非主窗口发送的伪造回执直接忽略。
 */
function flushEditorContent(win: BrowserWindow): Promise<void> {
    return new Promise((resolve) => {
        if (!win || win.isDestroyed() || win.webContents.isDestroyed()) {
            resolve()
            return
        }
        let settled = false
        const finish = (): void => {
            if (settled) {
                return
            }
            settled = true
            clearTimeout(timeout)
            ipcListenerManager.unregister(EDITOR_FLUSH_DONE_CHANNEL, onDone)
            resolve()
        }
        const onDone = withSenderCheck(EDITOR_FLUSH_DONE_CHANNEL, (): void => finish(), {
            kind: 'on'
        })
        const timeout = setTimeout(finish, EDITOR_FLUSH_TIMEOUT_MS)
        ipcListenerManager.register(
            EDITOR_FLUSH_DONE_CHANNEL,
            onDone,
            MAIN_WINDOW_FLUSH_COMPONENT_ID
        )
        try {
            win.webContents.send(EDITOR_FLUSH_CHANNEL)
        } catch (err) {
            logger.error('发送编辑器内容 flush 请求失败', err)
            finish()
        }
    })
}

function createWindow(): void {
    // 当前窗口是否已完成"关闭前落盘"，用于放行第二次 close（D-3）
    let flushedForClose = false

    // 记住窗口位置和大小（批次 A）：开关开启时恢复上次持久化的窗口边界，
    // 与任一显示器工作区不相交（如外接显示器已拔掉）或非法时回退默认 1280×800 居中。
    const initialSystemSetting = getSystemSetting()
    const initialBounds = resolveInitialWindowOptions(
        initialSystemSetting.rememberWindowSize,
        initialSystemSetting.windowBounds,
        screen.getAllDisplays().map((display) => display.workArea)
    )

    mainWindow = new BrowserWindow({
        width: initialBounds.width,
        height: initialBounds.height,
        x: initialBounds.x,
        y: initialBounds.y,
        show: false,
        title: tMain('mainMsg.app.windowTitle'),
        frame: false,
        autoHideMenuBar: false,
        icon: join(__dirname, '../resources/icon/baize_mirror_dark_512x512.ico'),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: !is.dev,
            allowRunningInsecureContent: is.dev ? true : false
        }
    })

    setMainWindow(mainWindow)
    // P1/N-05：同步受信主窗口引用（index.ts 直连注册的通道——主题更新、关闭回执——
    // 同样依赖该登记；macOS activate 重建窗口时随 createWindow 一并刷新）
    setTrustedMainWindow(mainWindow)

    // D-3/FUN-03：拦截窗口关闭——先让渲染层 flush 编辑器内容，
    // 若当前文件仍有未保存修改则落盘，再真正关闭。
    // 批次 B #4：显式退出（托盘「退出」/before-quit 已置 appState 退出标志）时直接放行
    // close（flush 落盘已在 before-quit 完成）；否则拦截并在 flush 完成后按
    // minimizeToTray 决定「隐藏到托盘」还是「真实关闭」。
    mainWindow.on('close', async (event) => {
        if (flushedForClose) {
            return
        }
        if (appState.isQuitting) {
            return
        }
        event.preventDefault()
        try {
            await flushEditorContent(mainWindow)
            if (appState.isDirty()) {
                await SaveActiveFile()
            }
        } catch (err) {
            logger.error('关闭窗口前落盘失败', err)
        }
        // 批次 B #4：flush 落盘完成后，minimizeToTray 开启且非显式退出 → 隐藏窗口
        // （托盘常驻）；隐藏分支不置 flushedForClose，下次点关闭重新走 flush 协议
        // （保证每次隐藏前都完成落盘）。
        if (getSystemSetting().minimizeToTray && !appState.isQuitting) {
            ensureTrayCreated()
            mainWindow.hide()
            return
        }
        flushedForClose = true
        mainWindow.close()
    })

    // 记住窗口位置和大小（批次 A）：resize/move 500ms 防抖写回 system store，
    // close 时立即落盘（与上方关闭落盘协议同为 close 监听，互不影响）；
    // dispose 挂入 cleanupApp（窗口销毁与退出清理）。
    disposeWindowBoundsPersistence?.()
    disposeWindowBoundsPersistence = attachWindowBoundsPersistence(mainWindow, {
        isEnabled: () => getSystemSetting().rememberWindowSize === true,
        save: (bounds) => saveSystemSetting({ windowBounds: bounds })
    })

    mainWindow.on('ready-to-show', async () => {
        // mainWindow.maximize() // 欢迎界面不自动最大化
        mainWindow.show()

        logger.setMainWindow(mainWindow)
        logger.info('白泽笔记启动成功')

        const theme = getCurrentThemeStyles()
        mainWindow.webContents.send(IPC.THEME.INIT_THEME_STYLES, theme)

        const systemSetting = getSystemSetting()
        // ARC-04：字体 CSS 组装收敛到 system-setting.buildFontCss（与设置变更时
        // config-manager 的重新注入共用同一实现）
        mainWindow.webContents.insertCSS(buildFontCss(systemSetting))

        const editorSetting = getEditorSetting()
        mainWindow.webContents.send(IPC.EDITOR.INIT_SETTING, editorSetting)

        // 系统设置补充实现批次 A（#1/#2）：autoOpenLastFile / autoOpenLastFolder 开启时
        // 自动执行与欢迎页入口相同的恢复动作（先 WELCOME_ENTER_MAIN 再投递数据事件）；
        // 均未开启时保持历史行为（后台恢复，show-welcome=false 用户仍能恢复上次会话）。
        if (systemSetting.autoOpenLastFile || systemSetting.autoOpenLastFolder) {
            await restoreLastOpenedAtStartup(mainWindow, systemSetting)
        } else {
            await restoreLastOpenedFile()
        }
    })

    RegisterShortKeys(mainWindow)
    utils.globalInitialize(mainWindow)

    // P0 安全（导航边界）：主窗口只允许导航到受信来源——
    // 1) 开发模式下的 ELECTRON_RENDERER_URL（Vite dev server）；
    // 2) 打包/构建后的本地 renderer/index.html（file:）。
    // 其余目标（渲染层被拖入远程链接、页面 location 跳转、远程重定向、file:/javascript:/
    // data:/自定义协议等）一律拦截，防止不可信页面替换应用界面后接触 IPC 与本地文件。
    const rendererIndexPath = join(__dirname, '../renderer/index.html')
    const devServerUrl =
        is.dev && process.env['ELECTRON_RENDERER_URL']
            ? process.env['ELECTRON_RENDERER_URL']
            : undefined
    const blockIllegalNavigation = (event: Electron.Event, url: string): void => {
        if (isAllowedAppNavigation(url, { devUrl: devServerUrl, rendererIndexPath })) {
            return
        }
        console.warn(`[Security] 已拦截主窗口非法导航：${url}`)
        event.preventDefault()
    }
    mainWindow.webContents.on('will-navigate', blockIllegalNavigation)
    mainWindow.webContents.on('will-redirect', blockIllegalNavigation)

    // P0 安全（shell 协议白名单）：主窗口内 window.open / 中键新窗口一律不创建新窗口；
    // 仅 http/https 交给系统浏览器打开，其余协议（file:/javascript:/data:/自定义协议）拒绝并告警。
    mainWindow.webContents.setWindowOpenHandler((details) => {
        if (isSafeExternalUrl(details.url)) {
            void openExternalSafely(details.url)
        } else {
            console.warn(`[Security] 已拦截主窗口打开非 http/https 链接：${details.url}`)
        }
        return { action: 'deny' }
    })

    if (devServerUrl) {
        mainWindow.loadURL(devServerUrl)
    } else {
        mainWindow.loadFile(rendererIndexPath)
    }

    // A-1/ARC-06：IPC 注册已移出 createWindow，改在 app.whenReady 后一次性执行，
    // 避免 macOS activate 重建窗口时重复注册 ipcMain.handle（抛错）与
    // ipcMain.on（累积重复监听器）。

    // D-2/FUN-04：启动时尊重自动保存开关，仅启用时启动定时器
    const systemSetting = getSystemSetting()
    if (systemSetting.autoSaveEnabled) {
        const autoSaveInterval = (systemSetting.autoSaveInterval || 60) * 1000
        StartAutoSaveFileTime(autoSaveInterval)
    }
}

// D-3/FUN-03：应用退出（before-quit）同样走"flush → 脏则保存"路径
let flushedForQuit = false

app.whenReady().then(() => {
    initUserDataDirectory()

    // AS-9：注册远程图表外发阻断（PlantUML 本地渲染不可用时不再把图表源码发往
    // plantuml.com）。session 在单测桩中可能缺失：registerRemoteResourceGuard 自身
    // try/catch + 空 session 安全跳过，不阻断启动。
    try {
        registerRemoteResourceGuard(session?.defaultSession ?? null)
    } catch (error) {
        console.warn('[Security] 远程资源外发阻断注册失败（AS-9）：', error)
    }

    // 注册配置 IPC 处理器
    registerConfigIpcHandlers()

    // 批次 B #7：跟随系统主题——启动 nativeTheme 监听并立即对齐一次当前系统深浅色
    // （创建窗口前应用，ready-to-show 时 INIT_THEME_STYLES 取到的即是最新主题）
    startSystemThemeWatcher()

    // 批次 C #8/#9：自动备份——按 system store 的 enableAutoBackup/backupInterval
    // 启动定时器（开启时先立即执行一次，无活动文件/工作区时静默跳过）；
    // 保存设置时的重启由 config-manager 的 syncAutoBackupTimer 处理。
    syncAutoBackupTimer()

    electronApp.setAppUserModelId('com.electron')

    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    // A-3/FUN-20：主题广播 payload 修正——渲染端 handleThemeUpdate 期望
    // { themeStyles, monacoTheme, separateEditorTheme } 形态（原直接广播
    // ThemeStyles 对象本体，会被渲染端丢弃并报 "Received invalid theme data"）。
    // 渲染层可传入最新选择的主题类型/编辑器主题参数，避免与主进程 store
    // 双轨不同步（ARC-05 遗留）时向所有窗口广播旧值。
    //
    // P1/C-03/C-04：监听注册迁移到 ipcListenerManager（台账可见、防重复注册），
    // 广播收敛到 broadcastThemeToAllWindows（主进程唯一实现，替换历史上
    // ShowThemeSettingDialog 里误用 window.electronAPI.broadcastTheme 的跨进程调用）。
    // P1/N-05：主题更新会改写渲染层外观并广播到所有窗口，仅主窗口可信。
    ipcListenerManager.registerOnce(
        IPC.THEME.UPDATE_THEME,
        withSenderCheck(
            IPC.THEME.UPDATE_THEME,
            (
                _event: Electron.IpcMainEvent,
                themeType?: string,
                monacoTheme?: string,
                separate?: boolean
            ) => {
                const theme =
                    typeof themeType === 'string'
                        ? getThemeStylesByType(themeType as ThemeType)
                        : getCurrentThemeStyles()
                if (!theme) {
                    logger.error('[Main] Failed to get current theme styles')
                    return
                }
                broadcastThemeToAllWindows({
                    themeStyles: theme,
                    monacoTheme: typeof monacoTheme === 'string' ? monacoTheme : getMonacoTheme(),
                    separateEditorTheme:
                        typeof separate === 'boolean' ? separate : getSeparateEditorTheme()
                })
            }
        ),
        GLOBAL_MAIN_INDEX_COMPONENT_ID
    )

    createWindow()

    // A-1/ARC-06：IPC 注册一次性化——注册移出 createWindow，
    // 在 app.whenReady 后仅执行一次；macOS activate 重建窗口不再重复注册。
    // AS-12 复核：createWindow 内的窗口级监听（close / ready-to-show / 导航拦截）
    // 绑定在新建窗口实例上，不随重建累积；全局 IPC 监听在此一次性注册；
    // globalShortcut 由 short-key-register 内部幂等控制（重建窗口只更新目标窗口引用）。
    dialogs.MainWindowListenDialogsEvent(mainWindow)
    utils.MainWindowListenUtilsEvent(mainWindow)
    registerIpcHandlers(mainWindow)
    // PF-08：PlantUML 本地离线渲染 IPC（隐藏窗口 + 串行队列 + LRU 缓存）
    registerPlantumlLocalRenderIpc()

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

function cleanupApp(): void {
    // MEM-11：退出时停止自动保存定时器，避免残留 interval 继续写盘
    StopAutoSaveFileTime()
    // PF-05：退出/关闭窗口时关闭目录 fs.watch 监听并清理防抖计时器，
    // 避免 watcher 回调在窗口销毁后继续触发（异常安全：内部 try/finally 关闭）
    CleanupDirectoryWatch()
    dialogs.CleanupMainWindowDialogsEvent()
    // PF-08：销毁 PlantUML 本地渲染隐藏窗口（不阻塞应用退出）
    disposePlantumlLocalWindows()
    // 记住窗口位置和大小（批次 A）：清理 bounds 防抖计时器与窗口监听
    disposeWindowBoundsPersistence?.()
    disposeWindowBoundsPersistence = null
    // 批次 B #7：清理 nativeTheme 跟随监听（随应用退出）
    stopSystemThemeWatcher()
    // 批次 C #8/#9：退出时停止自动备份定时器，避免残留定时器继续写盘
    stopAutoBackupTimer()
    // 批次 B #4：销毁托盘（进程退出时清理系统资源；设置开关关闭不触发此处）
    disposeTray()
    ipcListenerManager.cleanupAll()

    const windows = BrowserWindow.getAllWindows()
    windows.forEach((window) => {
        if (!window.isDestroyed()) {
            window.destroy()
        }
    })
}

app.on('window-all-closed', () => {
    cleanupApp()
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', (event) => {
    // 批次 B #4：进入退出流程即置显式退出标志——随后窗口 close 事件不再被
    // 「最小化到托盘」拦截（否则 hide 会阻止窗口关闭、进程无法完全退出）。
    appState.setQuitting(true)
    if (flushedForQuit) {
        cleanupApp()
        return
    }
    // D-3/FUN-03：退出前先 flush 编辑器内容并落盘未保存修改
    if (mainWindow && !mainWindow.isDestroyed()) {
        event.preventDefault()
        void (async () => {
            try {
                await flushEditorContent(mainWindow)
                if (appState.isDirty()) {
                    await SaveActiveFile()
                }
            } catch (err) {
                logger.error('退出前落盘失败', err)
            }
            flushedForQuit = true
            app.quit()
        })()
        return
    }
    cleanupApp()
})
