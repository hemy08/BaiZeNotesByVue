/**
 * 对话框可访问性：打开模态对话框期间锁定 body 滚动（模块级引用计数）
 *
 * 背景：BaseDialog 已统一 23 个对话框，但打开对话框后背景仍可滚动（滚轮/触控板会滚动
 * 对话框背后的正文，导致视觉抖动，且键盘用户可能通过 PageDown 滚动到被遮罩的页面）。
 * 模态对话框打开期间应锁定背景滚动，关闭后恢复。
 *
 * 为什么放在独立模块：`<script setup>` 的顶层变量是「每个组件实例的 setup 作用域」，
 * 若把计数放在 BaseDialog.vue 内，每个对话框实例各持一份计数——嵌套对话框（如设置对话框
 * 上再弹消息框）中先关闭任意一个就可能在另一个仍打开时提前恢复滚动。模块级计数保证：
 * - 第一个对话框打开：保存 body 原内联 overflow 并设为 hidden；
 * - 后续对话框打开：只增加计数，不重复保存/设置；
 * - 关闭任意对话框：递减；仅当计数归零（最后一个对话框关闭）才恢复原值。
 *
 * 只操作 `document.body.style.overflow` 内联样式：不修改全局 CSS，不影响主题；
 * 恢复时使用 `removeProperty`（原值为空）以回到样式表默认值，避免留下内联样式。
 */
let lockCount = 0
/** 第一次加锁前 body 的内联 overflow 原始值（'' 表示原值由样式表决定） */
let savedOverflow = ''

/** 取 body（非浏览器环境安全返回 null，便于 SSR / 单测中无 document 时调用） */
function getBody(): HTMLElement | null {
    return typeof document !== 'undefined' ? document.body : null
}

/** 打开对话框：第一个打开者锁定 body 滚动，其余仅增加引用计数 */
export function lockDialogScroll(): void {
    const body = getBody()
    if (!body) return
    lockCount += 1
    if (lockCount > 1) return
    savedOverflow = body.style.overflow
    body.style.overflow = 'hidden'
}

/** 关闭对话框：计数归零时恢复 body 滚动；未加锁时静默忽略（幂等） */
export function unlockDialogScroll(): void {
    if (lockCount === 0) return
    lockCount -= 1
    if (lockCount > 0) return
    const body = getBody()
    if (!body) {
        savedOverflow = ''
        return
    }
    if (savedOverflow) {
        body.style.overflow = savedOverflow
    } else {
        body.style.removeProperty('overflow')
    }
    savedOverflow = ''
}
