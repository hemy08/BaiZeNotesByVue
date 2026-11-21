/**
 * 通用应用内消息/确认对话框服务（2026-11-21 用户需求）
 *
 * ## 背景
 * 关闭确认已迁移为应用内 BaseDialog（`close-confirm.ts` + `useUnsavedCloseConfirm` + 双通道
 * IPC），但其余用户可见确认/消息仍是主进程原生 `dialog.showMessageBox`，风格不一致：
 * - OPEN_EXE 安全确认（`ipc/navigation-ipc.ts`）
 * - 大文件打开确认（`utils/file-utils/file-operations.ts`）
 * - 自动更新 6 个调用点（`utils/auto-updater.ts`）
 * 本模块提供统一入口 `showAppMessageBox(options)`：正常路径展示渲染层
 * `AppMessageDialog.vue`（BaseDialog 外壳），异常/不可用路径回退原生框，保证安全确认与
 * 退出类流程不被卡死。
 *
 * ## 通信协议（复用关闭确认已建立的显式双通道模式，IPC-05）
 *   1. `showAppMessageBox()` 经 `webContents.send(IPC.DIALOG.APP_MESSAGE_REQUEST, payload)`
 *      请求渲染层展示消息框，并等待 `APP_MESSAGE_SUBMIT` 回执（requestId 关联）；
 *   2. 渲染层 `AppMessageBoxHost` 驱动 `AppMessageDialog.vue`，用户选择后
 *      `invoke(APP_MESSAGE_SUBMIT, requestId, choiceId)` 回传；
 *   3. 主进程内置队列串行化：同一时刻最多一个应用内消息框（并发请求排队，避免叠框）；
 *   4. 回执经 `submitAppMessageChoice()`（由 `src/main/dialogs/dialogs.ts` 注册的 handler
 *      调用，已先经 withSenderCheck）匹配 requestId：过期/重复回执返回 `{ ok:false, stale:true }`；
 *      非法 choiceId 按 cancelId 安全侧结算。
 *
 * ## 兜底策略（正常路径绝不出现「应用内框 + 原生框」双弹）
 * - **宿主未就绪**（欢迎页/主界面未挂载，HOST_READY 握手为 false）/ 无父窗口 / 窗口或
 *   webContents 已销毁 → 直接回退原生 `dialog.showMessageBox`（请求从一开始就不发往渲染层，
 *   因此不存在双弹），记录 warn；
 * - **等待超时**（默认 30s，可经 timeoutMs 覆盖并钳制在 1s~5min）：先发
 *   `APP_MESSAGE_DISMISS` 撤销应用内框（best effort），再回退原生框，记录 warn；
 * - **窗口关闭 / 渲染进程 render-process-gone**：按 cancelId 安全侧结算（不再回退原生，
 *   窗口已不可用；避免关闭流程卡死）；
 * - **发送异常**（销毁竞态）：回退原生框；
 * - 原生框自身异常（窗口销毁等）→ 返回 cancelId 并记录 error，绝不向调用方抛出。
 *
 * ## 队列语义
 * requests 串行：一个请求结算（用户选择/超时/窗口事件/原生兜底完成）后才处理下一个。
 * 排队期间不启动超时计时（超时从真正展示开始计），避免长队列把后续请求提前判超时。
 *
 * ## 消费方
 * - `src/main/ipc/navigation-ipc.ts`：OPEN_EXE 安全确认；
 * - `src/main/utils/file-utils/file-operations.ts`：大文件打开确认；
 * - `src/main/utils/auto-updater.ts`：安装重启询问 / 保存失败 / 未配置 / 已是最新 / 检查
 *   或更新失败共 6 类提示；
 * - 关闭确认的原生兜底（`close-confirm.ts`）**保持独立不动**（其交互语义与保存动作绑定）。
 */
import { dialog, type BrowserWindow, type MessageBoxOptions } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type {
    AppMessageBoxButton,
    AppMessageBoxKind,
    AppMessageBoxRequestPayload,
    AppMessageBoxSubmitResult
} from '../../shared/types'
import { getAppContext } from '../app-context'
import { tMain } from './i18n'
import { logger } from './logger'

/** 默认等待渲染层回执的超时（毫秒）。超时后撤销应用内框并回退原生框。 */
export const APP_MESSAGE_TIMEOUT_MS = 30_000

/** 允许的最小/最大超时（防御异常入参；调用方如需更长等待应显式确认合理性）。 */
export const APP_MESSAGE_MIN_TIMEOUT_MS = 1_000
export const APP_MESSAGE_MAX_TIMEOUT_MS = 5 * 60_000

/** 合法的消息框类型集合（渲染层/调用方入参归一化依据） */
const VALID_KINDS: readonly AppMessageBoxKind[] = ['info', 'warning', 'error', 'confirm']

/** `showAppMessageBox` 可选项（按钮文案由调用方用 tMain 本地化后传入） */
export interface ShowAppMessageBoxOptions {
    /** 消息框类型（默认 info；confirm 对应原生 question） */
    kind?: AppMessageBoxKind
    /** 标题 */
    title: string
    /** 正文 */
    message: string
    /** 补充说明（可选，支持换行） */
    detail?: string
    /** 按钮列表（缺省单按钮「确定」；id 必须唯一且非空） */
    buttons?: AppMessageBoxButton[]
    /** 默认聚焦/回车触发的按钮 id（缺省第一个按钮） */
    defaultId?: string
    /** 取消语义按钮 id（Esc/关闭/超时兜底；缺省最后一个按钮） */
    cancelId?: string
    /** 等待渲染层回执的超时（毫秒；缺省 APP_MESSAGE_TIMEOUT_MS） */
    timeoutMs?: number
    /** 父窗口（缺省取 AppContext.mainWindow；无父窗口时回退无父原生框） */
    parentWindow?: BrowserWindow | null
}

/** `showAppMessageBox` 结果（choiceId 恒为合法按钮 id；canceled 表示取消/兜底路径） */
export interface AppMessageBoxResult {
    /** 用户选择的按钮 id（Esc/关闭/超时/异常兜底统一为 cancelId） */
    choiceId: string
    /** true = 取消语义（Esc/关闭/超时/渲染层崩溃/无可用结果） */
    canceled: boolean
}

/** 排队中的请求 */
interface QueuedRequest {
    /** 已完成归一化的渲染层载荷 */
    payload: AppMessageBoxRequestPayload
    /** 请求发起时的父窗口（可能为 null；展示时再判活） */
    parentWindow: BrowserWindow | null
    /** 结算回调（唯一一次） */
    resolve: (result: AppMessageBoxResult) => void
}

/** 正在等待渲染层回执的请求（null = 无活动请求） */
interface ActiveRendererRequest {
    /** 等待中的载荷（requestId 匹配依据） */
    payload: AppMessageBoxRequestPayload
    /** 结算本次请求（幂等：清理计时器/监听并移除 active 状态） */
    settle: (result: AppMessageBoxResult) => void
}

/** 应用内消息框宿主就绪状态（渲染层 AppMessageBoxHost 挂载握手） */
let hostReady = false
/** 请求序号（requestId 生成，进程内单调递增） */
let requestSequence = 0
/** 串行队列（同一时刻最多一个消息框） */
const requestQueue: QueuedRequest[] = []
/** 正在处理（展示/兜底）的请求 */
let activeRendererRequest: ActiveRendererRequest | null = null
/** 队列泵运行标志（防止并发 pump 叠框） */
let pumping = false

/** 归一化消息框类型（未知回退 info） */
function normalizeKind(raw: unknown): AppMessageBoxKind {
    return VALID_KINDS.includes(raw as AppMessageBoxKind) ? (raw as AppMessageBoxKind) : 'info'
}

/** 归一化超时：非有限正数回退默认；越界钳制到 [MIN, MAX] */
function normalizeTimeout(raw: unknown): number {
    if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
        return APP_MESSAGE_TIMEOUT_MS
    }
    return Math.min(
        APP_MESSAGE_MAX_TIMEOUT_MS,
        Math.max(APP_MESSAGE_MIN_TIMEOUT_MS, Math.round(raw))
    )
}

/**
 * 归一化按钮列表：过滤非法项 + 去重 id；空列表回退单按钮「确定」。
 * 导出便于单测直接覆盖（纯函数）。
 */
export function normalizeAppMessageButtons(raw: unknown): AppMessageBoxButton[] {
    const result: AppMessageBoxButton[] = []
    if (Array.isArray(raw)) {
        for (const item of raw) {
            if (!item || typeof item !== 'object') {
                continue
            }
            const { id, label, kind } = item as {
                id?: unknown
                label?: unknown
                kind?: unknown
            }
            if (typeof id !== 'string' || id.trim().length === 0) {
                continue
            }
            if (typeof label !== 'string' || label.trim().length === 0) {
                continue
            }
            if (result.some((button) => button.id === id)) {
                continue
            }
            const button: AppMessageBoxButton = { id, label }
            if (kind === 'primary' || kind === 'danger' || kind === 'default') {
                button.kind = kind
            }
            result.push(button)
        }
    }
    if (result.length === 0) {
        result.push({ id: 'ok', label: tMain('common.ok'), kind: 'primary' })
    }
    return result
}

/**
 * 生成渲染层请求载荷（requestId + 归一化字段）。导出便于单测覆盖纯逻辑。
 */
export function buildAppMessageRequestPayload(
    options: ShowAppMessageBoxOptions,
    requestId: string
): AppMessageBoxRequestPayload {
    const buttons = normalizeAppMessageButtons(options.buttons)
    const buttonIds = buttons.map((button) => button.id)
    const defaultId =
        typeof options.defaultId === 'string' && buttonIds.includes(options.defaultId)
            ? options.defaultId
            : buttons[0].id
    const cancelId =
        typeof options.cancelId === 'string' && buttonIds.includes(options.cancelId)
            ? options.cancelId
            : buttons[buttons.length - 1].id
    const payload: AppMessageBoxRequestPayload = {
        requestId,
        kind: normalizeKind(options.kind),
        title: typeof options.title === 'string' ? options.title : '',
        message: typeof options.message === 'string' ? options.message : '',
        buttons,
        defaultId,
        cancelId,
        timeoutMs: normalizeTimeout(options.timeoutMs)
    }
    if (typeof options.detail === 'string' && options.detail.length > 0) {
        payload.detail = options.detail
    }
    return payload
}

/** 消息框类型 → 原生 MessageBox type（confirm 用 question；原生类型无 confirm） */
function mapKindToNativeType(kind: AppMessageBoxKind): MessageBoxOptions['type'] {
    if (kind === 'confirm') {
        return 'question'
    }
    return kind
}

/** 浏览器窗口可用性判定（窗口 / webContents 任一销毁即视为不可用） */
function resolveUsableWindow(window: BrowserWindow | null): BrowserWindow | null {
    if (!window) {
        return null
    }
    try {
        if (window.isDestroyed()) {
            return null
        }
    } catch {
        // isDestroyed 自身抛错（窗口已释放等）按不可用处理
        return null
    }
    const contents = (
        window as unknown as { webContents?: { isDestroyed?: () => boolean; send?: unknown } }
    ).webContents
    if (!contents || typeof contents.send !== 'function') {
        return null
    }
    if (typeof contents.isDestroyed === 'function' && contents.isDestroyed()) {
        return null
    }
    return window
}

/**
 * 原生兜底消息框（渲染层不可用 / 超时 / 发送异常时唯一会出现的原生框）。
 * 原生框自身异常（窗口销毁等）→ 返回 cancelId，绝不向调用方抛出。
 */
async function showNativeMessageBox(
    payload: AppMessageBoxRequestPayload,
    parentWindow: BrowserWindow | null
): Promise<AppMessageBoxResult> {
    const buttonIds = payload.buttons.map((button) => button.id)
    const defaultIndex = Math.max(0, buttonIds.indexOf(payload.defaultId))
    const cancelIndex = Math.max(0, buttonIds.indexOf(payload.cancelId))
    const options: MessageBoxOptions = {
        type: mapKindToNativeType(payload.kind),
        title: payload.title,
        message: payload.message,
        buttons: payload.buttons.map((button) => button.label),
        defaultId: defaultIndex,
        cancelId: cancelIndex,
        noLink: true
    }
    if (payload.detail) {
        options.detail = payload.detail
    }
    try {
        const win = resolveUsableWindow(parentWindow)
        const { response } = win
            ? await dialog.showMessageBox(win, options)
            : await dialog.showMessageBox(options)
        const button = payload.buttons[response]
        if (!button) {
            return { choiceId: payload.cancelId, canceled: true }
        }
        return { choiceId: button.id, canceled: response === cancelIndex }
    } catch (error) {
        logger.error('[AppMessageBox] 原生兜底消息框展示失败，按取消处理', error)
        return { choiceId: payload.cancelId, canceled: true }
    }
}

/** 处理一个排队请求（宿主/窗口不可用时直接原生兜底，否则发往渲染层等待回执） */
async function runQueuedRequest(entry: QueuedRequest): Promise<void> {
    const win = resolveUsableWindow(entry.parentWindow)
    if (!win) {
        logger.warn(
            '[AppMessageBox] 无可用父窗口（窗口已销毁/无主窗口），回退原生消息框（无父窗口）'
        )
        entry.resolve(await showNativeMessageBox(entry.payload, null))
        return
    }
    if (!hostReady) {
        logger.warn(
            '[AppMessageBox] 应用内消息框宿主未就绪（欢迎页/主界面未挂载或渲染层异常），回退原生消息框'
        )
        entry.resolve(await showNativeMessageBox(entry.payload, win))
        return
    }
    await runRendererRequest(entry, win)
}

/**
 * 向渲染层发送请求并等待回执；所有异常路径在此结算（幂等）。
 *
 * 兜底顺序：超时/发送异常 → 撤销应用内框 + 原生兜底；窗口关闭/渲染进程退出 → 安全侧取消。
 */
function runRendererRequest(entry: QueuedRequest, win: BrowserWindow): Promise<void> {
    return new Promise<void>((queueResolve) => {
        const { payload } = entry
        const timeoutMs = payload.timeoutMs ?? APP_MESSAGE_TIMEOUT_MS
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
            if (onRendererGone !== null) {
                try {
                    win.webContents.removeListener('render-process-gone', onRendererGone)
                } catch {
                    // webContents 已销毁时移除监听可能抛错：忽略（监听随销毁自然失效）
                }
                onRendererGone = null
            }
            activeRendererRequest = null
        }

        /** 结算：清理监听/计时器 → 出队 → resolve 调用方 Promise */
        const settle = (result: AppMessageBoxResult): void => {
            if (settled) {
                return
            }
            settled = true
            cleanup()
            logger.info(
                `[AppMessageBox] 消息框结算：choiceId=${result.choiceId}（取消=${result.canceled}）`
            )
            entry.resolve(result)
            queueResolve()
        }

        /** 撤销应用内框（best effort）后回退原生框（超时/发送异常路径） */
        const fallbackToNative = async (reason: string): Promise<void> => {
            if (settled) {
                return
            }
            logger.warn(reason)
            settled = true
            cleanup()
            try {
                win.webContents.send(IPC.DIALOG.APP_MESSAGE_DISMISS, payload.requestId)
            } catch (error) {
                logger.warn('[AppMessageBox] 撤销应用内消息框失败（渲染层可能已不可用）', error)
            }
            const result = await showNativeMessageBox(payload, win)
            entry.resolve(result)
            queueResolve()
        }

        onWindowGone = (): void => {
            settle({ choiceId: payload.cancelId, canceled: true })
            logger.warn('[AppMessageBox] 等待回执期间窗口已关闭，按取消处理（安全侧）')
        }
        onRendererGone = (): void => {
            settle({ choiceId: payload.cancelId, canceled: true })
            logger.warn('[AppMessageBox] 等待回执期间渲染进程退出，按取消处理（安全侧）')
        }
        // 先注册兜底监听再发请求，避免「请求已发出但监听未就位」的竞态
        win.once('closed', onWindowGone)
        win.webContents.once('render-process-gone', onRendererGone)

        activeRendererRequest = { payload, settle }
        timer = setTimeout(() => {
            timer = null
            void fallbackToNative(
                `[AppMessageBox] 等待渲染层消息框回执超时（${timeoutMs}ms），撤销应用内框并回退原生消息框`
            )
        }, timeoutMs)

        try {
            win.webContents.send(IPC.DIALOG.APP_MESSAGE_REQUEST, payload)
        } catch (error) {
            void fallbackToNative(
                '[AppMessageBox] 发送应用内消息框请求失败（窗口销毁竞态），回退原生消息框'
            )
            logger.warn('[AppMessageBox] 发送异常详情', error)
        }
    })
}

/** 队列泵：串行处理排队请求（同一时刻最多一个消息框） */
function pumpRequestQueue(): void {
    if (pumping || activeRendererRequest !== null) {
        return
    }
    const next = requestQueue.shift()
    if (!next) {
        return
    }
    pumping = true
    void runQueuedRequest(next).finally(() => {
        pumping = false
        if (requestQueue.length > 0) {
            pumpRequestQueue()
        }
    })
}

/**
 * 展示应用内消息/确认框并等待用户选择（通用入口）。
 *
 * 正常路径：渲染层 BaseDialog 风格消息框；渲染层不可用/超时/异常时自动回退原生框。
 * 返回值恒为合法结果（不抛异常）：`choiceId` 为按钮 id，`canceled` 表示取消/安全侧。
 *
 * @example
 * const { choiceId } = await showAppMessageBox({
 *   kind: 'warning',
 *   title: tMain('mainMsg.security.openExeTitle'),
 *   message: tMain('mainMsg.security.openExeMessage'),
 *   detail: tMain('mainMsg.security.openExeDetail', { path: exePath }),
 *   buttons: [
 *     { id: 'cancel', label: tMain('mainMsg.dialog.cancel') },
 *     { id: 'confirm', label: tMain('mainMsg.security.openExeConfirm'), kind: 'danger' }
 *   ],
 *   defaultId: 'cancel',
 *   cancelId: 'cancel',
 *   parentWindow: mainWindow
 * })
 * if (choiceId !== 'confirm') return
 */
export function showAppMessageBox(options: ShowAppMessageBoxOptions): Promise<AppMessageBoxResult> {
    requestSequence += 1
    const requestId = `app-msg-${requestSequence}`
    const payload = buildAppMessageRequestPayload(options, requestId)
    const parentWindow = options.parentWindow ?? getAppContext().mainWindow ?? null
    return new Promise<AppMessageBoxResult>((resolve) => {
        requestQueue.push({ payload, parentWindow, resolve })
        pumpRequestQueue()
    })
}

/**
 * 处理渲染层消息框选择回执（由 `src/main/dialogs/dialogs.ts` 的
 * `APP_MESSAGE_SUBMIT` invoke handler 调用，已先经 withSenderCheck 校验发送方）。
 *
 * - requestId 不匹配/无等待中请求（超时/重复回执）→ `{ ok:false, stale:true }`；
 * - choiceId 非法（非本请求按钮）→ 按 cancelId 安全侧结算，返回 ok=true；
 * - 合法选择 → 结算并返回 ok=true。
 */
export function submitAppMessageChoice(
    requestId: unknown,
    choiceId: unknown
): AppMessageBoxSubmitResult {
    const active = activeRendererRequest
    if (active === null) {
        logger.warn('[AppMessageBox] 收到无等待中请求的消息框回执（可能已超时/已结算），忽略')
        return { ok: false, stale: true }
    }
    if (typeof requestId !== 'string' || requestId !== active.payload.requestId) {
        logger.warn('[AppMessageBox] 消息框回执 requestId 不匹配（过期/重复回执），忽略')
        return { ok: false, stale: true }
    }
    const validChoice =
        typeof choiceId === 'string' &&
        active.payload.buttons.some((button) => button.id === choiceId)
    if (!validChoice) {
        logger.warn('[AppMessageBox] 消息框回执 choiceId 非法，按取消处理（安全侧）')
        active.settle({ choiceId: active.payload.cancelId, canceled: true })
        return { ok: true }
    }
    active.settle({ choiceId: choiceId as string, canceled: choiceId === active.payload.cancelId })
    return { ok: true }
}

/**
 * 渲染层消息框宿主就绪握手（`APP_MESSAGE_HOST_READY` handler 调用）。
 *
 * 宿主卸载（false）时若仍有等待中的请求，按取消安全侧结算：宿主已不在，应用内框
 * 不可能继续展示，不能白等超时（窗口关闭场景下窗口事件会先/同时结算，settle 幂等）。
 */
export function notifyAppMessageHostReady(ready: unknown): void {
    const next = ready === true
    if (next === hostReady) {
        return
    }
    hostReady = next
    logger.info(`[AppMessageBox] 渲染层消息框宿主${next ? '已就绪' : '已卸载'}`)
    if (!next && activeRendererRequest !== null) {
        const active = activeRendererRequest
        logger.warn('[AppMessageBox] 宿主卸载时仍有等待中的消息框，按取消安全侧结算')
        active.settle({ choiceId: active.payload.cancelId, canceled: true })
    }
}

/** 渲染层消息框宿主是否已就绪（诊断/单测用） */
export function isAppMessageHostReady(): boolean {
    return hostReady
}

/** 仅供单测：复位模块级状态（生产代码不得调用；避免用例间残留） */
export function resetAppMessageBoxStateForTesting(): void {
    hostReady = false
    requestSequence = 0
    requestQueue.length = 0
    activeRendererRequest = null
    pumping = false
}
