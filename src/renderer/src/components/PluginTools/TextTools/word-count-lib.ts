/**
 * 字数统计核心库（纯正则分类统计，零依赖）
 * 分类口径与 jyshare 5580 页面一致：
 *   ① 汉字数（仅基本区 U+4E00-U+9FA5，不含扩展区与标点）
 *   ② 中文标点数（显式全角符号表）
 *   ③ 英文字母数（按字符计，非单词数）
 *   ④ 数字数
 *   ⑤ 英文标点数（半角符号，排除字母/数字/空白）
 *   ⑥ 总字符数（UTF-16 码元数）
 *   ⑦ 去空格字符数（\s+ 全部剔除后长度）
 *   ⑧ 段落数（空串为 0，否则按 \n+ 切分后过滤空白段计数）
 */

/** 字数统计结果（各分类精确计数） */
export interface WordCountStats {
    /** 汉字数 */
    chineseChars: number
    /** 中文标点数 */
    chinesePunctuation: number
    /** 英文字母数（字符数非单词数） */
    letters: number
    /** 数字数 */
    digits: number
    /** 英文标点数 */
    englishPunctuation: number
    /** 总字符数 */
    totalChars: number
    /** 去空格字符数 */
    noSpaceChars: number
    /** 段落数 */
    paragraphs: number
}

const CN_CHAR_RE = /[\u4e00-\u9fa5]/g
const CN_PUNC_RE =
    /[\u3002\uff1f\uff01\uff0c\u3001\uff1b\uff1a\u201c\u201d\u2018\u2019\uff08\uff09\u300a\u300b\u3008\u3009\u3010\u3011\u300e\u300f\u300c\u300d\ufe43\ufe44\u3014\u3015\u2026\u2014\uff5e\uffe5]/g
const EN_CHAR_RE = /[a-zA-Z]/g
const NUM_RE = /[0-9]/g
const EN_PUNC_RE = /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/g

/** 对输入文本做字数分类统计 */
export function countText(text: string): WordCountStats {
    const cnChar = (text.match(CN_CHAR_RE) || []).length
    const cnPunc = (text.match(CN_PUNC_RE) || []).length
    const enChar = (text.match(EN_CHAR_RE) || []).length
    const numChar = (text.match(NUM_RE) || []).length
    const enPunc = (text.match(EN_PUNC_RE) || []).length
    const total = text.length
    const noSpace = text.replace(/\s+/g, '').length
    const para = text.trim() === '' ? 0 : text.split(/\n+/).filter((p) => p.trim() !== '').length
    return {
        chineseChars: cnChar,
        chinesePunctuation: cnPunc,
        letters: enChar,
        digits: numChar,
        englishPunctuation: enPunc,
        totalChars: total,
        noSpaceChars: noSpace,
        paragraphs: para
    }
}
