// @vitest-environment jsdom
/**
 * P0：可视化表格编辑对话框（增删行列、对齐、回写 Markdown）。
 */
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import TableEditorDialog from '../../../src/renderer/src/components/dialogs/medium/table-editor/TableEditorDialog.vue'
import { parseMarkdownTableAtLine } from '../../../src/renderer/src/components/Markdown/table-markdown'

function mountDialog() {
    const table = parseMarkdownTableAtLine(
        ['| A | B |', '| --- | --- |', '| 1 | 2 |'].join('\n').split('\n'),
        0
    )!
    const onApply = vi.fn()
    const onClose = vi.fn()
    const wrapper = mount(TableEditorDialog, {
        props: { table, onApply, onClose },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    return { wrapper, onApply, onClose }
}

describe('TableEditorDialog', () => {
    it('添加行列并应用，输出新 Markdown', async () => {
        const { wrapper, onApply } = mountDialog()
        await wrapper.find('.add-row-btn').trigger('click')
        const addColumn = wrapper.findAll('.column-add .icon-btn')[0]
        await addColumn.trigger('click')
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
        expect(onApply).toHaveBeenCalledTimes(1)
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown.split('\n')).toHaveLength(4)
        expect(markdown).toContain('| 列 3 |')
        wrapper.unmount()
    })

    it('删除行/列并应用', async () => {
        const { wrapper, onApply } = mountDialog()
        await wrapper.findAll('.row-actions .icon-btn')[0].trigger('click')
        const deleteColumn = wrapper.findAll('.column-tools .icon-btn')[0]
        await deleteColumn.trigger('click')
        await wrapper.findAll('.table-editor-actions .dialog-btn')[1].trigger('click')
        const markdown = String(onApply.mock.calls[0][0])
        expect(markdown).toContain('| B |')
        expect(markdown.split('\n')).toHaveLength(2)
        wrapper.unmount()
    })

    it('取消不应用', async () => {
        const { wrapper, onApply, onClose } = mountDialog()
        await wrapper.find('.table-editor-actions .dialog-btn').trigger('click')
        expect(onClose).toHaveBeenCalled()
        expect(onApply).not.toHaveBeenCalled()
        wrapper.unmount()
    })
})
