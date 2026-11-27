# 设计令牌规范（DESIGN）

> 性质：视觉系统的令牌层与使用规则（唯一真源说明）
> 适用范围：`src/renderer/src/**` 全部界面组件、`src/renderer/src/styles/**` 样式文件
> 关联：[动效规范](MOTION.md) ｜ [组件规格](COMPONENTS.md) ｜ 视觉升级方案（`docs/wiki/04-优化与专项报告/`）

## 1. 目标与分层

- **目标**：把「颜色 / 尺寸 / 形状 / 阴影 / 层级 / 动效」收敛为语义令牌，让 28 套主题、4 种界面风格、3 档界面密度互不干扰地组合。
- **主题**只提供颜色（由 10 个基础配色字段派生 18 个语义颜色令牌）。
- **风格**只提供材质与装饰（透明度、模糊、阴影、边框、圆角），由根元素 `data-style` 切换。
- **密度**只提供尺寸节奏（行高、控件高、内边距、标题栏高、UI 字号），由根元素 `data-density` 切换。
- **正交约束**：风格不改变颜色；密度不改变颜色与字号层级；两者均不改变布局结构。

| 层                    | 真源                                                                        | 消费方式                                      |
| --------------------- | --------------------------------------------------------------------------- | --------------------------------------------- |
| 主题颜色（28 套）     | `src/main/config/theme-config.ts`                                           | `useTheme.applyThemeStyles` 写根元素 CSS 变量 |
| 语义颜色令牌（18 个） | `src/shared/theme-tokens.ts`                                                | 根元素 `--ui-*` 变量                          |
| 风格层（4 风格）      | `src/shared/constants/ui-style.ts` + `src/renderer/src/styles/ui-style.css` | 根元素 `data-style` + `--ui-*` 材质变量       |
| 密度层（3 档）        | 同上（`data-density`）                                                      | 根元素 `--ui-row-height` 等尺寸变量           |
| 动效 / 层级           | `src/shared/constants/ui-style.ts` + `ui-style.css`                         | `--ui-duration-*` / `--ui-z-*`                |

## 2. 语义颜色令牌（18 个）

派生唯一真源：`src/shared/theme-tokens.ts` 的 `buildSemanticTokens(theme, group)`；
写入唯一入口：`src/renderer/src/composables/useTheme.ts` 的 `applyThemeStyles`。

| 变量                  | 令牌            | 派生规则                                       | 典型用途               |
| --------------------- | --------------- | ---------------------------------------------- | ---------------------- |
| `--ui-bg`             | `bg`            | backgroundColor                                | 页面底色               |
| `--ui-bg-elevated`    | `bgElevated`    | cardBackground                                 | 卡片 / 面板底          |
| `--ui-bg-sunken`      | `bgSunken`      | hoverBackground 加深 8%                        | 代码块 / 输入框 / 表头 |
| `--ui-surface`        | `surface`       | cardBackground                                 | 工具窗 / 悬浮面        |
| `--ui-border`         | `border`        | borderColor                                    | 1px hairline 分隔      |
| `--ui-border-strong`  | `borderStrong`  | borderColor 加深 8%                            | 分区线 / 强调边界      |
| `--ui-text`           | `text`          | textColor                                      | 正文主文字             |
| `--ui-text-secondary` | `textSecondary` | secondaryTextColor                             | 次要文字 / 标签        |
| `--ui-text-tertiary`  | `textTertiary`  | secondaryTextColor 向 backgroundColor 混合 20% | 辅助说明 / 占位        |
| `--ui-accent`         | `accent`        | accentColor                                    | 主操作 / 选中文字      |
| `--ui-accent-soft`    | `accentSoft`    | accentColor 12% alpha                          | 悬停底 / 选中行底      |
| `--ui-accent-hover`   | `accentHover`   | accentColor 加深 12%                           | 按下 / 悬停实色        |
| `--ui-success`        | `success`       | 固定语义色（浅色/深色各一套）                  | 成功状态               |
| `--ui-warning`        | `warning`       | 固定语义色（浅色/深色各一套）                  | 警告状态               |
| `--ui-danger`         | `danger`        | 固定语义色（浅色/深色各一套）                  | 错误 / 危险操作        |
| `--ui-info`           | `info`          | 固定语义色（浅色/深色各一套）                  | 信息提示               |
| `--ui-focus-ring`     | `focusRing`     | accentColor 30% alpha                          | 键盘焦点环颜色         |
| `--ui-selection`      | `selection`     | accentColor 15% alpha                          | 文本选区 / 高亮底      |

补充规则：

- 状态色**不跟随主题色相**：同一切换下「错误」不能变成绿色；浅色系主题使用深一档状态色，深色系使用提亮一档状态色。
- 语义色分组按**表面亮度**（cardBackground）判定，护眼组优先；这样可修正历史主题分组与真实配色相反的少数主题。
- 三级文字向背景混合（而不是简单加深）：浅色主题更浅、深色主题更暗，两个方向都是「对比度降低」，符合辅助文字语义。
- 合法性兜底：派生入口先归一化输入，非法色值回落到中性兜底色，保证 CSS 变量永远不出现 `undefined` / 非法串。

### 2.1 颜色工具函数（`src/shared/theme-tokens.ts`）

| 函数                                  | 说明                                                                 | 边界                                               |
| ------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| `parseColor`                          | 解析 `#rgb` / `#rgba` / `#rrggbb` / `#rrggbbaa` / `rgb()` / `rgba()` | 命名色、`hsl()`、CSS 变量引用、渐变一律返回 `null` |
| `normalizeColor`                      | 归一化为小写 hex，非法值回落兜底色                                   | 兜底色同样要求是合法颜色                           |
| `darkenColor` / `lightenColor`        | 按比例降低通道 / 向白色混合                                          | 比例钳制 0~1                                       |
| `withAlphaColor`                      | 固定输出 `rgba(r, g, b, a)`                                          | alpha 钳制 0~1                                     |
| `mixColor`                            | 线性混合两个颜色（0 = 起点，1 = 终点）                               | 用于三级文字等「视觉权重」派生                     |
| `relativeLuminance` / `contrastRatio` | WCAG 相对亮度 / 对比度                                               | 用于对比度抽样校验与深色判定，不参与运行时样式计算 |
| `isDarkColor`                         | 相对亮度 < 0.4 判深色                                                | 无法解析按浅色处理                                 |
| `resolveSemanticThemeGroup`           | 判定语义色分组（护眼 → 表面亮度 → 主题分组兜底）                     | 纯函数，无 DOM 依赖                                |

## 3. 风格层令牌（4 种材质）

真源：`src/shared/constants/ui-style.ts` 的 `UI_STYLE_TOKENS`。
运行时：根元素 `data-style="paper | glass | workbench | hybrid"`。

| 令牌             | paper          | glass           | workbench（默认）   | hybrid（外壳 / 内容区）                |
| ---------------- | -------------- | --------------- | ------------------- | -------------------------------------- |
| 表面不透明度     | 1              | 0.86            | 1                   | 1 / 1（内容区纸感）                    |
| 背景模糊         | 0              | 8px（仅小面积） | 0                   | 0 / 0                                  |
| 高光边 alpha     | 0              | 0.14            | 0                   | 0 / 0                                  |
| 圆角（小/中/大） | 4 / 6 / 8      | 8 / 8 / 12      | 2 / 4 / 6           | 2 / 4 / 6（外壳）、4 / 6 / 8（内容区） |
| 阴影三档         | 弱于基准约 33% | 更柔、扩散更大  | 基准档（方案 §3.3） | 外壳基准、内容区纸感                   |

- **hybrid 双材质边界**：外壳（标题栏 / 菜单栏 / 侧栏 / 状态栏 / 工具窗 / 对话框 / 命令面板）消费 `--ui-*`，内容区（编辑器正文 / Markdown 预览）消费 `--ui-content-*`。
- **glass 模糊只允许用于悬浮层**（工具窗、下拉、命令面板），禁止整窗大面积 `backdrop-filter`。

### 3.1 glass 自动降级规则

| 条件                                                      | 生效材质                      | 根元素标记                                         |
| --------------------------------------------------------- | ----------------------------- | -------------------------------------------------- |
| 浅色普通主题                                              | glass 常规（0.86 + 8px）      | `data-style="glass"` `data-glass-mode="normal"`    |
| 深色主题                                                  | glass 稳健（0.94 + 关闭模糊） | `data-style="glass"` `data-glass-mode="steady"`    |
| 高饱和 / 渐变主题                                         | 回退 paper                    | `data-style="paper"` `data-glass-mode="flat"`      |
| 护眼主题                                                  | 回退 paper                    | `data-style="paper"` `data-glass-mode="flat"`      |
| 开启「减少透明效果」或系统 `prefers-reduced-transparency` | 回退 paper                    | `data-style="paper"` `data-transparency="reduced"` |

优先级：减少透明 > 高饱和/护眼 > 深色。

## 4. 密度层令牌（3 档）

真源：`src/shared/constants/ui-style.ts` 的 `UI_DENSITY_TOKENS`；运行时根元素 `data-density`。

| 令牌                                    | compact | default（默认 = 既有观感） | spacious |
| --------------------------------------- | ------- | -------------------------- | -------- |
| `--ui-row-height`（菜单/表格/列表行高） | 24px    | 28px                       | 32px     |
| `--ui-control-height`（按钮/输入/下拉） | 28px    | 32px                       | 36px     |
| `--ui-pad`（内边距基准）                | 8px     | 12px                       | 16px     |
| `--ui-titlebar-height`（工具窗标题栏）  | 36px    | 40px                       | 44px     |
| `--ui-font-size`（UI 字号）             | 12px    | 13px                       | 13px     |

## 5. 间距、圆角、阴影、层级

### 5.1 间距（4px 基准，只允许 7 档）

| 档位 | 用途                       |
| ---- | -------------------------- |
| 4px  | 图标与文字间距、紧邻元素   |
| 8px  | 列表项、标签内边距         |
| 12px | 卡片内边距、控件间距       |
| 16px | 内容区留白、按钮水平内边距 |
| 24px | 模块间距                   |
| 32px | 区块间距                   |
| 48px | 页面级留白                 |

### 5.2 圆角（5 档，禁止新增自由值）

| 档位  | 用途               | 变量                                     |
| ----- | ------------------ | ---------------------------------------- |
| 2px   | 快捷键 chip / 标签 | `--ui-radius-sm`                         |
| 4px   | 控件按钮           | `--ui-radius-md`（workbench 下）         |
| 6px   | 输入框 / 卡片      | `--ui-radius-md` / `--ui-radius-lg`      |
| 8px   | 弹窗 / 工具窗      | `--ui-radius-lg`                         |
| 999px | 胶囊 / 头像        | 直接使用 `999px`（唯一允许的字面量圆角） |

> 具体取值随 `data-style` 变化（见 §3），组件不得自写圆角像素值。

### 5.3 阴影（3 档，只用于悬浮层级）

| 变量            | 用途                   |
| --------------- | ---------------------- |
| `--ui-shadow-1` | 卡片 / 输入聚焦底      |
| `--ui-shadow-2` | 悬浮层 / 工具窗 / 下拉 |
| `--ui-shadow-3` | 对话框 / 命令面板      |

### 5.4 层级（z-index）

| 变量                | 值  | 用途         |
| ------------------- | --- | ------------ |
| `--ui-z-content`    | 0   | 内容区       |
| `--ui-z-sidebar`    | 10  | 侧栏         |
| `--ui-z-drag`       | 20  | 拖拽占位     |
| `--ui-z-toolwindow` | 30  | 非模态工具窗 |
| `--ui-z-dropdown`   | 40  | 菜单下拉     |
| `--ui-z-dialog`     | 50  | 对话框       |
| `--ui-z-palette`    | 60  | 命令面板     |
| `--ui-z-toast`      | 70  | Toast        |
| `--ui-z-guide`      | 80  | 引导层       |

## 6. 使用规则（必须 / 禁止）

**必须**

- 颜色一律使用语义令牌：`var(--ui-text)`、`var(--ui-accent-soft)` 等；历史组件可继续使用 `var(--theme-*)` / 无前缀别名，两者并存。
- 尺寸节奏（行高 / 控件高 / 内边距）使用密度变量，不要写死像素。
- 材质（阴影 / 圆角 / 模糊 / 透明度）使用风格变量，不要写死。
- 焦点状态使用 `--ui-focus-shadow` + `--ui-focus-ring`，不依赖浏览器默认 outline。
- 危险/成功/警告/信息语义使用 `--ui-danger` 等固定状态色，不借用主题强调色。
- 内容区（正文/预览）使用 `--ui-content-*`，以便 hybrid 双材质正确分界。

**禁止**

- 新增硬编码主题色（hex / rgb / 具名色）；阴影与遮罩允许 `rgba(0,0,0,…)` 且必须注明用途。
- 用主题强调色表达状态语义（避免「错误」随主题变绿）。
- 在组件内重复定义 `data-style` / `data-density` 或手写风格判断（唯一入口是 `useTheme.applyUiAppearance`）。
- 大面积使用 `backdrop-filter`（glass 只允许悬浮层小面积）。
- 直接改写 `--theme-*` 20 个变量或绕过 `THEME_CSS_VARIABLE_BINDINGS`（破坏主题单真源）。
- 为聚焦某个主题写 `:root[data-theme="xxx"]` 特例（应通过语义令牌派生自动适配）。

## 7. 反例对照

| 反例                                      | 问题                                  | 正确写法                                                                        |
| ----------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------- |
| `background: #ffffff;`                    | 深色主题下白底刺眼、主题切换不跟随    | `background: var(--ui-surface);`                                                |
| `color: #e74c3c;`                         | 硬编码状态色，深色主题对比度不足      | `color: var(--ui-danger);`                                                      |
| `border-radius: 7px;`                     | 圆角自由值，界面出现「差 2px」        | `border-radius: var(--ui-radius-lg);`                                           |
| `transition: all 0.2s ease;`              | 动效无节奏，且 `all` 触发无关属性动画 | `transition: background-color var(--ui-duration-fast) var(--ui-ease-standard);` |
| `padding: 10px 14px;`                     | 间距脱离 4px 阶梯                     | `padding: 8px 16px;`（§5.1 档位）                                               |
| `box-shadow: 0 0 6px rgba(0,0,0,.3);`     | 阴影无分级、过重                      | `box-shadow: var(--ui-shadow-2);`                                               |
| `z-index: 9999;`                          | 层级失控                              | `z-index: var(--ui-z-dialog);`                                                  |
| 在组件内 `if (theme === 'dark')` 改透明度 | 绕过降级规则与主题正交设计            | 由 `useTheme.applyUiAppearance` 计算 `data-style` / `data-glass-mode`           |

## 8. 验收与守护

- 令牌派生：`tests/unit/theme-tokens.test.ts`（颜色工具、派生规则、非法值兜底、分组判定）。
- 28 主题覆盖：`tests/unit/theme-contract.test.ts`（28 × 18 完整性、分组、`theme.css` 默认值）。
- 风格/密度：`tests/unit/ui-style-tokens.test.ts`（4 × 3 令牌完整性、CSS 与 TS 单一真源、默认值 = 既有观感）。
- 主题单真源：`tests/unit/composables/useTheme.test.ts`（20 + 18 变量写入、幂等、降级路径）。

## 9. 相关文件

- 语义令牌派生：[`src/shared/theme-tokens.ts`](../../src/shared/theme-tokens.ts)
- 风格 / 密度常量：[`src/shared/constants/ui-style.ts`](../../src/shared/constants/ui-style.ts)
- 风格 / 密度变量表：[`src/renderer/src/styles/ui-style.css`](../../src/renderer/src/styles/ui-style.css)
- 主题默认变量：[`src/renderer/src/styles/theme.css`](../../src/renderer/src/styles/theme.css)
- 主题单真源：[`src/renderer/src/composables/useTheme.ts`](../../src/renderer/src/composables/useTheme.ts)
- 四风格预览图：[纸感](preview/style-paper.svg) ｜ [轻玻璃](preview/style-glass.svg) ｜ [工作台](preview/style-workbench.svg) ｜ [混合](preview/style-hybrid.svg)
