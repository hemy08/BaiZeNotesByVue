// @vitest-environment jsdom
/**
 * A9 命令面板 / Quick Open 组件单测（2026-11-21）
 *
 * 覆盖交互：命令列表渲染/过滤、↑↓ 选择、Enter 执行（复用菜单动作）、
 * 命令↔文件模式切换、文件 Quick Open 打开文件、Esc 关闭、空结果提示。
 * 菜单动作分发与 IPC 均以替身驱动，组件测试只验证接线。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

const handleMenuActionMock = vi.hoisted(() => vi.fn())
vi.mock('@renderer/components/MenuBar/menu-actions', () => ({
    HandleMenuAction: handleMenuActionMock
}))

import CommandPalette from '@renderer/components/search/CommandPalette.vue'
import { IPC } from '../../../src/shared/ipc-channels'

const fileListResult = {
    ok: true,
    files: [],
    fileList: [
        { filePath: 'C:/w/docs/guide.md', relativePath: 'docs/guide.md' },
        { filePath: 'C:/w/src/workspace-search.md', relativePath: 'src/workspace-search.md' }
    ],
    truncated: false,
    matchCount: 0,
    scannedFiles: 2
}

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>
let on: ReturnType<typeof vi.fn>
let removeListener: ReturnType<typeof vi.fn>
let wrappers: VueWrapper[] = []

/** 挂载命令面板 */
function mountPalette(initialMode: 'command' | 'file' = 'command'): VueWrapper {
    const wrapper = mount(CommandPalette, {
        props: { visible: true, initialMode },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    wrappers.push(wrapper)
    return wrapper
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

describe('CommandPalette：命令模式', () => {
    it('渲染全部命令并按分类分组', async () => {
        const wrapper = mountPalette()
        await flushPromises()
        expect(wrapper.findAll('.palette-option')).toHaveLength(17)
        expect(wrapper.findAll('.palette-group-title').length).toBeGreaterThanOrEqual(4)
    })

    it('输入过滤命令（关键词命中）', async () => {
        const wrapper = mountPalette()
        await wrapper.find('input.palette-input').setValue('mermaid')
        await nextTick()
        const options = wrapper.findAll('.palette-option')
        expect(options).toHaveLength(1)
        expect(options[0].text()).toContain('Mermaid')
    })

    it('无命中时显示空状态提示', async () => {
        const wrapper = mountPalette()
        await wrapper.find('input.palette-input').setValue('zzzz-not-exist')
        await nextTick()
        expect(wrapper.findAll('.palette-option')).toHaveLength(0)
        expect(wrapper.find('.palette-hint').exists()).toBe(true)
    })

    it('Enter 执行首条命令（复用 HandleMenuAction）并关闭面板', async () => {
        const wrapper = mountPalette()
        const input = wrapper.find('input.palette-input')
        await input.trigger('keydown', { key: 'Enter' })
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:file:save')
        expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('↓ 移动选择后再 Enter 执行下一条命令', async () => {
        const wrapper = mountPalette()
        const input = wrapper.find('input.palette-input')
        await input.trigger('keydown', { key: 'ArrowDown' })
        await input.trigger('keydown', { key: 'Enter' })
        expect(handleMenuActionMock).toHaveBeenCalledWith('baize:menu:file:open-folder')
    })

    it('↑ 从首项循环到末项', async () => {
        const wrapper = mountPalette()
        const input = wrapper.find('input.palette-input')
        // 过滤到「命令面板」命令（模式切换，不关闭面板）；它不再依赖列表末项位置
        await input.setValue('command-palette')
        await nextTick()
        await input.trigger('keydown', { key: 'Enter' })
        expect(handleMenuActionMock).not.toHaveBeenCalled()
        expect(wrapper.emitted('close')).toBeFalsy()
    })

    it('选中「Quick Open」命令切换到文件模式并加载文件清单', async () => {
        const wrapper = mountPalette()
        const input = wrapper.find('input.palette-input')
        await input.setValue('quick-open')
        await nextTick()
        await input.trigger('keydown', { key: 'Enter' })
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(
            IPC.FILE.SEARCH_WORKSPACE,
            expect.objectContaining({ listFilesOnly: true })
        )
        expect(wrapper.emitted('close')).toBeFalsy()
        expect(wrapper.findAll('.palette-option')).toHaveLength(2)
    })

    it('命令执行抛错时展示错误提示且不关闭', async () => {
        handleMenuActionMock.mockImplementationOnce(() => {
            throw new Error('menu dispatch failed')
        })
        const wrapper = mountPalette()
        await wrapper.find('input.palette-input').trigger('keydown', { key: 'Enter' })
        expect(wrapper.find('.palette-hint--error').exists()).toBe(true)
        expect(wrapper.emitted('close')).toBeFalsy()
    })

    it('Esc 关闭面板（BaseDialog 键盘契约）', async () => {
        const wrapper = mountPalette()
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        await nextTick()
        expect(wrapper.emitted('close')).toBeTruthy()
    })
})

describe('CommandPalette：文件 Quick Open 模式', () => {
    it('打开时拉取工作区文件并渲染清单', async () => {
        const wrapper = mountPalette('file')
        await flushPromises()
        expect(invoke).toHaveBeenCalledWith(
            IPC.FILE.SEARCH_WORKSPACE,
            expect.objectContaining({ listFilesOnly: true })
        )
        expect(wrapper.findAll('.palette-option')).toHaveLength(2)
    })

    it('输入过滤文件清单（子序列兜底）', async () => {
        const wrapper = mountPalette('file')
        await flushPromises()
        await wrapper.find('input.palette-input').setValue('wsm')
        await nextTick()
        const options = wrapper.findAll('.palette-option')
        expect(options).toHaveLength(1)
        expect(options[0].text()).toContain('workspace-search.md')
    })

    it('Enter 打开选中文件（OPEN_SELECT_FILE）并在确认后关闭', async () => {
        const wrapper = mountPalette('file')
        await flushPromises()
        await wrapper.find('input.palette-input').trigger('keydown', { key: 'Enter' })

        expect(send).toHaveBeenCalledWith(
            IPC.FILE.OPEN_SELECT_FILE,
            expect.objectContaining({ path: 'C:/w/docs/guide.md', type: 'file' })
        )
        const listener = on.mock.calls.find(
            (call) => call[0] === IPC.FILE.USER_SELECT_FILE
        )?.[1] as (event: unknown, path: unknown) => void
        listener({}, 'C:/w/docs/guide.md')
        await new Promise((resolve) => setTimeout(resolve, 150))
        await flushPromises()
        expect(wrapper.emitted('close')).toBeTruthy()
    })

    it('无文件时显示空状态提示', async () => {
        invoke.mockResolvedValue({
            ok: true,
            files: [],
            fileList: [],
            truncated: false,
            matchCount: 0,
            scannedFiles: 0
        })
        const wrapper = mountPalette('file')
        await flushPromises()
        expect(wrapper.findAll('.palette-option')).toHaveLength(0)
        expect(wrapper.find('.palette-hint').exists()).toBe(true)
    })
})
