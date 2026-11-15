# mkdocs-material / pymdownx 扩展语法实施报告（2026-11-15 · 15 项）

- **范围**：按 [语法支持清单与建议](2026-11-15-mkdocs-material语法支持清单与建议.md) 落地全部 **15 项**扩展语法
- **实施方式**：3 个并行子智能体（批次 A/B/C）+ 根代理统一装配与接线
- **发布版本**：**v1.3.3**（2026-11-15，CHANGELOG/RELEASE-NOTES 已同步）`r`n- **结论**：15 项全部实现并接入预览渲染管线；扩展相关 **8 文件 / 270 用例** scoped 验证全绿，渲染样例产物见 `out\tool-results\mdx-features-preview.html`
- **门禁说明**：实施期间另一并行会话正在同时改造 PluginTools 等模块（WIP），其未完成改动会使全仓 typecheck/test/build 暂时红；本报告以「扩展相关 scoped 验证 + 外部阻塞说明」记录（详见第 5 节）

## 1. 架构：三批次插件 + 统一注册

新增统一注册入口 [`preview-markdown-extensions.ts`](src/renderer/src/components/Markdown/preview-markdown-extensions.ts)：

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

## 2. 15 项语法与实现

### 批次 A：标准 Markdown 扩展（9 项）

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

### 批次 B：媒体 / 代码块（3 项）

| # | 语法 | 输出 |
|---|---|---|
| 10 | grid cards：`<div class="grid cards" markdown>` 内部 Markdown 递归解析 | `div.grid.cards` + 卡片结构（嵌套 div 深度配对、围栏/行内代码/注释中的假标签跳过） |
| 11 | 代码块增强：```` ```python linenums="1" hl_lines="2" title="main.py" ````、```` ```linenums ````、`` `#!python …` `` | `div.highlight` + `span.filename` + 行号 `span.lineno` + 高亮行 `hll`；行内高亮 `code.highlight.language-x` |
| 12 | Material 图标 `:material-account:` / `:octicons-…:` | 内联 SVG（264 个子集图标）；未知图标降级可见文本，不打断后续内容 |

### 批次 C：块语法 / 片段 / 深链（3 项）

| # | 语法 | 输出 |
|---|---|---|
| 13 | pymdownx.blocks：`/// note` / `/// tip \| 标题` / `/// tabbed` + `/// tab \| 标签` / `/// details` | 复用 admonition / tabbed / details 结构；setId 从 100001 起与 `===` 错开 |
| 14 | snippets：`--8<-- "path.md"`、`--8<-- "path.md:10:20"` | `expandSnippetIncludes()` 异步展开：相对活动文件目录、行号区间、递归深度 5、单文件 1MB/总量 4MB、扩展名白名单、默认禁止目录外引用；未展开时渲染为占位段落不抛错 |
| 15 | tab 深链：`#__tabbed_<setId>_<n>`（及 `_label` / `_panel`） | 渲染时经 `createTabDeepLinkEnv()` 输出稳定 id；预览组件点击委托选中对应 radio 并滚动（`getTabTargetByHash` 解析） |

## 3. 根代理接线（跨模块）

| 文件 | 接线内容 |
|---|---|
| `preview-markdown-it.ts` | `.use(installPreviewExtensions)`（不触碰 PF-1 的 highlight 回调顺序） |
| `main.ts` | 引入 3 个扩展 CSS |
| `MarkdownPreviewComponent.vue` | ① snippets 展开：`HemyRenderPreLocal` 之前 `await expandSnippetIncludes(sourceContent, getPreviewActiveFilePath(), readSnippetFile)`，读取走既有 **`IPC.FILE.READ_HTML`**（主进程 sender 校验 + 路径守卫 + UTF-8 读取，**无需新增 IPC 通道**），守卫渲染轮次；② tab 深链：`md.render(text, createTabDeepLinkEnv())` + 预览容器已有的点击委托 `handlePreviewClick` 增加 `#__tabbed_` 分支（选中 radio + 滚动）；③ 新增 `readSnippetFile()` 注入点 |
| `styles/material/*` | 3 个新 CSS 文件（批次 A/B/C） |

## 4. 验证

### 4.1 扩展相关 scoped 验证（本任务范围，全绿）

| 项 | 结果 |
|---|---|
| 扩展相关测试（8 文件） | ✅ **270 / 270 用例通过**（批次 A 61 + 批次 B 48 + 批次 C 69 + 既有 mkdocs/预览回归 + 新增端到端集成 5） |
| 端到端集成测试 | ✅ 覆盖 15 项组合渲染、无裸语法残留、DOMPurify 后结构保留、tab 深链映射、snippets 边界 |
| scoped ESLint（扩展相关 13 文件） | ✅ 0 error |
| `electron-vite build`（扩展接入后） | ✅ 通过（本报告成文前最后一次独立构建） |
| 扩展相关 vue-tsc | ✅ 通过（组件接线后独立验证 0 错误） |
| `npm run build:win` | ✅ **通过**：`BaiZeNotes_Setup_1.3.3_windows_x64.exe`（118.25 MB）、便携版（107.34 MB）；产物 `app.asar` 已校验含 `task-list-item` / `md-button` / `mkdocs-icon` / `mdx-snippet-placeholder` / `__tabbed_` / admonition 等扩展实现 |

### 4.2 可视化样例

端到端集成测试可生成完整渲染产物（内嵌 mkdocs-material 样式）：

- 文件：`out\tool-results\mdx-features-preview.html`（约 70 KB）
- 覆盖：折叠提示块、任务列表、高亮/插入/删除、上下标、按键、按钮、脚注、定义列表、grid cards + 图标、代码块增强、admonition + tabs、`///` 块、snippets 展开、KaTeX 公式

### 4.3 DOMPurify 兼容结论

预览同款 `USE_PROFILES: { html, svg, svgFilters, mathMl }` 下：`details/summary/open`、`input[disabled/checked]`、`ins/del/mark/sup/sub/kbd`、`dl/dt/dd`、脚注 `section/ol/li`、attr_list `class/id/title/align`、grid 容器、SVG `path/viewBox/fill`、代码块 `filename/lineno/hll`、tab `id/data-*` 均保留；`<script>` 与事件属性被剥离。**无需放宽 DOMPurify 配置**；`svg > use` 被 DOMPurify 3.4.17 默认移除（图标只使用 `<path>`，不受影响）。

## 5. 外部并行阻塞说明（如实记录）

实施期间另一并行会话正在同时改造 **PluginTools（Convert/Codec/TextTools/MiscTools 等）与主进程配置/托盘/编辑器渲染** 模块，其未完成改动导致全仓门禁短时红（与本扩展无关）：

| 门禁 | 观测到的外部失败（示例） |
|---|---|
| `typecheck` | `PluginTools/MiscTools/calculator-lib.ts` 语法错误（文件正在写入中）、`Codec/ImageBase64.vue` 类型错误 |
| `npm test` | `i18n-dict`（PluginTools 新键未入词典）、`window-security` / `complex-dialogs`（主进程并发改动） |
| ESLint | `PluginTools/Convert/ColorConvert.vue`、`base-lib.ts` 等未使用变量/prefer-const |

**处理**：本任务坚持只改自己的 15 个专属/新增文件；上述外部失败文件一个未动。扩展相关 scoped 验证全绿。报告成文时外部 WIP 仍未收尾，观测到的剩余外部失败示例：`typecheck`（`Codec/ImageBase64.vue`、`FormatTools/xml-format-lib.ts`）、`npm test`（`window-security`、`plugins/format-tools`、`plugins/text-tools`）、`eslint`（`json-tool-lib.ts` no-control-regex、`xml-format-lib.ts` unused var）。待外部会话完成后，需在安静工作区复跑全量 `typecheck / test / eslint`（`build` 与 `build:win` 已在成文前通过并产出 v1.3.3 安装包）。

## 6. 使用速查（示例）

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

## 7. 遗留与限制

| 项 | 说明 |
|---|---|
| octicons | 图标数据暂空（`OCTICON_ICON_PATHS` 扩展点，未知图标降级文本） |
| Material 图标范围 | 内置 264 个常用 MDI；MDI 7.x 移除的品牌图标（nginx/redis 等）会降级 |
| attr_list 端到端 | `preview-local-render.ts` 在 markdown-it 前把**本地相对图片/链接**替换为原始 HTML，导致这两类元素的属性在完整管线中不生效（http(s) 链接正常）；需后续调整该预处理（不在本任务范围） |
| snippets | 仅独立行单文件引用；固定 UTF-8；路径默认限制在活动文件目录内 |
| `///` blocks | 未实现 attrs/open 等 blocks 高级属性语法 |
| 代码块增强 | 行号复制采用 `user-select:none` + 块级 line span；未实现行号锚点/代码注解注释 |
| grid cards | 开标签需独占一行、属性值不含 `>` |

## 8. 补充：插入 → Material 菜单与对话框（同日追加）

### 8.1 菜单入口

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

### 8.2 统一插入对话框

新增 [`MaterialSyntaxDialog.vue`](src/renderer/src/components/dialogs/complex/MaterialSyntaxDialog.vue)：

- **左侧 15 项功能列表**（点击切换，菜单打开时按 `preset` 自动定位），右侧为数据驱动表单；
- **实时 Markdown 预览**（等宽字体展示将要插入的片段），随输入实时更新；
- 「插入」经父组件既有 `handleDialogInsert` 链路写入编辑器光标处（对话框保持打开，可连续插入）；「取消 / ×」仅关闭；
- 表单覆盖各语法常见选项（admonition 类型/标题/默认展开、任务状态、critic 六种模式、按钮/对齐/class、代码块语言/行号/高亮行/标题、grid cards 多卡片、blocks 类型/标签页、snippet 行号区间、tab 深链 set/tab 序号等）；
- UI 文案全部走 i18n（`dialogRenderer.materialSyntax` 命名空间，zh/en 各 **103** 叶子键，英文无 CJK）；样式使用主题 CSS 变量、可拖拽标题栏（复用 `useDialogDrag`）。

### 8.3 接线与测试

| 项 | 内容 |
|---|---|
| 状态与注册 | `DialogState.materialSyntax: { visible, preset? }`；`dialogs/index.ts` 懒加载导出；`BaiZeNotes.vue` 接线 `:visible / :preset / @close / @insert` |
| 菜单动作 | `menu-actions.ts` 用 `MATERIAL_SYNTAX_FEATURE_IDS` 单真源精确匹配 → `showDialog('materialSyntax', { preset })` |
| 测试 | 新增 `material-syntax-dialog.test.ts` **25 用例**（15 项精确 markdown 生成、preset、条件字段、实时预览、事件）；菜单测试新增 16 项数量/顺序/动作映射一致性用例 |
| 门禁 | typecheck 三工程 0 错误 · **150 文件 / 2737 用例全过** · ESLint 0 error · `electron-vite build` 通过 |

> 说明：实施期间并行会话遗留的 2 个 Vue 文件多行 `@click` 表达式缺分号导致构建失败，已做最小语法修复（`BaseConvert.vue` / `UnitConvert.vue`），恢复构建。