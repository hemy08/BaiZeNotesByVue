/**
 * A10 大纲增强纯函数单测（extractOutlinePlus / filterOutlineItems / computeOutlineIndent）：
 * 覆盖 ATX、setext（`===` / `---`）、代码围栏排除、层级缩进归一化、空标题回退、
 * 扫描行数/条数/超长行上限，以及过滤的大小写不敏感与空结果。
 */
import { describe, expect, it } from 'vitest'
import {
    computeOutlineIndent,
    extractOutlinePlus,
    filterOutlineItems,
    OUTLINE_PLUS_DEFAULT_LIMITS,
    type OutlinePlusSource
} from '../../src/renderer/src/components/Markdown/editor-outline-plus'

/** 字符串数组数据源适配（行号 1 基） */
function sourceFromLines(lines: string[]): OutlinePlusSource {
    return {
        lineCount: lines.length,
        getLineContent: (lineNumber: number) => lines[lineNumber - 1] ?? ''
    }
}

const EMPTY_TITLE = '（无标题）'

describe('ATX 标题提取', () => {
    it('识别 1~6 级标题、清理末尾闭合 #、保留出现顺序', () => {
        const items = extractOutlinePlus(
            sourceFromLines(['# 一级', '正文', '## 二级 ##', '### 三级']),
            EMPTY_TITLE
        )
        expect(items).toEqual([
            { line: 1, level: 1, text: '一级', indent: 0 },
            { line: 3, level: 2, text: '二级', indent: 1 },
            { line: 4, level: 3, text: '三级', indent: 2 }
        ])
    })

    it('空标题回退占位文案', () => {
        const items = extractOutlinePlus(sourceFromLines(['### ']), EMPTY_TITLE)
        expect(items).toHaveLength(1)
        expect(items[0].text).toBe(EMPTY_TITLE)
    })
})

describe('setext 标题提取', () => {
    it('`===` 识别为一级、`---` 识别为二级，标题行取上一行', () => {
        const items = extractOutlinePlus(
            sourceFromLines(['一级标题', '===', '', '二级标题', '---']),
            EMPTY_TITLE
        )
        expect(items).toEqual([
            { line: 1, level: 1, text: '一级标题', indent: 0 },
            { line: 4, level: 2, text: '二级标题', indent: 1 }
        ])
    })

    it('下划线上方是空行/列表/引用时不算 setext', () => {
        const items = extractOutlinePlus(
            sourceFromLines(['', '---', '- 列表项', '---', '> 引用', '---']),
            EMPTY_TITLE
        )
        expect(items).toEqual([])
    })

    it('下划线上方是 ATX 标题时不重复计入', () => {
        const items = extractOutlinePlus(sourceFromLines(['## 标题', '---']), EMPTY_TITLE)
        expect(items).toEqual([{ line: 1, level: 2, text: '标题', indent: 0 }])
    })

    it('围栏内的 setext 下划线不识别', () => {
        const items = extractOutlinePlus(
            sourceFromLines(['```', '标题', '===', '```']),
            EMPTY_TITLE
        )
        expect(items).toEqual([])
    })

    it('连续下划线不会把上一条下划线当标题文本（避免重复条目）', () => {
        const items = extractOutlinePlus(sourceFromLines(['标题', '===', '---']), EMPTY_TITLE)
        expect(items).toEqual([{ line: 1, level: 1, text: '标题', indent: 0 }])
    })

    it('ATX 与 setext 混排按行号输出', () => {
        const items = extractOutlinePlus(sourceFromLines(['# A', 'B', '===', '## C']), EMPTY_TITLE)
        expect(items.map((item) => `${item.line}:${item.level}:${item.text}`)).toEqual([
            '1:1:A',
            '2:1:B',
            '4:2:C'
        ])
    })
})

describe('代码围栏与上限', () => {
    it('围栏代码块内的 # 与 === 不识别为标题', () => {
        const items = extractOutlinePlus(
            sourceFromLines([
                '```md',
                '# 代码里的井号',
                '不是标题',
                '===',
                '```',
                '# 真标题',
                '~~~~',
                '## 代码里的二级',
                '~~~~'
            ]),
            EMPTY_TITLE
        )
        expect(items).toEqual([{ line: 6, level: 1, text: '真标题', indent: 0 }])
    })

    it('超过 maxScanLines 的标题不进入大纲', () => {
        const lines = ['# 一', '# 二', '# 三']
        const items = extractOutlinePlus(sourceFromLines(lines), EMPTY_TITLE, {
            ...OUTLINE_PLUS_DEFAULT_LIMITS,
            maxScanLines: 2
        })
        expect(items.map((item) => item.line)).toEqual([1, 2])
    })

    it('超过 maxItems 时截断', () => {
        const lines = Array.from({ length: 10 }, (_, index) => `# 标题${index}`)
        const items = extractOutlinePlus(sourceFromLines(lines), EMPTY_TITLE, {
            ...OUTLINE_PLUS_DEFAULT_LIMITS,
            maxItems: 3
        })
        expect(items).toHaveLength(3)
    })

    it('超长行不参与标题识别', () => {
        const longLine = `# ${'长'.repeat(OUTLINE_PLUS_DEFAULT_LIMITS.maxLineLength)}`
        const items = extractOutlinePlus(sourceFromLines([longLine, '# 正常']), EMPTY_TITLE)
        expect(items.map((item) => item.text)).toEqual(['正常'])
    })

    it('空文档返回空数组', () => {
        expect(extractOutlinePlus(sourceFromLines([]), EMPTY_TITLE)).toEqual([])
    })
})

describe('层级缩进归一化', () => {
    it('最浅标题为 0，其余按相对层数缩进', () => {
        const items = extractOutlinePlus(
            sourceFromLines(['## 一级（文档最浅）', '### 二级', '#### 三级']),
            EMPTY_TITLE
        )
        expect(items.map((item) => item.indent)).toEqual([0, 1, 2])
    })

    it('computeOutlineIndent 对更浅层级钳制为 0', () => {
        expect(computeOutlineIndent(1, 3)).toBe(0)
        expect(computeOutlineIndent(4, 1)).toBe(3)
    })
})

describe('大纲过滤', () => {
    const items = extractOutlinePlus(
        sourceFromLines(['# Intro', '## 安装 Install', '### 使用 Usage']),
        EMPTY_TITLE
    )

    it('空查询返回全部条目（保持顺序）', () => {
        expect(filterOutlineItems(items, '')).toEqual(items)
        expect(filterOutlineItems(items, '   ')).toEqual(items)
    })

    it('大小写不敏感、支持中文子串', () => {
        expect(filterOutlineItems(items, 'install').map((item) => item.line)).toEqual([2])
        expect(filterOutlineItems(items, '使用').map((item) => item.line)).toEqual([3])
    })

    it('无匹配返回空数组', () => {
        expect(filterOutlineItems(items, '不存在的标题')).toEqual([])
    })
})
