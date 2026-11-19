<template>
    <div class="setting-panel">
        <div class="panel-header">
            <h3>
                {{ t('dialogRenderer.editorSetting.panelAppearanceTitle') }}
            </h3>
            <p>
                {{ t('dialogRenderer.editorSetting.panelAppearanceDesc') }}
            </p>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.editorSetting.groupCursor') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelCursorStyle')
                }}</label>
                <select v-model="cursorStyle" class="setting-select">
                    <option value="line">
                        {{ t('dialogRenderer.editorSetting.cursorLine') }}
                    </option>
                    <option value="block">
                        {{ t('dialogRenderer.editorSetting.cursorBlock') }}
                    </option>
                    <option value="underline">
                        {{ t('dialogRenderer.editorSetting.cursorUnderline') }}
                    </option>
                    <option value="blink">
                        {{ t('dialogRenderer.editorSetting.cursorBlink') }}
                    </option>
                </select>
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelCursorWidth')
                }}</label>
                <input
                    v-model.number="cursorWidth"
                    type="range"
                    class="setting-range"
                    min="1"
                    max="5"
                />
            </div>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.editorSetting.groupFont') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelFontSize')
                }}</label>
                <input
                    v-model.number="fontSize"
                    type="number"
                    class="setting-input"
                    min="10"
                    max="24"
                />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelLineHeight')
                }}</label>
                <input
                    v-model.number="lineHeight"
                    type="number"
                    class="setting-input"
                    min="1"
                    max="3"
                    step="0.1"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 外观设置页签（设置对话框二期拆分；原 EditorSettingDialog.vue 的 activePanel === 'appearance' 区段）
 *
 * 契约：props.settings 为壳层共享草稿（只读），字段修改经 emit('update', 补丁) 上报。
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

const cursorStyle = field('cursorStyle')
const cursorWidth = field('cursorWidth')
const fontSize = field('fontSize')
const lineHeight = field('lineHeight')
</script>

<style scoped>
/* 公共样式（面板标题/分组/行/输入控件）见 settings-panel.css；本页签无专有样式。 */
@import './settings-panel.css';
</style>
