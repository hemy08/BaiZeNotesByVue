import { app, BrowserWindow, session, screen } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as utils from './utils/utils'
import * as dialogs from './dialogs/dialogs'
import { restoreLastOpenedFile } from './utils/file-state'
import {
    getCurrentThemeStyles,
    getThemeStylesByType,
    // 结构优化 1.1（H1）：追加导入主题/快速链接读取函数，用于注入 utils 侧提供者
    getAllThemes,
    getAllMonacoThemes,
    getQuickLinks,
    getSystemSetting,
    saveSystemSetting,
    getEditorSetting,
    buildFontCss,
    configManager,
    // 2026-11-18（遗留清单 #12）：窗口就绪后异步预热 Monaco 主题缓存
    warmupMonacoThemeCache,
    // 1.3.6：存量设置迁移（旧默认 minimizeToTray/enableAutoBackup=true → false）
    migrateLegacyOptInSettings
} from './config'
import { StartAutoSaveFileTime, StopAutoSaveFileTime, SaveActiveFile } from './utils/file-utils'
import { confirmUnsavedChangesClose } from './utils/close-confirm'
// PF-05：目录树 fs.watch 监听的退出清理（仅新增生命周期管理，不改变原有落盘/清理逻辑）
import { CleanupDirectoryWatch } from './utils/file-utils/file-operations'
import { RegisterShortKeys } from './config'
import { logger } from './utils/logger'
import { ipcListenerManager } from './ipc/ipc-listener-manager'
import { resetWelcomeState } from './ipc/welcome-state'
import { markMainViewEntered } from './ipc/welcome-state'
// P1/N-05：IPC 发送方授权校验（关闭落盘回执通道的发送方包装）
import { withSenderCheck } from './utils/ipc-security'
import { initUserDataDirectory, getIconPath } from './utils/app-paths'
import { appState } from './utils/app-state'
// 结构优化第 2 批 2.4（M1）：主进程全局状态上下文（主窗口引用/退出标志/握手状态等）
import { getAppContext } from './app-context'
// 结构优化第 2 批 2.4（M2）：IPC 注册清单——whenReady 后的注册调用集中到 registry，
// 本入口不再逐一 import 各注册模块
import { registerAll, registerPreWindowIpc } from './ipc/registry'
import { IPC } from '../shared/ipc-channels'
// PF-08：PlantUML 本地离线渲染隐藏窗口的退出清理（注册已迁入 ipc/registry）
import { disposePlantumlLocalWindows } from './renders/plantuml-local'
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
// 结构优化 1.1（H1）：utils 侧配置读取提供者——由本入口注入 config 真实实现，
// 使 src/main/utils/** 不再静态 import src/main/config/**（依赖倒置，方向单向 config → utils）
import {
    setQuickLinksProvider,
    setSystemSettingProvider,
    setThemeApiProvider
} from './utils/providers'
// P1 性能基线：启动阶段 mark/measure + 诊断上报（默认关闭；仅 BAIZE_PERF/--baize-perf/dev 下输出）
import {
    isPerfDiagnosticsEnabled,
    perfMark,
    perfMeasure,
    setupPerfDiagnostics,
    withPerfQueryParam
} from './utils/perf'
import { PERF_MARK, PERF_QUERY_PARAM, PERF_SEGMENT_MEASURE } from '../shared/constants/perf'

/* ============================================================================
 * 结构优化 1.1（H1）：utils 配置读取提供者注入
 *
 * 时机：模块顶层、全部 import 求值完成后立即执行，早于 whenReady / createWindow /
 * registerPreWindowIpc / registerAll（M2 起 IPC 注册集中于 ipc/registry）。utils 各模块只在
 * 「函数调用时」经 provider 读取（无模块级缓存），因此此后所有运行期路径（自动备份定时器、
 * 主进程 i18n、目录选择默认路径、主题/快速链接 IPC）拿到的都是 config 真实实现，
 * 行为与改造前一致。
 *
 * 容错：setter 对 undefined/非函数入参回退安全默认值；即使本注入因异常顺序未执行，
 * utils 侧也只回退默认值而不崩溃（正常启动流程不会走到回退分支）。
 * ========================================================================== */
setSystemSettingProvider(getSystemSetting)
setQuickLinksProvider(getQuickLinks)
setThemeApiProvider({
    getCurrentThemeStyles,
    getAllThemes,
    getAllMonacoThemes,
    getThemeStylesByType
})

// D-3/FUN-03：关闭/退出落盘协议通道名（ARC-03：收口到共享 IPC 常量）
const EDITOR_FLUSH_CHANNEL = IPC.EDITOR.FLUSH_CONTENT
const EDITOR_FLUSH_DONE_CHANNEL = IPC.EDITOR.FLUSH_CONTENT_DONE
// 等待渲染层回执的超时时间（毫秒），超时后兜底继续关闭流程
const EDITOR_FLUSH_TIMEOUT_MS = 2000

// 第 4 批 P3 清理：主窗口图标文件名（resources/icon 下的 512 尺寸图标）。
// 目录一律经 app-paths.getIconPath() 解析——开发环境=项目 resources/icon，
// 打包后=process.resourcesPath/icon（electron-builder.yml 的 extraResources 复制目标），
// 不再用 `join(__dirname, '../resources/icon/...')` 硬编码相对构建目录的路径。
const MAIN_WINDOW_ICON_FILE_NAME = 'baize_mirror_dark_512x512.ico'

// P1/C-04：关闭前 flush 回执为"主窗口一次关闭流程"级组件注册（随 finish/cleanupAll 清理）。
// 进程级主题更新/就绪握手监听的组件 ID 已随注册迁移到 ipc/registry（global-main-index）。
const MAIN_WINDOW_FLUSH_COMPONENT_ID = 'main-window-flush'

/**
 * 主窗口引用与进程级可变状态统一由 AppContext 持有（结构优化第 2 批 2.4 / M1）：
 * - mainWindow → AppContext.mainWindow（createWindow 写入，窗口重建时刷新）；
 * - rendererReadyReceived → AppContext.rendererReady.received；
 * - flushedForQuit / flushedForClose → AppContext.quit.*；
 * - 启动恢复等待 → AppContext.startupRestore.*；
 * - disposeWindowBoundsPersistence → AppContext.windowBounds.disposePersistence。
 * 本文件不再定义模块级 let，全部经 getAppContext() 读写（resetAppContext 可整体复位）。
 */

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

function createWindow(): BrowserWindow {
    // M1：主窗口引用与各生命周期 flag 统一在 AppContext（进程内唯一真源）
    const context = getAppContext()
    // 当前窗口是否已完成"关闭前落盘"（D-3）——随窗口创建复位（原函数级 let 迁入 context）
    context.quit.flushedForClose = false

    // P2-5：新窗口（含 macOS activate 重建）重置渲染层就绪握手状态，
    // 并清掉上一窗口残留的启动恢复等待
    context.rendererReady.received = false
    clearStartupRestorePending()

    // 记住窗口位置和大小（批次 A）：开关开启时恢复上次持久化的窗口边界，
    // 与任一显示器工作区不相交（如外接显示器已拔掉）或非法时回退默认 1280×800 居中。
    const initialSystemSetting = getSystemSetting()
    const initialBounds = resolveInitialWindowOptions(
        initialSystemSetting.rememberWindowSize,
        initialSystemSetting.windowBounds,
        screen.getAllDisplays().map((display) => display.workArea)
    )

    const mainWindow = new BrowserWindow({
        width: initialBounds.width,
        height: initialBounds.height,
        x: initialBounds.x,
        y: initialBounds.y,
        show: false,
        title: tMain('mainMsg.app.windowTitle'),
        frame: false,
        autoHideMenuBar: false,
        icon: join(getIconPath(), MAIN_WINDOW_ICON_FILE_NAME),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            nodeIntegration: false,
            contextIsolation: true,
            sandbox: true,
            webSecurity: !is.dev,
            allowRunningInsecureContent: is.dev ? true : false
        }
    })

    // P1 性能基线：BrowserWindow 构造完成即 window-create（后续 loadURL/loadFile 为异步加载）
    perfMark(PERF_MARK.WINDOW_CREATE)
    perfMeasure(PERF_MARK.WINDOW_CREATE)

    // 2026-11-18（用户反馈）：新窗口创建即显示欢迎页，复位主界面状态（macOS activate 重建同样生效）
    resetWelcomeState()
    // P1/N-05 / M1：主窗口引用登记到 AppContext（appState / ipc-security 受信主窗口 /
    // handlers 当前主窗口均读取同一字段；macOS activate 重建窗口时随 createWindow 一并刷新）
    context.mainWindow = mainWindow

    // D-3/FUN-03：拦截窗口关闭——先让渲染层 flush 编辑器内容，
    // 若当前文件仍有未保存修改则落盘，再真正关闭。
    // 批次 B #4：显式退出（托盘「退出」/before-quit 已置 appState 退出标志）时直接放行
    // close（flush 落盘已在 before-quit 完成）；否则拦截并在 flush 完成后按
    // minimizeToTray 决定「隐藏到托盘」还是「真实关闭」。
    mainWindow.on('close', async (event) => {
        if (context.quit.flushedForClose) {
            return
        }
        if (appState.isQuitting) {
            return
        }
        event.preventDefault()
        try {
            await flushEditorContent(mainWindow)
            if (appState.isDirty()) {
                // 2026-11-20（用户需求）：关闭前若仍有未保存修改，弹框让用户选择
                // 「保存并关闭 / 不保存 / 取消」；取消则保持窗口与编辑状态。
                const choice = await confirmUnsavedChangesClose(mainWindow)
                if (choice === 'cancel') {
                    return
                }
                if (choice === 'save' && !(await SaveActiveFile())) {
                    // 保存失败/另存为被取消：不关闭，避免静默丢内容
                    return
                }
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
        context.quit.flushedForClose = true
        mainWindow.close()
    })

    // 记住窗口位置和大小（批次 A）：resize/move 500ms 防抖写回 system store，
    // close 时立即落盘（与上方关闭落盘协议同为 close 监听，互不影响）；
    // dispose 挂入 cleanupApp（窗口销毁与退出清理）；M1：清理函数引用存入 AppContext。
    context.windowBounds.disposePersistence?.()
    context.windowBounds.disposePersistence = attachWindowBoundsPersistence(mainWindow, {
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

    // P1 性能基线：诊断模式下给渲染层 URL 追加 ?baizePerf=1，渲染层据此打开
    // performance.mark/measure 采集并经控制台哨兵上报（普通启动 URL 不变，零影响）。
    const perfDiagnosticsEnabled = isPerfDiagnosticsEnabled()
    if (devServerUrl) {
        mainWindow.loadURL(perfDiagnosticsEnabled ? withPerfQueryParam(devServerUrl) : devServerUrl)
    } else if (perfDiagnosticsEnabled) {
        mainWindow.loadFile(rendererIndexPath, { query: { [PERF_QUERY_PARAM]: '1' } })
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

    return mainWindow
}

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
// 单主窗口场景的握手/等待状态；M1 起统一保存在 AppContext（rendererReady.received /
// startupRestore.pendingWindow / startupRestore.fallbackTimer），窗口重建时随 createWindow 重置。

/** 清空启动恢复等待状态（新窗口挂接前与 cleanupApp 退出清理复用） */
function clearStartupRestorePending(): void {
    const context = getAppContext()
    if (context.startupRestore.fallbackTimer !== null) {
        clearTimeout(context.startupRestore.fallbackTimer)
        context.startupRestore.fallbackTimer = null
    }
    context.startupRestore.pendingWindow = null
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
    const context = getAppContext()
    context.startupRestore.pendingWindow = win
    if (context.rendererReady.received) {
        // 握手早于 ready-to-show（渲染层先完成挂载、窗口后显示）：立即恢复
        context.startupRestore.pendingWindow = null
        void runStartupRestore(win)
        return
    }
    context.startupRestore.fallbackTimer = setTimeout(() => {
        context.startupRestore.fallbackTimer = null
        const pending = context.startupRestore.pendingWindow
        context.startupRestore.pendingWindow = null
        if (pending && !pending.isDestroyed() && !pending.webContents.isDestroyed()) {
            void runStartupRestore(pending)
        }
    }, STARTUP_RESTORE_FALLBACK_MS)
}

/**
 * 渲染层就绪握手回调（M2：作为 registerAll 的 onRendererReady 钩子注入 registry）。
 *
 * 改造前该逻辑内联在 main/index.ts 的 IPC.RENDER.READY 监听回调里；注册迁移到
 * registry 后，跨模块行为经钩子回传本入口：
 * 1) 记录当前窗口握手状态（AppContext.rendererReady.received）；
 * 2) 若 ready-to-show 已挂起恢复则立即执行，并清掉 3s 超时兜底。
 */
function handleRendererReady(): void {
    // P1 性能基线：渲染层握手到达 = renderer-ready（渲染层已挂载并注册完 IPC 监听器）
    perfMark(PERF_MARK.RENDERER_READY)
    perfMeasure(PERF_MARK.RENDERER_READY)
    perfMeasure(PERF_SEGMENT_MEASURE.WINDOW_TO_RENDERER_READY, PERF_MARK.WINDOW_CREATE)
    const context = getAppContext()
    context.rendererReady.received = true
    const pending = context.startupRestore.pendingWindow
    if (pending !== null) {
        context.startupRestore.pendingWindow = null
        if (context.startupRestore.fallbackTimer !== null) {
            clearTimeout(context.startupRestore.fallbackTimer)
            context.startupRestore.fallbackTimer = null
        }
        void runStartupRestore(pending)
    }
}

app.whenReady().then(() => {
    // P2-10：未获得单实例锁的实例只负责退出，不创建窗口、不注册监听
    if (!gotSingleInstanceLock) {
        return
    }

    // P1 性能基线：whenReady 回调进入 = app-ready（进程启动 → 主进程就绪）
    perfMark(PERF_MARK.APP_READY)
    perfMeasure(PERF_MARK.APP_READY)

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

    // M2：阶段 1 的 IPC 注册（配置通道；注册时执行旧配置兼容迁移）——
    // 必须早于 createWindow 读取系统设置与 startSystemThemeWatcher，故保持在建窗前
    registerPreWindowIpc()

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

    // M2：主题更新广播 / 渲染层就绪握手（原此处的两条 ipcListenerManager.registerOnce）
    // 已随「whenReady 后的注册调用」统一迁入 src/main/ipc/registry.ts：
    // - 主题监听（P1/C-03/C-04、P1/N-05）在 registerAll 内注册；
    // - 就绪握手（P2-5）在 registerAll 内注册，回调经 onRendererReady 钩子回到本文件
    //   handleRendererReady()（启动恢复调度仍在入口，避免 registry 反向依赖入口）。

    // 2026-11-19（P0 修复）：遗留配置 show-welcome=false 时，渲染层启动读取该配置后
    // 直接隐藏欢迎页进入主界面，但主进程没有任何通知。这里在启动阶段同步读取同一配置，
    // 若为 false 则标记「主界面已进入」——否则 CLOSE 快速关闭会误判欢迎页并跳过
    // FLUSH_CONTENT/脏保存（数据丢失回归）。
    void (async () => {
        try {
            const showWelcome = (await configManager.readConfig('show-welcome')) as unknown
            if (showWelcome === false) {
                markMainViewEntered()
            }
        } catch (error) {
            logger.warn('[Main] 读取 show-welcome 配置失败（按显示欢迎页处理）:', error)
        }
    })()

    const mainWindow = createWindow()

    // P1 性能基线：挂接诊断上报（默认关闭，空操作）。
    // 开启时增量写 BAIZE_PERF_OUT，并支持基线脚本的「采集齐关键阶段后自动退出」；
    // 退出回调交给 app.quit，复用现有 before-quit/close 落盘协议，不绕过任何清理逻辑。
    setupPerfDiagnostics(mainWindow, () => app.quit())

    // A-1/ARC-06：IPC 注册一次性化——注册移出 createWindow，在 app.whenReady 后仅执行一次；
    // macOS activate 重建窗口不再重复注册。
    // M2：全部一次性 IPC 注册收敛到 registry.registerAll（调用顺序 = 改造前顺序）；
    // 渲染层就绪握手回调用本入口的 handleRendererReady（M1 状态在 AppContext）。
    // AS-12 复核：createWindow 内的窗口级监听（close / ready-to-show / 导航拦截）
    // 绑定在新建窗口实例上，不随重建累积；globalShortcut 由 short-key-register 内部
    // 幂等控制（重建窗口只更新目标窗口引用）。
    registerAll(mainWindow, { onRendererReady: handleRendererReady })

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
    // M1：清理函数引用保存在 AppContext.windowBounds
    const context = getAppContext()
    context.windowBounds.disposePersistence?.()
    context.windowBounds.disposePersistence = null
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
    // M1：标志本体在 AppContext.quit.isQuitting（appState.setQuitting 等价读写同一字段）。
    const context = getAppContext()
    appState.setQuitting(true)
    if (context.quit.flushedForQuit) {
        cleanupApp()
        return
    }
    // D-3/FUN-03：退出前先 flush 编辑器内容并落盘未保存修改
    const mainWindow = context.mainWindow
    if (mainWindow && !mainWindow.isDestroyed()) {
        event.preventDefault()
        void (async () => {
            try {
                await flushEditorContent(mainWindow)
                if (appState.isDirty()) {
                    // 2026-11-20（用户需求）：退出前未保存修改同样由用户决定；
                    // 取消时复位退出标志并保持应用运行。
                    const choice = await confirmUnsavedChangesClose(mainWindow)
                    if (choice === 'cancel') {
                        appState.setQuitting(false)
                        return
                    }
                    if (choice === 'save' && !(await SaveActiveFile())) {
                        appState.setQuitting(false)
                        return
                    }
                }
            } catch (err) {
                logger.error('退出前落盘失败', err)
            }
            context.quit.flushedForQuit = true
            app.quit()
        })()
        return
    }
    cleanupApp()
})
