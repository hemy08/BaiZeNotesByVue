<template>
    <div
        v-show="isShowEditArea"
        id="md-edit-component"
        class="md-edit-component"
        :style="{ width: monacoEditorWidth }"
    >
        <MdMonacoEdit
            v-model="markdownEditorCode"
            :code="initialCodeContent"
            :editor-area-width="monacoEditorWidthPx"
            @update:code="handleMarkdownCodeUpdate"
        />
    </div>
    <div
        v-show="isShowResizer"
        id="resizer-md"
        class="resizer-md"
        :style="{ left: resizerPosition }"
        @mousedown="startResizing"
    ></div>
    <div
        v-show="isShowPreviewArea"
        id="md-preview"
        class="md-preview"
        :style="{ width: editPreviewAreaWidth, left: editPreviewAreaLeft }"
    >
        <MdPreview :editor-content="markdownEditorContent" :active="isShowPreviewArea" />
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import MdMonacoEdit from './MarkdownMonacoEditor.vue'
import MdPreview from './MarkdownPreviewComponent.vue'
import EventBus from '../../common/event-bus/event-bus'
import { IPC } from '../../../../shared/ipc-channels'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { logger } from '../../common/logger'

const props = defineProps({
    editorPreviewWidth: {
        type: String,
        default: '100%'
    }
})

const windowWidth = ref(props.editorPreviewWidth)
const isShowEditArea = ref(true)
const isShowPreviewArea = ref(true)
const isShowResizer = ref(true)
const resizerWidth = ref(4)
const resizerPosition = ref('50%')
const initialCodeContent = ref('')
const markdownEditorCode = ref('')
const markdownEditorContent = ref('')

const windowWidthValue = computed(() => {
    return parseFloat(windowWidth.value)
})

const monacoEditorWidthPx = computed(() => {
    return resizerPosition.value
})

const monacoEditorWidth = computed(() => {
    return resizerPosition.value
})

const editPreviewAreaWidth = computed(() => {
    const editAreaWidth = parseFloat(resizerPosition.value) / 100
    const previewAreaWidth = 1 - editAreaWidth - resizerWidth.value / windowWidthValue.value
    return pxToPercent(previewAreaWidth * windowWidthValue.value, windowWidthValue.value)
})

const editPreviewAreaLeft = computed(() => {
    const editAreaWidth = parseFloat(resizerPosition.value) / 100
    const resizerOffset = resizerWidth.value / windowWidthValue.value
    return pxToPercent(
        (editAreaWidth + resizerOffset) * windowWidthValue.value,
        windowWidthValue.value
    )
})

function pxToPercent(px: number, totalPx: number): string {
    return `${(px / totalPx) * 100}%`
}

let isResizing = false
let startX = 0
let startWidth = 0

function startResizing(event: MouseEvent) {
    isResizing = true
    startX = event.clientX
    startWidth = parseFloat(resizerPosition.value)
    document.addEventListener('mousemove', handleResizing)
    document.addEventListener('mouseup', stopResizing)
}

function handleResizing(event: MouseEvent) {
    if (!isResizing) return
    const deltaX = event.clientX - startX
    const deltaPercent = (deltaX / windowWidthValue.value) * 100
    let newWidth = startWidth + deltaPercent
    const minWidth = 10
    const maxWidth = 90
    if (newWidth < minWidth) newWidth = minWidth
    if (newWidth > maxWidth) newWidth = maxWidth
    resizerPosition.value = `${newWidth}%`
}

function stopResizing() {
    isResizing = false
    document.removeEventListener('mousemove', handleResizing)
    document.removeEventListener('mouseup', stopResizing)
}

// P-1（PF-01）：击键同步防抖 + 脏标记
// 击键时仅本地更新内容，500ms 空闲后才把整篇内容经 IPC 发送主进程（通道名保持不变）
const CONTENT_SYNC_DEBOUNCE_MS = 500
let contentSyncTimer: ReturnType<typeof setTimeout> | null = null
// 最后一次已同步到主进程的内容（脏标记基准：当前内容与之不同即为"脏"）
let lastSyncedContent = ''

function clearContentSyncTimer() {
    if (contentSyncTimer !== null) {
        clearTimeout(contentSyncTimer)
        contentSyncTimer = null
    }
}

function handleMarkdownCodeUpdate(newValue: string) {
    // 预览区与保存所需内容立即本地更新（不等待 IPC）
    markdownEditorContent.value = newValue

    // 新内容与上次已同步内容一致（如加载文件触发的 setValue 回传）时不重复发送
    if (newValue === lastSyncedContent) {
        clearContentSyncTimer()
        return
    }

    // 空闲防抖：500ms 无新击键才同步到主进程
    clearContentSyncTimer()
    contentSyncTimer = setTimeout(() => {
        contentSyncTimer = null
        syncContentToMain()
    }, CONTENT_SYNC_DEBOUNCE_MS)
}

/**
 * P1/PF-3：把当前全文同步到主进程。
 * 内容与上次已同步内容一致时**跳过 IPC**（避免重复发送整篇全文）。
 * @returns 是否真正发送了 IPC
 */
function syncContentToMain(): boolean {
    const content = markdownEditorContent.value
    if (content === lastSyncedContent) {
        return false
    }
    window.electron.ipcRenderer.send(IPC.FILE.UPDATE_SELECT_FILE_CONTENT, content)
    lastSyncedContent = content
    return true
}

// 立即同步当前内容（保存动作前 / 主进程 flush 请求时调用）
function flushContentSync() {
    clearContentSyncTimer()
    // 直接发送当前内容；IPC 消息有序，主进程收到 'baize:editor:flush-content-done' 前必先收到本条内容
    syncContentToMain()
}

/**
 * P1/PF-3：保存当前内容到磁盘（菜单保存 / Ctrl+S 共用入口）。
 *
 * IPC 合并：主进程 FILE.SAVE_TO_DISK handler 会先把载荷写入 currentActiveFile.content、
 * 再落盘（src/main/utils/utils.ts:346-355），因此**无需**先发 UPDATE_SELECT_FILE_CONTENT。
 * 修复前每次保存都会连发「UPDATE 全文 + SAVE 全文」两份全文 IPC（1 MiB 文档约 2 MiB），
 * 现在固定 1 份；内容未同步过时也由本载荷一并覆盖，不存在丢失最新内容的窗口。
 */
function saveContentToDisk() {
    clearContentSyncTimer()
    const content = markdownEditorContent.value
    window.electron.ipcRenderer.send(IPC.FILE.SAVE_TO_DISK, content)
    // 主进程 SAVE handler 已把载荷写入当前活动文件内容，同步推进脏标记基准
    lastSyncedContent = content
}

// 渲染层 flush 契约（与数据安全代理约定，通道名不可改）：
// 主进程发送 'baize:editor:flush-content' → 取消防抖、立即发送当前内容 → 回复 'baize:editor:flush-content-done'
const handleFlushContent = () => {
    try {
        // IPC 消息有序：主进程在收到 'baize:editor:flush-content-done' 前必先收到本条内容
        flushContentSync()
        window.electron.ipcRenderer.send(IPC.EDITOR.FLUSH_CONTENT_DONE)
    } catch {
        // 窗口销毁时 IPC 不可用，忽略
    }
}

function onHandleNewContent(content: string) {
    // FE-13：空文件必须保持空内容。
    // 原实现在 content 为空时走 handleMarkdownCodeUpdate('\r\n')：编辑器被注入一行空行，
    // 500ms 后同步回主进程 → appState 内容与保存快照不一致 → isDirty() 为 true，
    // 自动保存/关闭时把空文件写成 2 字节的 '\r\n'。现在空内容与普通内容同样处理：
    // 记为已同步基准、清空编辑器、不触发任何 IPC。
    clearContentSyncTimer()
    lastSyncedContent = content
    markdownEditorContent.value = content
    // 编辑区域显示时，传入（空字符串同样下发，让 Monaco 清空为真正的空文档）
    if (isShowEditArea.value) {
        initialCodeContent.value = content
    }
    // 文件加载后通知编辑器重新布局
    setTimeout(() => {
        EventBus.$emit(EVENT_BUS.MONACO_RELAYOUT)
    }, 150)
}

function onHandleEditorShow(edit: boolean, preview: boolean) {
    isShowEditArea.value = edit
    isShowPreviewArea.value = preview
    if (edit && preview) {
        isShowResizer.value = true
        resizerPosition.value = '50%'
    } else {
        isShowResizer.value = false
        if (edit) {
            resizerPosition.value = '100%'
        } else {
            resizerPosition.value = '0%'
        }
    }

    // 视图切换后，通知Monaco编辑器重新布局
    setTimeout(() => {
        EventBus.$emit(EVENT_BUS.MONACO_RELAYOUT)
    }, 100)
}

const handleShowFileContext = (_event: unknown, content: string) => {
    EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'md')
    onHandleNewContent(content)
}

const handleFileReloaded = (_event: unknown, data: { path: string; content: string }) => {
    onHandleNewContent(data.content)
}

const handleClearEditor = () => {
    if (isShowEditArea.value) {
        initialCodeContent.value = '# '
    }
    handleMarkdownCodeUpdate('# ')
}

const handleEditModel = () => {
    onHandleEditorShow(true, false)
}

const handlePreviewModel = () => {
    onHandleEditorShow(false, true)
}

const handleEditPreviewModel = () => {
    onHandleEditorShow(true, true)
}

watch(
    () => props.editorPreviewWidth,
    (newWidth) => {
        windowWidth.value = newWidth
    }
)

// 定义事件处理函数
const handleSaveFileContent = () => {
    saveContentToDisk()
}

// FUN-07：写作模板改为光标处插入（经 EventBus 转发给 Monaco 的 InsertAfterCursor → executeEdits），
// 绝不覆盖全文
const handleUseTemplate = (value: string) => {
    if (value) {
        EventBus.$emit(EVENT_BUS.MONACO_INSERT_TEXT, value)
    }
}

const handleFileImportReplace = (value: string) => {
    if (isShowEditArea.value) {
        initialCodeContent.value = value
    }
    handleMarkdownCodeUpdate(value)
}

function handleKeyDownEvent(event: KeyboardEvent) {
    if (event.ctrlKey && event.key === 's') {
        saveContentToDisk()
    }
}

// 监听窗口大小变化
const handleResize = () => {
    const parentElement = document.getElementById('md-edit-component')?.parentElement
    if (parentElement) {
        windowWidth.value = parentElement.clientWidth.toString()
    }
}

// FUN-02：编码菜单"以指定编码打开"——收到主进程菜单事件后，
// invoke 主进程 handler 按指定编码重新读取当前文件并刷新编辑器
const handleOpenWithEncoding = async (_event: unknown, encoding: string) => {
    try {
        await window.electron.ipcRenderer.invoke(IPC.OVERLAY.REOPEN_WITH_ENCODING, encoding)
    } catch (error) {
        logger.error('按指定编码重新打开失败:', error)
    }
}

// FUN-02：编码菜单"转换编码"——按指定编码转码当前内容并写盘
const handleConvertToEncoding = async (_event: unknown, encoding: string) => {
    try {
        await window.electron.ipcRenderer.invoke(IPC.OVERLAY.CONVERT_SAVE_ENCODING, encoding)
    } catch (error) {
        logger.error('转换编码保存失败:', error)
    }
}

onMounted(() => {
    // 初始化容器宽度
    const parentElement = document.getElementById('md-edit-component')?.parentElement
    if (parentElement) {
        windowWidth.value = parentElement.clientWidth.toString()
    }

    EventBus.$on(EVENT_BUS.MONACO_SAVE_FILE_CONTENT_TO_DISK, handleSaveFileContent)
    EventBus.$on(EVENT_BUS.MONACO_USE_TEMPLATE, handleUseTemplate)
    EventBus.$on(EVENT_BUS.MONACO_REPLACE_TEXT, handleFileImportReplace)

    window.electron.ipcRenderer.on(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT, handleShowFileContext)
    window.electron.ipcRenderer.on(IPC.EVENTS.FILE_CONTENT_RELOADED, handleFileReloaded)
    // P2 死通道清理：MONACO_INSERT.WRITING_TEMPLATES 主进程零发送方（写作模板由
    // 渲染层 menu_actions.ts 直接 emit EventBus MONACO_USE_TEMPLATE），监听已删除。
    window.electron.ipcRenderer.on(IPC.FILE.CLEAR_EDITOR_PREVIEW, handleClearEditor)
    window.electron.ipcRenderer.on(IPC.VIEW.EDIT_MODE, handleEditModel)
    window.electron.ipcRenderer.on(IPC.VIEW.PREVIEW_MODE, handlePreviewModel)
    window.electron.ipcRenderer.on(IPC.VIEW.EDIT_PREVIEW_MODE, handleEditPreviewModel)
    // P-1（PF-01）：渲染层 flush 契约——监听主进程的立即同步请求
    window.electron.ipcRenderer.on(IPC.EDITOR.FLUSH_CONTENT, handleFlushContent)
    // FUN-02：编码菜单事件监听（主进程菜单 → 渲染层 → 主进程 handler）
    window.electron.ipcRenderer.on(IPC.OVERLAY.OPEN_WITH_ENCODING, handleOpenWithEncoding)
    window.electron.ipcRenderer.on(IPC.OVERLAY.CONVERT_TO_ENCODING, handleConvertToEncoding)

    window.addEventListener('resize', handleResize)
    window.addEventListener('keydown', handleKeyDownEvent)
})

// 销毁编辑器实例
onBeforeUnmount(() => {
    // P-1（PF-01）：卸载前尝试同步未发送内容（应用关闭时主进程可能已销毁窗口，忽略异常）
    try {
        flushContentSync()
    } catch {
        // 窗口销毁后 IPC 不可用，忽略
    }
    clearContentSyncTimer()

    window.removeEventListener('keydown', handleKeyDownEvent)
    window.removeEventListener('resize', handleResize)
    EventBus.$off(EVENT_BUS.MONACO_SAVE_FILE_CONTENT_TO_DISK, handleSaveFileContent)
    EventBus.$off(EVENT_BUS.MONACO_USE_TEMPLATE, handleUseTemplate)
    EventBus.$off(EVENT_BUS.MONACO_REPLACE_TEXT, handleFileImportReplace)

    window.electron.ipcRenderer.removeListener(
        IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT,
        handleShowFileContext
    )
    window.electron.ipcRenderer.removeListener(IPC.EVENTS.FILE_CONTENT_RELOADED, handleFileReloaded)
    window.electron.ipcRenderer.removeListener(IPC.FILE.CLEAR_EDITOR_PREVIEW, handleClearEditor)
    window.electron.ipcRenderer.removeListener(IPC.VIEW.EDIT_MODE, handleEditModel)
    window.electron.ipcRenderer.removeListener(IPC.VIEW.PREVIEW_MODE, handlePreviewModel)
    window.electron.ipcRenderer.removeListener(IPC.VIEW.EDIT_PREVIEW_MODE, handleEditPreviewModel)
    window.electron.ipcRenderer.removeListener(IPC.EDITOR.FLUSH_CONTENT, handleFlushContent)
    // FUN-02：卸载时移除编码菜单监听
    window.electron.ipcRenderer.removeListener(
        IPC.OVERLAY.OPEN_WITH_ENCODING,
        handleOpenWithEncoding
    )
    window.electron.ipcRenderer.removeListener(
        IPC.OVERLAY.CONVERT_TO_ENCODING,
        handleConvertToEncoding
    )
})
</script>

<style scoped>
#md-edit-component {
    margin: 0;
    padding: 0;
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    overflow: hidden;
}

#resizer-md {
    cursor: ew-resize;
    position: absolute;
    top: 0;
    height: 100%;
    background-color: var(--theme-border-color, #00b0ff);
    width: 4px;
    z-index: 10;
}

.md-preview {
    background-color: var(--theme-card-background);
    color: var(--theme-text-color);
    position: absolute;
    top: 0;
    overflow: visible;
    height: 100%;
}
</style>
