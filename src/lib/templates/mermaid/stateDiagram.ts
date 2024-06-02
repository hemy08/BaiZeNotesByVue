export const stateDiagram =
  '```mermaid\n' +
  'stateDiagram-v2\n' +
  '    [*] --> First\n' +
  '\n' +
  '    state First {\n' +
  '        [*] --> Second\n' +
  '\n' +
  '        state Second {\n' +
  '            [*] --> second\n' +
  '            second --> Third\n' +
  '\n' +
  '            state Third {\n' +
  '                [*] --> third\n' +
  '                third --> [*]\n' +
  '            }\n' +
  '        }\n' +
  '    }\n' +
  '```'
