/**
 * 在线计算器求值纯函数库（jyshare /front-end/6904/ 标准模式能力移植）
 *
 * 禁止 eval：tokenize 词法分析 + 双栈求值（操作数栈 + 运算符栈 + 优先级表）。
 * 支持：加减乘除取余乘方（+ - * / % ^）、括号、小数、一元负号。
 * 优先级表：加/减 = 1，乘/除/取余 = 2，乘方 = 3（右结合，其余左结合）。
 */

/** 运算符优先级表 */
const PRECEDENCE: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    '%': 2,
    '^': 3
}

type Token =
    | { type: 'num'; value: number }
    | { type: 'op'; value: string }
    | { type: 'lparen' }
    | { type: 'rparen' }

/**
 * 词法分析：把表达式拆成数字/运算符/括号 token。
 * 一元负号（出现在开头、左括号后或运算符后的 "-"）并入其后数字。
 */
function tokenize(expr: string): Token[] {
    const tokens: Token[] = []
    let i = 0
    let expectOperand = true
    const len = expr.length
    while (i < len) {
        const char = expr[i]
        if (/\s/.test(char)) {
            i++
            continue
        }
        // 数字（含小数点）：允许 "3.5"、".5" 形式
        if (/[0-9.]/.test(char) || (char === '-' && expectOperand)) {
            // 一元负号
            if (char === '-') {
                const rest = expr.slice(i + 1)
                if (!/^[0-9.]/.test(rest)) {
                    throw new Error('非法表达式：运算符位置错误')
                }
            }
            const match = expr.slice(i).match(/^-?\d*\.?\d+/)
            if (!match) {
                throw new Error('非法表达式：无效的数字')
            }
            const value = Number(match[0])
            if (!Number.isFinite(value)) {
                throw new Error('非法表达式：数字超出范围')
            }
            tokens.push({ type: 'num', value })
            i += match[0].length
            expectOperand = false
            continue
        }
        if (char === '(') {
            tokens.push({ type: 'lparen' })
            i++
            expectOperand = true
            continue
        }
        if (char === ')') {
            tokens.push({ type: 'rparen' })
            i++
            expectOperand = false
            continue
        }
        if (PRECEDENCE[char] !== undefined) {
            tokens.push({ type: 'op', value: char })
            i++
            expectOperand = true
            continue
        }
        throw new Error('非法表达式：无法识别的字符 "' + char + '"')
    }
    if (expectOperand) {
        throw new Error('非法表达式：表达式不完整')
    }
    return tokens
}

/** 执行单次二元运算（显式 switch，不用 eval） */
function applyOperator(op: string, a: number, b: number): number {
    switch (op) {
        case '+':
            return a + b
        case '-':
            return a - b
        case '*':
            return a * b
        case '/':
            if (b === 0) throw new Error('除零错误')
            return a / b
        case '%':
            if (b === 0) throw new Error('除零错误（取余）')
            return a % b
        case '^':
            return Math.pow(a, b)
        default:
            throw new Error('未知运算符：' + op)
    }
}

/**
 * 求值数学表达式（字符串）。
 * @param expr 如 "2+3*4"、"(1+2)*3"、"2.5*4"、"-5+3"、"2^3^2"
 * @returns 计算结果数值
 * @throws 除零、括号不匹配、非法字符/结构时抛错
 */
export function evaluateExpression(expr: string): number {
    const text = String(expr).trim()
    if (text === '') {
        throw new Error('表达式不能为空')
    }
    const tokens = tokenize(text)
    const values: number[] = [] // 操作数栈
    const ops: string[] = [] // 运算符栈

    for (const token of tokens) {
        if (token.type === 'num') {
            values.push(token.value)
            continue
        }
        if (token.type === 'lparen') {
            ops.push('(')
            continue
        }
        if (token.type === 'rparen') {
            // 弹出直到左括号
            while (ops.length > 0 && ops[ops.length - 1] !== '(') {
                const op = ops.pop() as string
                const b = values.pop()
                const a = values.pop()
                if (a === undefined || b === undefined) {
                    throw new Error('非法表达式：缺少操作数')
                }
                values.push(applyOperator(op, a, b))
            }
            if (ops.length === 0 || ops.pop() !== '(') {
                throw new Error('括号不匹配：多余的右括号')
            }
            continue
        }
        // 运算符：按优先级弹出栈顶更高/同级运算符（^ 右结合，同级不弹）
        const currentPrec = PRECEDENCE[token.value]
        while (ops.length > 0 && ops[ops.length - 1] !== '(') {
            const top = ops[ops.length - 1]
            const topPrec = PRECEDENCE[top]
            const shouldPop = token.value === '^' ? topPrec > currentPrec : topPrec >= currentPrec
            if (!shouldPop) break
            const op = ops.pop() as string
            const b = values.pop()
            const a = values.pop()
            if (a === undefined || b === undefined) {
                throw new Error('非法表达式：缺少操作数')
            }
            values.push(applyOperator(op, a, b))
        }
        ops.push(token.value)
    }

    // 弹出剩余运算符
    while (ops.length > 0) {
        const op = ops.pop() as string
        if (op === '(') {
            throw new Error('括号不匹配：多余的左括号')
        }
        const b = values.pop()
        const a = values.pop()
        if (a === undefined || b === undefined) {
            throw new Error('非法表达式：缺少操作数')
        }
        values.push(applyOperator(op, a, b))
    }

    if (values.length !== 1) {
        throw new Error('非法表达式：多余的操作数')
    }
    const result = values[0]
    if (!Number.isFinite(result)) {
        throw new Error('计算结果超出可表示范围')
    }
    return result
}
