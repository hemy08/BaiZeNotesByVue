<template>
    <div class="panel">
        <div class="setting-group">
            <label class="setting-label">{{
                t('dialogRenderer.themeSetting.labelEditorFont')
            }}</label>
            <select v-model="editorFont" class="setting-select">
                <option v-for="font in EDITOR_FONT_OPTIONS" :key="font" :value="font">
                    {{ font }}
                </option>
            </select>
        </div>

        <div class="setting-group">
            <label class="setting-label">{{
                t('dialogRenderer.themeSetting.labelPreviewFont')
            }}</label>
            <select v-model="previewFont" class="setting-select">
                <option v-for="font in PREVIEW_FONT_OPTIONS" :key="font" :value="font">
                    {{ font }}
                </option>
            </select>
        </div>

        <div class="setting-group">
            <label class="setting-label">{{
                t('dialogRenderer.themeSetting.labelFontSize')
            }}</label>
            <input v-model="fontSize" type="number" class="setting-input" min="10" max="32" />
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 字体设置页签（设置对话框二期拆分；原 ThemeSettingDialog.vue 的
 * activePanel === 'font-settings' 区段）
 *
 * 契约：props.fonts 为壳层 composable 持有的字体草稿（只读），字段修改经
 * emit('update', 补丁) 上报；字体草稿不参与主题配置的保存/取消（与拆分前一致）。
 */
import { computed } from 'vue'
import { t } from '../../../../common/i18n'
import { EDITOR_FONT_OPTIONS, PREVIEW_FONT_OPTIONS, type ThemeFontSettings } from './model'

const props = defineProps<{
    /** 字体设置草稿（壳层唯一数据源） */
    fonts: ThemeFontSettings
}>()

const emit = defineEmits<{
    (e: 'update', patch: Partial<ThemeFontSettings>): void
}>()

const editorFont = computed<string>({
    get: () => props.fonts.editorFont,
    set: (value) => emit('update', { editorFont: value })
})
const previewFont = computed<string>({
    get: () => props.fonts.previewFont,
    set: (value) => emit('update', { previewFont: value })
})
const fontSize = computed<number>({
    get: () => props.fonts.fontSize,
    set: (value) => emit('update', { fontSize: value })
})
</script>

<style scoped>
/* 字体设置项公共样式（.setting-group / .setting-label / .setting-select / .setting-input）见 settings-panel.css。 */
@import './settings-panel.css';
</style>
