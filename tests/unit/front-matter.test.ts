import { describe, expect, it } from 'vitest'
import {
    parseFrontMatter,
    removeFrontMatter,
    serializeFrontMatter,
    updateFrontMatter
} from '../../src/shared/utils/front-matter'
import type { FrontMatterValue, ParsedFrontMatter } from '../../src/shared/utils/front-matter'

/** 断言 body / endOffset 不变式：body 恒等于原 markdown 从 endOffset 起的切片 */
function expectBodyInvariant(markdown: string, parsed: ParsedFrontMatter): void {
    expect(parsed.body).toBe(markdown.slice(parsed.endOffset))
}

describe('parseFrontMatter：无 front matter / 定界符边界', () => {
    it('普通 Markdown 视为无 front matter，正文逐字保留', () => {
        const markdown = '# 白泽笔记\n\n第一段正文。\n'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.present).toBe(false)
        expect(parsed.data).toEqual({})
        expect(parsed.keyOrder).toEqual([])
        expect(parsed.raw).toBe('')
        expect(parsed.body).toBe(markdown)
        expect(parsed.endOffset).toBe(0)
        expectBodyInvariant(markdown, parsed)
    })

    it('开头出现空行或缩进时 --- 不被识别为 front matter', () => {
        const blankLineFirst = '\n---\ntitle: x\n---\n'
        expect(parseFrontMatter(blankLineFirst).present).toBe(false)
        expect(parseFrontMatter(blankLineFirst).body).toBe(blankLineFirst)

        const indented = '  ---\ntitle: x\n---\n'
        expect(parseFrontMatter(indented).present).toBe(false)
    })

    it('----、---foo 等非标准开头不算开头定界符', () => {
        expect(parseFrontMatter('----\ntitle: x\n---\n').present).toBe(false)
        expect(parseFrontMatter('---foo\ntitle: x\n---\n').present).toBe(false)
    })

    it('缺少闭合定界符时按无 front matter 处理，正文逐字保留', () => {
        const markdown = '---\ntitle: 白泽\n\n正文\n'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.present).toBe(false)
        expect(parsed.data).toEqual({})
        expect(parsed.raw).toBe('')
        expect(parsed.body).toBe(markdown)
        expect(parsed.endOffset).toBe(0)
    })

    it('只有开头定界符或空文本均不抛错、不视为 front matter', () => {
        expect(parseFrontMatter('---').present).toBe(false)
        expect(parseFrontMatter('---').body).toBe('---')
        expect(parseFrontMatter('---\n').present).toBe(false)
        expect(parseFrontMatter('').present).toBe(false)
        expect(parseFrontMatter('').body).toBe('')
        expect(parseFrontMatter('').endOffset).toBe(0)
    })

    it('空块（--- 紧接 ---）视为存在但无字段', () => {
        const markdown = '---\n---\n正文'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.present).toBe(true)
        expect(parsed.data).toEqual({})
        expect(parsed.keyOrder).toEqual([])
        expect(parsed.raw).toBe('')
        expect(parsed.body).toBe('正文')
        expect(parsed.endOffset).toBe(markdown.indexOf('正文'))
        expectBodyInvariant(markdown, parsed)
    })

    it('定界符允许行尾空白，闭合后正文从下一行开始', () => {
        const markdown = '--- \ntitle: x\n---\t\n正文'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.present).toBe(true)
        expect(parsed.data).toEqual({ title: 'x' })
        expect(parsed.raw).toBe('title: x\n')
        expect(parsed.body).toBe('正文')
    })

    it('支持 YAML 结束标记 ... 作为闭合定界符', () => {
        const markdown = '---\ntitle: x\n...\n正文'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.present).toBe(true)
        expect(parsed.raw).toBe('title: x\n')
        expect(parsed.body).toBe('正文')
    })

    it('闭合定界符可以是文件最后一行（无尾随换行）', () => {
        const markdown = '---\ntitle: x\n---'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.present).toBe(true)
        expect(parsed.data).toEqual({ title: 'x' })
        expect(parsed.body).toBe('')
        expect(parsed.endOffset).toBe(markdown.length)
    })

    it('正文中的 --- 不会被误判（只有文件开头才能识别）', () => {
        const markdown = '前言\n---\ntitle: x\n---\n'
        expect(parseFrontMatter(markdown).present).toBe(false)
        expect(parseFrontMatter(markdown).body).toBe(markdown)
    })
})

describe('parseFrontMatter：BOM 与 CRLF', () => {
    it('UTF-8 BOM：仍能识别块，body 不含 BOM', () => {
        const markdown = '\uFEFF---\ntitle: 白泽\n---\n正文'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.present).toBe(true)
        expect(parsed.data).toEqual({ title: '白泽' })
        expect(parsed.raw).toBe('title: 白泽\n')
        expect(parsed.body).toBe('正文')
        expect(parsed.endOffset).toBe(markdown.indexOf('正文'))
        expectBodyInvariant(markdown, parsed)
    })

    it('无 front matter 时 BOM 不进入 body，endOffset 指向 BOM 之后', () => {
        const markdown = '\uFEFF# 标题'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.present).toBe(false)
        expect(parsed.body).toBe('# 标题')
        expect(parsed.endOffset).toBe(1)
        expectBodyInvariant(markdown, parsed)
    })

    it('仅 BOM 视为空文档', () => {
        const parsed = parseFrontMatter('\uFEFF')
        expect(parsed.present).toBe(false)
        expect(parsed.body).toBe('')
        expect(parsed.endOffset).toBe(1)
    })

    it('CRLF 行尾：data / raw / body 均正确，raw 保留 CRLF', () => {
        const markdown = '---\r\ntitle: x\r\n---\r\n正文\r\n'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.present).toBe(true)
        expect(parsed.data).toEqual({ title: 'x' })
        expect(parsed.raw).toBe('title: x\r\n')
        expect(parsed.body).toBe('正文\r\n')
        expect(parsed.endOffset).toBe(markdown.indexOf('正文'))
        expectBodyInvariant(markdown, parsed)
    })

    it('CRLF 且缺闭合定界符：正文逐字保留', () => {
        const markdown = '---\r\ntitle: x\r\n正文\r\n'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.present).toBe(false)
        expect(parsed.body).toBe(markdown)
        expect(parsed.endOffset).toBe(0)
    })
})

describe('parseFrontMatter：标量解析', () => {
    it('字符串 / 数字 / 布尔 / null 按类型解析并保持 keyOrder', () => {
        const markdown = `---
title: 白泽笔记
count: 42
ratio: 3.14
draft: true
archived: FALSE
cover: null
alias: ~
---
# 标题
`
        const parsed = parseFrontMatter(markdown)
        expect(parsed.present).toBe(true)
        expect(parsed.data).toEqual({
            title: '白泽笔记',
            count: 42,
            ratio: 3.14,
            draft: true,
            archived: false,
            cover: null,
            alias: null
        })
        expect(parsed.keyOrder).toEqual([
            'title',
            'count',
            'ratio',
            'draft',
            'archived',
            'cover',
            'alias'
        ])
        expect(parsed.body).toBe('# 标题\n')
        expect(parsed.endOffset).toBe(markdown.indexOf('# 标题'))
        expect(parsed.raw).toBe(
            'title: 白泽笔记\ncount: 42\nratio: 3.14\ndraft: true\narchived: FALSE\ncover: null\nalias: ~\n'
        )
    })

    it('空值键（key: 后面没有值）解析为 null', () => {
        const markdown = '---\ntitle:\ndraft:\n---\n'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.data).toEqual({ title: null, draft: null })
        expect(parsed.keyOrder).toEqual(['title', 'draft'])
    })

    it('单引号 / 双引号字符串按引号内原文解析', () => {
        const markdown = `---
title: 'It''s a note'
subtitle: "Hello # World"
colon: "a: b"
---
`
        const parsed = parseFrontMatter(markdown)
        expect(parsed.data).toEqual({
            title: "It's a note",
            subtitle: 'Hello # World',
            colon: 'a: b'
        })
    })

    it('引号包裹的数字 / 布尔保持字符串类型', () => {
        const markdown = `---
code: "42"
flag: 'true'
---
`
        expect(parseFrontMatter(markdown).data).toEqual({ code: '42', flag: 'true' })
    })

    it('数字支持负数、正号、小数、科学计数法与省略整数位', () => {
        const markdown = `---
negative: -1
signed: +2
decimal: 1.5
exponent: 1e3
leadingDot: .5
---
`
        expect(parseFrontMatter(markdown).data).toEqual({
            negative: -1,
            signed: 2,
            decimal: 1.5,
            exponent: 1000,
            leadingDot: 0.5
        })
    })

    it('布尔大小写不敏感，null 兼容 ~ 与大小写变体', () => {
        const markdown = `---
upper: TRUE
mixed: False
tilde: ~
capitalized: Null
---
`
        expect(parseFrontMatter(markdown).data).toEqual({
            upper: true,
            mixed: false,
            tilde: null,
            capitalized: null
        })
    })

    it('值中的冒号按普通字符串保留（只按首个冒号拆键值）', () => {
        const markdown = '---\ntitle: Hello: world\n---\n'
        expect(parseFrontMatter(markdown).data).toEqual({ title: 'Hello: world' })
    })

    it('引号内 # 不算注释，空格后的 # 才开启行尾注释', () => {
        const markdown = `---
hash: "含 # 的值"
plain: a#b
comment: value # 注释
onlyComment: # 只有注释
---
`
        expect(parseFrontMatter(markdown).data).toEqual({
            hash: '含 # 的值',
            plain: 'a#b',
            comment: 'value',
            onlyComment: null
        })
    })

    it('裸键可含点与短横线，日期类值保持字符串', () => {
        const markdown = '---\ncreated.at: 2026-11-21\nmy-key: ok\n---\n'
        expect(parseFrontMatter(markdown).data).toEqual({
            'created.at': '2026-11-21',
            'my-key': 'ok'
        })
    })

    it('引号键（含空格 / 中文）可解析', () => {
        const markdown = `---
"my key": value
'另一个键': 值
---
`
        const parsed = parseFrontMatter(markdown)
        expect(parsed.data).toEqual({ 'my key': 'value', 另一个键: '值' })
        expect(parsed.keyOrder).toEqual(['my key', '另一个键'])
    })

    it('未加引号的中文裸键不被解析（需加引号），其余键正常', () => {
        const markdown = '---\n标题: 值\ntitle: ok\n---\n'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.data).toEqual({ title: 'ok' })
        expect(parsed.keyOrder).toEqual(['title'])
    })
})

describe('parseFrontMatter：数组解析', () => {
    it('行内数组支持引号、逗号与尾随逗号', () => {
        const markdown = `---
tags: [alpha, "beta gamma", 'c, d', 3]
trailing: [a, b, ]
empty: []
---
`
        expect(parseFrontMatter(markdown).data).toEqual({
            tags: ['alpha', 'beta gamma', 'c, d', 3],
            trailing: ['a', 'b'],
            empty: []
        })
    })

    it('行内数组允许行尾注释，引号内的 # 保留', () => {
        const markdown = `---
tags: [a, "b # c"] # 注释
---
`
        expect(parseFrontMatter(markdown).data).toEqual({ tags: ['a', 'b # c'] })
    })

    it('行内数组中的映射项视为不支持结构，整键跳过', () => {
        const markdown = '---\ntags: [a: b]\ntitle: ok\n---\n'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.data).toEqual({ title: 'ok' })
        expect(parsed.keyOrder).toEqual(['title'])
    })

    it('未闭合的行内数组整键跳过（不抛错）', () => {
        const markdown = '---\ntags: [a, b\ntitle: ok\n---\n'
        expect(parseFrontMatter(markdown).data).toEqual({ title: 'ok' })
    })

    it('块数组：缩进 - item 支持引号 / 数字 / 布尔 / 空行 / 注释', () => {
        const markdown = `---
tags:
  - alpha
  - "beta gamma"

  # 中间注释
  - 3
  - true # 行尾注释
draft: false
---
`
        const parsed = parseFrontMatter(markdown)
        expect(parsed.data).toEqual({
            tags: ['alpha', 'beta gamma', 3, true],
            draft: false
        })
        expect(parsed.keyOrder).toEqual(['tags', 'draft'])
        expect(parsed.body).toBe('')
    })

    it('块数组项单独一个 - 解析为 null', () => {
        const markdown = `---
queue:
  -
  - beta
---
`
        expect(parseFrontMatter(markdown).data).toEqual({ queue: [null, 'beta'] })
    })

    it('块数组只有注释 / 空行时该键值为 null', () => {
        const markdown = `---
tags:
  # 没有数组项
draft: false
---
`
        expect(parseFrontMatter(markdown).data).toEqual({ tags: null, draft: false })
    })
})

describe('parseFrontMatter：复杂结构与非法行', () => {
    it('嵌套块映射不被强行解析：该键跳过，后续顶层键正常解析', () => {
        const markdown = `---
meta:
  nested: value
title: ok
---
`
        const parsed = parseFrontMatter(markdown)
        expect(parsed.data).toEqual({ title: 'ok' })
        expect(parsed.keyOrder).toEqual(['title'])
        expect(parsed.raw).toBe('meta:\n  nested: value\ntitle: ok\n')
    })

    it('行内对象（流程映射）不被解析：整键跳过', () => {
        const markdown = '---\nmeta: {a: 1}\ntitle: ok\n---\n'
        expect(parseFrontMatter(markdown).data).toEqual({ title: 'ok' })
    })

    it('块数组中的映射项导致整键跳过', () => {
        const markdown = `---
authors:
  - name: 白泽
  - beta
title: ok
---
`
        const parsed = parseFrontMatter(markdown)
        expect(parsed.data).toEqual({ title: 'ok' })
        expect(parsed.keyOrder).toEqual(['title'])
    })

    it('块数组缩进不一致（嵌套数组）整键跳过', () => {
        const markdown = `---
tags:
  - a
    - b
title: ok
---
`
        expect(parseFrontMatter(markdown).data).toEqual({ title: 'ok' })
    })

    it('重复键：后值覆盖前值，keyOrder 不重复', () => {
        const markdown = '---\na: 1\na: 2\nb: 3\n---\n'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.data).toEqual({ a: 2, b: 3 })
        expect(parsed.keyOrder).toEqual(['a', 'b'])
    })

    it('非法行 / 孤立缩进行 / 孤立数组项被静默跳过', () => {
        const markdown = `---
title: ok
this is not yaml
   indented: value
- orphan
draft: true
---
`
        const parsed = parseFrontMatter(markdown)
        expect(parsed.data).toEqual({ title: 'ok', draft: true })
        expect(parsed.keyOrder).toEqual(['title', 'draft'])
    })

    it('不支持的数值字面量（0x10 / 1_000）按字符串保留', () => {
        const markdown = '---\nhex: 0x10\nunderscore: 1_000\n---\n'
        expect(parseFrontMatter(markdown).data).toEqual({
            hex: '0x10',
            underscore: '1_000'
        })
    })

    it('未闭合引号按普通字符串原样保留，不抛错', () => {
        const markdown = '---\ntitle: "unclosed\n---\n'
        expect(parseFrontMatter(markdown).data).toEqual({ title: '"unclosed' })
    })

    it('正文中的 --- 水平线完整保留在 body 中', () => {
        const markdown = '---\ntitle: x\n---\n\n---\n\n正文'
        const parsed = parseFrontMatter(markdown)
        expect(parsed.body).toBe('\n---\n\n正文')
    })
})

describe('serializeFrontMatter：序列化', () => {
    it('按 keyOrder 输出，格式为 --- 包围的块', () => {
        const block = serializeFrontMatter({ title: '白泽', draft: true, tags: ['a', 'b'] }, [
            'tags',
            'title',
            'draft'
        ])
        expect(block).toBe('---\ntags:\n  - a\n  - b\ntitle: 白泽\ndraft: true\n---\n')
    })

    it('keyOrder 中不存在的键被忽略，data 中未列出的键追加在后', () => {
        const block = serializeFrontMatter({ a: 1, b: 2 }, ['b', 'ghost'])
        expect(block).toBe('---\nb: 2\na: 1\n---\n')
    })

    it('空数据返回空字符串，空数组输出 []', () => {
        expect(serializeFrontMatter({})).toBe('')
        expect(serializeFrontMatter({ tags: [] })).toBe('---\ntags: []\n---\n')
    })

    it('null / 布尔 / 数字原样输出', () => {
        const block = serializeFrontMatter({ a: null, b: false, c: 3.5 })
        expect(block).toBe('---\na: null\nb: false\nc: 3.5\n---\n')
    })

    it('特殊字符串自动加引号，可被解析回同值', () => {
        const data: Record<string, FrontMatterValue> = {
            bool: 'true',
            number: '42',
            spaced: ' a ',
            colon: 'a: b',
            hash: 'a # b',
            quote: "it's",
            multiline: 'line1\nline2',
            bracket: '[x]',
            empty: '',
            trailing: 'a:'
        }
        const parsed = parseFrontMatter(serializeFrontMatter(data))
        expect(parsed.present).toBe(true)
        expect(parsed.body).toBe('')
        expect(parsed.data).toEqual(data)
        expect(parsed.keyOrder).toEqual(Object.keys(data))
    })

    it('特殊字符串键加引号后可回读', () => {
        const data: Record<string, FrontMatterValue> = {
            'my key': 'value',
            中文键: '值',
            "it's": 'quote'
        }
        const parsed = parseFrontMatter(serializeFrontMatter(data))
        expect(parsed.data).toEqual(data)
        expect(parsed.keyOrder).toEqual(Object.keys(data))
    })

    it('serialize → parse → serialize 结果稳定', () => {
        const data: Record<string, FrontMatterValue> = {
            title: '白泽',
            tags: ['a', 'b'],
            draft: false
        }
        const first = serializeFrontMatter(data)
        const second = serializeFrontMatter(parseFrontMatter(first).data)
        expect(second).toBe(first)
    })

    it('parse(serialize(data, keyOrder)) 回读时保持 keyOrder', () => {
        const data: Record<string, FrontMatterValue> = {
            title: '白泽',
            tags: ['a', 'b'],
            draft: true,
            cover: null
        }
        const block = serializeFrontMatter(data, ['cover', 'tags', 'title', 'draft'])
        const parsed = parseFrontMatter(block)
        expect(parsed.keyOrder).toEqual(['cover', 'tags', 'title', 'draft'])
        expect(parsed.data).toEqual(data)
    })
})

describe('updateFrontMatter / removeFrontMatter：写入与移除', () => {
    it('无 front matter 且 data 非空时在文首插入块，正文不变', () => {
        const markdown = '# 标题\n正文'
        const updated = updateFrontMatter(markdown, { title: 'x' })
        expect(updated).toBe('---\ntitle: x\n---\n# 标题\n正文')
        expect(parseFrontMatter(updated).body).toBe(markdown)
    })

    it('已有 front matter 时替换块，正文不变', () => {
        const markdown = '---\ntitle: 旧\n---\n正文'
        const updated = updateFrontMatter(markdown, { title: '新' })
        expect(updated).toBe('---\ntitle: 新\n---\n正文')
    })

    it('data 为空时移除已有块；无块文档保持原样', () => {
        expect(updateFrontMatter('---\ntitle: x\n---\n正文', {})).toBe('正文')
        const plain = '# 标题\n正文'
        expect(updateFrontMatter(plain, {})).toBe(plain)
    })

    it('update 保持已有 CRLF 换行风格', () => {
        const markdown = '---\r\ntitle: 旧\r\n---\r\n正文\r\n'
        const updated = updateFrontMatter(markdown, { title: '新' })
        expect(updated).toBe('---\r\ntitle: 新\r\n---\r\n正文\r\n')
    })

    it('无 front matter 的 CRLF 文档插入 CRLF 块', () => {
        const markdown = '# 标题\r\n正文\r\n'
        const updated = updateFrontMatter(markdown, { title: 'x' })
        expect(updated).toBe('---\r\ntitle: x\r\n---\r\n# 标题\r\n正文\r\n')
    })

    it('update 保留 UTF-8 BOM', () => {
        const markdown = '\uFEFF---\ntitle: 旧\n---\n正文'
        const updated = updateFrontMatter(markdown, { title: '新' })
        expect(updated).toBe('\uFEFF---\ntitle: 新\n---\n正文')
        expect(parseFrontMatter(updated).body).toBe('正文')
    })

    it('无 front matter 的 BOM 文档插入块时 BOM 仍在首位', () => {
        const markdown = '\uFEFF# 标题'
        const updated = updateFrontMatter(markdown, { title: 'x' })
        expect(updated).toBe('\uFEFF---\ntitle: x\n---\n# 标题')
    })

    it('update 支持 keyOrder 指定键顺序', () => {
        const updated = updateFrontMatter('', { a: 1, b: 2 }, ['b'])
        expect(updated).toBe('---\nb: 2\na: 1\n---\n')
    })

    it('update 幂等：相同数据重复更新结果不变', () => {
        const data: Record<string, FrontMatterValue> = { title: 'x', tags: ['a'] }
        const first = updateFrontMatter('# 标题\n', data)
        const second = updateFrontMatter(first, data)
        expect(second).toBe(first)
    })

    it('update 后再次 parse：body 保持原正文', () => {
        const markdown = '---\ntitle: x\n---\n# 标题\n\n正文\n'
        const updated = updateFrontMatter(markdown, { title: 'y', tags: ['a'] })
        const parsed = parseFrontMatter(updated)
        expect(parsed.body).toBe('# 标题\n\n正文\n')
        expect(parsed.data).toEqual({ title: 'y', tags: ['a'] })
    })

    it('removeFrontMatter 移除块并保留正文与 BOM', () => {
        expect(removeFrontMatter('---\ntitle: x\n---\n正文')).toBe('正文')
        expect(removeFrontMatter('\uFEFF---\ntitle: x\n---\n正文')).toBe('\uFEFF正文')
        expect(removeFrontMatter('---\n---\n正文')).toBe('正文')
    })

    it('removeFrontMatter 对无 front matter 的文档逐字返回', () => {
        const markdown = '# 标题\r\n正文'
        expect(removeFrontMatter(markdown)).toBe(markdown)
    })

    it('update 与 remove 组合可恢复原正文', () => {
        const markdown = '# 标题\n正文\n'
        expect(removeFrontMatter(updateFrontMatter(markdown, { title: 'x' }))).toBe(markdown)
    })
})

describe('非法输入与空文档', () => {
    it('空字符串在各 API 中均不抛错', () => {
        expect(parseFrontMatter('').present).toBe(false)
        expect(parseFrontMatter('').body).toBe('')
        expect(serializeFrontMatter({})).toBe('')
        expect(updateFrontMatter('', {})).toBe('')
        expect(removeFrontMatter('')).toBe('')
    })

    it('未闭合的块 / 引号 / 数组均不抛错', () => {
        expect(() => parseFrontMatter('---\ntitle: x')).not.toThrow()
        expect(() => parseFrontMatter('---\ntitle: "unclosed\n---\n')).not.toThrow()
        expect(() => parseFrontMatter('---\ntags: [a, b\n---\n')).not.toThrow()
    })

    it('空文档 update 只写入 front matter 块', () => {
        expect(updateFrontMatter('', { title: 'x' })).toBe('---\ntitle: x\n---\n')
    })

    it('序列化空数组键与空数据的行为稳定', () => {
        expect(serializeFrontMatter({ tags: [] })).toBe('---\ntags: []\n---\n')
        expect(parseFrontMatter(serializeFrontMatter({ tags: [] })).data).toEqual({ tags: [] })
    })
})
