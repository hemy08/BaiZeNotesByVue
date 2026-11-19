// @vitest-environment jsdom
/**
 * MarkdownEditComponent 击键/保存热路径测试（P1/PF-3）
 *
 * 覆盖：
 * 1. 500ms 防抖语义保持：击键期间不发全文 IPC，空闲 500ms 后只发一次
 *    UPDATE_SELECT_FILE_CONTENT（载荷为最新全文）；
 * 2. 内容未变化（如 setValue 回显）时不重复发 IPC；
 * 3. Ctrl+S 合并 IPC：修复前「UPDATE 全文 + SAVE 全文」= 2 份，修复后固定 1 份
 *    SAVE_TO_DISK（主进程 handler 会先把载荷写入当前文件内容再落盘）；
 * 4. 渲染层 flush 契约：内容未变化时只回 FLUSH_CONTENT_DONE，变化时先 UPDATE 再 DONE；
 * 5. 预览可见性 prop 正确传递（PF-2：父组件把 isShowPreviewArea 传给预览组件 active）。
 *
 * 说明：mock 掉 Monaco 编辑器与预览组件（Monaco 依赖 DOM/worker，jsdom 下不可用），
 * 本测试只验证 MarkdownEditComponent 的热路径编排逻辑。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'

vi.mock('@renderer/components/Markdown/MarkdownMonacoEditor.vue', async () => {
    const { defineComponent } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试用 Monaco 桩组件（vi.mock 工厂内联定义），非生产单文件组件
        default: defineComponent({
            name: 'MdMonacoEditStub',
            props: {
                code: { type: String, default: '' },
                editorAreaWidth: { type: String, default: '50%' },
                filePath: { type: String, default: '' }
            },
            emits: ['update:code'],
            template: '<div class="monaco-stub" />'
        })
    }
})

vi.mock('@renderer/components/Markdown/MarkdownPreviewComponent.vue', async () => {
    const { defineComponent } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试用预览桩组件（vi.mock 工厂内联定义），非生产单文件组件
        default: defineComponent({
            name: 'MdPreviewStub',
            props: {
                editorContent: { type: String, default: '' },
                active: { type: Boolean, default: true }
            },
            template: '<div class="preview-stub">{{ editorContent }}</div>'
        })
    }
})

import MdMonacoEdit from '@renderer/components/Markdown/MarkdownMonacoEditor.vue'
import MdPreview from '@renderer/components/Markdown/MarkdownPreviewComponent.vue'
import MarkdownEditComponent from '@renderer/components/Markdown/MarkdownEditComponent.vue'
import { IPC } from '../../../src/shared/ipc-channels'

type IpcMock = {
    on: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
}

describe('MarkdownEditComponent 击键/保存热路径（PF-3）', () => {
    let ipcRenderer: IpcMock
    let wrapper: ReturnType<typeof mount> | null = null

    beforeEach(() => {
        // 结构优化第 2 批 2.2（H4）：MarkdownMonacoEditor / MarkdownPreviewComponent 改为
        // defineAsyncComponent 后，组件挂载需要等模块 Promise（真实宏任务）与渲染 flush；
        // 这里只伪造防抖用到的 setTimeout/clearTimeout，保留 setImmediate 供异步组件就绪等待。
        vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
        ipcRenderer = {
            on: vi.fn(),
            send: vi.fn(),
            invoke: vi.fn(),
            removeListener: vi.fn()
        }
        // 与既有 Vue 组件测试一致：以 preload 暴露形态 stub 全局 electron
        vi.stubGlobal('electron', { ipcRenderer })
    })

    afterEach(() => {
        wrapper?.unmount()
        wrapper = null
        vi.useRealTimers()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    /**
     * 等待按需加载的 Monaco/预览异步组件就绪后返回 wrapper。
     * defineAsyncComponent 的延迟/超时定时器在挂载末尾清理，故用真实宏任务让模块 import
     * 的 Promise 链与 Vue 渲染 flush 全部完成；随后再 nextTick 一次确保子组件已提交。
     */
    async function mountEditor() {
        wrapper = mount(MarkdownEditComponent)
        await new Promise<void>((resolve) => {
            setImmediate(resolve)
        })
        await nextTick()
        return wrapper
    }

    /** 模拟子 Monaco 编辑器上报内容变化 */
    function emitCode(value: string) {
        wrapper!.findComponent(MdMonacoEdit).vm.$emit('update:code', value)
    }

    /** 取出组件注册的某个 IPC 监听回调 */
    function getIpcListener(channel: string): (event?: unknown, ...args: unknown[]) => void {
        const call = ipcRenderer.on.mock.calls.find((args) => args[0] === channel)
        expect(call, `${channel} 监听应已注册`).toBeTruthy()
        return call![1] as (event?: unknown, ...args: unknown[]) => void
    }

    function sentPayloads(channel: string): unknown[] {
        return ipcRenderer.send.mock.calls
            .filter(([sentChannel]) => sentChannel === channel)
            .map(([, payload]) => payload)
    }

    it('should debounce full-content IPC to a single send after 500ms idle', async () => {
        await mountEditor()

        emitCode('第一版')
        expect(ipcRenderer.send).not.toHaveBeenCalled()

        vi.advanceTimersByTime(499)
        expect(ipcRenderer.send).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(sentPayloads(IPC.FILE.UPDATE_SELECT_FILE_CONTENT)).toEqual(['第一版'])
        expect(ipcRenderer.send).toHaveBeenCalledTimes(1)
    })

    it('should skip IPC when the reported content equals the last synced content', async () => {
        await mountEditor()

        emitCode('abc')
        vi.advanceTimersByTime(500)
        expect(sentPayloads(IPC.FILE.UPDATE_SELECT_FILE_CONTENT)).toEqual(['abc'])

        // 同一内容回传（如 setValue 回显）：不再重复发送整篇全文
        emitCode('abc')
        vi.advanceTimersByTime(1000)
        expect(sentPayloads(IPC.FILE.UPDATE_SELECT_FILE_CONTENT)).toEqual(['abc'])
        expect(ipcRenderer.send).toHaveBeenCalledTimes(1)
    })

    it('should merge Ctrl+S flush+save into a single full-content IPC (PF-3)', async () => {
        await mountEditor()

        emitCode('草稿内容')
        // 未等防抖窗口：Ctrl+S 立即保存
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))

        // 修复前：UPDATE 全文 + SAVE 全文 = 2 份；修复后只发 1 份 SAVE_TO_DISK
        expect(ipcRenderer.send).toHaveBeenCalledTimes(1)
        expect(ipcRenderer.send).toHaveBeenCalledWith(IPC.FILE.SAVE_TO_DISK, '草稿内容')
        expect(sentPayloads(IPC.FILE.UPDATE_SELECT_FILE_CONTENT)).toEqual([])

        // 防抖定时器已被保存动作取消防抖：不会再补发 UPDATE
        vi.advanceTimersByTime(1000)
        expect(ipcRenderer.send).toHaveBeenCalledTimes(1)
    })

    it('should keep a single SAVE_TO_DISK IPC when saving an already synced document', async () => {
        await mountEditor()

        emitCode('已同步内容')
        vi.advanceTimersByTime(500)
        expect(sentPayloads(IPC.FILE.UPDATE_SELECT_FILE_CONTENT)).toEqual(['已同步内容'])

        window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true }))
        expect(ipcRenderer.send).toHaveBeenCalledTimes(2)
        expect(ipcRenderer.send).toHaveBeenLastCalledWith(IPC.FILE.SAVE_TO_DISK, '已同步内容')
    })

    it('should answer the flush contract and only resend content when dirty (PF-3)', async () => {
        await mountEditor()
        const flushHandler = getIpcListener(IPC.EDITOR.FLUSH_CONTENT)

        // 内容未变化：主进程已有最新内容，只回执 DONE
        flushHandler()
        expect(sentPayloads(IPC.FILE.UPDATE_SELECT_FILE_CONTENT)).toEqual([])
        expect(ipcRenderer.send).toHaveBeenLastCalledWith(IPC.EDITOR.FLUSH_CONTENT_DONE)

        // 内容变化后 flush：先发 UPDATE 全文，再回执 DONE（IPC 有序）
        emitCode('变更内容')
        flushHandler()
        expect(ipcRenderer.send.mock.calls.map(([channel]) => channel)).toEqual([
            IPC.EDITOR.FLUSH_CONTENT_DONE,
            IPC.FILE.UPDATE_SELECT_FILE_CONTENT,
            IPC.EDITOR.FLUSH_CONTENT_DONE
        ])
        expect(sentPayloads(IPC.FILE.UPDATE_SELECT_FILE_CONTENT)).toEqual(['变更内容'])
    })

    it('should keep an empty file empty instead of injecting CRLF (FE-13)', async () => {
        const mounted = await mountEditor()
        const monaco = mounted.findComponent(MdMonacoEdit)
        const showFile = getIpcListener(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT)

        // 先打开一个正常文件
        showFile({}, '第一行内容')
        await nextTick()
        expect(monaco.props('code')).toBe('第一行内容')

        ipcRenderer.send.mockClear()

        // 再打开一个空文件：不得注入 '\r\n'，也不得回传任何内容（否则主进程脏标记变 true）
        showFile({}, '')
        await nextTick()
        vi.advanceTimersByTime(1000)

        expect(monaco.props('code')).toBe('')
        expect(sentPayloads(IPC.FILE.UPDATE_SELECT_FILE_CONTENT)).toEqual([])
        expect(
            ipcRenderer.send.mock.calls.some(
                ([channel, payload]) =>
                    channel === IPC.FILE.UPDATE_SELECT_FILE_CONTENT &&
                    (payload === '' || payload === '\r\n')
            )
        ).toBe(false)
    })

    it('should pass preview visibility to the preview component as active prop (PF-2)', async () => {
        const mounted = await mountEditor()
        const preview = mounted.findComponent(MdPreview)
        expect(preview.props('active')).toBe(true)

        // 进入纯编辑模式（仅编辑器可见）：预览不可见 → active=false（预览组件据此跳过渲染）
        getIpcListener(IPC.VIEW.EDIT_MODE)()
        await nextTick()
        expect(preview.props('active')).toBe(false)

        // 切回编辑+预览：active=true（预览组件据此补渲）
        getIpcListener(IPC.VIEW.EDIT_PREVIEW_MODE)()
        await nextTick()
        expect(preview.props('active')).toBe(true)

        // 纯预览模式：预览仍可见 → active=true
        getIpcListener(IPC.VIEW.PREVIEW_MODE)()
        await nextTick()
        expect(preview.props('active')).toBe(true)
    })

    // 数据安全回归（2026-11-15）：CLEAR_EDITOR_PREVIEW 曾把编辑器内容设为 '# ' 并同步主进程，
    // 在「欢迎页后台已恢复上次文件 → 点打开文件夹/最近文件夹 → 再打开新文件」链路上
    // 把旧文档内容污染成 '# '，切换/关闭时的自动保存会把旧文件写空（数据丢失）。
    it('should not sync placeholder content when clearing the editor (CLEAR_EDITOR_PREVIEW)', async () => {
        const mounted = await mountEditor()
        const monaco = mounted.findComponent(MdMonacoEdit)

        // 主进程后台恢复的文件内容已加载
        getIpcListener(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT)({}, '文档原文')
        await nextTick()
        expect(monaco.props('code')).toBe('文档原文')
        ipcRenderer.send.mockClear()

        // 点「打开文件夹 / 最近文件夹」：主进程先进入主界面再发 CLEAR_EDITOR_PREVIEW
        getIpcListener(IPC.FILE.CLEAR_EDITOR_PREVIEW)()
        await nextTick()
        vi.advanceTimersByTime(1000)

        // 编辑器显示被清空，但不得把占位内容（'# ' 或空串）同步给主进程
        expect(monaco.props('code')).toBe('')
        expect(sentPayloads(IPC.FILE.UPDATE_SELECT_FILE_CONTENT)).toEqual([])
    })

    it('should not flush stale content after the editor was cleared (数据安全)', async () => {
        await mountEditor()

        getIpcListener(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT)({}, '文档原文')
        await nextTick()
        getIpcListener(IPC.FILE.CLEAR_EDITOR_PREVIEW)()
        await nextTick()
        ipcRenderer.send.mockClear()

        // 关闭前 flush：编辑器已完成清空且无新输入，不得回传旧内容或占位内容
        getIpcListener(IPC.EDITOR.FLUSH_CONTENT)()
        expect(sentPayloads(IPC.FILE.UPDATE_SELECT_FILE_CONTENT)).toEqual([])
        expect(ipcRenderer.send).toHaveBeenLastCalledWith(IPC.EDITOR.FLUSH_CONTENT_DONE)
    })
})
