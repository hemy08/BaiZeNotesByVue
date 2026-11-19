<template>
    <div class="setting-panel">
        <div class="panel-header">
            <h3>
                {{ t('dialogRenderer.systemSetting.panelGeneralTitle') }}
            </h3>
            <p>
                {{ t('dialogRenderer.systemSetting.panelGeneralDesc') }}
            </p>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.systemSetting.groupStartup') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelAutoOpenLastFile')
                }}</label>
                <input v-model="autoOpenLastFile" type="checkbox" class="setting-checkbox" />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelAutoOpenLastFolder')
                }}</label>
                <input v-model="autoOpenLastFolder" type="checkbox" class="setting-checkbox" />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelAutoStart')
                }}</label>
                <input
                    v-model="autoStart"
                    type="checkbox"
                    class="setting-checkbox"
                    :title="t('dialogRenderer.systemSetting.hintAutoStart')"
                />
            </div>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.systemSetting.groupWindow') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelMinimizeToTray')
                }}</label>
                <input v-model="minimizeToTray" type="checkbox" class="setting-checkbox" />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelRememberWindowSize')
                }}</label>
                <input v-model="rememberWindowSize" type="checkbox" class="setting-checkbox" />
            </div>
        </div>

        <!-- CMP-30：界面语言选择（保存后主进程刷新语言并广播，渲染层即时切换） -->
        <div class="settings-group">
            <div class="group-title">
                {{ t('settings.language.group') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{ t('settings.language.label') }}</label>
                <select v-model="language" class="setting-select">
                    <option value="zh-CN">
                        {{ t('settings.language.zhCN') }}
                    </option>
                    <option value="en-US">
                        {{ t('settings.language.enUS') }}
                    </option>
                </select>
            </div>
        </div>

        <!-- AS-9（P3 隐私）：远程图片加载开关，默认关闭；保存后主进程广播 system-setting-update，
            预览（MarkdownPreviewComponent）据此拦截/放行远程图片，无需重启。 -->
        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.systemSetting.groupPrivacy') }}
            </div>
            <p class="group-hint">
                {{ t('dialogRenderer.systemSetting.hintAllowRemoteImages') }}
            </p>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelAllowRemoteImages')
                }}</label>
                <input v-model="allowRemoteImages" type="checkbox" class="setting-checkbox" />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 通用设置页签（设置页拆分 P0；原 SystemSettingDialog.vue 的 activePanel === 'general' 区段）。
 *
 * 契约：props.settings 为壳层共享草稿（只读），字段修改经 emit('update', 补丁) 上报，
 * 不在本组件内保存/加载/校验（统一由壳层 useSystemSettingForm 承担）。
 */
import { t } from '../../../../common/i18n'
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

const autoOpenLastFile = field('autoOpenLastFile')
const autoOpenLastFolder = field('autoOpenLastFolder')
const autoStart = field('autoStart')
const minimizeToTray = field('minimizeToTray')
const rememberWindowSize = field('rememberWindowSize')
const language = field('language')
const allowRemoteImages = field('allowRemoteImages')
</script>

<style scoped>
/* 公共样式（面板标题/分组/行/输入控件）见 settings-panel.css；本页签无专有样式。 */
@import './settings-panel.css';
</style>
