/**
 * markdown-it-highlightjs/core 的最小类型声明（P1-8）。
 *
 * 背景：`markdown-it-highlightjs` 包同时提供默认入口（内部 `require('highlight.js')`，
 * 会把全量语言打进 bundle）与 core 子入口（只使用调用方传入的 hljs 实例）。本项目的
 * preview-markdown-it.ts 改用 `markdown-it-highlightjs/core` 以裁剪 highlight.js 全量语言，
 * 但该包 package.json 未声明 exports/types 子路径，core 子入口没有可解析的类型声明（TS7016），
 * 这里按包内 types/core.d.ts 的实际签名做最小声明。
 *
 * 注意：本文件为脚本声明（顶层只有 declare module，无 import/export），
 * 使 declare module 成为新环境模块声明；与 markdown-it-plantuml.d.ts 同一先例。
 */
declare module 'markdown-it-highlightjs/core' {
    import type MarkdownIt from 'markdown-it'
    import type { HLJSApi, LanguageFn } from 'highlight.js'

    /** 与 markdown-it-highlightjs/types/core.d.ts 的 HighlightOptions 对齐（仅本项目用到的字段） */
    interface HighlightOptions {
        /** 未声明语言时是否自动探测（PF-1 已显式关闭） */
        auto?: boolean
        /** 是否给非围栏代码块加 hljs class */
        code?: boolean
        /** 额外注册的语言 */
        register?: Record<string, LanguageFn>
        /** 语言别名 */
        registerAliases?: Record<string, string | string[]>
        /** 是否高亮行内代码 */
        inline?: boolean
        /** 调用方传入的 highlight.js 实例（本项目固定传 preview-highlight 的 core 实例） */
        hljs?: HLJSApi
        /** 语法不合法时是否继续（不抛异常） */
        ignoreIllegals?: boolean
    }

    interface HighlightjsCore {
        (md: MarkdownIt, opts?: HighlightOptions): void
        defaults: {
            auto: boolean
            code: boolean
            inline: boolean
            ignoreIllegals: boolean
        }
    }

    const highlightjsCore: HighlightjsCore
    export default highlightjsCore
}
