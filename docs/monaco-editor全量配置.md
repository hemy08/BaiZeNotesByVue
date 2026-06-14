# Monaco Editor 完整配置项参考手册

本文档收录了 Monaco Editor 所有可配置的编辑器选项、子组件配置、语言服务配置及全局环境配置，基于官方 `IEditorOptions` 接口及 TypeScript 类型定义整理。

---

## 一、配置项层级概览

Monaco Editor 的配置系统基于 `IEditorOptions` 接口定义，包含超过 150 个可选配置属性。配置项采用三级优先级体系，并支持通过 `EditorOption` 枚举进行类型安全的访问与验证。以下按功能分类逐一列出所有配置项。

## 二、核心编辑器配置

### 1. 基础配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `value` | `string` | `''` | 编辑器的初始显示文本内容 |
| `language` | `string` | `undefined` | 编辑器语言类型（如 `'javascript'`、`'typescript'`、`'html'`、`'json'` 等） |
| `theme` | `string` | `'vs'` | 编辑器主题（`'vs'`、`'vs-dark'` 或 `'hc-black'`） |
| `placeholder` | `string` | `undefined` | 当编辑器为空时显示的占位文本 |
| `compactMode` | `boolean` | `false` | 紧凑模式，启用后会减少编辑器内边距，使界面更紧凑 |
| `automaticLayout` | `boolean` | `false` | 自动调整布局以适应容器尺寸变化 |
| `readOnly` | `boolean` | `false` | 是否设为只读模式 |
| `tabIndex` | `number` | `0` | 编辑器的 tab 键索引值 |
| `contextmenu` | `boolean` | `true` | 是否启用编辑器上下文菜单 |
| `dragAndDrop` | `boolean` | `true` | 是否启用拖放功能 |
| `emptySelectionClipboard` | `boolean` | `true` | 无选中文本时，复制操作是否作用于光标所在行 |
| `copyWithSyntaxHighlighting` | `boolean` | `true` | 复制时是否保留语法高亮样式 |
| `multiCursorModifier` | `'ctrlCmd' \| 'alt'` | `'alt'` | 多光标修饰键 |
| `multiCursorPaste` | `'spread' \| 'full'` | `'spread'` | 多光标粘贴行为 |
| `accessibilitySupport` | `'auto' \| 'on' \| 'off'` | `'auto'` | 无障碍支持 |
| `fixedOverflowWidgets` | `boolean` | `false` | 浮层是否固定显示（防止被容器裁剪） |
| `ariaLabel` | `string` | `'Editor content; press alt+f1 for Accessibility Options.'` | ARIA 标签 |
| `ariaHeaderMessage` | `string` | `undefined` | ARIA 头信息 |

### 2. 字体与文本样式

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `fontFamily` | `string` | `'Consolas, "Courier New", monospace'` | 字体系列 |
| `fontSize` | `number` | `14` | 字体大小（像素） |
| `fontWeight` | `string \| number` | `'normal'` | 字体粗细 |
| `lineHeight` | `number` | `0` | 行高（像素，0 表示自动） |
| `letterSpacing` | `number` | `0` | 字母间距 |
| `fontLigatures` | `boolean \| string` | `false` | 是否启用字体连字 |
| `fontVariations` | `boolean \| string` | `false` | 是否启用 OpenType 字体变体 |

### 3. 行号与标尺

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `lineNumbers` | `'on' \| 'off' \| 'relative' \| 'interval' \| function` | `'on'` | 行号显示方式 |
| `lineNumbersMinChars` | `number` | `5` | 行号区域最小字符宽度 |
| `glyphMargin` | `boolean` | `true` | 是否显示字形边栏 |
| `folding` | `boolean` | `true` | 是否显示代码折叠图标 |
| `foldingStrategy` | `'auto' \| 'indentation'` | `'auto'` | 折叠策略 |
| `showFoldingControls` | `'always' \| 'mouseover' \| 'never'` | `'mouseover'` | 折叠按钮显示时机 |
| `hideCursorInOverviewRuler` | `boolean` | `false` | 是否在概览标尺中隐藏光标 |
| `overviewRulerLanes` | `number` | `3` | 概览标尺轨道数 |
| `rulers` | `number[]` | `[]` | 垂直标尺位置（列索引数组） |

### 4. 光标

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `cursorStyle` | `'line' \| 'block' \| 'underline' \| 'line-thin' \| 'block-outline' \| 'underline-thin'` | `'line'` | 光标样式 |
| `cursorBlinking` | `'blink' \| 'smooth' \| 'phase' \| 'expand' \| 'solid'` | `'blink'` | 光标闪烁效果 |
| `cursorWidth` | `number` | `0` | 光标宽度（仅块状光标） |
| `cursorSmoothCaretAnimation` | `'off' \| 'explicit' \| 'on'` | `'off'` | 平滑移动动画 |
| `cursorSurroundingLines` | `number` | `0` | 光标上下最小可见行数 |
| `cursorSurroundingLinesStyle` | `'default' \| 'all'` | `'default'` | 周围行数样式 |
| `cursorSurroundingLineColumns` | `number` | `15` | 水平居中时两侧显示的列数 |
| `stopRenderingLineAfter` | `number` | `-1` | 行尾最大渲染字符数 |

### 5. 滚动

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `scrollbar` | `IEditorScrollbarOptions` | 见子章节 | 滚动条配置对象 |
| `scrollBeyondLastLine` | `boolean` | `true` | 是否允许滚动超出最后一行 |
| `scrollBeyondLastColumn` | `number` | `5` | 超出最后一列的列数 |
| `smoothScrolling` | `boolean` | `false` | 平滑滚动 |
| `mouseWheelScrollSensitivity` | `number` | `1` | 滚轮灵敏度 |
| `fastScrollSensitivity` | `number` | `5` | 快速滚轮灵敏度（按住 Alt） |
| `scrollPredominantAxis` | `boolean` | `true` | 锁定主导轴 |
| `horizontalScrollbarSize` | `number` | `12` | 水平滚动条大小 |
| `verticalScrollbarSize` | `number` | `14` | 垂直滚动条大小 |
| `alwaysConsumeMouseWheel` | `boolean` | `true` | 是否始终消耗滚轮事件 |
| `arrowSize` | `number` | `11` | 滚动条箭头大小 |
| `useShadows` | `boolean` | `true` | 是否显示阴影 |
| `hideHorizontalScrollbar` | `boolean` | `false` | 是否隐藏水平滚动条 |

### 6. 换行与缩进

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `wordWrap` | `'off' \| 'on' \| 'wordWrapColumn' \| 'bounded'` | `'off'` | 自动换行行为 |
| `wordWrapColumn` | `number` | `80` | 换行列数（配合 `'wordWrapColumn'`） |
| `wordWrapBreakBeforeCharacters` | `boolean` | `false` | 是否在换行前字符处断行 |
| `wordWrapBreakAfterCharacters` | `boolean` | `true` | 是否在换行后字符处断行 |
| `wrappingIndent` | `'none' \| 'same' \| 'indent' \| 'deepIndent'` | `'same'` | 换行缩进方式 |
| `wrappingStrategy` | `'simple' \| 'advanced'` | `'simple'` | 换行断点计算策略 |
| `autoIndent` | `'none' \| 'keep' \| 'brackets' \| 'advanced' \| 'full'` | `'full'` | 自动缩进行为 |
| `indentSize` | `number \| 'tabSize'` | `'tabSize'` | 缩进大小 |
| `tabSize` | `number` | `4` | Tab 键占用的空格数 |
| `insertSpaces` | `boolean` | `true` | 是否使用空格替代 Tab |
| `detectIndentation` | `boolean` | `true` | 是否自动检测缩进 |
| `trimAutoWhitespace` | `boolean` | `true` | 是否修剪行首尾空白 |
| `ignoreEmptyLines` | `boolean` | `true` | 插入行注释时是否忽略空行 |
| `insertSpace` | `boolean` | `true` | 注释标记后是否插入空格 |

### 7. 渲染选项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `renderWhitespace` | `'none' \| 'boundary' \| 'selection' \| 'trailing' \| 'all'` | `'selection'` | 空白符渲染方式 |
| `renderControlCharacters` | `boolean` | `false` | 是否渲染控制字符 |
| `renderLineHighlight` | `'none' \| 'gutter' \| 'line' \| 'all'` | `'line'` | 当前行高亮方式 |
| `renderLineHighlightOnlyWhenFocus` | `boolean` | `false` | 仅聚焦时高亮行 |
| `renderIndentGuides` | `boolean` | `true` | 是否渲染缩进参考线 |
| `highlightIndentGuides` | `boolean` | `true` | 是否高亮活跃缩进区参考线 |
| `renderFinalNewline` | `'off' \| 'on' \| 'dimmed'` | `'off'` | 是否渲染文件末尾换行符 |
| `renderValidationDecorations` | `'editable' \| 'on' \| 'off'` | `'editable'` | 验证装饰渲染范围 |
| `matchBrackets` | `'never' \| 'near' \| 'always'` | `'near'` | 括号匹配高亮时机 |
| `bracketPairColorization` | `IBracketPairColorizationOptions` | `{ enabled: false, independentColorPoolPerBracketType: false }` | 括号对颜色化 |
| `generalRenderWhitespace` | `boolean` | `false` | 全局空白符渲染 |

### 8. 自动闭合与修饰

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `autoClosingBrackets` | `'always' \| 'languageDefined' \| 'beforeWhitespace' \| 'never'` | `'languageDefined'` | 自动闭合括号 |
| `autoClosingQuotes` | `'always' \| 'languageDefined' \| 'beforeWhitespace' \| 'never'` | `'languageDefined'` | 自动闭合引号 |
| `autoClosingOvertype` | `'always' \| 'auto' \| 'never'` | `'auto'` | 自动闭合覆盖 |
| `autoSurround` | `'languageDefined' \| 'quotes' \| 'brackets' \| 'never'` | `'languageDefined'` | 选中时自动包裹 |
| `commentMultiLine` | `boolean` | `true` | 是否使用多行注释 |
| `commentInline` | `boolean` | `true` | 是否使用行内注释 |
| `formatOnPaste` | `boolean` | `false` | 粘贴时格式化 |
| `formatOnType` | `boolean` | `false` | 输入时格式化 |

### 9. 智能提示与补全

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `quickSuggestions` | `boolean \| IQuickSuggestionsOptions` | `{ other: true, comments: false, strings: false }` | 快速建议 |
| `quickSuggestionsDelay` | `number` | `10` | 快速建议延迟（ms） |
| `suggest` | `ISuggestOptions` | 见子章节 | 建议功能配置 |
| `suggestOnTriggerCharacters` | `boolean` | `true` | 触发字符时自动建议 |
| `acceptSuggestionOnCommitCharacter` | `boolean` | `true` | 提交字符时接受建议 |
| `acceptSuggestionOnEnter` | `'on' \| 'smart' \| 'off'` | `'on'` | 回车接受建议 |
| `inlineSuggest` | `boolean` | `true` | 内联建议（幽灵文本） |
| `tabCompletion` | `'on' \| 'off' \| 'onlySnippets'` | `'off'` | Tab 补全 |
| `wordBasedSuggestions` | `'off' \| 'currentDocument' \| 'matchingDocuments' \| 'allDocuments'` | `'currentDocument'` | 基于文档词汇建议 |
| `wordBasedSuggestionsOnlySameLanguage` | `boolean` | `true` | 仅限同语言文档 |
| `suggestSelection` | `'first' \| 'recentlyUsed' \| 'recentlyUsedByPrefix'` | `'recentlyUsedByPrefix'` | 建议选中策略 |
| `parameterHints` | `IParameterHintOptions` | `{ cycle: false, enabled: true }` | 参数提示 |

### 10. Hover 与编码行为

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `hover` | `IHoverOptions` | `{ enabled: true, delay: 300, sticky: true }` | 悬停提示 |
| `stickyTabStops` | `boolean` | `true` | Tab 按步长移动 |
| `selectOnLineNumbers` | `boolean` | `true` | 点击行号选中整行 |
| `selectionHighlight` | `boolean` | `true` | 高亮相同内容 |
| `occurrencesHighlight` | `boolean` | `true` | 高亮所有出现位置 |
| `gotoLocation` | `IGotoLocationOptions` | 见子章节 | 跳转位置配置 |
| `codeLens` | `boolean` | `true` | 是否显示 CodeLens |
| `codeLensFontFamily` | `string` | `''` | CodeLens 字体 |
| `codeLensFontSize` | `number` | `0` | CodeLens 字体大小 |
| `foldingImportsByDefault` | `boolean` | `false` | 默认折叠导入语句 |
| `foldingMaximumRegions` | `number` | `5000` | 最大折叠区域数 |

### 11. 查找与替换

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `find` | `IEditorFindOptions` | 见子章节 | 查找部件配置 |
| `find.addExtraSpaceOnTop` | `boolean` | `true` | 顶部额外空间 |
| `find.autoFindInSelection` | `'never' \| 'always' \| 'multiline'` | `'never'` | 选中时自动查找 |
| `find.seedSearchStringFromSelection` | `'never' \| 'always' \| 'selection'` | `'always'` | 从选中内容初始化搜索词 |
| `find.cursorMoveOnType` | `boolean` | `true` | 输入时移动光标 |
| `find.loop` | `boolean` | `true` | 循环搜索 |
| `find.globalFindClipboard` | `boolean` | `false` | 共享系统剪贴板 |
| `find.highlightFindMatches` | `boolean` | `true` | 高亮所有匹配 |
| `find.highlightFindMatchColor` | `boolean` | `true` | 使用特定颜色高亮 |
| `find.highlightFindMatchSize` | `number` | `1` | 高亮边框分辨率 |

### 12. 差异编辑器配置

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `originalEditable` | `boolean` | `false` | 原始内容是否可编辑 |
| `renderSideBySide` | `boolean` | `true` | 是否并排显示 |
| `renderMarginRevertIcon` | `boolean` | `true` | 是否显示还原图标 |
| `renderIndicators` | `boolean` | `true` | 是否显示差异指示器 |
| `ignoreTrimWhitespace` | `boolean` | `true` | 是否忽略行尾空白差异 |
| `maxComputationTime` | `number` | `60000` | 最大差异计算时间（ms） |
| `useInlineViewWhenSpaceIsLimited` | `boolean` | `false` | 空间不足时使用内联视图 |
| `compactMode` | `boolean` | `false` | 紧凑模式 |

---

## 三、子对象详细配置

### 1. minimap 缩略图

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `minimap.enabled` | `boolean` | `true` | 是否启用 |
| `minimap.autohide` | `boolean` | `false` | 自动隐藏 |
| `minimap.size` | `'proportional' \| 'fill' \| 'fit'` | `'proportional'` | 尺寸策略 |
| `minimap.side` | `'right' \| 'left'` | `'right'` | 显示位置 |
| `minimap.showSlider` | `'always' \| 'mouseover'` | `'mouseover'` | 滑块显示时机 |
| `minimap.renderCharacters` | `boolean` | `true` | 是否渲染字符（否则为色块） |
| `minimap.maxColumn` | `number` | `120` | 最大渲染列数 |
| `minimap.scale` | `number` | `1` | 缩放比例 |

### 2. scrollbar 滚动条

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `scrollbar.vertical` | `'auto' \| 'visible' \| 'hidden'` | `'auto'` | 垂直滚动条可见性 |
| `scrollbar.horizontal` | `'auto' \| 'visible' \| 'hidden'` | `'auto'` | 水平滚动条可见性 |
| `scrollbar.verticalScrollbarSize` | `number` | `14` | 垂直滚动条大小 |
| `scrollbar.horizontalScrollbarSize` | `number` | `12` | 水平滚动条大小 |
| `scrollbar.verticalHasArrows` | `boolean` | `false` | 垂直箭头按钮 |
| `scrollbar.horizontalHasArrows` | `boolean` | `false` | 水平箭头按钮 |
| `scrollbar.arrowSize` | `number` | `11` | 箭头大小 |
| `scrollbar.useShadows` | `boolean` | `true` | 阴影效果 |
| `scrollbar.ignoreHorizontalScrollbarInContentHeight` | `boolean` | `false` | 计算内容高度时忽略水平滚动条 |

### 3. suggest 建议小部件

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `suggest.showIcons` | `boolean` | `true` | 显示图标 |
| `suggest.showStatusBar` | `boolean` | `true` | 显示状态栏 |
| `suggest.insertMode` | `'insert' \| 'replace'` | `'insert'` | 插入方式 |
| `suggest.filterGraceTime` | `number` | `100` | 过滤宽限期（ms） |
| `suggest.maxVisibleSuggestions` | `number` | `8` | 最大可见条目数 |
| `suggest.preview` | `boolean` | `false` | 预览选中效果 |
| `suggest.shareSuggestSelections` | `boolean` | `true` | 多光标共享选择 |
| `suggest.snippetsPreventQuickSuggestions` | `boolean` | `true` | 片段阻止快速建议 |

### 4. gotoLocation 跳转

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `gotoLocation.multiple` | `'peek' \| 'gotoAndPeek' \| 'goto'` | `'peek'` | 多目标行为 |
| `gotoLocation.multipleTests` | `string` | `undefined` | 测试多目标行为 |
| `gotoLocation.alternativeTestsCommand` | `string` | `undefined` | 替代测试命令 |
| `gotoLocation.alternativeDefinitionCommand` | `string` | `'editor.action.goToReferences'` | 替代定义命令 |
| `gotoLocation.alternativeTypeDefinitionCommand` | `string` | `'editor.action.goToReferences'` | 替代类型定义命令 |
| `gotoLocation.alternativeDeclarationCommand` | `string` | `'editor.action.goToReferences'` | 替代声明命令 |
| `gotoLocation.alternativeImplementationCommand` | `string` | `'editor.action.goToReferences'` | 替代实现命令 |

### 5. quickSuggestions 对象

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `quickSuggestions.other` | `boolean` | `true` | 普通文本区域 |
| `quickSuggestions.comments` | `boolean` | `false` | 注释区域 |
| `quickSuggestions.strings` | `boolean` | `false` | 字符串区域 |

### 6. bracketPairColorization

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `bracketPairColorization.enabled` | `boolean` | `false` | 启用括号对颜色化 |
| `bracketPairColorization.independentColorPoolPerBracketType` | `boolean` | `false` | 每种括号独立颜色池 |

### 7. lightbulb 灯泡指示器

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `lightbulb.enabled` | `boolean` | `true` | 是否显示代码操作灯泡图标 |

### 8. Unicode 高亮

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `unicodeHighlight.nonBasicASCII` | `boolean` | `true` | 高亮非基础 ASCII |
| `unicodeHighlight.ambiguousCharacters` | `boolean` | `true` | 高亮混淆字符 |
| `unicodeHighlight.invisibleCharacters` | `boolean` | `true` | 高亮不可见字符 |
| `unicodeHighlight.allowedCharacters` | `Record<string, boolean>` | `undefined` | 白名单 |
| `unicodeHighlight.includeComments` | `boolean` | `false` | 包含注释 |
| `unicodeHighlight.includeStrings` | `boolean` | `false` | 包含字符串 |

### 9. inlayHints 内联提示

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `inlayHints.enabled` | `'on' \| 'off' \| 'onUnlessPressed' \| 'offUnlessPressed'` | `'on'` | 启用状态 |
| `inlayHints.fontFamily` | `string` | `''` | 字体 |
| `inlayHints.fontSize` | `number` | `0` | 字体大小（0 表示继承） |

### 10. accessibilityPageSize

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `accessibilityPageSize` | `number` | `10` | 无障碍模式下每页行数 |

---

## 四、语言服务配置

### 1. setLanguageConfiguration 配置项

| 配置组 | 字段 | 类型 | 说明 |
|--------|------|------|------|
| **括号匹配** | `brackets` | `[string, string][]` | 括号匹配定义 |
| | `surroundingPairs` | `[string, string][]` | 自动包裹字符对 |
| **注释规则** | `comments.lineComment` | `string` | 行注释标识符 |
| | `comments.blockComment` | `[string, string]` | 块注释起止符 |
| **单词分隔符** | `wordPattern` | `RegExp` | 单词识别正则 |
| **自动闭合** | `autoClosingPairs` | `IAutoClosingPairConditional[]` | 自动闭合字符对及条件 |
| **折叠范围** | `folding` | `IFoldingRules` | 折叠范围定义 |
| **颜色化** | `colorizedBracketPairs` | `[string, string][]` | 颜色化括号对 |
| **缩进规则** | `indentationRules` | `IIndentationRule` | 缩进增减规则 |
| **括号颜色池** | `bracketColorizationOptions` | `{ independentColorPoolPerBracketType: boolean }` | 独立颜色池 |

### 2. 语言特性提供者注册

| 注册方法 | 功能说明 |
|----------|----------|
| `registerCompletionItemProvider` | 代码补全（智能提示） |
| `registerHoverProvider` | 悬停信息 |
| `registerDefinitionProvider` | 定义跳转 |
| `registerReferenceProvider` | 引用查找 |
| `registerDocumentFormattingEditProvider` | 文档格式化 |
| `registerCodeActionProvider` | 代码操作（快速修复） |
| `registerDeclarationProvider` | 声明跳转 |
| `registerImplementationProvider` | 实现跳转 |
| `registerTypeDefinitionProvider` | 类型定义跳转 |
| `registerRenameProvider` | 重命名 |
| `registerSignatureHelpProvider` | 签名帮助 |
| `registerDocumentHighlightProvider` | 文档高亮 |
| `registerDocumentSymbolProvider` | 文档符号 |
| `registerWorkspaceSymbolProvider` | 工作区符号 |
| `registerInlayHintsProvider` | 内联提示 |
| `registerInlineCompletionsProvider` | 内联补全 |
| `registerLinkedEditingRangeProvider` | 关联编辑范围 |

### 3. 语法高亮配置

| 配置方式 | 说明 |
|----------|------|
| `setMonarchTokensProvider` | Monarch 规则定义语法高亮 |
| `setTokensProvider` | 自定义 Token 生成器 |
| `registerTokensProviderFactory` | 懒加载 Token 提供者工厂 |

### 4. 注册与元数据

| 方法 | 说明 |
|------|------|
| `monaco.languages.register` | 注册语言元数据（id、扩展名等） |
| `monaco.editor.setModelLanguage` | 更改模型语言 |
| `monaco.languages.getLanguages` | 获取所有已注册语言列表 |

---

## 五、全局环境配置

### 1. MonacoEnvironment 配置项

| 方法 | 类型 | 说明 |
|------|------|------|
| `getWorkerUrl` | `(moduleId: string, label: string) => string` | 返回 Worker 脚本 URL |
| `getWorker` | `(moduleId: string, label: string) => Worker` | 返回 Worker 实例（优先级高于 URL） |

### 2. 语言服务的 Worker 映射

| label 值 | Worker 源路径 | 功能说明 |
|----------|--------------|----------|
| `'json'` | `monaco-editor/esm/vs/language/json/json.worker` | JSON 验证与格式化 |
| `'css'`, `'scss'`, `'less'` | `monaco-editor/esm/vs/language/css/css.worker` | CSS 语言特性 |
| `'html'`, `'handlebars'`, `'razor'` | `monaco-editor/esm/vs/language/html/html.worker` | HTML 语言特性 |
| `'typescript'`, `'javascript'` | `monaco-editor/esm/vs/language/typescript/ts.worker` | TypeScript/JavaScript IntelliSense |
| 默认（其他） | `monaco-editor/esm/vs/editor/editor.worker` | 核心编辑器操作 |

### 3. ESM 与 AMD 集成

| 配置项 | 说明 |
|--------|------|
| **ESM 方式** | `import * as monaco from 'monaco-editor'`，需搭配 Webpack/Vite 打包 Worker |
| **AMD 方式** | 自 0.53.0 起已弃用，不再支持 |
| **Webpack 插件** | 使用 `monaco-editor-webpack-plugin` 自动配置 |

### 4. 其他全局 API

| 全局对象 | 说明 |
|----------|------|
| `monaco.editor.defineTheme` | 定义自定义主题 |
| `monaco.editor.setTheme` | 切换主题 |
| `monaco.editor.setModelMarkers` | 设置模型错误标记 |
| `monaco.editor.remeasureFonts` | 重新测量字体指标 |

---

> **重要提示：** 以上配置基于 Monaco Editor 0.52.x 及更新版本。实际使用时请以项目引用的类型定义为准。完整 API 文档请访问 [Monaco Editor 官方 API 文档](https://microsoft.github.io/monaco-editor/api/)。
