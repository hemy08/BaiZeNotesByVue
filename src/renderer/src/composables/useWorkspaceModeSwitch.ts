/**
 * 工作区模式切换（1.5.7 迁移批次：统一迁移弹窗 + 初始化 + 写配置）。
 *
 * ## 背景
 * 1.5.7 A4 批次的确认对话框只做「初始化 + 写配置」；迁移批次要求把**所有用户决策**
 * （迁移方式 / 迁移范围 / 是否编译 / 编译范围）合并到**单个迁移弹窗**，并让三处入口统一：
 * - 设置页「功能 → 工作区模式」下拉（`FeaturesPanel.vue`）；
 * - 顶部菜单栏模式切换按钮（`MenuBar.vue`）；
 * - 右侧边栏 AI 入口（传统模式下点击，`WorkSpace.vue`）。
 *
 * ## 流程（traditional → llm-wiki）
 * 1. `requestSwitchToLlmWiki()`（异步，三处入口统一调用）：
 *    ① 先经 `LLM_WIKI.GET_STATUS`（`getLlmWikiWorkspaceStatus()`）检测工作区是否已初始化；
 *    ② **已初始化**（曾迁移过 / raw/、wiki/、schema.md 任一存在）→ **不弹迁移弹窗**，
 *       直接执行 `completeSwitchToLlmWiki({ mode: 'none', formats: [] }, { silent: true })`
 *       （初始化幂等 + 写配置 + 展开 AI 面板；silent 抑制初始化自身的模态成功框），
 *       成功后用**轻量 Toast**（非模态、自动消失）引导用户「可随时手动编译」；失败给可见错误；
 *    ③ **未初始化 / 状态检测失败（null/抛错）** → 保守打开迁移弹窗（首次切换的问询流程）；
 * 2. `completeSwitchToLlmWiki(decision, options?)`（弹窗「开始迁移 / 完成初始化」）：
 *    ① 若选择迁移，先调用 `LLM_WIKI.MIGRATE`（复制/移动到 raw/；逐项结果交给弹窗展示）；
 *    ② 调 `initializeLlmWiki({ silent })`（幂等创建 raw/、wiki/、schema.md；silent 缺省 true：
 *       成功结果由弹窗结果页 / 直切 Toast 承载，不再叠加「已初始化」模态成功框）；
 *    ③ 初始化成功才把 `workspaceMode: 'llm-wiki'` 合并写入系统配置；
 *    ④ 确保右侧 AI 面板展开，并通知完成监听方（设置页草稿同步）。
 *    整批前置条件失败（无工作区/参数非法）→ 返回 `switched:false`，保持原模式；
 * 3. `finishWorkspaceModeSwitch()`：结果页「完成 / 关闭」关闭弹窗（不重复初始化/写配置）；
 * 4. 取消 / Esc / 关闭按钮（表单阶段）：不初始化、不写配置，保持原模式。
 *
 * ## 流程（llm-wiki → traditional）
 * `switchToTraditional()`：读当前系统配置 → 合并 `workspaceMode: 'traditional'` → 写回
 * （直接生效；不删除已创建的 raw/ 与 wiki/ 目录，与系统设置口径一致）；成功后给轻量
 * Toast 提示（非模态），失败仍走全局错误对话框。
 *
 * ## 弹窗口径（1.5.7 体验优化「减少弹窗」）
 * - **必要决策弹窗**：仅「首次切换且工作区未初始化」时的迁移弹窗（迁移方式/范围/编译）；
 *   弹窗提交后的成功结果在结果页内联展示，不再叠加「初始化成功」模态框；
 * - **轻量反馈**：工作区已初始化的直切成功、切回传统成功 → Toast（非模态、自动消失）；
 * - **失败反馈**：初始化/写配置/IPC 异常 → 全局错误对话框（必须可见，不降级为 Toast）。
 *
 * ## 边界
 * - 迁移/状态检测复用 `IPC.LLM_WIKI.*`（迁移批次通道）；编译选择经 EventBus
 *   `LLM_WIKI_COMPILE_REQUEST` 交接给 M2 批量编译批次（本模块不执行编译）；
 * - 写配置失败/异常必须给用户可见反馈（CFG-04 禁止静默失败），由 `reportActionFailure` 统一
 *   弹错误对话框；失败时保持原模式；
 * - 状态检测**不阻塞 UI**（异步进行）：检测期间重复点击由模块级 `switchRequestInFlight`
 *   防重；检测失败/结构非法一律保守回退弹窗，不把「未知」当成「已初始化」；
 * - 状态为模块单例（与 `useWorkspaceMode` / `llm-wiki-workbench` 同口径），弹窗组件只读
 *   消费 `visible` / `busy`。
 */
import { reactive } from 'vue'
import type { SystemSetting } from '../../../shared/types'
import type { LlmWikiMigratableFormatId, LlmWikiMigrateResult } from '../../../shared/types/ipc'
import { WORKSPACE_MODE, type WorkspaceMode } from '../../../shared/constants/workspace-mode'
import { initializeLlmWiki } from '../common/llm-wiki-actions'
import {
    getLlmWikiWorkspaceStatus,
    runWorkspaceMigration
} from '../common/llm-wiki-migration-actions'
import { describeActionError, reportActionFailure } from '../common/action-feedback'
import { showToast } from '../common/toast'
import { t } from '../common/i18n'
import { logger } from '../common/logger'
import { ensureLlmWikiAiPanelExpanded } from '../components/llm-wiki/llm-wiki-workbench'

/** 迁移方式（不迁移 / 复制到 raw / 移动到 raw） */
export type LlmWikiMigrationChoice = 'none' | 'copy' | 'move'

/** 弹窗提交的切换决策（用户现场选择，不预置隐藏默认） */
export interface LlmWikiSwitchDecision {
    /** 迁移方式 */
    mode: LlmWikiMigrationChoice
    /** 迁移范围（按格式多选；mode=none 时忽略） */
    formats: LlmWikiMigratableFormatId[]
}

/** 切换流程可选配置（非用户决策项，由调用入口按场景传入） */
export interface LlmWikiSwitchOptions {
    /**
     * 是否抑制初始化成功的模态提示。
     *
     * 缺省 **true**：本编排函数的成功结果始终由调用方 UI 承载——迁移弹窗结果页（迁移完成 +
     * 后续引导）或直切场景的轻量 Toast，因此不再叠加「已初始化 raw/ 与 wiki/」模态框；
     * 传 false 可恢复该模态提示（供未来没有结果 UI 的入口复用）。
     * 失败提示不受影响（必须可见）。
     */
    silent?: boolean
}

/** 切换结果（供弹窗结果视图展示；本 composable 不抛异常） */
export interface LlmWikiSwitchOutcome {
    /** 是否已完成模式切换（初始化成功 + 写配置成功） */
    switched: boolean
    /** 迁移结果（选择迁移时存在；含逐项 moved/copied/skipped/failed 明细） */
    migration?: LlmWikiMigrateResult
    /** 失败原因（可读文案；成功时缺省） */
    error?: string
}

/** 工作区模式切换状态（模块单例；迁移弹窗只读消费） */
export interface WorkspaceModeSwitchState {
    /** 迁移弹窗是否展开 */
    visible: boolean
    /** 迁移/初始化/写配置进行中（禁用按钮与关闭，防重复提交） */
    busy: boolean
}

/** 模块单例状态（组件只读，写入统一走本模块函数） */
export const workspaceModeSwitchState = reactive<WorkspaceModeSwitchState>({
    visible: false,
    busy: false
})

/**
 * 已初始化工作区直切成功的 Toast 展示时长（毫秒）。
 *
 * 提示正文含「可随时手动编译」的操作引导（两行以上），比 Toast 默认 2600ms 需要更长
 * 阅读时间；仍自动消失、不阻塞操作。默认时长真源见 `common/toast.ts`。
 */
const SWITCH_SUCCESS_TOAST_DURATION = 6000

/** 直切成功 Toast 的稳定 id：同一动作重复触发原地更新，避免连点叠出多条相同提示 */
const SWITCH_SUCCESS_TOAST_ID = 'workspace-mode-switch-llm-wiki-success'

/** 切回传统模式 Toast 的稳定 id（同 id 重复提示原地更新） */
const SWITCH_TRADITIONAL_TOAST_ID = 'workspace-mode-switch-traditional-success'

/**
 * 切换请求进行中（状态检测 / 已初始化直切期间防连点）。
 *
 * 与 `workspaceModeSwitchState.busy` 分离：busy 由 `completeSwitchToLlmWiki` 覆盖
 * 「迁移/初始化/写配置」阶段并在进入时做防重；本标记覆盖其之前的异步状态检测窗口，
 * 避免连点触发两次「检测 + 直切」而重复初始化/写配置。
 */
let switchRequestInFlight = false

/** 完成监听器（设置页草稿同步等；迁移弹窗结果出来后通知） */
type SwitchCompletedListener = (outcome: LlmWikiSwitchOutcome) => void
const completedListeners = new Set<SwitchCompletedListener>()

/**
 * 订阅「切换到 LLM Wiki 完成」事件（仅 switched=true 时回调）。
 *
 * @returns 取消订阅函数（组件卸载时调用，避免模块单例长期持有组件闭包）
 */
export function onWorkspaceModeSwitchCompleted(listener: SwitchCompletedListener): () => void {
    completedListeners.add(listener)
    return () => {
        completedListeners.delete(listener)
    }
}

/** 通知完成监听方（监听器异常不影响切换结果，记录日志后继续） */
function notifyCompleted(outcome: LlmWikiSwitchOutcome): void {
    for (const listener of completedListeners) {
        try {
            listener(outcome)
        } catch (error) {
            logger.warn('[WorkspaceModeSwitch] 完成监听器执行异常：', error)
        }
    }
}

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
 * 已初始化工作区「直接切换」成功后的轻量提示（非模态、自动消失）。
 *
 * 1.5.7 体验优化：原实现弹全局成功对话框，用户需点「确定」才能继续操作；改为 Toast 后
 * 切换结果立即可见且不打断操作流。独立成函数便于单测直接断言文案键与展示参数。
 */
function reportAlreadyInitializedSwitchSuccess(): void {
    showToast(t('editorUi.llmWikiPanel.switchAlreadyInitializedMessage'), {
        type: 'success',
        title: t('editorUi.llmWikiPanel.switchAlreadyInitializedTitle'),
        duration: SWITCH_SUCCESS_TOAST_DURATION,
        id: SWITCH_SUCCESS_TOAST_ID
    })
}

/**
 * 请求切换到 LLM Wiki 模式（三处入口统一：设置页下拉 / 菜单栏按钮 / 右侧 AI 入口）。
 *
 * 1. 已有切换进行中（busy / 上一次请求未结束）→ 忽略，防重复提交；
 * 2. 先只读检测工作区是否已初始化 LLM Wiki（`LLM_WIKI.GET_STATUS`，不阻塞 UI）：
 *    - **已初始化**（曾迁移过）→ 不弹迁移弹窗，直接执行正常切换（初始化幂等 + 写配置 +
 *      展开 AI 面板；silent 抑制初始化成功模态框），成功后用轻量 Toast 提示「本工作区已初始化，
 *      可随时手动编译」；失败给可见错误；
 *    - **未初始化 / 状态检测失败（null / 抛错）** → 保守打开迁移弹窗（首次切换的问询流程）。
 *
 * 本函数不抛异常：状态检测失败按「未知」保守回退弹窗；直切失败由 `completeSwitchToLlmWiki`
 * 返回结构化结果并在此处给可见错误提示。
 */
export async function requestSwitchToLlmWiki(): Promise<void> {
    if (workspaceModeSwitchState.busy || switchRequestInFlight) {
        return
    }
    switchRequestInFlight = true
    try {
        const status = await getLlmWikiWorkspaceStatus().catch((error: unknown) => {
            logger.warn(
                '[WorkspaceModeSwitch] 读取工作区 LLM Wiki 状态异常，按未知保守弹窗：',
                error
            )
            return null
        })
        if (status?.initialized === true) {
            // 状态检测窗口内弹窗已开始提交（其它入口）→ 让既有流程继续，避免重复写配置
            if (workspaceModeSwitchState.busy) {
                return
            }
            // 直切：跳过迁移弹窗，且抑制初始化成功的模态提示（随后用 Toast 反馈）
            const outcome = await completeSwitchToLlmWiki(
                { mode: 'none', formats: [] },
                { silent: true }
            )
            if (outcome.switched) {
                reportAlreadyInitializedSwitchSuccess()
            } else {
                reportSwitchFailure(outcome.error ?? t('common.unknown'))
            }
            return
        }
        workspaceModeSwitchState.visible = true
    } finally {
        switchRequestInFlight = false
    }
}

/** 取消切换（表单阶段）：关闭弹窗，不初始化、不写配置（保持原模式） */
export function cancelWorkspaceModeSwitch(): void {
    if (workspaceModeSwitchState.busy) {
        return
    }
    workspaceModeSwitchState.visible = false
}

/** 关闭弹窗（结果页「完成」/ 右上角关闭；不重复执行任何切换动作） */
export function finishWorkspaceModeSwitch(): void {
    if (workspaceModeSwitchState.busy) {
        return
    }
    workspaceModeSwitchState.visible = false
}

/**
 * 完成切换到 LLM Wiki 模式（迁移弹窗「开始迁移 / 完成初始化」按钮）。
 *
 * 顺序说明：迁移是用户显式选择的可选步骤（失败即中止切换并保留原模式，避免「文件已搬走但
 * 模式没切」的半成品状态）；初始化成功是切换模式的前提；写入成功才展开 AI 面板。
 * 无论成功/失败，弹窗保持打开以展示结果（由调用方在结果页关闭）。
 *
 * @param decision 用户在迁移弹窗内的选择（迁移方式 + 范围）
 * @param options.silent 缺省 true：初始化成功不弹模态提示（结果由弹窗结果页 / 直切 Toast
 *        承载）；传 false 可恢复「已初始化」模态成功框
 * @returns 结构化结果；**不抛异常**
 */
export async function completeSwitchToLlmWiki(
    decision: LlmWikiSwitchDecision,
    options: LlmWikiSwitchOptions = {}
): Promise<LlmWikiSwitchOutcome> {
    if (workspaceModeSwitchState.busy) {
        // 防重复提交：迁移/初始化/写配置进行中直接忽略重复确认
        return { switched: false, error: t('editorUi.llmWikiPanel.workspaceModeSwitchBusy') }
    }
    workspaceModeSwitchState.busy = true
    try {
        let migration: LlmWikiMigrateResult | undefined
        if (decision.mode !== 'none') {
            migration = await runWorkspaceMigration({
                mode: decision.mode,
                formats: decision.formats
            })
            if (!migration.ok) {
                // 迁移整批前置条件失败（无工作区/参数非法/raw 不可用）：中止切换，保持原模式
                return {
                    switched: false,
                    migration,
                    error: migration.error ?? t('common.unknown')
                }
            }
        }
        // 成功结果由调用方 UI（迁移弹窗结果页 / 直切 Toast）承载：缺省不叠加初始化模态成功框
        const initialized = await initializeLlmWiki({ silent: options.silent !== false })
        if (!initialized) {
            // 初始化失败提示由 initializeLlmWiki 负责，状态为「未切换」但迁移结果保留供用户查看/回滚
            return {
                switched: false,
                ...(migration ? { migration } : {}),
                error: t('editorUi.llmWikiPanel.workspaceModeSwitchInitFailed')
            }
        }
        const switched = await writeWorkspaceMode(WORKSPACE_MODE.LLM_WIKI)
        if (!switched) {
            return {
                switched: false,
                ...(migration ? { migration } : {}),
                error: t('editorUi.llmWikiPanel.workspaceModeSwitchConfigFailed')
            }
        }
        // 布局经主进程广播切换；同时清掉用户上次的「收起」偏好，保证切换后 AI 面板已展开
        ensureLlmWikiAiPanelExpanded()
        const outcome: LlmWikiSwitchOutcome = {
            switched: true,
            ...(migration ? { migration } : {})
        }
        notifyCompleted(outcome)
        return outcome
    } catch (error) {
        logger.error('[WorkspaceModeSwitch] 切换到 LLM Wiki 异常：', error)
        return {
            switched: false,
            error: describeActionError(error, t('common.unknown'))
        }
    } finally {
        workspaceModeSwitchState.busy = false
    }
}

/**
 * 切换到传统模式（LLM Wiki → traditional；不需要确认，直接写配置生效）。
 *
 * 1.5.7 体验优化：成功后用轻量 Toast（非模态、自动消失）提示「已切换回传统模式」，
 * 失败仍走全局错误对话框（必须可见，不降级为 Toast）。
 *
 * @returns 是否写入成功；失败时保持 LLM Wiki 模式并给出可见错误提示
 */
export async function switchToTraditional(): Promise<boolean> {
    const switched = await writeWorkspaceMode(WORKSPACE_MODE.TRADITIONAL)
    if (switched) {
        showToast(t('editorUi.llmWikiPanel.switchToTraditionalSuccess'), {
            type: 'info',
            id: SWITCH_TRADITIONAL_TOAST_ID
        })
    }
    return switched
}

/** 仅供单元测试：复位模块单例状态（不清空完成监听器，避免影响已挂载组件） */
export function resetWorkspaceModeSwitchForTesting(): void {
    workspaceModeSwitchState.visible = false
    workspaceModeSwitchState.busy = false
    switchRequestInFlight = false
}

/** 仅供单元测试：清空完成监听器（用例间隔离） */
export function clearWorkspaceModeSwitchListenersForTesting(): void {
    completedListeners.clear()
}
