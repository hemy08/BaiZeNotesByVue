/**
 * 注册自定义语言支持
 * 为 Monaco Editor 添加 PlantUML 等语言支持
 */

import * as monaco from 'monaco-editor'

/**
 * 注册 PlantUML 语言
 */
export function registerPlantUMLLanguage() {
    // 注册语言
    monaco.languages.register({ id: 'plantuml' })

    // 设置语言配置
    monaco.languages.setMonarchTokensProvider('plantuml', {
        keywords: [
            'abstract', 'as', 'class', 'color', 'create', 'end', 'enum', 'extends', 'final',
            'float', 'hide', 'implements', 'interface', 'internal', 'left', 'namespace',
            'new', 'nonvirtual', 'of', 'package', 'packageifce', 'private', 'protected',
            'public', 'return', 'right', 'static', 'stereotype', 'struct', 'super', 'this',
            'to', 'typedef', 'up', 'virtual', 'void'
        ],

        operators: [
            '=', '>', '<', '~', ':', '..'
        ],

        symbols: /[=><~:]+/,

        tokenizer: {
            root: [
                [/@\w+/, 'keyword'],
                [/'[^']*'/, 'string'],
                [/"/, { token: 'string.quote', bracket: '@open', next: '@string' }],
                [/#.*$/, 'comment'],
                [/\/\//, 'comment'],
                [/\w+/, {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'identifier'
                    }
                }],
                [/@symbols/, {
                    cases: {
                        '@operators': 'operator',
                        '@default': ''
                    }
                }],
            ],
            string: [
                [/[^\\"]+/, 'string'],
                [/"/, { token: 'string.quote', bracket: '@close', next: '@pop' }]
            ]
        }
    })

    // 设置语言配置（括号匹配等）
    monaco.languages.setLanguageConfiguration('plantuml', {
        brackets: [
            ['{', '}'],
            ['[', ']'],
            ['(', ')']
        ],
        autoClosingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' },
            { open: "'", close: "'" }
        ],
        surroundingPairs: [
            { open: '{', close: '}' },
            { open: '[', close: ']' },
            { open: '(', close: ')' },
            { open: '"', close: '"' },
            { open: "'", close: "'" }
        ]
    })

    console.log('[Monaco] PlantUML language registered')
}

/**
 * 注册 Mermaid 语言
 */
export function registerMermaidLanguage() {
    // 注册语言
    monaco.languages.register({ id: 'mermaid' })

    // 设置简单的语法高亮
    monaco.languages.setMonarchTokensProvider('mermaid', {
        keywords: [
            'graph', 'flowchart', 'sequenceDiagram', 'classDiagram', 'stateDiagram',
            'erDiagram', 'gantt', 'pie', 'journey', 'gitGraph', 'mindmap', 'timeline',
            'subgraph', 'end', 'direction', 'TB', 'BT', 'RL', 'LR', 'TD'
        ],

        tokenizer: {
            root: [
                [/@\w+/, 'keyword'],
                [/#.*$/, 'comment'],
                [/%%.*$/, 'comment'],
                [/\w+/, {
                    cases: {
                        '@keywords': 'keyword',
                        '@default': 'identifier'
                    }
                }],
                [/->>|-->|--|->|-\.|\.->|\.->\.|-\.->|-\.->\.|<->|<-->|x--|x--x|x-|x-x|-x|-x-/, 'operator'],
                [/---|--/, 'operator'],
                [/\[.*?\]/, 'string'],
                [/\(.*?\)/, 'string'],
                [/\{.*?\}/, 'string'],
            ]
        }
    })

    console.log('[Monaco] Mermaid language registered')
}

/**
 * 注册所有自定义语言
 */
export function registerCustomLanguages() {
    registerPlantUMLLanguage()
    registerMermaidLanguage()
}
