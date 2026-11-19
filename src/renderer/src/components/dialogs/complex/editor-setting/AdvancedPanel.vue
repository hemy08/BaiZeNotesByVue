<template>
    <div class="setting-panel">
        <div class="panel-header">
            <h3>
                {{ t('dialogRenderer.editorSetting.panelAdvancedTitle') }}
            </h3>
            <p>
                {{ t('dialogRenderer.editorSetting.panelAdvancedDesc') }}
            </p>
            <!-- P1-FE-05：以下 3 项无消费方，禁用并标注「暂未实现」 -->
            <p class="panel-hint panel-hint-warning">
                {{ t('dialogRenderer.editorSetting.hintNotImplemented') }}
            </p>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.editorSetting.groupPerformance') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelMaxFileSize')
                }}</label>
                <input
                    v-model.number="maxFileSize"
                    type="number"
                    class="setting-input"
                    min="1"
                    max="100"
                    disabled
                    :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelRenderDelay')
                }}</label>
                <input
                    v-model.number="renderDelay"
                    type="number"
                    class="setting-input"
                    min="50"
                    max="500"
                    disabled
                    :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                />
            </div>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.editorSetting.groupExperimental') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelEnableExperimental')
                }}</label>
                <input
                    v-model="enableExperimental"
                    type="checkbox"
                    class="setting-checkbox"
                    disabled
                    :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 高级设置页签（设置对话框二期拆分；原 EditorSettingDialog.vue 的 activePanel === 'advanced' 区段）
 *
 * 契约：props.settings 为壳层共享草稿（只读），字段修改经 emit('update', 补丁) 上报。
 * 本页签 3 项无消费方，保持拆分前的 disabled + 「暂未实现」标注。
 */
import { t } from '../../../../common/i18n'
import type { EditorDialogSettings } from './model'
import { usePanelFields } from './panel-model'

const props = defineProps<{ settings: EditorDialogSettings }>()
const emit = defineEmits<{
    (e: 'update', patch: Partial<EditorDialogSettings>): void
}>()

const field = usePanelFields(
    () => props.settings,
    (patch) => emit('update', patch)
)

const maxFileSize = field('maxFileSize')
const renderDelay = field('renderDelay')
const enableExperimental = field('enableExperimental')
</script>

<style scoped>
/* 公共样式（面板标题/提示/分组/行/输入控件）见 settings-panel.css；本页签无专有样式。 */
@import './settings-panel.css';
</style>
