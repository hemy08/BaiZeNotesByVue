# 组件规格（COMPONENTS）

> 性质：6 类核心组件的尺寸、层级、交互与键盘规格（消费 [设计令牌](DESIGN.md) + [动效令牌](MOTION.md)）
> 适用范围：菜单栏、非模态工具窗、表格编辑器、对话框、命令面板、状态栏与空态
> 说明：本文是规格真源；组件实现按批次落地，未落地项以「待实现」标注，不得以未实现为由偏离规格。

## 1. 通用契约

- 颜色 / 材质 / 尺寸一律消费令牌，不写死像素与色值（见 [DESIGN.md §6](DESIGN.md)）。
- 风格差异通过 `data-style` 下的 `--ui-*` 变量自动生效，组件不写风格分支。
- 密度差异通过 `data-density` 下的尺寸变量自动生效，组件不写密度分支。
- 键盘可达：交互元素必须有可见焦点（`--ui-focus-shadow`）、`Esc` 语义明确、`Tab` 顺序符合阅读顺序。
- 动效使用 `--ui-duration-*` / `--ui-ease-*`，减少动效自动降级。

## 2. 菜单栏

| 项       | 规格                                                                                                              |
| -------- | ----------------------------------------------------------------------------------------------------------------- |
| 高度     | 36（密度档：compact 32 / default 36 / spacious 40）                                                               |
| 菜单项   | 内边距 `0 12px`、行高 28、圆角 `--ui-radius-sm`                                                                   |
| 悬停     | 背景 `--ui-accent-soft`、文字 `--ui-accent`                                                                       |
| 下拉面板 | 圆角 `--ui-radius-lg`、阴影 `--ui-shadow-2`、内边距 6                                                             |
| 下拉项   | 行高 28、悬停背景 `--ui-accent-soft`                                                                              |
| 分隔符   | 1px `--ui-border`，上下间距 6                                                                                     |
| 快捷键   | 右对齐、字号 11、颜色 `--ui-text-tertiary`                                                                        |
| 键盘     | `role=menubar/menu/menuitem`；方向键移动、Enter 打开、Esc 关闭、Home/End 首尾跳转                                 |
| 实现状态 | ✅ 已实现（P1：`menu-keyboard.ts` + `MenuSubmenu.vue` / `MenuSubmenuItem.vue`，含 roving focus 与子菜单焦点管理） |

## 3. 非模态工具窗

| 项       | 规格                                                                                                                                                                                     |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 壳       | 圆角 `--ui-radius-lg`、阴影 `--ui-shadow-2`、1px `--ui-border` 边框                                                                                                                      |
| 标题栏   | 高 `--ui-titlebar-height`（36 / 40 / 44）；标题字号 13 / 字重 600；关闭按钮 28×28                                                                                                        |
| 内容区   | 内边距 `--ui-pad`（8 / 12 / 16）；`BaseDialog` 提供可选 `contentPadding` 包裹层（T12 落地、默认关闭，保持 25 个已迁移对话框的 DOM 子节点契约），后续批次在正文无内边距的工具窗上逐个启用 |
| 拖拽把手 | 标题栏左侧 6 点纹理；拖拽时提升到 `--ui-z-toolwindow`                                                                                                                                    |
| 缩放     | 限制在主窗口可视区内；缩放过程中不使用过渡                                                                                                                                               |
| 焦点     | 打开时聚焦内容首个可交互元素；`Esc` 仅关闭最顶层工具窗                                                                                                                                   |
| 关闭行为 | 外部点击不关闭（非模态语义）；与编辑器焦点/滚动互不干扰                                                                                                                                  |
| 材质     | glass 下仅工具窗使用小面积模糊；`--ui-surface-opacity` 控制透明面                                                                                                                        |

## 4. 表格编辑器

| 项           | 规格                                                                  |
| ------------ | --------------------------------------------------------------------- |
| 行高         | `--ui-row-height`（24 / 28 / 32）                                     |
| 列头         | 高 32、字重 600、底色 `--ui-bg-elevated`、文字 `--ui-text-secondary`  |
| 单元格边框   | 1px `--ui-border` hairline                                            |
| 选区         | 背景 `--ui-accent-soft`、边框 `--ui-accent`                           |
| 列宽拖拽手柄 | 宽 4px，悬停才显色（`--ui-accent`）                                   |
| 对齐         | 数字右对齐、文本左对齐、日期统一 `YYYY-MM-DD`                         |
| 空单元格     | 显示占位而不是 `0`                                                    |
| 键盘         | 方向键 / Tab / Enter / F2 移动与编辑；Esc 取消编辑                    |
| 键盘提示     | 底部 `dialogRenderer.tableEditor.keyboardHint` 中英双语（T18 补齐）   |
| 风格差异     | paper 边框更轻；workbench 列头底色 + 网格线更明显；glass 透出背景层次 |

## 5. 对话框（BaseDialog）

| 项       | 规格                                                                                                                                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 宽度阶梯 | 360（确认）/ 520（表单）/ 720（中等，默认）/ 960（复杂）/ 全宽（特殊）；禁止调用方自由传任意宽度。P2 T12 已把 4 个像素等值调用点迁移到 `widthSize`（520/720/960），其余风险较大的调用点保持既有 `width` 原值 |
| 标题栏   | 高 40、标题 15 / 字重 600                                                                                                                                                                                    |
| 内容区   | 内边距 16                                                                                                                                                                                                    |
| 底部按钮 | 高 `--ui-control-height`、主按钮 `--ui-accent`                                                                                                                                                               |
| 遮罩     | 浅色主题 `rgba(0, 0, 0, 0.32)`，深色主题 `rgba(0, 0, 0, 0.48)`；可选 2px 模糊                                                                                                                                |
| 壳       | 圆角 `--ui-radius-lg`、阴影 `--ui-shadow-3`                                                                                                                                                                  |
| a11y     | `role="dialog"` + `aria-modal="true"` + `aria-labelledby`/`aria-label`；关闭按钮有 `aria-label`                                                                                                              |
| 焦点     | 打开移入、关闭归还；Tab/Shift+Tab 框内循环；`Esc` 只关最顶层；body 滚动锁按引用计数                                                                                                                          |
| 兼容     | 保持既有 `overlayStyle` / `titleBarStyle` 迁移语义                                                                                                                                                           |

## 6. 命令面板

| 项          | 规格                                                                                                                                                 |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 宽度        | 720                                                                                                                                                  |
| 壳          | 圆角 `--ui-radius-lg`、阴影 `--ui-shadow-3`、层级 `--ui-z-palette`（应用层相对阶梯 `--ui-z-palette-app` = 120，恒高于对话框 110，见 DESIGN.md §5.4） |
| 行高        | 32                                                                                                                                                   |
| 左右内边距  | 12                                                                                                                                                   |
| 分组标题    | 字号 11 / 字重 600 / 大写 / 颜色 `--ui-text-tertiary`                                                                                                |
| 选中行      | 背景 `--ui-accent-soft` + 左侧 2px `--ui-accent` 竖条                                                                                                |
| 快捷键 chip | 圆角 2、1px `--ui-border` 边框、字号 11                                                                                                              |
| 键盘        | 上下方向键移动、Enter 执行、Esc 关闭；打开时聚焦搜索框                                                                                               |

## 7. 状态栏与空态

### 7.1 状态栏

| 项       | 规格                                                    |
| -------- | ------------------------------------------------------- |
| 高度     | 24                                                      |
| 字号     | 12                                                      |
| 文字     | `--ui-text-secondary`                                   |
| 分隔     | 1px `--ui-border`                                       |
| 错误状态 | `--ui-danger` 状态点 + 可点击打开详情（不允许静默失败） |

### 7.2 空态（统一组件）

| 项     | 规格                                                             |
| ------ | ---------------------------------------------------------------- |
| 结构   | 统一 SVG 插图 1 套 6 变体 + 主标题 + 描述 + 主按钮               |
| 变体   | 空文件 / 无搜索结果 / 无标签 / 无附件 / 无标注 / 未启用          |
| 主标题 | 字号 15、字重 600、颜色 `--ui-text`                              |
| 描述   | 字号 13、颜色 `--ui-text-secondary`                              |
| 按钮   | 主操作使用 `--ui-accent` 实色                                    |
| 约束   | 不使用大段占位文字；插图统一 24 网格 / stroke 1.5 / currentColor |

## 8. 图标资产规范

### 8.1 三档口径

| 档位               | 网格 / 形态                                                                     | 适用                                                                                     | 约束                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| 功能图标（线框）   | 24 网格、`fill="none"`、`stroke="currentColor"`、`stroke-width="1.5"`、16/20/24 | 工具栏、空态、按钮、对话框类型选择器等 UI 图标                                           | 不得使用 emoji 作功能图标；不得用 fill 型图形库替代手写线框图标                                                                          |
| 图形库图标（MDI）  | 24 网格、`fill="currentColor"`、单段 `path d`、无 stroke                        | mkdocs-material `:material-xxx:` 行内图标；`AdmonitionDialog` 等「图标集」               | fill 型例外：不适用 stroke 1.5 规则，也不得逐条改写成线框；数据须来自上游 `@mdi/js`（当前 7.4.47，Apache-2.0 / MIT），按图标名字母序维护 |
| 品牌大图标（例外） | 512 网格、渐变 / 多色、非 `currentColor`                                        | `logo-baize-dark-A-ultra.svg` / `logo-baize-light-A-large.svg` / `baize_mirror_dark.svg` | 白名单仅这 3 个文件；不得按 24 网格重绘，也不得用作品牌以外场景                                                                          |

### 8.2 MDI fill 型图标库例外口径

- **数据真源**：`mdi-icons-core.ts`（首屏核心子集 77 个，同步内嵌零异步等待）+ `mdi-icons-data.ts`（全量 133 个，由 `mdi-icons-loader.ts` 动态 import 懒加载，95KB 不进主 chunk）。
- **渲染约定**：`viewBox="0 0 24 24"` + `<path :d="...">` + `fill="currentColor"`（颜色随文本/父级 `color`）；装饰性图标必须 `aria-hidden="true"`，可访问名由相邻可见文案承载。
- **使用边界**：
    - 预览管线（mkdocs-material 行内图标）通过 `getMdiIconPath` / `getMdiIconNames` 查询，未收录图标降级为可见文本；
    - 普通组件只需少量 MDI 图标时，只允许**内联所需少量 path**（示例：`AdmonitionDialog` 内联 12 条），禁止整包 import `mdi-icons-data.ts`，避免 95KB 数据进入组件 chunk；
    - MDI 图标与线框功能图标并存，不得为「风格统一」把 fill 型路径改写成 stroke 线框（会损失图形库的可维护性与上游可替换性）。
- **维护约定**：核心子集由 `out/tmp/gen-mdi-icons-core.mjs` 从全量数据一次性抽取生成，禁止手工编辑；修改核心清单后须重跑生成器，并保持核心子集与全量数据的同名校验通过。

### 8.3 资产清理原则

- **引用为唯一准入**：`assets/**` 中的 SVG 必须在 `src/` 有静态引用（`import` / 文件名 / 可证动态引用）；仅出现在文档/报告中的资产视为未引用。
- **删除前必须扫描**：新增或删除资产前先按上述四类引用口径扫描 `src/` / `tests/` / `e2e/` / `resources/` / `build/` + 根配置（字符串 / import / glob / 动态拼接），确认零运行时引用后再 `git rm`；本批临时扫描脚本与扫描结果为 `out/tmp/scan-unreferenced-icons.mjs`、`out/tmp/icons-cleanup-evidence.md`（证据工具，不入库）。
- **占位资产零容忍**：不得提交「占位圆 / 占位图」（单 `<circle cx="12" cy="12" r="10">`、`stroke-width="2"`、无 `<path>`）；`visual-p2-acceptance.test.ts` 已加静态指纹守卫。
- **数量冻结**：`src/renderer/src/assets/icons/**` 固定 **3 个**（全部为 512 网格品牌文件：`logo-baize-dark-A-ultra.svg` / `logo-baize-light-A-large.svg` / `baize_mirror_dark.svg`）。24 网格功能图标一律为**组件内联 SVG**（24 网格 / `fill="none"` / `stroke="currentColor"` / `stroke-width="1.5"`，见 §8.1），不再以资产文件形式存在；增删资产必须同步 `visual-p2-acceptance.test.ts` T14 断言与本节。
- **存量零引用已清零（1.5.6 REQ-15）**：P2 遗留的 20 个历史零引用 24 网格功能图标（html-convert / import-export / katex / live-preview / md-edit / mermaid / multi-cursor / multi-format / search / theme-switch × dark/light 各 1）已全部删除。处置依据：① 它们是编辑器功能图标（Markdown 编辑/预览/多光标等），与 38 项插件工具语义不匹配；② 文件内写死 dark/light 两套十六进制颜色（部分还含 `<text>`），无法消费 `currentColor` / `--ui-*` 令牌，接入后会在 28 套主题下失真；③ 需求「优先复用」的前提（语义匹配 + 令牌化）不成立。删除后「不得引入未引用资产」不再有任何冻结豁免清单。
- **删除方式**：使用 `git rm`，不保留重复占位文件归档（确需留档时归档到 `out/archive/`，不入库）。

## 9. 待实现项与验收

- 已实现（P1~P2，2026-11-27）：
    - 菜单栏键盘角色与子菜单焦点管理（§2，`menu-keyboard.ts`）；
    - 6 组件 × 4 风格 × 3 密度的视觉落地（§2~§7 全部尺寸/材质取值由令牌覆盖自动生效）；
    - 对话框宽度阶梯的等值调用点迁移（§5）；工具窗可选内边距包裹层（§3，默认关闭）；
    - 图标统一遗留项收口（§8）：删除 34 个未引用「占位圆」资产；`AdmonitionDialog` 12 个 emoji 功能图标替换为 MDI fill 型 SVG；MDI fill 型例外口径与资产清理原则入规范。
- 已实现（1.5.6 批次 A，2026-11-28）：
    - 插件工具分类折叠 + 每工具图标（REQ-06，§8）：38 项工具各配 24 网格线框图标（`plugin-tools-icons.ts`，currentColor + stroke 1.5，未知工具回退分类图标）；「全部工具」按 8 分类分组、可折叠并持久化（`baize:plugin-tools:collapsed-groups`）；分组标题显示分类图标与折叠箭头（`aria-expanded`）。
    - 零引用图标处置（REQ-15，§8.3）：20 个历史零引用 24 网格功能图标全部删除，`assets/icons` 由 23 收敛为 3 个品牌文件（24 网格功能图标一律内联）。
- 待实现（后续批次，已在 P2-VERIFICATION 记录）：
    - 对话框剩余 `width` 调用点继续迁移到语义阶梯（风险较大的 860/900/980/1280/1400 等自定义宽度需先确认视觉等价）；
    - 工具窗逐个启用 `contentPadding`（需先移除对应正文容器的自有内边距，避免双重留白）；
    - ~~应用层 z-index 基座（欢迎页 9999 / 写作模式 3000 / 窗口缩放热区 10000）统一迁移到 `UI_Z_INDEX_TOKENS` 相对阶梯~~ → ✅ **P2 遗留项 4 已完成命名令牌化**（欢迎页/写作模式/缩放热区消费 `--ui-z-*-app`，数值不变、栈序零变化；相对阶梯化留待后续，只需改变量值）。
- 验收口径：
    - 每组件在 4 种风格 × 3 档密度下截图走查（真实截图归档 `out/visual-1.5.5-p2/`，不入库；软门禁见 `e2e/visual-matrix.spec.ts`）；
    - 键盘走查：Tab 顺序、焦点可见、`Esc` 语义一致（`dialog-a11y.test.ts` / `menu-keyboard` 测试守护）；
    - 既有 a11y 契约（对话框 role/焦点/滚动锁）不得回退；
    - 静态矩阵断言：`tests/unit/visual-p2-acceptance.test.ts`（48 + 18 + 12 + 6 组合数、144 组组件观测点、28 主题对比度扫描）；
    - 门禁：类型检查、ESLint、Prettier、全量单测、覆盖率、文档链接检查全绿。

## 10. 相关文件

- 令牌与降级规则：[设计令牌规范](DESIGN.md)
- 动效规则：[动效规范](MOTION.md)
- 视觉方向稿：视觉升级方案（`docs/wiki/04-优化与专项报告/`）
- 对话框外壳：[`src/renderer/src/components/dialogs/BaseDialog.vue`](../../src/renderer/src/components/dialogs/BaseDialog.vue)
- 风格/密度变量：[`src/renderer/src/styles/ui-style.css`](../../src/renderer/src/styles/ui-style.css)
- 图标资产目录：[`src/renderer/src/assets/icons/`](../../src/renderer/src/assets/icons/)
- MDI 核心子集：[`mdi-icons-core.ts`](../../src/renderer/src/components/Markdown/mdi-icons-core.ts) ｜ 全量数据：[`mdi-icons-data.ts`](../../src/renderer/src/components/Markdown/mdi-icons-data.ts) ｜ 懒加载器：[`mdi-icons-loader.ts`](../../src/renderer/src/components/Markdown/mdi-icons-loader.ts)
- 本批图标清理证据（临时产物，不入库）：`out/tmp/icons-cleanup-evidence.md`、`out/tmp/unreferenced-icons-report.json`
