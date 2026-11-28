<template>
    <div class="setting-panel">
        <div class="panel-header">
            <h3>
                {{ t('dialogRenderer.systemSetting.panelWritingTitle') }}
            </h3>
            <p>
                {{ t('dialogRenderer.systemSetting.panelWritingDesc') }}
            </p>
        </div>

        <div class="settings-group">
            <div class="group-title">
                <span class="group-title-text">{{
                    t('dialogRenderer.systemSetting.groupWritingFeatures')
                }}</span>
                <!-- 1.5.6 UI 简洁化：分组说明（默认关闭/仅写作模式生效）→ ⓘ 悬停提示 -->
                <InfoTip :text="t('dialogRenderer.systemSetting.hintWritingFeatures')" />
            </div>
            <div v-for="item in writingRows" :key="item.id" class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label" :for="`writing-${item.id}`">
                        {{ t(item.labelKey) }}
                    </label>
                    <!-- 1.5.6 UI 简洁化：各写作能力详细解释 → 标签旁 ⓘ 悬停提示（行高不再被 Desc 撑开） -->
                    <InfoTip :text="t(item.descKey)" />
                </div>
                <input
                    :id="`writing-${item.id}`"
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
 * 编写体验设置页签（P0）：
 * - 所有写作体验能力默认关闭，用户按需逐项开启；
 * - 开关定义真源：shared/constants/feature-flags.ts#WRITING_EXPERIENCE_FLAGS；
 * - 与其它 panel 一致：settings 只读，修改经 emit('update') 回壳层共享草稿。
 */
import { computed } from 'vue'
import { t } from '../../../../common/i18n'
import InfoTip from '../../../common/InfoTip.vue'
import {
    WRITING_EXPERIENCE_FLAGS,
    WRITING_EXPERIENCE_FLAG_IDS
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

const writingRows = computed(() =>
    WRITING_EXPERIENCE_FLAG_IDS.map((id) => {
        const definition = WRITING_EXPERIENCE_FLAGS[id]
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
@import './settings-panel.css';
</style>
