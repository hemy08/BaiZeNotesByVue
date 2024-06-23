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

export const plantumlDiagrams = {
  baseDiagram: { label: '基础框架', diagram: '\n```plantuml\n@startuml\n\n@enduml\n```\n\n' },
  ActivityDiagram: { label: '活动图', diagram: ActivityDiagram },
  ActivityDiagram2: { label: '规范和描述语言（SDL）', diagram: ActivityDiagram },
  ArchimateDiagram: { label: '架构图', diagram: ArchimateDiagram },
  AsciiMath: { label: 'AsciiMath', diagram: AsciiMath },
  ClassDiagram: { label: '类图', diagram: ClassDiagram },
  ComponentDiagram: { label: '组件图', diagram: ComponentDiagram },
  DeploymentDiagram: { label: '部署图', diagram: DeploymentDiagram },
  DitaaDiagram: { label: 'Ditaa 图表', diagram: DitaaDiagram },
  EntityRelationship: { label: '实体关系图', diagram: EntityRelationship },
  ExtendedBackusNaurForm: { label: 'EBNF 图表', diagram: ExtendedBackusNaurForm },
  GanttDiagram: { label: '甘特图', diagram: GanttDiagram },
  InformationEngineering: { label: '信息工程图', diagram: InformationEngineering },
  JsonDiagram: { label: 'JSON 数据', diagram: JsonDiagram },
  MindmapDiagram: { label: '思维导图', diagram: MindmapDiagram },
  nwdiag: { label: '网络图', diagram: nwdiag },
  ObjectDiagram: { label: '对象图', diagram: ObjectDiagram },
  RegularExpression: { label: 'Regex 图表', diagram: RegularExpression },
  salt: { label: '用户界面模型', diagram: salt },
  SequenceDiagram: { label: '序列图', diagram: SequenceDiagram },
  StateDiagram: { label: '状态图', diagram: StateDiagram },
  TimingDiagram: { label: '定时图', diagram: TimingDiagram },
  UseCaseDiagram: { label: '用例图', diagram: UseCaseDiagram },
  WBSDiagram: { label: 'WBS 图表', diagram: WBSDiagram },
  YamlDiagram: { label: 'YAML 数据', diagram: YamlDiagram }
}
