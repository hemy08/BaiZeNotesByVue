// @vitest-environment jsdom
/**
 * MermaidEditDialog 预览渲染测试。
 *
 * 安全边界：Mermaid strict + htmlLabels:false；SVG 输出必须经 SanitizePreviewHtml
 * （DOMPurify 唯一入口）后再 v-html。本文件用 mermaid 替身验证渲染接线与 XSS 清洗，
 * 真实图形渲染由预览链路测试覆盖。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'

const mermaidMocks = vi.hoisted(() => ({
    initialize: vi.fn(),
    render: vi.fn()
}))

vi.mock('mermaid', () => ({
    default: {
        initialize: mermaidMocks.initialize,
        render: mermaidMocks.render
    }
}))

import MermaidEditDialog from '@renderer/components/dialogs/complex/MermaidEditDialog.vue'

const dialogMountOptions = { global: { stubs: { teleport: true } } }
let wrapper: VueWrapper | null = null

function mountDialog(): VueWrapper {
    wrapper = mount(MermaidEditDialog, {
        ...dialogMountOptions,
        props: { visible: true }
    })
    return wrapper
}

async function flushPreview(): Promise<void> {
    await vi.runAllTimersAsync()
    await flushPromises()
}

beforeEach(() => {
    vi.useFakeTimers()
    mermaidMocks.initialize.mockClear()
    mermaidMocks.render.mockReset()
    mermaidMocks.render.mockResolvedValue({
        svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>流程图</text></svg>'
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
})

describe('MermaidEditDialog 图表预览', () => {
    it('初始渲染 Mermaid 图表，使用 strict/htmlLabels:false 配置', async () => {
        const dialog = mountDialog()
        await flushPreview()

        expect(mermaidMocks.initialize).toHaveBeenCalledWith(
            expect.objectContaining({
                startOnLoad: false,
                securityLevel: 'strict',
                htmlLabels: false
            })
        )
        expect(mermaidMocks.render).toHaveBeenCalledTimes(1)
        expect(dialog.find('.preview-area .mermaid-preview svg').exists()).toBe(true)
        expect(dialog.find('.preview-area .placeholder').exists()).toBe(false)
    })

    it('输入后防抖重渲染，源码围栏/语言标记被规范化', async () => {
        const dialog = mountDialog()
        await flushPreview()
        mermaidMocks.render.mockClear()

        await dialog
            .find('textarea.code-editor')
            .setValue('```mermaid\nflowchart TD\n  A --> B\n```')
        await flushPreview()

        expect(mermaidMocks.render).toHaveBeenCalledTimes(1)
        expect(mermaidMocks.render.mock.calls[0][1]).toBe('flowchart TD\n  A --> B')
        expect(dialog.find('.preview-area .mermaid-preview svg').exists()).toBe(true)
    })

    it('渲染失败显示错误信息，不产生 SVG', async () => {
        mermaidMocks.render.mockRejectedValue(new Error('Parse error: bad diagram'))
        const dialog = mountDialog()
        await flushPreview()

        const error = dialog.find('.preview-area .preview-error')
        expect(error.exists()).toBe(true)
        expect(error.text()).toContain('Mermaid 渲染失败')
        expect(error.text()).toContain('Parse error: bad diagram')
        expect(dialog.find('.preview-area .mermaid-preview svg').exists()).toBe(false)
    })

    it('恶意 SVG/HTML 经消毒后不产生可执行节点', async () => {
        mermaidMocks.render.mockResolvedValue({
            svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__mermaidXss = 1</script><text>safe</text><foreignObject><img src=x onerror="window.__mermaidXss = 2"></foreignObject></svg>'
        })
        const dialog = mountDialog()
        await flushPreview()

        const preview = dialog.find('.preview-area')
        expect(preview.find('script').exists()).toBe(false)
        expect(preview.find('[onerror]').exists()).toBe(false)
        expect((window as unknown as { __mermaidXss?: number }).__mermaidXss).toBeUndefined()
        expect(preview.text()).toContain('safe')
    })

    it('清空源码后显示占位提示', async () => {
        const dialog = mountDialog()
        await flushPreview()
        await dialog.find('textarea.code-editor').setValue('')
        await flushPreview()

        expect(dialog.find('.preview-area .placeholder').exists()).toBe(true)
        expect(dialog.find('.preview-area .mermaid-preview').exists()).toBe(false)
    })

    it('插入仍 emit 原始源码并同时 emit close', async () => {
        const dialog = mountDialog()
        const payload = 'graph TD\n  A --> B'
        await dialog.find('textarea.code-editor').setValue(payload)

        await dialog.find('.btn-primary').trigger('click')
        expect(dialog.emitted('insert')).toHaveLength(1)
        expect(dialog.emitted('insert')![0][0]).toBe(payload)
        expect(dialog.emitted('close')).toHaveLength(1)
    })

    it('取消仍只 emit close（不 emit insert）', async () => {
        const dialog = mountDialog()
        await dialog.find('.btn-cancel').trigger('click')
        expect(dialog.emitted('close')).toHaveLength(1)
        expect(dialog.emitted('insert')).toBeUndefined()
    })
})

describe('MermaidEditDialog 预览区文案', () => {
    it('标题与说明明确为图表预览', () => {
        const dialog = mountDialog()
        expect(dialog.find('.preview-section .section-header h3').text()).toBe('图表预览')
        expect(dialog.find('.preview-area .preview-hint').text()).toContain('实时渲染 Mermaid 图表')
    })
})
