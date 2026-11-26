<template>
    <BaseDialog
        :visible="true"
        :title="dialogTitle"
        width="min(980px, 95vw)"
        reset-position-on-open
        @close="handleClose"
    >
        <div
            class="table-editor-body"
            @keydown.ctrl.enter.prevent="handleApply"
            @keydown.meta.enter.prevent="handleApply"
        >
            <header class="table-editor-head">
                <div class="table-editor-head-main">
                    <span class="mode-badge" :class="`mode-badge--${mode}`">
                        {{
                            mode === 'insert'
                                ? t('dialogRenderer.tableEditor.insertTitle')
                                : t('dialogRenderer.tableEditor.editTitle')
                        }}
                    </span>
                    <p class="table-editor-hint">{{ hintText }}</p>
                </div>
                <div class="table-editor-stats" aria-live="polite">
                    <span class="stat-chip">
                        {{ t('dialogRenderer.tableEditor.rowsCount', { count: rows.length }) }}
                    </span>
                    <span class="stat-chip">
                        {{
                            t('dialogRenderer.tableEditor.columnsCount', {
                                count: headers.length
                            })
                        }}
                    </span>
                </div>
            </header>

            <div class="table-editor-scroll">
                <table class="table-editor-grid">
                    <thead>
                        <tr>
                            <th class="corner-cell" aria-hidden="true"></th>
                            <th
                                v-for="(_header, columnIndex) in headers"
                                :key="`h-${columnIndex}`"
                                class="column-head"
                            >
                                <div class="column-head-row">
                                    <span class="column-index">{{ columnIndex + 1 }}</span>
                                    <input
                                        v-model="headers[columnIndex]"
                                        class="cell-input header-input"
                                        :aria-label="t('dialogRenderer.tableEditor.header')"
                                        :placeholder="`${t('dialogRenderer.tableEditor.column')} ${columnIndex + 1}`"
                                    />
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
                                <div
                                    class="align-group"
                                    role="group"
                                    :aria-label="t('dialogRenderer.tableEditor.alignment')"
                                >
                                    <button
                                        v-for="option in alignOptions"
                                        :key="option.value"
                                        type="button"
                                        class="align-btn"
                                        :class="{
                                            'is-active': alignments[columnIndex] === option.value
                                        }"
                                        :data-align="option.value"
                                        :title="option.label"
                                        :aria-label="option.label"
                                        :aria-pressed="alignments[columnIndex] === option.value"
                                        @click="alignments[columnIndex] = option.value"
                                    >
                                        <span class="align-glyph" aria-hidden="true">
                                            <i></i><i></i><i></i>
                                        </span>
                                    </button>
                                </div>
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
                        <tr v-for="(_row, rowIndex) in rows" :key="`r-${rowIndex}`">
                            <td class="row-head">
                                <span class="row-index">{{ rowIndex + 1 }}</span>
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
                                v-for="(_header, columnIndex) in headers"
                                :key="`c-${rowIndex}-${columnIndex}`"
                                class="body-cell"
                            >
                                <input
                                    v-model="rows[rowIndex][columnIndex]"
                                    class="cell-input"
                                    :aria-label="t('dialogRenderer.tableEditor.cell')"
                                />
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
        </div>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * P0：统一的表格编辑界面。
 *
 * - insert 模式：从空白 3×3 开始，应用后在光标处插入 Markdown 表格；
 * - edit 模式：光标位于已有 GFM 表格时打开，应用后替换原表格。
 * 只支持标准管道表格；合并单元格不在 GFM 语义内，不提供。
 */
import { computed, reactive } from 'vue'
import BaseDialog from '../../BaseDialog.vue'
import { t } from '../../../../common/i18n'
import {
    serializeMarkdownTable,
    type MarkdownTable,
    type TableAlignment
} from '../../../Markdown/table-markdown'

const props = defineProps<{
    mode: 'insert' | 'edit'
    table: MarkdownTable
    onApply: (markdown: string) => void
    onClose: () => void
}>()

const headers = reactive<string[]>([...props.table.headers])
const rows = reactive<string[][]>(props.table.rows.map((row) => [...row]))
const alignments = reactive<TableAlignment[]>([
    ...props.table.alignments.map((alignment) => alignment)
])

const dialogTitle = computed(() => t('dialogRenderer.tableEditor.title'))
const hintText = computed(() =>
    t(
        props.mode === 'insert'
            ? 'dialogRenderer.tableEditor.insertHint'
            : 'dialogRenderer.tableEditor.editHint'
    )
)

const alignOptions = [
    { value: 'default' as const, label: t('dialogRenderer.tableEditor.alignDefault') },
    { value: 'left' as const, label: t('dialogRenderer.tableEditor.alignLeft') },
    { value: 'center' as const, label: t('dialogRenderer.tableEditor.alignCenter') },
    { value: 'right' as const, label: t('dialogRenderer.tableEditor.alignRight') }
]

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
    gap: 14px;
    width: 100%;
    min-width: 0;
    color: var(--text-primary, var(--text-color, #252233));
}

/* ---------- 顶部说明 ---------- */
.table-editor-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    padding: 12px 14px;
    border: 1px solid color-mix(in srgb, var(--accent-color, #764ba2) 22%, transparent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent-color, #764ba2) 7%, var(--bg-primary, #fff));
}

.table-editor-head-main {
    display: flex;
    flex-direction: column;
    gap: 6px;
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
    line-height: 1.55;
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

/* ---------- 网格 ---------- */
.table-editor-scroll {
    max-height: 52vh;
    overflow: auto;
    border: 1px solid var(--border-color, #e7e2ef);
    border-radius: 12px;
    background: var(--bg-primary, #fff);
}

.table-editor-grid {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    table-layout: auto;
}

.table-editor-grid th,
.table-editor-grid td {
    border-right: 1px solid var(--border-color, #e7e2ef);
    border-bottom: 1px solid var(--border-color, #e7e2ef);
    padding: 7px;
    vertical-align: middle;
}

.table-editor-grid thead th {
    position: sticky;
    top: 0;
    z-index: 3;
    background: color-mix(in srgb, var(--accent-color, #764ba2) 6%, var(--bg-primary, #fff));
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
    width: 48px;
    min-width: 48px;
    max-width: 48px;
    background: color-mix(in srgb, var(--text-primary, #252233) 3.5%, var(--bg-primary, #fff));
    text-align: center;
}

.corner-cell {
    z-index: 6;
}

.column-head {
    min-width: 168px;
}

.column-head-row {
    display: flex;
    align-items: center;
    gap: 5px;
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

.body-cell {
    min-width: 168px;
}

.cell-input {
    width: 100%;
    min-width: 0;
    box-sizing: border-box;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 6px;
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
    border-color: color-mix(in srgb, var(--accent-color, #764ba2) 32%, transparent);
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

/* ---------- 对齐按钮 ---------- */
.align-group {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-top: 6px;
    padding: 2px;
    border: 1px solid var(--border-color, #e7e2ef);
    border-radius: 6px;
    background: var(--bg-primary, #fff);
}

.align-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 22px;
    padding: 0;
    border: 0;
    border-radius: 4px;
    background: transparent;
    color: var(--text-secondary, #6d6980);
    cursor: pointer;
    transition:
        background 0.15s ease,
        color 0.15s ease;
}

.align-btn:hover {
    color: var(--accent-color, #764ba2);
    background: color-mix(in srgb, var(--accent-color, #764ba2) 10%, transparent);
}

.align-btn.is-active {
    color: var(--accent-color, #764ba2);
    background: color-mix(in srgb, var(--accent-color, #764ba2) 16%, transparent);
}

.align-glyph {
    display: inline-flex;
    flex-direction: column;
    justify-content: center;
    gap: 2px;
    width: 14px;
}

.align-glyph i {
    display: block;
    height: 2px;
    border-radius: 1px;
    background: currentColor;
}

.align-glyph i:nth-child(1) {
    width: 100%;
}

.align-glyph i:nth-child(2) {
    width: 72%;
}

.align-glyph i:nth-child(3) {
    width: 88%;
}

.align-btn[data-align='left'] .align-glyph i:nth-child(2),
.align-btn[data-align='left'] .align-glyph i:nth-child(3) {
    align-self: flex-start;
}

.align-btn[data-align='center'] .align-glyph i:nth-child(2),
.align-btn[data-align='center'] .align-glyph i:nth-child(3) {
    align-self: center;
}

.align-btn[data-align='right'] .align-glyph i:nth-child(2),
.align-btn[data-align='right'] .align-glyph i:nth-child(3) {
    align-self: flex-end;
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
    padding-top: 4px;
}

.shortcut-hint {
    font-size: 11px;
    color: var(--text-secondary, #9b96a8);
}

.table-editor-actions {
    display: flex;
    gap: 8px;
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
}
</style>
