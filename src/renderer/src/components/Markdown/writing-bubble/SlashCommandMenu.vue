<template>
    <!--
        Slash 命令菜单（纯展示 + 键盘/鼠标选择回传）：
        - 键盘 ↑↓/Enter/Esc 由宿主 EditorBubbleToolbar 经 Monaco 的 onKeyDown 拦截处理，
          本组件只负责渲染、标记当前项，并在点击/悬停时回传选择；
        - 列表语义 role=listbox / option 与命令面板保持一致（UI-12 的 a11y 口径）。
    -->
    <div class="writing-slash-menu">
        <p v-if="commands.length === 0" class="writing-slash-menu__empty" role="status">
            {{ t('editorUi.commandPalette.noResults') }}
        </p>
        <div
            v-else
            class="writing-slash-menu__list"
            role="listbox"
            :aria-label="t('editorUi.commandPalette.listLabel')"
        >
            <div
                v-for="(command, index) in commands"
                :key="command.id"
                class="writing-slash-menu__option"
                :class="{ 'writing-slash-menu__option--active': index === activeIndex }"
                role="option"
                :aria-selected="index === activeIndex"
                :data-command-id="command.id"
                @click="selectCommand(command)"
                @mousemove="activateCommand(index)"
            >
                {{ t(command.labelKey) }}
            </div>
        </div>
        <p class="writing-slash-menu__hint" aria-hidden="true">
            {{ t('editorUi.commandPalette.hint') }}
        </p>
    </div>
</template>

<script setup lang="ts">
/**
 * Slash 命令菜单组件（P0-6）
 *
 * 职责边界：只做「命令列表渲染 + 当前项高亮 + 选择回传」。
 * - 命令数据来自 `slash-commands.ts`（labelKey + 既有动作引用）；
 * - 键盘操作由宿主组件通过 `editor.onKeyDown` 处理（编辑器保持焦点，输入 `query` 不被抢走）；
 * - 文案统一 t(labelKey)，不缓存翻译结果（I18N-08）。
 */
import { t } from '../../../common/i18n'
import type { SlashCommandDefinition } from './slash-commands'

interface Props {
    /** 已过滤的命令列表（宿主按当前 query 计算，保持顺序稳定） */
    commands: readonly SlashCommandDefinition[]
    /** 当前高亮项索引（键盘 ↑↓/鼠标悬停维护） */
    activeIndex: number
}

defineProps<Props>()

const emit = defineEmits<{
    (e: 'select', command: SlashCommandDefinition): void
    (e: 'update:activeIndex', index: number): void
}>()

/** 点击命令项：回传选中命令（宿主负责删除 /query 文本并执行） */
function selectCommand(command: SlashCommandDefinition): void {
    emit('select', command)
}

/** 鼠标悬停：同步高亮项（避免键盘/鼠标高亮分叉） */
function activateCommand(index: number): void {
    emit('update:activeIndex', index)
}
</script>

<style scoped>
/* 视觉口径对齐 assets/dialog-buttons.css：13px 字号、6px 圆角、主题变量、
   all 0.2s ease 过渡；阴影为 rgba 例外（UI-01 允许）。 */
.writing-slash-menu {
    display: flex;
    flex-direction: column;
    max-height: 240px;
    box-sizing: border-box;
    overflow: hidden;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--card-bg, var(--bg-color));
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
    font-size: 13px;
    color: var(--text-color);
}

.writing-slash-menu__list {
    flex: 1 1 auto;
    min-height: 0;
    overflow-y: auto;
    padding: 4px;
}

.writing-slash-menu__option {
    display: flex;
    align-items: center;
    height: 26px;
    padding: 0 8px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    transition: all 0.2s ease;
}

.writing-slash-menu__option:hover,
.writing-slash-menu__option--active {
    background: var(--hover-bg, var(--theme-hover-background));
    color: var(--accent-color);
}

.writing-slash-menu__empty {
    margin: 0;
    padding: 10px 12px;
    font-size: 12px;
    color: var(--secondary-text-color, var(--text-color));
}

.writing-slash-menu__hint {
    margin: 0;
    padding: 2px 8px 4px;
    font-size: 11px;
    line-height: 16px;
    color: var(--secondary-text-color, var(--text-color));
    opacity: 0.75;
    border-top: 1px solid var(--border-color);
}
</style>
