<template>
    <div class="panel">
        <!-- 2026-11-28 用户反馈「编辑器主题设置不生效」修复：
             默认 separateEditorTheme=false 时编辑器跟随应用主题（custom-theme 由应用主题配色派生），
             下方点选的 Monaco 主题只在「独立编辑器主题」开启后才真正应用。此前 Vue 版主题设置
             对话框缺少该开关（JSDOM 时代「是否单独配置编辑区主题」复选框在迁移中丢失），
             editorTheme 只被保存、从不被消费——因此这里恢复开关，并在点选主题时由壳层自动开启。
             开关始终可见：即使列表加载失败，用户也能切换回「跟随应用主题」。 -->
        <div class="editor-theme-toolbar">
            <label class="editor-theme-toggle">
                <input
                    class="editor-theme-toggle-input"
                    type="checkbox"
                    :checked="separateEditorTheme"
                    @change="handleToggleSeparate"
                />
                <span class="editor-theme-toggle-label">
                    {{ t('dialogRenderer.themeSetting.separateEditorThemeLabel') }}
                </span>
            </label>
            <p class="editor-theme-hint">
                {{
                    t(
                        separateEditorTheme
                            ? 'dialogRenderer.themeSetting.separateEditorThemeHintOn'
                            : 'dialogRenderer.themeSetting.separateEditorThemeHintOff'
                    )
                }}
            </p>
        </div>

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
 *
 * 2026-11-28 用户反馈修复（编辑器主题不生效）：新增 `separateEditorTheme` 只读 prop 与
 * 「独立编辑器主题」开关（emit('toggle-separate', checked)）。开关关闭 = 编辑器跟随应用主题
 * 配色（与 1.5.5 及以前默认行为一致）；开启 = 使用下方所选 Monaco 主题。页签自身不持有
 * 任何状态（草稿仍由壳层 composable 唯一持有），点选卡片也只 emit('select')。
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
        /** 是否使用独立编辑器主题（开关 checked 状态；true = 应用所选 Monaco 主题） */
        separateEditorTheme?: boolean
        /** 主题列表是否加载中（可选，默认 false） */
        loading?: boolean
        /** 加载失败文案（可选，默认空串 = 无错误；非空时显示错误态 + 重试） */
        errorMessage?: string
    }>(),
    { separateEditorTheme: false, loading: false, errorMessage: '' }
)

const emit = defineEmits<{
    (e: 'select', monacoTheme: string): void
    (e: 'toggle-separate', value: boolean): void
    (e: 'retry'): void
}>()

/** 开关切换：只上报新值，草稿由壳层唯一持有（与其它状态的事件上报口径一致） */
function handleToggleSeparate(event: Event): void {
    const target = event.target as HTMLInputElement | null
    emit('toggle-separate', Boolean(target?.checked))
}
</script>

<style scoped>
/* 页签容器/网格公共样式见 settings-panel.css；卡片样式见 ThemePreviewCard.vue。 */
@import './settings-panel.css';
</style>
