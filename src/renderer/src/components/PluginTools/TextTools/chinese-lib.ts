/**
 * 中文文本工具核心库（繁简互转 + 汉字转拼音）
 *
 * 繁简互转：等长映射表逐字替换（源自 jyshare 5579 页面算法）——
 * 映射串一次性构建为 Map<char,char> 后 O(1) 查询（见下方 P2 修复说明）。
 * 无词级转换：多对一/一对多字形一律取首个命中位置。
 *
 * 汉字转拼音：pinyin-data.ts 字库按下标（码点 - 0x4E00）连续索引，
 * 多音字在生成数据时已只保留第一读音；非汉字原样保留。
 */
import { CHAR_PY_STR, FT_PY_STR } from './trad-simp-data'
import PINYIN_DATA from './pinyin-data'

/**
 * P2 修复：繁简映射改为模块级惰性构建的 Map<char, char>。
 * 此前逐字符 indexOf 扫描 7000 字映射串是 O(n×m)，10MB 文本会阻塞数十秒；
 * 现在一次性构建（仅首次使用时），之后每次替换都是 O(1)，构建成本摊薄到零。
 */

/** 简 → 繁映射（惰性构建一次，之后 O(1) 查询） */
let s2tMap: Map<string, string> | null = null

/** 繁 → 简映射（惰性构建一次，之后 O(1) 查询） */
let t2sMap: Map<string, string> | null = null

/**
 * 由等长映射串构建 Map；同一字符多次出现时保留首个命中（与历史 indexOf 语义一致）。
 */
function buildCharMap(source: string, target: string): Map<string, string> {
    const map = new Map<string, string>()
    const length = Math.min(source.length, target.length)
    for (let i = 0; i < length; i++) {
        const ch = source.charAt(i)
        if (!map.has(ch)) {
            map.set(ch, target.charAt(i))
        }
    }
    return map
}

function getS2tMap(): Map<string, string> {
    if (!s2tMap) {
        s2tMap = buildCharMap(CHAR_PY_STR, FT_PY_STR)
    }
    return s2tMap
}

function getT2sMap(): Map<string, string> {
    if (!t2sMap) {
        t2sMap = buildCharMap(FT_PY_STR, CHAR_PY_STR)
    }
    return t2sMap
}

/** 简体 -> 繁体（逐字映射，未收录字符原样保留） */
export function toTraditional(text: string): string {
    const map = getS2tMap()
    let result = ''
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i)
        const mapped = map.get(ch)
        result += mapped !== undefined ? mapped : ch
    }
    return result
}

/** 繁体 -> 简体（逐字映射，未收录字符原样保留） */
export function toSimplified(text: string): string {
    const map = getT2sMap()
    let result = ''
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i)
        const mapped = map.get(ch)
        result += mapped !== undefined ? mapped : ch
    }
    return result
}

/** 汉字码点区间：U+4E00 ~ U+9FA5（与字库实际覆盖一致，见 pinyin-data.ts；查表越界回落原字符） */
const HANZI_MIN = 0x4e00
const HANZI_MAX = 0x9fa5

/**
 * 汉字转拼音（无调、多音字取第一读音）。
 * 汉字之间以空格分隔；连续非汉字合并为一个片段原样保留（片段与拼音之间也以空格分隔）。
 * 例如：getPinyin('中国') === 'zhong guo'；getPinyin('你好123') === 'ni hao 123'。
 */
export function getPinyin(text: string): string {
    const tokens: string[] = []
    let noChinese = ''
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i)
        const code = ch.charCodeAt(0)
        if (code >= HANZI_MIN && code <= HANZI_MAX) {
            // 遇到汉字：先把累积的非汉字片段作为一个整体输出
            if (noChinese) {
                tokens.push(noChinese)
                noChinese = ''
            }
            tokens.push(PINYIN_DATA[code - HANZI_MIN] || ch)
        } else if (/^\s$/.test(ch)) {
            // 空白字符：输出累积的非汉字片段（空白本身不参与分隔，与原页面行为一致）
            if (noChinese) {
                tokens.push(noChinese)
                noChinese = ''
            }
        } else {
            noChinese += ch
        }
    }
    if (noChinese) {
        tokens.push(noChinese)
    }
    return tokens.join(' ')
}

/**
 * 取各字拼音首字母（大写）。
 * 汉字取拼音首字母；非汉字（含字母、数字、符号）原样保留。
 * 例如：getFirstLetter('中国') === 'ZG'；getFirstLetter('中国abc') === 'ZGabc'。
 */
export function getFirstLetter(text: string): string {
    let result = ''
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i)
        const code = ch.charCodeAt(0)
        if (code >= HANZI_MIN && code <= HANZI_MAX) {
            const pinyin = PINYIN_DATA[code - HANZI_MIN]
            result += pinyin ? pinyin.charAt(0).toUpperCase() : ch
        } else {
            result += ch
        }
    }
    return result
}
