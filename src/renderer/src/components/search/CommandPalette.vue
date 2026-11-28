<template>
    <BaseDialog
        :visible="visible"
        :aria-label="dialogAriaLabel"
        :width-size="PALETTE_WIDTH_SIZE"
        title-bar-variant="plain"
        :draggable="false"
        :container-style="containerStyle"
        :overlay-style="overlayStyle"
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
            <!-- 命令模式：空查询「最近使用」分区置顶 + 按分类分组（可折叠） -->
            <div
                v-if="mode === 'command'"
                :id="LIST_ID"
                ref="listRef"
                class="palette-list"
                role="listbox"
                :aria-label="listAriaLabel"
            >
                <!-- 空态统一组件（T10/T11）：无匹配命令 + REQ-11 相关命令建议 -->
                <template v-if="hasNoMatches">
                    <EmptyState
                        class="palette-empty"
                        variant="no-search"
                        size="compact"
                        :title="t('editorUi.commandPalette.noResults')"
                        :description="
                            hasSuggestions ? t('editorUi.commandPalette.suggestionsHint') : ''
                        "
                    />
                    <!-- 建议区与真实结果明确区分：独立分组标题 + 建议徽标 + 虚线左边框 -->
                    <div
                        v-if="hasSuggestions"
                        class="palette-suggestions"
                        role="group"
                        :aria-label="t('editorUi.commandPalette.suggestionsTitle')"
                    >
                        <div
                            class="palette-group-title palette-group-title--static"
                            aria-hidden="true"
                        >
                            {{ t('editorUi.commandPalette.suggestionsTitle') }}
                        </div>
                        <div
                            v-for="(suggestion, index) in suggestions"
                            :id="optionId(index)"
                            :key="`suggestion-${suggestion.id}`"
                            class="palette-suggestion"
                            :class="{ 'palette-suggestion--active': index === selectedIndex }"
                            role="option"
                            :aria-selected="index === selectedIndex"
                            :data-flat-index="index"
                            @click="executeCommandByIndex(index)"
                            @mousemove="selectIndex(index)"
                        >
                            <span class="option-label">{{ t(suggestion.labelKey) }}</span>
                            <span
                                v-if="shortcutOf(suggestion)"
                                class="option-shortcut"
                                aria-hidden="true"
                            >
                                {{ shortcutOf(suggestion) }}
                            </span>
                            <span class="option-category">{{ t(suggestion.categoryKey) }}</span>
                            <span class="palette-suggestion__badge">
                                {{ t('editorUi.commandPalette.suggestionBadge') }}
                            </span>
                        </div>
                    </div>
                </template>
                <template v-else>
                    <div
                        v-for="section in commandSections"
                        :key="section.key"
                        role="group"
                        :aria-label="t(section.titleKey)"
                    >
                        <!-- REQ-11：分组标题可折叠（按钮原生 Enter/Space 切换，aria-expanded 同步） -->
                        <button
                            type="button"
                            class="palette-group-title"
                            :aria-expanded="!section.collapsed"
                            :aria-controls="
                                section.collapsed ? undefined : sectionBodyId(section.key)
                            "
                            @click="toggleSection(section.key)"
                        >
                            <svg
                                class="palette-group-caret"
                                :class="{ 'palette-group-caret--collapsed': section.collapsed }"
                                viewBox="0 0 16 16"
                                width="12"
                                height="12"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                aria-hidden="true"
                                focusable="false"
                            >
                                <path d="M4 6l4 4 4-4" />
                            </svg>
                            <span>{{ t(section.titleKey) }}</span>
                        </button>
                        <div
                            v-if="!section.collapsed"
                            :id="sectionBodyId(section.key)"
                            class="palette-section-body"
                        >
                            <div
                                v-for="item in section.items"
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
                                <span class="option-category">{{
                                    t(item.command.categoryKey)
                                }}</span>
                            </div>
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
 *   分组标题是原生 button，Tab 聚焦后 Enter/Space 折叠/展开（REQ-11）；
 *   a11y：输入框 role=combobox + aria-activedescendant，列表 role=listbox / 选项 role=option。
 *
 * 1.5.6 P2 批次 C：
 * - REQ-10：命令执行记录落本机 localStorage（`command-palette-storage.ts`），空查询置顶
 *   「最近使用」分区；搜索排序权重 = 完全匹配 > 前缀 > 最近使用 > 频率 > 原始顺序
 *   （排序实现见 `command-registry.ts` 的 filterPaletteCommands）；
 * - REQ-11：分组标题可折叠/展开（状态持久化）、无匹配时展示「相关命令」建议
 *   （`command-suggestions.ts`，最多 5 条，视觉/语义与真实结果明确区分，回车可执行）；
 * - 不新增 IPC、不改执行链路与快捷键语义。
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
import {
    getRecentCommandIds,
    readCollapsedGroupKeys,
    readCommandUsage,
    recordCommandUsage,
    RECENT_COMMANDS_LIMIT,
    RECENT_COMMANDS_SECTION_KEY,
    toggleCollapsedGroupKey,
    writeCollapsedGroupKeys,
    type CommandPaletteStorageLike,
    type CommandUsageMap
} from './command-palette-storage'
import { suggestPaletteCommands } from './command-suggestions'
import { buildCommandAcceleratorMap, toAriaKeyshortcuts } from './command-shortcuts'
import { filterWorkspaceFileEntries, moveListSelection } from './workspace-search-utils'
import { openWorkspaceFileAtLine, useWorkspaceSearch } from '../../composables/useWorkspaceSearch'
import type { DialogWidthSize } from '../dialogs/dialog-metrics'
import type { WorkspaceFileEntry } from '../../../../shared/types/ipc'

/**
 * 命令面板宽度档位（T12 宽度阶梯迁移）：720px 恰为语义阶梯 `medium`，等值迁移；
 * 宽度真源仍是 `dialog-metrics.ts` 的 DIALOG_WIDTH_LADDER（组件不写死像素）。
 */
const PALETTE_WIDTH_SIZE: DialogWidthSize = 'medium'

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
 * z-index（T12 层级收敛）：不再依赖「与其它对话框同值、后渲染者在上」的 DOM 顺序，
 * 改为把遮罩层内联 z-index 提升到应用层命令面板层级 `--ui-z-palette-app`（1.5.6 起为应用层
 * 相对阶梯 120，比对话框 110 高一档），保证命令面板永远位于其它对话框/工具窗之上（含嵌套
 * 打开场景）。语义阶梯 `--ui-z-palette`（60）与 120 的映射见 ui-style.css 注释。
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

/** 命令面板遮罩层级：应用层令牌（T12；唯一真源 UI_Z_INDEX_APP_COMPAT，1.5.6 相对阶梯 120） */
const overlayStyle = computed(() => ({
    zIndex: 'var(--ui-z-palette-app, 120)'
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

// ==================== 本机持久化（REQ-10 / REQ-11） ====================

/** 解析本机 localStorage（隐私模式/被禁用/SSR 环境 → null，功能降级为仅内存） */
function resolvePaletteStorage(): CommandPaletteStorageLike | null {
    try {
        if (typeof window === 'undefined' || !window.localStorage) {
            return null
        }
        return window.localStorage
    } catch {
        return null
    }
}

/** 命令使用历史（命令 id → { lastUsed, count }；REQ-10） */
const commandUsage = ref<CommandUsageMap>({})

/** 已折叠的分组 key（最近使用分区固定 key + 分类 i18n key；REQ-11） */
const collapsedGroupKeys = ref<Set<string>>(new Set())

/** 打开面板时重读本机持久化状态（外部修改/多窗口场景同样生效） */
function reloadPalettePreferences(): void {
    const storage = resolvePaletteStorage()
    commandUsage.value = readCommandUsage(storage)
    collapsedGroupKeys.value = readCollapsedGroupKeys(storage)
}

/** 记录一次命令执行（写入失败时仅本会话内存生效，不阻塞执行） */
function recordCommandUse(commandId: string): void {
    commandUsage.value = recordCommandUsage(resolvePaletteStorage(), commandId)
}

/** 折叠/展开单个分组（持久化到 localStorage） */
function toggleSection(key: string): void {
    const next = toggleCollapsedGroupKey(collapsedGroupKeys.value, key)
    collapsedGroupKeys.value = next
    writeCollapsedGroupKeys(resolvePaletteStorage(), next)
}

// ==================== 命令列表 / 最近使用 / 分组 ====================

/** 搜索过滤结果（REQ-10 排序权重见 filterPaletteCommands；空查询保持注册顺序） */
const filteredCommands = computed<PaletteCommand[]>(() =>
    filterPaletteCommands(commands.value, query.value, t, commandUsage.value)
)

/** 空查询时置顶的「最近使用」命令（只展示执行后会关闭面板的真实命令） */
const recentCommands = computed<PaletteCommand[]>(() => {
    if (query.value.trim().length > 0) {
        return []
    }
    const commandsById = new Map(commands.value.map((command) => [command.id, command]))
    const result: PaletteCommand[] = []
    // 多取一些候选：模式切换类命令会被过滤掉，保证「最近使用」仍能凑满上限
    for (const id of getRecentCommandIds(commandUsage.value, RECENT_COMMANDS_LIMIT * 4)) {
        const command = commandsById.get(id)
        // 模式切换类命令（closeOnRun=false）不进入「最近使用」，避免出现面板自身导航项
        if (command && command.closeOnRun !== false) {
            result.push(command)
        }
        if (result.length >= RECENT_COMMANDS_LIMIT) {
            break
        }
    }
    return result.slice(0, RECENT_COMMANDS_LIMIT)
})

/** 是否无真实匹配结果（REQ-11 空态建议只在命令模式生效） */
const hasNoMatches = computed(() => mode.value === 'command' && filteredCommands.value.length === 0)

/** 无匹配时的「相关命令」建议（最多 5 条；与真实结果分区展示，不参与真实过滤） */
const suggestions = computed<PaletteCommand[]>(() => {
    if (!hasNoMatches.value) {
        return []
    }
    return suggestPaletteCommands(commands.value, query.value, {
        translate: t,
        usage: commandUsage.value
    })
})

const hasSuggestions = computed(() => suggestions.value.length > 0)

/** 一个展示分区（最近使用分区或分类分组） */
interface PaletteSection {
    /** 分区 key：`recent` 或分类 i18n key（同时作为折叠状态存储键） */
    key: string
    /** 分区标题 i18n key */
    titleKey: string
    /** 是否折叠 */
    collapsed: boolean
    /** 分区内命令（index 为全局扁平索引，供键盘选择使用；折叠时为空白） */
    items: Array<{ command: PaletteCommand; index: number }>
}

/**
 * 命令模式分区：
 * - 空查询且有使用历史时，「最近使用」分区置顶（条数 ≤ RECENT_COMMANDS_LIMIT）；
 * - 其余命令按分类聚合，分类顺序取首次出现顺序（过滤结果已排序，分组不重复出现）；
 * - 折叠分组不参与扁平索引，键盘导航只经过可见行。
 */
const commandSections = computed<PaletteSection[]>(() => {
    const baseSections: Array<{ key: string; titleKey: string; commands: PaletteCommand[] }> = []
    const recent = recentCommands.value
    if (recent.length > 0) {
        baseSections.push({
            key: RECENT_COMMANDS_SECTION_KEY,
            titleKey: 'editorUi.commandPalette.recentTitle',
            commands: recent
        })
    }
    const recentIds = new Set(recent.map((command) => command.id))
    const groups = new Map<string, PaletteCommand[]>()
    for (const command of filteredCommands.value) {
        if (recentIds.has(command.id)) {
            continue
        }
        const group = groups.get(command.categoryKey)
        if (group) {
            group.push(command)
        } else {
            groups.set(command.categoryKey, [command])
        }
    }
    for (const [categoryKey, categoryCommands] of groups) {
        baseSections.push({ key: categoryKey, titleKey: categoryKey, commands: categoryCommands })
    }
    let flatIndex = 0
    return baseSections.map((section) => {
        const collapsed = collapsedGroupKeys.value.has(section.key)
        const items = collapsed
            ? []
            : section.commands.map((command) => ({ command, index: flatIndex++ }))
        return { key: section.key, titleKey: section.titleKey, collapsed, items }
    })
})

/**
 * 命令模式的扁平可执行列表（键盘 ↑↓/Enter 的唯一数据源）：
 * - 无真实匹配时 = 建议列表（建议项同样可回车执行）；
 * - 有匹配时 = 未折叠分区的命令按 DOM 顺序展开（最近使用分区 + 分类分组）。
 */
const flatCommands = computed<PaletteCommand[]>(() => {
    if (mode.value !== 'command') {
        return []
    }
    if (hasNoMatches.value) {
        return suggestions.value
    }
    return commandSections.value.flatMap((section) => section.items.map((item) => item.command))
})

/** 文件模式：本地过滤后的文件清单 */
const filteredFiles = computed(() => filterWorkspaceFileEntries(files.value, query.value))

/** 当前模式下的扁平列表长度（键盘导航用） */
const flatLength = computed(() =>
    mode.value === 'command' ? flatCommands.value.length : filteredFiles.value.length
)

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

/** 分组内容容器 id（折叠按钮 aria-controls；折叠时不渲染，故按钮侧动态省略） */
function sectionBodyId(key: string): string {
    return `${LIST_ID}-section-${key}`
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

/** 键盘上下移动选择（循环；只经过可见行，折叠分组的命令自动跳过） */
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

/** 按扁平索引执行命令（真实结果与建议项共用同一条执行链路） */
function executeCommandByIndex(index: number): void {
    const command = flatCommands.value[index]
    if (!command) {
        return
    }
    executeCommand(command)
}

/** 执行一条命令：复用菜单动作分发，成功后记录使用历史（失败不记录） */
function executeCommand(command: PaletteCommand): void {
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
    recordCommandUse(command.id)
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

/** 折叠/结果变化后夹紧选择索引，避免选中已隐藏的行 */
watch(flatLength, (length) => {
    if (length <= 0) {
        selectedIndex.value = 0
        return
    }
    if (selectedIndex.value >= length) {
        selectedIndex.value = length - 1
    }
})

/** 打开：重读本机使用历史/折叠状态，按宿主指定模式初始化并聚焦输入框 */
watch(
    () => props.visible,
    (visible) => {
        if (!visible) {
            actionError.value = ''
            return
        }
        reloadPalettePreferences()
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

/*
 * 分组标题：11 / 600 / 大写 / 三级文字（COMPONENTS.md §6）。
 * REQ-11 起同时是折叠开关按钮：原生 button 保证键盘可操作（Tab 聚焦、Enter/Space 切换），
 * 展开状态由 aria-expanded 暴露给读屏。
 */
.palette-group-title {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    margin: 0;
    padding: 8px var(--ui-pad, 12px) 4px;
    border: none;
    background: transparent;
    color: var(--ui-text-tertiary, var(--secondary-text-color, var(--text-color)));
    font-family: inherit;
    font-size: 11px;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: 0.04em;
    text-align: left;
    text-transform: uppercase;
    cursor: pointer;
    user-select: none;
}

.palette-group-title:hover {
    color: var(--ui-text-secondary, var(--secondary-text-color, var(--text-color)));
}

.palette-group-title:focus-visible {
    outline: none;
    border-radius: var(--ui-radius-sm, 2px);
    box-shadow: var(--ui-focus-shadow);
}

/* 建议区标题为静态文案（不可折叠），不显示手型光标 */
.palette-group-title--static {
    cursor: default;
}

/* 折叠指示箭头：仅旋转，不做位移动画（低动效成本，尊重 reduced-motion 由全局变量控制） */
.palette-group-caret {
    flex: 0 0 auto;
    width: 12px;
    height: 12px;
    transition: transform var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.palette-group-caret--collapsed {
    transform: rotate(-90deg);
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

/*
 * 空态「相关命令」建议（REQ-11）：
 * 与真实结果区分 —— 独立分组标题 + 建议徽标 + 虚线左侧边框；仍可用 ↑↓/Enter 执行。
 */
.palette-suggestions {
    padding-top: 2px;
}

.palette-suggestion {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    height: var(--ui-control-height, 32px);
    padding: 0 var(--ui-pad, 12px);
    border: none;
    border-left: 2px dashed var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 2px);
    background: transparent;
    color: var(--ui-text, var(--text-color));
    font-family: inherit;
    font-size: var(--ui-font-size, 13px);
    text-align: left;
    cursor: pointer;
    transition: background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.palette-suggestion--active {
    background: var(--ui-accent-soft);
    border-left-style: solid;
    border-left-color: var(--ui-accent);
}

.palette-suggestion__badge {
    flex: 0 0 auto;
    padding: 1px 6px;
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 2px);
    color: var(--ui-text-tertiary, var(--secondary-text-color, var(--text-color)));
    font-size: 11px;
    line-height: 1.2;
}

.palette-hint {
    margin: 0;
    padding: 8px var(--ui-pad, 12px);
    font-size: 12px;
    color: var(--ui-text-secondary, var(--secondary-text-color, var(--text-color)));
}

.palette-hint--error {
    color: var(--ui-danger);
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
