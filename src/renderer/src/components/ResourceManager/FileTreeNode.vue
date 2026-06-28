<template>
    <div id="file-tree-node" class="file-tree-node" :class="{ indented: isIndented }">
        <div
            id="node-content"
            class="node-content"
            @click="handleClick(node)"
            @contextmenu.prevent="onContextMenu($event, node)"
        >
            <!-- 如果是文件夹，显示文件夹图标和名称，并提供一个展开/收起按钮 -->
            <span v-if="node.type === 'folder'">
                <button style="border: none; background-color: transparent" @click="toggleFolder">
                    <svg
                        v-if="collapseSvg"
                        :class="['folder-collapse', collapseSvg.className]"
                        :style="collapseSvg.style"
                        :viewBox="collapseSvg.viewBox"
                    >
                        <path :d="collapseSvg.path" />
                    </svg>
                </button>
                <svg
                    v-if="folderSvg"
                    :class="['folder-icon', folderSvg.className]"
                    :style="folderSvg.style"
                    :viewBox="folderSvg.viewBox"
                >
                    <path :d="folderSvg.path" />
                </svg>
            </span>
            <!-- 如果是文件，只显示文件图标和名称 -->
            <span v-else>
                <svg
                    v-if="fileExtension && fileSvg"
                    :class="['file-icon', fileSvg.className]"
                    :style="fileSvg.style"
                    :viewBox="fileSvg.viewBox"
                >
                    <path :d="fileSvg.path" />
                </svg>
            </span>
            <span id="file-manager-node" class="file-manager-node" :title="node.name">{{ node.name }}</span>
        </div>
        <!-- 如果当前是文件夹并且已经展开，递归显示子节点 -->
        <div v-if="node.type === 'folder' && isExpanded" id="file-subtree" class="file-subtree">
            <FileTreeNode
                v-for="child in node.children"
                :key="child.path"
                v-memo="[child.path, child.fileExtension, child.isExpanded]"
                v-model:is-expanded="child.isExpanded"
                v-model:file-extension="child.fileExtension"
                :node="child"
                :is-indented="true"
                @contextmenu:node="onContextMenu($event, node)"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, PropType } from 'vue'
import { FileSysItem, getFileMgrSvg, handleContextMenu } from './resource-manager'
import EventBus from '../../common/event_bus/event-bus'

const props = defineProps({
    node: {
        type: Object as PropType<FileSysItem>,
        required: true
    },
    isIndented: {
        type: Boolean,
        default: false
    },
    isExpanded: {
        type: Boolean,
        default: false
    },
    fileExtension: {
        type: String,
        default: '.md'
    },
    hasContextMenu: {
        type: Boolean,
        default: false
    }
})

const emit = defineEmits<{
    (e: 'update:isExpanded', value: boolean): void
    (e: 'update:fileExtension', value: string): void
    (e: 'contextmenu:node', event: MouseEvent, node: FileSysItem): void
}>()

const toggleFolder = () => {
    emit('update:isExpanded', !props.isExpanded)
}

const collapseSvg = computed(() => getFileMgrSvg(props.isExpanded, 'collapse'))
const folderSvg = computed(() => getFileMgrSvg(props.isExpanded, 'folder'))
const fileSvg = computed(() => getFileMgrSvg(false, props.fileExtension))

function handleFileSelect(node: FileSysItem) {
    const fileInfo: FileProperties = {
        name: node.name,
        path: node.path,
        type: 'file',
        content: ''
    }
    window.electron.ipcRenderer.send('baize:notes:open-select-file', fileInfo)
    EventBus.$emit('plugin-tools-container-show', false)
}

function handleClick(node: FileSysItem) {
    if (node.type === 'file') {
        if (node.name.endsWith('.md')) {
            handleFileSelect(node)
            EventBus.$emit('monaco-editor-statusbar-file-path', node.path)
        } else if (node.name.endsWith('.html')) {
            EventBus.$emit('html-file-selected', node)
            EventBus.$emit('baize:notes:workspace:show', "html")
        } else if (node.name.endsWith('.pdf')) {
            EventBus.$emit('pdf-file-selected', node)
            EventBus.$emit('baize:notes:workspace:show', "pdf")
        }
    }
}

function onContextMenu(e: MouseEvent, node: FileSysItem) {
    handleContextMenu(e, node)
}
</script>

<style scoped>
.indented {
    margin-left: 1em; /* 设置缩进 */
}

.file-tree-node {
    overflow: hidden;
    line-height: 1.6;
    white-space: nowrap;
}

.node-content {
    overflow: hidden;
    display: flex;
    align-items: center;
}

.file-manager-node {
    font-size: 12pt;
    margin-left: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.file-manager-node:hover {
    background-color: var(--theme-hover-background, #e1e4e8);
}

.file-icon {
    width: 16px;
    height: 16px;
    overflow: hidden;
    margin-left: 30px;
}

.folder-icon {
    width: 16px;
    height: 16px;
    overflow: hidden;
}

.folder-collapse {
    width: 20px;
    height: 20px;
    overflow: hidden;
}

.custom-context-menu {
    display: none;
    border: 1px solid var(--theme-border-color, #eeeeee);
    border-radius: 10px;
    background-color: var(--theme-card-background, #fefefe);
    width: 200px;
    position: absolute; /* 相对于最近的已定位祖先元素（或body）定位 */
    z-index: 1000; /* 确保显示在其他元素之上 */
}
</style>
