<template>
    <!-- A2 工作区搜索/替换对话框（Ctrl+Shift+F 打开） -->
    <WorkspaceSearchDialog :visible="searchVisible" @close="searchVisible = false" />
    <!-- A9 命令面板 / 文件 Quick Open（Ctrl+Shift+P / Ctrl+P 打开） -->
    <CommandPalette
        :visible="paletteVisible"
        :initial-mode="paletteMode"
        @close="paletteVisible = false"
        @open-workspace-search="openWorkspaceSearch"
        @open-llm-ingest="llmIngestVisible = true"
        @open-graph="openGraphDialogState"
        @open-raw-embed="openEmbedDialogState"
    />
    <!--
        1.5.7 LLM Wiki L3：AI 编译 diff 审批对话框（命令面板「AI 编译（raw → wiki）」触发）。
        对话框自身负责 AI.INGEST（生成草案，不写盘）与 AI.APPLY_INGEST（审批后写 wiki/）。
    -->
    <LlmIngestDiff :visible="llmIngestVisible" @close="llmIngestVisible = false" />
    <!--
        1.5.7 LLM Wiki L4：关系图谱对话框（命令面板 + 「视图 → 关系图谱」菜单触发）。
        数据来自既有工作区索引（FILE.GET_WORKSPACE_INDEX），SVG 只读渲染。
    -->
    <GraphDialog :visible="graphDialogState.visible" @close="closeGraphDialogState" />
    <!--
        1.5.7 LLM Wiki L4：嵌入 raw/ 资料对话框（命令面板「嵌入 raw 资料」触发）。
        文件清单来自既有目录树 IPC 事件，预览走 READ_HTML，插入复用 A8 插入链路。
    -->
    <EmbedDialog :visible="embedDialogState.visible" @close="closeEmbedDialogState" />
</template>

<script setup lang="ts">
/**
 * A2/A9 搜索与命令面板宿主（2026-11-21，默认开启）
 *
 * 职责：
 * - 挂载在 BaiZeNotes.vue 根组件（主界面）内，统一持有两个浮层的显隐状态；
 * - 1.5.7 LLM Wiki L3：同时挂载 AI 编译 diff 审批对话框（命令面板入口触发）；
 * - 1.5.7 LLM Wiki L4：同时挂载关系图谱（命令面板 / 视图菜单触发）与嵌入 raw/ 资料
 *   （命令面板触发）两个对话框；显隐真源在各自 `*-dialog-state.ts` 模块单例，
 *   菜单动作（menu-actions.ts）与命令面板（emit）都只操作该单例，宿主只做挂载；
 * - 注册/卸载全局快捷键监听（Ctrl+Shift+F 工作区搜索、Ctrl+Shift+P 命令面板、
 *   Ctrl+P 文件 Quick Open）——组件卸载时清理，不泄漏监听；
 * - 工作区搜索与命令面板互斥展示（打开一个会收起另一个）。
 *
 * 说明：显隐状态在 search-overlay-state.ts 模块单例中，菜单/命令面板与宿主共用；
 * 两个浮层组件各自内部再创建独立的搜索控制器/命令注册表，本宿主只做编排，
 * 不复制任何搜索/命令实现。
 */
import { onBeforeUnmount, onMounted, ref } from 'vue'
import WorkspaceSearchDialog from './WorkspaceSearchDialog.vue'
import CommandPalette from './CommandPalette.vue'
// 1.5.7 LLM Wiki L3：AI 编译 diff 审批对话框（组件自持 AI.INGEST/AI.APPLY_INGEST 调用）
import LlmIngestDiff from '../Markdown/llm-ingest-diff.vue'
// 1.5.7 LLM Wiki L4：关系图谱 / 嵌入 raw 资料对话框（显隐状态为模块单例，菜单与命令面板共用）
import GraphDialog from '../Graph/GraphDialog.vue'
import EmbedDialog from '../Markdown/embed/EmbedDialog.vue'
import {
    closeGraphDialogState,
    graphDialogState,
    openGraphDialogState
} from '../Graph/graph-dialog-state'
import {
    closeEmbedDialogState,
    embedDialogState,
    openEmbedDialogState
} from '../Markdown/embed/embed-dialog-state'
import {
    commandPaletteMode as paletteMode,
    commandPaletteVisible as paletteVisible,
    openCommandPalette,
    openQuickOpen,
    openWorkspaceSearch,
    workspaceSearchVisible as searchVisible
} from './search-overlay-state'
import { registerSearchShortcuts, type SearchShortcutEventTarget } from './search-shortcuts'

/** AI 编译 diff 审批对话框显隐（仅主界面宿主持有；关闭即丢弃草案，不写盘） */
const llmIngestVisible = ref(false)

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
    llmIngestVisible.value = false
    closeGraphDialogState()
    closeEmbedDialogState()
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
    llmIngestVisible.value = false
    closeGraphDialogState()
    closeEmbedDialogState()
})
</script>
