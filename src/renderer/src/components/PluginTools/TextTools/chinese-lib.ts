/**
 * 中文文本工具核心库（繁简互转 + 汉字转拼音）
 *
 * 繁简互转：等长映射表逐字替换（源自 jyshare 5579 页面算法）——
 * 在简体串中用 indexOf 定位字符位置，取繁体串同位字符；反向同理。
 * 无词级转换：多对一/一对多字形一律取首个命中位置。
 *
 * 汉字转拼音：pinyin-data.ts 字库按下标（码点 - 0x4E00）连续索引，
 * 多音字在生成数据时已只保留第一读音；非汉字原样保留。
 */
import { CHAR_PY_STR, FT_PY_STR } from './trad-simp-data'
import PINYIN_DATA from './pinyin-data'

/** 简体 -> 繁体（逐字映射，未收录字符原样保留） */
export function toTraditional(text: string): string {
    let result = ''
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i)
        const idx = CHAR_PY_STR.indexOf(ch)
        result += idx !== -1 ? FT_PY_STR.charAt(idx) : ch
    }
    return result
}

/** 繁体 -> 简体（逐字映射，未收录字符原样保留） */
export function toSimplified(text: string): string {
    let result = ''
    for (let i = 0; i < text.length; i++) {
        const ch = text.charAt(i)
        const idx = FT_PY_STR.indexOf(ch)
        result += idx !== -1 ? CHAR_PY_STR.charAt(idx) : ch
    }
    return result
}

/** 汉字码点区间：U+4E00 ~ U+9FFF（与字库下标范围一致） */
const HANZI_MIN = 0x4e00
const HANZI_MAX = 0x9fff

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
