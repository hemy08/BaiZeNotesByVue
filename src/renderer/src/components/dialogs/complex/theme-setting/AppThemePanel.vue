<template>
    <div class="panel">
        <!-- P2 功能错误处理修复：主题列表加载失败不再显示空白面板——显示错误文案与「重试」
             按钮（重试由壳层重新调用 loadThemes）；加载中显示加载态；加载成功但列表为空时
             显示可重试的空态提示。 -->
        <div v-if="errorMessage" class="panel-state panel-state-error" role="alert">
            <p class="panel-state-text">{{ errorMessage }}</p>
            <button type="button" class="panel-retry-btn" @click="emit('retry')">
                {{ t('dialogRenderer.common.retry') }}
            </button>
        </div>
        <div v-else-if="loading" class="panel-state panel-state-loading" role="status">
            {{ t('dialogRenderer.common.loading') }}
        </div>
        <div v-else-if="isEmpty" class="panel-state panel-state-empty">
            <p class="panel-state-text">{{ t('dialogRenderer.themeSetting.emptyState') }}</p>
            <button type="button" class="panel-retry-btn" @click="emit('retry')">
                {{ t('dialogRenderer.common.retry') }}
            </button>
        </div>
        <div v-else class="theme-list">
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
 *
 * P2 功能错误处理修复（F-04）：新增 loading / errorMessage 两个只读状态——
 * - loading：壳层 loadThemes 进行中，显示加载态（避免首开空白）；
 * - errorMessage 非空：加载失败，显示错误文案 + 「重试」按钮（emit('retry')）；
 * - 加载成功但 3 组均无主题：显示空态提示 + 「重试」按钮；
 * 三者都不改变原有卡片渲染/选择契约。
 */
import { computed } from 'vue'
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

const props = withDefaults(
    defineProps<{
        /** 应用主题分组（THEME_GROUPS 生成） */
        categories: ThemeCategory[]
        /** 当前选中应用主题 type */
        currentTheme: string
        /** 主题列表是否加载中（可选，默认 false；壳层 loadThemes 期间为 true） */
        loading?: boolean
        /** 加载失败文案（可选，默认空串 = 无错误；非空时显示错误态 + 重试） */
        errorMessage?: string
    }>(),
    { loading: false, errorMessage: '' }
)

const emit = defineEmits<{
    (e: 'select', themeType: string): void
    (e: 'retry'): void
}>()

/** 加载成功但 3 个分组均无主题（主进程返回空列表/全部为未知主题）→ 空态提示 */
const isEmpty = computed(() => props.categories.every((category) => category.themes.length === 0))
</script>

<style scoped>
/* 页签容器/分组/网格公共样式见 settings-panel.css；卡片样式见 ThemePreviewCard.vue。 */
@import './settings-panel.css';
</style>
