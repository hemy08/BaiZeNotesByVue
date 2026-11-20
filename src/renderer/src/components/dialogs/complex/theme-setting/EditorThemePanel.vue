<template>
    <div class="panel">
        <!-- P2 功能错误处理修复：编辑器主题加载失败/为空时不再空白——错误文案 + 重试。 -->
        <div v-if="errorMessage" class="panel-state panel-state-error" role="alert">
            <p class="panel-state-text">{{ errorMessage }}</p>
            <button type="button" class="panel-retry-btn" @click="emit('retry')">
                {{ t('dialogRenderer.common.retry') }}
            </button>
        </div>
        <div v-else-if="loading" class="panel-state panel-state-loading" role="status">
            {{ t('dialogRenderer.common.loading') }}
        </div>
        <div v-else-if="themes.length === 0" class="panel-state panel-state-empty">
            <p class="panel-state-text">{{ t('dialogRenderer.themeSetting.emptyState') }}</p>
            <button type="button" class="panel-retry-btn" @click="emit('retry')">
                {{ t('dialogRenderer.common.retry') }}
            </button>
        </div>
        <div v-else class="monaco-theme-list">
            <ThemePreviewCard
                v-for="theme in themes"
                :key="theme.type"
                :selected="currentMonacoTheme === theme.type"
                :name="getMonacoThemeDisplayName(theme)"
                :description="getMonacoThemeDisplayDesc(theme)"
                :preview-style="getMonacoPreviewStyle(theme)"
                :title-bar-style="getMonacoTitleBarStyle(theme)"
                :sidebar-style="getMonacoSidebarStyle(theme)"
                :lines="getMonacoPreviewLines(theme)"
                :color-dots="getMonacoColorDots(theme)"
                @select="emit('select', theme.type)"
            />
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 编辑器主题页签（设置对话框二期拆分；原 ThemeSettingDialog.vue 的
 * activePanel === 'editor-theme' 区段）
 *
 * 契约：props.themes 为壳层加载的编辑器主题视图项（只读），currentMonacoTheme 为当前选中 type；
 * 点击只 emit('select', themeType) 更新草稿——实际应用走「应用/确定」→ emit('change') 链路
 * （P2 死通道清理后不再有任何即时 IPC 发送点）。
 *
 * P2 功能错误处理修复（F-04）：与 AppThemePanel 一致新增 loading / errorMessage / retry——
 * 主题列表加载失败或为空时显示降级提示，避免首开空白面板无任何反馈。
 */
import { t } from '../../../../common/i18n'
import ThemePreviewCard from './ThemePreviewCard.vue'
import {
    getMonacoColorDots,
    getMonacoPreviewLines,
    getMonacoPreviewStyle,
    getMonacoSidebarStyle,
    getMonacoThemeDisplayDesc,
    getMonacoThemeDisplayName,
    getMonacoTitleBarStyle,
    type MonacoThemeViewItem
} from './model'

withDefaults(
    defineProps<{
        /** 编辑器主题视图项（含预览配色） */
        themes: MonacoThemeViewItem[]
        /** 当前选中编辑器主题 type */
        currentMonacoTheme: string
        /** 主题列表是否加载中（可选，默认 false） */
        loading?: boolean
        /** 加载失败文案（可选，默认空串 = 无错误；非空时显示错误态 + 重试） */
        errorMessage?: string
    }>(),
    { loading: false, errorMessage: '' }
)

const emit = defineEmits<{
    (e: 'select', monacoTheme: string): void
    (e: 'retry'): void
}>()
</script>

<style scoped>
/* 页签容器/网格公共样式见 settings-panel.css；卡片样式见 ThemePreviewCard.vue。 */
@import './settings-panel.css';
</style>
