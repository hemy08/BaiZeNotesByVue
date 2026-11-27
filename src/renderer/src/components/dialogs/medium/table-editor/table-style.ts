/**
 * 表格编辑器 × 界面风格 / 密度令牌映射（视觉升级 P1-B3，T8）
 *
 * ## 为什么需要本模块
 * P0 冻结令牌层（`src/shared/constants/ui-style.ts` / `styles/ui-style.css`）只提供
 * 「颜色 + 材质（透明度/模糊/阴影/圆角）+ 尺寸节奏（行高/控件高/内边距/字号）」通用变量，
 * 表格自身还有三个专属规格无法由通用变量唯一推导：
 * 1. **列头行高**：规格为 32，且随密度档同步（= 数据行高 + 4）——通用令牌只有行高；
 * 2. **网格线强度**：paper「边框轻」、workbench「网格线更明显」、glass「透出背景层次」，
 *    通用令牌的边框只有一种 `--ui-border`；
 * 3. **glass 列头模糊**：通用变量 `--ui-surface-blur` 只有半径，是否启用需按风格/降级模式判断。
 *
 * 本模块把上述「表格专属派生」收敛为**单表纯函数**（唯一真源），组件只做两件事：
 * - 用 `useTheme().currentUiAppearance` 读取生效风格/密度（P0 已提供的组件消费 API）；
 * - 把本模块产出的 CSS 变量写到组件根节点，CSS 侧只消费变量、不写 `[data-style=…]` 分支。
 *
 * ## 与规范的关系
 * - `docs/design/COMPONENTS.md` §4 是表格规格真源（行高 `--ui-row-height`、列头 32/600/
 *   `--ui-bg-elevated`、单元格 hairline、选区 `--ui-accent-soft`、手柄 4px 等）；
 * - `docs/design/DESIGN.md` §6「组件不手写风格判断」：本模块不做 `if (dark) …` 之类的
 *   主题判断，只把 `data-style` 的**生效值**映射为表格网格/列头材质变量，颜色仍全部来自
 *   `--ui-*` 语义令牌（含 `color-mix` 透明度派生），因此 28 套主题自动适用；
 * - hybrid 的特殊规则：表格属「工具区」，按方案 §2/§3.6 使用 workbench 材质（= 默认值）。
 *
 * ## 默认观感
 * `workbench + default` 是默认组合：行高 28 / 列头 32 / 字重 600 / 全量 hairline 网格，
 * 数值全部来自冻结的 `UI_DENSITY_TOKENS.default`（行高）与 `+4` 派生（列头），
 * 不复制字面量，避免与令牌层漂移（`tests/unit/table-style.test.ts` 静态校验唯一真源）。
 *
 * 本文件为纯函数/纯常量模块：不依赖 DOM / Vue / Electron（node 环境可直接单测）。
 */
import {
    UI_DENSITY_TOKENS,
    type GlassMode,
    type UiDensityTokens
} from '../../../../../../shared/constants/ui-style'
import type { UiDensity, UiStyle } from '../../../../../../shared/types/system'

/**
 * 列头比数据行多的额外高度（px）。
 *
 * 规格：列头 32 = 数据行 28（default 档）+ 4；compact/spacious 随行高同步为 28/36。
 * 之所以「+4」而不是固定 32：密度层只提供行高，列头必须跟随密度档，否则 compact 下
 * 32px 列头会比 24px 数据行高出一大截、spacious 下又显得局促。
 */
export const TABLE_HEADER_EXTRA_HEIGHT = 4

/** 单元格水平内边距 = 密度内边距基准 / 2（compact 4 / default 6 / spacious 8，px） */
export const TABLE_CELL_PAD_X_DIVISOR = 2

/** 表格内图标按钮尺寸 = 数据行高 - 8（compact 16 / default 20 / spacious 24，px） */
export const TABLE_ICON_INSET = 8

/** 行头（行号列）固定的图标槽位数：拖拽把手 + 行号 + 插入 + 删除 = 4 */
export const TABLE_ROW_HEAD_ICON_SLOTS = 4

/** 行头在图标之外的基础宽度（左右内边距 + 行号最小宽度，px） */
export const TABLE_ROW_HEAD_BASE_WIDTH = 16

/** 「新增列」列在图标之外的基础宽度（列内按钮左右内边距，px） */
export const TABLE_ADD_COLUMN_BASE_WIDTH = 34

/** 列宽拖拽手柄宽度（px）——规格固定 4px，与密度无关 */
export const TABLE_RESIZER_WIDTH = 4

/** 表格密度令牌（由冻结的 UI_DENSITY_TOKENS 派生，禁止在组件/CSS 内另写字面量） */
export interface TableDensityTokens {
    /** 数据行高（px，= `--ui-row-height`） */
    rowHeight: number
    /** 列头行高（px，= 行高 + TABLE_HEADER_EXTRA_HEIGHT） */
    headerHeight: number
    /** 单元格水平内边距（px） */
    cellPadX: number
    /** 表格内图标按钮尺寸（px） */
    iconSize: number
    /** 工具栏控件高度（px，= `--ui-control-height`） */
    controlHeight: number
    /** 表格 UI 字号（px，= `--ui-font-size`） */
    fontSize: number
    /** 行头（行号列）宽度（px，随行高缩放） */
    rowHeadWidth: number
    /** 末尾「新增列」列宽度（px，随行高缩放） */
    addColumnWidth: number
}

/**
 * 解析三档密度对应的表格尺寸令牌（纯函数）。
 *
 * 唯一真源：行高/控件高/字号直接取 `UI_DENSITY_TOKENS[density]`，其余为本表派生规则；
 * 所有派生比例以常量声明（上方三个常量），便于规格评审与测试静态断言。
 */
export function resolveTableDensityTokens(density: UiDensity): TableDensityTokens {
    const base: UiDensityTokens = UI_DENSITY_TOKENS[density]
    const iconSize = base.rowHeight - TABLE_ICON_INSET
    return {
        rowHeight: base.rowHeight,
        headerHeight: base.rowHeight + TABLE_HEADER_EXTRA_HEIGHT,
        cellPadX: Math.round(base.pad / TABLE_CELL_PAD_X_DIVISOR),
        iconSize,
        controlHeight: base.controlHeight,
        fontSize: base.fontSize,
        rowHeadWidth: iconSize * TABLE_ROW_HEAD_ICON_SLOTS + TABLE_ROW_HEAD_BASE_WIDTH,
        addColumnWidth: iconSize + TABLE_ADD_COLUMN_BASE_WIDTH
    }
}

/**
 * 表格材质令牌（风格层差异部分）。
 *
 * 只覆盖通用令牌无法表达的三项，其余（选区色 / 手柄色 / 阴影 / 圆角 / 文字层级）
 * 全部在组件 CSS 内直接消费冻结的 `--ui-*` 变量，避免重复定义。
 */
export interface TableStyleTokens {
    /** 表格外框 + 列头分隔线颜色 */
    borderColor: string
    /** 单元格内部网格线颜色 */
    gridColor: string
    /** 列头底边分区线颜色（比网格线更强，用于列头与表体分区） */
    headerBorderColor: string
    /** 列头底色 */
    headerBackground: string
    /** 表体底色 */
    bodyBackground: string
    /** 列头背景模糊（glass 常规模式启用；其余 none） */
    headerBackdropFilter: string
}

/** paper：边框整体减弱约 40%，网格线更淡（纸面低对比、长文写作场景不抢内容） */
const PAPER_TABLE_TOKENS: TableStyleTokens = {
    borderColor: 'color-mix(in srgb, var(--ui-border) 60%, transparent)',
    gridColor: 'color-mix(in srgb, var(--ui-border) 45%, transparent)',
    headerBorderColor: 'color-mix(in srgb, var(--ui-border) 70%, transparent)',
    headerBackground: 'var(--ui-bg-elevated)',
    bodyBackground: 'var(--ui-bg-elevated)',
    headerBackdropFilter: 'none'
}

/**
 * glass：面层半透明透出下层背景（列头/表体用 `--ui-surface-opacity` 派生 alpha），
 * 列头启用小面积背景模糊（规格允许的唯一模糊位置：悬浮层头部，禁止整表模糊）。
 */
const GLASS_TABLE_TOKENS: TableStyleTokens = {
    borderColor: 'var(--ui-border)',
    gridColor: 'color-mix(in srgb, var(--ui-border) 65%, transparent)',
    headerBorderColor: 'var(--ui-border)',
    headerBackground:
        'color-mix(in srgb, var(--ui-surface) calc(var(--ui-surface-opacity) * 100%), transparent)',
    bodyBackground:
        'color-mix(in srgb, var(--ui-surface) calc(var(--ui-surface-opacity) * 100%), transparent)',
    headerBackdropFilter: 'blur(var(--ui-surface-blur))'
}

/** workbench：不透明面 + 全量 1px hairline 网格 + 列头 border-strong 分区线（高信息密度） */
const WORKBENCH_TABLE_TOKENS: TableStyleTokens = {
    borderColor: 'var(--ui-border)',
    gridColor: 'var(--ui-border)',
    headerBorderColor: 'var(--ui-border-strong)',
    headerBackground: 'var(--ui-bg-elevated)',
    bodyBackground: 'var(--ui-bg-elevated)',
    headerBackdropFilter: 'none'
}

/**
 * 四种界面风格 → 表格材质（唯一真源）。
 *
 * - paper：边框轻、网格淡；
 * - glass：面层半透明 + 列头模糊；
 * - workbench：全量 hairline + 列头分区线（默认值）；
 * - hybrid：表格属**工具区**，沿用 workbench 材质（方案 §2/§3.6 双材质边界）。
 */
export const TABLE_STYLE_TOKENS: Readonly<Record<UiStyle, TableStyleTokens>> = {
    paper: PAPER_TABLE_TOKENS,
    glass: GLASS_TABLE_TOKENS,
    workbench: WORKBENCH_TABLE_TOKENS,
    hybrid: WORKBENCH_TABLE_TOKENS
}

/**
 * 解析生效风格对应的表格材质令牌（纯函数）。
 *
 * @param style 生效风格（`useTheme().currentUiAppearance.effectiveStyle`，glass 降级后已是 paper）
 * @param glassMode 玻璃材质模式：steady（深色主题稳健）/flat 时关闭列头模糊，
 *                  避免「0px 模糊半径仍创建合成层」与深色底的灰蒙感
 */
export function resolveTableStyleTokens(
    style: UiStyle,
    glassMode: GlassMode = 'normal'
): TableStyleTokens {
    const tokens = { ...TABLE_STYLE_TOKENS[style] }
    if (style === 'glass' && glassMode !== 'normal') {
        tokens.headerBackdropFilter = 'none'
    }
    return tokens
}

/** 表格组件根节点上的 CSS 变量名（组件 `:style` 绑定，CSS 侧只消费这些变量） */
export interface TableCssVariables {
    [variable: string]: string
}

/**
 * 构建表格组件根节点的 CSS 变量表（纯函数）。
 *
 * 返回的键名与组件 `<style>` 中的 `var(--table-*)` 一一对应；
 * 密度/风格/降级模式全部作为入参，组件不保存任何尺寸/颜色字面量。
 */
export function buildTableCssVariables(
    style: UiStyle,
    density: UiDensity,
    glassMode: GlassMode = 'normal'
): TableCssVariables {
    const densityTokens = resolveTableDensityTokens(density)
    const styleTokens = resolveTableStyleTokens(style, glassMode)
    return {
        '--table-row-height': `${densityTokens.rowHeight}px`,
        '--table-header-height': `${densityTokens.headerHeight}px`,
        '--table-cell-pad-x': `${densityTokens.cellPadX}px`,
        '--table-icon-size': `${densityTokens.iconSize}px`,
        '--table-control-height': `${densityTokens.controlHeight}px`,
        '--table-font-size': `${densityTokens.fontSize}px`,
        '--table-row-head-width': `${densityTokens.rowHeadWidth}px`,
        '--table-add-column-width': `${densityTokens.addColumnWidth}px`,
        '--table-border-color': styleTokens.borderColor,
        '--table-grid-color': styleTokens.gridColor,
        '--table-header-border-color': styleTokens.headerBorderColor,
        '--table-header-bg': styleTokens.headerBackground,
        '--table-body-bg': styleTokens.bodyBackground,
        '--table-header-backdrop': styleTokens.headerBackdropFilter,
        '--table-resizer-width': `${TABLE_RESIZER_WIDTH}px`
    }
}
