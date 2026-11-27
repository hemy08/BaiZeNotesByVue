# 动效规范（MOTION）

> 性质：界面动效的时长、缓动与降级规则（与 [设计令牌规范](DESIGN.md) 配套）
> 适用范围：`src/renderer/src/**` 全部界面组件、`src/renderer/src/styles/**`

## 1. 动效令牌表

真源：`src/shared/constants/ui-style.ts` 的 `UI_MOTION_TOKENS`；变量声明在 `src/renderer/src/styles/ui-style.css` 的 `:root`。

| 场景                                | 令牌                    | 时长  | 缓动                                                 |
| ----------------------------------- | ----------------------- | ----- | ---------------------------------------------------- |
| 状态反馈（hover / active / toggle） | `--ui-duration-fast`    | 120ms | `--ui-ease-standard`（`cubic-bezier(0.2, 0, 0, 1)`） |
| 弹出 / 收起（下拉、工具窗）         | `--ui-duration-pop`     | 180ms | `--ui-ease-standard`                                 |
| 对话框进出                          | `--ui-duration-dialog`  | 240ms | `--ui-ease-standard`                                 |
| 遮罩淡入                            | `--ui-duration-overlay` | 200ms | `--ui-ease-standard`                                 |
| 页面 / 模式切换                     | `--ui-duration-page`    | 300ms | `--ui-ease-page`（`cubic-bezier(0.4, 0, 0.2, 1)`）   |

补充约定：

- 所有交互过渡必须引用上表变量，禁止在组件里写裸时长/裸缓动。
- 只动画合成属性（`transform` / `opacity` / `background-color` / `color` / `border-color` / `box-shadow`），禁止动画 `width` / `height` / `top` / `left`。
- 禁止使用 `transition: all`：只会放大无关属性变更，且难以排查性能问题。
- 状态反馈只做「颜色 / 阴影 / 位移 1~2px」，不做缩放弹跳。

## 2. 分场景动效要求

| 场景             | 必须                                                  | 禁止                            |
| ---------------- | ----------------------------------------------------- | ------------------------------- |
| 悬停             | 背景或边框颜色在 120ms 内过渡；可叠加 `--ui-shadow-1` | 位移超过 2px、缩放              |
| 键盘焦点         | 用 `--ui-focus-shadow` 显示焦点环，保留过渡           | 移除 outline 后不给替代焦点样式 |
| 下拉 / 菜单      | 淡入 + 位移 4px，180ms                                | 从 0 高度展开、动画 `height`    |
| 非模态工具窗     | 打开淡入 + 4px 位移，180ms；关闭反向                  | 大面积缩放、整窗模糊过渡        |
| 对话框           | 主体 240ms 进出、遮罩 200ms 淡入                      | 超过 300ms 的慢动画             |
| 页面 / 模式切换  | 300ms 淡入淡出或位移                                  | 交叉飞入飞出、超过 600ms        |
| Toast / 状态提示 | 淡入 + 4px 位移，180ms                                | 长时间循环动画                  |

## 3. 减少动效（prefers-reduced-motion）

系统开启「减少动效」时（`@media (prefers-reduced-motion: reduce)`）：

| 令牌                    | 降级值                                  |
| ----------------------- | --------------------------------------- |
| `--ui-duration-fast`    | 0ms                                     |
| `--ui-duration-pop`     | 0ms                                     |
| `--ui-duration-dialog`  | 0ms                                     |
| `--ui-duration-page`    | 0ms                                     |
| `--ui-duration-overlay` | 100ms（保留一次淡入，避免内容突兀出现） |

- 降级必须保留状态可见性：不能因为动画归零就丢失 hover / focus / 选中反馈。
- 不引入 JS 侧动画开关；统一由 CSS 媒体查询降级，组件只消费变量。

## 4. 反例对照

| 反例                                                       | 问题                           | 正确写法                                                                        |
| ---------------------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- |
| `transition: all 0.2s ease;`                               | `all` 放大无关属性、节奏不一致 | `transition: background-color var(--ui-duration-fast) var(--ui-ease-standard);` |
| `transition: width 0.3s;`                                  | 触发 layout 抖动               | 用 `transform` / 内容过渡替代                                                   |
| `animation: bounce 1s infinite;`                           | 循环动画干扰阅读               | 仅短促一次反馈                                                                  |
| 手写 `cubic-bezier(0.25, 0.1, 0.25, 1)`                    | 与全局节奏漂移                 | `var(--ui-ease-standard)`                                                       |
| `@media (prefers-reduced-motion)` 中直接 `animation: none` | 丢失必要状态反馈               | 只把时长降级为 0/100ms，保留最终状态                                            |

## 5. 验收与守护

- 令牌完整性：`tests/unit/ui-style-tokens.test.ts`（动效令牌表与 CSS `:root` 逐项一致、reduced-motion 降级存在）。
- 组件批次验收：动效相关改动需在 4 风格 × 3 密度下走查「悬停 / 焦点 / 打开关闭」，并验证减少动效降级。

## 6. 相关文件

- 动效常量：[`src/shared/constants/ui-style.ts`](../../src/shared/constants/ui-style.ts)
- 动效变量表：[`src/renderer/src/styles/ui-style.css`](../../src/renderer/src/styles/ui-style.css)
