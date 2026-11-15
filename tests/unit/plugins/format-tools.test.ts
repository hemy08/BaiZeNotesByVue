// @vitest-environment jsdom
/**
 * 格式化工具插件纯函数单测（FormatTools：JSON 工具 / XML 格式化）—— 只测 .ts 纯函数，不 import .vue。
 * 网络工具正则测试（NetWork：regex-lib 异步 API / regex-worker 协议 / RegexTester 组件）
 * 已拆分至同目录 regex-lib.test.ts（P1-1：Web Worker 化 + 时间预算）。
 */
import { describe, it, expect } from 'vitest'

import {
    formatJson,
    minifyJson,
    escapeJson,
    unescapeJson
} from '@renderer/components/PluginTools/FormatTools/json-tool-lib'
import { formatXml, minifyXml } from '@renderer/components/PluginTools/FormatTools/xml-format-lib'

describe('JSON 工具（json-tool-lib）', () => {
    it('格式化：2 空格缩进的嵌套 JSON', () => {
        expect(formatJson('{"b":1,"a":[1,2]}')).toBe(
            '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}'
        )
        expect(formatJson('{"a":{"b":[1]}}')).toBe(
            '{\n  "a": {\n    "b": [\n      1\n    ]\n  }\n}'
        )
    })

    it('格式化：非法 JSON 报错且含位置信息', () => {
        expect(() => formatJson('{a:1}')).toThrow(/position|位置|行/)
        expect(() => formatJson('{"a":1,}')).toThrow(/position|位置|行/)
    })

    it('压缩：移除空白与换行', () => {
        expect(minifyJson('{ "a" : 1 ,\n  "b" : [ 1, 2 ] }')).toBe('{"a":1,"b":[1,2]}')
        expect(() => minifyJson('not json')).toThrow()
    })

    it('转义：引号、反斜杠、斜杠、换行、制表符', () => {
        expect(escapeJson('a"b')).toBe('a\\"b')
        expect(escapeJson('a\\b')).toBe('a\\\\b')
        expect(escapeJson('a/b')).toBe('a\\/b')
        expect(escapeJson('a\nb\rc\td')).toBe('a\\nb\\rc\\td')
    })

    it('去转义：修正原版缺陷（\\/ 还原为 / 而非空格）', () => {
        expect(unescapeJson('a\\/b')).toBe('a/b')
        expect(unescapeJson('a\\"b')).toBe('a"b')
        expect(unescapeJson('a\\\\b')).toBe('a\\b')
        expect(unescapeJson('a\\nb\\rc\\td')).toBe('a\nb\rc\td')
        expect(unescapeJson('a\\bb\\fc')).toBe('a\bb\fc')
    })

    it('转义往返：含引号、换行、制表符、反斜杠的文本可还原', () => {
        const raw = 'say "hi"\n\tline2\\end/'
        expect(unescapeJson(escapeJson(raw))).toBe(raw)
    })

    it('去转义：\\uXXXX 还原为对应字符', () => {
        expect(unescapeJson('\\u4e2d\\u56fd')).toBe('中国')
    })
})

describe('XML 格式化（xml-format-lib）', () => {
    it('嵌套缩进：默认 2 空格', () => {
        expect(formatXml('<root><a>1</a></root>')).toBe('<root>\n  <a>1</a>\n</root>')
        expect(formatXml('<root><a><b>2</b></a></root>')).toBe(
            '<root>\n  <a>\n    <b>2</b>\n  </a>\n</root>'
        )
    })

    it('自定义缩进空格数', () => {
        expect(formatXml('<root><a>1</a></root>', 4)).toBe('<root>\n    <a>1</a>\n</root>')
    })

    it('自闭合标签保持原样', () => {
        expect(formatXml('<root><a/><b x="1"/></root>')).toBe(
            '<root>\n  <a/>\n  <b x="1"/>\n</root>'
        )
    })

    it('CDATA 内容原样保留（含其中的尖括号与实体）', () => {
        const input = '<root><![CDATA[<x>&amp;</x>]]></root>'
        expect(formatXml(input)).toBe(input)
    })

    it('属性值内含 > 与引号不受影响', () => {
        expect(formatXml('<a b="x>y"><c/></a>')).toBe('<a b="x>y">\n  <c/>\n</a>')
    })

    it('注释与处理指令保留（非文本敏感节点按缩进重排，与原 core.js 行为一致）', () => {
        expect(formatXml('<?xml version="1.0"?><a><!-- 注释 --></a>')).toBe(
            '<?xml version="1.0"?>\n<a>\n  <!-- 注释 -->\n</a>'
        )
    })

    it('非法 XML 报错：标签不匹配 / 未闭合', () => {
        expect(() => formatXml('<a><b></a>')).toThrow(/不匹配/)
        expect(() => formatXml('<a>')).toThrow(/闭合/)
    })

    it('压缩：去除标签间空白，保留文本敏感内容', () => {
        expect(minifyXml('<root>\n  <a>1</a>\n  <b>2</b>\n</root>')).toBe(
            '<root><a>1</a><b>2</b></root>'
        )
    })

    it('压缩：含换行的文本内容原样保留', () => {
        const input = '<a>line1\nline2</a>'
        expect(minifyXml(input)).toBe(input)
        expect(formatXml(input)).toBe(input)
    })
})
