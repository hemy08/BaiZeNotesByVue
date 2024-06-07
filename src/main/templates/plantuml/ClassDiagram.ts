export const ClassDiagram =
  '\n```plantuml\n' +
  '@startuml\n' +
  '\n' +
  'abstract class AbstractList\n' +
  'abstract AbstractCollection\n' +
  'interface List\n' +
  'interface Collection\n' +
  '\n' +
  'List <|-- AbstractList\n' +
  'Collection <|-- AbstractCollection\n' +
  '\n' +
  'Collection <|- List\n' +
  'AbstractCollection <|- AbstractList\n' +
  'AbstractList <|-- ArrayList\n' +
  '\n' +
  'class ArrayList {\n' +
  '  Object[] elementData\n' +
  '  size()\n' +
  '}\n' +
  '\n' +
  'enum TimeUnit {\n' +
  '  DAYS\n' +
  '  HOURS\n' +
  '  MINUTES\n' +
  '}\n' +
  '\n' +
  'annotation SuppressWarnings\n' +
  '\n' +
  '@enduml\n' +
  '```\n\n'
