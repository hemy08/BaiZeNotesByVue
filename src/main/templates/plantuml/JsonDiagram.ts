export const JsonDiagram =
  '\n```plantuml\n' +
  '@startjson\n' +
  '#highlight "lastName"\n' +
  '#highlight "address" / "city"\n' +
  '#highlight "phoneNumbers" / "0" / "number"\n' +
  '{\n' +
  '  "firstName": "John",\n' +
  '  "lastName": "Smith",\n' +
  '  "isAlive": true,\n' +
  '  "age": 28,\n' +
  '  "address": {\n' +
  '    "streetAddress": "21 2nd Street",\n' +
  '    "city": "New York",\n' +
  '    "state": "NY",\n' +
  '    "postalCode": "10021-3100"\n' +
  '  },\n' +
  '  "phoneNumbers": [\n' +
  '    {\n' +
  '      "type": "home",\n' +
  '      "number": "212 555-1234"\n' +
  '    },\n' +
  '    {\n' +
  '      "type": "office",\n' +
  '      "number": "646 555-4567"\n' +
  '    }\n' +
  '  ],\n' +
  '  "children": [],\n' +
  '  "spouse": null\n' +
  '}\n' +
  '@endjson\n' +
  '```\n\n'
