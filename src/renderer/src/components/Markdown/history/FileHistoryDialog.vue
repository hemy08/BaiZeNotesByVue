<template>
    <!--
        A3 文档历史对话框（opt-in：系统设置 → 功能 → 文档历史；默认关闭）。
        - flag 关闭时根节点不渲染（宿主也会在开关关闭时卸载整个挂载实例）；
        - 左侧历史版本列表（时间/大小/最新标记），右侧选中版本 ↔ 当前编辑器内容的行级 diff；
        - 恢复：二次确认后经既有 EventBus MONACO_REPLACE_TEXT 替换编辑器内容（不改主进程状态）；
        - 数据来自 useDocumentHistory（localStorage，20 版/文件、全局约 2 MiB 淘汰最旧）。
    -->
    <BaseDialog
        v-if="flags.documentHistory"
        :visible="state.dialogVisible"
        :title="tOr(UI.title, '文档历史')"
        width="960px"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="history-body">
            <div class="history-toolbar">
                <span class="history-path" :title="state.activeFilePath">
                    {{ pathText }}
                </span>
                <span class="history-usage">{{ usageText }}</span>
            </div>

            <div v-if="state.status === 'loading'" class="history-placeholder" role="status">
                {{ tOr(UI.loading, '正在加载历史版本…') }}
            </div>
            <div
                v-else-if="state.status === 'error'"
                class="history-placeholder history-placeholder--error"
            >
                {{ tOr(UI.loadFailed, '加载历史版本失败，请稍后重试') }}
            </div>
            <div v-else-if="!state.activeFilePath" class="history-placeholder">
                {{ tOr(UI.noActiveFile, '当前没有打开的文件，保存文件后才会生成历史快照') }}
            </div>
            <div v-else-if="state.versions.length === 0" class="history-placeholder">
                {{ tOr(UI.empty, '暂无历史版本（保存文件后自动生成快照，最多保留 20 版/文件）') }}
            </div>

            <div v-else class="history-main">
                <div class="version-list-wrap">
                    <div class="version-list-header">
                        <span class="version-col-time">{{ tOr(UI.timeColumn, '保存时间') }}</span>
                        <span class="version-col-size">{{ tOr(UI.sizeColumn, '大小') }}</span>
                    </div>
                    <ul class="version-list" role="listbox">
                        <li
                            v-for="(version, index) in state.versions"
                            :key="version.id"
                            role="none"
                        >
                            <button
                                type="button"
                                role="option"
                                class="version-item"
                                :class="{ 'is-selected': version.id === selectedVersion?.id }"
                                :aria-selected="version.id === selectedVersion?.id"
                                @click="selectVersion(version.id)"
                            >
                                <span class="version-time">{{
                                    formatTimestamp(version.savedAt)
                                }}</span>
                                <span class="version-size">{{
                                    formatFileSize(version.sizeBytes)
                                }}</span>
                                <span v-if="index === 0" class="version-badge">
                                    {{ tOr(UI.latestBadge, '最新') }}
                                </span>
                            </button>
                        </li>
                    </ul>
                </div>

                <div class="version-detail">
                    <div class="detail-header">
                        <span class="detail-title">
                            {{
                                selectedVersion
                                    ? tOr(UI.compareTitle, '版本 {time} 与当前内容比对', {
                                          time: formatTimestamp(selectedVersion.savedAt)
                                      })
                                    : ''
                            }}
                        </span>
                        <span v-if="diff && diff.stats.changed" class="diff-summary">
                            +{{ diff.stats.added }} / -{{ diff.stats.removed }}
                        </span>
                    </div>

                    <div v-if="diff === null" class="diff-placeholder">
                        {{ tOr(UI.selectHint, '请选择左侧历史版本查看差异') }}
                    </div>
                    <div v-else-if="diff.tooLarge" class="diff-placeholder">
                        {{ tOr(UI.tooLarge, '文档过大，无法生成行级 diff') }}
                    </div>
                    <div v-else-if="!diff.stats.changed" class="diff-placeholder">
                        {{ tOr(UI.noDiff, '该版本与当前编辑内容一致') }}
                    </div>
                    <div
                        v-else
                        class="diff-view"
                        role="table"
                        :aria-label="tOr(UI.diffTitle, '行级差异')"
                    >
                        <div
                            v-for="(row, rowIndex) in diff.rows"
                            :key="rowIndex"
                            class="diff-row"
                            :class="row.kind === 'line' ? `diff-row--${row.type}` : 'diff-row--gap'"
                        >
                            <template v-if="row.kind === 'line'">
                                <span class="diff-lineno">{{ row.oldLine ?? '' }}</span>
                                <span class="diff-lineno">{{ row.newLine ?? '' }}</span>
                                <span class="diff-mark" aria-hidden="true">{{
                                    diffMark(row.type)
                                }}</span>
                                <span class="diff-text">{{ row.text }}</span>
                            </template>
                            <template v-else>
                                <span class="diff-gap">
                                    {{
                                        tOr(UI.gapLines, '… 省略 {count} 行', {
                                            count: row.hiddenLines
                                        })
                                    }}
                                </span>
                            </template>
                        </div>
                    </div>

                    <div class="detail-actions">
                        <button
                            type="button"
                            class="dialog-btn dialog-btn--apply btn btn-restore"
                            :disabled="selectedVersion === null"
                            @click="requestRestore"
                        >
                            {{ tOr(UI.restore, '恢复此版本') }}
                        </button>
                        <button
                            type="button"
                            class="dialog-btn dialog-btn--secondary btn btn-delete-version"
                            :disabled="selectedVersion === null"
                            @click="handleDeleteVersion"
                        >
                            {{ tOr(UI.deleteVersion, '删除此版本') }}
                        </button>
                    </div>

                    <div v-if="pendingConfirm !== null" class="history-confirm" role="alert">
                        <p class="confirm-message">
                            {{
                                pendingConfirm === 'restore'
                                    ? tOr(
                                          UI.restoreConfirmMessage,
                                          '恢复将用该历史版本覆盖编辑器当前内容，未保存的修改会丢失。是否继续？'
                                      )
                                    : tOr(
                                          UI.clearConfirmMessage,
                                          '将清空当前文件的全部历史版本，此操作不可撤销。是否继续？'
                                      )
                            }}
                        </p>
                        <div class="confirm-actions">
                            <button
                                type="button"
                                class="dialog-btn dialog-btn--danger btn-confirm-history"
                                @click="confirmPendingAction"
                            >
                                {{
                                    pendingConfirm === 'restore'
                                        ? tOr(UI.restoreConfirm, '确认恢复')
                                        : tOr(UI.clearConfirm, '确认清空')
                                }}
                            </button>
                            <button
                                type="button"
                                class="dialog-btn dialog-btn--secondary btn-cancel-history"
                                @click="cancelPendingAction"
                            >
                                {{ tOr(UI.cancel, '取消') }}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--ghost btn-clear-history"
                :disabled="state.versions.length === 0"
                @click="requestClearHistory"
            >
                {{ tOr(UI.clear, '清空该文件历史') }}
            </button>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn-close-history"
                @click="handleClose"
            >
                {{ tOr(UI.close, '关闭') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * A3 文档历史对话框（renderer-only MVP）。
 *
 * 职责边界：
 * - 只读 `documentHistoryState` 渲染 + 调用 useDocumentHistory 暴露的操作；
 * - 恢复经 `restoreHistoryVersion`（内部 EventBus MONACO_REPLACE_TEXT）完成，
 *   对话框不直接接触编辑器实例/主进程状态；
 * - i18n：本组件使用**动态键表 + 中文兜底**（UI 常量表 + tOr）。原因：
 *   建议键（editorUi.fileHistory.*）由主控统一补词典；补词典前界面仍显示中文兜底，
 *   补词典后自动切换；键清单见交付报告。
 */
import { computed, ref, watch } from 'vue'
import { t } from '../../../common/i18n'
import { formatFileSize } from '../../../../../shared/utils/format'
import { useFeatureFlags } from '../../../composables/useFeatureFlags'
import {
    clearActiveFileHistory,
    closeFileHistoryDialog,
    deleteActiveHistoryVersion,
    documentHistoryState,
    restoreHistoryVersion
} from '../../../composables/useDocumentHistory'
import { DOCUMENT_HISTORY_MAX_TOTAL_BYTES, type DocumentHistoryVersion } from './history-storage'
import { computeHistoryDiff, type HistoryDiffLineRow, type HistoryDiffResult } from './history-diff'
import BaseDialog from '../../dialogs/BaseDialog.vue'

/** 对话框文案建议键（主控补 editorUi.fileHistory.* 词典后自动生效；未补时用中文兜底） */
const UI = {
    title: 'editorUi.fileHistory.title',
    loading: 'editorUi.fileHistory.loading',
    loadFailed: 'editorUi.fileHistory.loadFailed',
    noActiveFile: 'editorUi.fileHistory.noActiveFile',
    empty: 'editorUi.fileHistory.empty',
    timeColumn: 'editorUi.fileHistory.timeColumn',
    sizeColumn: 'editorUi.fileHistory.sizeColumn',
    latestBadge: 'editorUi.fileHistory.latestBadge',
    compareTitle: 'editorUi.fileHistory.compareTitle',
    diffTitle: 'editorUi.fileHistory.diffTitle',
    noDiff: 'editorUi.fileHistory.noDiff',
    selectHint: 'editorUi.fileHistory.selectHint',
    tooLarge: 'editorUi.fileHistory.tooLarge',
    gapLines: 'editorUi.fileHistory.gapLines',
    restore: 'editorUi.fileHistory.restore',
    deleteVersion: 'editorUi.fileHistory.deleteVersion',
    restoreConfirm: 'editorUi.fileHistory.restoreConfirm',
    restoreConfirmMessage: 'editorUi.fileHistory.restoreConfirmMessage',
    clear: 'editorUi.fileHistory.clear',
    clearConfirm: 'editorUi.fileHistory.clearConfirm',
    clearConfirmMessage: 'editorUi.fileHistory.clearConfirmMessage',
    cancel: 'editorUi.fileHistory.cancel',
    close: 'editorUi.fileHistory.close',
    usage: 'editorUi.fileHistory.usage',
    pathLabel: 'editorUi.fileHistory.pathLabel'
} as const

const { flags } = useFeatureFlags()
/** 历史状态单例（模块级响应式对象，对话框只读展示） */
const state = documentHistoryState

/** 选中版本 id（空 = 自动选中最新版本） */
const selectedId = ref('')
/** 待确认操作：恢复历史版本 / 清空历史（破坏性操作二次确认） */
const pendingConfirm = ref<'restore' | 'clear' | null>(null)

/** t() 取词，词典缺键时回退中文兜底（并手动补插值，保证补词典前界面可用） */
function tOr(key: string, fallback: string, params?: Record<string, string | number>): string {
    const text = t(key, params)
    if (text !== key) {
        return text
    }
    if (params === undefined) {
        return fallback
    }
    return fallback.replace(/\{(\w+)\}/g, (match, name: string) =>
        params[name] === undefined ? match : String(params[name])
    )
}

/** 当前选中版本（列表变化/未选中时回退到最新版本） */
const selectedVersion = computed<DocumentHistoryVersion | null>(() => {
    if (state.versions.length === 0) {
        return null
    }
    const matched = state.versions.find((version) => version.id === selectedId.value)
    return matched ?? state.versions[0]
})

/** 选中版本与当前编辑器内容的行级 diff */
const diff = computed<HistoryDiffResult | null>(() => {
    const version = selectedVersion.value
    if (version === null) {
        return null
    }
    return computeHistoryDiff(version.content, state.currentContent)
})

/** 顶部路径展示（过长时由 CSS 省略，title 保留完整路径） */
const pathText = computed(() =>
    state.activeFilePath
        ? tOr(UI.pathLabel, '文件：{path}', { path: state.activeFilePath })
        : tOr(UI.noActiveFile, '当前没有打开的文件，保存文件后才会生成历史快照')
)

/** 存储用量文案（约 2 MiB 上限） */
const usageText = computed(() =>
    tOr(UI.usage, '历史占用 {used} / {limit}，共 {count} 个版本', {
        used: formatFileSize(state.usage.totalBytes),
        limit: formatFileSize(DOCUMENT_HISTORY_MAX_TOTAL_BYTES),
        count: state.usage.versionCount
    })
)

/** 版本列表变化时修正选中 id（删除/刷新后避免停留在已消失的版本上） */
watch(
    () => state.versions.map((version) => version.id).join('|'),
    () => {
        if (!state.versions.some((version) => version.id === selectedId.value)) {
            selectedId.value = state.versions[0]?.id ?? ''
        }
    }
)

/** 对话框关闭时清理二次确认状态 */
watch(
    () => state.dialogVisible,
    (visible) => {
        if (!visible) {
            pendingConfirm.value = null
        }
    }
)

/** 时间戳格式化（本地时区，YYYY-MM-DD HH:mm:ss；不依赖 toLocaleString 的引擎差异） */
function formatTimestamp(savedAt: number): string {
    if (!Number.isFinite(savedAt)) {
        return ''
    }
    const date = new Date(savedAt)
    const pad = (value: number): string => String(value).padStart(2, '0')
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(
        date.getHours()
    )}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** diff 行前缀符号（+ 新增 / - 删除 / 空行无符号） */
function diffMark(type: HistoryDiffLineRow['type']): string {
    if (type === 'add') {
        return '+'
    }
    if (type === 'remove') {
        return '-'
    }
    return ''
}

/** 选中历史版本 */
function selectVersion(versionId: string): void {
    selectedId.value = versionId
    pendingConfirm.value = null
}

/** 请求恢复选中版本（先进入二次确认） */
function requestRestore(): void {
    if (selectedVersion.value === null) {
        return
    }
    pendingConfirm.value = 'restore'
}

/** 请求清空当前文件历史（先进入二次确认） */
function requestClearHistory(): void {
    if (state.versions.length === 0) {
        return
    }
    pendingConfirm.value = 'clear'
}

/** 取消二次确认 */
function cancelPendingAction(): void {
    pendingConfirm.value = null
}

/** 执行二次确认的操作（恢复 = 经 EventBus 替换编辑器内容后关闭对话框） */
async function confirmPendingAction(): Promise<void> {
    const action = pendingConfirm.value
    pendingConfirm.value = null
    if (action === 'restore') {
        const version = selectedVersion.value
        if (version !== null && restoreHistoryVersion(version.id)) {
            closeFileHistoryDialog()
        }
        return
    }
    if (action === 'clear') {
        await clearActiveFileHistory()
    }
}

/** 删除选中版本 */
async function handleDeleteVersion(): Promise<void> {
    const version = selectedVersion.value
    if (version === null) {
        return
    }
    await deleteActiveHistoryVersion(version.id)
}

/** 关闭对话框（只改显隐；监听与快照继续生效） */
function handleClose(): void {
    closeFileHistoryDialog()
}
</script>

<style scoped>
.history-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 12px 16px 8px;
    min-height: 360px;
}

.history-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 12px;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

.history-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 60%;
}

.history-usage {
    flex: none;
}

.history-placeholder {
    min-height: 240px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 24px;
    text-align: center;
    font-size: 13px;
    color: var(--theme-secondary-text-color);
    background: var(--theme-card-background);
    border: 1px dashed var(--theme-border-color);
    border-radius: 6px;
}

.history-placeholder--error {
    color: var(--theme-accent-color);
}

.history-main {
    display: flex;
    gap: 12px;
    min-height: 0;
    flex: 1;
}

/* ==================== 左侧版本列表 ==================== */
.version-list-wrap {
    flex: none;
    width: 250px;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    overflow: hidden;
}

.version-list-header {
    display: flex;
    gap: 8px;
    padding: 8px 12px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
    border-bottom: 1px solid var(--theme-border-color);
}

.version-col-time {
    flex: 1;
}

.version-col-size {
    flex: none;
    width: 76px;
    text-align: right;
}

.version-list {
    list-style: none;
    margin: 0;
    padding: 4px;
    overflow-y: auto;
    max-height: 46vh;
}

.version-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--theme-text-color);
    font-size: 12px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
}

.version-item:hover {
    background: var(--theme-hover-background);
}

.version-item.is-selected {
    background: var(--theme-hover-background);
    border-color: var(--theme-accent-color);
    color: var(--theme-accent-color);
}

.version-item:focus-visible {
    outline: 2px solid var(--theme-accent-color);
    outline-offset: 1px;
}

.version-time {
    flex: 1;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.version-size {
    flex: none;
    width: 76px;
    text-align: right;
    color: var(--theme-secondary-text-color);
}

.version-badge {
    flex: none;
    padding: 0 4px;
    font-size: 10px;
    line-height: 16px;
    border-radius: 3px;
    background: var(--theme-accent-color);
    color: var(--theme-button-text-color);
}

/* ==================== 右侧 diff 区 ==================== */
.version-detail {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    padding: 10px 12px;
}

.detail-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

.detail-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.diff-summary {
    flex: none;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--theme-accent-color);
}

.diff-placeholder {
    flex: 1;
    min-height: 180px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    color: var(--theme-secondary-text-color);
}

.diff-view {
    flex: 1;
    min-height: 0;
    max-height: 42vh;
    overflow: auto;
    border: 1px solid var(--theme-border-color);
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 12px;
    line-height: 1.5;
}

.diff-row {
    display: flex;
    align-items: baseline;
    gap: 6px;
    padding: 1px 8px;
    white-space: pre-wrap;
    word-break: break-all;
}

.diff-row--add {
    background: var(--theme-hover-background);
}

.diff-row--remove {
    color: var(--theme-secondary-text-color);
    background: var(--theme-card-background);
}

.diff-lineno {
    flex: none;
    width: 3.2em;
    text-align: right;
    color: var(--theme-secondary-text-color);
    user-select: none;
}

.diff-mark {
    flex: none;
    width: 1em;
    font-weight: 700;
    color: var(--theme-accent-color);
}

.diff-text {
    flex: 1;
}

.diff-row--gap {
    justify-content: center;
    color: var(--theme-secondary-text-color);
}

.diff-gap {
    font-size: 11px;
}

.detail-actions {
    display: flex;
    gap: 10px;
}

/* ==================== 二次确认 ==================== */
.history-confirm {
    padding: 10px 12px;
    border: 1px solid var(--theme-accent-color);
    border-radius: 6px;
    background: var(--theme-hover-background);
}

.confirm-message {
    margin: 0 0 10px;
    font-size: 13px;
    line-height: 1.6;
    color: var(--theme-text-color);
}

.confirm-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
}
</style>
