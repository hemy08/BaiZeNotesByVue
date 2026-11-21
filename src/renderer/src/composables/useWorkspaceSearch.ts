/**
 * A2 工作区搜索/替换 —— 渲染层控制器（composable，2026-11-21）
 *
 * 职责（只做接线，不做业务判断）：
 * - 调 `FILE.SEARCH_WORKSPACE` / `FILE.REPLACE_WORKSPACE`（快速调用、防御性归一化返回值）；
 * - 维护 UI 需要的响应式状态（加载中/结果/错误码/截断标记）；
 * - Quick Open 文件清单拉取（复用 SEARCH_WORKSPACE 的 listFilesOnly 选项）；
 * - 点击搜索结果打开文件并跳转到行（复用既有 FILE.OPEN_SELECT_FILE + EventBus 跳行事件）。
 *
 * 安全：渲染层不传工作区根路径（主进程只信任 appState.rootPath）；本模块不涉及写盘，
 * 替换动作全部由主进程重新校验路径后执行。
 */
import { reactive } from 'vue'
import { IPC } from '../../../shared/ipc-channels'
import type {
    WorkspaceFileEntry,
    WorkspaceReplaceResult,
    WorkspaceSearchResult
} from '../../../shared/types/ipc'
import { EVENT_BUS } from '../common/event-bus/event-bus-events'
import EventBus from '../common/event-bus/event-bus'
import { logger } from '../common/logger'
import {
    buildReplaceAllOptions,
    buildReplaceOneOptions,
    buildWorkspaceSearchOptions,
    normalizeWorkspaceReplaceResult,
    normalizeWorkspaceSearchResult,
    type WorkspaceSearchCriteria
} from '../components/search/workspace-search-utils'

/** 渲染层受限 ipcRenderer 的最小结构（便于单测注入替身） */
export interface WorkspaceSearchIpcLike {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
    send: (channel: string, ...args: unknown[]) => void
    on: (channel: string, listener: (event: unknown, ...args: unknown[]) => void) => void
    removeListener: (
        channel: string,
        listener: (event: unknown, ...args: unknown[]) => void
    ) => void
}

/** 搜索界面需要的响应式状态 */
export interface WorkspaceSearchState {
    /** 是否有 IPC 请求进行中（搜索/拉文件清单） */
    loading: boolean
    /** 是否有替换请求进行中 */
    replacing: boolean
    /** 最近一次搜索的错误码（null = 无错误） */
    errorCode: WorkspaceSearchResult['code'] | null
    /** 最近一次成功搜索的命中文件列表 */
    files: WorkspaceSearchResult['files']
    /** 命中总数（主进程返回值） */
    matchCount: number
    /** 结果是否被截断 */
    truncated: boolean
    /** 实际扫描文件数 */
    scannedFiles: number
    /** 最近一次搜索的查询文本（用于判定结果是否对应当前输入） */
    lastQuery: string
}

/** 控制器公开 API */
export interface WorkspaceSearchController {
    /** 响应式状态（组件直接绑定） */
    state: WorkspaceSearchState
    /** 搜索工作区（正常/安全失败都 resolve，不抛异常） */
    search: (query: string, criteria: WorkspaceSearchCriteria) => Promise<WorkspaceSearchResult>
    /** 拉取 Quick Open 文件清单（失败返回空数组） */
    listFiles: () => Promise<WorkspaceFileEntry[]>
    /** 单处替换（文件由主进程重新读取/校验） */
    replaceOne: (params: {
        query: string
        criteria: WorkspaceSearchCriteria
        replacement: string
        filePath: string
        line: number
        column: number
    }) => Promise<WorkspaceReplaceResult>
    /** 全部替换（只对给定文件列表；全部操作前的用户确认由 UI 负责） */
    replaceAll: (params: {
        query: string
        criteria: WorkspaceSearchCriteria
        replacement: string
        filePaths: readonly string[]
    }) => Promise<WorkspaceReplaceResult>
}

/** 取 preload 暴露的受限 ipcRenderer；非 Electron 环境返回 null */
export function getWorkspaceSearchIpc(): WorkspaceSearchIpcLike | null {
    if (typeof window === 'undefined') {
        return null
    }
    const electron = (window as unknown as { electron?: { ipcRenderer?: unknown } }).electron
    const ipcRenderer = electron?.ipcRenderer as WorkspaceSearchIpcLike | undefined
    if (
        !ipcRenderer ||
        typeof ipcRenderer.invoke !== 'function' ||
        typeof ipcRenderer.send !== 'function' ||
        typeof ipcRenderer.on !== 'function' ||
        typeof ipcRenderer.removeListener !== 'function'
    ) {
        return null
    }
    return ipcRenderer
}

/**
 * 创建工作区搜索控制器（供组件与单测使用；组件每次挂载创建一份，状态互不影响）。
 *
 * @param deps.ipc 可注入的受限 ipcRenderer 替身（缺省运行时取 window.electron.ipcRenderer）
 */
export function createWorkspaceSearchController(
    deps: {
        ipc?: WorkspaceSearchIpcLike | null
    } = {}
): WorkspaceSearchController {
    const state = reactive<WorkspaceSearchState>({
        loading: false,
        replacing: false,
        errorCode: null,
        files: [],
        matchCount: 0,
        truncated: false,
        scannedFiles: 0,
        lastQuery: ''
    })

    /** 解析本次调用使用的 IPC（注入优先；否则运行时取；不可用返回 null） */
    function resolveIpc(): WorkspaceSearchIpcLike | null {
        if (deps.ipc !== undefined) {
            return deps.ipc
        }
        return getWorkspaceSearchIpc()
    }

    async function search(
        query: string,
        criteria: WorkspaceSearchCriteria
    ): Promise<WorkspaceSearchResult> {
        const ipc = resolveIpc()
        if (!ipc) {
            const fallback = normalizeWorkspaceSearchResult(null)
            state.errorCode = fallback.code ?? 'SEARCH_FAILED'
            state.files = []
            state.matchCount = 0
            state.truncated = false
            return fallback
        }
        state.loading = true
        state.errorCode = null
        state.lastQuery = query
        try {
            const raw = await ipc.invoke(
                IPC.FILE.SEARCH_WORKSPACE,
                buildWorkspaceSearchOptions(query, criteria)
            )
            const result = normalizeWorkspaceSearchResult(raw)
            state.files = result.files
            state.matchCount = result.matchCount
            state.truncated = result.truncated
            state.scannedFiles = result.scannedFiles
            state.errorCode = result.ok ? null : (result.code ?? 'SEARCH_FAILED')
            return result
        } catch (error) {
            logger.error('[WorkspaceSearch] 搜索 IPC 调用失败：', error)
            const fallback = normalizeWorkspaceSearchResult(null)
            state.errorCode = 'SEARCH_FAILED'
            state.files = []
            state.matchCount = 0
            return fallback
        } finally {
            state.loading = false
        }
    }

    async function listFiles(): Promise<WorkspaceFileEntry[]> {
        const ipc = resolveIpc()
        if (!ipc) {
            return []
        }
        state.loading = true
        try {
            const raw = await ipc.invoke(
                IPC.FILE.SEARCH_WORKSPACE,
                buildWorkspaceSearchOptions(
                    '',
                    {
                        caseSensitive: false,
                        wholeWord: false,
                        useRegex: false
                    },
                    { listFilesOnly: true }
                )
            )
            const result = normalizeWorkspaceSearchResult(raw)
            return result.ok && Array.isArray(result.fileList) ? result.fileList : []
        } catch (error) {
            logger.error('[WorkspaceSearch] 拉取工作区文件清单失败：', error)
            return []
        } finally {
            state.loading = false
        }
    }

    async function replaceOne(params: {
        query: string
        criteria: WorkspaceSearchCriteria
        replacement: string
        filePath: string
        line: number
        column: number
    }): Promise<WorkspaceReplaceResult> {
        const ipc = resolveIpc()
        if (!ipc) {
            return normalizeWorkspaceReplaceResult(null)
        }
        state.replacing = true
        try {
            const raw = await ipc.invoke(IPC.FILE.REPLACE_WORKSPACE, buildReplaceOneOptions(params))
            return normalizeWorkspaceReplaceResult(raw)
        } catch (error) {
            logger.error('[WorkspaceSearch] 单处替换 IPC 调用失败：', error)
            return normalizeWorkspaceReplaceResult(null)
        } finally {
            state.replacing = false
        }
    }

    async function replaceAll(params: {
        query: string
        criteria: WorkspaceSearchCriteria
        replacement: string
        filePaths: readonly string[]
    }): Promise<WorkspaceReplaceResult> {
        const ipc = resolveIpc()
        if (!ipc) {
            return normalizeWorkspaceReplaceResult(null)
        }
        state.replacing = true
        try {
            const raw = await ipc.invoke(IPC.FILE.REPLACE_WORKSPACE, buildReplaceAllOptions(params))
            return normalizeWorkspaceReplaceResult(raw)
        } catch (error) {
            logger.error('[WorkspaceSearch] 全部替换 IPC 调用失败：', error)
            return normalizeWorkspaceReplaceResult(null)
        } finally {
            state.replacing = false
        }
    }

    return { state, search, listFiles, replaceOne, replaceAll }
}

/** 组件入口：每次调用创建一个独立控制器（避免跨组件共享加载态） */
export function useWorkspaceSearch(): WorkspaceSearchController {
    return createWorkspaceSearchController()
}

/** 打开文件并等待主进程确认活动文件切换的超时（毫秒） */
export const OPEN_WORKSPACE_FILE_TIMEOUT_MS = 4000
/** 文件内容载入编辑器后再跳行的延迟（毫秒）：等待 Monaco 应用新内容/模型 */
export const OPEN_WORKSPACE_FILE_JUMP_DELAY_MS = 80

/** 路径比较键：统一分隔符 + 小写（主进程返回路径与请求路径同源，忽略大小写差异） */
function normalizeComparablePath(filePath: string): string {
    return filePath.replace(/\\/g, '/').toLowerCase()
}

/** 取文件名（路径最后一段） */
function getFileName(filePath: string): string {
    const normalized = filePath.replace(/\\/g, '/')
    const index = normalized.lastIndexOf('/')
    return index >= 0 ? normalized.slice(index + 1) : normalized
}

/** 跳行事件默认发射器（复用编辑器既有 EventBus 契约，不改菜单/事件定义） */
function emitEditorJumpLine(line: number): void {
    EventBus.$emit(EVENT_BUS.EDITOR_JUMP_LINE, { line })
}

/**
 * 打开工作区文件并跳转到指定行。
 *
 * 链路：`FILE.OPEN_SELECT_FILE`（渲染层既有打开通道）→ 等主进程回发 `FILE.USER_SELECT_FILE`
 * 确认活动文件已切换 → 延迟一帧后经 EventBus `EDITOR_JUMP_LINE` 让 Monaco 跳行。
 * 超时/异常返回 false（调用方决定是否提示），不抛异常。
 *
 * @param filePath 文件绝对路径（来自搜索结果/文件清单，主进程会在打开时再做路径守卫）
 * @param line 目标行号（1-based；非法值按第 1 行处理）
 * @param options 单测注入点（ipc / 跳行发射器 / 超时与延迟）
 */
export async function openWorkspaceFileAtLine(
    filePath: string,
    line: number,
    options: {
        ipc?: WorkspaceSearchIpcLike | null
        emitJump?: (line: number) => void
        timeoutMs?: number
        jumpDelayMs?: number
    } = {}
): Promise<boolean> {
    if (typeof filePath !== 'string' || filePath.trim().length === 0) {
        return false
    }
    const ipc = options.ipc !== undefined ? options.ipc : getWorkspaceSearchIpc()
    if (!ipc) {
        logger.warn('[WorkspaceSearch] preload IPC 不可用，无法打开搜索结果文件')
        return false
    }
    const targetLine = Number.isFinite(line) && line >= 1 ? Math.trunc(line) : 1
    const timeoutMs = options.timeoutMs ?? OPEN_WORKSPACE_FILE_TIMEOUT_MS
    const jumpDelayMs = options.jumpDelayMs ?? OPEN_WORKSPACE_FILE_JUMP_DELAY_MS
    const emitJump = options.emitJump ?? emitEditorJumpLine
    const targetKey = normalizeComparablePath(filePath)

    return new Promise<boolean>((resolve) => {
        let settled = false
        let jumpTimer: ReturnType<typeof setTimeout> | null = null
        let timeoutTimer: ReturnType<typeof setTimeout> | null = null

        const cleanup = (): void => {
            if (jumpTimer !== null) {
                clearTimeout(jumpTimer)
                jumpTimer = null
            }
            if (timeoutTimer !== null) {
                clearTimeout(timeoutTimer)
                timeoutTimer = null
            }
            try {
                ipc.removeListener(IPC.FILE.USER_SELECT_FILE, listener)
            } catch {
                // 窗口销毁时 IPC 不可用，忽略
            }
        }

        const finish = (opened: boolean): void => {
            if (settled) {
                return
            }
            settled = true
            cleanup()
            resolve(opened)
        }

        const listener = (_event: unknown, selectedPath: unknown): void => {
            if (typeof selectedPath !== 'string' || selectedPath.length === 0) {
                return
            }
            if (normalizeComparablePath(selectedPath) !== targetKey) {
                return
            }
            // 已确认活动文件切换：等编辑器应用新内容后再跳行
            jumpTimer = setTimeout(() => {
                jumpTimer = null
                try {
                    emitJump(targetLine)
                } catch (error) {
                    logger.error('[WorkspaceSearch] 跳转到行失败：', error)
                }
                finish(true)
            }, jumpDelayMs)
        }

        try {
            ipc.on(IPC.FILE.USER_SELECT_FILE, listener)
            ipc.send(IPC.FILE.OPEN_SELECT_FILE, {
                name: getFileName(filePath),
                path: filePath,
                type: 'file',
                content: ''
            })
        } catch (error) {
            logger.error('[WorkspaceSearch] 打开搜索结果文件失败：', error)
            finish(false)
            return
        }

        timeoutTimer = setTimeout(() => {
            timeoutTimer = null
            logger.warn('[WorkspaceSearch] 打开文件等待活动文件确认超时：', filePath)
            finish(false)
        }, timeoutMs)
    })
}
