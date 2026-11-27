<template>
    <!--
        P0-8 写作风格 / 语法检查对话框（默认只提示、不自动修改）。
        - 能力开关 writingStyleCheck（系统设置 → 编写体验）关闭时根节点不渲染；
        - 打开时经既有的编辑器内容桥读取当前 Markdown（Monaco 实时内容优先，已保存内容兜底）；
        - 纯规则引擎（writing-style-check.ts）产出问题列表与规则统计；
        - 点击问题经既有 EventBus EDITOR_JUMP_LINE 跳转编辑器行（不新增 IPC / 事件）；
        - 右侧规则列表可单独开关规则（不重新读取编辑器，仅基于最近一次检查文本重算）；
        - 所有用户文案走 `editorUi.writingStyle.*` 建议键 + 中文兜底（词典由主控补）。
    -->
    <BaseDialog
        v-if="flags.writingStyleCheck"
        non-modal
        :visible="state.visible"
        :title="tOr(UI.title, '写作风格检查')"
        width="960px"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="writing-style-body">
            <div class="ws-toolbar">
                <span class="ws-target" :title="documentHistoryState.activeFilePath">
                    {{ targetText }}
                </span>
                <span class="ws-summary">{{ summaryText }}</span>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--ghost btn btn-recheck"
                    :disabled="checking"
                    @click="runCheck"
                >
                    {{ tOr(UI.recheck, '重新检查') }}
                </button>
            </div>

            <div v-if="contentSource === 'saved' && !checking" class="ws-hint">
                {{ tOr(UI.savedContentHint, '编辑器未就绪，当前检查基于已保存内容') }}
            </div>

            <div v-if="checking" class="ws-placeholder" role="status">
                {{ tOr(UI.checking, '正在检查…') }}
            </div>
            <div v-else-if="loadError" class="ws-placeholder ws-placeholder--error">
                {{ tOr(UI.loadFailed, '读取编辑器内容失败，请稍后重试') }}
            </div>
            <div v-else-if="noContent" class="ws-placeholder">
                {{ tOr(UI.noContent, '当前没有可检查的文档，请先打开或新建 Markdown 文件') }}
            </div>
            <div v-else-if="tooLarge" class="ws-placeholder">
                {{ tOr(UI.tooLarge, '文档过大，已跳过检查（超过 2 MiB / 约 200 万字符）') }}
            </div>
            <div
                v-else-if="visibleIssues.length === 0"
                class="ws-placeholder ws-placeholder--success"
            >
                {{ tOr(UI.noIssues, '已启用规则未发现写作风格问题') }}
            </div>
            <div v-else class="ws-main">
                <div class="ws-issue-list-wrap">
                    <div class="ws-issue-list-title">
                        {{ tOr(UI.issueListTitle, '问题列表') }}
                    </div>
                    <div
                        class="ws-issue-list"
                        role="listbox"
                        :aria-label="tOr(UI.issueListTitle, '问题列表')"
                    >
                        <button
                            v-for="issue in visibleIssues"
                            :key="`${issue.line}-${issue.column}-${issue.ruleId}`"
                            type="button"
                            role="option"
                            class="issue-item"
                            :class="`issue-item--${issue.severity}`"
                            :aria-selected="issue === selectedIssue"
                            :title="issue.excerpt"
                            @click="handleIssueClick(issue)"
                        >
                            <span class="issue-line">L{{ issue.line }}:{{ issue.column }}</span>
                            <span class="issue-rule">{{ ruleLabel(issue.ruleId) }}</span>
                            <span class="issue-message">{{ issueMessageText(issue) }}</span>
                            <span class="issue-excerpt">{{ issue.excerpt }}</span>
                        </button>
                    </div>
                </div>

                <div class="ws-rule-stats">
                    <div class="ws-rule-stats-title">
                        {{ tOr(UI.ruleStatsTitle, '规则统计') }}
                    </div>
                    <label
                        v-for="row in ruleRows"
                        :key="row.definition.id"
                        class="stat-row"
                        :class="`stat-row--${row.definition.severity}`"
                    >
                        <input
                            type="checkbox"
                            class="stat-toggle"
                            :checked="enabledRules[row.definition.id]"
                            @change="handleRuleToggle(row.definition.id)"
                        />
                        <span class="stat-rule">{{ ruleLabel(row.definition.id) }}</span>
                        <span class="stat-count">{{ row.count }}</span>
                    </label>
                    <div class="stat-total">{{ totalText }}</div>
                    <div v-if="summary.truncated" class="ws-truncated">
                        {{ tOr(UI.truncatedHint, '部分规则命中过多，结果已按每条规则上限截断') }}
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn-close-writing-style"
                @click="handleClose"
            >
                {{ tOr(UI.close, '关闭') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * P0-8 写作风格检查对话框（renderer-only，不新增 IPC / 共享设置 / 菜单 / i18n 词典）。
 *
 * 数据流：
 * 1. 打开 → `readActiveMarkdownContent()`（Monaco 实时模型 → 已保存内容兜底）；
 * 2. `checkWritingStyle()` → 问题列表 + `summarizeWritingStyleIssues()` 规则统计；
 * 3. 点击问题 → `jumpActiveEditorToLine()`（既有 EventBus EDITOR_JUMP_LINE，1-based 行）；
 * 4. 勾选/取消规则 → 基于最近一次检查文本、带上新规则开关重算（不重新读编辑器）；
 * 5. 重新检查 → 重新读取编辑器内容（用户可能在对话框外改过文档，仅「重新检查」会重新读）。
 *
 * i18n：动态键常量表在 writing-style-check.ts（规则文案 / 规则短名键），
 * 此处仅 UI 键；词典缺失时 tOr 回退中文兜底，界面在补齐词典前即可用。
 */
import { computed, reactive, ref, watch } from 'vue'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import { useFeatureFlags } from '../../../composables/useFeatureFlags'
import {
    documentHistoryState,
    jumpActiveEditorToLine,
    readActiveMarkdownContent,
    type MarkdownContentSource
} from '../../../composables/useDocumentHistory'
import BaseDialog from '../../dialogs/BaseDialog.vue'
import {
    WRITING_STYLE_ISSUE_MESSAGE_KEYS,
    WRITING_STYLE_MAX_INPUT_CHARS,
    WRITING_STYLE_RULES,
    checkWritingStyle,
    summarizeWritingStyleIssues,
    type WritingStyleCheckOptions,
    type WritingStyleIssue,
    type WritingStyleRuleId
} from './writing-style-check'
import { closeWritingStyleDialog, writingStyleDialogState } from './writing-style-dialog-state'

/** 对话框 UI 文案建议键（主控补 `editorUi.writingStyle.*` 词典后自动生效） */
const UI = {
    title: 'editorUi.writingStyle.title',
    checking: 'editorUi.writingStyle.checking',
    loadFailed: 'editorUi.writingStyle.loadFailed',
    noContent: 'editorUi.writingStyle.noContent',
    tooLarge: 'editorUi.writingStyle.tooLarge',
    noIssues: 'editorUi.writingStyle.noIssues',
    recheck: 'editorUi.writingStyle.recheck',
    issueListTitle: 'editorUi.writingStyle.issueListTitle',
    ruleStatsTitle: 'editorUi.writingStyle.ruleStatsTitle',
    ruleStatsTotal: 'editorUi.writingStyle.ruleStatsTotal',
    summary: 'editorUi.writingStyle.summary',
    truncatedHint: 'editorUi.writingStyle.truncatedHint',
    savedContentHint: 'editorUi.writingStyle.savedContentHint',
    targetEditor: 'editorUi.writingStyle.targetEditor',
    targetEditorFallback: 'editorUi.writingStyle.targetEditorFallback',
    close: 'editorUi.writingStyle.close'
} as const

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

/** 规则短名兜底文案（词典补齐前展示；与建议键 `editorUi.writingStyle.ruleLabels.*` 对应） */
const RULE_LABEL_FALLBACKS: Readonly<Record<WritingStyleRuleId, string>> = {
    'long-sentence': '长句',
    'repeated-word': '重复词',
    'frequent-catchphrase': '高频口头禅',
    'filler-word': '填充词',
    'consecutive-punctuation': '连续标点',
    'long-paragraph': '超长段落',
    'mixed-script-spacing': '中英混排空格',
    'punctuation-width-mix': '全半角标点混用'
}

/** 规则 id → 规则元数据（规则名 / 建议键查询） */
const RULE_DEFINITION_MAP = new Map(WRITING_STYLE_RULES.map((rule) => [rule.id, rule]))

/** 对话框状态（模块单例，宿主负责挂载 / 卸载） */
const state = writingStyleDialogState

/** 写作体验能力开关（opt-in：系统设置 → 编写体验 → 写作风格检查；关闭时根节点不渲染） */
const { flags } = useFeatureFlags()

/** 规则开关（默认全部开启；仅影响当前对话框会话，不写配置） */
const enabledRules = reactive<Record<WritingStyleRuleId, boolean>>(
    Object.fromEntries(
        WRITING_STYLE_RULES.map((rule) => [rule.id, rule.enabledByDefault])
    ) as Record<WritingStyleRuleId, boolean>
)

/** 是否正在读取 / 检查 */
const checking = ref(false)
/** 检查请求序号：连续点击「重新检查」时只采用最后一次结果，避免旧结果回写 */
let checkSequence = 0
/** 读取内容失败 */
const loadError = ref(false)
/** 无活动文档（编辑器未就绪且无文件路径 / 内容） */
const noContent = ref(false)
/** 文档超过检查上限 */
const tooLarge = ref(false)
/** 内容来源（saved 时提示「基于已保存内容」） */
const contentSource = ref<MarkdownContentSource>('empty')
/** 当前问题列表（按最近一次检查的规则开关计算） */
const issues = ref<WritingStyleIssue[]>([])
/** 最近一次检查的文本（规则开关重算 / 摘要展示基准） */
const checkedMarkdown = ref('')
/** 当前选中问题（点击后高亮） */
const selectedIssue = ref<WritingStyleIssue | null>(null)

/** 问题汇总（总数 / 级别 / 规则统计） */
const summary = computed(() => summarizeWritingStyleIssues(issues.value))

/** 规则列表行（含未命中规则，保证开关列表完整、顺序稳定） */
const ruleRows = computed(() => {
    const countMap = new Map(summary.value.ruleStats.map((stat) => [stat.ruleId, stat.count]))
    return WRITING_STYLE_RULES.map((definition) => ({
        definition,
        count: countMap.get(definition.id) ?? 0
    }))
})

/** 当前开关下可见的问题（与 issues 同步，防御性过滤） */
const visibleIssues = computed(() =>
    issues.value.filter((issue) => enabledRules[issue.ruleId] === true)
)

/** 已启用规则数 */
const enabledRuleCount = computed(
    () => Object.values(enabledRules).filter((enabled) => enabled).length
)

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
    tOr(UI.summary, '共 {total} 项：警告 {warnings} / 提示 {infos}', {
        total: visibleIssues.value.length,
        warnings: summary.value.warnings,
        infos: summary.value.infos
    })
)

/** 规则统计底部文案（命中总数 + 已启用规则数） */
const totalText = computed(() =>
    tOr(UI.ruleStatsTotal, '共 {total} 项，已启用 {enabled}/{all} 条规则', {
        total: visibleIssues.value.length,
        enabled: enabledRuleCount.value,
        all: WRITING_STYLE_RULES.length
    })
)

/** 规则短名（词典优先，缺键回退中文） */
function ruleLabel(ruleId: WritingStyleRuleId): string {
    const definition = RULE_DEFINITION_MAP.get(ruleId)
    if (definition === undefined) {
        return ruleId
    }
    return tOr(definition.labelKey, RULE_LABEL_FALLBACKS[ruleId])
}

/** 问题文案：词典优先，缺键回退中文兜底（含插值） */
function issueMessageText(issue: WritingStyleIssue): string {
    const text = t(issue.messageKey, issue.messageParams)
    if (text !== issue.messageKey) {
        return text
    }
    return fallbackIssueMessage(issue)
}

/** 问题中文兜底文案（与建议键一一对应；补齐词典后此分支不再展示） */
function fallbackIssueMessage(issue: WritingStyleIssue): string {
    const params = issue.messageParams ?? {}
    const value = (key: string): string => String(params[key] ?? '')
    switch (issue.ruleId) {
        case 'long-sentence':
            return issue.messageKey === WRITING_STYLE_ISSUE_MESSAGE_KEYS.longSentenceWords
                ? `长句共 ${value('count')} 词（建议不超过 ${value('limit')} 词）`
                : `长句共 ${value('count')} 字（建议不超过 ${value('limit')} 字）`
        case 'repeated-word':
            return `词语连续重复：「${value('word')}」`
        case 'frequent-catchphrase':
            return `高频口头禅：「${value('phrase')}」出现 ${value('count')} 次（建议不超过 ${value('limit')} 次）`
        case 'filler-word':
            return `填充词：「${value('word')}」`
        case 'consecutive-punctuation':
            return `连续标点：「${value('punctuation')}」`
        case 'long-paragraph':
            return `段落过长：约 ${value('count')} 字（建议不超过 ${value('limit')} 字）`
        case 'mixed-script-spacing':
            return `中英混排建议加空格：「${value('before')}${value('after')}」`
        case 'punctuation-width-mix':
            return `全角/半角标点混用：「${value('full')}」与「${value('half')}」（半角 ${value('count')} 处）`
        default:
            return ''
    }
}

/** 组装当前规则开关对应的检查选项 */
function currentCheckOptions(): WritingStyleCheckOptions {
    const rules = {} as Record<WritingStyleRuleId, boolean>
    for (const rule of WRITING_STYLE_RULES) {
        rules[rule.id] = enabledRules[rule.id]
    }
    return { rules }
}

/** 基于给定文本执行检查（不读编辑器） */
function applyCheck(text: string): void {
    tooLarge.value = text.length > WRITING_STYLE_MAX_INPUT_CHARS
    issues.value = tooLarge.value ? [] : checkWritingStyle(text, currentCheckOptions())
    selectedIssue.value = null
}

/** 读取当前内容并执行检查 */
async function runCheck(): Promise<void> {
    const sequence = ++checkSequence
    checking.value = true
    loadError.value = false
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
        applyCheck(snapshot.content)
    } catch (error) {
        if (sequence !== checkSequence) {
            return
        }
        loadError.value = true
        issues.value = []
        logger.warn('[写作风格检查] 读取内容/执行检查失败', error)
    } finally {
        if (sequence === checkSequence) {
            checking.value = false
        }
    }
}

/** 点击问题：经既有 EventBus 跳转编辑器行并高亮当前项 */
function handleIssueClick(issue: WritingStyleIssue): void {
    selectedIssue.value = issue
    jumpActiveEditorToLine(issue.line)
}

/** 勾选 / 取消规则：基于最近一次检查文本重算（不重新读取编辑器） */
function handleRuleToggle(ruleId: WritingStyleRuleId): void {
    enabledRules[ruleId] = enabledRules[ruleId] !== true
    selectedIssue.value = null
    if (checkedMarkdown.value.length === 0) {
        issues.value = []
        return
    }
    applyCheck(checkedMarkdown.value)
}

/** 关闭对话框 */
function handleClose(): void {
    closeWritingStyleDialog()
}

// 打开即检查（宿主可能先挂载后设置 visible，故 immediate 兜底）
watch(
    () => state.visible,
    (visible) => {
        if (visible) {
            void runCheck()
        } else {
            // 关闭时丢弃在途检查结果，避免重新打开时看到旧文本的结论
            checkSequence += 1
            checking.value = false
            selectedIssue.value = null
        }
    },
    { immediate: true }
)
</script>

<style scoped>
.writing-style-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px 8px;
    min-height: 380px;
}

.ws-toolbar {
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

.ws-target {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.ws-summary {
    flex: none;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.ws-hint {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
    background: var(--theme-hover-background);
    border-radius: 4px;
}

.ws-placeholder {
    min-height: 250px;
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

.ws-placeholder--error,
.ws-placeholder--success {
    color: var(--theme-accent-color);
}

.ws-main {
    display: flex;
    gap: 12px;
    min-height: 0;
    flex: 1;
}

/* ==================== 问题列表 ==================== */
.ws-issue-list-wrap {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    overflow: hidden;
}

.ws-issue-list-title,
.ws-rule-stats-title {
    padding: 8px 12px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
    border-bottom: 1px solid var(--theme-border-color);
}

.ws-issue-list {
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
    width: 6em;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--theme-secondary-text-color);
}

.issue-rule {
    flex: none;
    width: 7em;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--theme-accent-color);
}

.issue-item--info .issue-rule {
    color: var(--theme-secondary-text-color);
}

.issue-message {
    flex: none;
    max-width: 46%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.issue-excerpt {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    opacity: 0.75;
    color: var(--theme-secondary-text-color);
}

/* ==================== 规则统计 ==================== */
.ws-rule-stats {
    flex: none;
    width: 230px;
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
    gap: 8px;
    padding: 6px 12px;
    font-size: 12px;
    border-bottom: 1px solid var(--theme-border-color);
    cursor: pointer;
}

.stat-row:hover {
    background: var(--theme-hover-background);
}

.stat-toggle {
    flex: none;
    margin: 0;
    accent-color: var(--theme-accent-color);
}

.stat-rule {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text-color);
}

.stat-row--warning .stat-rule {
    color: var(--theme-accent-color);
    font-weight: 700;
}

.stat-count {
    flex: none;
    color: var(--theme-secondary-text-color);
}

.stat-total {
    padding: 8px 12px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

.ws-truncated {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
    background: var(--theme-hover-background);
}
</style>
