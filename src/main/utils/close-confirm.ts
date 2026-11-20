/**
 * 关闭/退出前「未保存修改」确认（2026-11-20 用户需求；应用内 BaseDialog 改造）。
 *
 * ## 背景
 * 1. 自动保存默认关闭（system-setting.ts default false）；
 * 2. 关闭窗口/退出应用时若文件有未保存修改，必须让用户选择「保存并关闭 / 不保存 / 取消」，
 *    取消则保持窗口与编辑状态（本文件负责该决策协议）。
 *
 * ## 通信协议（2026-11-20 改造：原生 dialog → 渲染层 BaseDialog 风格）
 * 此前直接调用 Electron 原生 `dialog.showMessageBox`，与工具整体风格不符；现改为显式双通道
 * 协议（与 IPC-05 的 FLUSH_CONTENT / FLUSH_CONTENT_DONE 先例一致）：
 *   1. `confirmUnsavedChangesClose()` 经 `webContents.send(IPC.DIALOG.UNSAVED_CLOSE_REQUEST)`
 *      请求渲染层显示应用内确认框，并等待 `UNSAVED_CLOSE_SUBMIT` 回执；
 *   2. 渲染层 `UnsavedChangesDialog.vue` 展示三个按钮，用户选择后 invoke 回执；
 *   3. `submitUnsavedCloseChoice()`（由 `src/main/dialogs/dialogs.ts` 注册的 handler 调用）
 *      负责：discard/cancel 直接结算并返回；save 先真实执行 `SaveActiveFile()`，
 *      成功才结算为 save 并放行关闭，失败返回 `{ ok: false }` 且**保留对话框**供用户重试。
 *
 * ## 超时与兜底（不能出现「原生框 + 应用内框」双弹）
 * - 应用内确认框只在「窗口/渲染进程可用且渲染层已就绪」时请求；
 * - 等待回执期间：30s 超时、主窗口 closed、渲染进程 render-process-gone 任一发生 →
 *   按 `cancel`（安全侧）处理并记录原因，绝不永久卡住关闭/退出；
 * - 渲染层不可用（窗口已销毁 / webContents 已销毁 / 渲染层未就绪握手）→ **回退原生
 *   dialog.showMessageBox** 并记录原因。此时应用内确认框不可能显示，因此不存在双弹；
 * - 超时分支只做安全侧取消、不再弹原生框（避免与仍显示的应用内框叠加）。
 *
 * ## 使用方
 * - `src/main/index.ts` 的 window `close` 与 app `before-quit` 协议（保留 P2-6 重入保护）；
 * - `src/main/dialogs/dialogs.ts` 注册 `UNSAVED_CLOSE_SUBMIT` handler（withSenderCheck）。
 */
import { dialog, type BrowserWindow, type MessageBoxOptions } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type {
    UnsavedCloseChoice,
    UnsavedCloseRequestPayload,
    UnsavedCloseSubmitResult
} from '../../shared/types'
import { SaveActiveFile } from './file-utils'
import { tMain } from './i18n'
import { logger } from './logger'

export type { UnsavedCloseChoice }

/**
 * 等待渲染层应用内确认框回执的超时（毫秒）。
 * 超时按取消（安全侧）处理：关闭/退出被中止，用户可重新触发，不会永久卡住流程。
 */
export const UNSAVED_CLOSE_TIMEOUT_MS = 30_000

/** 关闭确认调用场景选项 */
export interface ConfirmUnsavedChangesCloseOptions {
    /**
     * true = 本次「关闭」动作实际是隐藏到系统托盘（minimizeToTray 开启且非显式退出，
     * 见 index.ts 的 close 协议）。托盘常驻场景下按钮/正文改用「保存并隐藏」语义，
     * 避免用户误以为应用已退出（P3 F-09）。
     */
    minimizeToTray?: boolean
    /**
     * 渲染层就绪握手是否已收到（AppContext.rendererReady.received）。
     * 缺省视为已就绪；显式传 false 时走原生兜底（应用内确认框无法送达）。
     */
    rendererReady?: boolean
    /** 等待回执超时（毫秒，默认 UNSAVED_CLOSE_TIMEOUT_MS；单测注入短超时用） */
    timeoutMs?: number
}

/** 等待中的渲染层确认请求（单主窗口单请求；重入由 index.ts 的 quit.confirming 保护） */
interface PendingUnsavedCloseRequest {
    /** 是否已结算（取消/放行/超时/窗口销毁） */
    settled: boolean
    /** 「保存并关闭」执行中（此时忽略重复 submit，避免并发保存/并发结算） */
    saving: boolean
    /** 用户等待计时器 */
    timer: ReturnType<typeof setTimeout> | null
    /** 结算本次请求（幂等，触发一次后移除监听与计时器） */
    settle: (choice: UnsavedCloseChoice) => void
    /** 暂停超时计时（保存执行期间不计等待超时） */
    suspendTimeout: () => void
    /** 恢复超时计时（保存失败后继续等待用户选择） */
    resumeTimeout: () => void
}

/** 当前等待中的请求（null = 无请求；模块级唯一，进程内单主窗口模型） */
let pendingRequest: PendingUnsavedCloseRequest | null = null

/**
 * 把渲染层回执归一化为合法选择：只接受 save/discard，其余（含缺失/非法值/超时占位）
 * 一律按 cancel（安全侧）处理。纯函数，便于单测直接覆盖非法输入分支。
 */
export function normalizeUnsavedCloseChoice(raw: unknown): UnsavedCloseChoice {
    if (raw === 'save') {
        return 'save'
    }
    if (raw === 'discard') {
        return 'discard'
    }
    return 'cancel'
}

/**
 * 原生兜底确认框 response → 选择映射（0=保存 / 1=不保存 / 其余=取消）。
 * 保留为纯函数：原生路径仅在渲染层不可用时启用，映射语义必须与历史行为一致。
 */
export function mapNativeUnsavedCloseResponse(response: number): UnsavedCloseChoice {
    if (response === 0) {
        return 'save'
    }
    if (response === 1) {
        return 'discard'
    }
    return 'cancel'
}

/** 原生兜底确认框文案（minimizeToTray 场景使用「保存并隐藏」语义，与历史一致） */
function buildNativeDialogOptions(minimizeToTray: boolean): MessageBoxOptions {
    const strings =
        minimizeToTray === true
            ? {
                  title: tMain('mainMsg.closeConfirm.title'),
                  message: tMain('mainMsg.closeConfirm.trayMessage'),
                  detail: tMain('mainMsg.closeConfirm.trayDetail'),
                  save: tMain('mainMsg.closeConfirm.traySave'),
                  discard: tMain('mainMsg.closeConfirm.discard'),
                  cancel: tMain('mainMsg.closeConfirm.cancel')
              }
            : {
                  title: tMain('mainMsg.closeConfirm.title'),
                  message: tMain('mainMsg.closeConfirm.message'),
                  detail: tMain('mainMsg.closeConfirm.detail'),
                  save: tMain('mainMsg.closeConfirm.save'),
                  discard: tMain('mainMsg.closeConfirm.discard'),
                  cancel: tMain('mainMsg.closeConfirm.cancel')
              }
    return {
        type: 'warning',
        title: strings.title,
        message: strings.message,
        detail: strings.detail,
        buttons: [strings.save, strings.discard, strings.cancel],
        defaultId: 0,
        // 显式 cancelId：Esc / 点关闭按钮都按「取消」处理，避免误丢未保存内容
        cancelId: 2,
        noLink: true
    }
}

/**
 * 原生兜底确认（仅渲染层不可用时启用；正常路径不会再出现原生框）。
 *
 * 与历史语义一致：用户选择「保存并关闭」时先真实保存，保存失败则中止关闭（返回 cancel），
 * 避免抛给调用方一个「放行」信号却丢内容。
 */
async function showNativeUnsavedChangesDialog(
    parentWindow: BrowserWindow | null,
    minimizeToTray: boolean
): Promise<UnsavedCloseChoice> {
    const options = buildNativeDialogOptions(minimizeToTray)
    const { response } =
        parentWindow && !parentWindow.isDestroyed()
            ? await dialog.showMessageBox(parentWindow, options)
            : await dialog.showMessageBox(options)
    const choice = mapNativeUnsavedCloseResponse(response)
    if (choice !== 'save') {
        return choice
    }
    const saved = await SaveActiveFile()
    if (!saved) {
        logger.warn('[CloseConfirm] 原生兜底确认「保存并关闭」失败，已中止关闭（避免丢内容）')
        return 'cancel'
    }
    return 'save'
}

/** 浏览器窗口可用性判定（窗口 / webContents 任一销毁即视为渲染层不可用） */
function resolveUsableWindow(parentWindow: BrowserWindow | null): BrowserWindow | null {
    if (!parentWindow || parentWindow.isDestroyed()) {
        return null
    }
    const contents = (parentWindow as unknown as { webContents?: { isDestroyed?: () => boolean } })
        .webContents
    if (!contents) {
        return null
    }
    if (typeof contents.isDestroyed === 'function' && contents.isDestroyed()) {
        return null
    }
    return parentWindow
}

/**
 * 托盘/最小化场景下窗口可能不可见：应用内确认框位于该窗口内，必须先显示窗口，
 * 否则用户看不到确认框（只能等 30s 超时取消）。仅做「显示/恢复/聚焦」，不改变编辑状态。
 */
function revealWindowForConfirmation(win: BrowserWindow): void {
    try {
        if (typeof win.isVisible === 'function' && !win.isVisible()) {
            logger.info('[CloseConfirm] 窗口不可见（托盘/最小化），先显示窗口再请求未保存确认')
            win.show()
        }
        if (typeof win.isMinimized === 'function' && win.isMinimized()) {
            win.restore()
        }
        if (typeof win.isFocused === 'function' && !win.isFocused()) {
            win.focus()
        }
    } catch (error) {
        // 显示窗口失败不应阻断确认协议（最坏情况是用户看不到确认框 → 超时按取消兜底）
        logger.warn('[CloseConfirm] 显示窗口以便确认失败，继续请求确认', error)
    }
}

/**
 * 请求渲染层显示应用内确认框并等待回执。
 *
 * 兜底策略见文件头：超时/窗口关闭/渲染进程退出 → cancel（安全侧）；发送失败 → cancel
 * （调用方可重试，届时渲染层不可用会走原生兜底）。
 */
function requestRendererConfirmation(
    win: BrowserWindow,
    payload: UnsavedCloseRequestPayload,
    timeoutMs: number
): Promise<UnsavedCloseChoice> {
    return new Promise<UnsavedCloseChoice>((resolve) => {
        if (pendingRequest !== null) {
            // 正常由 index.ts 的 quit.confirming 重入保护拦截；此处作为最后防线，
            // 不叠加第二个应用内确认框，按取消安全侧处理。
            logger.warn('[CloseConfirm] 已存在等待中的未保存确认请求，本次按取消处理（防重入）')
            resolve('cancel')
            return
        }

        let settled = false
        let timer: ReturnType<typeof setTimeout> | null = null
        let onWindowGone: (() => void) | null = null
        let onRendererGone: (() => void) | null = null

        const cleanup = (): void => {
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
            if (onWindowGone !== null) {
                win.removeListener('closed', onWindowGone)
                onWindowGone = null
            }
            if (onRendererGone !== null && win.webContents) {
                win.webContents.removeListener('render-process-gone', onRendererGone)
                onRendererGone = null
            }
            pendingRequest = null
        }

        const settle = (choice: UnsavedCloseChoice): void => {
            if (settled) {
                return
            }
            settled = true
            cleanup()
            logger.info(`[CloseConfirm] 未保存修改确认结果：${choice}`)
            resolve(choice)
        }

        const suspendTimeout = (): void => {
            if (timer !== null) {
                clearTimeout(timer)
                timer = null
            }
        }
        const resumeTimeout = (): void => {
            if (settled) {
                return
            }
            suspendTimeout()
            timer = setTimeout(() => {
                timer = null
                logger.warn(
                    `[CloseConfirm] 等待渲染层未保存确认超时（${timeoutMs}ms），按取消处理（安全侧，关闭/退出已中止可重试）`
                )
                settle('cancel')
            }, timeoutMs)
        }

        pendingRequest = {
            settled: false,
            saving: false,
            timer: null,
            settle,
            suspendTimeout,
            resumeTimeout
        }

        // 兜底监听的注册顺序：先注册监听再发请求，避免「请求已发出但监听未就位」的竞态
        onWindowGone = (): void => {
            logger.warn('[CloseConfirm] 等待确认期间主窗口已关闭，按取消处理（安全侧）')
            settle('cancel')
        }
        onRendererGone = (): void => {
            logger.warn('[CloseConfirm] 等待确认期间渲染进程退出，按取消处理（安全侧）')
            settle('cancel')
        }
        win.once('closed', onWindowGone)
        win.webContents.once('render-process-gone', onRendererGone)
        resumeTimeout()

        try {
            win.webContents.send(IPC.DIALOG.UNSAVED_CLOSE_REQUEST, payload)
        } catch (error) {
            logger.error('[CloseConfirm] 发送未保存确认请求失败，按取消处理', error)
            settle('cancel')
        }
    })
}

/**
 * 关闭/退出前弹出「未保存修改」确认框（应用内 BaseDialog 风格；渲染层不可用时回退原生框）。
 *
 * @param parentWindow 主窗口（存在且未销毁时请求渲染层确认；否则回退原生无父确认框）
 * @param options 场景选项（托盘语义 / 渲染层就绪状态 / 超时）
 * @returns 用户选择：save（保存成功并放行） / discard（不保存放行） / cancel（中止关闭）
 */
export async function confirmUnsavedChangesClose(
    parentWindow: BrowserWindow | null,
    options: ConfirmUnsavedChangesCloseOptions = {}
): Promise<UnsavedCloseChoice> {
    const minimizeToTray = options.minimizeToTray === true
    const rendererReady = options.rendererReady !== false
    const win = resolveUsableWindow(parentWindow)

    if (!win || !rendererReady) {
        logger.warn(
            '[CloseConfirm] 渲染层不可用，回退原生未保存确认框（不弹应用内框，避免双弹；原因：' +
                `${win ? '渲染层未就绪' : '窗口/webContents 已销毁'}）`
        )
        return showNativeUnsavedChangesDialog(win, minimizeToTray)
    }

    revealWindowForConfirmation(win)
    return requestRendererConfirmation(
        win,
        { minimizeToTray },
        options.timeoutMs ?? UNSAVED_CLOSE_TIMEOUT_MS
    )
}

/**
 * 处理渲染层「未保存修改」确认回执（由 `src/main/dialogs/dialogs.ts` 的
 * `UNSAVED_CLOSE_SUBMIT` invoke handler 调用，已先经 withSenderCheck 校验发送方）。
 *
 * - save：执行真实保存；成功 → 结算为 save（调用方随后放行关闭）；失败 → 返回 ok=false，
 *   保留等待状态与渲染层对话框（用户可重试保存 / 改选不保存 / 取消）；
 * - discard / cancel（含非法值归一化）：立即结算，返回 ok=true；
 * - 无等待中请求（超时/已结算后迟到的回执）：返回 `{ ok:false, stale:true }`，
 *   渲染层据此收起对话框（本次关闭已中止，用户可重新触发关闭）。
 *
 * 保存执行期间暂停等待超时（原生另存为对话框等可能耗时较长），保存失败后恢复计时。
 */
export async function submitUnsavedCloseChoice(
    rawChoice: unknown
): Promise<UnsavedCloseSubmitResult> {
    const pending = pendingRequest
    if (pending === null) {
        logger.warn('[CloseConfirm] 收到无等待中的未保存确认回执（可能已超时/已结算），忽略')
        return { ok: false, stale: true }
    }
    if (pending.saving) {
        logger.warn('[CloseConfirm] 上一「保存并关闭」仍在执行，忽略重复确认回执')
        return { ok: false, stale: true }
    }

    const choice = normalizeUnsavedCloseChoice(rawChoice)
    if (choice !== 'save') {
        pending.settle(choice)
        return { ok: true }
    }

    pending.saving = true
    pending.suspendTimeout()
    try {
        const saved = await SaveActiveFile()
        if (saved) {
            pending.settle('save')
            return { ok: true }
        }
        // 保存失败/被取消：不结算、保留对话框；恢复等待计时，用户可重试
        pending.saving = false
        pending.resumeTimeout()
        return { ok: false }
    } catch (error) {
        logger.error('[CloseConfirm] 「保存并关闭」执行异常，未关闭窗口', error)
        pending.saving = false
        pending.resumeTimeout()
        return { ok: false }
    }
}

/** 仅供单测：复位等待中的请求状态（生产代码不得调用；避免用例间残留） */
export function resetUnsavedCloseConfirmStateForTesting(): void {
    pendingRequest = null
}
