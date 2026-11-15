// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'

import LatexEditor from '@renderer/components/PluginTools/Tools/LatexEditor.vue'
import QrcodeGenerator from '@renderer/components/PluginTools/NetWork/QrcodeGenerator.vue'
import WifiQrcodeGenerator from '@renderer/components/PluginTools/NetWork/WifiQrcodeGenerator.vue'

afterEach(() => {
    vi.restoreAllMocks()
})

describe('LatexEditor', () => {
    it('renders the title and the description with external links', () => {
        const wrapper = mount(LatexEditor)
        expect(wrapper.find('.header-display-center').text()).toBe('Latex公式编辑器')
        expect(wrapper.text()).toContain('MathJax')
        const links = wrapper.findAll('a[target="_blank"]')
        expect(links.length).toBeGreaterThanOrEqual(2)
    })

    it('renders the shortcut tabs and the LaTeX input textarea', () => {
        const wrapper = mount(LatexEditor)
        const tabs = wrapper.findAll('#ul_navtabs .nav-link')
        expect(tabs).toHaveLength(3)
        expect(tabs.map((tab) => tab.text())).toEqual(['快捷工具', '公式模板', '图片识别'])
        expect(tabs[0].classes()).toContain('active')

        const textarea = wrapper.find('#txta_input')
        expect(textarea.exists()).toBe(true)
        expect(textarea.attributes('placeholder')).toBe('请输入您的LaTeX表达式')
        expect(textarea.attributes('maxlength')).toBe('16384')
    })

    it('renders the output area', () => {
        const wrapper = mount(LatexEditor)
        expect(wrapper.find('#output-area .card-header h2').text()).toContain('输出区域')
        expect(wrapper.find('#wrap_output').exists()).toBe(true)
    })

    it('opens the external editor link in a new window', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const wrapper = mount(LatexEditor)
        await wrapper.find('.plugin-tools-openurl').trigger('click')
        expect(openSpy).toHaveBeenCalledWith(
            'https://www.latexlive.com/home',
            '_blank',
            'noopener, noreferrer'
        )
    })

    it('applies the workAreaWidth prop to the root element', () => {
        const wrapper = mount(LatexEditor, { props: { workAreaWidth: '900px' } })
        expect(wrapper.attributes('style')).toContain('width: 900px')
    })
})

describe('QrcodeGenerator', () => {
    it('renders the title, description and placeholder body', () => {
        const wrapper = mount(QrcodeGenerator)
        expect(wrapper.find('h1').text()).toBe('二维码生成器')
        expect(wrapper.text()).toContain('生成并下载url或文本的QR代码')
    })

    it('opens the reference site in a new window', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const wrapper = mount(QrcodeGenerator)
        await wrapper.find('.plugin-tools-openurl').trigger('click')
        expect(openSpy).toHaveBeenCalledWith(
            'https://tools.w3cschool.cn/qrcode-generator',
            '_blank',
            'noopener, noreferrer'
        )
    })

    it('applies the workAreaWidth prop to the body area', () => {
        const wrapper = mount(QrcodeGenerator, { props: { workAreaWidth: '600px' } })
        expect(wrapper.find('div[style*="width: 600px"]').exists()).toBe(true)
    })
})

describe('WifiQrcodeGenerator', () => {
    it('renders the title, description and placeholder body', () => {
        const wrapper = mount(WifiQrcodeGenerator)
        expect(wrapper.find('h1').text()).toBe('WiFi 二维码生成器')
        expect(wrapper.text()).toContain('快速连接到WiFi网络')
    })

    it('opens the reference site in a new window', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const wrapper = mount(WifiQrcodeGenerator)
        await wrapper.find('.plugin-tools-openurl').trigger('click')
        expect(openSpy).toHaveBeenCalledWith(
            'https://tools.w3cschool.cn/wifi-qrcode-generator',
            '_blank',
            'noopener, noreferrer'
        )
    })
})
