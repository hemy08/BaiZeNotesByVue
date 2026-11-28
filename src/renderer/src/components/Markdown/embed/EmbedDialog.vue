<template>
    <!--
        1.5.7 LLM Wiki L4（T4.2）：在 wiki/ 页面中嵌入 raw/ 资料。
        - 文件清单来自既有目录树 IPC（FILE_MANAGER.FILE_SYSTEM_DATA 事件 +
          RELOAD_FROM_DISK 触发刷新；raw/ 被工作区索引排除，故不复用索引）；
        - 文本经既有 FILE.READ_HTML 只读预览；图片经既有 app://local 协议缩略预览；
        - 「插入到编辑器」复用 A8 insertMarkdownAtSelection，生成标准 Markdown 相对引用
          `[资料标题](../raw/文件名.md)`（相对当前活动文件目录，与预览链接管线兼容）。
    -->
    <BaseDialog
        tool-window
        :visible="visible"
        :title="t('editorUi.embedDialog.title')"
        width-size="complex"
        reset-position-on-open
        container-class="embed-dialog"
        @close="handleClose"
    >
        <div class="embed-body" data-testid="embed-dialog">
            <div class="embed-toolbar">
                <span class="embed-root" :title="rootPath">{{ rootPathText }}</span>
                <span class="embed-summary">{{ summaryText }}</span>
            </div>

            <div v-if="loading" class="embed-placeholder" role="status" data-testid="embed-loading">
                {{ t('editorUi.embedDialog.loading') }}
            </div>
            <div
                v-else-if="errorCode === 'no-workspace'"
                class="embed-placeholder embed-placeholder--empty"
                data-testid="embed-no-workspace"
            >
                {{ t('editorUi.embedDialog.noWorkspace') }}
            </div>
            <div
                v-else-if="errorCode !== ''"
                class="embed-placeholder embed-placeholder--error"
                role="alert"
                data-testid="embed-error"
            >
                <p class="embed-error-text">{{ errorText }}</p>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--ghost btn btn-retry-embed"
                    :disabled="loading"
                    @click="handleRefresh"
                >
                    {{ t('editorUi.embedDialog.retry') }}
                </button>
            </div>
            <div
                v-else-if="rawRootPath === null"
                class="embed-placeholder embed-placeholder--empty"
                data-testid="embed-empty-raw"
            >
                {{ t('editorUi.embedDialog.emptyRaw') }}
            </div>
            <div
                v-else-if="files.length === 0"
                class="embed-placeholder embed-placeholder--empty"
                data-testid="embed-empty-files"
            >
                {{ t('editorUi.embedDialog.emptyFiles') }}
            </div>
            <template v-else>
                <div class="embed-stage">
                    <div class="embed-file-pane">
                        <div class="embed-file-header">
                            {{ t('editorUi.embedDialog.listLabel') }}
                        </div>
                        <ul
                            class="embed-file-list"
                            role="listbox"
                            :aria-label="t('editorUi.embedDialog.listLabel')"
                            data-testid="embed-file-list"
                        >
                            <li v-for="file in files" :key="file.path" class="embed-file-row">
                                <button
                                    type="button"
                                    role="option"
                                    class="embed-file-item"
                                    :class="{ 'is-selected': selectedPath === file.path }"
                                    :aria-selected="selectedPath === file.path"
                                    :title="file.relativePath"
                                    data-testid="embed-file-item"
                                    :data-file-path="file.path"
                                    @click="selectFile(file)"
                                >
                                    <span
                                        class="embed-file-kind"
                                        :data-kind="file.kind"
                                        :aria-label="kindLabel(file.kind)"
                                        >{{ kindBadge(file.kind) }}</span
                                    >
                                    <span class="embed-file-name">{{ file.name }}</span>
                                    <span class="embed-file-path">{{ file.relativePath }}</span>
                                </button>
                            </li>
                        </ul>
                    </div>

                    <div class="embed-preview-pane">
                        <div class="embed-file-header">
                            {{ t('editorUi.embedDialog.previewTitle') }}
                        </div>
                        <p v-if="selectedFile === null" class="embed-preview-empty">
                            {{ t('editorUi.embedDialog.previewEmpty') }}
                        </p>
                        <template v-else>
                            <p class="embed-preview-path" :title="selectedFile.relativePath">
                                {{ selectedFile.relativePath }}
                            </p>
                            <div
                                v-if="previewLoading"
                                class="embed-preview-loading"
                                role="status"
                                data-testid="embed-preview-loading"
                            >
                                {{ t('editorUi.embedDialog.previewLoading') }}
                            </div>
                            <p
                                v-else-if="previewError !== ''"
                                class="embed-preview-error"
                                role="alert"
                                data-testid="embed-preview-error"
                            >
                                {{ previewError }}
                            </p>
                            <template v-else-if="selectedFile.kind === 'text'">
                                <pre class="embed-preview-text" data-testid="embed-preview-text">{{
                                    previewContent
                                }}</pre>
                                <p
                                    v-if="previewTruncated"
                                    class="embed-hint"
                                    data-testid="embed-preview-truncated"
                                >
                                    {{
                                        t('editorUi.embedDialog.previewTruncated', {
                                            count: EMBED_PREVIEW_MAX_CHARS
                                        })
                                    }}
                                </p>
                            </template>
                            <img
                                v-else-if="selectedFile.kind === 'image'"
                                class="embed-preview-image"
                                :src="imagePreviewUrl"
                                :alt="selectedFile.name"
                                data-testid="embed-preview-image"
                            />
                            <p v-else class="embed-hint" data-testid="embed-preview-other">
                                {{ t('editorUi.embedDialog.previewOther') }}
                            </p>
                        </template>
                    </div>
                </div>

                <div class="embed-actions">
                    <span class="embed-active-file" :title="activeFilePath">
                        {{ activeFileText }}
                    </span>
                    <span class="embed-actions-spacer"></span>
                    <button
                        type="button"
                        class="dialog-btn dialog-btn--ghost btn btn-copy-embed"
                        data-testid="embed-copy-btn"
                        :disabled="selectedFile === null"
                        @click="handleCopy"
                    >
                        {{
                            copyState === 'copied'
                                ? t('editorUi.embedDialog.copied')
                                : t('editorUi.embedDialog.copy')
                        }}
                    </button>
                    <button
                        type="button"
                        class="dialog-btn dialog-btn--primary btn btn-insert-embed"
                        data-testid="embed-insert-btn"
                        :disabled="selectedFile === null"
                        @click="handleInsert"
                    >
                        {{ t('editorUi.embedDialog.insert') }}
                    </button>
                </div>

                <div class="embed-status" aria-live="polite">
                    <span
                        v-if="statusText !== ''"
                        class="embed-hint"
                        :class="statusIsError ? 'embed-hint--error' : 'embed-hint--ok'"
                        :role="statusIsError ? 'alert' : 'status'"
                        data-testid="embed-status"
                    >
                        {{ statusText }}
                    </span>
                    <span
                        v-if="lastInsertedMarkdown !== ''"
                        class="embed-last-inserted"
                        :title="lastInsertedMarkdown"
                    >
                        <code>{{ lastInsertedMarkdown }}</code>
                    </span>
                </div>
            </template>
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--ghost btn btn-refresh-embed"
                :disabled="loading"
                @click="handleRefresh"
            >
                {{ t('editorUi.embedDialog.refresh') }}
            </button>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn-close-embed"
                @click="handleClose"
            >
                {{ t('editorUi.embedDialog.close') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 1.5.7 LLM Wiki L4（T4.2）：嵌入 UI 对话框（renderer-only，不新增 IPC / 依赖）。
 *
 * ## 数据流
 * 1. 打开时订阅 `FILE_MANAGER.FILE_SYSTEM_DATA`（主进程 → 渲染层整树事件，既有通道），
 *    并发送 `FILE_MANAGER.RELOAD_FROM_DISK` 请求主进程重扫并下发最新目录树；
 * 2. 收到树 JSON → `parseWorkspaceFileTree` 找出根下 `raw/` 目录并扁平化为文件清单
 *    （文本 / 图片 / 其他三类；按 relativePath 升序）；
 * 3. 选中文件 → 文本经 `FILE.READ_HTML`（既有文本读取通道，主进程做 Path Guard +
 *    扩展名白名单）只读预览；图片经 `toRendererLocalResourceUrl`（app://local 协议）缩略；
 * 4. 「插入到编辑器」→ `buildEmbedMarkdownLink` 生成 `[资料标题](相对路径)` →
 *    动态 import A8 `insertMarkdownAtSelection` 写入当前活动编辑器（无编辑器时提示先打开页面）。
 *
 * ## 边界
 * - 不新增 IPC（只复用既有目录树事件 + 刷新 send + READ_HTML invoke）；
 * - 不支持内联预览的类型（PDF/HTML 等）只允许插入引用链接，不承诺预览；
 * - 主题：颜色/间距/圆角全部消费 `--ui-*` 令牌，无 `data-style` / `data-density` 分支。
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { IPC } from '../../../../../shared/ipc-channels'
import { toRendererLocalResourceUrl } from '../../../../../shared/protocol/app-protocol'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import { getActiveEditor } from '../../../common/active-editor'
import { documentHistoryState } from '../../../composables/useDocumentHistory'
import BaseDialog from '../../dialogs/BaseDialog.vue'
import {
    EMBED_PREVIEW_MAX_CHARS,
    buildEmbedMarkdownLink,
    findFirstEmbedFile,
    parseWorkspaceFileTree,
    type EmbedFileEntry,
    type EmbedFileKind
} from './embed-data'

interface Props {
    /** 显隐开关（真源在宿主 SearchOverlayHost；false → true 时刷新 raw/ 文件清单） */
    visible?: boolean
}

const props = withDefaults(defineProps<Props>(), { visible: false })

const emit = defineEmits<{
    (e: 'close'): void
}>()

/** 等待主进程目录树事件的超时（ms；超时给出可重试错误，不阻塞对话框） */
const TREE_LOAD_TIMEOUT_MS = 8000

/** 受限 ipcRenderer 最小结构（与设置页/渲染层其它动作模块同款守卫，不直接依赖 Electron 类型） */
interface EmbedIpcRendererLike {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    send?: (channel: string, ...args: unknown[]) => void
    on?: (channel: string, listener: (...args: unknown[]) => void) => void
    removeListener?: (channel: string, listener: (...args: unknown[]) => void) => void
}

/** 取受限 ipcRenderer；非 Electron 环境（测试桩/旧 preload）返回 null */
function getRestrictedIpcRenderer(): EmbedIpcRendererLike | null {
    if (typeof window === 'undefined') {
        return null
    }
    const ipcRenderer = (window as { electron?: { ipcRenderer?: EmbedIpcRendererLike } }).electron
        ?.ipcRenderer
    if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
        return null
    }
    return ipcRenderer
}

/** 嵌入对话框错误码（no-workspace / 目录树超时 / IPC 不可用 / 目录树非法） */
type EmbedErrorCode = '' | 'no-workspace' | 'timeout' | 'ipc-unavailable' | 'invalid-tree'

/** 插入状态（用于状态行文案/颜色） */
type EmbedInsertStatus =
    | ''
    | 'inserted'
    | 'insert-failed'
    | 'no-active-file'
    | 'different-drive'
    | 'editor-unavailable'
    | 'copy-failed'

/** 是否正在加载目录树 */
const loading = ref(false)
/** 目录树加载错误（'' = 无错误） */
const errorCode = ref<EmbedErrorCode>('')
/** 工作区根绝对路径（目录树根节点） */
const rootPath = ref('')
/** `raw/` 目录绝对路径（null = 工作区尚未初始化 raw/） */
const rawRootPath = ref<string | null>(null)
/** raw/ 下可嵌入文件清单 */
const files = ref<EmbedFileEntry[]>([])
/** 当前选中文件路径（空串 = 未选中） */
const selectedPath = ref('')
/** 文本预览进行中 */
const previewLoading = ref(false)
/** 文本预览内容 */
const previewContent = ref('')
/** 文本预览失败原因（'' = 无错误） */
const previewError = ref('')
/** 文本预览是否因超长截断 */
const previewTruncated = ref(false)
/** 插入/复制状态 */
const insertStatus = ref<EmbedInsertStatus>('')
/** 最近一次成功插入的 Markdown（便于用户核对） */
const lastInsertedMarkdown = ref('')
/** 复制状态（copied = 最近一次复制成功；用于按钮文案反馈） */
const copyState = ref<'' | 'copied'>('')
/** 目录树等待清理函数（关闭/卸载/超时时调用） */
let cleanupTreeWait: (() => void) | null = null
/** 复制成功反馈复位计时器 */
let copyResetTimer: ReturnType<typeof setTimeout> | null = null
/** 目录树加载序号（连续刷新只采纳最后一次结果） */
let treeLoadSequence = 0
/** 预览加载序号（快速切换文件只采纳最后一次结果） */
let previewLoadSequence = 0

/** 当前选中文件 */
const selectedFile = computed<EmbedFileEntry | null>(
    () => files.value.find((file) => file.path === selectedPath.value) ?? null
)

/** 当前活动文件路径（插入相对路径基准） */
const activeFilePath = computed(() => documentHistoryState.activeFilePath)

/** 工作区根/清单来源提示 */
const rootPathText = computed(() => {
    if (rootPath.value.length > 0) {
        return t('editorUi.embedDialog.workspace', { path: rootPath.value })
    }
    return t('editorUi.embedDialog.workspaceUnknown')
})

/** 清单汇总文案 */
const summaryText = computed(() =>
    t('editorUi.embedDialog.summary', {
        count: files.value.length
    })
)

/** 错误提示文案（按错误码） */
const errorText = computed(() => {
    if (errorCode.value === 'timeout') {
        return t('editorUi.embedDialog.timeout')
    }
    if (errorCode.value === 'ipc-unavailable') {
        return t('editorUi.embedDialog.ipcUnavailable')
    }
    if (errorCode.value === 'invalid-tree') {
        return t('editorUi.embedDialog.invalidTree')
    }
    return t('editorUi.embedDialog.loadFailed')
})

/** 当前活动文件提示（未打开文件时引导先打开 wiki/ 页面） */
const activeFileText = computed(() =>
    activeFilePath.value.length > 0
        ? t('editorUi.embedDialog.activeFile', { path: activeFilePath.value })
        : t('editorUi.embedDialog.noActiveFileHint')
)

/** 图片预览 URL（app://local 绝对 URL；非图片/未选中时为空串） */
const imagePreviewUrl = computed(() => {
    const file = selectedFile.value
    if (file === null || file.kind !== 'image') {
        return ''
    }
    return toRendererLocalResourceUrl(file.path)
})

/** 插入/复制状态行文案（'' = 不展示） */
const statusText = computed(() => {
    switch (insertStatus.value) {
        case 'inserted':
            return t('editorUi.embedDialog.inserted')
        case 'insert-failed':
            return t('editorUi.embedDialog.insertFailed')
        case 'no-active-file':
            return t('editorUi.embedDialog.noActiveFile')
        case 'different-drive':
            return t('editorUi.embedDialog.differentDrive')
        case 'editor-unavailable':
            return t('editorUi.embedDialog.editorUnavailable')
        case 'copy-failed':
            return t('editorUi.embedDialog.copyFailed')
        default:
            return ''
    }
})

/** 状态行是否为错误色 */
const statusIsError = computed(() => insertStatus.value !== '' && insertStatus.value !== 'inserted')

/** 类型标签（无障碍名称） */
function kindLabel(kind: EmbedFileKind): string {
    if (kind === 'text') {
        return t('editorUi.embedDialog.kindText')
    }
    if (kind === 'image') {
        return t('editorUi.embedDialog.kindImage')
    }
    return t('editorUi.embedDialog.kindOther')
}

/** 类型徽标（紧凑展示：文/图/他） */
function kindBadge(kind: EmbedFileKind): string {
    if (kind === 'text') {
        return t('editorUi.embedDialog.kindTextBadge')
    }
    if (kind === 'image') {
        return t('editorUi.embedDialog.kindImageBadge')
    }
    return t('editorUi.embedDialog.kindOtherBadge')
}

/** 复位状态行与预览状态（切换文件 / 重新加载时） */
function resetTransientState(): void {
    insertStatus.value = ''
    copyState.value = ''
    lastInsertedMarkdown.value = ''
    previewLoading.value = false
    previewContent.value = ''
    previewError.value = ''
    previewTruncated.value = false
    if (copyResetTimer !== null) {
        clearTimeout(copyResetTimer)
        copyResetTimer = null
    }
}

/** 停止等待目录树事件（移除监听 + 清超时；幂等） */
function stopTreeWait(): void {
    if (typeof cleanupTreeWait === 'function') {
        cleanupTreeWait()
        cleanupTreeWait = null
    }
}

/**
 * 处理主进程目录树事件：解析 raw/ 清单并复位选择。
 * 只采纳本轮加载序号对应的结果（防止旧事件覆盖新刷新）。
 */
function applyTreePayload(payload: unknown, sequence: number): void {
    if (sequence !== treeLoadSequence) {
        return
    }
    const result = parseWorkspaceFileTree(payload)
    if (!result.ok) {
        loading.value = false
        errorCode.value = result.code === 'NO_WORKSPACE' ? 'no-workspace' : 'invalid-tree'
        return
    }
    rootPath.value = result.rootPath
    rawRootPath.value = result.rawRootPath
    files.value = result.files
    errorCode.value = ''
    loading.value = false
    const first = findFirstEmbedFile(result.files)
    selectedPath.value = first === null ? '' : first.path
    if (first === null) {
        resetTransientState()
    }
}

/**
 * 请求主进程重扫目录树并等待 `FILE_SYSTEM_DATA` 事件。
 *
 * 失败（IPC 不可用 / 超时 / 解析失败）只落到对话框内错误态，可点「重试」再次触发；
 * 超时/关闭时移除事件监听，避免泄漏。
 */
function loadRawFiles(): void {
    resetTransientState()
    stopTreeWait()
    const sequence = ++treeLoadSequence
    loading.value = true
    errorCode.value = ''
    rootPath.value = ''
    rawRootPath.value = null
    files.value = []
    selectedPath.value = ''
    const ipcRenderer = getRestrictedIpcRenderer()
    if (
        !ipcRenderer ||
        typeof ipcRenderer.on !== 'function' ||
        typeof ipcRenderer.send !== 'function'
    ) {
        loading.value = false
        errorCode.value = 'ipc-unavailable'
        return
    }
    let timeout: ReturnType<typeof setTimeout> | null = null
    const listener = (_event: unknown, payload: unknown): void => {
        stopTreeWait()
        applyTreePayload(payload, sequence)
    }
    cleanupTreeWait = () => {
        if (timeout !== null) {
            clearTimeout(timeout)
            timeout = null
        }
        try {
            if (typeof ipcRenderer.removeListener === 'function') {
                ipcRenderer.removeListener(IPC.FILE_MANAGER.FILE_SYSTEM_DATA, listener)
            }
        } catch (error) {
            logger.warn('[嵌入 UI] 移除目录树监听失败（忽略）', error)
        }
    }
    if (typeof ipcRenderer.removeListener !== 'function') {
        cleanupTreeWait = () => {
            if (timeout !== null) {
                clearTimeout(timeout)
                timeout = null
            }
        }
    }
    timeout = setTimeout(() => {
        if (sequence !== treeLoadSequence) {
            return
        }
        stopTreeWait()
        if (loading.value) {
            loading.value = false
            errorCode.value = 'timeout'
        }
    }, TREE_LOAD_TIMEOUT_MS)
    ipcRenderer.on(IPC.FILE_MANAGER.FILE_SYSTEM_DATA, listener)
    try {
        ipcRenderer.send(IPC.FILE_MANAGER.RELOAD_FROM_DISK)
    } catch (error) {
        stopTreeWait()
        loading.value = false
        errorCode.value = 'ipc-unavailable'
        logger.warn('[嵌入 UI] 请求刷新目录树失败', error)
    }
}

/**
 * 加载选中文件的只读预览：
 * - 文本 → `FILE.READ_HTML`（既有文本读取通道，主进程做 Path Guard + 扩展名白名单）；
 * - 图片 → 由模板直接消费 app://local URL（无需 IPC）；
 * - 其他 → 不预览，仅允许插入引用。
 */
async function loadPreview(): Promise<void> {
    const sequence = ++previewLoadSequence
    previewContent.value = ''
    previewError.value = ''
    previewTruncated.value = false
    previewLoading.value = false
    const file = selectedFile.value
    if (file === null || file.kind !== 'text') {
        return
    }
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        previewError.value = t('editorUi.embedDialog.ipcUnavailable')
        return
    }
    previewLoading.value = true
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.FILE.READ_HTML, file.path)
        if (sequence !== previewLoadSequence) {
            return
        }
        if (typeof raw !== 'string') {
            previewError.value = t('editorUi.embedDialog.previewFailed')
            return
        }
        if (raw.length > EMBED_PREVIEW_MAX_CHARS) {
            previewContent.value = raw.slice(0, EMBED_PREVIEW_MAX_CHARS)
            previewTruncated.value = true
        } else {
            previewContent.value = raw
        }
    } catch (error) {
        if (sequence !== previewLoadSequence) {
            return
        }
        logger.warn('[嵌入 UI] 读取 raw/ 文件预览失败', error)
        previewError.value = t('editorUi.embedDialog.previewFailed')
    } finally {
        if (sequence === previewLoadSequence) {
            previewLoading.value = false
        }
    }
}

/** 选择文件（切换选中并加载预览） */
function selectFile(file: EmbedFileEntry): void {
    if (selectedPath.value === file.path) {
        return
    }
    selectedPath.value = file.path
    resetTransientState()
}

/** 构造可插入的 Markdown（内部；失败返回 null 并记录状态） */
function buildMarkdownForSelected(): string | null {
    const file = selectedFile.value
    if (file === null) {
        return null
    }
    const activeFile = activeFilePath.value
    if (activeFile.trim().length === 0) {
        insertStatus.value = 'no-active-file'
        return null
    }
    const result = buildEmbedMarkdownLink(file, activeFile)
    if (!result.ok) {
        insertStatus.value = result.code === 'NO_ACTIVE_FILE' ? 'no-active-file' : 'different-drive'
        return null
    }
    return result.markdown
}

/** 插入到当前编辑器（复用 A8 insertMarkdownAtSelection；无编辑器时给出引导） */
async function handleInsert(): Promise<void> {
    insertStatus.value = ''
    lastInsertedMarkdown.value = ''
    if (selectedFile.value === null) {
        return
    }
    const markdown = buildMarkdownForSelected()
    if (markdown === null) {
        return
    }
    const editor = getActiveEditor()
    if (editor === null) {
        insertStatus.value = 'editor-unavailable'
        return
    }
    try {
        // 动态 import：插入能力只在本按钮点击时加载，不进对话框首屏依赖
        const pasteEnhance = await import('../editor-paste-enhance')
        const inserted = pasteEnhance.insertMarkdownAtSelection(editor, markdown)
        if (!inserted) {
            insertStatus.value = 'insert-failed'
            return
        }
        insertStatus.value = 'inserted'
        lastInsertedMarkdown.value = markdown
        logger.info('[嵌入 UI] 已插入 raw/ 资料引用：', markdown)
    } catch (error) {
        logger.warn('[嵌入 UI] 插入 raw/ 资料引用失败', error)
        insertStatus.value = 'insert-failed'
    }
}

/** 复制 Markdown（无可用编辑器/插入失败时的兜底路径） */
async function handleCopy(): Promise<void> {
    insertStatus.value = ''
    const markdown = buildMarkdownForSelected()
    if (markdown === null) {
        return
    }
    try {
        if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
            insertStatus.value = 'copy-failed'
            return
        }
        await navigator.clipboard.writeText(markdown)
        copyState.value = 'copied'
        lastInsertedMarkdown.value = markdown
        if (copyResetTimer !== null) {
            clearTimeout(copyResetTimer)
        }
        copyResetTimer = setTimeout(() => {
            copyState.value = ''
            copyResetTimer = null
        }, 1500)
    } catch (error) {
        logger.warn('[嵌入 UI] 复制 Markdown 失败', error)
        insertStatus.value = 'copy-failed'
    }
}

/** 刷新 raw/ 文件清单（重新请求主进程目录树） */
function handleRefresh(): void {
    loadRawFiles()
}

/** 关闭对话框（移除目录树监听/计时器后通知宿主） */
function handleClose(): void {
    stopTreeWait()
    emit('close')
}

// 打开即加载（宿主先挂载、后设置 visible，故 immediate 兜底）；关闭时停止等待并复位状态
watch(
    () => props.visible,
    (visible: boolean) => {
        if (visible) {
            loadRawFiles()
        } else {
            stopTreeWait()
            resetTransientState()
        }
    },
    { immediate: true }
)

// 选中文件变化 → 加载预览（文本走 IPC；图片由模板直接消费 URL）
watch(selectedPath, () => {
    void loadPreview()
})

// 卸载时清理监听与计时器（防止对话框卸载后仍有事件回写）
onBeforeUnmount(() => {
    stopTreeWait()
    if (copyResetTimer !== null) {
        clearTimeout(copyResetTimer)
        copyResetTimer = null
    }
})
</script>

<style scoped>
/* 1.5.7 LLM Wiki L4：嵌入 UI（四风格 × 三密度全部经 --ui-* 令牌派生，无 data-style 分支） */
.embed-body {
    display: flex;
    flex-direction: column;
    gap: calc(var(--ui-pad) * 0.75);
    padding: var(--ui-pad);
    min-height: 420px;
    color: var(--ui-text);
    font-size: var(--ui-font-size);
}

.embed-toolbar {
    display: flex;
    align-items: center;
    gap: calc(var(--ui-pad) * 0.75);
    padding: calc(var(--ui-pad) * 0.5) calc(var(--ui-pad) * 0.75);
    background: var(--ui-surface);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-md);
    font-size: calc(var(--ui-font-size) - 1px);
    color: var(--ui-text-secondary);
}

.embed-root {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.embed-summary {
    flex: none;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.embed-placeholder {
    min-height: 300px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--ui-pad);
    padding: var(--ui-pad);
    text-align: center;
    font-size: var(--ui-font-size);
    color: var(--ui-text-secondary);
    background: var(--ui-surface);
    border: 1px dashed var(--ui-border);
    border-radius: var(--ui-radius-md);
}

.embed-placeholder--error {
    color: var(--ui-danger);
}

.embed-error-text {
    margin: 0;
}

.embed-stage {
    display: flex;
    gap: calc(var(--ui-pad) * 0.75);
    min-height: 340px;
    flex: 1;
}

.embed-file-pane,
.embed-preview-pane {
    display: flex;
    flex-direction: column;
    background: var(--ui-surface);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-md);
    overflow: hidden;
}

.embed-file-pane {
    flex: none;
    width: 320px;
}

.embed-preview-pane {
    flex: 1;
    min-width: 0;
}

.embed-file-header {
    padding: calc(var(--ui-pad) * 0.5) calc(var(--ui-pad) * 0.75);
    border-bottom: 1px solid var(--ui-border);
    font-size: calc(var(--ui-font-size) - 1px);
    font-weight: 600;
    color: var(--ui-text-secondary);
}

.embed-file-list {
    list-style: none;
    margin: 0;
    padding: calc(var(--ui-pad) * 0.25);
    overflow-y: auto;
    max-height: min(48vh, 460px);
}

.embed-file-row + .embed-file-row {
    margin-top: 2px;
}

.embed-file-item {
    display: flex;
    align-items: baseline;
    gap: calc(var(--ui-pad) * 0.5);
    width: 100%;
    padding: calc(var(--ui-pad) * 0.35) calc(var(--ui-pad) * 0.5);
    border: 1px solid transparent;
    border-radius: var(--ui-radius-sm);
    background: transparent;
    color: var(--ui-text);
    font-family: inherit;
    font-size: calc(var(--ui-font-size) - 1px);
    text-align: left;
    cursor: pointer;
    transition: background var(--ui-duration-fast) var(--ui-ease-standard);
}

.embed-file-item:hover {
    background: var(--ui-accent-soft);
}

.embed-file-item.is-selected {
    background: var(--ui-accent-soft);
    border-color: var(--ui-accent);
}

.embed-file-item:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.embed-file-kind {
    flex: none;
    min-width: calc(var(--ui-row-height) * 0.75);
    padding: 0 calc(var(--ui-pad) * 0.25);
    border: 1px solid var(--ui-border);
    border-radius: var(--ui-radius-sm);
    font-size: calc(var(--ui-font-size) - 2px);
    line-height: calc(var(--ui-row-height) * 0.65);
    text-align: center;
    color: var(--ui-text-secondary);
}

.embed-file-kind[data-kind='text'] {
    color: var(--ui-accent);
    border-color: var(--ui-accent);
}

.embed-file-kind[data-kind='image'] {
    color: var(--ui-info);
    border-color: var(--ui-info);
}

.embed-file-name {
    flex: none;
    max-width: 55%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.embed-file-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--ui-text-tertiary);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: calc(var(--ui-font-size) - 2px);
}

.embed-preview-path {
    margin: 0;
    padding: calc(var(--ui-pad) * 0.4) calc(var(--ui-pad) * 0.75);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: calc(var(--ui-font-size) - 2px);
    color: var(--ui-text-tertiary);
    border-bottom: 1px solid var(--ui-border);
    word-break: break-all;
}

.embed-preview-loading,
.embed-preview-empty {
    margin: 0;
    padding: var(--ui-pad);
    font-size: calc(var(--ui-font-size) - 1px);
    color: var(--ui-text-secondary);
}

.embed-preview-error {
    margin: 0;
    padding: var(--ui-pad);
    font-size: calc(var(--ui-font-size) - 1px);
    color: var(--ui-danger);
}

.embed-preview-text {
    margin: 0;
    padding: var(--ui-pad);
    overflow: auto;
    max-height: min(48vh, 460px);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: calc(var(--ui-font-size) - 1px);
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
    color: var(--ui-text);
}

.embed-preview-image {
    display: block;
    max-width: 100%;
    max-height: min(48vh, 460px);
    margin: var(--ui-pad);
    object-fit: contain;
    border-radius: var(--ui-radius-sm);
}

.embed-hint {
    margin: 0;
    padding: calc(var(--ui-pad) * 0.4) var(--ui-pad);
    font-size: calc(var(--ui-font-size) - 1px);
    color: var(--ui-text-secondary);
}

.embed-hint--error {
    color: var(--ui-danger);
}

.embed-hint--ok {
    color: var(--ui-success);
}

.embed-actions {
    display: flex;
    align-items: center;
    gap: calc(var(--ui-pad) * 0.5);
}

.embed-active-file {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: calc(var(--ui-font-size) - 1px);
    color: var(--ui-text-secondary);
}

.embed-actions-spacer {
    flex: none;
}

.embed-status {
    display: flex;
    flex-wrap: wrap;
    gap: calc(var(--ui-pad) * 0.35) calc(var(--ui-pad) * 0.75);
    align-items: center;
    min-height: calc(var(--ui-row-height) * 0.8);
}

.embed-last-inserted {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: calc(var(--ui-font-size) - 2px);
    color: var(--ui-text-tertiary);
}
</style>
