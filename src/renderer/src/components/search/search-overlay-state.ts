/**
 * A2/A9 浮层显隐的模块级控制器（1.5.1）
 *
 * 为什么需要独立状态文件：
 * - SearchOverlayHost 负责渲染/快捷键；菜单与命令面板也需要打开同一浮层；
 * - Vue 组件实例无法被 menu-actions 直接访问，故把显隐状态提升为模块单例；
 * - 状态只存 ref，不触碰 IPC/文件，组件卸载后仍可复用（下次挂载读当前值）。
 */
import { ref } from 'vue'

export type PaletteMode = 'command' | 'file'

/** A2 工作区搜索对话框显隐 */
export const workspaceSearchVisible = ref(false)
/** A9 命令面板显隐 */
export const commandPaletteVisible = ref(false)
/** A9 打开模式（命令 / 文件 Quick Open） */
export const commandPaletteMode = ref<PaletteMode>('command')

/** 打开工作区搜索（与命令面板互斥） */
export function openWorkspaceSearch(): void {
    commandPaletteVisible.value = false
    workspaceSearchVisible.value = true
}

/** 打开命令面板（命令模式） */
export function openCommandPalette(): void {
    workspaceSearchVisible.value = false
    commandPaletteMode.value = 'command'
    commandPaletteVisible.value = true
}

/** 打开文件 Quick Open（文件模式） */
export function openQuickOpen(): void {
    workspaceSearchVisible.value = false
    commandPaletteMode.value = 'file'
    commandPaletteVisible.value = true
}
