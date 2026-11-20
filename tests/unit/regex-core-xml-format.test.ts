// @vitest-environment jsdom
/**
 * 纯函数库分支补测（覆盖率补测第四批）：regex-core.ts + xml-format-lib.ts
 *
 * 两个文件均为纯函数/词法解析核心库，既有用例聚焦正常路径，主要缺口集中在：
 * 1. regex-core：V8 编译错误 → 中文提示的 9 类映射、替换模板 $&/$1/$`/$'/$<name>/$12
 *    的全部展开分支、输入/输出长度防护（表达式/文本/替换模板/替换结果）；
 * 2. xml-format-lib：词法错误（注释/CDATA/PI/DOCTYPE 未闭合、标签未结束）、
 *    DOCTYPE 内部子集与注释、token/层次上限、DOMParser 校验失败与环境缺失降级、
 *    xml:space="preserve" 与文本敏感子树的原样保留。
 */
import { describe, it, expect, vi } from 'vitest'
import {
    compileRegex,
    runRegexCore,
    substituteReplace,
    MAX_INPUT_LENGTH,
    MAX_MATCHES,
    MAX_OUTPUT_LENGTH,
    MAX_PATTERN_LENGTH,
    MAX_REPLACEMENT_LENGTH,
    type RegexMatch
} from '../../src/renderer/src/components/PluginTools/NetWork/regex-core'
import {
    formatXml,
    minifyXml
} from '../../src/renderer/src/components/PluginTools/FormatTools/xml-format-lib'

/* ============================== 一、regex-core：编译错误中文化 ============================== */

describe('regex-core：V8 语法错误 → 中文提示', () => {
    const cases: Array<[string, string, string]> = [
        ['[', 'Unterminated character class', '字符类未闭合'],
        ['(', 'Unterminated group', '分组未闭合'],
        ['*', 'Nothing to repeat', '量词前缺少可重复的内容'],
        ['[z-a]', 'Range out of order', '字符范围顺序不正确'],
        ['a{3,1}', 'numbers out of order', '量词范围不正确'],
        ['(?<a>x)(?<a>y)', 'Duplicate capture', '捕获组名称重复'],
        ['(?<1a>x)', 'Invalid capture group name', '捕获组名称不合法'],
        ['\\p{Foo}', 'Invalid property name', '转义或 Unicode 属性写法不正确'],
        ['(?z)', 'Invalid group', '分组写法不正确'],
        [')', 'Unmatched', '出现多余的右括号'],
        ['a{', 'Incomplete quantifier', '正则语法不正确']
    ]

    for (const [pattern, , expected] of cases) {
        it(`compileRegex(${JSON.stringify(pattern)}) → ${expected}`, () => {
            let error: unknown
            try {
                compileRegex(pattern, 'u', 'text')
            } catch (caught) {
                error = caught
            }
            expect(error).toBeInstanceOf(Error)
            expect((error as Error).message).toContain(expected)
            // 原始错误通过 cause 保留，便于诊断
            expect((error as Error).cause).toBeInstanceOf(Error)
        })
    }

    it('非法转义命中 escape 分支，无法归类的错误走兜底文案', () => {
        // Invalid escape：命中「转义或 Unicode 属性写法不正确」
        expect(() => compileRegex('\\q', 'u', '')).toThrow('转义或 Unicode 属性写法不正确')
        // Incomplete quantifier 不匹配任何专项映射：走兜底中文提示（describeSyntaxError 末行）
        expect(() => compileRegex('a{', 'u', '')).toThrow(
            '正则语法不正确，请检查括号、量词、字符类和转义。'
        )
    })
})

describe('regex-core：参数与长度校验', () => {
    it('表达式/文本类型与长度上限', () => {
        expect(() => compileRegex(null as unknown as string, '', '')).toThrow('表达式最长')
        expect(() => compileRegex('a'.repeat(MAX_PATTERN_LENGTH + 1), '', '')).toThrow('表达式最长')
        expect(() => compileRegex('a', '', null as unknown as string)).toThrow('测试文本最长')
        expect(() => compileRegex('a', '', 'x'.repeat(MAX_INPUT_LENGTH + 1))).toThrow(
            '测试文本最长'
        )
        // 边界值本身合法
        expect(() => compileRegex('a'.repeat(MAX_PATTERN_LENGTH), '', '')).not.toThrow()
        expect(() => compileRegex('a', '', 'x'.repeat(MAX_INPUT_LENGTH))).not.toThrow()
    })

    it('修饰符非法 / 重复 / u 与 v 互斥', () => {
        expect(() => compileRegex('a', null as unknown as string, '')).toThrow('修饰符不正确')
        expect(() => compileRegex('a', 'x', '')).toThrow('修饰符不正确')
        expect(() => compileRegex('a', 'gg', '')).toThrow('修饰符不正确')
        expect(() => compileRegex('a', 'uv', '')).toThrow('u 和 v 不能同时启用')
        expect(() => compileRegex('a', 'dgimsyu', '')).not.toThrow()
    })
})

/* ============================== 二、regex-core：匹配执行 ============================== */

describe('regex-core：runRegexCore 匹配与零宽推进', () => {
    it('非全局标志只返回首个匹配（命中 break 分支）', () => {
        const matches = runRegexCore('a', '', 'aaa')
        expect(matches).toHaveLength(1)
        expect(matches[0].index).toBe(0)
    })

    it('全局标志收集全部匹配并保留捕获组与命名组', () => {
        const matches = runRegexCore('(?<word>[a-z]+)-(\\d+)', 'g', 'ab-1 cd-22')
        expect(matches).toHaveLength(2)
        expect(matches[0].match).toBe('ab-1')
        expect(matches[0].groups).toEqual(['ab', '1'])
        expect(matches[0].namedGroups).toEqual({ word: 'ab' })
        expect(matches[1].groups).toEqual(['cd', '22'])
    })

    it('非 unicode 零宽匹配逐码元推进', () => {
        const matches = runRegexCore('(?=a)', 'g', 'aaa')
        expect(matches).toHaveLength(3)
        expect(matches.map((m) => m.index)).toEqual([0, 1, 2])
    })

    it('unicode 零宽匹配跳过代理对（不把 emoji 拆成两半）', () => {
        const matches = runRegexCore('(?=.)', 'gu', '😀😀')
        expect(matches).toHaveLength(2)
        expect(matches.map((m) => m.index)).toEqual([0, 2])
    })

    it('达到 5000 条上限时截断并置 truncated 标志', () => {
        const matches = runRegexCore('a', 'g', 'a'.repeat(MAX_MATCHES + 1))
        expect(matches).toHaveLength(MAX_MATCHES)
        expect(matches.truncated).toBe(true)
        expect(runRegexCore('a', 'g', 'a').truncated).toBeUndefined()
    })
})

/* ============================== 三、regex-core：替换展开 ============================== */

/** 从输入中收集匹配，供替换用例复用 */
function matchAll(pattern: string, flags: string, input: string): RegexMatch[] {
    return runRegexCore(pattern, flags, input)
}

describe('regex-core：substituteReplace 模板展开', () => {
    it("$& / $` / $' / $$ 与普通文本", () => {
        const matches = matchAll('b', 'g', 'a b c')
        expect(substituteReplace('a b c', '<$&>', matches)).toBe('a <b> c')
        expect(substituteReplace('a b c', '[$`]', matches)).toBe('a [a ] c')
        expect(substituteReplace('a b c', "[$']", matches)).toBe('a [ c] c')
        expect(substituteReplace('a b c', '$$', matches)).toBe('a $ c')
        expect(substituteReplace('a b c', 'plain', matches)).toBe('a plain c')
    })

    it('$1 / $2（越界保持字面量）/ $12（两位数字拆分）', () => {
        const matches = matchAll('(a)(b)', 'g', 'ab')
        expect(matches[0].groups).toEqual(['a', 'b'])
        expect(substituteReplace('ab', '$1-$2', matches)).toBe('a-b')
        // 越界组号保持原字面量
        expect(substituteReplace('ab', '$3', matches)).toBe('$3')
        // $12 且只有 2 个组：$1 + '2'
        expect(substituteReplace('ab', '$12', matches)).toBe('a2')
        // $0 不在支持语法内，按原样保留
        expect(substituteReplace('ab', '$0', matches)).toBe('$0')
    })

    it('$<name>：有命名组取组值，无命名组保持字面量', () => {
        const named = matchAll('(?<year>\\d+)-(?<month>\\d+)', 'g', '2026-11')
        expect(substituteReplace('2026-11', '$<year>/<$<month>>', named)).toBe('2026/<11>')

        const plain = matchAll('\\d+', 'g', '42')
        expect(substituteReplace('42', '$<year>', plain)).toBe('$<year>')
    })

    it('多段模板混合展开与零宽匹配不消耗字符', () => {
        const matches = matchAll('(?=b)', 'g', 'ab')
        expect(substituteReplace('ab', '[$&]', matches)).toBe('a[]b')
        const digits = matchAll('(\\d)', 'g', '1 2 3')
        expect(substituteReplace('1 2 3', '<$1>', digits)).toBe('<1> <2> <3>')
    })

    it('替换模板长度上限', () => {
        expect(() => substituteReplace('text', 'x'.repeat(MAX_REPLACEMENT_LENGTH + 1), [])).toThrow(
            '替换内容最长'
        )
        expect(() => substituteReplace('text', null as unknown as string, [])).toThrow(
            '替换内容最长'
        )
    })

    it('替换结果超过 200 万字符：循环中/收尾两处防护均生效', () => {
        // 循环内防护：4001 条匹配 × 500 字符模板已超过 200 万
        const many = matchAll('a', 'g', 'a'.repeat(5000))
        expect(() => substituteReplace('a'.repeat(5000), 'x'.repeat(500), many)).toThrow(
            `替换结果超过 ${MAX_OUTPUT_LENGTH}`
        )

        // 收尾防护：恰好 200 万 + 尾部 1 字符（循环中不超过上限，最终结果超限）
        const exact = matchAll('a', 'g', 'a'.repeat(5000))
        const replacement = 'x'.repeat(400) // 5000 × 400 = 2,000,000
        const input = 'a'.repeat(5000) + 'b'
        expect(() => substituteReplace(input, replacement, exact)).toThrow(
            `替换结果超过 ${MAX_OUTPUT_LENGTH}`
        )
    })
})

/* ============================== 四、xml-format-lib：词法与布局 ============================== */

describe('xml-format-lib：正常格式化 / 压缩', () => {
    it('嵌套标签按 indentSize 缩进，自闭合与文本节点正确布局', () => {
        const formatted = formatXml('<root><a x="1">text</a><b/></root>', 2)
        expect(formatted).toBe(['<root>', '  <a x="1">text</a>', '  <b/>', '</root>'].join('\n'))
        expect(formatXml('<root><a/></root>', 0)).toBe('<root>\n <a/>\n</root>')
        expect(formatXml('<root><a/></root>', 20)).toBe(
            '<root>\n' + ' '.repeat(8) + '<a/>\n</root>'
        )
    })

    it('压缩模式去除标签间空白但保留文本敏感子树', () => {
        expect(minifyXml('<root>\n  <a/>\n  <b>text</b>\n</root>')).toBe(
            '<root><a/><b>text</b></root>'
        )
        // 无换行的纯空白文本被视为行内空格，子树原样保留
        const inline = '<p><b>x</b> <i>y</i></p>'
        expect(minifyXml(`<root>${inline}</root>`)).toContain(inline)
    })

    it('CDATA / 注释 / 处理指令 / DOCTYPE 均原样保留', () => {
        const xml = [
            '<?xml version="1.0"?>',
            '<!DOCTYPE note [',
            '  <!ELEMENT note (#PCDATA)>',
            '  <!-- 注释 -->',
            ']>',
            '<note><![CDATA[a<b]]><!-- c --></note>'
        ].join('\n')
        const formatted = formatXml(xml, 2)
        expect(formatted).toContain('<![CDATA[a<b]]>')
        expect(formatted).toContain('<!-- c -->')
        expect(formatted).toContain('<?xml version="1.0"?>')
        expect(formatted).toContain('<!DOCTYPE note [')
    })

    it('xml:space="preserve" 子树整段原样保留', () => {
        const inner = '<code xml:space="preserve">  a  b  </code>'
        const formatted = formatXml(`<root>${inner}<x/></root>`)
        expect(formatted).toContain(inner)
    })
})

describe('xml-format-lib：词法错误与上限防护', () => {
    it('注释 / CDATA / 处理指令缺少结束标记时抛出明确错误', () => {
        expect(() => formatXml('<a><!-- x</a>')).toThrow('注释缺少结束标记')
        expect(() => formatXml('<a><![CDATA[x</a>')).toThrow('CDATA 缺少结束标记')
        expect(() => formatXml('<a><?pi x</a>')).toThrow('处理指令缺少结束标记')
    })

    it('标签未结束 / DOCTYPE 未结束', () => {
        expect(() => formatXml('<a x="1"')).toThrow('标签或 DOCTYPE 未结束')
        expect(() => formatXml('<!DOCTYPE a [ <!ELEMENT a ANY>')).toThrow('标签或 DOCTYPE 未结束')
        expect(() => formatXml('<!DOCTYPE a [ <!-- 未结束 ]>')).toThrow('DOCTYPE 注释未结束')
    })

    it('标签不匹配 / 未闭合 / 多余闭合标签', () => {
        expect(() => formatXml('<a></b>')).toThrow('XML 开始与结束标签不匹配')
        expect(() => formatXml('<a><b></b>')).toThrow('XML 标签没有完整闭合')
        expect(() => formatXml('</a>')).toThrow('XML 开始与结束标签不匹配')
    })

    it('节点数/嵌套层次上限', () => {
        expect(() => formatXml('<a/>'.repeat(150_001))).toThrow('XML 节点过多')
        const deep = '<a>'.repeat(256) + '</a>'.repeat(256)
        expect(() => formatXml(deep)).toThrow('XML 层次超过 255 层')
    })

    it('DOMParser 校验失败（词法可过但 XML 语法非法）', () => {
        expect(() => minifyXml('<a b=1></a>')).toThrow('XML 校验失败')
        expect(() => minifyXml('<a>&bad;</a>')).toThrow('XML 校验失败')
    })

    it('DOMParser 不可用时跳过校验（Node 环境降级）', () => {
        vi.stubGlobal('DOMParser', undefined)
        try {
            expect(() => minifyXml('<a b=1></a>')).not.toThrow('XML 校验失败')
            expect(formatXml('<a><b/></a>')).toContain('<a>')
        } finally {
            vi.unstubAllGlobals()
        }
    })
})
