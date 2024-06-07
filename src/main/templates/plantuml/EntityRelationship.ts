export const EntityRelationship =
  '\n```plantuml\n' +
  '@startchen\n' +
  '\n' +
  'entity PARENT {\n' +
  '  Number <<key>>\n' +
  '  Name\n' +
  '}\n' +
  '\n' +
  'entity CHILD <<weak>> {\n' +
  '  Name <<key>>\n' +
  '  Age\n' +
  '}\n' +
  '\n' +
  'relationship PARENT_OF <<identifying>> {\n' +
  '}\n' +
  '\n' +
  'PARENT_OF -1- PARENT\n' +
  'PARENT_OF =N= CHILD\n' +
  '\n' +
  '@endchen\n' +
  '```\n\n'
