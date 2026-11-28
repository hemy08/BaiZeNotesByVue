/**
 * 工作区模式快速切换（1.5.7 体验微调，用户反馈批次 A4）。
 *
 * ## 背景
 * 用户要求工作区模式入口不仅要能在「系统设置 → 功能」里切换，还要能在写笔记时直接触达：
 * - 右侧边栏 AI 入口（`WorkSpace.vue` 的 `#llm-ai-sidebar-entry`）：传统模式下点击
 *   「默认用户要切换到 LLM Wiki 模式」；
 * - 编辑工具条右侧的模式快速切换按钮（`MarkdownEditToolsComponent.vue`）。
 * 两处入口共用本 composable，**与系统设置里的工作区模式切换走同样处理**（同一套确认 +
 * 初始化 + 配置写入链路），避免出现「工具条切了但 raw/ 与 wiki/ 没初始化」的半成品状态。
 *
 * ## 流程（traditional → llm-wiki，与 FeaturesPanel 的确认流程等价）
 * 1. `requestSwitchToLlmWiki()`：打开确认对话框（复用 FeaturesPanel 的确认文案键）；
 * 2. `confirmSwitchToLlmWiki()`：确认后先调 `initializeLlmWiki()`（主进程白名单通道
 *    `IPC.FILE.INITIALIZE_LLM_WIKI`，成功/失败均给用户可见提示）；
 * 3. 初始化成功才把 `workspaceMode: 'llm-wiki'` 合并写入系统配置（`config:write('system')`，
 *    主进程 store-backed 路由 + `SYSTEM_SETTING_UPDATE` 广播 → `useWorkspaceMode` 即时切换布局）；
 * 4. 写入成功后确保右侧 AI 面板处于展开态（清空用户上次的「收起」偏好）；
 * 5. 取消 / Esc / 关闭按钮：不初始化、不写配置，保持原模式。
 *
 * ## 流程（llm-wiki → traditional）
 * `switchToTraditional()`：读当前系统配置 → 合并 `workspaceMode: 'traditional'` → 写回
 * （直接生效；不删除已创建的 raw/ 与 wiki/ 目录，与系统设置口径一致）。
 *
 * ## 边界
 * - **不新增 IPC 通道**：全部复用既有 `config:read` / `config:write`（preload 受限 API）与
 *   `IPC.FILE.INITIALIZE_LLM_WIKI`；
 * - 写配置失败/异常必须给用户可见反馈（CFG-04 禁止静默失败），由 `reportActionFailure` 统一
 *   弹错误对话框；失败时保持原模式（不写半成品配置、不展开面板）；
 * - 状态为模块单例（与 `useWorkspaceMode` / `llm-wiki-workbench` 同口径），对话框组件只读
 *   消费 `visible` / `busy`。
 */
import { reactive } from 'vue'
import type { SystemSetting } from '../../../shared/types'
import { WORKSPACE_MODE, type WorkspaceMode } from '../../../shared/constants/workspace-mode'
import { initializeLlmWiki } from '../common/llm-wiki-actions'
import { describeActionError, reportActionFailure } from '../common/action-feedback'
import { t } from '../common/i18n'
import { ensureLlmWikiAiPanelExpanded } from '../components/llm-wiki/llm-wiki-workbench'

/** 工作区模式切换确认对话框状态（模块单例；对话框组件只读消费） */
export interface WorkspaceModeSwitchState {
    /** 传统 → LLM Wiki 的确认对话框是否展开 */
    visible: boolean
    /** 初始化 / 写配置进行中（禁用确认与取消按钮，防重复提交） */
    busy: boolean
}

/** 模块单例状态（组件只读，写入统一走本模块函数） */
export const workspaceModeSwitchState = reactive<WorkspaceModeSwitchState>({
    visible: false,
    busy: false
})

/** preload 受限配置 API 的最小结构（便于单测注入替身，不新增 IPC 契约） */
interface ConfigApiLike {
    read: <T = unknown>(configName: string) => Promise<T | null>
    write: (configName: string, data: unknown) => Promise<boolean>
}

/** 取 preload 暴露的配置 API；非 Electron 环境（测试桩/旧 preload）返回 null */
function getConfigApi(): ConfigApiLike | null {
    if (typeof window === 'undefined') {
        return null
    }
    try {
        const config = window.api?.config
        if (typeof config?.read !== 'function' || typeof config?.write !== 'function') {
            return null
        }
        return config
    } catch {
        return null
    }
}

/** 统一的切换失败反馈（日志 + 应用内错误对话框；CFG-04） */
function reportSwitchFailure(error: unknown): void {
    reportActionFailure({
        title: t('editorUi.llmWikiPanel.workspaceModeSwitchFailedTitle'),
        message: t('editorUi.llmWikiPanel.workspaceModeSwitchFailedMessage', {
            error: describeActionError(error, t('common.unknown'))
        })
    })
}

/**
 * 把工作区模式写入系统配置（读当前配置 → 合并模式字段 → 写回）。
 *
 * 合并而非整包覆盖：保留语言/主题/功能开关等其它设置；读取失败（返回 null）时按最小
 * 载荷 `{ workspaceMode }` 写入（主进程 `applySystemSettings` 是部分更新语义）。
 *
 * @returns 是否写入成功；**失败时已给出可见错误提示**
 */
async function writeWorkspaceMode(mode: WorkspaceMode): Promise<boolean> {
    const config = getConfigApi()
    if (!config) {
        reportSwitchFailure(new Error(t('editorUi.llmWikiPanel.workspaceModeSwitchUnavailable')))
        return false
    }
    try {
        const current = await config.read<Partial<SystemSetting>>('system')
        const merged: Record<string, unknown> =
            current && typeof current === 'object' ? { ...current } : {}
        merged.workspaceMode = mode
        const saved = await config.write('system', merged)
        if (saved === false) {
            // 主进程 AS-4 校验拒绝 / 磁盘失败：不抛异常但未落盘，必须显式提示
            reportSwitchFailure(new Error(t('workspace.config.writeReturnedFalse')))
            return false
        }
        return true
    } catch (error) {
        reportSwitchFailure(error)
        return false
    }
}

/**
 * 请求切换到 LLM Wiki 模式：打开确认对话框（实际切换在用户确认后执行）。
 * 重复点击（对话框已展开 / 切换进行中）不重复打开。
 */
export function requestSwitchToLlmWiki(): void {
    if (workspaceModeSwitchState.busy) {
        return
    }
    workspaceModeSwitchState.visible = true
}

/** 取消切换：关闭对话框，不初始化、不写配置（保持原模式） */
export function cancelWorkspaceModeSwitch(): void {
    if (workspaceModeSwitchState.busy) {
        return
    }
    workspaceModeSwitchState.visible = false
}

/**
 * 确认切换到 LLM Wiki 模式（对话框「确认初始化」按钮）。
 *
 * 顺序说明（与系统设置页一致）：初始化成功是切换模式的前提，失败说明工作区不可用/未打开，
 * 保持原模式并由 `initializeLlmWiki` 给出可见错误提示；初始化成功后写配置，写入成功才展开
 * AI 面板。无论成功/失败/异常，对话框都会关闭并复位 busy（用户可重试）。
 *
 * @returns 是否完成切换
 */
export async function confirmSwitchToLlmWiki(): Promise<boolean> {
    if (workspaceModeSwitchState.busy) {
        // 防重复提交：初始化/写配置进行中直接忽略重复确认
        return false
    }
    workspaceModeSwitchState.busy = true
    try {
        const initialized = await initializeLlmWiki()
        if (!initialized) {
            return false
        }
        const switched = await writeWorkspaceMode(WORKSPACE_MODE.LLM_WIKI)
        if (!switched) {
            return false
        }
        // 布局经主进程广播切换；同时清掉用户上次的「收起」偏好，保证切换后 AI 面板已展开
        ensureLlmWikiAiPanelExpanded()
        return true
    } finally {
        workspaceModeSwitchState.busy = false
        workspaceModeSwitchState.visible = false
    }
}

/**
 * 切换到传统模式（LLM Wiki → traditional；不需要确认，直接写配置生效）。
 *
 * @returns 是否写入成功；失败时保持 LLM Wiki 模式并给出可见错误提示
 */
export async function switchToTraditional(): Promise<boolean> {
    return writeWorkspaceMode(WORKSPACE_MODE.TRADITIONAL)
}

/** 仅供单元测试：复位模块单例状态 */
export function resetWorkspaceModeSwitchForTesting(): void {
    workspaceModeSwitchState.visible = false
    workspaceModeSwitchState.busy = false
}
