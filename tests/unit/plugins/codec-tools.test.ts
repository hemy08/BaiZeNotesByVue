// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { encodeBase64, decodeBase64 } from '@renderer/components/PluginTools/Codec/base64-lib'
import { encodeUrl, decodeUrl } from '@renderer/components/PluginTools/Codec/url-lib'
import { encodeHtml, decodeHtml } from '@renderer/components/PluginTools/Codec/html-lib'
import {
    textToUnicode,
    unicodeToText,
    asciiToEntity,
    entityToAscii
} from '@renderer/components/PluginTools/Codec/unicode-lib'
import {
    bytesToBase64,
    base64ToBytes
} from '@renderer/components/PluginTools/Codec/image-base64-lib'

describe('base64-lib（Base64 编解码）', () => {
    it('与 jyshare 原版示例一致：runoob ↔ cnVub29i', () => {
        expect(encodeBase64('runoob')).toBe('cnVub29i')
        expect(decodeBase64('cnVub29i')).toBe('runoob')
    })

    it('经典测试向量：Man → TWFu、a → YQ==、ab → YWI=', () => {
        expect(encodeBase64('Man')).toBe('TWFu')
        expect(encodeBase64('a')).toBe('YQ==')
        expect(encodeBase64('ab')).toBe('YWI=')
        expect(decodeBase64('TWFu')).toBe('Man')
    })

    it('中文先按 UTF-8 编码：中 → 5Lit', () => {
        expect(encodeBase64('中')).toBe('5Lit')
        expect(decodeBase64('5Lit')).toBe('中')
    })

    it('emoji 按 4 字节 UTF-8 编码并可还原', () => {
        expect(encodeBase64('😀')).toBe('8J+YgA==')
        expect(decodeBase64('8J+YgA==')).toBe('😀')
    })

    it('正常往返：中文/emoji/空串/特殊字符', () => {
        for (const text of ['', 'Hello 白泽', '中文😀测试', 'a+b/c=~!@#$%^&*()', '你好\n世界']) {
            expect(decodeBase64(encodeBase64(text))).toBe(text)
        }
    })

    it('解码容忍非法字符（空白/换行/符号）', () => {
        expect(decodeBase64('cnVu\nb29i')).toBe('runoob')
        expect(decodeBase64('  5Lit==  ')).toBe('中')
        expect(decodeBase64('cnVu!!b29i')).toBe('runoob')
    })

    it('空串编解码返回空串', () => {
        expect(encodeBase64('')).toBe('')
        expect(decodeBase64('')).toBe('')
    })

    it('被截断的 UTF-8 字节序列用替换字符补位，不抛异常', () => {
        // '中文' 的 Base64 为 5Lit5paH，去掉末尾两字符后剩余字节流以不完整多字节序列结尾
        expect(decodeBase64(encodeBase64('中文').slice(0, -2))).toBe('中\uFFFD')
    })
})

describe('url-lib（URL 编解码）', () => {
    it('中文按 UTF-8 百分号编码', () => {
        expect(encodeUrl('中文')).toBe('%E4%B8%AD%E6%96%87')
        expect(decodeUrl('%E4%B8%AD%E6%96%87')).toBe('中文')
    })

    it('空格与保留字符被转义，RFC 3986 非保留字符保持原样', () => {
        expect(encodeUrl('a b&c=d')).toBe('a%20b%26c%3Dd')
        expect(encodeUrl("!*'()-._~")).toBe("!*'()-._~")
    })

    it('正常往返：中文/emoji/特殊字符', () => {
        for (const text of ['', '中😀 a/b?c=d&e=f', '你好%20世界', 'quote\'"dash-_~']) {
            expect(decodeUrl(encodeUrl(text))).toBe(text)
        }
    })

    it('空串编解码返回空串', () => {
        expect(encodeUrl('')).toBe('')
        expect(decodeUrl('')).toBe('')
    })

    it('非法输入（孤立 % / 非十六进制 / 截断序列）抛出 URIError', () => {
        expect(() => decodeUrl('%')).toThrow(URIError)
        expect(() => decodeUrl('%ZZ')).toThrow(URIError)
        expect(() => decodeUrl('%E4%B8')).toThrow(URIError)
    })
})

describe('html-lib（HTML 实体编解码）', () => {
    it('编码转义 & < > " \' 五个字符', () => {
        expect(encodeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;')
    })

    it('编码不改变普通字符与中文', () => {
        expect(encodeHtml('abc中文')).toBe('abc中文')
    })

    it('完整标签编码示例', () => {
        expect(encodeHtml('<a href="x">Tom & Jerry\'s</a>')).toBe(
            '&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;'
        )
    })

    it('解码常用命名实体（最小集）', () => {
        expect(decodeHtml('&amp;')).toBe('&')
        expect(decodeHtml('&lt;')).toBe('<')
        expect(decodeHtml('&gt;')).toBe('>')
        expect(decodeHtml('&quot;')).toBe('"')
        expect(decodeHtml('&#39;')).toBe("'")
        expect(decodeHtml('&nbsp;')).toBe('\u00A0')
    })

    it('解码扩展命名实体（copy/reg/trade）', () => {
        expect(decodeHtml('&copy;&reg;&trade;')).toBe('©®™')
    })

    it('解码数字实体 &#nn; 与 &#xhh;（大小写十六进制均可）', () => {
        expect(decodeHtml('&#20013;')).toBe('中')
        expect(decodeHtml('&#x4E2D;')).toBe('中')
        expect(decodeHtml('&#X4e2d;')).toBe('中')
        expect(decodeHtml('&#97;&#x61;')).toBe('aa')
    })

    it('单趟解码：&amp;lt; 只还原为 &lt;（不二次解码）', () => {
        expect(decodeHtml('&amp;lt;')).toBe('&lt;')
    })

    it('未收录命名实体与非法数字实体原样保留', () => {
        expect(decodeHtml('&unknown;')).toBe('&unknown;')
        expect(decodeHtml('&#xZZ;')).toBe('&#xZZ;')
        // 超出 Unicode 码点范围（0x110000 > 0x10FFFF）
        expect(decodeHtml('&#x110000;')).toBe('&#x110000;')
    })

    it('编码后再解码还原原文（含中文与属性引号）', () => {
        const original = '<div title="Tom & Jerry\'s">中&文</div>'
        expect(decodeHtml(encodeHtml(original))).toBe(original)
    })

    it('空串编解码返回空串', () => {
        expect(encodeHtml('')).toBe('')
        expect(decodeHtml('')).toBe('')
    })
})

describe('unicode-lib（Unicode 与实体互转）', () => {
    it('中文转 \\uXXXX（小写十六进制，ASCII 原样保留）', () => {
        expect(textToUnicode('中文')).toBe('\\u4e2d\\u6587')
        expect(textToUnicode('abc123')).toBe('abc123')
        expect(textToUnicode('A中1')).toBe('A\\u4e2d1')
    })

    it('\\uXXXX 转中文（十六进制大小写均可）', () => {
        expect(unicodeToText('\\u4e2d\\u6587')).toBe('中文')
        expect(unicodeToText('\\u4E2D')).toBe('中')
    })

    it('emoji 按 UTF-16 代理对输出并往返可逆', () => {
        expect(textToUnicode('😀')).toBe('\\ud83d\\ude00')
        expect(unicodeToText('\\ud83d\\ude00')).toBe('😀')
    })

    it('textToUnicode / unicodeToText 正常往返（中文/emoji/空串）', () => {
        for (const text of ['', '中文Hello 123!😀', '你好世界']) {
            expect(unicodeToText(textToUnicode(text))).toBe(text)
        }
    })

    it('ASCII 转 &#十进制; 实体', () => {
        expect(asciiToEntity('abc')).toBe('&#97;&#98;&#99;')
        expect(asciiToEntity('中')).toBe('&#20013;')
    })

    it('数字实体转文本（十进制与十六进制）', () => {
        expect(entityToAscii('&#97;&#98;&#99;')).toBe('abc')
        expect(entityToAscii('&#20013;')).toBe('中')
        expect(entityToAscii('&#x4e2d;')).toBe('中')
    })

    it('asciiToEntity / entityToAscii 正常往返（含 emoji）', () => {
        for (const text of ['', 'abc中😀', 'Hello 白泽!']) {
            expect(entityToAscii(asciiToEntity(text))).toBe(text)
        }
    })

    it('无实体/无转义序列的输入原样返回', () => {
        expect(entityToAscii('no entities')).toBe('no entities')
        expect(unicodeToText('no sequences')).toBe('no sequences')
    })

    it('空串返回空串', () => {
        expect(textToUnicode('')).toBe('')
        expect(unicodeToText('')).toBe('')
        expect(asciiToEntity('')).toBe('')
        expect(entityToAscii('')).toBe('')
    })
})

describe('image-base64-lib（图片字节 ↔ Base64）', () => {
    it('字节 → Base64 经典向量', () => {
        expect(bytesToBase64(Uint8Array.from([77, 97, 110]))).toBe('TWFu')
    })

    it('正常往返：UTF-8 字节序列', () => {
        const bytes = new TextEncoder().encode('中文图片😀')
        expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes))
    })

    it('超过 24576 字节分块边界仍正确往返', () => {
        const large = new Uint8Array(50000)
        for (let i = 0; i < large.length; i++) {
            large[i] = i % 256
        }
        expect(Array.from(base64ToBytes(bytesToBase64(large)))).toEqual(Array.from(large))
    })

    it('空字节数组编解码返回空', () => {
        expect(bytesToBase64(new Uint8Array(0))).toBe('')
        expect(base64ToBytes('')).toHaveLength(0)
    })

    it('Base64 → 字节容忍空白与换行', () => {
        expect(Array.from(base64ToBytes('T W\nFu'))).toEqual([77, 97, 110])
    })

    it('自动剥离 DataURL 前缀', () => {
        expect(Array.from(base64ToBytes('data:image/png;base64,TWFu'))).toEqual([77, 97, 110])
    })

    it('非法 Base64 字符抛出异常', () => {
        expect(() => base64ToBytes('!!@@')).toThrow()
        // 长度对 4 取余为 1 的串无法解码
        expect(() => base64ToBytes('A')).toThrow()
    })
})
