// @vitest-environment jsdom
/**
 * P0：统一表格编辑对话框（插入/编辑双模式、增删行列、对齐、回写 Markdown）。
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
        await wrapper.findAll('.row-head .icon-btn')[0].trigger('click')
        await wrapper.find('.column-head .icon-btn').trigger('click')
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown).toContain('| B |')
        expect(markdown.split('\n')).toHaveLength(2)
        wrapper.unmount()
    })

    it('插入模式：从空白表格开始，应用按钮为“插入表格”', async () => {
        const { wrapper, onApply } = mountDialog('insert')
        expect(wrapper.find('.mode-badge').text()).toContain('插入表格')
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

    it('对齐按钮切换列对齐', async () => {
        const { wrapper, onApply } = mountDialog('edit')
        await wrapper.findAll('.align-btn')[2].trigger('click')
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
        expect(String(onApply.mock.calls[0][0])).toContain('| :---: | --- |')
        wrapper.unmount()
    })
})
