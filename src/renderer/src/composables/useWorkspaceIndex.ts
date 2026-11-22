/**
 * 1.5.1 本地知识库基座：渲染层工作区索引控制器。
 *
 * 主进程负责扫描/缓存；本模块只做：
 * - invoke `FILE.GET_WORKSPACE_INDEX`，对返回结构做防御性归一化；
 * - 暴露标签分组、反链、链接问题等纯查询辅助（基于快照，不读磁盘）；
 * - 打开命中文件复用 `openWorkspaceFileAtLine`（既有打开+跳行链路）。
 */
import { reactive } from 'vue'
import { IPC } from '../../../shared/ipc-channels'
import type { WorkspaceIndexResult } from '../../../shared/types/ipc'
import type {
    WorkspaceIndexBacklink,
    WorkspaceIndexFile,
    WorkspaceIndexSnapshot
} from '../../../shared/types/workspace-index'
import { logger } from '../common/logger'
import { openWorkspaceFileAtLine } from './useWorkspaceSearch'

export type WorkspaceIndexErrorCode = 'no-workspace' | 'error'

export interface WorkspaceIndexState {
    loading: boolean
    /** 首次加载失败原因；成功或有缓存时为 null */
    error: WorkspaceIndexErrorCode | null
    snapshot: WorkspaceIndexSnapshot | null
    /** 是否命中主进程缓存 */
    cached: boolean
}

interface IpcInvokeLike {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

function resolveIpc(): IpcInvokeLike | null {
    try {
        const ipc = typeof window !== 'undefined' ? window.electron?.ipcRenderer : undefined
        return ipc && typeof ipc.invoke === 'function' ? ipc : null
    } catch {
        return null
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 防御性归一化主进程返回值：结构不对按 INDEX_ERROR 处理，不把异常抛给 UI */
export function normalizeWorkspaceIndexResult(raw: unknown): WorkspaceIndexResult {
    if (!isRecord(raw) || typeof raw.ok !== 'boolean') {
        return { ok: false, code: 'INDEX_ERROR' }
    }
    if (raw.ok === true) {
        const snapshot = raw.snapshot
        if (!isRecord(snapshot) || !Array.isArray(snapshot.files)) {
            return { ok: false, code: 'INDEX_ERROR' }
        }
        return {
            ok: true,
            snapshot: snapshot as unknown as WorkspaceIndexSnapshot,
            cached: raw.cached === true
        }
    }
    const code = raw.code
    if (
        code === 'NO_WORKSPACE' ||
        code === 'INVALID_PAYLOAD' ||
        code === 'INDEX_ERROR' ||
        code === 'UNTRUSTED_SENDER'
    ) {
        return {
            ok: false,
            code,
            message: typeof raw.message === 'string' ? raw.message : undefined
        }
    }
    return { ok: false, code: 'INDEX_ERROR' }
}

/** 拉取索引（不经过 UI 状态；供一次性查询/测试复用） */
export async function getWorkspaceIndex(force = false): Promise<WorkspaceIndexResult> {
    const ipc = resolveIpc()
    if (!ipc) {
        return { ok: false, code: 'INDEX_ERROR' }
    }
    try {
        const raw = await ipc.invoke(IPC.FILE.GET_WORKSPACE_INDEX, { force })
        return normalizeWorkspaceIndexResult(raw)
    } catch (error) {
        logger.error('[WorkspaceIndex] 获取工作区索引失败：', error)
        return { ok: false, code: 'INDEX_ERROR' }
    }
}

/** 组件控制器：独立 loading/error，快照由主进程缓存 */
export function useWorkspaceIndex(): {
    state: WorkspaceIndexState
    refresh: (force?: boolean) => Promise<WorkspaceIndexSnapshot | null>
    findBacklinks: (targetPath: string) => WorkspaceIndexBacklink[]
    findFilesByTag: (tag: string) => WorkspaceIndexFile[]
} {
    const state = reactive<WorkspaceIndexState>({
        loading: false,
        error: null,
        snapshot: null,
        cached: false
    })

    async function refresh(force = false): Promise<WorkspaceIndexSnapshot | null> {
        if (state.loading) return state.snapshot
        state.loading = true
        try {
            const result = await getWorkspaceIndex(force)
            if (result.ok) {
                state.snapshot = result.snapshot
                state.cached = result.cached
                state.error = null
                return result.snapshot
            }
            state.error = result.code === 'NO_WORKSPACE' ? 'no-workspace' : 'error'
            return state.snapshot
        } finally {
            state.loading = false
        }
    }

    function findBacklinks(targetPath: string): WorkspaceIndexBacklink[] {
        const snapshot = state.snapshot
        if (!snapshot || !targetPath) return []
        return findWorkspaceBacklinks(snapshot, targetPath)
    }

    function findFilesByTag(tag: string): WorkspaceIndexFile[] {
        const snapshot = state.snapshot
        if (!snapshot || !tag) return []
        return snapshot.files.filter((file) => file.tags.includes(tag))
    }

    return { state, refresh, findBacklinks, findFilesByTag }
}

/** 路径比较键：统一分隔符 + 小写（Windows 路径大小写不敏感） */
export function normalizeIndexPath(filePath: string): string {
    return filePath.replace(/\\/g, '/').toLowerCase()
}

/** 从快照计算反向链接（共享主进程同一 link 数据；不重复解析 Markdown） */
export function findWorkspaceBacklinks(
    snapshot: WorkspaceIndexSnapshot,
    targetPath: string
): WorkspaceIndexBacklink[] {
    const targetKey = normalizeIndexPath(targetPath)
    const target = snapshot.files.find((file) => normalizeIndexPath(file.path) === targetKey)
    if (!target) return []
    const backlinks: WorkspaceIndexBacklink[] = []
    for (const file of snapshot.files) {
        for (const link of file.links) {
            if (link.status !== 'resolved' || !link.resolvedPath) continue
            if (normalizeIndexPath(link.resolvedPath) !== targetKey) continue
            backlinks.push({
                sourcePath: file.path,
                sourceRelativePath: file.relativePath,
                sourceTitle: file.title,
                line: link.line,
                column: link.column
            })
        }
    }
    return backlinks
}

/** 打开索引中的文件；行号 1 基（缺失按第 1 行） */
export async function openIndexedFile(filePath: string, line = 1): Promise<boolean> {
    return openWorkspaceFileAtLine(filePath, Number.isFinite(line) && line > 0 ? line : 1)
}
