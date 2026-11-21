<template>
    <!-- A2 工作区搜索/替换对话框（Ctrl+Shift+F 打开） -->
    <WorkspaceSearchDialog :visible="searchVisible" @close="searchVisible = false" />
    <!-- A9 命令面板 / 文件 Quick Open（Ctrl+Shift+P / Ctrl+P 打开） -->
    <CommandPalette
        :visible="paletteVisible"
        :initial-mode="paletteMode"
        @close="paletteVisible = false"
        @open-workspace-search="openWorkspaceSearch"
    />
</template>

<script setup lang="ts">
/**
 * A2/A9 搜索与命令面板宿主（2026-11-21，默认开启）
 *
 * 职责：
 * - 挂载在 BaiZeNotes.vue 根组件（主界面）内，统一持有两个浮层的显隐状态；
 * - 注册/卸载全局快捷键监听（Ctrl+Shift+F 工作区搜索、Ctrl+Shift+P 命令面板、
 *   Ctrl+P 文件 Quick Open）——组件卸载时清理，不泄漏监听；
 * - 工作区搜索与命令面板互斥展示（打开一个会收起另一个）。
 *
 * 说明：显隐状态在 search-overlay-state.ts 模块单例中，菜单/命令面板与宿主共用；
 * 两个浮层组件各自内部再创建独立的搜索控制器/命令注册表，本宿主只做编排，
 * 不复制任何搜索/命令实现。
 */
import { onBeforeUnmount, onMounted } from 'vue'
import WorkspaceSearchDialog from './WorkspaceSearchDialog.vue'
import CommandPalette from './CommandPalette.vue'
import {
    commandPaletteMode as paletteMode,
    commandPaletteVisible as paletteVisible,
    openCommandPalette,
    openQuickOpen,
    openWorkspaceSearch,
    workspaceSearchVisible as searchVisible
} from './search-overlay-state'
import { registerSearchShortcuts, type SearchShortcutEventTarget } from './search-shortcuts'

/** 快捷键清理函数（onBeforeUnmount 调用） */
let unregisterShortcuts: (() => void) | null = null

onMounted(() => {
    if (typeof window === 'undefined') {
        return
    }
    // 模块级显隐状态可能被上一个宿主实例/测试用例遗留；挂载时归零，保证主界面
    // 重新进入后不会凭空显示浮层。
    searchVisible.value = false
    paletteVisible.value = false
    paletteMode.value = 'command'
    // Window 的 addEventListener 为按事件类型重载的方法签名，与最小结构接口在严格
    // 函数参数逆变下不直接兼容；这里收窄为只关心 keydown 的最小接口（运行期一致）。
    unregisterShortcuts = registerSearchShortcuts(window as unknown as SearchShortcutEventTarget, {
        openWorkspaceSearch,
        openCommandPalette,
        openQuickOpen
    })
})

onBeforeUnmount(() => {
    unregisterShortcuts?.()
    unregisterShortcuts = null
    // 主界面卸载时收起浮层，避免模块状态残留到下一次挂载
    searchVisible.value = false
    paletteVisible.value = false
})

// 供模板的 @close 赋值使用（ref 从模块导入后模板可直接写 .value 语义）
</script>
