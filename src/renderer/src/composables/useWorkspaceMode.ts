/**
 * 工作区模式（workspaceMode）渲染层运行时读取。
 *
 * ## 职责边界（1.5.7 LLM Wiki L5）
 * - 数据真源仍是系统设置 `SystemSetting.workspaceMode`（主进程 `system-setting` 存储），
 *   合法取值归一化只经 `shared/constants/workspace-mode` 的 `normalizeWorkspaceMode`
 *   （GEN-03 单一真源，本模块不另写枚举数组）；
 * - 本模块只做「读取 + 订阅广播 + 响应式暴露」三件事，**不写配置、不新增 IPC**：
 *   设置页写入后主进程广播 `SYSTEM_SETTING_UPDATE`，本模块即时更新，无需重启；
 * - 布局消费方：`components/WorkSpaceArea/WorkSpace.vue`（工作台布局）与
 *   `components/Markdown/MarkdownEditComponent.vue`（编辑区单栏切换）。
 *
 * ## 生命周期与测试隔离
 * - 首次调用 `useWorkspaceMode()` / `initWorkspaceMode()` 时惰性读取一次配置；
 * - 广播监听为应用级单例（与 `useFeatureFlags` 同口径）：仅在存在真实配置 API
 *   （`window.api.config.read`）时注册，避免测试桩环境多出与组件挂载无关的订阅；
 * - 读取失败保持默认 `traditional`，不阻塞界面（用户可见错误由系统设置对话框负责）。
 */
import { computed, reactive } from 'vue'
import type { ComputedRef } from 'vue'
import { IPC } from '../../../shared/ipc-channels'
import type { SystemSetting } from '../../../shared/types'
import {
    DEFAULT_WORKSPACE_MODE,
    normalizeWorkspaceMode,
    WORKSPACE_MODE,
    type WorkspaceMode
} from '../../../shared/constants/workspace-mode'

/** 运行时工作区模式（模块单例；组件只读消费） */
interface WorkspaceModeState {
    workspaceMode: WorkspaceMode
}

const state = reactive<WorkspaceModeState>({
    workspaceMode: DEFAULT_WORKSPACE_MODE
})

let initialized = false
let initPromise: Promise<void> | null = null
let listenerRegistered = false

/** 是否为真实 Electron 渲染环境（具备配置读取 API；测试桩环境返回 false） */
function canReadSystemConfig(): boolean {
    if (typeof window === 'undefined') {
        return false
    }
    try {
        return typeof window.api?.config?.read === 'function'
    } catch {
        return false
    }
}

/**
 * 应用系统设置中的工作区模式。
 * 广播载荷缺字段（undefined）时保持当前值；非法值经 normalize 回落 traditional。
 */
function applyWorkspaceModeSetting(setting: Partial<SystemSetting> | null | undefined): void {
    if (!setting || typeof setting !== 'object') {
        return
    }
    const raw = (setting as { workspaceMode?: unknown }).workspaceMode
    if (raw === undefined) {
        return
    }
    state.workspaceMode = normalizeWorkspaceMode(raw)
}

/** 主进程系统设置广播（全量设置对象，含 workspaceMode） */
function handleSystemSettingUpdate(_event: unknown, setting?: Partial<SystemSetting>): void {
    applyWorkspaceModeSetting(setting)
}

/** 注册系统设置广播监听（仅在存在真实配置 API 时注册；幂等） */
function registerBroadcastListener(): void {
    if (listenerRegistered || !canReadSystemConfig()) {
        return
    }
    if (typeof window === 'undefined' || typeof window.electron?.ipcRenderer?.on !== 'function') {
        return
    }
    window.electron.ipcRenderer.on(IPC.SETTING.SYSTEM_SETTING_UPDATE, handleSystemSettingUpdate)
    listenerRegistered = true
}

/** 从 config:read('system') 刷新工作区模式；读取失败保持当前值 */
export async function refreshWorkspaceMode(): Promise<void> {
    if (!canReadSystemConfig()) {
        return
    }
    try {
        const system = await window.api.config.read<Partial<SystemSetting>>('system')
        applyWorkspaceModeSetting(system)
    } catch {
        // 配置读取失败保持默认/当前值：布局继续可用，不做用户可见报错（由设置页负责提示）
    }
}

/** 初始化（幂等）：读取配置 + 注册一次广播监听 */
export function initWorkspaceMode(): Promise<void> {
    if (initialized) {
        return initPromise ?? Promise.resolve()
    }
    initialized = true
    registerBroadcastListener()
    initPromise = refreshWorkspaceMode()
    return initPromise
}

/** 当前工作区模式（响应式只读视图；全应用共享同一 computed） */
const workspaceMode = computed<WorkspaceMode>(() => state.workspaceMode)

/** 是否处于 LLM Wiki 工作区模式（布局切换的唯一判定口径） */
const isLlmWikiMode = computed<boolean>(() => state.workspaceMode === WORKSPACE_MODE.LLM_WIKI)

/** 组件消费入口：返回响应式工作区模式与 LLM Wiki 判定 */
export function useWorkspaceMode(): {
    workspaceMode: ComputedRef<WorkspaceMode>
    isLlmWikiMode: ComputedRef<boolean>
} {
    void initWorkspaceMode()
    return { workspaceMode, isLlmWikiMode }
}

/**
 * 移除系统设置广播监听（应用卸载/测试清理用）。
 *
 * 单例监听在应用生命周期内长期存在；提供幂等释放入口，避免测试或热重载场景累积监听。
 * 无论当前是否注册成功都把初始化标记复位，保证随后的 `initWorkspaceMode()` 可重新读取配置。
 */
export function disposeWorkspaceModeListener(): void {
    if (
        listenerRegistered &&
        typeof window !== 'undefined' &&
        typeof window.electron?.ipcRenderer?.removeListener === 'function'
    ) {
        window.electron.ipcRenderer.removeListener(
            IPC.SETTING.SYSTEM_SETTING_UPDATE,
            handleSystemSettingUpdate
        )
    }
    listenerRegistered = false
    initialized = false
    initPromise = null
}

/** 仅供单元测试：重置模块单例状态（模式回默认、监听标记复位） */
export function resetWorkspaceModeForTesting(): void {
    listenerRegistered = false
    initialized = false
    initPromise = null
    state.workspaceMode = DEFAULT_WORKSPACE_MODE
}
