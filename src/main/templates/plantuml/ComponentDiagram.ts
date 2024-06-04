export const ComponentDiagram =
  '```plantuml\n' +
  '@startuml\n' +
  '\n' +
  'package "Some Group" {\n' +
  '  HTTP - [First Component]\n' +
  '  [Another Component]\n' +
  '}\n' +
  '\n' +
  'node "Other Groups" {\n' +
  '  FTP - [Second Component]\n' +
  '  [First Component] --> FTP\n' +
  '}\n' +
  '\n' +
  'cloud {\n' +
  '  [Example 1]\n' +
  '}\n' +
  '\n' +
  '\n' +
  'database "MySql" {\n' +
  '  folder "This is my folder" {\n' +
  '    [Folder 3]\n' +
  '  }\n' +
  '  frame "Foo" {\n' +
  '    [Frame 4]\n' +
  '  }\n' +
  '}\n' +
  '\n' +
  '\n' +
  '[Another Component] --> [Example 1]\n' +
  '[Example 1] --> [Folder 3]\n' +
  '[Folder 3] --> [Frame 4]\n' +
  '\n' +
  '@enduml\n' +
  '```'
