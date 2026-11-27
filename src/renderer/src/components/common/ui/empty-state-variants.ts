/**
 * 空态统一插图（视觉升级 P1-B2 / T11）
 *
 * ## 设计约束（视觉升级方案 §4.6 / COMPONENTS.md §7.2）
 * - 1 套插图 6 变体：空文件 / 无搜索结果 / 无标签 / 无附件 / 无标注 / 未启用；
 * - 统一 24 网格、stroke 1.5、`currentColor`（颜色由组件 CSS 的 --ui-text-tertiary 提供，
 *   不在路径里写死颜色）；
 * - 纯数据模块：不依赖 DOM/Vue，便于单测直接校验「6 变体完整、路径非空、互不重复」。
 *
 * 路径取值为 `d` 属性片段数组（每项一条路径），全部使用绝对/相对直线与圆弧指令，
 * 不包含 `<path>` 之外的标签，避免插图风格再次分叉。
 */

/** 空态变体标识（与文案由调用方传入，插图只区分语义场景） */
export const EMPTY_STATE_VARIANTS = [
    'empty-file',
    'no-search',
    'no-tags',
    'no-attachments',
    'no-annotations',
    'not-enabled'
] as const

/** 空态变体类型 */
export type EmptyStateVariant = (typeof EMPTY_STATE_VARIANTS)[number]

/** 6 变体 SVG 路径（24 × 24 网格，stroke 1.5 由组件统一设置） */
export const EMPTY_STATE_ILLUSTRATIONS: Readonly<Record<EmptyStateVariant, readonly string[]>> = {
    // 空文件：文档轮廓 + 折角 + 两条内容线
    'empty-file': [
        'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z',
        'M14 3v5h5',
        'M9 13h6',
        'M9 17h4'
    ],
    // 无搜索结果：放大镜 + 镜片内横线（“未找到”）
    'no-search': [
        'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0Z',
        'M15.6 15.6 20 20',
        'M7.5 10.5h6'
    ],
    // 无标签：标签轮廓 + 标签孔
    'no-tags': [
        'M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8Z',
        'M7.5 7.5h.01'
    ],
    // 无附件：回形针
    'no-attachments': [
        'M21 11.5 12.5 20a5 5 0 0 1-7.1-7.1L13 5.4a3.4 3.4 0 0 1 4.8 4.8L10 18a1.8 1.8 0 0 1-2.5-2.5L14.5 8'
    ],
    // 无标注：对话气泡 + 两条标注线
    'no-annotations': [
        'M21 11.5a8.4 8.4 0 0 1-9 8.4 9.4 9.4 0 0 1-3.2-.6L3 21l1.7-5.1A8.4 8.4 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5Z',
        'M8 10h8',
        'M8 13.5h5'
    ],
    // 未启用：电源开关（关闭态）
    'not-enabled': ['M12 3v8', 'M6.6 5.6a8 8 0 1 0 10.8 0']
}

/** 判定字符串是否为合法空态变体（供 props 归一化与单测使用） */
export function isKnownEmptyStateVariant(value: unknown): value is EmptyStateVariant {
    return typeof value === 'string' && (EMPTY_STATE_VARIANTS as readonly string[]).includes(value)
}
