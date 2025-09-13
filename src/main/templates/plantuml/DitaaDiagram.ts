export const DitaaDiagram =
    '\n```plantuml\n' +
    '@startuml\n' +
    'ditaa\n' +
    '+--------+   +-------+    +-------+\n' +
    '|        +---+ ditaa +--> |       |\n' +
    '|  Text  |   +-------+    |diagram|\n' +
    '|Document|   |!magic!|    |       |\n' +
    '|     {d}|   |       |    |       |\n' +
    '+---+----+   +-------+    +-------+\n' +
    '    :                         ^\n' +
    '    |       Lots of work      |\n' +
    '    +-------------------------+\n' +
    '@enduml\n' +
    '```\n\n'
