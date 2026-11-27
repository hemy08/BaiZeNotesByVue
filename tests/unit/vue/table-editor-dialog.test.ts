// @vitest-environment jsdom
/**
 * P0：统一表格编辑对话框（插入/编辑双模式、设置区、导入、增删行列、对齐、回写 Markdown）。
 * 1.5.5 视觉升级（P1-B3 / T8）追加：
 * - 四风格 × 三密度令牌：根节点 `--table-*` 变量 / `data-table-style` / `data-table-density`；
 * - 电子表格化键盘导航：方向键/Tab 移动、Enter/F2/双击进入编辑、Enter/Tab 提交并移动、
 *   Esc 取消并还原（不冒泡关闭对话框）；
 * - 显示层规则：数字右对齐、文本左对齐、日期统一 YYYY-MM-DD、空单元格不显示 0。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import { nextTick } from 'vue'
import type { VueWrapper } from '@vue/test-utils'
import { mount } from '@vue/test-utils'
import TableEditorDialog from '../../../src/renderer/src/components/dialogs/medium/table-editor/TableEditorDialog.vue'
import {
    createEmptyTable,
    parseMarkdownTableAtLine,
    type MarkdownTable
} from '../../../src/renderer/src/components/Markdown/table-markdown'
import { resetThemeStateForTesting, useTheme } from '../../../src/renderer/src/composables/useTheme'
import { UI_STYLE_VALUES } from '../../../src/shared/constants/ui-style'
import type { UiStyle } from '../../../src/shared/types/system'

function buildEditTable(): MarkdownTable {
    return parseMarkdownTableAtLine(
        ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n').split('\n'),
        0
    )!
}

function mountDialog(mode: 'insert' | 'edit' = 'edit', table?: MarkdownTable) {
    const initialTable = table ?? (mode === 'edit' ? buildEditTable() : createEmptyTable(2, 2))
    const onApply = vi.fn()
    const onClose = vi.fn()
    const wrapper = mount(TableEditorDialog, {
        props: { mode, table: initialTable, onApply, onClose },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    return { wrapper, onApply, onClose }
}

/** 列数（表头输入框数量 = 列数） */
function columnCount(wrapper: VueWrapper): number {
    return wrapper.findAll('.column-head').length
}

function bodyCell(wrapper: VueWrapper, rowIndex: number, columnIndex: number) {
    return wrapper.findAll('.body-cell')[rowIndex * columnCount(wrapper) + columnIndex]
}

/** 点击单元格激活选区（导航态） */
async function selectCell(wrapper: VueWrapper, rowIndex: number, columnIndex: number) {
    await bodyCell(wrapper, rowIndex, columnIndex).trigger('click')
    await nextTick()
}

/** 双击进入编辑态并返回 textarea */
async function enterEdit(wrapper: VueWrapper, rowIndex: number, columnIndex: number) {
    await bodyCell(wrapper, rowIndex, columnIndex).trigger('dblclick')
    await nextTick()
    return wrapper.find('.cell-textarea')
}

/** 进入编辑态、写入值并 Enter 提交（提交后选区下移） */
async function setCellValue(
    wrapper: VueWrapper,
    rowIndex: number,
    columnIndex: number,
    value: string
): Promise<void> {
    const textarea = await enterEdit(wrapper, rowIndex, columnIndex)
    await textarea.setValue(value)
    await textarea.trigger('keydown', { key: 'Enter' })
    await nextTick()
}

async function clickApply(wrapper: VueWrapper): Promise<void> {
    await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
}

beforeEach(() => {
    resetThemeStateForTesting()
})

afterEach(() => {
    resetThemeStateForTesting()
})

describe('TableEditorDialog 统一界面', () => {
    it('编辑模式：添加行列并应用，输出新 Markdown', async () => {
        const { wrapper, onApply } = mountDialog('edit')
        await wrapper.find('.add-row-btn').trigger('click')
        await wrapper.find('.add-column-btn').trigger('click')
        await clickApply(wrapper)
        expect(onApply).toHaveBeenCalledTimes(1)
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown.split('\n')).toHaveLength(4)
        expect(markdown).toContain('| 列 3 |')
        wrapper.unmount()
    })

    it('编辑模式：删除行/列并应用', async () => {
        const { wrapper, onApply } = mountDialog('edit')
        await wrapper.find('.row-head .icon-btn--danger').trigger('click')
        await wrapper.find('.column-head .icon-btn--danger').trigger('click')
        await clickApply(wrapper)
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown).toContain('| B |')
        expect(markdown.split('\n')).toHaveLength(2)
        wrapper.unmount()
    })

    it('插入模式：从空白表格开始，应用按钮为“插入表格”', async () => {
        const { wrapper, onApply } = mountDialog('insert')
        expect(wrapper.findAll('.table-editor-actions .dialog-btn')[1].text()).toBe('插入表格')
        // 表头输入框仍在导航态直接可编辑
        await wrapper.findAll('.header-input')[0].setValue('名称')
        await clickApply(wrapper)
        expect(onApply).toHaveBeenCalledTimes(1)
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown).toContain('| 名称 |')
        expect(markdown).toContain('| --- | --- |')
        wrapper.unmount()
    })

    it('取消不应用', async () => {
        const { wrapper, onApply, onClose } = mountDialog('edit')
        await wrapper.find('.table-editor-actions .dialog-btn').trigger('click')
        expect(onClose).toHaveBeenCalled()
        expect(onApply).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('表格设置：直接指定行列并统一所有列对齐', async () => {
        const { wrapper, onApply } = mountDialog('edit')
        const settingInputs = wrapper.findAll('.setting-input')
        await settingInputs[0].setValue('4')
        await settingInputs[0].trigger('change')
        await settingInputs[1].setValue('3')
        await settingInputs[1].trigger('change')
        await wrapper.findAll('.setting-select')[0].setValue('center')
        await clickApply(wrapper)
        const markdown = String(onApply.mock.calls[0][0])
        const lines = markdown.split('\n')
        expect(lines).toHaveLength(6)
        expect(lines[1]).toBe('| :---: | :---: | :---: |')
        wrapper.unmount()
    })

    it('每列对齐使用下拉框并可单独设置（列头操作区）', async () => {
        const { wrapper, onApply } = mountDialog('edit')
        const selects = wrapper.findAll('.column-align-select')
        expect(selects).toHaveLength(2)
        await selects[1].setValue('right')
        await clickApply(wrapper)
        expect(String(onApply.mock.calls[0][0])).toContain('| --- | ---: |')
        wrapper.unmount()
    })

    it('按指定列排序整行', async () => {
        const { wrapper, onApply } = mountDialog('edit')
        await wrapper.find('.add-row-btn').trigger('click')
        await setCellValue(wrapper, 1, 0, '3')
        await setCellValue(wrapper, 1, 1, '0')
        const selects = wrapper.findAll('.setting-select')
        // 0=统一对齐，1=排序列
        await selects[1].setValue('1')
        const sortButton = wrapper.findAll('.tool-btn').find((button) => button.text() === '降序')
        expect(sortButton).toBeTruthy()
        await sortButton!.trigger('click')
        await clickApply(wrapper)
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown.indexOf('| 1 | 2 |')).toBeLessThan(markdown.indexOf('| 3 | 0 |'))
        wrapper.unmount()
    })

    it('行列互换', async () => {
        const { wrapper, onApply } = mountDialog('edit')
        const transposeButton = wrapper
            .findAll('.tool-btn')
            .find((button) => button.text() === '行列互换')
        await transposeButton!.trigger('click')
        await clickApply(wrapper)
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown).toContain('| A | 1 |')
        expect(markdown).toContain('| B | 2 |')
        wrapper.unmount()
    })

    it('任务单元格显示复选框并可切换完成状态', async () => {
        const { wrapper, onApply } = mountDialog('insert')
        await setCellValue(wrapper, 0, 0, '- [ ] 买牛奶')
        const checkbox = wrapper.find('.task-checkbox')
        expect(checkbox.exists()).toBe(true)
        await checkbox.trigger('change')
        await clickApply(wrapper)
        expect(String(onApply.mock.calls[0][0])).toContain('- [x] 买牛奶')
        wrapper.unmount()
    })

    it('最后一格按 Tab 自动新增一行（保留 1.5.3 既有行为）', async () => {
        const { wrapper } = mountDialog('insert')
        expect(wrapper.findAll('.body-cell')).toHaveLength(4)
        await selectCell(wrapper, 1, 1)
        await wrapper.find('.table-editor-grid').trigger('keydown', { key: 'Tab' })
        await nextTick()
        expect(wrapper.findAll('.body-cell')).toHaveLength(6)
        wrapper.unmount()
    })

    it('从 CSV 文件导入表格内容', async () => {
        const { wrapper, onApply } = mountDialog('insert')
        const input = wrapper.find('input[type="file"]').element as HTMLInputElement
        const file = {
            name: 'data.csv',
            text: async () => '姓名,年龄\n张三,20\n李四,31'
        }
        Object.defineProperty(input, 'files', {
            configurable: true,
            value: [file as unknown as File]
        })
        await wrapper.find('input[type="file"]').trigger('change')
        await new Promise((resolve) => setTimeout(resolve, 20))
        const headerValues = wrapper
            .findAll('.header-input')
            .map((inputElement) => (inputElement.element as HTMLInputElement).value)
        expect(headerValues).toEqual(['姓名', '年龄'])
        const displayTexts = wrapper.findAll('.body-cell .cell-text').map((cell) => cell.text())
        expect(displayTexts).toContain('张三')
        await clickApply(wrapper)
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown).toContain('| 姓名 | 年龄 |')
        expect(markdown).toContain('| 张三 | 20 |')
        expect(markdown).toContain('| 李四 | 31 |')
        wrapper.unmount()
    })
})

describe('TableEditorDialog 电子表格化键盘导航', () => {
    it('网格具备 role=grid/tabindex 与 aria-activedescendant 选区语义', async () => {
        const { wrapper } = mountDialog('edit')
        const grid = wrapper.find('.table-editor-grid')
        expect(grid.attributes('role')).toBe('grid')
        expect(grid.attributes('tabindex')).toBe('0')
        expect(grid.attributes('aria-keyshortcuts')).toContain('ArrowUp')
        await selectCell(wrapper, 0, 0)
        expect(grid.attributes('aria-activedescendant')).toBe('table-editor-cell-0-0')
        expect(bodyCell(wrapper, 0, 0).attributes('aria-selected')).toBe('true')
        expect(bodyCell(wrapper, 0, 1).attributes('aria-selected')).toBe('false')
        wrapper.unmount()
    })

    it('方向键在单元格间移动选区（边界截断，不越界）', async () => {
        const { wrapper } = mountDialog('edit')
        // 编辑夹具只有 1 行数据，先补 1 行用于验证上下移动
        await wrapper.find('.add-row-btn').trigger('click')
        const grid = wrapper.find('.table-editor-grid')
        await selectCell(wrapper, 0, 0)
        await grid.trigger('keydown', { key: 'ArrowRight' })
        expect(grid.attributes('aria-activedescendant')).toBe('table-editor-cell-0-1')
        await grid.trigger('keydown', { key: 'ArrowDown' })
        expect(grid.attributes('aria-activedescendant')).toBe('table-editor-cell-1-1')
        await grid.trigger('keydown', { key: 'ArrowLeft' })
        expect(grid.attributes('aria-activedescendant')).toBe('table-editor-cell-1-0')
        await grid.trigger('keydown', { key: 'ArrowUp' })
        expect(grid.attributes('aria-activedescendant')).toBe('table-editor-cell-0-0')
        // 左上角继续向上/向左不越界
        await grid.trigger('keydown', { key: 'ArrowUp' })
        await grid.trigger('keydown', { key: 'ArrowLeft' })
        expect(grid.attributes('aria-activedescendant')).toBe('table-editor-cell-0-0')
        wrapper.unmount()
    })

    it('Tab 在行尾跨行回绕，Shift+Tab 反向回绕', async () => {
        const { wrapper } = mountDialog('edit')
        const grid = wrapper.find('.table-editor-grid')
        await selectCell(wrapper, 0, 1)
        await grid.trigger('keydown', { key: 'Tab' })
        expect(grid.attributes('aria-activedescendant')).toBe('table-editor-cell-1-0')
        await grid.trigger('keydown', { key: 'Tab', shiftKey: true })
        expect(grid.attributes('aria-activedescendant')).toBe('table-editor-cell-0-1')
        wrapper.unmount()
    })

    it('Enter / F2 / 双击进入编辑态，编辑框聚焦且带原始值', async () => {
        const { wrapper } = mountDialog('edit')
        await selectCell(wrapper, 0, 0)
        await wrapper.find('.table-editor-grid').trigger('keydown', { key: 'Enter' })
        await nextTick()
        const textarea = wrapper.find('.cell-textarea')
        expect(textarea.exists()).toBe(true)
        expect((textarea.element as HTMLTextAreaElement).value).toBe('1')
        await textarea.trigger('keydown', { key: 'Escape' })
        await nextTick()
        expect(wrapper.find('.cell-textarea').exists()).toBe(false)
        // F2 同样进入编辑
        await wrapper.find('.table-editor-grid').trigger('keydown', { key: 'F2' })
        await nextTick()
        expect(wrapper.find('.cell-textarea').exists()).toBe(true)
        wrapper.unmount()
    })

    it('编辑态 Esc 取消：还原原值、退出编辑且不冒泡关闭对话框', async () => {
        const { wrapper, onClose } = mountDialog('edit')
        const textarea = await enterEdit(wrapper, 0, 0)
        await textarea.setValue('被取消的新值')
        await textarea.trigger('keydown', { key: 'Escape' })
        await nextTick()
        expect(wrapper.find('.cell-textarea').exists()).toBe(false)
        expect(bodyCell(wrapper, 0, 0).text()).toBe('1')
        expect(onClose).not.toHaveBeenCalled()
        wrapper.unmount()
    })

    it('编辑态 Enter 提交并下移，Tab 提交并右移（值写入单元格）', async () => {
        const { wrapper } = mountDialog('edit')
        // 编辑夹具只有 1 行数据，先补 1 行用于验证 Enter 下移
        await wrapper.find('.add-row-btn').trigger('click')
        const grid = wrapper.find('.table-editor-grid')
        let textarea = await enterEdit(wrapper, 0, 0)
        await textarea.setValue('9')
        await textarea.trigger('keydown', { key: 'Enter' })
        await nextTick()
        expect(bodyCell(wrapper, 0, 0).text()).toBe('9')
        expect(grid.attributes('aria-activedescendant')).toBe('table-editor-cell-1-0')
        textarea = await enterEdit(wrapper, 0, 0)
        await textarea.setValue('8')
        await textarea.trigger('keydown', { key: 'Tab' })
        await nextTick()
        expect(bodyCell(wrapper, 0, 0).text()).toBe('8')
        expect(grid.attributes('aria-activedescendant')).toBe('table-editor-cell-0-1')
        wrapper.unmount()
    })

    it('编辑态点击/双击编辑框内部不退出编辑（保持输入焦点与 Esc 快照）', async () => {
        const { wrapper } = mountDialog('edit')
        const textarea = await enterEdit(wrapper, 0, 0)
        await textarea.setValue('编辑中的值')
        await textarea.trigger('click')
        await textarea.trigger('dblclick')
        await nextTick()
        expect(wrapper.find('.cell-textarea').exists()).toBe(true)
        // Esc 仍还原到进入编辑前的原始值（双击未重置快照）
        await wrapper.find('.cell-textarea').trigger('keydown', { key: 'Escape' })
        await nextTick()
        expect(bodyCell(wrapper, 0, 0).text()).toBe('1')
        wrapper.unmount()
    })

    it('Delete 清空当前单元格（表头不受影响）', async () => {
        const { wrapper, onApply } = mountDialog('edit')
        await selectCell(wrapper, 0, 0)
        await wrapper.find('.table-editor-grid').trigger('keydown', { key: 'Delete' })
        await nextTick()
        expect(bodyCell(wrapper, 0, 0).text()).toBe('')
        await clickApply(wrapper)
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown).toContain('| A | B |')
        expect(markdown.split('\n')[2]).toBe('|  | 2 |')
        wrapper.unmount()
    })
})

describe('TableEditorDialog 四风格 × 三密度', () => {
    function bodyElement(wrapper: VueWrapper): HTMLElement {
        return wrapper.find('.table-editor-body').element as HTMLElement
    }

    function tableVariable(wrapper: VueWrapper, name: string): string {
        return bodyElement(wrapper).style.getPropertyValue(name).trim()
    }

    it('默认 workbench + default：行高 28 / 列头 32 / workbench 全量网格', async () => {
        const { wrapper } = mountDialog('edit')
        expect(bodyElement(wrapper).dataset.tableStyle).toBe('workbench')
        expect(bodyElement(wrapper).dataset.tableDensity).toBe('default')
        expect(tableVariable(wrapper, '--table-row-height')).toBe('28px')
        expect(tableVariable(wrapper, '--table-header-height')).toBe('32px')
        expect(tableVariable(wrapper, '--table-grid-color')).toBe('var(--ui-border)')
        expect(tableVariable(wrapper, '--table-header-border-color')).toBe(
            'var(--ui-border-strong)'
        )
        expect(tableVariable(wrapper, '--table-resizer-width')).toBe('4px')
        wrapper.unmount()
    })

    it('四种风格：paper 边框轻 / glass 半透明+列头模糊 / workbench 网格 / hybrid=workbench', async () => {
        const expected: Record<UiStyle, { style: string; grid: string; backdrop: string }> = {
            paper: { style: 'paper', grid: '45%', backdrop: 'none' },
            glass: { style: 'glass', grid: '65%', backdrop: 'blur' },
            workbench: {
                style: 'workbench',
                grid: 'var(--ui-border)',
                backdrop: 'none'
            },
            hybrid: {
                style: 'hybrid',
                grid: 'var(--ui-border)',
                backdrop: 'none'
            }
        }
        for (const style of UI_STYLE_VALUES) {
            useTheme().applyUiAppearance({ uiStyle: style })
            const { wrapper } = mountDialog('edit')
            const body = bodyElement(wrapper)
            expect(body.dataset.tableStyle).toBe(expected[style].style)
            expect(tableVariable(wrapper, '--table-grid-color')).toContain(expected[style].grid)
            expect(tableVariable(wrapper, '--table-header-backdrop')).toContain(
                expected[style].backdrop
            )
            if (style === 'glass') {
                expect(tableVariable(wrapper, '--table-header-bg')).toContain(
                    '--ui-surface-opacity'
                )
            }
            if (style === 'paper' || style === 'workbench' || style === 'hybrid') {
                expect(tableVariable(wrapper, '--table-header-bg')).toBe('var(--ui-bg-elevated)')
            }
            wrapper.unmount()
        }
    })

    it('三档密度：compact 24/28、default 28/32、spacious 32/36', async () => {
        const expected = {
            compact: { row: '24px', header: '28px', control: '28px' },
            default: { row: '28px', header: '32px', control: '32px' },
            spacious: { row: '32px', header: '36px', control: '36px' }
        } as const
        for (const density of ['compact', 'default', 'spacious'] as const) {
            useTheme().applyUiAppearance({ uiDensity: density })
            const { wrapper } = mountDialog('edit')
            expect(bodyElement(wrapper).dataset.tableDensity).toBe(density)
            expect(tableVariable(wrapper, '--table-row-height')).toBe(expected[density].row)
            expect(tableVariable(wrapper, '--table-header-height')).toBe(expected[density].header)
            // 工具栏控件高随密度同步（按钮/输入框/下拉）
            expect(tableVariable(wrapper, '--table-control-height')).toBe(expected[density].control)
            wrapper.unmount()
        }
    })

    it('运行中切换风格/密度时表格令牌响应式更新（无需重挂载）', async () => {
        const { wrapper } = mountDialog('edit')
        expect(tableVariable(wrapper, '--table-row-height')).toBe('28px')
        useTheme().applyUiAppearance({ uiStyle: 'glass', uiDensity: 'spacious' })
        await nextTick()
        expect(bodyElement(wrapper).dataset.tableStyle).toBe('glass')
        expect(tableVariable(wrapper, '--table-row-height')).toBe('32px')
        expect(tableVariable(wrapper, '--table-header-height')).toBe('36px')
        wrapper.unmount()
    })

    it('glass 常规模式启用列头小面积模糊（透明降级规则见 table-style 单测）', async () => {
        useTheme().applyUiAppearance({ uiStyle: 'glass' })
        const { wrapper } = mountDialog('edit')
        expect(tableVariable(wrapper, '--table-header-backdrop')).toBe(
            'blur(var(--ui-surface-blur))'
        )
        // 背景模糊只作用于列头（悬浮层头部），表体不启用大面积 backdrop-filter
        expect(tableVariable(wrapper, '--table-body-bg')).toContain('--ui-surface-opacity')
        wrapper.unmount()
    })
})

describe('TableEditorDialog 显示层规则（数字/文本/日期/空值）', () => {
    function mountWithValues() {
        const table = parseMarkdownTableAtLine(
            [
                '| 数值 | 文本 | 日期 | 空白 |',
                '| --- | --- | --- | --- |',
                '| 123 | 普通文本 | 2024/1/5 |  |'
            ]
                .join('\n')
                .split('\n'),
            0
        )!
        return mountDialog('edit', table)
    }

    it('数字右对齐、文本左对齐、日期统一 YYYY-MM-DD、空单元格不显示 0', async () => {
        const { wrapper } = mountWithValues()
        const cells = wrapper.findAll('.body-cell')
        expect(cells[0].classes()).toContain('is-align-right')
        expect(cells[1].classes()).toContain('is-align-left')
        expect(cells[2].classes()).toContain('is-align-right')
        expect(cells[3].classes()).toContain('is-align-left')
        const texts = wrapper.findAll('.body-cell .cell-text').map((cell) => cell.text())
        expect(texts[0]).toBe('123')
        expect(texts[1]).toBe('普通文本')
        expect(texts[2]).toBe('2024-01-05')
        expect(texts[3]).toBe('')
        expect(texts[3]).not.toBe('0')
        wrapper.unmount()
    })

    it('列上有显式对齐时以显式对齐优先', async () => {
        const table = parseMarkdownTableAtLine(
            ['| 数值 | 文本 |', '| :--- | ---: |', '| 123 | 文本 |'].join('\n').split('\n'),
            0
        )!
        const { wrapper } = mountDialog('edit', table)
        const cells = wrapper.findAll('.body-cell')
        expect(cells[0].classes()).toContain('is-align-left')
        expect(cells[1].classes()).toContain('is-align-right')
        wrapper.unmount()
    })
})

describe('表格编辑器留白（用户反馈 2026-11-27）', () => {
    it('正文根节点 .table-editor-body 通过 --ui-pad 令牌提供内容与边框留白', () => {
        const source = fs.readFileSync(
            'src/renderer/src/components/dialogs/medium/table-editor/TableEditorDialog.vue',
            'utf8'
        )
        const rule = source.match(/\.table-editor-body\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
        expect(rule).toContain('padding: calc(var(--ui-pad')
    })
})
