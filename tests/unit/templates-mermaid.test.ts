import { describe, it, expect } from 'vitest'
import * as mermaid from '../../src/renderer/src/common/templates/mermaid'

// mermaid 模板集合：每个模板都应是被 ```mermaid 围栏包裹的非空字符串
const mermaidTemplates: [string, string][] = [
    ['C4Context', 'C4Context'],
    ['blockDiagram', 'block-beta'],
    ['classDiagram', 'classDiagram'],
    ['erDiagram', 'erDiagram'],
    ['flowchart', 'flowchart TB'],
    ['gantt', 'gantt'],
    ['gitGraph', 'gitGraph'],
    ['graph', 'graph TB'],
    ['journey', 'journey'],
    ['mindmap', 'mindmap'],
    ['packet', 'packet-beta'],
    ['pie', 'pie showData'],
    ['quadrantChart', 'quadrantChart'],
    ['requirementDiagram', 'requirementDiagram'],
    ['sankey', 'sankey-beta'],
    ['sequenceDiagram', 'sequenceDiagram'],
    ['stateDiagram', 'stateDiagram-v2'],
    ['timeline', 'timeline'],
    ['xychart', 'xychart-beta'],
    ['zenuml', 'zenuml']
]

// 模板内容补充片段：用于校验各模板包含关键示例内容
const extraFragments: [string, string][] = [
    ['classDiagram', 'title: Animal example'],
    ['sequenceDiagram', 'participant web as Web Browser'],
    ['gitGraph', 'branch nice_feature'],
    ['mindmap', 'root((mindmap))'],
    ['gantt', 'dateFormat  YYYY-MM-DD'],
    ['erDiagram', 'CAR ||--o{ NAMED-DRIVER : allows'],
    ['C4Context', 'System Context diagram for Internet Banking System'],
    ['packet', 'title: "TCP Packet"'],
    ['sankey', 'showValues: false'],
    ['timeline', 'History of Social Media Platform'],
    ['xychart', 'Sales Revenue'],
    ['requirementDiagram', 'functionalRequirement test_req2'],
    ['stateDiagram', '[*] --> First'],
    ['graph', 'classDef green fill:#9f6'],
    ['journey', 'title My working day'],
    ['pie', 'title Key elements in Product X'],
    ['quadrantChart', 'Campaign A: [0.3, 0.6]'],
    ['blockDiagram', 'columns 3'],
    ['zenuml', 'try {']
]

describe('mermaid templates', () => {
    it('should export all 20 diagram templates as strings', () => {
        expect(mermaidTemplates).toHaveLength(20)
        for (const [name] of mermaidTemplates) {
            expect(typeof (mermaid as Record<string, unknown>)[name], `${name} 应为字符串`).toBe(
                'string'
            )
        }
    })

    it('should wrap every template with mermaid code fences', () => {
        for (const [name] of mermaidTemplates) {
            const tpl = (mermaid as Record<string, unknown>)[name] as string
            expect(tpl.startsWith('\n```mermaid\n'), `${name} 应以换行 + 围栏开头`).toBe(true)
            expect(tpl.endsWith('```\n\n'), `${name} 应以围栏 + 空行结尾`).toBe(true)
        }
    })

    it('should contain a non-empty body between fences', () => {
        for (const [name] of mermaidTemplates) {
            const tpl = (mermaid as Record<string, unknown>)[name] as string
            const body = tpl.slice('\n```mermaid\n'.length, -'```\n\n'.length)
            expect(body.trim().length, `${name} 的围栏内应有内容`).toBeGreaterThan(0)
        }
    })

    it('should keep all templates distinct', () => {
        const values = mermaidTemplates.map(
            ([name]) => (mermaid as Record<string, unknown>)[name] as string
        )
        expect(new Set(values).size).toBe(values.length)
    })

    it.each(mermaidTemplates)('%s should contain the "%s" diagram keyword', (name, keyword) => {
        const tpl = (mermaid as Record<string, unknown>)[name] as string
        expect(tpl).toContain(keyword)
    })

    it.each(extraFragments)('%s should contain sample fragment "%s"', (name, fragment) => {
        const tpl = (mermaid as Record<string, unknown>)[name] as string
        expect(tpl).toContain(fragment)
    })
})
