export const ObjectDiagram =
  '\n```plantuml\n' +
  '@startuml PERT\n' +
  'left to right direction\n' +
  '\' Horizontal lines: -->, <--, <-->\n' +
  '\' Vertical lines: ->, <-, <->\n' +
  'title PERT: Project Name\n' +
  '\n' +
  'map Kick.Off {\n' +
  '}\n' +
  'map task.1 {\n' +
  '    Start => End\n' +
  '}\n' +
  'map task.2 {\n' +
  '    Start => End\n' +
  '}\n' +
  'map task.3 {\n' +
  '    Start => End\n' +
  '}\n' +
  'map task.4 {\n' +
  '    Start => End\n' +
  '}\n' +
  'map task.5 {\n' +
  '    Start => End\n' +
  '}\n' +
  'Kick.Off --> task.1 : Label 1\n' +
  'Kick.Off --> task.2 : Label 2\n' +
  'Kick.Off --> task.3 : Label 3\n' +
  'task.1 --> task.4\n' +
  'task.2 --> task.4\n' +
  'task.3 --> task.4\n' +
  'task.4 --> task.5 : Label 4\n' +
  '@enduml\n' +
  '```\n\n'
