export const blockDiagram =
    '\n```mermaid\n' +
    'block-beta\n' +
    '  columns 3\n' +
    '  Start(("Start")) space:2\n' +
    '  down<[" "]>(down) space:2\n' +
    '  Decision{{"Make Decision"}} right<["Yes"]>(right) Process1["Process A"]\n' +
    '  downAgain<["No"]>(down) space r3<["Done"]>(down)\n' +
    '  Process2["Process B"] r2<["Done"]>(right) End(("End"))\n' +
    '\n' +
    '  style Start fill:#969;\n' +
    '  style End fill:#696;\n' +
    '```\n\n'
