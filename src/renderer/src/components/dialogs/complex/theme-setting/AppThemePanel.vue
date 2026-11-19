<template>
    <div class="panel">
        <div class="theme-list">
            <div v-for="category in categories" :key="category.nameKey" class="theme-category">
                <h3 class="category-title">
                    {{ t(category.nameKey) }}
                </h3>
                <div class="theme-grid">
                    <ThemePreviewCard
                        v-for="theme in category.themes"
                        :key="theme.type"
                        :selected="currentTheme === theme.type"
                        :name="getThemeDisplayName(theme)"
                        :description="getThemeDisplayDesc(theme)"
                        :preview-style="getThemePreviewStyle(theme)"
                        :title-bar-style="getThemeTitleBarStyle(theme)"
                        :sidebar-style="getThemeSidebarStyle(theme)"
                        :lines="getThemePreviewLines(theme)"
                        :color-dots="getThemeColorDots(theme)"
                        @select="emit('select', theme.type)"
                    />
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 应用主题页签（设置对话框二期拆分；原 ThemeSettingDialog.vue 的 activePanel === 'app-theme' 区段）
 *
 * 契约：props.categories 为壳层 composable 按 THEME_GROUPS 生成的分组（只读），
 * currentTheme 为当前选中主题 type；点击卡片只 emit('select', themeType)，
 * 由壳层更新草稿并立即 emit('change')（与拆分前 selectTheme 的即时应用链路一致）。
 */
import { t } from '../../../../common/i18n'
import ThemePreviewCard from './ThemePreviewCard.vue'
import {
    getThemeColorDots,
    getThemeDisplayDesc,
    getThemeDisplayName,
    getThemePreviewLines,
    getThemePreviewStyle,
    getThemeSidebarStyle,
    getThemeTitleBarStyle,
    type ThemeCategory
} from './model'

defineProps<{
    /** 应用主题分组（THEME_GROUPS 生成） */
    categories: ThemeCategory[]
    /** 当前选中应用主题 type */
    currentTheme: string
}>()

const emit = defineEmits<{
    (e: 'select', themeType: string): void
}>()
</script>

<style scoped>
/* 页签容器/分组/网格公共样式见 settings-panel.css；卡片样式见 ThemePreviewCard.vue。 */
@import './settings-panel.css';
</style>
