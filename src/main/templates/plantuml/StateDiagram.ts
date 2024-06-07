export const StateDiagram =
  '\n```plantuml\n' +
  '@startuml\n' +
  '[*] -> State1\n' +
  'State1 --> State2 : Succeeded\n' +
  'State1 --> [*] : Aborted\n' +
  'State2 --> State3 : Succeeded\n' +
  'State2 --> [*] : Aborted\n' +
  'state State3 {\n' +
  '  state "Accumulate Enough Data" as long1\n' +
  '  long1 : Just a test\n' +
  '  [*] --> long1\n' +
  '  long1 --> long1 : New Data\n' +
  '  long1 --> ProcessData : Enough Data\n' +
  '  State2 --> [H]: Resume\n' +
  '}\n' +
  'State3 --> State2 : Pause\n' +
  'State2 --> State3[H*]: DeepResume\n' +
  'State3 --> State3 : Failed\n' +
  'State3 --> [*] : Succeeded / Save Result\n' +
  'State3 --> [*] : Aborted\n' +
  '@enduml\n' +
  '```\n\n'
