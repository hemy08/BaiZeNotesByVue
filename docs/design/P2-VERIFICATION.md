# 视觉升级 1.5.5 P2 验收记录（T12~T17）

> 更新于 2026-11-27 ｜ 归属：[视觉升级方案（1.5.5）](../wiki/04-优化与专项报告/视觉升级方案-1.5.5.md) P2 收尾批次
> 性质：**执行与验收记录**（结论 + 证据路径 + 剩余清单），与 [DESIGN](./DESIGN.md) / [COMPONENTS](./COMPONENTS.md) / [MOTION](./MOTION.md) 规格配套。
> 说明：方案 §5 的「78 张截图基线」为设计目标口径；本记录按**可复现证据**给出真实截图、静态矩阵断言与明确缺口，不把未执行项写成已完成。

## 1. 结论先行

- **T12 跨组件回归**：6 类组件区域 × 4 风格 × 3 密度的令牌消费一致性通过静态契约 + 真实截图抽查；修复 z-index 收敛、菜单栏高度双写、宽度阶梯等值调用点、T6 内边距可选包裹层 4 项 P1 遗留。
- **T13 编辑器正文纸感**：paper / hybrid 写作模式正文版式（16 / 1.75、段落 0.75em、标题 1.5em+0.5em、引用条 3px accent-30%、代码块 6/12）以 `--ui-content-*` 令牌落地；不触碰 Monaco 主题。
- **T14 图标统一**：修正 HemyTools 查看器 11 处不一致；完成 57 个 SVG 资产 + 70 处内联 SVG 审计，剩余项分类记录。
- **T15 硬编码清理**：同口径（git `b2d846c` 基线 vs 当前，去注释、hex+rgb 计次）总量 **944 → 775**（−169，−17.9%）；**白名单外可治理 479 → 332（−147，−30.7%）**；未强制归零，剩余清单见 §5。
- **T16 验收矩阵**：真实 Electron 截图 36 张归档 `out/visual-1.5.5-p2/`（不入库）；静态矩阵 48+18+12+6 组合数、144 组组件观测点、28 主题 × 4 风格对比度扫描全部通过。
- **T17 E2E 视觉软门禁**：`e2e/visual-matrix.spec.ts` 已接入（`E2E_VISUAL=1` 触发），像素差异只写 annotation/warn 不阻塞；基线复跑 0 差异。
- **口径差异记录**：方案 §5 文字「合计 78 张」= 48（风格）+ 18（密度）+ 12（主题类别）；glass 降级专项 6 张若单列则合计 84 张。本记录按四组子矩阵定义分别统计，避免数字歧义。

## 2. T12 跨组件回归（4 风格 × 3 密度 × 6 组件区域）

### 2.1 检查方法

| 层          | 手段                                                                           | 文件                                                                            |
| ----------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| 静态契约    | 组件必需令牌清单 + 禁止写死风格/密度分支 + 禁止硬编码色值                      | `tests/unit/visual-style-b2.test.ts`、`tests/unit/visual-p2-acceptance.test.ts` |
| 真实渲染    | Electron 真机截图：主窗口 / 对话框 / 命令面板 / 非模态工具窗 × 4 风格 × 3 密度 | `e2e/visual-matrix.spec.ts`（`out/visual-1.5.5-p2/real/`）                      |
| 键盘与 a11y | 菜单 roving focus / 对话框 Esc-Tab 语义 / 焦点可见                             | 既有 `dialog-a11y.test.ts`、`menu-keyboard` 相关用例（P1 已建，本批未回退）     |

### 2.2 各区域结论

| 区域         | 结论                                                                                                                                                  | 证据                                                                                 |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 菜单栏       | 四风格材质差异正确（paper 无阴影、glass 高光边不可见因非悬浮层、workbench/hybrid 外壳一致）；三密度行高/内边距/字号按令牌变化；高度 32/36/40 唯一实现 | 真实截图 `main__*`（菜单栏在窗口顶部）+ `visual-style-b2.test.ts`                    |
| 非模态工具窗 | 标题栏 `--ui-titlebar-height`、拖拽把手、hairline、`--ui-shadow-2`、glass 小面积 blur 正确；`Esc` 只关最顶层（E2E 实测）                              | 真实截图 `toolwindow__*` + `dialog-tool-window.test.ts`                              |
| 表格编辑器   | 行高/列头/hairline/选区令牌全部消费；键盘导航与提示双语齐备；**真实截图缺口**：E2E 无活动编辑器注册时表格编辑器不弹窗，改由同类工具窗截图 + 单测覆盖  | `table-style.test.ts`、`table-editor-dialog.test.ts`、`visual-p2-acceptance.test.ts` |
| 对话框       | 宽度阶梯/标题 40+15/600/遮罩 .32-.48/radius-lg/shadow-3/底栏控件高令牌一致；4 风格 × 3 密度真实截图                                                   | `dialog__*`、`dialog-shell-style.test.ts`、`dialog-tool-window.test.ts`              |
| 命令面板     | 宽度 720（语义阶梯 medium 等值迁移）、radius-lg/shadow-3/半透明面、行高与 chip 令牌、层级恒高于对话框                                                 | `palette__*`、`command-palette-visual.test.ts`                                       |
| 状态栏与空态 | 高度 24/字号 12 由宿主提供；文字 secondary/hairline 分隔/错误 danger 点；空态 6 变体统一 SVG                                                          | `visual-style-b2.test.ts`、`StatusBar.vue`/`EmptyState.vue`                          |

### 2.3 本批修复项（P1 遗留）

1. **z-index 收敛**：`BaseDialog` 遮罩 9999 → `var(--ui-z-dialog-app)`；命令面板遮罩 → `var(--ui-z-palette-app)`（10000，恒高于对话框）。语义阶梯 `--ui-z-dialog`(50) / `--ui-z-palette`(60) 保持不变；应用层等值映射集中到 `UI_Z_INDEX_APP_COMPAT` + `ui-style.css` 两个变量（详见 DESIGN.md §5.4）。**未直接降为 50 的原因**：欢迎页 9999 / 写作模式 3000 / 窗口缩放热区 9999~10000 属既有高层浮层且不在本批写域，直接降级会被写作模式全屏层遮挡。
2. **菜单栏高度单一实现**：`BaiZeNotes.vue` 宿主 `.menu-bar` 由 `height: 35px` 改为 `calc(var(--ui-control-height) + 4px)`（32/36/40）；删除 `MenuBar.vue` 的非 scoped `#menu-bar` 全局覆盖。
3. **T9 宽度阶梯渐进迁移（像素等值）**：`CommandPalette` 720→`medium`、`WebUrlDialog` 520→`form`、`WritingStyleDialog` / `FileHistoryDialog` 960→`complex`；其余自定义宽度（460/480/500/530/560/600/620/650/750/760/800/860/900/920/980/1280/1400）保持原值（视觉等价未逐一确认，见遗留）。
4. **T6 工具窗内边距**：`BaseDialog` 新增可选 `contentPadding` 包裹层（`.dialog-body`，padding 消费 `--ui-pad`），**默认关闭**以保持 25 个已迁移对话框「prepend → title-bar → 正文 → footer」直接子节点契约（c4 契约零变化）；逐个启用留待后续批次（需先移除正文容器自有内边距，避免双重留白）。
5. **命令面板覆盖层**：`CommandPalette` 通过 `overlayStyle` 注入 `--ui-z-palette-app`，不再依赖「同 z-index 后渲染者在上」的 DOM 时序；并等值迁移到 `widthSize`。
6. **表格键盘提示 i18n**：新增 `dialogRenderer.tableEditor.keyboardHint`（中/英）并在底部提示区消费（T18）。

### 2.4 遗留项

- 对话框剩余 `width` 调用点未迁移（风险大，需逐个人工确认视觉等价；测试已禁止**新**调用点使用阶梯像素值）。
- `contentPadding` 尚无调用点启用（默认关闭，零像素变化）。
- 应用层 z-index 基座（欢迎页/写作模式/缩放热区）待统一迁移；迁移后仅需改 `--ui-z-*-app` 两个变量。

## 3. T13 编辑器正文纸感（paper / hybrid）

### 3.1 实现位置

- 令牌声明：`src/renderer/src/styles/ui-style.css` 的 `[data-style='paper'], [data-style='hybrid']` 块（内容区材质 = paper 的两种风格）；
- 消费点：`src/renderer/src/components/Markdown/WritingModeHost.vue` 全局样式（仅「写作模式 + 内容区材质 paper」时生效，作用域 `.md-typeset`）。

### 3.2 版式令牌（对照方案 §4.7）

| 令牌                                  | 值                                                      | 用途                           |
| ------------------------------------- | ------------------------------------------------------- | ------------------------------ |
| `--ui-content-line-height`            | 1.75                                                    | 正文行高                       |
| `--ui-content-font-size`              | 16px                                                    | 正文字号（显式化，与行高成套） |
| `--ui-content-paragraph-gap`          | 0.75em                                                  | 段落间距                       |
| `--ui-content-heading-gap-top/bottom` | 1.5em / 0.5em                                           | 标题上/下留白                  |
| `--ui-content-blockquote-width`       | 3px                                                     | 引用条宽度                     |
| `--ui-content-blockquote-color`       | `color-mix(in srgb, var(--ui-accent) 30%, transparent)` | 引用条 accent-30%              |
| `--ui-content-code-radius`            | `var(--ui-content-radius-md, 6px)`                      | 代码块圆角 6                   |
| `--ui-content-code-padding`           | 12px                                                    | 代码块内边距                   |
| `--ui-content-list-indent`            | 1.25em                                                  | 列表缩进                       |
| `--ui-selection`                      | accent-15%                                              | 正文选区                       |

### 3.3 边界

- **不覆盖 Monaco 主题**：写作模式 CSS 仅作用于 Markdown 预览 `.md-typeset`，不写 `.monaco-editor` / `defineTheme`；57 套 Monaco 主题仍独立（`visual-p2-acceptance.test.ts` 守护）。
- **不影响其它风格**：workbench / glass 不声明纸感版式令牌，正文保持升级前默认版式。
- hybrid 双材质边界：外壳（菜单/工具窗/对话框/状态栏）走 workbench 材质，内容区（正文/预览）走 paper 材质与纸感版式。

## 4. T14 图标统一审计

### 4.1 扫描范围

| 对象                                           | 数量      | 方法                                                     |
| ---------------------------------------------- | --------- | -------------------------------------------------------- |
| `src/renderer/src/assets/icons/**/*.svg`       | 57 个文件 | 解析 viewBox / stroke-width / fill / currentColor / 尺寸 |
| 组件内联 `<svg>`（`components/**/*.{vue,ts}`） | 70 处     | 同上（首标签）                                           |

### 4.2 资产 SVG 结论

- **54 个 24 网格功能图标**：其中 **20 个 stroke 1.5（合规）**、**34 个 stroke 2（不合规）**；34 个均为同一「占位圆」文件（`MenuBar/menu-config.ts` 已注明菜单不使用图标，历史图标渲染实现已移除），属**未使用资产**，建议后续批次删除或归档，而非逐个改 stroke（已记录，不在本批重绘）。
- **3 个 512 网格品牌文件**：`logo-baize-dark-A-ultra.svg` / `logo-baize-light-A-large.svg` / `baize_mirror_dark.svg` —— 品牌/应用图标，**不适用 24 网格规范**，白名单例外（样式为渐变/多色，非 `currentColor` 线框）。
- 其余功能图标 `fill="none"` + `stroke="currentColor"`（20 个 stroke 1.5 文件）。

### 4.3 内联 SVG 结论

| 维度         | 分布                                                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------------- |
| viewBox      | 51 处 24 网格；4 处缺失 viewBox（历史装饰/特殊图形）；其余为 12/20/100/1024 网格（品牌插图/MDI/进度图形） |
| stroke-width | 1.5：合规；2：10 处（HemyTools 查看器工具栏，已修正）；其余为 fill 型（MDI）无 stroke                     |
| 尺寸         | 16 / 20 / 24 三档为主；个别 14（已修正为 16）、32 / 1.2em（品牌插图/行内图标）                            |
| currentColor | 功能图标使用 currentColor；品牌/多色插图固定色（白名单）                                                  |

### 4.4 本批修正

| 文件                          | 修正                                                        |
| ----------------------------- | ----------------------------------------------------------- |
| `HemyTools/ShowHtmlView.vue`  | 2 处 `stroke-width="2"` → `1.5`                             |
| `HemyTools/ShowPdfEditor.vue` | 8 处 `stroke-width="2"` → `1.5`；1 处关闭按钮 14×14 → 16×16 |

### 4.5 剩余清单（后续批次）

- 34 个占位圆资产（stroke 2，未被任何菜单引用）：建议删除/归档（需确认无动态引用）；
- 12 个 emoji 功能图标（`AdmonitionDialog` 类型选择器 📝💡⚠️⛔ℹ️📋✅🎉❓🐛📖💬）：需先设计/引入 admonition 类型 SVG 图标集，本批不重绘（`visual-p2-acceptance.test.ts` 锁定数量防扩散）；
- MDI fill 型图标库（`mdi-icons-*.ts`，24 网格 currentColor fill）：属图形库口径，与 stroke 型功能图标并存，需在规范中明确「fill 型库例外」；
- 其余内联装饰插图（100/1024 网格、渐变品牌图形）：非功能图标，不强制 24 网格。

## 5. T15 硬编码清理统计

### 5.1 口径（可复现）

- 扫描 `src/renderer/src/**/*.{vue,css,ts}`，去注释后统计 `#hex` 与 `rgb()/rgba()` 字面量；
- **白名单**（本身就是颜色真源或非主题数据，不得替换）：
    1. 令牌真源：`styles/theme.css`、`styles/ui-style.css`（含 UI-01 允许的阴影/遮罩 rgba）；
    2. vendored 固定主题：`styles/preview_font/atom-one-light.css`（代码高亮固定浅色）、`styles/material/**`（mkdocs-material 变量与扩展样式）；
    3. 参考数据：颜色选择器调色板（`FontSelectDialog`）、字符/符号/实体对照表（`information-tables/**`）、文件类型图标调色板（`resource-manager.ts`）等；
    4. 品牌资产：`assets/icons/**`（品牌多色 SVG）。
- 基线为 git `b2d846c`（P1 完成点）源码树同法扫描（`git archive` 临时导出，保证与当前同口径）。

### 5.2 前后对比（同口径）

| 指标               | 基线 `b2d846c` | 当前    | 变化               |
| ------------------ | -------------- | ------- | ------------------ |
| hex 字面量         | 816            | 670     | −146（−17.9%）     |
| rgb/rgba 字面量    | 128            | 105     | −23                |
| 合计               | **944**        | **775** | **−169（−17.9%）** |
| 白名单内           | 465            | 443     | −22                |
| **白名单外可治理** | **479**        | **332** | **−147（−30.7%）** |
| 可治理文件数       | 86             | 73      | −13                |

> 方案历史基线「802 处 / 80 文件」为上一轮人工统计（hex 计次口径）；本轮以 git 基线同法复扫的 944（hex+rgb）为准，避免口径漂移。

### 5.3 分批执行（≤100 处/批，每批跑相关测试）

| 批次   | 内容                                                                                                                                                                    | 处数    | 测试                                                                                                                                          |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 批次 1 | 删除「静态 CSS 真源变量（`--theme-*` / `--ui-*` / `--md-*`）的冗余颜色兜底」——变量由 `theme.css` / `ui-style.css` / `admonition.css` 静态声明，兜底永不生效，零视觉变化 | 100     | `ui-style-tokens` / `visual-style-b2` / `dialog-shell-style` / `command-palette-visual` / `dialog-tool-window` / `theme-contract`（126 用例） |
| 批次 2 | 同批次 1（剩余文件，含 material 扩展样式）                                                                                                                              | 54      | `visual-style-b2` / `workspace-component-layout` / `resource-manager` / `theme-contract`（77 用例）                                           |
| 批次 3 | 等值令牌映射：品牌渐变 → `var(--theme-title-bar-gradient)`（3 文件 5 处）、`#666 → var(--ui-text-secondary)`、`#764ba2 → var(--ui-accent)`                              | 7       | 相关组件测试 + 全量（见门禁）                                                                                                                 |
| 合计   | —                                                                                                                                                                       | **161** | —                                                                                                                                             |

### 5.4 剩余清单（332 处，未强制归零）

完整逐条清单（文件 + 行号 + 上下文 + 白名单标记）：
[`out/visual-1.5.5-p2/hardcoded-colors-inventory.json`](../../out/visual-1.5.5-p2/hardcoded-colors-inventory.json)（产物目录，不入库；可重复生成）。

按处置分类：

| 类别                          | 代表文件（处数）                                                                                    | 处置                                                                                   |
| ----------------------------- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 固定状态/徽标色板             | `MessageDialog`（17）、`UpdateLogDialog`（12）、`AdmonitionDialog`（15）、`dialog-buttons.css`（5） | 需先定义语义色板令牌（与 18 令牌状态色不同色阶），替换会改变观感 → 后续批次统一        |
| 预览代码高亮/骨架屏固定浅色   | `MarkdownPreviewComponent`（26）                                                                    | 与 `atom-one-light.css` 配套的预览兜底样式，属固定浅色代码主题；待代码主题化专项       |
| 欢迎页固定视觉 + 系统暗色适配 | `WelcomeScreen`（24）                                                                               | 品牌首屏 + `prefers-color-scheme` 固定灰阶；待设计确认是否完全主题化                   |
| 平台基础样式                  | `assets/base.css`（12）、`assets/main.css`（13）                                                    | Electron/Vite 模板基础变量与演示样式（非应用 UI），建议后续清理未使用样式              |
| 主题设置预览数据              | `theme-setting/model.ts`（11）、`useThemeSettingForm.ts`（6）、`ThemePreviewCard.vue`（5）          | 主题预览卡片的「示例色值」数据，属预览内容而非主题色                                   |
| 渲染错误提示固定色            | `hemy-editor-render.ts`（6）、`MarkdownPreviewComponent` 降级提示                                   | 预览内联 HTML 的警告色（固定浅色可读性优先），待统一为状态令牌                         |
| 插件工具固定色                | `PluginTools/**`（ULID/UUID/信息表等约 40）                                                         | 工具内容色（如成功绿/代码色），非 UI 主题色                                            |
| 插入模板内容色                | `common/templates/*`（约 15）                                                                       | mermaid/plantuml/写作模板中的示例配色（生成内容，不属 UI）                             |
| 未迁移历史别名兜底            | `WorkspaceLayoutDialog`（13）、`HemyTools/*`（10）等                                                | 变量无静态 `:root` 声明（如 `--bg-primary`），兜底保留；待统一改用 `--ui-*` 令牌后可删 |
| 其它零散                      | 约 150                                                                                              | 逐条见 inventory JSON                                                                  |

### 5.5 守护

- `tests/unit/visual-p2-acceptance.test.ts` 的「T15 硬编码清理不变量」：静态真源变量的颜色兜底不得回潮；
- `docs:check` 保证本清单路径可点击；
- 后续批次以 inventory JSON 为输入继续清理，每批对照「像素零变化」原则跑相关测试。

## 6. T16 验收矩阵

### 6.1 真实截图（Electron 真机，非合成）

- 运行：`E2E_VISUAL=1 npx playwright test e2e/visual-matrix.spec.ts`
- 归档：`out/visual-1.5.5-p2/real/`（不入库）；基线：`out/visual-1.5.5-p2/baseline/`；索引：`real/summary.json`

| 分组                                                                  | 张数                                                                                               | 覆盖                                       |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| 主窗口（浅色 baize）                                                  | 12                                                                                                 | 菜单栏 / 工作区 / 状态栏 × 4 风格 × 3 密度 |
| 主窗口（深色 baize-text）                                             | 4                                                                                                  | 4 风格 × 默认密度                          |
| 对话框（设置 → 主题设置）                                             | 6                                                                                                  | 4 风格 + 3 密度                            |
| 命令面板（编辑 → 命令面板）                                           | 6                                                                                                  | 4 风格 + 3 密度                            |
| 非模态工具窗（工具 → Markdown表格；E2E 不可达时回退 工具 → 特殊字体） | 6                                                                                                  | 4 风格 + 3 密度                            |
| glass 降级专项                                                        | 2                                                                                                  | 减少透明（不透明）/ 深色 steady 稳健模式   |
| **合计**                                                              | **36**（含 4 张深色；若表格编辑器 E2E 不可达则该组为替代工具窗，summary.json 的 `skips` 记录原因） | —                                          |

> 截图稳定性处理：截前禁用过渡/动画/光标闪烁、隐藏状态栏瞬时消息、鼠标归位至中性区域、示例文档固定路径（避免状态栏文件路径随临时 userData 变化）；同环境连续两次运行 **36/36 张与基线一致（0 diff）**（详见 §7）。

### 6.2 静态矩阵（jsdom 断言，覆盖全组合的**契约**而非像素）

`tests/unit/visual-p2-acceptance.test.ts`：

- 组合数：4 风格 × 2 代表主题 × 6 组件 = **48**；6 组件 × 3 密度 = **18**；4 风格 × 3 主题类别 = **12**；glass 专项 = **6**；合计 78（+6 = 84，见口径说明）；
- 4 风格 × 3 密度变量块完整（含 glass steady / reduced 两个降级块）；
- 28 主题 × 4 风格对比度扫描：正文 ≥ 4.5:1、次要文字 ≥ 3:1（**0 失败**）；
- focus-ring = accent 30%、selection = accent 15%（28 主题 × 2 项全通过，键盘走查可见性前提）。

### 6.3 与「78 张」的差距说明

| 项                                       | 状态                                                                               | 说明                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 48 张风格矩阵（6 组件 × 4 风格 × 浅/深） | 部分真实 + 全部静态契约                                                            | 真实截图覆盖主窗口/对话框/命令面板/工具窗；状态栏/空态/表格编辑器由组件单测 + 静态矩阵覆盖 |
| 18 张密度矩阵                            | 真实截图 6 张（主窗口/对话框/命令面板各 3 有效区域）+ 静态全量                     | 密度令牌为全局变量，跨区域同源                                                             |
| 12 张主题类别矩阵                        | 静态全量（28 主题对比度 + 令牌派生）+ 深色真实截图 4 张                            | 颜色由令牌派生，风格不改颜色                                                               |
| glass 降级 6 张                          | 真实截图 2 张（减少透明 / steady）+ 静态全量（steady/reduced/peferred-reduced 块） | 其余降级分支由 CSS 静态断言覆盖                                                            |

**证据限制（如实记录）**：E2E 打开文件后「表格编辑器」未弹窗（活动编辑器注册链路在 E2E 环境不可达），已用同类非模态工具窗（特殊字体）替代捕获同壳 4 风格 × 3 密度，并在 `summary.json.skips` 标注；表格编辑器令牌契约由 `table-style.test.ts` / `table-editor-dialog.test.ts` 覆盖。截图依赖系统字体/DPR，像素基线仅作软门禁。

## 7. T17 E2E 视觉软门禁

| 项          | 内容                                                                                                                                                                                                             |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 入口        | `e2e/visual-matrix.spec.ts`（默认 `test.skip`；`E2E_VISUAL=1` 触发）                                                                                                                                             |
| 基线        | 首次运行写入 `out/visual-1.5.5-p2/baseline/`；再次运行逐张 SHA-256 对比                                                                                                                                          |
| 软语义      | 不一致时写 Playwright annotation（`visual-warning`）+ `console.warn`，**不让用例失败**；仅启动失败/区域不可见/截图失败等硬错误失败                                                                               |
| 已验证      | 同环境连续两次运行：第二次 **36/36 张全部与基线一致（diff: 0）**（`summary.json`）；稳定性处理：禁用过渡/动画/光标闪烁、隐藏状态栏瞬时消息、鼠标归位、示例文档固定路径（避免状态栏文件路径随临时 userData 变化） |
| CI 接线建议 | 后续在 CI 增加独立「视觉矩阵（软门禁）」job（`continue-on-error: true` + `E2E_VISUAL=1`），并归档 `out/visual-1.5.5-p2/` artifact；本批未改 `ci.yml`，避免与发布链路冲突                                         |

## 8. 门禁与质量基线（2026-11-27 全量实测）

| 门禁                                                                                       | 结果      | 实测                                                                                                                       |
| ------------------------------------------------------------------------------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`（node / web / test / e2e 四段）                                        | ✅        | 四段均 0 错误                                                                                                              |
| `eslint . --max-warnings=0`                                                                | ✅        | 0 错误 / 0 警告                                                                                                            |
| `prettier --check .`                                                                       | ✅        | 全部匹配                                                                                                                   |
| `vitest run`（全量）                                                                       | ✅        | **364 文件 / 6,693 用例**（6,688 通过 / 5 跳过 / 0 失败），19.1s                                                           |
| `vitest run --coverage`                                                                    | ✅        | statements **93.08%** / branches **87.53%** / functions **93.79%** / lines **93.55%**（阈值 80/75/73/80）                  |
| `npm run docs:check`                                                                       | ✅        | 77 个 Markdown、986 链接（658 相对链接）全部有效                                                                           |
| `npm run build:unpack`                                                                     | ✅        | 主/预加载/渲染构建 + win-unpacked 打包成功                                                                                 |
| `node build/check-bundle-budget.js`                                                        | ✅        | 全部预算项通过：壳 654.7 KiB / 2 MiB、app.asar 39.46 / 47 MiB、NSIS 111.59 / 115 MiB、portable 100.98 / 101 MiB、locales 2 |
| `npm run verify:fuses`                                                                     | ✅        | 8 项 fuse 位与发布矩阵一致 + 硬化启动冒烟（appReady 207.3ms / windowCreate 239.1ms / rendererReady 1899ms）                |
| `node build/generate-quality-baseline.js --check --test-json=out/test-results/vitest.json` | ⚠️ 预期红 | 仅 3 项数字需回写（见下）；其余口径（IPC 通道/白名单/报告页数/版本）一致                                                   |
| E2E 视觉软门禁（`E2E_VISUAL=1 npx playwright test e2e/visual-matrix.spec.ts`）             | ✅ 软门禁 | 两次运行均通过；像素差异只告警不阻塞（详见 §7）                                                                            |

**质量基线精确变化（供维护者回写三份对外文档）**：

| 指标         | 文档现值 | 实测期望值                       |
| ------------ | -------- | -------------------------------- |
| 测试文件数   | 363      | **364**                          |
| 测试用例数   | 6,669    | **6,693**（6,688 通过 + 5 跳过） |
| 测试代码行数 | 119,541  | **120,079**                      |

> 变化来源：新增 `tests/unit/visual-p2-acceptance.test.ts`（1 文件 / 24 用例 / 504 行）+ 既有 `visual-style-b2.test.ts` 扩展（净增 34 行），测试代码合计净增 538 行。按约束本批**不修改** README / docs/wiki/README.md / docs/reports/README.md 的基线数字，由维护者统一回写。

## 9. 遗留与风险

| 项                                     | 风险                                               | 建议                                                                |
| -------------------------------------- | -------------------------------------------------- | ------------------------------------------------------------------- |
| z-index 应用层基座未迁移               | 新增高层浮层若继续写 9999/10000，会与兼容令牌竞争  | 后续统一迁移欢迎页/写作模式/缩放热区到 `UI_Z_INDEX_TOKENS` 相对阶梯 |
| 表格编辑器 E2E 不可达                  | 该区域真实截图缺失                                 | 后续 E2E 增加「活动编辑器注册」夹具或用 IPC 直开表格编辑器          |
| 剩余 332 处硬编码                      | 主题切换时局部不跟随（固定状态色板/预览/欢迎页等） | 按 §5.4 分类逐批处理，替换前确认观感                                |
| 34 个占位圆资产 / 12 个 emoji 功能图标 | 图标规范未完全统一                                 | 清理未使用资产；为 admonition 类型设计 SVG 图标集                   |
| 截图软门禁依赖环境                     | 不同机器字体/DPR 会产生 diff 告警                  | 保持软门禁 + 固定 CI 环境；不追求跨机器零差异                       |
| 方案 78 vs 84 口径                     | 文档数字歧义                                       | 以本记录 §6 分项统计为准，后续回写方案时统一口径                    |

## 10. 相关文件

- 规格：[DESIGN.md](./DESIGN.md) ｜ [COMPONENTS.md](./COMPONENTS.md) ｜ [MOTION.md](./MOTION.md)
- 方案与执行状态：[视觉升级方案-1.5.5.md](../wiki/04-优化与专项报告/视觉升级方案-1.5.5.md)（§9.8）
- 令牌真源：[`src/shared/theme-tokens.ts`](../../src/shared/theme-tokens.ts) ｜ [`src/shared/constants/ui-style.ts`](../../src/shared/constants/ui-style.ts) ｜ [`src/renderer/src/styles/ui-style.css`](../../src/renderer/src/styles/ui-style.css)
- 静态验收：[`tests/unit/visual-p2-acceptance.test.ts`](../../tests/unit/visual-p2-acceptance.test.ts) ｜ [`tests/unit/visual-style-b2.test.ts`](../../tests/unit/visual-style-b2.test.ts)
- 真实截图软门禁：[`e2e/visual-matrix.spec.ts`](../../e2e/visual-matrix.spec.ts)
- 清理清单（产物）：`out/visual-1.5.5-p2/hardcoded-colors-inventory.json`（不入库）
- 截图产物（不入库）：`out/visual-1.5.5-p2/real/` ｜ `out/visual-1.5.5-p2/baseline/`
