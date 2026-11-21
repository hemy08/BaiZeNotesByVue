/**
 * A7 智能输入纯函数单测（computeSmartEnterPlan）：
 * 覆盖空列表项退出、有序列表递增（含缩进/分隔符）、引用块续行（含嵌套）、任务列表、
 * 标题补空行，以及「光标不在行尾 / 普通正文 / 无序列表 / 非法序号」等回退场景。
 *
 * 说明：开关关闭时的逐字保持行为由 hemy-editor-actions 集成测试与
 * markdown-editor-blindspots 回归用例共同覆盖；本文件只校验纯函数契约。
 */
import { describe, expect, it } from 'vitest'
import { computeSmartEnterPlan } from '../../src/renderer/src/components/Markdown/editor-smart-input'

/** 行尾光标列（Monaco 口径 1 基） */
function endColumn(lineText: string): number {
    return lineText.length + 1
}

describe('空列表项回车退出列表', () => {
    it.each([
        ['- ', 2],
        ['* ', 2],
        ['  - ', 4],
        ['1. ', 3],
        ['12) ', 4],
        ['- [ ] ', 6],
        ['- [x] ', 6]
    ])('「%s」返回删除标记并换行', (lineText) => {
        expect(computeSmartEnterPlan(lineText, endColumn(lineText))).toEqual({
            insertText: '\n',
            deletePrefixChars: lineText.length
        })
    })
})

describe('有序列表自动递增', () => {
    it.each([
        ['1. 第一项', '\n2. '],
        ['9) 第九项', '\n10) '],
        ['  3. 缩进项', '\n  4. '],
        ['01. 前导零项', '\n2. ']
    ])('「%s」续行 → %j', (lineText, expected) => {
        expect(computeSmartEnterPlan(lineText, endColumn(lineText))).toEqual({
            insertText: expected
        })
    })

    it('非法序号（超出安全整数）回退原行为', () => {
        const lineText = '99999999999999999999. 超长序号'
        expect(computeSmartEnterPlan(lineText, endColumn(lineText))).toBeNull()
    })
})

describe('引用块续行', () => {
    it.each([
        ['> 引用内容', '\n> '],
        ['>> 嵌套引用', '\n>> '],
        ['> > 深层引用', '\n> > '],
        ['  > 缩进引用', '\n  > ']
    ])('「%s」续行 → %j', (lineText, expected) => {
        expect(computeSmartEnterPlan(lineText, endColumn(lineText))).toEqual({
            insertText: expected
        })
    })

    it('空引用行不增强（回退原行为）', () => {
        expect(computeSmartEnterPlan('> ', endColumn('> '))).toBeNull()
    })
})

describe('任务列表续行', () => {
    it.each([
        ['- [ ] 待办', '\n- [ ] '],
        ['- [x] 已完成', '\n- [ ] '],
        ['  * [X] 缩进', '\n  * [ ] ']
    ])('「%s」续行 → %j', (lineText, expected) => {
        expect(computeSmartEnterPlan(lineText, endColumn(lineText))).toEqual({
            insertText: expected
        })
    })
})

describe('标题后回车补空行', () => {
    it.each(['# 一级标题', '### 三级标题', '###### 六级标题', '## 标题 ##'])(
        '「%s」插入两个换行',
        (lineText) => {
            expect(computeSmartEnterPlan(lineText, endColumn(lineText))).toEqual({
                insertText: '\n\n'
            })
        }
    )

    it('空标题（仅 # 与空白）不增强', () => {
        expect(computeSmartEnterPlan('# ', endColumn('# '))).toBeNull()
    })
})

describe('回退场景（返回 null 交由原 EnterAction 处理）', () => {
    it('普通正文行', () => {
        expect(computeSmartEnterPlan('普通正文', endColumn('普通正文'))).toBeNull()
    })

    it('无序列表续行保持原实现（不在增强规则内重复处理）', () => {
        expect(computeSmartEnterPlan('- 列表项', endColumn('- 列表项'))).toBeNull()
    })

    it('光标不在行尾时不增强（避免破坏行中间内容）', () => {
        const lineText = '1. 第一项'
        expect(computeSmartEnterPlan(lineText, 3)).toBeNull()
        expect(computeSmartEnterPlan(lineText, 1)).toBeNull()
    })

    it('空行', () => {
        expect(computeSmartEnterPlan('', 1)).toBeNull()
    })
})
