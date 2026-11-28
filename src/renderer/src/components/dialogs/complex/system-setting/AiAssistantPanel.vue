<template>
    <div class="setting-panel ai-assistant-panel">
        <div class="panel-header">
            <h3>
                {{ t('dialogRenderer.aiAssistant.panelTitle') }}
            </h3>
            <p>
                {{ t('dialogRenderer.aiAssistant.panelDesc') }}
            </p>
        </div>

        <!-- ==================== 模型管理（多模型 + 独立保存） ==================== -->
        <div class="settings-group ai-models-group">
            <div class="group-title">
                <span class="group-title-text">
                    {{ t('dialogRenderer.aiAssistant.groupModels') }}
                </span>
                <!-- 隐私说明属解释性文案，按 1.5.6 约定收进 ⓘ（行高不常显长文） -->
                <InfoTip :text="t('dialogRenderer.aiAssistant.privacyNote')" />
            </div>

            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label" for="ai-assistant-enabled">
                        {{ t('dialogRenderer.aiAssistant.enabledLabel') }}
                    </label>
                </div>
                <input
                    id="ai-assistant-enabled"
                    type="checkbox"
                    class="setting-checkbox ai-enabled-checkbox"
                    :checked="aiConfig.enabled"
                    :disabled="aiBusy || !aiAvailable"
                    @change="handleAiEnabledChange"
                />
            </div>

            <!-- apiKeyStorage 形态提示：safe = 系统安全存储加密；memory = 仅本次会话内存 -->
            <p class="ai-storage-hint" data-testid="ai-api-key-storage">
                {{ storageHint }}
            </p>

            <!-- 空态引导：还没有模型时给出明确的下一步动作 -->
            <div
                v-if="aiConfig.models.length === 0"
                class="ai-models-empty"
                data-testid="ai-models-empty"
            >
                <p class="ai-models-empty-title">
                    {{ t('dialogRenderer.aiAssistant.modelsEmptyTitle') }}
                </p>
                <button
                    type="button"
                    class="browse-btn ai-add-model-btn"
                    :disabled="aiBusy || !aiAvailable"
                    @click="openAddModelForm"
                >
                    {{ t('dialogRenderer.aiAssistant.addModel') }}
                </button>
            </div>

            <!-- 模型列表：名称 / 类型 / 模型名 / 默认标记 / 远程密钥已配置标记 -->
            <ul v-else class="ai-model-list" data-testid="ai-model-list">
                <li
                    v-for="model in aiConfig.models"
                    :key="model.id"
                    class="ai-model-item"
                    data-testid="ai-model-item"
                >
                    <div class="ai-model-head">
                        <span class="ai-model-name">{{ model.name }}</span>
                        <span class="ai-model-type">{{ describeModelType(model) }}</span>
                        <span
                            v-if="model.id === aiConfig.defaultModelId"
                            class="ai-badge ai-default-badge"
                            data-testid="ai-default-badge"
                        >
                            {{ t('dialogRenderer.aiAssistant.defaultBadge') }}
                        </span>
                        <span
                            v-if="model.provider === 'remote' && model.apiKeyConfigured"
                            class="ai-badge ai-key-badge"
                            data-testid="ai-key-configured-badge"
                        >
                            {{ t('dialogRenderer.aiAssistant.keyConfiguredBadge') }}
                        </span>
                    </div>
                    <code class="ai-model-id">{{ model.model }}</code>
                    <div class="ai-model-actions">
                        <button
                            type="button"
                            class="browse-btn ai-set-default-btn"
                            :disabled="
                                aiBusy || !aiAvailable || model.id === aiConfig.defaultModelId
                            "
                            @click="handleSetDefaultModel(model)"
                        >
                            {{ t('dialogRenderer.aiAssistant.setDefault') }}
                        </button>
                        <button
                            type="button"
                            class="browse-btn ai-edit-model-btn"
                            :disabled="aiBusy || !aiAvailable"
                            @click="openEditModelForm(model)"
                        >
                            {{ t('dialogRenderer.aiAssistant.editModel') }}
                        </button>
                        <button
                            type="button"
                            class="browse-btn ai-test-model-btn"
                            :disabled="aiBusy || !aiAvailable || testingModelId !== null"
                            @click="handleTestModel(model)"
                        >
                            {{
                                testingModelId === model.id
                                    ? t('dialogRenderer.aiAssistant.testing')
                                    : t('dialogRenderer.aiAssistant.testConnection')
                            }}
                        </button>
                        <button
                            type="button"
                            class="browse-btn ai-delete-model-btn"
                            :disabled="aiBusy || !aiAvailable"
                            @click="handleDeleteModel(model)"
                        >
                            {{ t('dialogRenderer.aiAssistant.deleteModel') }}
                        </button>
                    </div>
                    <p
                        v-if="testResults[model.id]"
                        class="ai-test-result"
                        :class="testResults[model.id].ok ? 'ai-success' : 'ai-error'"
                        data-testid="ai-test-result"
                    >
                        {{ testResults[model.id].message }}
                    </p>
                </li>
                <li class="ai-model-add-row">
                    <button
                        type="button"
                        class="browse-btn ai-add-model-btn"
                        :disabled="aiBusy || !aiAvailable"
                        @click="openAddModelForm"
                    >
                        {{ t('dialogRenderer.aiAssistant.addModel') }}
                    </button>
                </li>
            </ul>

            <!-- 添加 / 编辑模型表单（提交后立即经 AI.SAVE_CONFIG 保存并生效） -->
            <form
                v-if="modelForm"
                class="ai-model-form"
                data-testid="ai-model-form"
                @submit.prevent="handleSubmitModelForm"
            >
                <div class="ai-form-title">
                    {{
                        modelForm.mode === 'edit'
                            ? t('dialogRenderer.aiAssistant.formTitleEdit')
                            : t('dialogRenderer.aiAssistant.addModel')
                    }}
                </div>
                <div class="setting-row">
                    <label class="setting-label" for="ai-model-form-name">
                        {{ t('dialogRenderer.aiAssistant.formName') }}
                    </label>
                    <input
                        id="ai-model-form-name"
                        v-model="modelForm.name"
                        type="text"
                        class="setting-input"
                        :disabled="aiBusy"
                    />
                </div>
                <div class="setting-row">
                    <label class="setting-label" for="ai-model-form-provider">
                        {{ t('dialogRenderer.aiAssistant.formProvider') }}
                    </label>
                    <select
                        id="ai-model-form-provider"
                        v-model="modelForm.provider"
                        class="setting-select"
                        :disabled="aiBusy"
                    >
                        <option value="local">
                            {{ t('dialogRenderer.aiAssistant.formProviderLocal') }}
                        </option>
                        <option value="remote">
                            {{ t('dialogRenderer.aiAssistant.formProviderRemote') }}
                        </option>
                    </select>
                </div>
                <div v-if="modelForm.provider === 'local'" class="setting-row">
                    <label class="setting-label" for="ai-model-form-local-provider">
                        {{ t('dialogRenderer.aiAssistant.formLocalProvider') }}
                    </label>
                    <select
                        id="ai-model-form-local-provider"
                        v-model="modelForm.localProvider"
                        class="setting-select"
                        :disabled="aiBusy"
                    >
                        <option value="ollama">Ollama</option>
                        <option value="lmstudio">LM Studio</option>
                    </select>
                </div>
                <div class="setting-row">
                    <label class="setting-label" for="ai-model-form-base-url">
                        {{ t('dialogRenderer.aiAssistant.formBaseUrl') }}
                    </label>
                    <input
                        id="ai-model-form-base-url"
                        v-model="modelForm.baseUrl"
                        type="text"
                        class="setting-input"
                        :placeholder="baseUrlPlaceholder"
                        :disabled="aiBusy"
                    />
                </div>
                <div v-if="modelForm.provider === 'remote'" class="setting-row">
                    <label class="setting-label" for="ai-model-form-api-key">
                        {{ t('dialogRenderer.aiAssistant.formApiKey') }}
                    </label>
                    <input
                        id="ai-model-form-api-key"
                        v-model="modelForm.apiKey"
                        type="password"
                        class="setting-input ai-api-key-input"
                        autocomplete="off"
                        spellcheck="false"
                        :placeholder="t('dialogRenderer.aiAssistant.formApiKeyPlaceholder')"
                        :disabled="aiBusy"
                    />
                </div>
                <!-- 已保存密钥：掩码展示 + 清除按钮（始终不回显明文） -->
                <div
                    v-if="modelForm.provider === 'remote' && modelForm.apiKeyConfigured"
                    class="ai-key-status"
                    data-testid="ai-key-masked"
                >
                    <span class="ai-key-mask">
                        {{ t('dialogRenderer.aiAssistant.keyConfiguredBadge') }}：••••••••
                    </span>
                    <button
                        type="button"
                        class="browse-btn ai-clear-key-btn"
                        :disabled="aiBusy || !aiAvailable"
                        @click="handleClearModelKey"
                    >
                        {{ t('dialogRenderer.aiAssistant.clearKey') }}
                    </button>
                </div>
                <div class="setting-row">
                    <label class="setting-label" for="ai-model-form-model">
                        {{ t('dialogRenderer.aiAssistant.formModel') }}
                    </label>
                    <input
                        id="ai-model-form-model"
                        v-model="modelForm.model"
                        type="text"
                        class="setting-input"
                        :placeholder="t('dialogRenderer.aiAssistant.formModelPlaceholder')"
                        :disabled="aiBusy"
                    />
                </div>
                <p v-if="formError" class="ai-error" data-testid="ai-form-error">
                    {{ formError }}
                </p>
                <div class="ai-form-actions">
                    <button
                        type="submit"
                        class="browse-btn ai-save-model-btn"
                        :disabled="aiBusy || !aiAvailable"
                    >
                        {{ t('dialogRenderer.aiAssistant.saveModel') }}
                    </button>
                    <button
                        type="button"
                        class="browse-btn ai-cancel-model-btn"
                        :disabled="aiBusy"
                        @click="closeModelForm"
                    >
                        {{ t('common.cancel') }}
                    </button>
                </div>
            </form>

            <p v-if="aiError" class="ai-error" data-testid="ai-error">{{ aiError }}</p>
            <p v-if="aiMessage" class="ai-success" data-testid="ai-success">{{ aiMessage }}</p>
            <p class="ai-privacy-note">{{ t('dialogRenderer.aiAssistant.privacyNote') }}</p>
        </div>

        <!-- ==================== MCP 服务（只读桥） ==================== -->
        <div class="settings-group mcp-server-group">
            <div class="group-title">
                <span class="group-title-text">
                    {{ t('dialogRenderer.aiAssistant.groupMcp') }}
                </span>
                <InfoTip :text="t('dialogRenderer.aiAssistant.mcpHint')" />
            </div>
            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label" for="mcp-server-enabled">
                        {{ t('dialogRenderer.aiAssistant.mcpEnabled') }}
                    </label>
                </div>
                <input
                    id="mcp-server-enabled"
                    type="checkbox"
                    class="setting-checkbox"
                    :checked="mcpRunning"
                    :disabled="mcpBusy || !mcpAvailable"
                    @change="handleMcpToggle"
                />
            </div>

            <div class="mcp-server-status" data-testid="mcp-server-status">
                <span
                    class="mcp-server-status-badge"
                    :class="mcpRunning ? 'is-running' : 'is-stopped'"
                >
                    {{
                        mcpRunning
                            ? t('dialogRenderer.aiAssistant.mcpRunning')
                            : t('dialogRenderer.aiAssistant.mcpStopped')
                    }}
                </span>
                <span v-if="mcpRunning" class="mcp-server-meta">
                    {{ t('dialogRenderer.aiAssistant.mcpPort') }}: {{ mcpStatus?.port }}
                </span>
                <span v-if="mcpRunning" class="mcp-server-meta">
                    {{ t('dialogRenderer.aiAssistant.mcpUrl') }}:
                    <code class="mcp-server-url">{{ mcpStatus?.url }}</code>
                </span>
                <span class="mcp-server-meta">
                    {{ t('dialogRenderer.aiAssistant.mcpToolsTitle') }}：{{
                        MCP_READONLY_TOOLS.length
                    }}
                </span>
            </div>

            <!-- 端口配置：自动（null，优先 3847）或固定端口（1~65535，保存后随启停生效） -->
            <div class="setting-row mcp-port-row">
                <div class="setting-label-group">
                    <span class="setting-label">
                        {{ t('dialogRenderer.aiAssistant.mcpPort') }}
                    </span>
                </div>
                <div class="mcp-port-controls">
                    <label class="mcp-port-auto-label" for="mcp-port-auto">
                        <input
                            id="mcp-port-auto"
                            v-model="mcpPortAuto"
                            type="checkbox"
                            class="setting-checkbox"
                            :disabled="mcpBusy || !mcpAvailable"
                        />
                        {{ t('dialogRenderer.aiAssistant.mcpPortAuto') }}
                    </label>
                    <input
                        v-if="!mcpPortAuto"
                        id="mcp-port-input"
                        v-model="mcpPortInput"
                        type="number"
                        min="1"
                        max="65535"
                        step="1"
                        class="setting-input mcp-port-input"
                        :placeholder="t('dialogRenderer.aiAssistant.mcpPortPlaceholder')"
                        :disabled="mcpBusy || !mcpAvailable"
                    />
                    <button
                        type="button"
                        class="browse-btn mcp-apply-port-btn"
                        :disabled="mcpBusy || !mcpAvailable"
                        @click="handleApplyMcpPort"
                    >
                        {{ t('dialogRenderer.aiAssistant.mcpApplyPort') }}
                    </button>
                </div>
            </div>

            <!-- 7 个只读工具（主进程 MCP tools 清单，仅展示不参与调用） -->
            <ul class="mcp-tools-list" data-testid="mcp-tools-list">
                <li v-for="tool in MCP_READONLY_TOOLS" :key="tool" class="mcp-tool-item">
                    <code class="mcp-tool-name">{{ tool }}</code>
                </li>
            </ul>

            <div v-if="mcpRunning && mcpStatus?.token" class="mcp-token-row">
                <span class="mcp-token-label">
                    {{ t('dialogRenderer.aiAssistant.mcpToken') }}
                </span>
                <code class="mcp-token-value">{{ mcpStatus.token }}</code>
                <button
                    type="button"
                    class="browse-btn mcp-copy-token"
                    :disabled="mcpBusy"
                    @click="copyMcpToken"
                >
                    {{
                        tokenCopied
                            ? t('dialogRenderer.aiAssistant.mcpTokenCopied')
                            : t('dialogRenderer.aiAssistant.mcpCopyToken')
                    }}
                </button>
                <button
                    type="button"
                    class="browse-btn mcp-regenerate-token"
                    :disabled="mcpBusy"
                    @click="handleRegenerateMcpToken"
                >
                    {{ t('dialogRenderer.aiAssistant.mcpRegenerateToken') }}
                </button>
            </div>

            <p class="mcp-security-note">
                {{ t('dialogRenderer.aiAssistant.mcpSecurityNote') }}
            </p>
            <p class="mcp-restart-hint">
                {{ t('dialogRenderer.aiAssistant.mcpRestartHint') }}
            </p>
            <p v-if="mcpMessage" class="mcp-success" data-testid="mcp-success">{{ mcpMessage }}</p>
            <p v-if="mcpError" class="mcp-error" data-testid="mcp-error">{{ mcpError }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * AI 助手设置页签（1.5.7 体验升级 B：系统设置第 7 页签）
 *
 * 由「功能」页签迁移并扩展而来（原 FeaturesPanel 的「AI 助手」「MCP 服务」两个分组），
 * 承载两部分配置，均**独立保存、立即生效**（不随设置页底部「应用」按钮）：
 *
 * 一、模型管理（多模型）：
 * - 列表展示名称 / 类型（本地 Ollama、LM Studio 或远程）/ 模型名 / 默认标记 / 远程密钥已配置标记；
 * - 添加、编辑、删除、设为默认：每次提交都经 `AI.SAVE_CONFIG` 保存完整模型列表与默认模型；
 * - 远程模型密钥：password 输入，已保存时只显示掩码与「清除密钥」，明文不回显、不落日志；
 *   新增/修改密钥随保存载荷 `modelApiKey.apiKey` 提交，清除走 `modelApiKey.clearApiKey`；
 * - 「测试连接」按模型调 `AI.CHAT`（`messages: []` + `modelId`），结果内联展示在对应模型行；
 * - 空态引导、输入校验（名称/模型名必填；远程需基址、首次添加需密钥）；
 * - 隐私提示 + `apiKeyStorage` 形态提示（safe=系统安全存储加密 / memory=仅本会话内存）。
 *
 * 二、MCP 服务（只读桥，从 FeaturesPanel 迁入并扩展）：
 * - 启用开关（立即调 `MCP.SET_ENABLED`；启用时携带当前端口配置）；
 * - 端口配置：自动（null，优先 3847）或固定端口（1~65535，保存后随启用/重启生效）；
 * - 状态展示：运行中/已停止、实际端口、MCP 地址、令牌复制、重置令牌（regenerateToken）；
 * - 7 个只读工具清单 + 回环/令牌安全说明。
 *
 * 非 Electron 环境（测试桩 / 旧 preload）下整页降级为可读提示，不抛异常、不静默失败。
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { IPC } from '../../../../../../shared/ipc-channels'
import type {
    AiConfigSnapshot,
    AiModelConfig,
    AiSaveConfigRequest
} from '../../../../../../shared/types/ai'
import type { McpServerStatus } from '../../../../../../shared/types/ipc'
import { describeActionError } from '../../../../common/action-feedback'
import { t } from '../../../../common/i18n'
import { logger } from '../../../../common/logger'
import InfoTip from '../../../common/InfoTip.vue'
import {
    createAddModelFormDraft,
    createAiModelId,
    createEditModelFormDraft,
    normalizeAiConfigSnapshot,
    toAiModelsPayload,
    validateAiModelForm,
    type AiModelFormDraft,
    type AiModelFormField
} from './ai-assistant-model'

/** 渲染层受限 ipcRenderer 的最小结构（不直接依赖 Electron 类型；非 Electron 返回 null） */
interface RestrictedIpcRendererLike {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

/**
 * MCP 只读工具名（主进程 `src/main/mcp/tools.ts` 的 7 个工具；本页仅用于展示，
 * 不参与任何调用，工具增删以主进程实现与契约为准）。
 */
const MCP_READONLY_TOOLS = [
    'search_wiki',
    'read_page',
    'list_pages',
    'read_schema',
    'list_tags',
    'get_backlinks',
    'read_raw'
] as const

/** 内联成功提示自动清除时间（ms） */
const STATUS_MESSAGE_TIMEOUT_MS = 3000
/** 「已复制」瞬时反馈复位时间（ms） */
const TOKEN_COPIED_RESET_MS = 2000

/** 取受限 ipcRenderer；非 Electron 环境（测试桩/旧 preload）返回 null */
function getRestrictedIpcRenderer(): RestrictedIpcRendererLike | null {
    if (typeof window === 'undefined') {
        return null
    }
    const ipcRenderer = (window as { electron?: { ipcRenderer?: RestrictedIpcRendererLike } })
        .electron?.ipcRenderer
    if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
        return null
    }
    return ipcRenderer
}

/** 读取主进程结构化失败中的可读原因（ok=false；非法返回 null） */
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

/* ==================== 一、模型管理 ==================== */

/** AI 配置快照（初始为安全空态：关闭 + 无模型 + 内存存储） */
const aiConfig = ref<AiConfigSnapshot>({
    enabled: false,
    models: [],
    defaultModelId: null,
    apiKeyStorage: 'memory'
})
/** 受限 ipcRenderer 是否可用（不可用时整组禁用并提示） */
const aiAvailable = ref(true)
/** 保存/加载/连接测试进行中（禁用表单与按钮，防重复提交） */
const aiBusy = ref(false)
/** 操作失败的内联可见提示 */
const aiError = ref('')
/** 操作成功的瞬时提示 */
const aiMessage = ref('')
/** 当前打开的表单（null = 未打开；添加与编辑共用同一草稿结构） */
const modelForm = ref<AiModelFormDraft | null>(null)
/** 表单校验失败提示 */
const formError = ref('')
/** 正在测试连接的模型 id（同一时刻只允许一个，防并发探测） */
const testingModelId = ref<string | null>(null)
/** 按模型保存的最近一次连接测试结果 */
const testResults = ref<Record<string, { ok: boolean; message: string }>>({})
/** 成功提示复位定时器（组件卸载时清理） */
let aiMessageTimer: ReturnType<typeof setTimeout> | null = null

/** apiKeyStorage 形态提示（safe=加密保存 / memory=仅本会话） */
const storageHint = computed(() =>
    aiConfig.value.apiKeyStorage === 'safe'
        ? t('dialogRenderer.aiAssistant.storageSafe')
        : t('dialogRenderer.aiAssistant.storageMemory')
)

/** 表单接口基址占位（远程必填提示；本地留空=该 Provider 默认基址） */
const baseUrlPlaceholder = computed(() => {
    const form = modelForm.value
    if (!form) {
        return ''
    }
    return form.provider === 'remote'
        ? t('dialogRenderer.aiAssistant.formBaseUrlPlaceholderRemote')
        : t('dialogRenderer.aiAssistant.formBaseUrlPlaceholderLocal')
})

/** 模型类型展示文案（本地模型带 Provider 名；远程统一「远程 API」） */
function describeModelType(model: AiModelConfig): string {
    if (model.provider === 'remote') {
        return t('dialogRenderer.aiAssistant.formProviderRemote')
    }
    const localProviderName = model.localProvider === 'lmstudio' ? 'LM Studio' : 'Ollama'
    return `${t('dialogRenderer.aiAssistant.formProviderLocal')} · ${localProviderName}`
}

/** 表单校验失败的字段 → 界面文案（纯函数只回字段，文案留在组件层保证 i18n 静态可解析） */
function describeFormFieldError(field: AiModelFormField): string {
    switch (field) {
        case 'name':
            return t('dialogRenderer.aiAssistant.formNameRequired')
        case 'model':
            return t('dialogRenderer.aiAssistant.formModelRequired')
        case 'baseUrl':
            return t('dialogRenderer.aiAssistant.formBaseUrlRequired')
        case 'apiKey':
            return t('dialogRenderer.aiAssistant.formApiKeyRequired')
    }
}

/** 显示一次性成功提示（自动清除，不常驻占位） */
function showAiMessage(message: string): void {
    aiMessage.value = message
    if (aiMessageTimer !== null) {
        clearTimeout(aiMessageTimer)
    }
    aiMessageTimer = setTimeout(() => {
        aiMessage.value = ''
        aiMessageTimer = null
    }, STATUS_MESSAGE_TIMEOUT_MS)
}

/** 应用主进程快照：同步配置；编辑中模型被删除时关闭表单；清理失效测试结果 */
function applyConfigSnapshot(snapshot: AiConfigSnapshot): void {
    aiConfig.value = snapshot
    const editingId = modelForm.value?.id
    if (editingId && !snapshot.models.some((model) => model.id === editingId)) {
        closeModelForm()
    }
    const nextResults: Record<string, { ok: boolean; message: string }> = {}
    for (const [modelId, result] of Object.entries(testResults.value)) {
        if (snapshot.models.some((model) => model.id === modelId)) {
            nextResults[modelId] = result
        }
    }
    testResults.value = nextResults
}

/** 读取 AI 配置（面板挂载时调用；失败只显示内联提示，不抛异常） */
async function loadAiConfig(): Promise<void> {
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        aiAvailable.value = false
        aiError.value = t('dialogRenderer.aiAssistant.unavailable')
        return
    }
    aiAvailable.value = true
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.AI.GET_CONFIG)
        const snapshot = normalizeAiConfigSnapshot(raw)
        if (snapshot === null) {
            aiError.value = t('dialogRenderer.aiAssistant.loadFailed', {
                error: t('common.unknown')
            })
            return
        }
        applyConfigSnapshot(snapshot)
        aiError.value = ''
    } catch (error) {
        logger.error('[Settings] 读取 AI 配置失败：', error)
        aiError.value = t('dialogRenderer.aiAssistant.loadFailed', {
            error: describeActionError(error, t('common.unknown'))
        })
    }
}

/**
 * 调 `AI.SAVE_CONFIG` 保存配置，成功返回最新快照并应用到界面；失败写入内联提示并返回 null。
 */
async function invokeSaveAiConfig(payload: AiSaveConfigRequest): Promise<AiConfigSnapshot | null> {
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        aiAvailable.value = false
        aiError.value = t('dialogRenderer.aiAssistant.unavailable')
        return null
    }
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.AI.SAVE_CONFIG, payload)
        const failure = readStructuredFailure(raw)
        if (failure !== null) {
            aiError.value = t('dialogRenderer.aiAssistant.saveFailed', { error: failure })
            return null
        }
        const record = raw && typeof raw === 'object' ? (raw as { config?: unknown }) : {}
        const snapshot = normalizeAiConfigSnapshot(record.config)
        if (snapshot === null) {
            aiError.value = t('dialogRenderer.aiAssistant.saveFailed', {
                error: t('common.unknown')
            })
            return null
        }
        applyConfigSnapshot(snapshot)
        aiError.value = ''
        return snapshot
    } catch (error) {
        logger.error('[Settings] 保存 AI 配置失败：', error)
        aiError.value = t('dialogRenderer.aiAssistant.saveFailed', {
            error: describeActionError(error, t('common.unknown'))
        })
        return null
    }
}

/** 启用开关：立即保存（失败时回退复选框展示到快照真实值） */
async function handleAiEnabledChange(event: Event): Promise<void> {
    if (aiBusy.value || !aiAvailable.value) {
        return
    }
    const input = event.target as HTMLInputElement
    aiBusy.value = true
    aiError.value = ''
    try {
        const snapshot = await invokeSaveAiConfig({ enabled: input.checked })
        if (snapshot === null) {
            input.checked = aiConfig.value.enabled
            return
        }
        showAiMessage(t('dialogRenderer.aiAssistant.saved'))
    } finally {
        aiBusy.value = false
    }
}

/** 打开「添加模型」表单（默认本地 Ollama） */
function openAddModelForm(): void {
    if (aiBusy.value || !aiAvailable.value) {
        return
    }
    formError.value = ''
    aiError.value = ''
    modelForm.value = createAddModelFormDraft()
}

/** 打开「编辑模型」表单（密钥不回显，只显示已配置标记与清除按钮） */
function openEditModelForm(model: AiModelConfig): void {
    if (aiBusy.value || !aiAvailable.value) {
        return
    }
    formError.value = ''
    aiError.value = ''
    modelForm.value = createEditModelFormDraft(model)
}

/** 关闭表单并清空校验提示 */
function closeModelForm(): void {
    modelForm.value = null
    formError.value = ''
}

/**
 * 提交添加 / 编辑表单：
 * 1. 先做界面校验（名称/模型名必填；远程需基址、首次添加需密钥）；
 * 2. 组装完整模型列表 + 默认模型 id（首个模型自动成为默认）；
 * 3. 远程且输入了新密钥时附带 `modelApiKey`（新增/修改密钥同一字段）；
 * 4. `AI.SAVE_CONFIG` 成功后才关闭表单并提示（失败保留表单，草稿不丢）。
 */
async function handleSubmitModelForm(): Promise<void> {
    const form = modelForm.value
    if (!form || aiBusy.value) {
        return
    }
    formError.value = ''
    const invalidField = validateAiModelForm(form)
    if (invalidField !== null) {
        formError.value = describeFormFieldError(invalidField)
        return
    }
    aiBusy.value = true
    aiError.value = ''
    try {
        const name = form.name.trim()
        const modelName = form.model.trim()
        const baseUrl = form.baseUrl.trim()
        const apiKey = form.apiKey.trim()
        if (form.mode === 'add') {
            const modelId = createAiModelId()
            const nextModels: AiModelConfig[] = [
                ...aiConfig.value.models,
                {
                    id: modelId,
                    name,
                    provider: form.provider,
                    localProvider: form.localProvider,
                    baseUrl,
                    model: modelName
                }
            ]
            const payload: AiSaveConfigRequest = {
                models: toAiModelsPayload(nextModels),
                defaultModelId: aiConfig.value.defaultModelId ?? modelId
            }
            if (form.provider === 'remote' && apiKey.length > 0) {
                payload.modelApiKey = { modelId, apiKey }
            }
            const snapshot = await invokeSaveAiConfig(payload)
            if (snapshot !== null) {
                closeModelForm()
                showAiMessage(t('dialogRenderer.aiAssistant.saved'))
            }
            return
        }
        const nextModels: AiModelConfig[] = aiConfig.value.models.map((model) =>
            model.id === form.id
                ? {
                      ...model,
                      name,
                      provider: form.provider,
                      localProvider: form.localProvider,
                      baseUrl,
                      model: modelName
                  }
                : model
        )
        const payload: AiSaveConfigRequest = {
            models: toAiModelsPayload(nextModels),
            defaultModelId: aiConfig.value.defaultModelId
        }
        if (form.provider === 'remote' && apiKey.length > 0) {
            payload.modelApiKey = { modelId: form.id, apiKey }
        }
        const snapshot = await invokeSaveAiConfig(payload)
        if (snapshot !== null) {
            closeModelForm()
            showAiMessage(t('dialogRenderer.aiAssistant.saved'))
        }
    } finally {
        aiBusy.value = false
    }
}

/** 设为默认模型（立即保存；默认模型用于 AI 面板缺省选择） */
async function handleSetDefaultModel(model: AiModelConfig): Promise<void> {
    if (aiBusy.value || !aiAvailable.value) {
        return
    }
    aiBusy.value = true
    aiError.value = ''
    try {
        const snapshot = await invokeSaveAiConfig({ defaultModelId: model.id })
        if (snapshot !== null) {
            showAiMessage(t('dialogRenderer.aiAssistant.saved'))
        }
    } finally {
        aiBusy.value = false
    }
}

/** 删除模型（立即保存；若删除的是默认模型，默认值回落到剩余首个模型或 null） */
async function handleDeleteModel(model: AiModelConfig): Promise<void> {
    if (aiBusy.value || !aiAvailable.value) {
        return
    }
    const nextModels = aiConfig.value.models.filter((item) => item.id !== model.id)
    const nextDefaultModelId =
        aiConfig.value.defaultModelId === model.id
            ? (nextModels[0]?.id ?? null)
            : aiConfig.value.defaultModelId
    aiBusy.value = true
    aiError.value = ''
    try {
        const snapshot = await invokeSaveAiConfig({
            models: toAiModelsPayload(nextModels),
            defaultModelId: nextDefaultModelId
        })
        if (snapshot !== null) {
            if (modelForm.value?.id === model.id) {
                closeModelForm()
            }
            showAiMessage(t('dialogRenderer.aiAssistant.saved'))
        }
    } finally {
        aiBusy.value = false
    }
}

/** 清除当前编辑模型已保存的 API Key（立即生效；只清密钥，其余配置不变） */
async function handleClearModelKey(): Promise<void> {
    const form = modelForm.value
    if (!form || form.mode !== 'edit' || aiBusy.value || !aiAvailable.value) {
        return
    }
    aiBusy.value = true
    aiError.value = ''
    try {
        const snapshot = await invokeSaveAiConfig({
            modelApiKey: { modelId: form.id, clearApiKey: true }
        })
        if (snapshot !== null) {
            form.apiKeyConfigured = false
            form.apiKey = ''
            showAiMessage(t('dialogRenderer.aiAssistant.saved'))
        }
    } finally {
        aiBusy.value = false
    }
}

/** 测试连接：按模型调 `AI.CHAT`（空 messages = 轻量连通性探测），结果内联展示 */
async function handleTestModel(model: AiModelConfig): Promise<void> {
    if (aiBusy.value || !aiAvailable.value || testingModelId.value !== null) {
        return
    }
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        aiAvailable.value = false
        aiError.value = t('dialogRenderer.aiAssistant.unavailable')
        return
    }
    aiError.value = ''
    testingModelId.value = model.id
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.AI.CHAT, {
            messages: [],
            modelId: model.id
        })
        const failure = readStructuredFailure(raw)
        if (failure !== null) {
            testResults.value = {
                ...testResults.value,
                [model.id]: {
                    ok: false,
                    message: t('dialogRenderer.aiAssistant.testFailed', { error: failure })
                }
            }
            return
        }
        const record = raw as { content?: unknown } | null
        const detail = typeof record?.content === 'string' ? record.content : t('common.unknown')
        testResults.value = {
            ...testResults.value,
            [model.id]: {
                ok: true,
                message: t('dialogRenderer.aiAssistant.testSuccess', { detail })
            }
        }
    } catch (error) {
        logger.error('[Settings] AI 连接测试失败：', error)
        testResults.value = {
            ...testResults.value,
            [model.id]: {
                ok: false,
                message: t('dialogRenderer.aiAssistant.testFailed', {
                    error: describeActionError(error, t('common.unknown'))
                })
            }
        }
    } finally {
        testingModelId.value = null
    }
}

/* ==================== 二、MCP 服务（只读桥） ==================== */

/** MCP 服务实时状态（null = 尚未加载/读取失败） */
const mcpStatus = ref<McpServerStatus | null>(null)
/** 启停/端口/令牌操作进行中（防重复提交） */
const mcpBusy = ref(false)
/** 受限 ipcRenderer 是否可用 */
const mcpAvailable = ref(true)
/** 操作失败的内联可见提示 */
const mcpError = ref('')
/** 操作成功的瞬时提示 */
const mcpMessage = ref('')
/** 端口自动选择勾选态（true = 自动，false = 固定端口） */
const mcpPortAuto = ref(true)
/** 固定端口输入值（number 输入框经 v-model 可能直接得到数字，统一按字符串解析） */
const mcpPortInput = ref<string | number>('')
/** 令牌「已复制」瞬时反馈 */
const tokenCopied = ref(false)
/** MCP 成功提示复位定时器 */
let mcpMessageTimer: ReturnType<typeof setTimeout> | null = null
/** 「已复制」复位定时器 */
let tokenCopiedTimer: ReturnType<typeof setTimeout> | null = null

/** 服务是否正在监听（真源为主进程实时状态） */
const mcpRunning = computed(() => mcpStatus.value?.running === true)

/** 运行时结构守卫：主进程返回值收敛为 McpServerStatus（非法返回 null） */
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
        toolCount: typeof record.toolCount === 'number' ? record.toolCount : 0,
        // 兼容尚未返回该字段的旧主进程：null = 自动选择
        preferredPort: typeof record.preferredPort === 'number' ? record.preferredPort : null
    }
}

/** 显示一次性 MCP 成功提示（自动清除） */
function showMcpMessage(message: string): void {
    mcpMessage.value = message
    if (mcpMessageTimer !== null) {
        clearTimeout(mcpMessageTimer)
    }
    mcpMessageTimer = setTimeout(() => {
        mcpMessage.value = ''
        mcpMessageTimer = null
    }, STATUS_MESSAGE_TIMEOUT_MS)
}

/** 应用主进程返回的 MCP 状态；syncPort=true 时同步端口配置（加载 / 操作成功后） */
function applyMcpStatus(status: McpServerStatus, syncPort = false): void {
    mcpStatus.value = status
    if (!syncPort) {
        return
    }
    mcpPortAuto.value = status.preferredPort === null
    mcpPortInput.value = status.preferredPort === null ? '' : String(status.preferredPort)
}

/** 解析固定端口输入（1~65535 的整数；非法返回 null） */
function parseMcpPort(value: string | number): number | null {
    const trimmed = String(value ?? '').trim()
    if (!/^\d+$/.test(trimmed)) {
        return null
    }
    const port = Number(trimmed)
    return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : null
}

/** 读取 MCP 服务状态（挂载时调用；失败只显示内联提示） */
async function loadMcpStatus(): Promise<void> {
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        mcpAvailable.value = false
        mcpError.value = t('dialogRenderer.aiAssistant.mcpUnavailable')
        return
    }
    mcpAvailable.value = true
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.MCP.GET_STATUS)
        const status = readMcpStatus(raw)
        if (status === null) {
            mcpError.value = t('dialogRenderer.aiAssistant.mcpUnavailable')
            return
        }
        applyMcpStatus(status, true)
    } catch (error) {
        logger.error('[Settings] 读取 MCP 服务状态失败：', error)
        mcpError.value = t('dialogRenderer.aiAssistant.mcpToggleFailed', {
            error: describeActionError(error, t('common.unknown'))
        })
    }
}

/**
 * 调 `MCP.SET_ENABLED`（启停 / 端口 / 重置令牌共用），成功返回最新状态；
 * 失败（ok=false 或异常）写入内联提示并返回 null，不抛异常。
 */
async function invokeMcpSetEnabled(payload: {
    enabled: boolean
    port?: number | null
    regenerateToken?: boolean
}): Promise<McpServerStatus | null> {
    const ipcRenderer = getRestrictedIpcRenderer()
    if (!ipcRenderer) {
        mcpAvailable.value = false
        mcpError.value = t('dialogRenderer.aiAssistant.mcpUnavailable')
        return null
    }
    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.MCP.SET_ENABLED, payload)
        const record = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
        const status = readMcpStatus(record.status)
        if (status !== null) {
            applyMcpStatus(status, true)
        }
        if (record.ok !== true) {
            const detail =
                typeof record.error === 'string' && record.error.length > 0
                    ? record.error
                    : t('common.unknown')
            mcpError.value = t('dialogRenderer.aiAssistant.mcpToggleFailed', { error: detail })
            return null
        }
        if (status === null) {
            mcpError.value = t('dialogRenderer.aiAssistant.mcpUnavailable')
            return null
        }
        return status
    } catch (error) {
        logger.error('[Settings] MCP 服务操作失败：', error)
        mcpError.value = t('dialogRenderer.aiAssistant.mcpToggleFailed', {
            error: describeActionError(error, t('common.unknown'))
        })
        return null
    }
}

/**
 * 启用 / 停用 MCP 服务：启用时携带当前端口配置（自动 = null；固定端口非法时拒绝提交），
 * 失败时复选框回退为服务真实运行态（LOG-08 禁止静默失败）。
 */
async function handleMcpToggle(event: Event): Promise<void> {
    if (mcpBusy.value || !mcpAvailable.value) {
        return
    }
    const input = event.target as HTMLInputElement
    const nextEnabled = input.checked
    mcpBusy.value = true
    mcpError.value = ''
    try {
        let port: number | null = null
        if (nextEnabled && !mcpPortAuto.value) {
            const parsedPort = parseMcpPort(mcpPortInput.value)
            if (parsedPort === null) {
                input.checked = mcpRunning.value
                mcpError.value = t('dialogRenderer.aiAssistant.mcpPortInvalid')
                return
            }
            port = parsedPort
        }
        const payload = nextEnabled ? { enabled: true, port } : { enabled: false }
        const status = await invokeMcpSetEnabled(payload)
        if (status === null) {
            input.checked = mcpRunning.value
        }
    } finally {
        mcpBusy.value = false
    }
}

/**
 * 应用端口配置：自动模式提交 null（主进程优先 3847 自动选择）；固定模式校验 1~65535。
 *
 * 契约说明（主进程 `MCP.SET_ENABLED`）：`port` 仅在 `enabled=true` 时生效并持久化，
 * 因此：
 * - 服务运行中：按新端口重启监听（旧令牌失效），成功后回填主进程返回的首选端口；
 * - 服务已停止：端口偏好先记录在本页表单，下次启用时随 `{ enabled: true, port }` 提交
 *   （此时才由主进程持久化；本页提示「下次启用时生效」）。
 */
async function handleApplyMcpPort(): Promise<void> {
    if (mcpBusy.value || !mcpAvailable.value) {
        return
    }
    let port: number | null = null
    if (!mcpPortAuto.value) {
        const parsedPort = parseMcpPort(mcpPortInput.value)
        if (parsedPort === null) {
            mcpError.value = t('dialogRenderer.aiAssistant.mcpPortInvalid')
            return
        }
        port = parsedPort
    }
    mcpError.value = ''
    // 服务未运行：端口仅记录在表单（契约规定 port 随 enabled=true 提交才生效/持久化）
    if (!mcpRunning.value) {
        showMcpMessage(t('dialogRenderer.aiAssistant.mcpPortPending'))
        return
    }
    mcpBusy.value = true
    try {
        const status = await invokeMcpSetEnabled({ enabled: true, port })
        if (status !== null) {
            showMcpMessage(t('dialogRenderer.aiAssistant.saved'))
        }
    } finally {
        mcpBusy.value = false
    }
}

/** 重置访问令牌（服务需处于运行态；成功后旧令牌立即失效，需同步更新外部 Agent 配置） */
async function handleRegenerateMcpToken(): Promise<void> {
    if (mcpBusy.value || !mcpAvailable.value || !mcpRunning.value) {
        return
    }
    mcpBusy.value = true
    mcpError.value = ''
    try {
        const status = await invokeMcpSetEnabled({ enabled: true, regenerateToken: true })
        if (status !== null) {
            showMcpMessage(t('dialogRenderer.aiAssistant.saved'))
        }
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
        }, TOKEN_COPIED_RESET_MS)
    } catch (error) {
        logger.error('[Settings] 复制 MCP 令牌失败：', error)
        mcpError.value = t('dialogRenderer.aiAssistant.mcpCopyFailed')
    }
}

onMounted(() => {
    void loadAiConfig()
    void loadMcpStatus()
})

onBeforeUnmount(() => {
    if (aiMessageTimer !== null) {
        clearTimeout(aiMessageTimer)
        aiMessageTimer = null
    }
    if (mcpMessageTimer !== null) {
        clearTimeout(mcpMessageTimer)
        mcpMessageTimer = null
    }
    if (tokenCopiedTimer !== null) {
        clearTimeout(tokenCopiedTimer)
        tokenCopiedTimer = null
    }
})
</script>

<style scoped>
/* 公共样式（面板标题/分组/行/输入控件）见 settings-panel.css；
   本页新增样式全部消费 --ui-* / 主题令牌，四风格 × 三密度由令牌驱动。 */
@import './settings-panel.css';

.ai-enabled-checkbox {
    flex: 0 0 auto;
}

/* apiKeyStorage 形态提示（安全存储 / 仅本会话） */
.ai-storage-hint {
    margin: 0 0 12px;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-text-secondary, var(--secondary-text-color));
}

/* 空态引导 */
.ai-models-empty {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 8px;
    padding: 16px;
    border: 1px dashed var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-bg, var(--bg-color));
}

.ai-models-empty-title {
    margin: 0;
    font-size: 13px;
    color: var(--ui-text, var(--text-color));
}

/* 模型列表 */
.ai-model-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
}

.ai-model-item {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-bg, var(--bg-color));
}

.ai-model-head {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.ai-model-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--ui-text, var(--text-color));
}

.ai-model-type {
    font-size: 12px;
    color: var(--ui-text-secondary, var(--secondary-text-color));
}

.ai-badge {
    padding: 0 8px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 2px);
    font-size: 12px;
    line-height: 20px;
}

.ai-default-badge {
    color: var(--ui-accent, var(--accent-color));
    border-color: var(--ui-accent, var(--accent-color));
}

.ai-key-badge {
    color: var(--ui-success, var(--accent-color));
    border-color: var(--ui-success, var(--accent-color));
}

.ai-model-id {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 12px;
    color: var(--ui-text-secondary, var(--secondary-text-color));
    word-break: break-all;
}

.ai-model-actions,
.ai-form-actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--ui-pad, 8px);
}

.ai-model-add-row {
    display: flex;
}

/* 添加 / 编辑表单 */
.ai-model-form {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 16px;
    padding: 12px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-bg, var(--bg-color));
}

.ai-form-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ui-text, var(--text-color));
    padding-bottom: 8px;
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
}

.ai-api-key-input {
    min-width: 240px;
}

/* 已保存密钥：掩码 + 清除按钮 */
.ai-key-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--ui-text, var(--text-color));
}

.ai-key-mask {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--ui-text-secondary, var(--secondary-text-color));
}

.ai-test-result {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
}

.ai-privacy-note,
.mcp-security-note,
.mcp-restart-hint {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-text-secondary, var(--secondary-text-color));
}

.ai-success,
.mcp-success {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-success, var(--accent-color));
}

.ai-error,
.mcp-error {
    margin: 8px 0 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--ui-danger, var(--danger-color));
}

/* ==================== MCP 服务 ==================== */
.mcp-server-status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    margin-bottom: 8px;
    font-size: 12px;
    color: var(--ui-text, var(--text-color));
}

.mcp-server-status-badge {
    padding: 0 8px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 2px);
    background: var(--ui-bg, var(--bg-color));
    font-weight: 600;
}

.mcp-server-status-badge.is-running {
    color: var(--ui-accent, var(--accent-color));
    border-color: var(--ui-accent, var(--accent-color));
}

.mcp-server-status-badge.is-stopped {
    color: var(--ui-text-secondary, var(--secondary-text-color));
}

.mcp-server-meta {
    color: var(--ui-text, var(--text-color));
}

.mcp-server-url {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 12px;
    color: var(--ui-accent, var(--accent-color));
    word-break: break-all;
}

/* 端口配置行 */
.mcp-port-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
}

.mcp-port-auto-label {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: var(--ui-text, var(--text-color));
}

.mcp-port-input {
    width: 120px;
}

/* 7 个只读工具清单 */
.mcp-tools-list {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 12px 0 0;
    padding: 0;
    list-style: none;
}

.mcp-tool-name {
    display: inline-block;
    padding: 0 8px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 2px);
    background: var(--ui-bg, var(--bg-color));
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 12px;
    line-height: 20px;
    color: var(--ui-text, var(--text-color));
}

/* 令牌行 */
.mcp-token-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 12px 0 0;
    font-size: 12px;
    color: var(--ui-text, var(--text-color));
}

.mcp-token-value {
    flex: 0 1 auto;
    max-width: 100%;
    padding: 4px 8px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 2px);
    background: var(--ui-bg, var(--bg-color));
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 12px;
    color: var(--ui-text, var(--text-color));
    word-break: break-all;
}
</style>
