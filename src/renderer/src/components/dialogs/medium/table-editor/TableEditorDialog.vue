<template>
    <BaseDialog
        :visible="true"
        :title="t('dialogRenderer.tableEditor.title')"
        width="min(920px, 94vw)"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="table-editor-body">
            <p class="table-editor-hint">{{ t('dialogRenderer.tableEditor.hint') }}</p>

            <div class="table-editor-scroll">
                <table class="table-editor-grid">
                    <thead>
                        <tr>
                            <th class="row-actions"></th>
                            <th v-for="(_, columnIndex) in headers" :key="`h-${columnIndex}`">
                                <input
                                    v-model="headers[columnIndex]"
                                    class="cell-input header-input"
                                    :aria-label="t('dialogRenderer.tableEditor.header')"
                                />
                                <div class="column-tools">
                                    <select
                                        v-model="alignments[columnIndex]"
                                        class="align-select"
                                        :aria-label="t('dialogRenderer.tableEditor.alignment')"
                                    >
                                        <option value="default">
                                            {{ t('dialogRenderer.tableEditor.alignDefault') }}
                                        </option>
                                        <option value="left">
                                            {{ t('dialogRenderer.tableEditor.alignLeft') }}
                                        </option>
                                        <option value="center">
                                            {{ t('dialogRenderer.tableEditor.alignCenter') }}
                                        </option>
                                        <option value="right">
                                            {{ t('dialogRenderer.tableEditor.alignRight') }}
                                        </option>
                                    </select>
                                    <button
                                        type="button"
                                        class="icon-btn"
                                        :title="t('dialogRenderer.tableEditor.deleteColumn')"
                                        @click="deleteColumn(columnIndex)"
                                    >
                                        ×
                                    </button>
                                </div>
                            </th>
                            <th class="column-add">
                                <button
                                    type="button"
                                    class="icon-btn"
                                    :title="t('dialogRenderer.tableEditor.addColumn')"
                                    @click="addColumn"
                                >
                                    +
                                </button>
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr v-for="(_row, rowIndex) in rows" :key="`r-${rowIndex}`">
                            <td class="row-actions">
                                <button
                                    type="button"
                                    class="icon-btn"
                                    :title="t('dialogRenderer.tableEditor.deleteRow')"
                                    @click="deleteRow(rowIndex)"
                                >
                                    ×
                                </button>
                            </td>
                            <td
                                v-for="(_, columnIndex) in headers"
                                :key="`c-${rowIndex}-${columnIndex}`"
                            >
                                <input
                                    v-model="rows[rowIndex][columnIndex]"
                                    class="cell-input"
                                    :aria-label="t('dialogRenderer.tableEditor.cell')"
                                />
                            </td>
                            <td class="column-add"></td>
                        </tr>
                    </tbody>
                </table>
            </div>

            <button type="button" class="add-row-btn" @click="addRow">
                + {{ t('dialogRenderer.tableEditor.addRow') }}
            </button>

            <div class="table-editor-actions">
                <button type="button" class="dialog-btn dialog-btn--secondary" @click="handleClose">
                    {{ t('common.cancel') }}
                </button>
                <button type="button" class="dialog-btn dialog-btn--primary" @click="handleApply">
                    {{ t('common.apply') }}
                </button>
            </div>
        </div>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * P0：光标所在 GFM 表格的可视化编辑。
 * 只支持标准管道表格；合并单元格不在 GFM 语义内，不提供。
 */
import { reactive } from 'vue'
import BaseDialog from '../../BaseDialog.vue'
import { t } from '../../../../common/i18n'
import {
    serializeMarkdownTable,
    type MarkdownTable,
    type TableAlignment
} from '../../../Markdown/table-markdown'

const props = defineProps<{
    table: MarkdownTable
    onApply: (markdown: string) => void
    onClose: () => void
}>()

const headers = reactive<string[]>([...props.table.headers])
const rows = reactive<string[][]>(props.table.rows.map((row) => [...row]))
const alignments = reactive<TableAlignment[]>([
    ...props.table.alignments.map((alignment) => alignment)
])

function ensureColumnCells(): void {
    for (const row of rows) {
        while (row.length < headers.length) row.push('')
        row.length = headers.length
    }
    while (alignments.length < headers.length) alignments.push('default')
    alignments.length = headers.length
}

function addRow(): void {
    rows.push(Array.from({ length: headers.length }, () => ''))
}

function deleteRow(index: number): void {
    if (rows.length <= 0) return
    rows.splice(index, 1)
}

function addColumn(): void {
    headers.push(`${t('dialogRenderer.tableEditor.column')} ${headers.length + 1}`)
    for (const row of rows) row.push('')
    alignments.push('default')
}

function deleteColumn(index: number): void {
    if (headers.length <= 1) return
    headers.splice(index, 1)
    for (const row of rows) row.splice(index, 1)
    alignments.splice(index, 1)
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
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
    color: var(--text-primary, #252233);
}

.table-editor-hint {
    margin: 0;
    font-size: 12px;
    color: var(--text-secondary, #6d6980);
}

.table-editor-scroll {
    max-height: 55vh;
    overflow: auto;
    border: 1px solid var(--border-color, #e7e2ef);
    border-radius: 8px;
}

.table-editor-grid {
    width: 100%;
    border-collapse: collapse;
    table-layout: auto;
}

.table-editor-grid th,
.table-editor-grid td {
    border-bottom: 1px solid var(--border-color, #e7e2ef);
    border-right: 1px solid var(--border-color, #e7e2ef);
    padding: 6px;
    vertical-align: top;
}

.row-actions,
.column-add {
    width: 34px;
    text-align: center;
    border: 0;
}

.cell-input {
    width: 100%;
    min-width: 90px;
    box-sizing: border-box;
    padding: 5px 7px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: inherit;
}

.cell-input:hover,
.cell-input:focus {
    border-color: var(--accent-color, #764ba2);
    background: var(--bg-primary, #fff);
    outline: none;
}

.header-input {
    font-weight: 600;
}

.column-tools {
    display: flex;
    gap: 4px;
    margin-top: 4px;
}

.align-select {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--border-color, #e7e2ef);
    border-radius: 4px;
    background: var(--bg-primary, #fff);
    color: inherit;
    font-size: 11px;
    padding: 2px 4px;
}

.icon-btn {
    border: 1px solid var(--border-color, #e7e2ef);
    border-radius: 4px;
    background: var(--bg-primary, #fff);
    color: inherit;
    width: 24px;
    height: 24px;
    line-height: 1;
    cursor: pointer;
}

.icon-btn:hover {
    border-color: var(--accent-color, #764ba2);
    color: var(--accent-color, #764ba2);
}

.add-row-btn {
    align-self: flex-start;
    border: 1px dashed var(--border-color, #e7e2ef);
    border-radius: 6px;
    background: transparent;
    color: var(--text-secondary, #6d6980);
    padding: 6px 12px;
    cursor: pointer;
}

.add-row-btn:hover {
    border-color: var(--accent-color, #764ba2);
    color: var(--accent-color, #764ba2);
}

.table-editor-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}
</style>
