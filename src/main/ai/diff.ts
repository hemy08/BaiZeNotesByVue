/**
 * 1.5.7 LLM Wiki L3：行级 diff（AI 草案 vs 目标 wiki 页面现有内容）
 *
 * 用途：`AI.INGEST` 返回结构化 diff（新增/删除/上下文行 + 行号），供渲染层
 * `llm-ingest-diff.vue` 高亮展示与审批；**diff 在主进程计算**（可单测、渲染层无额外依赖）。
 *
 * 实现取舍（不新增第三方依赖）：
 * - 经典 LCS 动态规划求最长公共子序列，回溯生成 add/del/context 行；
 * - 规模保护：行数乘积超过 {@link MAX_DIFF_CELLS} 时降级为「旧内容整体删除 + 新内容整体新增」
 *   的粗略 diff（并置 `truncated=true`），避免超大文件 O(n×m) 卡死主进程；
 * - 返回行数上限 {@link AI_DIFF_MAX_LINES}，超出截断并置 `truncated=true`（UI 需提示）。
 */
import type { AiDiffLine } from '../../shared/types/ai'
import { AI_DIFF_COMPUTE_MAX_LINES, AI_DIFF_MAX_LINES } from '../../shared/constants/ai'

/** LCS 动态规划最大单元格数（行数乘积；超出降级为粗略 diff） */
const MAX_DIFF_CELLS = 2_000_000

/** diff 计算结果 */
export interface AiDiffResult {
    /** 行级 diff（新增/删除/上下文） */
    lines: AiDiffLine[]
    /** 是否因规模/行数上限被截断或降级 */
    truncated: boolean
    /** 新增行数（截断前统计；用于 UI 摘要） */
    additions: number
    /** 删除行数（截断前统计） */
    deletions: number
}

/** 拆分为行（统一换行；丢弃末尾空行，避免「文件末尾换行」被误判为一次改动） */
export function splitAiDiffLines(text: string): string[] {
    if (text.length === 0) {
        return []
    }
    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
    const lines = normalized.split('\n')
    if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop()
    }
    return lines
}

/** 粗略 diff（规模过大时）：旧行全部删除 + 新行全部新增 */
function buildCoarseDiff(
    oldLines: readonly string[],
    newLines: readonly string[],
    oldStartLine = 1,
    newStartLine = 1
): { lines: AiDiffLine[]; truncated: boolean } {
    const lines: AiDiffLine[] = []
    let truncated = false
    for (let index = 0; index < oldLines.length; index += 1) {
        if (lines.length >= AI_DIFF_MAX_LINES) {
            truncated = true
            break
        }
        lines.push({ type: 'del', content: oldLines[index], oldLine: oldStartLine + index })
    }
    if (!truncated) {
        for (let index = 0; index < newLines.length; index += 1) {
            if (lines.length >= AI_DIFF_MAX_LINES) {
                truncated = true
                break
            }
            lines.push({ type: 'add', content: newLines[index], newLine: newStartLine + index })
        }
    }
    return { lines, truncated }
}

/**
 * 计算旧文本 → 新文本的行级 diff。
 *
 * @param oldText 目标文件现有内容（文件不存在传空串）
 * @param newText AI 生成的草案内容
 */
export function buildAiDiff(oldText: string, newText: string): AiDiffResult {
    const oldLines = splitAiDiffLines(oldText)
    const newLines = splitAiDiffLines(newText)

    if (oldLines.length + newLines.length > AI_DIFF_COMPUTE_MAX_LINES) {
        const coarse = buildCoarseDiff(oldLines, newLines)
        return {
            lines: coarse.lines,
            truncated: coarse.truncated,
            additions: newLines.length,
            deletions: oldLines.length
        }
    }
    if (oldLines.length * newLines.length > MAX_DIFF_CELLS) {
        const coarse = buildCoarseDiff(oldLines, newLines)
        return {
            lines: coarse.lines,
            truncated: coarse.truncated,
            additions: newLines.length,
            deletions: oldLines.length
        }
    }

    const oldCount = oldLines.length
    const newCount = newLines.length
    // LCS 矩阵：matrix[i][j] = oldLines[i..] 与 newLines[j..] 的最长公共子序列长度
    const matrix: Uint32Array[] = new Array(oldCount + 1)
    for (let i = 0; i <= oldCount; i += 1) {
        matrix[i] = new Uint32Array(newCount + 1)
    }
    for (let i = oldCount - 1; i >= 0; i -= 1) {
        const row = matrix[i]
        const nextRow = matrix[i + 1]
        for (let j = newCount - 1; j >= 0; j -= 1) {
            row[j] =
                oldLines[i] === newLines[j] ? nextRow[j + 1] + 1 : Math.max(nextRow[j], row[j + 1])
        }
    }

    const lines: AiDiffLine[] = []
    let additions = 0
    let deletions = 0
    let truncated = false
    let i = 0
    let j = 0
    while (i < oldCount || j < newCount) {
        if (lines.length >= AI_DIFF_MAX_LINES) {
            truncated = true
            break
        }
        if (i < oldCount && j < newCount && oldLines[i] === newLines[j]) {
            lines.push({
                type: 'context',
                content: oldLines[i],
                oldLine: i + 1,
                newLine: j + 1
            })
            i += 1
            j += 1
            continue
        }
        if (i < oldCount && (j >= newCount || matrix[i + 1][j] >= matrix[i][j + 1])) {
            lines.push({ type: 'del', content: oldLines[i], oldLine: i + 1 })
            deletions += 1
            i += 1
            continue
        }
        lines.push({ type: 'add', content: newLines[j], newLine: j + 1 })
        additions += 1
        j += 1
    }
    // 截断时把未遍历的剩余行计入统计，便于 UI 显示总体变化量
    if (truncated) {
        for (let rest = i; rest < oldCount; rest += 1) {
            deletions += 1
        }
        for (let rest = j; rest < newCount; rest += 1) {
            additions += 1
        }
    }
    return { lines, truncated, additions, deletions }
}
