import { ActivityDiagram } from './ActivityDiagram'
import { ArchimateDiagram } from './ArchimateDiagram'
import { AsciiMath } from './AsciiMath'
import { ClassDiagram } from './ClassDiagram'
import { ComponentDiagram } from './ComponentDiagram'
import { DeploymentDiagram } from './DeploymentDiagram'
import { DitaaDiagram } from './DitaaDiagram'
import { EntityRelationship } from './EntityRelationship'
import { ExtendedBackusNaurForm } from './ExtendedBackusNaurForm'
import { GanttDiagram } from './GanttDiagram'
import { InformationEngineering } from './InformationEngineering'
import { JsonDiagram } from './JsonDiagram'
import { MindmapDiagram } from './MindmapDiagram'
import { nwdiag } from './nwdiag'
import { ObjectDiagram } from './ObjectDiagram'
import { RegularExpression } from './RegularExpression'
import { salt } from './salt'
import { SequenceDiagram } from './SequenceDiagram'
import { StateDiagram } from './StateDiagram'
import { TimingDiagram } from './TimingDiagram'
import { UseCaseDiagram } from './UseCaseDiagram'
import { WBSDiagram } from './WBSDiagram'
import { YamlDiagram } from './YamlDiagram'

export const plantumlDiagrams: MenuContext[] = [
  { label: '基础框架', context: '\n```plantuml\n@startuml\n\n@enduml\n```\n\n' },
  { label: '活动图', context: ActivityDiagram },
  { label: '规范和描述语言（SDL）', context: ActivityDiagram },
  { label: '架构图', context: ArchimateDiagram },
  { label: 'AsciiMath', context: AsciiMath },
  { label: '类图', context: ClassDiagram },
  { label: '组件图', context: ComponentDiagram },
  { label: '部署图', context: DeploymentDiagram },
  { label: 'Ditaa 图表', context: DitaaDiagram },
  { label: '实体关系图', context: EntityRelationship },
  { label: 'EBNF 图表', context: ExtendedBackusNaurForm },
  { label: '甘特图', context: GanttDiagram },
  { label: '信息工程图', context: InformationEngineering },
  { label: 'JSON 数据', context: JsonDiagram },
  { label: '思维导图', context: MindmapDiagram },
  { label: '网络图', context: nwdiag },
  { label: '对象图', context: ObjectDiagram },
  { label: 'Regex 图表', context: RegularExpression },
  { label: '用户界面模型', context: salt },
  { label: '序列图', context: SequenceDiagram },
  { label: '状态图', context: StateDiagram },
  { label: '定时图', context: TimingDiagram },
  { label: '用例图', context: UseCaseDiagram },
  { label: 'WBS 图表', context: WBSDiagram },
  { label: 'YAML 数据', context: YamlDiagram }
]
