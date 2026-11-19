<template>
    <div class="setting-panel">
        <div class="panel-header">
            <h3>
                {{ t('dialogRenderer.editorSetting.panelMarkdownTitle') }}
            </h3>
            <p>
                {{ t('dialogRenderer.editorSetting.panelMarkdownDesc') }}
            </p>
            <!-- P1-FE-05：以下 4 项无 Monaco/渲染层消费方，禁用并标注「暂未实现」 -->
            <p class="panel-hint panel-hint-warning">
                {{ t('dialogRenderer.editorSetting.hintNotImplemented') }}
            </p>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.editorSetting.groupLivePreview') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelEnableLivePreview')
                }}</label>
                <input
                    v-model="enableLivePreview"
                    type="checkbox"
                    class="setting-checkbox"
                    disabled
                    :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelPreviewDelay')
                }}</label>
                <input
                    v-model.number="previewDelay"
                    type="number"
                    class="setting-input"
                    min="100"
                    max="2000"
                    disabled
                    :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                />
            </div>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.editorSetting.groupSyntaxHighlight') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelEnableCodeHighlight')
                }}</label>
                <input
                    v-model="enableCodeHighlight"
                    type="checkbox"
                    class="setting-checkbox"
                    disabled
                    :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.editorSetting.labelEnableLinkHighlight')
                }}</label>
                <input
                    v-model="enableLinkHighlight"
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
 * Markdown 设置页签（设置对话框二期拆分；原 EditorSettingDialog.vue 的 activePanel === 'markdown' 区段）
 *
 * 契约：props.settings 为壳层共享草稿（只读），字段修改经 emit('update', 补丁) 上报。
 * 本页签 4 项无 Monaco/渲染层消费方，保持拆分前的 disabled + 「暂未实现」标注。
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

const enableLivePreview = field('enableLivePreview')
const previewDelay = field('previewDelay')
const enableCodeHighlight = field('enableCodeHighlight')
const enableLinkHighlight = field('enableLinkHighlight')
</script>

<style scoped>
/* 公共样式（面板标题/提示/分组/行/输入控件）见 settings-panel.css；本页签无专有样式。 */
@import './settings-panel.css';
</style>
