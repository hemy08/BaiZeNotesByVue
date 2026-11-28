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
import { computed, ref } from 'vue'
import { t } from '../../../../common/i18n'
import { initializeLlmWiki } from '../../../../common/llm-wiki-actions'
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
