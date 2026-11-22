// @vitest-environment jsdom
/**
 * P0 写作模式宿主：配置开关门控、布局 class、控制条交互、退出恢复。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import WritingModeHost from '../../../src/renderer/src/components/Markdown/WritingModeHost.vue'
import { useFeatureFlags } from '../../../src/renderer/src/composables/useFeatureFlags'
import {
    WRITING_MODE_DEFAULTS,
    writingModeState
} from '../../../src/renderer/src/components/Markdown/useWritingMode'
import { writingSessionState } from '../../../src/renderer/src/components/Markdown/useWritingSession'

function makeDom(): void {
    document.body.innerHTML = ''
    const root = document.createElement('div')
    root.id = 'editor-container'
    const editor = document.createElement('div')
    editor.id = 'md-edit-component'
    root.appendChild(editor)
    document.body.appendChild(root)
}

describe('WritingModeHost', () => {
    const { flags } = useFeatureFlags()

    beforeEach(() => {
        Object.assign(writingModeState, WRITING_MODE_DEFAULTS)
        localStorage.clear()
        makeDom()
    })

    afterEach(() => {
        document.body.innerHTML = ''
        Object.assign(writingModeState, WRITING_MODE_DEFAULTS)
        flags.writingMode = false
        flags.writingTypewriter = false
        flags.writingFocus = false
        flags.writingStats = false
        flags.writingTypography = false
    })

    it('配置关闭时不渲染控制条，且不进入写作模式布局', async () => {
        flags.writingMode = false
        const wrapper = mount(WritingModeHost)
        await flushPromises()
        expect(wrapper.find('.writing-mode-host').exists()).toBe(false)
        expect(
            document.getElementById('editor-container')?.classList.contains('writing-mode-active')
        ).toBe(false)
        wrapper.unmount()
    })

    it('开启配置后按状态显示控制条、打字机/焦点/排版/目标开关', async () => {
        flags.writingMode = true
        flags.writingTypewriter = true
        flags.writingFocus = true
        flags.writingTypography = true
        flags.writingStats = true
        writingModeState.enabled = true
        writingSessionState.goal.dailyGoal = 1200
        writingSessionState.goal.written = 300
        const wrapper = mount(WritingModeHost)
        await flushPromises()
        expect(wrapper.find('.writing-mode-host').exists()).toBe(true)
        expect(
            document.getElementById('editor-container')?.classList.contains('writing-mode-active')
        ).toBe(true)
        expect(
            document
                .getElementById('editor-container')
                ?.classList.contains('writing-typography-active')
        ).toBe(true)
        expect(wrapper.findAll('.writing-chip')).toHaveLength(5)
        expect(wrapper.find('.writing-goal').text()).toContain('300')
        // 排版设置面板可打开
        await wrapper.findAll('.writing-chip')[2].trigger('click')
        expect(wrapper.find('.writing-settings').exists()).toBe(true)
        // 工具栏/预览为写作模式内可切换项，默认关闭
        await wrapper.findAll('.writing-chip')[3].trigger('click')
        expect(writingModeState.showToolbar).toBe(true)
        expect(
            document
                .getElementById('editor-container')
                ?.classList.contains('writing-toolbar-visible')
        ).toBe(true)
        await wrapper.findAll('.writing-chip')[4].trigger('click')
        expect(writingModeState.showPreview).toBe(true)
        expect(
            document
                .getElementById('editor-container')
                ?.classList.contains('writing-preview-active')
        ).toBe(true)
        // 退出按钮关闭写作模式并移除布局 class
        await wrapper.find('.writing-exit').trigger('click')
        await flushPromises()
        expect(writingModeState.enabled).toBe(false)
        expect(
            document.getElementById('editor-container')?.classList.contains('writing-mode-active')
        ).toBe(false)
        wrapper.unmount()
    })

    it('开关关闭会强制退出写作模式，卸载时清理内联宽度', async () => {
        flags.writingMode = true
        flags.writingTypography = true
        writingModeState.enabled = true
        const wrapper = mount(WritingModeHost)
        await flushPromises()
        expect(
            document
                .getElementById('editor-container')
                ?.classList.contains('writing-typography-active')
        ).toBe(true)
        flags.writingMode = false
        await flushPromises()
        expect(writingModeState.enabled).toBe(false)
        expect(
            document.getElementById('editor-container')?.classList.contains('writing-mode-active')
        ).toBe(false)
        wrapper.unmount()
    })

    it('打字机/段落聚焦可切换，排版面板可调参数并恢复默认', async () => {
        flags.writingMode = true
        flags.writingTypewriter = true
        flags.writingFocus = true
        flags.writingTypography = true
        flags.writingStats = true
        writingModeState.enabled = true
        const wrapper = mount(WritingModeHost)
        await flushPromises()

        const chips = wrapper.findAll('.writing-chip')
        await chips[0].trigger('click')
        await chips[1].trigger('click')
        expect(writingModeState.typewriter).toBe(false)
        expect(writingModeState.focusParagraph).toBe(false)

        await chips[2].trigger('click')
        const inputs = wrapper.findAll('.writing-field input')
        expect(inputs.length).toBe(4)
        await inputs[0].setValue('900')
        await inputs[1].setValue('18')
        await inputs[2].setValue('36')
        await inputs[3].setValue('1500')
        await flushPromises()
        expect(writingModeState.contentWidth).toBe(900)
        expect(writingModeState.fontSize).toBe(18)
        expect(writingModeState.lineHeight).toBe(36)

        await wrapper.find('.writing-reset').trigger('click')
        await flushPromises()
        expect(writingModeState.contentWidth).toBe(WRITING_MODE_DEFAULTS.contentWidth)
        expect(writingModeState.fontSize).toBe(WRITING_MODE_DEFAULTS.fontSize)
        expect(writingModeState.lineHeight).toBe(WRITING_MODE_DEFAULTS.lineHeight)
        wrapper.unmount()
    })
})
