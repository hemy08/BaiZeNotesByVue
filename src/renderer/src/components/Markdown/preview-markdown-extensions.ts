/**
 * 预览 Markdown 扩展统一注册入口（2026-11-15）
 *
 * 目的：把 mkdocs-material / pymdownx 扩展拆分为三个独立插件模块，分别由不同任务维护，
 * 统一在这里装配，避免多个任务同时修改 `preview-markdown-it.ts` 造成冲突。
 *
 * 批次：
 * - A preview-md-basic.ts ：折叠提示块、任务列表、高亮/插入/上下标、kbd、attr_list、脚注、定义列表
 *   （结构优化第 5 批 5.5 已按语法域拆为 preview-md-basic-{shared,blocks,footnotes,attributes,inline}.ts，
 *   本入口仍只调用 installMdxBasicExtensions）
 * - B preview-md-media.ts ：grid cards、代码块增强（行号/高亮行/标题/行内高亮）、Material 图标
 * - C preview-md-blocks.ts：pymdownx.blocks（///）、snippets（--8<--）、tab 深链
 */
import type MarkdownIt from 'markdown-it'
import { installMdxBasicExtensions } from './preview-md-basic'
import { installMdxMediaExtensions } from './preview-md-media'
import { installMdxBlocksExtensions } from './preview-md-blocks'

/** 装配全部预览扩展插件（markdown-it 插件签名） */
export function installPreviewExtensions(md: InstanceType<typeof MarkdownIt>): void {
    installMdxBasicExtensions(md)
    installMdxMediaExtensions(md)
    installMdxBlocksExtensions(md)
}
