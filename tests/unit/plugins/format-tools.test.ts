// @vitest-environment jsdom
/**
 * 格式化工具插件纯函数单测（FormatTools：JSON 工具 / XML 格式化）
 * 与网络工具（NetWork：正则测试）—— 只测 .ts 纯函数，不 import .vue。
 */
import { describe, it, expect } from 'vitest'

import {
    formatJson,
    minifyJson,
    escapeJson,
    unescapeJson
} from '@renderer/components/PluginTools/FormatTools/json-tool-lib'
import { formatXml, minifyXml } from '@renderer/components/PluginTools/FormatTools/xml-format-lib'
import {
    runRegex,
    substituteReplace,
    MAX_MATCHES
} from '@renderer/components/PluginTools/NetWork/regex-lib'

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

describe('正则测试（regex-lib）', () => {
    it('g 全局多匹配：返回每条匹配的文本与位置', () => {
        const result = runRegex('\\w+', 'g', 'hello world')
        expect(result).toHaveLength(2)
        expect(result[0]).toMatchObject({ match: 'hello', index: 0 })
        expect(result[1]).toMatchObject({ match: 'world', index: 6 })
    })

    it('捕获组内容正确（数字组与命名组）', () => {
        const result = runRegex('(\\w)(\\d)', 'g', 'a1b2')
        expect(result).toHaveLength(2)
        expect(result[0].match).toBe('a1')
        expect(result[0].groups).toEqual(['a', '1'])
        expect(result[0].index).toBe(0)
        expect(result[1].groups).toEqual(['b', '2'])

        const named = runRegex('(?<word>\\w+)', 'g', 'hi you')
        expect(named[0].namedGroups).toEqual({ word: 'hi' })
    })

    it('零宽匹配不卡死：lastIndex 手动推进', () => {
        const result = runRegex('', 'g', 'abc')
        expect(result).toHaveLength(4) // 位置 0/1/2/3 各一个空匹配
        expect(result.map((m) => m.index)).toEqual([0, 1, 2, 3])
    })

    it('unicode 模式下零宽匹配跳过代理对', () => {
        // '𝄞' 为代理对（2 个 UTF-16 码元），u 下空匹配只在码元 0 与 2
        const result = runRegex('', 'gu', '𝄞')
        expect(result).toHaveLength(2)
        expect(result.map((m) => m.index)).toEqual([0, 2])
    })

    it('非法 pattern 报错（中文提示）', () => {
        expect(() => runRegex('(', 'g', 'abc')).toThrow(/括号|分组|语法/)
        expect(() => runRegex('[a-', 'g', 'abc')).toThrow(/字符类/)
    })

    it('u/v 互斥与非法标志报错', () => {
        expect(() => runRegex('a', 'uv', 'a')).toThrow(/互斥|不能同时/)
        expect(() => runRegex('a', 'gg', 'a')).toThrow(/修饰符/)
    })

    it('输入超 20 万字符报错', () => {
        expect(() => runRegex('a', 'g', 'a'.repeat(200_001))).toThrow(/超出限制|最长/)
    })

    it('匹配数超 5000 截断并置 truncated 标志', () => {
        const result = runRegex('', 'g', 'x'.repeat(MAX_MATCHES + 10))
        expect(result.length).toBe(MAX_MATCHES)
        expect(result.truncated).toBe(true)
    })

    it('替换：$1 捕获组展开', () => {
        const matches = runRegex('(\\w+)', 'g', 'hello world')
        expect(substituteReplace('hello world', '[$1]', matches)).toBe('[hello] [world]')
    })

    it('替换：$$ 输出字面 $，$& 输出完整匹配', () => {
        expect(substituteReplace('a', '$$', runRegex('a', 'g', 'a'))).toBe('$')
        expect(substituteReplace('ab', '<$&>', runRegex('a', 'g', 'ab'))).toBe('<a>b')
    })

    it('替换：零宽匹配逐位置插入且不吞字符', () => {
        expect(substituteReplace('abc', 'x', runRegex('', 'g', 'abc'))).toBe('xaxbxcx')
    })
})
