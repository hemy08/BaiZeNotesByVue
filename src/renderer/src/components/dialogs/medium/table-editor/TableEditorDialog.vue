<template>
    <BaseDialog
        tool-window
        :visible="true"
        :title="dialogTitle"
        width="min(1000px, 95vw)"
        reset-position-on-open
        :container-style="panelContainerStyle"
        @close="handleClose"
    >
        <div
            class="table-editor-body"
            :style="tableCssVariables"
            :data-table-style="uiStyle"
            :data-table-density="uiDensity"
            @keydown.ctrl.enter.prevent="handleApply"
            @keydown.meta.enter.prevent="handleApply"
        >
            <section
                class="table-settings"
                :aria-label="t('dialogRenderer.tableEditor.settingsTitle')"
            >
                <div class="settings-controls">
                    <label class="setting-field">
                        <span class="setting-label">{{
                            t('dialogRenderer.tableEditor.rows')
                        }}</span>
                        <input
                            v-model.number="rowTarget"
                            class="setting-input"
                            type="number"
                            min="1"
                            max="200"
                            @change="applyRowTarget"
                            @blur="applyRowTarget"
                        />
                    </label>
                    <label class="setting-field">
                        <span class="setting-label">{{
                            t('dialogRenderer.tableEditor.columns')
                        }}</span>
                        <input
                            v-model.number="columnTarget"
                            class="setting-input"
                            type="number"
                            min="1"
                            max="50"
                            @change="applyColumnTarget"
                            @blur="applyColumnTarget"
                        />
                    </label>
                    <span class="settings-divider" aria-hidden="true"></span>
                    <label class="setting-field">
                        <span class="setting-label">{{
                            t('dialogRenderer.tableEditor.allColumnsAlign')
                        }}</span>
                        <select
                            v-model="bulkAlignment"
                            class="setting-select setting-select--align"
                            @change="applyBulkAlignment"
                        >
                            <option
                                v-for="option in alignOptions"
                                :key="option.value"
                                :value="option.value"
                            >
                                {{ option.label }}
                            </option>
                        </select>
                    </label>
                    <span class="settings-divider" aria-hidden="true"></span>
                    <label class="setting-field">
                        <span class="setting-label">{{
                            t('dialogRenderer.tableEditor.sortBy')
                        }}</span>
                        <select
                            :value="sortColumn"
                            class="setting-select setting-select--sort"
                            @change="handleSortColumnChange"
                        >
                            <option
                                v-for="(_header, columnIndex) in headers"
                                :key="`sort-${columnIndex}`"
                                :value="columnIndex"
                            >
                                {{
                                    headers[columnIndex] ||
                                    `${t('dialogRenderer.tableEditor.column')} ${columnIndex + 1}`
                                }}
                            </option>
                        </select>
                    </label>
                    <div class="tool-btn-group" role="group">
                        <button type="button" class="tool-btn" @click="sortRows('asc')">
                            {{ t('dialogRenderer.tableEditor.sortAsc') }}
                        </button>
                        <button type="button" class="tool-btn" @click="sortRows('desc')">
                            {{ t('dialogRenderer.tableEditor.sortDesc') }}
                        </button>
                        <button type="button" class="tool-btn" @click="transposeTable">
                            {{ t('dialogRenderer.tableEditor.transpose') }}
                        </button>
                    </div>
                    <div class="settings-spacer"></div>
                    <button
                        type="button"
                        class="import-btn"
                        :disabled="importing"
                        @click="triggerImport"
                    >
                        <span class="import-icon" aria-hidden="true">⇪</span>
                        {{
                            importing
                                ? t('dialogRenderer.tableEditor.importing')
                                : t('dialogRenderer.tableEditor.importFile')
                        }}
                    </button>
                    <input
                        ref="fileInput"
                        class="file-input"
                        type="file"
                        accept=".csv,.xlsx"
                        @change="handleFileSelected"
                    />
                    <InfoTip
                        class="settings-hint"
                        :text="t('dialogRenderer.tableEditor.cellRichHint')"
                    />
                </div>
                <p v-if="importError" class="import-message import-message--error" role="alert">
                    {{ importError }}
                </p>
                <p v-else-if="importMessage" class="import-message import-message--success">
                    {{ importMessage }}
                </p>
            </section>

            <div class="table-editor-scroll">
                <!--
                    电子表格化网格（1.5.5 / T8）：
                    - 导航态：单元格为只读显示，方向键/Tab 移动选区，Enter / F2 / 双击进入编辑；
                    - 编辑态：单元格内渲染 textarea（保留 1.5.3 的 Markdown 富文本编辑能力），
                      Enter / Tab 提交并移动、Shift+Enter 换行、Esc 取消并还原。
                    - role=grid + aria-activedescendant：读屏可感知当前选区。
                -->
                <table
                    ref="gridRef"
                    class="table-editor-grid"
                    role="grid"
                    tabindex="0"
                    :aria-label="gridLabel"
                    :aria-activedescendant="activeCellId"
                    aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight Home End Enter F2 Delete"
                    :style="{ width: `${tableWidth}px` }"
                    @keydown="handleGridKeydown"
                    @focus="handleGridFocus"
                >
                    <colgroup>
                        <col :style="{ width: `${densityTokens.rowHeadWidth}px` }" />
                        <col
                            v-for="(_width, columnIndex) in columnWidths"
                            :key="`col-${columnIndex}`"
                            :style="{ width: `${columnWidths[columnIndex]}px` }"
                        />
                        <col :style="{ width: `${densityTokens.addColumnWidth}px` }" />
                    </colgroup>
                    <thead role="rowgroup">
                        <tr role="row">
                            <th class="corner-cell" role="columnheader" aria-hidden="true"></th>
                            <th
                                v-for="(_header, columnIndex) in headers"
                                :key="`h-${columnIndex}`"
                                class="column-head"
                                role="columnheader"
                                @dragover.prevent
                                @drop="dropColumn(columnIndex)"
                            >
                                <div class="column-head-main">
                                    <span
                                        class="drag-grip"
                                        draggable="true"
                                        :title="t('dialogRenderer.tableEditor.dragColumn')"
                                        @dragstart="startColumnDrag(columnIndex, $event)"
                                        @dragend="endDrag"
                                        >⋮⋮</span
                                    >
                                    <span class="column-index">{{ columnIndex + 1 }}</span>
                                    <input
                                        v-model="headers[columnIndex]"
                                        class="cell-input header-input"
                                        :style="headerInputStyle(columnIndex)"
                                        :aria-label="t('dialogRenderer.tableEditor.header')"
                                        :placeholder="`${t('dialogRenderer.tableEditor.column')} ${columnIndex + 1}`"
                                    />
                                    <div class="column-actions">
                                        <select
                                            v-model="alignments[columnIndex]"
                                            class="column-align-select"
                                            :title="alignmentTitle(columnIndex)"
                                            :aria-label="alignmentTitle(columnIndex)"
                                        >
                                            <option
                                                v-for="option in alignOptions"
                                                :key="option.value"
                                                :value="option.value"
                                            >
                                                {{ option.shortLabel }}
                                            </option>
                                        </select>
                                        <button
                                            type="button"
                                            class="icon-btn"
                                            :title="
                                                t('dialogRenderer.tableEditor.insertColumnRight')
                                            "
                                            :aria-label="
                                                t('dialogRenderer.tableEditor.insertColumnRight')
                                            "
                                            @click="insertColumnAt(columnIndex + 1)"
                                        >
                                            <span aria-hidden="true">+</span>
                                        </button>
                                        <button
                                            type="button"
                                            class="icon-btn icon-btn--danger"
                                            :title="t('dialogRenderer.tableEditor.deleteColumn')"
                                            :aria-label="
                                                t('dialogRenderer.tableEditor.deleteColumn')
                                            "
                                            :disabled="headers.length <= 1"
                                            @click="deleteColumn(columnIndex)"
                                        >
                                            <span aria-hidden="true">×</span>
                                        </button>
                                    </div>
                                </div>
                                <span
                                    class="col-resizer"
                                    :title="t('dialogRenderer.tableEditor.resizeColumn')"
                                    @pointerdown.stop.prevent="
                                        startColumnResize(columnIndex, $event)
                                    "
                                    @mousedown.stop.prevent
                                ></span>
                            </th>
                            <th class="add-column-cell" role="columnheader">
                                <button
                                    type="button"
                                    class="add-column-btn"
                                    :title="t('dialogRenderer.tableEditor.addColumn')"
                                    :aria-label="t('dialogRenderer.tableEditor.addColumn')"
                                    @click="addColumn"
                                >
                                    <span aria-hidden="true">+</span>
                                    <span class="add-column-label">{{
                                        t('dialogRenderer.tableEditor.addColumn')
                                    }}</span>
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody role="rowgroup">
                        <tr
                            v-for="(_row, rowIndex) in rows"
                            :key="`r-${rowIndex}`"
                            role="row"
                            @dragover.prevent
                            @drop="dropRow(rowIndex)"
                        >
                            <td class="row-head" role="rowheader">
                                <span
                                    class="drag-grip row-grip"
                                    draggable="true"
                                    :title="t('dialogRenderer.tableEditor.dragRow')"
                                    @dragstart="startRowDrag(rowIndex, $event)"
                                    @dragend="endDrag"
                                    >⋮</span
                                >
                                <span class="row-index">{{ rowIndex + 1 }}</span>
                                <button
                                    type="button"
                                    class="icon-btn"
                                    :title="t('dialogRenderer.tableEditor.insertRowBelow')"
                                    :aria-label="t('dialogRenderer.tableEditor.insertRowBelow')"
                                    @click="insertRowAt(rowIndex + 1)"
                                >
                                    <span aria-hidden="true">+</span>
                                </button>
                                <button
                                    type="button"
                                    class="icon-btn icon-btn--danger row-delete"
                                    :title="t('dialogRenderer.tableEditor.deleteRow')"
                                    :aria-label="t('dialogRenderer.tableEditor.deleteRow')"
                                    @click="deleteRow(rowIndex)"
                                >
                                    <span aria-hidden="true">×</span>
                                </button>
                            </td>
                            <td
                                v-for="(_cell, columnIndex) in headers"
                                :id="cellDomId(rowIndex, columnIndex)"
                                :key="`c-${rowIndex}-${columnIndex}`"
                                class="body-cell"
                                role="gridcell"
                                :class="cellClass(rowIndex, columnIndex)"
                                :aria-selected="isActiveCell(rowIndex, columnIndex)"
                                @click="activateCell(rowIndex, columnIndex)"
                                @dblclick="startEditCell(rowIndex, columnIndex)"
                            >
                                <div
                                    v-if="!isEditingCell(rowIndex, columnIndex)"
                                    class="cell-display"
                                    :title="cellRawTitle(rowIndex, columnIndex)"
                                >
                                    <input
                                        v-if="taskState(rows[rowIndex][columnIndex]) !== null"
                                        type="checkbox"
                                        class="task-checkbox"
                                        tabindex="-1"
                                        :checked="taskState(rows[rowIndex][columnIndex]) === 'done'"
                                        :title="t('dialogRenderer.tableEditor.taskToggle')"
                                        @click.stop
                                        @change="toggleTask(rowIndex, columnIndex)"
                                    />
                                    <span class="cell-text">{{
                                        cellDisplayText(rowIndex, columnIndex)
                                    }}</span>
                                </div>
                                <textarea
                                    v-else
                                    :ref="
                                        (element: unknown) =>
                                            setCellRef(rowIndex, columnIndex, element)
                                    "
                                    v-model="rows[rowIndex][columnIndex]"
                                    class="cell-input cell-textarea"
                                    rows="2"
                                    :aria-label="t('dialogRenderer.tableEditor.cell')"
                                    :title="t('dialogRenderer.tableEditor.cellRichHint')"
                                    @keydown="handleCellEditKeydown($event, rowIndex, columnIndex)"
                                    @blur="handleCellEditBlur"
                                ></textarea>
                            </td>
                            <td class="add-column-cell body-add-column" aria-hidden="true"></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <button type="button" class="add-row-btn" @click="addRow">
                <span class="add-row-plus" aria-hidden="true">+</span>
                {{ t('dialogRenderer.tableEditor.addRow') }}
            </button>

            <footer class="table-editor-footer">
                <InfoTip
                    class="table-editor-shortcut-tip"
                    :aria-label="t('dialogRenderer.tableEditor.shortcutHint')"
                >
                    <span class="shortcut-tip-line">{{
                        t('dialogRenderer.tableEditor.shortcutHint')
                    }}</span>
                    <span class="shortcut-tip-line">{{
                        t('dialogRenderer.tableEditor.keyboardHint')
                    }}</span>
                </InfoTip>
                <div class="table-editor-actions">
                    <button
                        type="button"
                        class="dialog-btn dialog-btn--secondary"
                        @click="handleClose"
                    >
                        {{ t('common.cancel') }}
                    </button>
                    <button
                        type="button"
                        class="dialog-btn dialog-btn--primary"
                        @click="handleApply"
                    >
                        {{
                            mode === 'insert'
                                ? t('dialogRenderer.tableEditor.applyInsert')
                                : t('dialogRenderer.tableEditor.applyEdit')
                        }}
                    </button>
                </div>
            </footer>

            <div
                class="resize-grip"
                :title="t('dialogRenderer.tableEditor.resizeHint')"
                @pointerdown.stop.prevent="startResize"
                @mousedown.stop.prevent
            >
                <span></span><span></span><span></span>
            </div>
        </div>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * P0：统一的表格编辑界面。
 *
 * - insert 模式：从空白 3×3 开始，应用后在光标处插入 Markdown 表格；
 * - edit 模式：光标位于已有 GFM 表格时打开，应用后替换原表格。
 * 顶部设置区支持直接指定行列、统一列对齐、导入 CSV/XLSX；
 * 窗口右下角可拖拽改变宽高。
 *
 * 1.5.5 视觉升级（P1-B3 / T8）：基于 P0 冻结令牌层实现四风格 × 三密度的
 * **电子表格化编辑器**：
 * - 尺寸/材质令牌由 `table-style.ts` 单表派生（行高 24/28/32、列头 28/32/36、
 *   列头底色 `--ui-bg-elevated`、hairline 网格、选区 `--ui-accent-soft`、拖拽手柄 4px）；
 * - 生效风格/密度读取 P0 的组件消费 API `useTheme().currentUiAppearance`，
 *   组件根节点写 `--table-*` 变量，CSS 只消费变量、不写 `[data-style=…]` 分支；
 * - 显示层规则：数字/日期右对齐、文本左对齐、日期统一 `YYYY-MM-DD`、空单元格不显示 0；
 * - 键盘：方向键/Tab 移动选区，Enter/F2/双击进入编辑，Enter/Tab 提交并移动，
 *   Shift+Enter 换行，Esc 取消编辑并还原（既有 Ctrl+Enter 应用、Esc 取消对话框语义保留）。
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import BaseDialog from '../../BaseDialog.vue'
import InfoTip from '../../../common/InfoTip.vue'
import { t } from '../../../../common/i18n'
import { useTheme } from '../../../../composables/useTheme'
import {
    serializeMarkdownTable,
    sortMarkdownTableRows,
    transposeMarkdownTable,
    type MarkdownTable,
    type TableAlignment
} from '../../../Markdown/table-markdown'
import { parseTableFile } from './table-import'
import { buildTableCssVariables, resolveTableDensityTokens } from './table-style'
import { formatTableCellDisplay, resolveTableCellAlign, type TableCellAlign } from './table-values'

const props = defineProps<{
    mode: 'insert' | 'edit'
    table: MarkdownTable
    onApply: (markdown: string) => void
    onClose: () => void
}>()

const MAX_ROWS = 200
const MAX_COLUMNS = 50

const headers = reactive<string[]>([...props.table.headers])
const rows = reactive<string[][]>(props.table.rows.map((row) => [...row]))
const alignments = reactive<TableAlignment[]>([
    ...props.table.alignments.map((alignment) => alignment)
])
const columnWidths = reactive<number[]>(headers.map(() => 170))
const sortColumn = ref(0)
const rowTarget = ref(rows.length)
const columnTarget = ref(headers.length)
const bulkAlignment = ref<TableAlignment>('default')
const importing = ref(false)
const importError = ref('')
const importMessage = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const cellRefs = new Map<string, HTMLTextAreaElement>()
let draggedRowIndex: number | null = null
let draggedColumnIndex: number | null = null
let columnResizeCleanup: (() => void) | null = null

// ---------- 视觉令牌（四风格 × 三密度） ----------
/**
 * 生效界面风格/密度（P0 冻结层提供的组件消费入口）。
 *
 * 只读 `currentUiAppearance`：glass 在深色/高饱和/护眼主题下的降级结果已是
 * `effectiveStyle`，组件不再做任何主题/风格判断（DESIGN.md §6）。
 */
const { currentUiAppearance } = useTheme()
const uiStyle = computed(() => currentUiAppearance.value.effectiveStyle)
const uiDensity = computed(() => currentUiAppearance.value.density)
const densityTokens = computed(() => resolveTableDensityTokens(uiDensity.value))
const tableCssVariables = computed(
    () =>
        buildTableCssVariables(
            uiStyle.value,
            uiDensity.value,
            currentUiAppearance.value.glassMode
        ) as unknown as CSSProperties
)

const dialogTitle = computed(() => t('dialogRenderer.tableEditor.title'))
const gridLabel = computed(() => t('dialogRenderer.tableEditor.title'))

const alignOptions = computed(() => [
    {
        value: 'default' as const,
        label: t('dialogRenderer.tableEditor.alignDefault'),
        shortLabel: t('dialogRenderer.tableEditor.alignShortDefault')
    },
    {
        value: 'left' as const,
        label: t('dialogRenderer.tableEditor.alignLeft'),
        shortLabel: t('dialogRenderer.tableEditor.alignShortLeft')
    },
    {
        value: 'center' as const,
        label: t('dialogRenderer.tableEditor.alignCenter'),
        shortLabel: t('dialogRenderer.tableEditor.alignShortCenter')
    },
    {
        value: 'right' as const,
        label: t('dialogRenderer.tableEditor.alignRight'),
        shortLabel: t('dialogRenderer.tableEditor.alignShortRight')
    }
])

const tableWidth = computed(
    () =>
        densityTokens.value.rowHeadWidth +
        densityTokens.value.addColumnWidth +
        columnWidths.reduce((total, width) => total + width, 0)
)

// ---------- 选区 / 编辑态（电子表格化键盘导航） ----------
/** 当前选区（导航态焦点单元格；编辑态即正在编辑的单元格） */
const activeCell = ref<{ row: number; column: number } | null>(null)
/** 是否处于单元格编辑态（textarea 已渲染） */
const editing = ref(false)
/** 进入编辑态时的原始值（Esc 取消时还原） */
let editSnapshot = ''
const gridRef = ref<HTMLElement | null>(null)

/** 单元格 DOM id（供 role=grid 的 aria-activedescendant 引用） */
function cellDomId(rowIndex: number, columnIndex: number): string {
    return `table-editor-cell-${rowIndex}-${columnIndex}`
}

const activeCellId = computed(() =>
    activeCell.value ? cellDomId(activeCell.value.row, activeCell.value.column) : undefined
)

function isActiveCell(rowIndex: number, columnIndex: number): boolean {
    const cell = activeCell.value
    return cell !== null && cell.row === rowIndex && cell.column === columnIndex
}

function isEditingCell(rowIndex: number, columnIndex: number): boolean {
    return editing.value && isActiveCell(rowIndex, columnIndex)
}

/** 把焦点交还网格（导航态键盘操作都发生在 <table> 自身） */
function focusGrid(): void {
    void nextTick(() => {
        gridRef.value?.focus()
    })
}

/** 设置选区并滚动到可视区域（编写时不影响对话框焦点陷阱） */
function setActiveCell(rowIndex: number, columnIndex: number): void {
    activeCell.value = { row: rowIndex, column: columnIndex }
    focusGrid()
    scrollActiveCellIntoView()
}

/** 选中单元格并滚动到可视区（jsdom 未实现 scrollIntoView 时安全跳过） */
function scrollActiveCellIntoView(): void {
    void nextTick(() => {
        const cell = activeCell.value
        if (!cell) return
        const element = gridRef.value?.querySelector<HTMLElement>(
            `#${cellDomId(cell.row, cell.column)}`
        )
        if (element && typeof element.scrollIntoView === 'function') {
            element.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
    })
}

/** 进入编辑态：记录快照并聚焦单元格 textarea（光标置于末尾） */
function startEditCell(rowIndex: number, columnIndex: number): void {
    if (rowIndex < 0 || rowIndex >= rows.length) return
    if (columnIndex < 0 || columnIndex >= headers.length) return
    // 已在编辑同一单元格（双击编辑框内文字等）：不重复进入，避免重置 Esc 快照
    if (isEditingCell(rowIndex, columnIndex)) return
    activeCell.value = { row: rowIndex, column: columnIndex }
    editSnapshot = rows[rowIndex][columnIndex] ?? ''
    editing.value = true
    void nextTick(() => {
        const textarea = cellRefs.get(`${rowIndex}:${columnIndex}`)
        if (!textarea) return
        textarea.focus()
        const end = textarea.value.length
        textarea.setSelectionRange?.(end, end)
    })
}

/** 提交编辑（值已由 v-model 写入，无需额外处理） */
function commitEdit(): void {
    if (!editing.value) return
    editing.value = false
}

/** 取消编辑：还原进入编辑前的原始值 */
function cancelEdit(): void {
    if (!editing.value) return
    const cell = activeCell.value
    if (cell) {
        rows[cell.row][cell.column] = editSnapshot
    }
    editing.value = false
    focusGrid()
}

/** 点击单元格：选中并把焦点交给网格（键盘导航立即可用） */
function activateCell(rowIndex: number, columnIndex: number): void {
    // 点击正在编辑的单元格内部（编辑框区域）：保持编辑态与焦点，不提交/不打断输入
    if (isEditingCell(rowIndex, columnIndex)) return
    if (editing.value) commitEdit()
    activeCell.value = { row: rowIndex, column: columnIndex }
    gridRef.value?.focus()
}

/** Tab/编辑态移动：列内前后移动，跨行首尾回绕，最后一格继续向前沿用 1.5.3「自动新增一行」 */
function moveHorizontal(rowIndex: number, columnIndex: number, step: 1 | -1): boolean {
    if (step === 1) {
        if (columnIndex + 1 < headers.length) {
            setActiveCell(rowIndex, columnIndex + 1)
            return true
        }
        if (rowIndex + 1 < rows.length) {
            setActiveCell(rowIndex + 1, 0)
            return true
        }
        if (rows.length >= MAX_ROWS) return false
        addRow()
        setActiveCell(rows.length - 1, 0)
        return true
    }
    if (columnIndex > 0) {
        setActiveCell(rowIndex, columnIndex - 1)
        return true
    }
    if (rowIndex > 0) {
        setActiveCell(rowIndex - 1, headers.length - 1)
        return true
    }
    return false
}

/** 方向键上下移动（行边界截断，不跨行列换行） */
function moveVertical(rowIndex: number, columnIndex: number, delta: number): void {
    const nextRow = Math.min(rows.length - 1, Math.max(0, rowIndex + delta))
    setActiveCell(nextRow, columnIndex)
}

/** 方向键左右移动（列边界截断） */
function moveLateral(rowIndex: number, columnIndex: number, delta: number): void {
    const nextColumn = Math.min(headers.length - 1, Math.max(0, columnIndex + delta))
    setActiveCell(rowIndex, nextColumn)
}

/** 清空当前选区（Delete/Backspace，电子表格通用行为；不影响表头） */
function clearActiveCell(): void {
    const cell = activeCell.value
    if (!cell) return
    rows[cell.row][cell.column] = ''
}

/** 导航态键盘：只处理焦点在 <table> 自身时的按键，表头输入框/下拉保持原生行为 */
function handleGridKeydown(event: KeyboardEvent): void {
    if (editing.value) return
    if (event.target !== gridRef.value) return
    if (event.isComposing || event.keyCode === 229) return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (rows.length === 0 || headers.length === 0) return
    const current = activeCell.value ?? { row: 0, column: 0 }
    switch (event.key) {
        case 'ArrowUp':
            event.preventDefault()
            moveVertical(current.row, current.column, -1)
            break
        case 'ArrowDown':
            event.preventDefault()
            moveVertical(current.row, current.column, 1)
            break
        case 'ArrowLeft':
            event.preventDefault()
            moveLateral(current.row, current.column, -1)
            break
        case 'ArrowRight':
            event.preventDefault()
            moveLateral(current.row, current.column, 1)
            break
        case 'Tab':
            if (moveHorizontal(current.row, current.column, event.shiftKey ? -1 : 1)) {
                event.preventDefault()
            }
            break
        case 'Home':
            event.preventDefault()
            setActiveCell(current.row, 0)
            break
        case 'End':
            event.preventDefault()
            setActiveCell(current.row, headers.length - 1)
            break
        case 'Enter':
        case 'F2':
            event.preventDefault()
            startEditCell(current.row, current.column)
            break
        case 'Delete':
        case 'Backspace':
            event.preventDefault()
            clearActiveCell()
            break
        default:
            break
    }
}

/** 编辑态键盘：Esc 取消、Enter/Tab 提交并移动、Shift+Enter 换行（Ctrl+Enter 冒泡给应用） */
function handleCellEditKeydown(event: KeyboardEvent, rowIndex: number, columnIndex: number): void {
    if (event.isComposing || event.keyCode === 229) return
    if (event.key === 'Escape') {
        // 阻止冒泡：BaseDialog 的文档级 Esc 监听会关闭对话框，这里 Esc 只取消编辑
        event.preventDefault()
        event.stopPropagation()
        cancelEdit()
        return
    }
    if (event.key === 'Tab') {
        event.preventDefault()
        event.stopPropagation()
        commitEdit()
        if (!moveHorizontal(rowIndex, columnIndex, event.shiftKey ? -1 : 1)) {
            // 首格 Shift+Tab（无上一格）：把焦点留在网格，避免编辑框销毁后焦点丢到 body
            focusGrid()
        }
        return
    }
    if (event.key !== 'Enter') return
    if (event.ctrlKey || event.metaKey || event.altKey) return
    if (event.shiftKey) return
    event.preventDefault()
    event.stopPropagation()
    commitEdit()
    moveVertical(rowIndex, columnIndex, 1)
}

/** 编辑框失焦：提交编辑（点击其他单元格/对话框控件时保持已输入内容） */
function handleCellEditBlur(): void {
    if (!editing.value) return
    commitEdit()
}

/** 网格获得焦点：无选区时默认选中首格（Tab 进入网格即可用方向键） */
function handleGridFocus(): void {
    if (!activeCell.value && rows.length > 0 && headers.length > 0) {
        activeCell.value = { row: 0, column: 0 }
    }
}

function setCellRef(rowIndex: number, columnIndex: number, element: unknown): void {
    const key = `${rowIndex}:${columnIndex}`
    if (element instanceof HTMLTextAreaElement) {
        cellRefs.set(key, element)
    } else {
        cellRefs.delete(key)
    }
}

// ---------- 单元格显示（数字右对齐 / 日期归一化 / 空值占位） ----------
/** 单元格显示文本（空值 → 空串，绝不显示 0；日期统一 YYYY-MM-DD） */
function cellDisplayText(rowIndex: number, columnIndex: number): string {
    return formatTableCellDisplay(rows[rowIndex]?.[columnIndex] ?? '')
}

/** 单元格原始值（作为 title 展示，编辑时仍看到用户输入原文） */
function cellRawTitle(rowIndex: number, columnIndex: number): string | undefined {
    const value = rows[rowIndex]?.[columnIndex] ?? ''
    return value.trim().length > 0 ? value : undefined
}

/** 单元格 class：选区/编辑态 + 对齐（数字右对齐、文本左对齐、显式对齐优先） */
function cellClass(rowIndex: number, columnIndex: number): Record<string, boolean> {
    const value = rows[rowIndex]?.[columnIndex] ?? ''
    const alignment: TableCellAlign = resolveTableCellAlign(
        value,
        alignments[columnIndex] ?? 'default'
    )
    return {
        'is-align-left': alignment === 'left',
        'is-align-center': alignment === 'center',
        'is-align-right': alignment === 'right',
        'is-empty': cellDisplayText(rowIndex, columnIndex) === '',
        'is-task': taskState(value) !== null,
        'is-active': isActiveCell(rowIndex, columnIndex),
        'is-editing': isEditingCell(rowIndex, columnIndex)
    }
}

// ---------- 列对齐（列头操作区下拉框：hover/聚焦时浮现，保持 32px 列头高度） ----------
/** 列头输入框对齐：跟随该列对齐设置（默认左对齐） */
function headerInputStyle(columnIndex: number): CSSProperties {
    const alignment = alignments[columnIndex] ?? 'default'
    return { textAlign: alignment === 'default' ? 'left' : alignment }
}

/** 列对齐下拉框 title/aria-label：「列对齐：左对齐」 */
function alignmentTitle(columnIndex: number): string {
    const alignment = alignments[columnIndex] ?? 'default'
    const label =
        alignOptions.value.find((option) => option.value === alignment)?.label ??
        t('dialogRenderer.tableEditor.alignDefault')
    return `${t('dialogRenderer.tableEditor.alignment')}: ${label}`
}

// ---------- 窗口调整大小 ----------
const panelSize = reactive<{ width: number | null; height: number | null }>({
    width: null,
    height: null
})
const panelContainerStyle = computed<CSSProperties>(() => {
    const style: CSSProperties = {
        border: '1px solid var(--ui-border, var(--border-color))'
    }
    if (panelSize.width) style.width = `${panelSize.width}px`
    if (panelSize.height) style.height = `${panelSize.height}px`
    return style
})
let resizeCleanup: (() => void) | null = null

function startResize(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement | null
    const container = handle?.closest('.dialog-container') as HTMLElement | null
    if (!container) return
    const rect = container.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const startWidth = rect.width
    const startHeight = rect.height
    const minWidth = 560
    const minHeight = 420
    const maxWidth = Math.max(minWidth, window.innerWidth - 40)
    const maxHeight = Math.max(minHeight, window.innerHeight - 40)
    const onMove = (moveEvent: PointerEvent): void => {
        panelSize.width = Math.min(
            maxWidth,
            Math.max(minWidth, startWidth + moveEvent.clientX - startX)
        )
        panelSize.height = Math.min(
            maxHeight,
            Math.max(minHeight, startHeight + moveEvent.clientY - startY)
        )
    }
    const cleanup = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', cleanup)
        resizeCleanup = null
    }
    resizeCleanup?.()
    resizeCleanup = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cleanup)
}

onBeforeUnmount(() => {
    resizeCleanup?.()
    columnResizeCleanup?.()
})

// ---------- 行列/对齐 ----------
function clampCount(value: unknown, max: number): number {
    const numeric = Math.round(Number(value))
    return Number.isFinite(numeric) ? Math.min(max, Math.max(1, numeric)) : 1
}

function applyRowTarget(): void {
    const count = clampCount(rowTarget.value, MAX_ROWS)
    while (rows.length < count) rows.push(Array.from({ length: headers.length }, () => ''))
    if (rows.length > count) rows.splice(count)
    rowTarget.value = rows.length
}

function applyColumnTarget(): void {
    const count = clampCount(columnTarget.value, MAX_COLUMNS)
    while (headers.length < count) {
        headers.push(`${t('dialogRenderer.tableEditor.column')} ${headers.length + 1}`)
        for (const row of rows) row.push('')
        alignments.push('default')
        columnWidths.push(170)
    }
    if (headers.length > count) {
        headers.splice(count)
        for (const row of rows) row.splice(count)
        alignments.splice(count)
        columnWidths.splice(count)
    }
    columnTarget.value = headers.length
}

function applyBulkAlignment(): void {
    alignments.splice(0, alignments.length, ...headers.map(() => bulkAlignment.value))
}

function ensureColumnCells(): void {
    for (const row of rows) {
        while (row.length < headers.length) row.push('')
        row.length = headers.length
    }
    while (alignments.length < headers.length) alignments.push('default')
    alignments.length = headers.length
    while (columnWidths.length < headers.length) columnWidths.push(170)
    columnWidths.length = headers.length
}

function addRow(): void {
    if (rows.length >= MAX_ROWS) return
    rows.push(Array.from({ length: headers.length }, () => ''))
}

function insertRowAt(index: number): void {
    if (rows.length >= MAX_ROWS) return
    rows.splice(
        Math.max(0, Math.min(index, rows.length)),
        0,
        Array.from({ length: headers.length }, () => '')
    )
}

function deleteRow(index: number): void {
    rows.splice(index, 1)
}

function addColumn(): void {
    insertColumnAt(headers.length)
}

function insertColumnAt(index: number): void {
    if (headers.length >= MAX_COLUMNS) return
    const target = Math.max(0, Math.min(index, headers.length))
    headers.splice(target, 0, `${t('dialogRenderer.tableEditor.column')} ${headers.length + 1}`)
    for (const row of rows) row.splice(target, 0, '')
    alignments.splice(target, 0, 'default')
    columnWidths.splice(target, 0, 170)
}

function deleteColumn(index: number): void {
    if (headers.length <= 1) return
    headers.splice(index, 1)
    for (const row of rows) row.splice(index, 1)
    alignments.splice(index, 1)
    columnWidths.splice(index, 1)
    sortColumn.value = Math.min(sortColumn.value, headers.length - 1)
}

function handleSortColumnChange(event: Event): void {
    sortColumn.value = Number((event.target as HTMLSelectElement).value)
}

function sortRows(direction: 'asc' | 'desc'): void {
    const column = Math.max(0, Math.min(sortColumn.value, headers.length - 1))
    const sorted = sortMarkdownTableRows(
        {
            headers: [...headers],
            rows: rows.map((row) => [...row]),
            alignments: [...alignments],
            startLine: props.table.startLine,
            endLine: props.table.endLine
        },
        column,
        direction
    )
    rows.splice(0, rows.length, ...sorted.rows.map((row) => [...row]))
}

function transposeTable(): void {
    const transposed = transposeMarkdownTable({
        headers: [...headers],
        rows: rows.map((row) => [...row]),
        alignments: [...alignments],
        startLine: props.table.startLine,
        endLine: props.table.endLine
    })
    headers.splice(0, headers.length, ...transposed.headers)
    rows.splice(0, rows.length, ...transposed.rows.map((row) => [...row]))
    alignments.splice(
        0,
        alignments.length,
        ...transposed.headers.map(() => 'default' as TableAlignment)
    )
    columnWidths.splice(0, columnWidths.length, ...transposed.headers.map(() => 170))
    sortColumn.value = 0
}

// ---------- 行/列拖动排序 ----------
function startRowDrag(index: number, event: DragEvent): void {
    draggedRowIndex = index
    event.dataTransfer?.setData('text/plain', `row:${index}`)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function dropRow(targetIndex: number): void {
    if (draggedRowIndex === null || draggedRowIndex === targetIndex) return
    const [moved] = rows.splice(draggedRowIndex, 1)
    if (!moved) return
    rows.splice(targetIndex, 0, moved)
    draggedRowIndex = null
}

function startColumnDrag(index: number, event: DragEvent): void {
    draggedColumnIndex = index
    event.dataTransfer?.setData('text/plain', `column:${index}`)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function dropColumn(targetIndex: number): void {
    if (draggedColumnIndex === null || draggedColumnIndex === targetIndex) return
    const from = draggedColumnIndex
    const [movedHeader] = headers.splice(from, 1)
    const [movedAlignment] = alignments.splice(from, 1)
    const [movedWidth] = columnWidths.splice(from, 1)
    for (const row of rows) {
        const [movedCell] = row.splice(from, 1)
        row.splice(targetIndex, 0, movedCell ?? '')
    }
    headers.splice(targetIndex, 0, movedHeader ?? '')
    alignments.splice(targetIndex, 0, movedAlignment ?? 'default')
    columnWidths.splice(targetIndex, 0, movedWidth ?? 170)
    draggedColumnIndex = null
}

function endDrag(): void {
    draggedRowIndex = null
    draggedColumnIndex = null
}

function taskState(value: string): 'todo' | 'done' | null {
    const match = value.match(/^\s*- \[([ xX])\]/)
    if (!match) return null
    return match[1].toLowerCase() === 'x' ? 'done' : 'todo'
}

function toggleTask(rowIndex: number, columnIndex: number): void {
    const value = rows[rowIndex][columnIndex] ?? ''
    rows[rowIndex][columnIndex] = value.replace(
        /^(\s*- \[)([ xX])(\])/,
        (_match, prefix: string, state: string, suffix: string) =>
            `${prefix}${state.toLowerCase() === 'x' ? ' ' : 'x'}${suffix}`
    )
}

// ---------- 列宽拖动 ----------
function startColumnResize(index: number, event: PointerEvent): void {
    const startX = event.clientX
    const startWidth = columnWidths[index] ?? 170
    const onMove = (moveEvent: PointerEvent): void => {
        columnWidths[index] = Math.min(600, Math.max(80, startWidth + moveEvent.clientX - startX))
    }
    const cleanup = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', cleanup)
        columnResizeCleanup = null
    }
    columnResizeCleanup?.()
    columnResizeCleanup = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cleanup)
}

watch(
    () => [rows.length, headers.length] as const,
    ([rowCount, columnCount]) => {
        rowTarget.value = rowCount
        columnTarget.value = columnCount
        // 行列被删减后收敛选区，避免 aria-activedescendant 指向不存在的单元格
        const cell = activeCell.value
        if (!cell) return
        if (cell.row < rowCount && cell.column < columnCount) return
        editing.value = false
        activeCell.value =
            rowCount > 0 && columnCount > 0
                ? {
                      row: Math.min(cell.row, rowCount - 1),
                      column: Math.min(cell.column, columnCount - 1)
                  }
                : null
    }
)

// ---------- 导入 ----------
function triggerImport(): void {
    importError.value = ''
    importMessage.value = ''
    fileInput.value?.click()
}

async function handleFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement
    const file = input.files?.[0]
    if (!file) return
    importing.value = true
    importError.value = ''
    importMessage.value = ''
    try {
        const imported = await parseTableFile(file)
        if (imported.headers.length === 0) {
            throw new Error(t('dialogRenderer.tableEditor.importEmpty'))
        }
        headers.splice(0, headers.length, ...imported.headers)
        rows.splice(0, rows.length, ...imported.rows.map((row) => [...row]))
        alignments.splice(
            0,
            alignments.length,
            ...imported.headers.map(() => 'default' as TableAlignment)
        )
        columnWidths.splice(0, columnWidths.length, ...imported.headers.map(() => 170))
        sortColumn.value = 0
        ensureColumnCells()
        importMessage.value = t('dialogRenderer.tableEditor.importSuccess', {
            rows: imported.rows.length,
            columns: imported.headers.length
        })
    } catch (error) {
        importError.value = error instanceof Error ? error.message : String(error)
    } finally {
        importing.value = false
        input.value = ''
    }
}

function handleClose(): void {
    props.onClose()
}

function handleApply(): void {
    commitEdit()
    ensureColumnCells()
    props.onApply(
        serializeMarkdownTable({
            headers: [...headers],
            rows: rows.map((row) => [...row]),
            alignments: [...alignments],
            startLine: props.table.startLine,
            endLine: props.table.endLine
        })
    )
}
</script>

<style scoped>
/**
 * 表格编辑器样式（视觉升级 P1-B3 / T8）
 *
 * 约定：
 * - 所有尺寸/颜色只消费令牌：`--table-*`（本组件在 table-style.ts 派生，根节点内联绑定）
 *   + P0 冻结的 `--ui-*`（颜色/材质/动效/圆角/阴影）；
 * - 不写 `[data-style=…]` / `[data-density=…]` 分支：风格/密度差异已由变量值携带；
 * - 表格根变量均带默认值兜底（主题未初始化/快照渲染时仍可读）。
 */
.table-editor-body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad, 12px);
    width: 100%;
    /* 用户反馈（2026-11-27）：本节点为 content-box（全局 border-box 未覆盖），
       width:100% + padding 会让正文溢出容器 32px，把右下角 resize-grip 挤出
       overflow:hidden 的裁剪边界导致拖拽不可点——此处显式 border-box。 */
    box-sizing: border-box;
    min-width: 0;
    min-height: 0;
    flex: 1;
    color: var(--ui-text, var(--text-primary, var(--text-color)));
    font-size: var(--table-font-size, 13px);
    /* 用户反馈（2026-11-27）：表格编辑器内容与边框要多留白——
       正文根节点统一内边距（密度档 12/16/20 + 4px 呼吸量），设置区/网格/底部按钮
       均与工具窗边框保持 16px 及以上间距（边框 1px 另计）。 */
    padding: calc(var(--ui-pad, 12px) + 4px);
}

/* ---------- 表格设置区（1.5.6 UI 重设计：紧凑工具条） ---------- */
.table-settings {
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 10px;
    border: 1px solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-lg, 8px);
    background: var(--table-body-bg, var(--ui-bg-elevated));
}

.settings-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
}

.settings-divider {
    flex: 0 0 auto;
    width: 1px;
    height: 18px;
    background: var(--ui-border, var(--border-color));
    opacity: 0.7;
}

.setting-field {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--ui-text-secondary, var(--text-secondary));
    white-space: nowrap;
}

.setting-label {
    color: var(--ui-text-secondary, var(--text-secondary));
}

.setting-input,
.setting-select {
    height: calc(var(--table-control-height, var(--ui-control-height, 30px)) - 4px);
    padding: 0 8px;
    border: 1px solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 4px);
    background: var(--ui-bg, var(--bg-primary));
    color: var(--ui-text, var(--text-primary));
    font: inherit;
    font-size: 12px;
}

.setting-input {
    width: 56px;
}

.setting-select {
    min-width: 104px;
}

.setting-select--align {
    min-width: 116px;
}

.setting-select--sort {
    max-width: 132px;
}

.setting-input:focus,
.setting-select:focus {
    border-color: var(--ui-accent, var(--accent-color));
    outline: none;
    box-shadow: var(--ui-focus-shadow, 0 0 0 3px var(--ui-focus-ring));
}

.tool-btn-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-md, 6px);
    background: var(--ui-bg, var(--bg-primary));
}

.tool-btn {
    height: calc(var(--table-control-height, var(--ui-control-height, 30px)) - 8px);
    padding: 0 10px;
    border: none;
    border-radius: var(--ui-radius-sm, 3px);
    background: transparent;
    color: var(--ui-text-secondary, var(--text-secondary));
    font: inherit;
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition:
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.tool-btn:hover {
    color: var(--ui-accent, var(--accent-color));
    background: var(--ui-accent-soft, transparent);
}

.settings-spacer {
    flex: 1 1 auto;
}

.import-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: calc(var(--table-control-height, var(--ui-control-height, 30px)) - 4px);
    padding: 0 10px;
    border: 1px solid color-mix(in srgb, var(--ui-accent, var(--accent-color)) 45%, transparent);
    border-radius: var(--ui-radius-sm, 4px);
    background: color-mix(
        in srgb,
        var(--ui-accent, var(--accent-color)) 9%,
        var(--ui-bg-elevated, var(--bg-primary))
    );
    color: var(--ui-accent, var(--accent-color));
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        border-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.import-btn:hover {
    background: color-mix(
        in srgb,
        var(--ui-accent, var(--accent-color)) 15%,
        var(--ui-bg-elevated, var(--bg-primary))
    );
}

.import-btn:disabled {
    opacity: 0.6;
    cursor: wait;
}

.import-icon {
    font-size: 13px;
    line-height: 1;
}

.file-input {
    display: none;
}

.settings-hint {
    flex: 0 0 auto;
}

.import-message {
    margin: 4px 0 0;
    font-size: 11px;
    line-height: 1.45;
}

.import-message--error {
    color: var(--ui-danger, var(--danger-color));
}

.import-message--success {
    color: var(--ui-success, var(--success-color));
}

/* ---------- 网格壳 ---------- */
.table-editor-body.is-resized .table-editor-scroll {
    max-height: none;
}

.table-editor-scroll {
    flex: 1 1 auto;
    min-height: 160px;
    max-height: none;
    overflow: auto;
    border: 1px solid var(--table-border-color, var(--ui-border));
    border-radius: var(--ui-radius-lg, 8px);
    background: var(--table-body-bg, var(--ui-bg-elevated));
    box-shadow: var(--ui-shadow-1, none);
}

.table-editor-grid {
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    outline: none;
    font-size: var(--table-font-size, 13px);
}

/* 列头：列头高 32（密度同步）、字重 600、底色 bg-elevated、hairline 网格 */
.table-editor-grid thead th {
    position: sticky;
    top: 0;
    z-index: 3;
    height: var(--table-header-height, 32px);
    padding: 0 var(--table-cell-pad-x, 6px);
    border-right: 1px solid var(--table-grid-color, var(--ui-border));
    border-bottom: 1px solid var(--table-header-border-color, var(--ui-border-strong));
    background: var(--table-header-bg, var(--ui-bg-elevated));
    /* glass 高光边：--ui-highlight-border-color = 固定白基色 × --ui-highlight-border-alpha
       （glass / steady 按材质透明度生效，其余风格 0 → transparent；原 color-mix 写法等价迁移） */
    box-shadow:
        inset 0 1px 0 var(--ui-highlight-border-color),
        inset 0 -1px 0 color-mix(in srgb, var(--table-header-border-color) 45%, transparent);
    color: var(--ui-text-secondary, var(--text-secondary));
    font-weight: 600;
    font-size: var(--table-font-size, 13px);
    vertical-align: middle;
    backdrop-filter: var(--table-header-backdrop, none);
}

/* 表体单元格：行高 24/28/32、hairline 网格、内容单行垂直居中 */
.table-editor-grid tbody td {
    height: var(--table-row-height, 28px);
    padding: 0 var(--table-cell-pad-x, 6px);
    border-right: 1px solid var(--table-grid-color, var(--ui-border));
    border-bottom: 1px solid var(--table-grid-color, var(--ui-border));
    background: var(--table-body-bg, var(--ui-bg-elevated));
    font-size: var(--table-font-size, 13px);
    color: var(--ui-text, var(--text-primary));
    vertical-align: middle;
}

.table-editor-grid tbody tr:nth-child(even) td {
    background: color-mix(
        in srgb,
        var(--ui-text, var(--text-primary)) 2.5%,
        var(--table-body-bg, var(--ui-bg-elevated))
    );
}

.table-editor-grid th:last-child,
.table-editor-grid td:last-child {
    border-right: 0;
}

.table-editor-grid tbody tr:last-child td {
    border-bottom: 0;
}

.table-editor-grid tbody tr:last-child .row-head {
    border-bottom: 0;
}

/* 行头 / 左上角：粘性左列（背景必须不透明，滚动时覆盖下方单元格）。
   选择器提高特异性以覆盖 thead th / tbody td / 偶数行斑马线的背景规则。 */
.table-editor-grid thead tr th.corner-cell,
.table-editor-grid tbody tr td.row-head {
    position: sticky;
    left: 0;
    z-index: 4;
    width: var(--table-row-head-width, 96px);
    min-width: var(--table-row-head-width, 96px);
    max-width: var(--table-row-head-width, 96px);
    padding: 0 4px;
    background: color-mix(
        in srgb,
        var(--ui-text, var(--text-primary)) 4%,
        var(--ui-bg-elevated, var(--bg-primary))
    );
    text-align: center;
    white-space: nowrap;
    border-right: 1px solid var(--table-header-border-color, var(--ui-border-strong)) !important;
}

.table-editor-grid thead tr th.corner-cell {
    z-index: 6;
}

.row-head > .icon-btn {
    vertical-align: middle;
}

/* ---------- 列头内部 ---------- */
.column-head {
    position: relative;
    min-width: 0;
}

.column-head-main {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 100%;
}

.drag-grip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 10px;
    height: 100%;
    color: var(--ui-text-tertiary, var(--text-secondary));
    font-size: 10px;
    letter-spacing: -2px;
    cursor: grab;
    user-select: none;
    opacity: 0.6;
}

.drag-grip:hover {
    color: var(--ui-accent, var(--accent-color));
    opacity: 1;
}

.drag-grip:active {
    cursor: grabbing;
}

.col-resizer {
    position: absolute;
    top: 0;
    right: calc(var(--table-resizer-width, 4px) * -0.5);
    bottom: 0;
    width: var(--table-resizer-width, 4px);
    cursor: col-resize;
    z-index: 5;
    background: transparent;
}

/* 列宽拖拽手柄：4px，悬停/拖拽才显强调色（规格） */
.col-resizer:hover,
.col-resizer:active {
    background: var(--ui-accent, var(--accent-color));
}

.header-input {
    flex: 1;
    min-width: 0;
    height: calc(var(--table-header-height, 32px) - 8px);
    padding: 0 4px;
    border: 1px solid transparent;
    border-radius: var(--ui-radius-sm, 2px);
    background: transparent;
    color: var(--ui-text, var(--text-primary));
    font-weight: 600;
    font-size: var(--table-font-size, 13px);
}

.header-input:hover {
    border-color: color-mix(in srgb, var(--ui-accent, var(--accent-color)) 35%, transparent);
}

.header-input:focus {
    border-color: var(--ui-accent, var(--accent-color));
    background: var(--ui-bg-elevated, var(--bg-primary));
    outline: none;
}

/* 列头操作区：默认隐藏、悬停/聚焦时浮现，避免挤占 32px 列头宽度 */
.column-actions {
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 0 2px;
    border-radius: var(--ui-radius-sm, 2px);
    background: var(--table-header-bg, var(--ui-bg-elevated));
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.column-head:hover .column-actions,
.column-head:focus-within .column-actions {
    opacity: 1;
    pointer-events: auto;
}

.column-index,
.row-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: 16px;
    height: 16px;
    padding: 0 2px;
    border-radius: var(--ui-radius-sm, 2px);
    background: color-mix(in srgb, var(--ui-text, var(--text-primary)) 8%, transparent);
    font-size: 10px;
    font-weight: 600;
    color: var(--ui-text-secondary, var(--text-secondary));
}

/* ---------- 图标按钮 ---------- */
.icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: var(--table-icon-size, 20px);
    height: var(--table-icon-size, 20px);
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--ui-radius-sm, 2px);
    background: transparent;
    color: var(--ui-text-secondary, var(--text-secondary));
    font-size: calc(var(--table-icon-size, 20px) - 5px);
    line-height: 1;
    cursor: pointer;
    transition:
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.icon-btn:hover {
    color: var(--ui-danger, var(--danger-color));
    background: color-mix(in srgb, var(--ui-danger, var(--danger-color)) 10%, transparent);
}

.icon-btn:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow, 0 0 0 3px var(--ui-focus-ring));
}

.icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

/* 列对齐下拉框：收在列头操作区内，控件高随列头高（不撑高 32px 列头） */
.column-align-select {
    flex-shrink: 0;
    width: 42px;
    height: calc(var(--table-header-height, 32px) - 8px);
    padding: 0 2px;
    border: 1px solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 2px);
    background: var(--ui-bg-elevated, var(--bg-primary));
    color: var(--ui-text-secondary, var(--text-secondary));
    font: inherit;
    font-size: 10px;
    cursor: pointer;
}

.column-align-select:focus {
    border-color: var(--ui-accent, var(--accent-color));
    outline: none;
}

.row-delete {
    opacity: 0;
}

tbody tr:hover .row-delete,
.row-delete:focus-visible {
    opacity: 1;
}

/* ---------- 单元格：显示态 / 编辑态 / 选区 ---------- */
.body-cell {
    position: relative;
    min-width: 0;
    cursor: cell;
}

.cell-display {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: calc(var(--table-row-height, 28px) - 2px);
    overflow: hidden;
}

.cell-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    line-height: 1.4;
}

/* 空单元格占位：显示淡化的「—」而不是 0（视觉升级方案 §4.3；任务单元格保留复选框不占位） */
.body-cell.is-empty:not(.is-task) .cell-text:empty::before {
    content: '—';
    color: var(--ui-text-tertiary, var(--text-secondary));
    opacity: 0.4;
}

/* 对齐：显式列对齐优先，default 下数字/日期右对齐、文本左对齐（table-values.ts 判定） */
.is-align-left .cell-text {
    text-align: left;
}

.is-align-center .cell-text {
    text-align: center;
}

.is-align-right .cell-text {
    text-align: right;
}

.is-align-center .cell-display {
    justify-content: center;
}

.is-align-right .cell-display {
    justify-content: flex-end;
}

.task-checkbox {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    margin: 0;
    accent-color: var(--ui-accent, var(--accent-color));
    cursor: pointer;
}

/* 选区：背景 accent-soft + 2px accent 边框（规格 §4.3） */
.table-editor-grid tbody td.body-cell.is-active {
    background: var(--ui-accent-soft, var(--selection-bg));
    box-shadow: inset 0 0 0 2px var(--ui-accent, var(--accent-color));
}

.table-editor-grid tbody td.body-cell.is-active .cell-text {
    color: var(--ui-text, var(--text-primary));
}

/* 编辑态：单元格内渲染 textarea，覆盖选区边框并允许行高临时增高 */
.table-editor-grid tbody td.body-cell.is-editing {
    padding: 0 2px;
    background: var(--table-body-bg, var(--ui-bg-elevated));
    box-shadow: inset 0 0 0 2px var(--ui-accent, var(--accent-color));
    cursor: text;
}

.cell-input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    color: inherit;
    font: inherit;
}

.cell-textarea {
    display: block;
    min-height: calc(var(--table-row-height, 28px) * 2);
    max-height: 180px;
    padding: 4px 6px;
    border: 1px solid color-mix(in srgb, var(--ui-border, var(--border-color)) 70%, transparent);
    border-radius: var(--ui-radius-sm, 2px);
    background: var(--ui-bg-elevated, var(--bg-primary));
    font-size: var(--table-font-size, 13px);
    line-height: 1.5;
    resize: vertical;
    field-sizing: content;
}

.cell-textarea:focus {
    border-color: var(--ui-accent, var(--accent-color));
    box-shadow: var(--ui-focus-shadow, 0 0 0 3px var(--ui-focus-ring));
    outline: none;
}

/* ---------- 行列新增 ---------- */
/* 提高特异性以覆盖 thead th / tbody td 的背景与对齐规则 */
.table-editor-grid thead tr th.add-column-cell,
.table-editor-grid tbody tr td.add-column-cell {
    width: var(--table-add-column-width, 54px);
    min-width: var(--table-add-column-width, 54px);
    text-align: center;
    vertical-align: middle;
    background: color-mix(
        in srgb,
        var(--ui-text, var(--text-primary)) 2%,
        var(--table-body-bg, var(--ui-bg-elevated, var(--bg-primary)))
    );
}

.add-column-btn {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: calc(var(--table-add-column-width, 54px) - 14px);
    height: calc(var(--table-row-height, 28px) * 1.4);
    padding: 0;
    border: 1px dashed var(--table-border-color, var(--ui-border));
    border-radius: var(--ui-radius-md, 4px);
    background: transparent;
    color: var(--ui-text-secondary, var(--text-secondary));
    cursor: pointer;
    transition:
        border-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.add-column-btn:hover {
    border-color: var(--ui-accent, var(--accent-color));
    color: var(--ui-accent, var(--accent-color));
    background: color-mix(in srgb, var(--ui-accent, var(--accent-color)) 8%, transparent);
}

.add-column-btn > span:first-child {
    font-size: 16px;
    line-height: 1;
}

.add-column-label {
    font-size: 9px;
    line-height: 1.2;
    white-space: nowrap;
}

.add-row-btn {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    height: var(--table-control-height, var(--ui-control-height, 32px));
    padding: 0 12px;
    border: 1px dashed var(--table-border-color, var(--ui-border));
    border-radius: var(--ui-radius-md, 4px);
    background: transparent;
    color: var(--ui-text-secondary, var(--text-secondary));
    font-size: var(--table-font-size, 13px);
    cursor: pointer;
    transition:
        border-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.add-row-btn:hover {
    border-color: var(--ui-accent, var(--accent-color));
    color: var(--ui-accent, var(--accent-color));
    background: color-mix(in srgb, var(--ui-accent, var(--accent-color)) 8%, transparent);
}

.add-row-plus {
    font-size: 16px;
    line-height: 1;
}

/* ---------- 底部操作区（1.5.6 UI 重设计：提示收进 ⓘ） ---------- */
.table-editor-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
    padding-top: 6px;
    border-top: 1px solid var(--table-border-color, var(--ui-border));
}

.table-editor-shortcut-tip {
    display: inline-flex;
    align-items: center;
}

.shortcut-tip-line {
    display: block;
    white-space: nowrap;
    font-size: 11px;
    line-height: 1.5;
    color: var(--ui-text-tertiary, var(--text-secondary));
}

.table-editor-actions {
    display: flex;
    gap: 8px;
}

/* ---------- 右下角缩放 ---------- */
.resize-grip {
    position: absolute;
    /* 用户反馈（2026-11-27）：内缩 2px 而非 -2px，避免被 .dialog-container 的
       overflow:hidden 裁剪导致拖拽不可点（out-of-bounds 时 elementFromPoint 命中下层）。 */
    right: 2px;
    bottom: 2px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 2px;
    width: 20px;
    height: 20px;
    padding: 3px;
    box-sizing: border-box;
    cursor: nwse-resize;
    opacity: 0.55;
    /* 拖拽把手置于正文内容之上：设置区/网格/底部按钮不遮挡命中 */
    z-index: 2;
}

.resize-grip span {
    display: block;
    height: 2px;
    border-radius: 1px;
    background: var(--ui-text-secondary, var(--text-secondary));
}

.resize-grip span:nth-child(1) {
    width: 6px;
}

.resize-grip span:nth-child(2) {
    width: 10px;
}

.resize-grip span:nth-child(3) {
    width: 14px;
}

.resize-grip:hover {
    opacity: 1;
}

/* 窄屏：隐藏新增列文字，保留加号 */
@media (max-width: 760px) {
    .add-column-label {
        display: none;
    }

    .shortcut-hint {
        display: none;
    }

    .import-btn {
        margin-left: 0;
    }
}
</style>
