/**
 * 对话框 / 非模态工具窗度量常量（视觉升级 1.5.5，P1-B1 组 T6/T9）
 *
 * ## 为什么单独成模块
 * T9 要求对话框宽度收敛为「语义阶梯」而不是调用点自由传任意像素值；T6 要求非模态
 * 工具窗统一壳。宽度阶梯、遮罩透明度等「纯数值」既被 `BaseDialog.vue` 消费，也被
 * 单测（宽度阶梯 / 四风格 × 三密度矩阵）直接断言，因此收敛到本纯模块，避免测试里
 * 手写第二份字面量（GEN-03 真源原则）。
 *
 * ## 边界
 * - 本文件只放纯常量 / 纯函数，不依赖 DOM/Vue/Electron/Node（ARCH-05 同口径）；
 * - 颜色只出现在「遮罩」场景（UI-01 明确允许 rgba 遮罩例外），主题色一律由
 *   `--ui-*` 语义令牌提供，本文件不写任何主题色值；
 * - 尺寸单位是 CSS 字符串：宽度阶梯要兼容既有的 `width` 内联覆盖（含 `min()/vw`
 *   之类函数式写法），不能收敛成 number。
 */

/**
 * 对话框宽度阶梯（T9：360 确认 / 520 表单 / 720 中等 / 960 复杂 / 全宽特殊）。
 *
 * 说明：
 * - `medium` 是规格里的「中等，默认」档，但**不改** `BaseDialog` 既有默认壳宽度
 *   500px——25 个已迁移对话框在无 `width` prop 时依赖默认壳宽度，直接改默认值会
 *   破坏「既有调用点迁移语义不变」的硬约束。调用点迁移到语义档位由后续批次
 *   （P2 T12/T18 跨组件回归）统一执行；本批次先提供映射与覆盖能力。
 * - `full` 不是像素值：用 `min()` 在超大屏上限宽、在窄屏自适应，避免 1400px 级
 *   编辑器对话框在小屏溢出（T6「缩放边界限制在窗口可视区」同口径）。
 */
export const DIALOG_WIDTH_LADDER = {
    /** 确认类（删除 / 未保存修改等短文案确认框） */
    confirm: '360px',
    /** 表单类（新建 / 重命名 / 单个输入） */
    form: '520px',
    /** 中等（默认目标档：多区块表单 / 列表） */
    medium: '720px',
    /** 复杂（页签 / 双栏 / 长列表） */
    complex: '960px',
    /** 全宽特殊（大型编辑器类，按视口宽度自适应并设上限） */
    full: 'min(1440px, 96vw)'
} as const

/** 对话框语义宽度档位（`BaseDialog` 的 `widthSize` prop） */
export type DialogWidthSize = keyof typeof DIALOG_WIDTH_LADDER

/** 语义宽度档位清单（稳定顺序，供设置/测试遍历；与 DIALOG_WIDTH_LADDER 键集合一致） */
export const DIALOG_WIDTH_SIZE_VALUES = [
    'confirm',
    'form',
    'medium',
    'complex',
    'full'
] as const satisfies readonly DialogWidthSize[]

/** 默认语义宽度档位：中等（仅用于文档/测试口径；未传 widthSize 时壳宽度仍是既有 500px） */
export const DEFAULT_DIALOG_WIDTH_SIZE: DialogWidthSize = 'medium'

/**
 * 解析对话框容器实际宽度（纯函数）。
 *
 * 优先级：`width`（既有一致性迁移语义，含 `min()/vw` 等任意合法 CSS 宽度）>
 * `widthSize`（T9 语义阶梯）> `''`（留空 = 使用 BaseDialog 默认壳 CSS 宽度 500px）。
 * 这是「兼容现有 width props 调用点」的落点：所有历史调用点继续传 `width` 即与
 * 升级前完全一致；新调用点应优先传 `widthSize`。
 */
export function resolveDialogWidth(
    width?: string | null,
    widthSize?: DialogWidthSize | null
): string {
    if (typeof width === 'string' && width.trim().length > 0) {
        return width
    }
    if (widthSize && widthSize in DIALOG_WIDTH_LADDER) {
        return DIALOG_WIDTH_LADDER[widthSize]
    }
    return ''
}

/** 遮罩透明度：浅色主题（T9）——深色底上叠 .32 黑即可压暗背景 */
export const DIALOG_OVERLAY_ALPHA_LIGHT = 0.32
/** 遮罩透明度：深色主题（T9）——深色底需要更深的遮罩才能拉开层级 */
export const DIALOG_OVERLAY_ALPHA_DARK = 0.48

/**
 * 解析遮罩背景色（纯函数）。
 *
 * UI-01 允许阴影/遮罩使用 rgba 字面量：这里集中唯一真源，BaseDialog 以内联背景色
 * 写入，浅色 `.32` / 深色 `.48` 由当前主题实际背景亮度判定（与语义令牌分组同口径）。
 */
export function resolveDialogOverlayColor(isDark: boolean): string {
    const alpha = isDark ? DIALOG_OVERLAY_ALPHA_DARK : DIALOG_OVERLAY_ALPHA_LIGHT
    return `rgba(0, 0, 0, ${alpha})`
}

/**
 * 工具窗打开时的首选焦点选择器（按顺序命中第一个可见输入控件）。
 *
 * T6：非模态工具窗打开时应把焦点放到「内容首个可交互元素」，优先输入类控件
 * （用户打开工具窗的目的通常是录入/编辑），没有任何输入控件时退回首个按钮，
 * 仍没有则退回容器本身（见 BaseDialog.focusDialog）。
 */
export const TOOL_WINDOW_PREFERRED_FOCUS_SELECTOR = [
    'textarea:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    '[contenteditable="true"]',
    'select:not([disabled])'
].join(',')
