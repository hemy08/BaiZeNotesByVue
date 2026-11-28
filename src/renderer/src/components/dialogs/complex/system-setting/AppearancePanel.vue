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
                <span class="group-title-text">{{
                    t('dialogRenderer.systemSetting.groupTheme')
                }}</span>
            </div>
            <!-- 批次 C #10：应用主题收口到主题设置对话框（方案 A）——
                             下拉替换为只读显示当前主题 + 「打开主题设置」按钮，
                             复用菜单动作同款调用链（configStore.showDialog('themeSettings')），
                             不新增 IPC；主题切换路径唯一（主题设置对话框）。 -->
            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label">{{
                        t('dialogRenderer.systemSetting.labelAppTheme')
                    }}</label>
                    <!-- 1.5.6 UI 简洁化：主题由主题设置对话框托管的说明 → ⓘ 悬停提示 -->
                    <InfoTip :text="t('dialogRenderer.systemSetting.hintThemeManaged')" />
                </div>
                <div class="theme-current-group">
                    <span class="theme-current-name">{{ themeDisplay }}</span>
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
                <div class="setting-label-group">
                    <label class="setting-label">{{
                        t('dialogRenderer.systemSetting.labelUseSystemTheme')
                    }}</label>
                    <!-- 1.5.6 UI 简洁化：跟随系统与手动选主题互斥的语义说明 → ⓘ 悬停提示 -->
                    <InfoTip :text="t('dialogRenderer.systemSetting.hintUseSystemTheme')" />
                </div>
                <input v-model="useSystemTheme" type="checkbox" class="setting-checkbox" />
            </div>
        </div>

        <div class="settings-group">
            <div class="group-title">
                <span class="group-title-text">{{
                    t('dialogRenderer.systemSetting.groupFont')
                }}</span>
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
        <div class="settings-group">
            <div class="group-title">
                <span class="group-title-text">{{
                    t('dialogRenderer.systemSetting.groupUiAppearance')
                }}</span>
                <!-- 1.5.6 UI 简洁化：风格/密度默认值与玻璃降级的长说明 → ⓘ 悬停提示 -->
                <InfoTip :text="t('dialogRenderer.systemSetting.hintUiAppearance')" />
            </div>
            <!-- 视觉升级（P0）：三项外观配置默认 workbench + default = 升级前现状，
                 用户主动切换后才改变材质/密度；glass 标注实验性（小面积模糊，性能提示）。 -->
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelUiStyle')
                }}</label>
                <select v-model="uiStyle" class="setting-select" data-testid="ui-style-select">
                    <option value="paper">
                        {{ t('dialogRenderer.systemSetting.uiStylePaper') }}
                    </option>
                    <option value="glass">
                        {{ t('dialogRenderer.systemSetting.uiStyleGlass') }}
                    </option>
                    <option value="workbench">
                        {{ t('dialogRenderer.systemSetting.uiStyleWorkbench') }}
                    </option>
                    <option value="hybrid">
                        {{ t('dialogRenderer.systemSetting.uiStyleHybrid') }}
                    </option>
                </select>
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelUiDensity')
                }}</label>
                <select v-model="uiDensity" class="setting-select" data-testid="ui-density-select">
                    <option value="compact">
                        {{ t('dialogRenderer.systemSetting.uiDensityCompact') }}
                    </option>
                    <option value="default">
                        {{ t('dialogRenderer.systemSetting.uiDensityDefault') }}
                    </option>
                    <option value="spacious">
                        {{ t('dialogRenderer.systemSetting.uiDensitySpacious') }}
                    </option>
                </select>
            </div>
            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label">{{
                        t('dialogRenderer.systemSetting.labelReduceTransparency')
                    }}</label>
                    <!-- 1.5.6 UI 简洁化：减少透明效果的行为解释 → ⓘ 悬停提示 -->
                    <InfoTip :text="t('dialogRenderer.systemSetting.hintReduceTransparency')" />
                </div>
                <input
                    v-model="uiReduceTransparency"
                    type="checkbox"
                    class="setting-checkbox"
                    data-testid="ui-reduce-transparency"
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
import InfoTip from '../../../common/InfoTip.vue'
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
// 视觉升级（P0）：界面风格 / 界面密度 / 减少透明效果
const uiStyle = field('uiStyle')
const uiDensity = field('uiDensity')
const uiReduceTransparency = field('uiReduceTransparency')

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
