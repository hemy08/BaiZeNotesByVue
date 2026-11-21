// @vitest-environment jsdom
/**
 * 第 3 批组件化（子任务 A2）：文本 codec 通用组件 TextCodecTool 及其 4 个薄封装入口回归测试。
 *
 * 抽取前 4 份实现各自渲染「双栏 + 编码/解码（Unicode 为 4 个转换）+ 复制/清空」，
 * DOM id 与 i18n 文案是既有契约。本测试锁定：
 * 1. 4 个入口的标题、输入/输出框 id、按钮 id 与顺序与迁移前一致；
 * 2. 编码/解码/转换行为仍由原 *_lib 纯函数驱动；
 * 3. URL 解码失败时仍弹出既有 i18n 提示且不覆盖输出；
 * 4. workAreaWidth prop 继续生效（PluginTools.vue 注入）。
 */
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

// alert 应用内化批次：组件失败提示改走 common/app-message（MessageDialog），mock 断言
const appMessageMocks = vi.hoisted(() => ({
    showAppError: vi.fn(),
    showAppWarning: vi.fn()
}))
vi.mock('@renderer/common/app-message', () => appMessageMocks)

import { setLocale } from '@renderer/common/i18n'
import Base64Codec from '@renderer/components/PluginTools/Codec/Base64Codec.vue'
import HtmlCodec from '@renderer/components/PluginTools/Codec/HtmlCodec.vue'
import UrlCodec from '@renderer/components/PluginTools/Codec/UrlCodec.vue'
import UnicodeConvert from '@renderer/components/PluginTools/Codec/UnicodeConvert.vue'

let wrapper: VueWrapper | null = null

beforeEach(() => {
    setLocale('zh-CN')
    appMessageMocks.showAppError.mockClear()
    appMessageMocks.showAppWarning.mockClear()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    setLocale('zh-CN')
    vi.restoreAllMocks()
})

/** 按顺序取按钮 id，锁定迁移前各 codec 的既有 id 契约 */
function buttonIds(w: VueWrapper): Array<string | undefined> {
    return w.findAll('.codec-btn-list button').map((btn) => btn.attributes('id'))
}

describe('Base64Codec（TextCodecTool 薄封装）', () => {
    it('renders title, two columns and the four original buttons', () => {
        wrapper = mount(Base64Codec)
        expect(wrapper.find('.header-display-center').text()).toBe('Base64 编码/解码')
        expect(wrapper.find('#base64-input').exists()).toBe(true)
        expect(wrapper.find('#base64-output').exists()).toBe(true)
        expect(buttonIds(wrapper)).toEqual([
            'base64-encode',
            'base64-decode',
            'base64-copy',
            'base64-clear'
        ])
    })

    it('encodes and decodes text through the original pure functions', async () => {
        wrapper = mount(Base64Codec)
        await wrapper.find('#base64-input').setValue('白泽')
        await wrapper.find('#base64-encode').trigger('click')
        const encoded = (wrapper.find('#base64-output').element as HTMLTextAreaElement).value
        expect(encoded).toBe('55m95rO9')

        // 解码可用编码结果还原原文
        await wrapper.find('#base64-input').setValue(encoded)
        await wrapper.find('#base64-decode').trigger('click')
        expect((wrapper.find('#base64-output').element as HTMLTextAreaElement).value).toBe('白泽')
    })

    it('clears both textareas', async () => {
        wrapper = mount(Base64Codec)
        await wrapper.find('#base64-input').setValue('abc')
        await wrapper.find('#base64-encode').trigger('click')
        await wrapper.find('#base64-clear').trigger('click')
        expect((wrapper.find('#base64-input').element as HTMLTextAreaElement).value).toBe('')
        expect((wrapper.find('#base64-output').element as HTMLTextAreaElement).value).toBe('')
    })
})

describe('HtmlCodec（TextCodecTool 薄封装）', () => {
    it('renders and escapes/unescapes HTML entities', async () => {
        wrapper = mount(HtmlCodec)
        expect(wrapper.find('.header-display-center').text()).toBe('HTML 实体编码/解码')
        expect(buttonIds(wrapper)).toEqual([
            'html-encode',
            'html-decode',
            'html-copy',
            'html-clear'
        ])

        await wrapper.find('#html-input').setValue('<a href="x">')
        await wrapper.find('#html-encode').trigger('click')
        expect((wrapper.find('#html-output').element as HTMLTextAreaElement).value).toBe(
            '&lt;a href=&quot;x&quot;&gt;'
        )

        await wrapper.find('#html-input').setValue('&amp;lt;')
        await wrapper.find('#html-decode').trigger('click')
        expect((wrapper.find('#html-output').element as HTMLTextAreaElement).value).toBe('&lt;')
    })
})

describe('UrlCodec（TextCodecTool 薄封装）', () => {
    it('renders and percent-encodes text', async () => {
        wrapper = mount(UrlCodec)
        expect(wrapper.find('.header-display-center').text()).toBe('URL 编码/解码')
        expect(buttonIds(wrapper)).toEqual(['url-encode', 'url-decode', 'url-copy', 'url-clear'])

        await wrapper.find('#url-input').setValue('白泽笔记')
        await wrapper.find('#url-encode').trigger('click')
        expect((wrapper.find('#url-output').element as HTMLTextAreaElement).value).toBe(
            '%E7%99%BD%E6%B3%BD%E7%AC%94%E8%AE%B0'
        )
    })

    it('shows the original i18n message on invalid URL encoding and keeps output', async () => {
        wrapper = mount(UrlCodec)
        await wrapper.find('#url-input').setValue('%E7%99')
        await wrapper.find('#url-encode').trigger('click')
        const previous = (wrapper.find('#url-output').element as HTMLTextAreaElement).value

        await wrapper.find('#url-input').setValue('%')
        await wrapper.find('#url-decode').trigger('click')

        // 解码异常 → 应用内 error 提示（一次），文案与迁移前逐字一致
        expect(appMessageMocks.showAppError).toHaveBeenCalledTimes(1)
        expect(appMessageMocks.showAppError.mock.calls[0][0]).toContain(
            '解码失败，输入包含非法 URL 编码：'
        )
        // 失败时输出框保持上一次结果，不被清空/改写
        expect((wrapper.find('#url-output').element as HTMLTextAreaElement).value).toBe(previous)
    })
})

describe('UnicodeConvert（TextCodecTool 薄封装）', () => {
    it('renders the four conversion buttons plus copy/clear in the original order', () => {
        wrapper = mount(UnicodeConvert)
        expect(wrapper.find('.header-display-center').text()).toBe('Unicode 与中文互转')
        expect(buttonIds(wrapper)).toEqual([
            'unicode-to-unicode',
            'unicode-to-text',
            'unicode-to-entity',
            'unicode-entity-to-text',
            'unicode-copy',
            'unicode-clear'
        ])
    })

    it('converts text to unicode escape and back', async () => {
        wrapper = mount(UnicodeConvert)
        await wrapper.find('#unicode-input').setValue('白')
        await wrapper.find('#unicode-to-unicode').trigger('click')
        expect((wrapper.find('#unicode-output').element as HTMLTextAreaElement).value).toBe(
            '\\u767d'
        )

        await wrapper.find('#unicode-input').setValue('\\u767d')
        await wrapper.find('#unicode-to-text').trigger('click')
        expect((wrapper.find('#unicode-output').element as HTMLTextAreaElement).value).toBe('白')
    })
})

describe('TextCodecTool 通用行为', () => {
    it('applies workAreaWidth and keeps the 120px textarea contract', () => {
        wrapper = mount(Base64Codec, { props: { workAreaWidth: '900px' } })
        expect(wrapper.attributes('style')).toContain('width: 900px')
        // 迁移前 CSS 契约：.codec-textarea min-height 120px（样式断言按组件源码锁定）
        for (const selector of ['#base64-input', '#base64-output']) {
            expect(wrapper.find(selector).classes()).toContain('codec-textarea')
        }
    })
})
