import { describe, it, expect } from 'vitest'
import * as plantuml from '../../src/renderer/src/common/templates/plantuml'

// plantuml 模板集合：每个模板都应是被 ```plantuml 围栏包裹的非空字符串
const plantumlTemplates: [string, string][] = [
    ['ActivityDiagram', '@startuml'],
    ['ArchimateDiagram', '@startuml'],
    ['AsciiMath', '@startuml'],
    ['ClassDiagram', '@startuml'],
    ['ComponentDiagram', '@startuml'],
    ['DeploymentDiagram', '@startuml'],
    ['DitaaDiagram', '@startuml'],
    ['EntityRelationship', '@startchen'],
    ['ExtendedBackusNaurForm', '@startebnf'],
    ['GanttDiagram', '@startgantt'],
    ['InformationEngineering', '@startuml'],
    ['JsonDiagram', '@startjson'],
    ['MindmapDiagram', '@startmindmap'],
    ['ObjectDiagram', '@startuml PERT'],
    ['RegularExpression', '@startregex'],
    ['SequenceDiagram', '@startuml'],
    ['StateDiagram', '@startuml'],
    ['TimingDiagram', '@startuml'],
    ['UseCaseDiagram', '@startuml'],
    ['WBSDiagram', '@startwbs'],
    ['YamlDiagram', '@startyaml'],
    ['nwdiag', '@startuml'],
    ['salt', '@startuml']
]

// 各模板对应的结束标记（与 @start 一一对应）
const endTags: Record<string, string> = {
    ActivityDiagram: '@enduml',
    ArchimateDiagram: '@enduml',
    AsciiMath: '@enduml',
    ClassDiagram: '@enduml',
    ComponentDiagram: '@enduml',
    DeploymentDiagram: '@enduml',
    DitaaDiagram: '@enduml',
    EntityRelationship: '@endchen',
    ExtendedBackusNaurForm: '@endebnf',
    GanttDiagram: '@endgantt',
    InformationEngineering: '@enduml',
    JsonDiagram: '@endjson',
    MindmapDiagram: '@endmindmap',
    ObjectDiagram: '@enduml',
    RegularExpression: '@endregex',
    SequenceDiagram: '@enduml',
    StateDiagram: '@enduml',
    TimingDiagram: '@enduml',
    UseCaseDiagram: '@enduml',
    WBSDiagram: '@endwbs',
    YamlDiagram: '@endyaml',
    nwdiag: '@enduml',
    salt: '@enduml'
}

// 模板内容补充片段：用于校验各模板包含关键示例内容
const extraFragments: [string, string][] = [
    ['JsonDiagram', '"firstName": "John"'],
    ['ClassDiagram', 'abstract class AbstractList'],
    ['SequenceDiagram', 'participant "First Class" as A'],
    ['StateDiagram', 'State1 --> State2 : Succeeded'],
    ['UseCaseDiagram', 'usecase "Eat Food" as UC1'],
    ['GanttDiagram', 'Project starts the 1st of january 2021'],
    ['MindmapDiagram', '*[#Orange] root node'],
    ['ActivityDiagram', ':next(o); <<procedure>>'],
    ['ArchimateDiagram', 'sprite $bProcess jar:archimate/business-process'],
    ['AsciiMath', '<latex>\\int_0^1f(x)dx</latex>'],
    ['ComponentDiagram', 'package "Some Group"'],
    ['DeploymentDiagram', 'allowmixing'],
    ['DitaaDiagram', 'ditaa'],
    ['EntityRelationship', 'entity PARENT'],
    ['ExtendedBackusNaurForm', 'styled_ebnf = {"a", c , "a" (* Note on a *)}'],
    ['InformationEngineering', 'entity "Entity01" as e01'],
    ['ObjectDiagram', 'map Kick.Off'],
    ['RegularExpression', 'a{0,1}b{1,} is the same as a?b+'],
    ['TimingDiagram', 'clock clk with period 1'],
    ['WBSDiagram', '* this is the partner workpackage'],
    ['YamlDiagram', 'doe: "a deer, a female deer"'],
    ['nwdiag', 'nwdiag {'],
    ['salt', 'Password | "****     "']
]

describe('plantuml templates', () => {
    it('should export all 23 diagram templates as strings', () => {
        expect(plantumlTemplates).toHaveLength(23)
        for (const [name] of plantumlTemplates) {
            expect(typeof (plantuml as Record<string, unknown>)[name], `${name} 应为字符串`).toBe(
                'string'
            )
        }
    })

    it('should wrap every template with plantuml code fences', () => {
        for (const [name] of plantumlTemplates) {
            const tpl = (plantuml as Record<string, unknown>)[name] as string
            expect(tpl.startsWith('\n```plantuml\n'), `${name} 应以换行 + 围栏开头`).toBe(true)
            expect(tpl.endsWith('```\n\n'), `${name} 应以围栏 + 空行结尾`).toBe(true)
        }
    })

    it('should contain a non-empty body between fences', () => {
        for (const [name] of plantumlTemplates) {
            const tpl = (plantuml as Record<string, unknown>)[name] as string
            const body = tpl.slice('\n```plantuml\n'.length, -'```\n\n'.length)
            expect(body.trim().length, `${name} 的围栏内应有内容`).toBeGreaterThan(0)
        }
    })

    it('should keep all templates distinct', () => {
        const values = plantumlTemplates.map(
            ([name]) => (plantuml as Record<string, unknown>)[name] as string
        )
        expect(new Set(values).size).toBe(values.length)
    })

    it.each(plantumlTemplates)('%s should start with the "%s" marker', (name, startTag) => {
        const tpl = (plantuml as Record<string, unknown>)[name] as string
        expect(tpl).toContain(startTag)
    })

    it.each(plantumlTemplates)('%s should contain the matching end marker', (name) => {
        const tpl = (plantuml as Record<string, unknown>)[name] as string
        expect(tpl).toContain(endTags[name])
    })

    it.each(extraFragments)('%s should contain sample fragment "%s"', (name, fragment) => {
        const tpl = (plantuml as Record<string, unknown>)[name] as string
        expect(tpl).toContain(fragment)
    })
})
