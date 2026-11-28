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
            1.5.7 LLM Wiki L1 / 迁移批次：工作区模式（传统模式 / LLM Wiki 模式）。
            说明：切到 llm-wiki 时打开统一迁移弹窗（三处入口共用），用户在弹窗内选择迁移方式/
            范围/编译选项后由弹窗执行「迁移（可选）→ 初始化 raw/ 与 wiki/ → 写系统配置」；
            取消则下拉回退、不写草稿不调通道。成功后由完成监听同步本面板草稿。
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
                    :disabled="workspaceModeSwitchState.busy"
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
            1.5.7 体验升级 B：原「MCP 服务」「AI 助手」两个分组已迁移到系统设置第 7 页签
            「AI 助手」（system-setting/AiAssistantPanel.vue）；本页只保留纯功能开关，
            避免「功能」页承载需要独立保存/多模型管理的配置。
        -->
    </div>
</template>

<script setup lang="ts">
/**
 * 功能开关页签（2026-11-21 用户选定）：
 * - A2 全工作区搜索、A8 粘贴/复制增强、A9 命令面板为默认能力，只展示不可关闭；
 * - A1/A3/A4/A6/A7/A10 为可选能力，默认关闭，开关按 shared/constants/feature-flags.ts 驱动；
 * - 1.5.7 LLM Wiki L1：新增「工作区」分组的工作区模式下拉（traditional / llm-wiki）；
 * - 1.5.7 迁移批次：从 traditional 切到 llm-wiki 不再使用本面板内联确认框，而是打开统一
 *   迁移弹窗（`MigrationWizardDialog`，三处入口共用）：用户选择迁移方式/范围/编译选项后，
 *   弹窗执行「迁移（可选）→ 初始化 → 写系统配置」，成功后经完成监听把模式同步到本面板草稿，
 *   「保存」仍沿用设置页既有 config:write('system') 通道。
 * - 1.5.7 体验升级 B：原「MCP 服务」「AI 助手」分组已整组迁移至「AI 助手」独立页签
 *   （AiAssistantPanel.vue），本页不再直接调用 MCP/AI IPC。
 *
 * 契约与其它 panel 一致：settings 只读，修改经 emit('update') 回壳层共享草稿。
 */
import { computed, onBeforeUnmount, onMounted } from 'vue'
import { t } from '../../../../common/i18n'
import InfoTip from '../../../common/InfoTip.vue'
import {
    onWorkspaceModeSwitchCompleted,
    requestSwitchToLlmWiki,
    workspaceModeSwitchState
} from '../../../../composables/useWorkspaceModeSwitch'
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

/**
 * 下拉变更：
 * - llm-wiki → traditional：直接写入草稿（不删除已创建目录，符合产品约定）；
 * - traditional → llm-wiki：不立即写草稿，打开统一迁移弹窗（三处入口共用同一流程：
 *   迁移方式/范围/编译选项 → 迁移 → 初始化 → 写系统配置），成功后由完成监听同步草稿；
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
        requestSwitchToLlmWiki()
        return
    }
    workspaceMode.value = WORKSPACE_MODE_TRADITIONAL
}

/**
 * 迁移弹窗完成监听：模式已写入系统配置后，把草稿同步为 llm-wiki。
 *
 * 说明：弹窗本身已把模式写入系统配置（与菜单栏/边栏入口一致，无需再点「保存」）；
 * 同步草稿只为避免本面板仍显示旧值、以及用户随后点「保存」时用旧草稿覆盖配置。
 */
let unsubscribeSwitchCompleted: (() => void) | null = null

onMounted(() => {
    unsubscribeSwitchCompleted = onWorkspaceModeSwitchCompleted((outcome) => {
        if (outcome.switched) {
            workspaceMode.value = WORKSPACE_MODE_LLM_WIKI
        }
    })
})

onBeforeUnmount(() => {
    unsubscribeSwitchCompleted?.()
    unsubscribeSwitchCompleted = null
})
</script>

<style scoped>
/* 公共样式（面板标题/分组/行/输入控件）见 settings-panel.css。 */
@import './settings-panel.css';

/* 工作区模式下拉：复用 .setting-select 宽度，不额外覆盖尺寸（UI-09/UI-10 令牌口径） */
.workspace-mode-select {
    flex: 0 0 auto;
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
</style>
