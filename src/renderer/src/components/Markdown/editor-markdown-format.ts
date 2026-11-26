/**
 * P0：Markdown 内联格式切换的纯逻辑。
 *
 * 支持 bold/italic/strikethrough/inline code：
 * - 有选区：包裹；若选区或紧邻两侧已有标记则去掉；
 * - 无选区：优先选中光标所在“词”（连续非空白、非 Markdown 标记字符），再包裹/去包裹；
 *   若光标处无词，则插入成对标记并把光标放到中间；
 * - 只返回编辑计划，不依赖 Monaco，便于单测。
 */

export type InlineMarkdownFormat = 'bold' | 'italic' | 'strike' | 'code'

export const INLINE_FORMAT_MARKERS: Readonly<Record<InlineMarkdownFormat, string>> = {
    bold: '**',
    italic: '*',
    strike: '~~',
    code: '`'
}

export interface InlineFormatEditPlan {
    /** 需要替换的字符区间 [replaceStart, replaceEnd) */
    replaceStart: number
    replaceEnd: number
    replacement: string
    /** 应用后的选区（相对全文的字符偏移） */
    selectionStart: number
    selectionEnd: number
}

/** 光标所在词的边界：字母/数字/下划线/CJK/连字符；不把 Markdown 标记算进词 */
const WORD_CHAR_PATTERN = /[\p{L}\p{N}_-]/u

function findWordRange(
    text: string,
    start: number,
    end: number
): { start: number; end: number } | null {
    if (start !== end) {
        return { start, end }
    }
    let left = start
    let right = end
    while (left > 0 && WORD_CHAR_PATTERN.test(text[left - 1])) {
        left -= 1
    }
    while (right < text.length && WORD_CHAR_PATTERN.test(text[right])) {
        right += 1
    }
    return left === right ? null : { start: left, end: right }
}

function hasMarkerPair(text: string, start: number, end: number, marker: string): boolean {
    return (
        start >= marker.length &&
        end + marker.length <= text.length &&
        text.slice(start - marker.length, start) === marker &&
        text.slice(end, end + marker.length) === marker
    )
}

/**
 * 生成内联格式切换编辑计划。
 * 规则优先级：去掉选区自带的标记 → 去掉紧邻标记 → 包裹。
 */
export function planInlineMarkdownFormat(
    text: string,
    selectionStart: number,
    selectionEnd: number,
    format: InlineMarkdownFormat
): InlineFormatEditPlan {
    const marker = INLINE_FORMAT_MARKERS[format]
    const start = Math.max(0, Math.min(selectionStart, selectionEnd, text.length))
    const end = Math.max(0, Math.min(Math.max(selectionStart, selectionEnd), text.length))
    const word = findWordRange(text, start, end)
    if (!word) {
        // 空光标且无词：插入成对标记，光标置于中间
        return {
            replaceStart: start,
            replaceEnd: end,
            replacement: marker + marker,
            selectionStart: start + marker.length,
            selectionEnd: start + marker.length
        }
    }
    const range = word
    const selected = text.slice(range.start, range.end)
    // 1) 选区自带一对标记（例如同时选中 **text**）
    if (
        selected.length >= marker.length * 2 &&
        selected.startsWith(marker) &&
        selected.endsWith(marker)
    ) {
        const inner = selected.slice(marker.length, selected.length - marker.length)
        return {
            replaceStart: range.start,
            replaceEnd: range.end,
            replacement: inner,
            selectionStart: range.start,
            selectionEnd: range.start + inner.length
        }
    }
    // 2) 组合格式：粗体文字上点斜体 → 粗斜体；斜体文字上点粗体 → 粗斜体
    if (
        format === 'italic' &&
        hasMarkerPair(text, range.start, range.end, '**') &&
        !hasMarkerPair(text, range.start, range.end, '***')
    ) {
        return {
            replaceStart: range.start - 2,
            replaceEnd: range.end + 2,
            replacement: `***${selected}***`,
            selectionStart: range.start + 1,
            selectionEnd: range.start + 1 + selected.length
        }
    }
    if (
        format === 'bold' &&
        hasMarkerPair(text, range.start, range.end, '*') &&
        !hasMarkerPair(text, range.start, range.end, '**')
    ) {
        return {
            replaceStart: range.start - 1,
            replaceEnd: range.end + 1,
            replacement: `***${selected}***`,
            selectionStart: range.start + 2,
            selectionEnd: range.start + 2 + selected.length
        }
    }
    // 3) 同格式标记在选区两侧（例如只选中 text，前后是 **）→ 去掉标记
    if (hasMarkerPair(text, range.start, range.end, marker)) {
        return {
            replaceStart: range.start - marker.length,
            replaceEnd: range.end + marker.length,
            replacement: selected,
            selectionStart: range.start - marker.length,
            selectionEnd: range.start - marker.length + selected.length
        }
    }
    // 4) 包裹
    return {
        replaceStart: range.start,
        replaceEnd: range.end,
        replacement: `${marker}${selected}${marker}`,
        selectionStart: range.start + marker.length,
        selectionEnd: range.start + marker.length + selected.length
    }
}

/** 读取当前选区/光标处的激活格式（用于工具栏高亮）。 */
export function detectInlineMarkdownFormats(
    text: string,
    selectionStart: number,
    selectionEnd: number
): Record<InlineMarkdownFormat, boolean> {
    const start = Math.max(0, Math.min(selectionStart, selectionEnd, text.length))
    const end = Math.max(0, Math.min(Math.max(selectionStart, selectionEnd), text.length))
    const word = findWordRange(text, start, end)
    const range = word ?? { start, end }
    const selected = text.slice(range.start, range.end)
    const detect = (marker: string): boolean => {
        if (
            selected.length >= marker.length * 2 &&
            selected.startsWith(marker) &&
            selected.endsWith(marker)
        ) {
            return true
        }
        return hasMarkerPair(text, range.start, range.end, marker)
    }
    return {
        bold: detect('**'),
        italic: detect('*') && !detect('**'),
        strike: detect('~~'),
        code: detect('`')
    }
}
