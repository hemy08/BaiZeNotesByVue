/**
 * 剪贴板统一封装（P3 修复：插件工具 12 处 navigator.clipboard.writeText 裸调用）。
 *
 * 问题：裸调用不 catch——权限被拒（Electron 未授予 clipboard-write 或系统剪贴板被占用）时
 * Promise 拒绝被静默吞掉，用户点了「复制」却无任何反馈。
 *
 * 封装行为：
 * - navigator.clipboard 不可用（非安全上下文 / 旧环境）或 writeText 被拒绝时，
 *   弹出 i18n 通用提示（common.clipboard.writeFailed），不再静默失败；
 * - 返回 Promise<boolean> 供调用方/测试判断结果；
 * - 空文本直接返回 false（不弹提示，与各组件「有内容才复制」的既有判断兼容）。
 */
import { t } from './i18n'

/**
 * 写入文本到剪贴板。
 * @param text 要复制的文本（空串不执行）
 * @returns 是否成功写入
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
    if (!text) {
        return false
    }
    try {
        if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(text)
            return true
        }
        throw new Error('navigator.clipboard.writeText unavailable')
    } catch {
        // 权限拒绝 / API 缺失：给出可见反馈（通用词条），不抛出打断调用方
        alert(t('common.clipboard.writeFailed'))
        return false
    }
}
