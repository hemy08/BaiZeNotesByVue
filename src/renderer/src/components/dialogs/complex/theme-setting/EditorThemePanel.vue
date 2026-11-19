<template>
    <div class="panel">
        <div class="monaco-theme-list">
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
 */
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

defineProps<{
    /** 编辑器主题视图项（含预览配色） */
    themes: MonacoThemeViewItem[]
    /** 当前选中编辑器主题 type */
    currentMonacoTheme: string
}>()

const emit = defineEmits<{
    (e: 'select', monacoTheme: string): void
}>()
</script>

<style scoped>
/* 页签容器/网格公共样式见 settings-panel.css；卡片样式见 ThemePreviewCard.vue。 */
@import './settings-panel.css';
</style>
