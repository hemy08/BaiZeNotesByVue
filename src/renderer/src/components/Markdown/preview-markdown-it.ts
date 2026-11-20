/**
 * preview-markdown-it.ts
 * P0/PF-1：预览 Markdown 渲染的 markdown-it 实例唯一构建入口。
 *
 * 缺陷背景（out/full-scan/perf.md PF-1）：
 * `markdown-it-highlightjs@4.3.0` 的 core 插件会**无条件覆盖** `md.options.highlight`：
 *   md.options.highlight = (opts.auto ? highlightAuto : highlight).bind(...)
 * （见 node_modules/markdown-it-highlightjs/dist/core.js:122）
 * 组件原有配置只传 `{ inline: true, hljs, highlight }`：
 * 1. 未关闭 `auto`（插件默认 auto:true）→ 每个行内代码都执行 `hljs.highlightAuto`
 *    全语言探测，实测 md.render 放大 12×~155×（16 KiB 文档 232.8 ms → 1.5 ms）；
 * 2. 自定义 highlight 回调被插件静默丢弃（实测 getLanguage 调用 0 次）。
 *
 * 修复方式：
 * 1. 安装插件时显式 `auto: false`，关闭全语言自动探测；
 * 2. 在 `.use()` **之后**重新赋值 `md.options.highlight` 为带 `getLanguage` 守卫的实现：
 *    - 仅显式声明且已注册的语言走 highlight.js；
 *    - 未声明/未知语言返回**转义后的文本**（不探测、不丢内容）。
 *    为什么必须返回转义文本：插件 `inline:true` 的 code_inline 渲染器直接把返回值拼进
 *    `<code>`，不像围栏规则那样在空串时兜底 `escapeHtml`，返回 '' 会让行内代码内容消失。
 */
import MarkdownIt from 'markdown-it'
// P1-8：必须使用 core 子入口。默认入口（markdown-it-highlightjs）内部 `require('highlight.js')`
// 会重新把全量 199 种语言拉进预览 chunk（即使我们显式传入 hljs 实例，静态 require 仍被求值）；
// core 子入口不带默认 highlight.js 依赖，只使用调用方传入的实例。
import highlightjs from 'markdown-it-highlightjs/core'
// P1-8：代码高亮实例统一由 preview-highlight.ts 提供（highlight.js core + 精选常用语言，
// 不再引入默认入口的全量 199 种语言）
import hljs from './preview-highlight'
import plantuml from 'markdown-it-plantuml'
import { full as emoji } from 'markdown-it-emoji'
import { logger } from '../../common/logger'
import { installPreviewExtensions } from './preview-markdown-extensions'
import { mkdocsMaterialPlugin } from './preview-mkdocs-material'

/**
 * 构建预览专用 markdown-it 实例（插件顺序与 PF-02 单跳渲染链路一致）。
 *
 * 说明：代码高亮使用的语言由 preview-highlight.ts 在模块加载时统一注册（含 actionscript），
 * 本函数只负责装配 markdown-it 插件，不再做语言注册。
 */
export function createPreviewMarkdownIt(): InstanceType<typeof MarkdownIt> {
    const md = MarkdownIt({
        html: true,
        xhtmlOut: true,
        linkify: true,
        langPrefix: 'language-',
        breaks: true,
        typographer: false
    })

    /**
     * 安全高亮回调（PF-1 核心）：
     * 未指定语言时返回转义文本而非 `hljs.highlightAuto`——这是 12×~155× 放大的来源。
     */
    function safeHighlight(str: string, lang: string): string {
        if (lang && hljs.getLanguage(lang)) {
            try {
                return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
            } catch (error) {
                logger.warn(`Highlight.js error for language '${lang}':`, error)
            }
        }
        // 行内代码（插件 inline 渲染器）直接使用本返回值，必须转义以保留内容
        return md.utils.escapeHtml(str)
    }

    md.use(highlightjs, {
        // PF-1：关闭 highlight.js 全语言自动探测
        auto: false,
        inline: true,
        hljs
    })
        // PF-08：markdown-it-plantuml 仅保留为"远程降级"路径——本地离线渲染
        // （经 hemy-editor-render.ts 的 preRenderPlantumlProc 在 md.render 前把图表替换为
        // 本地 SVG）成功时插件不会再命中已替换的图块；仅当离线资源缺失或主进程通道不可用
        // 时，裸 @startuml 块才由该插件生成原来的远程图片（保证功能不丢失）。
        .use(plantuml)
        .use(emoji)
        // mkdocs-material 语法（!!! admonition / === "标签" tabbed set）改为 markdown-it
        // 原生 block 插件解析：内容由 markdown-it 递归解析，天然支持嵌套 tab/代码围栏/列表。
        // 只新增 block rule 与 token 渲染规则，不触碰 options.highlight（PF-1 顺序保持不变）。
        .use(mkdocsMaterialPlugin)
        // 2026-11-15：mkdocs-material / pymdownx 扩展统一装配（批次 A/B/C 插件）
        .use(installPreviewExtensions)

    // 关键顺序：必须在 .use(highlightjs) 之后重新赋值，否则会被插件 core 覆盖（PF-1）
    md.options.highlight = safeHighlight

    return md
}
