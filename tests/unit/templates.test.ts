import { describe, it, expect } from 'vitest'
import { translate } from '../../src/shared/i18n'
import * as Templates from '../../src/renderer/src/common/templates'
import * as mermaidTpl from '../../src/renderer/src/common/templates/mermaid'
import * as plantumlTpl from '../../src/renderer/src/common/templates/plantuml'
import { image_links } from '../../src/renderer/src/common/templates/textblock'
import { leetcode_problem_solving } from '../../src/renderer/src/common/templates/writing'

// CMP-30：菜单/模板数据只存 labelKey，渲染处调用 t(labelKey ?? label)；测试按渲染后文本断言
interface MenuLabelLike {
    label?: string
    labelKey?: string
}

function displayText(item: MenuLabelLike, locale: 'zh-CN' | 'en-US' = 'zh-CN'): string {
    return item.labelKey ? translate(item.labelKey, locale) : (item.label ?? '')
}

// P2 死代码清理：CHANNEL_INSERT_WRITING / CHANNEL_INSERT_TEXTBLOCK 两个零消费
// re-export 常量已删除（MONACO_INSERT.WRITING_TEMPLATES 死通道同步删除），
// 原 "templates channels" 用例移除。

describe('templates Mermaid aggregation', () => {
    it('should split mermaid templates into two parts and merge them', () => {
        expect(Templates.MermaidPart1).toHaveLength(11)
        expect(Templates.MermaidPart2).toHaveLength(10)
        expect(Templates.Mermaid).toHaveLength(21)
        expect(Templates.Mermaid[0]).toEqual(Templates.MermaidPart1[0])
        expect(Templates.Mermaid[10]).toEqual(Templates.MermaidPart1[10])
        expect(Templates.Mermaid[11]).toEqual(Templates.MermaidPart2[0])
        expect(Templates.Mermaid[20]).toEqual(Templates.MermaidPart2[9])
    })

    it('should order mermaid labels as expected', () => {
        const labels = Templates.Mermaid.map((item) => displayText(item))
        expect(labels[0]).toBe('基础框架')
        expect(labels[10]).toBe('思维导图')
        expect(labels[11]).toBe('Packet')
        expect(labels[20]).toBe('Zenuml')
    })

    it('should keep every mermaid entry complete with unique menu actions', () => {
        for (const item of Templates.Mermaid) {
            expect(displayText(item).length).toBeGreaterThan(0)
            expect(typeof item.context).toBe('string')
            expect(item.context.length).toBeGreaterThan(0)
            expect(item.menuAction.startsWith('baize:menu:insert:mermaid:')).toBe(true)
        }
        const actions = Templates.Mermaid.map((item) => item.menuAction)
        expect(new Set(actions).size).toBe(actions.length)
    })

    it('should reference the mermaid module templates for diagram entries', () => {
        // 流程图条目应直接引用 mermaid.flowchart 模板
        const flowchartEntry = Templates.Mermaid.find((item) => displayText(item) === 'flowchart')
        expect(flowchartEntry?.context).toBe(mermaidTpl.flowchart)

        // 基础框架条目是内联字符串，包含围栏但不含具体图类型
        const basic = Templates.Mermaid[0]
        expect(basic.context).toContain('```mermaid')
    })
})

describe('templates PlantUML aggregation', () => {
    it('should split plantuml templates into two parts and merge them', () => {
        expect(Templates.PlantUMLPart1).toHaveLength(11)
        expect(Templates.PlantUMLPart2).toHaveLength(14)
        expect(Templates.PlantUML).toHaveLength(25)
        expect(Templates.PlantUML[0]).toEqual(Templates.PlantUMLPart1[0])
        expect(Templates.PlantUML[10]).toEqual(Templates.PlantUMLPart1[10])
        expect(Templates.PlantUML[11]).toEqual(Templates.PlantUMLPart2[0])
        expect(Templates.PlantUML[24]).toEqual(Templates.PlantUMLPart2[13])
    })

    it('should keep every plantuml entry complete with unique menu actions', () => {
        for (const item of Templates.PlantUML) {
            expect(displayText(item).length).toBeGreaterThan(0)
            expect(typeof item.context).toBe('string')
            expect(item.context.length).toBeGreaterThan(0)
            expect(item.menuAction.startsWith('baize:menu:insert:plantuml:')).toBe(true)
        }
        const actions = Templates.PlantUML.map((item) => item.menuAction)
        expect(new Set(actions).size).toBe(actions.length)
    })

    it('should reference the plantuml module templates for diagram entries', () => {
        const seqEntry = Templates.PlantUML.find((item) => displayText(item) === '序列图')
        expect(seqEntry?.context).toBe(plantumlTpl.SequenceDiagram)

        // 基础框架条目是内联字符串
        const basic = Templates.PlantUML[0]
        expect(displayText(basic)).toBe('基础框架')
        expect(basic.context).toContain('@startuml')
        expect(basic.context).toContain('@enduml')
    })

    it('should not share menu actions between mermaid and plantuml', () => {
        const mermaidActions = new Set(Templates.Mermaid.map((item) => item.menuAction))
        for (const item of Templates.PlantUML) {
            expect(mermaidActions.has(item.menuAction)).toBe(false)
        }
    })
})

describe('templates TextBlock', () => {
    it('should export the four text block entries', () => {
        expect(Templates.TextBlock).toHaveLength(4)
        expect(Templates.TextBlock.map((item) => displayText(item))).toEqual([
            '图片链接',
            '折叠代码块',
            '有序链接列表',
            '文章更新日期'
        ])
    })

    it('should reference the textblock module content', () => {
        expect(Templates.TextBlock[0].context).toBe(image_links)
        expect(Templates.TextBlock[0].menuAction).toBe('baize:menu:insert:textblock:image-links')
        // 更新日期条目内容由 getFmtData() 动态生成
        expect(Templates.TextBlock[3].context).toMatch(
            /最后更新：\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/
        )
    })
})

describe('templates Writing', () => {
    it('should export the four writing entries', () => {
        expect(Templates.Writing).toHaveLength(4)
        expect(Templates.Writing.map((item) => displayText(item))).toEqual([
            '力扣题解模板',
            '问题处理模板',
            '文章封面',
            '论文模板'
        ])
    })

    it('should reference the writing module content', () => {
        expect(Templates.Writing[0].context).toBe(leetcode_problem_solving)
        expect(Templates.Writing[0].menuAction).toBe('baize:menu:insert:writing:leetcode')
        for (const item of Templates.Writing) {
            expect(item.menuAction.startsWith('baize:menu:insert:writing:')).toBe(true)
        }
    })
})

describe('templates InsertFromFiles', () => {
    it('should export the eight file type entries', () => {
        expect(Templates.InsertFromFiles).toHaveLength(8)
        expect(Templates.InsertFromFiles.map((item) => displayText(item))).toEqual([
            '*.json',
            '*.txt;*.log',
            '*.ini',
            '*.yaml;*.yml',
            '*.xml',
            '*.html',
            '*.csv',
            '*.xls;*.xlsx'
        ])
    })

    it('should use unique file-type menu actions', () => {
        const actions = Templates.InsertFromFiles.map((item) => item.menuAction)
        expect(new Set(actions).size).toBe(actions.length)
        for (const item of Templates.InsertFromFiles) {
            expect(item.menuAction.startsWith('baize:menu:insert:from-file:')).toBe(true)
        }
    })
})

// CMP-30：模板数组同时用于「插入」菜单与 Monaco 右键菜单，中文文案统一存 labelKey，
// 纯英文图类型名保留 label（不翻译契约），渲染处按 t(labelKey ?? label) 输出。
describe('templates i18n keys (CMP-30)', () => {
    const menuVisibleTemplates = [
        ...Templates.Mermaid,
        ...Templates.PlantUML,
        ...Templates.TextBlock,
        ...Templates.Writing
    ]

    it('should store every Chinese template label as a resolvable labelKey', () => {
        for (const item of menuVisibleTemplates) {
            const entry = item as MenuLabelLike
            expect(displayText(entry).length).toBeGreaterThan(0)
            if (entry.labelKey) {
                expect(translate(entry.labelKey, 'zh-CN')).not.toBe(entry.labelKey)
                expect(translate(entry.labelKey, 'en-US')).not.toBe(entry.labelKey)
            } else {
                // 保留 label 的项只允许是纯英文图类型名
                expect(entry.label).not.toMatch(/[\u4e00-\u9fff]/)
            }
        }
    })

    it('should translate template labels to English', () => {
        expect(displayText(Templates.Mermaid[0], 'en-US')).toBe('Basic framework')
        expect(displayText(Templates.Mermaid[3], 'en-US')).toBe('C4 diagram')
        expect(displayText(Templates.PlantUML[1], 'en-US')).toBe('Activity diagram')
        expect(displayText(Templates.Writing[0], 'en-US')).toBe('LeetCode solution template')
        // 英文图类型名不翻译
        expect(displayText(Templates.Mermaid[1], 'en-US')).toBe('flowchart')
    })
})
