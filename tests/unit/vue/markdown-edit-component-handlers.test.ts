// @vitest-environment jsdom
/**
 * MarkdownEditComponent 交互/事件接线分支补测（覆盖率补测第四批）
 *
 * 既有 markdown-edit-save-path.test.ts 覆盖保存/flush 热路径；本文件补齐编辑器编排层
 * 其余未覆盖分支：
 * 1. 分隔条拖拽：mousedown → document mousemove（正常 / 10% 下限 / 90% 上限）→ mouseup；
 * 2. 三种视图模式切换与 MONACO_RELAYOUT 通知（编辑 / 预览 / 双栏）；
 * 3. 文件重载事件、编辑区隐藏时的新内容处理（isShowEditArea=false 分支）；
 * 4. EventBus：保存到磁盘 / 写作模板插入 / 模板替换（编辑区可见与隐藏两种路径）；
 * 5. 窗口 resize 与 editorPreviewWidth prop 变更；
 * 6. 活动文件路径 IPC 透传（合法字符串 / 非字符串重置）；
 * 7. 异步 chunk 加载失败时渲染错误占位并可点击重试（MarkdownPaneError）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@renderer/components/Markdown/MarkdownMonacoEditor.vue', async () => {
    const { defineComponent } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试用 Monaco 桩组件（vi.mock 工厂内联定义）
        default: defineComponent({
            name: 'MdMonacoEditStub',
            props: {
                code: { type: String, default: '' },
                editorAreaWidth: { type: String, default: '50%' }
            },
            emits: ['update:code'],
            template: '<div class="monaco-stub">{{ code }}</div>'
        })
    }
})

vi.mock('@renderer/components/Markdown/MarkdownPreviewComponent.vue', async () => {
    const { defineComponent } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试用预览桩组件（vi.mock 工厂内联定义）
        default: defineComponent({
            name: 'MdPreviewStub',
            props: {
                editorContent: { type: String, default: '' },
                active: { type: Boolean, default: true },
                activeFilePath: { type: String, default: '' }
            },
            template: '<div class="preview-stub" />'
        })
    }
})

import MdMonacoEdit from '@renderer/components/Markdown/MarkdownMonacoEditor.vue'
import MdPreview from '@renderer/components/Markdown/MarkdownPreviewComponent.vue'
import MarkdownEditComponent from '@renderer/components/Markdown/MarkdownEditComponent.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'

type Listener = (event?: unknown, ...args: unknown[]) => void

interface IpcMock {
    on: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
}

let ipcRenderer: IpcMock
let wrapper: ReturnType<typeof mount> | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    ipcRenderer = {
        on: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn().mockResolvedValue(undefined),
        removeListener: vi.fn()
    }
    vi.stubGlobal('electron', { ipcRenderer })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    host?.remove()
    host = null
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 等待异步子组件（Monaco/预览桩）就绪 */
async function mountEditor(props: Record<string, unknown> = {}) {
    host = document.createElement('div')
    host.style.width = '800px'
    document.body.appendChild(host)
    wrapper = mount(MarkdownEditComponent, { props, attachTo: host })
    await new Promise<void>((resolve) => {
        setImmediate(resolve)
    })
    await nextTick()
    return wrapper
}

/** 取出组件注册的某个 IPC 监听回调 */
function getIpcListener(channel: string): Listener {
    const call = ipcRenderer.on.mock.calls.find((args) => args[0] === channel)
    expect(call, `${channel} 监听应已注册`).toBeTruthy()
    return call![1] as Listener
}

function getResizer(): HTMLElement {
    const el = document.getElementById('resizer-md')
    expect(el).toBeTruthy()
    return el as HTMLElement
}

describe('MarkdownEditComponent：分隔条拖拽', () => {
    it('mousedown 后随 mousemove 调整宽度，mouseup 后停止响应', async () => {
        const mounted = await mountEditor()
        // jsdom 的 clientWidth 恒为 0，先通过 prop 注入确定的容器宽度（1000px）参与百分比换算
        await mounted.setProps({ editorPreviewWidth: '1000px' })
        await nextTick()
        const resizer = getResizer()

        resizer.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, bubbles: true }))
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 }))
        await nextTick()
        expect((document.getElementById('md-edit-component') as HTMLElement).style.width).toBe(
            '80%'
        )

        // 超过 90% 上限被钳制
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 2000 }))
        await nextTick()
        expect((document.getElementById('md-edit-component') as HTMLElement).style.width).toBe(
            '90%'
        )
        // 低于 10% 下限被钳制
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: -1000 }))
        await nextTick()
        expect((document.getElementById('md-edit-component') as HTMLElement).style.width).toBe(
            '10%'
        )

        // mouseup 后的 mousemove 不再生效
        document.dispatchEvent(new MouseEvent('mouseup'))
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 600 }))
        await nextTick()
        expect((document.getElementById('md-edit-component') as HTMLElement).style.width).toBe(
            '10%'
        )
    })
})

describe('MarkdownEditComponent：视图模式切换', () => {
    it('三种视图模式切换并广播 MONACO_RELAYOUT', async () => {
        await mountEditor()
        const emitSpy = vi.spyOn(EventBus, '$emit')

        getIpcListener(IPC.VIEW.EDIT_MODE)()
        await nextTick()
        expect(getResizer().style.display).toBe('none')
        vi.advanceTimersByTime(150)
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.MONACO_RELAYOUT)

        getIpcListener(IPC.VIEW.PREVIEW_MODE)()
        await nextTick()
        expect(getResizer().style.display).toBe('none')
        vi.advanceTimersByTime(150)

        getIpcListener(IPC.VIEW.EDIT_PREVIEW_MODE)()
        await nextTick()
        expect(getResizer().style.display).not.toBe('none')
        vi.advanceTimersByTime(150)
        expect(
            emitSpy.mock.calls.filter((call) => call[0] === EVENT_BUS.MONACO_RELAYOUT).length
        ).toBeGreaterThanOrEqual(3)
    })
})

describe('MarkdownEditComponent：文件事件与编辑区可见性', () => {
    it('FILE_CONTENT_RELOADED 更新内容；编辑区隐藏时不再注入编辑器 code', async () => {
        const mounted = await mountEditor()
        const monaco = mounted.findComponent(MdMonacoEdit)

        getIpcListener(IPC.EVENTS.FILE_CONTENT_RELOADED)({}, { path: 'a.md', content: '重载内容' })
        await nextTick()
        expect(monaco.props('code')).toBe('重载内容')
        expect(mounted.findComponent(MdPreview).props('editorContent')).toBe('重载内容')

        // 切到纯预览模式（编辑区隐藏）：新内容只更新预览，不写 initialCodeContent
        getIpcListener(IPC.VIEW.PREVIEW_MODE)()
        await nextTick()
        const codeBefore = monaco.props('code')
        getIpcListener(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT)({}, '预览模式新内容')
        await nextTick()
        expect(monaco.props('code')).toBe(codeBefore)
        expect(mounted.findComponent(MdPreview).props('editorContent')).toBe('预览模式新内容')
    })

    it('活动文件路径经 IPC 透传给预览（合法字符串 / 非字符串重置）', async () => {
        const mounted = await mountEditor()
        const preview = mounted.findComponent(MdPreview)

        getIpcListener(IPC.FILE.USER_SELECT_FILE)({}, 'C:\\notes\\b.md')
        await nextTick()
        expect(preview.props('activeFilePath')).toBe('C:\\notes\\b.md')

        getIpcListener(IPC.FILE.USER_SELECT_FILE)({}, undefined)
        await nextTick()
        expect(preview.props('activeFilePath')).toBe('')
    })
})

describe('MarkdownEditComponent：EventBus 事件与窗口尺寸', () => {
    it('保存到磁盘事件直接发送 SAVE_TO_DISK', async () => {
        await mountEditor()
        mounted_emitCode(wrapper!, '待保存内容')
        EventBus.$emit(EVENT_BUS.MONACO_SAVE_FILE_CONTENT_TO_DISK)
        expect(ipcRenderer.send).toHaveBeenCalledWith(IPC.FILE.SAVE_TO_DISK, '待保存内容')
    })

    it('写作模板事件：非空值插入光标处，空值忽略', async () => {
        await mountEditor()
        const emitSpy = vi.spyOn(EventBus, '$emit')
        EventBus.$emit(EVENT_BUS.MONACO_USE_TEMPLATE, '## 模板')
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.MONACO_INSERT_TEXT, '## 模板')

        emitSpy.mockClear()
        EventBus.$emit(EVENT_BUS.MONACO_USE_TEMPLATE, '')
        expect(emitSpy).not.toHaveBeenCalledWith(EVENT_BUS.MONACO_INSERT_TEXT, '')
    })

    it('模板替换事件：编辑区可见时更新编辑器内容，隐藏时只更新预览', async () => {
        const mounted = await mountEditor()
        const monaco = mounted.findComponent(MdMonacoEdit)

        EventBus.$emit(EVENT_BUS.MONACO_REPLACE_TEXT, '替换内容')
        await nextTick()
        expect(monaco.props('code')).toBe('替换内容')
        expect(mounted.findComponent(MdPreview).props('editorContent')).toBe('替换内容')

        getIpcListener(IPC.VIEW.PREVIEW_MODE)()
        await nextTick()
        const codeBefore = monaco.props('code')
        EventBus.$emit(EVENT_BUS.MONACO_REPLACE_TEXT, '隐藏时替换')
        await nextTick()
        expect(monaco.props('code')).toBe(codeBefore)
        expect(mounted.findComponent(MdPreview).props('editorContent')).toBe('隐藏时替换')
    })

    it('窗口 resize 与 editorPreviewWidth prop 变更更新布局宽度', async () => {
        const mounted = await mountEditor({ editorPreviewWidth: '100%' })
        window.dispatchEvent(new Event('resize'))
        await nextTick()

        await mounted.setProps({ editorPreviewWidth: '720px' })
        await nextTick()
        const preview = document.getElementById('md-preview') as HTMLElement
        expect(preview.style.width).toContain('%')
        expect(preview.style.width).not.toContain('NaN')
    })

    it('非 Ctrl+S 按键不触发保存', async () => {
        await mountEditor()
        ipcRenderer.send.mockClear()
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }))
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', ctrlKey: true }))
        expect(ipcRenderer.send).not.toHaveBeenCalled()
    })

    it('卸载时移除 IPC 监听', async () => {
        const mounted = await mountEditor()
        mounted.unmount()
        wrapper = null
        expect(ipcRenderer.removeListener).toHaveBeenCalled()
    })
})

/** 模拟子 Monaco 编辑器上报内容变化 */
function mounted_emitCode(mounted: ReturnType<typeof mount>, value: string): void {
    mounted.findComponent(MdMonacoEdit).vm.$emit('update:code', value)
}

describe('MarkdownEditComponent：异步 chunk 加载失败兜底', () => {
    it('Monaco chunk 加载失败渲染错误占位，点击重试再次加载', async () => {
        vi.resetModules()
        vi.doMock('@renderer/components/Markdown/MarkdownMonacoEditor.vue', () => {
            throw new Error('模拟 chunk 加载失败')
        })
        try {
            const { default: FreshComponent } =
                await import('@renderer/components/Markdown/MarkdownEditComponent.vue')
            host = document.createElement('div')
            document.body.appendChild(host)
            wrapper = mount(FreshComponent, { attachTo: host })
            await new Promise<void>((resolve) => {
                setImmediate(resolve)
            })
            await nextTick()
            await nextTick()

            const errorPane = wrapper.find('.md-pane-error')
            expect(errorPane.exists()).toBe(true)
            expect(errorPane.text().length).toBeGreaterThan(0)

            // 点击重试：再次触发 loader（仍失败，但不抛异常）
            await errorPane.find('button').trigger('click')
            await new Promise<void>((resolve) => {
                setImmediate(resolve)
            })
            await nextTick()
            expect(wrapper.find('.md-pane-error').exists()).toBe(true)
        } finally {
            vi.doUnmock('@renderer/components/Markdown/MarkdownMonacoEditor.vue')
            vi.resetModules()
        }
    })
})
