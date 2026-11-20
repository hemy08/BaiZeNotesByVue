// @vitest-environment jsdom
/**
 * MarkdownPreviewComponent 卸载后异步链路治理回归（内存与生命周期治理 P3）
 *
 * 背景：预览渲染链路包含多处 await（AS-9 远程图片策略读取、snippets 文件 IPC、
 * KaTeX/hljs 动态 import、PlantUML/mermaid 图表、分块 DOMPurify）。组件卸载时此前只清了
 * 防抖计时器与 IPC 监听，**在途异步任务仍会继续执行**并在 await 之后写回组件状态、
 * 触发已卸载组件的 v-html 更新；尤其 `loadRemoteImagePolicy()` 在卸载后才返回时会
 * 重新启动一整轮渲染。修复后以卸载标志参与「过期轮次」判定，所有 await 校验点统一丢弃。
 *
 * 本文件同时锁定「大文档渲染缓存上限有界（LRU 2 / 单条 HTML ≤4Mi 字符）」，
 * 防止缓存改回无上限 Map 造成常驻内存随文档数增长。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const renderMocks = vi.hoisted(() => ({
    PreMarkdownRender: vi.fn(),
    PostMarkdownRender: vi.fn(),
    ParserMarkdownChapters: vi.fn()
}))

vi.mock('@renderer/components/Markdown/hemy-editor-render', () => renderMocks)

import MarkdownPreviewComponent from '@renderer/components/Markdown/MarkdownPreviewComponent.vue'
import {
    setPreviewActiveFilePath,
    setPreviewAllowRemoteImages
} from '@renderer/components/Markdown/preview-local-render'
import {
    ClearPreviewRenderCache,
    GetCachedPreviewRenderHtml,
    GetPreviewRenderCacheSize,
    PREVIEW_RENDER_CACHE_MAX_ENTRIES,
    SetCachedPreviewRenderHtml,
    type PreviewRenderPlan
} from '@renderer/components/Markdown/preview-large-doc'

interface IpcMock {
    on: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
}

let ipcRenderer: IpcMock
let configReadMock: ReturnType<typeof vi.fn>
let wrapper: ReturnType<typeof mount> | null = null

beforeEach(() => {
    renderMocks.PreMarkdownRender.mockReset()
    renderMocks.PreMarkdownRender.mockImplementation(async (text: string) => text)
    renderMocks.PostMarkdownRender.mockReset()
    renderMocks.PostMarkdownRender.mockImplementation((text: string) => text)
    renderMocks.ParserMarkdownChapters.mockReset()

    ipcRenderer = {
        on: vi.fn(),
        send: vi.fn(),
        invoke: vi.fn().mockResolvedValue(''),
        removeListener: vi.fn()
    }
    configReadMock = vi.fn().mockResolvedValue(null)
    vi.stubGlobal('electron', { ipcRenderer })
    vi.stubGlobal('api', {
        config: {
            read: configReadMock,
            write: vi.fn().mockResolvedValue(true)
        }
    })
    setPreviewActiveFilePath(null)
    setPreviewAllowRemoteImages(false)
    ClearPreviewRenderCache()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 等待异步渲染链路的微任务/宏任务推进（配置读取、动态 import 检查等） */
async function flushAsyncPipeline(): Promise<void> {
    for (let round = 0; round < 3; round += 1) {
        await flushPromises()
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 0)
        })
    }
    await flushPromises()
}

describe('MarkdownPreviewComponent：卸载后异步链路丢弃', () => {
    it('对照：组件存活时正常路径会执行渲染管线', async () => {
        wrapper = mount(MarkdownPreviewComponent, {
            props: { editorContent: '# 标题', active: true }
        })
        await flushPromises()
        // 等过 150ms 预览防抖
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 200)
        })
        await flushAsyncPipeline()

        expect(renderMocks.PreMarkdownRender).toHaveBeenCalled()
    })

    it('卸载后才返回的远程图片策略读取不得再启动渲染管线', async () => {
        // 用对象属性保存 resolver：闭包内赋值不会被 TS 的控制流分析提前收窄
        const deferred: { resolve: ((value: unknown) => void) | null } = { resolve: null }
        configReadMock.mockImplementation(
            () =>
                new Promise((resolve) => {
                    deferred.resolve = resolve
                })
        )

        wrapper = mount(MarkdownPreviewComponent, {
            props: { editorContent: '# 标题', active: true }
        })
        await flushPromises()
        expect(configReadMock).toHaveBeenCalled()

        // 卸载后才返回「允许远程图片」：策略发生变化本会触发一轮强制重渲
        wrapper.unmount()
        wrapper = null
        deferred.resolve?.({ allowRemoteImages: true })
        await flushAsyncPipeline()

        expect(renderMocks.PreMarkdownRender).not.toHaveBeenCalled()
        // 卸载后策略也不再被写回全局（refreshRemoteImagePolicy 提前返回）
        expect(renderMocks.PostMarkdownRender).not.toHaveBeenCalled()
    })
})

describe('大文档渲染缓存：上限与 LRU 淘汰', () => {
    it(`缓存条目数不超过 ${PREVIEW_RENDER_CACHE_MAX_ENTRIES}，且淘汰最久未使用条目`, () => {
        const plan = { tier: 'degraded', degraded: true } as unknown as PreviewRenderPlan
        const sourceA = `A${'a'.repeat(1024)}`
        const sourceB = `B${'b'.repeat(1024)}`
        const sourceC = `C${'c'.repeat(1024)}`

        SetCachedPreviewRenderHtml(plan, sourceA, '/notes/a.md', false, '<p>A</p>')
        SetCachedPreviewRenderHtml(plan, sourceB, '/notes/b.md', false, '<p>B</p>')
        expect(GetPreviewRenderCacheSize()).toBe(2)

        // 第三条：触发淘汰最旧的 A
        SetCachedPreviewRenderHtml(plan, sourceC, '/notes/c.md', false, '<p>C</p>')
        expect(GetPreviewRenderCacheSize()).toBe(PREVIEW_RENDER_CACHE_MAX_ENTRIES)
        expect(GetCachedPreviewRenderHtml(plan, sourceA, '/notes/a.md', false)).toBeNull()
        expect(GetCachedPreviewRenderHtml(plan, sourceC, '/notes/c.md', false)).toBe('<p>C</p>')

        // LRU 语义：读取 B 后 B 变最近使用（当前顺序 [C, B]），再写入 D 时淘汰 C 而非 B
        expect(GetCachedPreviewRenderHtml(plan, sourceB, '/notes/b.md', false)).toBe('<p>B</p>')
        const sourceD = `D${'d'.repeat(1024)}`
        SetCachedPreviewRenderHtml(plan, sourceD, '/notes/d.md', false, '<p>D</p>')
        expect(GetPreviewRenderCacheSize()).toBe(PREVIEW_RENDER_CACHE_MAX_ENTRIES)
        expect(GetCachedPreviewRenderHtml(plan, sourceC, '/notes/c.md', false)).toBeNull()
        expect(GetCachedPreviewRenderHtml(plan, sourceB, '/notes/b.md', false)).toBe('<p>B</p>')
        expect(GetCachedPreviewRenderHtml(plan, sourceD, '/notes/d.md', false)).toBe('<p>D</p>')
    })

    it('单条 HTML 超过 4Mi 字符不入缓存（防止大文档常驻内存膨胀）', () => {
        const plan = { tier: 'progressive', degraded: true } as unknown as PreviewRenderPlan
        const source = `E${'e'.repeat(1024)}`
        SetCachedPreviewRenderHtml(
            plan,
            source,
            '/notes/e.md',
            false,
            'x'.repeat(4 * 1024 * 1024 + 1)
        )
        expect(GetPreviewRenderCacheSize()).toBe(0)
    })
})
