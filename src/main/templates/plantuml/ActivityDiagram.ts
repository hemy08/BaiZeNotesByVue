export const ActivityDiagram =
    '\n```plantuml\n' +
    '@startuml\n' +
    ':Ready;\n' +
    ':next(o); <<procedure>>\n' +
    ':Receiving;\n' +
    'split\n' +
    ' :nak(i); <<input>>\n' +
    ' :ack(o); <<output>>\n' +
    'split again\n' +
    ' :ack(i); <<input>>\n' +
    ' :next(o)\n' +
    ' on several lines; <<procedure>>\n' +
    ' :i := i + 1; <<task>>\n' +
    ' :ack(o); <<output>>\n' +
    'split again\n' +
    ' :err(i); <<input>>\n' +
    ' :nak(o); <<output>>\n' +
    'split again\n' +
    ' :foo; <<save>>\n' +
    'split again\n' +
    ' :bar; <<load>>\n' +
    'split again\n' +
    ' :i > 5; <<continuous>>\n' +
    'stop\n' +
    'end split\n' +
    ':finish;\n' +
    '@enduml\n' +
    '```\n\n'
