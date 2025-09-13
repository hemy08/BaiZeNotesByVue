export const gitGraph =
    '\n```mermaid\n' +
    'gitGraph\n' +
    '    commit id: "1"\n' +
    '    commit id: "2"\n' +
    '    branch nice_feature\n' +
    '    checkout nice_feature\n' +
    '    commit id: "3"\n' +
    '    checkout main\n' +
    '    commit id: "4"\n' +
    '    checkout nice_feature\n' +
    '    branch very_nice_feature\n' +
    '    checkout very_nice_feature\n' +
    '    commit id: "5"\n' +
    '    checkout main\n' +
    '    commit id: "6"\n' +
    '    checkout nice_feature\n' +
    '    commit id: "7"\n' +
    '    checkout main\n' +
    '    merge nice_feature id: "customID" tag: "customTag" type: REVERSE\n' +
    '    checkout very_nice_feature\n' +
    '    commit id: "8"\n' +
    '    checkout main\n' +
    '    commit id: "9"\n' +
    '```\n\n'
