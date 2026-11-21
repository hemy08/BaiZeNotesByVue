/**
 * Markdown lint / 自动格式化（A4，纯函数；opt-in：`flags.markdownLint`）
 *
 * 定位：不引入 markdownlint 依赖，实现任务要求的规则子集 + 安全自动修复。
 * 本模块只做「文本 → 问题列表」「文本 → 格式化文本」的纯计算，不依赖 Vue/DOM/i18n；
 * 对话框层负责调用编辑器事件应用结果、展示 i18n 文案。
 *
 * 规则子集（规则 id 尽量沿用 markdownlint 命名，便于用户认知）：
 * - MD001 heading-increment：标题层级跳跃（H2 直接跳到 H4），**不自动修复**；
 * - MD009 trailing-spaces：行尾空格（围栏代码块内部除外，避免破坏代码示例）；
 * - MD012 multiple-blanks：连续多个空行（最多允许 1 个空行）；
 * - MD022 blanks-around-headings：标题前后空行；
 * - MD031 blanks-around-fences：代码围栏前后空行；
 * - MD032 blanks-around-lists：列表前后空行（仅顶层列表，嵌套列表保持原样）；
 * - MD040 fenced-code-language：代码围栏缺少语言标识；
 * - MD056 table-column-count：表格列数与表头不一致；
 * - MDT001 table-separator：表格分隔行格式不正确（自定义 id，markdownlint 无对应规则）。
 *
 * 自动修复的安全边界（formatMarkdown）：
 * - 只修：行尾空格、连续空行折叠、标题/围栏/列表前后空行、裸围栏补 `text` 语言；
 * - 不修：标题层级（MD001）、表格列数/分隔行（MD056/MDT001）—— 会改变文档语义/结构；
 * - 不进入：YAML front matter（首个 `---` 到闭合 `---`）整体原样保留；
 * - 不修改：代码围栏内部内容（含行尾空格与空行）—— 代码示例必须逐字保留；
 * - 不做行内字符级改写、不调整列表编号缩进、不重排表格。
 * 因此 `formatMarkdown(formatMarkdown(x)) === formatMarkdown(x)`（幂等，见单测）。
 *
 * 已知简化（MVP 边界，后续可扩展）：
 * - 标题只识别 ATX 形式（`# 标题`），setext（下划线式）按普通段落处理；
 * - 表格按 `|` 简单切分，不处理转义管道 `\|` 与 HTML 表格；
 * - 围栏仅识别 ≤3 空格缩进；缩进围栏（列表内）不参与空行修复且 lint 只提示语言缺失；
 * - 单文件输入上限 `MARKDOWN_LINT_MAX_INPUT_CHARS`（512K 字符），超限由调用方跳过检查。
 */

/** 单次检查允许的最大字符数（对话框据此对大文档降级提示；避免超大文档阻塞 UI） */
export const MARKDOWN_LINT_MAX_INPUT_CHARS = 512 * 1024

/** 问题严重级别（error 更醒目；warning 为风格问题） */
export type MarkdownLintSeverity = 'error' | 'warning'

/** 规则 id（沿用 markdownlint 命名；MDT001 为自定义表格规则） */
export type MarkdownLintRuleId =
    'MD001' | 'MD009' | 'MD012' | 'MD022' | 'MD031' | 'MD032' | 'MD040' | 'MD056' | 'MDT001'

/** 可自动修复项的类型（formatMarkdown 按这些类型做安全修复） */
export type MarkdownLintFixKind =
    | 'trailing-spaces'
    | 'multiple-blanks'
    | 'blanks-around-headings'
    | 'blanks-around-fences'
    | 'blanks-around-lists'
    | 'fenced-code-language'

/** 问题附带的修复信息（存在即表示该问题可被「一键格式化」安全修复） */
export interface MarkdownLintFix {
    kind: MarkdownLintFixKind
}

/** 单条 lint 问题 */
export interface MarkdownLintIssue {
    ruleId: MarkdownLintRuleId
    /** 行号（1-based） */
    line: number
    /** 列号（1-based；多数规则为 1，行尾空格为第一个多余空格位置） */
    column: number
    /** 中文兜底文案（词典缺失时展示；含已替换的占位符） */
    message: string
    severity: MarkdownLintSeverity
    /** 可安全自动修复时的修复类型（不可修复为 undefined） */
    fix?: MarkdownLintFix
    /** 词典插值参数（与建议 i18n 键配合；由对话框 t() 时传入） */
    messageParams?: Record<string, string | number>
}

/** 规则元数据（对话框规则统计/修复标记使用） */
export interface MarkdownLintRuleDefinition {
    id: MarkdownLintRuleId
    severity: MarkdownLintSeverity
    /** 是否可被 formatMarkdown 自动修复 */
    fixable: boolean
}

/** 规则定义表（顺序即统计展示顺序；新增规则必须同步此处与文档） */
export const MARKDOWN_LINT_RULES: readonly MarkdownLintRuleDefinition[] = [
    { id: 'MD001', severity: 'warning', fixable: false },
    { id: 'MD009', severity: 'warning', fixable: true },
    { id: 'MD012', severity: 'warning', fixable: true },
    { id: 'MD022', severity: 'warning', fixable: true },
    { id: 'MD031', severity: 'warning', fixable: true },
    { id: 'MD032', severity: 'warning', fixable: true },
    { id: 'MD040', severity: 'error', fixable: true },
    { id: 'MD056', severity: 'warning', fixable: false },
    { id: 'MDT001', severity: 'warning', fixable: false }
] as const

/**
 * 规则文案建议 i18n 键（主控补 `editorUi.markdownLint.rules.*` 词典；
 * 未补时对话框回退 issue.message 中文兜底，界面仍可用）。
 * 动态键常量表（I18N-07）：规则 id → 文案键一一对应，禁止散落拼 key。
 */
export const MARKDOWN_LINT_RULE_MESSAGE_KEYS: Readonly<Record<MarkdownLintRuleId, string>> = {
    MD001: 'editorUi.markdownLint.rules.headingIncrement',
    MD009: 'editorUi.markdownLint.rules.trailingSpaces',
    MD012: 'editorUi.markdownLint.rules.multipleBlanks',
    MD022: 'editorUi.markdownLint.rules.blanksAroundHeadings',
    MD031: 'editorUi.markdownLint.rules.blanksAroundFences',
    MD032: 'editorUi.markdownLint.rules.blanksAroundLists',
    MD040: 'editorUi.markdownLint.rules.fencedCodeLanguage',
    MD056: 'editorUi.markdownLint.rules.tableColumnCount',
    MDT001: 'editorUi.markdownLint.rules.tableSeparator'
}

/** 规则 → 元数据 */
const RULE_DEFINITION_MAP = new Map<MarkdownLintRuleId, MarkdownLintRuleDefinition>(
    MARKDOWN_LINT_RULES.map((rule) => [rule.id, rule])
)

/** 规则统计项 */
export interface MarkdownLintRuleStat {
    ruleId: MarkdownLintRuleId
    severity: MarkdownLintSeverity
    count: number
}

/** 问题汇总（对话框统计区展示） */
export interface MarkdownLintSummary {
    total: number
    errors: number
    warnings: number
    /** 可被「一键格式化」修复的问题数 */
    fixable: number
    ruleStats: MarkdownLintRuleStat[]
}

/* ==================== 文本结构分析（lint / format 共用） ==================== */

/** 代码围栏块（openLine 为开围栏行 0-based 索引） */
interface FenceBlock {
    openLine: number
    /** 闭合围栏行索引；null = 文档结尾仍未闭合 */
    closeLine: number | null
    /** 开围栏 info string（语言标识，可能为空） */
    info: string
    /** 围栏标记（``` 或 ~~~，长度 ≥3） */
    marker: string
    /** 开围栏缩进空格数（>0 视为嵌套，不做空行修复） */
    indent: number
}

/** 文档结构分析结果 */
interface MarkdownStructure {
    /** front matter 最后一行索引（含）；-1 = 无 front matter */
    frontMatterEnd: number
    fences: FenceBlock[]
    /** 每行所属围栏块索引（-1 = 不在围栏内；围栏开/闭行都算围栏内） */
    fenceOwner: number[]
}

/** 按行拆分文本（保留原始换行风格；`\r\n` 与 `\n` 混用时以 `\r\n` 为主） */
function splitMarkdownLines(markdown: string): { lines: string[]; eol: string } {
    if (markdown.length === 0) {
        return { lines: [], eol: '\n' }
    }
    const eol = markdown.includes('\r\n') ? '\r\n' : '\n'
    return { lines: markdown.split(/\r?\n/), eol }
}

/** 识别 YAML front matter（文本首行 `---`，到闭合 `---`/`...` 为止；未闭合视为无） */
function findFrontMatterEnd(lines: string[]): number {
    if (lines.length === 0 || lines[0].trim() !== '---') {
        return -1
    }
    for (let index = 1; index < lines.length; index++) {
        const trimmed = lines[index].trim()
        if (trimmed === '---' || trimmed === '...') {
            return index
        }
    }
    return -1
}

/** 开围栏识别：≤3 空格缩进 + 连续 ≥3 个 ` 或 ~（反引号围栏 info 不允许再出现反引号） */
const FENCE_OPEN_RE = /^( {0,3})(`{3,}|~{3,})(.*)$/
/** 闭围栏识别：≤3 空格缩进 + 与开围栏同字符且长度不短于开围栏，行尾仅允许空白 */
const FENCE_CLOSE_RE = /^( {0,3})(`{3,}|~{3,})[ \t]*$/

/** 扫描围栏块（从 startLine 开始；未闭合围栏持续到文档结尾） */
function scanFenceBlocks(lines: string[], startLine: number): FenceBlock[] {
    const blocks: FenceBlock[] = []
    let index = Math.max(0, startLine)
    while (index < lines.length) {
        const openMatch = FENCE_OPEN_RE.exec(lines[index])
        if (openMatch === null) {
            index += 1
            continue
        }
        const marker = openMatch[2]
        const markerChar = marker[0]
        const info = openMatch[3].trim()
        // CommonMark：反引号围栏的 info string 不允许包含反引号（避免把行内代码误判为围栏）
        if (markerChar === '`' && info.includes('`')) {
            index += 1
            continue
        }
        const block: FenceBlock = {
            openLine: index,
            closeLine: null,
            info,
            marker,
            indent: openMatch[1].length
        }
        let cursor = index + 1
        while (cursor < lines.length) {
            const closeMatch = FENCE_CLOSE_RE.exec(lines[cursor])
            if (
                closeMatch !== null &&
                closeMatch[2][0] === markerChar &&
                closeMatch[2].length >= marker.length
            ) {
                block.closeLine = cursor
                break
            }
            cursor += 1
        }
        blocks.push(block)
        index = block.closeLine === null ? lines.length : block.closeLine + 1
    }
    return blocks
}

/** 结构分析（lint / format 各阶段重新调用，保证插入空行后索引仍准确） */
function analyzeMarkdownStructure(lines: string[]): MarkdownStructure {
    const frontMatterEnd = findFrontMatterEnd(lines)
    const fences = scanFenceBlocks(lines, frontMatterEnd + 1)
    const fenceOwner = new Array<number>(lines.length).fill(-1)
    for (let blockIndex = 0; blockIndex < fences.length; blockIndex++) {
        const block = fences[blockIndex]
        const endLine = block.closeLine ?? lines.length - 1
        for (let line = block.openLine; line <= endLine; line++) {
            fenceOwner[line] = blockIndex
        }
    }
    return { frontMatterEnd, fences, fenceOwner }
}

/** 该行是否不参与普通规则（front matter 或围栏代码块内） */
function isBlockedLine(structure: MarkdownStructure, lineIndex: number): boolean {
    return lineIndex <= structure.frontMatterEnd || structure.fenceOwner[lineIndex] >= 0
}

/** ATX 标题识别（≤3 空格缩进 + 1~6 个 # + 空白/行尾；`#标题` 无空白不是标题，与 markdown-it 一致） */
function isHeadingLine(line: string): { level: number } | null {
    // ATX 标题：≤3 空格缩进 + 1~6 个 # + 空白/行尾（`#标题` 无空白不是标题，与 markdown-it 一致）
    const match = /^( {0,3})(#{1,6})(?:[ \t]|$)/.exec(line)
    if (match === null) {
        return null
    }
    return { level: match[2].length }
}

/** 顶层列表项识别（≤3 空格缩进 + 无序标记/数字序号） */
const LIST_ITEM_RE = /^( {0,3})(?:[-*+]|\d{1,9}[.)])(?:[ \t]|$)/

/** 缩进续行（列表项的续行/嵌套子列表；≥2 空格或 tab 开头且非空行） */
const LIST_CONTINUATION_RE = /^(?: {2,}|\t)/

/** 切分表格行单元格（去掉首尾管道，简单按 `|` 切分；不处理转义管道） */
function splitTableCells(line: string): string[] {
    let trimmed = line.trim()
    if (trimmed.startsWith('|')) {
        trimmed = trimmed.slice(1)
    }
    if (trimmed.endsWith('|')) {
        trimmed = trimmed.slice(0, -1)
    }
    if (trimmed.length === 0) {
        return []
    }
    return trimmed.split('|').map((cell) => cell.trim())
}

/** 表格分隔行单元格格式：`---` / `:--` / `--:` / `:-:`（至少 1 个连字符） */
const TABLE_SEPARATOR_CELL_RE = /^:?-+:?$/

/* ==================== 问题构造 ==================== */

interface IssueSeed {
    ruleId: MarkdownLintRuleId
    line: number
    column: number
    message: string
    messageParams?: Record<string, string | number>
    fix?: MarkdownLintFix
}

/** 按规则元数据补 severity 并构造问题对象 */
function createIssue(seed: IssueSeed): MarkdownLintIssue {
    const rule = RULE_DEFINITION_MAP.get(seed.ruleId)
    return {
        ruleId: seed.ruleId,
        line: seed.line,
        column: seed.column,
        message: seed.message,
        severity: rule?.severity ?? 'warning',
        ...(seed.fix === undefined ? {} : { fix: seed.fix }),
        ...(seed.messageParams === undefined ? {} : { messageParams: seed.messageParams })
    }
}

/** 问题排序：行号 → 列号 → 规则 id（保证 UI 列表稳定） */
function compareIssues(left: MarkdownLintIssue, right: MarkdownLintIssue): number {
    if (left.line !== right.line) {
        return left.line - right.line
    }
    if (left.column !== right.column) {
        return left.column - right.column
    }
    return left.ruleId.localeCompare(right.ruleId)
}

/* ==================== 各规则实现 ==================== */

/** MD009：行尾空格（围栏代码块/front matter 内跳过） */
function lintTrailingSpaces(lines: string[], structure: MarkdownStructure): MarkdownLintIssue[] {
    const issues: MarkdownLintIssue[] = []
    for (let index = 0; index < lines.length; index++) {
        if (isBlockedLine(structure, index)) {
            continue
        }
        const line = lines[index]
        const match = /[ \t]+$/.exec(line)
        if (match === null) {
            continue
        }
        issues.push(
            createIssue({
                ruleId: 'MD009',
                line: index + 1,
                column: line.length - match[0].length + 1,
                message: '行尾存在多余空格',
                fix: { kind: 'trailing-spaces' }
            })
        )
    }
    return issues
}

/** MD012：连续多个空行（第 2 个起逐行报；blank 行含仅空白行） */
function lintMultipleBlanks(lines: string[], structure: MarkdownStructure): MarkdownLintIssue[] {
    const issues: MarkdownLintIssue[] = []
    let runStart = -1
    let runLength = 0
    const flushRun = (): void => {
        if (runLength > 1) {
            for (let extra = runStart + 1; extra < runStart + runLength; extra++) {
                issues.push(
                    createIssue({
                        ruleId: 'MD012',
                        line: extra + 1,
                        column: 1,
                        message: '存在连续多个空行（最多允许 1 个空行）',
                        fix: { kind: 'multiple-blanks' }
                    })
                )
            }
        }
        runStart = -1
        runLength = 0
    }
    for (let index = 0; index < lines.length; index++) {
        const isBlank = !isBlockedLine(structure, index) && lines[index].trim() === ''
        if (isBlank) {
            if (runLength === 0) {
                runStart = index
            }
            runLength += 1
            continue
        }
        flushRun()
    }
    flushRun()
    return issues
}

/** 收集 ATX 标题行（跳过 front matter / 围栏内） */
function collectHeadings(
    lines: string[],
    structure: MarkdownStructure
): Array<{ lineIndex: number; level: number }> {
    const headings: Array<{ lineIndex: number; level: number }> = []
    for (let index = 0; index < lines.length; index++) {
        if (isBlockedLine(structure, index)) {
            continue
        }
        const heading = isHeadingLine(lines[index])
        if (heading !== null) {
            headings.push({ lineIndex: index, level: heading.level })
        }
    }
    return headings
}

/** MD001：标题层级跳跃（不修复） */
function lintHeadingIncrement(
    headings: Array<{ lineIndex: number; level: number }>
): MarkdownLintIssue[] {
    const issues: MarkdownLintIssue[] = []
    let previousLevel = 0
    for (const heading of headings) {
        if (previousLevel > 0 && heading.level > previousLevel + 1) {
            issues.push(
                createIssue({
                    ruleId: 'MD001',
                    line: heading.lineIndex + 1,
                    column: 1,
                    message: `标题层级跳跃：H${previousLevel} → H${heading.level}（标题应逐级递增）`,
                    messageParams: { previous: previousLevel, current: heading.level }
                })
            )
        }
        previousLevel = heading.level
    }
    return issues
}

/** MD022：标题前后空行（首行前 / 末行后不要求） */
function lintBlanksAroundHeadings(
    lines: string[],
    headings: Array<{ lineIndex: number; level: number }>
): MarkdownLintIssue[] {
    const issues: MarkdownLintIssue[] = []
    for (const heading of headings) {
        const beforeMissing = heading.lineIndex > 0 && lines[heading.lineIndex - 1].trim() !== ''
        const afterMissing =
            heading.lineIndex < lines.length - 1 && lines[heading.lineIndex + 1].trim() !== ''
        if (!beforeMissing && !afterMissing) {
            continue
        }
        issues.push(
            createIssue({
                ruleId: 'MD022',
                line: heading.lineIndex + 1,
                column: 1,
                message: '标题前后需要空行',
                fix: { kind: 'blanks-around-headings' }
            })
        )
    }
    return issues
}

/** MD031/MD040：代码围栏前后空行 / 缺少语言标识 */
function lintFences(lines: string[], structure: MarkdownStructure): MarkdownLintIssue[] {
    const issues: MarkdownLintIssue[] = []
    for (const block of structure.fences) {
        // MD040：缺少语言标识（嵌套围栏同样提示；补 `text` 为安全修复）
        if (block.info.length === 0) {
            issues.push(
                createIssue({
                    ruleId: 'MD040',
                    line: block.openLine + 1,
                    column: 1,
                    message: '代码围栏缺少语言标识',
                    fix: { kind: 'fenced-code-language' }
                })
            )
        }
        // 缩进围栏（列表内）不做空行要求：插空行会改变列表归属，属于不安全修复
        if (block.indent > 0) {
            continue
        }
        const beforeMissing = block.openLine > 0 && lines[block.openLine - 1].trim() !== ''
        const afterMissing =
            block.closeLine !== null &&
            block.closeLine < lines.length - 1 &&
            lines[block.closeLine + 1].trim() !== ''
        if (!beforeMissing && !afterMissing) {
            continue
        }
        issues.push(
            createIssue({
                ruleId: 'MD031',
                line: block.openLine + 1,
                column: 1,
                message: '代码围栏前后需要空行',
                fix: { kind: 'blanks-around-fences' }
            })
        )
    }
    return issues
}

/** 顶层列表块（start/end 均为 0-based 行索引，含块内缩进续行） */
interface TopLevelListBlock {
    start: number
    end: number
}

/** 扫描顶层列表块（列表内部的空行/缩进续行视为同一块；非列表非缩进内容结束块） */
function scanTopLevelListBlocks(
    lines: string[],
    structure: MarkdownStructure
): TopLevelListBlock[] {
    const blocks: TopLevelListBlock[] = []
    let current: TopLevelListBlock | null = null
    const closeCurrent = (): void => {
        if (current !== null) {
            blocks.push(current)
            current = null
        }
    }
    for (let index = 0; index < lines.length; index++) {
        // front matter 整体不属于任何列表
        if (index <= structure.frontMatterEnd) {
            closeCurrent()
            continue
        }
        const fenceOwner = structure.fenceOwner[index]
        if (fenceOwner >= 0) {
            // 缩进围栏（列表项内的 fenced code）是列表的续行，不应中断列表块；
            // 顶层围栏（缩进 0）才视为列表结束。
            const fence = structure.fences[fenceOwner]
            if (fence.indent > 0 && current !== null) {
                current.end = index
            } else {
                closeCurrent()
            }
            continue
        }
        const line = lines[index]
        const isBlank = line.trim() === ''
        const isItem = LIST_ITEM_RE.test(line)
        const isContinuation = !isBlank && LIST_CONTINUATION_RE.test(line)
        if (current === null) {
            if (isItem) {
                current = { start: index, end: index }
            }
            continue
        }
        if (isItem || isContinuation) {
            current.end = index
        } else if (!isBlank) {
            closeCurrent()
        }
    }
    closeCurrent()
    return blocks
}

/** MD032：列表前后空行（仅顶层列表；嵌套列表不报，避免误伤列表内部结构） */
function lintBlanksAroundLists(lines: string[], structure: MarkdownStructure): MarkdownLintIssue[] {
    const issues: MarkdownLintIssue[] = []
    for (const block of scanTopLevelListBlocks(lines, structure)) {
        const beforeMissing = block.start > 0 && lines[block.start - 1].trim() !== ''
        const afterMissing = block.end < lines.length - 1 && lines[block.end + 1].trim() !== ''
        if (!beforeMissing && !afterMissing) {
            continue
        }
        issues.push(
            createIssue({
                ruleId: 'MD032',
                line: block.start + 1,
                column: 1,
                message: '列表前后需要空行',
                fix: { kind: 'blanks-around-lists' }
            })
        )
    }
    return issues
}

/** 表头行是否呈现表格形态（首尾管道或至少 2 个管道；避免把普通含管道段落误判为表格） */
function looksLikeTableHeaderLine(line: string): boolean {
    const trimmed = line.trim()
    if (trimmed.startsWith('|') || trimmed.endsWith('|')) {
        return true
    }
    return (trimmed.match(/\|/g) ?? []).length >= 2
}

/** MD056/MDT001：表格分隔行格式与列数一致性（不修复，避免改坏表格结构） */
function lintTables(lines: string[], structure: MarkdownStructure): MarkdownLintIssue[] {
    const issues: MarkdownLintIssue[] = []
    let index = 0
    while (index < lines.length) {
        // 表格头行必须不在围栏/front matter 内，且下一行也可见、包含管道
        if (
            isBlockedLine(structure, index) ||
            index + 1 >= lines.length ||
            isBlockedLine(structure, index + 1) ||
            !lines[index].includes('|') ||
            !lines[index + 1].includes('|') ||
            !looksLikeTableHeaderLine(lines[index])
        ) {
            index += 1
            continue
        }
        const headerCells = splitTableCells(lines[index])
        const separatorCells = splitTableCells(lines[index + 1])
        const separatorHasDash = separatorCells.some((cell) => cell.includes('-'))
        const separatorOnlySeparatorChars = separatorCells.every((cell) => /^[\s:-]*$/.test(cell))
        if (headerCells.length === 0 || separatorCells.length === 0 || !separatorHasDash) {
            index += 1
            continue
        }
        if (separatorCells.length === headerCells.length) {
            // 列数一致：按分隔行规则校验。非法单元格（如 `x`）仍视为「分隔行写错」——
            // 前提是表头明确是表格形态且列数一致，避免把普通段落当成表格误报。
            const separatorValid = separatorCells.every((cell) =>
                TABLE_SEPARATOR_CELL_RE.test(cell)
            )
            if (!separatorValid) {
                issues.push(
                    createIssue({
                        ruleId: 'MDT001',
                        line: index + 2,
                        column: 1,
                        message: '表格分隔行格式不正确（每列应为 --- / :-- / --: / :-:）'
                    })
                )
                index += 2
                continue
            }
        } else if (separatorOnlySeparatorChars) {
            // 列数不一致但形态是分隔行 → 列数问题（提示修正分隔行）
            issues.push(
                createIssue({
                    ruleId: 'MD056',
                    line: index + 2,
                    column: 1,
                    message: `表格列数与表头不一致（表头 ${headerCells.length} 列，分隔行 ${separatorCells.length} 列）`,
                    messageParams: {
                        expected: headerCells.length,
                        actual: separatorCells.length
                    }
                })
            )
            index += 2
            continue
        } else {
            index += 1
            continue
        }
        // 跳过表格主体行（连续包含管道且非空的行），逐行校验列数
        let row = index + 2
        while (
            row < lines.length &&
            !isBlockedLine(structure, row) &&
            lines[row].trim() !== '' &&
            lines[row].includes('|')
        ) {
            const rowCells = splitTableCells(lines[row])
            if (rowCells.length !== headerCells.length) {
                issues.push(
                    createIssue({
                        ruleId: 'MD056',
                        line: row + 1,
                        column: 1,
                        message: `表格列数与表头不一致（表头 ${headerCells.length} 列，本行 ${rowCells.length} 列）`,
                        messageParams: {
                            expected: headerCells.length,
                            actual: rowCells.length
                        }
                    })
                )
            }
            row += 1
        }
        index = row
    }
    return issues
}

/* ==================== 对外：lint ==================== */

/**
 * 检查 Markdown 文本，返回按「行 → 列 → 规则」排序的问题列表。
 * 空文本返回空数组；输入超过 `MARKDOWN_LINT_MAX_INPUT_CHARS` 时同样返回空数组，
 * 由调用方（对话框）根据长度预先展示「文档过大，已跳过检查」的提示。
 */
export function lintMarkdown(markdown: string): MarkdownLintIssue[] {
    if (markdown.length === 0 || markdown.length > MARKDOWN_LINT_MAX_INPUT_CHARS) {
        return []
    }
    const { lines } = splitMarkdownLines(markdown)
    const structure = analyzeMarkdownStructure(lines)
    const headings = collectHeadings(lines, structure)
    const issues: MarkdownLintIssue[] = [
        ...lintTrailingSpaces(lines, structure),
        ...lintMultipleBlanks(lines, structure),
        ...lintHeadingIncrement(headings),
        ...lintBlanksAroundHeadings(lines, headings),
        ...lintFences(lines, structure),
        ...lintBlanksAroundLists(lines, structure),
        ...lintTables(lines, structure)
    ]
    return issues.sort(compareIssues)
}

/** 汇总问题（总数/错误/警告/可修复数 + 按规则统计，规则统计按数量降序） */
export function summarizeMarkdownLint(issues: MarkdownLintIssue[]): MarkdownLintSummary {
    const counts = new Map<MarkdownLintRuleId, number>()
    let errors = 0
    let warnings = 0
    let fixable = 0
    for (const issue of issues) {
        counts.set(issue.ruleId, (counts.get(issue.ruleId) ?? 0) + 1)
        if (issue.severity === 'error') {
            errors += 1
        } else {
            warnings += 1
        }
        if (issue.fix !== undefined) {
            fixable += 1
        }
    }
    const ruleStats: MarkdownLintRuleStat[] = []
    for (const rule of MARKDOWN_LINT_RULES) {
        const count = counts.get(rule.id) ?? 0
        if (count > 0) {
            ruleStats.push({ ruleId: rule.id, severity: rule.severity, count })
        }
    }
    ruleStats.sort(
        (left, right) => right.count - left.count || left.ruleId.localeCompare(right.ruleId)
    )
    return {
        total: issues.length,
        errors,
        warnings,
        fixable,
        ruleStats
    }
}

/* ==================== 对外：格式化（安全自动修复） ==================== */

/** 第一遍：去除行尾空格（跳过 front matter 与围栏代码块内部——代码示例必须逐字保留） */
function trimTrailingWhitespacePass(lines: string[]): string[] {
    const structure = analyzeMarkdownStructure(lines)
    return lines.map((line, index) =>
        isBlockedLine(structure, index) ? line : line.replace(/[ \t]+$/, '')
    )
}

/** 第二遍：折叠连续空行（front matter / 围栏内不处理） */
function collapseBlankLinesPass(lines: string[]): string[] {
    const structure = analyzeMarkdownStructure(lines)
    const result: string[] = []
    let previousBlank = false
    for (let index = 0; index < lines.length; index++) {
        if (isBlockedLine(structure, index)) {
            result.push(lines[index])
            previousBlank = lines[index].trim() === ''
            continue
        }
        const isBlank = lines[index].trim() === ''
        if (isBlank) {
            if (!previousBlank) {
                result.push('')
            }
            previousBlank = true
            continue
        }
        result.push(lines[index])
        previousBlank = false
    }
    return result
}

/** 第三遍：代码围栏前后补空行（缩进围栏/列表内围栏跳过，避免改变列表归属） */
function ensureBlankAroundFencesPass(lines: string[]): string[] {
    const structure = analyzeMarkdownStructure(lines)
    for (let blockIndex = structure.fences.length - 1; blockIndex >= 0; blockIndex--) {
        const block = structure.fences[blockIndex]
        if (block.indent > 0) {
            continue
        }
        if (block.closeLine !== null && block.closeLine < lines.length - 1) {
            if (lines[block.closeLine + 1].trim() !== '') {
                lines.splice(block.closeLine + 1, 0, '')
            }
        }
        if (block.openLine > 0 && lines[block.openLine - 1].trim() !== '') {
            lines.splice(block.openLine, 0, '')
        }
    }
    return lines
}

/** 第四遍：标题前后补空行（首行前/末行后不补） */
function ensureBlankAroundHeadingsPass(lines: string[]): string[] {
    const structure = analyzeMarkdownStructure(lines)
    const headingIndexes: number[] = []
    for (let index = 0; index < lines.length; index++) {
        if (!isBlockedLine(structure, index) && isHeadingLine(lines[index]) !== null) {
            headingIndexes.push(index)
        }
    }
    for (let cursor = headingIndexes.length - 1; cursor >= 0; cursor--) {
        const heading = headingIndexes[cursor]
        if (heading < lines.length - 1 && lines[heading + 1].trim() !== '') {
            lines.splice(heading + 1, 0, '')
        }
        if (heading > 0 && lines[heading - 1].trim() !== '') {
            lines.splice(heading, 0, '')
        }
    }
    return lines
}

/** 第五遍：顶层列表前后补空行（块内空行/缩进续行不受影响） */
function ensureBlankAroundListsPass(lines: string[]): string[] {
    const structure = analyzeMarkdownStructure(lines)
    // 重新扫描一次：本函数只补块边界空行，不改列表内部结构
    const blocks = scanTopLevelListBlocks(lines, structure)
    for (let cursor = blocks.length - 1; cursor >= 0; cursor--) {
        const block = blocks[cursor]
        if (block.end < lines.length - 1 && lines[block.end + 1].trim() !== '') {
            lines.splice(block.end + 1, 0, '')
        }
        if (block.start > 0 && lines[block.start - 1].trim() !== '') {
            lines.splice(block.start, 0, '')
        }
    }
    return lines
}

/** 第六遍：裸围栏（无语言标识）补 `text` 语言（只补开围栏行，不动代码内容） */
function addFenceLanguagePass(lines: string[]): string[] {
    const structure = analyzeMarkdownStructure(lines)
    for (const block of structure.fences) {
        if (block.info.length > 0) {
            continue
        }
        const openLine = lines[block.openLine]
        const match = /^( {0,3})(`{3,}|~{3,})[ \t]*$/.exec(openLine)
        if (match !== null) {
            lines[block.openLine] = `${match[1]}${match[2]}text`
        }
    }
    return lines
}

/**
 * 安全自动修复 Markdown 文本（幂等：对返回值再次格式化结果不变）。
 *
 * @param markdown 原文（保留原换行风格：含 `\r\n` 时按 `\r\n` 输出）
 * @returns 格式化后的文本；空文本原样返回
 */
export function formatMarkdown(markdown: string): string {
    if (markdown.length === 0) {
        return markdown
    }
    const { lines: originalLines, eol } = splitMarkdownLines(markdown)
    let lines = [...originalLines]
    lines = trimTrailingWhitespacePass(lines)
    lines = collapseBlankLinesPass(lines)
    lines = ensureBlankAroundFencesPass(lines)
    lines = ensureBlankAroundHeadingsPass(lines)
    lines = ensureBlankAroundListsPass(lines)
    lines = addFenceLanguagePass(lines)
    return lines.join(eol)
}
