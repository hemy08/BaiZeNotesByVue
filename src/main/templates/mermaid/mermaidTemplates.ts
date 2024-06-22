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

export class mermaidTemplates {
  flowchart: string
  blockDiagram: string
  C4Context: string
  classDiagram: string
  erDiagram: string
  gantt: string
  gitGraph: string
  graph: string
  journey: string
  mindmap: string
  packet: string
  pie: string
  quadrantChart: string
  requirementDiagram: string
  sankey: string
  sequenceDiagram: string
  stateDiagram: string
  timeline: string
  xychart: string
  zenuml: string

  constructor() {
    this.flowchart = flowchart
    this.blockDiagram = blockDiagram
    this.C4Context = C4Context
    this.classDiagram = classDiagram
    this.erDiagram = erDiagram
    this.gantt = gantt
    this.gitGraph = gitGraph
    this.graph = graph
    this.journey = journey
    this.mindmap = mindmap
    this.packet = packet
    this.pie = pie
    this.quadrantChart = quadrantChart
    this.requirementDiagram = requirementDiagram
    this.sankey = sankey
    this.sequenceDiagram = sequenceDiagram
    this.stateDiagram = stateDiagram
    this.timeline = timeline
    this.xychart = xychart
    this.zenuml = zenuml
  }
}
