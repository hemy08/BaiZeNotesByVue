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
    buildFontCss,
    // 2026-11-18（遗留清单 #12）：窗口就绪后异步预热 Monaco 主题缓存
    warmupMonacoThemeCache,
    // 1.3.6：存量设置迁移（旧默认 minimizeToTray/enableAutoBackup=true → false）
    migrateLegacyOptInSettings
} from './config'
import type { ThemeType } from './config'
import { StartAutoSaveFileTime, StopAutoSaveFileTime, SaveActiveFile } from './utils/file-utils'
// PF-05：目录树 fs.watch 监听的退出清理（仅新增生命周期管理，不改变原有落盘/清理逻辑）
import { CleanupDirectoryWatch } from './utils/file-utils/file-operations'
import { RegisterShortKeys } from './config'
import { logger } from './utils/logger'
import { ipcListenerManager } from './ipc/ipc-listener-manager'
import { resetWelcomeState } from './ipc/welcome-state'
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
//   （showMainWindow 复用为单实例锁 second-instance 的窗口恢复路径）
import { disposeTray, ensureTrayCreated, notifyMinimizedToTray, showMainWindow } from './utils/tray'
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

    // P2-5：新窗口（含 macOS activate 重建）重置渲染层就绪握手状态，
    // 并清掉上一窗口残留的启动恢复等待
    rendererReadyReceived = false
    clearStartupRestorePending()

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

    // 2026-11-18（用户反馈）：新窗口创建即显示欢迎页，复位主界面状态（macOS activate 重建同样生效）
    resetWelcomeState()
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
            // 1.3.6：首次隐藏到托盘时给系统通知——Windows 托盘图标可能位于任务栏
            // 溢出区，用户容易误以为应用已退出（进程仍在后台）
            notifyMinimizedToTray()
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

    mainWindow.on('ready-to-show', () => {
        // mainWindow.maximize() // 欢迎界面不自动最大化
        mainWindow.show()

        logger.setMainWindow(mainWindow)
        logger.info('白泽笔记启动成功')

        // 主题初始样式由渲染层 onMounted 经 THEME.GET_CURRENT_THEME_STYLES invoke 拉取
        // （原 THEME.INIT_THEME_STYLES 广播全仓无监听，属空转通道，2026-11-18 清理）

        const systemSetting = getSystemSetting()
        // ARC-04：字体 CSS 组装收敛到 system-setting.buildFontCss（与设置变更时
        // config-manager 的重新注入共用同一实现）
        mainWindow.webContents.insertCSS(buildFontCss(systemSetting))

        const editorSetting = getEditorSetting()
        mainWindow.webContents.send(IPC.EDITOR.INIT_SETTING, editorSetting)

        // 系统设置补充实现批次 A（#1/#2）：autoOpenLastFile / autoOpenLastFolder 开启时
        // 自动执行与欢迎页入口相同的恢复动作（先 WELCOME_ENTER_MAIN 再投递数据事件）；
        // 均未开启时保持历史行为（后台恢复，show-welcome=false 用户仍能恢复上次会话）。
        // P2-5：触发时机由 ready-to-show 改为等待渲染层就绪握手（IPC.RENDER.READY，
        // 见 armStartupRestore / runStartupRestore）：握手晚于 ready-to-show 时以握手
        // 为准，3s 未收到则超时兜底恢复。
        armStartupRestore(mainWindow)

        // 2026-11-18（遗留清单 #12）：窗口就绪后异步预热 Monaco 主题缓存，
        // 避免首次打开主题相关界面时在主线程同步读取全部主题 JSON（冷启动 IO 阻塞）。
        void warmupMonacoThemeCache()
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

// P2-10：单实例锁（必须在 app ready 之前申请，否则无效）。
// 未获得锁说明已有实例在运行：本实例立即退出（whenReady 内短路，不创建窗口、
// 不注册监听），由既有实例的 second-instance 回调恢复并聚焦主窗口——
// 防止二次启动造成双实例双写配置、双份自动保存/备份定时器。
const gotSingleInstanceLock = app.requestSingleInstanceLock()
if (!gotSingleInstanceLock) {
    app.quit()
} else {
    // 复用托盘「显示主窗口」的恢复路径（getLiveMainWindow + show/restore/focus）：
    // 主窗口可能隐藏到托盘或最小化，先恢复再聚焦
    app.on('second-instance', () => {
        showMainWindow()
    })
}

// P2-5：渲染层就绪握手（App.vue onMounted 完成后经 IPC.RENDER.READY 发送）。
// 启动恢复（restoreLastOpenedAtStartup / restoreLastOpenedFile）不再在
// ready-to-show 直接触发：主进程繁忙时恢复消息可能早于渲染层监听器注册被丢弃
// （自动恢复间歇性静默失效）。ready-to-show 后 armStartupRestore 挂起等待握手，
// STARTUP_RESTORE_FALLBACK_MS 内未收到则兜底恢复（渲染层异常时仅推迟最多 3s，
// 不改变历史行为）。
const STARTUP_RESTORE_FALLBACK_MS = 3000
// 单主窗口场景的握手状态；macOS activate 重建窗口时随 createWindow 重置
let rendererReadyReceived = false
let startupRestorePendingWindow: BrowserWindow | null = null
let startupRestoreFallbackTimer: NodeJS.Timeout | null = null

/** 清空启动恢复等待状态（新窗口挂接前与 cleanupApp 退出清理复用） */
function clearStartupRestorePending(): void {
    if (startupRestoreFallbackTimer !== null) {
        clearTimeout(startupRestoreFallbackTimer)
        startupRestoreFallbackTimer = null
    }
    startupRestorePendingWindow = null
}

/** 执行启动恢复（原 ready-to-show 内联逻辑迁出，握手与超时兜底两个入口共用） */
async function runStartupRestore(win: BrowserWindow): Promise<void> {
    const systemSetting = getSystemSetting()
    if (systemSetting.autoOpenLastFile || systemSetting.autoOpenLastFolder) {
        await restoreLastOpenedAtStartup(win, systemSetting)
    } else {
        await restoreLastOpenedFile()
    }
}

/** ready-to-show 后挂接启动恢复：握手已到则立即执行，否则等握手 + 3s 超时兜底 */
function armStartupRestore(win: BrowserWindow): void {
    clearStartupRestorePending()
    startupRestorePendingWindow = win
    if (rendererReadyReceived) {
        // 握手早于 ready-to-show（渲染层先完成挂载、窗口后显示）：立即恢复
        startupRestorePendingWindow = null
        void runStartupRestore(win)
        return
    }
    startupRestoreFallbackTimer = setTimeout(() => {
        startupRestoreFallbackTimer = null
        const pending = startupRestorePendingWindow
        startupRestorePendingWindow = null
        if (pending && !pending.isDestroyed() && !pending.webContents.isDestroyed()) {
            void runStartupRestore(pending)
        }
    }, STARTUP_RESTORE_FALLBACK_MS)
}

app.whenReady().then(() => {
    // P2-10：未获得单实例锁的实例只负责退出，不创建窗口、不注册监听
    if (!gotSingleInstanceLock) {
        return
    }

    // 1.3.6：存量设置迁移——1.3.1~1.3.5 期间 minimizeToTray / enableAutoBackup 默认 true，
    // 用户保存过系统设置即把 true 落盘，导致升级后「关闭窗口」退化为「隐藏到托盘」
    // （进程名仍出现在任务管理器）。此处在建窗/建定时器之前把旧默认值重置为 false
    // 并写一次性版本标记；用户确需托盘/自动备份可在系统设置中重新开启。
    try {
        if (migrateLegacyOptInSettings()) {
            logger.info('[Config] 已迁移存量系统设置：minimizeToTray / enableAutoBackup → false')
        }
    } catch (err) {
        logger.error('[Config] 存量系统设置迁移失败', err)
    }
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
    // 启动定时器（P1-2：仅调度、不立即执行，首次备份在第一个间隔到点）；
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

    // P2-5：渲染层就绪握手——App.vue onMounted 注册完监听器后经 preload 发送
    // IPC.RENDER.READY。主进程收到后执行启动恢复（armStartupRestore 挂起的窗口）；
    // registerOnce 为 persistent 注册，macOS window-all-closed → cleanupAll 后
    // activate 重建窗口仍可接收新窗口的握手。
    // P1/N-05：仅受信主窗口可触发（防其他窗口/被注入页面伪造握手提前恢复）。
    ipcListenerManager.registerOnce(
        IPC.RENDER.READY,
        withSenderCheck(IPC.RENDER.READY, () => {
            rendererReadyReceived = true
            const pending = startupRestorePendingWindow
            if (pending !== null) {
                startupRestorePendingWindow = null
                if (startupRestoreFallbackTimer !== null) {
                    clearTimeout(startupRestoreFallbackTimer)
                    startupRestoreFallbackTimer = null
                }
                void runStartupRestore(pending)
            }
        }),
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
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow()
            // P3（审查）：macOS window-all-closed 时 cleanupApp 已停止系统主题跟随
            // 监听与自动备份定时器，activate 重建窗口后需与窗口生命周期一并重启
            // （与 createWindow 内 auto-save 的 StartAutoSaveFileTime 重启模式一致；
            // 两者均幂等：startSystemThemeWatcher 单例注册防重复，syncAutoBackupTimer
            // 按当前设置同步启动/停止）。
            startSystemThemeWatcher()
            syncAutoBackupTimer()
        }
    })
})

function cleanupApp(): void {
    // MEM-11：退出时停止自动保存定时器，避免残留 interval 继续写盘
    StopAutoSaveFileTime()
    // P2-5：清理启动恢复握手等待（防退出后 3s 兜底定时器再触发恢复）
    clearStartupRestorePending()
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
