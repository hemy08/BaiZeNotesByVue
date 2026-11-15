/**
 * 人民币数字转中文大写纯函数库（jyshare /front-end/6907/ 能力移植）
 *
 * 规则：
 * - 输入先 toFixed(2) 四舍五入到分；
 * - 整数部分从低位起每 4 位一组：组内按“零壹贰叁肆伍陆柒捌玖 + 拾佰仟”拼写，
 *   连续零压缩为一个“零”，组尾追加“万/亿/兆/…”大单位；
 * - 中间全零组（如 100000001 的中间组）补一个“零”，末尾全零组不补；
 * - 小数部分逐位处理角/分，无角分时以“整”结尾；
 * - 支持负数（前缀“负”）与逗号分隔的数字字符串；非法输入抛错。
 */

/** 0-9 大写数字 */
const DIGITS = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'] as const
/** 组内单位：个/拾/佰/仟 */
const UNITS = ['', '拾', '佰', '仟'] as const
/** 组尾大单位：/万/亿/兆/京/垓/秭/穰/沟（覆盖到 10^32） */
const BIG_UNITS = ['', '万', '亿', '兆', '京', '垓', '秭', '穰', '沟'] as const

/** 校验并归一化输入：去逗号/空格，返回纯数字串（可带负号与小数点），非法抛错 */
function normalizeInput(num: number | string): string {
    const raw = String(num).trim().replace(/[,\s]/g, '')
    if (!/^-?\d+(\.\d+)?$/.test(raw)) {
        throw new Error('无效的人民币金额：' + String(num))
    }
    return raw
}

/** 单个 4 位组（如 "0101"）转大写（组内零压缩，前导零忽略），全零组返回空串 */
function groupToUpper(group: string): string {
    let text = ''
    let zeroFlag = false
    let started = false
    for (let i = 0; i < group.length; i++) {
        const digit = Number(group[i])
        if (digit === 0) {
            // 前导零不参与零压缩（如高位组 "0001" 只读作“壹”）
            if (started) zeroFlag = true
        } else {
            started = true
            if (zeroFlag) {
                text += '零'
                zeroFlag = false
            }
            text += DIGITS[digit] + UNITS[group.length - i - 1]
        }
    }
    return text
}

/** 整数部分（非负数字串）转大写 */
function integerToUpper(intStr: string): string {
    if (intStr === '0') return '零'
    // 从低位每 4 位分组（groups[0] 是最低组）
    const groups: string[] = []
    let rest = intStr
    while (rest.length > 0) {
        groups.push(rest.slice(-4))
        rest = rest.slice(0, -4)
    }
    if (groups.length > BIG_UNITS.length) {
        throw new Error('金额过大，超出支持范围（10^32）')
    }

    const parts: string[] = []
    let pendingZero = false // 低位方向已输出内容后遇到全零组，需在下一个非零组前补“零”
    let hasLower = false
    for (let i = groups.length - 1; i >= 0; i--) {
        const group = groups[i]
        const text = groupToUpper(group)
        if (text === '') {
            // 全零组：仅当低位方向已有内容时标记待补零（末尾全零组不补）
            if (hasLower) pendingZero = true
            continue
        }
        if (pendingZero) {
            parts.push('零')
            pendingZero = false
        }
        parts.push(text + BIG_UNITS[i])
        hasLower = true
    }
    return parts.join('')
}

/**
 * 人民币金额转中文大写。
 * @param num 数字或数字字符串（支持负数、小数、千分位逗号，如 "-1,000.5"）
 * @returns 形如“壹佰元伍角”“壹拾万元整”“负壹佰元整”的中文大写
 */
export function rmbToUpper(num: number | string): string {
    const raw = normalizeInput(num)
    const negative = raw.startsWith('-')
    const unsigned = negative ? raw.slice(1) : raw
    const value = Number(unsigned)
    if (!Number.isFinite(value)) {
        throw new Error('无效的人民币金额：' + String(num))
    }
    // toFixed(2) 四舍五入到分；超大数（≥1e21）toFixed 返回指数形式，直接拒绝
    const fixed = value.toFixed(2)
    if (fixed.includes('e')) {
        throw new Error('金额过大，超出可精确表示范围：' + String(num))
    }
    const [intPart, fracPart] = fixed.split('.')

    const intText = integerToUpper(intPart)
    const jiao = Number(fracPart[0])
    const fen = Number(fracPart[1])

    let result = intText + '元'
    if (jiao === 0 && fen === 0) {
        result += '整'
    } else {
        if (jiao > 0) {
            result += DIGITS[jiao] + '角'
        }
        if (fen > 0) {
            // 角为 0 且整数部分非零时补“零”（如 壹佰元零伍分）
            if (jiao === 0 && intText !== '零') {
                result += '零'
            }
            result += DIGITS[fen] + '分'
        }
    }
    return negative ? '负' + result : result
}
