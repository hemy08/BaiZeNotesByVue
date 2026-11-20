// @vitest-environment jsdom
/**
 * MarkdownEditComponent 滚动同步编排测试（1.5.0：编辑器 → 预览单向同步的父组件编排层）。
 *
 * 覆盖：
 * 1. 编辑器 `sync-scroll` 事件 → 补单调递增 seq → 经 prop 传给预览（仅分栏预览可见时）；
 * 2. 非法/空 payload 被丢弃，不产生同步目标；
 * 3. 隐藏预览（纯编辑模式）不再透传目标；恢复分栏后重新透传并继续递增 seq；
 * 4. 切换文件/清空编辑器时清除目标并复位 seq（避免预览重放上一文件的旧行号）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
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
            emits: ['update:code', 'sync-scroll'],
            template: '<div class="monaco-stub" />'
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
                activeFilePath: { type: String, default: '' },
                syncScrollTarget: { type: Object, default: null }
            },
            template: '<div class="preview-stub" />'
        })
    }
})

import MarkdownEditComponent from '@renderer/components/Markdown/MarkdownEditComponent.vue'
import { IPC } from '../../../src/shared/ipc-channels'

type Listener = (event?: unknown, ...args: unknown[]) => void

interface IpcMock {
    on: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
}

let ipcRenderer: IpcMock
let wrapper: VueWrapper | null = null
let host: HTMLDivElement | null = null

beforeEach(() => {
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
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 挂载编辑器编排组件（Monaco/预览均为声明了 prop/emit 的桩） */
async function mountEditor(): Promise<VueWrapper> {
    host = document.createElement('div')
    host.style.width = '1000px'
    document.body.appendChild(host)
    wrapper = mount(MarkdownEditComponent, {
        props: { editorPreviewWidth: '1000px' },
        attachTo: host
    })
    await flushPromises()
    await nextTick()
    return wrapper
}

/** 取出组件注册的 IPC 监听回调 */
function getIpcListener(channel: string): Listener {
    const call = ipcRenderer.on.mock.calls.find((args) => args[0] === channel)
    expect(call, `${channel} 监听应已注册`).toBeTruthy()
    return call![1] as Listener
}

/** 当前预览桩收到的 sync-scroll-target prop */
function previewSyncTarget(mounted: VueWrapper): unknown {
    const preview = mounted.findComponent({ name: 'MdPreviewStub' })
    expect(preview.exists(), '预览桩应已挂载').toBe(true)
    return preview.props('syncScrollTarget')
}

/** 由 Monaco 桩发一次滚动同步事件 */
async function emitSyncScroll(
    mounted: VueWrapper,
    anchor: { line?: unknown; ratio?: unknown } | null
): Promise<void> {
    mounted.findComponent({ name: 'MdMonacoEditStub' }).vm.$emit('sync-scroll', anchor)
    await nextTick()
    await flushPromises()
}

describe('MarkdownEditComponent：滚动同步编排', () => {
    it('可见时透传目标并分配单调递增 seq', async () => {
        const mounted = await mountEditor()
        expect(previewSyncTarget(mounted)).toBeNull()

        await emitSyncScroll(mounted, { line: 30, ratio: 0.4 })
        expect(previewSyncTarget(mounted)).toEqual({ line: 30, ratio: 0.4, seq: 1 })

        await emitSyncScroll(mounted, { line: 55, ratio: 0.8 })
        expect(previewSyncTarget(mounted)).toEqual({ line: 55, ratio: 0.8, seq: 2 })
    })

    it('非法 payload（空/缺字段/NaN）被丢弃，不产生目标', async () => {
        const mounted = await mountEditor()

        await emitSyncScroll(mounted, null)
        await emitSyncScroll(mounted, {})
        await emitSyncScroll(mounted, { line: Number.NaN, ratio: 0.5 })
        await emitSyncScroll(mounted, { line: 3, ratio: Number.POSITIVE_INFINITY })
        expect(previewSyncTarget(mounted)).toBeNull()

        await emitSyncScroll(mounted, { line: 3, ratio: 0.1 })
        expect(previewSyncTarget(mounted)).toEqual({ line: 3, ratio: 0.1, seq: 1 })
    })

    it('隐藏预览时不同步（纯编辑模式），恢复分栏后继续透传', async () => {
        const mounted = await mountEditor()
        await emitSyncScroll(mounted, { line: 10, ratio: 0.2 })
        expect(previewSyncTarget(mounted)).toEqual({ line: 10, ratio: 0.2, seq: 1 })

        // 切到纯编辑模式：isShowPreviewArea=false，传给预览的目标恒为 null
        getIpcListener(IPC.VIEW.EDIT_MODE)({})
        await nextTick()
        expect(previewSyncTarget(mounted)).toBeNull()

        // 隐藏期间编辑器事件不分配 seq（返回分栏后仍从 2 继续）
        await emitSyncScroll(mounted, { line: 20, ratio: 0.5 })
        expect(previewSyncTarget(mounted)).toBeNull()

        getIpcListener(IPC.VIEW.EDIT_PREVIEW_MODE)({})
        await nextTick()
        // 恢复分栏：重新透传最后已知目标
        expect(previewSyncTarget(mounted)).toEqual({ line: 10, ratio: 0.2, seq: 1 })

        await emitSyncScroll(mounted, { line: 25, ratio: 0.6 })
        expect(previewSyncTarget(mounted)).toEqual({ line: 25, ratio: 0.6, seq: 2 })
    })

    it('切换文件/清空编辑器时清除目标并复位 seq', async () => {
        const mounted = await mountEditor()
        await emitSyncScroll(mounted, { line: 40, ratio: 0.9 })
        expect(previewSyncTarget(mounted)).toEqual({ line: 40, ratio: 0.9, seq: 1 })

        // 主进程下发新文件内容：目标清空（预览不继承上一文件位置）
        getIpcListener(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT)({}, '# 新文件\n')
        await nextTick()
        expect(previewSyncTarget(mounted)).toBeNull()

        // 新文件首个目标 seq 从 1 重新开始
        await emitSyncScroll(mounted, { line: 1, ratio: 0 })
        expect(previewSyncTarget(mounted)).toEqual({ line: 1, ratio: 0, seq: 1 })

        // 清空编辑器（CLEAR_EDITOR_PREVIEW）同样复位
        getIpcListener(IPC.FILE.CLEAR_EDITOR_PREVIEW)({})
        await nextTick()
        expect(previewSyncTarget(mounted)).toBeNull()
        await emitSyncScroll(mounted, { line: 2, ratio: 0.1 })
        expect(previewSyncTarget(mounted)).toEqual({ line: 2, ratio: 0.1, seq: 1 })
    })
})
