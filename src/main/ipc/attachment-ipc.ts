/**
 * B5 附件管理 IPC 注册（1.5.1，2026-11-22）
 *
 * 链路（IPC-17 六步）：常量（ipc-channels.ts 的 `IPC.FILE.GET_ATTACHMENT_AUDIT` /
 * `TRASH_ATTACHMENTS` / `RENAME_ATTACHMENT`）→ 契约（shared/types/ipc.ts）→ 生成白名单
 * （build/generate-preload-whitelist.js）→ **本模块 handler** → 渲染层调用 → 测试。
 *
 * ## 安全边界
 * - 工作区根**只取** `appState.rootPath`：渲染层载荷里不接收根路径，不能指定扫描/删除范围；
 * - 三个通道均为 `registerHandleOnce` + `withSenderCheck(..., { kind: 'handle' })`，
 *   仅受信主窗口（默认 scope main-window）可调用，拒绝时返回 `UNTRUSTED_SENDER_RESULT`；
 * - 载荷在 handler 层做类型粗校验（数组/字符串），业务校验全部在
 *   `main/utils/attachment-manager.ts` 内再次执行（路径/扩展名/引用复核/回收站）；
 * - 业务失败一律返回结构化 `{ ok: false, code }`，不向渲染层抛堆栈；
 *   `withHandleErrorLog` 只兜住未预期异常并补带通道名的错误日志。
 *
 * ## 并发
 * 删除/重命名属于写盘操作，经模块内串行队列执行（B5-R10），避免两次变更交错导致
 * 「引用复核后又被改名」的竞态；只读审计不进队列。
 */
import type { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type {
    AttachmentAuditResult,
    AttachmentRenameResult,
    AttachmentTrashResult
} from '../../shared/types/ipc'
import { auditAttachments, renameAttachment, trashAttachments } from '../utils/attachment-manager'
import { appState } from '../utils/app-state'
import { withSenderCheck } from '../utils/ipc-security'
import { logger } from '../utils/logger'
import { withHandleErrorLog } from './handle-error-log'
import { ipcListenerManager } from './ipc-listener-manager'

/** 写盘类操作串行队列（B5-R10：删除/重命名不并发执行） */
let mutationQueue: Promise<unknown> = Promise.resolve()

/** 串行执行写盘类任务：前序任务失败不阻断后续任务 */
function enqueueMutation<T>(task: () => Promise<T>): Promise<T> {
    const run = mutationQueue.then(task, task)
    // 队列只用于排序，自身的失败/成功不影响下一个任务
    mutationQueue = run.then(
        () => undefined,
        () => undefined
    )
    return run
}

/**
 * 重置模块内队列状态（**仅供单元测试**；生产不调用）。
 *
 * 注册台账由 `ipcListenerManager` 统一持有，本模块没有其它进程级状态。
 */
export function resetAttachmentIpcForTesting(): void {
    mutationQueue = Promise.resolve()
}

/**
 * `FILE.GET_ATTACHMENT_AUDIT` 业务入口：只读孤儿审计。
 *
 * @returns 结构化结果；无工作区 `NO_WORKSPACE`，未预期异常 `AUDIT_ERROR`
 */
export async function queryAttachmentAudit(): Promise<AttachmentAuditResult> {
    const rootPath = appState.rootPath
    if (!rootPath) {
        return { ok: false, code: 'NO_WORKSPACE' }
    }
    try {
        return await auditAttachments(rootPath)
    } catch (error) {
        logger.error('[IPC] B5 附件审计未预期异常：', error)
        return { ok: false, code: 'AUDIT_ERROR' }
    }
}

/**
 * `FILE.TRASH_ATTACHMENTS` 业务入口：批量移入系统回收站。
 *
 * @param rawPaths 渲染层载荷（只接受字符串数组；长度/路径/引用由服务层二次校验）
 * @returns 结构化结果；无工作区 `NO_WORKSPACE`，载荷非法 `INVALID_PAYLOAD`，
 *          未预期异常 `TRASH_ERROR`
 */
export async function trashAttachmentPaths(rawPaths: unknown): Promise<AttachmentTrashResult> {
    const rootPath = appState.rootPath
    if (!rootPath) {
        return { ok: false, code: 'NO_WORKSPACE' }
    }
    if (!Array.isArray(rawPaths)) {
        return { ok: false, code: 'INVALID_PAYLOAD' }
    }
    try {
        return await trashAttachments(rootPath, rawPaths)
    } catch (error) {
        logger.error('[IPC] B5 批量移入回收站未预期异常：', error)
        return { ok: false, code: 'TRASH_ERROR' }
    }
}

/**
 * `FILE.RENAME_ATTACHMENT` 业务入口：附件重命名 + Markdown 引用更新。
 *
 * @param rawOldPath 旧附件绝对路径（服务层重新校验）
 * @param rawNewName 新文件名（服务层重新校验）
 * @returns 结构化结果；无工作区 `NO_WORKSPACE`，载荷类型非法 `INVALID_PAYLOAD`，
 *          未预期异常 `RENAME_FAILED`
 */
export async function renameAttachmentFromIpc(
    rawOldPath: unknown,
    rawNewName: unknown
): Promise<AttachmentRenameResult> {
    const rootPath = appState.rootPath
    if (!rootPath) {
        return { ok: false, code: 'NO_WORKSPACE' }
    }
    if (typeof rawOldPath !== 'string' || typeof rawNewName !== 'string') {
        return { ok: false, code: 'INVALID_PAYLOAD' }
    }
    try {
        return await renameAttachment(rootPath, rawOldPath, rawNewName)
    } catch (error) {
        logger.error('[IPC] B5 附件重命名未预期异常：', error)
        return { ok: false, code: 'RENAME_FAILED' }
    }
}

/**
 * 注册 B5 附件管理 IPC（三个 invoke 通道）。
 *
 * @param _mainWindow 主窗口（sender 校验由 withSenderCheck 依据受信主窗口登记完成；
 *                    本模块不主动推送消息，参数保留以对齐各域注册函数签名）
 * @param componentId 监听台账组件 ID（来源 registry 编排）
 */
export function registerAttachmentIpc(_mainWindow: BrowserWindow, componentId: string): void {
    // FILE.GET_ATTACHMENT_AUDIT：只读孤儿审计（不进入写盘队列）
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.GET_ATTACHMENT_AUDIT,
        withSenderCheck(
            IPC.FILE.GET_ATTACHMENT_AUDIT,
            withHandleErrorLog(IPC.FILE.GET_ATTACHMENT_AUDIT, async () => queryAttachmentAudit()),
            { kind: 'handle' }
        ),
        componentId
    )

    // FILE.TRASH_ATTACHMENTS：批量移入回收站（写盘类，串行执行）
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.TRASH_ATTACHMENTS,
        withSenderCheck(
            IPC.FILE.TRASH_ATTACHMENTS,
            withHandleErrorLog(
                IPC.FILE.TRASH_ATTACHMENTS,
                async (_event: Electron.IpcMainInvokeEvent, paths: unknown) =>
                    enqueueMutation(() => trashAttachmentPaths(paths))
            ),
            { kind: 'handle' }
        ),
        componentId
    )

    // FILE.RENAME_ATTACHMENT：附件重命名 + 引用更新（写盘类，串行执行）
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.RENAME_ATTACHMENT,
        withSenderCheck(
            IPC.FILE.RENAME_ATTACHMENT,
            withHandleErrorLog(
                IPC.FILE.RENAME_ATTACHMENT,
                async (_event: Electron.IpcMainInvokeEvent, oldPath: unknown, newName: unknown) =>
                    enqueueMutation(() => renameAttachmentFromIpc(oldPath, newName))
            ),
            { kind: 'handle' }
        ),
        componentId
    )
}
