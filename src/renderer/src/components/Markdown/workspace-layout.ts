/**
 * E11：工作区布局 / 多配置（纯数据 + localStorage 持久化）
 *
 * 目标：把「视图模式 + 资源管理器显隐/宽度」保存为命名布局 profile，
 * 用户可在写作 / 研究 / 项目等布局间一键切换。布局只影响 UI，不修改任何笔记内容。
 *
 * 边界：
 * - 渲染层模块，不依赖主进程/Node；不新增 IPC；
 * - localStorage 损坏/超限时回退为空列表，不抛错；
 * - 应用布局通过 window CustomEvent 广播，由 WorkSpace / MarkdownEditComponent 各自响应。
 */
import { reactive } from 'vue'

export type WorkspaceLayoutViewMode = 'edit' | 'preview' | 'edit-preview'

export interface WorkspaceLayoutSnapshot {
    viewMode: WorkspaceLayoutViewMode
    resourceManagerVisible: boolean
    /** 资源管理器宽度（px），限制在 180~800，避免布局不可用 */
    resourceManagerWidth: number
}

export interface WorkspaceLayoutProfile extends WorkspaceLayoutSnapshot {
    id: string
    /** 内置布局使用 labelKey；自定义布局使用 name */
    name?: string
    labelKey?: string
    builtin?: boolean
    updatedAt: number
}

export const WORKSPACE_LAYOUT_APPLY_EVENT = 'baize:workspace-layout:apply'
export const WORKSPACE_LAYOUT_STORAGE_KEY = 'baize-workspace-layout-profiles-v1'
export const WORKSPACE_LAYOUT_MIN_WIDTH = 180
export const WORKSPACE_LAYOUT_MAX_WIDTH = 800
export const WORKSPACE_LAYOUT_MAX_CUSTOM = 20

export const BUILTIN_WORKSPACE_LAYOUTS: readonly WorkspaceLayoutProfile[] = [
    {
        id: 'builtin-writing',
        labelKey: 'dialogRenderer.workspaceLayout.profiles.writing',
        builtin: true,
        viewMode: 'edit-preview',
        resourceManagerVisible: false,
        resourceManagerWidth: 280,
        updatedAt: 0
    },
    {
        id: 'builtin-research',
        labelKey: 'dialogRenderer.workspaceLayout.profiles.research',
        builtin: true,
        viewMode: 'edit-preview',
        resourceManagerVisible: true,
        resourceManagerWidth: 320,
        updatedAt: 0
    },
    {
        id: 'builtin-project',
        labelKey: 'dialogRenderer.workspaceLayout.profiles.project',
        builtin: true,
        viewMode: 'edit-preview',
        resourceManagerVisible: true,
        resourceManagerWidth: 380,
        updatedAt: 0
    }
]

/** 当前 UI 布局（由 WorkSpace / MarkdownEditComponent 持续回写，供“保存当前布局”读取） */
export const currentWorkspaceLayout = reactive<WorkspaceLayoutSnapshot>({
    viewMode: 'edit-preview',
    resourceManagerVisible: true,
    resourceManagerWidth: 300
})

export function normalizeWorkspaceLayoutWidth(value: unknown): number {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) {
        return 300
    }
    return Math.min(
        WORKSPACE_LAYOUT_MAX_WIDTH,
        Math.max(WORKSPACE_LAYOUT_MIN_WIDTH, Math.round(numeric))
    )
}

export function isWorkspaceLayoutViewMode(value: unknown): value is WorkspaceLayoutViewMode {
    return value === 'edit' || value === 'preview' || value === 'edit-preview'
}

export function updateCurrentWorkspaceViewMode(viewMode: WorkspaceLayoutViewMode): void {
    currentWorkspaceLayout.viewMode = viewMode
}

export function updateCurrentWorkspaceResourceState(visible: boolean, width: number): void {
    currentWorkspaceLayout.resourceManagerVisible = visible === true
    currentWorkspaceLayout.resourceManagerWidth = normalizeWorkspaceLayoutWidth(width)
}

export function snapshotCurrentWorkspaceLayout(): WorkspaceLayoutSnapshot {
    return {
        viewMode: currentWorkspaceLayout.viewMode,
        resourceManagerVisible: currentWorkspaceLayout.resourceManagerVisible,
        resourceManagerWidth: normalizeWorkspaceLayoutWidth(
            currentWorkspaceLayout.resourceManagerWidth
        )
    }
}

function toStorage(): Storage | null {
    if (typeof window === 'undefined') {
        return null
    }
    try {
        return window.localStorage
    } catch {
        return null
    }
}

function isValidProfile(value: unknown): value is WorkspaceLayoutProfile {
    if (!value || typeof value !== 'object') {
        return false
    }
    const candidate = value as Record<string, unknown>
    return (
        typeof candidate.id === 'string' &&
        candidate.id.length > 0 &&
        candidate.id.length <= 80 &&
        isWorkspaceLayoutViewMode(candidate.viewMode) &&
        typeof candidate.resourceManagerVisible === 'boolean' &&
        typeof candidate.resourceManagerWidth === 'number' &&
        Number.isFinite(candidate.resourceManagerWidth) &&
        (typeof candidate.name === 'string' || typeof candidate.labelKey === 'string')
    )
}

/** 读取自定义布局（损坏/非数组→[]；内置布局不落盘） */
export function loadCustomWorkspaceLayouts(): WorkspaceLayoutProfile[] {
    const storage = toStorage()
    if (!storage) {
        return []
    }
    try {
        const raw = storage.getItem(WORKSPACE_LAYOUT_STORAGE_KEY)
        if (!raw) {
            return []
        }
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) {
            return []
        }
        return parsed
            .filter(isValidProfile)
            .filter((item) => item.builtin !== true)
            .slice(0, WORKSPACE_LAYOUT_MAX_CUSTOM)
            .map((item) => ({
                ...item,
                resourceManagerWidth: normalizeWorkspaceLayoutWidth(item.resourceManagerWidth),
                updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : Date.now()
            }))
    } catch {
        return []
    }
}

function saveCustomWorkspaceLayouts(profiles: WorkspaceLayoutProfile[]): boolean {
    const storage = toStorage()
    if (!storage) {
        return false
    }
    try {
        storage.setItem(
            WORKSPACE_LAYOUT_STORAGE_KEY,
            JSON.stringify(profiles.slice(0, WORKSPACE_LAYOUT_MAX_CUSTOM))
        )
        return true
    } catch {
        return false
    }
}

/** 全部布局：内置在前，自定义按更新时间倒序 */
export function getAllWorkspaceLayouts(): WorkspaceLayoutProfile[] {
    return [
        ...BUILTIN_WORKSPACE_LAYOUTS,
        ...loadCustomWorkspaceLayouts().sort((a, b) => b.updatedAt - a.updatedAt)
    ]
}

/**
 * 保存当前布局为命名 profile。
 * 同名自定义布局覆盖更新；超过上限时返回 null。
 */
export function saveCurrentWorkspaceLayout(name: string): WorkspaceLayoutProfile | null {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length > 40) {
        return null
    }
    const custom = loadCustomWorkspaceLayouts()
    const snapshot = snapshotCurrentWorkspaceLayout()
    const existing = custom.find((item) => item.name === trimmed)
    if (!existing && custom.length >= WORKSPACE_LAYOUT_MAX_CUSTOM) {
        return null
    }
    const profile: WorkspaceLayoutProfile = {
        id: existing?.id ?? `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: trimmed,
        ...snapshot,
        updatedAt: Date.now()
    }
    const next = existing
        ? custom.map((item) => (item.id === existing.id ? profile : item))
        : [...custom, profile]
    return saveCustomWorkspaceLayouts(next) ? profile : null
}

/** 删除自定义布局；内置布局不可删除 */
export function deleteCustomWorkspaceLayout(id: string): boolean {
    const custom = loadCustomWorkspaceLayouts()
    const next = custom.filter((item) => item.id !== id)
    if (next.length === custom.length) {
        return false
    }
    return saveCustomWorkspaceLayouts(next)
}

/** 应用布局：通过 CustomEvent 通知 WorkSpace / 编辑器，不直接触碰它们的内部状态 */
export function applyWorkspaceLayout(profile: WorkspaceLayoutProfile): void {
    if (typeof window === 'undefined') {
        return
    }
    const normalized: WorkspaceLayoutProfile = {
        ...profile,
        resourceManagerWidth: normalizeWorkspaceLayoutWidth(profile.resourceManagerWidth)
    }
    currentWorkspaceLayout.viewMode = normalized.viewMode
    currentWorkspaceLayout.resourceManagerVisible = normalized.resourceManagerVisible
    currentWorkspaceLayout.resourceManagerWidth = normalized.resourceManagerWidth
    try {
        window.dispatchEvent(
            new CustomEvent<WorkspaceLayoutProfile>(WORKSPACE_LAYOUT_APPLY_EVENT, {
                detail: normalized
            })
        )
    } catch {
        // 极端环境（无 CustomEvent）下静默降级；状态已更新，不抛错
    }
}
