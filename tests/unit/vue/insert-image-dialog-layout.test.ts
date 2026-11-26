// @vitest-environment jsdom
/**
 * P0：图片插入增强（宽度/对齐/图注）。
 */
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import InsertImageDialog from '../../../src/renderer/src/components/dialogs/medium/InsertImageDialog.vue'

function mountDialog() {
    return mount(InsertImageDialog, {
        props: {
            visible: true,
            pickedImage: { filePath: 'C:\\docs\\a.png', imageSrc: './images/a.png' }
        },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
}

describe('InsertImageDialog P0 版式', () => {
    it('默认输出标准 Markdown 图片语法', async () => {
        const wrapper = mountDialog()
        await wrapper.find('.btn-confirm').trigger('click')
        const emitted = wrapper.emitted('insert')!
        expect(emitted[0][0]).toBe('![image](./images/a.png)')
        wrapper.unmount()
    })

    it('设置宽度/对齐/图注时输出 figure/img/figcaption', async () => {
        const wrapper = mountDialog()
        const inputs = wrapper.findAll('.text-input')
        // 顺序：本地路径、alt、title、width、caption
        await inputs[1].setValue('截图')
        await wrapper.find('.image-width-input').setValue('320')
        await wrapper.find('.image-align-select').setValue('center')
        await wrapper.find('.image-caption-input').setValue('图 1 示例')
        await wrapper.find('.btn-confirm').trigger('click')
        const markdown = String(wrapper.emitted('insert')![0][0])
        expect(markdown).toContain('<figure style="text-align:center">')
        expect(markdown).toContain('width:320px')
        expect(markdown).toContain('display:block;margin:0 auto')
        expect(markdown).toContain('<figcaption>图 1 示例</figcaption>')
        expect(markdown).toContain('alt="截图"')
        wrapper.unmount()
    })
})
