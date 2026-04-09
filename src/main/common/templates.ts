import * as mermaid from './templates/mermaid'
import * as plantuml from './templates/plantuml'
import * as textblock from './templates/textblock'
import * as writing from './templates/writing'

const CHANNEL_INSERT_WRITING = 'monaco-insert-writing-templates'
const CHANNEL_INSERT_TEXTBLOCK = 'monaco-insert-text-block-templates'

const MermaidPart1 = [
    { label: '基础框架', context: '\n```mermaid\n\n```\n\n', menu_action: 'baize:menu:insert:mermaid:basic' },
    { label: 'flowchart', context: mermaid.flowchart, menu_action: 'baize:menu:insert:mermaid:flowchart' },
    { label: 'BlockDiagram', context: mermaid.blockDiagram, menu_action: 'baize:menu:insert:mermaid:block-diagram' },
    { label: 'C4图', context: mermaid.C4Context, menu_action: 'baize:menu:insert:mermaid:c4' },
    { label: '类图', context: mermaid.classDiagram, menu_action: 'baize:menu:insert:mermaid:class-diagram' },
    { label: '实体关系图', context: mermaid.erDiagram, menu_action: 'baize:menu:insert:mermaid:er-diagram' },
    { label: '甘特图', context: mermaid.gantt, menu_action: 'baize:menu:insert:mermaid:gantt' },
    { label: 'Git图', context: mermaid.gitGraph, menu_action: 'baize:menu:insert:mermaid:git-graph' },
    { label: '基本流程图', context: mermaid.graph, menu_action: 'baize:menu:insert:mermaid:graph' },
    { label: '用户旅程图', context: mermaid.journey, menu_action: 'baize:menu:insert:mermaid:journey' },
    { label: '思维导图', context: mermaid.mindmap, menu_action: 'baize:menu:insert:mermaid:mindmap' },
]

const MermaidPart2 = [
    { label: 'Packet', context: mermaid.packet, menu_action: 'baize:menu:insert:mermaid:packet' },
    { label: '饼图', context: mermaid.pie, menu_action: 'baize:menu:insert:mermaid:pie' },
    { label: '象限图', context: mermaid.quadrantChart, menu_action: 'baize:menu:insert:mermaid:quadrant-chart' },
    { label: '需求图', context: mermaid.requirementDiagram, menu_action: 'baize:menu:insert:mermaid:requirement-diagram' },
    { label: '桑基图', context: mermaid.sankey, menu_action: 'baize:menu:insert:mermaid:sankey' },
    { label: '序列图', context: mermaid.sequenceDiagram, menu_action: 'baize:menu:insert:mermaid:sequence-diagram' },
    { label: '状态图', context: mermaid.stateDiagram, menu_action: 'baize:menu:insert:mermaid:state-diagram' },
    { label: '时间线图', context: mermaid.timeline, menu_action: 'baize:menu:insert:mermaid:timeline' },
    { label: 'XYChart', context: mermaid.xychart, menu_action: 'baize:menu:insert:mermaid:xychart' },
    { label: 'Zenuml', context: mermaid.zenuml, menu_action: 'baize:menu:insert:mermaid:zenuml' }
]

const PlantUMLPart1 = [
    { label: '基础框架', context: '\n```plantuml\n@startuml\n\n@enduml\n```\n\n', menu_action: 'baize:menu:insert:plantuml:basic' },
    { label: '活动图', context: plantuml.ActivityDiagram, menu_action: 'baize:menu:insert:plantuml:activity-diagram' },
    { label: '规范和描述语言（SDL）', context: plantuml.ActivityDiagram, menu_action: 'baize:menu:insert:plantuml:sdl' },
    { label: '架构图', context: plantuml.ArchimateDiagram, menu_action: 'baize:menu:insert:plantuml:archimate-diagram' },
    { label: 'AsciiMath', context: plantuml.AsciiMath, menu_action: 'baize:menu:insert:plantuml:ascii-math' },
    { label: '类图', context: plantuml.ClassDiagram, menu_action: 'baize:menu:insert:plantuml:class-diagram' },
    { label: '组件图', context: plantuml.ComponentDiagram, menu_action: 'baize:menu:insert:plantuml:component-diagram' },
    { label: '部署图', context: plantuml.DeploymentDiagram, menu_action: 'baize:menu:insert:plantuml:deployment-diagram' },
    { label: 'Ditaa 图表', context: plantuml.DitaaDiagram, menu_action: 'baize:menu:insert:plantuml:ditaa-diagram' },
    { label: '实体关系图', context: plantuml.EntityRelationship, menu_action: 'baize:menu:insert:plantuml:entity-relationship' },
    { label: 'EBNF 图表', context: plantuml.ExtendedBackusNaurForm, menu_action: 'baize:menu:insert:plantuml:ebnf' },
]

const PlantUMLPart2 = [
    { label: '甘特图', context: plantuml.GanttDiagram, menu_action: 'baize:menu:insert:plantuml:gantt-diagram' },
    { label: '信息工程图', context: plantuml.InformationEngineering, menu_action: 'baize:menu:insert:plantuml:information-engineering' },
    { label: 'JSON 数据', context: plantuml.JsonDiagram, menu_action: 'baize:menu:insert:plantuml:json-diagram' },
    { label: '思维导图', context: plantuml.MindmapDiagram, menu_action: 'baize:menu:insert:plantuml:mindmap-diagram' },
    { label: '网络图', context: plantuml.nwdiag, menu_action: 'baize:menu:insert:plantuml:nwdiag' },
    { label: '对象图', context: plantuml.ObjectDiagram, menu_action: 'baize:menu:insert:plantuml:object-diagram' },
    { label: 'Regex 图表', context: plantuml.RegularExpression, menu_action: 'baize:menu:insert:plantuml:regex' },
    { label: '用户界面模型', context: plantuml.salt, menu_action: 'baize:menu:insert:plantuml:salt' },
    { label: '序列图', context: plantuml.SequenceDiagram, menu_action: 'baize:menu:insert:plantuml:sequence-diagram' },
    { label: '状态图', context: plantuml.StateDiagram, menu_action: 'baize:menu:insert:plantuml:state-diagram' },
    { label: '定时图', context: plantuml.TimingDiagram, menu_action: 'baize:menu:insert:plantuml:timing-diagram' },
    { label: '用例图', context: plantuml.UseCaseDiagram, menu_action: 'baize:menu:insert:plantuml:use-case-diagram' },
    { label: 'WBS 图表', context: plantuml.WBSDiagram, menu_action: 'baize:menu:insert:plantuml:wbs-diagram' },
    { label: 'YAML 数据', context: plantuml.YamlDiagram, menu_action: 'baize:menu:insert:plantuml:yaml-diagram' }
]

const TextBlock = [
    { label: '图片链接', context: textblock.image_links, menu_action: 'baize:menu:insert:textblock:image-links' },
    { label: '折叠代码块', context: textblock.blockcode, menu_action: 'baize:menu:insert:textblock:blockcode' },
    { label: '有序链接列表', context: textblock.linksList, menu_action: 'baize:menu:insert:textblock:links-list' },
    { label: '文章更新日期', context: textblock.getFmtData(), menu_action: 'baize:menu:insert:textblock:update-date' }
]

const Writing = [
    { label: '力扣题解模板', context: writing.leetcode_problem_solving, menu_action: 'baize:menu:insert:writing:leetcode' },
    { label: '问题处理模板', context: writing.problemResolving, menu_action: 'baize:menu:insert:writing:problem-resolving' },
    { label: '文章封面', context: writing.thesisTemplates, menu_action: 'baize:menu:insert:writing:thesis-templates' },
    { label: '论文模板', context: writing.thesisCoverPage, menu_action: 'baize:menu:insert:writing:thesis-cover-page' }
]

const InsertFromFiles = [
    { label: '*.json', menu_action: 'baize:menu:insert:from-file:json' },
    { label: '*.txt;*.log', menu_action: 'baize:menu:insert:from-file:text' },
    { label: '*.ini', menu_action: 'baize:menu:insert:from-file:ini' },
    { label: '*.yaml;*.yml', menu_action: 'baize:menu:insert:from-file:yaml' },
    { label: '*.csv', menu_action: 'baize:menu:insert:from-file:csv' },
    { label: '*.xls;*.xlsx', menu_action: 'baize:menu:insert:from-file:excel' }
]

const Mermaid = [
    ...MermaidPart1, ...MermaidPart2]

const PlantUML = [
    ...PlantUMLPart1, ...PlantUMLPart2]

export {
    TextBlock, Writing, CHANNEL_INSERT_WRITING,CHANNEL_INSERT_TEXTBLOCK,
    MermaidPart1, MermaidPart2, PlantUMLPart1, PlantUMLPart2, InsertFromFiles,
    Mermaid,PlantUML
}
