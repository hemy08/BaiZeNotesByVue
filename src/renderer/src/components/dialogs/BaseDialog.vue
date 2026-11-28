<template>
    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
        <Transition name="dialog-fade">
            <div
                v-if="visible"
                class="dialog-overlay"
                :class="`dialog-anim--${animation}`"
                :style="overlayStyles"
                @click.self="handleOverlayClick"
            >
                <Transition name="dialog-scale">
                    <div
                        v-if="visible"
                        ref="containerRef"
                        class="dialog-container"
                        :class="containerClassList"
                        :style="containerStyles"
                        role="dialog"
                        :aria-modal="isModal ? 'true' : 'false'"
                        :aria-labelledby="ariaLabelledby"
                        :aria-label="ariaLabelValue"
                        :aria-describedby="ariaDescribedbyValue"
                        :data-dialog-shell="isNonModal ? 'tool-window' : 'dialog'"
                        :data-dialog-size="props.widthSize || undefined"
                        :data-tool-window-state="toolWindowStateAttr"
                        tabindex="-1"
                        @mousedown="handleContainerMouseDown"
                    >
                        <!--
                            前置插槽：位于标题栏之前的装饰层（C-3/C-4 组 ThemeSettingDialog 的 8 个
                            resize-handle 依赖此位置）；未提供插槽时不产生任何额外 DOM。
                        -->
                        <slot name="prepend"></slot>

                        <div class="title-bar" :class="titleBarClassList" :style="titleBarStyle">
                            <!--
                                T6 工具窗拖拽把手：仅非模态工具窗渲染（模态对话框标题栏即拖拽区，
                                无需额外纹理）。6 点纹理由 CSS 绘制，aria-hidden 不进无障碍树；
                                把手位于标题栏内部，按下后由 useDialogDrag 统一接管拖拽（含边界）。
                            -->
                            <span
                                v-if="isNonModal"
                                class="tool-window-drag-handle"
                                aria-hidden="true"
                            ></span>
                            <slot name="title">
                                <span :id="titleId" class="title-text" :style="titleTextStyle">
                                    {{ title }}
                                </span>
                            </slot>
                            <!--
                                用户反馈 2026-11-27：非模态工具窗右上角 [最小化][最大化/还原][关闭]。
                                - 最小化：容器收为「仅标题栏」（正文/footer/prepend 隐藏，按钮保留可还原）；
                                - 最大化：容器宽高撑满主窗口可用区域（containerStyles 末位覆盖定位，
                                  再次点击恢复原尺寸与拖拽位置）；
                                - 两者互斥，由同一个 toolWindowState 状态机保证；模态对话框不渲染。
                                图标为内联 SVG（24 网格 / stroke 1.5 / currentColor），按钮尺寸与关闭按钮
                                一致（28×28）、悬停 --ui-accent-soft、键盘焦点环 --ui-focus-shadow。
                                按钮在标题栏右侧顺序：最小化 → 最大化 → 关闭。
                            -->
                            <div v-if="isNonModal" class="tool-window-controls">
                                <button
                                    class="tool-window-control-btn"
                                    type="button"
                                    :aria-label="minimizeButtonLabel"
                                    :title="minimizeButtonLabel"
                                    @mousedown.stop
                                    @click.stop="toggleMinimize"
                                >
                                    <svg
                                        class="tool-window-control-icon"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="1.5"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        aria-hidden="true"
                                        focusable="false"
                                    >
                                        <!-- 最小化：横线；已最小化：双框「还原」 -->
                                        <path v-if="toolWindowState !== 'minimized'" d="M5 12h14" />
                                        <template v-else>
                                            <path d="M4 8h12v12H4z" />
                                            <path d="M8 8V4h12v12h-4" />
                                        </template>
                                    </svg>
                                </button>
                                <button
                                    class="tool-window-control-btn"
                                    type="button"
                                    :aria-label="maximizeButtonLabel"
                                    :title="maximizeButtonLabel"
                                    @mousedown.stop
                                    @click.stop="toggleMaximize"
                                >
                                    <svg
                                        class="tool-window-control-icon"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="1.5"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        aria-hidden="true"
                                        focusable="false"
                                    >
                                        <!-- 最大化：四角展开；已最大化：四角内缩「还原」 -->
                                        <path
                                            v-if="toolWindowState !== 'maximized'"
                                            d="M4 9V4h5M20 15v5h-5M4 15v5h5M20 9V4h-5"
                                        />
                                        <path v-else d="M9 4v5H4M15 20v-5h5M9 20v-5H4M15 4v5h5" />
                                    </svg>
                                </button>
                            </div>
                            <button
                                class="close-btn"
                                :class="`close-btn--${closeButtonVariant}`"
                                :style="closeButtonStyle"
                                type="button"
                                :aria-label="closeButtonLabel"
                                @click.stop="handleClose"
                            >
                                ×
                            </button>
                        </div>

                        <!--
                            T6 内容内边距（T12 提供可选包裹层，默认关闭）：
                            默认插槽不包 DOM，保持 25 个已迁移对话框「prepend → title-bar →
                            正文 → footer」的直接子节点契约（ThemeSettingDialog 的 c4 契约）；
                            传 contentPadding 时才包裹 `.dialog-body`（padding 消费 --ui-pad），
                            供后续批次在正文自身没有内边距的工具窗上逐步启用。
                        -->
                        <div v-if="contentPadding" class="dialog-body">
                            <slot></slot>
                        </div>
                        <slot v-else></slot>

                        <div
                            v-if="hasFooter"
                            class="footer"
                            :class="`footer--${footerAlign}`"
                            :style="footerStyle"
                        >
                            <slot name="footer"></slot>
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
/**
 * BaseDialog —— 渲染层对话框 / 非模态工具窗统一外壳（第 3 批组件化子任务 C，保守抽层）
 *
 * 抽层目标：18 个对话框各自复制了 `.dialog-overlay` / `.dialog-container` / `.title-bar` /
 * `.title-text` / `.close-btn` / `dialog-fade-*` / `dialog-scale-*` 结构与 CSS，
 * 且已出现标题栏高度 11 种、关闭按钮 5 种、动画 18 份的变体分叉。本组件只承载
 * **所有对话框共有的外壳骨架 + 默认样式 + 可覆盖钩子**，不强行统一全部变体：
 *
 * - 默认变体（`titleBarVariant="compact"` + `animation="quick"` + `closeButtonVariant="circle"`）
 *   与 simple 对话框（CreateFileFolderDialog / WebUrlDialog）迁移前的 scoped 外壳 CSS 逐属性一致；
 * - 其余当前存在的壳风格以「变体 + 内联样式覆盖」两档能力保留：
 *   - 标题栏高度/字号：compact / regular / large 统一消费视觉升级密度令牌
 *     `--ui-titlebar-height`（36/40/44）与 `--ui-font-size + 2px`（15 默认），
 *     plain（无固定高度，透明背景）保持迁移前形态；
 *   - 关闭按钮：circle(28px 圆形) / rounded(32px 圆角)；
 *   - 底部对齐：start / center / end；
 *   - 动画：quick / smooth（时长/缓动消费 `--ui-duration-*` / `--ui-ease-*` 动效令牌）；
 *   - 任何未覆盖到的细节（padding/阴影/背景/宽度/标题文字/关闭按钮等）通过 `overlayStyle` /
 *     `containerStyle` / `titleBarStyle` / `footerStyle` / `titleTextStyle` / `closeButtonStyle`
 *     内联覆盖（内联样式优先级最高，与迁移前各对话框把特殊值写在模板 `:style` 上的行为一致）。
 *
 * 插槽（共 4 个，全部可选，不提供时不产生额外 DOM）：
 * - `prepend`：`.dialog-container` 内、`.title-bar` 之前的装饰层，供 C-3/C-4 组使用
 *   （ThemeSettingDialog 的 8 个 resize-handle）。容器本身由 useDialogDrag 的内联
 *   `position: fixed` 定位（见 containerStyles），可直接作为 prepend 内绝对定位装饰的
 *   定位基准，调用方无需再传 containerStyle；
 * - `title`：完全替换默认标题节点（默认渲染 `<span class="title-text">{{ title }}</span>`）；
 * - 默认插槽：对话框正文；
 * - `footer`：底部操作区，未提供时整条底栏不渲染（保持 MathTextDialog 等无 footer 现状）。
 *
 * C-3/C-4 组扩展的细粒度覆盖钩子：
 * - `titleTextStyle`：标题文字内联样式（letter-spacing / font-size / font-weight 等现状差异）；
 * - `closeButtonStyle`：关闭按钮内联样式（18px 图标、Electron app-region no-drag 等现状差异）；
 * - 样式类型 `DialogStyleProperties` 在 Vue CSSProperties 基础上补充 Electron 专有的
 *   `WebkitAppRegion`（csstype 未收录），使 help 对话框标题栏 drag / 关闭按钮 no-drag 可内联覆盖。
 * - 「标题栏仅关闭按钮」场景（HelpAboutDialog）无需新增 prop：不传 `title` / title 插槽即可，
 *   再用 `titleBarStyle` 覆盖 `justifyContent: 'flex-end'`、`padding: '0 10px'`、
 *   `WebkitAppRegion: 'drag'`（关闭按钮用 `closeButtonStyle` 传 `WebkitAppRegion: 'no-drag'`），
 *   与迁移前 flex-end/padding 0 10/app-region 的标题栏等价；其余 14 个待迁移对话框标题栏
 *   均为「标题文字 + 关闭按钮」标准结构，同样无需新 prop。
 *
 * ## 视觉升级 1.5.5（P1-B1：T9 对话框 + T6 非模态工具窗）
 * 外壳改为**只消费令牌**，四风格（paper/glass/workbench/hybrid）与三密度
 * （compact/default/spacious）差异全部来自根元素 `data-style` / `data-density` 下的
 * `--ui-*` 变量，组件内**不写任何风格/密度分支**（DESIGN.md §6）：
 * - T9 对话框：宽度语义阶梯 `widthSize`（360/520/720/960/全宽，`width` 优先以兼容既有
 *   调用点）、标题栏 `--ui-titlebar-height` + 标题 15/600、圆角 `--ui-radius-lg`、
 *   阴影 `--ui-shadow-3`、遮罩浅色 `rgba(0,0,0,.32)` / 深色 `rgba(0,0,0,.48)`、
 *   底栏按钮高 `--ui-control-height`（按钮视觉真源仍为 `assets/dialog-buttons.css`）；
 * - T6 工具窗：`data-dialog-shell="tool-window"` 统一壳——标题栏 `--ui-titlebar-height`
 *   + 6 点拖拽把手、面 `--ui-surface` × `--ui-surface-opacity` + glass 小面积
 *   `--ui-surface-blur`、hairline 边框、`--ui-shadow-2`、打开聚焦内容首个交互元素、
 *   Esc 只关最顶层（焦点在工具窗内时）、不锁 body 滚动、外部点击不关闭（保持 1.5.3）。
 *   说明：用户反馈 2026-11-27 起，非模态工具窗标题栏提供「最小化 / 最大化 / 还原」三个
 *   控制按钮（状态机 `normal | minimized | maximized`，见下方 toolWindowState）；模态
 *   对话框不渲染这两个按钮。「内容内边距 --ui-pad」由可选 `contentPadding` 包裹层提供
 *   （T12 落地、默认关闭，不改变既有 25 个对话框的 DOM 子节点契约），后续批次在正文自身
 *   无内边距的工具窗上逐个启用。
 *
 * 行为与迁移前单个对话框的外壳保持一致：
 * 1. `<Teleport to="body">` 默认开启，可用 `teleport` 关闭 / 指定目标（测试用 teleport stub）；
 * 2. 遮罩空白处点击（`@click.self`）触发 `close`，可用 `closeOnOverlay` 关闭该行为；
 *    非模态工具窗的遮罩透明且点击穿透（`pointer-events: none`），外部点击不关闭；
 * 3. 关闭按钮点击触发 `close`（`.stop` 阻止冒泡到遮罩）；
 * 4. 按标题栏拖拽移动对话框（`draggable`，复用 useDialogDrag；关闭按钮/正文不触发拖拽）；
 * 5. `resetPositionOnOpen` 为 true 时每次打开重置到初始居中位置（默认沿用上次拖拽位置）；
 * 6. 可访问性（P2 新增，纯增量，不改变视觉与既有交互）：容器 `role="dialog"` +
 *    `:aria-modal="modal ? 'true' : 'false'"` + 标题关联（默认标题用 aria-labelledby；无标题场景可传 `ariaLabel`）、
 *    可选描述关联（`ariaDescribedby`，如消息框正文/确认文案）、关闭按钮 aria-label；
 *    打开时聚焦容器、关闭时归还打开前焦点；Esc 关闭；Tab / Shift+Tab 在对话框内循环
 *    （焦点陷阱，跳过 disabled / hidden / inert / aria-hidden / iframe / tabindex=-1）；
 *    打开期间锁定 body 滚动，最后一个对话框关闭后恢复（模块级引用计数，嵌套对话框安全）。
 *    多个对话框同时打开时只有顶层响应 Esc/Tab（模块级栈），避免一次按键同时关闭多层。
 *    **非模态工具窗扩展**：打开时聚焦内容首个可交互元素（优先输入控件）；不锁 body 滚动
 *    （与编辑器滚动互不干扰）；Esc 仅在焦点位于工具窗内时关闭（焦点在编辑器时交还编辑器）；
 *    关闭时若用户已把焦点移到编辑器则不抢回。
 * 7. 非模态工具窗标题栏控制（用户反馈 2026-11-27，纯增量，模态对话框零变化）：
 *    最小化 ↔ 还原（仅标题栏 40px，正文/footer/prepend 隐藏）、最大化 ↔ 还原
 *    （100vw/100vh − 32px、四周 16px 留白），最大/最小互斥；最大化时从标题栏开始拖拽
 *    会先把状态复位 normal（避免视口覆盖样式与拖拽定位冲突），恢复后回到原拖拽位置。
 *    按钮顺序 [最小化][最大化][关闭]，均有 aria-label/title，可 Tab 聚焦并显示焦点环。
 *
 * 说明：本组件样式使用 scoped 而非全局 `styles/dialog.css`——避免非 scoped 外壳类
 * （`.dialog-overlay` 等）在 15 个尚未迁移的对话框上产生全局样式泄漏，符合本任务
 * 「迁移前后视觉一致」的保守策略；等全部对话框迁移完成后再评估是否收敛为全局共享 CSS。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId, useSlots, watch } from 'vue'
import type { ClassValue, CSSProperties } from 'vue'
import { t } from '../../common/i18n'
import { useDialogDrag } from '../../composables/useDialogDrag'
import { useFeatureFlags } from '../../composables/useFeatureFlags'
import { useTheme } from '../../composables/useTheme'
import { isDarkColor } from '../../../../shared/theme-tokens'
import {
    TOOL_WINDOW_PREFERRED_FOCUS_SELECTOR,
    resolveDialogOverlayColor,
    resolveDialogWidth
} from './dialog-metrics'
import type { DialogWidthSize } from './dialog-metrics'
import { isTopmostDialog, pushOpenDialog, removeOpenDialog } from './dialog-stack'
import { lockDialogScroll, unlockDialogScroll } from './dialog-scroll-lock'

/**
 * 对话框内联样式类型：Vue `CSSProperties` 的超集（仅补充 Electron 专有属性）。
 *
 * 背景：`CSSProperties` 由 csstype 生成，未收录 Electron 的 `-webkit-app-region`。
 * C-3/C-4 组的 help 对话框（HelpAboutDialog / HelpContactUsDialog / TechStackDialog /
 * QuickLinkSettingDialog）现状依赖「标题栏 drag + 关闭按钮 no-drag」，迁移时需要经
 * `titleBarStyle` / `closeButtonStyle` 内联覆盖；直接写 `WebkitAppRegion` 会触发 TS
 * 多余属性检查错误，故以「继承 + 单个可选属性」扩展，不引入 any、不改动全局类型。
 * Vue 运行时会对该键做 autoPrefix 并写入 CSSStyleDeclaration（Electron 生效，
 * jsdom/普通浏览器安全忽略），与迁移前写在外壳 CSS 里的 `-webkit-app-region` 等价。
 */
interface DialogStyleProperties extends CSSProperties {
    /** Electron 无边框窗口拖拽区域（对应 CSS `-webkit-app-region`），其他环境忽略 */
    WebkitAppRegion?: 'drag' | 'no-drag'
}

/** 标题栏视觉变体（取值来自 18 个对话框现状归类，未强行统一结构） */
type TitleBarVariant = 'compact' | 'regular' | 'large' | 'plain'
/** 关闭按钮视觉变体（现状两大派系） */
type CloseButtonVariant = 'circle' | 'rounded'
/** 底部插槽对齐方式 */
type FooterAlign = 'start' | 'center' | 'end'
/** 过渡动画预设：quick=标准节奏；smooth=0.3s 缩放 + 透明度（MessageDialog 迁移前动画） */
type DialogAnimation = 'quick' | 'smooth'

interface Props {
    /** 显隐开关（真源在父组件，本组件只读不写，避免破坏单例对话框状态机） */
    visible: boolean
    /** 标题文本；需要自定义标题结构（如图标/多行）时使用 title 插槽覆盖 */
    title?: string
    /** Teleport 目标：默认 true=body；false=不传送；字符串=自定义 CSS 选择器 */
    teleport?: boolean | string
    /** 对话框宽度（覆盖默认壳 500px；留空则使用默认壳宽度）——兼容既有调用点，优先于 widthSize */
    width?: string
    /**
     * 语义化宽度阶梯（T9）：confirm 360 / form 520 / medium 720 / complex 960 / full 全宽。
     * `width` 传值时优先（保证既有 25 个对话框迁移语义不变）。
     */
    widthSize?: DialogWidthSize
    /** 标题栏视觉变体，默认 compact（simple 对话框迁移前的 32px 标准壳） */
    titleBarVariant?: TitleBarVariant
    /** 关闭按钮视觉变体，默认 circle（simple 对话框迁移前的 28px 圆形按钮） */
    closeButtonVariant?: CloseButtonVariant
    /** 底部插槽对齐方式，默认 end（右对齐） */
    footerAlign?: FooterAlign
    /** 过渡动画预设，默认 quick（simple 对话框迁移前的 0.2s 动画） */
    animation?: DialogAnimation
    /** 是否允许按住标题栏拖拽移动，默认 true */
    draggable?: boolean
    /** 每次打开时是否重置拖拽位置，默认 false（沿用上次拖拽位置，与迁移前行为一致） */
    resetPositionOnOpen?: boolean
    /** 点击遮罩空白处是否触发 close，默认 true */
    closeOnOverlay?: boolean
    /** 是否允许 Esc 关闭（默认 true；非模态工具窗可关闭） */
    closeOnEscape?: boolean
    /** 是否为模态对话框：false 时不启用焦点陷阱、aria-modal=false（默认 true） */
    modal?: boolean
    /** 强制非模态工具窗：遮罩透明且点击穿透，禁止遮罩关闭（默认 false） */
    nonModal?: boolean
    /** 工具窗：受系统设置「非模态工具对话框」开关控制（默认 false） */
    toolWindow?: boolean
    /** 容器附加 class（如 MessageDialog 需要 `${type}-dialog` 供外部/测试识别消息类型） */
    containerClass?: ClassValue
    /** 遮罩内联样式覆盖（MessageDialog 迁移前遮罩为更深的 rgba(0,0,0,0.5)） */
    overlayStyle?: DialogStyleProperties
    /** 容器内联样式覆盖（背景/阴影/自适应宽度/绝对定位基准等现状差异） */
    containerStyle?: DialogStyleProperties
    /**
     * 是否给默认插槽包一层 `.dialog-body`（padding 消费 `--ui-pad`，T6「内容内边距」）。
     * 默认 false：25 个已迁移对话框的正文根节点自带内边距，且 ThemeSettingDialog 依赖
     * 「prepend → title-bar → 正文 → footer」直接子节点顺序（c4 契约）；后续批次可在正文
     * 自身没有内边距的工具窗上逐个启用，避免本批产生像素变化。
     */
    contentPadding?: boolean
    /** 标题栏内联样式覆盖（MessageDialog 动态渐变背景；help 对话框 flex-end/padding/app-region drag） */
    titleBarStyle?: DialogStyleProperties
    /** 标题文字内联样式覆盖（字距/字号/字重等现状差异；使用 title 插槽时由插槽内容自行控制） */
    titleTextStyle?: DialogStyleProperties
    /** 关闭按钮内联样式覆盖（18px 图标、Electron app-region no-drag 等现状差异） */
    closeButtonStyle?: DialogStyleProperties
    /** 底部内联样式覆盖（预留：后续批次迁移中等/复杂对话框时覆盖 padding/gap 差异） */
    footerStyle?: DialogStyleProperties
    /**
     * 无可见标题时的可访问名称（HelpAboutDialog 这类「仅关闭按钮」标题栏场景）。
     * 有默认标题文字时忽略（优先 aria-labelledby 指向标题节点）。
     */
    ariaLabel?: string
    /**
     * 可选的描述内容节点 id（写入容器 aria-describedby）：适合放简短的补充说明
     * （如消息框正文、删除确认文案），不替代 aria-labelledby 的标题命名。
     * 调用方用 `useId()` 生成 id 并落在描述节点上，避免多个对话框/嵌套对话框 id 冲突。
     */
    ariaDescribedby?: string
}

const props = withDefaults(defineProps<Props>(), {
    title: '',
    teleport: true,
    width: '',
    widthSize: undefined,
    titleBarVariant: 'compact',
    closeButtonVariant: 'circle',
    footerAlign: 'end',
    animation: 'quick',
    draggable: true,
    resetPositionOnOpen: false,
    closeOnOverlay: true,
    closeOnEscape: true,
    modal: true,
    nonModal: false,
    contentPadding: false
})

const { flags } = useFeatureFlags()

const emit = defineEmits<{
    (e: 'close'): void
}>()

const slots = useSlots()

// 底部只在调用方提供 footer 插槽时渲染：MathTextDialog / MdSheetDialog 等迁移前无 footer，
// 不能凭空多出一条带边框的空白底栏（后续批次迁移时必须保持该结构差异）。
const hasFooter = computed(() => Boolean(slots.footer))

/** 是否实际启用非模态：显式 non-modal 或工具窗开关打开（两处入口语义等价） */
const isNonModal = computed(
    () => props.nonModal || (props.toolWindow && flags.nonModalDialogs === true)
)
/** 是否为真正的模态外壳：模态 prop 且未启用非模态（决定焦点陷阱/aria-modal/滚动锁） */
const isModal = computed(() => props.modal && !isNonModal.value)

// ==================== 非模态工具窗：最小化 / 最大化 / 还原（用户反馈 2026-11-27） ====================
/**
 * 工具窗标题栏控制状态机（三者互斥，状态内聚在 BaseDialog）。
 *
 * - `normal`：默认尺寸与位置（拖拽位置由 useDialogDrag 的 dialogStyle 保持）；
 * - `minimized`：容器收为「仅标题栏」，高度 = `--ui-titlebar-height`，正文/footer/prepend
 *   隐藏（`display: none` 同时移出 Tab 次序与无障碍树），标题栏与三个按钮保留；
 * - `maximized`：宽高撑满主窗口可用区域（`100vw/100vh - 32px`，四周 16px 留白），
 *   通过 containerStyles **末位**覆盖调用方 containerStyle（TableEditor/Mermaid 的
 *   resize 尺寸等），恢复时移除覆盖即回到 dialogStyle 的原位置。
 *
 * 生命周期：工具窗每次打开由父组件 v-if 重新挂载（状态自然重置）；额外监听
 * `visible` / `isNonModal` 做兜底复位，避免 v-show 复用或系统开关关闭后残留覆盖样式。
 */
type ToolWindowState = 'normal' | 'maximized' | 'minimized'
const toolWindowState = ref<ToolWindowState>('normal')

/** 最小化按钮文案：正常/最大化时「最小化」，已最小化时「还原」 */
const minimizeButtonLabel = computed(() =>
    toolWindowState.value === 'minimized'
        ? t('dialogMain.toolWindow.restore')
        : t('dialogMain.toolWindow.minimize')
)
/** 最大化按钮文案：正常/最小化时「最大化」，已最大化时「还原」 */
const maximizeButtonLabel = computed(() =>
    toolWindowState.value === 'maximized'
        ? t('dialogMain.toolWindow.restore')
        : t('dialogMain.toolWindow.maximize')
)

/** 状态数据属性：仅非模态工具窗输出，便于 E2E/外部样式观察（模态对话框不受影响） */
const toolWindowStateAttr = computed(() => (isNonModal.value ? toolWindowState.value : undefined))

function toggleMinimize(): void {
    toolWindowState.value = toolWindowState.value === 'minimized' ? 'normal' : 'minimized'
}

function toggleMaximize(): void {
    toolWindowState.value = toolWindowState.value === 'maximized' ? 'normal' : 'maximized'
}

/** 运行中关闭「非模态工具对话框」开关：复位状态，避免按钮消失后容器仍被覆盖样式撑满 */
watch(isNonModal, (nonModal) => {
    if (!nonModal) toolWindowState.value = 'normal'
})

/** 每次打开复位（正常工具窗由父组件 v-if 重新挂载；此处兜底 v-show 复用场景） */
watch(
    () => props.visible,
    (isVisible) => {
        if (isVisible) toolWindowState.value = 'normal'
    }
)

// ==================== 可访问性（a11y）契约 ====================
// 1) role="dialog" + aria-modal + 标题关联（aria-labelledby / aria-label）+ 可选描述关联
//    （aria-describedby，由调用方传描述节点 id）；
// 2) 打开后把焦点移入对话框，关闭后归还到打开前焦点元素；
// 3) Esc 关闭（仅最顶层对话框响应，避免嵌套对话框被一次 Esc 全部关闭）；
// 4) Tab / Shift+Tab 在对话框内循环（焦点陷阱），跳过不可 Tab 到达的元素，无可见焦点
//    元素时回到容器；
// 5) 关闭按钮补 aria-label（图标 × 对读屏无意义）；
// 6) 打开期间锁定 body 滚动，最后一个对话框关闭后恢复（模块级引用计数，嵌套安全）；
//    非模态工具窗锁定语义不适用（会阻塞编辑器滚动），见 registerOpen。
// 样式/结构不变，仅新增语义属性与键盘行为；jsdom 下均可测试。

const containerRef = ref<HTMLElement | null>(null)
const titleId = useId()
const hasTitleSlot = computed(() => Boolean(slots.title))
const hasTitleText = computed(() => !hasTitleSlot.value && Boolean(props.title.trim()))
const ariaLabelledby = computed(() => (hasTitleText.value ? titleId : undefined))
const ariaLabelValue = computed(() =>
    hasTitleText.value
        ? undefined
        : props.ariaLabel || (hasTitleSlot.value ? props.title : undefined)
)
const ariaDescribedbyValue = computed(() => props.ariaDescribedby || undefined)
const closeButtonLabel = computed(() => t('common.close'))

/** 焦点陷阱候选选择器（覆盖对话框内常见可聚焦元素） */
const FOCUSABLE_SELECTOR = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
    '[contenteditable="true"]'
].join(',')

/**
 * 内嵌文档/插件标签：父文档无法接管其内部焦点（iframe 的 Tab 只会在子文档内循环，
 * 且 jsdom/浏览器都无法从父文档把焦点送进去），因此从焦点陷阱候选中排除，
 * 避免 Tab 循环把焦点“丢”进 iframe 后 Esc/其余按键全部失效。
 */
const NON_FOCUSABLE_TAGS = new Set(['IFRAME', 'OBJECT', 'EMBED'])

/**
 * 顶层对话框栈：多个 BaseDialog 同时可见时（如设置对话框上再弹确认框），
 * 只有最后打开的对话框响应 Esc/Tab，避免一次按键同时关闭多层。
 * 栈状态放在独立模块（dialog-stack.ts）——`<script setup>` 顶层变量是实例级作用域，
 * 若放在本文件会导致每个实例各持一份栈、全部自认为顶层。
 */
const dialogToken = Symbol('baize-dialog')
let registered = false
/** 本实例是否真正对 body 滚动加过锁（非模态工具窗不加锁，关闭时也不能错误解锁） */
let scrollLocked = false
let restoreFocusTarget: HTMLElement | null = null

function registerOpen(): void {
    if (registered) return
    registered = true
    // 模态对话框先锁 body 滚动再登记栈：模态打开期间背景不应可滚动。
    // 非模态工具窗（T6）不锁滚动：用户需要继续滚动/编辑背后的编辑器。
    if (!isNonModal.value) {
        lockDialogScroll()
        scrollLocked = true
    }
    pushOpenDialog(dialogToken)
    const active = document.activeElement
    // body/html 作为焦点目标无意义，不记录（关闭后不强行聚焦 body）
    restoreFocusTarget = active instanceof HTMLElement && active !== document.body ? active : null
}

function unregister(): void {
    if (!registered) return
    registered = false
    removeOpenDialog(dialogToken)
    // 引用计数归零（最后一个模态对话框关闭）时才恢复 body 滚动
    if (scrollLocked) {
        unlockDialogScroll()
        scrollLocked = false
    }
}

// 运行中「非模态工具对话框」开关切换时同步 body 滚动锁（打开期间即时生效，与 1.5.3 开关语义一致）
watch(isNonModal, (nonModal) => {
    if (!registered) return
    if (nonModal && scrollLocked) {
        unlockDialogScroll()
        scrollLocked = false
    } else if (!nonModal && !scrollLocked) {
        lockDialogScroll()
        scrollLocked = true
    }
})

function isTopmost(): boolean {
    return isTopmostDialog(dialogToken)
}

/**
 * 判断元素是否真正可 Tab 到达（焦点陷阱候选）：
 * - 原生禁用控件 / `fieldset[disabled]` 后代跳过；
 * - iframe/object/embed 跳过（父文档无法接管内嵌文档焦点，Tab 进去后 Esc 失效）；
 * - `tabindex` 为负的元素可脚本聚焦但不在 Tab 次序内（含 button/a 显式 tabindex="-1"）跳过；
 * - 自身或祖先 `hidden` / `inert` / `aria-hidden="true"` / `display:none` / `visibility:hidden`
 *   跳过。必须向上遍历祖先：设置对话框的 v-show 页签用 `display:none` 隐藏后控件仍留在
 *   DOM 中，若只查元素自身 computed style 会把隐藏页签控件算进焦点循环，Tab 边界回绕时
 *   可能聚焦失败（焦点停在原地）。
 */
function isTabbable(element: HTMLElement, root: HTMLElement): boolean {
    if (element.hasAttribute('disabled')) return false
    if (NON_FOCUSABLE_TAGS.has(element.tagName)) return false
    if (element.closest('fieldset[disabled]')) return false
    const tabindex = element.getAttribute('tabindex')
    if (tabindex !== null && Number.parseInt(tabindex, 10) < 0) return false
    let current: HTMLElement | null = element
    while (current && current !== root) {
        if (current.hidden) return false
        if (current.getAttribute('aria-hidden') === 'true') return false
        if (current.hasAttribute('inert')) return false
        const style = window.getComputedStyle?.(current)
        if (style && (style.display === 'none' || style.visibility === 'hidden')) return false
        current = current.parentElement
    }
    return true
}

/** 收集当前对话框内真正可 Tab 到达的元素（按 DOM 顺序，与浏览器 Tab 次序一致） */
function getFocusableElements(): HTMLElement[] {
    const root = containerRef.value
    if (!root) return []
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter((element) =>
        isTabbable(element, root)
    )
}

/** 收集正文区（排除标题栏/底栏外壳控件）的可 Tab 到达元素 */
function getContentFocusableElements(): HTMLElement[] {
    return getFocusableElements().filter(
        (element) => !element.closest('.title-bar') && !element.closest('.footer')
    )
}

/**
 * 打开时聚焦入口：
 * - 模态对话框：优先把焦点放到容器本身（读屏会先播报对话框名称），再按 Tab 进入内容；
 * - 非模态工具窗（T6）：聚焦正文首个可交互元素（优先输入控件），让用户打开即可编辑，
 *   没有任何交互元素时退回容器；
 * - 子组件（如重命名输入框）已在打开时自行聚焦时不抢焦点。
 */
function focusDialog(): void {
    const root = containerRef.value
    if (!root) return
    if (document.activeElement && root.contains(document.activeElement)) return
    if (isNonModal.value) {
        const contentFocusables = getContentFocusableElements()
        const preferred = contentFocusables.find((element) =>
            element.matches(TOOL_WINDOW_PREFERRED_FOCUS_SELECTOR)
        )
        const target = preferred ?? contentFocusables[0]
        if (target) {
            target.focus()
            return
        }
    }
    root.focus()
}

async function restoreFocus(): Promise<void> {
    const target = restoreFocusTarget
    restoreFocusTarget = null
    if (!target) return
    await nextTick()
    // 非模态工具窗：用户可能已把焦点移到编辑器，此时不抢回（与编辑器焦点互不干扰）
    if (isNonModal.value) {
        const active = document.activeElement
        if (active instanceof HTMLElement && active !== document.body && active !== target) {
            return
        }
    }
    if (document.contains(target) && typeof target.focus === 'function') {
        target.focus()
    }
}

function handleDocumentKeyDown(event: KeyboardEvent): void {
    if (!props.visible || !isTopmost()) return
    const root = containerRef.value
    if (!root) return

    if (event.key === 'Escape') {
        // 输入法组合期间 Esc 是「取消候选」而不是关闭对话框（中文输入场景常见）。
        // 现代浏览器组合事件的 isComposing 为 true（Chrome 另以 keyCode 229 标记），
        // 两种标记都放行，避免用户取消候选时误关对话框。
        if (event.isComposing || event.keyCode === 229) return
        // 非模态工具窗 + 焦点不在窗内：Esc 属于编辑器/其他区域的语义，不拦截也不关闭
        // （T6「与编辑器焦点互不干扰」；焦点在窗内时 Esc 只关最顶层工具窗）。
        if (isNonModal.value && !root.contains(document.activeElement)) return
        if (!props.closeOnEscape) {
            event.preventDefault()
            event.stopPropagation()
            return
        }
        // 阻止 Esc 继续冒泡到编辑器（如 Monaco 大纲）等全局快捷键
        event.preventDefault()
        event.stopPropagation()
        emit('close')
        return
    }
    // 非模态对话框不拦截底层编辑器的 Tab 导航
    if (!isModal.value) return
    if (event.key !== 'Tab') return

    const focusables = getFocusableElements()
    if (focusables.length === 0) {
        event.preventDefault()
        root.focus()
        return
    }
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!active || !root.contains(active)) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
    }
    // 焦点停在容器本身（初始焦点）时，Tab 进入第一个可聚焦元素，Shift+Tab 回到最后一个
    if (active === root) {
        event.preventDefault()
        ;(event.shiftKey ? last : first).focus()
        return
    }
    if (event.shiftKey && active === first) {
        event.preventDefault()
        last.focus()
    } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
    }
}

onMounted(() => {
    document.addEventListener('keydown', handleDocumentKeyDown)
})

onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleDocumentKeyDown)
    const wasOpen = registered
    unregister()
    if (wasOpen) {
        void restoreFocus()
    }
})

// 显隐驱动：打开登记栈 + 移动焦点；关闭出栈 + 归还焦点。
// flush: 'post' 保证 Teleport 内容已插入 DOM（容器 ref 可用）。
watch(
    () => props.visible,
    async (isVisible) => {
        if (isVisible) {
            registerOpen()
            await nextTick()
            if (props.visible) focusDialog()
        } else {
            const wasOpen = registered
            unregister()
            if (wasOpen) await restoreFocus()
        }
    },
    { flush: 'post', immediate: true }
)

// Teleport 目标：字符串即自定义目标；true 缺省传送到 body；false 时禁用传送（to 仍需传合法值）。
const teleportTarget = computed(() =>
    typeof props.teleport === 'string' ? props.teleport : 'body'
)
const teleportDisabled = computed(() => props.teleport === false)

// 拖拽能力收敛到外壳：所有迁移前使用 useDialogDrag 的对话框都是 center 初始位置，
// 因此这里固定 center；未使用拖拽的对话框（如 HelpAboutDialog）传 :draggable="false"。
const { dialogStyle, onDialogMouseDown, resetPosition } = useDialogDrag({
    initialPosition: 'center'
})

// 打开时按需重置位置（迁移前 CreateFileFolderDialog / WebUrlDialog 在 visible 监听里
// 调用 resetPosition；MessageDialog 不重置，故默认 false 保持各自既有行为）。
watch(
    () => props.visible,
    (isVisible) => {
        if (isVisible && props.resetPositionOnOpen) {
            resetPosition()
        }
    }
)

/** `:style` 绑定的数组形态（Vue 的 StyleValue 数组，显式声明避免模板推断成 never） */
type StyleValueList = CSSProperties[]

// ==================== 视觉升级 1.5.5：材质 / 遮罩 / 宽度令牌 ====================
const theme = useTheme()

/**
 * 当前主题是否深色（用于 T9 遮罩 .32 / .48 两档）。
 *
 * 取值口径与语义令牌分组一致：按主题实际背景亮度判定（`shared/theme-tokens.isDarkColor`），
 * 主题样式尚未初始化（启动早期/极简测试环境）时按浅色处理（默认主题 baize 为浅色）。
 */
const isDarkOverlay = computed(() => {
    const styles = theme.currentThemeStyles.value
    return styles ? isDarkColor(styles.backgroundColor) : false
})

/** 容器实际宽度：width（兼容既有调用点）优先，其次 widthSize 语义阶梯，留空用默认壳 */
const resolvedWidth = computed(() => resolveDialogWidth(props.width, props.widthSize))

/**
 * 遮罩内联样式：
 * 1. 主题遮罩色（浅 .32 / 深 .48，唯一真源 dialog-metrics）；
 * 2. 调用方 overlayStyle（迁移兼容，内联优先级最高）；
 * 3. 非模态工具窗：透明 + 点击穿透（1.5.3 行为保持不变）。
 */
const overlayStyles = computed<StyleValueList>(() => {
    const styles: StyleValueList = [
        { backgroundColor: resolveDialogOverlayColor(isDarkOverlay.value) }
    ]
    if (props.overlayStyle) {
        styles.push(props.overlayStyle as CSSProperties)
    }
    if (isNonModal.value) {
        styles.push({ pointerEvents: 'none', background: 'transparent' })
    }
    return styles
})

/** 容器 class：调用方自定义 class + 工具窗壳标记（T6）+ 工具窗状态标记（最小化/最大化） */
const containerClassList = computed<ClassValue[]>(() => [
    props.containerClass ?? {},
    { 'dialog-container--tool-window': isNonModal.value },
    {
        'dialog-container--minimized': isNonModal.value && toolWindowState.value === 'minimized',
        'dialog-container--maximized': isNonModal.value && toolWindowState.value === 'maximized'
    }
])

/** 标题栏 class：变体 + 工具窗标记（T6 统一壳，密度/风格全部来自令牌变量） */
const titleBarClassList = computed(() => [
    `title-bar--${props.titleBarVariant}`,
    ...(isNonModal.value ? ['title-bar--tool-window'] : [])
])

/**
 * 工具窗状态覆盖样式（用户反馈 2026-11-27）：
 * - 最小化：只改高度（宽度/水平位置沿用原值），正文隐藏由 `.dialog-container--minimized`
 *   子节点规则负责；内联高度同时覆盖调用方 containerStyle 的 resize/固定高度；
 * - 最大化：fixed 定位 + 16px 四周留白撑满主窗口；`transform: none` 必须显式清除
 *   dialogStyle 的居中 `translate(-50%,-50%)`（否则会整体偏移）；`box-sizing: border-box`
 *   让边框计入宽高，左右/上下留白对称；
 * - 状态样式在 containerStyles 末位 push，优先级高于调用方 containerStyle（规格要求）。
 */
const toolWindowStateStyle = computed<CSSProperties | null>(() => {
    if (!isNonModal.value) return null
    if (toolWindowState.value === 'minimized') {
        return {
            height: 'var(--ui-titlebar-height, 40px)',
            minHeight: 'var(--ui-titlebar-height, 40px)'
        }
    }
    if (toolWindowState.value === 'maximized') {
        return {
            width: 'calc(100vw - 32px)',
            height: 'calc(100vh - 32px)',
            left: '16px',
            top: '16px',
            transform: 'none',
            margin: '0',
            boxSizing: 'border-box'
        }
    }
    return null
})

// 容器内联样式：dialogStyle（定位）→ 宽度（width/widthSize）→ 非模态点击可交互 →
// containerStyle 全权覆盖（containerStyle 放在最后，允许显式覆盖 width，语义与迁移前一致）→
// 工具窗最小化/最大化状态覆盖（放在最末位，覆盖调用方 resize/固定尺寸与居中 transform）。
const containerStyles = computed<StyleValueList>(() => {
    const styles: StyleValueList = [dialogStyle.value]
    const width = resolvedWidth.value
    if (width) {
        styles.push({ width })
    }
    if (isNonModal.value) {
        styles.push({ pointerEvents: 'auto' })
    }
    if (props.containerStyle) {
        styles.push(props.containerStyle as CSSProperties)
    }
    const stateStyle = toolWindowStateStyle.value
    if (stateStyle) {
        styles.push(stateStyle)
    }
    return styles
})

function handleOverlayClick(): void {
    if (!isNonModal.value && props.closeOnOverlay) {
        emit('close')
    }
}

function handleClose(): void {
    emit('close')
}

function handleContainerMouseDown(event: MouseEvent): void {
    // 非拖拽模式（如 HelpAboutDialog / 依赖 -webkit-app-region 的标题栏）不启动自定义拖拽。
    if (!props.draggable) return
    const target = event.target
    if (target instanceof Element) {
        // 标题栏控件按钮（关闭 / 最小化 / 最大化）不触发拖拽（按钮同时用 @mousedown.stop 兜底）。
        if (target.closest('.title-bar .close-btn, .title-bar .tool-window-control-btn')) return
        // 最大化时开始拖拽：先把状态复位 normal，避免视口覆盖样式与拖拽定位互相覆盖；
        // 仅标题栏拖拽触发复位，正文/底栏点击（含最大化窗内编辑）不改变状态。
        if (
            target.closest('.title-bar') &&
            isNonModal.value &&
            toolWindowState.value === 'maximized'
        ) {
            toolWindowState.value = 'normal'
        }
    }
    onDialogMouseDown(event)
}
</script>

<style scoped>
/* ============================================================================
 * 外壳视觉（视觉升级 1.5.5 P1-B1）
 *
 * ## 令牌消费口径
 * - 颜色 / 材质：`--ui-surface` / `--ui-bg-sunken` / `--ui-border` / `--ui-shadow-*` /
 *   `--ui-radius-*` / `--ui-surface-opacity` / `--ui-surface-blur` / `--ui-focus-shadow`，
 *   全部由根元素 `data-style` 下的风格变量提供（paper/glass/workbench/hybrid）；
 * - 尺寸节奏：`--ui-titlebar-height` / `--ui-control-height` / `--ui-pad` / `--ui-font-size`，
 *   由根元素 `data-density` 提供（compact 36/28/8/12、default 40/32/12/13、spacious 44/36/16/13）；
 * - 组件内**不写** data-style / data-density 分支（DESIGN.md §6：风格差异只由变量自动生效）。
 *
 * ## UI-01 例外（仅遮罩/阴影/深色渐变上的白字）
 * 遮罩色由 `dialog-metrics.resolveDialogOverlayColor` 以内联样式写入；本文件的 rgba 仅用于
 * 阴影兜底（令牌缺失时）与深色标题栏渐变上的白字/白描边，均有注释。
 * ========================================================================== */

/* ==================== 遮罩 ==================== */
.dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    /* 遮罩兜底色：运行时由 overlayStyles 内联写入主题感知值（浅 .32 / 深 .48） */
    background: rgba(0, 0, 0, 0.32);
    display: flex;
    align-items: center;
    justify-content: center;
    /*
     * T12 层级收敛：不再写死数值，改为应用层令牌 `--ui-z-dialog-app`。
     * 1.5.6 起应用层已相对阶梯化（真源 UI_Z_INDEX_APP_COMPAT / UI_Z_INDEX_APP_BASE）：
     * 写作模式 100 < 对话框/欢迎页 110（互斥渲染）< 命令面板/缩放热区 120；
     * 兜底值与令牌当前值一致，样式表缺失时仍保持正确层序。
     */
    z-index: var(--ui-z-dialog-app, 110);
    /* 动效令牌：对话框主体 240ms、遮罩 200ms（MOTION.md §1；减少动效时由令牌降级） */
    --dialog-fade-duration: var(--ui-duration-overlay, 0.2s);
    --dialog-scale-transition: transform var(--ui-duration-dialog, 0.2s)
        var(--ui-ease-standard, ease);
    --dialog-scale-from-opacity: 1;
}

/* 动画预设：smooth = 0.3s 淡入 + 缩放同时改变透明度（MessageDialog 迁移前动画）。 */
.dialog-anim--smooth {
    --dialog-fade-duration: 0.3s;
    --dialog-scale-transition: all 0.3s ease;
    --dialog-scale-from-opacity: 0;
}

/* ==================== 容器（T9 对话框壳） ==================== */
.dialog-container {
    width: 500px;
    background: var(--ui-surface, var(--bg-color));
    /* 视觉升级收口（用户反馈 2026-11-27）：对话框需要清晰边界——
       1px hairline 边框 + shadow-3 共同界定浮层；标题栏/正文/footer 在边框内留白。 */
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-lg, 8px);
    box-shadow: var(--ui-shadow-3);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/*
 * T6 非模态工具窗统一壳：
 * - 面：`--ui-surface` × `--ui-surface-opacity`（glass 半透明；其余 1 = 不透明）；
 * - 玻璃模糊：`--ui-surface-blur` 仅在 glass 非 0（其余 0px，等于关闭模糊）；
 * - 边框：1px hairline；阴影：悬浮层 `--ui-shadow-2`；glass 高光边由
 *   `--ui-highlight-border-color` 提供（= 固定白基色 --ui-highlight-color ×
 *   --ui-highlight-border-alpha；其余风格 alpha 为 0 → transparent，不产生可见高光）。
 * 风格差异全部来自根元素 data-style 下的变量，组件不做风格判断。
 */
.dialog-container--tool-window {
    background: color-mix(
        in srgb,
        var(--ui-surface, var(--bg-color)) calc(var(--ui-surface-opacity, 1) * 100%),
        transparent
    );
    border: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-lg, 8px);
    box-shadow:
        var(--ui-shadow-2),
        inset 0 0 0 1px var(--ui-highlight-border-color);
    backdrop-filter: blur(var(--ui-surface-blur, 0px));
    -webkit-backdrop-filter: blur(var(--ui-surface-blur, 0px));
}

/*
 * 正文内容区：默认不为默认插槽额外包一层容器——25 个已迁移对话框的正文根节点自带内边距，
 * 且 ThemeSettingDialog 依赖「prepend → title-bar → 正文 → footer」直接子节点顺序（c4 契约）。
 * T6/T9 的「内容内边距」通过可选 `contentPadding` 包裹层提供（默认关闭），由后续批次在正文
 * 自身无内边距的工具窗上逐个启用；启用后 padding 统一消费 `--ui-pad`（8/12/16）。
 */
.dialog-body {
    padding: var(--ui-pad, 12px);
    min-height: 0;
    overflow: auto;
}

/* ==================== 标题栏 ==================== */
.title-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--title-bar-gradient);
    cursor: move;
    user-select: none;
    /* 密度令牌：标题栏高 36/40/44（compact/default/spacious），默认 = T9/T6 规格 40 */
    height: var(--ui-titlebar-height, 40px);
    /* 标题栏背景为深色渐变：白色文字/描边属 UI-01 明文例外 */
    color: #fff;
}

/* compact：simple 对话框默认壳（水平内边距随密度令牌走 4px 阶梯） */
.title-bar--compact {
    padding: 0 calc(var(--ui-pad, 12px) + 4px);
}

/* regular：medium/complex 对话框现状中占比最高的一档 */
.title-bar--regular {
    padding: 0 calc(var(--ui-pad, 12px) + 4px);
}

/* large：复杂/帮助对话框的一档（高度与字号同样统一到令牌，保留更大水平留白） */
.title-bar--large {
    padding: 0 24px;
}

/* 无固定高度、背景透明：MessageDialog / CommandPalette 形态，背景由调用方 titleBarStyle 提供 */
.title-bar--plain {
    height: auto;
    padding: 12px 16px;
    background: transparent;
}

.title-text {
    /* 标题栏背景为深色渐变：白色文字属 UI-01 明文例外 */
    color: #fff;
    font-weight: 600;
}

/* T9：对话框标题 15 / 字重 600（`--ui-font-size` 13 + 2；密度档自动微调 14~15） */
.title-bar--compact .title-text,
.title-bar--regular .title-text,
.title-bar--large .title-text {
    font-size: calc(var(--ui-font-size, 13px) + 2px);
    font-weight: 600;
}

.title-bar--plain .title-text {
    font-size: 14px;
}

/*
 * T6 工具窗标题栏：中性悬浮面（不沿用主题渐变），标题栏与正文之间 hairline 分隔，
 * 与设计预览（docs/design/preview/style-*.svg）一致；四风格下颜色仍来自主题令牌
 * （workbench/paper 不透明、glass 半透明面叠在主题背景上、hybrid 走 workbench 令牌）。
 */
.title-bar--tool-window {
    justify-content: flex-start;
    gap: 8px;
    padding: 0 var(--ui-pad, 12px);
    background: var(--ui-bg-sunken, var(--card-bg));
    border-bottom: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    color: var(--ui-text, var(--text-color));
    cursor: grab;
}

.title-bar--tool-window:active {
    cursor: grabbing;
}

.title-bar--tool-window .title-text {
    color: var(--ui-text, var(--text-color));
    font-size: var(--ui-font-size, 13px);
    font-weight: 600;
}

/* T6 拖拽把手：标题栏左侧 6 点纹理（2 列 × 3 行，CSS 绘制，不进无障碍树） */
.tool-window-drag-handle {
    flex: 0 0 auto;
    width: 14px;
    height: 20px;
    border-radius: var(--ui-radius-sm, 2px);
    background-image: radial-gradient(
        circle,
        var(--ui-text-tertiary, currentColor) 1.2px,
        transparent 1.3px
    );
    background-size: 6px 6px;
    background-position: 1px 2px;
    opacity: 0.9;
}

/* ==================== 工具窗最小化 / 最大化按钮（用户反馈 2026-11-27） ==================== */
/*
 * 控制按钮组：[最小化][最大化/还原][关闭]。位于标题栏右侧（标题之后、关闭之前），
 * 用 margin-left: auto 把整组推到右端（关闭按钮不再单独 auto，避免两个 auto 均分空隙）。
 * 视觉与关闭按钮一致：28×28 方形圆角、透明底、语义文字色，hover 用 --ui-accent-soft，
 * 键盘焦点环用 --ui-focus-shadow（DESIGN.md §6，替代浏览器 outline）。
 */
.tool-window-controls {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 4px;
}

.tool-window-control-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: none;
    border-radius: var(--ui-radius-md, 4px);
    background: transparent;
    color: var(--ui-text-secondary, var(--secondary-text-color));
    cursor: pointer;
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        box-shadow var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

.tool-window-control-btn:hover {
    background: var(--ui-accent-soft, var(--hover-bg));
    color: var(--ui-text, var(--text-color));
}

.tool-window-control-btn:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

.tool-window-control-icon {
    display: block;
    width: 16px;
    height: 16px;
}

/*
 * 最小化态：容器只剩标题栏（内联 height = --ui-titlebar-height 由 toolWindowStateStyle 写入，
 * 用于覆盖调用方 containerStyle 的高度）。直接子节点中除标题栏外全部隐藏——正文/footer/
 * prepend 装饰层都不再占位，且 display:none 会同时移出 Tab 次序与无障碍树；
 * 标题栏及三个按钮保留，用户可以再次点击「还原」。
 */
.dialog-container--minimized > :not(.title-bar) {
    display: none;
}

/* ==================== 关闭按钮 ==================== */
.close-btn {
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    /* 标题栏背景为深色渐变：白色文字属 UI-01 明文例外 */
    color: #fff;
    transition:
        background-color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        color var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease),
        box-shadow var(--ui-duration-fast, 120ms) var(--ui-ease-standard, ease);
}

/* 28px 圆形按钮：simple 对话框等现状变体。 */
.close-btn--circle {
    width: 28px;
    height: 28px;
    background: rgba(255, 255, 255, 0.2);
    border-radius: 50%;
    font-size: 14px;
}

.close-btn--circle:hover {
    background: rgba(255, 100, 100, 0.9);
}

/* 32px 圆角按钮：medium/complex/help 多数对话框现状变体。 */
.close-btn--rounded {
    width: 32px;
    height: 32px;
    background: rgba(255, 255, 255, 0.15);
    border-radius: var(--ui-radius-md, 6px);
    font-size: 16px;
}

.close-btn--rounded:hover {
    background: rgba(255, 80, 80, 0.95);
}

/* 键盘焦点环：统一用 --ui-focus-shadow（DESIGN.md §6，替代浏览器 outline） */
.close-btn:focus-visible {
    outline: none;
    box-shadow: var(--ui-focus-shadow);
}

/* T6 工具窗关闭按钮：28×28 中性色（标题栏为浅色悬浮面，白字不可用）
   margin-left 不再用 auto：右侧由 .tool-window-controls 的 auto 边距整体推到标题栏右端，
   关闭按钮紧跟控制按钮组，避免两个 auto 边距把空隙均分成两段。 */
.title-bar--tool-window .close-btn {
    width: 28px;
    height: 28px;
    border-radius: var(--ui-radius-md, 4px);
    background: transparent;
    color: var(--ui-text-secondary, var(--secondary-text-color));
    font-size: 16px;
}

.title-bar--tool-window .close-btn:hover {
    background: var(--ui-accent-soft, var(--hover-bg));
    color: var(--ui-danger);
}

/* ==================== 底部操作区 ==================== */
.footer {
    padding: var(--ui-pad, 12px) 16px;
    display: flex;
    align-items: center;
    gap: 8px;
    border-top: var(--ui-hairline-width, 1px) solid var(--ui-border, var(--border-color));
    background: var(--ui-bg-elevated, var(--card-bg));
}

.footer--start {
    justify-content: flex-start;
}

.footer--center {
    justify-content: center;
}

.footer--end {
    justify-content: flex-end;
}

/* ==================== 过渡动画 ==================== */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
    transition: opacity var(--dialog-fade-duration, 0.2s) ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
    opacity: 0;
}

.dialog-scale-enter-active,
.dialog-scale-leave-active {
    transition: var(--dialog-scale-transition, transform 0.2s ease);
}

.dialog-scale-enter-from,
.dialog-scale-leave-to {
    transform: scale(0.9);
    opacity: var(--dialog-scale-from-opacity, 1);
}
</style>
