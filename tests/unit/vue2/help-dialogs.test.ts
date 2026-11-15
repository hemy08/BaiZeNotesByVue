// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import QuickLinkSettingDialog from '@renderer/components/dialogs/help/QuickLinkSettingDialog.vue'
import HelpAboutDialog from '@renderer/components/dialogs/help/HelpAboutDialog.vue'
import TechStackDialog from '@renderer/components/dialogs/help/TechStackDialog.vue'
import HelpContactUsDialog from '@renderer/components/dialogs/help/HelpContactUsDialog.vue'
import { IPC } from '../../../src/shared/ipc-channels'
import type { QuickLinkItem } from '../../../src/shared/types'

// P2 死代码清理：UpdateLogDialog / MermaidRenderFrame（C-07 隐藏窗口链路）/
// OnlineWebPage / Versions 四个渲染层死组件已删除，对应用例同步移除。
const dialogMountOptions = { global: { stubs: { teleport: true } } }

afterEach(() => {
    vi.restoreAllMocks()
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

/** 主进程 quickLinks 默认数据（与对话框原默认三条等价，形状为 QuickLinkItem） */
function makeMainQuickLinks(): QuickLinkItem[] {
    return [
        {
            id: 'github',
            name: 'GitHub',
            type: 'url',
            path: 'https://github.com',
            icon: 'emoji',
            iconContent: '🐙',
            enabled: true,
            order: 1,
            position: 'left'
        },
        {
            id: 'google',
            name: 'Google',
            type: 'url',
            path: 'https://google.com',
            icon: 'emoji',
            iconContent: '🔍',
            enabled: true,
            order: 2,
            position: 'left'
        },
        {
            id: 'stackoverflow',
            name: 'Stack Overflow',
            type: 'url',
            path: 'https://stackoverflow.com',
            icon: 'emoji',
            iconContent: '📚',
            enabled: true,
            order: 3,
            position: 'left'
        }
    ]
}

describe('QuickLinkSettingDialog', () => {
    let invoke: ReturnType<typeof vi.fn>
    let mainLinks: QuickLinkItem[]

    beforeEach(() => {
        mainLinks = makeMainQuickLinks()
        // P1-FE-04：对话框读写统一走主进程 quickLinks（GET 读 / SAVE 存）；
        // mock 按通道模拟主进程：SAVE 时把入参视为新配置，供后续 GET 返回。
        invoke = vi.fn((channel: string, payload?: unknown) => {
            if (channel === IPC.QUICK_LINKS.GET) {
                return Promise.resolve(mainLinks.map((link) => ({ ...link })))
            }
            if (channel === IPC.QUICK_LINKS.SAVE) {
                mainLinks = (payload as QuickLinkItem[]).map((link, index) => ({
                    ...link,
                    order: index + 1
                }))
                return Promise.resolve({ ok: true, links: mainLinks })
            }
            return Promise.resolve(undefined)
        })
        vi.stubGlobal('electron', {
            ipcRenderer: {
                invoke,
                send: vi.fn(),
                on: vi.fn(),
                removeListener: vi.fn()
            }
        })
    })

    it('renders three default quick links', () => {
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const items = wrapper.findAll('.link-item')
        expect(items).toHaveLength(3)
        expect(items[0].text()).toContain('GitHub')
        expect(items[2].text()).toContain('Stack Overflow')
    })

    it('adds a new link through the form', async () => {
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.add-btn').trigger('click')
        expect(wrapper.find('.link-form h3').text()).toBe('添加链接')

        const inputs = wrapper.findAll('.form-input')
        await inputs[0].setValue('知乎')
        await inputs[1].setValue('https://www.zhihu.com')
        await wrapper.find('.form-textarea').setValue('问答社区')
        await wrapper.find('.btn-primary').trigger('click')

        expect(wrapper.findAll('.link-item')).toHaveLength(4)
        expect(wrapper.find('.link-form').exists()).toBe(false)
        expect(wrapper.findAll('.link-item')[3].text()).toContain('知乎')
    })

    it('does not save a link without name or url', async () => {
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.add-btn').trigger('click')
        await wrapper.find('.btn-primary').trigger('click')
        expect(wrapper.findAll('.link-item')).toHaveLength(3)
        // 表单仍然打开
        expect(wrapper.find('.link-form').exists()).toBe(true)
    })

    it('edits an existing link', async () => {
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const firstItem = wrapper.findAll('.link-item')[0]
        await firstItem.findAll('.action-btn')[0].trigger('click')
        expect(wrapper.find('.link-form h3').text()).toBe('编辑链接')
        expect((wrapper.findAll('.form-input')[0].element as HTMLInputElement).value).toBe('GitHub')

        await wrapper.findAll('.form-input')[0].setValue('GitHub 镜像')
        await wrapper.find('.btn-primary').trigger('click')
        expect(wrapper.findAll('.link-item')).toHaveLength(3)
        expect(wrapper.findAll('.link-item')[0].text()).toContain('GitHub 镜像')
    })

    it('deletes a link', async () => {
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.link-item')[1].findAll('.action-btn')[1].trigger('click')
        expect(wrapper.findAll('.link-item')).toHaveLength(2)
        expect(wrapper.text()).not.toContain('Google')
    })

    it('marks the clicked link item as selected', async () => {
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const second = wrapper.findAll('.link-item')[1]
        await second.trigger('click')
        expect(second.classes()).toContain('selected')
        expect(wrapper.findAll('.link-item')[0].classes()).not.toContain('selected')
    })

    it('shows the empty state after deleting all links', async () => {
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        for (let i = 0; i < 3; i++) {
            await wrapper.findAll('.link-item')[0].findAll('.action-btn')[1].trigger('click')
        }
        expect(wrapper.findAll('.link-item')).toHaveLength(0)
        expect(wrapper.find('.empty-state').text()).toContain('暂无快捷链接')
    })

    it('loads the links from the main-process quickLinks data source on open', async () => {
        // P1-FE-04：对话框以主进程 quickLinks 为唯一数据源，不再展示与 NaviTab 无关的硬编码默认值
        invoke.mockImplementation((channel: string) => {
            if (channel === IPC.QUICK_LINKS.GET) {
                return Promise.resolve([
                    {
                        id: 'main-only',
                        name: '主进程链接',
                        type: 'url',
                        path: 'https://main.example.com',
                        icon: 'text',
                        iconContent: 'M',
                        enabled: true,
                        order: 1,
                        position: 'left'
                    }
                ])
            }
            return Promise.resolve({ ok: true })
        })
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await flushPromises()

        const items = wrapper.findAll('.link-item')
        expect(items).toHaveLength(1)
        expect(items[0].text()).toContain('主进程链接')
        expect(wrapper.text()).not.toContain('GitHub')
    })

    it('saves the links through QUICK_LINKS.SAVE and emits apply', async () => {
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await flushPromises()
        await wrapper.find('.btn-apply').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(
            IPC.QUICK_LINKS.SAVE,
            expect.arrayContaining([
                expect.objectContaining({
                    id: 'github',
                    name: 'GitHub',
                    type: 'url',
                    path: 'https://github.com',
                    icon: 'emoji',
                    iconContent: '🐙',
                    enabled: true,
                    position: 'left'
                })
            ])
        )
        // 保存成功后才 emit apply，载荷为 3 条链接
        expect(wrapper.emitted('apply')).toHaveLength(1)
        expect(wrapper.emitted('apply')![0][0]).toHaveLength(3)
        // apply 不关闭对话框
        expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('keeps the dialog open when the main process rejects the save', async () => {
        const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockImplementation((channel: string) => {
            if (channel === IPC.QUICK_LINKS.GET) {
                return Promise.resolve(makeMainQuickLinks())
            }
            if (channel === IPC.QUICK_LINKS.SAVE) {
                return Promise.resolve({ ok: false, reason: 'invalid-payload' })
            }
            return Promise.resolve(undefined)
        })
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await flushPromises()

        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(IPC.QUICK_LINKS.SAVE, expect.any(Array))
        // 保存失败：不关闭、不 emit apply，用户改动保留在对话框中
        expect(wrapper.emitted('close')).toBeUndefined()
        expect(wrapper.emitted('apply')).toBeUndefined()
        expect(consoleError).toHaveBeenCalled()
    })

    it('restores the initial links when cancelling', async () => {
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await flushPromises()
        await wrapper.findAll('.link-item')[0].findAll('.action-btn')[1].trigger('click')
        expect(wrapper.findAll('.link-item')).toHaveLength(2)

        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
        expect(wrapper.findAll('.link-item')).toHaveLength(3)
    })

    it('applies and closes when clicking confirm', async () => {
        const wrapper = mount(QuickLinkSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await flushPromises()
        await wrapper.find('.btn-confirm').trigger('click')
        await flushPromises()
        expect(invoke).toHaveBeenCalledWith(IPC.QUICK_LINKS.SAVE, expect.any(Array))
        expect(wrapper.emitted('apply')).toHaveLength(1)
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('HelpAboutDialog', () => {
    function mockGetVersion(value: unknown) {
        const getVersion = vi.fn().mockResolvedValue(value)
        vi.stubGlobal('api', { app: { getVersion } })
        vi.stubGlobal('electron', {
            ipcRenderer: { invoke: vi.fn().mockResolvedValue('Windows 11') }
        })
        return getVersion
    }

    it('renders version info returned by the version api', async () => {
        mockGetVersion({
            appVersion: '1.2.1',
            electronVersion: '43.8.1',
            chromeVersion: '140.0.0',
            nodeVersion: '22.0.0',
            vueVersion: '3.5.41',
            viteVersion: '8.2.2',
            typescriptVersion: '6.0.2',
            monacoEditorVersion: '0.57.0',
            markdownItVersion: '15.0.0'
        })
        const wrapper = mount(HelpAboutDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await flushPromises()

        expect(wrapper.find('.app-version').text()).toBe('v1.2.1')
        expect(wrapper.find('.app-name').text()).toBe('白泽笔记')
        const rows = wrapper.findAll('.info-row')
        expect(rows.length).toBeGreaterThanOrEqual(10)
        expect(rows[0].text()).toContain('应用版本')
        expect(rows[0].text()).toContain('v1.2.1')
        expect(rows[2].text()).toContain('v43.8.1')
        expect(rows[4].text()).toContain('v22.0.0')
    })

    it('falls back to bundled versions when the version api fails', async () => {
        mockGetVersion(Promise.reject(new Error('not available')))
        const wrapper = mount(HelpAboutDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await flushPromises()
        expect(wrapper.find('.app-version').text()).toBe('v1.3.0')
        expect(wrapper.text()).toContain('v3.5.45')
    })

    it('fills the build date and platform', async () => {
        mockGetVersion({ appVersion: '1.0.0' })
        const wrapper = mount(HelpAboutDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await flushPromises()
        // 发布日期行（索引 1）为 zh-CN 格式日期
        const dateRow = wrapper.findAll('.info-row')[1]
        expect(dateRow.find('.value').text()).toMatch(/\d{4}\/\d{2}\/\d{2}/)
    })

    it('opens the GitHub link in a new window', async () => {
        mockGetVersion({ appVersion: '1.0.0' })
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const wrapper = mount(HelpAboutDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.footer a').trigger('click')
        expect(openSpy).toHaveBeenCalledWith('https://github.com/hemy08/BaiZeNotesByVue', '_blank')
    })

    it('emits close when clicking the close button', async () => {
        mockGetVersion({ appVersion: '1.0.0' })
        const wrapper = mount(HelpAboutDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('TechStackDialog', () => {
    it('renders four sections with 15 tech cards', () => {
        const wrapper = mount(TechStackDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const titles = wrapper.findAll('.section-title')
        expect(titles.map((title) => title.text())).toEqual([
            '核心框架',
            '编辑器与渲染',
            '数据与存储',
            '工具库'
        ])
        expect(wrapper.findAll('.tech-card')).toHaveLength(15)
    })

    it('renders tech names, versions and urls', () => {
        const wrapper = mount(TechStackDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const firstCard = wrapper.findAll('.tech-card')[0]
        expect(firstCard.find('.tech-name').text()).toBe('Electron')
        expect(firstCard.find('.tech-version').text()).toContain('^43.8.10')
        expect(firstCard.find('.tech-url').text()).toContain('https://www.electronjs.org/')
    })

    it('opens the tech site when clicking a card', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const wrapper = mount(TechStackDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.tech-card')[1].trigger('click')
        expect(openSpy).toHaveBeenCalledWith('https://vuejs.org/', '_blank')
    })

    it('emits close when clicking the close button', async () => {
        const wrapper = mount(TechStackDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('HelpContactUsDialog', () => {
    it('renders four contact cards and two social icons', () => {
        const wrapper = mount(HelpContactUsDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const cards = wrapper.findAll('.contact-card')
        expect(cards).toHaveLength(4)
        expect(cards.map((card) => card.find('.card-title').text())).toEqual([
            '问题反馈',
            'Star 项目',
            '贡献代码',
            '发送邮件'
        ])
        expect(wrapper.findAll('.social-icon')).toHaveLength(2)
    })

    it('opens the mail link when clicking the email card', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const wrapper = mount(HelpContactUsDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.contact-card')[3].trigger('click')
        expect(openSpy).toHaveBeenCalledWith('mailto:hemy08@example.com', '_blank')
    })

    it('emits close when clicking the close button', async () => {
        const wrapper = mount(HelpContactUsDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})
