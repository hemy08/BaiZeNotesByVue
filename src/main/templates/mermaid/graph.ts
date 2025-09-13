export const graph =
    '\n```mermaid\n' +
    'graph TB\n' +
    '    sq[Square shape] --> ci((Circle shape))\n' +
    '\n' +
    '    subgraph A\n' +
    '        od>Odd shape]-- Two line<br/>edge comment --> ro\n' +
    '        di{Diamond with <br/> line break} -.-> ro(Rounded<br>square<br>shape)\n' +
    '        di==>ro2(Rounded square shape)\n' +
    '    end\n' +
    '\n' +
    '    %% Notice that no text in shape are added here instead that is appended further down\n' +
    '    e --> od3>Really long text with linebreak<br>in an Odd shape]\n' +
    '\n' +
    '    %% Comments after double percent signs\n' +
    '    e((Inner / circle<br>and some odd <br>special characters)) --> f(,.?!+-*ز)\n' +
    '\n' +
    '    cyr[Cyrillic]-->cyr2((Circle shape Начало));\n' +
    '\n' +
    '     classDef green fill:#9f6,stroke:#333,stroke-width:2px;\n' +
    '     classDef orange fill:#f96,stroke:#333,stroke-width:4px;\n' +
    '     class sq,e green\n' +
    '     class di orange\n' +
    '```\n\n'
