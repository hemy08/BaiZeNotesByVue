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
import InfoTip from '@renderer/components/common/InfoTip.vue'

const dialogMountOptions = {
    global: { stubs: { teleport: true } },
    // 挂在 document.body 上：非模态工具窗「打开聚焦首个可交互元素 / Esc 焦点语义」
    // 依赖真实 document.activeElement（游离 DOM 的 focus() 不会写入 activeElement）。
    attachTo: document.body
}
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
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
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
    it('标题明确为图表预览，说明收进标题旁 ⓘ（不再常显段落）', () => {
        const dialog = mountDialog()
        expect(dialog.find('.preview-section .section-header h3').text()).toBe('图表预览')
        // 1.5.6 UI 简洁化：预览说明改为标题旁 InfoTip，原预览区顶部常显段落移除
        expect(dialog.find('.preview-area .preview-hint').exists()).toBe(false)
        const tip = dialog.findComponent(InfoTip)
        expect(tip.exists()).toBe(true)
        expect(tip.props('text')).toContain('实时渲染 Mermaid 图表')
        expect(tip.props('ariaLabel')).toContain('图表预览')
    })

    it('渲染失败等错误提示仍常显（不迁移为 ⓘ）', async () => {
        mermaidMocks.render.mockRejectedValue(new Error('Parse error: bad diagram'))
        const dialog = mountDialog()
        await flushPreview()

        const error = dialog.find('.preview-area .preview-error')
        expect(error.exists()).toBe(true)
        expect(error.text()).toContain('Mermaid 渲染失败')
    })
})

describe('MermaidEditDialog 非模态工具窗', () => {
    it('点击遮罩不关闭，点击关闭按钮才关闭', async () => {
        const dialog = mountDialog()
        await dialog.find('.dialog-overlay').trigger('click')
        expect(dialog.emitted('close')).toBeUndefined()

        await dialog.find('.close-btn').trigger('click')
        expect(dialog.emitted('close')).toHaveLength(1)
    })

    it('点击外部可穿透（遮罩 pointer-events:none、背景透明）', () => {
        const dialog = mountDialog()
        const overlayStyle = dialog.find('.dialog-overlay').attributes('style') ?? ''
        expect(overlayStyle).toContain('pointer-events: none')
        expect(overlayStyle).toContain('background: transparent')
        expect(dialog.find('.dialog-container').attributes('aria-modal')).toBe('false')
        expect(dialog.find('.dialog-container').attributes('style') ?? '').toContain(
            'pointer-events: auto'
        )
    })

    it('Esc 仅在焦点位于工具窗内时关闭（焦点在编辑器时不打断）', async () => {
        const dialog = mountDialog()
        // 打开聚焦内容首个可交互元素（源码输入框，T6 焦点契约）
        await flushPromises()
        const textarea = dialog.find('textarea.code-editor').element as HTMLTextAreaElement
        expect(document.activeElement).toBe(textarea)

        // 焦点在编辑器（工具窗外）时，Esc 属于编辑器语义：不拦截、不关闭
        const editorButton = document.createElement('button')
        document.body.appendChild(editorButton)
        editorButton.focus()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flushPromises()
        expect(dialog.emitted('close')).toBeUndefined()

        // 焦点回到工具窗内：Esc 关闭最顶层工具窗（焦点陷阱不适用，但顶层层级语义保留）
        textarea.focus()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await flushPromises()
        expect(dialog.emitted('close')).toHaveLength(1)
    })

    it('工具窗统一壳：拖拽把手 + 工具窗标题栏 + aria-modal=false', () => {
        const dialog = mountDialog()
        expect(dialog.find('.dialog-container').classes()).toContain(
            'dialog-container--tool-window'
        )
        expect(dialog.find('.dialog-container').attributes('data-dialog-shell')).toBe('tool-window')
        expect(dialog.find('.title-bar').classes()).toContain('title-bar--tool-window')
        // T6 标题栏左侧 6 点拖拽把手（aria-hidden，不进无障碍树）
        const handle = dialog.find('.tool-window-drag-handle')
        expect(handle.exists()).toBe(true)
        expect(handle.attributes('aria-hidden')).toBe('true')
        expect(dialog.find('.dialog-container').attributes('aria-modal')).toBe('false')
    })

    it('容器宽高限制在窗口可视区内（T6 缩放边界）', () => {
        const dialog = mountDialog()
        const style = dialog.find('.dialog-container').attributes('style') ?? ''
        expect(style).toContain('max-width: calc(100vw - 20px)')
        expect(style).toContain('max-height: calc(100vh - 20px)')
    })

    it('右下角提供拖拽缩放柄', () => {
        const dialog = mountDialog()
        expect(dialog.find('.main-container .resize-grip').exists()).toBe(true)
    })
})
