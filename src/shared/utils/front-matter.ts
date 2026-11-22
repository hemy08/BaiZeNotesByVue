/**
 * Front matter（Markdown 文件头部 YAML 元数据块）解析 / 序列化纯函数。
 *
 * ## 职责边界
 * - 本模块属 `src/shared` 叶子层：不依赖 Node / Electron / Vue / DOM，也不做任何 IO；
 * - 只处理「文件开头由两行 `---` 包围的简单 YAML 元数据块」，不做完整 YAML 解析；
 * - 解析结果供主进程索引、渲染层编辑器等跨进程复用（API 已冻结，其他任务依赖）。
 *
 * ## 支持的 YAML 子集
 * - 标量：裸字符串、单引号 / 双引号字符串、数字、布尔（true / false，大小写不敏感）、
 *   null（`null` / `Null` / `~` / 空值）；
 * - 行内数组：`tags: [a, b, "c d"]`（允许尾随逗号）；
 * - 块数组：`tags:` 之后缩进的 `- item` 行（允许空行、注释与行尾注释）；
 * - 整行注释 `# ...` 与行尾注释（`#` 前必须是空白，引号内的 `#` 不算注释）；
 * - 键：裸键（`[A-Za-z0-9_]` 开头，可含 `.` / `-`）或单 / 双引号包裹的键。
 *
 * ## 已知不支持（明确降级，不强行解析）
 * - 嵌套块映射（`meta:` 下再缩进写 `child: x`）→ 该键整体跳过；
 * - 行内对象 / 流程映射（`meta: {a: 1}`）→ 该键整体跳过；
 * - 块数组中的映射项（`- name: x`）、嵌套数组（缩进不一致的 `-` 行）→ 该键整体跳过；
 * - 多行标量、锚点 / 别名 / 标签、块标量（`|` / `>`）、日期时间等隐式类型推断 → 不支持；
 * - 裸键只支持 ASCII 标识符，中文键需加引号（序列化时会自动加引号）；
 * - 无法解析的行静默跳过（不抛错），原文仍完整保留在 `raw` 中。
 *
 * ## BOM 与换行
 * - 仅识别「BOM 之后第一行」的 `---`；正文中的 `---` 不会被误判为 front matter；
 * - 支持 UTF-8 BOM 与 CRLF；BOM 不计入 `body`，`endOffset` 口径为「body 在原串中的起始下标」；
 * - 闭合定界符缺失时按「无 front matter」处理（`present: false`），正文逐字保留。
 */

/** UTF-8 BOM 字符 */
const BOM = '\uFEFF'

/** 开头定界符：`---`（允许行尾空白） */
const OPENING_DELIMITER_PATTERN = /^---[ \t]*$/

/** 闭合定界符：`---` 或 YAML 文档结束标记 `...`（允许行尾空白） */
const CLOSING_DELIMITER_PATTERN = /^(?:---|\.\.\.)[ \t]*$/

/** 数值字面量（YAML 1.2 core schema 的十进制 / 科学计数法子集） */
const NUMBER_PATTERN = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/

/** 布尔字面量（仅 true / false，大小写不敏感，对齐 YAML 1.2 core schema） */
const BOOLEAN_PATTERN = /^(?:true|false)$/i

/** null 字面量（含 YAML 的 `~`） */
const NULL_PATTERN = /^(?:null|~)$/i

/** 裸键：可原样写出的键名（其余键序列化时加引号） */
const SAFE_KEY_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*$/

/** 裸键解析（只匹配行首合法前缀，冒号另行校验） */
const PLAIN_KEY_PATTERN = /^[A-Za-z0-9_][A-Za-z0-9_.-]*/

/** 块数组行：`  - item`（破折号后必须是空白或行尾，避免把 `-abc` 误判为数组项） */
const BLOCK_ITEM_PATTERN = /^([ \t]*)-(?:[ \t]+(.*))?$/

/** 需要加引号的标量首字符（YAML 指示符） */
const QUOTE_LEADING_PATTERN = /^[-?:,[\]{}#&*!|>'"%@`]/

/** front matter 值中的标量类型（冻结 API） */
export type FrontMatterScalar = string | number | boolean | null

/** front matter 的单个值：标量或标量数组（不支持嵌套对象 / 嵌套数组） */
export type FrontMatterValue = FrontMatterScalar | FrontMatterScalar[]

/** front matter 解析结果（冻结 API） */
export interface ParsedFrontMatter {
    /** 文件开头是否存在完整 front matter 块（缺闭合定界符时为 false） */
    present: boolean
    /** 解析出的键值对（只含成功解析的简单标量 / 标量数组，复杂结构整键跳过） */
    data: Record<string, FrontMatterValue>
    /** 键在原文中的出现顺序（去重；重复键保留首次出现的位置） */
    keyOrder: string[]
    /** 正文：恒等于 `markdown.slice(endOffset)`（BOM 不计入） */
    body: string
    /** front matter 内部原文（不含 BOM 与两行定界符，保留内部换行风格） */
    raw: string
    /** 正文在原 markdown 中的起始下标（UTF-16 码元）；无 front matter 时为 BOM 长度 */
    endOffset: number
}

/** 单行源码（行内容不含行尾 `\n` / `\r\n`） */
interface SourceLine {
    /** 行内容（已去掉行尾换行符） */
    content: string
    /** 行首在文本中的偏移 */
    start: number
    /** 下一行行首在文本中的偏移；无换行符时等于文本长度 */
    next: number
}

/** `key: value` 行拆分结果 */
interface KeyValueSplit {
    /** 键名（已去引号） */
    key: string
    /** 冒号后的值文本（已 trim；空串表示空值，需要继续判断块数组） */
    valueText: string
}

/** 映射解析结果 */
interface MappingParseResult {
    /** 解析出的键值对 */
    data: Record<string, FrontMatterValue>
    /** 键出现顺序（去重） */
    keyOrder: string[]
}

/** 块数组解析结果 */
interface BlockArrayParseResult {
    /** 已解析的标量项 */
    items: FrontMatterScalar[]
    /** 是否至少出现一个数组项行 */
    hasItems: boolean
    /** 是否包含不支持的复杂结构（此时调用方应整键跳过） */
    unsupported: boolean
    /** 下一个待解析行首偏移 */
    nextCursor: number
}

/** 是否为空白字符（空格 / 制表符，YAML 行内分隔符） */
function isBlankCharacter(character: string): boolean {
    return character === ' ' || character === '\t'
}

/** 是否含控制字符（含换行 / 制表符）：这类字符串序列化时必须走双引号 JSON 转义 */
function containsControlCharacter(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index)
        if (code < 0x20 || code === 0x7f) {
            return true
        }
    }
    return false
}

/** 读取从 `start` 开始的一行（兼容 `\n` 与 `\r\n`） */
function readSourceLine(text: string, start: number): SourceLine {
    const lineFeedIndex = text.indexOf('\n', start)
    let contentEnd: number
    let next: number
    if (lineFeedIndex === -1) {
        contentEnd = text.length
        next = text.length
    } else {
        contentEnd = lineFeedIndex
        next = lineFeedIndex + 1
        if (contentEnd > start && text.charCodeAt(contentEnd - 1) === 13) {
            contentEnd -= 1
        }
    }
    return { content: text.slice(start, contentEnd), start, next }
}

/** 是否为开头定界符行（`---`，允许行尾空白） */
function isOpeningDelimiter(content: string): boolean {
    return OPENING_DELIMITER_PATTERN.test(content)
}

/** 是否为闭合定界符行（`---` 或 `...`，允许行尾空白） */
function isClosingDelimiter(content: string): boolean {
    return CLOSING_DELIMITER_PATTERN.test(content)
}

/**
 * 解析 markdown 文件头部的 front matter 块。
 *
 * 识别规则：BOM 之后第一行必须是 `---`，之后首次出现独立的 `---`（或 YAML 结束标记 `...`）
 * 行作为闭合；缺闭合时整体按「无 front matter」处理，`body` 逐字保留原文。
 *
 * @param markdown 原始 markdown 文本（可含 UTF-8 BOM 与 CRLF）
 * @returns 解析结果，其中 `body` 恒等于 `markdown.slice(endOffset)`（BOM 不计入 body）
 */
export function parseFrontMatter(markdown: string): ParsedFrontMatter {
    const bomLength = markdown.charCodeAt(0) === 0xfeff ? 1 : 0
    const absent: ParsedFrontMatter = {
        present: false,
        data: {},
        keyOrder: [],
        body: markdown.slice(bomLength),
        raw: '',
        endOffset: bomLength
    }
    if (bomLength >= markdown.length) {
        return absent
    }
    const openingLine = readSourceLine(markdown, bomLength)
    if (!isOpeningDelimiter(openingLine.content)) {
        return absent
    }
    if (openingLine.next >= markdown.length) {
        // 只有开头定界符、后面没有任何内容：不可能存在闭合定界符
        return absent
    }
    let cursor = openingLine.next
    let closingLine: SourceLine | null = null
    while (cursor < markdown.length) {
        const line = readSourceLine(markdown, cursor)
        if (isClosingDelimiter(line.content)) {
            closingLine = line
            break
        }
        cursor = line.next
    }
    if (!closingLine) {
        return absent
    }
    const raw = markdown.slice(openingLine.next, closingLine.start)
    const parsedMapping = parseMapping(raw)
    return {
        present: true,
        data: parsedMapping.data,
        keyOrder: parsedMapping.keyOrder,
        body: markdown.slice(closingLine.next),
        raw,
        endOffset: closingLine.next
    }
}

/**
 * 序列化 front matter 块（统一 LF 换行，输出形如 `---\n...\n---\n`）。
 *
 * 键顺序：先按 `keyOrder` 中实际存在于 `data` 的键输出，其余键按 `data` 自身顺序追加；
 * 空数据返回空字符串（表示没有 front matter 块）。
 *
 * @param data 键值对（值为标量或标量数组）
 * @param keyOrder 期望的键顺序（可省略；不存在的键会被忽略，重复项去重）
 * @returns 完整块文本（含两行定界符与结尾换行）；无字段时返回 `''`
 */
export function serializeFrontMatter(
    data: Record<string, FrontMatterValue>,
    keyOrder?: readonly string[]
): string {
    const keys = resolveOrderedKeys(data, keyOrder)
    if (keys.length === 0) {
        return ''
    }
    const lines: string[] = []
    for (const key of keys) {
        lines.push(...serializeEntry(key, data[key]))
    }
    return `---\n${lines.join('\n')}\n---\n`
}

/**
 * 覆盖写入 front matter（无块则插入，`data` 为空则移除）。
 *
 * 正文逐字保留；换行风格尽量沿用原文（原块 / 正文为 CRLF 时新块也用 CRLF），
 * UTF-8 BOM 会被保留在文件最开头。
 *
 * @param markdown 原始 markdown 文本
 * @param data 新的键值对
 * @param keyOrder 期望的键顺序（可省略）
 * @returns 更新后的完整 markdown 文本
 */
export function updateFrontMatter(
    markdown: string,
    data: Record<string, FrontMatterValue>,
    keyOrder?: readonly string[]
): string {
    const parsed = parseFrontMatter(markdown)
    const block = serializeFrontMatter(data, keyOrder)
    const bom = markdown.charAt(0) === BOM ? BOM : ''
    if (block === '') {
        return parsed.present ? bom + parsed.body : markdown
    }
    const lineEnding = detectLineEnding(markdown, parsed, bom.length)
    const normalizedBlock = lineEnding === '\n' ? block : block.replace(/\n/g, lineEnding)
    return bom + normalizedBlock + parsed.body
}

/**
 * 移除文件头部的 front matter 块（无块时逐字返回原文）。
 *
 * 正文与 UTF-8 BOM 原样保留。
 *
 * @param markdown 原始 markdown 文本
 * @returns 移除块后的 markdown 文本
 */
export function removeFrontMatter(markdown: string): string {
    const parsed = parseFrontMatter(markdown)
    if (!parsed.present) {
        return markdown
    }
    const bom = markdown.charAt(0) === BOM ? BOM : ''
    return bom + parsed.body
}

/** 解析 front matter 内部文本为键值映射（逐行状态机，复杂结构整键跳过） */
function parseMapping(raw: string): MappingParseResult {
    const data: Record<string, FrontMatterValue> = {}
    const keyOrder: string[] = []
    let cursor = 0
    while (cursor < raw.length) {
        const line = readSourceLine(raw, cursor)
        cursor = line.next
        const content = line.content
        if (content.trim() === '') {
            continue
        }
        if (content.trimStart().startsWith('#')) {
            continue
        }
        if (/^[ \t]/.test(content)) {
            // 不属于任何已识别结构的缩进行（续行 / 嵌套内容）：静默跳过
            continue
        }
        const keyValue = splitKeyValue(content)
        if (!keyValue) {
            continue
        }
        let value: FrontMatterValue
        if (keyValue.valueText === '') {
            const blockArray = readBlockArray(raw, cursor)
            cursor = blockArray.nextCursor
            if (blockArray.unsupported) {
                continue
            }
            value = blockArray.hasItems ? blockArray.items : null
        } else {
            const parsedValue = parseValueText(keyValue.valueText)
            if (!parsedValue) {
                continue
            }
            value = parsedValue.value
        }
        if (!Object.prototype.hasOwnProperty.call(data, keyValue.key)) {
            keyOrder.push(keyValue.key)
        }
        setDataValue(data, keyValue.key, value)
    }
    return { data, keyOrder }
}

/**
 * 写入解析结果。
 *
 * `__proto__` 用 defineProperty 写成普通自有属性，避免污染对象原型。
 */
function setDataValue(
    data: Record<string, FrontMatterValue>,
    key: string,
    value: FrontMatterValue
): void {
    if (key === '__proto__') {
        Object.defineProperty(data, key, {
            value,
            enumerable: true,
            configurable: true,
            writable: true
        })
        return
    }
    data[key] = value
}

/**
 * 拆分一行 `key: value`。
 *
 * 键支持裸键或引号包裹；YAML 要求冒号后紧跟空白或行尾，否则视为非法行（返回 null）。
 */
function splitKeyValue(content: string): KeyValueSplit | null {
    let key: string
    let colonIndex: number
    const firstCharacter = content.charAt(0)
    if (firstCharacter === '"' || firstCharacter === "'") {
        const quotedKey = readQuotedScalar(content, 0)
        if (!quotedKey) {
            return null
        }
        key = quotedKey.value
        colonIndex = quotedKey.end
        while (colonIndex < content.length && isBlankCharacter(content.charAt(colonIndex))) {
            colonIndex++
        }
    } else {
        const plainKey = PLAIN_KEY_PATTERN.exec(content)
        if (!plainKey) {
            return null
        }
        key = plainKey[0]
        colonIndex = key.length
        while (colonIndex < content.length && isBlankCharacter(content.charAt(colonIndex))) {
            colonIndex++
        }
    }
    if (content.charAt(colonIndex) !== ':') {
        return null
    }
    const rest = content.slice(colonIndex + 1)
    if (rest !== '' && !isBlankCharacter(rest.charAt(0))) {
        // 冒号后没有空白：不是合法映射行（避免把 `https://...` 之类裸串误判为键值）
        return null
    }
    return { key, valueText: rest.trim() }
}

/**
 * 读取「空值键」后续的块数组行（`- item`）。
 *
 * 空行与注释行会被跳过；缩进必须一致（嵌套数组 / 缩进续行 → unsupported）；
 * 数组项若为映射 / 行内对象 / 嵌套数组 → unsupported（由调用方整键跳过）。
 */
function readBlockArray(raw: string, start: number): BlockArrayParseResult {
    const items: FrontMatterScalar[] = []
    let hasItems = false
    let unsupported = false
    let firstIndent: string | null = null
    let cursor = start
    while (cursor < raw.length) {
        const line = readSourceLine(raw, cursor)
        const content = line.content
        if (content.trim() === '') {
            cursor = line.next
            continue
        }
        if (content.trimStart().startsWith('#')) {
            cursor = line.next
            continue
        }
        const itemMatch = BLOCK_ITEM_PATTERN.exec(content)
        if (!itemMatch) {
            if (/^[ \t]/.test(content)) {
                // 空值键下出现缩进映射（嵌套对象）等结构：整键跳过
                unsupported = true
            }
            break
        }
        const indent = itemMatch[1]
        if (firstIndent === null) {
            firstIndent = indent
        } else if (indent !== firstIndent) {
            // 同一块数组要求缩进一致，更深缩进视为嵌套数组 / 续行结构
            unsupported = true
        }
        const itemText = (itemMatch[2] || '').trim()
        cursor = line.next
        hasItems = true
        if (unsupported) {
            continue
        }
        if (itemText === '') {
            // YAML 中单独一个 `-` 表示 null 项
            items.push(null)
            continue
        }
        const normalizedItem = stripTrailingComment(itemText).trim()
        if (normalizedItem === '') {
            items.push(null)
            continue
        }
        const firstCharacter = normalizedItem.charAt(0)
        if (firstCharacter === '{' || firstCharacter === '[') {
            unsupported = true
            continue
        }
        if (firstCharacter === '"' || firstCharacter === "'") {
            items.push(parseScalar(normalizedItem))
            continue
        }
        if (normalizedItem === '-' || normalizedItem.startsWith('- ')) {
            unsupported = true
            continue
        }
        if (looksLikeMappingText(normalizedItem)) {
            unsupported = true
            continue
        }
        items.push(parseScalar(normalizedItem))
    }
    return { items, hasItems, unsupported, nextCursor: cursor }
}

/**
 * 解析冒号后的值文本。
 *
 * @returns `{ value }`（值必为标量或标量数组）；结构不受支持时返回 null（调用方整键跳过）
 */
function parseValueText(valueText: string): { value: FrontMatterValue } | null {
    const normalized = stripTrailingComment(valueText).trim()
    if (normalized === '') {
        return { value: null }
    }
    const firstCharacter = normalized.charAt(0)
    if (firstCharacter === '[') {
        const items = parseInlineArray(normalized)
        if (!items) {
            return null
        }
        return { value: items }
    }
    if (firstCharacter === '{') {
        return null
    }
    return { value: parseScalar(normalized) }
}

/** 解析行内数组 `[a, b, c]`（允许尾随逗号；嵌套结构 / 尾随垃圾返回 null） */
function parseInlineArray(text: string): FrontMatterScalar[] | null {
    const values: FrontMatterScalar[] = []
    let index = 1
    const skipBlank = (): void => {
        while (index < text.length && isBlankCharacter(text.charAt(index))) {
            index++
        }
    }
    skipBlank()
    if (text.charAt(index) === ']') {
        return index === text.length - 1 ? [] : null
    }
    while (index < text.length) {
        skipBlank()
        const character = text.charAt(index)
        if (character === '') {
            return null
        }
        if (character === '[' || character === '{' || character === ',') {
            return null
        }
        let itemText: string
        if (character === '"' || character === "'") {
            const quotedEnd = scanQuotedEnd(text, index)
            if (quotedEnd === -1) {
                return null
            }
            itemText = text.slice(index, quotedEnd)
            index = quotedEnd
        } else {
            const itemStart = index
            while (
                index < text.length &&
                text.charAt(index) !== ',' &&
                text.charAt(index) !== ']'
            ) {
                index++
            }
            itemText = text.slice(itemStart, index).trim()
            if (itemText === '') {
                return null
            }
            if (itemText.startsWith('{') || itemText.startsWith('[')) {
                return null
            }
            if (looksLikeMappingText(itemText)) {
                return null
            }
        }
        values.push(parseScalar(itemText))
        skipBlank()
        const delimiter = text.charAt(index)
        if (delimiter === ',') {
            index++
            skipBlank()
            if (text.charAt(index) === ']') {
                // 允许尾随逗号
                index++
                return index === text.length ? values : null
            }
            continue
        }
        if (delimiter === ']') {
            index++
            return index === text.length ? values : null
        }
        return null
    }
    return null
}

/** 解析单个标量（调用方保证已 trim 且已去掉行尾注释） */
function parseScalar(text: string): FrontMatterScalar {
    if (text.length >= 2) {
        const firstCharacter = text.charAt(0)
        if (firstCharacter === "'" || firstCharacter === '"') {
            const quoted = readQuotedScalar(text, 0)
            if (quoted && quoted.end === text.length) {
                return quoted.value
            }
        }
    }
    if (NUMBER_PATTERN.test(text)) {
        return Number(text)
    }
    if (BOOLEAN_PATTERN.test(text)) {
        return text.toLowerCase() === 'true'
    }
    if (NULL_PATTERN.test(text)) {
        return null
    }
    return text
}

/** 去掉行尾注释：`#` 必须位于行首或前一字符为空白；引号内的 `#` 保留 */
function stripTrailingComment(text: string): string {
    let quote: '"' | "'" | null = null
    let index = 0
    while (index < text.length) {
        const character = text.charAt(index)
        if (quote === "'") {
            if (character === "'") {
                if (text.charAt(index + 1) === "'") {
                    index += 2
                    continue
                }
                quote = null
            }
            index++
            continue
        }
        if (quote === '"') {
            if (character === '\\') {
                index += 2
                continue
            }
            if (character === '"') {
                quote = null
            }
            index++
            continue
        }
        if (character === "'" || character === '"') {
            quote = character
            index++
            continue
        }
        if (character === '#' && (index === 0 || isBlankCharacter(text.charAt(index - 1)))) {
            return text.slice(0, index)
        }
        index++
    }
    return text
}

/** 判断裸文本是否像映射项（冒号后紧跟空白或行尾，如 `name: x` / `key:`） */
function looksLikeMappingText(text: string): boolean {
    const trimmed = text.trim()
    if (trimmed.startsWith('{')) {
        return true
    }
    for (let index = 0; index < trimmed.length; index++) {
        if (trimmed.charAt(index) !== ':') {
            continue
        }
        const nextCharacter = trimmed.charAt(index + 1)
        if (nextCharacter === '' || isBlankCharacter(nextCharacter)) {
            return true
        }
    }
    return false
}

/** 扫描引号 token 的结束下标（不含返回）：返回结束引号之后的下标；未闭合返回 -1 */
function scanQuotedEnd(text: string, start: number): number {
    const quote = text.charAt(start)
    let index = start + 1
    while (index < text.length) {
        const character = text.charAt(index)
        if (quote === "'") {
            if (character === "'") {
                if (text.charAt(index + 1) === "'") {
                    index += 2
                    continue
                }
                return index + 1
            }
            index++
            continue
        }
        if (character === '\\') {
            index += 2
            continue
        }
        if (character === '"') {
            return index + 1
        }
        index++
    }
    return -1
}

/** 读取 `start` 处的引号标量（返回解码后的值与结束下标） */
function readQuotedScalar(text: string, start: number): { value: string; end: number } | null {
    const end = scanQuotedEnd(text, start)
    if (end === -1) {
        return null
    }
    const token = text.slice(start, end)
    const value =
        token.charAt(0) === "'" ? unescapeSingleQuoted(token) : unescapeDoubleQuoted(token)
    return { value, end }
}

/** 单引号解码：YAML 用连续两个单引号表示一个单引号 */
function unescapeSingleQuoted(token: string): string {
    return token.slice(1, -1).replace(/''/g, "'")
}

/** 双引号解码：按 JSON 语法解码；YAML 特有而 JSON 不支持的转义回退为原文内部文本 */
function unescapeDoubleQuoted(token: string): string {
    try {
        const parsed: unknown = JSON.parse(token)
        if (typeof parsed === 'string') {
            return parsed
        }
    } catch {
        // YAML 允许、JSON 不支持的转义（如 \x41）：保留原文内部文本，避免整行解析失败
    }
    return token.slice(1, -1)
}

/** 计算序列化顺序：`keyOrder` 中有效的键在前，其余 `data` 自有键按自身顺序追加 */
function resolveOrderedKeys(
    data: Record<string, FrontMatterValue>,
    keyOrder?: readonly string[]
): string[] {
    const keys: string[] = []
    const seen = new Set<string>()
    if (keyOrder) {
        for (const key of keyOrder) {
            if (seen.has(key) || !Object.prototype.hasOwnProperty.call(data, key)) {
                continue
            }
            seen.add(key)
            keys.push(key)
        }
    }
    for (const key of Object.keys(data)) {
        if (seen.has(key)) {
            continue
        }
        seen.add(key)
        keys.push(key)
    }
    return keys
}

/** 序列化单个键值对为若干行（数组展开为块数组，每项一行） */
function serializeEntry(key: string, value: FrontMatterValue): string[] {
    const serializedKey = serializeKey(key)
    if (!Array.isArray(value)) {
        return [`${serializedKey}: ${serializeScalar(value)}`]
    }
    if (value.length === 0) {
        return [`${serializedKey}: []`]
    }
    const lines = [`${serializedKey}:`]
    for (const item of value) {
        lines.push(`  - ${serializeScalar(item)}`)
    }
    return lines
}

/** 序列化键名：合法裸键原样输出，其余加引号（控制字符走 JSON 双引号转义） */
function serializeKey(key: string): string {
    if (SAFE_KEY_PATTERN.test(key)) {
        return key
    }
    if (containsControlCharacter(key)) {
        return JSON.stringify(key)
    }
    return `'${key.replace(/'/g, "''")}'`
}

/** 序列化标量 */
function serializeScalar(value: FrontMatterScalar): string {
    if (value === null) {
        return 'null'
    }
    if (typeof value === 'boolean') {
        return value ? 'true' : 'false'
    }
    if (typeof value === 'number') {
        // 非有限数值无法用 YAML 简单标量表达，降级为字符串（解析后会读回字符串）
        return Number.isFinite(value) ? String(value) : JSON.stringify(String(value))
    }
    return serializeString(value)
}

/** 序列化字符串：必要时加引号，保证可被本模块解析回同值 */
function serializeString(value: string): string {
    if (containsControlCharacter(value)) {
        return JSON.stringify(value)
    }
    if (!needsQuotes(value)) {
        return value
    }
    return `'${value.replace(/'/g, "''")}'`
}

/** 判断裸字符串是否必须加引号（空串 / 首尾空白 / 伪字面量 / YAML 指示符） */
function needsQuotes(value: string): boolean {
    if (value === '') {
        return true
    }
    if (value.trim() !== value) {
        return true
    }
    if (NUMBER_PATTERN.test(value) || BOOLEAN_PATTERN.test(value) || NULL_PATTERN.test(value)) {
        return true
    }
    if (QUOTE_LEADING_PATTERN.test(value)) {
        return true
    }
    if (/\s#/.test(value) || /:$/.test(value) || /:\s/.test(value)) {
        return true
    }
    return false
}

/** 探测原文换行风格：优先看原 front matter 块，其次看正文，缺省 LF */
function detectLineEnding(markdown: string, parsed: ParsedFrontMatter, bomLength: number): string {
    const blockPrefix = markdown.slice(bomLength, parsed.endOffset)
    if (blockPrefix.includes('\r\n')) {
        return '\r\n'
    }
    if (blockPrefix.includes('\n')) {
        return '\n'
    }
    if (parsed.body.includes('\r\n')) {
        return '\r\n'
    }
    if (parsed.body.includes('\n')) {
        return '\n'
    }
    return '\n'
}
