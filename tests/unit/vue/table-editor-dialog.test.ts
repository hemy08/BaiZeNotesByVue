// @vitest-environment jsdom
/**
 * P0：统一表格编辑对话框（插入/编辑双模式、设置区、导入、增删行列、对齐、回写 Markdown）。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TableEditorDialog from '../../../src/renderer/src/components/dialogs/medium/table-editor/TableEditorDialog.vue'
import {
    createEmptyTable,
    parseMarkdownTableAtLine
} from '../../../src/renderer/src/components/Markdown/table-markdown'

function mountDialog(mode: 'insert' | 'edit' = 'edit') {
    const table =
        mode === 'edit'
            ? parseMarkdownTableAtLine(
                  ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n').split('\n'),
                  0
              )!
            : createEmptyTable(2, 2)
    const onApply = vi.fn()
    const onClose = vi.fn()
    const wrapper = mount(TableEditorDialog, {
        props: { mode, table, onApply, onClose },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    return { wrapper, onApply, onClose }
}

describe('TableEditorDialog 统一界面', () => {
    it('编辑模式：添加行列并应用，输出新 Markdown', async () => {
        const { wrapper, onApply } = mountDialog('edit')
        await wrapper.find('.add-row-btn').trigger('click')
        await wrapper.find('.add-column-btn').trigger('click')
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
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
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown).toContain('| B |')
        expect(markdown.split('\n')).toHaveLength(2)
        wrapper.unmount()
    })

    it('插入模式：从空白表格开始，应用按钮为“插入表格”', async () => {
        const { wrapper, onApply } = mountDialog('insert')
        expect(wrapper.findAll('.table-editor-actions .dialog-btn')[1].text()).toBe('插入表格')
        const inputs = wrapper.findAll('.cell-input')
        await inputs[0].setValue('名称')
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
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
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
        const markdown = String(onApply.mock.calls[0][0])
        const lines = markdown.split('\n')
        expect(lines).toHaveLength(6)
        expect(lines[1]).toBe('| :---: | :---: | :---: |')
        wrapper.unmount()
    })

    it('每列对齐使用下拉框并可单独设置', async () => {
        const { wrapper, onApply } = mountDialog('edit')
        const selects = wrapper.findAll('.column-align-select')
        expect(selects).toHaveLength(2)
        await selects[1].setValue('right')
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
        expect(String(onApply.mock.calls[0][0])).toContain('| --- | ---: |')
        wrapper.unmount()
    })

    it('按指定列排序整行', async () => {
        const { wrapper, onApply } = mountDialog('edit')
        await wrapper.find('.add-row-btn').trigger('click')
        const cells = wrapper.findAll('.cell-textarea')
        await cells[2].setValue('3')
        await cells[3].setValue('0')
        const selects = wrapper.findAll('.setting-select')
        // 0=统一对齐，1=排序列
        await selects[1].setValue('1')
        const sortButton = wrapper.findAll('.tool-btn').find((button) => button.text() === '降序')
        expect(sortButton).toBeTruthy()
        await sortButton!.trigger('click')
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
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
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown).toContain('| A | 1 |')
        expect(markdown).toContain('| B | 2 |')
        wrapper.unmount()
    })

    it('任务单元格显示复选框并可切换完成状态', async () => {
        const { wrapper, onApply } = mountDialog('insert')
        const firstCell = wrapper.findAll('.cell-textarea')[0]
        await firstCell.setValue('- [ ] 买牛奶')
        const checkbox = wrapper.find('.task-checkbox')
        expect(checkbox.exists()).toBe(true)
        await checkbox.trigger('change')
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
        expect(String(onApply.mock.calls[0][0])).toContain('- [x] 买牛奶')
        wrapper.unmount()
    })

    it('最后一格按 Tab 自动新增一行', async () => {
        const { wrapper } = mountDialog('insert')
        const cells = wrapper.findAll('.cell-textarea')
        expect(cells).toHaveLength(4)
        await cells[cells.length - 1].trigger('keydown', { key: 'Tab' })
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(wrapper.findAll('.cell-textarea')).toHaveLength(6)
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
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown).toContain('| 姓名 | 年龄 |')
        expect(markdown).toContain('| 张三 | 20 |')
        expect(markdown).toContain('| 李四 | 31 |')
        wrapper.unmount()
    })
})
