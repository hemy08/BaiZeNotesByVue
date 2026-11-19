/**
 * preview-md-basic-shared.ts
 * 批次 A「标准 Markdown 扩展」跨语法域共享的类型与 env 键（结构优化第 5 批 5.5 由
 * preview-md-basic.ts 按语法域拆出）。
 *
 * 说明：
 * - 本文件只保留多个语法域模块都要用的类型/常量，不承载解析逻辑；
 * - 各语法域的 env 状态键必须保持模块私有、互不合并（脚注状态与嵌套深度各用一个键）；
 * - 对外暴露的插件入口仍是 preview-md-basic.ts 的 installMdxBasicExtensions（调用方无感）。
 */

import type MarkdownIt from 'markdown-it'

/** markdown-it 实例类型（`MarkdownIt` 默认导出是构造器值，实例类型需用 InstanceType 表达） */
export type MarkdownItInstance = InstanceType<typeof MarkdownIt>

/** env 上的脚注状态键（定义/编号/引用记录，跨 block 与 inline 阶段共享） */
export const ENV_FOOTNOTES = '__mdxBasicFootnotes'

/** env 上的递归嵌套深度键（防御深层嵌套） */
export const ENV_NESTING_DEPTH = '__mdxBasicNestingDepth'
