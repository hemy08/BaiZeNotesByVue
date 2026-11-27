// @vitest-environment jsdom
/**
 * 未命名草稿确认框：三个按钮的 emit 语义与默认焦点。
 */
import { afterEach, describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import UntitledDraftDialog from '@renderer/components/dialogs/simple/UntitledDraftDialog.vue'

describe('UntitledDraftDialog', () => {
    let wrapper: ReturnType<typeof mount> | null = null

    afterEach(() => {
        wrapper?.unmount()
        wrapper = null
        document.body.innerHTML = ''
    })

    function mountDialog() {
        wrapper = mount(UntitledDraftDialog, {
            attachTo: document.body,
            global: { stubs: { teleport: true } }
        })
        return wrapper
    }

    it('展示保存/不保存/取消三个动作', () => {
        const mounted = mountDialog()
        expect(mounted.find('.dialog-container').exists()).toBe(true)
        expect(mounted.find('.btn-save').text()).toBe('保存并打开')
        expect(mounted.find('.btn-discard').text()).toBe('不保存')
        expect(mounted.find('.btn-cancel').text()).toBe('取消')
    })

    it('点击按钮分别 emit save/discard/cancel', async () => {
        const mounted = mountDialog()
        await mounted.find('.btn-save').trigger('click')
        await mounted.find('.btn-discard').trigger('click')
        await mounted.find('.btn-cancel').trigger('click')

        expect(mounted.emitted('save')).toHaveLength(1)
        expect(mounted.emitted('discard')).toHaveLength(1)
        expect(mounted.emitted('cancel')).toHaveLength(1)
    })

    it('右上角关闭按钮映射为取消', async () => {
        const mounted = mountDialog()
        await nextTick()
        await mounted.find('.close-btn').trigger('click')
        expect(mounted.emitted('cancel')).toHaveLength(1)
    })
})
