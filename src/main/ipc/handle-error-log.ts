/**
 * CQ-05：invoke/handle 通道错误日志包装——保持"异常抛给渲染层 invoke 调用方"
 * 的语义（调用方可 try/catch），仅在主进程补一条带通道名的错误日志，避免失败静默。
 *
 * IPC 注册收口（P2）：原 `utils/utils.ts` 与 `ipc/handlers.ts` 各有一份逐字相同的实现；
 * 本模块先作为 utils 侧拆分后各域模块（crypto/file-editor 等）的唯一共享实现，
 * handlers.ts 的既有副本保持不动（行为零变化，后续可另行收敛）。
 */
import { logger } from '../utils/logger'

export function withHandleErrorLog<TArgs extends unknown[]>(
    channel: string,
    handler: (...args: TArgs) => unknown
): (...args: TArgs) => Promise<unknown> {
    return async (...args: TArgs) => {
        try {
            return await handler(...args)
        } catch (error) {
            logger.error(`[IPC] 通道 "${channel}" 处理失败:`, error)
            throw error
        }
    }
}
