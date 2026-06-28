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
                />
            </div>
        </div>
    </div>
    <div v-show="showMarkdownToc" id="markdown-toc-component" class="markdown-toc-component">
        <div
            style="
                width: 1px;
                height: 100%;
                background-color: var(--theme-border-color, #00b0ff);
                color: var(--theme-border-color, #00b0ff);
                fill: var(--theme-border-color, #00b0ff);
            "
        ></div>
        <div id="markdown-toc-heading">
            <div
                v-for="item in tocArray"
                :id="item.id"
                :key="item.id"
                @click="scrollToSection(item)"
            >
                <!-- 根据 level 添加适当的缩进 -->
                <span class="markdown-toc-title" v-html="getIndentedText(item)"></span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import FileTreeNode from './FileTreeNode.vue'
import { FileSysItem } from './resource-manager'
import EventBus from '../../common/event_bus/event-bus'
import { MarkdownTOC } from '../../../../main/global-types'

const showFileExplorer = ref(true)
const showMarkdownToc = ref(false)
const fileNodes = ref<FileSysItem[]>([])
const tocArray = ref<MarkdownTOC[]>([])

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
        EventBus.$emit('baize:notes:monaco-editor:get-chapters', true)
    } else if (value == 'file-explorer') {
        showFileExplorer.value = true
        showMarkdownToc.value = false
        EventBus.$emit('baize:notes:monaco-editor:switch:explorer', true)
    }
}

// 监听父组件切换
watch(
    () => props.naviShow,
    (value) => {
        SwitchResourceManager(value)
    }
)

function getIndentedText(item: MarkdownTOC): string {
    const levelStr = item.level.slice(1)
    if (!levelStr) {
        return item.text
    }
    // 返回带有缩进的文本
    const levelNum = parseInt(levelStr, 10)
    const indent = '&nbsp;'.repeat(levelNum * 2)
    return `${indent}${item.text}`
}

function scrollToSection(item: MarkdownTOC) {
    EventBus.$emit('monaco-editor-locate-target-line', item)
}

// 定义事件处理函数
const handleChaptersUpdate = (toc: MarkdownTOC[]) => {
    tocArray.value = toc
}

const handleFileSystemData = (_: any, fileTree: string) => {
    try {
        fileNodes.value = JSON.parse(fileTree) as FileSysItem[]
    } catch (error) {
        console.error('Error parsing file system data:', error)
    }
}

onMounted(() => {
    EventBus.$on('monaco-editor-chapters', handleChaptersUpdate)
    window.electron.ipcRenderer.on('baize:notes:resource:manager:file-system-data', handleFileSystemData)
})

onBeforeUnmount(() => {
    EventBus.$off('monaco-editor-chapters', handleChaptersUpdate)
    window.electron.ipcRenderer.removeListener('baize:notes:resource:manager:file-system-data', handleFileSystemData)
})
</script>

<style scoped>
.resource-manager-component {
    display: flex;
    flex-direction: row;
    width: 100%;
    height: 100%;
}

.resizer-navi-tab-file-manager {
    width: 1px;
    height: 100%;
    background-color: var(--theme-border-color, #00b0ff);
    color: var(--theme-border-color, #00b0ff);
    fill: var(--theme-border-color, #00b0ff);
}

.file-manager {
    background: var(--theme-card-background, ghostwhite);
    color: var(--theme-text-color, black);
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
    background: var(--theme-card-background, ghostwhite);
    color: var(--theme-text-color, black);
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
    background-color: var(--theme-hover-background, #9dddff);
}
</style>
