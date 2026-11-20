/**
 * P2 对话框可访问性：顶层对话框栈
 *
 * 背景：`<script setup>` 里的顶层变量是「每个组件实例的 setup 作用域」，不是模块作用域。
 * 因此「多个对话框同时可见时只让最顶层响应 Esc / Tab 焦点陷阱」所需的栈必须放在独立模块中，
 * 否则每个对话框各持一份栈、都会自认为顶层（一按 Esc 全部关闭）。
 *
 * 使用方式（BaseDialog）：
 * - 打开：`pushOpenDialog(token)`（幂等）；
 * - 关闭 / 卸载：`removeOpenDialog(token)`；
 * - 键盘处理：`isTopmostDialog(token)`。
 *
 * 仅存 Symbol 引用，不持有 DOM 或组件实例，避免内存泄漏。
 */
const openDialogStack: symbol[] = []

/** 登记一个已打开的对话框（同一 token 重复调用不重复入栈） */
export function pushOpenDialog(token: symbol): void {
    if (openDialogStack.includes(token)) return
    openDialogStack.push(token)
}

/** 移除一个对话框（关闭或卸载）；不存在时静默忽略 */
export function removeOpenDialog(token: symbol): void {
    const index = openDialogStack.lastIndexOf(token)
    if (index >= 0) openDialogStack.splice(index, 1)
}

/** 当前对话框是否为最顶层（最后打开的那个） */
export function isTopmostDialog(token: symbol): boolean {
    return openDialogStack[openDialogStack.length - 1] === token
}

/**
 * 当前已登记打开的对话框数量（诊断/单测用）。
 *
 * 内存与生命周期治理（P3）回归断言点：正常关闭/卸载后必须回到 0，
 * 防止「关闭时未 remove 导致 token 常驻栈中」这类随开关次数累积的泄漏。
 */
export function getOpenDialogCount(): number {
    return openDialogStack.length
}
