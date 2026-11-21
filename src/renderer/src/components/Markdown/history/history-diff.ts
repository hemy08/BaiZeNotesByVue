/**
 * 文档历史行级 diff（A3，纯函数）
 *
 * 算法：复用既有 `PluginTools/TextTools/text-diff-lib.ts` 的 LCS 动态规划实现
 * （该库为通用文本比对核心，已有直接单测覆盖；历史模块只在其上做「带行号 + 上下文折叠 +
 * 行数上限」的展示层适配，避免出现第二份 LCS 实现——单真源原则）。
 *
 * 与本模块的边界：
 * - 输入输出均为纯数据（字符串 → 行数组），不依赖 Vue/DOM/localStorage；
 * - diff 结果中的行号：`oldLine` 对应历史版本，`newLine` 对应当前编辑器内容；
 *   `add` 表示当前内容新增（历史版本没有），`remove` 表示当前内容已删除（历史版本有）；
 * - 大文档防护：LCS 输入超限时（text-diff-lib 抛 DIFF_TOO_LARGE）返回 `tooLarge=true`，
 *   由对话框展示降级提示，绝不阻塞在超大矩阵计算上；
 * - 行数展示上限：默认只保留变更行附近 `contextLines` 行上下文，其余未变更行折叠为 gap 行；
 *   折叠后仍超 `maxRows` 时降级为「仅变更行」，保证对话框渲染量可控。
 */
import {
    DIFF_TOO_LARGE_MARK,
    diffLines,
    type DiffLine
} from '../../PluginTools/TextTools/text-diff-lib'

/** 变更行前后保留的上下文行数（默认值） */
export const HISTORY_DIFF_DEFAULT_CONTEXT_LINES = 3

/** diff 展示行数上限（超出后降级为仅变更行） */
export const HISTORY_DIFF_DEFAULT_MAX_ROWS = 800

/** diff 统计 */
export interface HistoryDiffStats {
    /** 当前内容新增的行数 */
    added: number
    /** 当前内容删除的行数（历史版本独有） */
    removed: number
    /** 两侧完全相同的行数 */
    unchanged: number
    /** 是否存在任何变更 */
    changed: boolean
}

/** 单行 diff 展示行（带两侧行号） */
export interface HistoryDiffLineRow {
    kind: 'line'
    type: DiffLine['type']
    /** 历史版本中的行号（add 行为 null） */
    oldLine: number | null
    /** 当前编辑器内容中的行号（remove 行为 null） */
    newLine: number | null
    /** 行文本（不含换行符） */
    text: string
}

/** 折叠行（被省略的未变更行，例如「… 省略 42 行」） */
export interface HistoryDiffGapRow {
    kind: 'gap'
    hiddenLines: number
}

/** diff 展示行（行 or 折叠占位） */
export type HistoryDiffRow = HistoryDiffLineRow | HistoryDiffGapRow

/** diff 计算结果 */
export interface HistoryDiffResult {
    rows: HistoryDiffRow[]
    stats: HistoryDiffStats
    /** 输入过大（未执行 LCS，rows 为空） */
    tooLarge: boolean
    /** 是否因展示上限做了降级（仅保留变更行） */
    truncated: boolean
}

/** computeHistoryDiff 可选参数 */
export interface HistoryDiffOptions {
    contextLines?: number
    maxRows?: number
}

/** 空统计（超大/空文档时复用） */
export function createEmptyHistoryDiffStats(): HistoryDiffStats {
    return { added: 0, removed: 0, unchanged: 0, changed: false }
}

/** 从 text-diff-lib 的 diff 序列统计行数 */
export function countHistoryDiffStats(diff: DiffLine[]): HistoryDiffStats {
    const stats = createEmptyHistoryDiffStats()
    for (const item of diff) {
        if (item.type === 'add') {
            stats.added += 1
        } else if (item.type === 'remove') {
            stats.removed += 1
        } else {
            stats.unchanged += 1
        }
    }
    stats.changed = stats.added > 0 || stats.removed > 0
    return stats
}

/** 给 diff 序列补两侧行号（oldLine 从历史版本计，newLine 从当前内容计，均 1-based） */
export function buildNumberedDiffLines(diff: DiffLine[]): HistoryDiffLineRow[] {
    const rows: HistoryDiffLineRow[] = []
    let oldLine = 1
    let newLine = 1
    for (const item of diff) {
        if (item.type === 'equal') {
            rows.push({
                kind: 'line',
                type: 'equal',
                oldLine,
                newLine,
                text: item.line
            })
            oldLine += 1
            newLine += 1
        } else if (item.type === 'remove') {
            rows.push({
                kind: 'line',
                type: 'remove',
                oldLine,
                newLine: null,
                text: item.line
            })
            oldLine += 1
        } else {
            rows.push({
                kind: 'line',
                type: 'add',
                oldLine: null,
                newLine,
                text: item.line
            })
            newLine += 1
        }
    }
    return rows
}

/**
 * 按上下文行数折叠未变更行：
 * - 变更行全部保留；
 * - 未变更行仅保留距最近变更行 ≤ contextLines 的部分；
 * - 连续被折叠的未变更行合并为一个 gap 行（hiddenLines 为省略行数）。
 */
export function foldHistoryDiffRows(
    rows: HistoryDiffLineRow[],
    contextLines: number = HISTORY_DIFF_DEFAULT_CONTEXT_LINES
): HistoryDiffRow[] {
    const safeContext = Math.max(0, Math.trunc(contextLines))
    if (rows.length === 0) {
        return []
    }
    // 标记每个未变更行是否处于「变更附近」
    const keep = new Array<boolean>(rows.length).fill(false)
    let lastChange = -1
    for (let index = 0; index < rows.length; index++) {
        if (rows[index].type !== 'equal') {
            lastChange = index
            keep[index] = true
            continue
        }
        if (lastChange >= 0 && index - lastChange <= safeContext) {
            keep[index] = true
        }
    }
    // 反向补一遍：变更行之后的上下文
    let nextChange = -1
    for (let index = rows.length - 1; index >= 0; index--) {
        if (rows[index].type !== 'equal') {
            nextChange = index
            keep[index] = true
            continue
        }
        if (nextChange >= 0 && nextChange - index <= safeContext) {
            keep[index] = true
        }
    }

    const folded: HistoryDiffRow[] = []
    let hidden = 0
    for (let index = 0; index < rows.length; index++) {
        if (keep[index]) {
            if (hidden > 0) {
                folded.push({ kind: 'gap', hiddenLines: hidden })
                hidden = 0
            }
            folded.push(rows[index])
        } else {
            hidden += 1
        }
    }
    if (hidden > 0) {
        folded.push({ kind: 'gap', hiddenLines: hidden })
    }
    return folded
}

/**
 * 计算「历史版本 ↔ 当前内容」行级 diff。
 *
 * @param oldText 历史版本内容
 * @param newText 当前编辑器内容
 * @param options contextLines（上下文行数，默认 3）、maxRows（展示行上限，默认 800）
 */
export function computeHistoryDiff(
    oldText: string,
    newText: string,
    options: HistoryDiffOptions = {}
): HistoryDiffResult {
    const contextLines = options.contextLines ?? HISTORY_DIFF_DEFAULT_CONTEXT_LINES
    const maxRows = Math.max(1, options.maxRows ?? HISTORY_DIFF_DEFAULT_MAX_ROWS)
    let diff: DiffLine[]
    try {
        diff = diffLines(oldText, newText)
    } catch (error) {
        if (error instanceof Error && error.message === DIFF_TOO_LARGE_MARK) {
            return {
                rows: [],
                stats: createEmptyHistoryDiffStats(),
                tooLarge: true,
                truncated: false
            }
        }
        throw error
    }
    const stats = countHistoryDiffStats(diff)
    const numbered = buildNumberedDiffLines(diff)
    let rows = foldHistoryDiffRows(numbered, contextLines)
    let truncated = false
    if (rows.length > maxRows) {
        // 降级：只保留变更行（不再展示上下文），仍超限则截断并补一个 gap 行
        const changeRows = numbered.filter((row) => row.type !== 'equal')
        truncated = true
        if (changeRows.length <= maxRows) {
            rows = changeRows
        } else {
            const visible = changeRows.slice(0, maxRows)
            rows = [...visible, { kind: 'gap', hiddenLines: changeRows.length - visible.length }]
        }
    }
    return { rows, stats, tooLarge: false, truncated }
}
