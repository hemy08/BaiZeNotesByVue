/**
 * P0-8 轻量写作风格 / 语法检查（纯规则引擎）
 *
 * 定位：不引入第三方文本检查依赖，按任务要求实现一组「只提示、不自动修改」的写作规则。
 * 本模块只做「Markdown 原文 → 问题列表 / 规则统计」的纯计算，不依赖 Vue / DOM / i18n；
 * 对话框层（WritingStyleDialog.vue）负责读取编辑器内容、展示中文兜底文案与点击跳行。
 *
 * 规则清单（规则可单独开关；阈值/词表均可配置）：
 * - long-sentence：长句（中文 > 60 字 / 英文 > 35 词，按句统计）；
 * - repeated-word：重复词（中文相邻重复 2~6 字词、英文相邻重复单词、中文单字叠写）；
 * - frequent-catchphrase：高频口头禅（可配置口头禅词表，全文出现 ≥ N 次提示一次）；
 * - filler-word：填充词 / 弱化词（“其实 / 基本上 / basically / 非常”等可配置列表）；
 * - consecutive-punctuation：连续标点（“！！！”、“。。”、“！？”等；省略号 … / ... 豁免）；
 * - long-paragraph：超长段落（单段落可见字数 > 500）；
 * - mixed-script-spacing：中英混排缺少空格（仅提示，info 级；数字不参与，避免误报）；
 * - punctuation-width-mix：全半角标点混用（同一类标点全角 + 半角同时出现，且半角用于中文语境）。
 *
 * 剔除（避免误报）：YAML front matter、围栏代码块、缩进代码块（≥4 空格且前有空行）、
 * 行内代码、HTML 标签 / 单行 HTML 注释。剔除用「等长空格替换」，因此行号 / 列号始终
 * 对应原文（1-based，与 Monaco 的 UTF-16 列语义一致）。
 *
 * 复杂度：O(n)（n = 字符数；掩码、分行、各类扫描各一趟，词表匹配为固定小词表的
 * 原生 indexOf）。单次检查输入上限 `WRITING_STYLE_MAX_INPUT_CHARS`（2 MiB），超限由调用方
 * 直接跳过检查（本函数返回空数组）；每条规则最多返回 `WRITING_STYLE_MAX_ISSUES_PER_RULE`
 * 条，防止超长文档把对话框刷屏。
 *
 * 已知简化（MVP 边界）：
 * - 中文不做分词，长句按「汉字数」、段落按「汉字数 + 英文词数」估算；
 * - 围栏代码块内的 Markdown 代码示例整体豁免（含其中的长句/重复词）；
 * - 多行行内代码、多行 HTML 注释、跨行 HTML 块按普通文本处理（真实编辑器场景极少）；
 * - 列表项 / 表格行不参与「长句 / 超长段落」统计（避免把长列表误判为长段落），
 *   但仍参与填充词 / 重复词 / 标点类规则。
 */

/** 单次检查允许的最大字符数（2 MiB；超过时调用方应提示「文档过大，已跳过检查」） */
export const WRITING_STYLE_MAX_INPUT_CHARS = 2 * 1024 * 1024

/** 单条规则最多返回的问题数（防止超长文档刷屏；规则统计以此判断「结果可能被截断」） */
export const WRITING_STYLE_MAX_ISSUES_PER_RULE = 200

/** 问题严重级别：warning = 建议处理；info = 仅提示（如中英混排空格、全半角混用） */
export type WritingStyleSeverity = 'info' | 'warning'

/** 规则 id（稳定标识；UI 规则统计 / 开关 / i18n 键均以此为键） */
export type WritingStyleRuleId =
    | 'long-sentence'
    | 'repeated-word'
    | 'frequent-catchphrase'
    | 'filler-word'
    | 'consecutive-punctuation'
    | 'long-paragraph'
    | 'mixed-script-spacing'
    | 'punctuation-width-mix'

/**
 * 单条风格问题。
 *
 * - line / column：1-based，指向原文位置（列 = UTF-16 列，与 Monaco 跳转语义一致）；
 * - messageKey：建议 i18n 键（词典未补时由对话框回退中文兜底文案）；
 * - excerpt：问题附近原文片段（已压缩空白、最长约 80 字符），供列表与兜底文案展示；
 * - messageParams：词典插值参数（{count}/{limit}/{word} 等，实际使用见各规则）。
 */
export interface WritingStyleIssue {
    ruleId: WritingStyleRuleId
    line: number
    column: number
    messageKey: string
    severity: WritingStyleSeverity
    excerpt: string
    /** 词典插值参数（可选；对话框 tOr 时传入） */
    messageParams?: Record<string, string | number>
}

/** 可配置阈值（全部有默认值；UI 只展示默认值，改写需调用方显式传参） */
export interface WritingStyleThresholds {
    /** 长句：中文句子汉字数上限 */
    longSentenceCjkChars: number
    /** 长句：英文句子单词数上限 */
    longSentenceEnglishWords: number
    /** 超长段落：单段落可见字数上限（汉字数 + 英文词数） */
    longParagraphChars: number
    /** 高频口头禅：全文出现次数达到该值才提示 */
    catchphraseMinCount: number
    /** 单条规则最多返回的问题数 */
    maxIssuesPerRule: number
}

/** 检查选项（规则开关 / 阈值 / 填充词与口头禅词表均可配置） */
export interface WritingStyleCheckOptions {
    /** 规则开关（缺省 = 规则默认值，当前全部开启） */
    rules?: Partial<Record<WritingStyleRuleId, boolean>>
    /** 阈值覆盖（缺省 = 默认阈值） */
    thresholds?: Partial<WritingStyleThresholds>
    /** 填充词列表（传入则整体替换默认列表；空数组 = 关闭该词表匹配） */
    fillerWords?: readonly string[]
    /** 高频口头禅列表（传入则整体替换默认列表；与填充词重叠的词会自动跳过） */
    catchphrases?: readonly string[]
}

/** 规则元数据（对话框规则列表 / 统计展示用） */
export interface WritingStyleRuleDefinition {
    id: WritingStyleRuleId
    severity: WritingStyleSeverity
    /** 默认是否开启（当前全部开启；保留字段供后续 opt-in 扩展） */
    enabledByDefault: boolean
    /** 规则短名建议 i18n 键（`editorUi.writingStyle.ruleLabels.*`） */
    labelKey: string
    /** 规则问题文案建议 i18n 键（`editorUi.writingStyle.rules.*`） */
    messageKey: string
    /** 主要阈值（仅单阈值规则提供，供 UI 规则列表展示） */
    threshold?: number
    /** 阈值单位（cjkChars=汉字 / words=英文词 / proseUnits=可见字数 / times=次数） */
    thresholdUnit?: 'cjkChars' | 'words' | 'proseUnits' | 'times'
}

/** 默认阈值（与任务要求一致：中文长句 60 字 / 英文长句 35 词 / 段落 500 字） */
export const DEFAULT_WRITING_STYLE_THRESHOLDS: Readonly<WritingStyleThresholds> = {
    longSentenceCjkChars: 60,
    longSentenceEnglishWords: 35,
    longParagraphChars: 500,
    catchphraseMinCount: 4,
    maxIssuesPerRule: WRITING_STYLE_MAX_ISSUES_PER_RULE
}

/** 默认填充词 / 弱化词（中文按子串匹配，英文按整词匹配、忽略大小写） */
export const DEFAULT_FILLER_WORDS: readonly string[] = [
    '其实',
    '基本上',
    '说实话',
    '真的',
    '非常',
    '十分',
    '特别',
    '完全',
    '根本',
    '确实',
    '显然',
    '当然',
    'basically',
    'actually',
    'really',
    'very',
    'just',
    'quite',
    'literally',
    'honestly',
    'simply',
    'pretty'
]

/**
 * 默认高频口头禅列表。
 * 说明：这里不收录填充词表内的词（重复提示无意义），与填充词重叠项会在检查时自动跳过。
 */
export const DEFAULT_CATCHPHRASES: readonly string[] = [
    '然后',
    '就是说',
    '反正',
    '感觉',
    '据说',
    '众所周知',
    '总的来说',
    '总体来说',
    '相对来说',
    '不得不说',
    '大家都知道',
    '说白了',
    '毫无疑问'
]

/** 规则文案键常量表（I18N-07：动态键必须有常量表，禁止散落拼 key） */
export const WRITING_STYLE_ISSUE_MESSAGE_KEYS = {
    longSentence: 'editorUi.writingStyle.rules.longSentence',
    longSentenceWords: 'editorUi.writingStyle.rules.longSentenceWords',
    repeatedWord: 'editorUi.writingStyle.rules.repeatedWord',
    frequentCatchphrase: 'editorUi.writingStyle.rules.frequentCatchphrase',
    fillerWord: 'editorUi.writingStyle.rules.fillerWord',
    consecutivePunctuation: 'editorUi.writingStyle.rules.consecutivePunctuation',
    longParagraph: 'editorUi.writingStyle.rules.longParagraph',
    mixedScriptSpacing: 'editorUi.writingStyle.rules.mixedScriptSpacing',
    punctuationWidthMix: 'editorUi.writingStyle.rules.punctuationWidthMix'
} as const

/** 规则定义表（顺序即对话框规则统计顺序；新增规则必须同步规则实现与测试） */
export const WRITING_STYLE_RULES: readonly WritingStyleRuleDefinition[] = [
    {
        id: 'long-sentence',
        severity: 'warning',
        enabledByDefault: true,
        labelKey: 'editorUi.writingStyle.ruleLabels.longSentence',
        messageKey: WRITING_STYLE_ISSUE_MESSAGE_KEYS.longSentence,
        threshold: DEFAULT_WRITING_STYLE_THRESHOLDS.longSentenceCjkChars,
        thresholdUnit: 'cjkChars'
    },
    {
        id: 'repeated-word',
        severity: 'warning',
        enabledByDefault: true,
        labelKey: 'editorUi.writingStyle.ruleLabels.repeatedWord',
        messageKey: WRITING_STYLE_ISSUE_MESSAGE_KEYS.repeatedWord
    },
    {
        id: 'frequent-catchphrase',
        severity: 'info',
        enabledByDefault: true,
        labelKey: 'editorUi.writingStyle.ruleLabels.frequentCatchphrase',
        messageKey: WRITING_STYLE_ISSUE_MESSAGE_KEYS.frequentCatchphrase,
        threshold: DEFAULT_WRITING_STYLE_THRESHOLDS.catchphraseMinCount,
        thresholdUnit: 'times'
    },
    {
        id: 'filler-word',
        severity: 'info',
        enabledByDefault: true,
        labelKey: 'editorUi.writingStyle.ruleLabels.fillerWord',
        messageKey: WRITING_STYLE_ISSUE_MESSAGE_KEYS.fillerWord
    },
    {
        id: 'consecutive-punctuation',
        severity: 'warning',
        enabledByDefault: true,
        labelKey: 'editorUi.writingStyle.ruleLabels.consecutivePunctuation',
        messageKey: WRITING_STYLE_ISSUE_MESSAGE_KEYS.consecutivePunctuation
    },
    {
        id: 'long-paragraph',
        severity: 'warning',
        enabledByDefault: true,
        labelKey: 'editorUi.writingStyle.ruleLabels.longParagraph',
        messageKey: WRITING_STYLE_ISSUE_MESSAGE_KEYS.longParagraph,
        threshold: DEFAULT_WRITING_STYLE_THRESHOLDS.longParagraphChars,
        thresholdUnit: 'proseUnits'
    },
    {
        id: 'mixed-script-spacing',
        severity: 'info',
        enabledByDefault: true,
        labelKey: 'editorUi.writingStyle.ruleLabels.mixedScriptSpacing',
        messageKey: WRITING_STYLE_ISSUE_MESSAGE_KEYS.mixedScriptSpacing
    },
    {
        id: 'punctuation-width-mix',
        severity: 'info',
        enabledByDefault: true,
        labelKey: 'editorUi.writingStyle.ruleLabels.punctuationWidthMix',
        messageKey: WRITING_STYLE_ISSUE_MESSAGE_KEYS.punctuationWidthMix
    }
] as const

/** 规则 id → 元数据 */
const RULE_DEFINITION_MAP = new Map<WritingStyleRuleId, WritingStyleRuleDefinition>(
    WRITING_STYLE_RULES.map((rule) => [rule.id, rule])
)

/** 规则统计项（对话框按规则展示数量） */
export interface WritingStyleRuleStat {
    ruleId: WritingStyleRuleId
    severity: WritingStyleSeverity
    count: number
}

/** 问题汇总（对话框顶部汇总 + 规则统计） */
export interface WritingStyleSummary {
    total: number
    warnings: number
    infos: number
    ruleStats: WritingStyleRuleStat[]
    /** 是否有规则命中条数已达上限（结果可能被截断） */
    truncated: boolean
}

/* ==================== 配置解析 ==================== */

/** 解析后的检查配置（内部使用；词表已去重去空） */
export interface ResolvedWritingStyleOptions {
    rules: Record<WritingStyleRuleId, boolean>
    thresholds: WritingStyleThresholds
    fillerWords: string[]
    catchphrases: string[]
}

/** 词表归一化：去首尾空白、去空串、按小写去重（中文不受影响） */
function normalizeWordList(
    words: readonly string[] | undefined,
    fallback: readonly string[]
): string[] {
    const source = words ?? fallback
    const seen = new Set<string>()
    const result: string[] = []
    for (const word of source) {
        if (typeof word !== 'string') {
            continue
        }
        const trimmed = word.trim()
        if (trimmed.length === 0) {
            continue
        }
        const key = trimmed.toLowerCase()
        if (seen.has(key)) {
            continue
        }
        seen.add(key)
        result.push(trimmed)
    }
    return result
}

/** 解析选项（规则开关 / 阈值 / 词表；不传则使用默认值） */
export function resolveWritingStyleOptions(
    options?: WritingStyleCheckOptions
): ResolvedWritingStyleOptions {
    const rules = {} as Record<WritingStyleRuleId, boolean>
    for (const rule of WRITING_STYLE_RULES) {
        const configured = options?.rules?.[rule.id]
        rules[rule.id] = typeof configured === 'boolean' ? configured : rule.enabledByDefault
    }
    const thresholds: WritingStyleThresholds = {
        ...DEFAULT_WRITING_STYLE_THRESHOLDS,
        ...(options?.thresholds ?? {})
    }
    // 防御非法阈值：非有限数 / 非正数回落到默认值，避免规则永远命中或永不命中
    const safeThresholds: WritingStyleThresholds = {
        longSentenceCjkChars: safePositiveInteger(
            thresholds.longSentenceCjkChars,
            DEFAULT_WRITING_STYLE_THRESHOLDS.longSentenceCjkChars
        ),
        longSentenceEnglishWords: safePositiveInteger(
            thresholds.longSentenceEnglishWords,
            DEFAULT_WRITING_STYLE_THRESHOLDS.longSentenceEnglishWords
        ),
        longParagraphChars: safePositiveInteger(
            thresholds.longParagraphChars,
            DEFAULT_WRITING_STYLE_THRESHOLDS.longParagraphChars
        ),
        catchphraseMinCount: safePositiveInteger(
            thresholds.catchphraseMinCount,
            DEFAULT_WRITING_STYLE_THRESHOLDS.catchphraseMinCount
        ),
        maxIssuesPerRule: safePositiveInteger(
            thresholds.maxIssuesPerRule,
            WRITING_STYLE_MAX_ISSUES_PER_RULE
        )
    }
    return {
        rules,
        thresholds: safeThresholds,
        fillerWords: normalizeWordList(options?.fillerWords, DEFAULT_FILLER_WORDS),
        catchphrases: normalizeWordList(options?.catchphrases, DEFAULT_CATCHPHRASES)
    }
}

/** 阈值归一化：有限正整数，否则回落默认值 */
function safePositiveInteger(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback
}

/* ==================== 文本掩码（剔除代码 / HTML，等长替换保列号） ==================== */

/** 掩码结果（所有字段基于 LF 归一化后的文本；被剔除区域为等长空格） */
export interface WritingStyleMaskResult {
    /** 归一化换行后的原文行 */
    sourceLines: string[]
    /** 掩码后的行（与 sourceLines 等长） */
    maskedLines: string[]
    /** 掩码后的完整文本（与归一化原文等长，行号/列号与原文一致） */
    maskedText: string
    /** 整行被剔除的行（front matter / 代码块） */
    blockedLines: boolean[]
}

/** 行首缩进 ≤3 空格的开围栏（反引号 / 波浪号 ≥3 个） */
const FENCE_OPEN_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/
/** 闭围栏：≤3 空格缩进 + 同字符且长度不短于开围栏 + 行尾仅空白 */
const FENCE_CLOSE_RE = /^( {0,3})(`{3,}|~{3,})[ \t]*$/
/** 行内代码：反引号串（支持 ``code`` 形式；不跨行，MVP 边界） */
const INLINE_CODE_RE = /(`+)([^`\n]*?)\1/g
/** 单行 HTML 注释 */
const HTML_COMMENT_RE = /<!--[\s\S]*?-->/g
/** HTML 标签（`<div>` / `</div>` / `<br/>`；`a < b`、`x<3` 不会误匹配） */
const HTML_TAG_RE = /<\/?[A-Za-z][^>\n]*>/g
/** 缩进代码块行：≥4 空格或 tab 缩进的非空行 */
const INDENTED_CODE_RE = /^(?: {4,}|\t)/

/** 换行归一化为 LF（行号/列号在 CRLF 文档上语义不变） */
function normalizeLineEndings(text: string): string {
    return text.replace(/\r\n?/g, '\n')
}

/** 等长空格替换（保持字符偏移与列号不变；换行不会被替换） */
function replaceWithMask(text: string, pattern: RegExp): string {
    return text.replace(pattern, (match: string) => ' '.repeat(match.length))
}

/** 行内代码 / HTML 注释 / HTML 标签替换为等长空格 */
function maskInlineSegments(line: string): string {
    if (line.length === 0 || (!line.includes('`') && !line.includes('<'))) {
        return line
    }
    let masked = line
    masked = replaceWithMask(masked, INLINE_CODE_RE)
    masked = replaceWithMask(masked, HTML_COMMENT_RE)
    masked = replaceWithMask(masked, HTML_TAG_RE)
    return masked
}

/** 标记 YAML front matter（首行 `---` 到闭合 `---` / `...`；未闭合视为无） */
function markFrontMatter(sourceLines: string[], blockedLines: boolean[]): void {
    if (sourceLines.length === 0 || sourceLines[0].trim() !== '---') {
        return
    }
    for (let index = 1; index < sourceLines.length; index++) {
        const trimmed = sourceLines[index].trim()
        if (trimmed === '---' || trimmed === '...') {
            for (let line = 0; line <= index; line++) {
                blockedLines[line] = true
            }
            return
        }
    }
}

/** 标记围栏代码块（含开/闭围栏行；未闭合围栏持续到文档结尾） */
function markFencedCode(sourceLines: string[], blockedLines: boolean[]): void {
    let index = 0
    while (index < sourceLines.length) {
        if (blockedLines[index]) {
            index += 1
            continue
        }
        const openMatch = FENCE_OPEN_RE.exec(sourceLines[index])
        if (openMatch === null) {
            index += 1
            continue
        }
        const marker = openMatch[2]
        const markerChar = marker[0]
        const info = openMatch[3].trim()
        // CommonMark：反引号围栏的 info string 不允许再出现反引号（避免把行内代码误判为围栏）
        if (markerChar === '`' && info.includes('`')) {
            index += 1
            continue
        }
        const openLine = index
        let closeLine = -1
        let cursor = index + 1
        while (cursor < sourceLines.length) {
            const closeMatch = FENCE_CLOSE_RE.exec(sourceLines[cursor])
            if (
                closeMatch !== null &&
                closeMatch[2][0] === markerChar &&
                closeMatch[2].length >= marker.length
            ) {
                closeLine = cursor
                break
            }
            cursor += 1
        }
        const endLine = closeLine >= 0 ? closeLine : sourceLines.length - 1
        for (let line = openLine; line <= endLine; line++) {
            blockedLines[line] = true
        }
        index = endLine + 1
    }
}

/** 标记缩进代码块（≥4 空格/tab 缩进且前一行是空行；列表缩进续行可能被保守剔除） */
function markIndentedCode(sourceLines: string[], blockedLines: boolean[]): void {
    let index = 0
    while (index < sourceLines.length) {
        const line = sourceLines[index]
        if (blockedLines[index] || line.trim() === '' || !INDENTED_CODE_RE.test(line)) {
            index += 1
            continue
        }
        const previousBlank = index === 0 || sourceLines[index - 1].trim() === ''
        if (!previousBlank) {
            index += 1
            continue
        }
        while (
            index < sourceLines.length &&
            !blockedLines[index] &&
            sourceLines[index].trim() !== '' &&
            INDENTED_CODE_RE.test(sourceLines[index])
        ) {
            blockedLines[index] = true
            index += 1
        }
    }
}

/**
 * 生成掩码文档（导出供测试/调试直接验证「代码块 / 行内代码 / HTML 标签剔除」口径）。
 * 注意：入参不做 2 MiB 上限校验（上限由 `checkWritingStyle` 负责）。
 */
export function maskWritingStyleContent(markdown: string): WritingStyleMaskResult {
    const sourceLines = normalizeLineEndings(markdown).split('\n')
    const blockedLines = new Array<boolean>(sourceLines.length).fill(false)
    markFrontMatter(sourceLines, blockedLines)
    markFencedCode(sourceLines, blockedLines)
    markIndentedCode(sourceLines, blockedLines)
    const maskedLines = sourceLines.map((line, index) =>
        blockedLines[index] ? ' '.repeat(line.length) : maskInlineSegments(line)
    )
    return {
        sourceLines,
        maskedLines,
        maskedText: maskedLines.join('\n'),
        blockedLines
    }
}

/* ==================== 行分类与位置换算 ==================== */

/** 行类型：blank 空行 / blocked 代码块与 front matter / heading 标题 / list 列表 / table 表格 / rule 分隔线 / prose 正文 */
type WritingStyleLineKind = 'blank' | 'blocked' | 'heading' | 'list' | 'table' | 'rule' | 'prose'

/** ATX 标题：≤3 空格缩进 + 1~6 个 # + 空白或行尾 */
const HEADING_RE = /^ {0,3}#{1,6}(?:[ \t]|$)/
/** 列表项：≤3 空格缩进 + 无序标记 / 数字序号 */
const LIST_ITEM_RE = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/
/** 分隔线 / setext 下划线：整行只由 - * _ = 与空白组成（≥3 个） */
const RULE_LINE_RE = /^ {0,3}(?:(?:\*[ \t]*){3,}|(?:-[ \t]*){3,}|(?:_[ \t]*){3,}|(?:=[ \t]*)+)$/

/** 逐行分类（blocked 优先；分类只看原文行，不受掩码影响） */
function classifyLines(sourceLines: string[], blockedLines: boolean[]): WritingStyleLineKind[] {
    return sourceLines.map((line, index): WritingStyleLineKind => {
        if (blockedLines[index]) {
            return 'blocked'
        }
        if (line.trim() === '') {
            return 'blank'
        }
        if (HEADING_RE.test(line)) {
            return 'heading'
        }
        if (RULE_LINE_RE.test(line)) {
            return 'rule'
        }
        if (line.trim().startsWith('|')) {
            return 'table'
        }
        if (LIST_ITEM_RE.test(line)) {
            return 'list'
        }
        return 'prose'
    })
}

/** 行首偏移表（starts[i] = 第 i 行首字符在归一化文本中的偏移） */
function computeLineStarts(lines: string[]): number[] {
    const starts = new Array<number>(lines.length)
    let offset = 0
    for (let index = 0; index < lines.length; index++) {
        starts[index] = offset
        offset += lines[index].length + 1
    }
    return starts
}

/** 二分查找 offset 所在行（返回 0-based 行索引） */
function findLineIndex(starts: number[], offset: number): number {
    let low = 0
    let high = starts.length - 1
    while (low < high) {
        const middle = (low + high + 1) >> 1
        if (starts[middle] <= offset) {
            low = middle
        } else {
            high = middle - 1
        }
    }
    return low
}

/** 全文偏移 → 1-based 行 / 列 */
function toLineColumn(starts: number[], offset: number): { line: number; column: number } {
    const lineIndex = findLineIndex(starts, offset)
    return {
        line: lineIndex + 1,
        column: offset - starts[lineIndex] + 1
    }
}

/* ==================== 文本统计小工具 ==================== */

/** 是否 CJK 汉字（BMP 基础区 + 扩展 A + 兼容区；不含假名/谚文，避免影响中英混排判定） */
function isCjkChar(char: string | undefined): boolean {
    if (char === undefined || char.length === 0) {
        return false
    }
    const code = char.charCodeAt(0)
    return (
        (code >= 0x3400 && code <= 0x4dbf) ||
        (code >= 0x4e00 && code <= 0x9fff) ||
        (code >= 0xf900 && code <= 0xfaff)
    )
}

/** 是否 ASCII 数字 */
function isAsciiDigit(char: string | undefined): boolean {
    return char !== undefined && char >= '0' && char <= '9'
}

/** 统计文本中的汉字数 */
function countCjkChars(text: string): number {
    let count = 0
    for (let index = 0; index < text.length; index++) {
        if (isCjkChar(text[index])) {
            count += 1
        }
    }
    return count
}

/** 统计文本中的英文单词数（连续字母/数字/撇号视为一个词，与常见字数统计口径一致） */
const ENGLISH_WORD_RE = /[A-Za-z][A-Za-z0-9'-]*/g

function countEnglishWords(text: string): number {
    const matched = text.match(ENGLISH_WORD_RE)
    return matched === null ? 0 : matched.length
}

/** 段落「可见字数」= 汉字数 + 英文词数（中文 500 字 / 英文 500 词口径一致） */
function countProseUnits(text: string): number {
    return countCjkChars(text) + countEnglishWords(text)
}

/** 压缩空白并截断为列表展示用片段 */
function compactExcerpt(text: string, limit = 80): string {
    const collapsed = text.replace(/\s+/g, ' ').trim()
    if (collapsed.length <= limit) {
        return collapsed
    }
    return `${collapsed.slice(0, limit - 1)}…`
}

/** 取指定行附近的原文片段（长行以 column 为中心截取） */
function buildLineExcerpt(sourceLines: string[], lineIndex: number, column: number): string {
    const line = sourceLines[lineIndex]
    if (line === undefined) {
        return ''
    }
    if (line.length <= 120) {
        return compactExcerpt(line)
    }
    const from = Math.max(0, column - 1 - 30)
    const raw = line.slice(from, from + 120)
    const prefix = from > 0 ? '…' : ''
    return `${prefix}${compactExcerpt(raw)}`
}

/* ==================== 问题构造 ==================== */

/** 问题种子（由规则实现填充，severity / messageKey 默认从规则元数据取） */
interface IssueSeed {
    ruleId: WritingStyleRuleId
    line: number
    column: number
    excerpt: string
    messageKey?: string
    messageParams?: Record<string, string | number>
}

/** 构造问题对象（补默认 severity / messageKey） */
function createIssue(seed: IssueSeed): WritingStyleIssue {
    const definition = RULE_DEFINITION_MAP.get(seed.ruleId)
    return {
        ruleId: seed.ruleId,
        line: seed.line,
        column: seed.column,
        messageKey: seed.messageKey ?? definition?.messageKey ?? '',
        severity: definition?.severity ?? 'warning',
        excerpt: seed.excerpt,
        ...(seed.messageParams === undefined ? {} : { messageParams: seed.messageParams })
    }
}

/** 问题排序：行号 → 列号 → 规则 id（保证 UI 列表稳定） */
function compareIssues(left: WritingStyleIssue, right: WritingStyleIssue): number {
    if (left.line !== right.line) {
        return left.line - right.line
    }
    if (left.column !== right.column) {
        return left.column - right.column
    }
    return left.ruleId.localeCompare(right.ruleId)
}

/* ==================== 检查上下文 ==================== */

/** 单次检查的只读上下文（规则实现共享） */
interface CheckContext {
    sourceLines: string[]
    maskedLines: string[]
    maskedText: string
    lineStarts: number[]
    kinds: WritingStyleLineKind[]
    options: ResolvedWritingStyleOptions
}

/** 参与「正文类」规则（长句 / 标点 / 混排）的行类型（表格行剔除，避免管道符噪音） */
const TEXT_LINE_KINDS: ReadonlySet<WritingStyleLineKind> = new Set(['prose', 'heading', 'list'])

/** 连续正文行块（长句 / 超长段落按块统计；标题 / 列表 / 表格等结构行会打断块） */
function collectProseBlocks(kinds: WritingStyleLineKind[]): number[][] {
    const blocks: number[][] = []
    let current: number[] = []
    const flush = (): void => {
        if (current.length > 0) {
            blocks.push(current)
            current = []
        }
    }
    for (let index = 0; index < kinds.length; index++) {
        if (kinds[index] === 'prose') {
            current.push(index)
        } else {
            flush()
        }
    }
    flush()
    return blocks
}

/** 正文块拼接结果（行间以单空格拼接，偏移映射到原始行） */
interface CombinedProseBlock {
    lines: number[]
    maskedText: string
    sourceText: string
    /** 每行在拼接文本中的起始偏移 */
    lineOffsets: number[]
}

/** 拼接正文块（掩码文本与原文文本等长，偏移可直接复用） */
function combineProseBlock(block: number[], context: CheckContext): CombinedProseBlock {
    const maskedParts: string[] = []
    const sourceParts: string[] = []
    const lineOffsets = new Array<number>(block.length)
    let offset = 0
    for (let index = 0; index < block.length; index++) {
        const lineIndex = block[index]
        lineOffsets[index] = offset
        maskedParts.push(context.maskedLines[lineIndex])
        sourceParts.push(context.sourceLines[lineIndex])
        offset += context.maskedLines[lineIndex].length + 1
    }
    return {
        lines: block,
        maskedText: maskedParts.join(' '),
        sourceText: sourceParts.join(' '),
        lineOffsets
    }
}

/** 拼接块内偏移 → 原文 1-based 行列 */
function blockOffsetToLineColumn(
    combined: CombinedProseBlock,
    offset: number
): {
    line: number
    column: number
} {
    const lineOffsets = combined.lineOffsets
    let low = 0
    let high = lineOffsets.length - 1
    while (low < high) {
        const middle = (low + high + 1) >> 1
        if (lineOffsets[middle] <= offset) {
            low = middle
        } else {
            high = middle - 1
        }
    }
    return {
        line: combined.lines[low] + 1,
        column: offset - lineOffsets[low] + 1
    }
}

/* ==================== 规则：长句 ==================== */

/** 中文句末标点（句号 / 叹号 / 问号 / 省略号）；分号不拆句，避免长句漏报 */
const CJK_SENTENCE_END: ReadonlySet<string> = new Set(['。', '！', '？', '…'])

/** 拆分句段（返回块内偏移区间；英文 `. ! ?` 仅在后续为空白 / 汉字 / 行尾时断句，并排除小数） */
function splitSentenceRanges(text: string): Array<{ start: number; end: number }> {
    const ranges: Array<{ start: number; end: number }> = []
    let start = 0
    for (let index = 0; index < text.length; index++) {
        const char = text[index]
        let boundary = CJK_SENTENCE_END.has(char)
        if (!boundary && (char === '.' || char === '!' || char === '?')) {
            const previous = index > 0 ? text[index - 1] : undefined
            const next = index + 1 < text.length ? text[index + 1] : undefined
            const nextIsBoundary = next === undefined || next === ' ' || isCjkChar(next)
            const isDecimal = char === '.' && isAsciiDigit(previous) && isAsciiDigit(next)
            boundary = nextIsBoundary && !isDecimal
        }
        if (boundary) {
            ranges.push({ start, end: index })
            start = index + 1
        }
    }
    if (start < text.length) {
        ranges.push({ start, end: text.length })
    }
    return ranges
}

/** 长句：中文 > 60 字 / 英文 > 35 词（同一句只提示一次，汉字优先） */
function checkLongSentences(context: CheckContext): WritingStyleIssue[] {
    const issues: WritingStyleIssue[] = []
    const limit = context.options.thresholds.maxIssuesPerRule
    const cjkLimit = context.options.thresholds.longSentenceCjkChars
    const wordsLimit = context.options.thresholds.longSentenceEnglishWords
    for (const block of collectProseBlocks(context.kinds)) {
        if (issues.length >= limit) {
            break
        }
        const combined = combineProseBlock(block, context)
        for (const range of splitSentenceRanges(combined.maskedText)) {
            if (issues.length >= limit) {
                break
            }
            const segment = combined.maskedText.slice(range.start, range.end)
            const cjkCount = countCjkChars(segment)
            const wordCount = countEnglishWords(segment)
            const isCjkLong = cjkCount > cjkLimit
            const isWordsLong = wordCount > wordsLimit
            if (!isCjkLong && !isWordsLong) {
                continue
            }
            const location = blockOffsetToLineColumn(combined, range.start)
            const excerpt = compactExcerpt(combined.sourceText.slice(range.start, range.end))
            if (isCjkLong) {
                issues.push(
                    createIssue({
                        ruleId: 'long-sentence',
                        line: location.line,
                        column: location.column,
                        excerpt,
                        messageKey: WRITING_STYLE_ISSUE_MESSAGE_KEYS.longSentence,
                        messageParams: { count: cjkCount, limit: cjkLimit }
                    })
                )
            } else {
                issues.push(
                    createIssue({
                        ruleId: 'long-sentence',
                        line: location.line,
                        column: location.column,
                        excerpt,
                        messageKey: WRITING_STYLE_ISSUE_MESSAGE_KEYS.longSentenceWords,
                        messageParams: { count: wordCount, limit: wordsLimit }
                    })
                )
            }
        }
    }
    return issues
}

/* ==================== 规则：重复词 ==================== */

/** 中文单字叠写的常见合法词（避免把「看看 / 慢慢 / 哈哈」等正常写法当成重复错误） */
const REDUPLICATION_ALLOWLIST: ReadonlySet<string> = new Set([
    '看看',
    '试试',
    '说说',
    '想想',
    '听听',
    '走走',
    '坐坐',
    '问问',
    '找找',
    '谈谈',
    '聊聊',
    '等等',
    '谢谢',
    '妈妈',
    '爸爸',
    '哥哥',
    '姐姐',
    '弟弟',
    '妹妹',
    '爷爷',
    '奶奶',
    '姥姥',
    '叔叔',
    '阿姨',
    '宝宝',
    '星星',
    '刚刚',
    '慢慢',
    '好好',
    '天天',
    '年年',
    '人人',
    '处处',
    '时时',
    '常常',
    '往往',
    '渐渐',
    '悄悄',
    '偷偷',
    '深深',
    '远远',
    '高高',
    '大大',
    '小小',
    '多多',
    '一一',
    '个个',
    '次次',
    '件件',
    '条条',
    '种种',
    '哈哈',
    '呵呵',
    '嘿嘿',
    '嘻嘻',
    '呜呜',
    '啊啊',
    '嗯嗯',
    '哦哦',
    '啦啦',
    '哇哇',
    '拜拜',
    '么么',
    '萌萌'
])

/** 重复词候选（start/end 为掩码文本偏移） */
interface RepeatedWordCandidate {
    start: number
    end: number
    word: string
    /** 报告位置：取重复出现的后一处，便于直接定位到冗余文本 */
    reportOffset: number
}

/** 收集中文相邻重复（2~6 字词整体重复） */
const CJK_REPEATED_WORD_RE = /([\u4e00-\u9fff]{2,6})\1+/g
/** 收集中文词被空格 / 制表符重复（如「重要 重要」） */
const CJK_REPEATED_WORD_SPACED_RE = /([\u4e00-\u9fff]{2,6})[ \t]+\1/g
/** 收集中文单字叠写 */
const CJK_DOUBLED_CHAR_RE = /([\u4e00-\u9fff])\1/g
/** 收集英文相邻重复单词（忽略大小写；跨空格/制表符） */
const EN_REPEATED_WORD_RE = /\b([A-Za-z]{2,})[ \t]+\1\b/gi

function collectRepeatedWordCandidates(maskedText: string): RepeatedWordCandidate[] {
    const candidates: RepeatedWordCandidate[] = []
    CJK_REPEATED_WORD_RE.lastIndex = 0
    let match = CJK_REPEATED_WORD_RE.exec(maskedText)
    while (match !== null) {
        const word = match[1]
        if (!REDUPLICATION_ALLOWLIST.has(word)) {
            candidates.push({
                start: match.index,
                end: match.index + match[0].length,
                word,
                reportOffset: match.index + word.length
            })
        }
        match = CJK_REPEATED_WORD_RE.exec(maskedText)
    }
    CJK_REPEATED_WORD_SPACED_RE.lastIndex = 0
    match = CJK_REPEATED_WORD_SPACED_RE.exec(maskedText)
    while (match !== null) {
        const word = match[1]
        if (!REDUPLICATION_ALLOWLIST.has(word)) {
            candidates.push({
                start: match.index,
                end: match.index + match[0].length,
                word,
                reportOffset: match.index + match[0].length - word.length
            })
        }
        match = CJK_REPEATED_WORD_SPACED_RE.exec(maskedText)
    }
    CJK_DOUBLED_CHAR_RE.lastIndex = 0
    match = CJK_DOUBLED_CHAR_RE.exec(maskedText)
    while (match !== null) {
        const word = match[0]
        if (!REDUPLICATION_ALLOWLIST.has(word)) {
            candidates.push({
                start: match.index,
                end: match.index + match[0].length,
                word,
                reportOffset: match.index + 1
            })
        }
        match = CJK_DOUBLED_CHAR_RE.exec(maskedText)
    }
    EN_REPEATED_WORD_RE.lastIndex = 0
    match = EN_REPEATED_WORD_RE.exec(maskedText)
    while (match !== null) {
        const word = match[1]
        candidates.push({
            start: match.index,
            end: match.index + match[0].length,
            word,
            reportOffset: match.index + match[0].length - word.length
        })
        match = EN_REPEATED_WORD_RE.exec(maskedText)
    }
    return candidates
}

/** 重复词：中文相邻重复 / 单字叠写、英文相邻重复（按位置去重，重叠项只报一次） */
function checkRepeatedWords(context: CheckContext): WritingStyleIssue[] {
    const candidates = collectRepeatedWordCandidates(context.maskedText).sort(
        (left, right) => left.start - right.start || right.end - left.end
    )
    const issues: WritingStyleIssue[] = []
    const limit = context.options.thresholds.maxIssuesPerRule
    let lastEnd = -1
    for (const candidate of candidates) {
        if (issues.length >= limit) {
            break
        }
        if (candidate.start < lastEnd) {
            continue
        }
        lastEnd = candidate.end
        const location = toLineColumn(context.lineStarts, candidate.reportOffset)
        issues.push(
            createIssue({
                ruleId: 'repeated-word',
                line: location.line,
                column: location.column,
                excerpt: buildLineExcerpt(context.sourceLines, location.line - 1, location.column),
                messageParams: { word: candidate.word }
            })
        )
    }
    return issues
}

/* ==================== 规则：填充词 / 高频口头禅 ==================== */

/** 是否 ASCII 英文字母（英文词表匹配用于判定词边界） */
function isAsciiLetter(char: string | undefined): boolean {
    if (char === undefined) {
        return false
    }
    const code = char.charCodeAt(0)
    return (code >= 65 && code <= 90) || (code >= 97 && code <= 122)
}

/** 判定「整词」匹配：前后字符都不是英文字母（数字/连字符/下划线不参与，避免过度宽松） */
function isWholeEnglishWord(lowerText: string, index: number, length: number): boolean {
    return !isAsciiLetter(lowerText[index - 1]) && !isAsciiLetter(lowerText[index + length])
}

/** 词表匹配（中文子串匹配；英文整词匹配且忽略大小写），返回命中偏移列表 */
function findWordOffsets(
    lowerText: string,
    words: readonly string[],
    limit: number
): Array<{ word: string; offset: number }> {
    const hits: Array<{ word: string; offset: number }> = []
    if (hits.length >= limit) {
        return hits
    }
    for (const word of words) {
        const needle = word.toLowerCase()
        if (needle.length === 0) {
            continue
        }
        const asciiWord = isAsciiLetter(needle[0])
        let from = 0
        while (hits.length < limit) {
            const offset = lowerText.indexOf(needle, from)
            if (offset < 0) {
                break
            }
            if (!asciiWord || isWholeEnglishWord(lowerText, offset, needle.length)) {
                hits.push({ word, offset })
            }
            from = offset + needle.length
        }
        if (hits.length >= limit) {
            break
        }
    }
    return hits.sort((left, right) => left.offset - right.offset)
}

/** 填充词 / 弱化词：可配置词表，命中即提示（info 级，只提示不修改） */
function checkFillerWords(context: CheckContext): WritingStyleIssue[] {
    const limit = context.options.thresholds.maxIssuesPerRule
    const hits = findWordOffsets(
        context.maskedText.toLowerCase(),
        context.options.fillerWords,
        limit
    )
    const issues: WritingStyleIssue[] = []
    for (const hit of hits) {
        const location = toLineColumn(context.lineStarts, hit.offset)
        issues.push(
            createIssue({
                ruleId: 'filler-word',
                line: location.line,
                column: location.column,
                excerpt: buildLineExcerpt(context.sourceLines, location.line - 1, location.column),
                messageParams: { word: hit.word }
            })
        )
    }
    return issues
}

/**
 * 高频口头禅：可配置词表，全文出现次数达到阈值时在首次出现处提示一次。
 * 与填充词表重叠的词直接跳过（避免同一处文本被两条规则重复报告）。
 */
function checkFrequentCatchphrases(context: CheckContext): WritingStyleIssue[] {
    const fillerKeys = new Set(context.options.fillerWords.map((word) => word.toLowerCase()))
    const limit = context.options.thresholds.maxIssuesPerRule
    const lowerText = context.maskedText.toLowerCase()
    const issues: WritingStyleIssue[] = []
    const minCount = context.options.thresholds.catchphraseMinCount
    for (const phrase of context.options.catchphrases) {
        if (issues.length >= limit) {
            break
        }
        const needle = phrase.toLowerCase()
        if (needle.length === 0 || fillerKeys.has(needle)) {
            continue
        }
        const asciiWord = isAsciiLetter(needle[0])
        let firstOffset = -1
        let count = 0
        let from = 0
        while (true) {
            const offset = lowerText.indexOf(needle, from)
            if (offset < 0) {
                break
            }
            if (!asciiWord || isWholeEnglishWord(lowerText, offset, needle.length)) {
                if (firstOffset < 0) {
                    firstOffset = offset
                }
                count += 1
            }
            from = offset + needle.length
        }
        if (count < minCount || firstOffset < 0) {
            continue
        }
        const location = toLineColumn(context.lineStarts, firstOffset)
        issues.push(
            createIssue({
                ruleId: 'frequent-catchphrase',
                line: location.line,
                column: location.column,
                excerpt: buildLineExcerpt(context.sourceLines, location.line - 1, location.column),
                messageParams: { phrase, count, limit: minCount }
            })
        )
    }
    return issues
}

/* ==================== 规则：连续标点 ==================== */

/** 连续标点候选字符（省略号 . / … 允许单独成串，豁免为正常省略号） */
const PUNCTUATION_RUN_CHARS: ReadonlySet<string> = new Set([
    '，',
    '。',
    '！',
    '？',
    '；',
    '：',
    '、',
    '…',
    ',',
    '.',
    '!',
    '?',
    ';',
    ':'
])

/** 连续标点：同一行连续出现 ≥2 个标点（省略号豁免；纯结构行如 --- / ::: 跳过） */
function checkConsecutivePunctuation(context: CheckContext): WritingStyleIssue[] {
    const limit = context.options.thresholds.maxIssuesPerRule
    const issues: WritingStyleIssue[] = []
    for (let lineIndex = 0; lineIndex < context.maskedLines.length; lineIndex++) {
        if (issues.length >= limit) {
            break
        }
        if (!TEXT_LINE_KINDS.has(context.kinds[lineIndex])) {
            continue
        }
        const line = context.maskedLines[lineIndex]
        if (line.trim() === '') {
            continue
        }
        // Markdown 容器语法 `::: tip` 的前导冒号不算连续标点
        const containerMatch = /^ {0,3}:{3,}/.exec(line)
        const skipUntil = containerMatch === null ? 0 : containerMatch[0].length
        let index = 0
        while (index < line.length) {
            if (index < skipUntil || !PUNCTUATION_RUN_CHARS.has(line[index])) {
                index += 1
                continue
            }
            const runStart = index
            while (index < line.length && PUNCTUATION_RUN_CHARS.has(line[index])) {
                index += 1
            }
            const run = line.slice(runStart, index)
            if (run.length < 2) {
                continue
            }
            // 省略号（... / …… / ……）整体豁免
            let ellipsisOnly = true
            for (const char of run) {
                if (char !== '.' && char !== '…') {
                    ellipsisOnly = false
                    break
                }
            }
            if (ellipsisOnly) {
                continue
            }
            issues.push(
                createIssue({
                    ruleId: 'consecutive-punctuation',
                    line: lineIndex + 1,
                    column: runStart + 1,
                    excerpt: buildLineExcerpt(context.sourceLines, lineIndex, runStart + 1),
                    messageParams: { punctuation: run.slice(0, 8) }
                })
            )
        }
    }
    return issues
}

/* ==================== 规则：超长段落 ==================== */

/** 超长段落：连续正文行的「可见字数」合计超过阈值（空行 / 结构行打断段落） */
function checkLongParagraphs(context: CheckContext): WritingStyleIssue[] {
    const limit = context.options.thresholds.maxIssuesPerRule
    const threshold = context.options.thresholds.longParagraphChars
    const issues: WritingStyleIssue[] = []
    for (const block of collectProseBlocks(context.kinds)) {
        if (issues.length >= limit) {
            break
        }
        let count = 0
        for (const lineIndex of block) {
            count += countProseUnits(context.maskedLines[lineIndex])
        }
        if (count <= threshold) {
            continue
        }
        const firstLine = block[0]
        issues.push(
            createIssue({
                ruleId: 'long-paragraph',
                line: firstLine + 1,
                column: 1,
                excerpt: compactExcerpt(context.sourceLines[firstLine]),
                messageParams: { count, limit: threshold }
            })
        )
    }
    return issues
}

/* ==================== 规则：中英混排缺少空格 ==================== */

/** 汉字（含扩展 A / 兼容区）后紧跟英文字母 */
const CJK_THEN_LATIN_RE = /([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])([A-Za-z])/g
/** 英文字母后紧跟汉字 */
const LATIN_THEN_CJK_RE = /([A-Za-z])([\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])/g

/** 中英混排缺少空格（仅提示；数字、全角字母不参与，避免误报） */
function checkMixedScriptSpacing(context: CheckContext): WritingStyleIssue[] {
    const limit = context.options.thresholds.maxIssuesPerRule
    const issues: WritingStyleIssue[] = []
    const patterns = [CJK_THEN_LATIN_RE, LATIN_THEN_CJK_RE]
    for (const pattern of patterns) {
        pattern.lastIndex = 0
        let match = pattern.exec(context.maskedText)
        while (match !== null) {
            if (issues.length >= limit) {
                return issues
            }
            const offset = match.index + 1
            const location = toLineColumn(context.lineStarts, offset)
            issues.push(
                createIssue({
                    ruleId: 'mixed-script-spacing',
                    line: location.line,
                    column: location.column,
                    excerpt: buildLineExcerpt(
                        context.sourceLines,
                        location.line - 1,
                        location.column
                    ),
                    messageParams: { before: match[1], after: match[2] }
                })
            )
            match = pattern.exec(context.maskedText)
        }
    }
    return issues
}

/* ==================== 规则：全半角标点混用 ==================== */

/** 标点宽度类别：全角字符 / 半角字符 / 文案展示用首个字符 */
interface PunctuationWidthCategory {
    id: string
    fullChars: readonly string[]
    halfChars: readonly string[]
    /** 文案参数中的展示字符 */
    displayFull: string
    displayHalf: string
}

/** 参与全半角混用检测的标点类别（括号按成对字符统计；引号歧义大，不检测） */
const PUNCTUATION_WIDTH_CATEGORIES: readonly PunctuationWidthCategory[] = [
    { id: 'comma', fullChars: ['，'], halfChars: [','], displayFull: '，', displayHalf: ',' },
    { id: 'period', fullChars: ['。'], halfChars: ['.'], displayFull: '。', displayHalf: '.' },
    { id: 'colon', fullChars: ['：'], halfChars: [':'], displayFull: '：', displayHalf: ':' },
    { id: 'semicolon', fullChars: ['；'], halfChars: [';'], displayFull: '；', displayHalf: ';' },
    { id: 'question', fullChars: ['？'], halfChars: ['?'], displayFull: '？', displayHalf: '?' },
    { id: 'exclamation', fullChars: ['！'], halfChars: ['!'], displayFull: '！', displayHalf: '!' },
    {
        id: 'paren',
        fullChars: ['（', '）'],
        halfChars: ['(', ')'],
        displayFull: '（）',
        displayHalf: '()'
    }
]

/** 全角标点 → 类别 id */
const FULL_WIDTH_PUNCTUATION_CATEGORY = new Map<string, string>()
/** 半角标点 → 类别 id */
const HALF_WIDTH_PUNCTUATION_CATEGORY = new Map<string, string>()
/** 全角 / 半角字符 → 类别（构建一次，检查时 O(1) 查表） */
const PUNCTUATION_WIDTH_CATEGORY_BY_ID = new Map<string, PunctuationWidthCategory>()
for (const category of PUNCTUATION_WIDTH_CATEGORIES) {
    PUNCTUATION_WIDTH_CATEGORY_BY_ID.set(category.id, category)
    for (const char of category.fullChars) {
        FULL_WIDTH_PUNCTUATION_CATEGORY.set(char, category.id)
    }
    for (const char of category.halfChars) {
        HALF_WIDTH_PUNCTUATION_CATEGORY.set(char, category.id)
    }
}

/** 半角标点是否处于「中文语境」（左右任一侧是汉字；小数 / 省略号点号额外排除） */
function isHalfWidthPunctuationInCjkContext(
    line: string,
    index: number,
    categoryId: string
): boolean {
    const previous = index > 0 ? line[index - 1] : undefined
    const next = index + 1 < line.length ? line[index + 1] : undefined
    if (categoryId === 'period') {
        // 小数点 / 版本号 / 省略号：不作为「半角句号」参与混用统计
        if (isAsciiDigit(previous) && isAsciiDigit(next)) {
            return false
        }
        if (previous === '.' || next === '.') {
            return false
        }
    }
    if (categoryId === 'paren') {
        // 左括号看右侧、右括号看左侧，避免把英文括号后的英文句点误计入
        return isCjkChar(previous) || isCjkChar(next)
    }
    return isCjkChar(previous) || isCjkChar(next)
}

/** 全半角标点混用：同类标点同时出现全角与「用于中文语境的半角」时提示（每类一条，info 级） */
function checkPunctuationWidthMix(context: CheckContext): WritingStyleIssue[] {
    const fullCounts = new Map<string, number>()
    const halfContextCounts = new Map<string, number>()
    const firstHalfOccurrences = new Map<string, { line: number; column: number }>()
    for (let lineIndex = 0; lineIndex < context.maskedLines.length; lineIndex++) {
        if (!TEXT_LINE_KINDS.has(context.kinds[lineIndex])) {
            continue
        }
        const line = context.maskedLines[lineIndex]
        for (let index = 0; index < line.length; index++) {
            const char = line[index]
            const fullCategory = FULL_WIDTH_PUNCTUATION_CATEGORY.get(char)
            if (fullCategory !== undefined) {
                fullCounts.set(fullCategory, (fullCounts.get(fullCategory) ?? 0) + 1)
                continue
            }
            const halfCategory = HALF_WIDTH_PUNCTUATION_CATEGORY.get(char)
            if (halfCategory === undefined) {
                continue
            }
            if (!isHalfWidthPunctuationInCjkContext(line, index, halfCategory)) {
                continue
            }
            halfContextCounts.set(halfCategory, (halfContextCounts.get(halfCategory) ?? 0) + 1)
            if (!firstHalfOccurrences.has(halfCategory)) {
                firstHalfOccurrences.set(halfCategory, { line: lineIndex + 1, column: index + 1 })
            }
        }
    }
    const issues: WritingStyleIssue[] = []
    const limit = context.options.thresholds.maxIssuesPerRule
    for (const category of PUNCTUATION_WIDTH_CATEGORIES) {
        if (issues.length >= limit) {
            break
        }
        const fullCount = fullCounts.get(category.id) ?? 0
        const halfCount = halfContextCounts.get(category.id) ?? 0
        if (fullCount === 0 || halfCount === 0) {
            continue
        }
        const occurrence = firstHalfOccurrences.get(category.id)
        if (occurrence === undefined) {
            continue
        }
        issues.push(
            createIssue({
                ruleId: 'punctuation-width-mix',
                line: occurrence.line,
                column: occurrence.column,
                excerpt: buildLineExcerpt(
                    context.sourceLines,
                    occurrence.line - 1,
                    occurrence.column
                ),
                messageParams: {
                    full: category.displayFull,
                    half: category.displayHalf,
                    count: halfCount
                }
            })
        )
    }
    return issues
}

/* ==================== 对外入口 ==================== */

/** 各规则实现（顺序与 WRITING_STYLE_RULES 一致） */
const RULE_HANDLERS: ReadonlyArray<{
    id: WritingStyleRuleId
    run: (context: CheckContext) => WritingStyleIssue[]
}> = [
    { id: 'long-sentence', run: checkLongSentences },
    { id: 'repeated-word', run: checkRepeatedWords },
    { id: 'frequent-catchphrase', run: checkFrequentCatchphrases },
    { id: 'filler-word', run: checkFillerWords },
    { id: 'consecutive-punctuation', run: checkConsecutivePunctuation },
    { id: 'long-paragraph', run: checkLongParagraphs },
    { id: 'mixed-script-spacing', run: checkMixedScriptSpacing },
    { id: 'punctuation-width-mix', run: checkPunctuationWidthMix }
]

/** 按规则上限裁剪（排序后逐条计数；每个规则最多保留 maxIssuesPerRule 条） */
function applyIssueLimit(
    issues: WritingStyleIssue[],
    maxIssuesPerRule: number
): WritingStyleIssue[] {
    const counts = new Map<WritingStyleRuleId, number>()
    const result: WritingStyleIssue[] = []
    for (const issue of issues) {
        const count = counts.get(issue.ruleId) ?? 0
        if (count >= maxIssuesPerRule) {
            continue
        }
        counts.set(issue.ruleId, count + 1)
        result.push(issue)
    }
    return result
}

/**
 * 检查 Markdown 文本，返回按「行 → 列 → 规则」排序的问题列表。
 *
 * - 空文本 / 非字符串 / 超过 `WRITING_STYLE_MAX_INPUT_CHARS` 返回空数组；
 * - 所有规则均为「只提示不修改」，函数无副作用（可安全重复调用）；
 * - 选项见 {@link WritingStyleCheckOptions}（规则开关 / 阈值 / 词表）。
 */
export function checkWritingStyle(
    markdown: string,
    options?: WritingStyleCheckOptions
): WritingStyleIssue[] {
    if (typeof markdown !== 'string' || markdown.length === 0) {
        return []
    }
    if (markdown.length > WRITING_STYLE_MAX_INPUT_CHARS) {
        return []
    }
    const resolvedOptions = resolveWritingStyleOptions(options)
    const masked = maskWritingStyleContent(markdown)
    // 整篇剔除后无可见文本（纯代码 / 空白文档）直接返回
    if (masked.maskedText.replace(/\s/g, '').length === 0) {
        return []
    }
    const context: CheckContext = {
        sourceLines: masked.sourceLines,
        maskedLines: masked.maskedLines,
        maskedText: masked.maskedText,
        lineStarts: computeLineStarts(masked.sourceLines),
        kinds: classifyLines(masked.sourceLines, masked.blockedLines),
        options: resolvedOptions
    }
    const issues: WritingStyleIssue[] = []
    for (const handler of RULE_HANDLERS) {
        if (!resolvedOptions.rules[handler.id]) {
            continue
        }
        issues.push(...handler.run(context))
    }
    issues.sort(compareIssues)
    return applyIssueLimit(issues, resolvedOptions.thresholds.maxIssuesPerRule)
}

/**
 * 汇总问题（总数 / warning / info / 按规则统计 / 是否可能被截断）。
 * 规则统计按 WRITING_STYLE_RULES 声明顺序排列（UI 规则开关列表顺序稳定）。
 */
export function summarizeWritingStyleIssues(
    issues: WritingStyleIssue[],
    options?: WritingStyleCheckOptions
): WritingStyleSummary {
    const maxIssuesPerRule =
        options?.thresholds?.maxIssuesPerRule ?? DEFAULT_WRITING_STYLE_THRESHOLDS.maxIssuesPerRule
    const counts = new Map<WritingStyleRuleId, number>()
    let warnings = 0
    let infos = 0
    for (const issue of issues) {
        counts.set(issue.ruleId, (counts.get(issue.ruleId) ?? 0) + 1)
        if (issue.severity === 'warning') {
            warnings += 1
        } else {
            infos += 1
        }
    }
    const ruleStats: WritingStyleRuleStat[] = []
    let truncated = false
    for (const rule of WRITING_STYLE_RULES) {
        const count = counts.get(rule.id) ?? 0
        if (count >= maxIssuesPerRule) {
            truncated = true
        }
        if (count === 0) {
            continue
        }
        ruleStats.push({ ruleId: rule.id, severity: rule.severity, count })
    }
    return {
        total: issues.length,
        warnings,
        infos,
        ruleStats,
        truncated
    }
}
