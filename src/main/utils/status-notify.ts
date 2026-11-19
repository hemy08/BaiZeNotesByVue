/**
 * 主进程状态栏提示 / 用户错误文案统一 helper（结构优化第 4 批 4.4 / M2 剩余）
 *
 * ## 收敛前（7 套等价实现，全部手写「取窗口 → isDestroyed 判断 → webContents.send
 * STATUS_BAR_UPDATE → try/catch 记日志」）
 * 1. `ipc/handlers.ts` notifyIpcAsyncError（异步 IPC 回调异常兜底）；
 * 2. `utils/utils.ts` notifyIpcAsyncError（同 1 的复制品）；
 * 3. `utils/utils.ts` notifyFilePathDenied（路径越界提示）；
 * 4. `ipc/handlers.ts` notifyWorkspaceRootRejected（工作区根非法提示）；
 * 5. `ipc/menu-handle.ts` describeMenuActionError + notifyMenuActionError（菜单动作失败）；
 * 6. `utils/file-utils/shared.ts` notifyPathAccessDenied（越界路径）；
 * 7. `utils/file-utils/shared.ts` notifyInvalidFileName（非法文件名）；
 * 8. `utils/file-utils/image-operations.ts` notifyImagePathDenied（图片路径越界，语义
 *    与 6 完全重复）。
 *
 * ## 收敛后
 * - `notifyStatus(payload, target)`：状态栏消息唯一发送实现（安全窗口判定 + 异常兜底），
 *   返回是否真正发出；发送失败只记日志、绝不向调用方抛错（错误上报失败不得引发异常循环）。
 * - `toUserError(error, fallback)`：把 `unknown` 异常归一化为面向用户的一行文案
 *   （Error → message；string 原样；其它 → String / 兜底文案），供状态栏/日志复用。
 *
 * 边界：本模块不依赖 electron 运行时（仅结构类型）与 i18n——文案由调用方经 tMain 组装并
 * 传入已本地化字符串，避免 menu-handle 早期启动链被 i18n/config 依赖提前拉入；需要
 * 翻译的通用异常上报 helper 见 `utils/error-report.ts`。
 */
import { IPC } from '../../shared/ipc-channels'
import type { StatusBarMessageType, StatusBarUpdatePayload } from '../../shared/types'
import { logger } from './logger'

/** 状态栏消息类型（真源：shared/types/status-bar 的 StatusBarMessageType） */
export type StatusMessageType = StatusBarMessageType

/**
 * 可接收状态栏消息的窗口最小结构。
 *
 * 使用结构类型而非 Electron.BrowserWindow，便于单测注入只含 `webContents.send` /
 * `isDestroyed` 的桩对象（主进程既有测试传统），也避免本模块在测试环境拉起 electron。
 */
export interface StatusNotifyTarget {
    /** 窗口是否已销毁（测试桩缺省时按可用处理，与 app-state.sendToMainWindow 口径一致） */
    isDestroyed?: () => boolean
    webContents?: {
        /** webContents 是否已销毁（缺省时按可用处理） */
        isDestroyed?: () => boolean
        /** IPC 发送（与 Electron webContents.send 同形） */
        send: (channel: string, ...args: unknown[]) => void
    } | null
}

/** 通过存活判定后的目标（webContents.send 保证存在） */
type AliveStatusNotifyTarget = StatusNotifyTarget & {
    webContents: NonNullable<StatusNotifyTarget['webContents']>
}

/**
 * 判定窗口是否可用于发送状态栏消息。
 *
 * 语义对齐 `app-state.sendToMainWindow`：窗口对象/ webContents 缺失 → 不可用；测试桩
 * 未提供 isDestroyed 时按可用处理（缺省宽松），提供了且返回 true 才视为销毁；
 * 未提供 send 时按不可用，避免非 BrowserWindow 桩对象在错误上报路径上抛 TypeError。
 */
export function isNotifyTargetAlive(
    target: StatusNotifyTarget | null | undefined
): target is AliveStatusNotifyTarget {
    if (!target || !target.webContents || typeof target.webContents.send !== 'function') {
        return false
    }
    if (typeof target.isDestroyed === 'function' && target.isDestroyed()) {
        return false
    }
    if (typeof target.webContents.isDestroyed === 'function' && target.webContents.isDestroyed()) {
        return false
    }
    return true
}

/**
 * 统一状态栏提示：向主窗口发送 STATUS_BAR_UPDATE。
 *
 * 行为约定（与收敛前各 helper 等价）：
 * 1. 目标窗口不可用（未创建/已销毁/测试桩残缺）→ 静默返回 false；
 * 2. 发送过程抛错（销毁竞态）→ 记日志并返回 false，绝不向上抛；
 * 3. 成功 → 返回 true。
 *
 * @param payload 状态栏负载（message 应为已本地化文案；type 受 StatusBarMessageType 约束）
 * @param target 目标窗口（通常为主窗口引用；无窗口时传 null/undefined）
 * @returns 是否真正发送成功
 */
export function notifyStatus(
    payload: StatusBarUpdatePayload,
    target: StatusNotifyTarget | null | undefined
): boolean {
    if (!isNotifyTargetAlive(target)) {
        return false
    }
    try {
        target.webContents.send(IPC.EVENTS.STATUS_BAR_UPDATE, payload)
        return true
    } catch (error) {
        // 窗口销毁竞态：状态栏不可用时静默降级，不影响调用方主流程
        logger.error('[StatusBar] 状态栏消息发送失败:', error)
        return false
    }
}

/**
 * 把未知异常归一化为面向用户的一行文案（不改写正常文案语义）。
 *
 * - `Error` → `message`（空 message 用 fallback）；
 * - `string` → 原样（空串用 fallback）；
 * - `null` / `undefined` → fallback；
 * - 其余（数字/布尔/普通对象/Symbol 等）→ `String(value)`，无意义字符串
 *   （`[object Object]`）或转换失败时用 fallback。
 *
 * @param error 捕获到的任意异常值（invoke/异步回调 reject 值类型不受控）
 * @param fallback 无法提取有效文案时的兜底文案（调用方可传 tMain 词条）
 */
export function toUserError(error: unknown, fallback = ''): string {
    if (typeof error === 'string') {
        return error.length > 0 ? error : fallback
    }
    if (error instanceof Error) {
        return error.message.length > 0 ? error.message : fallback
    }
    if (error === null || error === undefined) {
        return fallback
    }
    try {
        const text = String(error)
        return text.length > 0 && text !== '[object Object]' ? text : fallback
    } catch {
        // 极端对象（toString/valueOf 抛错）不影响错误上报主流程
        return fallback
    }
}
