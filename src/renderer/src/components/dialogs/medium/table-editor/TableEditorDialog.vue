<template>
    <BaseDialog
        :visible="true"
        :title="dialogTitle"
        width="min(1000px, 95vw)"
        reset-position-on-open
        :container-style="panelContainerStyle"
        @close="handleClose"
    >
        <div
            class="table-editor-body"
            :class="{ 'is-resized': panelSize.height !== null }"
            @keydown.ctrl.enter.prevent="handleApply"
            @keydown.meta.enter.prevent="handleApply"
        >
            <section
                class="table-settings"
                :aria-label="t('dialogRenderer.tableEditor.settingsTitle')"
            >
                <div class="settings-controls">
                    <label class="setting-field">
                        <span>{{ t('dialogRenderer.tableEditor.rows') }}</span>
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
                        <span>{{ t('dialogRenderer.tableEditor.columns') }}</span>
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
                    <label class="setting-field setting-field--wide">
                        <span>{{ t('dialogRenderer.tableEditor.allColumnsAlign') }}</span>
                        <select
                            v-model="bulkAlignment"
                            class="setting-select"
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
                </div>
                <div class="settings-tools">
                    <label class="setting-field">
                        <span>{{ t('dialogRenderer.tableEditor.sortBy') }}</span>
                        <select
                            :value="sortColumn"
                            class="setting-select"
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
                <p class="cell-rich-hint">{{ t('dialogRenderer.tableEditor.cellRichHint') }}</p>
                <p v-if="importError" class="import-message import-message--error" role="alert">
                    {{ importError }}
                </p>
                <p v-else-if="importMessage" class="import-message import-message--success">
                    {{ importMessage }}
                </p>
            </section>

            <div class="table-editor-scroll">
                <table class="table-editor-grid" :style="{ width: `${tableWidth}px` }">
                    <colgroup>
                        <col style="width: 96px" />
                        <col
                            v-for="(_width, columnIndex) in columnWidths"
                            :key="`col-${columnIndex}`"
                            :style="{ width: `${columnWidths[columnIndex]}px` }"
                        />
                        <col style="width: 54px" />
                    </colgroup>
                    <thead>
                        <tr>
                            <th class="corner-cell" aria-hidden="true"></th>
                            <th
                                v-for="(_header, columnIndex) in headers"
                                :key="`h-${columnIndex}`"
                                class="column-head"
                                @dragover.prevent
                                @drop="dropColumn(columnIndex)"
                            >
                                <div class="column-head-row">
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
                                        :aria-label="t('dialogRenderer.tableEditor.header')"
                                        :placeholder="`${t('dialogRenderer.tableEditor.column')} ${columnIndex + 1}`"
                                    />
                                    <button
                                        type="button"
                                        class="icon-btn"
                                        :title="t('dialogRenderer.tableEditor.insertColumnRight')"
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
                                        :aria-label="t('dialogRenderer.tableEditor.deleteColumn')"
                                        :disabled="headers.length <= 1"
                                        @click="deleteColumn(columnIndex)"
                                    >
                                        <span aria-hidden="true">×</span>
                                    </button>
                                </div>
                                <select
                                    v-model="alignments[columnIndex]"
                                    class="column-align-select"
                                    :aria-label="t('dialogRenderer.tableEditor.alignment')"
                                >
                                    <option
                                        v-for="option in alignOptions"
                                        :key="option.value"
                                        :value="option.value"
                                    >
                                        {{ option.shortLabel }}
                                    </option>
                                </select>
                                <span
                                    class="col-resizer"
                                    :title="t('dialogRenderer.tableEditor.resizeColumn')"
                                    @pointerdown.stop.prevent="
                                        startColumnResize(columnIndex, $event)
                                    "
                                    @mousedown.stop.prevent
                                ></span>
                            </th>
                            <th class="add-column-cell">
                                <button
                                    type="button"
                                    class="add-column-btn"
                                    :title="t('dialogRenderer.tableEditor.addColumn')"
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
                    <tbody>
                        <tr
                            v-for="(_row, rowIndex) in rows"
                            :key="`r-${rowIndex}`"
                            @dragover.prevent
                            @drop="dropRow(rowIndex)"
                        >
                            <td class="row-head">
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
                                :key="`c-${rowIndex}-${columnIndex}`"
                                class="body-cell"
                            >
                                <div class="cell-editor">
                                    <input
                                        v-if="taskState(rows[rowIndex][columnIndex]) !== null"
                                        type="checkbox"
                                        class="task-checkbox"
                                        :checked="taskState(rows[rowIndex][columnIndex]) === 'done'"
                                        :title="t('dialogRenderer.tableEditor.taskToggle')"
                                        @change="toggleTask(rowIndex, columnIndex)"
                                    />
                                    <textarea
                                        :ref="
                                            (element: unknown) =>
                                                setCellRef(rowIndex, columnIndex, element)
                                        "
                                        v-model="rows[rowIndex][columnIndex]"
                                        class="cell-input cell-textarea"
                                        rows="2"
                                        :aria-label="t('dialogRenderer.tableEditor.cell')"
                                        :title="t('dialogRenderer.tableEditor.cellRichHint')"
                                        @keydown.tab.prevent="
                                            handleCellTab($event, rowIndex, columnIndex)
                                        "
                                    ></textarea>
                                </div>
                            </td>
                            <td class="add-column-cell body-add-column"></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <button type="button" class="add-row-btn" @click="addRow">
                <span class="add-row-plus" aria-hidden="true">+</span>
                {{ t('dialogRenderer.tableEditor.addRow') }}
            </button>

            <footer class="table-editor-footer">
                <span class="shortcut-hint">
                    {{ t('dialogRenderer.tableEditor.shortcutHint') }}
                </span>
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
 * 窗口右下角可拖拽改变宽高；每列对齐使用下拉框。
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import BaseDialog from '../../BaseDialog.vue'
import { t } from '../../../../common/i18n'
import {
    serializeMarkdownTable,
    sortMarkdownTableRows,
    transposeMarkdownTable,
    type MarkdownTable,
    type TableAlignment
} from '../../../Markdown/table-markdown'
import { parseTableFile } from './table-import'

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
const tableWidth = computed(() => 96 + 54 + columnWidths.reduce((total, width) => total + width, 0))
let draggedRowIndex: number | null = null
let draggedColumnIndex: number | null = null
let columnResizeCleanup: (() => void) | null = null

const dialogTitle = computed(() => t('dialogRenderer.tableEditor.title'))

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

// ---------- 窗口调整大小 ----------
const panelSize = reactive<{ width: number | null; height: number | null }>({
    width: null,
    height: null
})
const panelContainerStyle = computed<CSSProperties>(() => {
    const style: CSSProperties = {
        border: '1px solid var(--border-color, #d8d3e2)'
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

// ---------- 单元格 ----------
function setCellRef(rowIndex: number, columnIndex: number, element: unknown): void {
    const key = `${rowIndex}:${columnIndex}`
    if (element instanceof HTMLTextAreaElement) {
        cellRefs.set(key, element)
    } else {
        cellRefs.delete(key)
    }
}

function focusCell(rowIndex: number, columnIndex: number): void {
    void nextTick(() => {
        cellRefs.get(`${rowIndex}:${columnIndex}`)?.focus()
    })
}

function handleCellTab(event: KeyboardEvent, rowIndex: number, columnIndex: number): void {
    if (event.shiftKey) {
        if (columnIndex > 0) {
            focusCell(rowIndex, columnIndex - 1)
        } else if (rowIndex > 0) {
            focusCell(rowIndex - 1, headers.length - 1)
        }
        return
    }
    if (columnIndex + 1 < headers.length) {
        focusCell(rowIndex, columnIndex + 1)
        return
    }
    if (rowIndex + 1 < rows.length) {
        focusCell(rowIndex + 1, 0)
        return
    }
    addRow()
    focusCell(rowIndex + 1, 0)
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
.table-editor-body {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    min-width: 0;
    min-height: 0;
    flex: 1;
    color: var(--text-primary, var(--text-color, #252233));
}

/* ---------- 顶部说明 ---------- */
.table-editor-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 14px;
    border: 1px solid color-mix(in srgb, var(--accent-color, #764ba2) 24%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent-color, #764ba2) 7%, var(--bg-primary, #fff));
    flex-shrink: 0;
}

.table-editor-head-main {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
}

.mode-badge {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    padding: 3px 9px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    line-height: 1.4;
}

.mode-badge--insert {
    color: var(--accent-color, #764ba2);
    background: color-mix(in srgb, var(--accent-color, #764ba2) 14%, transparent);
}

.mode-badge--edit {
    color: var(--text-primary, #252233);
    background: color-mix(in srgb, var(--text-primary, #252233) 9%, transparent);
}

.table-editor-hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    color: var(--text-secondary, #6d6980);
}

.table-editor-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    justify-content: flex-end;
    flex-shrink: 0;
}

.stat-chip {
    padding: 4px 9px;
    border: 1px solid var(--border-color, #e7e2ef);
    border-radius: 999px;
    background: var(--bg-primary, #fff);
    font-size: 11px;
    color: var(--text-secondary, #6d6980);
    white-space: nowrap;
}

/* ---------- 表格设置 ---------- */
.table-settings {
    flex-shrink: 0;
    padding: 10px 12px;
    border: 1px solid var(--border-color, #e7e2ef);
    border-radius: 10px;
    background: color-mix(in srgb, var(--text-primary, #252233) 2%, var(--bg-primary, #fff));
}

.settings-title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-bottom: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary, #252233);
}

.settings-title-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--accent-color, #764ba2) 12%, transparent);
    color: var(--accent-color, #764ba2);
    font-size: 12px;
}

.settings-controls {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 10px;
}

.setting-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    color: var(--text-secondary, #6d6980);
}

.setting-field--wide {
    min-width: 150px;
}

.setting-input,
.setting-select {
    height: 30px;
    padding: 0 8px;
    border: 1px solid var(--border-color, #d8d3e2);
    border-radius: 6px;
    background: var(--bg-primary, #fff);
    color: inherit;
    font: inherit;
    font-size: 12px;
}

.setting-input {
    width: 74px;
}

.setting-input:focus,
.setting-select:focus {
    border-color: var(--accent-color, #764ba2);
    outline: none;
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color, #764ba2) 15%, transparent);
}

.import-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 30px;
    margin-left: auto;
    padding: 0 11px;
    border: 1px solid color-mix(in srgb, var(--accent-color, #764ba2) 45%, transparent);
    border-radius: 6px;
    background: color-mix(in srgb, var(--accent-color, #764ba2) 9%, var(--bg-primary, #fff));
    color: var(--accent-color, #764ba2);
    font-size: 12px;
    cursor: pointer;
    white-space: nowrap;
}

.import-btn:hover {
    background: color-mix(in srgb, var(--accent-color, #764ba2) 15%, var(--bg-primary, #fff));
}

.import-btn:disabled {
    opacity: 0.6;
    cursor: wait;
}

.import-icon {
    font-size: 14px;
    line-height: 1;
}

.file-input {
    display: none;
}

.import-message {
    margin: 8px 0 0;
    font-size: 11px;
    line-height: 1.45;
}

.settings-tools {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 8px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px dashed var(--border-color, #e7e2ef);
}

.tool-btn {
    height: 30px;
    padding: 0 11px;
    border: 1px solid var(--border-color, #d8d3e2);
    border-radius: 6px;
    background: var(--bg-primary, #fff);
    color: var(--text-primary, #252233);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
}

.tool-btn:hover {
    border-color: var(--accent-color, #764ba2);
    color: var(--accent-color, #764ba2);
    background: color-mix(in srgb, var(--accent-color, #764ba2) 8%, var(--bg-primary, #fff));
}

.cell-rich-hint {
    margin: 8px 0 0;
    font-size: 11px;
    line-height: 1.5;
    color: var(--text-secondary, #6d6980);
}

.import-message--error {
    color: var(--danger-color, #e74c3c);
}

.import-message--success {
    color: var(--success-color, #2ecc71);
}

/* ---------- 网格 ---------- */
.table-editor-body.is-resized .table-editor-scroll {
    max-height: none;
}
.table-editor-scroll {
    flex: 1 1 auto;
    min-height: 140px;
    max-height: 52vh;
    overflow: auto;
    border: 1px solid var(--border-color, #d8d3e2);
    border-radius: 10px;
    background: var(--bg-primary, #fff);
}

.table-editor-grid {
    border-collapse: separate;
    border-spacing: 0;
    table-layout: fixed;
    border: 1px solid var(--border-color, #d8d3e2);
}

.table-editor-grid th,
.table-editor-grid td {
    border-right: 1px solid var(--border-color, #d8d3e2);
    border-bottom: 1px solid var(--border-color, #d8d3e2);
    padding: 7px;
    vertical-align: middle;
}

.table-editor-grid thead th {
    position: sticky;
    top: 0;
    z-index: 3;
    background: color-mix(in srgb, var(--accent-color, #764ba2) 7%, var(--bg-primary, #fff));
}

.table-editor-grid tbody tr:nth-child(even) td {
    background: color-mix(in srgb, var(--text-primary, #252233) 2.5%, var(--bg-primary, #fff));
}

.table-editor-grid th:last-child,
.table-editor-grid td:last-child {
    border-right: 0;
}

.table-editor-grid tbody tr:last-child td {
    border-bottom: 0;
}

.corner-cell,
.row-head {
    position: sticky;
    left: 0;
    z-index: 4;
    width: 96px;
    min-width: 96px;
    max-width: 96px;
    background: color-mix(in srgb, var(--text-primary, #252233) 4%, var(--bg-primary, #fff));
    text-align: center;
    white-space: nowrap;
    border-right: 1px solid var(--border-color, #d8d3e2) !important;
}

.corner-cell {
    z-index: 6;
}

.column-head {
    position: relative;
    min-width: 0;
}

.column-head-row {
    display: flex;
    align-items: center;
    gap: 5px;
}

.drag-grip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 12px;
    height: 24px;
    color: var(--text-secondary, #9b96a8);
    font-size: 10px;
    letter-spacing: -2px;
    cursor: grab;
    user-select: none;
    opacity: 0.6;
}

.drag-grip:hover {
    color: var(--accent-color, #764ba2);
    opacity: 1;
}

.drag-grip:active {
    cursor: grabbing;
}

.col-resizer {
    position: absolute;
    top: 0;
    right: -3px;
    bottom: 0;
    width: 7px;
    cursor: col-resize;
    z-index: 5;
}

.col-resizer:hover,
.col-resizer:active {
    background: color-mix(in srgb, var(--accent-color, #764ba2) 45%, transparent);
}

.header-input {
    flex: 1;
    min-width: 0;
}

.cell-editor {
    display: flex;
    align-items: flex-start;
    gap: 5px;
}

.task-checkbox {
    flex-shrink: 0;
    width: 14px;
    height: 14px;
    margin: 9px 0 0;
    accent-color: var(--accent-color, #764ba2);
    cursor: pointer;
}

.cell-textarea {
    min-height: 52px;
    max-height: 180px;
    resize: vertical;
    line-height: 1.45;
    font-family: inherit;
    field-sizing: content;
}

.column-index,
.row-index {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    min-width: 18px;
    height: 18px;
    padding: 0 4px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--text-primary, #252233) 8%, transparent);
    font-size: 10px;
    font-weight: 600;
    color: var(--text-secondary, #6d6980);
}

.row-index {
    margin-right: 2px;
}

.column-align-select {
    width: 100%;
    margin-top: 6px;
    height: 24px;
    padding: 0 5px;
    border: 1px solid var(--border-color, #d8d3e2);
    border-radius: 4px;
    background: var(--bg-primary, #fff);
    color: inherit;
    font: inherit;
    font-size: 11px;
    cursor: pointer;
}

.column-align-select:focus {
    border-color: var(--accent-color, #764ba2);
    outline: none;
}

.body-cell {
    min-width: 0;
}

.cell-input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid color-mix(in srgb, var(--border-color, #d8d3e2) 70%, transparent);
    border-radius: 5px;
    background: transparent;
    color: inherit;
    font: inherit;
    line-height: 1.45;
    transition:
        border-color 0.15s ease,
        background 0.15s ease,
        box-shadow 0.15s ease;
}

.cell-input::placeholder {
    color: var(--text-secondary, #9b96a8);
    opacity: 0.7;
}

.cell-input:hover {
    border-color: color-mix(in srgb, var(--accent-color, #764ba2) 38%, transparent);
    background: var(--bg-primary, #fff);
}

.cell-input:focus {
    border-color: var(--accent-color, #764ba2);
    background: var(--bg-primary, #fff);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent-color, #764ba2) 18%, transparent);
    outline: none;
}

.header-input {
    font-weight: 600;
}

/* ---------- 图标按钮 ---------- */
.icon-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--text-secondary, #6d6980);
    font-size: 15px;
    line-height: 1;
    cursor: pointer;
    transition:
        color 0.15s ease,
        background 0.15s ease,
        border-color 0.15s ease;
}

.icon-btn:hover {
    color: var(--danger-color, #e74c3c);
    background: color-mix(in srgb, var(--danger-color, #e74c3c) 10%, transparent);
}

.icon-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
}

.row-delete {
    opacity: 0;
}

tbody tr:hover .row-delete,
.row-delete:focus-visible {
    opacity: 1;
}

/* ---------- 行列新增 ---------- */
.add-column-cell {
    width: 54px;
    min-width: 54px;
    text-align: center;
    vertical-align: middle !important;
    background: color-mix(in srgb, var(--text-primary, #252233) 2%, var(--bg-primary, #fff));
}

.add-column-btn {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 40px;
    height: 44px;
    padding: 0;
    border: 1px dashed var(--border-color, #cfc8dd);
    border-radius: 8px;
    background: transparent;
    color: var(--text-secondary, #6d6980);
    cursor: pointer;
    transition:
        border-color 0.15s ease,
        color 0.15s ease,
        background 0.15s ease;
}

.add-column-btn:hover {
    border-color: var(--accent-color, #764ba2);
    color: var(--accent-color, #764ba2);
    background: color-mix(in srgb, var(--accent-color, #764ba2) 8%, transparent);
}

.add-column-btn > span:first-child {
    font-size: 18px;
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
    gap: 6px;
    padding: 7px 12px;
    border: 1px dashed var(--border-color, #cfc8dd);
    border-radius: 8px;
    background: transparent;
    color: var(--text-secondary, #6d6980);
    font-size: 12px;
    cursor: pointer;
    transition:
        border-color 0.15s ease,
        color 0.15s ease,
        background 0.15s ease;
}

.add-row-btn:hover {
    border-color: var(--accent-color, #764ba2);
    color: var(--accent-color, #764ba2);
    background: color-mix(in srgb, var(--accent-color, #764ba2) 8%, transparent);
}

.add-row-plus {
    font-size: 16px;
    line-height: 1;
}

/* ---------- 底部 ---------- */
.table-editor-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
    padding-top: 2px;
}

.shortcut-hint {
    font-size: 11px;
    color: var(--text-secondary, #9b96a8);
}

.table-editor-actions {
    display: flex;
    gap: 8px;
}

/* ---------- 右下角缩放 ---------- */
.resize-grip {
    position: absolute;
    right: -2px;
    bottom: -2px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 2px;
    width: 20px;
    height: 20px;
    padding: 3px;
    cursor: nwse-resize;
    opacity: 0.55;
}

.resize-grip span {
    display: block;
    height: 2px;
    border-radius: 1px;
    background: var(--text-secondary, #8f8a9e);
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
    .table-editor-head {
        flex-direction: column;
        align-items: stretch;
    }

    .table-editor-stats {
        justify-content: flex-start;
    }

    .add-column-label {
        display: none;
    }

    .add-column-cell {
        width: 40px;
        min-width: 40px;
    }

    .add-column-btn {
        width: 30px;
        height: 30px;
    }

    .shortcut-hint {
        display: none;
    }

    .import-btn {
        margin-left: 0;
    }
}
</style>
