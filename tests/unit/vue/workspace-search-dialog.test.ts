// @vitest-environment jsdom
/**
 * A2 工作区搜索/替换对话框组件单测（2026-11-21）
 *
 * 覆盖交互：打开初始态、输入+回车搜索、选项透传、点击结果打开并跳行、
 * 单处替换、全部替换二次确认、错误/截断提示、关闭清理。
 * IPC 通过 window.electron.ipcRenderer 替身驱动（真实 composable 链路）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

import WorkspaceSearchDialog from '@renderer/components/search/WorkspaceSearchDialog.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'

/** 搜索结果夹具 */
const searchResult = {
    ok: true,
    files: [
        {
            filePath: 'C:/w/a.md',
            relativePath: 'a.md',
            matches: [
                { line: 1, column: 3, preview: '# Hello' },
                { line: 2, column: 7, preview: 'world hello' }
            ]
        },
        {
            filePath: 'C:/w/b.md',
            relativePath: 'sub/b.md',
            matches: [{ line: 1, column: 1, preview: 'hello' }]
        }
    ],
    truncated: false,
    matchCount: 3,
    scannedFiles: 4
}

/** 替换结果夹具 */
const replaceResult = {
    ok: true,
    files: [{ filePath: 'C:/w/a.md', relativePath: 'a.md', replacements: 1 }],
    totalReplacements: 1
}

let invoke: ReturnType<typeof vi.fn>
let send: ReturnType<typeof vi.fn>
let on: ReturnType<typeof vi.fn>
let removeListener: ReturnType<typeof vi.fn>
let wrappers: VueWrapper[] = []

/** 挂载对话框（Teleport 内联，便于 wrapper 查询） */
function mountDialog(visible = true): VueWrapper {
    const wrapper = mount(WorkspaceSearchDialog, {
        props: { visible },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    })
    wrappers.push(wrapper)
    return wrapper
}

/** 触发搜索：设置查询并回车，等待 IPC Promise 与渲染完成 */
async function search(wrapper: VueWrapper, query = 'hello'): Promise<void> {
    const input = wrapper.find('input.search-input')
    await input.setValue(query)
    await input.trigger('keydown.enter')
    await flushPromises()
    await nextTick()
}

beforeEach(() => {
    vi.clearAllMocks()
    invoke = vi.fn(async (channel: string) => {
        if (channel === IPC.FILE.SEARCH_WORKSPACE) {
            return searchResult
        }
        if (channel === IPC.FILE.REPLACE_WORKSPACE) {
            return replaceResult
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
    vi.useRealTimers()
})

describe('WorkspaceSearchDialog：打开与搜索', () => {
    it('隐藏时不渲染对话框内容', () => {
        const wrapper = mountDialog(false)
        expect(wrapper.find('.workspace-search').exists()).toBe(false)
    })

    it('打开时显示初始提示并聚焦查询输入框', async () => {
        const wrapper = mountDialog()
        await flushPromises()
        expect(wrapper.find('.workspace-search').exists()).toBe(true)
        expect(wrapper.find('.hint').exists()).toBe(true)
        expect(wrapper.findAll('.result-file')).toHaveLength(0)
    })

    it('回车触发 SEARCH_WORKSPACE 并按文件分组渲染结果', async () => {
        const wrapper = mountDialog()
        await search(wrapper)

        expect(invoke).toHaveBeenCalledWith(
            IPC.FILE.SEARCH_WORKSPACE,
            expect.objectContaining({
                query: 'hello',
                caseSensitive: false,
                wholeWord: false,
                useRegex: false
            })
        )
        expect(wrapper.findAll('.result-file')).toHaveLength(2)
        expect(wrapper.findAll('.match-row')).toHaveLength(3)
        expect(wrapper.find('.summary').exists()).toBe(true)
        expect(wrapper.find('.result-file-path').text()).toBe('a.md')
        expect(wrapper.find('.match-line').text()).toBe('1')
        expect(wrapper.find('.match-preview').text()).toBe('# Hello')
    })

    it('选项勾选后随请求透传（区分大小写/整词/正则）', async () => {
        const wrapper = mountDialog()
        const checkboxes = wrapper.findAll('.option-item input')
        expect(checkboxes).toHaveLength(3)
        await checkboxes[0].setValue(true)
        await checkboxes[1].setValue(true)
        await checkboxes[2].setValue(true)
        await search(wrapper, 'hello')

        expect(invoke).toHaveBeenCalledWith(
            IPC.FILE.SEARCH_WORKSPACE,
            expect.objectContaining({
                query: 'hello',
                caseSensitive: true,
                wholeWord: true,
                useRegex: true
            })
        )
    })

    it('搜索失败时展示错误提示（不渲染结果列表）', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.SEARCH_WORKSPACE) {
                return { ok: false, code: 'INVALID_REGEX' }
            }
            return undefined
        })
        const wrapper = mountDialog()
        await search(wrapper, '([')
        expect(wrapper.find('.hint--error').exists()).toBe(true)
        expect(wrapper.findAll('.result-file')).toHaveLength(0)
    })

    it('结果被截断时展示截断提示', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.SEARCH_WORKSPACE) {
                return { ...searchResult, truncated: true }
            }
            return undefined
        })
        const wrapper = mountDialog()
        await search(wrapper)
        expect(wrapper.find('.hint--truncated').exists()).toBe(true)
    })
})

describe('WorkspaceSearchDialog：跳转与替换', () => {
    it('点击结果行打开文件并在主进程确认后跳行', async () => {
        const emitSpy = vi.spyOn(EventBus, '$emit')
        const wrapper = mountDialog()
        await search(wrapper)

        await wrapper.find('.match-row').trigger('click')
        expect(send).toHaveBeenCalledWith(
            IPC.FILE.OPEN_SELECT_FILE,
            expect.objectContaining({ path: 'C:/w/a.md', type: 'file' })
        )

        const listener = on.mock.calls.find(
            (call) => call[0] === IPC.FILE.USER_SELECT_FILE
        )?.[1] as (event: unknown, path: unknown) => void
        listener({}, 'C:/w/a.md')
        // 跳行成功会先等待真实延迟（默认 80ms）再触发 EventBus
        await new Promise((resolve) => setTimeout(resolve, 150))
        await flushPromises()

        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.EDITOR_JUMP_LINE, { line: 1 })
        emitSpy.mockRestore()
    })

    it('单处替换按行/列提交并刷新搜索结果', async () => {
        const wrapper = mountDialog()
        await search(wrapper)
        await wrapper.find('input.replace-input').setValue('HI')
        invoke.mockClear()

        await wrapper.find('.match-replace').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith(
            IPC.FILE.REPLACE_WORKSPACE,
            expect.objectContaining({
                query: 'hello',
                replacement: 'HI',
                filePaths: ['C:/w/a.md'],
                line: 1,
                column: 3
            })
        )
        expect(wrapper.find('.replace-message').exists()).toBe(true)
    })

    it('全部替换需二次确认：确认前不写盘，确认后提交全部文件', async () => {
        const wrapper = mountDialog()
        await search(wrapper)
        await wrapper.find('input.replace-input').setValue('HI')
        invoke.mockClear()

        // 点击「全部替换」：只出现确认条，不调用替换 IPC
        await wrapper.find('.replace-bar .dialog-btn--danger').trigger('click')
        await nextTick()
        expect(wrapper.find('.confirm-bar').exists()).toBe(true)
        expect(
            invoke.mock.calls.filter((call) => call[0] === IPC.FILE.REPLACE_WORKSPACE)
        ).toHaveLength(0)

        await wrapper.find('.confirm-replace').trigger('click')
        await flushPromises()
        const replaceCall = invoke.mock.calls.find((call) => call[0] === IPC.FILE.REPLACE_WORKSPACE)
        expect(replaceCall).toBeDefined()
        expect(replaceCall?.[1]).toMatchObject({
            replacement: 'HI',
            filePaths: ['C:/w/a.md', 'C:/w/b.md']
        })
    })

    it('取消全部替换确认后不写盘', async () => {
        const wrapper = mountDialog()
        await search(wrapper)
        await wrapper.find('input.replace-input').setValue('HI')
        invoke.mockClear()

        await wrapper.find('.replace-bar .dialog-btn--danger').trigger('click')
        await wrapper.find('.cancel-replace').trigger('click')
        await nextTick()
        expect(wrapper.find('.confirm-bar').exists()).toBe(false)
        expect(
            invoke.mock.calls.filter((call) => call[0] === IPC.FILE.REPLACE_WORKSPACE)
        ).toHaveLength(0)
    })

    it('替换失败时展示用户可见错误（不静默）', async () => {
        invoke.mockImplementation(async (channel: string) => {
            if (channel === IPC.FILE.SEARCH_WORKSPACE) {
                return searchResult
            }
            if (channel === IPC.FILE.REPLACE_WORKSPACE) {
                return { ok: false, code: 'FILE_CHANGED', files: [], totalReplacements: 0 }
            }
            return undefined
        })
        const wrapper = mountDialog()
        await search(wrapper)
        await wrapper.find('input.replace-input').setValue('HI')
        await wrapper.find('.match-replace').trigger('click')
        await flushPromises()
        expect(wrapper.find('.replace-message').exists()).toBe(true)
    })

    it('关闭按钮触发 close 事件', async () => {
        const wrapper = mountDialog()
        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('close')).toBeTruthy()
    })
})
