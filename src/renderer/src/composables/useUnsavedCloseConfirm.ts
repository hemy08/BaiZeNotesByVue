/**
 * 关闭/退出「未保存修改」确认框的渲染层控制器（2026-11-20 应用内 BaseDialog 改造）
 *
 * ## 职责
 * - 监听主进程 `IPC.DIALOG.UNSAVED_CLOSE_REQUEST`（关闭/退出协议在脏文件时发出），
 *   打开应用内 `UnsavedChangesDialog.vue`（BaseDialog 外壳，三按钮）；
 * - 把用户选择经 `IPC.DIALOG.UNSAVED_CLOSE_SUBMIT` invoke 回传主进程：
 *   - 「保存并关闭」：对话框进入 saving 态 → 主进程执行真实保存 → 成功收起对话框并放行关闭；
 *     失败则回到可操作态并展示错误（对话框保留供重试 / 改选不保存 / 取消）；
 *   - 「不保存」/「取消」/Esc/关闭按钮：立即收起对话框并回传选择（主进程决定放行或中止）；
 * - 兜底：
 *   1. 主进程等待回执有 30s 超时（按取消安全侧处理），迟到的回执会返回 `stale`，
 *      本控制器收到后直接收起对话框（本次关闭已中止）；
 *   2. 渲染层自身 35s 看门狗（仅兜底「主进程 / 对话框链路未响应」的极端情况，
 *      先于看门狗主进程会超时并取消），到点收起对话框，避免遮罩长期停留；
 *   3. IPC 不可用/调用异常：记录日志并保留安全侧效果（主进程超时兜底）。
 *
 * ## 挂载位置
 * 由主界面常驻宿主 `components/dialogs/UnsavedCloseConfirmHost.vue` 在 onMounted 调
 * `start()`、onBeforeUnmount 调 `stop()`。宿主挂在主界面（BaiZeNotes.vue）的异步 chunk 内，
 * 不增加 150 KiB 渲染入口 chunk 预算；脏文件只可能出现在主界面编辑场景，因此监听时序满足
 * 关闭/退出协议（渲染层不可用时主进程回退原生确认框）。
 */
import { reactive } from 'vue'
import { IPC } from '../../../shared/ipc-channels'
import type { UnsavedCloseChoice, UnsavedCloseSubmitResult } from '../../../shared/types'
import { t } from '../common/i18n'
import { logger } from '../common/logger'

/** 确认框状态（App.vue 传给 UnsavedChangesDialog 的 props 真源） */
export interface UnsavedCloseConfirmState {
    /** 是否显示确认框 */
    visible: boolean
    /** 本次关闭实际是隐藏到系统托盘（决定「保存并隐藏」文案） */
    minimizeToTray: boolean
    /** 「保存并关闭」执行中：按钮禁用、保存按钮显示进行中文案 */
    busy: boolean
    /** 保存失败等错误提示（空字符串 = 无错误） */
    error: string
}

/**
 * 渲染层看门狗超时：略大于主进程 30s 等待超时（主进程先按取消兜底并返回 stale，
 * 本看门狗只用于「主进程/对话框链路完全无响应」的极端场景）。
 */
export const UNSAVED_CLOSE_DIALOG_WATCHDOG_MS = 35_000

/** 渲染层受限 ipcRenderer 的最小结构（便于单测注入替身，不直接依赖 Electron 类型） */
interface RestrictedIpcRendererLike {
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void
    removeListener: (
        channel: string,
        listener: (event: unknown, ...args: unknown[]) => void
    ) => void
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

/** 关闭确认控制器公开 API */
export interface UnsavedCloseConfirmController {
    /** 响应式状态（UnsavedCloseConfirmHost 直接绑定到 UnsavedChangesDialog） */
    state: UnsavedCloseConfirmState
    /** 注册主进程确认请求监听（幂等；宿主 onMounted 调用） */
    start: () => void
    /** 移除监听并复位状态（宿主 onBeforeUnmount 调用） */
    stop: () => void
    /** 主进程确认请求处理（start 注册的监听内部调用；导出便于单测直接驱动） */
    handleRequest: (payload: unknown) => void
    /** 用户点击「保存并关闭」 */
    confirmSave: () => Promise<void>
    /** 用户点击「不保存」 */
    confirmDiscard: () => Promise<void>
    /** 用户点击「取消」/Esc/关闭按钮 */
    confirmCancel: () => Promise<void>
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
        typeof ipcRenderer.invoke !== 'function'
    ) {
        return null
    }
    return ipcRenderer
}

/**
 * 把主进程 invoke 返回值归一化为结果对象。
 *
 * 兼容三类情况：正常 `{ ok, stale? }`；未受信发送方拒绝对象（`{ code, message }`，
 * 视为失败且不 stale）；其他异常载荷视为失败（渲染层保留对话框，由主进程超时兜底）。
 */
function parseSubmitResult(raw: unknown): UnsavedCloseSubmitResult {
    if (!raw || typeof raw !== 'object') {
        return { ok: false }
    }
    const record = raw as { ok?: unknown; stale?: unknown }
    return { ok: record.ok === true, stale: record.stale === true }
}

/** 从请求载荷读取托盘语义（非法载荷按普通关闭处理，不抛错） */
function readMinimizeToTray(payload: unknown): boolean {
    if (!payload || typeof payload !== 'object') {
        return false
    }
    return (payload as { minimizeToTray?: unknown }).minimizeToTray === true
}

/**
 * 创建关闭确认控制器（组合式函数；App.vue 每次挂载创建一份）。
 *
 * 说明：不在内部使用 onMounted/onBeforeUnmount 钩子，便于单测直接创建并驱动；
 * 生命周期由调用方（App.vue）显式 start/stop。
 */
export function useUnsavedCloseConfirm(): UnsavedCloseConfirmController {
    const state = reactive<UnsavedCloseConfirmState>({
        visible: false,
        minimizeToTray: false,
        busy: false,
        error: ''
    })

    /** 已注册的请求监听（用于精确退订；null = 未 start） */
    let requestListener: ((event: unknown, ...args: unknown[]) => void) | null = null
    /** 渲染层看门狗计时器（null = 未启动） */
    let watchdogTimer: ReturnType<typeof setTimeout> | null = null

    function clearWatchdog(): void {
        if (watchdogTimer !== null) {
            clearTimeout(watchdogTimer)
            watchdogTimer = null
        }
    }

    function hide(): void {
        clearWatchdog()
        state.visible = false
        state.busy = false
        state.error = ''
    }

    function armWatchdog(): void {
        clearWatchdog()
        watchdogTimer = setTimeout(() => {
            watchdogTimer = null
            // 主进程此时通常已按 30s 超时取消关闭（本次关闭已中止），这里只负责收起遮罩，
            // 不主动回传选择（避免与主进程超时结算形成双回执）。
            logger.warn(
                '[CloseConfirm] 应用内未保存确认框超过渲染层看门狗时限仍未完成，自动收起（主进程已按取消兜底）'
            )
            hide()
        }, UNSAVED_CLOSE_DIALOG_WATCHDOG_MS)
    }

    /** 回传选择并解析结果；IPC 异常时返回 null（调用方按失败处理） */
    async function submitChoice(
        choice: UnsavedCloseChoice
    ): Promise<UnsavedCloseSubmitResult | null> {
        const ipcRenderer = getIpcRenderer()
        if (!ipcRenderer) {
            logger.error('[CloseConfirm] preload IPC 不可用，无法回传未保存确认结果')
            return null
        }
        try {
            const raw = await ipcRenderer.invoke(IPC.DIALOG.UNSAVED_CLOSE_SUBMIT, choice)
            return parseSubmitResult(raw)
        } catch (error) {
            logger.error('[CloseConfirm] 回传未保存确认结果失败', error)
            return null
        }
    }

    /** 处理主进程确认请求：打开对话框（重复请求直接忽略，避免叠加第二个确认框） */
    function handleRequest(payload: unknown): void {
        if (state.visible) {
            logger.warn('[CloseConfirm] 已显示未保存确认框，忽略重复的确认请求')
            return
        }
        state.minimizeToTray = readMinimizeToTray(payload)
        state.busy = false
        state.error = ''
        state.visible = true
        armWatchdog()
    }

    async function confirmSave(): Promise<void> {
        if (!state.visible || state.busy) {
            return
        }
        state.busy = true
        state.error = ''
        clearWatchdog()
        const result = await submitChoice('save')
        // 保存执行期间主进程可能已结算（窗口关闭/超时/崩溃）：此时不再改状态
        if (!state.visible) {
            return
        }
        if (result?.stale === true) {
            // 主进程已无等待中的关闭确认（超时/窗口销毁兜底），本次关闭已中止
            logger.warn('[CloseConfirm] 主进程已结束本次关闭确认（stale），收起对话框')
            hide()
            return
        }
        if (result?.ok === true) {
            // 保存成功：主进程随即放行关闭；先收起对话框避免关闭瞬间闪一下遮罩
            hide()
            return
        }
        // 保存失败 / IPC 异常：保留对话框，恢复按钮可操作并展示错误提示
        state.busy = false
        state.error = t('mainMsg.closeConfirm.saveFailed')
        armWatchdog()
    }

    async function confirmDiscard(): Promise<void> {
        if (!state.visible || state.busy) {
            return
        }
        // 先收起（用户可感知），再回传；失败时主进程按超时取消兜底，不会误关窗口
        hide()
        await submitChoice('discard')
    }

    async function confirmCancel(): Promise<void> {
        if (!state.visible || state.busy) {
            return
        }
        hide()
        await submitChoice('cancel')
    }

    function start(): void {
        const ipcRenderer = getIpcRenderer()
        if (!ipcRenderer) {
            logger.warn('[CloseConfirm] preload IPC 不可用，未保存确认框监听未注册')
            return
        }
        if (requestListener !== null) {
            return
        }
        requestListener = (event: unknown, ...args: unknown[]): void => {
            // Electron 监听回调首参为 IpcRendererEvent，业务载荷从第二参开始
            void event
            handleRequest(args[0])
        }
        ipcRenderer.on(IPC.DIALOG.UNSAVED_CLOSE_REQUEST, requestListener)
    }

    function stop(): void {
        const ipcRenderer = getIpcRenderer()
        if (requestListener !== null) {
            if (ipcRenderer) {
                ipcRenderer.removeListener(IPC.DIALOG.UNSAVED_CLOSE_REQUEST, requestListener)
            }
            requestListener = null
        }
        hide()
    }

    return {
        state,
        start,
        stop,
        handleRequest,
        confirmSave,
        confirmDiscard,
        confirmCancel
    }
}
