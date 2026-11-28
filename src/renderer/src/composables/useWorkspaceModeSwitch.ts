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
 * ## 流程（traditional → llm-wiki，由迁移弹窗驱动）
 * 1. `requestSwitchToLlmWiki()`：打开迁移弹窗（状态为模块单例，宿主 `WorkSpace.vue` 挂载）；
 * 2. `completeSwitchToLlmWiki(decision)`（弹窗「开始迁移 / 完成初始化」）：
 *    ① 若选择迁移，先调用 `LLM_WIKI.MIGRATE`（复制/移动到 raw/；逐项结果交给弹窗展示）；
 *    ② 调 `initializeLlmWiki()`（幂等创建 raw/、wiki/、schema.md）；
 *    ③ 初始化成功才把 `workspaceMode: 'llm-wiki'` 合并写入系统配置；
 *    ④ 确保右侧 AI 面板展开，并通知完成监听方（设置页草稿同步）。
 *    整批前置条件失败（无工作区/参数非法）→ 返回 `switched:false`，保持原模式；
 * 3. `finishWorkspaceModeSwitch()`：结果页「完成 / 关闭」关闭弹窗（不重复初始化/写配置）；
 * 4. 取消 / Esc / 关闭按钮（表单阶段）：不初始化、不写配置，保持原模式。
 *
 * ## 流程（llm-wiki → traditional）
 * `switchToTraditional()`：读当前系统配置 → 合并 `workspaceMode: 'traditional'` → 写回
 * （直接生效；不删除已创建的 raw/ 与 wiki/ 目录，与系统设置口径一致）。
 *
 * ## 边界
 * - **不新增 IPC**：迁移复用 `IPC.LLM_WIKI.*`（3 个迁移批次通道），编译选择经 EventBus
 *   `LLM_WIKI_COMPILE_REQUEST` 交接给 M2 批量编译批次（本模块不执行编译）；
 * - 写配置失败/异常必须给用户可见反馈（CFG-04 禁止静默失败），由 `reportActionFailure` 统一
 *   弹错误对话框；失败时保持原模式；
 * - 状态为模块单例（与 `useWorkspaceMode` / `llm-wiki-workbench` 同口径），弹窗组件只读
 *   消费 `visible` / `busy`。
 */
import { reactive } from 'vue'
import type { SystemSetting } from '../../../shared/types'
import type { LlmWikiMigratableFormatId, LlmWikiMigrateResult } from '../../../shared/types/ipc'
import { WORKSPACE_MODE, type WorkspaceMode } from '../../../shared/constants/workspace-mode'
import { initializeLlmWiki } from '../common/llm-wiki-actions'
import { runWorkspaceMigration } from '../common/llm-wiki-migration-actions'
import { describeActionError, reportActionFailure } from '../common/action-feedback'
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
 * 请求切换到 LLM Wiki 模式：打开迁移弹窗（实际切换在弹窗提交后执行）。
 * 重复点击（弹窗已展开 / 切换进行中）不重复打开。
 */
export function requestSwitchToLlmWiki(): void {
    if (workspaceModeSwitchState.busy) {
        return
    }
    workspaceModeSwitchState.visible = true
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
 * @returns 结构化结果；**不抛异常**
 */
export async function completeSwitchToLlmWiki(
    decision: LlmWikiSwitchDecision
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
        const initialized = await initializeLlmWiki()
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
 * @returns 是否写入成功；失败时保持 LLM Wiki 模式并给出可见错误提示
 */
export async function switchToTraditional(): Promise<boolean> {
    return writeWorkspaceMode(WORKSPACE_MODE.TRADITIONAL)
}

/** 仅供单元测试：复位模块单例状态（不清空完成监听器，避免影响已挂载组件） */
export function resetWorkspaceModeSwitchForTesting(): void {
    workspaceModeSwitchState.visible = false
    workspaceModeSwitchState.busy = false
}

/** 仅供单元测试：清空完成监听器（用例间隔离） */
export function clearWorkspaceModeSwitchListenersForTesting(): void {
    completedListeners.clear()
}
