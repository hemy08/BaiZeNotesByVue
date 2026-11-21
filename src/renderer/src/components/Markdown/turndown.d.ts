/**
 * turndown 7.2.5 无官方 TypeScript 类型声明（依赖 `@mixmark-io/domino`，浏览器构建
 * 使用宿主 DOMParser）。此处仅声明渲染层实际使用的构造与转换接口，避免为使用一个
 * 纯函数引入 `@types/turndown` 依赖。
 *
 * 注意：本文件需被 tsconfig.test.json 显式 include（与仓库内其它无类型库声明一致），
 * 否则单测程序解析 `import 'turndown'` 时会报 TS7016。
 */
declare module 'turndown' {
    /** turndown 构造选项（仅声明本项目使用到的字段） */
    export interface TurndownOptions {
        headingStyle?: 'setext' | 'atx'
        hr?: string
        bulletListMarker?: '-' | '+' | '*'
        codeBlockStyle?: 'indented' | 'fenced'
        fence?: string
        emDelimiter?: string
        strongDelimiter?: string
        linkStyle?: 'inlined' | 'referenced'
        linkReferenceStyle?: 'full' | 'collapsed' | 'shortcut'
        br?: string
        keepReplacement?: string
    }

    /** HTML → Markdown 转换器（只声明本项目用到的能力） */
    export default class TurndownService {
        constructor(options?: TurndownOptions)
        turndown(input: string | Node): string
    }
}
