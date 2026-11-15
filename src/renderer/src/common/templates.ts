import * as mermaid from './templates/mermaid'
import * as plantuml from './templates/plantuml'
import * as textblock from './templates/textblock'
import * as writing from './templates/writing'
// P2 死代码清理：CHANNEL_INSERT_WRITING / CHANNEL_INSERT_TEXTBLOCK 两个常量
// 在本文件仅供 re-export、全仓无消费者（MONACO_INSERT.WRITING_TEMPLATES 通道
// 已随之删除；TEXT_BLOCK_TEMPLATES 由 utils.ts 直接引用常量发送），一并移除。

// CMP-30：菜单可见文案不存中文字面量，统一存 labelKey（menu 命名空间），
// 由渲染处（MenuBar.vue / hemy-editor-quick-access.ts）调用 t(labelKey ?? label) 输出；
// 纯英文的图类型名/格式名不翻译，仍保留 label（品牌名/格式名不翻译契约）。
const MermaidPart1 = [
    {
        labelKey: 'menu.template.mermaid.basic',
        context: '\n```mermaid\n\n```\n\n',
        menuAction: 'baize:menu:insert:mermaid:basic'
    },
    {
        label: 'flowchart',
        context: mermaid.flowchart,
        menuAction: 'baize:menu:insert:mermaid:flowchart'
    },
    {
        label: 'BlockDiagram',
        context: mermaid.blockDiagram,
        menuAction: 'baize:menu:insert:mermaid:block-diagram'
    },
    {
        labelKey: 'menu.template.mermaid.c4',
        context: mermaid.C4Context,
        menuAction: 'baize:menu:insert:mermaid:c4'
    },
    {
        labelKey: 'menu.template.mermaid.classDiagram',
        context: mermaid.classDiagram,
        menuAction: 'baize:menu:insert:mermaid:class-diagram'
    },
    {
        labelKey: 'menu.template.mermaid.erDiagram',
        context: mermaid.erDiagram,
        menuAction: 'baize:menu:insert:mermaid:er-diagram'
    },
    {
        labelKey: 'menu.template.mermaid.gantt',
        context: mermaid.gantt,
        menuAction: 'baize:menu:insert:mermaid:gantt'
    },
    {
        labelKey: 'menu.template.mermaid.gitGraph',
        context: mermaid.gitGraph,
        menuAction: 'baize:menu:insert:mermaid:git-graph'
    },
    {
        labelKey: 'menu.template.mermaid.graph',
        context: mermaid.graph,
        menuAction: 'baize:menu:insert:mermaid:graph'
    },
    {
        labelKey: 'menu.template.mermaid.journey',
        context: mermaid.journey,
        menuAction: 'baize:menu:insert:mermaid:journey'
    },
    {
        labelKey: 'menu.template.mermaid.mindmap',
        context: mermaid.mindmap,
        menuAction: 'baize:menu:insert:mermaid:mindmap'
    }
]

const MermaidPart2 = [
    { label: 'Packet', context: mermaid.packet, menuAction: 'baize:menu:insert:mermaid:packet' },
    {
        labelKey: 'menu.template.mermaid.pie',
        context: mermaid.pie,
        menuAction: 'baize:menu:insert:mermaid:pie'
    },
    {
        labelKey: 'menu.template.mermaid.quadrantChart',
        context: mermaid.quadrantChart,
        menuAction: 'baize:menu:insert:mermaid:quadrant-chart'
    },
    {
        labelKey: 'menu.template.mermaid.requirementDiagram',
        context: mermaid.requirementDiagram,
        menuAction: 'baize:menu:insert:mermaid:requirement-diagram'
    },
    {
        labelKey: 'menu.template.mermaid.sankey',
        context: mermaid.sankey,
        menuAction: 'baize:menu:insert:mermaid:sankey'
    },
    {
        labelKey: 'menu.template.mermaid.sequenceDiagram',
        context: mermaid.sequenceDiagram,
        menuAction: 'baize:menu:insert:mermaid:sequence-diagram'
    },
    {
        labelKey: 'menu.template.mermaid.stateDiagram',
        context: mermaid.stateDiagram,
        menuAction: 'baize:menu:insert:mermaid:state-diagram'
    },
    {
        labelKey: 'menu.template.mermaid.timeline',
        context: mermaid.timeline,
        menuAction: 'baize:menu:insert:mermaid:timeline'
    },
    { label: 'XYChart', context: mermaid.xychart, menuAction: 'baize:menu:insert:mermaid:xychart' },
    { label: 'Zenuml', context: mermaid.zenuml, menuAction: 'baize:menu:insert:mermaid:zenuml' }
]

const PlantUMLPart1 = [
    {
        labelKey: 'menu.template.plantuml.basic',
        context: '\n```plantuml\n@startuml\n\n@enduml\n```\n\n',
        menuAction: 'baize:menu:insert:plantuml:basic'
    },
    {
        labelKey: 'menu.template.plantuml.activityDiagram',
        context: plantuml.ActivityDiagram,
        menuAction: 'baize:menu:insert:plantuml:activity-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.sdl',
        context: plantuml.ActivityDiagram,
        menuAction: 'baize:menu:insert:plantuml:sdl'
    },
    {
        labelKey: 'menu.template.plantuml.archimateDiagram',
        context: plantuml.ArchimateDiagram,
        menuAction: 'baize:menu:insert:plantuml:archimate-diagram'
    },
    {
        label: 'AsciiMath',
        context: plantuml.AsciiMath,
        menuAction: 'baize:menu:insert:plantuml:ascii-math'
    },
    {
        labelKey: 'menu.template.plantuml.classDiagram',
        context: plantuml.ClassDiagram,
        menuAction: 'baize:menu:insert:plantuml:class-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.componentDiagram',
        context: plantuml.ComponentDiagram,
        menuAction: 'baize:menu:insert:plantuml:component-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.deploymentDiagram',
        context: plantuml.DeploymentDiagram,
        menuAction: 'baize:menu:insert:plantuml:deployment-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.ditaaDiagram',
        context: plantuml.DitaaDiagram,
        menuAction: 'baize:menu:insert:plantuml:ditaa-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.entityRelationship',
        context: plantuml.EntityRelationship,
        menuAction: 'baize:menu:insert:plantuml:entity-relationship'
    },
    {
        labelKey: 'menu.template.plantuml.ebnf',
        context: plantuml.ExtendedBackusNaurForm,
        menuAction: 'baize:menu:insert:plantuml:ebnf'
    }
]

const PlantUMLPart2 = [
    {
        labelKey: 'menu.template.plantuml.ganttDiagram',
        context: plantuml.GanttDiagram,
        menuAction: 'baize:menu:insert:plantuml:gantt-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.informationEngineering',
        context: plantuml.InformationEngineering,
        menuAction: 'baize:menu:insert:plantuml:information-engineering'
    },
    {
        labelKey: 'menu.template.plantuml.jsonDiagram',
        context: plantuml.JsonDiagram,
        menuAction: 'baize:menu:insert:plantuml:json-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.mindmapDiagram',
        context: plantuml.MindmapDiagram,
        menuAction: 'baize:menu:insert:plantuml:mindmap-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.nwdiag',
        context: plantuml.nwdiag,
        menuAction: 'baize:menu:insert:plantuml:nwdiag'
    },
    {
        labelKey: 'menu.template.plantuml.objectDiagram',
        context: plantuml.ObjectDiagram,
        menuAction: 'baize:menu:insert:plantuml:object-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.regex',
        context: plantuml.RegularExpression,
        menuAction: 'baize:menu:insert:plantuml:regex'
    },
    {
        labelKey: 'menu.template.plantuml.salt',
        context: plantuml.salt,
        menuAction: 'baize:menu:insert:plantuml:salt'
    },
    {
        labelKey: 'menu.template.plantuml.sequenceDiagram',
        context: plantuml.SequenceDiagram,
        menuAction: 'baize:menu:insert:plantuml:sequence-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.stateDiagram',
        context: plantuml.StateDiagram,
        menuAction: 'baize:menu:insert:plantuml:state-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.timingDiagram',
        context: plantuml.TimingDiagram,
        menuAction: 'baize:menu:insert:plantuml:timing-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.useCaseDiagram',
        context: plantuml.UseCaseDiagram,
        menuAction: 'baize:menu:insert:plantuml:use-case-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.wbsDiagram',
        context: plantuml.WBSDiagram,
        menuAction: 'baize:menu:insert:plantuml:wbs-diagram'
    },
    {
        labelKey: 'menu.template.plantuml.yamlDiagram',
        context: plantuml.YamlDiagram,
        menuAction: 'baize:menu:insert:plantuml:yaml-diagram'
    }
]

const TextBlock = [
    {
        labelKey: 'menu.template.textblock.imageLinks',
        context: textblock.image_links,
        menuAction: 'baize:menu:insert:textblock:image-links'
    },
    {
        labelKey: 'menu.template.textblock.blockcode',
        context: textblock.blockcode,
        menuAction: 'baize:menu:insert:textblock:blockcode'
    },
    {
        labelKey: 'menu.template.textblock.linksList',
        context: textblock.linksList,
        menuAction: 'baize:menu:insert:textblock:links-list'
    },
    {
        labelKey: 'menu.template.textblock.updateDate',
        context: textblock.getFmtData(),
        menuAction: 'baize:menu:insert:textblock:update-date'
    }
]

const Writing = [
    {
        labelKey: 'menu.template.writing.leetcode',
        context: writing.leetcode_problem_solving,
        menuAction: 'baize:menu:insert:writing:leetcode'
    },
    {
        labelKey: 'menu.template.writing.problemResolving',
        context: writing.problemResolving,
        menuAction: 'baize:menu:insert:writing:problem-resolving'
    },
    {
        labelKey: 'menu.template.writing.thesisCoverPage',
        context: writing.thesisCoverPage,
        menuAction: 'baize:menu:insert:writing:thesis-cover-page'
    },
    {
        labelKey: 'menu.template.writing.thesisTemplates',
        context: writing.thesisTemplates,
        menuAction: 'baize:menu:insert:writing:thesis-templates'
    }
]

// 来自文件的插入项只展示文件格式/扩展名，不翻译，保持原样
const InsertFromFiles = [
    { label: '*.json', menuAction: 'baize:menu:insert:from-file:json' },
    { label: '*.txt;*.log', menuAction: 'baize:menu:insert:from-file:text' },
    { label: '*.ini', menuAction: 'baize:menu:insert:from-file:ini' },
    { label: '*.yaml;*.yml', menuAction: 'baize:menu:insert:from-file:yaml' },
    { label: '*.xml', menuAction: 'baize:menu:insert:from-file:xml' },
    { label: '*.html', menuAction: 'baize:menu:insert:from-file:html' },
    { label: '*.csv', menuAction: 'baize:menu:insert:from-file:csv' },
    { label: '*.xls;*.xlsx', menuAction: 'baize:menu:insert:from-file:excel' }
]

const Mermaid = [...MermaidPart1, ...MermaidPart2]

const PlantUML = [...PlantUMLPart1, ...PlantUMLPart2]

export {
    TextBlock,
    Writing,
    MermaidPart1,
    MermaidPart2,
    PlantUMLPart1,
    PlantUMLPart2,
    InsertFromFiles,
    Mermaid,
    PlantUML
}
