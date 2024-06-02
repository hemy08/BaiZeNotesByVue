export const InformationEngineering =
  '```plantuml\n' +
  '@startuml\n' +
  '\n' +
  '\' hide the spot\n' +
  'hide circle\n' +
  '\n' +
  '\' avoid problems with angled crows feet\n' +
  'skinparam linetype ortho\n' +
  '\n' +
  'entity "Entity01" as e01 {\n' +
  '  *e1_id : number <<generated>>\n' +
  '  --\n' +
  '  *name : text\n' +
  '  description : text\n' +
  '}\n' +
  '\n' +
  'entity "Entity02" as e02 {\n' +
  '  *e2_id : number <<generated>>\n' +
  '  --\n' +
  '  *e1_id : number <<FK>>\n' +
  '  other_details : text\n' +
  '}\n' +
  '\n' +
  'entity "Entity03" as e03 {\n' +
  '  *e3_id : number <<generated>>\n' +
  '  --\n' +
  '  e1_id : number <<FK>>\n' +
  '  other_details : text\n' +
  '}\n' +
  '\n' +
  'e01 ||..o{ e02\n' +
  'e01 |o..o{ e03\n' +
  '\n' +
  '@enduml\n' +
  '```'
