// @vitest-environment jsdom
/**
 * PF-8/PF-4：ResourceManager 目录面板性能相关行为测试。
 *
 * 覆盖：
 * 1. PF-8 TOC 面板隐藏时（文件树模式）不再更新 DOM：只缓存最新大纲，切到目录视图时一次性应用；
 *    显示状态下重复下发相同内容（指纹相同）不会重建列表 DOM 节点；
 * 2. PF-4 目录树整树刷新时按路径恢复展开态（主进程每次下发 isExpanded 为空的新节点）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@imengyu/vue3-context-menu', () => ({
    default: { showContextMenu: vi.fn() }
}))

import ResourceManager from '@renderer/components/ResourceManager/ResourceManager.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'
import type { MarkdownTOC } from '../../../src/shared/types'

let wrapper: VueWrapper | null = null
type IpcHandler = (event: unknown, payload: string) => void
let fileSystemDataHandlers: IpcHandler[]

/** stub 全局 electron：捕获 ResourceManager 注册的 FILE_SYSTEM_DATA 监听器 */
function stubElectron(): void {
    fileSystemDataHandlers = []
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: vi.fn((channel: string, handler: IpcHandler) => {
                if (channel === IPC.FILE_MANAGER.FILE_SYSTEM_DATA) {
                    fileSystemDataHandlers.push(handler)
                }
            }),
            removeListener: vi.fn()
        }
    })
}

/** 模拟主进程下发整树 JSON */
async function emitFileTree(tree: unknown): Promise<void> {
    const payload = JSON.stringify(tree)
    for (const handler of [...fileSystemDataHandlers]) {
        handler({}, payload)
    }
    await nextTick()
    await nextTick()
}

function makeToc(text = '标题一'): MarkdownTOC[] {
    return [
        { id: 'toc-1-0', level: 'h1', text, lineNumber: 0 },
        { id: 'toc-2-3', level: 'h2', text: `${text}二`, lineNumber: 3 }
    ]
}

function makeFolderTree(markdownFileName = 'a.md'): unknown[] {
    return [
        {
            name: 'workspace',
            path: 'C:\\ws',
            type: 'folder',
            fileExtension: '',
            children: [
                {
                    name: 'docs',
                    path: 'C:\\ws\\docs',
                    type: 'folder',
                    fileExtension: '',
                    children: [
                        {
                            name: markdownFileName,
                            path: `C:\\ws\\docs\\${markdownFileName}`,
                            type: 'file',
                            fileExtension: '.md'
                        }
                    ]
                }
            ]
        }
    ]
}

beforeEach(() => {
    stubElectron()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('PF-8 TOC 面板按可见性与内容指纹更新', () => {
    it('should not render TOC DOM while the panel is hidden, and apply the latest TOC when shown', async () => {
        wrapper = mount(ResourceManager)
        // 初始为文件树视图：下发大纲只缓存，不渲染目录列表
        EventBus.$emit(EVENT_BUS.MONACO_CHAPTERS, makeToc('隐藏期间标题'))
        await nextTick()
        expect(wrapper.findAll('#markdown-toc-heading .markdown-toc-title')).toHaveLength(0)

        // 切换到大纲视图：应用隐藏期间累积的最新大纲
        await wrapper.setProps({ naviShow: 'markdown-toc' })
        await nextTick()
        const titles = wrapper.findAll('#markdown-toc-heading .markdown-toc-title')
        expect(titles).toHaveLength(2)
        expect(titles[0].element.textContent).toContain('隐藏期间标题')
    })

    it('should reuse list DOM nodes when re-broadcasting identical TOC content', async () => {
        wrapper = mount(ResourceManager)
        await wrapper.setProps({ naviShow: 'markdown-toc' })
        await nextTick()

        EventBus.$emit(EVENT_BUS.MONACO_CHAPTERS, makeToc())
        await nextTick()
        const firstRow = wrapper.find('#markdown-toc-heading > div')
        const firstElement = firstRow.element

        // 相同内容（新数组、同指纹）：跳过整表替换 → 元素身份保持不变
        EventBus.$emit(EVENT_BUS.MONACO_CHAPTERS, makeToc())
        await nextTick()
        const secondElement = wrapper.find('#markdown-toc-heading > div').element
        expect(secondElement).toBe(firstElement)
    })

    it('should update list when TOC content actually changes', async () => {
        wrapper = mount(ResourceManager)
        await wrapper.setProps({ naviShow: 'markdown-toc' })
        await nextTick()

        EventBus.$emit(EVENT_BUS.MONACO_CHAPTERS, makeToc())
        await nextTick()
        expect(wrapper.text()).toContain('标题一')

        EventBus.$emit(EVENT_BUS.MONACO_CHAPTERS, makeToc('改名后的标题'))
        await nextTick()
        expect(wrapper.text()).toContain('改名后的标题')
        expect(wrapper.findAll('#markdown-toc-heading .markdown-toc-title')).toHaveLength(2)
    })
})

describe('PF-4 文件树整树刷新保留展开态', () => {
    it('should keep expanded folders expanded after a new tree snapshot arrives', async () => {
        wrapper = mount(ResourceManager)
        await emitFileTree(makeFolderTree())
        expect(wrapper.text()).toContain('workspace')

        // 逐级展开 workspace → docs（FileTreeNode 的折叠按钮）
        const toggleButtons = () => wrapper!.findAll('.file-tree-node #node-content button')
        await toggleButtons()[0].trigger('click') // workspace
        await nextTick()
        expect(wrapper.text()).toContain('docs')

        const docsToggle = toggleButtons().find((button) =>
            button.element.parentElement?.parentElement?.textContent?.includes('docs')
        )
        expect(docsToggle).toBeDefined()
        await docsToggle!.trigger('click')
        await nextTick()
        expect(wrapper.text()).toContain('a.md')

        // 主进程外部变更后整树下发（新对象、isExpanded 为空，且多了一个文件）
        await emitFileTree(makeFolderTree('b.md'))

        // 展开态按路径恢复：不需要用户重新展开
        expect(wrapper.text()).toContain('b.md')
        expect(wrapper.findAll('.file-subtree').length).toBeGreaterThan(0)
    })
})
