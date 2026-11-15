// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi, Mock } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

// FileTreeNode 的右键菜单依赖 @imengyu/vue3-context-menu，mock 后可以断言菜单调用
vi.mock('@imengyu/vue3-context-menu', () => ({
    default: { showContextMenu: vi.fn() }
}))

import FileTreeNode from '@renderer/components/ResourceManager/FileTreeNode.vue'
import NaviTab from '@renderer/components/WorkSpaceArea/NaviTab.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import ContextMenu from '@imengyu/vue3-context-menu'
import { FileSysItem } from '@renderer/components/ResourceManager/resource-manager'

const showContextMenu = ContextMenu.showContextMenu as unknown as Mock

afterEach(() => {
    document.body.innerHTML = ''
    vi.restoreAllMocks()
})

describe('FileTreeNode', () => {
    let send: ReturnType<typeof vi.fn>

    beforeEach(() => {
        send = vi.fn()
        vi.stubGlobal('electron', { ipcRenderer: { send } })
        showContextMenu.mockClear()
    })

    it('renders a folder node with icon and collapse button', () => {
        const node: FileSysItem = {
            name: 'docs',
            path: '/notes/docs',
            type: 'folder',
            fileExtension: 'folder'
        }
        const wrapper = mount(FileTreeNode, { props: { node } })
        expect(wrapper.find('.file-manager-node').text()).toBe('docs')
        expect(wrapper.find('.folder-icon').exists()).toBe(true)
        expect(wrapper.find('.folder-collapse').exists()).toBe(true)
        // 未展开时不显示子节点
        expect(wrapper.find('.file-subtree').exists()).toBe(false)
    })

    it('emits update:isExpanded when toggling the folder', async () => {
        const node: FileSysItem = {
            name: 'docs',
            path: '/notes/docs',
            type: 'folder',
            fileExtension: 'folder'
        }
        const wrapper = mount(FileTreeNode, { props: { node, isExpanded: false } })
        await wrapper.find('button').trigger('click')
        expect(wrapper.emitted('update:isExpanded')).toHaveLength(1)
        expect(wrapper.emitted('update:isExpanded')![0][0]).toBe(true)
    })

    it('recursively renders children when the folder is expanded', () => {
        const node: FileSysItem = {
            name: 'docs',
            path: '/notes/docs',
            type: 'folder',
            fileExtension: 'folder',
            children: [
                {
                    name: 'a.md',
                    path: '/notes/docs/a.md',
                    type: 'file',
                    fileExtension: '.md'
                },
                {
                    name: 'sub',
                    path: '/notes/docs/sub',
                    type: 'folder',
                    fileExtension: 'folder',
                    children: [
                        {
                            name: 'b.md',
                            path: '/notes/docs/sub/b.md',
                            type: 'file',
                            fileExtension: '.md'
                        }
                    ]
                }
            ]
        }
        const wrapper = mount(FileTreeNode, { props: { node, isExpanded: true } })
        // 递归渲染两层：a.md 与 sub 文件夹
        const childNodes = wrapper.findAll('.file-manager-node')
        expect(childNodes).toHaveLength(3)
        expect(childNodes.map((item) => item.text())).toEqual(['docs', 'a.md', 'sub'])
        // 孙级 b.md 在 sub 未展开时不渲染
        expect(wrapper.text()).not.toContain('b.md')
    })

    it('renders a file node with its extension icon', () => {
        const node: FileSysItem = {
            name: 'photo.png',
            path: '/notes/photo.png',
            type: 'file',
            fileExtension: '.png'
        }
        // 图标按 fileExtension prop 渲染（父组件通过 v-model:file-extension 传入）
        const wrapper = mount(FileTreeNode, { props: { node, fileExtension: '.png' } })
        expect(wrapper.find('.file-icon').exists()).toBe(true)
        expect(wrapper.find('.folder-icon').exists()).toBe(false)
        // .png 对应数据表中的路径
        expect(wrapper.find('.file-icon path').attributes('d')).toContain('M19 3H5')
    })

    it('adds the indented class when isIndented is true', () => {
        const node: FileSysItem = {
            name: 'a.md',
            path: '/notes/a.md',
            type: 'file',
            fileExtension: '.md'
        }
        const wrapper = mount(FileTreeNode, { props: { node, isIndented: true } })
        expect(wrapper.find('.file-tree-node').classes()).toContain('indented')
    })

    it('opens a markdown file through IPC and updates the status bar', async () => {
        const node: FileSysItem = {
            name: 'note.md',
            path: '/notes/note.md',
            type: 'file',
            fileExtension: '.md'
        }
        const statusPath = vi.fn()
        const hideTools = vi.fn()
        EventBus.$on('monaco-editor-statusbar-file-path', statusPath, { once: true })
        EventBus.$on('plugin-tools-container-show', hideTools, { once: true })

        const wrapper = mount(FileTreeNode, { props: { node } })
        await wrapper.find('.node-content').trigger('click')

        expect(send).toHaveBeenCalledWith('baize:file:open-select-file', {
            name: 'note.md',
            path: '/notes/note.md',
            type: 'file',
            content: ''
        })
        expect(statusPath).toHaveBeenCalledWith('/notes/note.md')
        expect(hideTools).toHaveBeenCalledWith(false)
    })

    it('shows the html workspace when clicking an html file', async () => {
        const node: FileSysItem = {
            name: 'index.html',
            path: '/notes/index.html',
            type: 'file',
            fileExtension: '.html'
        }
        const htmlSelected = vi.fn()
        const showWorkspace = vi.fn()
        EventBus.$on('html-file-selected', htmlSelected, { once: true })
        EventBus.$on('baize:notes:workspace:show', showWorkspace, { once: true })

        const wrapper = mount(FileTreeNode, { props: { node } })
        await wrapper.find('.node-content').trigger('click')

        expect(htmlSelected).toHaveBeenCalledWith(node)
        expect(showWorkspace).toHaveBeenCalledWith('html')
        expect(send).not.toHaveBeenCalled()
    })

    it('shows the pdf workspace when clicking a pdf file', async () => {
        const node: FileSysItem = {
            name: 'manual.pdf',
            path: '/notes/manual.pdf',
            type: 'file',
            fileExtension: '.pdf'
        }
        const pdfSelected = vi.fn()
        const showWorkspace = vi.fn()
        EventBus.$on('pdf-file-selected', pdfSelected, { once: true })
        EventBus.$on('baize:notes:workspace:show', showWorkspace, { once: true })

        const wrapper = mount(FileTreeNode, { props: { node } })
        await wrapper.find('.node-content').trigger('click')

        expect(pdfSelected).toHaveBeenCalledWith(node)
        expect(showWorkspace).toHaveBeenCalledWith('pdf')
    })

    it('does nothing when clicking a file with an unsupported extension', async () => {
        const node: FileSysItem = {
            name: 'readme.txt',
            path: '/notes/readme.txt',
            type: 'file',
            fileExtension: '.txt'
        }
        const wrapper = mount(FileTreeNode, { props: { node } })
        await wrapper.find('.node-content').trigger('click')
        expect(send).not.toHaveBeenCalled()
    })

    it('opens the context menu on right click', async () => {
        const node: FileSysItem = {
            name: 'note.md',
            path: '/notes/note.md',
            type: 'file',
            fileExtension: '.md'
        }
        const wrapper = mount(FileTreeNode, { props: { node } })
        await wrapper.find('.node-content').trigger('contextmenu', { clientX: 10, clientY: 20 })
        expect(showContextMenu).toHaveBeenCalledTimes(1)
        const arg = showContextMenu.mock.calls[0][0]
        // 菜单包含分组项（新建/剪切/复制等）
        expect(Array.isArray(arg.items)).toBe(true)
        expect(arg.items.length).toBeGreaterThan(0)
    })
})

describe('NaviTab', () => {
    let invoke: ReturnType<typeof vi.fn>
    let send: ReturnType<typeof vi.fn>

    beforeEach(() => {
        send = vi.fn()
        invoke = vi.fn().mockResolvedValue([
            {
                id: '1',
                name: 'GitHub',
                type: 'url',
                path: 'https://github.com',
                icon: 'text',
                iconContent: 'G',
                enabled: true,
                order: 0,
                position: 'left'
            },
            {
                id: '2',
                name: '记事本',
                type: 'exe',
                path: 'C:/Windows/notepad.exe',
                icon: 'emoji',
                iconContent: '📝',
                enabled: true,
                order: 1,
                position: 'left'
            },
            {
                id: '3',
                name: '禁用链接',
                type: 'url',
                path: 'https://disabled.example.com',
                icon: 'emoji',
                iconContent: '🚫',
                enabled: false,
                order: 2,
                position: 'left'
            },
            {
                id: '4',
                name: '右侧链接',
                type: 'url',
                path: 'https://right.example.com',
                icon: 'emoji',
                iconContent: '➡️',
                enabled: true,
                order: 0,
                position: 'right'
            }
        ])
        vi.stubGlobal('electron', {
            ipcRenderer: {
                invoke,
                send,
                // P1-FE-04：NaviTab 挂载时注册 QUICK_LINKS.UPDATED 刷新监听，卸载时移除
                on: vi.fn(),
                removeListener: vi.fn()
            }
        })
    })

    it('renders the three built-in buttons on the left', async () => {
        const wrapper = mount(NaviTab, { props: { position: 'left' } })
        await flushPromises()
        const buttons = wrapper.findAll('button[data-index]')
        expect(buttons).toHaveLength(3)
        expect(buttons[0].attributes('title')).toBe('文件管理器')
        expect(buttons[1].attributes('title')).toBe('大纲')
        expect(buttons[2].attributes('title')).toBe('HemyNotes')
        expect(buttons[0].classes()).toContain('active')
    })

    it('does not render built-in buttons on the right', async () => {
        const wrapper = mount(NaviTab, { props: { position: 'right' } })
        await flushPromises()
        expect(wrapper.findAll('button[data-index]')).toHaveLength(0)
    })

    it('loads and filters enabled quick links for the current position', async () => {
        const wrapper = mount(NaviTab, { props: { position: 'left' } })
        await flushPromises()
        // 左侧启用链接 2 个（禁用项被过滤），右侧链接不显示；链接名显示在 title 属性上
        expect(wrapper.findAll('.navi-tab-item:not([data-index])')).toHaveLength(2)
        const titles = wrapper.findAll('button[title]').map((btn) => btn.attributes('title'))
        expect(titles).toContain('GitHub')
        expect(titles).toContain('记事本')
        expect(titles).not.toContain('禁用链接')
        expect(titles).not.toContain('右侧链接')
    })

    it('renders the text icon for text type quick links', async () => {
        const wrapper = mount(NaviTab, { props: { position: 'left' } })
        await flushPromises()
        expect(wrapper.find('.text-icon').text()).toBe('G')
    })

    it('opens the url of a quick link in a new window', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const wrapper = mount(NaviTab, { props: { position: 'left' } })
        await flushPromises()

        const github = wrapper
            .findAll('.navi-tab-item')
            .find((btn) => btn.attributes('title') === 'GitHub')!
        await github.trigger('click')
        expect(openSpy).toHaveBeenCalledWith('https://github.com', '_blank', 'noopener, noreferrer')
    })

    it('sends IPC to launch an exe quick link', async () => {
        const wrapper = mount(NaviTab, { props: { position: 'left' } })
        await flushPromises()

        const notepad = wrapper
            .findAll('.navi-tab-item')
            .find((btn) => btn.attributes('title') === '记事本')!
        await notepad.trigger('click')
        expect(send).toHaveBeenCalledWith('baize:navigation:open-exe', 'C:/Windows/notepad.exe')
    })

    it('toggles the file explorer tab via the update:navi:tab event', async () => {
        const wrapper = mount(NaviTab, { props: { position: 'left' } })
        await flushPromises()

        // 初始 currentNaviTal 为 file-explorer，第一次点击表示收起
        await wrapper.find('button[data-index="0"]').trigger('click')
        expect(wrapper.emitted('update:navi:tab')![0]).toEqual(['switch-open-close'])

        // 切到大纲后 currentNaviTal 变为 markdown-toc
        await wrapper.find('button[data-index="1"]').trigger('click')
        expect(wrapper.emitted('update:navi:tab')![1]).toEqual(['markdown-toc'])

        // 再次点击文件管理器才切换回 file-explorer
        await wrapper.find('button[data-index="0"]').trigger('click')
        expect(wrapper.emitted('update:navi:tab')![2]).toEqual(['file-explorer'])
    })

    it('switches to the markdown outline tab', async () => {
        const wrapper = mount(NaviTab, { props: { position: 'left' } })
        await flushPromises()

        await wrapper.find('button[data-index="1"]').trigger('click')
        expect(wrapper.emitted('update:navi:tab')![0]).toEqual(['markdown-toc'])
    })

    it('opens HemyNotes when clicking its button', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const wrapper = mount(NaviTab, { props: { position: 'left' } })
        await flushPromises()

        await wrapper.find('button[data-index="2"]').trigger('click')
        expect(openSpy).toHaveBeenCalledWith(
            'https://hemy08.github.io/hemynotes/',
            '_blank',
            'noopener, noreferrer'
        )
    })
})
