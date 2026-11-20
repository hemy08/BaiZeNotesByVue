<template>
    <div
        v-show="isShowEditArea"
        id="md-edit-component"
        class="md-edit-component"
        :style="{ width: monacoEditorWidth }"
    >
        <!-- 结构优化第 2 批 2.2（H4）：Monaco 编辑器改为二级懒加载（独立 chunk），
             加载期间显示轻量骨架，主界面壳与工具栏先完成首帧渲染。 -->
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
        <!-- 结构优化第 2 批 2.2（H4）：预览管线（markdown-it/highlight.js/KaTeX 等）独立
             按需 chunk；活动文件路径由本组件经 IPC 监听后透传，兼容「预览挂载晚于打开文件」
             的启动恢复时序。 -->
        <MdPreview
            :editor-content="markdownEditorContent"
            :active="isShowPreviewArea"
            :active-file-path="activeFilePath"
        />
    </div>
</template>

<script setup lang="ts">
import {
    ref,
    computed,
    onMounted,
    onBeforeUnmount,
    watch,
    defineAsyncComponent,
    defineComponent,
    h
} from 'vue'
import type { PropType } from 'vue'
import { t } from '../../common/i18n'
import EventBus from '../../common/event-bus/event-bus'
import { useEventBus } from '../../composables/useEventBus'
import { IPC } from '../../../../shared/ipc-channels'
import { EVENT_BUS } from '../../common/event-bus/event-bus-events'
import { logger } from '../../common/logger'
// P2 功能错误处理修复：用户主动操作失败统一反馈（编码转换/按编码重开）
import { describeActionError, reportActionFailure } from '../../common/action-feedback'

// M5：保存/模板/导入替换 3 个进程内事件订阅统一经 useEventBus 注册，卸载时自动清理
const { on: onEventBus } = useEventBus({ componentIdPrefix: 'MarkdownEditComponent' })

const props = defineProps({
    editorPreviewWidth: {
        type: String,
        default: '100%'
    }
})

// =============================================================================================
// 结构优化第 2 批 2.2（H4）：编辑器/预览二级懒加载
//
// 改造前：本组件静态 import MarkdownMonacoEditor.vue（Monaco ≈7.3 MB）与
// MarkdownPreviewComponent.vue（highlight.js ≈1.29 MB + KaTeX ≈0.51 MB + markdown-it 预览管线），
// 二者随主界面壳同步求值，主界面首帧必须等约 9 MB 依赖解析/执行完。
//
// 改造后：本组件（编辑器编排层）保持同步加载——它负责注册启动恢复/保存 flush 等关键 IPC
// 监听器，必须与主界面壳同批挂载；两个重型子组件改为 defineAsyncComponent 独立分块，
// 在编辑器区域渲染时按需加载，加载期间显示骨架占位，失败时给出提示与重试。
// =============================================================================================

/**
 * Monaco 编辑器 chunk 动态导入（打包器据此生成独立异步 chunk）。
 * 显式解包 default：defineAsyncComponent 的模块解包依赖 `__esModule` / `Symbol.toStringTag`
 * 标记，显式解包可避免不同打包/测试模块形态下的互操作差异（与 App.vue 主界面分块同口径）。
 */
const loadMdMonacoEditor = () => import('./MarkdownMonacoEditor.vue').then((mod) => mod.default)
/** 预览管线 chunk 动态导入（含 markdown-it/highlight.js/KaTeX 等），同样显式解包 default */
const loadMdPreview = () => import('./MarkdownPreviewComponent.vue').then((mod) => mod.default)

/** 编辑器加载中的骨架（纯渲染函数实现，不引入任何依赖） */
// eslint-disable-next-line vue/one-component-per-file -- 纯骨架占位组件，不值得拆独立 SFC/文件
const MonacoEditorSkeleton = defineComponent({
    name: 'MonacoEditorSkeleton',
    setup() {
        return () =>
            h('div', {
                class: 'md-pane-skeleton md-monaco-skeleton',
                role: 'status',
                'aria-label': 'loading'
            })
    }
})

/** 预览加载中的骨架（同上） */
// eslint-disable-next-line vue/one-component-per-file -- 纯骨架占位组件，不值得拆独立 SFC/文件
const PreviewSkeleton = defineComponent({
    name: 'PreviewSkeleton',
    setup() {
        return () =>
            h('div', {
                class: 'md-pane-skeleton md-preview-skeleton',
                role: 'status',
                'aria-label': 'loading'
            })
    }
})

/**
 * 加载失败兜底（defineAsyncComponent 会传入 error / retry 两个 props）。
 * 文案复用既有 i18n 词条，避免为本批次新增词典键；重试只重新加载对应分块。
 */
// eslint-disable-next-line vue/one-component-per-file -- 纯错误占位组件，不值得拆独立 SFC/文件
const MarkdownPaneError = defineComponent({
    name: 'MarkdownPaneError',
    props: {
        error: {
            type: Object as PropType<Error>,
            required: true
        },
        retry: {
            type: Function as PropType<() => void>,
            // Vue 3 的 defineAsyncComponent 目前只向 errorComponent 传 `error`，不会传 `retry`
            //（retry 仅出现在 onError 回调签名里）。原实现把 retry 声明为 required，点击错误占位
            // 上的「重试」按钮会抛 `TypeError: errorProps.retry is not a function`；这里给默认空
            // 实现，保证错误界面的重试按钮永不再崩溃（无 retry 时点击为无操作）。
            required: false,
            default: () => undefined
        }
    },
    setup(errorProps) {
        return () =>
            h('div', { class: 'md-pane-error', role: 'alert' }, [
                h('p', { class: 'md-pane-error-title' }, t('common.error')),
                h(
                    'p',
                    { class: 'md-pane-error-detail' },
                    errorProps.error instanceof Error
                        ? errorProps.error.message
                        : String(errorProps.error ?? '')
                ),
                h(
                    'button',
                    {
                        type: 'button',
                        class: 'md-pane-error-retry',
                        onClick: () => errorProps.retry?.()
                    },
                    t('dialogRenderer.common.retry')
                )
            ])
    }
})

const MdMonacoEdit = defineAsyncComponent({
    loader: loadMdMonacoEditor,
    loadingComponent: MonacoEditorSkeleton,
    errorComponent: MarkdownPaneError,
    // 本地磁盘分块通常一帧内就绪；立即显示骨架避免空白
    delay: 0,
    timeout: 60000,
    // 不依赖 Suspense 边界，与主界面/对话框懒加载语义一致
    suspensible: false
})

const MdPreview = defineAsyncComponent({
    loader: loadMdPreview,
    loadingComponent: PreviewSkeleton,
    errorComponent: MarkdownPaneError,
    delay: 0,
    timeout: 60000,
    suspensible: false
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
// 结构优化第 2 批 2.2（H4）：当前活动文件路径（预览相对图片/snippets 解析依赖）。
// 本组件同步挂载、监听 IPC.FILE.USER_SELECT_FILE，再把路径作为 prop 传给按需加载的预览，
// 覆盖「启动恢复先下发文件路径、预览 chunk 后挂载」的时序（原实现由预览自己监听，
// 异步化后可能错过首条事件）。
const activeFilePath = ref('')

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
    // 2026-11-15 数据安全修复：CLEAR_EDITOR_PREVIEW 只清空编辑器显示，**绝不把占位内容
    // 同步到主进程**。原实现把编辑器内容设为 '# ' 并调用 handleMarkdownCodeUpdate('# ')，
    // 会把 '# ' 同步进主进程的 currentActiveFile.content 并置脏：
    // 用户停留在欢迎页时主进程已在后台恢复上次打开的文件（currentActiveFile 已存在），
    // 此时点「打开文件夹 / 最近文件夹」会先进入主界面再发本事件，'# ' 同步后该文件变脏，
    // 之后打开新文件前的自动保存 / 关闭保存会把旧文档写成 '# '（数据被清空）。
    clearContentSyncTimer()
    // 先更新基准，再改内容：即使后续编辑器回传 change 事件，newValue 与 lastSyncedContent
    // 相同也会被跳过，不会产生 UPDATE_SELECT_FILE_CONTENT IPC。
    lastSyncedContent = ''
    markdownEditorContent.value = ''
    if (isShowEditArea.value) {
        initialCodeContent.value = ''
    }
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
//
// P2 功能错误处理修复：失败路径此前只写 logger.error（用户点完「编码 → 转换」后界面
// 无任何反馈，误以为已转码成功）。现统一经 common/action-feedback 的 reportActionFailure
// 弹出错误对话框，并在消息框底部提供「重试」按钮——读盘失败/权限不足/无活动文件等
// 可恢复失败均可原样重试，重试成功仍由主进程下发状态栏成功提示。
type EncodingAction = 'reopen' | 'convert'

/**
 * 执行编码操作并统一处理失败反馈。
 * @param action reopen=按指定编码重新打开；convert=转换编码并保存
 * @param encoding 目标编码（主进程菜单事件携带）
 */
async function runEncodingAction(action: EncodingAction, encoding: string): Promise<void> {
    const isReopen = action === 'reopen'
    try {
        // 两个通道分别保持字面量调用形态：tests/unit/preload-whitelist.test.ts 的静态
        // 扫描依赖 `invoke(IPC.<组>.<键>` 字面量（三目/变量会漏检导致白名单误报未使用）。
        if (isReopen) {
            await window.electron.ipcRenderer.invoke(IPC.FILE.REOPEN_WITH_ENCODING, encoding)
        } else {
            await window.electron.ipcRenderer.invoke(IPC.FILE.CONVERT_SAVE_ENCODING, encoding)
        }
    } catch (error) {
        logger.error(isReopen ? '按指定编码重新打开失败:' : '转换编码保存失败:', error)
        reportActionFailure({
            title: t(
                isReopen
                    ? 'dialogRenderer.encoding.reopenFailedTitle'
                    : 'dialogRenderer.encoding.convertFailedTitle'
            ),
            message: t(
                isReopen
                    ? 'dialogRenderer.encoding.reopenFailedMessage'
                    : 'dialogRenderer.encoding.convertFailedMessage',
                { encoding, error: describeActionError(error, t('common.unknown')) }
            ),
            retry: () => runEncodingAction(action, encoding)
        })
    }
}

const handleOpenWithEncoding = (_event: unknown, encoding: string): void => {
    void runEncodingAction('reopen', encoding)
}

// FUN-02：编码菜单"转换编码"——按指定编码转码当前内容并写盘
const handleConvertToEncoding = (_event: unknown, encoding: string): void => {
    void runEncodingAction('convert', encoding)
}

/**
 * 结构优化第 2 批 2.2（H4）：活动文件路径监听（同步组件注册，避免预览懒加载错过首条事件）。
 * 预览相对图片/文件链接与 snippets 展开都依赖当前文件路径；预览组件自身仍保留同通道监听
 * （直接挂载预览的既有调用方/测试不受影响），两条路径写入同一个模块级状态，值一致。
 */
const handleActiveFileChange = (_event: unknown, filePath: string) => {
    activeFilePath.value = typeof filePath === 'string' ? filePath : ''
}

onMounted(() => {
    // 初始化容器宽度
    const parentElement = document.getElementById('md-edit-component')?.parentElement
    if (parentElement) {
        windowWidth.value = parentElement.clientWidth.toString()
    }

    onEventBus(EVENT_BUS.MONACO_SAVE_FILE_CONTENT_TO_DISK, handleSaveFileContent)
    onEventBus(EVENT_BUS.MONACO_USE_TEMPLATE, handleUseTemplate)
    onEventBus(EVENT_BUS.MONACO_REPLACE_TEXT, handleFileImportReplace)

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
    window.electron.ipcRenderer.on(IPC.FILE.OPEN_WITH_ENCODING, handleOpenWithEncoding)
    window.electron.ipcRenderer.on(IPC.FILE.CONVERT_TO_ENCODING, handleConvertToEncoding)
    // 结构优化第 2 批 2.2（H4）：预览按需加载后的活动文件路径时序兜底（见 handleActiveFileChange）
    window.electron.ipcRenderer.on(IPC.FILE.USER_SELECT_FILE, handleActiveFileChange)

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
    // EventBus 监听已由 useEventBus 自动清理

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
    window.electron.ipcRenderer.removeListener(IPC.FILE.OPEN_WITH_ENCODING, handleOpenWithEncoding)
    window.electron.ipcRenderer.removeListener(
        IPC.FILE.CONVERT_TO_ENCODING,
        handleConvertToEncoding
    )
    window.electron.ipcRenderer.removeListener(IPC.FILE.USER_SELECT_FILE, handleActiveFileChange)
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

/* 结构优化第 2 批 2.2（H4）：Monaco / 预览二级懒加载骨架。
   编辑器与预览分栏并排，骨架带轻微 shimmer 动画提示「正在加载」，高度撑满容器，
   避免分块加载期间出现白屏或布局跳动。 */
.md-pane-skeleton {
    width: 100%;
    height: 100%;
    min-height: 120px;
    box-sizing: border-box;
    background: linear-gradient(
        90deg,
        var(--theme-card-background, rgba(0, 0, 0, 0.03)) 25%,
        var(--theme-hover-background, rgba(0, 0, 0, 0.06)) 37%,
        var(--theme-card-background, rgba(0, 0, 0, 0.03)) 63%
    );
    background-size: 400% 100%;
    animation: md-pane-skeleton-shimmer 1.2s ease infinite;
}

@keyframes md-pane-skeleton-shimmer {
    0% {
        background-position: 100% 50%;
    }
    100% {
        background-position: 0 50%;
    }
}

/* 分块加载失败兜底：与原内容区同尺寸的错误提示，不阻塞主界面其它区域 */
.md-pane-error {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    min-height: 120px;
    padding: 16px;
    box-sizing: border-box;
    text-align: center;
    color: var(--theme-text-color, #333);
    background: var(--theme-background-color, transparent);
}

.md-pane-error-title {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
}

.md-pane-error-detail {
    margin: 0;
    max-width: 480px;
    font-size: 12px;
    color: var(--theme-secondary-text-color, #888);
    word-break: break-all;
}

.md-pane-error-retry {
    padding: 4px 14px;
    font-size: 12px;
    cursor: pointer;
    color: var(--theme-button-text-color, #fff);
    background: var(--theme-button-background, var(--theme-accent-color, #764ba2));
    border: 1px solid var(--theme-border-color, transparent);
    border-radius: 4px;
}
</style>
