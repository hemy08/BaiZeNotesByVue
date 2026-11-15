/**
 * 人民币数字转中文大写纯函数库（jyshare /front-end/6907/ 能力移植）
 *
 * 规则：
 * - 输入按字符串解析：整数部分全程按 4 位分组拼写（任意长度精确，不经 Number），
 *   小数部分四舍五入到分也走纯字符串十进制运算（仅进位 +1 用 BigInt，参考 base-lib 用法），
 *   彻底避免 >2^53 整数被浮点舍入静默算错（P2 修复）；
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

/**
 * 小数部分四舍五入到两位（纯字符串十进制运算，避免浮点误差）。
 * @param frac 小数点后的数字串（可空）
 * @returns 四舍五入后的两位小数与是否进位到整数部分
 */
function roundFracToTwo(frac: string): { frac2: string; carry: boolean } {
    // 取前 3 位（不足补零）：第 3 位决定是否进位，前 2 位为结果
    const digits = (frac + '00').slice(0, 3)
    let two = digits.slice(0, 2)
    let carry = false
    if (Number(digits[2]) >= 5) {
        // 两位十进制串 +1（如 "99" → "00" 时进位到整数部分）
        const chars = two.split('')
        let index = chars.length - 1
        let overflow = false
        while (index >= 0) {
            const next = Number(chars[index]) + 1
            if (next < 10) {
                chars[index] = String(next)
                break
            }
            chars[index] = '0'
            index--
            if (index < 0) overflow = true
        }
        if (overflow) {
            two = '00'
            carry = true
        } else {
            two = chars.join('')
        }
    }
    return { frac2: two, carry }
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
    // 去前导零，与历史 Number 解析语义一致（如 "007" 读作“柒”，全零串读作“零”）
    const normalized = intStr.replace(/^0+/, '') || '0'
    if (normalized === '0') return '零'
    // 从低位每 4 位分组（groups[0] 是最低组）
    const groups: string[] = []
    let rest = normalized
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
    const dotIndex = unsigned.indexOf('.')
    // P2 修复：整数部分按字符串解析（不经 Number，>2^53 不再浮点舍入出错）
    const intStr = dotIndex === -1 ? unsigned : unsigned.slice(0, dotIndex)
    const fracStr = dotIndex === -1 ? '' : unsigned.slice(dotIndex + 1)

    // 小数部分四舍五入到分（字符串十进制运算）
    const { frac2, carry } = roundFracToTwo(fracStr)
    // 四舍五入进位作用于整数部分：字符串按 BigInt 解析后 +1（整个转换只有这一处数值运算；
    // 整数拼写全程字符串分组，任意长度精确，参考同批次 base-lib.ts 的 BigInt 用法）
    const finalIntStr = carry ? String(BigInt(intStr) + 1n) : intStr

    const intText = integerToUpper(finalIntStr)
    const jiao = Number(frac2[0])
    const fen = Number(frac2[1])

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
