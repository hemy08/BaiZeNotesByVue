# mkdocs-material 语法支持清单与扩展建议（2026-11-15）

- **背景**：预览器已支持 `!!!` admonition 与 `===` content tabs（markdown-it 原生插件，见 [mkdocs-material 渲染修复报告](2026-11-15-mkdocs-material渲染修复报告.md)）
- **本文用途**：盘点 mkdocs-material（含 pymdownx 系扩展）还有哪些语法可支持、当前状态、实现成本与优先级建议
- **结论先行**：可继续支持 **15 项**语法族；其中 **9 项为低成本高收益**（建议下一批），**3 项中等成本**，**3 项建议按需再评估**；另有 6 类站点级/交互级功能不建议（不适用于单文件预览）

## 1. 当前已支持

| 类别 | 语法/能力 | 实现 |
|---|---|---|
| 标准 Markdown | 标题、列表、表格、引用、粗斜体、删除线、行内代码、围栏代码、链接/图片、自动链接 | markdown-it 内建（`html:true` 透传内嵌 HTML） |
| 代码高亮 | 围栏代码按语言高亮（highlight.js，含 actionscript 注册） | `markdown-it-highlightjs`（PF-1 已关闭全语言探测） |
| 数学公式 | 行内 `$...$`、块级 `$$...$$`、```` ```math/katex/latex ```` | KaTeX 预处理 |
| 图表 | Mermaid（本地渲染 + hash 缓存）、PlantUML（本地 teaVM 离线渲染，远程外发已阻断） | 渲染层 + 主进程隐藏窗 |
| mkdocs 提示块 | `!!! type "title"`（含嵌套、可嵌 tab/代码/列表/公式） | 新插件 `preview-mkdocs-material.ts` |
| mkdocs 标签页 | `=== "标签"`（多组唯一 id、默认选中首个、点击切换、可嵌套） | 同上（radio + 已有 `tableset.css`） |
| Emoji | `:smile:` 等短代码 | `markdown-it-emoji` |
| 主题样式 | 已引入 mkdocs-material 的 `admonition.css` / `tableset.css` / `gridcards.css` | `styles/material/` |

## 2. 可继续支持的语法（15 项）

### 2.1 低成本 · 高收益（建议下一批，9 项）

| # | 语法 | mkdocs 扩展 | 当前 | 实现方式 | 预估 |
|---|---|---|---|---|---|
| 1 | 折叠提示块 `??? note` / `???+ note "标题"`（`+` 默认展开） | admonitions | ❌ | 在现有 admonition rule 增加 `???` 分支，输出 `<details class="admonition <type>"><summary>…</summary>…</details>`；`admonition.css` 已含 37 处 `details` 样式 | 小（30~60 行） |
| 2 | 任务列表 `- [x]` / `- [ ]` | 标准 | ❌ | 自研 inline/block rule（或 markdown-it-task-lists）；补 checkbox 样式 | 小 |
| 3 | 高亮 `==文本==` | pymdownx.mark | ❌ | 自研 inline rule → `<mark>`；补样式 | 小 |
| 4 | 插入/删除标记 `++插入++`、`{++ins++}`、`{--del--}` | pymdownx.caret / critic | ❌ | 自研 inline rule → `<ins>`/`<del>`；样式沿用 mkdocs `.critic` | 小 |
| 5 | 上标 `^上标^`、下标 `~下标~`（`~~删除~~` 已有） | pymdownx.caret / tilde | ❌ | 自研 inline rule → `<sup>`/`<sub>` | 小 |
| 6 | 键盘按键 `++ctrl+alt+del++` → `<kbd>` | pymdownx.keys | ❌ | 自研 inline rule；`admonition.css` 已含 `kbd` 样式 | 小 |
| 7 | 属性列表 `[按钮](url){ .md-button }`、`{: align=center }`、图片对齐 | attr_list | ❌ | 引入 markdown-it-attrs 或自研（~100 行）；补 `.md-button` 样式 | 小~中 |
| 8 | 脚注 `[^1]` / `[^1]: 说明` | 标准（mkdocs 默认开） | ❌ | markdown-it-footnote 或自研；补脚注样式 | 小~中 |
| 9 | 定义列表 `术语` + `: 定义` | 标准 | ❌ | markdown-it-deflist 或自研；补样式 | 小 |

> 注：第 2~9 项均为 markdown-it 插件式实现，互不冲突；每个插件 2~3 个测试即可覆盖，可一次性合成一个"标准扩展插件"分批落地。

### 2.2 中等成本 · 按需求排期（3 项）

| # | 语法 | mkdocs 扩展 | 当前 | 实现方式 | 预估 |
|---|---|---|---|---|---|
| 10 | 网格卡片 `<div class="grid cards" markdown>` + 列表/图标 | grid cards | ❌（CSS 已引入但无语法支持） | 需 md-in-html 能力：识别带 `markdown` 属性的容器并递归解析内部 markdown；`gridcards.css` 已就绪 | 中（100~200 行） |
| 11 | 代码块增强：`linenums` 行号、`hl_lines="2 3"` 高亮行、`title="文件名"`、行内高亮 `` `#!python x` `` | pymdownx.highlight / inlinehilite | ❌ | 扩展 fence renderer + 预处理属性解析；补行号/标题 CSS | 中 |
| 12 | Material 图标 `:material-account:` / `:octicons-…:` | icons | ❌ | 打包 Material Design Icons 子集（SVG sprite）+ inline 替换；体积需评估 | 中 |

### 2.3 低优先 · 视使用场景再评估（3 项）

| # | 语法 | 说明 | 建议 |
|---|---|---|---|
| 13 | `pymdownx.blocks` 新块语法（`/// note` 块语法（标题用竖线分隔），mkdocs-material 9.x） | 与 `!!!` 并列的新式写法 | 待确认笔记是否使用；若用则按 `!!!` 同思路加一个 rule |
| 14 | 跨文件片段 `--8<-- "file.md"`（snippets） | 构建期文件包含 | 桌面预览需额外安全策略（仅允许工作区/受信路径）；按需 |
| 15 | 内容 tab 深链锚点（`#tab-xxx` 直接跳转/刷新保持选中） | 当前 radio 方案为静态 HTML | 可加 tab id + 欢迎页/大纲跳转联动；优先级低 |

## 3. 不建议支持（6 类，超出单文件预览范畴）

| 类别 | 说明 |
|---|---|
| 站点级功能 | 导航、搜索、tags、blog、social cards、版本选择等 mkdocs 构建特性，不适用于桌面单文件预览 |
| 表格排序/过滤 | 需前端交互框架，markdown 渲染层不宜内置 |
| mkdocstrings / API 文档 | 面向 Python 文档生成，与笔记场景无关 |
| 图表类扩展 | 已由 Mermaid/PlantUML 覆盖；drawio/graphviz 等按需另议 |
| 幻灯片 `reveal.js` 语法 | 独立展示能力，非预览渲染范畴 |
| 多语言站点（i18n 内容目录） | 与笔记应用自身 i18n 无关 |

## 4. 推荐落地路线

| 批次 | 内容 | 说明 |
|---|---|---|
| **批次 A（建议先做）** | #1 折叠提示块、#2 任务列表、#3 高亮、#4 插入/删除、#5 上下标、#6 键盘按键、#7 属性列表、#8 脚注、#9 定义列表 | 全部为小成本 inline/block rule，可合并为 1 个"标准扩展插件"文件 + 1 个测试文件；预计 1 个代理任务完成 |
| **批次 B** | #10 grid cards（md-in-html）、#11 代码块增强（行号/高亮行/标题） | 中等成本，建议独立子任务并行 |
| **批次 C（按需）** | #12 Material 图标集、#13 blocks 语法、#15 tab 深链 | 视笔记实际使用情况排期 |

**统一实现约束**（与现有渲染管线一致）：

- 全部以 markdown-it 插件形式接入 `createPreviewMarkdownIt()`，不恢复"字符串预渲染"方案；
- 新标签/属性需通过 DOMPurify 配置校验（`details/summary/kbd/ins/del/mark/sup/sub` 在默认 html profile 内，checkbox `input` 与 `{ .class }` 需测试确认）；
- 样式统一补在 `styles/material/`（可继续从 mkdocs-material 主题按需摘取，MIT 许可）；
- 每个语法补 jsdom + 真实 Markdown 样例测试；不引入重量级新依赖（已有 markdown-it 生态插件可直接用）。

## 5. 结论

- **已支持**：admonition、content tabs、KaTeX、Mermaid/PlantUML、标准 Markdown、代码高亮、Emoji；
- **建议下一步**：批次 A 的 9 项低成本语法（折叠块、任务列表、高亮/插入/上下标、键盘按键、属性列表、脚注、定义列表）一次补齐，可覆盖 mkdocs 笔记 90% 的剩余高频写法；
- **可选扩展**：grid cards 与代码块增强（行号/高亮行/标题）为第二批；Material 图标与 snippets 视实际笔记使用情况决定。
