// @vitest-environment jsdom
/**
 * A2/A9 搜索与命令面板宿主单测（2026-11-21）
 *
 * 覆盖：宿主挂载后 Ctrl+Shift+F / Ctrl+Shift+P / Ctrl+P 三个快捷键分别打开
 * 工作区搜索 / 命令面板（命令模式）/ 文件 Quick Open（文件模式）；两者互斥；
 * 未命中快捷键不响应；卸载时移除全局 keyboard 监听。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

import SearchOverlayHost from '@renderer/components/search/SearchOverlayHost.vue'
import { IPC } from '../../../src/shared/ipc-channels'

const fileListResult = {
    ok: true,
    files: [],
    fileList: [{ filePath: 'C:/w/a.md', relativePath: 'a.md' }],
    truncated: false,
    matchCount: 0,
    scannedFiles: 1
}

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>
let on: ReturnType<typeof vi.fn>
let removeListener: ReturnType<typeof vi.fn>
let wrappers: VueWrapper[] = []

/** 挂载宿主（两个子浮层真实渲染；Teleport 内联便于查询） */
function mountHost(): VueWrapper {
    const wrapper = mount(SearchOverlayHost, {
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    wrappers.push(wrapper)
    return wrapper
}

/** 派发键盘事件到 window（捕获阶段监听） */
function pressKey(key: string, modifiers: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
        ...modifiers
    })
    window.dispatchEvent(event)
    return event
}

beforeEach(() => {
    vi.clearAllMocks()
    invoke = vi.fn(async (channel: string) => {
        if (channel === IPC.FILE.SEARCH_WORKSPACE) {
            return fileListResult
        }
        return undefined
    })
    send = vi.fn()
    on = vi.fn()
    removeListener = vi.fn()
    vi.stubGlobal('electron', {
        ipcRenderer: { invoke, send, on, removeListener }
    })
})

afterEach(() => {
    for (const wrapper of wrappers) {
        wrapper.unmount()
    }
    wrappers = []
    document.body.innerHTML = ''
    vi.unstubAllGlobals()
})

describe('SearchOverlayHost：快捷键 ↔ 浮层', () => {
    it('Ctrl+Shift+F 打开工作区搜索对话框并阻止默认行为', async () => {
        const wrapper = mountHost()
        const event = pressKey('f', { ctrlKey: true, shiftKey: true })
        await nextTick()

        expect(event.defaultPrevented).toBe(true)
        expect(wrapper.find('.workspace-search').exists()).toBe(true)
        expect(wrapper.find('.command-palette').exists()).toBe(false)
    })

    it('Ctrl+Shift+P 打开命令面板（命令模式），与搜索互斥', async () => {
        const wrapper = mountHost()
        pressKey('f', { ctrlKey: true, shiftKey: true })
        await nextTick()
        expect(wrapper.find('.workspace-search').exists()).toBe(true)

        pressKey('p', { ctrlKey: true, shiftKey: true })
        await nextTick()
        await flushPromises()

        expect(wrapper.find('.workspace-search').exists()).toBe(false)
        expect(wrapper.find('.command-palette').exists()).toBe(true)
        // 命令模式不应拉取文件清单
        expect(
            invoke.mock.calls.filter((call) => call[0] === IPC.FILE.SEARCH_WORKSPACE)
        ).toHaveLength(0)
    })

    it('Ctrl+P 打开文件 Quick Open（文件模式）并拉取清单', async () => {
        const wrapper = mountHost()
        pressKey('p', { ctrlKey: true })
        await nextTick()
        await flushPromises()

        expect(wrapper.find('.command-palette').exists()).toBe(true)
        expect(invoke).toHaveBeenCalledWith(
            IPC.FILE.SEARCH_WORKSPACE,
            expect.objectContaining({ listFilesOnly: true })
        )
        expect(wrapper.findAll('.palette-option')).toHaveLength(1)
    })

    it('macOS Cmd（metaKey）同样可打开', async () => {
        const wrapper = mountHost()
        pressKey('p', { metaKey: true })
        await nextTick()
        expect(wrapper.find('.command-palette').exists()).toBe(true)
    })

    it('未命中快捷键不打开任何浮层', async () => {
        const wrapper = mountHost()
        const event = pressKey('f', { ctrlKey: true })
        await nextTick()
        expect(event.defaultPrevented).toBe(false)
        expect(wrapper.find('.workspace-search').exists()).toBe(false)
        expect(wrapper.find('.command-palette').exists()).toBe(false)
    })

    it('卸载时移除全局 keydown 监听（不泄漏）', async () => {
        const removeSpy = vi.spyOn(window, 'removeEventListener')
        const wrapper = mountHost()
        wrapper.unmount()
        wrappers = wrappers.filter((item) => item !== wrapper)

        const removedKeydown = removeSpy.mock.calls.some(
            (call) => call[0] === 'keydown' && call[2] === true
        )
        expect(removedKeydown).toBe(true)
        // 卸载后再派发快捷键不应抛异常
        expect(() => pressKey('p', { ctrlKey: true })).not.toThrow()
        removeSpy.mockRestore()
    })
})
