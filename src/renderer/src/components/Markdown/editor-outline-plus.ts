/**
 * A10 大纲增强（opt-in，开关 `outlinePlus`，默认关闭）纯函数实现。
 *
 * 与 MarkdownMonacoEditor.vue 既有「仅 ATX 正则」大纲的关系：
 * - 开关关闭：组件继续使用原有 ATX 扫描实现与样式（行为逐字不变）；
 * - 开关开启：改用本模块，额外支持 setext 标题（`===` / `---` 下划线）、代码围栏内
 *   标题排除、层级缩进归一化、过滤与条数/扫描行数上限。
 *
 * 设计约束：不依赖 Monaco / Vue / DOM；数据通过 `OutlinePlusSource` 注入（行号 1 基），
 * 便于单测与后续替换数据源。
 */

/** 大纲数据源（组件侧由 Monaco model 适配，测试直接由字符串数组适配） */
export interface OutlinePlusSource {
    lineCount: number
    getLineContent(lineNumber: number): string
}

/** 大纲条目：`indent` 为相对最浅标题的层级缩进（0 基），供 UI 计算 padding */
export interface OutlinePlusItem {
    line: number
    level: number
    text: string
    indent: number
}

/** 扫描上限：控制大文档下打开大纲的耗时与 DOM 体量 */
export interface OutlinePlusLimits {
    /** 最多扫描行数 */
    maxScanLines: number
    /** 最多输出条目数 */
    maxItems: number
    /** 参与标题识别的行最大长度（超长行不可能是标题，跳过以保护扫描性能） */
    maxLineLength: number
}

/** 默认上限（与既有 ATX 大纲的 100000 行扫描上限保持一致） */
export const OUTLINE_PLUS_DEFAULT_LIMITS: Readonly<OutlinePlusLimits> = {
    maxScanLines: 100000,
    maxItems: 2000,
    maxLineLength: 512
}

/** ATX 标题：行首最多 3 个空格 + 1~6 个 # + 至少一个空白 */
const ATX_HEADING_PATTERN = /^(\s{0,3})(#{1,6})(?:[ \t]+)(.*)$/
/** ATX 标题末尾闭合 #（如 `## 标题 ##`） */
const ATX_CLOSING_HASHES_PATTERN = /#+\s*$/
/** setext 下划线：最多 3 个前导空格 + 全为 `=`（一级）或 `-`（二级） */
const SETEXT_UNDERLINE_PATTERN = /^ {0,3}(=+|-+)[ \t]*$/
/** 代码围栏开启行：``` 或 ~~~ 至少 3 个 */
const FENCE_OPEN_PATTERN = /^ {0,3}(`{3,}|~{3,})/
/** setext 标题的上一行不能是这些块级结构（标题/列表/引用/围栏/分隔线/缩进代码） */
const SETEXT_TITLE_EXCLUDE_PATTERN =
    /^ {0,3}(?:#{1,6}[ \t]|[-*+][ \t]|\d+[.)][ \t]|>|`{3,}|~{3,}|=+|(?:-[ \t]*){3,}$)/
/** 缩进 4 空格及以上视为缩进代码块，不能作为 setext 标题文本 */
const INDENTED_CODE_PATTERN = /^ {4,}/

/** 是否为 setext 下划线上方的合法标题文本行 */
function isSetextTitleLine(lineText: string): boolean {
    const candidate = lineText.trimEnd()
    if (!candidate.trim()) {
        return false
    }
    if (INDENTED_CODE_PATTERN.test(candidate)) {
        return false
    }
    // 上一行本身是标题/列表/引用/围栏/分隔线时，下划线属于该结构而非 setext
    return !SETEXT_TITLE_EXCLUDE_PATTERN.test(candidate)
}

/** 层级缩进归一化：相对最浅标题的层数（0 基） */
export function computeOutlineIndent(level: number, minLevel: number): number {
    return Math.max(0, level - minLevel)
}

/** 标题文本收尾处理：去掉 ATX 闭合 #；空标题回退占位文案 */
function normalizeHeadingText(rawText: string, emptyTitle: string): string {
    const text = rawText.replace(ATX_CLOSING_HASHES_PATTERN, '').trim()
    return text || emptyTitle
}

/**
 * 提取增强大纲。
 *
 * 规则：
 * 1. ATX 标题（同原实现，含末尾闭合 # 清理、空标题回退）；
 * 2. setext 标题：`标题行` 紧跟 `===`（一级）或 `---`（二级）下划线；
 * 3. 代码围栏（``` / ~~~）内的 `#`、下划线不识别为标题；
 * 4. 超过 `maxScanLines` / `maxItems` / `maxLineLength` 的部分忽略。
 */
export function extractOutlinePlus(
    source: OutlinePlusSource,
    emptyTitle: string,
    limits: OutlinePlusLimits = OUTLINE_PLUS_DEFAULT_LIMITS
): OutlinePlusItem[] {
    const rawItems: Array<{ line: number; level: number; text: string }> = []
    const scanEnd = Math.min(source.lineCount, limits.maxScanLines)
    let fence: { char: string; minLength: number } | null = null

    for (let line = 1; line <= scanEnd; line++) {
        const lineText = source.getLineContent(line)
        if (lineText.length > limits.maxLineLength) {
            continue
        }

        const fenceMatch = lineText.match(FENCE_OPEN_PATTERN)
        if (fence) {
            // 围栏内：只关心闭合行（同字符且长度不少于开启标记）
            if (
                fenceMatch &&
                fenceMatch[1][0] === fence.char &&
                fenceMatch[1].length >= fence.minLength &&
                /^\s*[`~]+\s*$/.test(lineText)
            ) {
                fence = null
            }
            continue
        }
        if (fenceMatch) {
            fence = { char: fenceMatch[1][0], minLength: fenceMatch[1].length }
            continue
        }

        // 1) setext：当前行是下划线，且上一行是可作为标题的段落文本
        const setextMatch = lineText.match(SETEXT_UNDERLINE_PATTERN)
        if (setextMatch && line > 1) {
            const previousLine = source.getLineContent(line - 1)
            if (previousLine.length <= limits.maxLineLength && isSetextTitleLine(previousLine)) {
                rawItems.push({
                    line: line - 1,
                    level: setextMatch[1][0] === '=' ? 1 : 2,
                    text: normalizeHeadingText(previousLine, emptyTitle)
                })
                if (rawItems.length >= limits.maxItems) {
                    break
                }
                continue
            }
        }

        // 2) ATX
        const atxMatch = lineText.match(ATX_HEADING_PATTERN)
        if (atxMatch) {
            rawItems.push({
                line,
                level: atxMatch[2].length,
                text: normalizeHeadingText(atxMatch[3], emptyTitle)
            })
            if (rawItems.length >= limits.maxItems) {
                break
            }
        }
    }

    if (rawItems.length === 0) {
        return []
    }
    const minLevel = rawItems.reduce((min, item) => Math.min(min, item.level), rawItems[0].level)
    return rawItems.map((item) => ({
        ...item,
        indent: computeOutlineIndent(item.level, minLevel)
    }))
}

/** 按标题文本过滤（大小写不敏感；空查询返回全部，保持原条目顺序） */
export function filterOutlineItems<T extends { text: string }>(
    items: readonly T[],
    query: string
): T[] {
    const needle = query.trim().toLowerCase()
    if (!needle) {
        return items.slice()
    }
    return items.filter((item) => item.text.toLowerCase().includes(needle))
}
