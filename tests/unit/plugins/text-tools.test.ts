// @vitest-environment jsdom
/**
 * 文本工具插件纯函数单测（TextTools：繁简转换 / 汉字转拼音 / 字数统计 / 文本比对）
 * 只测 .ts 纯函数，不 import .vue。
 */
import { describe, it, expect } from 'vitest'

import {
    toTraditional,
    toSimplified,
    getPinyin,
    getFirstLetter
} from '@renderer/components/PluginTools/TextTools/chinese-lib'
import { countText } from '@renderer/components/PluginTools/TextTools/word-count-lib'
import {
    diffLines,
    DIFF_TOO_LARGE_MARK
} from '@renderer/components/PluginTools/TextTools/text-diff-lib'

describe('繁简转换（chinese-lib）', () => {
    it('简 -> 繁：常用汉字逐字映射', () => {
        expect(toTraditional('汉字')).toBe('漢字')
        expect(toTraditional('学习')).toBe('學習')
        expect(toTraditional('中国')).toBe('中國')
    })

    it('繁 -> 简：繁体文本还原为简体', () => {
        expect(toSimplified('漢字')).toBe('汉字')
        expect(toSimplified('學習')).toBe('学习')
    })

    it('繁简往返：简体 -> 繁体 -> 简体 还原', () => {
        const text = '汉字学习中国电脑鼠标键盘'
        expect(toSimplified(toTraditional(text))).toBe(text)
    })

    it('未收录字符与非汉字原样保留', () => {
        expect(toTraditional('Hello 123!')).toBe('Hello 123!')
        expect(toSimplified('ABC')).toBe('ABC')
    })
})

describe('汉字转拼音（chinese-lib，字库按需加载 → 异步）', () => {
    it('全拼："中国" -> "zhong guo"', async () => {
        expect(await getPinyin('中国')).toBe('zhong guo')
        expect(await getPinyin('你好')).toBe('ni hao')
    })

    it('首字母大写："中国" -> "ZG"', async () => {
        expect(await getFirstLetter('中国')).toBe('ZG')
        expect(await getFirstLetter('你好世界')).toBe('NHSJ')
    })

    it('非汉字原样保留（连续片段合并为一个整体）', async () => {
        expect(await getPinyin('你好123')).toBe('ni hao 123')
        expect(await getFirstLetter('中国abc')).toBe('ZGabc')
    })

    it('多音字取第一读音（数据生成时已保留首读音）', async () => {
        // 行：源字库第一读音为 hang（第二读音 xing 被舍弃，与原页面行为一致）
        expect(await getPinyin('行')).toBe('hang')
    })
})

describe('字数统计（word-count-lib）', () => {
    it('混合文本各分类数精确断言', () => {
        const text = '你好，世界！Hello, 2024.\n第二段'
        const stats = countText(text)
        expect(stats.chineseChars).toBe(7) // 你好世界第二段
        expect(stats.chinesePunctuation).toBe(2) // ，！（句尾 . 是英文句点，计入英文标点）
        expect(stats.letters).toBe(5) // Hello
        expect(stats.digits).toBe(4) // 2024
        expect(stats.englishPunctuation).toBe(2) // , .
        expect(stats.totalChars).toBe(22)
        expect(stats.noSpaceChars).toBe(20) // 去掉 1 个空格 + 1 个换行
        expect(stats.paragraphs).toBe(2)
    })

    it('空文本全为 0', () => {
        const stats = countText('')
        expect(stats).toEqual({
            chineseChars: 0,
            chinesePunctuation: 0,
            letters: 0,
            digits: 0,
            englishPunctuation: 0,
            totalChars: 0,
            noSpaceChars: 0,
            paragraphs: 0
        })
    })

    it('纯空白段落数为 0，多空行按 \\n+ 切分', () => {
        expect(countText('   \n\n  ').paragraphs).toBe(0)
        expect(countText('a\n\n\nb').paragraphs).toBe(2)
    })
})

describe('文本比对（text-diff-lib）', () => {
    it('识别相等/删除/新增行并保持顺序', () => {
        const a = 'line1\nline2\nline3'
        const b = 'line1\nlineX\nline3'
        expect(diffLines(a, b)).toEqual([
            { type: 'equal', line: 'line1' },
            { type: 'remove', line: 'line2' },
            { type: 'add', line: 'lineX' },
            { type: 'equal', line: 'line3' }
        ])
    })

    it('空输入：两侧皆空返回空序列', () => {
        expect(diffLines('', '')).toEqual([])
    })

    it('单侧为空：全部为删除或全部为新增', () => {
        expect(diffLines('a\nb', '')).toEqual([
            { type: 'remove', line: 'a' },
            { type: 'remove', line: 'b' }
        ])
        expect(diffLines('', 'a')).toEqual([{ type: 'add', line: 'a' }])
    })

    it('单行大文本（>200 字符）按整行处理', () => {
        const longLine = 'x'.repeat(1000)
        expect(diffLines(longLine, longLine)).toEqual([{ type: 'equal', line: longLine }])
        expect(diffLines(longLine, 'y'.repeat(1000))).toEqual([
            { type: 'remove', line: longLine },
            { type: 'add', line: 'y'.repeat(1000) }
        ])
    })

    it('文本过大（总行数×字符数超 400 万）抛出 DIFF_TOO_LARGE', () => {
        expect(() => diffLines('', 'x'.repeat(4_000_001))).toThrow(DIFF_TOO_LARGE_MARK)
        const manyLines = 'x\n'.repeat(2500) // 2500 行 × 总字符 2500 ≈ 625 万行·字符
        expect(() => diffLines(manyLines, manyLines)).toThrow(DIFF_TOO_LARGE_MARK)
    })
})
