/**
 * preview-md-basic.ts
 * 批次 A：标准 Markdown 扩展（mkdocs-material / pymdownx 基础语法）——markdown-it 原生插件。
 *
 * 实现的 9 项语法（全部在 markdown-it 解析阶段完成，不做「渲染后字符串替换」）：
 * 1. 折叠提示块：`??? note "标题"` / `???+ note "标题"` → `<details class="admonition note" open?>`
 *    + `<summary class="admonition-title">标题</summary>` + 递归解析的内容（复用 admonition.css）；
 * 2. 任务列表：`- [ ]` / `- [x]`（大小写 x）→ 列表项 class `task-list-item` + 首段前
 *    `<input type="checkbox" disabled checked?>`;
 * 3. 高亮：`==高亮==` → `<mark>`;
 * 4. 插入/删除/critic：`^^插入^^` → `<ins>`、markdown-it 内建 `~~删除~~` 保持不变、
 *    `{++insert++}`/`{--delete--}`/`{~~old~>new~~}`/`{==highlight==}`/`{>>comment<<}`（隐藏注释）；
 * 5. 上标/下标：`^上标^` → `<sup>`、`~下标~` → `<sub>`（不干扰内建 `~~删除~~`）；
 * 6. 键盘按键：`++ctrl+alt+del++` → `<kbd>ctrl</kbd>+<kbd>alt</kbd>+<kbd>del</kbd>`；
 * 7. 属性列表（attr_list）：`[按钮](url){ .md-button }`、`![alt](img){ align=center }`、
 *    标题 `# 标题 { #custom-id }`、任意行内元素尾随 `{ .class #id key=value }`；
 * 8. 脚注：`[^1]` 引用 + `[^1]: 说明` 定义 → 行内 `<sup class="footnote-ref">…</sup>`，
 *    文末 `<section class="footnotes"><ol><li id="fn-1">…</li></ol></section>`；缺定义时回退原文；
 * 9. 定义列表：`术语` + 下一行 `: 定义`（续行缩进延续）→ `<dl><dt>…</dt><dd>…</dd></dl>`。
 *
 * 设计要点：
 * - 行内规则统一注册为一个「分派器」（插入在 markdown-it `text` 规则之前）：只在 `{`/`+`/`=`/
 *   `^`/`~`/`[` 等终止符位置被调用，命中后才推进 `state.pos`，未命中一律返回 false，
 *   因此不会吞掉 emoji、KaTeX 公式、链接、内建 strikethrough 等既有语法；
 * - 所有用户文本输出前经 `md.utils.escapeHtml`（文本 token 由默认 text 渲染器转义），
 *   块级头部（??? 标题、tab 标签、属性值）显式转义；
 * - 块规则（??? / 脚注定义 / 定义列表 / 标题属性）产出正确 `block`/`nesting`/`map` 的 token，
 *   内容用 `state.md.block.parse()` 递归解析，天然支持嵌套（??? 内列表/代码块/嵌套 ???）；
 * - 非法/未闭合语法一律返回 false 回退为普通文本，不抛异常、不吞后续 Markdown；
 * - 产物标签（details/summary/ins/del/mark/sup/sub/kbd/dl/dt/dd/input 及其
 *   class/id/disabled/checked/open 等属性）均在 DOMPurify 默认 HTML 白名单内（有测试校验）。
 *
 * 已知边界（不修改既有预处理管线的前提下）：
 * - `preview-local-render.ts` 会在 markdown-it 之前把 `![alt](本地图片)` 替换为原始 HTML 并
 *   把本地链接替换为 `<a>`，因此「图片/本地链接 + 属性列表」在完整预览管线中拿不到该属性；
 *   直接 `createPreviewMarkdownIt().render()`（本模块语法层）行为正确；http(s) 链接不受影响。
 * - 段落级「末行单独成行」的属性列表未实现（需求只要求标题同行与行内尾随两种形式）。
 *
 * 结构优化第 5 批 5.5：本模块（原 1,416 行）已按语法域拆为同目录 5 个文件，
 * 本文件只保留**插件安装入口**（规则注册顺序集中在此，行为不变）：
 * - preview-md-basic-shared.ts：跨域共享的实例类型 / env 状态键；
 * - preview-md-basic-blocks.ts：??? 折叠提示块、定义列表、任务列表 core 规则 + details 渲染；
 * - preview-md-basic-footnotes.ts：脚注定义/引用/文末脚注区 + 脚注渲染；
 * - preview-md-basic-attributes.ts：attr_list（标题/行内/延后元素）；
 * - preview-md-basic-inline.ts：mark/ins/del/sup/sub/kbd/critic 行内语法 + 统一分派器。
 * 对外导出保持 `installMdxBasicExtensions` 单一入口不变（调用方 import 路径零改动）。
 */

import type { MarkdownItInstance } from './preview-md-basic-shared'
import {
    collapsibleAdmonitionBlockRule,
    definitionListBlockRule,
    registerDetailsRenderer,
    taskListCoreRule
} from './preview-md-basic-blocks'
import {
    footnoteDefinitionBlockRule,
    footnoteSectionCoreRule,
    registerFootnoteRenderers,
    resetBasicEnvCoreRule
} from './preview-md-basic-footnotes'
import {
    deferredInlineAttributesCoreRule,
    headingAttributeBlockRule
} from './preview-md-basic-attributes'
import { mdxBasicInlineRule } from './preview-md-basic-inline'

/**
 * 安装标准 Markdown 扩展插件（批次 A）：
 * 折叠提示块、任务列表、mark/ins/del/sup/sub、键盘按键、行内/标题属性列表、脚注、定义列表。
 *
 * 由 `installPreviewExtensions(md)` 统一调用；只新增 block/inline/core 规则与渲染规则，
 * 不修改 `md.options.highlight`（PF-1 的高亮守卫顺序保持不变）。
 */
export function installMdxBasicExtensions(md: MarkdownItInstance): void {
    // core：解析开始时复位插件状态（同一次 render 内自增，跨 render 互不影响）
    md.core.ruler.before('normalize', 'mdx_basic_env_reset', resetBasicEnvCoreRule)

    // block：标题属性（与标准 heading 相同的段落打断能力）
    md.block.ruler.before('heading', 'mdx_basic_heading_attributes', headingAttributeBlockRule, {
        alt: ['paragraph', 'reference', 'blockquote']
    })
    // block：??? 折叠块 / 定义列表（不打断既有段落，要求块前有空行）
    md.block.ruler.before(
        'paragraph',
        'mdx_basic_collapsible_admonition',
        collapsibleAdmonitionBlockRule,
        { alt: [] }
    )
    md.block.ruler.before('paragraph', 'mdx_basic_definition_list', definitionListBlockRule, {
        alt: []
    })
    // block：脚注定义必须早于 markdown-it 的 reference 规则——`[^1]: 内容` 的形态同时满足
    // 「链接引用定义 `[label]: dest`」，若晚于 reference 会被误解析成引用定义（脚注失效）。
    md.block.ruler.before(
        'reference',
        'mdx_basic_footnote_definition',
        footnoteDefinitionBlockRule,
        {
            alt: []
        }
    )

    // inline：统一分派器（位于 text 之前，仅命中本插件触发字符时生效）
    md.inline.ruler.before('text', 'mdx_basic_inline', mdxBasicInlineRule)

    // core：文末脚注区（inline 之后：所有引用已完成编号）→ 延后行内属性 → 任务列表改写
    md.core.ruler.after('inline', 'mdx_basic_footnote_section', footnoteSectionCoreRule)
    md.core.ruler.after(
        'mdx_basic_footnote_section',
        'mdx_basic_inline_attributes',
        deferredInlineAttributesCoreRule
    )
    md.core.ruler.after('mdx_basic_inline_attributes', 'mdx_basic_task_lists', taskListCoreRule)

    registerDetailsRenderer(md)
    registerFootnoteRenderers(md)
}
