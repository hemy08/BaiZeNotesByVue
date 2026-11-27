<template>
    <BaseDialog
        :visible="visible"
        :aria-label="dialogAriaLabel"
        width="720px"
        title-bar-variant="plain"
        :draggable="false"
        :container-style="containerStyle"
        @close="handleClose"
    >
        <!-- 标题栏插槽内直接放搜索输入（命令面板无独立标题，输入即焦点） -->
        <template #title>
            <input
                ref="inputRef"
                v-model="query"
                type="text"
                class="palette-input"
                role="combobox"
                aria-autocomplete="list"
                :aria-expanded="true"
                :aria-controls="LIST_ID"
                :aria-activedescendant="activeDescendantId"
                :placeholder="inputPlaceholder"
                :aria-label="inputPlaceholder"
                @keydown.down.prevent="moveSelection(1)"
                @keydown.up.prevent="moveSelection(-1)"
                @keydown.enter.prevent="executeSelected"
            />
        </template>

        <div class="command-palette">
            <!-- 命令模式：按分类分组展示 -->
            <div
                v-if="mode === 'command'"
                :id="LIST_ID"
                ref="listRef"
                class="palette-list"
                role="listbox"
                :aria-label="listAriaLabel"
            >
                <!-- 空态统一组件（T10/T11）：无匹配命令 -->
                <EmptyState
                    v-if="filteredCommands.length === 0"
                    class="palette-empty"
                    variant="no-search"
                    size="compact"
                    :title="t('editorUi.commandPalette.noResults')"
                />
                <template v-else>
                    <div
                        v-for="group in commandGroups"
                        :key="group.categoryKey"
                        role="group"
                        :aria-label="t(group.categoryKey)"
                    >
                        <div class="palette-group-title" aria-hidden="true">
                            {{ t(group.categoryKey) }}
                        </div>
                        <div
                            v-for="item in group.items"
                            :id="optionId(item.index)"
                            :key="item.command.id"
                            class="palette-option"
                            :class="{ 'palette-option--active': item.index === selectedIndex }"
                            role="option"
                            :aria-selected="item.index === selectedIndex"
                            :aria-keyshortcuts="ariaShortcutOf(item.command)"
                            :data-flat-index="item.index"
                            @click="executeCommandByIndex(item.index)"
                            @mousemove="selectIndex(item.index)"
                        >
                            <span class="option-label">{{ t(item.command.labelKey) }}</span>
                            <!-- 快捷键 chip：键位来自菜单树真源（command-shortcuts.ts），不复制键位表 -->
                            <span
                                v-if="shortcutOf(item.command)"
                                class="option-shortcut"
                                aria-hidden="true"
                            >
                                {{ shortcutOf(item.command) }}
                            </span>
                            <span class="option-category">{{ t(item.command.categoryKey) }}</span>
                        </div>
                    </div>
                </template>
            </div>

            <!-- 文件模式：Quick Open（工作区文本文件清单） -->
            <div
                v-else
                :id="LIST_ID"
                ref="listRef"
                class="palette-list"
                role="listbox"
                :aria-label="listAriaLabel"
            >
                <p v-if="filesLoading" class="palette-hint" role="status">
                    {{ t('editorUi.commandPalette.loading') }}
                </p>
                <!-- 空态统一组件（T10/T11）：无文件 / 无搜索结果 -->
                <EmptyState
                    v-else-if="filteredFiles.length === 0"
                    class="palette-empty"
                    variant="no-search"
                    size="compact"
                    :title="
                        filesLoaded
                            ? t('editorUi.commandPalette.noFiles')
                            : t('editorUi.commandPalette.noResults')
                    "
                />
                <template v-else>
                    <div
                        v-for="(entry, index) in filteredFiles"
                        :id="optionId(index)"
                        :key="entry.filePath"
                        class="palette-option"
                        :class="{ 'palette-option--active': index === selectedIndex }"
                        role="option"
                        :aria-selected="index === selectedIndex"
                        :data-flat-index="index"
                        @click="executeFileByIndex(index)"
                        @mousemove="selectIndex(index)"
                    >
                        <span class="option-label">{{ entry.relativePath }}</span>
                    </div>
                </template>
            </div>

            <p v-if="actionError" class="palette-hint palette-hint--error" role="alert">
                {{ actionError }}
            </p>
            <p class="palette-hint palette-hint--footer">
                {{
                    mode === 'command'
                        ? t('editorUi.commandPalette.hint')
                        : t('editorUi.commandPalette.fileHint')
                }}
            </p>
        </div>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * A9 命令面板 / 文件 Quick Open（2026-11-21，默认开启）
 *
 * - 命令模式（Ctrl+Shift+P）：命令列表来自 `command-registry.ts` 单真源；执行动作复用
 *   `menu-actions.ts` 的 HandleMenuAction（与菜单点击同一条链路），不复制功能实现；
 * - 文件模式（Ctrl+P）：文件清单复用主进程 FILE.SEARCH_WORKSPACE 的 listFilesOnly 选项，
 *   本地子串/子序列过滤；回车打开文件；
 * - 键盘：↑/↓ 循环选择、Enter 执行、Esc 关闭（BaseDialog 负责 Esc/焦点陷阱）；
 *   a11y：输入框 role=combobox + aria-activedescendant，列表 role=listbox / 选项 role=option。
 */
import { computed, nextTick, ref, watch } from 'vue'
import BaseDialog from '../dialogs/BaseDialog.vue'
import EmptyState from '../common/ui/EmptyState.vue'
import { t } from '../../common/i18n'
import { openOrCreateCaptureEntry } from '../../common/capture-actions'
import { captureClipToEditor, captureClipToNote } from '../../common/clip-capture-actions'
import { ocrClipboardToClipboard, ocrClipboardToEditor } from '../../common/ocr-actions'
import { useFeatureFlags } from '../../composables/useFeatureFlags'
import { HandleMenuAction } from '../MenuBar/menu-actions'
import {
    buildPaletteCommands,
    filterPaletteCommands,
    type PaletteCommand,
    type PaletteCommandHandlers,
    type PaletteMode
} from './command-registry'
import { buildCommandAcceleratorMap, toAriaKeyshortcuts } from './command-shortcuts'
import { filterWorkspaceFileEntries, moveListSelection } from './workspace-search-utils'
import { openWorkspaceFileAtLine, useWorkspaceSearch } from '../../composables/useWorkspaceSearch'
import type { WorkspaceFileEntry } from '../../../../shared/types/ipc'

interface Props {
    /** 显隐开关（真源在宿主组件） */
    visible: boolean
    /** 每次打开时进入的模式：command = 命令列表，file = 文件 Quick Open */
    initialMode?: PaletteMode
}

const props = withDefaults(defineProps<Props>(), {
    initialMode: 'command'
})

const emit = defineEmits<{
    (e: 'close'): void
    /** 请求宿主打开 A2 工作区搜索对话框（命令面板随后自行关闭） */
    (e: 'open-workspace-search'): void
}>()

/** 列表容器固定 id（aria-controls 关联） */
const LIST_ID = 'baize-command-palette-list'

const controller = useWorkspaceSearch()

const mode = ref<PaletteMode>(props.initialMode)
const query = ref('')
const selectedIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const listRef = ref<HTMLElement | null>(null)

/** Quick Open 文件清单状态 */
const files = ref<WorkspaceFileEntry[]>([])
const filesLoading = ref(false)
const filesLoaded = ref(false)

/** 执行失败提示（打开文件超时等） */
const actionError = ref('')

/**
 * 命令面板外壳材质（视觉升级 P1-B2 / T10）。
 *
 * 外壳由 BaseDialog 提供（属视觉升级 P1-B1 写域，本批不改动它），命令面板通过
 * `containerStyle` 内联覆盖所需的令牌：
 * - 圆角 --ui-radius-lg（workbench 6 / paper 8 / glass 12）；
 * - 阴影 --ui-shadow-3 + glass 高光边（alpha 为 0 时不可见）；
 * - 背景按 --ui-surface-opacity 走半透明（仅 glass 半透明；其余风格 100% 不透明，
 *   颜色仍取既有 --bg-color，保证默认主题观感连续）；
 * - 背景模糊仅用于本悬浮层（禁止整窗大面积 blur，DESIGN.md §3）。
 *
 * z-index：BaseDialog 遮罩层为 9999（全对话框统一栈序，属 B1 写域），本批不覆盖；
 * `--ui-z-palette` 的落地留待 T12 跨组件回归统一收敛，功能上命令面板仍是最后打开的
 * 顶层对话框（同 z-index 下后渲染者在上）。
 */
const containerStyle = computed(() => ({
    maxWidth: '92vw',
    borderRadius: 'var(--ui-radius-lg, 6px)',
    boxShadow:
        'inset 0 1px 0 rgba(255, 255, 255, var(--ui-highlight-border-alpha, 0)), var(--ui-shadow-3)',
    background:
        'color-mix(in srgb, var(--bg-color) calc(var(--ui-surface-opacity, 1) * 100%), transparent)',
    backdropFilter: 'blur(var(--ui-surface-blur, 0px))'
}))

/** 能力开关（1.5.2 E6：命令注册按开关过滤，开关热切换后命令列表即时更新） */
const { flags } = useFeatureFlags()

/**
 * 命令面板命令（注册表单真源；执行动作复用菜单分发/模式切换）。
 * E6：`openOrCreateCaptureEntry` 与「工具」菜单共用同一渲染层入口动作（不复制 IPC 调用）。
 */
const commands = computed<PaletteCommand[]>(() =>
    buildPaletteCommands(
        {
            runMenuAction: (menuAction: string) => HandleMenuAction(menuAction),
            openWorkspaceSearch: () => emit('open-workspace-search'),
            switchMode: (next: PaletteMode) => switchMode(next),
            openOrCreateCaptureEntry: (kind) => openOrCreateCaptureEntry(kind),
            captureClipToNote: () => captureClipToNote(),
            captureClipToEditor: () => captureClipToEditor(),
            ocrClipboardToEditor: () => ocrClipboardToEditor(),
            ocrClipboardToClipboard: () => ocrClipboardToClipboard()
        } satisfies PaletteCommandHandlers,
        { isFeatureEnabled: (id) => flags[id] }
    )
)

const filteredCommands = computed(() => filterPaletteCommands(commands.value, query.value, t))

/**
 * 「命令 id → 快捷键标注」映射（T10 快捷键 chip）。
 * 键位真源是菜单树 accelerator（MENU-10），本组件只做展示，不新增第二份键位表。
 */
const commandAccelerators = computed(() => buildCommandAcceleratorMap(commands.value))

/** 命令的快捷键标注（无绑定返回空串，不渲染 chip） */
function shortcutOf(command: PaletteCommand): string {
    return commandAccelerators.value.get(command.id) ?? ''
}

/** 快捷键的 aria-keyshortcuts 语法（无绑定返回 undefined，属性不渲染） */
function ariaShortcutOf(command: PaletteCommand): string | undefined {
    const shortcut = shortcutOf(command)
    return shortcut.length > 0 ? toAriaKeyshortcuts(shortcut) : undefined
}

/** 命令模式：按分类分组（保持注册顺序；index 为全局扁平索引，供键盘选择使用） */
const commandGroups = computed(() => {
    const groups: Array<{
        categoryKey: string
        items: Array<{ command: PaletteCommand; index: number }>
    }> = []
    let flatIndex = 0
    for (const command of filteredCommands.value) {
        let group = groups[groups.length - 1]
        if (!group || group.categoryKey !== command.categoryKey) {
            group = { categoryKey: command.categoryKey, items: [] }
            groups.push(group)
        }
        group.items.push({ command, index: flatIndex })
        flatIndex += 1
    }
    return groups
})

/** 文件模式：本地过滤后的文件清单 */
const filteredFiles = computed(() => filterWorkspaceFileEntries(files.value, query.value))

/** 当前模式下的扁平列表长度（键盘导航用） */
const flatLength = computed(() =>
    mode.value === 'command' ? filteredCommands.value.length : filteredFiles.value.length
)

const dialogAriaLabel = computed(() =>
    mode.value === 'command'
        ? t('editorUi.commandPalette.ariaLabel')
        : t('editorUi.commandPalette.fileAriaLabel')
)

const inputPlaceholder = computed(() =>
    mode.value === 'command'
        ? t('editorUi.commandPalette.placeholder')
        : t('editorUi.commandPalette.filePlaceholder')
)

const listAriaLabel = computed(() =>
    mode.value === 'command'
        ? t('editorUi.commandPalette.listLabel')
        : t('editorUi.commandPalette.fileListLabel')
)

/** 选项 id（aria-activedescendant） */
function optionId(index: number): string {
    return `${LIST_ID}-option-${index}`
}

/** 当前选中项 id（无选中/空列表时为 undefined） */
const activeDescendantId = computed(() => {
    if (flatLength.value <= 0 || selectedIndex.value < 0) {
        return undefined
    }
    return optionId(selectedIndex.value)
})

/** 设置选中项并按需滚动到可视区域 */
function selectIndex(index: number): void {
    if (index < 0 || index >= flatLength.value) {
        return
    }
    selectedIndex.value = index
    void nextTick(() => {
        const node = listRef.value?.querySelector<HTMLElement>(
            `[data-flat-index="${selectedIndex.value}"]`
        )
        // jsdom 无 scrollIntoView 实现时安全跳过
        node?.scrollIntoView?.({ block: 'nearest' })
    })
}

/** 键盘上下移动选择（循环） */
function moveSelection(delta: number): void {
    selectIndex(moveListSelection(selectedIndex.value, delta, flatLength.value))
}

/** 执行当前选中项 */
function executeSelected(): void {
    if (flatLength.value === 0) {
        return
    }
    if (mode.value === 'command') {
        executeCommandByIndex(selectedIndex.value)
    } else {
        executeFileByIndex(selectedIndex.value)
    }
}

/** 按扁平索引执行命令 */
function executeCommandByIndex(index: number): void {
    const command = filteredCommands.value[index]
    if (!command) {
        return
    }
    actionError.value = ''
    if (command.menuAction) {
        try {
            HandleMenuAction(command.menuAction)
        } catch (error) {
            actionError.value =
                error instanceof Error ? error.message : t('editorUi.commandPalette.executeFailed')
            return
        }
    } else {
        command.run?.()
    }
    if (command.closeOnRun !== false) {
        emit('close')
    }
}

/** 按扁平索引打开文件（Quick Open 回车/点击） */
function executeFileByIndex(index: number): void {
    const entry = filteredFiles.value[index]
    if (!entry) {
        return
    }
    actionError.value = ''
    void openWorkspaceFileAtLine(entry.filePath, 1).then((opened) => {
        if (opened) {
            emit('close')
        } else {
            actionError.value = t('editorUi.commandPalette.openFileFailed')
        }
    })
}

/** 切换模式（命令面板自身命令：命令列表 ↔ 文件 Quick Open） */
function switchMode(next: PaletteMode): void {
    mode.value = next
    query.value = ''
    selectedIndex.value = 0
    actionError.value = ''
    if (next === 'file') {
        void loadFiles()
    }
    void focusInput()
}

/** 拉取 Quick Open 文件清单（失败返回空列表，不阻塞面板） */
async function loadFiles(): Promise<void> {
    if (filesLoading.value) {
        return
    }
    filesLoading.value = true
    try {
        files.value = await controller.listFiles()
        filesLoaded.value = true
    } finally {
        filesLoading.value = false
    }
}

/** 把焦点/输入选择移入搜索框 */
async function focusInput(): Promise<void> {
    await nextTick()
    inputRef.value?.focus()
    inputRef.value?.select()
}

/** 关闭面板（清空临时错误与查询） */
function handleClose(): void {
    actionError.value = ''
    emit('close')
}

/** 过滤结果变化时把选择重置到第一项 */
watch([query, mode], () => {
    selectedIndex.value = 0
})

/** 打开：按宿主指定模式初始化并聚焦输入框 */
watch(
    () => props.visible,
    (visible) => {
        if (!visible) {
            actionError.value = ''
            return
        }
        mode.value = props.initialMode
        query.value = ''
        selectedIndex.value = 0
        actionError.value = ''
        if (mode.value === 'file') {
            void loadFiles()
        }
        void focusInput()
    },
    { immediate: true }
)
</script>

<style scoped>
/* ============================================================================
 * 命令面板（外壳/工具区）视觉规格 —— 视觉升级 P1-B2 / T10
 *
 * 消费视觉升级 P0 的语义令牌与风格/密度变量：
 * - 宽度 720 由 BaseDialog `width` 提供；圆角/阴影/背景/模糊见 script 的 containerStyle；
 * - 行高 --ui-control-height（compact 28 / default 32 / spacious 36）；
 * - 左右内边距 --ui-pad、UI 字号 --ui-font-size（密度驱动）；
 * - 选中行 --ui-accent-soft + 左侧 2px --ui-accent 竖条；
 * - 快捷键 chip 走 --ui-radius-sm + --ui-border hairline + 11px。
 * 组件内不写 data-style / data-density 分支（四风格 × 三密度由根元素变量自动生效）。
 * ========================================================================== */

/* 搜索输入即面板标题：字号 15（强调档），焦点由光标体现（不再叠加 outline） */
.palette-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 8px 4px;
    border: none;
    background: transparent;
    color: var(--ui-text, var(--text-color));
    caret-color: var(--ui-accent, var(--accent-color));
    font-size: 15px;
    font-family: inherit;
    outline: none;
    /* BaseDialog 标题栏 user-select:none：输入框需可选中文本 */
    user-select: text;
    cursor: text;
}

.command-palette {
    display: flex;
    flex-direction: column;
    min-height: 0;
    max-height: 420px;
}

.palette-list {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    padding: 6px 0;
}

/* 分组标题：11 / 600 / 大写 / 三级文字（COMPONENTS.md §6） */
.palette-group-title {
    padding: 8px var(--ui-pad, 12px) 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--ui-text-tertiary, var(--secondary-text-color, var(--text-color)));
}

/* 命令行：行高 32（密度档变量）、左右内边距 12 */
.palette-option {
    display: flex;
    align-items: center;
    gap: 12px;
    height: var(--ui-control-height, 32px);
    padding: 0 var(--ui-pad, 12px);
    border-left: 2px solid transparent;
    border-radius: var(--ui-radius-sm, 2px);
    color: var(--ui-text, var(--text-color));
    font-size: var(--ui-font-size, 13px);
    cursor: pointer;
    transition: background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

/* 选中行：强调色软底 + 左侧 2px 强调色竖条 */
.palette-option--active {
    background: var(--ui-accent-soft);
    border-left-color: var(--ui-accent);
}

.option-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 快捷键 chip：圆角 2 / hairline 边框 / 11px（COMPONENTS.md §6） */
.option-shortcut {
    flex: 0 0 auto;
    padding: 2px 6px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 2px);
    background: var(--ui-bg-sunken, var(--hover-bg));
    color: var(--ui-text-tertiary, var(--secondary-text-color, var(--text-color)));
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 11px;
    line-height: 1.2;
}

.option-category {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--ui-text-tertiary, var(--secondary-text-color, var(--text-color)));
}

.palette-hint {
    margin: 0;
    padding: 8px var(--ui-pad, 12px);
    font-size: 12px;
    color: var(--ui-text-secondary, var(--secondary-text-color, var(--text-color)));
}

.palette-hint--error {
    color: var(--ui-danger, #c62828);
}

.palette-hint--footer {
    border-top: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    background: var(--ui-bg-elevated, var(--card-bg));
}

/* 空态嵌入列表时的留白（与命令行视觉节奏一致） */
.palette-empty {
    padding: 16px 12px;
}
</style>
