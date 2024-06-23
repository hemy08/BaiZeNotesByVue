import { flowchart } from './flowchart'
import { blockDiagram } from './blockDiagram'
import { C4Context } from './C4Context'
import { classDiagram } from './classDiagram'
import { erDiagram } from './erDiagram'
import { gantt } from './gantt'
import { gitGraph } from './gitGraph'
import { graph } from './graph'
import { journey } from './journey'
import { mindmap } from './mindmap'
import { packet } from './packet'
import { pie } from './pie'
import { quadrantChart } from './quadrantChart'
import { requirementDiagram } from './requirementDiagram'
import { sankey } from './sankey'
import { sequenceDiagram } from './sequenceDiagram'
import { stateDiagram } from './stateDiagram'
import { timeline } from './timeline'
import { xychart } from './xychart'
import { zenuml } from './zenuml'

export const mermaidDiagrams = {
  baseDiagram: { label: '基础框架', diagram: '\n```mermaid\n\n```\n\n' },
  flowchart: { label: 'flowchart', diagram: flowchart },
  blockDiagram: { label: 'BlockDiagram', diagram: blockDiagram },
  C4Context: { label: 'C4图', diagram: C4Context },
  classDiagram: { label: '类图', diagram: classDiagram },
  erDiagram: { label: '实体关系图', diagram: erDiagram },
  gantt: { label: '甘特图', diagram: gantt },
  gitGraph: { label: 'Git图', diagram: gitGraph },
  graph: { label: '基本流程图', diagram: graph },
  journey: { label: '用户旅程图', diagram: journey },
  mindmap: { label: '思维导图', diagram: mindmap },
  packet: { label: 'Packet', diagram: packet },
  pie: { label: '饼图', diagram: pie },
  quadrantChart: { label: '象限图', diagram: quadrantChart },
  requirementDiagram: { label: '需求图', diagram: requirementDiagram },
  sankey: { label: '桑基图', diagram: sankey },
  sequenceDiagram: { label: '序列图', diagram: sequenceDiagram },
  stateDiagram: { label: '状态图', diagram: stateDiagram },
  timeline: { label: '时间线图', diagram: timeline },
  xychart: { label: 'XYChart', diagram: xychart },
  zenuml: { label: 'Zenuml', diagram: zenuml }
}
