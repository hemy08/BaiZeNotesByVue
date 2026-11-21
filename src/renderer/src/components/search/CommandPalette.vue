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
                <p v-if="filteredCommands.length === 0" class="palette-hint" role="status">
                    {{ t('editorUi.commandPalette.noResults') }}
                </p>
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
                            :data-flat-index="item.index"
                            @click="executeCommandByIndex(item.index)"
                            @mousemove="selectIndex(item.index)"
                        >
                            <span class="option-label">{{ t(item.command.labelKey) }}</span>
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
                <p v-else-if="filteredFiles.length === 0" class="palette-hint" role="status">
                    {{
                        filesLoaded
                            ? t('editorUi.commandPalette.noFiles')
                            : t('editorUi.commandPalette.noResults')
                    }}
                </p>
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
import { t } from '../../common/i18n'
import { HandleMenuAction } from '../MenuBar/menu-actions'
import {
    buildPaletteCommands,
    filterPaletteCommands,
    type PaletteCommand,
    type PaletteCommandHandlers,
    type PaletteMode
} from './command-registry'
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

const containerStyle = {
    maxWidth: '92vw'
}

/** 命令面板命令（注册表单真源；执行动作复用菜单分发/模式切换） */
const commands: PaletteCommand[] = buildPaletteCommands({
    runMenuAction: (menuAction: string) => HandleMenuAction(menuAction),
    openWorkspaceSearch: () => emit('open-workspace-search'),
    switchMode: (next: PaletteMode) => switchMode(next)
} satisfies PaletteCommandHandlers)

const filteredCommands = computed(() => filterPaletteCommands(commands, query.value, t))

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
/* 外壳（遮罩/焦点陷阱/Esc/关闭按钮/动画）由 BaseDialog 提供，这里只保留面板内容样式。 */
.palette-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 8px 4px;
    border: none;
    background: transparent;
    color: var(--text-color);
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
    padding: 4px 0;
}

.palette-group-title {
    padding: 8px 16px 4px;
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: var(--secondary-text-color, var(--text-color));
}

.palette-option {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
    font-size: 13px;
    color: var(--text-color);
    cursor: pointer;
    border-left: 2px solid transparent;
}

.palette-option--active {
    background: var(--hover-bg);
    border-left-color: var(--accent-color);
}

.option-label {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.option-category {
    flex: 0 0 auto;
    font-size: 11px;
    color: var(--secondary-text-color, var(--text-color));
}

.palette-hint {
    margin: 0;
    padding: 8px 16px;
    font-size: 12px;
    color: var(--secondary-text-color, var(--text-color));
}

.palette-hint--error {
    color: #e74c3c;
}

.palette-hint--footer {
    border-top: 1px solid var(--border-color);
    background: var(--card-bg);
}
</style>
