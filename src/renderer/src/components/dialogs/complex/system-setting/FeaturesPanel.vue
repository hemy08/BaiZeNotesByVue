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

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.systemSetting.groupDefaultFeatures') }}
            </div>
            <p class="group-hint">
                {{ t('dialogRenderer.systemSetting.hintDefaultFeatures') }}
            </p>
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
                {{ t('dialogRenderer.systemSetting.groupOptionalFeatures') }}
            </div>
            <p class="group-hint">
                {{ t('dialogRenderer.systemSetting.hintOptionalFeatures') }}
            </p>
            <div v-for="item in featureRows" :key="item.id" class="setting-row feature-row">
                <div class="feature-copy">
                    <label class="setting-label" :for="`feature-${item.id}`">
                        {{ t(item.labelKey) }}
                    </label>
                    <p class="feature-desc">
                        {{ t(item.descKey) }}
                    </p>
                </div>
                <input
                    :id="`feature-${item.id}`"
                    v-model="item.model.value"
                    type="checkbox"
                    class="setting-checkbox"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 功能开关页签（2026-11-21 用户选定）：
 * - A2 全工作区搜索、A8 粘贴/复制增强、A9 命令面板为默认能力，只展示不可关闭；
 * - A1/A3/A4/A6/A7/A10 为可选能力，默认关闭，开关按 shared/constants/feature-flags.ts 驱动。
 *
 * 契约与其它 panel 一致：settings 只读，修改经 emit('update') 回壳层共享草稿。
 */
import { computed } from 'vue'
import { t } from '../../../../common/i18n'
import {
    OPTIONAL_FEATURE_FLAGS,
    OPTIONAL_FEATURE_FLAG_IDS
} from '../../../../../../shared/constants/feature-flags'
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
</script>

<style scoped>
/* 公共样式（面板标题/分组/行/输入控件）见 settings-panel.css。 */
@import './settings-panel.css';

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

.feature-row {
    align-items: flex-start;
}

.feature-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.feature-desc {
    margin: 0;
    color: var(--secondary-text-color);
    font-size: 12px;
    line-height: 1.5;
}
</style>
