# Monaco Editor 全量配置

> 更新于 2026-11-19（对照 v1.3.6）
>
> 文档版本 2.1 ｜ 代码基线 v1.3.6 ｜ Monaco 版本 **0.57.0**（`monaco-editor@^0.57.0`）
> 事实来源：`src/renderer/src/components/Markdown/editor-options.ts`、`editor-option-maps.ts`、`editor-utils.ts`、`monaco-worker-setup.ts`、`monaco-worker-types.ts`、`register-languages.ts`、`MarkdownMonacoEditor.vue`、`electron.vite.config.ts`、`vitest.config.ts`、`src/main/config/editor-setting.ts`、`src/main/config/theme-registry.ts`。
> 一句话结论：**当前只用 markdown 一种编辑器语言；Monaco worker 只注册 `editor.worker` 一个**（tsserver/css/html/json 4 个语言 worker 已移除，节省约 14.7 MB）；`monaco-editor` 裸包名经 Vite/Vitest 别名精确重定向到 `esm/vs/editor/editor.api.js`。

---

## 目录

1. [版本与集成方式](#1-版本与集成方式)
2. [模块与文件清单](#2-模块与文件清单)
3. [初始化与配置生效链路](#3-初始化与配置生效链路)
4. [初始选项 MonacoEditorOptions](#4-初始选项-monacoeditoroptions)
5. [配置映射 EditorOptionMaps](#5-配置映射-editoroptionmaps)
6. [动态开关（UPDATE OPTIONS）](#6-动态开关update-options)
7. [Worker 注册（仅 editor.worker）](#7-worker-注册仅-editorworker)
8. [贡献与语言定义](#8-贡献与语言定义)
9. [自定义语言与折叠提供器](#9-自定义语言与折叠提供器)
10. [主题集成](#10-主题集成)
11. [快捷键与编辑器动作](#11-快捷键与编辑器动作)
12. [构建别名（electron.vite / vitest）](#12-构建别名electronvite--vitest)
13. [性能与大文件保护](#13-性能与大文件保护)
14. [历史与已移除项](#14-历史与已移除项)
15. [相关测试](#15-相关测试)
16. [附录：Monaco 通用选项分类索引（非项目取值）](#16-附录monaco-通用选项分类索引非项目取值)

---

## 1. 版本与集成方式

| 项 | 当前值 |
| --- | --- |
| Monaco 版本 | `0.57.0` |
| 编辑器语言 | **仅 `markdown`**（`editor-options.ts` 的 `language: 'markdown'`） |
| 语言服务（LSP） | **未注册任何语言服务**（没有 `vs/language/*` 导入；无 ts/css/html/json 客户端） |
| Worker | **仅 `editor.worker`**（`?worker` 导入 + `self.MonacoEnvironment.getWorker`） |
| 打包入口 | `monaco-editor` 裸包名 → `esm/vs/editor/editor.api.js`（不含全量语言服务与 LSP 客户端） |
| Worker 插件 | 已弃用 `vite-plugin-monaco-editor@1.1.0`（与 vite 8 / electron-vite 6 不兼容） |
| AMD 加载方式 | 自 Monaco 0.53.0 起已弃用，本项目只用 ESM |

---

## 2. 模块与文件清单

| 文件 | 职责 |
| --- | --- |
| `Markdown/editor-options.ts` | 初始选项 `MonacoEditorOptions` + 空覆盖服务 `MonacoEditorOverride` |
| `Markdown/editor-option-maps.ts` | `EditorOptionMaps`（字段 → Monaco 选项名，**137 条**）+ `updateEditorOption()` / `updateEditorOptions()`（含特殊形状转换、未知字段告警） |
| `Markdown/editor-utils.ts` | `IPC.EDITOR.UPDATE_OPTIONS` 的 5 个动态开关（行号/主题/表格缩进/字号/空白字符） |
| `Markdown/monaco-worker-setup.ts` | worker 注册（仅 editor worker）+ 编辑器 contributions + 45 个语言定义导入 + 全局语言回退策略 |
| `Markdown/monaco-worker-types.ts` | esm 子路径环境模块声明 + `?worker` 构造器类型声明（无 import/export 的脚本文件） |
| `Markdown/register-languages.ts` | 自定义语言 PlantUML / Mermaid（Monarch 语法 + 括号/自动闭合配置） |
| `Markdown/hemy-editor.ts` | 编辑器能力门面（`Options`、`Override`、`KeyMaps`、`DidChange`、`AddActions`、`updateEditorOptions`、渲染工具） |
| `Markdown/MarkdownMonacoEditor.vue` | 创建编辑器、内容同步、事件监听、markdown 折叠提供器、大纲下拉、INIT_SETTING/GET_SETTING 应用 |
| `Markdown/hemy-editor-shortcut.ts` | 14 个 `addCommand` 键位 + 光标位置状态栏同步 |
| `Markdown/hemy-editor-actions.ts` | 自定义 Enter 行为（列表/链接续行）等 action |
| `src/main/config/editor-setting.ts` | 主进程 `EditorSetting` 默认值与持久化（含约 200 个 Monaco 选项） |
| `src/main/config/theme-registry.ts` | Monaco 主题注册表（3 个内置 + `resources/themes/monaco-themes/` 动态主题） |

---

## 3. 初始化与配置生效链路

```text
main/index.ts ready-to-show
  └─ send(IPC.EDITOR.INIT_SETTING, getEditorSetting())        // 完整 EditorSetting（约 200 项）
       │（MarkdownMonacoEditor.vue 先注册监听，再创建编辑器）
       ▼
MarkdownMonacoEditor.vue onMounted
  ├─ import './monaco-worker-setup'        // 副作用：worker + contributions + 语言
  ├─ registerCustomLanguages()             // PlantUML / Mermaid
  ├─ registerMarkdownFoldingProvider()     // ATX 标题 + 围栏代码块折叠范围
  ├─ monaco.editor.create(container, editor.Options, editor.Override)
  ├─ editor.DidChange / KeyMaps / AddActions
  └─ invoke(IPC.EDITOR.GET_SETTING) → updateEditorOptions(editorInstance, settings)   // 时序兜底

保存编辑器设置（设置 → 编辑器设置）
  └─ config:write('editor') → 主进程映射写 editorSetting → 广播 INIT_SETTING
       └─ handleUpdateEditorOptions → editor.updateEditorOptions(settings)   // 137 条映射即时应用
```

要点：

- `editor-options.ts` 的初始选项与主进程 `defaultEditorSetting` **保持同步**（FUN-28），避免「编辑器创建后、`INIT_SETTING` 覆盖前」出现默认值闪烁/漂移。
- 内容写入：模板 `props.code` 的 `watch` 用 `setValue` 同步（带 `getValue() !== newCode` 守卫，空文件不注入 `# `）；`onDidChangeModelContent` 每次内容变化只取一次全文并 `emit('update:code')`，同时用 `model.getValueLength()` 更新状态栏。
- 布局：`automaticLayout: false`，创建后立即 `layout()` + 100ms 后再次 `layout()`，窗口 resize 通过 EventBus 合帧调度（PF-7），避免自动布局反复测量。

---

## 4. 初始选项 MonacoEditorOptions

`editor-options.ts` 定义 **65 个顶层选项**（不含 `editor.api` 的默认值继承）。下表按用途分组列出实际取值：

### 4.1 基础

| 选项 | 取值 | 说明 |
| --- | --- | --- |
| `value` | `''` | 内容由组件 props 同步 |
| `language` | `'markdown'` | **唯一语言** |
| `theme` | `'default'` | 实际主题由主题链路 `setTheme` 覆盖 |
| `automaticLayout` | `false` | 手动布局（见第 3 章） |
| `readOnly` / `domReadOnly` | `false` | 可编辑 |
| `ariaLabel` | `t('editorUi.editor.ariaLabel')` | 无障碍标签走 i18n |
| `renderValidationDecorations` | `'off'` | 无语言服务，不渲染校验装饰 |

### 4.2 显示与外观

| 选项 | 取值 |
| --- | --- |
| `wordWrap` | `'on'` |
| `lineNumbers` / `lineNumbersMinChars` | `'on'` / `3` |
| `minimap` | `{ enabled: false, renderCharacters: false, maxColumn: 120 }` |
| `fontFamily` / `fontSize` | `'Hack'` / `15` |
| `tabSize` | `4` |
| `renderWhitespace` | `'all'` |
| `renderLineHighlight` | `'all'` |
| `glyphMargin` | `true` |
| `lineDecorationsWidth` | `0` |
| `scrollBeyondLastLine` | `false` |
| `scrollBeyondLastColumn` | `5` |
| `scrollbar` | `{ vertical: 'visible', horizontal: 'visible', verticalScrollbarSize: 14, horizontalScrollbarSize: 12, arrowSize: 11, useShadows: true }` |
| `smoothScrolling` | `true` |
| `cursorBlinking` / `cursorSmoothCaretAnimation` | `'smooth'` / `'on'` |
| `mouseWheelScrollSensitivity` / `fastScrollSensitivity` | `1` / `5` |
| `scrollPredominantAxis` | `true` |
| `hideCursorInOverviewRuler` / `overviewRulerBorder` / `overviewRulerLanes` | `true` / `false` / `1` |
| `renderControlCharacters` | `false` |
| `renderFinalNewline` | `'on'` |
| `links` / `colorDecorators` | `true` / `true` |
| `bracketPairColorization` | `{ enabled: true }` |
| `selectionHighlight` | `true` |
| `occurrencesHighlight` | `'singleFile'` |
| `renderIndentGuides`（旧选项名） | 未设置；使用 `guides`（由 `editorSetting` 下发） |
| `stickyTabStops` | `false` |
| `fixedOverflowWidgets` | `false` |

### 4.3 编辑行为

| 选项 | 取值 |
| --- | --- |
| `tabCompletion` | `'off'` |
| `snippetSuggestions` | `'inline'` |
| `quickSuggestions` | `{ other: true, comments: false, strings: false }` |
| `suggestSelection` | `'first'` |
| `wordBasedSuggestions` | `'off'` |
| `inlineSuggest` | `{ enabled: false }` |
| `dragAndDrop` | `false` |
| `multiCursorModifier` / `multiCursorPaste` | `'alt'` / `'spread'` |
| `emptySelectionClipboard` / `copyWithSyntaxHighlighting` | `true` / `true` |
| `codeLens` | `false`（`codeLensFontFamily: ''`、`codeLensFontSize: 0`） |
| `folding` / `foldingStrategy` / `foldingImportsByDefault` / `foldingMaximumRegions` | `true` / `'auto'` / `false` / `5000` |
| `largeFileOptimizations` / `maxTokenizationLineLength` | `true` / `10000` |
| `find` | `{ addExtraSpaceOnTop: true, autoFindInSelection: 'multiline', seedSearchStringFromSelection: 'selection', cursorMoveOnType: true, loop: true }` |
| `hover` | `{ enabled: 'on', delay: 300, sticky: false }` |
| `gotoLocation` | 5 项均为 `'goto'` |
| `unicodeHighlight` | `{ ambiguousCharacters: false, nonBasicASCII: false, includeStrings: true }` |
| `accessibilitySupport` | `'auto'` |

> 其余 `EditorSetting` 中的约 200 个选项（如 `autoClosingBrackets`、`guides`、`stickyScroll`、`find.highlightFindMatches`、`comments`、`scrollbar` 完整字段等）由主进程默认值 + `INIT_SETTING` 经映射层下发，不在 `MonacoEditorOptions` 中重复声明。

---

## 5. 配置映射 EditorOptionMaps

`editor-option-maps.ts` 提供 **137 条** `EditorSetting 字段 → Monaco 选项名` 映射。大部分同名直传，少数需要改名或形状转换：

### 5.1 改名映射（少数）

| EditorSetting 字段 | Monaco 选项 |
| --- | --- |
| `minimap`（boolean） | `minimap.enabled` |
| `unfoldOnClick` | `unfoldOnClickAfterEndOfLine` |
| `renderIndentGuides` | 写入 `guides.indentation` |
| `highlightActiveIndentGuide` | 写入 `guides.highlightActiveIndentation` |
| `showAdjustSettingTip` | 写入 `hover.enabled` |

### 5.2 形状转换规则

| 字段 | 转换 |
| --- | --- |
| `minimap` | 布尔 → `{ enabled: boolean }` |
| `rulers` | 字符串 `"80,120"` → `[80, 120]`（过滤非法值）；数组原样；其它 → `[]` |
| `guides` | 对象原样；布尔 → `{ indentation, bracketPairs: false, highlightActiveIndentation }` |
| `bracketPairColorization` | 对象原样；布尔 → `{ enabled }` |
| `unicodeHighlight` | 只接受对象；布尔被忽略（防止误下发） |
| `stickyScroll` | 对象原样；布尔 → `{ enabled }` |
| `quickSuggestions` | 布尔 → `{ other, comments, strings }` 三者同值；对象原样 |
| `occurrencesHighlight` | 布尔 → `'singleFile' / 'off'`；字符串原样 |
| `selectionHighlight` | 布尔 → `'always' / 'never'`；字符串原样 |
| `renderIndentGuides` + `highlightActiveIndentGuide` | 合并写入同一个 `guides` 对象（不会互相覆盖） |
| 未知字段 | `logger.warn('未知的配置项: ...')` 后跳过，不抛错、不影响其它字段 |

### 5.3 API

| 函数 | 用途 |
| --- | --- |
| `updateEditorOption(editor, key, value)` | 单字段更新（`IPC.EDITOR.UPDATE_OPTIONS` 的部分场景/测试使用） |
| `updateEditorOptions(editor, settings)` | 批量：先构造完整 `options`，最后一次性 `editor.updateOptions(options)` |

---

## 6. 动态开关（UPDATE OPTIONS）

`editor-utils.ts` 的 `MonacoEditorOpMaps` 由 `MarkdownMonacoEditor.vue` 的 `handleUpdateOptions` 按名字分发（IPC payload：`(option, value)`）：

| 选项名 | 处理函数 | 行为 |
| --- | --- | --- |
| `lineNumbers` | `UpdateLineNumber` | `getOption(EditorOption.lineNumbers)` 判断当前 `renderType`，在 `'on'` / `'off'` 间切换 |
| `theme` | `UpdateEditorTheme` | 字符串非空才 `monaco.editor.setTheme(name)` |
| `tabSize` | `UpdateTableSize` | `Number(value)` 校验正数后 `updateOptions({ tabSize })`（FUN-28 修正原误写 `tabIndex`） |
| `fontSize` | `UpdateFontSize` | 正数才应用 |
| `renderWhitespace` | `UpdateRenderWhitespace` | `'all'` ↔ `'none'` 切换 |

> 视图菜单的「显示/隐藏行号」「显示/隐藏空白字符」经主进程 `send(IPC.EDITOR.UPDATE_OPTIONS, ...)` 触发这两个开关；主题设置经 `theme` 触发。注意：这些是运行期临时状态，不写入 `editorSetting`（下次 `INIT_SETTING` 会回到真源值）。

---

## 7. Worker 注册（仅 editor.worker）

### 7.1 注册代码（`monaco-worker-setup.ts`）

```ts
// 唯一 worker 导入（PF-11：语言服务 worker 已移除）
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'

self.MonacoEnvironment = {
    getWorker(): Worker {
        return new editorWorker()
    }
}
```

- 所有 `getWorker(workerId, label)` 请求（markdown/plantuml/mermaid、代码块内嵌语言）**统一回退到 editor worker**。
- 回退是安全的：Monarch 语法高亮的 tokenization 在主线程完成，不依赖语言服务 worker；本项目未注册任何 LSP，语言服务 worker 永远不会被构造。
- `monaco-worker-types.ts` 为 `?worker` 导入提供构造器类型声明（`new (options?) => Worker`），并为 esm 子路径提供通配模块声明。

### 7.2 已移除的 4 个语言 worker（PF-11）

| 原 worker | 用途 | 现状 |
| --- | --- | --- |
| `ts.worker` | TypeScript/JavaScript 语言服务 | 已移除 |
| `css.worker` | CSS/SCSS/LESS 语言服务 | 已移除 |
| `html.worker` | HTML/Handlebars 语言服务 | 已移除 |
| `json.worker` | JSON 校验/格式化 | 已移除 |

移除理由：项目编辑器语言固定为 markdown，且无语言服务注册，这 4 个 worker 从未被构造，却各自产出独立 chunk，**实测约 14.75 MB** 死重（基线记 `-14.74MB`，量级一致）。CSP 说明：worker chunk 与页面同源，现有 `default-src 'self'` 已覆盖；若运行期出现 CSP 拦截 worker 报错，需在 `src/renderer/index.html` 的 CSP 补 `worker-src 'self' blob:`（当前未见该问题）。

### 7.3 为什么弃用 vite-plugin-monaco-editor

`vite-plugin-monaco-editor@1.1.0`（2022 年发布，面向 vite 2.x）与当前 vite 8 / electron-vite 6 不兼容：`writeBundle` 钩子与旧版 `transformIndexHtml` 返回结构已失效，无法产出 worker 文件（worker 404 后 Monaco 回退主线程）。因此改用官方推荐的手动方案（`?worker` + `MonacoEnvironment.getWorker`）。

---

## 8. 贡献与语言定义

`monaco-worker-setup.ts` 通过**副作用导入**补齐 `editor.api` 缺少的能力：

| 类别 | 数量 | 说明 |
| --- | --- | --- |
| 编辑器 contributions | **74 条导入** | 与 `monaco-editor/esm/vs/index.js` 的贡献清单逐一对应：查找/折叠/建议/右键菜单/Ctrl+G/多光标/代码操作/注释/链接/括号匹配/内联提示/粘性滚动/Unicode 高亮/命令面板/无障碍等；另含 codicon 图标样式 2 条 |
| 语言定义（Monarch 语法高亮） | **45 个** | markdown、mdx、javascript、typescript、css、html、xml、yaml、python、java、cpp、csharp、go、rust、php、ruby、shell、sql、mysql、pgsql、powershell、bat、ini、dockerfile、kotlin、swift、dart、scala、perl、lua、r、objective-c、graphql、handlebars、less、scss、hcl、twig、pug、solidity、elixir、protobuf、clojure、redis、restructuredtext |

> 只保留笔记常用语言（原全量 80+ 语言定义不再打包）。语言定义只做 tokenization 语法高亮，不提供补全/校验等语言服务。

---

## 9. 自定义语言与折叠提供器

### 9.1 自定义语言（`register-languages.ts`）

| 语言 | 注册内容 |
| --- | --- |
| `plantuml` | `monaco.languages.register({ id: 'plantuml' })` + Monarch tokenizer（关键字/操作符/字符串/注释/@注解）+ `setLanguageConfiguration`（括号 `{}`/`[]`/`()`、自动闭合 5 对、包裹 5 对） |
| `mermaid` | `register({ id: 'mermaid' })` + Monarch tokenizer（graph/flowchart/sequenceDiagram 等关键字、`%%` 注释、箭头操作符、`[]`/`()`/`{}` 内文本高亮） |

调用时机：`MarkdownMonacoEditor.vue` `onMounted` 中 `registerCustomLanguages()`（创建编辑器之前）。

### 9.2 markdown 折叠提供器（FUN-09）

- Monaco 内置 markdown 仅支持 `<!-- #region -->` 标记折叠；本项目额外注册 `monaco.languages.registerFoldingRangeProvider('markdown', ...)`，提供 **ATX 标题层级 + 围栏代码块** 折叠范围。
- 合并策略：Monaco 会合并多个 provider 的结果，与内置区域折叠不冲突。
- 大文件保护：只扫描前 **20,000 行**（`FOLD_SCAN_LINE_LIMIT`），超长行（>512 字符）跳过；模块级只注册一次。
- 契约：`foldAll` / `unfoldAll` / `foldLevel1..6` 菜单动作与 `editor-toggle-fold` EventBus 事件最终都落到 `editorInstance.trigger('menu', 'editor.foldAll' | ...)`。

### 9.3 大纲下拉（FUN-09）

- 从当前 model 正则提取 ATX 标题（`/^(\s{0,3})(#{1,6})(?:[ \t]+)(.*)$/`），最多扫描 **100,000 行**/行宽 512 字符上限。
- 点击项 `setPosition` + `revealLineInCenter` + `focus`；点击外部/Esc 关闭。

---

## 10. 主题集成

| 场景 | 行为 |
| --- | --- |
| 未单独配置编辑器主题 | 依据应用主题名是否含 `dark/深/Dark/黑` 选择 base `vs-dark`/`vs`，`monaco.editor.defineTheme('custom-theme', {...})` 用主题色覆盖 `editor.background/foreground/lineHighlightBackground/editorCursor.foreground/selectionBackground`，然后 `setTheme('custom-theme')` |
| 单独配置编辑器主题（`separateEditorTheme`） | `loadMonacoTheme(name)`：`vs`/`vs-dark`/`hc-black` 直接 `setTheme`；其它主题 `invoke(IPC.THEME.LOAD_MONACO_THEME, name)` 取主题 JSON → `defineTheme` → `setTheme`；失败回退 `vs` |
| 主题数据源 | `src/main/config/theme-registry.ts`：3 个内置（vs/vs-dark/hc-black）+ `resources/themes/monaco-themes/themes/*.json` 动态扫描（首次访问该主题时读取） |
| 主题切换广播 | `IPC.THEME.THEME_UPDATED`（`{themeStyles, monacoTheme, separateEditorTheme}`）→ `BaiZeNotes.vue` `updateMonacoEditorTheme` |

> 主题设置的 UI 与数据细节见主题设置对话框（`ThemeSettingDialog.vue`）与 `02-设计与架构` 分类文档；本文件只说明 Monaco 侧消费方式。

---

## 11. 快捷键与编辑器动作

### 11.1 键位（`hemy-editor-shortcut.ts`，14 个 `addCommand`）

| 快捷键 | 动作 |
| --- | --- |
| Ctrl+1 ~ 6 | 标题 1~6 |
| Ctrl+B / Ctrl+I / Ctrl+U | 加粗 / 斜体 / 下划线 |
| Ctrl+D | 删除线（`~~` 包裹） |
| Ctrl+K | 键盘按键样式（`<kbd>` 包裹） |
| Ctrl+L | 链接（`[]()`） |
| Ctrl+S | `emit(MONACO_SAVE_FILE_CONTENT_TO_DISK, true)` |
| Ctrl+V | 图片剪贴板插入 / 文本粘贴兜底 |

另有光标位置同步：`onDidChangeCursorPosition` → `EventBus.emit(STATUS_BAR_CURSOR_POSITION)`。

### 11.2 自定义 Action（`hemy-editor-actions.ts`）

| Action id | 说明 |
| --- | --- |
| `hemy-custom-enter-action` | 自定义回车：列表 `- ` / 链接 `- [ ]` 后缀自动续行；行首（≤2 行）直接换行。FUN-30 已删除调试用的「Hemy Custom ContextMenu」右键动作 |

### 11.3 快速访问（`hemy-editor-quick-access.ts`）

35 个格式化动作（`MdEditQuickAccess`），通过工具栏图标 + 右键菜单触发：标题、字体/字号、加粗/斜体/下划线/删除线、颜色、对齐 4 种、有序/无序列表、分割线、换行、行内代码、代码块、数学行内/块、链接、任务列表、图片、表格、表情、符号、Mermaid、PlantUML。模板类子菜单直接复用 `common/templates.ts` 数据（与顶部插入菜单同源）。

---

## 12. 构建别名（electron.vite / vitest）

### 12.1 `electron.vite.config.ts`（renderer.resolve.alias）

```ts
// 裸包名精确重定向到 editor.api（不含 LSP 客户端、全量语言、语言服务 worker）
{ find: /^monaco-editor$/, replacement: resolve('node_modules/monaco-editor/esm/vs/editor/editor.api.js') },
// esm 子路径（contributions / 语言定义 / worker 入口）统一解析到 node_modules 内 esm 目录
{ find: /^monaco-editor\//, replacement: `${resolve('node_modules/monaco-editor')}/` }
```

- 必须用**正则**匹配：`@rollup/plugin-alias` 对字符串 `find` 会做前缀替换（`monaco-editor` 也命中 `monaco-editor/esm/...`），会破坏子路径导入。
- 另有两个别名：`@renderer` → `src/renderer/src`、`@mainer` → `src/main`。

### 12.2 `vitest.config.ts`

- 同步同一套 monaco 别名（ET-8）：保证测试与构建使用同一模块图，测试可直接 import 真实 monaco 入口。
- 原因：monaco 的 `package.json exports` 仅声明 `./*.js → ./esm/vs/*.js`，Node/SSR 深层 ESM 子路径解析不一定走 exports 映射，容易出现 `Cannot find package 'monaco-editor'`。

### 12.3 preload 构建（旁注）

preload 与 monaco 无关，但同属构建关键配置：`isolatedEntries: true` + `externalizeDeps: false` 保证 sandbox preload 单文件（详见 [架构文档](../02-设计与架构/架构文档.md)）。

---

## 13. 性能与大文件保护

| 措施 | 实现 |
| --- | --- |
| 按需加载 Monaco 模块 | `editor.api` 别名 + 手动 contributions/语言导入，避免全量入口进主 chunk |
| 移除死重 worker | 4 个语言服务 worker 移除（约 14.7 MB） |
| 语言定义精选 | 45 个（原 80+） |
| 大文件选项 | `largeFileOptimizations: true`、`maxTokenizationLineLength: 10000`、`foldingMaximumRegions: 5000` |
| 折叠扫描上限 | 20,000 行 / 单行 512 字符 |
| 大纲扫描上限 | 100,000 行 / 单行 512 字符 |
| 内容读串 | `onDidChangeModelContent` 每次只取一次全文；状态栏长度用 `model.getValueLength()`（O(1)） |
| 布局 | `automaticLayout: false` + 手动 `layout()` + resize 合帧（PF-7） |
| 预览解耦 | Markdown 预览全部在渲染层本地渲染，不依赖 Monaco/主进程（PF-02） |
| 按钮/工具按需 | 对话框与插件工具均 `defineAsyncComponent`（PF-6） |

---

## 14. 历史与已移除项

| 已移除/变更 | 说明 |
| --- | --- |
| `vite-plugin-monaco-editor` | 与 vite 8 / electron-vite 6 不兼容，已弃用（改为手动 worker 注册） |
| ts/css/html/json 语言服务 worker | PF-11 移除，约 -14.7 MB |
| 全量语言定义（80+） | PF-03 收敛为 45 个常用语言 |
| 全量入口 `editor.main` | 改为 `editor.api` + 按需 contributions，不再进主 chunk |
| AMD 加载 | Monaco ≥0.53 已不支持，本项目未使用 |
| 主进程渲染 Monaco 的通道 | 与 Monaco 无关，但旧文档提到的 `baize-notes:init-editor-setting` 等通道已清理（见编辑器设置文档） |
| 调试右键动作 `Hemy Custom ContextMenu` | FUN-30 删除 |

### 14.1 对旧版文档的修正（v1.3.0）

| 旧文档描述 | 当前实际 |
| --- | --- |
| 通用 API 手册（「基于 Monaco Editor 0.52.x 及更新版本」，非项目配置） | 改写为**本项目实现配置手册**，版本 **0.57.0**，取值全部对照 `editor-options.ts` / `editor-setting.ts` |
| 未提及项目集成方式 | 补充 `editor.api` 别名、worker 手动注册、Vitest 同套别名（第 1/7/12 章） |
| 语言服务 Worker 映射表列出 `json/css/html/ts` 4 个 worker 及用途 | **4 个语言 worker 已移除（PF-11）**，当前只注册 `editor.worker`，所有 label 统一回退（第 7 章） |
| 语言列表按「全量 80+ 语言」描述 | 精选 **45 个**语言定义（PF-03，第 8 章） |
| 未说明编辑器语言 | 当前**只用 markdown**（`language: 'markdown'`），无 LSP 语言服务 |
| 未涉及迁移/性能治理 | 补充 contributions 按需导入、`vite-plugin-monaco-editor` 弃用原因、大文件保护与折叠/大纲扫描上限（第 13 章） |
| 未涉及项目内自定义能力 | 补充 PlantUML/Mermaid 自定义语言、markdown 折叠提供器、主题集成、快捷键与快速访问（第 9–11 章） |

---

## 15. 相关测试

| 测试文件 | 覆盖点 |
| --- | --- |
| `tests/unit/editor-options.test.ts` | 初始选项取值（markdown 语言、换行/缩进、minimap/字体、Unicode 高亮、find、quickSuggestions、scrollbar、光标/滚动、hover/goto、可编辑性、ariaLabel、大文件限制）与空 override |
| `tests/unit/editor-option-maps.test.ts` | 映射表结构（value 非空、改名映射）、未知字段告警、minimap/rulers/guides 单值与批量转换、bracketPairColorization/unicodeHighlight/stickyScroll/quickSuggestions/occurrencesHighlight/selectionHighlight/renderIndentGuides/showAdjustSettingTip 转换 |
| `tests/unit/monaco-worker-setup.test.ts` | 仅注册 editor worker、`MonacoEnvironment.getWorker` 全 label 回退、贡献/语言导入数量与关键路径 |
| `tests/unit/register-languages.test.ts` | plantuml/mermaid 注册、Monarch tokenizer、括号与闭合配置 |
| `tests/unit/editor-utils.test.ts` | 5 个 UPDATE_OPTIONS 开关（行号/主题/字号/tabSize/空白字符） |
| `tests/unit/hemy-editor-shortcut.test.ts` | 14 个 addCommand 键位 |
| `tests/unit/hemy-editor-quick-access.test.ts` | 35 个快速访问动作、模板子菜单与 templates 同源 |
| `tests/unit/editor-setting.test.ts` | 主进程 `EditorSetting` 默认值与映射（与 Monaco 选项一致性） |
| `tests/unit/preload-build-config.test.ts` | preload 单文件构建约束（与构建配置相关） |

回归命令：

```powershell
npm test -- tests/unit/editor-options.test.ts tests/unit/editor-option-maps.test.ts tests/unit/monaco-worker-setup.test.ts tests/unit/register-languages.test.ts tests/unit/editor-utils.test.ts
```

---

## 16. 附录：Monaco 通用选项分类索引（非项目取值）

> 以下仅为 Monaco 通用能力索引，**不代表本项目取值**；本项目实际取值以上文第 4/5 章与 `editor-setting.ts` 默认值为准。完整 API 见 [Monaco Editor 官方文档](https://microsoft.github.io/monaco-editor/)。

| 分类 | 代表选项 |
| --- | --- |
| 基础 | `value`、`language`、`theme`、`readOnly`、`domReadOnly`、`automaticLayout`、`ariaLabel`、`tabIndex`、`contextmenu` |
| 字体/文本 | `fontFamily`、`fontSize`、`fontWeight`、`lineHeight`、`letterSpacing`、`fontLigatures`、`fontVariations` |
| 行号/标尺 | `lineNumbers`、`lineNumbersMinChars`、`glyphMargin`、`rulers`、`hideCursorInOverviewRuler`、`overviewRulerLanes`、`overviewRulerBorder` |
| 光标 | `cursorStyle`、`cursorBlinking`、`cursorWidth`、`cursorSmoothCaretAnimation`、`cursorSurroundingLines`、`cursorSurroundingLinesStyle`、`cursorSurroundingLineColumns`、`stopRenderingLineAfter` |
| 滚动 | `scrollbar`、`scrollBeyondLastLine`、`scrollBeyondLastColumn`、`smoothScrolling`、`mouseWheelScrollSensitivity`、`fastScrollSensitivity`、`scrollPredominantAxis`、`alwaysConsumeMouseWheel`、`hideHorizontalScrollbar` |
| 换行/缩进 | `wordWrap`、`wordWrapColumn`、`wordWrapBreakBeforeCharacters`、`wordWrapBreakAfterCharacters`、`wrappingIndent`、`wrappingStrategy`、`tabSize`、`insertSpaces`、`indentSize`、`detectIndentation`、`autoIndent`、`trimAutoWhitespace` |
| 渲染 | `renderWhitespace`、`renderControlCharacters`、`renderLineHighlight`、`renderLineHighlightOnlyWhenFocus`、`renderFinalNewline`、`renderValidationDecorations`、`matchBrackets`、`bracketPairColorization`、`guides`、`unicodeHighlight`、`colorDecorators`、`links` |
| 折叠 | `folding`、`foldingStrategy`、`showFoldingControls`、`unfoldOnClickAfterEndOfLine`、`foldingImportsByDefault`、`foldingMaximumRegions` |
| 自动闭合 | `autoClosingBrackets`、`autoClosingQuotes`、`autoClosingComments`、`autoClosingOvertype`、`autoSurround`、`autoIndentOnPaste`、`formatOnPaste`、`formatOnType` |
| 智能提示 | `quickSuggestions`、`quickSuggestionsDelay`、`suggest`、`suggestOnTriggerCharacters`、`acceptSuggestionOnEnter`、`acceptSuggestionOnCommitCharacter`、`inlineSuggest`、`tabCompletion`、`wordBasedSuggestions`、`suggestSelection`、`parameterHints`、`snippetSuggestions` |
| Hover/跳转 | `hover`、`stickyTabStops`、`selectOnLineNumbers`、`selectionHighlight`、`occurrencesHighlight`、`gotoLocation`、`codeLens` |
| 查找 | `find.*`（`addExtraSpaceOnTop`、`autoFindInSelection`、`seedSearchStringFromSelection`、`cursorMoveOnType`、`loop`、`globalFindClipboard`、`highlightFindMatches` 等） |
| 差异编辑器 | `originalEditable`、`renderSideBySide`、`renderMarginRevertIcon`、`renderIndicators`、`ignoreTrimWhitespace`、`maxComputationTime`、`useInlineViewWhenSpaceIsLimited`、`compactMode` |
| 其它 | `comments`、`renderFinalNewline`、`lineDecorationsWidth`、`revealHorizontalRightPadding`、`maximizedScrollbar`、`stickyScroll`、`accessibilitySupport`、`screenReaderAnnounceInlineSuggestions` |
| 全局环境 | `MonacoEnvironment.getWorker` / `getWorkerUrl`；`monaco.editor.defineTheme` / `setTheme` / `setModelMarkers` / `remeasureFonts` |

---

**文档生成时间**：2026-05-02（初版，通用 API 手册）｜ **本次更新**：2026-11-15（改写为 v1.3.0 项目实现配置手册）｜ **维护者**：hemy08
