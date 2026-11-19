<template>
    <div class="setting-panel">
        <div class="panel-header">
            <h3>
                {{ t('dialogRenderer.editorSetting.panelBasicTitle') }}
            </h3>
            <p>
                {{ t('dialogRenderer.editorSetting.panelBasicDesc') }}
            </p>
            <!-- P1-FE-05：保存后主进程广播 INIT_SETTING，Monaco 立即应用 -->
            <p class="panel-hint">
                {{ t('dialogRenderer.editorSetting.hintAppliedImmediately') }}
            </p>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.editorSetting.groupAutoSave') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelEnableAutoSave')
                }}</label>
                <input v-model="autoSave" type="checkbox" class="setting-checkbox" />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelAutoSaveInterval')
                }}</label>
                <input
                    v-model.number="autoSaveInterval"
                    type="number"
                    class="setting-input"
                    min="10"
                    max="300"
                />
            </div>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.editorSetting.groupEditing') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelEnableFolding')
                }}</label>
                <input v-model="enableFolding" type="checkbox" class="setting-checkbox" />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelShowLineNumbers')
                }}</label>
                <input v-model="showLineNumbers" type="checkbox" class="setting-checkbox" />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelEnableAutoComplete')
                }}</label>
                <input v-model="enableAutoComplete" type="checkbox" class="setting-checkbox" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 基础设置页签（设置对话框二期拆分；原 EditorSettingDialog.vue 的 activePanel === 'basic' 区段）
 *
 * 契约：props.settings 为壳层共享草稿（只读），字段修改经 emit('update', 补丁) 上报，
 * 不在本组件内保存/加载/校验（统一由壳层 useEditorSettingForm 承担）。
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

const autoSave = field('autoSave')
const autoSaveInterval = field('autoSaveInterval')
const enableFolding = field('enableFolding')
const showLineNumbers = field('showLineNumbers')
const enableAutoComplete = field('enableAutoComplete')
</script>

<style scoped>
/* 公共样式（面板标题/分组/行/输入控件）见 settings-panel.css；本页签无专有样式。 */
@import './settings-panel.css';
</style>
