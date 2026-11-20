/**
 * 渲染层「用户主动操作失败」统一反馈 helper（P2 功能错误处理修复）
 *
 * 背景：编码转换 / 按编码重新打开、系统设置保存、编辑器设置保存、快捷链接保存等
 * 用户主动触发的操作，失败路径此前只写日志（logger.error）或表现为未捕获的
 * Promise 拒绝——界面上没有任何反馈，用户误以为操作已成功。
 *
 * 统一口径（与既有保存失败路径一致）：
 * 1. 一律记 error 日志（保留排查线索，单测可断言）；
 * 2. 经既有全局消息对话框（useConfigStore 的 showDialog 体系）展示已本地化的标题/正文；
 * 3. 调用方提供 retry 时，对话框底部显示「重试」按钮（文案复用 dialogRenderer.common.retry），
 *    点击后关闭消息框并重新执行同一操作；重试再失败会再次进入本 helper（可反复重试）。
 *
 * 边界：本模块不引入主进程依赖；文案由调用方经 t() 组装后传入（i18n 边界清晰），
 * 错误详情经 describeActionError 归一化（去掉 Electron invoke 包装前缀）。
 */
import { getConfigStore } from './useConfigStore'
import { logger } from './logger'

/** 用户操作失败反馈参数 */
export interface ActionFailureOptions {
    /** 已本地化的失败标题（如 t('dialogRenderer.encoding.convertFailedTitle')） */
    title: string
    /** 已本地化的失败正文（错误详情已嵌入，如 t('...', { error, encoding })） */
    message: string
    /** 可选重试动作；提供时消息对话框显示「重试」按钮 */
    retry?: () => void | Promise<void>
}

/**
 * 归一化错误详情（去掉 Electron IPC 包装前缀，只保留面向用户的原始信息）。
 *
 * `ipcRenderer.invoke` 的拒绝值形如
 * `Error invoking remote method '<channel>': Error: <原始错误信息>`，
 * 直接展示会让用户看到通道名与 Error 前缀，属于噪声。
 */
function normalizeErrorText(text: string): string {
    return text
        .trim()
        .replace(/^Error invoking remote method '[^']*':\s*/, '')
        .replace(/^Error:\s*/, '')
        .trim()
}

/**
 * 从任意异常值提取面向用户的错误详情（不会抛错）。
 *
 * @param error 捕获到的任意异常值（invoke/异步回调的 reject 值类型不受控）
 * @param fallback 无法提取有效文案时的兜底文案（调用方传已本地化文本，如 t('common.unknown')）
 */
export function describeActionError(error: unknown, fallback: string): string {
    let text = ''
    if (typeof error === 'string') {
        text = error
    } else if (error instanceof Error) {
        text = error.message
    } else if (error !== null && error !== undefined) {
        try {
            text = String(error)
        } catch {
            // 极端对象（toString/valueOf 抛错）不影响错误反馈主流程
            text = ''
        }
    }
    const normalized = normalizeErrorText(text)
    return normalized.length > 0 && normalized !== '[object Object]' ? normalized : fallback
}

/**
 * 上报一次用户操作失败：日志 + 全局消息对话框（可选带「重试」按钮）。
 *
 * 对话框未挂载（极简测试环境）时不抛错：getConfigStore 只操作纯前端状态。
 */
export function reportActionFailure(options: ActionFailureOptions): void {
    logger.error(`[ActionFeedback] ${options.title}: ${options.message}`)
    const store = getConfigStore()
    if (typeof options.retry === 'function') {
        store.showRetryableError(options.title, options.message, options.retry)
        return
    }
    store.showError(options.title, options.message)
}
