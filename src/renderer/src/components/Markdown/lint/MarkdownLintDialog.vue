<template>
    <!--
        A4 Markdown lint 对话框（opt-in：系统设置 → 功能 → Markdown 检查；默认关闭）。
        - flag 关闭时根节点不渲染（宿主在开关关闭时卸载整个挂载实例）；
        - 打开时读取当前编辑器内容（经 useDocumentHistory 的内容桥）→ 规则检查 → 问题列表；
        - 「点击问题」经既有 EventBus EDITOR_JUMP_LINE 跳转编辑器行；
        - 「一键格式化」先二次确认，再经既有 EventBus MONACO_REPLACE_TEXT 应用安全修复；
        - 修完自动重新检查（只基于刚应用的文本，不重复读编辑器，避免时序抖动）。
    -->
    <BaseDialog
        v-if="flags.markdownLint"
        :visible="state.visible"
        :title="tOr(UI.title, 'Markdown 检查')"
        width="920px"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="lint-body">
            <div class="lint-toolbar">
                <span class="lint-target" :title="documentHistoryState.activeFilePath">
                    {{ targetText }}
                </span>
                <span class="lint-summary">{{ summaryText }}</span>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--ghost btn btn-recheck"
                    :disabled="checking"
                    @click="runCheck"
                >
                    {{ tOr(UI.recheck, '重新检查') }}
                </button>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--apply btn btn-format"
                    :disabled="checking || summary.fixable === 0 || tooLarge"
                    @click="requestFormat"
                >
                    {{ tOr(UI.applyFormat, '一键格式化') }}
                </button>
            </div>

            <div v-if="contentSource === 'saved'" class="lint-hint">
                {{ tOr(UI.savedContentHint, '编辑器未就绪，当前检查基于已保存内容') }}
            </div>

            <div v-if="checking" class="lint-placeholder" role="status">
                {{ tOr(UI.checking, '正在检查…') }}
            </div>
            <div v-else-if="loadError" class="lint-placeholder lint-placeholder--error">
                {{ tOr(UI.loadFailed, '读取编辑器内容失败，请稍后重试') }}
            </div>
            <div v-else-if="noContent" class="lint-placeholder">
                {{ tOr(UI.noContent, '当前没有可检查的文档，请先打开或新建 Markdown 文件') }}
            </div>
            <div v-else-if="tooLarge" class="lint-placeholder">
                {{ tOr(UI.tooLarge, '文档过大，已跳过检查（超过 512K 字符）') }}
            </div>
            <div v-else-if="issues.length === 0" class="lint-placeholder lint-placeholder--success">
                {{ tOr(UI.noIssues, '未发现 Markdown 规范问题') }}
            </div>
            <div v-else class="lint-main">
                <div class="issue-list-wrap">
                    <div class="issue-list-title">
                        {{ tOr(UI.issueListTitle, '问题列表') }}
                    </div>
                    <div
                        class="issue-list"
                        role="listbox"
                        :aria-label="tOr(UI.issueListTitle, '问题列表')"
                    >
                        <button
                            v-for="issue in issues"
                            :key="`${issue.line}-${issue.column}-${issue.ruleId}`"
                            type="button"
                            role="option"
                            class="issue-item"
                            :class="`issue-item--${issue.severity}`"
                            :aria-selected="issue === selectedIssue"
                            @click="handleIssueClick(issue)"
                        >
                            <span class="issue-line">L{{ issue.line }}:{{ issue.column }}</span>
                            <span class="issue-rule">{{ issue.ruleId }}</span>
                            <span class="issue-message">{{ ruleMessageText(issue) }}</span>
                            <span
                                v-if="issue.fix !== undefined"
                                class="issue-fixable"
                                :title="tOr(UI.fixableHint, '可自动修复')"
                            >
                                ✓
                            </span>
                        </button>
                    </div>
                </div>

                <div class="rule-stats">
                    <div class="rule-stats-title">{{ tOr(UI.ruleStatsTitle, '规则统计') }}</div>
                    <div
                        v-for="stat in summary.ruleStats"
                        :key="stat.ruleId"
                        class="stat-row"
                        :class="`stat-row--${stat.severity}`"
                    >
                        <span class="stat-rule">{{ stat.ruleId }}</span>
                        <span class="stat-count">{{ stat.count }}</span>
                    </div>
                    <div class="stat-total">
                        {{
                            tOr(
                                UI.ruleStatsTotal,
                                '共 {total} 项：错误 {errors} / 警告 {warnings}',
                                {
                                    total: summary.total,
                                    errors: summary.errors,
                                    warnings: summary.warnings
                                }
                            )
                        }}
                    </div>
                </div>
            </div>

            <div v-if="formatConfirmVisible" class="lint-confirm" role="alert">
                <p class="confirm-message">
                    {{ formatConfirmMessage }}
                </p>
                <div class="confirm-actions">
                    <button
                        type="button"
                        class="dialog-btn dialog-btn--primary btn-confirm-format"
                        @click="confirmFormat"
                    >
                        {{ tOr(UI.formatConfirm, '确认格式化') }}
                    </button>
                    <button
                        type="button"
                        class="dialog-btn dialog-btn--secondary btn-cancel-format"
                        @click="cancelFormat"
                    >
                        {{ tOr(UI.cancel, '取消') }}
                    </button>
                </div>
            </div>

            <div v-if="formatStatus !== 'idle'" class="lint-status" role="status">
                {{
                    formatStatus === 'applied'
                        ? tOr(UI.appliedStatus, '已应用格式化，修复 {count} 项可自动修复问题', {
                              count: appliedFixCount
                          })
                        : tOr(UI.nochangeStatus, '没有可自动修复的内容（格式化结果与原文一致）')
                }}
            </div>
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn-close-lint"
                @click="handleClose"
            >
                {{ tOr(UI.close, '关闭') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * A4 Markdown lint 对话框（renderer-only，opt-in：flags.markdownLint）。
 *
 * 数据流：
 * 1. 打开 → `readActiveMarkdownContent()`（Monaco 实时内容 → 已保存内容兜底）；
 * 2. `lintMarkdown()` → 问题列表 + `summarizeMarkdownLint()` 规则统计；
 * 3. 点击问题 → `jumpActiveEditorToLine()`（既有 EventBus EDITOR_JUMP_LINE）；
 * 4. 一键格式化 → `formatMarkdown()` → `replaceActiveMarkdownContent()`（既有 EventBus
 *    MONACO_REPLACE_TEXT）→ 基于新文本重新汇总（不重复读编辑器）。
 *
 * i18n：同文档历史，使用动态键表 + 中文兜底（建议键 `editorUi.markdownLint.*` 由主控补词典）。
 */
import { computed, ref, watch } from 'vue'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import { useFeatureFlags } from '../../../composables/useFeatureFlags'
import {
    documentHistoryState,
    jumpActiveEditorToLine,
    readActiveMarkdownContent,
    replaceActiveMarkdownContent,
    type MarkdownContentSource
} from '../../../composables/useDocumentHistory'
import BaseDialog from '../../dialogs/BaseDialog.vue'
import {
    MARKDOWN_LINT_MAX_INPUT_CHARS,
    MARKDOWN_LINT_RULE_MESSAGE_KEYS,
    formatMarkdown,
    lintMarkdown,
    summarizeMarkdownLint,
    type MarkdownLintIssue
} from './markdown-lint'
import { closeMarkdownLintDialog, markdownLintDialogState } from './lint-dialog-state'

/** 对话框文案建议键（主控补 editorUi.markdownLint.* 词典后自动生效；未补时用中文兜底） */
const UI = {
    title: 'editorUi.markdownLint.title',
    checking: 'editorUi.markdownLint.checking',
    loadFailed: 'editorUi.markdownLint.loadFailed',
    noContent: 'editorUi.markdownLint.noContent',
    tooLarge: 'editorUi.markdownLint.tooLarge',
    noIssues: 'editorUi.markdownLint.noIssues',
    recheck: 'editorUi.markdownLint.recheck',
    applyFormat: 'editorUi.markdownLint.applyFormat',
    issueListTitle: 'editorUi.markdownLint.issueListTitle',
    ruleStatsTitle: 'editorUi.markdownLint.ruleStatsTitle',
    ruleStatsTotal: 'editorUi.markdownLint.ruleStatsTotal',
    summary: 'editorUi.markdownLint.summary',
    fixableHint: 'editorUi.markdownLint.fixableHint',
    formatConfirmMessage: 'editorUi.markdownLint.formatConfirmMessage',
    formatConfirm: 'editorUi.markdownLint.formatConfirm',
    cancel: 'editorUi.markdownLint.cancel',
    appliedStatus: 'editorUi.markdownLint.appliedStatus',
    nochangeStatus: 'editorUi.markdownLint.nochangeStatus',
    savedContentHint: 'editorUi.markdownLint.savedContentHint',
    targetEditor: 'editorUi.markdownLint.targetEditor',
    targetEditorFallback: 'editorUi.markdownLint.targetEditorFallback',
    close: 'editorUi.markdownLint.close'
} as const

const { flags } = useFeatureFlags()
/** lint 对话框状态（模块单例，宿主负责挂载/卸载） */
const state = markdownLintDialogState

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

/** 是否正在读取/检查 */
const checking = ref(false)
/** 检查请求序号：连续点击「重新检查」时只采用最后一次结果，避免旧结果回写 */
let checkSequence = 0
/** 读取内容失败 */
const loadError = ref(false)
/** 无活动文档（编辑器未就绪且无文件路径/内容） */
const noContent = ref(false)
/** 文档超过检查上限 */
const tooLarge = ref(false)
/** 内容来源（saved 时给用户提示「基于已保存内容」） */
const contentSource = ref<MarkdownContentSource>('empty')
/** 当前问题列表 */
const issues = ref<MarkdownLintIssue[]>([])
/** 最近一次检查的文本（格式化的输入基准） */
const checkedMarkdown = ref('')
/** 当前选中问题（点击后高亮） */
const selectedIssue = ref<MarkdownLintIssue | null>(null)
/** 格式化二次确认 */
const formatConfirmVisible = ref(false)
/** 格式化结果状态：applied=已应用 / nochange=无可修复 */
const formatStatus = ref<'idle' | 'applied' | 'nochange'>('idle')
/** 已修复问题数（统计用） */
const appliedFixCount = ref(0)

/** 问题汇总（规则统计 + 可修复数） */
const summary = computed(() => summarizeMarkdownLint(issues.value))

/** 顶部目标文档展示 */
const targetText = computed(() =>
    documentHistoryState.activeFilePath
        ? tOr(UI.targetEditor, '目标：{path}', {
              path: documentHistoryState.activeFilePath
          })
        : tOr(UI.targetEditor, '目标：{path}', {
              path: tOr(UI.targetEditorFallback, '当前编辑器')
          })
)

/** 顶部汇总文案 */
const summaryText = computed(() =>
    tOr(UI.summary, '共 {total} 项：错误 {errors} / 警告 {warnings}，可自动修复 {fixable} 项', {
        total: summary.value.total,
        errors: summary.value.errors,
        warnings: summary.value.warnings,
        fixable: summary.value.fixable
    })
)

/** 格式化确认文案（展示可修复问题数与提示） */
const formatConfirmMessage = computed(() =>
    tOr(
        UI.formatConfirmMessage,
        '将对文档执行安全格式化：修复 {count} 项可自动修复问题（行尾空格、空行、围栏语言），不改标题层级/表格结构。是否继续？',
        { count: summary.value.fixable }
    )
)

/** 规则文案：优先词典（动态键表），缺键回退 lint 内置中文文案 */
function ruleMessageText(issue: MarkdownLintIssue): string {
    const key = MARKDOWN_LINT_RULE_MESSAGE_KEYS[issue.ruleId]
    const text = t(key, issue.messageParams)
    return text === key ? issue.message : text
}

/** 读取当前内容并执行检查 */
async function runCheck(): Promise<void> {
    if (!flags.markdownLint) {
        return
    }
    const sequence = ++checkSequence
    checking.value = true
    loadError.value = false
    formatConfirmVisible.value = false
    formatStatus.value = 'idle'
    selectedIssue.value = null
    try {
        const snapshot = await readActiveMarkdownContent()
        if (sequence !== checkSequence) {
            return
        }
        contentSource.value = snapshot.source
        if (snapshot.source === 'empty' && documentHistoryState.activeFilePath.length === 0) {
            noContent.value = true
            tooLarge.value = false
            issues.value = []
            checkedMarkdown.value = ''
            return
        }
        noContent.value = false
        checkedMarkdown.value = snapshot.content
        tooLarge.value = snapshot.content.length > MARKDOWN_LINT_MAX_INPUT_CHARS
        issues.value = tooLarge.value ? [] : lintMarkdown(snapshot.content)
    } catch (error) {
        if (sequence !== checkSequence) {
            return
        }
        loadError.value = true
        issues.value = []
        logger.warn('[Markdown 检查] 读取内容/执行检查失败', error)
    } finally {
        if (sequence === checkSequence) {
            checking.value = false
        }
    }
}

/** 点击问题：经既有 EventBus 跳转编辑器行并高亮当前项 */
function handleIssueClick(issue: MarkdownLintIssue): void {
    selectedIssue.value = issue
    jumpActiveEditorToLine(issue.line)
}

/** 请求格式化（先二次确认） */
function requestFormat(): void {
    if (summary.value.fixable === 0 || tooLarge.value) {
        return
    }
    formatConfirmVisible.value = true
}

/** 取消格式化 */
function cancelFormat(): void {
    formatConfirmVisible.value = false
}

/**
 * 确认格式化：应用安全修复 → 重新汇总。
 *
 * 应用前重新读取一次当前内容（对话框是模态的，正常不会变；防御外部/程序化修改），
 * 基于最新文本执行格式化，避免把「检查时快照」覆盖到已变化的编辑器内容上。
 * 应用后不再次读取编辑器（MONACO_REPLACE_TEXT 触发的更新存在时序差），
 * 直接基于格式化后文本重查，保证结果与刚应用的内容一致。
 */
async function confirmFormat(): Promise<void> {
    const fixableBefore = summary.value.fixable
    formatConfirmVisible.value = false
    let baseText = checkedMarkdown.value
    try {
        const latest = await readActiveMarkdownContent()
        if (latest.source !== 'empty') {
            baseText = latest.content
        }
    } catch {
        // 读取失败时沿用最近一次检查文本（内容桥本身已降级为不抛错，这里仅防御）
    }
    const formatted = formatMarkdown(baseText)
    if (formatted === baseText) {
        formatStatus.value = 'nochange'
        appliedFixCount.value = 0
        return
    }
    replaceActiveMarkdownContent(formatted)
    checkedMarkdown.value = formatted
    contentSource.value = 'editor'
    tooLarge.value = formatted.length > MARKDOWN_LINT_MAX_INPUT_CHARS
    issues.value = tooLarge.value ? [] : lintMarkdown(formatted)
    selectedIssue.value = null
    appliedFixCount.value = fixableBefore
    formatStatus.value = 'applied'
}

/** 关闭对话框 */
function handleClose(): void {
    closeMarkdownLintDialog()
}

// 打开即检查（宿主可能先挂载后设置 visible，故 immediate 兜底）
watch(
    () => state.visible,
    (visible) => {
        if (visible) {
            void runCheck()
        } else {
            formatConfirmVisible.value = false
            formatStatus.value = 'idle'
            selectedIssue.value = null
        }
    },
    { immediate: true }
)
</script>

<style scoped>
.lint-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px 8px;
    min-height: 360px;
}

.lint-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

.lint-target {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.lint-summary {
    flex: none;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.lint-hint {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
    background: var(--theme-hover-background);
    border-radius: 4px;
}

.lint-placeholder {
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

.lint-placeholder--error {
    color: var(--theme-accent-color);
}

.lint-placeholder--success {
    color: var(--theme-accent-color);
}

.lint-main {
    display: flex;
    gap: 12px;
    min-height: 0;
    flex: 1;
}

/* ==================== 问题列表 ==================== */
.issue-list-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    overflow: hidden;
}

.issue-list-title,
.rule-stats-title {
    padding: 8px 12px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
    border-bottom: 1px solid var(--theme-border-color);
}

.issue-list {
    flex: 1;
    min-height: 0;
    max-height: 46vh;
    overflow-y: auto;
    padding: 4px;
}

.issue-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
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

.issue-item:hover {
    background: var(--theme-hover-background);
}

.issue-item:focus-visible {
    outline: 2px solid var(--theme-accent-color);
    outline-offset: 1px;
}

.issue-item[aria-selected='true'] {
    background: var(--theme-hover-background);
    border-color: var(--theme-accent-color);
}

.issue-line {
    flex: none;
    width: 5.5em;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--theme-secondary-text-color);
}

.issue-rule {
    flex: none;
    width: 4.5em;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--theme-accent-color);
}

.issue-item--error .issue-rule {
    font-weight: 700;
}

.issue-message {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.issue-fixable {
    flex: none;
    color: var(--theme-accent-color);
}

/* ==================== 规则统计 ==================== */
.rule-stats {
    flex: none;
    width: 200px;
    display: flex;
    flex-direction: column;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    overflow: hidden;
}

.stat-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 12px;
    font-size: 12px;
    border-bottom: 1px solid var(--theme-border-color);
}

.stat-rule {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--theme-text-color);
}

.stat-row--error .stat-rule {
    color: var(--theme-accent-color);
    font-weight: 700;
}

.stat-count {
    color: var(--theme-secondary-text-color);
}

.stat-total {
    padding: 8px 12px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

/* ==================== 二次确认 / 状态 ==================== */
.lint-confirm {
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

.lint-status {
    padding: 8px 12px;
    font-size: 12px;
    color: var(--theme-accent-color);
    background: var(--theme-hover-background);
    border-radius: 4px;
}
</style>
