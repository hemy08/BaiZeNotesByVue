// @vitest-environment jsdom
/**
 * MarkdownEditComponent 生命周期清理回归（内存与生命周期治理 P3）
 *
 * 背景：2026-11-20 内存/生命周期审计发现该组件存在两类「卸载后仍存活」的引用：
 * 1. 分栏拖拽在 document 上挂的 mousemove/mouseup 只在 mouseup 里移除——拖拽未结束就
 *    卸载（关窗/切视图/热更新）或 mouseup 丢失时，监听会残留并持有组件闭包；
 * 2. 文件加载 / 视图切换后的「补一次 Monaco 重排」裸 setTimeout 未保存句柄，卸载后仍会
 *    触发并向全局 EventBus 派发 MONACO_RELAYOUT（空转 + 持有闭包），连续打开文件还会
 *    同时挂起多个不可取消的计时器。
 *
 * 本文件只锁定清理行为（监听移除 / 计时器取消），不重复覆盖拖拽换算与事件接线分支
 *（已有 markdown-edit-component-handlers.test.ts 覆盖）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@renderer/components/Markdown/MarkdownMonacoEditor.vue', async () => {
    const { defineComponent } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试用 Monaco 桩组件
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
        // eslint-disable-next-line vue/one-component-per-file -- 测试用预览桩组件
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
    // 只伪 setTimeout/clearTimeout，保留 setImmediate 让异步子组件（桩）正常就绪
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

/** 挂载编辑器编排层（异步子组件用上面的桩替换） */
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

describe('MarkdownEditComponent：卸载时的监听与计时器清理', () => {
    it('拖拽进行中卸载：document 上的 mousemove/mouseup 监听被成对摘除', async () => {
        const mounted = await mountEditor()
        await mounted.setProps({ editorPreviewWidth: '1000px' })
        await nextTick()
        const resizer = getResizer()

        // 开始拖拽并确认监听已生效（mousemove 能改变分栏宽度）
        resizer.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, bubbles: true }))
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 }))
        await nextTick()
        expect((document.getElementById('md-edit-component') as HTMLElement).style.width).toBe(
            '80%'
        )

        const removeSpy = vi.spyOn(document, 'removeEventListener')
        mounted.unmount()
        wrapper = null

        const removedTypes = removeSpy.mock.calls.map((call) => call[0])
        expect(removedTypes).toContain('mousemove')
        expect(removedTypes).toContain('mouseup')

        // 卸载后残留事件不再抛错（监听已摘除，组件闭包不再被 document 持有）
        expect(() =>
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200 }))
        ).not.toThrow()
    })

    it('重入拖拽（mouseup 丢失）不叠加监听：再次 mousedown 前先摘除旧监听', async () => {
        const mounted = await mountEditor()
        await mounted.setProps({ editorPreviewWidth: '1000px' })
        await nextTick()
        const resizer = getResizer()
        const removeSpy = vi.spyOn(document, 'removeEventListener')

        resizer.dispatchEvent(new MouseEvent('mousedown', { clientX: 400, bubbles: true }))
        // 模拟 mouseup 丢失：不派发 mouseup，直接再次 mousedown
        resizer.dispatchEvent(new MouseEvent('mousedown', { clientX: 420, bubbles: true }))

        const removedTypes = removeSpy.mock.calls.map((call) => call[0])
        expect(removedTypes).toContain('mousemove')
        expect(removedTypes).toContain('mouseup')

        // 拖拽仍可正常工作（最后挂上的一组监听生效；第二次 mousedown 的起点为 420）
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 }))
        await nextTick()
        expect((document.getElementById('md-edit-component') as HTMLElement).style.width).toBe(
            '78%'
        )
    })

    it('卸载时取消文件重载/视图切换的补布局计时器，不再派发 MONACO_RELAYOUT', async () => {
        const mounted = await mountEditor()
        const onContentReloaded = getIpcListener(IPC.EVENTS.FILE_CONTENT_RELOADED)
        const onEditMode = getIpcListener(IPC.VIEW.EDIT_MODE)
        const emitSpy = vi.spyOn(EventBus, '$emit')

        // 两条路径分别挂起 150ms / 100ms 的补布局计时器（尚未到点）
        onContentReloaded({}, { path: '/notes/a.md', content: '# A' })
        onEditMode()

        mounted.unmount()
        wrapper = null
        // 卸载本身产生的其它事件不计入断言
        emitSpy.mockClear()

        vi.advanceTimersByTime(1000)

        const relayoutEmits = emitSpy.mock.calls.filter(
            (call) => call[0] === EVENT_BUS.MONACO_RELAYOUT
        )
        expect(relayoutEmits).toHaveLength(0)
    })

    it('重复挂载/卸载 3 轮：IPC 与窗口监听净增为 0（无累积）', async () => {
        const windowAddSpy = vi.spyOn(window, 'addEventListener')
        const windowRemoveSpy = vi.spyOn(window, 'removeEventListener')
        const ipcOnBefore = ipcRenderer.on.mock.calls.length
        const ipcOffBefore = ipcRenderer.removeListener.mock.calls.length

        for (let round = 0; round < 3; round += 1) {
            const mounted = await mountEditor()
            expect(ipcRenderer.on.mock.calls.length).toBeGreaterThan(ipcOnBefore)
            mounted.unmount()
            wrapper = null
            host?.remove()
            host = null
        }

        // IPC：每轮挂载注册 10 个、卸载移除 10 个，净增 0
        expect(ipcRenderer.on.mock.calls.length - ipcOnBefore).toBe(
            ipcRenderer.removeListener.mock.calls.length - ipcOffBefore
        )
        // 窗口级监听（resize/keydown）成对：净增 0
        const addedResize = windowAddSpy.mock.calls.filter((call) => call[0] === 'resize').length
        const removedResize = windowRemoveSpy.mock.calls.filter(
            (call) => call[0] === 'resize'
        ).length
        expect(addedResize).toBe(removedResize)
        const addedKeydown = windowAddSpy.mock.calls.filter((call) => call[0] === 'keydown').length
        const removedKeydown = windowRemoveSpy.mock.calls.filter(
            (call) => call[0] === 'keydown'
        ).length
        expect(addedKeydown).toBe(removedKeydown)
    })
})
