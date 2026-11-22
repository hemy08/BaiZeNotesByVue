/** E11：工作区布局对话框的显隐状态 */
import { reactive } from 'vue'

export const workspaceLayoutDialogState = reactive({
    visible: false
})

export function openWorkspaceLayoutDialogState(): void {
    workspaceLayoutDialogState.visible = true
}

export function closeWorkspaceLayoutDialogState(): void {
    workspaceLayoutDialogState.visible = false
}
