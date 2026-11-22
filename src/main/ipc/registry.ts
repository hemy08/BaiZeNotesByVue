/**
 * 主进程 IPC 注册清单（结构优化第 2 批 2.4 / M2：IPC 注册收口）
 *
 * ## 背景
 * 改造前主进程的 IPC 注册分散在 8 个文件、约 69 处 `ipcListenerManager.register*` 调用
 * （main/index.ts、ipc/handlers.ts、utils/utils.ts、utils/ipc-security.ts（仅包装器）、
 * config/config-manager.ts、dialogs/dialogs.ts、renders/plantuml-local.ts 等），
 * main/index.ts 需要逐一 import 各模块的注册函数并按隐式顺序调用，新增/调整注册时
 * 容易漏项或打乱顺序（注册顺序影响同一通道的监听器执行次序与启动迁移时机）。
 *
 * ## 本模块职责
 * 把 main/index.ts 里「whenReady 之后的一次性注册调用」集中成**唯一清单**：
 * - 各原模块仍保留自己的 register 函数（业务逻辑与注册顺序细节不变）；
 * - 本文件只做编排（调用顺序 + 阶段划分），不内联任何 handler 业务逻辑；
 * - main/index.ts 不再感知具体注册模块，只按阶段调用本文件导出的函数。
 *
 * ## 阶段划分（顺序不可调整）
 * 1. registerPreWindowIpc()：**创建主窗口之前**的注册阶段。
 *    当前只有配置 IPC（config/config-manager.registerConfigIpcHandlers）——该函数注册前
 *    会执行一次「旧渲染层裸 JSON → 主进程 store」兼容迁移，必须早于 createWindow 读取
 *    系统设置（窗口边界/自动保存）与 startSystemThemeWatcher，否则升级用户的首帧设置
 *    可能读到迁移前的旧值（行为回归）。因此该阶段必须保持在 createWindow 之前。
 * 2. registerAll(mainWindow, hooks)：**主窗口创建之后**的一次性注册阶段，按改造前
 *    main/index.ts 的调用顺序逐项迁移（主题更新广播 → 渲染层就绪握手 → 对话框右键通道
 *    → utils 通道 → handlers 通道 → PlantUML 本地渲染 → A2 工作区搜索/替换）。
 *
 * 窗口重建（macOS activate）不会再次调用本文件：全局注册为进程级 persistent
 * （ipcListenerManager.registerOnce/registerHandleOnce），窗口重建只需刷新
 * AppContext.mainWindow（各注册回调在调用时取活窗口/受信主窗口）。
 *
 * ## 不在本清单内的注册
 * - createWindow 内的窗口级监听（close / ready-to-show / will-navigate 等）：绑定窗口实例，
 *   随重建自然更新，不属于进程级 IPC 注册；
 * - 关闭落盘协议的 FLUSH_CONTENT_DONE 回执监听（main/index.ts.flushEditorContent）：
 *   属「一次关闭流程」组件级注册，随 finish/cleanupAll 清理，不能全局一次性注册。
 */
import type { BrowserWindow } from 'electron'
// 阶段 1：配置 IPC（注册时执行旧配置兼容迁移）
import { registerConfigIpcHandlers } from '../config/config-manager'
// 主题更新广播回调用到的读取函数（仅在渲染层触发 UPDATE_THEME 时求值）
import {
    getCurrentThemeStyles,
    getMonacoTheme,
    getSeparateEditorTheme,
    getThemeStylesByType
} from '../config/theme-config'
import type { ThemeType } from '../config/theme-config'
// 阶段 2：各既有注册实现（保留在原模块，本文件只编排调用顺序）
import { MainWindowListenDialogsEvent } from '../dialogs/dialogs'
import { registerIpcHandlers } from './handlers'
import { ipcListenerManager } from './ipc-listener-manager'
// P1-1：主题广播实现已迁到中性层 utils（config 不再 import ipc/**，广播语义不变）
import { broadcastThemeToAllWindows, buildThemeBroadcastPayload } from '../utils/theme-broadcast'
// P1-1：向 config 侧注入 IPC 注册能力（依赖倒置，消除 config → ipc 反向依赖）
import { setIpcHandleRegistrar } from '../utils/ipc-registration'
import { registerPlantumlLocalRenderIpc } from '../renders/plantuml-local'
import { setTrustedMainWindow, withSenderCheck } from '../utils/ipc-security'
// P2 IPC 注册收口：原 utils/utils.ts 的 29 处注册已按域拆分到同目录模块，
// 由 utils-ipc.ts 按拆分前顺序统一编排（本文件只负责阶段与调用位置）
import { registerUtilsIpcHandlers } from './utils-ipc'
// A2（2026-11-21）：全工作区搜索/替换（独立域模块，不并入 utils 侧 29 通道清单）
import { registerWorkspaceSearchIpc } from './workspace-search-ipc'
// 1.5.1 本地知识库基座：工作区索引（front matter/标签/Wiki 链接）
import { registerWorkspaceIndexIpc } from './workspace-index-ipc'
import { logger } from '../utils/logger'
import { IPC } from '../../shared/ipc-channels'

/**
 * P1/C-04：主进程级监听台账的组件 ID。
 * 主题更新 / 渲染层就绪握手为进程级 persistent 注册，保留改造前的组件 ID，
 * 保证台账（inventory）与既有诊断/测试口径不变。
 */
const GLOBAL_MAIN_INDEX_COMPONENT_ID = 'global-main-index'

/**
 * A2 工作区搜索/替换 IPC 的监听台账组件 ID。
 * 独立于 utils 侧通道清单（那是 29 个历史通道的冻结台账），便于诊断定位。
 */
const WORKSPACE_SEARCH_COMPONENT_ID = 'global-workspace-search-ipc'

/** 1.5.1 工作区索引 IPC 的监听台账组件 ID */
const WORKSPACE_INDEX_COMPONENT_ID = 'global-workspace-index-ipc'

/** registerAll 的入口钩子：由 main/index.ts 提供的跨模块行为（避免 registry 反向依赖入口） */
export interface RegisterAllHooks {
    /**
     * 渲染层就绪握手回调（IPC.RENDER.READY 收到受信主窗口消息时调用）。
     *
     * 改造前该回调内联在 main/index.ts：置 rendererReadyReceived 并执行挂起的启动恢复。
     * M1 起握手状态归 AppContext，启动恢复调度仍在 main/index.ts，故经钩子注入。
     * 缺省时仅记录警告（正常启动流程一定由入口传入）。
     */
    onRendererReady?: () => void
}

/**
 * 阶段 1：创建主窗口之前执行的一次性 IPC 注册。
 *
 * 当前仅配置 IPC 一组（config/read + config/write）；注册前会执行旧配置兼容迁移，
 * 因此必须保持在 createWindow 之前调用（迁移完成的设置才能被建窗流程读到）。
 *
 * P1-1：config 层已不直接依赖 ipc/ipc-listener-manager，注册能力经
 * utils/ipc-registration 依赖倒置注入——必须在调用 config 的注册函数**之前**注入，
 * 否则配置通道不会注册（未注入时提供者只告警，避免启动崩溃）。
 */
export function registerPreWindowIpc(): void {
    setIpcHandleRegistrar(ipcListenerManager)
    registerConfigIpcHandlers()
}

/**
 * P1/C-03：主题更新广播注册（改造前内联在 main/index.ts whenReady 内）。
 *
 * - 载荷统一经 buildThemeBroadcastPayload 组装（shared ThemeUpdateData 契约）；
 * - 广播收敛到 broadcastThemeToAllWindows（主进程唯一实现）；
 * - P1/N-05：主题更新会改写渲染层外观并广播到所有窗口，仅主窗口可信。
 */
function registerThemeUpdateIpc(): void {
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
                broadcastThemeToAllWindows(
                    buildThemeBroadcastPayload(
                        theme,
                        typeof monacoTheme === 'string' ? monacoTheme : getMonacoTheme(),
                        typeof separate === 'boolean' ? separate : getSeparateEditorTheme()
                    )
                )
            }
        ),
        GLOBAL_MAIN_INDEX_COMPONENT_ID
    )
}

/**
 * P2-5：渲染层就绪握手注册（改造前内联在 main/index.ts whenReady 内）。
 *
 * App.vue onMounted 注册完监听器后经 preload 发送 IPC.RENDER.READY；主进程收到后
 * 执行启动恢复（main/index.ts 经 onRendererReady 钩子注入的具体调度）。
 * registerOnce 为 persistent 注册，macOS window-all-closed → cleanupAll 后
 * activate 重建窗口仍可接收新窗口的握手。
 * P1/N-05：仅受信主窗口可触发（防其他窗口/被注入页面伪造握手提前恢复）。
 */
function registerRendererReadyIpc(onRendererReady?: () => void): void {
    if (!onRendererReady) {
        logger.warn(
            '[IPC] registerAll 未提供 onRendererReady 钩子：渲染层就绪握手将无法触发启动恢复'
        )
    }
    ipcListenerManager.registerOnce(
        IPC.RENDER.READY,
        withSenderCheck(IPC.RENDER.READY, () => {
            onRendererReady?.()
        }),
        GLOBAL_MAIN_INDEX_COMPONENT_ID
    )
}

/**
 * 阶段 2：主窗口创建之后的全部一次性 IPC 注册（main/index.ts 只调用本函数一次）。
 *
 * 调用顺序 = 改造前 main/index.ts 的实际注册顺序，禁止调整：
 *   主题更新广播 → 渲染层就绪握手 → 对话框右键通道 → utils 通道 → handlers 通道 →
 *   PlantUML 本地渲染 → A2 工作区搜索/替换。
 * 其中主题/就绪握手两条 persistent 注册改造前位于 createWindow 之前，M2 收口后
 * 统一在此执行；createWindow 返回后的同步调用仍早于渲染进程任何 IPC 消息
 * （页面加载是异步的），同通道注册顺序与语义不变。
 */
export function registerAll(mainWindow: BrowserWindow, hooks: RegisterAllHooks = {}): void {
    // P1/N-05：注册即登记受信主窗口（与各注册模块内部的登记同源，均指向 AppContext.mainWindow）
    setTrustedMainWindow(mainWindow)

    // 1) 主题更新广播（原 main/index.ts:461）
    registerThemeUpdateIpc()
    // 2) 渲染层就绪握手（原 main/index.ts:496）
    registerRendererReadyIpc(hooks.onRendererReady)
    // 3) 对话框文件管理器右键通道（原 main/index.ts:535）
    MainWindowListenDialogsEvent(mainWindow)
    // 4) 原 utils 侧文件/加密/外部链接等 29 处通道（P2：已按域拆分到 ipc/ 各模块，
    //    由 registerUtilsIpcHandlers 按拆分前顺序编排；原 main/index.ts:536）
    registerUtilsIpcHandlers(mainWindow)
    // 5) handlers 窗口控制/菜单/最近文件等通道（原 main/index.ts:537）
    registerIpcHandlers(mainWindow)
    // 6) PF-08：PlantUML 本地离线渲染（隐藏窗口 + 串行队列 + LRU 缓存，原 main/index.ts:539）
    registerPlantumlLocalRenderIpc()
    // 7) A2（2026-11-21）：全工作区搜索/替换（含 Quick Open 文件清单），默认开启。
    //    仅主窗口可信；搜索/替换服务只信任 appState.rootPath 工作区根。
    registerWorkspaceSearchIpc(mainWindow, WORKSPACE_SEARCH_COMPONENT_ID)
    // 8) 1.5.1 本地知识库基座：工作区索引（front matter/标签/Wiki 链接）。
    //    只索引 appState.rootPath，缓存按根失效；供标签/反链/链接检查面板查询。
    registerWorkspaceIndexIpc(mainWindow, WORKSPACE_INDEX_COMPONENT_ID)
}
