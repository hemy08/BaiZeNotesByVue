// @vitest-environment jsdom
/**
 * P1-CQ-2 / AS-3 回归测试：MermaidEditDialog 预览区 DOM XSS。
 *
 * 背景：预览区此前把 textarea 内容原样拼进 `<div class="mermaid">` 再 `v-html`，
 * 粘贴 `<img onerror>` / `<script>` 即形成 DOM 注入面（CSP 当时仅缓解、非根治）。
 *
 * 修复：移除 v-html，预览改为 `<pre>` + 文本插值（Vue 自动转义）。
 * 覆盖点：
 * 1. 正常 Mermaid 源码按原文展示（换行/缩进保留）；
 * 2. 恶意 HTML 载荷只作为纯文本出现，DOM 中无可执行元素/事件属性；
 * 3. 插入/取消 emit 行为正确，且插入的是原始源码（预览转义不影响插入内容）。
 *
 * FE-15 追加覆盖（task-23）：
 * 4. 预览区语义改为「源码预览」并在 UI 标注（不再让用户误以为应渲染图形）；
 * 5. 插入后同时 emit close（插入即关闭对话框），取消仍只 emit close；
 * 6. 预览区保持纯文本 <pre> 实现，task-17 的 XSS 安全修复不回退。
 */
import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

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

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
})

describe('MermaidEditDialog 预览区（P1-CQ-2 / AS-3）', () => {
    it('初始显示占位预览，输入后以 <pre> 原文展示 Mermaid 源码', async () => {
        const dialog = mountDialog()

        // 未输入前保持原有占位提示
        expect(dialog.find('.preview-area .placeholder').exists()).toBe(true)
        expect(dialog.find('.preview-area .mermaid').exists()).toBe(false)

        const code = 'graph TD\n  A[开始] --> B{判断}\n  B -->|是| C[结束]'
        await dialog.find('textarea.code-editor').setValue(code)

        const preview = dialog.find('.preview-area .mermaid')
        expect(preview.exists()).toBe(true)
        // P1-CQ-2：预览容器是纯文本 <pre>，不再承载任意 HTML
        expect(preview.element.tagName).toBe('PRE')
        // 换行/缩进完整保留（此前 v-html 下 HTML 会折叠空白）
        expect(preview.element.textContent).toBe(code)
        expect(preview.find('img, script, iframe').exists()).toBe(false)
    })

    it('恶意 HTML 载荷只作为转义文本展示，不产生可执行元素', async () => {
        const dialog = mountDialog()
        const payload =
            '<img src=x onerror="window.__mermaidEditXss = 1"><script>window.__mermaidEditXss = 2</script>'

        await dialog.find('textarea.code-editor').setValue(payload)

        const previewArea = dialog.find('.preview-area')
        // 1) 不出现可执行元素 / 事件属性
        expect(previewArea.find('img').exists()).toBe(false)
        expect(previewArea.find('script').exists()).toBe(false)
        expect(previewArea.find('[onerror]').exists()).toBe(false)
        expect(
            (previewArea.element as HTMLElement).querySelectorAll(
                'img, script, iframe, object, embed, svg'
            )
        ).toHaveLength(0)
        // 2) 载荷以纯文本原文可见（说明是被转义展示，而不是被静默丢弃）
        const preview = dialog.find('.preview-area .mermaid')
        expect(preview.element.textContent).toBe(payload)
        expect(preview.element.innerHTML).toContain('&lt;img')
        expect(preview.element.innerHTML).toContain('&lt;script')
        expect(preview.element.innerHTML).not.toContain('<img')
        expect(preview.element.innerHTML).not.toContain('<script')
        // 3) 注入的全局标记不存在（jsdom 中若产生可执行节点会留下痕迹）
        expect(
            (window as unknown as { __mermaidEditXss?: number }).__mermaidEditXss
        ).toBeUndefined()
    })

    it('插入仍 emit 原始源码并同时 emit close（FE-15：插入即关闭）', async () => {
        const dialog = mountDialog()
        const payload = '<img src=x onerror=alert(1)>'
        await dialog.find('textarea.code-editor').setValue(payload)

        // 预览侧已转义（无可执行节点）
        expect(dialog.find('.preview-area img').exists()).toBe(false)

        // 插入的数据仍是原始 Mermaid 源码，不做二次转义（下游 Monaco 按文本插入）
        await dialog.find('.btn-primary').trigger('click')
        expect(dialog.emitted('insert')).toHaveLength(1)
        expect(dialog.emitted('insert')![0][0]).toBe(payload)
        // FE-15：插入后同时 emit close，由父组件 hideDialog 关闭对话框
        expect(dialog.emitted('close')).toHaveLength(1)
    })

    it('取消仍只 emit close（不 emit insert）', async () => {
        const dialog = mountDialog()
        await dialog.find('.btn-cancel').trigger('click')
        expect(dialog.emitted('close')).toHaveLength(1)
        expect(dialog.emitted('insert')).toBeUndefined()
    })
})

describe('MermaidEditDialog 源码预览语义（FE-15）', () => {
    it('预览区标题与说明明确标注为源码预览，而不是图形渲染', () => {
        const dialog = mountDialog()

        // FE-15：原「预览」文案易被误认为图形预览；现已改为「源码预览」并附说明
        expect(dialog.find('.preview-section .section-header h3').text()).toBe('源码预览')
        const hint = dialog.find('.preview-area .preview-hint')
        expect(hint.exists()).toBe(true)
        expect(hint.text()).toContain('仅预览 Mermaid 源码文本')
    })

    it('预览区保持纯文本实现（不产生 SVG/图形容器，task-17 安全修复不回退）', async () => {
        const dialog = mountDialog()
        await dialog.find('textarea.code-editor').setValue('graph TD\n  A --> B')

        expect(dialog.find('.preview-area svg').exists()).toBe(false)
        const preview = dialog.find('.preview-area .mermaid')
        expect(preview.element.tagName).toBe('PRE')
        expect(preview.element.textContent).toBe('graph TD\n  A --> B')
    })
})
