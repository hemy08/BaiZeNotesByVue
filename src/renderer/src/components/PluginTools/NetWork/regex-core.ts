/**
 * 正则测试核心库（纯函数，无 DOM / Worker 依赖）
 *
 * 算法移植自 jyshare 854 页面的 regex-worker.js：
 *   - new RegExp(pattern, flags) 编译，支持标志全集 d/g/i/m/s/u/v/y（u/v 互斥）；
 *   - 全局匹配用 exec 循环；零宽匹配手动推进 lastIndex，unicode 模式下跳过代理对；
 *   - 防护上限：表达式 ≤ 5000 字符、文本 ≤ 20 万字符、匹配数 ≤ 5000（超限截断并置 truncated）、
 *     替换输出 ≤ 200 万字符；
 *   - 替换不用 String.replace，自写 substitute 解析 $& $1 $` $' $$ $<name>。
 *
 * P1-1：单次 regex.exec() 可能触发灾难性回溯（如 (a+)+$ 对长文本），
 * 本模块的 exec 循环只允许在 Web Worker（regex-worker.ts）内执行；
 * 主线程（regex-lib.ts）仅调用 compileRegex 做前置校验（编译本身线性耗时），
 * 替换展开 substituteReplace 为线性实现，均可安全跑在主线程。
 */

/** 单条匹配结果 */
export interface RegexMatch {
    /** 匹配到的完整文本 */
    match: string
    /** 捕获组内容（下标 0 对应 $1），未参与匹配的组为 undefined */
    groups: (string | undefined)[]
    /** 命名捕获组（存在命名组时才有值） */
    namedGroups?: Record<string, string | undefined>
    /** 匹配起始位置（UTF-16 码元下标） */
    index: number
}

/** 匹配结果数组：附加 truncated 标志表示已达 5000 项上限被截断 */
export interface RegexRunResult extends Array<RegexMatch> {
    truncated?: boolean
}

/** 匹配数上限（超过即截断） */
export const MAX_MATCHES = 5000
/** 输入文本上限（字符数） */
export const MAX_INPUT_LENGTH = 200_000
/** 表达式长度上限 */
export const MAX_PATTERN_LENGTH = 5000
/** 替换模板长度上限 */
export const MAX_REPLACEMENT_LENGTH = 10_000
/** 替换结果输出上限（字符数） */
export const MAX_OUTPUT_LENGTH = 2_000_000

/** 把 V8 正则编译错误转为中文提示 */
function describeSyntaxError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error)
    if (/unterminated character class/i.test(message)) {
        return '字符类未闭合，请补上右方括号 ]。'
    }
    if (/unterminated group/i.test(message)) {
        return '分组未闭合，请检查左右括号。'
    }
    if (/nothing to repeat/i.test(message)) {
        return '量词前缺少可重复的内容。'
    }
    if (/range out of order/i.test(message)) {
        return '字符范围顺序不正确，例如应使用 [a-z]。'
    }
    if (/numbers out of order/i.test(message)) {
        return '量词范围不正确，最小次数不能大于最大次数。'
    }
    if (/duplicate capture/i.test(message)) {
        return '捕获组名称重复，请检查分组名称。'
    }
    if (/capture group name/i.test(message)) {
        return '捕获组名称不合法。'
    }
    if (/invalid escape|invalid property|invalid character class/i.test(message)) {
        return '转义或 Unicode 属性写法不正确，请同时检查 u / v 修饰符。'
    }
    if (/invalid group|invalid quantifier/i.test(message)) {
        return '分组写法不正确，或当前环境不支持此分组语法。'
    }
    if (/unmatched|too many/i.test(message)) {
        return '出现多余的右括号，请检查分组。'
    }
    return '正则语法不正确，请检查括号、量词、字符类和转义。'
}

/** 零宽匹配推进：普通模式 +1；unicode 模式下若位于代理对高位则 +2 跳过整个码点 */
function advance(text: string, index: number, unicode: boolean): number {
    if (!unicode || index + 1 >= text.length) return index + 1
    const a = text.charCodeAt(index)
    const b = text.charCodeAt(index + 1)
    return a >= 0xd800 && a <= 0xdbff && b >= 0xdc00 && b <= 0xdfff ? index + 2 : index + 1
}

/** 替换模板解析：$& $1 $` $' $$ $<name>（不依赖 String.replace） */
function substitute(template: string, m: RegexMatch, text: string): string {
    const token = /\$([$&`']|<[^>]*>|\d{1,2})/g
    let result = ''
    let last = 0
    let item: RegExpExecArray | null
    while ((item = token.exec(template)) !== null) {
        result += template.slice(last, item.index)
        const t = item[1]
        let value = item[0]
        if (t === '$') {
            value = '$'
        } else if (t === '&') {
            value = m.match
        } else if (t === '`') {
            value = text.slice(0, m.index)
        } else if (t === "'") {
            value = text.slice(m.index + m.match.length)
        } else if (t.startsWith('<')) {
            // $<name>：命名捕获组
            if (m.namedGroups) {
                value = m.namedGroups[t.slice(1, -1)] ?? ''
            }
        } else {
            const count = m.groups.length
            const n = Number(t)
            if (n > 0 && n <= count) {
                // $n：第 n 个捕获组
                value = m.groups[n - 1] ?? ''
            } else if (t.length === 2 && Number(t[0]) > 0 && Number(t[0]) <= count) {
                // $12 且只有 1 个组：等价 $1 + '2'（与 JS 引擎行为一致）
                value = (m.groups[Number(t[0]) - 1] ?? '') + t[1]
            }
        }
        result += value
        last = item.index + item[0].length
    }
    result += template.slice(last)
    return result
}

/**
 * 校验 pattern / flags / input 并编译正则（主线程前置校验与 worker 共用）。
 * 编译本身线性耗时、不会触发回溯，安全；真正的匹配执行必须放到 worker。
 * @throws 非法标志 / 超长输入 / 正则语法错误（中文提示）
 */
export function compileRegex(pattern: string, flags: string, input: string): RegExp {
    if (typeof pattern !== 'string' || pattern.length > MAX_PATTERN_LENGTH) {
        throw new Error(`输入超出限制：表达式最长 ${MAX_PATTERN_LENGTH} 字符。`)
    }
    if (typeof input !== 'string' || input.length > MAX_INPUT_LENGTH) {
        throw new Error(`输入超出限制：测试文本最长 ${MAX_INPUT_LENGTH} 字符。`)
    }
    if (
        typeof flags !== 'string' ||
        !/^[dgimsuvy]*$/.test(flags) ||
        new Set(flags).size !== flags.length ||
        (flags.includes('u') && flags.includes('v'))
    ) {
        throw new Error('修饰符不正确；u 和 v 不能同时启用。')
    }
    try {
        return new RegExp(pattern, flags)
    } catch (error) {
        throw new Error(describeSyntaxError(error), { cause: error })
    }
}

/**
 * 执行正则匹配（核心实现，仅限 Web Worker 内运行）。
 * @param pattern 正则表达式
 * @param flags 标志字符串（d/g/i/m/s/u/v/y 组合，u/v 互斥）
 * @param input 测试文本
 * @returns 匹配结果数组（达到 5000 项上限时截断并置 truncated 标志）
 * @throws 非法标志 / 超长输入 / 正则语法错误
 */
export function runRegexCore(pattern: string, flags: string, input: string): RegexRunResult {
    const regex = compileRegex(pattern, flags, input)

    const matches: RegexRunResult = []
    const unicode = regex.unicode || regex.unicodeSets
    for (;;) {
        const m = regex.exec(input)
        if (!m) break
        if (matches.length === MAX_MATCHES) {
            matches.truncated = true
            break
        }
        const item: RegexMatch = {
            match: m[0],
            groups: m.slice(1),
            index: m.index
        }
        if (m.groups) {
            item.namedGroups = { ...m.groups }
        }
        matches.push(item)
        if (!regex.global) break
        if (m[0] === '') {
            // 零宽匹配：手动推进 lastIndex，避免死循环
            regex.lastIndex = advance(input, regex.lastIndex, unicode)
        }
    }
    return matches
}

/**
 * 执行替换：把匹配结果按替换模板展开（$& $1 $` $' $$ $<name>），
 * 匹配之间的原文原样保留；零宽匹配不消耗字符。输出超 200 万字符时报错。
 * 线性复杂度，主线程安全。
 */
export function substituteReplace(
    input: string,
    replacement: string,
    matches: RegexMatch[]
): string {
    if (typeof replacement !== 'string' || replacement.length > MAX_REPLACEMENT_LENGTH) {
        throw new Error(`输入超出限制：替换内容最长 ${MAX_REPLACEMENT_LENGTH} 字符。`)
    }
    let result = ''
    let last = 0
    for (const m of matches) {
        if (result.length > MAX_OUTPUT_LENGTH) {
            throw new Error(`替换结果超过 ${MAX_OUTPUT_LENGTH} 字符，请缩短替换内容或测试文本。`)
        }
        result += input.slice(last, m.index)
        result += substitute(replacement, m, input)
        last = m.index + m.match.length
    }
    result += input.slice(last)
    if (result.length > MAX_OUTPUT_LENGTH) {
        throw new Error(`替换结果超过 ${MAX_OUTPUT_LENGTH} 字符，请缩短替换内容或测试文本。`)
    }
    return result
}
