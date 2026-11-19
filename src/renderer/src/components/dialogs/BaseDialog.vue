<template>
    <Teleport :to="teleportTarget" :disabled="teleportDisabled">
        <Transition name="dialog-fade">
            <div
                v-if="visible"
                class="dialog-overlay"
                :class="`dialog-anim--${animation}`"
                :style="overlayStyle"
                @click.self="handleOverlayClick"
            >
                <Transition name="dialog-scale">
                    <div
                        v-if="visible"
                        class="dialog-container"
                        :class="containerClass"
                        :style="containerStyles"
                        @mousedown="handleContainerMouseDown"
                    >
                        <!--
                            前置插槽：位于标题栏之前的装饰层（C-3/C-4 组 ThemeSettingDialog 的 8 个
                            resize-handle 依赖此位置）；未提供插槽时不产生任何额外 DOM。
                        -->
                        <slot name="prepend"></slot>

                        <div
                            class="title-bar"
                            :class="`title-bar--${titleBarVariant}`"
                            :style="titleBarStyle"
                        >
                            <slot name="title">
                                <span class="title-text" :style="titleTextStyle">{{ title }}</span>
                            </slot>
                            <button
                                class="close-btn"
                                :class="`close-btn--${closeButtonVariant}`"
                                :style="closeButtonStyle"
                                @click.stop="handleClose"
                            >
                                ×
                            </button>
                        </div>

                        <slot></slot>

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
 * BaseDialog —— 渲染层对话框统一外壳（第 3 批组件化子任务 C，保守抽层）
 *
 * 抽层目标：18 个对话框各自复制了 `.dialog-overlay` / `.dialog-container` / `.title-bar` /
 * `.title-text` / `.close-btn` / `dialog-fade-*` / `dialog-scale-*` 结构与 CSS，
 * 且已出现标题栏高度 11 种、关闭按钮 5 种、动画 18 份的变体分叉。本组件只承载
 * **所有对话框共有的外壳骨架 + 默认样式 + 可覆盖钩子**，不强行统一全部变体：
 *
 * - 默认变体（`titleBarVariant="compact"` + `animation="quick"` + `closeButtonVariant="circle"`）
 *   与 simple 对话框（CreateFileFolderDialog / WebUrlDialog）迁移前的 scoped 外壳 CSS 逐属性一致；
 * - 其余当前存在的壳风格以「变体 + 内联样式覆盖」两档能力保留：
 *   - 标题栏高度/字号：compact(32px/13px) / regular(40px/14px) / large(48px/16px) / plain(无固定高度，透明背景)；
 *   - 关闭按钮：circle(28px 圆形) / rounded(32px 圆角)；
 *   - 底部对齐：start / center / end；
 *   - 动画：quick(0.2s) / smooth(0.3s，缩放同时淡入，MessageDialog 迁移前动画)；
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
 * 行为与迁移前单个对话框的外壳保持一致：
 * 1. `<Teleport to="body">` 默认开启，可用 `teleport` 关闭 / 指定目标（测试用 teleport stub）；
 * 2. 遮罩空白处点击（`@click.self`）触发 `close`，可用 `closeOnOverlay` 关闭该行为；
 * 3. 关闭按钮点击触发 `close`（`.stop` 阻止冒泡到遮罩）；
 * 4. 按标题栏拖拽移动对话框（`draggable`，复用 useDialogDrag；关闭按钮/正文不触发拖拽）；
 * 5. `resetPositionOnOpen` 为 true 时每次打开重置到初始居中位置（默认沿用上次拖拽位置）。
 *
 * 说明：本组件样式使用 scoped 而非全局 `styles/dialog.css`——避免非 scoped 外壳类
 * （`.dialog-overlay` 等）在 15 个尚未迁移的对话框上产生全局样式泄漏，符合本任务
 * 「迁移前后视觉一致」的保守策略；等全部对话框迁移完成后再评估是否收敛为全局共享 CSS。
 */
import { computed, useSlots, watch } from 'vue'
import type { ClassValue, CSSProperties } from 'vue'
import { useDialogDrag } from '../../composables/useDialogDrag'

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

/** 标题栏视觉变体（取值来自 18 个对话框现状归类，未强行统一） */
type TitleBarVariant = 'compact' | 'regular' | 'large' | 'plain'
/** 关闭按钮视觉变体（现状两大派系） */
type CloseButtonVariant = 'circle' | 'rounded'
/** 底部插槽对齐方式 */
type FooterAlign = 'start' | 'center' | 'end'
/** 过渡动画预设：quick=0.2s 缩放；smooth=0.3s 缩放 + 透明度（MessageDialog 迁移前动画） */
type DialogAnimation = 'quick' | 'smooth'

interface Props {
    /** 显隐开关（真源在父组件，本组件只读不写，避免破坏单例对话框状态机） */
    visible: boolean
    /** 标题文本；需要自定义标题结构（如图标/多行）时使用 title 插槽覆盖 */
    title?: string
    /** Teleport 目标：默认 true=body；false=不传送；字符串=自定义 CSS 选择器 */
    teleport?: boolean | string
    /** 对话框宽度（覆盖默认壳 500px；留空则使用默认壳宽度） */
    width?: string
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
    /** 容器附加 class（如 MessageDialog 需要 `${type}-dialog` 供外部/测试识别消息类型） */
    containerClass?: ClassValue
    /** 遮罩内联样式覆盖（MessageDialog 迁移前遮罩为更深的 rgba(0,0,0,0.5)） */
    overlayStyle?: DialogStyleProperties
    /** 容器内联样式覆盖（背景/阴影/自适应宽度/绝对定位基准等现状差异） */
    containerStyle?: DialogStyleProperties
    /** 标题栏内联样式覆盖（MessageDialog 动态渐变背景；help 对话框 flex-end/padding/app-region drag） */
    titleBarStyle?: DialogStyleProperties
    /** 标题文字内联样式覆盖（字距/字号/字重等现状差异；使用 title 插槽时由插槽内容自行控制） */
    titleTextStyle?: DialogStyleProperties
    /** 关闭按钮内联样式覆盖（18px 图标、Electron app-region no-drag 等现状差异） */
    closeButtonStyle?: DialogStyleProperties
    /** 底部内联样式覆盖（预留：后续批次迁移中等/复杂对话框时覆盖 padding/gap 差异） */
    footerStyle?: DialogStyleProperties
}

const props = withDefaults(defineProps<Props>(), {
    title: '',
    teleport: true,
    width: '',
    titleBarVariant: 'compact',
    closeButtonVariant: 'circle',
    footerAlign: 'end',
    animation: 'quick',
    draggable: true,
    resetPositionOnOpen: false,
    closeOnOverlay: true
})

const emit = defineEmits<{
    (e: 'close'): void
}>()

const slots = useSlots()

// 底部只在调用方提供 footer 插槽时渲染：MathTextDialog / MdSheetDialog 等迁移前无 footer，
// 不能凭空多出一条带边框的空白底栏（后续批次迁移时必须保持该结构差异）。
const hasFooter = computed(() => Boolean(slots.footer))

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

// 容器内联样式：width 属性是低频常用覆盖项，其余细节由 containerStyle 全权覆盖
// （containerStyle 放在后面，允许显式覆盖 width，语义与迁移前各对话框在模板里
//  直接写 `:style` 覆盖外壳 CSS 一致）。
const containerStyles = computed<StyleValueList>(() => [
    dialogStyle.value,
    {
        ...(props.width ? { width: props.width } : {}),
        ...(props.containerStyle ?? {})
    }
])

function handleOverlayClick(): void {
    if (props.closeOnOverlay) {
        emit('close')
    }
}

function handleClose(): void {
    emit('close')
}

function handleContainerMouseDown(event: MouseEvent): void {
    // 非拖拽模式（如 HelpAboutDialog / 依赖 -webkit-app-region 的标题栏）不启动自定义拖拽。
    if (props.draggable) {
        onDialogMouseDown(event)
    }
}
</script>

<style scoped>
/* ==================== 遮罩 ==================== */
.dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
    /* 动画预设变量：默认 quick（simple 对话框迁移前动画），smooth 由下方类覆盖。 */
    --dialog-fade-duration: 0.2s;
    --dialog-scale-transition: transform 0.2s ease;
    --dialog-scale-from-opacity: 1;
}

/* 动画预设：smooth = 0.3s 淡入 + 缩放同时改变透明度（MessageDialog 迁移前动画）。 */
.dialog-anim--smooth {
    --dialog-fade-duration: 0.3s;
    --dialog-scale-transition: all 0.3s ease;
    --dialog-scale-from-opacity: 0;
}

/* ==================== 容器 ==================== */
.dialog-container {
    width: 500px;
    background: var(--bg-color);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

/* ==================== 标题栏 ==================== */
.title-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--title-bar-gradient);
    cursor: move;
    user-select: none;
}

/* 32px 标题栏 + 13px 标题：simple 对话框（CreateFileFolderDialog / WebUrlDialog 等）。 */
.title-bar--compact {
    height: 32px;
    padding: 0 15px;
}

/* 40px 标题栏 + 14px 标题：medium/complex 对话框现状中占比最高的一档。 */
.title-bar--regular {
    height: 40px;
    padding: 0 16px;
}

/* 48px 标题栏 + 16px 标题：复杂/帮助对话框现状的一档。 */
.title-bar--large {
    height: 48px;
    padding: 0 24px;
}

/* 无固定高度、背景透明：MessageDialog 迁移前形态，背景由调用方 titleBarStyle 提供。 */
.title-bar--plain {
    padding: 12px 16px;
    background: transparent;
}

.title-text {
    color: #fff;
    font-weight: 500;
}

.title-bar--compact .title-text {
    font-size: 13px;
}

.title-bar--regular .title-text {
    font-size: 14px;
}

.title-bar--large .title-text {
    font-size: 16px;
    font-weight: 600;
}

.title-bar--plain .title-text {
    font-size: 14px;
}

/* ==================== 关闭按钮 ==================== */
.close-btn {
    border: none;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    transition: all 0.2s;
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
    border-radius: 6px;
    font-size: 16px;
}

.close-btn--rounded:hover {
    background: rgba(255, 80, 80, 0.95);
}

/* ==================== 底部操作区 ==================== */
.footer {
    padding: 15px 20px;
    display: flex;
    gap: 10px;
    border-top: 1px solid var(--border-color);
    background: var(--card-bg);
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
