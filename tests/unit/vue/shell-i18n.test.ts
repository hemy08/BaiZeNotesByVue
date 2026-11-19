// @vitest-environment jsdom
// CMP-30：壳层组件（MenuBar / StatusBar / WelcomeScreen / 资源管理器右键菜单）国际化验证。
// 断言默认 zh-CN 渲染文案与抽取前完全一致，且 setLocale('en-US') 后无需重建组件即切换到英文。
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

// 上下文菜单组件无需真实渲染，仅捕获传入的菜单配置
const { showContextMenuMock } = vi.hoisted(() => ({ showContextMenuMock: vi.fn() }))
vi.mock('@imengyu/vue3-context-menu', () => ({
    default: { showContextMenu: showContextMenuMock }
}))
// StatusBar 仅把 monaco-editor 的 Position 当作类型使用，mock 掉避免加载重型依赖
vi.mock('monaco-editor', () => ({}))

import MenuBar from '@renderer/components/MenuBar.vue'
import StatusBar from '@renderer/components/StatusBar.vue'
import WelcomeScreen from '@renderer/components/WelcomeScreen.vue'
import {
    handleContextMenu,
    type FileSysItem
} from '@renderer/components/ResourceManager/resource-manager'
import { setLocale } from '@renderer/common/i18n'
import EventBus from '@renderer/common/event-bus/event-bus'

let wrapper: VueWrapper | null = null

function stubShellGlobals() {
    vi.stubGlobal('electron', {
        ipcRenderer: { on: vi.fn(), removeListener: vi.fn(), send: vi.fn(), invoke: vi.fn() }
    })
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue({}) }
    })
}

beforeEach(() => {
    stubShellGlobals()
    setLocale('zh-CN')
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    setLocale('zh-CN')
    document.body.innerHTML = ''
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('MenuBar i18n', () => {
    it('renders Chinese labels by default and switches to English on locale change', async () => {
        wrapper = mount(MenuBar)
        const labels = () => wrapper!.findAll('.menu-label').map((node) => node.text())
        expect(labels()[0]).toBe('文件')
        expect(labels()[1]).toBe('编辑')

        setLocale('en-US')
        await wrapper.vm.$nextTick()
        expect(labels()[0]).toBe('File')
        expect(labels()[1]).toBe('Edit')
    })

    it('renders submenu item labels through t(labelKey)', async () => {
        wrapper = mount(MenuBar)
        await wrapper.findAll('.menu-item')[0].trigger('click')
        await flushPromises()
        const submenuLabels = () =>
            [...document.body.querySelectorAll('.menu-item-label')].map((node) => node.textContent)
        expect(submenuLabels()).toContain('新建')
        expect(submenuLabels()).toContain('打开文件')

        setLocale('en-US')
        await wrapper.vm.$nextTick()
        expect(submenuLabels()).toContain('New')
        expect(submenuLabels()).toContain('Open File')
    })
})

describe('StatusBar i18n', () => {
    it('renders Chinese static/dynamic texts by default and English after locale change', async () => {
        wrapper = mount(StatusBar, { attachTo: document.body })
        expect(wrapper.find('.file-path-label').text()).toBe('文件路径:')
        expect(wrapper.find('.console-message').text()).toBe('就绪')
        expect(wrapper.find('#status-bar-file-size').text()).toBe('0字节')

        EventBus.$emit('baize:notes:status-bar:context-length', '1024')
        EventBus.$emit('monaco-editor-statusbar-cursor-position', { lineNumber: 5, column: 3 })
        await wrapper.vm.$nextTick()
        expect(wrapper.find('#status-bar-file-size').text()).toBe('1024 字节')
        expect(wrapper.find('#status-bar-cursor-position').text()).toBe('行 5 列 3')

        setLocale('en-US')
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.file-path-label').text()).toBe('File path:')
        expect(wrapper.find('.console-message').text()).toBe('Ready')
        expect(wrapper.find('#status-bar-file-size').text()).toBe('1024 bytes')
        expect(wrapper.find('#status-bar-cursor-position').text()).toBe('Ln 5, Col 3')
        expect(wrapper.find('.file-path-text').text()).toBe('BaiZeNotes')
    })
})

describe('WelcomeScreen i18n', () => {
    it('switches title, buttons and recent-folder heading to English', async () => {
        wrapper = mount(WelcomeScreen)
        expect(wrapper.find('.welcome-title').text()).toBe('白泽笔记')
        expect(wrapper.findAll('.welcome-btn')[0].text()).toBe('打开文件')

        setLocale('en-US')
        await wrapper.vm.$nextTick()
        expect(wrapper.find('.welcome-title').text()).toBe('BaiZeNotes')
        expect(wrapper.findAll('.welcome-btn')[0].text()).toBe('Open File')
        expect(wrapper.find('.welcome-btn.minimize' as never).exists()).toBe(false)
        expect(wrapper.find('.window-btn.minimize').attributes('title')).toBe('Minimize')
        expect(wrapper.find('.window-btn.close').attributes('title')).toBe('Close')
    })
})

describe('ResourceManager context menu i18n', () => {
    const fileNode: FileSysItem = {
        id: 'C:\\docs\\note.md',
        name: 'note.md',
        path: 'C:\\docs\\note.md',
        type: 'file',
        fileExtension: '.md'
    }

    function lastTopLevelLabels(): string[] {
        const menu = showContextMenuMock.mock.lastCall![0] as {
            items: Array<{ label: string }>
        }
        return menu.items.map((item) => item.label)
    }

    it('keeps the original Chinese context menu by default', () => {
        showContextMenuMock.mockClear()
        handleContextMenu({ x: 1, y: 2 } as MouseEvent, fileNode)
        expect(lastTopLevelLabels()).toContain('新建')
        expect(lastTopLevelLabels()).toContain('导出到文件')
        expect(lastTopLevelLabels()).toContain('在资源管理器打开')
    })

    it('builds English context menu after locale change', () => {
        setLocale('en-US')
        showContextMenuMock.mockClear()
        handleContextMenu({ x: 1, y: 2 } as MouseEvent, fileNode)
        expect(lastTopLevelLabels()).toContain('New')
        expect(lastTopLevelLabels()).toContain('Export to File')
        expect(lastTopLevelLabels()).toContain('Open in Explorer')
    })
})
