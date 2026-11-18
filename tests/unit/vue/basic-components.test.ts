// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// StatusBar 仅把 monaco-editor 的 Position 当作类型使用，mock 掉避免加载重型依赖
vi.mock('monaco-editor', () => ({}))

// P2 死代码清理：DialogButton.vue 已随死组件清理删除，本文件只保留活跃组件用例
import StatusBar from '@renderer/components/StatusBar.vue'
import WelcomeScreen from '@renderer/components/WelcomeScreen.vue'
import EventBus from '@renderer/common/event-bus/event-bus'

describe('StatusBar', () => {
    let ipcRenderer: { on: ReturnType<typeof vi.fn>; removeListener: ReturnType<typeof vi.fn> }
    let wrapper: ReturnType<typeof mount> | null = null

    beforeEach(() => {
        ipcRenderer = { on: vi.fn(), removeListener: vi.fn() }
        vi.stubGlobal('electron', { ipcRenderer })
    })

    afterEach(() => {
        wrapper?.unmount()
        wrapper = null
        vi.restoreAllMocks()
        vi.useRealTimers()
    })

    function mountStatusBar() {
        // StatusBar 通过 document.getElementById 更新文件大小与光标位置，必须挂到真实 DOM
        wrapper = mount(StatusBar, { attachTo: document.body })
        return wrapper
    }

    /** 取出组件通过 ipcRenderer.on 注册的某个频道的回调 */
    function ipcHandler(channel: string): (...args: unknown[]) => void {
        const call = ipcRenderer.on.mock.calls.find(([name]) => name === channel)
        expect(call, `ipc listener for ${channel}`).toBeTruthy()
        return call![1]
    }

    it('renders the initial status: default path, ready console and saved indicator', () => {
        const w = mountStatusBar()
        expect(w.find('.file-path-text').text()).toBe('白泽笔记')
        expect(w.find('.console-message').text()).toBe('就绪')
        expect(w.find('.console-icon').text()).toBe('ℹ')
        expect(w.find('.saved-indicator').exists()).toBe(true)
        expect(w.find('.unsaved-indicator').exists()).toBe(false)
        expect(w.find('#status-bar-file-type').text()).toBe('Markdown')
        expect(w.find('#status-bar-encoding').text()).toBe('utf-8')
        expect(w.find('#status-bar-file-size').text()).toBe('0字节')
    })

    it('updates the file path via the EventBus file path event', async () => {
        const w = mountStatusBar()
        EventBus.$emit('monaco-editor-statusbar-file-path', '/data/notes/hello.md')
        await w.vm.$nextTick()
        expect(w.find('.file-path-text').text()).toBe('/data/notes/hello.md')
    })

    it('truncates long paths and keeps the tail', async () => {
        const w = mountStatusBar()
        const longPath = '/very/long/path/' + 'a'.repeat(60) + '/note.md'
        EventBus.$emit('monaco-editor-statusbar-file-path', longPath)
        await w.vm.$nextTick()
        const shown = w.find('.file-path-text').text()
        expect(shown).toHaveLength(40)
        expect(shown.startsWith('...')).toBe(true)
        expect(shown.endsWith(longPath.slice(-37))).toBe(true)
    })

    it('marks the file as unsaved and updates the size on content length events', async () => {
        const w = mountStatusBar()
        EventBus.$emit('baize:notes:status-bar:context-length', '1024')
        await w.vm.$nextTick()
        expect(w.find('.unsaved-indicator').exists()).toBe(true)
        expect(w.find('#status-bar-file-path').classes()).toContain('unsaved')
        expect(w.find('#status-bar-file-size').text()).toBe('1024 字节')
    })

    it('marks the file as saved again after the file-saved IPC event', async () => {
        const w = mountStatusBar()
        EventBus.$emit('baize:notes:status-bar:context-length', '1024')
        await w.vm.$nextTick()
        expect(w.find('.unsaved-indicator').exists()).toBe(true)

        ipcHandler('baize:file:saved')()
        await w.vm.$nextTick()
        expect(w.find('.saved-indicator').exists()).toBe(true)
        expect(w.find('#status-bar-file-path').classes()).toContain('saved')
    })

    it('updates the cursor position display via the EventBus', async () => {
        const w = mountStatusBar()
        EventBus.$emit('monaco-editor-statusbar-cursor-position', { lineNumber: 5, column: 3 })
        await w.vm.$nextTick()
        expect(w.find('#status-bar-cursor-position').text()).toBe('行 5 列 3')
    })

    it('shows console messages from the status-bar-console-update IPC event', async () => {
        const w = mountStatusBar()
        ipcHandler('baize:status-bar:update')(null, { message: '正在保存...', type: 'success' })
        await w.vm.$nextTick()
        expect(w.find('.console-message').text()).toBe('正在保存...')
        expect(w.find('.console-icon').text()).toBe('✓')
        expect(w.find('#status-bar-console').classes()).toContain('success')
    })

    it('updates the encoding display from the status-bar payload (FUN-29)', async () => {
        const w = mountStatusBar()
        expect(w.find('#status-bar-encoding').text()).toBe('utf-8')
        ipcHandler('baize:status-bar:update')(null, {
            message: '已打开文件（gbk）',
            type: 'success',
            encoding: 'gbk'
        })
        await w.vm.$nextTick()
        expect(w.find('#status-bar-encoding').text()).toBe('gbk')
    })

    it('auto-resets the console message to ready after 5 seconds', async () => {
        vi.useFakeTimers()
        const w = mountStatusBar()
        ipcHandler('baize:status-bar:update')(null, { message: '保存完成', type: 'success' })
        await w.vm.$nextTick()
        expect(w.find('.console-message').text()).toBe('保存完成')

        vi.advanceTimersByTime(5000)
        await w.vm.$nextTick()
        expect(w.find('.console-message').text()).toBe('就绪')
        expect(w.find('.console-icon').text()).toBe('ℹ')
        expect(w.find('#status-bar-console').classes()).toContain('info')
    })

    it('keeps loading messages until explicitly cleared', async () => {
        vi.useFakeTimers()
        const w = mountStatusBar()
        ipcHandler('baize:status-bar:update')(null, { message: '正在导出...', type: 'loading' })
        await w.vm.$nextTick()
        vi.advanceTimersByTime(10000)
        await w.vm.$nextTick()
        expect(w.find('.console-message').text()).toBe('正在导出...')
        expect(w.find('.console-icon').text()).toBe('⋯')
    })
})

describe('WelcomeScreen', () => {
    let configRead: ReturnType<typeof vi.fn>
    let ipcRenderer: { send: ReturnType<typeof vi.fn> }

    beforeEach(() => {
        configRead = vi.fn().mockResolvedValue(['/folder/one', '/folder/two'])
        vi.stubGlobal('api', { config: { read: configRead } })
        ipcRenderer = { send: vi.fn() }
        vi.stubGlobal('electron', { ipcRenderer })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders the app title and subtitle', () => {
        const wrapper = mount(WelcomeScreen)
        expect(wrapper.find('.welcome-title').text()).toBe('白泽笔记')
        expect(wrapper.find('.welcome-subtitle').text()).toContain('Electron + Vue + TypeScript')
    })

    it('emits openFile and openFolder when clicking the action buttons', async () => {
        const wrapper = mount(WelcomeScreen)
        const buttons = wrapper.findAll('.welcome-btn')
        await buttons[0].trigger('click')
        expect(wrapper.emitted('openFile')).toHaveLength(1)

        await buttons[1].trigger('click')
        expect(wrapper.emitted('openFolder')).toHaveLength(1)
    })

    it('sends window control IPC messages when clicking the window buttons', async () => {
        const wrapper = mount(WelcomeScreen)
        await wrapper.find('.window-btn.minimize').trigger('click')
        await wrapper.find('.window-btn.maximize').trigger('click')
        await wrapper.find('.window-btn.close').trigger('click')

        expect(ipcRenderer.send).toHaveBeenCalledWith('baize:window:minimize')
        // 2026-11-18（用户反馈）：最大化按钮改为切换语义（二次点击还原）
        expect(ipcRenderer.send).toHaveBeenCalledWith('baize:window:toggle-maximize')
        expect(ipcRenderer.send).toHaveBeenCalledWith('baize:window:close')
    })

    it('loads and renders recent folders from the config api', async () => {
        const wrapper = mount(WelcomeScreen)
        await flushPromises()

        expect(configRead).toHaveBeenCalledWith('recent-folders')
        const items = wrapper.findAll('.history-item')
        expect(items).toHaveLength(2)
        expect(items[0].text()).toContain('/folder/one')
        expect(items[1].text()).toContain('/folder/two')
    })

    it('emits openRecentFolder with the clicked folder path', async () => {
        const wrapper = mount(WelcomeScreen)
        await flushPromises()
        await wrapper.findAll('.history-item')[0].trigger('click')
        expect(wrapper.emitted('openRecentFolder')).toHaveLength(1)
        expect(wrapper.emitted('openRecentFolder')![0][0]).toBe('/folder/one')
    })

    it('hides the history section when there are no recent folders', async () => {
        configRead.mockResolvedValue([])
        const wrapper = mount(WelcomeScreen)
        await flushPromises()
        expect(wrapper.find('.welcome-history').exists()).toBe(false)
    })

    it('ignores non-array config values for recent folders', async () => {
        configRead.mockResolvedValue('not-an-array')
        const wrapper = mount(WelcomeScreen)
        await flushPromises()
        expect(wrapper.find('.welcome-history').exists()).toBe(false)
    })
})
