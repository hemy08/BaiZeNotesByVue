/**
 * 通用应用内消息/确认对话框的渲染层控制器（2026-11-21 用户需求）
 *
 * ## 职责
 * - 监听主进程 `IPC.DIALOG.APP_MESSAGE_REQUEST`，打开应用内 `AppMessageDialog.vue`
 *   （BaseDialog 外壳：标题/正文/详情/按钮列表）；
 * - 把用户选择经 `IPC.DIALOG.APP_MESSAGE_SUBMIT` invoke 回传主进程（requestId + choiceId）；
 * - 监听主进程 `IPC.DIALOG.APP_MESSAGE_DISMISS`：超时/回退原生前撤销对应应用内框，
 *   保证「应用内框 + 原生框」不会同时出现；
 * - 宿主挂载/卸载经 `IPC.DIALOG.APP_MESSAGE_HOST_READY` 发送就绪握手：欢迎页等
 *   未挂载宿主的场景，主进程据此直接走原生兜底，不白等 30s 超时。
 *
 * ## 兜底
 * 1. 主进程等待 30s 超时后会发 DISMISS 并回退原生框；本控制器按 requestId 收起对应框；
 * 2. 渲染层自身 35s 看门狗（仅兜底「主进程 / 对话框链路完全无响应」的极端情况），
 *    到点收起遮罩，避免遮罩长期停留；
 * 3. IPC 不可用/调用异常：记录日志；主进程侧超时/窗口事件会兜底结算，不会卡死调用方。
 *
 * ## 挂载位置
 * 由主界面常驻宿主 `components/dialogs/AppMessageBoxHost.vue` 在 onMounted 调
 * `start()`、onBeforeUnmount 调 `stop()`。宿主随主界面异步 chunk 加载（不占用渲染入口
 * chunk 预算）；欢迎页未挂载宿主时主进程直接回退原生框（该场景的确认仍可用）。
 */
import { reactive } from 'vue'
import { IPC } from '../../../shared/ipc-channels'
import type {
    AppMessageBoxButton,
    AppMessageBoxKind,
    AppMessageBoxRequestPayload
} from '../../../shared/types'
import { logger } from '../common/logger'

/** 消息框状态（宿主传给 AppMessageDialog 的 props 真源） */
export interface AppMessageBoxState {
    /** 是否显示消息框 */
    visible: boolean
    /** 当前展示的请求载荷（visible=false 时为 null） */
    request: AppMessageBoxRequestPayload | null
}

/**
 * 渲染层看门狗超时：略大于主进程 30s 等待超时（主进程先撤销并回退原生框，
 * 本看门狗只用于「主进程/对话框链路完全无响应」的极端场景）。
 */
export const APP_MESSAGE_DIALOG_WATCHDOG_MS = 35_000

/** 合法消息框类型（载荷归一化依据） */
const VALID_KINDS: readonly AppMessageBoxKind[] = ['info', 'warning', 'error', 'confirm']

/** 渲染层受限 ipcRenderer 的最小结构（便于单测注入替身，不直接依赖 Electron 类型） */
interface RestrictedIpcRendererLike {
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void
    removeListener: (
        channel: string,
        listener: (event: unknown, ...args: unknown[]) => void
    ) => void
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    send: (channel: string, ...args: unknown[]) => void
}

/** 应用内消息框控制器公开 API */
export interface AppMessageBoxController {
    /** 响应式状态（AppMessageBoxHost 直接绑定到 AppMessageDialog） */
    state: AppMessageBoxState
    /** 注册主进程消息框请求/撤销监听并发送宿主就绪握手（幂等；宿主 onMounted 调用） */
    start: () => void
    /** 移除监听、发送宿主卸载握手并复位状态（宿主 onBeforeUnmount 调用） */
    stop: () => void
    /** 主进程请求处理（start 注册的监听内部调用；导出便于单测直接驱动） */
    handleRequest: (payload: unknown) => void
    /** 主进程撤销请求（按 requestId 关闭对应消息框；不匹配则忽略） */
    handleDismiss: (requestId: unknown) => void
    /** 用户点击按钮：收起并回传选择 */
    choose: (choiceId: string) => Promise<void>
}

/** 取 preload 暴露的受限 ipcRenderer；非 Electron 环境（异常测试桩）返回 null */
function getIpcRenderer(): RestrictedIpcRendererLike | null {
    if (typeof window === 'undefined') {
        return null
    }
    const electron = (window as unknown as { electron?: { ipcRenderer?: unknown } }).electron
    const ipcRenderer = electron?.ipcRenderer as RestrictedIpcRendererLike | undefined
    if (
        !ipcRenderer ||
        typeof ipcRenderer.on !== 'function' ||
        typeof ipcRenderer.removeListener !== 'function' ||
        typeof ipcRenderer.invoke !== 'function' ||
        typeof ipcRenderer.send !== 'function'
    ) {
        return null
    }
    return ipcRenderer
}

/** 从原始载荷读取按钮列表（过滤非法项；空则返回 null 判定为非法载荷） */
function readButtons(raw: unknown): AppMessageBoxButton[] | null {
    if (!Array.isArray(raw)) {
        return null
    }
    const buttons: AppMessageBoxButton[] = []
    for (const item of raw) {
        if (!item || typeof item !== 'object') {
            continue
        }
        const { id, label, kind } = item as { id?: unknown; label?: unknown; kind?: unknown }
        if (typeof id !== 'string' || id.length === 0) {
            continue
        }
        if (typeof label !== 'string' || label.length === 0) {
            continue
        }
        if (buttons.some((button) => button.id === id)) {
            continue
        }
        const button: AppMessageBoxButton = { id, label }
        if (kind === 'primary' || kind === 'danger' || kind === 'default') {
            button.kind = kind
        }
        buttons.push(button)
    }
    return buttons.length > 0 ? buttons : null
}

/**
 * 把主进程载荷归一化为可展示的请求（非法载荷返回 null，主进程超时后自动兜底）。
 * 纯函数，便于单测直接覆盖。
 */
export function normalizeAppMessageRequest(raw: unknown): AppMessageBoxRequestPayload | null {
    if (!raw || typeof raw !== 'object') {
        return null
    }
    const record = raw as Record<string, unknown>
    if (typeof record.requestId !== 'string' || record.requestId.length === 0) {
        return null
    }
    const buttons = readButtons(record.buttons)
    if (!buttons) {
        return null
    }
    const buttonIds = buttons.map((button) => button.id)
    const defaultId =
        typeof record.defaultId === 'string' && buttonIds.includes(record.defaultId)
            ? record.defaultId
            : buttons[0].id
    const cancelId =
        typeof record.cancelId === 'string' && buttonIds.includes(record.cancelId)
            ? record.cancelId
            : buttons[buttons.length - 1].id
    const request: AppMessageBoxRequestPayload = {
        requestId: record.requestId,
        kind: VALID_KINDS.includes(record.kind as AppMessageBoxKind)
            ? (record.kind as AppMessageBoxKind)
            : 'info',
        title: typeof record.title === 'string' ? record.title : '',
        message: typeof record.message === 'string' ? record.message : '',
        buttons,
        defaultId,
        cancelId
    }
    if (typeof record.detail === 'string' && record.detail.length > 0) {
        request.detail = record.detail
    }
    if (typeof record.timeoutMs === 'number' && Number.isFinite(record.timeoutMs)) {
        request.timeoutMs = record.timeoutMs
    }
    return request
}

/**
 * 创建应用内消息框控制器（组合式函数；AppMessageBoxHost 每次挂载创建一份）。
 *
 * 说明：生命周期由调用方（宿主）显式 start/stop，便于单测直接创建并驱动。
 */
export function useAppMessageBox(): AppMessageBoxController {
    const state = reactive<AppMessageBoxState>({
        visible: false,
        request: null
    })

    /** 已注册的请求/撤销监听（用于精确退订；null = 未 start） */
    let requestListener: ((event: unknown, ...args: unknown[]) => void) | null = null
    let dismissListener: ((event: unknown, ...args: unknown[]) => void) | null = null
    /** 渲染层看门狗计时器（null = 未启动） */
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null
    /** 防御性排队：主进程已串行化，正常不会出现第二个待展示请求 */
    let queuedRequests: AppMessageBoxRequestPayload[] = []

    function clearWatchdog(): void {
        if (watchdogTimer !== null) {
            clearTimeout(watchdogTimer)
            watchdogTimer = null
        }
    }

    function hideActive(): void {
        clearWatchdog()
        state.visible = false
        state.request = null
    }

    /** 展示一个请求（调用方保证当前无活动请求） */
    function showRequest(request: AppMessageBoxRequestPayload): void {
        state.request = request
        state.visible = true
        armWatchdog()
    }

    /** 收起当前并展示队列中的下一个（正常队列为空） */
    function showNextQueued(): void {
        const next = queuedRequests.shift()
        if (next) {
            showRequest(next)
        }
    }

    function armWatchdog(): void {
        clearWatchdog()
        watchdogTimer = setTimeout(() => {
            watchdogTimer = null
            // 主进程 30s 超时已撤销/回退原生框；这里只负责收起遮罩，不主动回传选择
            // （避免与主进程兜底结算形成双回执）。
            logger.warn(
                '[AppMessageBox] 应用内消息框超过渲染层看门狗时限仍未完成，自动收起（主进程已兜底）'
            )
            hideActive()
            showNextQueued()
        }, APP_MESSAGE_DIALOG_WATCHDOG_MS)
    }

    /** 回传选择（失败只记录：主进程超时/窗口事件会兜底结算） */
    async function submitChoice(
        request: AppMessageBoxRequestPayload,
        choiceId: string
    ): Promise<void> {
        const ipcRenderer = getIpcRenderer()
        if (!ipcRenderer) {
            logger.error('[AppMessageBox] preload IPC 不可用，无法回传消息框选择')
            return
        }
        try {
            const raw = await ipcRenderer.invoke(
                IPC.DIALOG.APP_MESSAGE_SUBMIT,
                request.requestId,
                choiceId
            )
            const stale = Boolean(
                raw && typeof raw === 'object' && (raw as { stale?: unknown }).stale === true
            )
            if (stale) {
                // 主进程已结算（超时/窗口事件/重复回执）：本次请求不会再影响业务动作
                logger.warn('[AppMessageBox] 主进程已结束本次消息框等待（stale），忽略回执结果')
            }
        } catch (error) {
            logger.error('[AppMessageBox] 回传消息框选择失败', error)
        }
    }

    /** 处理主进程请求：已有活动请求时入队（防御；主进程侧已串行化） */
    function handleRequest(payload: unknown): void {
        const request = normalizeAppMessageRequest(payload)
        if (!request) {
            logger.warn('[AppMessageBox] 收到非法的应用内消息框请求，已忽略（主进程超时后兜底）')
            return
        }
        if (state.visible) {
            if (queuedRequests.some((item) => item.requestId === request.requestId)) {
                logger.warn('[AppMessageBox] 忽略重复的消息框请求')
                return
            }
            queuedRequests.push(request)
            logger.warn('[AppMessageBox] 已有消息框展示中，收到新请求，排队等待（防御性）')
            return
        }
        showRequest(request)
    }

    /** 处理主进程撤销请求：只关闭 requestId 匹配的框，不主动回传选择 */
    function handleDismiss(requestId: unknown): void {
        if (typeof requestId !== 'string') {
            return
        }
        if (!state.visible || state.request?.requestId !== requestId) {
            // 可能已由用户关闭/看门狗收起，或属于其它请求：忽略
            return
        }
        hideActive()
        showNextQueued()
    }

    async function choose(choiceId: string): Promise<void> {
        const request = state.request
        if (!state.visible || !request) {
            return
        }
        hideActive()
        showNextQueued()
        await submitChoice(request, choiceId)
    }

    function start(): void {
        const ipcRenderer = getIpcRenderer()
        if (!ipcRenderer) {
            logger.warn('[AppMessageBox] preload IPC 不可用，应用内消息框监听未注册')
            return
        }
        if (requestListener === null) {
            requestListener = (event: unknown, ...args: unknown[]): void => {
                // Electron 监听回调首参为 IpcRendererEvent，业务载荷从第二参开始
                void event
                handleRequest(args[0])
            }
            dismissListener = (event: unknown, ...args: unknown[]): void => {
                void event
                handleDismiss(args[0])
            }
            ipcRenderer.on(IPC.DIALOG.APP_MESSAGE_REQUEST, requestListener)
            ipcRenderer.on(IPC.DIALOG.APP_MESSAGE_DISMISS, dismissListener)
        }
        try {
            ipcRenderer.send(IPC.DIALOG.APP_MESSAGE_HOST_READY, true)
        } catch (error) {
            logger.warn('[AppMessageBox] 发送宿主就绪握手失败（主进程将走原生兜底）', error)
        }
    }

    function stop(): void {
        const ipcRenderer = getIpcRenderer()
        if (requestListener !== null) {
            if (ipcRenderer) {
                ipcRenderer.removeListener(IPC.DIALOG.APP_MESSAGE_REQUEST, requestListener)
            }
            requestListener = null
        }
        if (dismissListener !== null) {
            if (ipcRenderer) {
                ipcRenderer.removeListener(IPC.DIALOG.APP_MESSAGE_DISMISS, dismissListener)
            }
            dismissListener = null
        }
        if (ipcRenderer) {
            try {
                ipcRenderer.send(IPC.DIALOG.APP_MESSAGE_HOST_READY, false)
            } catch (error) {
                logger.warn('[AppMessageBox] 发送宿主卸载握手失败（窗口关闭中属正常）', error)
            }
        }
        hideActive()
        queuedRequests = []
    }

    return {
        state,
        start,
        stop,
        handleRequest,
        handleDismiss,
        choose
    }
}
