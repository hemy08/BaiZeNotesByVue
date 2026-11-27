/**
 * 表格编辑器 × 四风格 / 三密度令牌 + 单元格取值归一化（视觉升级 P1-B3 / T8）
 *
 * 覆盖点：
 * 1. 密度派生：行高/控件高/字号唯一真源 = 冻结的 UI_DENSITY_TOKENS；列头 = 行高 + 4；
 *    图标尺寸/水平内边距派生规则；默认 workbench + default 档 = 28 / 32（规格值）；
 * 2. 风格派生：paper 边框轻（半透明 color-mix）、glass 半透明 + 列头模糊、
 *    workbench 全量 hairline + border-strong 分区线、hybrid = workbench（表格属工具区）；
 * 3. glass 降级：steady 模式关闭列头模糊；
 * 4. CSS 变量表：键名/px 单位/拖拽手柄 4px/无空值；
 * 5. 单元格显示规则：空单元格不显示 0、日期统一 YYYY-MM-DD、任务标记剥离、
 *    数字/文本/日期对齐推导、显式对齐优先。
 */
import { describe, expect, it } from 'vitest'
import {
    buildTableCssVariables,
    resolveTableDensityTokens,
    resolveTableStyleTokens,
    TABLE_CELL_PAD_X_DIVISOR,
    TABLE_HEADER_EXTRA_HEIGHT,
    TABLE_ICON_INSET,
    TABLE_ADD_COLUMN_BASE_WIDTH,
    TABLE_RESIZER_WIDTH,
    TABLE_ROW_HEAD_BASE_WIDTH,
    TABLE_ROW_HEAD_ICON_SLOTS,
    TABLE_STYLE_TOKENS
} from '../../src/renderer/src/components/dialogs/medium/table-editor/table-style'
import {
    detectTableCellKind,
    formatTableCellDisplay,
    isNumericCellValue,
    isTaskCellValue,
    normalizeDateCellValue,
    resolveTableCellAlign,
    TABLE_TASK_MARKER_PATTERN
} from '../../src/renderer/src/components/dialogs/medium/table-editor/table-values'
import {
    UI_DENSITY_TOKENS,
    UI_DENSITY_VALUES,
    UI_STYLE_VALUES
} from '../../src/shared/constants/ui-style'

describe('表格密度令牌（resolveTableDensityTokens）', () => {
    it('行高/控件高/字号唯一真源是冻结的 UI_DENSITY_TOKENS，不复制字面量', () => {
        for (const density of UI_DENSITY_VALUES) {
            const tokens = resolveTableDensityTokens(density)
            const base = UI_DENSITY_TOKENS[density]
            expect(tokens.rowHeight).toBe(base.rowHeight)
            expect(tokens.controlHeight).toBe(base.controlHeight)
            expect(tokens.fontSize).toBe(base.fontSize)
        }
    })

    it('列头行高 = 数据行高 + 4（compact 28 / default 32 / spacious 36）', () => {
        expect(TABLE_HEADER_EXTRA_HEIGHT).toBe(4)
        expect(resolveTableDensityTokens('compact').headerHeight).toBe(28)
        expect(resolveTableDensityTokens('default').headerHeight).toBe(32)
        expect(resolveTableDensityTokens('spacious').headerHeight).toBe(36)
    })

    it('默认（workbench + default 密度）行高 28 / 列头 32，与组件规格一致', () => {
        const tokens = resolveTableDensityTokens('default')
        expect(tokens.rowHeight).toBe(28)
        expect(tokens.headerHeight).toBe(32)
    })

    it('水平内边距 = 密度内边距 / 2，图标按钮 = 行高 - 8', () => {
        expect(TABLE_CELL_PAD_X_DIVISOR).toBe(2)
        expect(TABLE_ICON_INSET).toBe(8)
        for (const density of UI_DENSITY_VALUES) {
            const tokens = resolveTableDensityTokens(density)
            expect(tokens.cellPadX).toBe(
                Math.round(UI_DENSITY_TOKENS[density].pad / TABLE_CELL_PAD_X_DIVISOR)
            )
            expect(tokens.iconSize).toBe(UI_DENSITY_TOKENS[density].rowHeight - TABLE_ICON_INSET)
        }
    })

    it('行头/新增列宽度随行高缩放（default 96/54，与既有布局一致）', () => {
        expect(TABLE_ROW_HEAD_ICON_SLOTS).toBe(4)
        expect(TABLE_ROW_HEAD_BASE_WIDTH).toBe(16)
        expect(TABLE_ADD_COLUMN_BASE_WIDTH).toBe(34)
        for (const density of UI_DENSITY_VALUES) {
            const tokens = resolveTableDensityTokens(density)
            expect(tokens.rowHeadWidth).toBe(tokens.iconSize * 4 + 16)
            expect(tokens.addColumnWidth).toBe(tokens.iconSize + 34)
        }
        const standard = resolveTableDensityTokens('default')
        expect(standard.rowHeadWidth).toBe(96)
        expect(standard.addColumnWidth).toBe(54)
    })

    it('三档密度数值互不相同且递增（紧凑 < 默认 < 宽松）', () => {
        const compact = resolveTableDensityTokens('compact')
        const standard = resolveTableDensityTokens('default')
        const spacious = resolveTableDensityTokens('spacious')
        expect(compact.rowHeight).toBeLessThan(standard.rowHeight)
        expect(standard.rowHeight).toBeLessThan(spacious.rowHeight)
        expect(compact.headerHeight).toBeLessThan(standard.headerHeight)
        expect(standard.headerHeight).toBeLessThan(spacious.headerHeight)
    })
})

describe('表格风格令牌（resolveTableStyleTokens）', () => {
    it('四种界面风格都有完整令牌，且颜色全部引用语义令牌/color-mix', () => {
        for (const style of UI_STYLE_VALUES) {
            const tokens = resolveTableStyleTokens(style)
            expect(tokens.borderColor).toMatch(/var\(--ui-|transparent/)
            expect(tokens.gridColor).toMatch(/var\(--ui-|transparent/)
            expect(tokens.headerBorderColor).toMatch(/var\(--ui-|transparent/)
            expect(tokens.headerBackground).toMatch(/var\(--ui-|transparent/)
            expect(tokens.bodyBackground).toMatch(/var\(--ui-|transparent/)
            expect(tokens.headerBackdropFilter.length).toBeGreaterThan(0)
        }
    })

    it('paper：边框与网格线用半透明 color-mix 减弱（边框轻）', () => {
        const tokens = resolveTableStyleTokens('paper')
        expect(tokens.borderColor).toContain('color-mix')
        expect(tokens.borderColor).toContain('60%')
        expect(tokens.gridColor).toContain('color-mix')
        expect(tokens.gridColor).toContain('45%')
        expect(tokens.headerBackdropFilter).toBe('none')
    })

    it('glass：列头/表体透明度由 --ui-surface-opacity 派生并启用小面积背景模糊', () => {
        const tokens = resolveTableStyleTokens('glass')
        expect(tokens.headerBackground).toContain('var(--ui-surface)')
        expect(tokens.headerBackground).toContain('--ui-surface-opacity')
        expect(tokens.bodyBackground).toContain('--ui-surface-opacity')
        expect(tokens.headerBackdropFilter).toBe('blur(var(--ui-surface-blur))')
    })

    it('glass steady（深色主题稳健模式）关闭列头模糊，避免灰蒙与无效合成层', () => {
        expect(resolveTableStyleTokens('glass', 'steady').headerBackdropFilter).toBe('none')
        expect(resolveTableStyleTokens('glass', 'flat').headerBackdropFilter).toBe('none')
        expect(resolveTableStyleTokens('glass', 'normal').headerBackdropFilter).toBe(
            'blur(var(--ui-surface-blur))'
        )
    })

    it('workbench：全量 hairline 网格 + border-strong 列头分区线（网格线更明显）', () => {
        const tokens = resolveTableStyleTokens('workbench')
        expect(tokens.borderColor).toBe('var(--ui-border)')
        expect(tokens.gridColor).toBe('var(--ui-border)')
        expect(tokens.headerBorderColor).toBe('var(--ui-border-strong)')
        expect(tokens.headerBackground).toBe('var(--ui-bg-elevated)')
    })

    it('hybrid：表格属工具区，材质与 workbench 完全一致', () => {
        expect(TABLE_STYLE_TOKENS.hybrid).toEqual(TABLE_STYLE_TOKENS.workbench)
        expect(resolveTableStyleTokens('hybrid')).toEqual(resolveTableStyleTokens('workbench'))
    })

    it('四种风格的令牌表互不共享可变引用（纯函数返回副本，调用方修改不污染真源）', () => {
        const tokens = resolveTableStyleTokens('workbench')
        tokens.gridColor = 'mutated'
        expect(resolveTableStyleTokens('workbench').gridColor).toBe('var(--ui-border)')
    })
})

describe('表格 CSS 变量表（buildTableCssVariables）', () => {
    it('覆盖四风格 × 三密度全组合，所有变量值非空', () => {
        for (const style of UI_STYLE_VALUES) {
            for (const density of UI_DENSITY_VALUES) {
                const variables = buildTableCssVariables(style, density)
                const entries = Object.entries(variables)
                expect(entries.length).toBeGreaterThanOrEqual(15)
                for (const [name, value] of entries) {
                    expect(name.startsWith('--table-')).toBe(true)
                    expect(typeof value).toBe('string')
                    expect(value.length).toBeGreaterThan(0)
                }
            }
        }
    })

    it('尺寸变量带 px 单位，且与密度令牌逐项一致（三档取样）', () => {
        for (const density of UI_DENSITY_VALUES) {
            const variables = buildTableCssVariables('workbench', density)
            const tokens = resolveTableDensityTokens(density)
            expect(variables['--table-row-height']).toBe(`${tokens.rowHeight}px`)
            expect(variables['--table-header-height']).toBe(`${tokens.headerHeight}px`)
            expect(variables['--table-cell-pad-x']).toBe(`${tokens.cellPadX}px`)
            expect(variables['--table-icon-size']).toBe(`${tokens.iconSize}px`)
            expect(variables['--table-control-height']).toBe(`${tokens.controlHeight}px`)
            expect(variables['--table-font-size']).toBe(`${tokens.fontSize}px`)
            expect(variables['--table-row-head-width']).toBe(`${tokens.rowHeadWidth}px`)
            expect(variables['--table-add-column-width']).toBe(`${tokens.addColumnWidth}px`)
        }
    })

    it('列宽拖拽手柄宽度固定 4px（与密度无关）', () => {
        expect(TABLE_RESIZER_WIDTH).toBe(4)
        for (const density of UI_DENSITY_VALUES) {
            expect(buildTableCssVariables('workbench', density)['--table-resizer-width']).toBe(
                '4px'
            )
        }
    })

    it('材质变量随风格切换：paper 边框更轻 / glass 有模糊 / workbench 网格更明显', () => {
        const paper = buildTableCssVariables('paper', 'default')
        const glass = buildTableCssVariables('glass', 'default')
        const workbench = buildTableCssVariables('workbench', 'default')
        expect(paper['--table-grid-color']).toContain('45%')
        expect(glass['--table-header-backdrop']).toContain('blur')
        expect(workbench['--table-header-border-color']).toBe('var(--ui-border-strong)')
        expect(workbench['--table-header-backdrop']).toBe('none')
    })
})

describe('单元格取值判定与显示（table-values）', () => {
    it('数字识别：整数/小数/符号/千分位/百分比/货币，空串不算数字', () => {
        for (const value of ['1', '-3', '+2.5', '1,234.56', '12%', '$9.9', '¥100']) {
            expect(isNumericCellValue(value)).toBe(true)
        }
        for (const value of ['', '   ', 'abc', '1 2', '1.2.3', '2024-01-05', '三']) {
            expect(isNumericCellValue(value)).toBe(false)
        }
    })

    it('日期归一化：多种分隔符/中文日期 → YYYY-MM-DD，非法日期返回 null', () => {
        expect(normalizeDateCellValue('2024-1-5')).toBe('2024-01-05')
        expect(normalizeDateCellValue('2024/01/05')).toBe('2024-01-05')
        expect(normalizeDateCellValue('2024.1.5')).toBe('2024-01-05')
        expect(normalizeDateCellValue(' 2024年1月5日 ')).toBe('2024-01-05')
        expect(normalizeDateCellValue('2024-13-01')).toBeNull()
        expect(normalizeDateCellValue('2024-01-32')).toBeNull()
        expect(normalizeDateCellValue('2024-01-05T10:00:00')).toBeNull()
        expect(normalizeDateCellValue('20240105')).toBeNull()
        expect(normalizeDateCellValue('')).toBeNull()
    })

    it('类别判定：空 > 任务 > 日期 > 数字 > 文本', () => {
        expect(detectTableCellKind('')).toBe('empty')
        expect(detectTableCellKind('   ')).toBe('empty')
        expect(detectTableCellKind('- [ ] 买牛奶')).toBe('task')
        expect(detectTableCellKind('- [x] 已完成')).toBe('task')
        expect(detectTableCellKind('2024/1/5')).toBe('date')
        expect(detectTableCellKind('12')).toBe('number')
        expect(detectTableCellKind('普通文本')).toBe('text')
    })

    it('显示文本：空单元格为空串而绝不显示 0', () => {
        expect(formatTableCellDisplay('')).toBe('')
        expect(formatTableCellDisplay('   ')).toBe('')
        expect(formatTableCellDisplay('')).not.toBe('0')
    })

    it('显示文本：日期统一 YYYY-MM-DD，任务标记剥离，多行折叠为单行', () => {
        expect(formatTableCellDisplay('2024/1/5')).toBe('2024-01-05')
        expect(formatTableCellDisplay('- [ ] 买牛奶')).toBe('买牛奶')
        expect(formatTableCellDisplay('- [x] 已完成')).toBe('已完成')
        expect(formatTableCellDisplay('第一行\n第二行')).toBe('第一行 第二行')
        expect(formatTableCellDisplay('换行<br>标签')).toBe('换行 标签')
        expect(formatTableCellDisplay('普通文本')).toBe('普通文本')
    })

    it('任务标记正则与组件既有任务切换语义一致', () => {
        expect(isTaskCellValue('- [ ] todo')).toBe(true)
        expect(isTaskCellValue('  - [x] done')).toBe(true)
        expect(isTaskCellValue('普通文本')).toBe(false)
        expect('- [ ] todo'.replace(TABLE_TASK_MARKER_PATTERN, '')).toBe('todo')
    })

    it('对齐推导：显式对齐优先；default 下数字/日期右对齐、文本/空左对齐', () => {
        expect(resolveTableCellAlign('12', 'default')).toBe('right')
        expect(resolveTableCellAlign('2024/1/5', 'default')).toBe('right')
        expect(resolveTableCellAlign('文本', 'default')).toBe('left')
        expect(resolveTableCellAlign('', 'default')).toBe('left')
        expect(resolveTableCellAlign('- [ ] 任务', 'default')).toBe('left')
        expect(resolveTableCellAlign('12', 'left')).toBe('left')
        expect(resolveTableCellAlign('文本', 'center')).toBe('center')
        expect(resolveTableCellAlign('文本', 'right')).toBe('right')
    })
})
