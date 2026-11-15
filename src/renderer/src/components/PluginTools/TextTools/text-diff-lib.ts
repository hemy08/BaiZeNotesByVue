/**
 * 文本比对核心库：行级 diff（经典 LCS 动态规划）
 *
 * - 按 \n 拆行，行与行整体比较（单行再长也按整行处理，不做行内字符级 diff）；
 * - DP 表用 Int32Array 存储（每格 4 字节），回溯生成 equal/add/remove 序列；
 * - 防护：总行数 × 总字符数超过 400 万（或行数乘积超 400 万，防 DP 矩阵过大）
 *   时抛出 Error('DIFF_TOO_LARGE')，组件捕获后提示"两侧不同"；
 * - 输出顺序为从前往后的 diff 序列：equal 为两侧共有行，remove 为左侧独有行，
 *   add 为右侧独有行。
 */

/** 单行 diff 结果 */
export interface DiffLine {
    /** equal=两侧相同；add=右侧新增；remove=左侧删除 */
    type: 'equal' | 'add' | 'remove'
    /** 该行内容（不含换行符） */
    line: string
}

/** 防护上限：总行数 × 总字符数（另加行数乘积保险，防止 DP 矩阵过大） */
export const DIFF_MAX_CELLS = 4_000_000

/** 文本过大时抛出的错误标识（组件据此提示） */
export const DIFF_TOO_LARGE_MARK = 'DIFF_TOO_LARGE'

/**
 * 行级 diff。
 * @param a 左侧原始文本
 * @param b 右侧修改后文本
 * @returns 逐行 diff 序列（含结尾无换行的最后一行）
 * @throws Error('DIFF_TOO_LARGE') 当输入过大
 */
export function diffLines(a: string, b: string): DiffLine[] {
    // 空文本视为 0 行（否则 split('\n') 会得到 [''] 单空行，语义不符）
    const aLines = a === '' ? [] : a.split('\n')
    const bLines = b === '' ? [] : b.split('\n')
    const n = aLines.length
    const m = bLines.length
    const totalLines = n + m
    const totalChars = a.length + b.length
    if (totalLines * totalChars > DIFF_MAX_CELLS || n * m > DIFF_MAX_CELLS) {
        throw new Error(DIFF_TOO_LARGE_MARK)
    }

    // 经典 LCS DP：dp[i][j] = aLines[i..] 与 bLines[j..] 的最长公共子序列长度
    const width = m + 1
    const dp = new Int32Array((n + 1) * width)
    for (let i = n - 1; i >= 0; i--) {
        const row = i * width
        const nextRow = row + width
        for (let j = m - 1; j >= 0; j--) {
            dp[row + j] =
                aLines[i] === bLines[j]
                    ? dp[nextRow + j + 1] + 1
                    : Math.max(dp[row + j + 1], dp[nextRow + j])
        }
    }

    // 回溯生成 diff 序列
    const result: DiffLine[] = []
    let i = 0
    let j = 0
    while (i < n && j < m) {
        if (aLines[i] === bLines[j]) {
            result.push({ type: 'equal', line: aLines[i] })
            i++
            j++
        } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
            result.push({ type: 'remove', line: aLines[i] })
            i++
        } else {
            result.push({ type: 'add', line: bLines[j] })
            j++
        }
    }
    while (i < n) {
        result.push({ type: 'remove', line: aLines[i++] })
    }
    while (j < m) {
        result.push({ type: 'add', line: bLines[j++] })
    }
    return result
}
