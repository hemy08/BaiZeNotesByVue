<template>
    <div
        v-if="state.enabled && flags.writingMode"
        class="writing-mode-host"
        role="region"
        :aria-label="t('editorUi.writingMode.label')"
    >
        <div class="writing-toolbar">
            <button type="button" class="writing-exit" @click="handleExit">
                {{ t('editorUi.writingMode.exit') }}
            </button>
            <span class="writing-toolbar-divider" aria-hidden="true"></span>
            <button
                v-if="flags.writingTypewriter"
                type="button"
                class="writing-chip"
                :class="{ active: state.typewriter }"
                :aria-pressed="state.typewriter"
                @click="toggleTypewriter"
            >
                {{ t('editorUi.writingMode.typewriter') }}
            </button>
            <button
                v-if="flags.writingFocus"
                type="button"
                class="writing-chip"
                :class="{ active: state.focusParagraph }"
                :aria-pressed="state.focusParagraph"
                @click="toggleFocus"
            >
                {{ t('editorUi.writingMode.focusParagraph') }}
            </button>
            <button
                v-if="flags.writingTypography || flags.writingStats"
                type="button"
                class="writing-chip"
                :class="{ active: settingsOpen }"
                :aria-expanded="settingsOpen"
                @click="settingsOpen = !settingsOpen"
            >
                {{ t('editorUi.writingMode.typography') }}
            </button>
            <span class="writing-toolbar-divider" aria-hidden="true"></span>
            <span
                v-if="flags.writingStats"
                class="writing-goal"
                :title="t('editorUi.writingMode.goalHint')"
            >
                {{ goalLabel }}
            </span>
        </div>

        <div
            v-if="settingsOpen && (flags.writingTypography || flags.writingStats)"
            class="writing-settings"
        >
            <label v-if="flags.writingTypography" class="writing-field">
                <span>{{ t('editorUi.writingMode.contentWidth') }}</span>
                <input
                    v-model.number="draft.contentWidth"
                    type="range"
                    min="480"
                    max="1400"
                    step="20"
                    @input="applyPreferences"
                />
                <em>{{ draft.contentWidth }} px</em>
            </label>
            <label v-if="flags.writingTypography" class="writing-field">
                <span>{{ t('editorUi.writingMode.fontSize') }}</span>
                <input
                    v-model.number="draft.fontSize"
                    type="range"
                    min="12"
                    max="28"
                    step="1"
                    @input="applyPreferences"
                />
                <em>{{ draft.fontSize }} px</em>
            </label>
            <label v-if="flags.writingTypography" class="writing-field">
                <span>{{ t('editorUi.writingMode.lineHeight') }}</span>
                <input
                    v-model.number="draft.lineHeight"
                    type="range"
                    min="18"
                    max="56"
                    step="2"
                    @input="applyPreferences"
                />
                <em>{{ draft.lineHeight }} px</em>
            </label>
            <label v-if="flags.writingStats" class="writing-field">
                <span>{{ t('editorUi.writingMode.dailyGoal') }}</span>
                <input
                    v-model.number="draft.dailyGoal"
                    type="number"
                    min="100"
                    max="100000"
                    step="100"
                    @change="applyPreferences"
                />
                <em>{{ t('editorUi.writingMode.charsUnit') }}</em>
            </label>
            <button type="button" class="writing-reset" @click="handleReset">
                {{ t('editorUi.writingMode.reset') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 写作模式宿主（P0-1）：
 * - 只在写作模式开启时渲染顶部浮动控制条；
 * - 给主界面容器加 `.writing-mode-active`，由同文件全局 CSS 隐藏侧栏/菜单/标题栏；
 * - 通过单例 `writingModeState` 驱动编辑器/状态栏，避免事件总线多份状态；
 * - 关闭模式后移除 class、恢复编辑器原选项（由编辑器 watcher 负责）。
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import { t } from '../../common/i18n'
import { resetWritingModePreferences, updateWritingMode, useWritingMode } from './useWritingMode'
import { useFeatureFlags } from '../../composables/useFeatureFlags'
import { saveDailyGoal, writingSessionState } from './useWritingSession'

const { state } = useWritingMode()
const { flags } = useFeatureFlags()

const settingsOpen = ref(false)
const draft = reactive({
    contentWidth: state.contentWidth,
    fontSize: state.fontSize,
    lineHeight: state.lineHeight,
    dailyGoal: writingSessionState.goal.dailyGoal
})

const goalLabel = computed(() => {
    const progress = writingSessionState.goal
    return `${t('editorUi.writingMode.today')} ${progress.written} / ${progress.dailyGoal} ${t('editorUi.writingMode.charsUnit')}`
})

function syncDraft(): void {
    draft.contentWidth = state.contentWidth
    draft.fontSize = state.fontSize
    draft.lineHeight = state.lineHeight
    draft.dailyGoal = writingSessionState.goal.dailyGoal
}

function applyPreferences(): void {
    updateWritingMode({
        contentWidth: draft.contentWidth,
        fontSize: draft.fontSize,
        lineHeight: draft.lineHeight,
        dailyGoal: draft.dailyGoal
    })
    saveDailyGoal(draft.dailyGoal)
}

function toggleTypewriter(): void {
    updateWritingMode({ typewriter: !state.typewriter })
}

function toggleFocus(): void {
    updateWritingMode({ focusParagraph: !state.focusParagraph })
}

function handleReset(): void {
    resetWritingModePreferences()
    syncDraft()
}

function handleExit(): void {
    settingsOpen.value = false
    updateWritingMode({ enabled: false })
}

/** 进入写作模式前编辑器容器的内联宽度（用于退出恢复；不通过主题 CSS 变量写入） */
let savedEditorWidth: string | null = null

/**
 * 应用正文限宽（写作排版开启时）：直接写目标容器的内联样式，避免在主题单真源之外
 * 写 CSS 自定义属性（theme-contract 只允许 useTheme 维护主题变量）。
 */
function applyContentWidth(): void {
    if (typeof document === 'undefined') return
    const editor = document.getElementById('md-edit-component')
    if (!editor) return
    if (state.enabled && flags.writingTypography) {
        if (savedEditorWidth === null) savedEditorWidth = editor.style.width
        editor.style.width = `min(${state.contentWidth}px, 92vw)`
        editor.style.maxWidth = '100%'
        editor.style.margin = '0 auto'
    } else if (savedEditorWidth !== null) {
        editor.style.width = savedEditorWidth
        editor.style.maxWidth = ''
        editor.style.margin = ''
        savedEditorWidth = null
    }
}

/** 把写作模式 class 放到主界面根节点（CSS 作用域需要祖先选择器） */
function applyRootClass(enabled: boolean): void {
    if (typeof document === 'undefined') return
    const root = document.getElementById('editor-container')
    if (!root) return
    root.classList.toggle('writing-mode-active', enabled)
    root.classList.toggle('writing-typography-active', enabled && flags.writingTypography)
    applyContentWidth()
}

watch(
    () => state.enabled,
    (enabled) => applyRootClass(enabled)
)

// 设置页关闭「写作模式」时立即退出，避免隐藏的布局残留
watch(
    () => flags.writingMode,
    (enabled) => {
        if (!enabled && state.enabled) {
            updateWritingMode({ enabled: false })
        }
    },
    { immediate: true }
)

watch(
    () => [state.contentWidth, state.fontSize, flags.writingTypography],
    () => {
        if (!state.enabled) return
        const root = document.getElementById('editor-container')
        root?.classList.toggle('writing-typography-active', flags.writingTypography)
        applyContentWidth()
    }
)

watch(
    () => state.enabled,
    (enabled) => {
        if (enabled) syncDraft()
    }
)

onMounted(() => applyRootClass(state.enabled && flags.writingMode))

onBeforeUnmount(() => {
    const root = document.getElementById('editor-container')
    root?.classList.remove('writing-mode-active')
    root?.classList.remove('writing-typography-active')
    const editor = document.getElementById('md-edit-component')
    if (editor && savedEditorWidth !== null) {
        editor.style.width = savedEditorWidth
        editor.style.maxWidth = ''
        editor.style.margin = ''
    }
    savedEditorWidth = null
})
</script>

<style scoped>
.writing-mode-host {
    position: fixed;
    top: 12px;
    right: 20px;
    z-index: 3000;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 8px;
    font-family: inherit;
}

.writing-toolbar,
.writing-settings {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--card-bg);
    color: var(--text-color);
    box-shadow: 0 6px 24px rgb(0 0 0 / 12%);
    backdrop-filter: blur(8px);
}

.writing-toolbar-divider {
    width: 1px;
    height: 18px;
    background: var(--border-color);
}

.writing-exit,
.writing-chip,
.writing-reset {
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    color: var(--text-color);
    font-size: 12px;
    line-height: 1;
    padding: 6px 10px;
    cursor: pointer;
}

.writing-exit {
    color: var(--accent-color);
    border-color: var(--accent-color);
}

.writing-chip:hover,
.writing-reset:hover {
    background: var(--hover-bg, rgb(127 127 127 / 10%));
}

.writing-chip.active {
    color: var(--accent-color);
    background: var(--accent-bg, rgb(118 75 162 / 12%));
}

.writing-goal {
    font-size: 12px;
    color: var(--secondary-text-color);
    white-space: nowrap;
}

.writing-settings {
    flex-wrap: wrap;
    max-width: 420px;
    justify-content: flex-end;
}

.writing-field {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--secondary-text-color);
}

.writing-field input[type='range'] {
    width: 92px;
}

.writing-field input[type='number'] {
    width: 72px;
    padding: 4px 6px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--input-bg, transparent);
    color: var(--text-color);
}

.writing-field em {
    font-style: normal;
    min-width: 42px;
    text-align: right;
    color: var(--text-color);
}
</style>

<style>
/* 写作模式布局：只影响呈现，不改变 WorkSpace 内部状态；退出即恢复 */
#editor-container.writing-mode-active #title-bar,
#editor-container.writing-mode-active #menu-bar,
#editor-container.writing-mode-active #file-bar,
#editor-container.writing-mode-active #left-navi,
#editor-container.writing-mode-active #right-navi,
#editor-container.writing-mode-active #resource-manager,
#editor-container.writing-mode-active .resizer-main,
#editor-container.writing-mode-active #resizer-md,
#editor-container.writing-mode-active #md-preview {
    display: none !important;
}

#editor-container.writing-mode-active #workspace-area {
    padding: 0;
}

#editor-container.writing-mode-active #md-container {
    display: flex;
    justify-content: center;
    width: 100% !important;
    margin-right: 0 !important;
}

#editor-container.writing-mode-active.writing-typography-active #md-edit-component {
    max-width: 100%;
    margin: 0 auto;
    box-shadow:
        0 0 0 1px var(--border-color),
        0 12px 40px rgb(0 0 0 / 6%);
}

#editor-container.writing-mode-active .status-bar {
    border-top: 1px solid var(--border-color);
}

/* 当前段落高亮：编辑器 decorations 注入的类 */
#editor-container.writing-mode-active .writing-paragraph-focus {
    background: var(--accent-bg, rgb(118 75 162 / 10%));
    border-radius: 3px;
}
</style>
