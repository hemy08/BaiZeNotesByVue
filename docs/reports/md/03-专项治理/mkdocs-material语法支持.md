<!-- report-nav:start -->
> 🧭 **报告导航**：[🏠 报告首页](../../README.md) ｜ [01-检查与扫描](../01-检查与扫描/) ｜ [02-修复与实施](../02-修复与实施/) ｜ [03-专项治理](../03-专项治理/) ｜ 当前：**mkdocs-material语法支持**（03-专项治理）
<!-- report-nav:end -->

# mkdocs-material 语法支持（合并归档）

> **合并归档报告**：由以下历史报告合并而成（保留原文，按时间顺序成章）：`2026-11-15-mkdocs-material渲染修复报告.md`、`2026-11-15-mkdocs-material语法支持清单与建议.md`、`2026-11-15-mkdocs-material扩展语法实施报告.md`。
> 内容为历史快照；当前口径见 [报告总索引](../../README.md) 与 [IPC通信矩阵](IPC通信矩阵.md)（v1.3.9 基线：169 测试文件 / 3,234 用例 / 92 IPC 通道 / 17 组）。

## 一、admonition / tabbed 原生插件渲染修复

- **问题**：白泽笔记 Markdown 预览对 **mkdocs-material 语法**（`!!!` admonition + `===` pymdownx tabbed，内含嵌套缩进代码块）渲染错误
- **样例文件**：`E:\github.com\hemy08\hemynotes\docs\500-力扣题解\数组之位运算\001-只出现一次的数字1.md`
- **结论**：已改为 markdown-it 原生 block 插件实现，样例文件渲染为 **7 张卡片 + 4 组标签页（16 个 tab）+ 11 个语法高亮代码块**，无裸语法残留
- **验证**：typecheck 三工程 0 错误、**134 文件 / 2252 用例全过**、ESLint 0 error、`electron-vite build` 通过、`npm run build:win` 打包通过

#### 1. 问题现象

修复前预览效果：

- `!!! Success "位运算解法"` 只渲染出绿色标题框与**第一个 tab 按钮**，tab 内容区为空；
- 后续 tab 标题（`=== "Go异或"` 等）与代码围栏以**纯文本/行内代码**形式泄漏（裸 ` ``` ` 可见）；
- 期望效果（mkdocs-material 风格）：每个 `!!!` 渲染为彩色卡片（标题 + 图标），内部 `===` 渲染为可切换标签页，每个 tab 内渲染语法高亮代码块（默认选中第一个 tab）。

#### 2. 根因

旧实现是「预渲染字符串替换 + 再交给 markdown-it」的两段式方案（`preview-local-render.ts` 中约 430 行）：

| # | 根因 | 影响 |
|---|---|---|
| 1 | `materialAdmonitionsRender` / `tabbedSetRender` 按行扫描、正则切分，无法正确处理「admonition 内嵌 tabbed、tab 内容再缩进 4/8 空格」的嵌套结构 | tab 内容为空、块结构错位 |
| 2 | `splitByCodeBlocks` 分段后用 `join('')` 拼接，**吞掉分段边界换行**（`a\n```js\nx\n```\nb` → `a```js\nx\n```b`）；缩进围栏识别失败时会一直吞到文末 | tab 内容丢失、后续整段文档被吞 |
| 3 | 代码围栏文本被**直接拼进 HTML 字符串**，markdown-it 收到后不再把其当作代码块解析 | 裸 ` ``` ` 与代码以文本泄漏 |
| 4 | 块内 Markdown（列表 / 行内代码 / 粗体）被单独渲染、与主文档解析器割裂 | 嵌套内容样式不一致 |

#### 3. 修复方案

##### 3.1 新增 markdown-it block 插件（核心）

新增 [`preview-mkdocs-material.ts`](../../../../src/renderer/src/components/Markdown/preview-mkdocs-material.ts)，导出 `mkdocsMaterialPlugin(md)`：

- **admonition rule**：匹配 `!!! type "title"`；收集空行或缩进 ≥4 空格/Tab 的后续行并去缩进，调用 `state.md.block.parse()` **递归解析**内容；产出 `mkdocs_admonition_open/title/close` token，渲染为 `.admonition.<type> > .admonition-title`（复用已引入的 mkdocs CSS，Success 等类型自带彩色/图标样式）；
- **tabbed set rule**：匹配 `=== "标签"`（兼容双空格），收集连续标签段并递归解析每段内容；渲染为与 `tableset.css` 选择器完全匹配的结构：
  ```html
  <div class="tabbed-set tabbed-alternate" data-tabs="N">
    <input type="radio" name="__tabbed_<setId>" id="__tabbed_<setId>_1" checked> ×N
    <div class="tabbed-labels">…<label for="__tabbed_<setId>_i">标签</label>…</div>
    <div class="tabbed-content"><div class="tabbed-block">…</div>×N</div>
  </div>
  ```
  setId 用 `env` 自增计数器保证同文档多组 tab 唯一；默认选中第一个 tab，点击标签切换（纯 CSS radio 方案，无脚本）；
- 标题/标签均 `escapeHtml`；token 带 `block: true` 与行号 map（目录定位 PF-14 不回归）；含嵌套深度保护与非法/未闭合块的优雅回退。

##### 3.2 接入与清理

| 文件 | 修改 |
|---|---|
| `preview-markdown-it.ts` | `createPreviewMarkdownIt()` 注册 `mkdocsMaterialPlugin`（不影响 PF-1 的高亮回调顺序） |
| `preview-local-render.ts` | 删除旧 Material/Tabbed 解析器（约 430 行）及多余 import；`renderContent` 只保留 KaTeX + 图片/文件 URL 变换；`HemyRenderPostLocal` 改为恒等；`splitByCodeBlocks` 重写为**字符偏移区间**方案（拼接后与原文逐字符一致，修复吞换行 bug） |
| `styles/material/*.css` | 未大改（复用既有 mkdocs admonition / tableset 样式） |

#### 4. 验证结果

##### 4.1 真实笔记渲染（完整管线）

| 指标 | 结果 |
|---|---|
| admonition 卡片 | **7**（question / example / tip / info / success×3） |
| tabbed set 组 | **4**（Success 卡片内分别为 5、5 个 tab；示例与提示卡片各 3 个） |
| radio / tab 面板 | **16 / 16** |
| 语法高亮代码块 | **11**（c / go / cpp / python / rust） |
| 裸 ` ``` ` / `!!!` / `===` 残留 | **0** |
| 默认选中 | 每组第一个 tab |

渲染产物（含内嵌样式，可直接浏览器打开查看）：`out\tool-results\preview-real-file.html`。

##### 4.2 自动化门禁

| 门禁 | 结果 |
|---|---|
| typecheck（node / web / test） | ✅ 0 错误 |
| 单元测试 | ✅ **134 文件 / 2252 用例全过**（新增 `mkdocs-material-render.test.ts` 25 例，改写 material-render / tabbed-set-render / pf15 等 7 文件 116 例） |
| ESLint | ✅ 0 error |
| electron-vite build | ✅ 通过 |
| `npm run build:win` | ✅ 通过：`BaiZeNotes_Setup_1.3.0_windows_x64.exe`（118.17 MB）、便携版（107.28 MB） |
| 打包产物校验 | ✅ `dist\win-unpacked\resources\app.asar` 渲染资源含 `tabbed-set` / `__tabbed_` / `mkdocs_admonition` 新实现 |

##### 4.3 测试覆盖点

- admonition 有/无标题、类型 class、标题 HTML 转义；
- admonition 内 tabbed（多 tab、代码围栏 c/go/cpp）→ input/label/block 数量、首个 checked、hljs 高亮、无裸 ` ``` `；
- 多组 tab 的 radio name/id 唯一；`===  "双空格"` 兼容；空行/8 空格缩进代码块；
- 未闭合块/非法语法优雅回退；普通 Markdown 不受影响；
- 经 DOMPurify（与预览相同 `USE_PROFILES` 配置）后 `input/label/for/checked/name/id` 保留（jsdom）。

#### 5. 使用说明与遗留

**使用**：在应用中打开该笔记文件即可看到卡片 + 标签页 + 高亮代码，点击标签切换；重新打包的安装包/便携版已包含本修复。

**遗留（非阻塞）**：

- `tableset.css` 既有 `:checked` 选择器覆盖最多 20 个 tab（超出需扩展 CSS）；
- `MarkdownPreviewComponent.vue` / `preview-chapters.ts` 中"HemyRenderPreLocal 合并换行"旧注释已过时（本次未改这两个文件）；
- 渲染样式沿用 mkdocs-material CSS 变量，随应用主题（浅/深色）变化；
- 若笔记使用 `???` 折叠块 / `grid cards` 等其它 mkdocs 扩展语法，需后续按需补充（本次仅覆盖 admonition + tabbed）。

## 二、语法支持清单与建议（历史规划）

- **背景**：预览器已支持 `!!!` admonition 与 `===` content tabs（markdown-it 原生插件，见 [mkdocs-material 渲染修复报告](mkdocs-material语法支持.md)）
- **本文用途**：盘点 mkdocs-material（含 pymdownx 系扩展）还有哪些语法可支持、当前状态、实现成本与优先级建议
- **结论先行**：可继续支持 **15 项**语法族；其中 **9 项为低成本高收益**（建议下一批），**3 项中等成本**，**3 项建议按需再评估**；另有 6 类站点级/交互级功能不建议（不适用于单文件预览）

#### 1. 当前已支持

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

#### 2. 可继续支持的语法（15 项）

##### 2.1 低成本 · 高收益（建议下一批，9 项）

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

##### 2.2 中等成本 · 按需求排期（3 项）

| # | 语法 | mkdocs 扩展 | 当前 | 实现方式 | 预估 |
|---|---|---|---|---|---|
| 10 | 网格卡片 `<div class="grid cards" markdown>` + 列表/图标 | grid cards | ❌（CSS 已引入但无语法支持） | 需 md-in-html 能力：识别带 `markdown` 属性的容器并递归解析内部 markdown；`gridcards.css` 已就绪 | 中（100~200 行） |
| 11 | 代码块增强：`linenums` 行号、`hl_lines="2 3"` 高亮行、`title="文件名"`、行内高亮 `` `#!python x` `` | pymdownx.highlight / inlinehilite | ❌ | 扩展 fence renderer + 预处理属性解析；补行号/标题 CSS | 中 |
| 12 | Material 图标 `:material-account:` / `:octicons-…:` | icons | ❌ | 打包 Material Design Icons 子集（SVG sprite）+ inline 替换；体积需评估 | 中 |

##### 2.3 低优先 · 视使用场景再评估（3 项）

| # | 语法 | 说明 | 建议 |
|---|---|---|---|
| 13 | `pymdownx.blocks` 新块语法（`/// note` 块语法（标题用竖线分隔），mkdocs-material 9.x） | 与 `!!!` 并列的新式写法 | 待确认笔记是否使用；若用则按 `!!!` 同思路加一个 rule |
| 14 | 跨文件片段 `--8<-- "file.md"`（snippets） | 构建期文件包含 | 桌面预览需额外安全策略（仅允许工作区/受信路径）；按需 |
| 15 | 内容 tab 深链锚点（`#tab-xxx` 直接跳转/刷新保持选中） | 当前 radio 方案为静态 HTML | 可加 tab id + 欢迎页/大纲跳转联动；优先级低 |

#### 3. 不建议支持（6 类，超出单文件预览范畴）

| 类别 | 说明 |
|---|---|
| 站点级功能 | 导航、搜索、tags、blog、social cards、版本选择等 mkdocs 构建特性，不适用于桌面单文件预览 |
| 表格排序/过滤 | 需前端交互框架，markdown 渲染层不宜内置 |
| mkdocstrings / API 文档 | 面向 Python 文档生成，与笔记场景无关 |
| 图表类扩展 | 已由 Mermaid/PlantUML 覆盖；drawio/graphviz 等按需另议 |
| 幻灯片 `reveal.js` 语法 | 独立展示能力，非预览渲染范畴 |
| 多语言站点（i18n 内容目录） | 与笔记应用自身 i18n 无关 |

#### 4. 推荐落地路线

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

#### 5. 结论

- **已支持**：admonition、content tabs、KaTeX、Mermaid/PlantUML、标准 Markdown、代码高亮、Emoji；
- **建议下一步**：批次 A 的 9 项低成本语法（折叠块、任务列表、高亮/插入/上下标、键盘按键、属性列表、脚注、定义列表）一次补齐，可覆盖 mkdocs 笔记 90% 的剩余高频写法；
- **可选扩展**：grid cards 与代码块增强（行号/高亮行/标题）为第二批；Material 图标与 snippets 视实际笔记使用情况决定。

## 三、15 项扩展语法实施报告

- **范围**：按 [语法支持清单与建议](mkdocs-material语法支持.md) 落地全部 **15 项**扩展语法
- **实施方式**：3 个并行子智能体（批次 A/B/C）+ 根代理统一装配与接线
- **发布版本**：**v1.3.3**（2026-11-15，CHANGELOG/RELEASE-NOTES 已同步）`r`n- **结论**：15 项全部实现并接入预览渲染管线；扩展相关 **8 文件 / 270 用例** scoped 验证全绿，渲染样例产物见 `out\tool-results\mdx-features-preview.html`
- **门禁说明**：实施期间另一并行会话正在同时改造 PluginTools 等模块（WIP），其未完成改动会使全仓 typecheck/test/build 暂时红；本报告以「扩展相关 scoped 验证 + 外部阻塞说明」记录（详见第 5 节）

#### 1. 架构：三批次插件 + 统一注册

新增统一注册入口 [`preview-markdown-extensions.ts`](../../../../src/renderer/src/components/Markdown/preview-markdown-extensions.ts)：

```ts
export function installPreviewExtensions(md) {
    installMdxBasicExtensions(md)   // 批次 A
    installMdxMediaExtensions(md)   // 批次 B
    installMdxBlocksExtensions(md)  // 批次 C
}
```

`createPreviewMarkdownIt()` 在既有插件（highlightjs / plantuml / emoji / mkdocs admonition+tabs）之后 `.use(installPreviewExtensions)`；三个插件模块文件独立维护，避免多人/多任务同时修改同一文件造成冲突。样式分为 `styles/material/md-basic.css` / `md-media.css` / `md-blocks.css`，由 `main.ts` 统一引入。

| 模块 | 规模 | 内容 |
|---|---|---|
| `preview-md-basic.ts` | ~1,496 行 | 批次 A 9 项（block/inline/core rule） |
| `preview-md-media.ts` | ~757 行 | 批次 B 3 项（grid cards / 代码块增强 / Material 图标） |
| `preview-md-blocks.ts` | ~980 行 | 批次 C 3 项（`///` 块 / snippets / tab 深链） |
| `mdi-icons-data.ts` | ~93 KiB | Material Design Icons 子集 **264 个**（Apache-2.0/MIT，含别名映射） |
| `md-basic/media/blocks.css` | 共 ~500 行 | 全部 CSS 变量驱动，深/浅色主题兼容 |

#### 2. 15 项语法与实现

##### 批次 A：标准 Markdown 扩展（9 项）

| # | 语法 | 输出 |
|---|---|---|
| 1 | `??? note "标题"` / `???+ note`（`+` 默认展开） | `<details class="admonition note"><summary class="admonition-title">…` + 递归解析内容 |
| 2 | `- [x]` / `- [ ]` 任务列表 | `li.task-list-item` + `<input type="checkbox" disabled checked?>` |
| 3 | `==高亮==` | `<mark>` |
| 4 | `^^插入^^`；critic `{++ins++}` / `{--del--}` / `{~~a~>b~~}` / `{==hl==}` / `{>>comment<<}` | `<ins>` / `<del>` / `<mark>` / 注释隐藏 |
| 5 | `^上标^` / `~下标~`（不影响内建 `~~删除~~`） | `<sup>` / `<sub>` |
| 6 | `++ctrl+alt+del++` | `<kbd>ctrl</kbd>+<kbd>alt</kbd>+<kbd>del</kbd>` |
| 7 | attr_list：`[按钮](url){ .md-button }`、`![图](x){ align=center }`、标题 `{ #id }` | 属性附加 + `.md-button` 按钮样式 |
| 8 | 脚注 `[^1]` + `[^1]: 说明` | `footnote-ref` + 文末 `section.footnotes`（回链、多引用唯一锚点） |
| 9 | 定义列表 `术语` + `: 定义` | `<dl><dt><dd>` |

##### 批次 B：媒体 / 代码块（3 项）

| # | 语法 | 输出 |
|---|---|---|
| 10 | grid cards：`<div class="grid cards" markdown>` 内部 Markdown 递归解析 | `div.grid.cards` + 卡片结构（嵌套 div 深度配对、围栏/行内代码/注释中的假标签跳过） |
| 11 | 代码块增强：```` ```python linenums="1" hl_lines="2" title="main.py" ````、```` ```linenums ````、`` `#!python …` `` | `div.highlight` + `span.filename` + 行号 `span.lineno` + 高亮行 `hll`；行内高亮 `code.highlight.language-x` |
| 12 | Material 图标 `:material-account:` / `:octicons-…:` | 内联 SVG（264 个子集图标）；未知图标降级可见文本，不打断后续内容 |

##### 批次 C：块语法 / 片段 / 深链（3 项）

| # | 语法 | 输出 |
|---|---|---|
| 13 | pymdownx.blocks：`/// note` / `/// tip \| 标题` / `/// tabbed` + `/// tab \| 标签` / `/// details` | 复用 admonition / tabbed / details 结构；setId 从 100001 起与 `===` 错开 |
| 14 | snippets：`--8<-- "path.md"`、`--8<-- "path.md:10:20"` | `expandSnippetIncludes()` 异步展开：相对活动文件目录、行号区间、递归深度 5、单文件 1MB/总量 4MB、扩展名白名单、默认禁止目录外引用；未展开时渲染为占位段落不抛错 |
| 15 | tab 深链：`#__tabbed_<setId>_<n>`（及 `_label` / `_panel`） | 渲染时经 `createTabDeepLinkEnv()` 输出稳定 id；预览组件点击委托选中对应 radio 并滚动（`getTabTargetByHash` 解析） |

#### 3. 根代理接线（跨模块）

| 文件 | 接线内容 |
|---|---|
| `preview-markdown-it.ts` | `.use(installPreviewExtensions)`（不触碰 PF-1 的 highlight 回调顺序） |
| `main.ts` | 引入 3 个扩展 CSS |
| `MarkdownPreviewComponent.vue` | ① snippets 展开：`HemyRenderPreLocal` 之前 `await expandSnippetIncludes(sourceContent, getPreviewActiveFilePath(), readSnippetFile)`，读取走既有 **`IPC.FILE.READ_HTML`**（主进程 sender 校验 + 路径守卫 + UTF-8 读取，**无需新增 IPC 通道**），守卫渲染轮次；② tab 深链：`md.render(text, createTabDeepLinkEnv())` + 预览容器已有的点击委托 `handlePreviewClick` 增加 `#__tabbed_` 分支（选中 radio + 滚动）；③ 新增 `readSnippetFile()` 注入点 |
| `styles/material/*` | 3 个新 CSS 文件（批次 A/B/C） |

#### 4. 验证

##### 4.1 扩展相关 scoped 验证（本任务范围，全绿）

| 项 | 结果 |
|---|---|
| 扩展相关测试（8 文件） | ✅ **270 / 270 用例通过**（批次 A 61 + 批次 B 48 + 批次 C 69 + 既有 mkdocs/预览回归 + 新增端到端集成 5） |
| 端到端集成测试 | ✅ 覆盖 15 项组合渲染、无裸语法残留、DOMPurify 后结构保留、tab 深链映射、snippets 边界 |
| scoped ESLint（扩展相关 13 文件） | ✅ 0 error |
| `electron-vite build`（扩展接入后） | ✅ 通过（本报告成文前最后一次独立构建） |
| 扩展相关 vue-tsc | ✅ 通过（组件接线后独立验证 0 错误） |
| `npm run build:win` | ✅ **通过**：`BaiZeNotes_Setup_1.3.3_windows_x64.exe`（118.25 MB）、便携版（107.34 MB）；产物 `app.asar` 已校验含 `task-list-item` / `md-button` / `mkdocs-icon` / `mdx-snippet-placeholder` / `__tabbed_` / admonition 等扩展实现 |

##### 4.2 可视化样例

端到端集成测试可生成完整渲染产物（内嵌 mkdocs-material 样式）：

- 文件：`out\tool-results\mdx-features-preview.html`（约 70 KB）
- 覆盖：折叠提示块、任务列表、高亮/插入/删除、上下标、按键、按钮、脚注、定义列表、grid cards + 图标、代码块增强、admonition + tabs、`///` 块、snippets 展开、KaTeX 公式

##### 4.3 DOMPurify 兼容结论

预览同款 `USE_PROFILES: { html, svg, svgFilters, mathMl }` 下：`details/summary/open`、`input[disabled/checked]`、`ins/del/mark/sup/sub/kbd`、`dl/dt/dd`、脚注 `section/ol/li`、attr_list `class/id/title/align`、grid 容器、SVG `path/viewBox/fill`、代码块 `filename/lineno/hll`、tab `id/data-*` 均保留；`<script>` 与事件属性被剥离。**无需放宽 DOMPurify 配置**；`svg > use` 被 DOMPurify 3.4.17 默认移除（图标只使用 `<path>`，不受影响）。

#### 5. 外部并行阻塞说明（如实记录）

实施期间另一并行会话正在同时改造 **PluginTools（Convert/Codec/TextTools/MiscTools 等）与主进程配置/托盘/编辑器渲染** 模块，其未完成改动导致全仓门禁短时红（与本扩展无关）：

| 门禁 | 观测到的外部失败（示例） |
|---|---|
| `typecheck` | `PluginTools/MiscTools/calculator-lib.ts` 语法错误（文件正在写入中）、`Codec/ImageBase64.vue` 类型错误 |
| `npm test` | `i18n-dict`（PluginTools 新键未入词典）、`window-security` / `complex-dialogs`（主进程并发改动） |
| ESLint | `PluginTools/Convert/ColorConvert.vue`、`base-lib.ts` 等未使用变量/prefer-const |

**处理**：本任务坚持只改自己的 15 个专属/新增文件；上述外部失败文件一个未动。扩展相关 scoped 验证全绿。报告成文时外部 WIP 仍未收尾，观测到的剩余外部失败示例：`typecheck`（`Codec/ImageBase64.vue`、`FormatTools/xml-format-lib.ts`）、`npm test`（`window-security`、`plugins/format-tools`、`plugins/text-tools`）、`eslint`（`json-tool-lib.ts` no-control-regex、`xml-format-lib.ts` unused var）。待外部会话完成后，需在安静工作区复跑全量 `typecheck / test / eslint`（`build` 与 `build:win` 已在成文前通过并产出 v1.3.3 安装包）。

#### 6. 使用速查（示例）

```markdown
??? note "可折叠"
    内容

- [x] 完成

==高亮== ^^插入^^ ~~删除~~ H^2^ H~2~ ++ctrl+c++

[按钮](https://example.com){ .md-button }

引用[^1]；术语
: 定义

<div class="grid cards" markdown>
-   :material-account: **卡片**
</div>

```python linenums="1" hl_lines="2" title="main.py"
print(1)
print(2)
```

/// note | blocks 提示
内容
///

--8<-- "relative/part.md"

[跳到第 2 个 tab](#__tabbed_1_2)
```

#### 7. 遗留与限制

| 项 | 说明 |
|---|---|
| octicons | 图标数据暂空（`OCTICON_ICON_PATHS` 扩展点，未知图标降级文本） |
| Material 图标范围 | 内置 264 个常用 MDI；MDI 7.x 移除的品牌图标（nginx/redis 等）会降级 |
| attr_list 端到端 | `preview-local-render.ts` 在 markdown-it 前把**本地相对图片/链接**替换为原始 HTML，导致这两类元素的属性在完整管线中不生效（http(s) 链接正常）；需后续调整该预处理（不在本任务范围） |
| snippets | 仅独立行单文件引用；固定 UTF-8；路径默认限制在活动文件目录内 |
| `///` blocks | 未实现 attrs/open 等 blocks 高级属性语法 |
| 代码块增强 | 行号复制采用 `user-select:none` + 块级 line span；未实现行号锚点/代码注解注释 |
| grid cards | 开标签需独占一行、属性值不含 `>` |

#### 8. 补充：插入 → Material 菜单与对话框（同日追加）

##### 8.1 菜单入口

`插入 → Material` 子菜单在原有 Admonition 之后新增 **15 个插入入口**（`baize:menu:insert:material:<featureId>`）：

| featureId | 菜单文案（zh） | 生成语法 |
|---|---|---|
| collapsible | 折叠提示块 | `???` / `???+` |
| task-list | 任务列表 | `- [ ]` / `- [x]` |
| highlight | 高亮 | `==…==` |
| insert-delete | 插入/删除 | `^^…^^` / `~~…~~` / critic 标记 |
| sup-sub | 上标/下标 | `^…^` / `~…~` |
| keys | 键盘按键 | `++ctrl+alt+del++` |
| attr-list | 属性列表 | `{ .md-button }` / `{ align=center }` |
| footnote | 脚注 | `[^1]` |
| definition-list | 定义列表 | `术语` + `: 定义` |
| grid-cards | Grid cards | `<div class="grid cards" markdown>` |
| code-block | 代码块增强 | `linenums` / `hl_lines` / `title` |
| icon | Material 图标 | `:material-*:` |
| blocks | 块语法 | `/// note` / `/// tabbed` / `/// details` |
| snippet | 文件片段 | `--8<-- "file.md"` |
| tab-link | 标签页深链 | `[文本](#__tabbed_<set>_<n>)` |

##### 8.2 统一插入对话框

新增 [`MaterialSyntaxDialog.vue`](../../../../src/renderer/src/components/dialogs/complex/MaterialSyntaxDialog.vue)：

- **左侧 15 项功能列表**（点击切换，菜单打开时按 `preset` 自动定位），右侧为数据驱动表单；
- **实时 Markdown 预览**（等宽字体展示将要插入的片段），随输入实时更新；
- 「插入」经父组件既有 `handleDialogInsert` 链路写入编辑器光标处（对话框保持打开，可连续插入）；「取消 / ×」仅关闭；
- 表单覆盖各语法常见选项（admonition 类型/标题/默认展开、任务状态、critic 六种模式、按钮/对齐/class、代码块语言/行号/高亮行/标题、grid cards 多卡片、blocks 类型/标签页、snippet 行号区间、tab 深链 set/tab 序号等）；
- UI 文案全部走 i18n（`dialogRenderer.materialSyntax` 命名空间，zh/en 各 **103** 叶子键，英文无 CJK）；样式使用主题 CSS 变量、可拖拽标题栏（复用 `useDialogDrag`）。

##### 8.3 接线与测试

| 项 | 内容 |
|---|---|
| 状态与注册 | `DialogState.materialSyntax: { visible, preset? }`；`dialogs/index.ts` 懒加载导出；`BaiZeNotes.vue` 接线 `:visible / :preset / @close / @insert` |
| 菜单动作 | `menu-actions.ts` 用 `MATERIAL_SYNTAX_FEATURE_IDS` 单真源精确匹配 → `showDialog('materialSyntax', { preset })` |
| 测试 | 新增 `material-syntax-dialog.test.ts` **25 用例**（15 项精确 markdown 生成、preset、条件字段、实时预览、事件）；菜单测试新增 16 项数量/顺序/动作映射一致性用例 |
| 门禁 | typecheck 三工程 0 错误 · **150 文件 / 2737 用例全过** · ESLint 0 error · `electron-vite build` 通过 |

> 说明：实施期间并行会话遗留的 2 个 Vue 文件多行 `@click` 表达式缺分号导致构建失败，已做最小语法修复（`BaseConvert.vue` / `UnitConvert.vue`），恢复构建。
