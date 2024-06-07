export const SequenceDiagram =
  '\n```plantuml\n' +
  '@startuml\n' +
  'skinparam sequenceArrowThickness 2\n' +
  'skinparam roundcorner 20\n' +
  'skinparam maxmessagesize 60\n' +
  'skinparam sequenceParticipant underline\n' +
  '\n' +
  'actor User\n' +
  'participant "First Class" as A\n' +
  'participant "Second Class" as B\n' +
  'participant "Last Class" as C\n' +
  '\n' +
  'User -> A: DoWork\n' +
  'activate A\n' +
  '\n' +
  'A -> B: Create Request\n' +
  'activate B\n' +
  '\n' +
  'B -> C: DoWork\n' +
  'activate C\n' +
  'C --> B: WorkDone\n' +
  'destroy C\n' +
  '\n' +
  'B --> A: Request Created\n' +
  'deactivate B\n' +
  '\n' +
  'A --> User: Done\n' +
  'deactivate A\n' +
  '@enduml\n' +
  '```\n\n'
