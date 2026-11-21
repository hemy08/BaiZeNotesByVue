/**
 * 文档历史 / 编辑内容桥（A3 文档历史，opt-in：`flags.documentHistory`；A4 Markdown lint 复用内容桥）
 *
 * 边界（任务卡 A3/A4 + 开发规范）：
 * - **renderer-only MVP**：不新增 IPC、不直接改主进程状态；快照写本机 localStorage
 *   （存储实现在 `components/Markdown/history/history-storage.ts`，纯函数 + 可注入存储替身）；
 * - **保存链路监听**：`IPC.EVENTS.FILE_SAVED_SUCCESS`（保存成功）触发快照，
 *   `IPC.FILE.USER_SELECT_FILE`（主进程下发当前文件路径）维护 activeFilePath；
 * - **恢复链路**：只经既有 EventBus `MONACO_REPLACE_TEXT` 让编辑器替换内容，
 *   绝不直接写主进程 currentActiveFile（与「文件导入替换」同一路径）；
 * - **flag 关闭时**：不注册 IPC 监听、不读写 localStorage、历史对话框不渲染
 *   （`FileHistoryDialog.vue` 内还有一层 `v-if="flags.documentHistory"` 防御）；
 * - **失败静默降级**：localStorage 不可用/写失败、内容读取失败、快照过大都只记日志，
 *   绝不阻断保存/打开文件主链路（CFG-04 的可见反馈由保存链路自身负责）。
 *
 * 编辑器内容桥（A3 列表比对 / A4 lint 共用，先归属本模块）：
 * - `readActiveMarkdownContent()`：优先读 Monaco 编辑器当前文本模型（实时内容，与编码无关），
 *   编辑器不可用时回退既有 `IPC.FILE.READ_HTML` 读已保存内容；
 * - `replaceActiveMarkdownContent()` / `jumpActiveEditorToLine()`：分别经既有 EventBus
 *   `MONACO_REPLACE_TEXT` / `EDITOR_JUMP_LINE` 驱动编辑器（不新增事件/通道）。
 *   之所以与文档历史同文件：本批写作用域仅允许新增本 composable，内容桥是 A3/A4 共用能力，
 *   后续如需要可平移到独立 `composables/editor-content-bridge.ts`（迁移时同步 EventBus 契约）。
 */
import { reactive, watch } from 'vue'
import { IPC } from '../../../shared/ipc-channels'
import { logger } from '../common/logger'
import EventBus from '../common/event-bus/event-bus'
import { EVENT_BUS } from '../common/event-bus/event-bus-events'
import { initFeatureFlags, useFeatureFlags } from './useFeatureFlags'
import {
    appendDocumentHistoryVersion,
    clearDocumentHistoryForFile,
    deleteDocumentHistoryVersion,
    getDocumentHistoryUsage,
    listDocumentHistoryVersions,
    type DocumentHistoryUsage,
    type DocumentHistoryVersion,
    type HistoryStorageLike
} from '../components/Markdown/history/history-storage'

/* ==================== 编辑内容桥类型与实现（A3/A4 共用） ==================== */

/** 内容来源：editor=Monaco 实时内容；saved=IPC 读到的已保存内容；empty=无活动文档 */
export type MarkdownContentSource = 'editor' | 'saved' | 'empty'

/** 当前文档内容快照 */
export interface MarkdownContentSnapshot {
    content: string
    source: MarkdownContentSource
}

/**
 * 外部内容提供者（主控集成/单测注入用）：
 * 返回字符串表示成功；返回 null / 抛错表示交给默认实现（Monaco → 已保存内容）兜底。
 */
export type MarkdownContentProvider = (filePath: string) => Promise<string | null> | string | null

/** 外部内容提供者（null = 使用默认实现；主控/测试可注入更精确的内容来源） */
let activeContentProvider: MarkdownContentProvider | null = null

/** 注入编辑器内容提供者（传 null 恢复默认实现） */
export function setActiveMarkdownContentProvider(provider: MarkdownContentProvider | null): void {
    activeContentProvider = provider
}

/** 从 Monaco 全局模型注册表读取当前 markdown 文本模型内容（实时内容，与文件编码无关） */
async function readEditorMarkdownContent(): Promise<string | null> {
    if (typeof document === 'undefined') {
        return null
    }
    // 编辑器未挂载（欢迎页等）时不加载 Monaco 分块，直接回退读已保存内容
    if (document.getElementById('monaco-editor-container') === null) {
        return null
    }
    try {
        // 动态 import：加载历史/检查对话框时编辑器分块通常已就绪，此 import 命中模块缓存；
        // 只取 monaco 的全局模型注册表（公共 API），不接触编辑器实例内部状态。
        const monaco = await import('monaco-editor')
        const models = monaco.editor
            .getModels()
            .filter((model) => !model.isDisposed() && model.getLanguageId() === 'markdown')
        if (models.length === 0) {
            return null
        }
        // 多模型时取最近被编辑的（versionId 最大者），本应用正常只有一个 markdown 模型
        const latestModel = models.reduce((previous, current) =>
            current.getVersionId() > previous.getVersionId() ? current : previous
        )
        return latestModel.getValue()
    } catch (error) {
        logger.warn('[编辑内容桥] 读取 Monaco 编辑器内容失败，回退已保存内容', error)
        return null
    }
}

/** 经既有 FILE.READ_HTML 读取磁盘上的已保存内容（兜底路径，UTF-8 文本通道） */
async function readSavedFileContent(filePath: string): Promise<string | null> {
    if (
        !filePath ||
        typeof window === 'undefined' ||
        typeof window.electron?.ipcRenderer === 'undefined'
    ) {
        return null
    }
    try {
        const content: unknown = await window.electron.ipcRenderer.invoke(
            IPC.FILE.READ_HTML,
            filePath
        )
        return typeof content === 'string' ? content : null
    } catch (error) {
        logger.warn('[编辑内容桥] 读取已保存文件内容失败（历史/检查功能将降级）', error)
        return null
    }
}

/**
 * 读取当前活动文档内容（A3 diff 比对 / A4 lint 检查共用）。
 * 优先 Monaco 实时内容（含未保存修改），其次 IPC 读已保存内容，最后返回空文本。
 */
export async function readActiveMarkdownContent(): Promise<MarkdownContentSnapshot> {
    const filePath = documentHistoryState.activeFilePath
    if (activeContentProvider !== null) {
        try {
            const provided = await activeContentProvider(filePath)
            if (typeof provided === 'string') {
                return { content: provided, source: 'editor' }
            }
        } catch (error) {
            logger.warn('[编辑内容桥] 注入的内容提供者失败，回退默认实现', error)
        }
    }
    const editorContent = await readEditorMarkdownContent()
    if (editorContent !== null) {
        return { content: editorContent, source: 'editor' }
    }
    if (filePath) {
        const savedContent = await readSavedFileContent(filePath)
        if (savedContent !== null) {
            return { content: savedContent, source: 'saved' }
        }
    }
    return { content: '', source: 'empty' }
}

/** 经既有 EventBus 让编辑器全文替换内容（A3 恢复历史版本 / A4 应用格式化共用） */
export function replaceActiveMarkdownContent(content: string): void {
    if (typeof content !== 'string') {
        return
    }
    EventBus.$emit(EVENT_BUS.MONACO_REPLACE_TEXT, content)
}

/** 经既有 EventBus 让编辑器跳转到指定行（A4 问题列表点击跳行） */
export function jumpActiveEditorToLine(line: number): void {
    if (!Number.isFinite(line)) {
        return
    }
    EventBus.$emit(EVENT_BUS.EDITOR_JUMP_LINE, { line: Math.max(1, Math.trunc(line)) })
}

/* ==================== 文档历史状态 ==================== */

/** 历史对话框加载状态 */
export type DocumentHistoryLoadStatus = 'idle' | 'loading' | 'ready' | 'error'

/** 文档历史对话框状态（模块单例；对话框只读渲染，写操作走下方函数） */
export interface DocumentHistoryState {
    /** 主进程下发的当前文件绝对路径（USER_SELECT_FILE 维护；空 = 无活动文件） */
    activeFilePath: string
    /** 历史对话框显隐（由 openFileHistoryDialog / closeFileHistoryDialog 驱动） */
    dialogVisible: boolean
    /** 当前文件的历史版本（时间倒序：最新在前） */
    versions: DocumentHistoryVersion[]
    /** 当前编辑器内容（与选中版本做 diff 的「新侧」） */
    currentContent: string
    /** 当前内容来源（editor 实时 / saved 已保存 / empty 无内容） */
    currentContentSource: MarkdownContentSource
    /** 加载状态 */
    status: DocumentHistoryLoadStatus
    /** 错误/空态 i18n 键（当前为建议键 `editorUi.fileHistory.*`，词典由主控补；空串 = 无提示） */
    errorKey: string
    /** 历史存储用量（对话框展示配额） */
    usage: DocumentHistoryUsage
}

/** 文档历史状态单例（对话框/主控只读消费） */
export const documentHistoryState = reactive<DocumentHistoryState>({
    activeFilePath: '',
    dialogVisible: false,
    versions: [],
    currentContent: '',
    currentContentSource: 'empty',
    status: 'idle',
    errorKey: '',
    usage: { totalBytes: 0, fileCount: 0, versionCount: 0 }
})

const { flags } = useFeatureFlags()

/** 取本机 localStorage（隐私模式/被禁用时返回 null，历史功能静默降级） */
function resolveHistoryStorage(): HistoryStorageLike | null {
    if (typeof window === 'undefined') {
        return null
    }
    try {
        return window.localStorage ?? null
    } catch (error) {
        logger.warn('[文档历史] localStorage 不可用，历史功能降级', error)
        return null
    }
}

/* ==================== IPC 监听与快照写入 ==================== */

/** 是否已注册 IPC 监听（flag 关闭时必须为 false） */
let listenersRegistered = false
/** 是否处于「功能开启、监听生效」的记录状态 */
let trackingEnabled = false
/** 初始化任务（幂等） */
let initTask: Promise<void> | null = null
/** flag 监听停止句柄 */
let stopFlagsWatch: (() => void) | null = null
/** 保存快照串行队列（连续保存按序落盘，避免并发读改写覆盖） */
let snapshotTask: Promise<void> = Promise.resolve()

/** 当前文件路径变化（主进程 USER_SELECT_FILE）：维护 activeFilePath */
function handleUserSelectFile(_event: unknown, filePath: string): void {
    const nextPath = typeof filePath === 'string' ? filePath : ''
    if (nextPath === documentHistoryState.activeFilePath) {
        return
    }
    documentHistoryState.activeFilePath = nextPath
    // 切换文件后清空上一文件的列表与内容，避免对话框展示错文件的版本
    documentHistoryState.versions = []
    documentHistoryState.currentContent = ''
    documentHistoryState.currentContentSource = 'empty'
    if (documentHistoryState.dialogVisible) {
        void loadActiveDocumentHistory()
    }
}

/** 保存成功：异步读取当前内容并写入历史快照（串行，失败静默降级） */
function handleFileSavedSuccess(): void {
    if (!trackingEnabled || !flags.documentHistory) {
        return
    }
    const filePath = documentHistoryState.activeFilePath
    if (!filePath) {
        logger.debug('[文档历史] 保存成功但无活动文件路径，跳过快照')
        return
    }
    snapshotTask = snapshotTask
        .then(() => persistSavedSnapshot(filePath))
        .catch((error: unknown) => {
            logger.warn('[文档历史] 保存快照失败（已静默降级）', error)
        })
}

/**
 * 写入一次保存快照。
 *
 * 内容来源说明：`FILE_SAVED_SUCCESS` 是无载荷广播，渲染层拿不到「刚写盘」的文本；
 * 这里优先取 Monaco 实时内容（即用户视角的当前版本文本，且不受文件编码影响），
 * 编辑器不可用时才经 READ_HTML 兜底读盘。两种来源失败都只记日志、不阻断保存链路。
 */
async function persistSavedSnapshot(filePath: string): Promise<void> {
    if (!flags.documentHistory) {
        return
    }
    const storage = resolveHistoryStorage()
    if (storage === null) {
        logger.warn('[文档历史] localStorage 不可用，跳过快照')
        return
    }
    const snapshot = await readActiveMarkdownContent()
    // 读取期间用户可能在设置里关闭开关：再次确认，保证「flag 关闭后不再写 localStorage」
    if (!flags.documentHistory) {
        return
    }
    if (snapshot.source === 'empty') {
        return
    }
    const result = appendDocumentHistoryVersion(storage, filePath, snapshot.content)
    if (result.status === 'added') {
        documentHistoryState.usage = getDocumentHistoryUsage(storage)
        if (documentHistoryState.dialogVisible) {
            documentHistoryState.versions = listDocumentHistoryVersions(storage, filePath)
        }
        return
    }
    if (result.status === 'duplicate') {
        return
    }
    if (result.status === 'skipped-too-large' || result.status === 'write-failed') {
        logger.warn(`[文档历史] 快照未写入（${result.status}）`, filePath)
    }
}

/** 注册保存/路径 IPC 监听（仅在 flag 开启时调用；必须成对注销） */
function registerIpcListeners(): void {
    if (listenersRegistered) {
        return
    }
    if (typeof window === 'undefined' || typeof window.electron?.ipcRenderer === 'undefined') {
        return
    }
    window.electron.ipcRenderer.on(IPC.EVENTS.FILE_SAVED_SUCCESS, handleFileSavedSuccess)
    window.electron.ipcRenderer.on(IPC.FILE.USER_SELECT_FILE, handleUserSelectFile)
    listenersRegistered = true
}

/** 注销 IPC 监听（幂等） */
export function unregisterDocumentHistoryIpcListeners(): void {
    if (!listenersRegistered) {
        return
    }
    if (typeof window !== 'undefined' && typeof window.electron?.ipcRenderer !== 'undefined') {
        window.electron.ipcRenderer.removeListener(
            IPC.EVENTS.FILE_SAVED_SUCCESS,
            handleFileSavedSuccess
        )
        window.electron.ipcRenderer.removeListener(IPC.FILE.USER_SELECT_FILE, handleUserSelectFile)
    }
    listenersRegistered = false
}

/** 开始记录（幂等）：flag 开启时注册 IPC 监听 */
function startTracking(): void {
    if (trackingEnabled) {
        return
    }
    trackingEnabled = true
    registerIpcListeners()
}

/** 停止记录（幂等）：flag 关闭时注销 IPC 监听、关闭对话框并清空内存态 */
function stopTracking(): void {
    trackingEnabled = false
    unregisterDocumentHistoryIpcListeners()
    snapshotTask = Promise.resolve()
    documentHistoryState.dialogVisible = false
    // 关闭期间收不到 USER_SELECT_FILE，保留旧路径会在重新开启后把内容误记到旧文件，
    // 因此清空路径；重新开启后由下一次打开/保存事件重新填充。
    documentHistoryState.activeFilePath = ''
    documentHistoryState.versions = []
    documentHistoryState.currentContent = ''
    documentHistoryState.currentContentSource = 'empty'
    documentHistoryState.status = 'idle'
    documentHistoryState.errorKey = ''
}

/**
 * 初始化文档历史能力（幂等）：
 * 1. 等待能力开关从系统配置加载完成；
 * 2. 注册 flag 监听（关闭 → 注销 IPC 监听；开启 → 注册监听）；
 * 不可用/失败只记日志，不抛出（功能降级为不可用，不影响应用）。
 */
export function ensureDocumentHistoryFeature(): Promise<void> {
    if (initTask !== null) {
        return initTask
    }
    initTask = (async () => {
        await initFeatureFlags()
        if (stopFlagsWatch === null) {
            stopFlagsWatch = watch(
                () => flags.documentHistory,
                (enabled) => {
                    if (enabled) {
                        startTracking()
                    } else {
                        stopTracking()
                    }
                },
                { immediate: true }
            )
        }
    })().catch((error: unknown) => {
        logger.warn('[文档历史] 初始化失败（功能不可用，已静默降级）', error)
        initTask = null
    })
    return initTask
}

/** 便于主控在应用启动时主动初始化（不调用也行：首次 openFileHistory 会惰性初始化） */
export function initDocumentHistoryFeature(): Promise<void> {
    return ensureDocumentHistoryFeature()
}

/** 释放文档历史监听与状态（应用卸载/测试清理用；释放后可再次初始化） */
export function disposeDocumentHistoryFeature(): void {
    stopTracking()
    if (stopFlagsWatch !== null) {
        stopFlagsWatch()
        stopFlagsWatch = null
    }
    initTask = null
    activeContentProvider = null
    documentHistoryState.activeFilePath = ''
    documentHistoryState.versions = []
    documentHistoryState.currentContent = ''
    documentHistoryState.currentContentSource = 'empty'
    documentHistoryState.status = 'idle'
    documentHistoryState.errorKey = ''
    documentHistoryState.usage = { totalBytes: 0, fileCount: 0, versionCount: 0 }
}

/* ==================== 历史对话框数据与操作 ==================== */

/** 加载当前文件的历史版本 + 当前编辑器内容（对话框打开/刷新时调用） */
export async function loadActiveDocumentHistory(): Promise<void> {
    if (!flags.documentHistory) {
        return
    }
    documentHistoryState.status = 'loading'
    documentHistoryState.errorKey = ''
    const storage = resolveHistoryStorage()
    try {
        const filePath = documentHistoryState.activeFilePath
        if (!filePath) {
            documentHistoryState.versions = []
            documentHistoryState.currentContent = ''
            documentHistoryState.currentContentSource = 'empty'
            documentHistoryState.usage = getDocumentHistoryUsage(storage)
            documentHistoryState.errorKey = 'editorUi.fileHistory.noActiveFile'
            documentHistoryState.status = 'ready'
            return
        }
        documentHistoryState.versions = listDocumentHistoryVersions(storage, filePath)
        documentHistoryState.usage = getDocumentHistoryUsage(storage)
        const snapshot = await readActiveMarkdownContent()
        documentHistoryState.currentContent = snapshot.content
        documentHistoryState.currentContentSource = snapshot.source
        documentHistoryState.status = 'ready'
    } catch (error) {
        documentHistoryState.status = 'error'
        documentHistoryState.errorKey = 'editorUi.fileHistory.loadFailed'
        logger.warn('[文档历史] 加载历史版本失败', error)
    }
}

/** 打开历史对话框（返回 false = 功能未开启，调用方无需处理） */
export async function openFileHistoryDialog(): Promise<boolean> {
    await ensureDocumentHistoryFeature()
    if (!flags.documentHistory) {
        logger.warn('[文档历史] 能力开关未开启，忽略打开请求')
        return false
    }
    documentHistoryState.dialogVisible = true
    await loadActiveDocumentHistory()
    return true
}

/** 关闭历史对话框（只改显隐，不影响监听/快照） */
export function closeFileHistoryDialog(): void {
    documentHistoryState.dialogVisible = false
}

/**
 * 恢复指定历史版本到编辑器（经既有 EventBus MONACO_REPLACE_TEXT，不改主进程状态）。
 * 调用方（对话框）负责二次确认，避免覆盖未保存修改。
 */
export function restoreHistoryVersion(versionId: string): boolean {
    if (!flags.documentHistory) {
        return false
    }
    const version = documentHistoryState.versions.find((item) => item.id === versionId)
    if (version === undefined) {
        return false
    }
    replaceActiveMarkdownContent(version.content)
    logger.info(
        '[文档历史] 已通过 MONACO_REPLACE_TEXT 恢复历史版本到编辑器',
        documentHistoryState.activeFilePath,
        version.id
    )
    return true
}

/** 删除当前文件的指定历史版本，成功后刷新列表 */
export async function deleteActiveHistoryVersion(versionId: string): Promise<boolean> {
    if (!flags.documentHistory) {
        return false
    }
    const filePath = documentHistoryState.activeFilePath
    if (!filePath) {
        return false
    }
    const removed = deleteDocumentHistoryVersion(resolveHistoryStorage(), filePath, versionId)
    if (removed) {
        await loadActiveDocumentHistory()
    }
    return removed
}

/** 清空当前文件的全部历史，成功后刷新列表 */
export async function clearActiveFileHistory(): Promise<boolean> {
    if (!flags.documentHistory) {
        return false
    }
    const filePath = documentHistoryState.activeFilePath
    if (!filePath) {
        return false
    }
    const cleared = clearDocumentHistoryForFile(resolveHistoryStorage(), filePath)
    if (cleared) {
        await loadActiveDocumentHistory()
    }
    return cleared
}

/** 组合式入口（供组件统一取状态与操作；状态本身是模块单例） */
export function useDocumentHistory(): {
    state: DocumentHistoryState
    loadActiveDocumentHistory: typeof loadActiveDocumentHistory
    openFileHistoryDialog: typeof openFileHistoryDialog
    closeFileHistoryDialog: typeof closeFileHistoryDialog
    restoreHistoryVersion: typeof restoreHistoryVersion
    deleteActiveHistoryVersion: typeof deleteActiveHistoryVersion
    clearActiveFileHistory: typeof clearActiveFileHistory
} {
    void ensureDocumentHistoryFeature()
    return {
        state: documentHistoryState,
        loadActiveDocumentHistory,
        openFileHistoryDialog,
        closeFileHistoryDialog,
        restoreHistoryVersion,
        deleteActiveHistoryVersion,
        clearActiveFileHistory
    }
}
