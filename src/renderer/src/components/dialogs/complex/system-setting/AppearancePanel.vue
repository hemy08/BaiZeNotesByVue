<template>
    <div class="setting-panel">
        <div class="panel-header">
            <h3>
                {{ t('dialogRenderer.systemSetting.panelAppearanceTitle') }}
            </h3>
            <p>
                {{ t('dialogRenderer.systemSetting.panelAppearanceDesc') }}
            </p>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.systemSetting.groupTheme') }}
            </div>
            <!-- 批次 C #10：应用主题收口到主题设置对话框（方案 A）——
                             下拉替换为只读显示当前主题 + 「打开主题设置」按钮，
                             复用菜单动作同款调用链（configStore.showDialog('themeSettings')），
                             不新增 IPC；主题切换路径唯一（主题设置对话框）。 -->
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelAppTheme')
                }}</label>
                <div class="theme-current-group">
                    <span
                        class="theme-current-name"
                        :title="t('dialogRenderer.systemSetting.hintThemeManaged')"
                    >
                        {{ themeDisplay }}
                    </span>
                    <button class="browse-btn" @click="emitOpenThemeSetting">
                        {{ t('dialogRenderer.systemSetting.labelOpenThemeSetting') }}
                    </button>
                </div>
            </div>
            <!--
                P2 剩余静默失败提示：应用主题显示名读取失败时显示内联降级提示（非阻断）。
                不弹错误对话框：本行只是只读展示，弹窗会打断用户浏览/修改其他设置；
                用户关闭后重新打开设置即会重新读取。
            -->
            <p
                v-if="themeDisplayFallback"
                class="theme-display-fallback-hint"
                role="status"
                data-testid="theme-display-fallback-hint"
            >
                {{ t('dialogRenderer.systemSetting.themeDisplayFallbackHint') }}
            </p>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelUseSystemTheme')
                }}</label>
                <input
                    v-model="useSystemTheme"
                    type="checkbox"
                    class="setting-checkbox"
                    :title="t('dialogRenderer.systemSetting.hintUseSystemTheme')"
                />
            </div>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.systemSetting.groupFont') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelSystemFont')
                }}</label>
                <select v-model="fontFamily" class="setting-select">
                    <option value="Microsoft YaHei">
                        {{ t('dialogRenderer.systemSetting.fontMicrosoftYaHei') }}
                    </option>
                    <option value="PingFang SC">
                        {{ t('dialogRenderer.systemSetting.fontPingFang') }}
                    </option>
                    <option value="Segoe UI">Segoe UI</option>
                    <option value="Arial">Arial</option>
                </select>
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelFontSize')
                }}</label>
                <input
                    v-model.number="fontSize"
                    type="number"
                    class="setting-input"
                    min="12"
                    max="20"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 外观设置页签（设置页拆分 P0；原 SystemSettingDialog.vue 的 activePanel === 'appearance' 区段）。
 *
 * 契约：
 * - props.settings（共享草稿，只读）与本页签字段补丁 emit('update', patch)；
 * - props.themeDisplay：壳层只读应用主题显示名（来自壳层 loadSettings 的 theme 读取）；
 * - emit('open-theme-setting')：请求壳层关闭本对话框并打开主题设置（壳层负责与菜单动作
 *   同款调用链 configStore.showDialog('themeSettings')，不新增 IPC）。
 */
import { t } from '../../../../common/i18n'
import type { SystemDialogSettings } from './model'
import { usePanelFields } from './panel-model'

const props = defineProps<{
    settings: SystemDialogSettings
    /** 外观页签只读展示的应用主题显示名（i18n 映射后，由壳层加载） */
    themeDisplay: string
    /**
     * P2 剩余静默失败提示：显示名是否因读取失败而回退（true 时显示内联降级提示）。
     * 默认 false，保持既有挂载方式（仅传 settings/themeDisplay）的渲染结果不变。
     */
    themeDisplayFallback?: boolean
}>()
const emit = defineEmits<{
    (e: 'update', patch: Partial<SystemDialogSettings>): void
    (e: 'open-theme-setting'): void
}>()

const field = usePanelFields(
    () => props.settings,
    (patch) => emit('update', patch)
)

const useSystemTheme = field('useSystemTheme')
const fontFamily = field('fontFamily')
const fontSize = field('fontSize')

/** 批次 C #10：请求壳层先关闭本对话框（避免两个模态叠加）再打开主题设置 */
function emitOpenThemeSetting(): void {
    emit('open-theme-setting')
}
</script>

<style scoped>
@import './settings-panel.css';

/* 批次 C #10：应用主题只读显示 + 「打开主题设置」按钮 */
.theme-current-group {
    display: flex;
    align-items: center;
    gap: 8px;
}

.theme-current-name {
    min-width: 96px;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--secondary-text-color);
    background: var(--bg-color);
    text-align: center;
}

/* P2 剩余静默失败提示：主题显示名读取失败的内联降级提示（非阻断，跟随主题变量） */
.theme-display-fallback-hint {
    margin: 6px 0 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--secondary-text-color);
}
</style>
