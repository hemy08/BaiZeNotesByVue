<template>
    <BaseDialog
        :visible="visible"
        :title="t('editorUi.workspaceSearch.title')"
        width="900px"
        :container-style="containerStyle"
        @close="handleClose"
    >
        <div class="workspace-search">
            <!-- 查询行：输入 + 搜索按钮 -->
            <div class="search-bar">
                <input
                    ref="queryInput"
                    v-model="query"
                    type="text"
                    class="search-input"
                    :placeholder="t('editorUi.workspaceSearch.placeholder')"
                    :aria-label="t('editorUi.workspaceSearch.placeholder')"
                    @keydown.enter.prevent="runSearchNow"
                />
                <button
                    type="button"
                    class="dialog-btn dialog-btn--primary"
                    :disabled="!canSearch || state.loading"
                    @click="runSearchNow"
                >
                    {{ t('editorUi.workspaceSearch.search') }}
                </button>
            </div>

            <!-- 搜索选项 -->
            <div class="options-bar">
                <label class="option-item">
                    <input v-model="criteria.caseSensitive" type="checkbox" />
                    <span>{{ t('editorUi.workspaceSearch.caseSensitive') }}</span>
                </label>
                <label class="option-item">
                    <input v-model="criteria.wholeWord" type="checkbox" />
                    <span>{{ t('editorUi.workspaceSearch.wholeWord') }}</span>
                </label>
                <label class="option-item">
                    <input v-model="criteria.useRegex" type="checkbox" />
                    <span>{{ t('editorUi.workspaceSearch.useRegex') }}</span>
                </label>
                <span v-if="summaryText" class="summary" role="status">{{ summaryText }}</span>
            </div>

            <!-- 替换行 -->
            <div class="replace-bar">
                <input
                    v-model="replacement"
                    type="text"
                    class="replace-input"
                    :placeholder="t('editorUi.workspaceSearch.replacePlaceholder')"
                    :aria-label="t('editorUi.workspaceSearch.replacePlaceholder')"
                    @keydown.enter.prevent="requestReplaceAll"
                />
                <button
                    type="button"
                    class="dialog-btn dialog-btn--danger"
                    :disabled="!canReplaceAll"
                    @click="requestReplaceAll"
                >
                    {{ t('editorUi.workspaceSearch.replaceAll') }}
                </button>
            </div>

            <!-- 全部替换确认条（替换前需用户二次确认） -->
            <div
                v-if="confirmReplaceAll"
                class="confirm-bar"
                role="alertdialog"
                aria-live="assertive"
            >
                <span class="confirm-text">
                    {{
                        t('editorUi.workspaceSearch.replaceAllConfirm', {
                            count: replaceAllMatchCount
                        })
                    }}
                </span>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--danger confirm-replace"
                    :disabled="state.replacing"
                    @click="confirmReplaceAllNow"
                >
                    {{ t('editorUi.workspaceSearch.confirm') }}
                </button>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary cancel-replace"
                    :disabled="state.replacing"
                    @click="cancelReplaceAll"
                >
                    {{ t('editorUi.workspaceSearch.cancel') }}
                </button>
            </div>

            <!-- 替换结果/失败提示 -->
            <p v-if="replaceMessage" class="hint replace-message" role="status">
                {{ replaceMessage }}
            </p>

            <!-- 结果列表 -->
            <div
                class="results"
                role="listbox"
                :aria-label="t('editorUi.workspaceSearch.resultsLabel')"
            >
                <p v-if="state.loading" class="hint">
                    {{ t('editorUi.workspaceSearch.searching') }}
                </p>
                <p v-else-if="errorMessage" class="hint hint--error" role="alert">
                    {{ errorMessage }}
                </p>
                <p v-else-if="!appliedSearch" class="hint">
                    {{ t('editorUi.workspaceSearch.initialHint') }}
                </p>
                <p v-else-if="state.files.length === 0" class="hint">
                    {{ t('editorUi.workspaceSearch.noResults') }}
                </p>
                <template v-else>
                    <div
                        v-for="file in state.files"
                        :key="file.filePath"
                        class="result-file"
                        role="group"
                        :aria-label="file.relativePath"
                    >
                        <div class="result-file-header">
                            <span class="result-file-path" :title="file.filePath">
                                {{ file.relativePath }}
                            </span>
                            <span class="result-file-count">{{ file.matches.length }}</span>
                        </div>
                        <ul class="result-matches">
                            <li
                                v-for="match in file.matches"
                                :key="`${file.filePath}:${match.line}:${match.column}`"
                            >
                                <div
                                    class="match-row"
                                    role="option"
                                    tabindex="0"
                                    :aria-selected="selectedKey === matchKey(file.filePath, match)"
                                    @click="jumpToMatch(file.filePath, match.line)"
                                    @keydown.enter.prevent="jumpToMatch(file.filePath, match.line)"
                                >
                                    <span class="match-line">{{ match.line }}</span>
                                    <span class="match-preview">{{ match.preview }}</span>
                                    <button
                                        type="button"
                                        class="dialog-btn dialog-btn--secondary match-replace"
                                        :disabled="state.replacing || !appliedSearch"
                                        @click.stop="replaceMatch(file.filePath, match)"
                                    >
                                        {{ t('editorUi.workspaceSearch.replaceOne') }}
                                    </button>
                                </div>
                            </li>
                        </ul>
                    </div>
                    <p v-if="state.truncated" class="hint hint--truncated">
                        {{ t('editorUi.workspaceSearch.truncated') }}
                    </p>
                </template>
            </div>
        </div>

        <template #footer>
            <button type="button" class="dialog-btn dialog-btn--secondary" @click="handleClose">
                {{ t('editorUi.workspaceSearch.close') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * A2 全工作区搜索/替换对话框（2026-11-21，默认开启）
 *
 * 交互：输入查询（自动防抖搜索 + 回车/按钮立即搜索）→ 结果按文件分组 →
 * 点击结果打开文件并跳转到行；「替换」按单条结果替换，「全部替换」需二次确认。
 * 搜索/替换的实际执行全部在主进程（只信任工作区根），本组件只做输入校验与展示。
 *
 * a11y：BaseDialog 提供 role=dialog/aria-modal/焦点陷阱/Esc 关闭；结果列表 role=listbox，
 * 每行 role=option 且可 Tab 聚焦 + Enter 跳转；确认条 role=alertdialog。
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import BaseDialog from '../dialogs/BaseDialog.vue'
import { t } from '../../common/i18n'
import type {
    WorkspaceReplaceResult,
    WorkspaceSearchMatch,
    WorkspaceSearchResult
} from '../../../../shared/types/ipc'
import {
    DEFAULT_WORKSPACE_SEARCH_CRITERIA,
    WORKSPACE_SEARCH_DEBOUNCE_MS,
    type WorkspaceSearchCriteria
} from './workspace-search-utils'
import { openWorkspaceFileAtLine, useWorkspaceSearch } from '../../composables/useWorkspaceSearch'

interface Props {
    /** 显隐开关（真源在宿主组件） */
    visible: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
    (e: 'close'): void
}>()

const controller = useWorkspaceSearch()
const state = controller.state

const query = ref('')
const replacement = ref('')
const criteria = reactive<WorkspaceSearchCriteria>({
    ...DEFAULT_WORKSPACE_SEARCH_CRITERIA
})
const queryInput = ref<HTMLInputElement | null>(null)

/** 结果对应的查询快照（避免用户改条件后「替换」与列表不一致） */
const appliedSearch = ref<{ query: string; criteria: WorkspaceSearchCriteria } | null>(null)
const selectedKey = ref('')
const replaceMessage = ref('')
const confirmReplaceAll = ref(false)

let debounceTimer: ReturnType<typeof setTimeout> | null = null
let searchSeq = 0

const containerStyle = {
    maxWidth: '92vw',
    height: '600px',
    maxHeight: '85vh'
}

const canSearch = computed(() => query.value.trim().length > 0)
const canReplaceAll = computed(
    () =>
        Boolean(appliedSearch.value) && state.files.length > 0 && !state.loading && !state.replacing
)
const replaceAllMatchCount = computed(() =>
    state.files.reduce((sum, file) => sum + file.matches.length, 0)
)

/** 查询/条件摘要（截断时使用不同文案） */
const summaryText = computed(() => {
    if (!appliedSearch.value || state.errorCode) {
        return ''
    }
    const params = { files: state.files.length, matches: state.matchCount }
    return state.truncated
        ? t('editorUi.workspaceSearch.resultSummaryTruncated', params)
        : t('editorUi.workspaceSearch.resultSummary', params)
})

/** 搜索错误码 → 用户可见文案 */
const errorMessage = computed(() => {
    const code = state.errorCode
    if (!code) {
        return ''
    }
    switch (code) {
        case 'NO_WORKSPACE':
            return t('editorUi.workspaceSearch.error.noWorkspace')
        case 'INVALID_QUERY':
            return t('editorUi.workspaceSearch.error.invalidQuery')
        case 'INVALID_REGEX':
            return t('editorUi.workspaceSearch.error.invalidRegex')
        case 'INTERNAL_ERROR':
            return t('editorUi.workspaceSearch.error.internal')
        default:
            return t('editorUi.workspaceSearch.error.searchFailed')
    }
})

/** 替换错误码 → 用户可见文案 */
function replaceErrorMessage(code: WorkspaceReplaceResult['code']): string {
    switch (code) {
        case 'NO_WORKSPACE':
            return t('editorUi.workspaceSearch.error.noWorkspace')
        case 'INVALID_QUERY':
            return t('editorUi.workspaceSearch.error.invalidQuery')
        case 'INVALID_REGEX':
            return t('editorUi.workspaceSearch.error.invalidRegex')
        case 'INVALID_INPUT':
            return t('editorUi.workspaceSearch.error.invalidInput')
        case 'PATH_DENIED':
            return t('editorUi.workspaceSearch.error.pathDenied')
        case 'FILE_CHANGED':
            return t('editorUi.workspaceSearch.error.fileChanged')
        case 'WRITE_FAILED':
            return t('editorUi.workspaceSearch.error.writeFailed')
        case 'NO_MATCH':
            return t('editorUi.workspaceSearch.error.noMatch')
        default:
            return t('editorUi.workspaceSearch.error.internal')
    }
}

/** 匹配唯一键（用于 aria-selected） */
function matchKey(filePath: string, match: WorkspaceSearchMatch): string {
    return `${filePath}:${match.line}:${match.column}`
}

/** 清理防抖计时器 */
function clearDebounce(): void {
    if (debounceTimer !== null) {
        clearTimeout(debounceTimer)
        debounceTimer = null
    }
}

/** 关闭确认条（输入变化/新搜索时重置） */
function cancelReplaceAll(): void {
    confirmReplaceAll.value = false
}

/** 执行搜索（进行中时忽略重复触发） */
async function runSearch(
    options: { preserveReplaceMessage?: boolean } = {}
): Promise<WorkspaceSearchResult | null> {
    if (!canSearch.value || state.loading) {
        return null
    }
    clearDebounce()
    cancelReplaceAll()
    if (options.preserveReplaceMessage !== true) {
        replaceMessage.value = ''
    }
    selectedKey.value = ''
    const snapshot = { query: query.value, criteria: { ...criteria } }
    const seq = ++searchSeq
    const result = await controller.search(snapshot.query, snapshot.criteria)
    // 只让最新一次搜索写结果快照（异步竞态保护）
    if (seq === searchSeq && result.ok) {
        appliedSearch.value = snapshot
    }
    return result
}

/** 回车/按钮：立即搜索（若已有同条件结果则刷新） */
function runSearchNow(): void {
    void runSearch()
}

/** 查询或选项变化：清空旧结果并按防抖自动搜索 */
function scheduleSearch(): void {
    if (!props.visible) {
        return
    }
    clearDebounce()
    if (!canSearch.value) {
        appliedSearch.value = null
        return
    }
    debounceTimer = setTimeout(() => {
        debounceTimer = null
        void runSearch()
    }, WORKSPACE_SEARCH_DEBOUNCE_MS)
}

/** 点击结果：打开文件并跳转到行（主进程确认切换后经 EventBus 触发 Monaco 跳行） */
async function jumpToMatch(filePath: string, line: number): Promise<void> {
    const file = state.files.find((item) => item.filePath === filePath)
    const match = file?.matches.find((item) => item.line === line)
    if (match) {
        selectedKey.value = matchKey(filePath, match)
    }
    await openWorkspaceFileAtLine(filePath, line)
}

/** 单处替换（只替换点击的这条匹配） */
async function replaceMatch(filePath: string, match: WorkspaceSearchMatch): Promise<void> {
    const snapshot = appliedSearch.value
    if (!snapshot) {
        return
    }
    selectedKey.value = matchKey(filePath, match)
    replaceMessage.value = ''
    const result = await controller.replaceOne({
        query: snapshot.query,
        criteria: snapshot.criteria,
        replacement: replacement.value,
        filePath,
        line: match.line,
        column: match.column
    })
    handleReplaceResult(result)
}

/** 点击「全部替换」：先展示确认条（不直接写盘） */
function requestReplaceAll(): void {
    if (!canReplaceAll.value) {
        return
    }
    replaceMessage.value = ''
    confirmReplaceAll.value = true
}

/** 确认全部替换：对当前结果涉及的全部文件执行替换 */
async function confirmReplaceAllNow(): Promise<void> {
    const snapshot = appliedSearch.value
    if (!snapshot || state.replacing) {
        return
    }
    confirmReplaceAll.value = false
    const filePaths = Array.from(new Set(controller.state.files.map((file) => file.filePath)))
    if (filePaths.length === 0) {
        return
    }
    const result = await controller.replaceAll({
        query: snapshot.query,
        criteria: snapshot.criteria,
        replacement: replacement.value,
        filePaths
    })
    handleReplaceResult(result)
}

/** 替换结果统一处理：成功提示并刷新结果；失败显示错误码文案（不静默） */
function handleReplaceResult(result: WorkspaceReplaceResult): void {
    if (result.ok) {
        replaceMessage.value = t('editorUi.workspaceSearch.replacedSummary', {
            count: result.totalReplacements
        })
        // 写盘后重新搜索，保证列表与磁盘一致（也刷新行号/上下文的偏移）；
        // 保留本次替换结果提示，避免刷新搜索时清空提示
        void runSearch({ preserveReplaceMessage: true })
        return
    }
    replaceMessage.value = replaceErrorMessage(result.code ?? 'INTERNAL_ERROR')
}

/** 关闭对话框（清空临时确认态与防抖，保留查询便于下次继续） */
function handleClose(): void {
    clearDebounce()
    confirmReplaceAll.value = false
    emit('close')
}

/** 查询或选项变化 → 防抖搜索 */
watch(
    [query, () => criteria.caseSensitive, () => criteria.wholeWord, () => criteria.useRegex],
    () => {
        selectedKey.value = ''
        scheduleSearch()
    }
)

/** 打开时聚焦/全选查询框；关闭时停止防抖 */
watch(
    () => props.visible,
    async (visible) => {
        if (!visible) {
            clearDebounce()
            confirmReplaceAll.value = false
            return
        }
        await nextTick()
        queryInput.value?.focus()
        queryInput.value?.select()
    }
)

onBeforeUnmount(() => {
    clearDebounce()
})
</script>

<style scoped>
/* 外壳（遮罩/标题栏/关闭按钮/footer/动画/焦点管理）统一由 BaseDialog 提供；
   本文件只保留搜索面板内容区样式。 */
.workspace-search {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px 16px;
    min-height: 0;
    flex: 1 1 auto;
    overflow: hidden;
}

.search-bar,
.replace-bar {
    display: flex;
    gap: 8px;
    align-items: center;
}

.search-input,
.replace-input {
    flex: 1 1 auto;
    min-width: 0;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--card-bg);
    color: var(--text-color);
    font-size: 13px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.2s ease;
}

.search-input:focus,
.replace-input:focus {
    border-color: var(--accent-color);
}

.options-bar {
    display: flex;
    align-items: center;
    gap: 16px;
    flex-wrap: wrap;
    font-size: 12px;
    color: var(--secondary-text-color, var(--text-color));
}

.option-item {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    cursor: pointer;
}

.summary {
    margin-left: auto;
    color: var(--secondary-text-color, var(--text-color));
}

.confirm-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border: 1px solid var(--accent-color);
    border-radius: 6px;
    background: var(--hover-bg);
    font-size: 13px;
}

.confirm-text {
    flex: 1 1 auto;
    color: var(--text-color);
}

.hint {
    margin: 0;
    padding: 8px 4px;
    font-size: 13px;
    color: var(--secondary-text-color, var(--text-color));
}

.hint--error {
    color: #e74c3c;
}

.hint--truncated {
    padding: 8px 4px 0;
}

.replace-message {
    padding: 0;
}

.results {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--card-bg);
}

.result-file + .result-file {
    border-top: 1px solid var(--border-color);
}

.result-file-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: var(--hover-bg);
    font-size: 13px;
    font-weight: 600;
    color: var(--text-color);
}

.result-file-path {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.result-file-count {
    flex: 0 0 auto;
    font-weight: 400;
    font-size: 12px;
    color: var(--secondary-text-color, var(--text-color));
}

.result-matches {
    list-style: none;
    margin: 0;
    padding: 0;
}

.match-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 12px;
    font-size: 12px;
    cursor: pointer;
    outline: none;
}

.match-row:hover,
.match-row[aria-selected='true'] {
    background: var(--hover-bg);
}

.match-row:focus-visible {
    outline: 2px solid var(--accent-color);
    outline-offset: -2px;
}

.match-line {
    flex: 0 0 48px;
    text-align: right;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--secondary-text-color, var(--text-color));
}

.match-preview {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: pre;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--text-color);
}

.match-replace {
    flex: 0 0 auto;
}
</style>
