/**
 * 表格单元格取值归一化（视觉升级 P1-B3，T8 电子表格化显示规则）
 *
 * ## 职责
 * 表格编辑器是「Markdown 表格的可视化编辑」：单元格真实值始终是 Markdown 文本
 * （`| 1 | 文本 | 2024-01-05 |`），本模块只负责**显示层**的取值判定与格式化：
 * - 数字右对齐 / 文本左对齐（列上有显式对齐时以显式对齐优先）；
 * - 日期显示统一为 `YYYY-MM-DD`（仅归一化显示，不改写用户输入、不改变序列化结果）；
 * - 空单元格显示为空，绝不显示 `0`（视觉升级方案 §4.3 明确要求）；
 * - 任务单元格（`- [ ] / - [x]`）显示为复选框 + 去掉标记的正文。
 *
 * ## 边界
 * - 纯函数，不依赖 DOM / Vue（node 环境可直接单测）；
 * - 日期只识别「无时间的完整日期」（`2024-1-5`、`2024/1/5`、`2024.1.5`、`2024年1月5日`）；
 *   带时间的值、Excel 序列号不在此转换（避免把普通数字误判成日期而丢失原始语义）；
 * - 数字识别覆盖符号/千分位/小数/百分比/货币前缀；无法确定时按文本处理（左对齐）。
 */
import type { TableAlignment } from '../../../Markdown/table-markdown'

/** 单元格显示类别 */
export type TableCellKind = 'empty' | 'number' | 'date' | 'text' | 'task'

/** 单元格水平对齐（显式对齐 + 自动推导共用） */
export type TableCellAlign = 'left' | 'center' | 'right'

/** 任务标记：`- [ ]` / `- [x]`（允许前导空白，兼容单元格内缩进） */
export const TABLE_TASK_MARKER_PATTERN = /^\s*- \[([ xX])\]\s?/

/** 数字：可选货币前缀、符号、千分位、小数、百分号（`+1,234.5`、`-3`、`12%`、`$9.9`） */
const NUMERIC_CELL_PATTERN = /^[¥$€£]?[+-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?%?$/

/** 日期：`2024-1-5` / `2024/01/05` / `2024.1.5` 三种分隔符 */
const DATE_SEPARATED_PATTERN = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/

/** 日期：`2024年1月5日` */
const DATE_CHINESE_PATTERN = /^(\d{4})年(\d{1,2})月(\d{1,2})日$/

/** 补零到两位 */
function pad2(value: number): string {
    return value.toString().padStart(2, '0')
}

/** 是否为任务单元格（`- [ ]` / `- [x]` 开头） */
export function isTaskCellValue(value: string): boolean {
    return TABLE_TASK_MARKER_PATTERN.test(value)
}

/** 是否为数字单元格（空串不算数字，避免空单元格被当成 0） */
export function isNumericCellValue(value: string): boolean {
    const trimmed = value.trim()
    return trimmed.length > 0 && NUMERIC_CELL_PATTERN.test(trimmed)
}

/**
 * 归一化日期显示为 `YYYY-MM-DD`；非日期返回 null。
 *
 * 只做「显示归一化」：调用方不得用返回值回写单元格（保留用户原始输入格式）。
 * 月份/日期做范围校验（1~12、1~31），非法值按文本处理，避免把 `2024-13-45` 之类错值
 * 显示成合法日期。
 */
export function normalizeDateCellValue(value: string): string | null {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
        return null
    }
    const matched = DATE_SEPARATED_PATTERN.exec(trimmed) ?? DATE_CHINESE_PATTERN.exec(trimmed)
    if (!matched) {
        return null
    }
    const year = Number(matched[1])
    const month = Number(matched[2])
    const day = Number(matched[3])
    if (
        !Number.isFinite(year) ||
        !Number.isFinite(month) ||
        !Number.isFinite(day) ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31
    ) {
        return null
    }
    return `${year}-${pad2(month)}-${pad2(day)}`
}

/** 判定单元格显示类别（空串优先判空，任务标记优先于数字/文本） */
export function detectTableCellKind(value: string): TableCellKind {
    const trimmed = value.trim()
    if (trimmed.length === 0) {
        return 'empty'
    }
    if (isTaskCellValue(value)) {
        return 'task'
    }
    if (normalizeDateCellValue(value) !== null) {
        return 'date'
    }
    if (isNumericCellValue(value)) {
        return 'number'
    }
    return 'text'
}

/**
 * 计算单元格显示文本（单行展示，编辑态仍显示原始 Markdown）。
 *
 * - 空单元格 → 空串（**绝不返回 "0"**）；
 * - 日期 → `YYYY-MM-DD`；
 * - 任务 → 去掉 `- [ ] / - [x]` 标记后的正文；
 * - 其余 → 原样返回，仅把换行/<br> 折叠为空格（表格行高固定，靠 title 展示全文）。
 */
export function formatTableCellDisplay(value: string): string {
    const kind = detectTableCellKind(value)
    if (kind === 'empty') {
        return ''
    }
    if (kind === 'date') {
        return normalizeDateCellValue(value) ?? ''
    }
    const withoutTaskMarker = kind === 'task' ? value.replace(TABLE_TASK_MARKER_PATTERN, '') : value
    return withoutTaskMarker.replace(/<br\s*\/?>/gi, ' ').replace(/\r?\n/g, ' ')
}

/**
 * 计算单元格对齐方式：列上有显式对齐（`:---` / `:---:` / `---:`）时以显式为准；
 * `default`（Markdown 未声明对齐）时按内容推导——数字/日期右对齐，其余左对齐。
 */
export function resolveTableCellAlign(
    value: string,
    columnAlignment: TableAlignment
): TableCellAlign {
    if (columnAlignment !== 'default') {
        return columnAlignment
    }
    const kind = detectTableCellKind(value)
    return kind === 'number' || kind === 'date' ? 'right' : 'left'
}
