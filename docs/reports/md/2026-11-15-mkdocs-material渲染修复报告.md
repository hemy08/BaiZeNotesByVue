# mkdocs-material 语法渲染修复报告（2026-11-15）

- **问题**：白泽笔记 Markdown 预览对 **mkdocs-material 语法**（`!!!` admonition + `===` pymdownx tabbed，内含嵌套缩进代码块）渲染错误
- **样例文件**：`E:\github.com\hemy08\hemynotes\docs\500-力扣题解\数组之位运算\001-只出现一次的数字1.md`
- **结论**：已改为 markdown-it 原生 block 插件实现，样例文件渲染为 **7 张卡片 + 4 组标签页（16 个 tab）+ 11 个语法高亮代码块**，无裸语法残留
- **验证**：typecheck 三工程 0 错误、**134 文件 / 2252 用例全过**、ESLint 0 error、`electron-vite build` 通过、`npm run build:win` 打包通过

## 1. 问题现象

修复前预览效果：

- `!!! Success "位运算解法"` 只渲染出绿色标题框与**第一个 tab 按钮**，tab 内容区为空；
- 后续 tab 标题（`=== "Go异或"` 等）与代码围栏以**纯文本/行内代码**形式泄漏（裸 ` ``` ` 可见）；
- 期望效果（mkdocs-material 风格）：每个 `!!!` 渲染为彩色卡片（标题 + 图标），内部 `===` 渲染为可切换标签页，每个 tab 内渲染语法高亮代码块（默认选中第一个 tab）。

## 2. 根因

旧实现是「预渲染字符串替换 + 再交给 markdown-it」的两段式方案（`preview-local-render.ts` 中约 430 行）：

| # | 根因 | 影响 |
|---|---|---|
| 1 | `materialAdmonitionsRender` / `tabbedSetRender` 按行扫描、正则切分，无法正确处理「admonition 内嵌 tabbed、tab 内容再缩进 4/8 空格」的嵌套结构 | tab 内容为空、块结构错位 |
| 2 | `splitByCodeBlocks` 分段后用 `join('')` 拼接，**吞掉分段边界换行**（`a\n```js\nx\n```\nb` → `a```js\nx\n```b`）；缩进围栏识别失败时会一直吞到文末 | tab 内容丢失、后续整段文档被吞 |
| 3 | 代码围栏文本被**直接拼进 HTML 字符串**，markdown-it 收到后不再把其当作代码块解析 | 裸 ` ``` ` 与代码以文本泄漏 |
| 4 | 块内 Markdown（列表 / 行内代码 / 粗体）被单独渲染、与主文档解析器割裂 | 嵌套内容样式不一致 |

## 3. 修复方案

### 3.1 新增 markdown-it block 插件（核心）

新增 [`preview-mkdocs-material.ts`](src/renderer/src/components/Markdown/preview-mkdocs-material.ts)，导出 `mkdocsMaterialPlugin(md)`：

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

### 3.2 接入与清理

| 文件 | 修改 |
|---|---|
| `preview-markdown-it.ts` | `createPreviewMarkdownIt()` 注册 `mkdocsMaterialPlugin`（不影响 PF-1 的高亮回调顺序） |
| `preview-local-render.ts` | 删除旧 Material/Tabbed 解析器（约 430 行）及多余 import；`renderContent` 只保留 KaTeX + 图片/文件 URL 变换；`HemyRenderPostLocal` 改为恒等；`splitByCodeBlocks` 重写为**字符偏移区间**方案（拼接后与原文逐字符一致，修复吞换行 bug） |
| `styles/material/*.css` | 未大改（复用既有 mkdocs admonition / tableset 样式） |

## 4. 验证结果

### 4.1 真实笔记渲染（完整管线）

| 指标 | 结果 |
|---|---|
| admonition 卡片 | **7**（question / example / tip / info / success×3） |
| tabbed set 组 | **4**（Success 卡片内分别为 5、5 个 tab；示例与提示卡片各 3 个） |
| radio / tab 面板 | **16 / 16** |
| 语法高亮代码块 | **11**（c / go / cpp / python / rust） |
| 裸 ` ``` ` / `!!!` / `===` 残留 | **0** |
| 默认选中 | 每组第一个 tab |

渲染产物（含内嵌样式，可直接浏览器打开查看）：`out\tool-results\preview-real-file.html`。

### 4.2 自动化门禁

| 门禁 | 结果 |
|---|---|
| typecheck（node / web / test） | ✅ 0 错误 |
| 单元测试 | ✅ **134 文件 / 2252 用例全过**（新增 `mkdocs-material-render.test.ts` 25 例，改写 material-render / tabbed-set-render / pf15 等 7 文件 116 例） |
| ESLint | ✅ 0 error |
| electron-vite build | ✅ 通过 |
| `npm run build:win` | ✅ 通过：`BaiZeNotes_Setup_1.3.0_windows_x64.exe`（118.17 MB）、便携版（107.28 MB） |
| 打包产物校验 | ✅ `dist\win-unpacked\resources\app.asar` 渲染资源含 `tabbed-set` / `__tabbed_` / `mkdocs_admonition` 新实现 |

### 4.3 测试覆盖点

- admonition 有/无标题、类型 class、标题 HTML 转义；
- admonition 内 tabbed（多 tab、代码围栏 c/go/cpp）→ input/label/block 数量、首个 checked、hljs 高亮、无裸 ` ``` `；
- 多组 tab 的 radio name/id 唯一；`===  "双空格"` 兼容；空行/8 空格缩进代码块；
- 未闭合块/非法语法优雅回退；普通 Markdown 不受影响；
- 经 DOMPurify（与预览相同 `USE_PROFILES` 配置）后 `input/label/for/checked/name/id` 保留（jsdom）。

## 5. 使用说明与遗留

**使用**：在应用中打开该笔记文件即可看到卡片 + 标签页 + 高亮代码，点击标签切换；重新打包的安装包/便携版已包含本修复。

**遗留（非阻塞）**：

- `tableset.css` 既有 `:checked` 选择器覆盖最多 20 个 tab（超出需扩展 CSS）；
- `MarkdownPreviewComponent.vue` / `preview-chapters.ts` 中"HemyRenderPreLocal 合并换行"旧注释已过时（本次未改这两个文件）；
- 渲染样式沿用 mkdocs-material CSS 变量，随应用主题（浅/深色）变化；
- 若笔记使用 `???` 折叠块 / `grid cards` 等其它 mkdocs 扩展语法，需后续按需补充（本次仅覆盖 admonition + tabbed）。
