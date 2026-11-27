<template>
    <div
        v-show="showFileExplorer"
        id="resource-manager-component"
        class="resource-manager-component"
    >
        <div id="resizer-navi-tab-file-manager" class="resizer-navi-tab-file-manager"></div>
        <div id="file-manager" class="file-manager">
            <div id="file-tree">
                <FileTreeNode
                    v-for="item in fileNodes"
                    :key="item.id"
                    :ref="`node-${item.id}`"
                    v-model:is-expanded="item.isExpanded"
                    v-model:file-extension="item.fileExtension"
                    :is-indented="false"
                    :node="item"
                    :tree-revision="treeRevision"
                />
            </div>
        </div>
    </div>
    <div v-show="showMarkdownToc" id="markdown-toc-component" class="markdown-toc-component">
        <div
            style="
                width: 1px;
                height: 100%;
                background-color: var(--ui-border, var(--theme-border-color));
                color: var(--ui-border, var(--theme-border-color));
                fill: var(--ui-border, var(--theme-border-color));
            "
        ></div>
        <div id="markdown-toc-heading">
            <div
                v-for="item in tocArray"
                :id="item.id"
                :key="item.id"
                @click="scrollToSection(item)"
            >
                <!-- P1 安全修复（N-03）：标题改用文本插值渲染，由 Vue 自动做 HTML 转义，
                     不再使用 v-html。markdown-it 的 text token 已完成实体解码（可含原始
                     `<img onerror>` 等 HTML），一旦进入 v-html 即绕过预览区 DOMPurify。 -->
                <!-- 根据 level 添加适当的缩进（缩进为 U+00A0 空白字符，随文本一起转义） -->
                <span class="markdown-toc-title">{{ getIndentedText(item) }}</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FileTreeNode from './FileTreeNode.vue'
import { ComputeTocSignature, FileSysItem, MergeExpandedState } from './resource-manager'
import EventBus from '../../common/event-bus/event-bus'
import { useEventBus } from '../../composables/useEventBus'
import type { FileTreePayload, MarkdownTOC } from '../../../../shared/types'
import { IPC } from '../../../../shared/ipc-channels'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { logger } from '../../common/logger'

// M5：大纲广播订阅经 useEventBus 注册，卸载时自动清理
const { on: onEventBus } = useEventBus({ componentIdPrefix: 'ResourceManager' })

const showFileExplorer = ref(true)
const showMarkdownToc = ref(false)
const fileNodes = ref<FileSysItem[]>([])
const tocArray = ref<MarkdownTOC[]>([])
// PF-4：整树刷新版本号——每次收到新的 FILE_SYSTEM_DATA 递增，用于失效 FileTreeNode 的 v-memo。
// （主进程每次下发全新对象，若 v-memo 只依赖 path/ext/isExpanded，父节点会跳过更新，
//   导致新增/删除/重命名在深层目录中不可见；版本号变化保证整树刷新能被正确渲染。）
const treeRevision = ref(0)

// PF-8：TOC 指纹去重与「面板隐藏时不更新 DOM」
// - lastTocSignature：当前已写入 v-for 列表的内容指纹，相同则跳过整表替换；
// - pendingToc：面板隐藏期间收到的最新大纲（只保留引用，不做 DOM 更新），显示时一次性应用。
let lastTocSignature: number | null = null
let pendingToc: MarkdownTOC[] | null = null

const props = defineProps({
    // 代码内容
    naviShow: {
        type: String,
        default: 'test'
    }
})

function SwitchResourceManager(value: string) {
    if (value == 'markdown-toc') {
        // 保存当前tree信息
        showMarkdownToc.value = true
        showFileExplorer.value = false
        // PF-8：先应用隐藏期间累积的最新大纲（若内容未变则内部直接跳过），再请求一次刷新
        applyPendingToc()
        EventBus.$emit(EVENT_BUS.MONACO_GET_CHAPTERS, true)
    } else if (value == 'file-explorer') {
        showFileExplorer.value = true
        showMarkdownToc.value = false
        EventBus.$emit(EVENT_BUS.MONACO_SWITCH_EXPLORER, true)
    }
}

// 监听父组件切换
watch(
    () => props.naviShow,
    (value) => {
        SwitchResourceManager(value)
    }
)

/**
 * 生成目录项的纯文本内容（缩进 + 标题原文），由模板文本插值渲染。
 *
 * P1 安全修复（N-03）：
 * 1. 缩进不再用 `&nbsp;` 实体拼接 HTML 字符串，而是改用真实空白字符 U+00A0
 *    （渲染宽度与原来一致），因此整串内容可以作为纯文本交给 Vue；
 * 2. 标题原文（markdown-it text token，实体已解码，可能包含 `<img onerror>` 等
 *    原始 HTML）不在此处拼接 HTML，由 Vue 文本插值自动转义，彻底移除 v-html 注入面。
 */
function getIndentedText(item: MarkdownTOC): string {
    const levelStr = item.level.slice(1)
    if (!levelStr) {
        return item.text
    }
    // 返回带有缩进的文本
    const levelNum = parseInt(levelStr, 10)
    const indent = '\u00A0'.repeat(levelNum * 2)
    return `${indent}${item.text}`
}

function scrollToSection(item: MarkdownTOC) {
    EventBus.$emit(EVENT_BUS.MONACO_LOCATE_TARGET_LINE, item)
}

// 定义事件处理函数
/**
 * PF-8：接收预览层广播的大纲。
 * 1. 面板隐藏（纯编辑/文件树模式）时不更新 DOM，只缓存最新数组，显示时一次性应用；
 * 2. 内容指纹与当前列表相同（正文编辑但标题结构未变）时跳过整表替换与 v-for diff。
 */
const handleChaptersUpdate = (toc: MarkdownTOC[]) => {
    if (!Array.isArray(toc)) {
        return
    }
    if (!showMarkdownToc.value) {
        pendingToc = toc
        return
    }
    applyTocArray(toc)
}

/** 把大纲数组写入 v-for 列表（指纹相同则跳过 DOM 更新） */
function applyTocArray(toc: MarkdownTOC[]) {
    const signature = ComputeTocSignature(toc)
    if (signature === lastTocSignature) {
        return
    }
    lastTocSignature = signature
    pendingToc = null
    tocArray.value = toc
}

/** PF-8：TOC 面板重新可见时，应用隐藏期间累积的大纲 */
function applyPendingToc() {
    if (pendingToc) {
        applyTocArray(pendingToc)
    }
}

const handleFileSystemData = (_event: unknown, fileTree: string) => {
    try {
        // 第 2 批契约重构（文件树传输契约）：主进程下发的整树 JSON 按 shared
        // FileTreePayload（= FileItem[]）解析，再作为 UI 类型 FileSysItem[]（从 FileItem
        // 显式派生、仅多展开态字段）使用——渲染层解析与主进程发送共用同一传输类型。
        const parsedTree: FileSysItem[] = JSON.parse(fileTree) as FileTreePayload
        // PF-4：整树刷新会下发 isExpanded 为空的新节点；先按路径恢复展开态再替换，
        // 避免每次外部目录变更都把用户展开的目录全部折叠
        MergeExpandedState(fileNodes.value, parsedTree)
        fileNodes.value = parsedTree
        // PF-4：递增树版本号，使 FileTreeNode 的 v-memo 在整树替换时失效（深层新增/删除可见）
        treeRevision.value += 1
    } catch (error) {
        logger.error('Error parsing file system data:', error)
    }
}

onMounted(() => {
    onEventBus(EVENT_BUS.MONACO_CHAPTERS, handleChaptersUpdate)
    window.electron.ipcRenderer.on(IPC.FILE_MANAGER.FILE_SYSTEM_DATA, handleFileSystemData)
})

onBeforeUnmount(() => {
    // EventBus 监听已由 useEventBus 自动清理
    window.electron.ipcRenderer.removeListener(
        IPC.FILE_MANAGER.FILE_SYSTEM_DATA,
        handleFileSystemData
    )
})
</script>

<style scoped>
/* ============================================================================
 * 资源管理器 / 大纲（侧栏，外壳区）四风格材质 —— 视觉升级 1.5.5 主窗口可见性修复
 *
 * 消费 #editor-container 从 P0 冻结令牌派生的 --bz-shell-*（组件内不写风格分支）：
 * - 表面：glass 半透明（--ui-surface-opacity 0.86）/ paper 纸感底（--ui-bg-elevated +
 *   主题色低饱和薄雾）/ workbench 与 hybrid 壳层保持既有 --theme-card-background（零变化）；
 * - 圆角由 --ui-radius-lg 派生（workbench 0 = 现状）、描边 1px hairline、glass 顶部高光边、
 *   纸感/玻璃弱阴影（--ui-shadow-1）；workbench 下全部为 0 / 不可见。
 * ========================================================================== */
.resource-manager-component {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
    /* 供侧栏材质描边/阴影层（::after）定位 */
    position: relative;
}

/* 侧栏材质收口层：描边 + glass 高光边 + 弱阴影；workbench / hybrid 壳层 opacity 0 不绘制 */
.resource-manager-component::after {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0;
    opacity: var(--bz-style-on, 0);
    border-radius: var(--bz-shell-radius, 0);
    box-shadow:
        inset 0 0 0 var(--bz-shell-hairline, 0) var(--ui-border, var(--theme-border-color)),
        inset 0 1px 0 rgba(255, 255, 255, var(--ui-highlight-border-alpha, 0)),
        var(--ui-shadow-1);
}

.resizer-navi-tab-file-manager {
    width: 1px;
    height: 100%;
    background-color: var(--ui-border, var(--theme-border-color));
    color: var(--ui-border, var(--theme-border-color));
    fill: var(--ui-border, var(--theme-border-color));
}

.file-manager {
    /* 表面：workbench 下 --bz-shell-surface 即 --theme-card-background（零变化）；
       paper 为纸感卡片底、glass 为半透明面（透出窗口底色/渐层）。 */
    background-color: var(--theme-card-background, ghostwhite);
    background-color: var(--bz-shell-surface, var(--theme-card-background, ghostwhite));
    background-image: linear-gradient(
        var(--bz-shell-veil, transparent),
        var(--bz-shell-veil, transparent)
    );
    color: var(--ui-text, var(--theme-text-color, black));
    border-radius: var(--bz-shell-radius, 0);
    overflow: auto;
    height: 100%;
    width: calc(100% - 1px);
}

#file-tree {
    width: 100%;
    padding: 8px 0;
}

.markdown-toc-component {
    display: flex;
    flex-direction: row;
    /* 大纲面板与文件树同属侧栏外壳：共用同一套 --bz-shell-* 材质 */
    background-color: var(--theme-card-background, ghostwhite);
    background-color: var(--bz-shell-surface, var(--theme-card-background, ghostwhite));
    background-image: linear-gradient(
        var(--bz-shell-veil, transparent),
        var(--bz-shell-veil, transparent)
    );
    color: var(--ui-text, var(--theme-text-color, black));
    border-radius: var(--bz-shell-radius, 0);
    width: 100%;
    height: 100%;
}

#markdown-toc-heading {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    height: 100%;
}

.markdown-toc-title {
    color: var(--theme-accent-color, red);
    display: block;
    width: 100%;
    padding: 4px 8px;
    font-family: 'STXinwei', serif;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
}

.markdown-toc-title:hover {
    background-color: var(--theme-hover-background);
}
</style>
