/**
 * 1.5.1 本地知识库基座：工作区索引 IPC（2026-11-21）
 *
 * 链路：常量（IPC.FILE.GET_WORKSPACE_INDEX）→ 契约（shared/types/ipc.ts）→
 * 生成白名单（build/generate-preload-whitelist.js）→ 本模块 handler → 渲染层调用 → 测试。
 *
 * 安全边界：
 * - 索引根只取 appState.rootPath，渲染层不能指定根路径；
 * - 仅为主窗口可信调用（withSenderCheck）；
 * - force 只允许布尔值；其余载荷返回 INVALID_PAYLOAD；
 * - 索引服务内部失败返回结构化 INDEX_ERROR，不向渲染层抛堆栈。
 *
 * 缓存：
 * - 同一工作区根命中内存快照，避免每次打开标签/反链面板全量重扫；
 * - 根路径变化或 force=true 时重建；并发重建在模块内合并为同一个 Promise。
 */
import type { BrowserWindow } from 'electron'
import { IPC } from '../../shared/ipc-channels'
import type {
    WorkspaceIndexQuery,
    WorkspaceIndexResult,
    WorkspaceIndexSuccess
} from '../../shared/types/ipc'
import type { WorkspaceIndexSnapshot } from '../../shared/types/workspace-index'
import { appState } from '../utils/app-state'
import { withSenderCheck } from '../utils/ipc-security'
import { logger } from '../utils/logger'
import { buildWorkspaceIndex } from '../utils/workspace-index'
import { ipcListenerManager } from './ipc-listener-manager'

let cachedSnapshot: WorkspaceIndexSnapshot | null = null
let cachedRootPath = ''
let cachedAt = 0
let inFlightBuild: Promise<WorkspaceIndexSnapshot> | null = null

/**
 * 索引缓存 TTL：文件保存/重命名/外部变更不会显式通知索引层，
 * 超过 5s 后下次查询自动重建，避免 B1/B5/E10 长期展示过期快照；
 * UI 的显式刷新仍可 force 立即重建。
 */
const INDEX_CACHE_TTL_MS = 5000

/** 清理缓存（工作区切换/测试用；根变化本身也会触发重建） */
export function invalidateWorkspaceIndexCache(): void {
    cachedSnapshot = null
    cachedRootPath = ''
    cachedAt = 0
    inFlightBuild = null
}

/** 命中当前根缓存时返回；否则调用构建服务并缓存 */
async function getOrBuildWorkspaceIndex(
    rootPath: string,
    force: boolean
): Promise<WorkspaceIndexSuccess> {
    if (
        !force &&
        cachedSnapshot !== null &&
        cachedRootPath === rootPath &&
        Date.now() - cachedAt < INDEX_CACHE_TTL_MS
    ) {
        return { ok: true, snapshot: cachedSnapshot, cached: true }
    }
    if (inFlightBuild === null || cachedRootPath !== rootPath) {
        cachedRootPath = rootPath
        inFlightBuild = buildWorkspaceIndex(rootPath).finally(() => {
            inFlightBuild = null
        })
    }
    const snapshot = await inFlightBuild
    cachedSnapshot = snapshot
    cachedRootPath = rootPath
    cachedAt = Date.now()
    return { ok: true, snapshot, cached: false }
}

/** 归一化渲染层载荷：只接受 undefined / 普通对象 / force 布尔 */
function normalizeQuery(raw: unknown): WorkspaceIndexQuery | null {
    if (raw === undefined || raw === null) {
        return {}
    }
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        return null
    }
    const force = (raw as { force?: unknown }).force
    if (force !== undefined && typeof force !== 'boolean') {
        return null
    }
    return { force: force === true }
}

/** 主进程索引查询入口（导出便于单测） */
export async function queryWorkspaceIndex(rawQuery: unknown): Promise<WorkspaceIndexResult> {
    const query = normalizeQuery(rawQuery)
    if (query === null) {
        return { ok: false, code: 'INVALID_PAYLOAD' }
    }
    const rootPath = appState.rootPath
    if (!rootPath) {
        return { ok: false, code: 'NO_WORKSPACE' }
    }
    try {
        return await getOrBuildWorkspaceIndex(rootPath, query.force === true)
    } catch (error) {
        logger.error('[IPC] 工作区索引构建失败：', error)
        return { ok: false, code: 'INDEX_ERROR' }
    }
}

/**
 * 注册工作区索引 IPC。
 *
 * @param _mainWindow 主窗口（sender 校验由 withSenderCheck 完成；本模块不主动推送）
 * @param componentId 监听台账组件 ID
 */
export function registerWorkspaceIndexIpc(_mainWindow: BrowserWindow, componentId: string): void {
    ipcListenerManager.registerHandleOnce(
        IPC.FILE.GET_WORKSPACE_INDEX,
        withSenderCheck(
            IPC.FILE.GET_WORKSPACE_INDEX,
            async (_event: Electron.IpcMainInvokeEvent, query: unknown) =>
                queryWorkspaceIndex(query),
            { kind: 'handle' }
        ),
        componentId
    )
}
