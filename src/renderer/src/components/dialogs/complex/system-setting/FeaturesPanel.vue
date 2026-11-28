<template>
    <div class="setting-panel">
        <div class="panel-header">
            <h3>
                {{ t('dialogRenderer.systemSetting.panelFeaturesTitle') }}
            </h3>
            <p>
                {{ t('dialogRenderer.systemSetting.panelFeaturesDesc') }}
            </p>
        </div>

        <!--
            1.5.7 LLM Wiki L1：工作区模式（传统模式 / LLM Wiki 模式）。
            说明：切到 llm-wiki 前必须确认（会创建 raw/ 与 wiki/ 并开启 raw 只读），
            确认后先经主进程白名单通道初始化成功，才把模式写入共享草稿（保存仍走设置页
            既有 config:write('system') 通道）；取消则下拉回退、不写草稿不调通道。
        -->
        <div class="settings-group">
            <div class="group-title">
                <span class="group-title-text">{{
                    t('dialogRenderer.systemSetting.groupWorkspace')
                }}</span>
            </div>
            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label" for="workspace-mode-select">
                        {{ t('dialogRenderer.systemSetting.features.workspaceMode') }}
                    </label>
                    <!-- 解释性说明按 1.5.6 约定收进 ⓘ（简短短语，不常显长文） -->
                    <InfoTip :text="t('dialogRenderer.systemSetting.features.workspaceModeHint')" />
                </div>
                <select
                    id="workspace-mode-select"
                    class="setting-select workspace-mode-select"
                    :value="currentWorkspaceMode"
                    :disabled="initializing"
                    @change="handleWorkspaceModeChange"
                >
                    <option value="traditional">
                        {{ t('dialogRenderer.systemSetting.features.workspaceModeTraditional') }}
                    </option>
                    <option value="llm-wiki">
                        {{ t('dialogRenderer.systemSetting.features.workspaceModeLlmWiki') }}
                    </option>
                </select>
            </div>
        </div>

        <div class="settings-group">
            <div class="group-title">
                <span class="group-title-text">{{
                    t('dialogRenderer.systemSetting.groupDefaultFeatures')
                }}</span>
                <!-- 1.5.6 UI 简洁化：默认能力的分组说明 → ⓘ 悬停提示 -->
                <InfoTip :text="t('dialogRenderer.systemSetting.hintDefaultFeatures')" />
            </div>
            <div class="feature-fixed-list">
                <span class="feature-fixed-item">
                    {{ t('dialogRenderer.systemSetting.features.workspaceSearchLabel') }}
                </span>
                <span class="feature-fixed-item">
                    {{ t('dialogRenderer.systemSetting.features.pasteEnhanceLabel') }}
                </span>
                <span class="feature-fixed-item">
                    {{ t('dialogRenderer.systemSetting.features.commandPaletteLabel') }}
                </span>
            </div>
        </div>

        <div class="settings-group">
            <div class="group-title">
                <span class="group-title-text">{{
                    t('dialogRenderer.systemSetting.groupOptionalFeatures')
                }}</span>
                <!-- 1.5.6 UI 简洁化：可选能力生效时机/数据落盘的分组说明 → ⓘ 悬停提示 -->
                <InfoTip :text="t('dialogRenderer.systemSetting.hintOptionalFeatures')" />
            </div>
            <div v-for="item in featureRows" :key="item.id" class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label" :for="`feature-${item.id}`">
                        {{ t(item.labelKey) }}
                    </label>
                    <!-- 1.5.6 UI 简洁化：各能力详细解释 → 标签旁 ⓘ 悬停提示（行高不再被 Desc 撑开） -->
                    <InfoTip :text="t(item.descKey)" />
                </div>
                <input
                    :id="`feature-${item.id}`"
                    v-model="item.model.value"
                    type="checkbox"
                    class="setting-checkbox"
                />
            </div>
        </div>

        <!--
            1.5.7 LLM Wiki L2：MCP 服务（只读桥）——开关 + 运行状态 + 令牌复制 + 安全说明。
            开关是「立即生效」动作（不经设置页保存按钮）：change 时直接调主进程
            IPC.MCP.SET_ENABLED 启停 HTTP 服务；状态则由 IPC.MCP.GET_STATUS 实时读取。
            服务默认关闭、仅绑定 127.0.0.1、需 Bearer 令牌、只提供 7 个只读工具。
        -->
        <div class="settings-group mcp-server-group">
            <div class="group-title">
                <span class="group-title-text">{{
                    t('dialogRenderer.systemSetting.features.mcpServerGroupTitle')
                }}</span>
                <InfoTip :text="t('dialogRenderer.systemSetting.features.mcpServerHint')" />
            </div>
            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label" for="mcp-server-enabled">
                        {{ t('dialogRenderer.systemSetting.features.mcpServerEnabled') }}
                    </label>
                </div>
                <input
                    id="mcp-server-enabled"
                    v-model="mcpEnabled"
                    type="checkbox"
                    class="setting-checkbox"
                    :disabled="mcpBusy || !mcpAvailable"
                    @change="handleMcpToggle"
                />
            </div>
            <div class="mcp-server-status" data-testid="mcp-server-status">
                <span
                    class="mcp-server-status-badge"
                    :class="mcpStatus?.running ? 'is-running' : 'is-stopped'"
                >
                    {{
                        mcpStatus?.running
                            ? t('dialogRenderer.systemSetting.features.mcpServerRunning')
                            : t('dialogRenderer.systemSetting.features.mcpServerStopped')
                    }}
                </span>
                <span v-if="mcpStatus?.running" class="mcp-server-meta">
                    {{ t('dialogRenderer.systemSetting.features.mcpServerPort') }}:
                    {{ mcpStatus.port }}
                </span>
                <span v-if="mcpStatus?.running" class="mcp-server-meta">
                    {{ t('dialogRenderer.systemSetting.features.mcpServerUrl') }}:
                    <code class="mcp-server-url">{{ mcpStatus.url }}</code>
                </span>
                <span v-if="mcpStatus" class="mcp-server-meta">
                    {{
                        t('dialogRenderer.systemSetting.features.mcpServerToolCount', {
                            count: mcpStatus.toolCount
                        })
                    }}
                </span>
            </div>
            <div v-if="mcpStatus?.running && mcpStatus.token" class="mcp-token-row">
                <span class="mcp-token-label">
                    {{ t('dialogRenderer.systemSetting.features.mcpServerToken') }}
                </span>
                <code class="mcp-token-value">{{ mcpStatus.token }}</code>
                <button type="button" class="browse-btn mcp-copy-token" @click="copyMcpToken">
                    {{
                        tokenCopied
                            ? t('dialogRenderer.systemSetting.features.mcpServerTokenCopied')
                            : t('dialogRenderer.systemSetting.features.mcpServerCopyToken')
                    }}
                </button>
            </div>
            <p class="mcp-security-note">
                {{ t('dialogRenderer.systemSetting.features.mcpServerSecurityNote') }}
            </p>
            <p class="mcp-restart-hint">
                {{ t('dialogRenderer.systemSetting.features.mcpServerRestartHint') }}
            </p>
            <p v-if="mcpError" class="mcp-error">{{ mcpError }}</p>
        </div>

        <!--
            1.5.7 LLM Wiki L3：AI 助手——本地 Ollama / LM Studio + 远程 BYOK。
            配置独立保存（立即生效，不随本页「应用」按钮保存）；API Key 经主进程 safeStorage
            加密后落独立文件（safeStorage 不可用时仅会话内存、不落盘），输入后不回显明文。
            「测试连接」= 先保存当前表单，再以空 messages 调 AI.CHAT 做一次轻量连通性探测。
        -->
        <div class="settings-group ai-assistant-group">
            <div class="group-title">
                <span class="group-title-text">
                    {{ t('dialogRenderer.systemSetting.features.aiGroupTitle') }}
                </span>
                <InfoTip :text="t('dialogRenderer.systemSetting.features.aiGroupHint')" />
            </div>

            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label" for="ai-enabled">
                        {{ t('dialogRenderer.systemSetting.features.aiEnabled') }}
                    </label>
                </div>
                <input
                    id="ai-enabled"
                    v-model="aiConfig.enabled"
                    type="checkbox"
                    class="setting-checkbox"
                    :disabled="aiBusy || !aiAvailable"
                />
            </div>

            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label" for="ai-provider">
                        {{ t('dialogRenderer.systemSetting.features.aiProvider') }}
                    </label>
                </div>
                <select
                    id="ai-provider"
                    v-model="aiConfig.provider"
                    class="setting-select ai-provider-select"
                    :disabled="aiBusy || !aiAvailable"
                >
                    <option value="local">
                        {{ t('dialogRenderer.systemSetting.features.aiProviderLocal') }}
                    </option>
                    <option value="remote">
                        {{ t('dialogRenderer.systemSetting.features.aiProviderRemote') }}
                    </option>
                </select>
            </div>

            <div v-if="aiConfig.provider === 'local'" class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label" for="ai-local-provider">
                        {{ t('dialogRenderer.systemSetting.features.aiLocalProvider') }}
                    </label>
                </div>
                <select
                    id="ai-local-provider"
                    v-model="aiConfig.localProvider"
                    class="setting-select ai-provider-select"
                    :disabled="aiBusy || !aiAvailable"
                >
                    <option value="ollama">
                        {{ t('dialogRenderer.systemSetting.features.aiLocalOllama') }}
                    </option>
                    <option value="lmstudio">
                        {{ t('dialogRenderer.systemSetting.features.aiLocalLmStudio') }}
                    </option>
                </select>
            </div>

            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label" for="ai-base-url">
                        {{ t('dialogRenderer.systemSetting.features.aiBaseUrl') }}
                    </label>
                    <InfoTip :text="t('dialogRenderer.systemSetting.features.aiBaseUrlHint')" />
                </div>
                <input
                    id="ai-base-url"
                    v-model="aiConfig.baseUrl"
                    type="text"
                    class="setting-input ai-base-url-input"
                    :placeholder="aiBaseUrlPlaceholder"
                    :disabled="aiBusy || !aiAvailable"
                />
            </div>

            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label" for="ai-model">
                        {{ t('dialogRenderer.systemSetting.features.aiModel') }}
                    </label>
                    <InfoTip :text="t('dialogRenderer.systemSetting.features.aiModelHint')" />
                </div>
                <input
                    id="ai-model"
                    v-model="aiConfig.model"
                    type="text"
                    class="setting-input ai-model-input"
                    :placeholder="t('dialogRenderer.systemSetting.features.aiModelPlaceholder')"
                    :disabled="aiBusy || !aiAvailable"
                />
            </div>

            <div
                v-if="aiConfig.provider === 'remote'"
                class="setting-row"
                data-testid="ai-api-key-row"
            >
                <div class="setting-label-group">
                    <label class="setting-label" for="ai-api-key">
                        {{ t('dialogRenderer.systemSetting.features.aiApiKey') }}
                    </label>
                </div>
                <input
                    id="ai-api-key"
                    v-model="aiApiKeyInput"
                    type="password"
                    class="setting-input ai-api-key-input"
                    autocomplete="off"
                    spellcheck="false"
                    :placeholder="t('dialogRenderer.systemSetting.features.aiApiKeyPlaceholder')"
                    :disabled="aiBusy || !aiAvailable"
                />
            </div>

            <p
                v-if="aiConfig.provider === 'remote'"
                class="ai-key-status"
                data-testid="ai-key-status"
            >
                {{ t('dialogRenderer.systemSetting.features.aiApiKey') }}：
                {{
                    aiKeyConfigured
                        ? t('dialogRenderer.systemSetting.features.aiApiKeyConfigured')
                        : t('dialogRenderer.systemSetting.features.aiApiKeyNotConfigured')
                }}
                <template v-if="aiKeyConfigured">
                    （{{
                        aiKeyStorage === 'safe'
                            ? t('dialogRenderer.systemSetting.features.aiApiKeyStorageSafe')
                            : t('dialogRenderer.systemSetting.features.aiApiKeyStorageMemory')
                    }}）
                </template>
            </p>

            <div class="ai-actions">
                <button
                    type="button"
                    class="browse-btn ai-save-btn"
                    :disabled="aiBusy || !aiAvailable"
                    @click="handleSaveAiConfig"
                >
                    {{ t('dialogRenderer.systemSetting.features.aiSave') }}
                </button>
                <button
                    type="button"
                    class="browse-btn ai-test-btn"
                    :disabled="aiBusy || !aiAvailable"
                    @click="handleTestAiConnection"
                >
                    {{
                        aiBusy
                            ? t('dialogRenderer.systemSetting.features.aiTesting')
                            : t('dialogRenderer.systemSetting.features.aiTest')
                    }}
                </button>
                <button
                    v-if="aiConfig.provider === 'remote'"
                    type="button"
                    class="browse-btn ai-clear-key-btn"
                    :disabled="aiBusy || !aiAvailable || !aiKeyConfigured"
                    @click="handleClearAiKey"
                >
                    {{ t('dialogRenderer.systemSetting.features.aiClearKey') }}
                </button>
            </div>

            <p class="ai-privacy-note">
                {{ t('dialogRenderer.systemSetting.features.aiPrivacyNote') }}
            </p>
            <p v-if="aiKeyStorage === 'memory' && aiKeyConfigured" class="ai-warning">
                {{ t('dialogRenderer.systemSetting.features.aiKeyUnavailable') }}
            </p>
            <p v-if="aiMessage" class="ai-success" data-testid="ai-success">{{ aiMessage }}</p>
            <p v-if="aiError" class="ai-error" data-testid="ai-error">{{ aiError }}</p>
        </div>

        <!--
            1.5.7 T1.5：模式切换确认对话框（复用 BaseDialog 外壳，不复制外壳结构与 a11y 行为）。
            确认 = 先初始化 raw/ 与 wiki/（主进程白名单通道），成功才写入工作区模式草稿；
            Esc / 关闭按钮 / 「取消」= 取消切换（下拉已回退到草稿值，不写草稿不调通道）。
        -->
        <BaseDialog
            :visible="confirmVisible"
            :title="t('dialogRenderer.systemSetting.features.workspaceModeConfirmTitle')"
            width-size="confirm"
            reset-position-on-open
            :close-on-overlay="false"
            container-class="workspace-mode-confirm-dialog"
            @close="cancelWorkspaceModeSwitch"
        >
            <div class="workspace-mode-confirm">
                <p class="workspace-mode-confirm-message">
                    {{ t('dialogRenderer.systemSetting.features.workspaceModeConfirmMessage') }}
                </p>
            </div>

            <template #footer>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary btn btn-cancel"
                    :disabled="initializing"
                    @click="cancelWorkspaceModeSwitch"
                >
                    {{ t('common.cancel') }}
                </button>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--primary btn btn-confirm"
                    :disabled="initializing"
                    @click="confirmWorkspaceModeSwitch"
                >
                    {{ t('dialogRenderer.systemSetting.features.workspaceModeConfirmOk') }}
                </button>
            </template>
        </BaseDialog>
    </div>
</template>

<script setup lang="ts">
/**
 * 功能开关页签（2026-11-21 用户选定）：
 * - A2 全工作区搜索、A8 粘贴/复制增强、A9 命令面板为默认能力，只展示不可关闭；
 * - A1/A3/A4/A6/A7/A10 为可选能力，默认关闭，开关按 shared/constants/feature-flags.ts 驱动；
 * - 1.5.7 LLM Wiki L1：新增「工作区」分组的工作区模式下拉（traditional / llm-wiki），
 *   从 traditional 切到 llm-wiki 前弹确认对话框，确认后先调主进程初始化 raw/ 与 wiki/，
 *   成功才把模式写入共享草稿（保存沿用设置页既有 config:write('system') 通道）。
 *
 * 契约与其它 panel 一致：settings 只读，修改经 emit('update') 回壳层共享草稿。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { IPC } from '../../../../../../shared/ipc-channels'
import type { McpServerStatus } from '../../../../../../shared/types/ipc'
// 1.5.7 LLM Wiki L3：AI 助手（本地 + 远程 BYOK）配置快照与保存载荷类型
import type { AiConfigSnapshot, AiSaveConfigRequest } from '../../../../../../shared/types/ai'
import { isAiLocalProviderId, isAiProviderKind } from '../../../../../../shared/constants/ai'
import { describeActionError } from '../../../../common/action-feedback'
import { t } from '../../../../common/i18n'
import { initializeLlmWiki } from '../../../../common/llm-wiki-actions'
import { logger } from '../../../../common/logger'
import BaseDialog from '../../BaseDialog.vue'
import InfoTip from '../../../common/InfoTip.vue'
import {
    OPTIONAL_FEATURE_FLAGS,
    OPTIONAL_FEATURE_FLAG_IDS
} from '../../../../../../shared/constants/feature-flags'
import type { WorkspaceMode } from '../../../../../../shared/constants/workspace-mode'
import { normalizeWorkspaceMode } from '../../../../../../shared/constants/workspace-mode'
import type { SystemDialogSettings } from './model'
import { usePanelFields } from './panel-model'

const props = defineProps<{ settings: SystemDialogSettings }>()
const emit = defineEmits<{
    (e: 'update', patch: Partial<SystemDialogSettings>): void
}>()

const field = usePanelFields(
    () => props.settings,
    (patch) => emit('update', patch)
)

const featureRows = computed(() =>
    OPTIONAL_FEATURE_FLAG_IDS.map((id) => {
        const definition = OPTIONAL_FEATURE_FLAGS[id]
        return {
            id,
            labelKey: definition.labelKey,
            descKey: definition.descKey,
            model: field(definition.settingKey)
        }
    })
)

// ==================== 1.5.7 LLM Wiki L1：工作区模式 ====================

/** 工作区模式字面量（与 shared/constants/workspace-mode 枚举一致，避免魔法字符串散落） */
const WORKSPACE_MODE_LLM_WIKI: WorkspaceMode = 'llm-wiki'
const WORKSPACE_MODE_TRADITIONAL: WorkspaceMode = 'traditional'

/** 工作区模式草稿（读写经壳层共享草稿，保存沿用设置页既有通道） */
const workspaceMode = field('workspaceMode')

/** 下拉当前值真源：草稿值归一化（损坏/未知值回落 traditional，与 model 合并逻辑一致） */
const currentWorkspaceMode = computed<WorkspaceMode>(() =>
    normalizeWorkspaceMode(props.settings.workspaceMode)
)

/** traditional → llm-wiki 切换确认对话框显隐 */
const confirmVisible = ref(false)
/** 初始化调用中：下拉与确认/取消按钮禁用，防重复提交与并发切换 */
const initializing = ref(false)

/**
 * 下拉变更：
 * - llm-wiki → traditional：直接写入草稿（不删除已创建目录，符合产品约定）；
 * - traditional → llm-wiki：不立即写草稿，先弹确认对话框（确认且初始化成功后才写草稿）；
 * - 其余（非法值/未变化）：还原下拉展示值。
 *
 * 说明：`:value` 绑定的是草稿值，草稿未变化时 Vue 不会重写 DOM value（仅新旧 vnode 值
 * 不同才 patch），因此这里手动把用户切换后的 select 还原为草稿值，保证「取消 = 回退下拉」。
 */
function handleWorkspaceModeChange(event: Event): void {
    const select = event.target as HTMLSelectElement
    const next = normalizeWorkspaceMode(select.value)
    const current = currentWorkspaceMode.value
    select.value = current
    if (next === current) {
        return
    }
    if (next === WORKSPACE_MODE_LLM_WIKI) {
        confirmVisible.value = true
        return
    }
    workspaceMode.value = WORKSPACE_MODE_TRADITIONAL
}

/** 取消模式切换：不写草稿、不调用主进程（下拉已回退到草稿值） */
function cancelWorkspaceModeSwitch(): void {
    if (initializing.value) {
        return
    }
    confirmVisible.value = false
}

/**
 * 确认模式切换：先调主进程初始化 raw/ 与 wiki/，成功才把工作区模式写入共享草稿。
 *
 * 顺序说明：初始化是切换模式的前提（失败说明工作区不可用/未打开），失败时保持原模式并
 * 由 initializeLlmWiki 给出可见错误提示，避免出现「模式已切换但目录未创建」的半成品状态。
 */
async function confirmWorkspaceModeSwitch(): Promise<void> {
    if (initializing.value) {
        return
    }
    initializing.value = true
    try {
        const initialized = await initializeLlmWiki()
        if (initialized) {
            workspaceMode.value = WORKSPACE_MODE_LLM_WIKI
        }
        confirmVisible.value = false
    } finally {
        initializing.value = false
    }
}

// ==================== 1.5.7 LLM Wiki L2：MCP 服务（只读桥） ====================

/** 渲染层受限 ipcRenderer 的最小结构（与 llm-wiki-actions 同款守卫，不直接依赖 Electron 类型） */
interface McpIpcRendererLike {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

/** 取受限 ipcRenderer；非 Electron 环境（测试桩/旧 preload）返回 null（MCP / AI 分组共用） */
function getRestrictedIpcRenderer(): McpIpcRendererLike | null {
    if (typeof window === 'undefined') {
        return null
    }
    const ipcRenderer = (window as { electron?: { ipcRenderer?: McpIpcRendererLike } }).electron
        ?.ipcRenderer
    if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
        return null
    }
    return ipcRenderer
}

/** 运行时结构守卫：把主进程返回值收敛为 McpServerStatus（非法返回 null） */
function readMcpStatus(raw: unknown): McpServerStatus | null {
    if (!raw || typeof raw !== 'object') {
        return null
    }
    const record = raw as Record<string, unknown>
    if (typeof record.running !== 'boolean' || typeof record.enabled !== 'boolean') {
        return null
    }
    return {
        enabled: record.enabled,
        running: record.running,
        port: typeof record.port === 'number' ? record.port : 0,
        token: typeof record.token === 'string' ? record.token : '',
        url: typeof record.url === 'string' ? record.url : '',
        toolCount: typeof record.toolCount === 'number' ? record.toolCount : 0
    }
}

/** MCP 服务实时状态（null = 尚未加载/读取失败） */
const mcpStatus = ref<McpServerStatus | null>(null)
/** 开关展示值（真源为服务运行态；操作失败时回退到运行态） */
const mcpEnabled = ref(false)
/** 启停请求进行中：开关禁用，防重复提交 */
const mcpBusy = ref(false)
/** 受限 ipcRenderer 是否可用（不可用时开关禁用并提示占位） */
const mcpAvailable = ref(true)
/** 操作/复制失败的内联可见提示（不弹全局对话框，避免打断设置页保存流程） */
const mcpError = ref('')
/** 令牌「已复制」瞬时反馈 */
const tokenCopied = ref(false)
/** 「已复制」复位定时器（组件卸载时清理） */
let tokenCopiedTimer: ReturnType<typeof setTimeout> | null = null

/** 应用主进程返回的状态（同时同步开关展示值） */
function applyMcpStatus(status: McpServerStatus): void {
    mcpStatus.value = status
    mcpEnabled.value = status.running
}

/** 读取 MCP 服务状态（挂载时调用；失败只显示内联提示，不影响其它设置项） */
async function loadMcpStatus(): Promise<void> {
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        mcpAvailable.value = false
        mcpError.value = t('dialogRenderer.systemSetting.features.mcpServerUnavailable')
        return
    }
    mcpAvailable.value = true
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.MCP.GET_STATUS)
        const status = readMcpStatus(raw)
        if (status === null) {
            mcpError.value = t('dialogRenderer.systemSetting.features.mcpServerUnavailable')
            return
        }
        applyMcpStatus(status)
    } catch (error) {
        logger.error('[Settings] 读取 MCP 服务状态失败：', error)
        mcpError.value = t('dialogRenderer.systemSetting.features.mcpServerToggleFailed', {
            error: describeActionError(error, t('common.unknown'))
        })
    }
}

/**
 * MCP 服务开关：立即调用主进程启停（不等设置页保存）。
 * 失败时开关回退为服务真实运行态，并展示含主进程原因的可见提示（LOG-08 禁止静默失败）。
 */
async function handleMcpToggle(event: Event): Promise<void> {
    if (mcpBusy.value) {
        return
    }
    const nextEnabled = (event.target as HTMLInputElement).checked
    mcpBusy.value = true
    mcpError.value = ''
    try {
        const ipcRenderer = getRestrictedIpcRenderer()
        if (!ipcRenderer) {
            mcpAvailable.value = false
            mcpEnabled.value = mcpStatus.value?.running === true
            mcpError.value = t('dialogRenderer.systemSetting.features.mcpServerUnavailable')
            return
        }
        const raw: unknown = await ipcRenderer.invoke(IPC.MCP.SET_ENABLED, {
            enabled: nextEnabled
        })
        const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
        const status = readMcpStatus(record.status)
        if (status !== null) {
            applyMcpStatus(status)
        } else {
            mcpEnabled.value = mcpStatus.value?.running === true
        }
        if (record.ok !== true) {
            const detail =
                typeof record.error === 'string' && record.error.length > 0
                    ? record.error
                    : t('common.unknown')
            mcpError.value = t('dialogRenderer.systemSetting.features.mcpServerToggleFailed', {
                error: detail
            })
        }
    } catch (error) {
        logger.error('[Settings] MCP 服务启停失败：', error)
        mcpEnabled.value = mcpStatus.value?.running === true
        mcpError.value = t('dialogRenderer.systemSetting.features.mcpServerToggleFailed', {
            error: describeActionError(error, t('common.unknown'))
        })
    } finally {
        mcpBusy.value = false
    }
}

/** 复制访问令牌到系统剪贴板（失败显示内联提示，提示用户手动选择复制） */
async function copyMcpToken(): Promise<void> {
    const token = mcpStatus.value?.token ?? ''
    if (token.length === 0) {
        return
    }
    try {
        const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined
        if (!clipboard || typeof clipboard.writeText !== 'function') {
            throw new Error('clipboard API unavailable')
        }
        await clipboard.writeText(token)
        tokenCopied.value = true
        if (tokenCopiedTimer !== null) {
            clearTimeout(tokenCopiedTimer)
        }
        tokenCopiedTimer = setTimeout(() => {
            tokenCopied.value = false
            tokenCopiedTimer = null
        }, 2000)
    } catch (error) {
        logger.error('[Settings] 复制 MCP 令牌失败：', error)
        mcpError.value = t('dialogRenderer.systemSetting.features.mcpServerCopyFailed')
    }
}

// ==================== 1.5.7 LLM Wiki L3：AI 助手（本地 + 远程 BYOK） ====================

/** AI 配置表单（经 AI.SAVE_CONFIG 立即保存；与本页「应用」按钮的设置草稿互不影响） */
const aiConfig = ref<{
    enabled: boolean
    provider: 'local' | 'remote'
    localProvider: 'ollama' | 'lmstudio'
    baseUrl: string
    model: string
}>({
    enabled: false,
    provider: 'local',
    localProvider: 'ollama',
    baseUrl: '',
    model: ''
})

/** API Key 输入框（保存成功后清空，避免明文长期停留在表单状态中） */
const aiApiKeyInput = ref('')
/** 主进程是否已保存 API Key（只返回状态，不回显明文） */
const aiKeyConfigured = ref(false)
/** 密钥存储形态：safe = safeStorage 加密落盘；memory = safeStorage 不可用、仅会话内存 */
const aiKeyStorage = ref<'safe' | 'memory'>('memory')
/** 配置/测试请求进行中（禁用表单与按钮，防重复提交） */
const aiBusy = ref(false)
/** 受限 ipcRenderer 是否可用（不可用时整组禁用并提示） */
const aiAvailable = ref(true)
/** 操作失败的内联可见提示（不弹全局对话框，保持设置页流程不被打断） */
const aiError = ref('')
/** 操作成功的瞬时提示（如「已保存」「连接成功」） */
const aiMessage = ref('')
/** 成功提示复位定时器（组件卸载时清理） */
let aiMessageTimer: ReturnType<typeof setTimeout> | null = null

/** 根据 Provider 形态给出接口基址占位提示（远程必须显式填写） */
const aiBaseUrlPlaceholder = computed(() => {
    if (aiConfig.value.provider === 'remote') {
        return t('dialogRenderer.systemSetting.features.aiBaseUrlPlaceholderRemote')
    }
    return aiConfig.value.localProvider === 'lmstudio'
        ? t('dialogRenderer.systemSetting.features.aiBaseUrlPlaceholderLmStudio')
        : t('dialogRenderer.systemSetting.features.aiBaseUrlPlaceholderOllama')
})

/** 设置一次性成功提示（2.5s 后自动清除，不常驻占位） */
function showAiMessage(message: string): void {
    aiMessage.value = message
    if (aiMessageTimer !== null) {
        clearTimeout(aiMessageTimer)
    }
    aiMessageTimer = setTimeout(() => {
        aiMessage.value = ''
        aiMessageTimer = null
    }, 2500)
}

/** 运行时结构守卫：把主进程返回值收敛为 AiConfigSnapshot（非法返回 null） */
function readAiConfigSnapshot(raw: unknown): AiConfigSnapshot | null {
    if (!raw || typeof raw !== 'object') {
        return null
    }
    const record = raw as Record<string, unknown>
    if (typeof record.enabled !== 'boolean') {
        return null
    }
    if (!isAiProviderKind(record.provider) || !isAiLocalProviderId(record.localProvider)) {
        return null
    }
    return {
        enabled: record.enabled,
        provider: record.provider,
        localProvider: record.localProvider,
        baseUrl: typeof record.baseUrl === 'string' ? record.baseUrl : '',
        model: typeof record.model === 'string' ? record.model : '',
        apiKeyConfigured: record.apiKeyConfigured === true,
        apiKeyStorage: record.apiKeyStorage === 'safe' ? 'safe' : 'memory'
    }
}

/** 应用主进程返回的配置快照（同步表单与密钥状态） */
function applyAiConfigSnapshot(snapshot: AiConfigSnapshot): void {
    aiConfig.value = {
        enabled: snapshot.enabled,
        provider: snapshot.provider,
        localProvider: snapshot.localProvider,
        baseUrl: snapshot.baseUrl,
        model: snapshot.model
    }
    aiKeyConfigured.value = snapshot.apiKeyConfigured
    aiKeyStorage.value = snapshot.apiKeyStorage
}

/** 读取主进程结构化失败中的可读原因（ok=false 结构；非法返回 null） */
function readStructuredFailure(raw: unknown): string | null {
    if (!raw || typeof raw !== 'object') {
        return null
    }
    const record = raw as Record<string, unknown>
    if (record.ok !== false) {
        return null
    }
    const message = typeof record.message === 'string' ? record.message : ''
    return message.length > 0 ? message : t('common.unknown')
}

/** 读取 AI 配置（挂载时调用；失败只显示内联提示，不影响其它设置项） */
async function loadAiConfig(): Promise<void> {
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        aiAvailable.value = false
        aiError.value = t('dialogRenderer.systemSetting.features.aiUnavailable')
        return
    }
    aiAvailable.value = true
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.AI.GET_CONFIG)
        const snapshot = readAiConfigSnapshot(raw)
        if (snapshot === null) {
            aiError.value = t('dialogRenderer.systemSetting.features.aiLoadFailed', {
                error: t('common.unknown')
            })
            return
        }
        applyAiConfigSnapshot(snapshot)
        aiError.value = ''
    } catch (error) {
        logger.error('[Settings] 读取 AI 配置失败：', error)
        aiError.value = t('dialogRenderer.systemSetting.features.aiLoadFailed', {
            error: describeActionError(error, t('common.unknown'))
        })
    }
}

/**
 * 保存 AI 配置（含表单改动与可选的新 API Key）。
 *
 * @returns 是否保存成功（失败时已写入内联提示）
 */
async function saveAiSettings(): Promise<boolean> {
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        aiAvailable.value = false
        aiError.value = t('dialogRenderer.systemSetting.features.aiUnavailable')
        return false
    }
    const payload: AiSaveConfigRequest = {
        enabled: aiConfig.value.enabled,
        provider: aiConfig.value.provider,
        localProvider: aiConfig.value.localProvider,
        baseUrl: aiConfig.value.baseUrl,
        model: aiConfig.value.model
    }
    const apiKey = aiApiKeyInput.value.trim()
    if (apiKey.length > 0) {
        payload.apiKey = apiKey
    }
    const raw: unknown = await ipcRenderer.invoke(IPC.AI.SAVE_CONFIG, payload)
    const structuredError = readStructuredFailure(raw)
    if (structuredError !== null) {
        aiError.value = t('dialogRenderer.systemSetting.features.aiSaveFailed', {
            error: structuredError
        })
        return false
    }
    const record = raw as { config?: unknown } | null
    const snapshot = readAiConfigSnapshot(record?.config)
    if (snapshot !== null) {
        applyAiConfigSnapshot(snapshot)
    }
    aiApiKeyInput.value = ''
    aiError.value = ''
    return true
}

/** 保存 AI 配置（按钮入口） */
async function handleSaveAiConfig(): Promise<void> {
    if (aiBusy.value) {
        return
    }
    aiBusy.value = true
    aiError.value = ''
    try {
        if (await saveAiSettings()) {
            showAiMessage(t('dialogRenderer.systemSetting.features.aiSaved'))
        }
    } catch (error) {
        logger.error('[Settings] 保存 AI 配置失败：', error)
        aiError.value = t('dialogRenderer.systemSetting.features.aiSaveFailed', {
            error: describeActionError(error, t('common.unknown'))
        })
    } finally {
        aiBusy.value = false
    }
}

/**
 * 测试连接：先保存当前表单（确保测试的是最新配置），再以空 messages 调 AI.CHAT
 * 触发主进程连接测试（轻量探测，不生成对话内容）。
 */
async function handleTestAiConnection(): Promise<void> {
    if (aiBusy.value) {
        return
    }
    aiBusy.value = true
    aiError.value = ''
    aiMessage.value = ''
    try {
        if (!(await saveAiSettings())) {
            return
        }
        const ipcRenderer = getRestrictedIpcRenderer()
        if (!ipcRenderer) {
            aiAvailable.value = false
            aiError.value = t('dialogRenderer.systemSetting.features.aiUnavailable')
            return
        }
        const raw: unknown = await ipcRenderer.invoke(IPC.AI.CHAT, { messages: [] })
        const structuredError = readStructuredFailure(raw)
        if (structuredError !== null) {
            aiError.value = t('dialogRenderer.systemSetting.features.aiTestFailed', {
                error: structuredError
            })
            return
        }
        const record = raw as { content?: unknown } | null
        const detail = typeof record?.content === 'string' ? record.content : t('common.unknown')
        aiMessage.value = t('dialogRenderer.systemSetting.features.aiTestSuccess', { detail })
        if (aiMessageTimer !== null) {
            clearTimeout(aiMessageTimer)
            aiMessageTimer = null
        }
    } catch (error) {
        logger.error('[Settings] AI 连接测试失败：', error)
        aiError.value = t('dialogRenderer.systemSetting.features.aiTestFailed', {
            error: describeActionError(error, t('common.unknown'))
        })
    } finally {
        aiBusy.value = false
    }
}

/** 清除已保存的 API Key（立即生效；仅清理密钥，其余配置保持不变） */
async function handleClearAiKey(): Promise<void> {
    if (aiBusy.value) {
        return
    }
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        aiAvailable.value = false
        aiError.value = t('dialogRenderer.systemSetting.features.aiUnavailable')
        return
    }
    aiBusy.value = true
    aiError.value = ''
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.AI.SAVE_CONFIG, { clearApiKey: true })
        const structuredError = readStructuredFailure(raw)
        if (structuredError !== null) {
            aiError.value = t('dialogRenderer.systemSetting.features.aiSaveFailed', {
                error: structuredError
            })
            return
        }
        const record = raw as { config?: unknown } | null
        const snapshot = readAiConfigSnapshot(record?.config)
        if (snapshot !== null) {
            applyAiConfigSnapshot(snapshot)
        }
        aiApiKeyInput.value = ''
        aiError.value = ''
        showAiMessage(t('dialogRenderer.systemSetting.features.aiSaved'))
    } catch (error) {
        logger.error('[Settings] 清除 AI API Key 失败：', error)
        aiError.value = t('dialogRenderer.systemSetting.features.aiSaveFailed', {
            error: describeActionError(error, t('common.unknown'))
        })
    } finally {
        aiBusy.value = false
    }
}

onMounted(() => {
    void loadMcpStatus()
    void loadAiConfig()
})

onBeforeUnmount(() => {
    if (tokenCopiedTimer !== null) {
        clearTimeout(tokenCopiedTimer)
        tokenCopiedTimer = null
    }
    if (aiMessageTimer !== null) {
        clearTimeout(aiMessageTimer)
        aiMessageTimer = null
    }
})
</script>

<style scoped>
/* 公共样式（面板标题/分组/行/输入控件）见 settings-panel.css。 */
@import './settings-panel.css';

/* 工作区模式下拉：复用 .setting-select 宽度，不额外覆盖尺寸（UI-09/UI-10 令牌口径） */
.workspace-mode-select {
    flex: 0 0 auto;
}

/* 确认对话框正文（BaseDialog 外壳提供标题栏/底栏/遮罩） */
.workspace-mode-confirm {
    padding: 20px;
}

.workspace-mode-confirm-message {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-color);
}

/* 1.5.7 LLM Wiki L2：MCP 服务分组（状态行/令牌行/安全说明；全部走主题变量） */
.mcp-server-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--text-color);
}

.mcp-server-status-badge {
    padding: 2px 10px;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: var(--bg-color);
    font-weight: 600;
}

.mcp-server-status-badge.is-running {
    color: var(--accent-color);
    border-color: var(--accent-color);
}

.mcp-server-status-badge.is-stopped {
    color: var(--secondary-text-color);
}

.mcp-server-meta {
    color: var(--text-color);
}

.mcp-server-url {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 12px;
    color: var(--accent-color);
    word-break: break-all;
}

.mcp-token-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 8px 0;
    font-size: 12px;
    color: var(--text-color);
}

.mcp-token-value {
    flex: 0 1 auto;
    max-width: 100%;
    padding: 4px 8px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--bg-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 12px;
    color: var(--text-color);
    word-break: break-all;
}

.mcp-copy-token {
    padding: 4px 12px;
    font-size: 12px;
}

.mcp-security-note,
.mcp-restart-hint {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--secondary-text-color);
}

.mcp-error {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-danger, var(--danger-color));
}

.feature-fixed-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 4px 0;
}

.feature-fixed-item {
    font-size: 12px;
    color: var(--text-color);
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 6px;
    padding: 4px 10px;
}

/* 1.5.7 LLM Wiki L3：AI 助手分组（Provider/基址/模型/密钥/测试连接；全部走主题与语义令牌） */
.ai-provider-select,
.ai-base-url-input,
.ai-model-input,
.ai-api-key-input {
    flex: 0 0 auto;
    min-width: 220px;
    max-width: 100%;
}

.ai-key-status {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--text-color);
}

.ai-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-pad, 8px);
    margin: 12px 0 0;
}

.ai-privacy-note {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--secondary-text-color);
}

.ai-warning {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-warning, var(--warning-color, var(--text-color)));
}

.ai-success {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-success, var(--accent-color));
}

.ai-error {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-danger, var(--danger-color));
}
</style>
