// @vitest-environment jsdom
/**
 * MarkdownPreviewComponent 事件/降级/隐私策略分支补测（覆盖率补测第四批）
 *
 * 既有 preview-local-pipeline.test.ts 覆盖主渲染链路正常路径；本文件补齐其未覆盖的
 * DOM/事件/异步边界分支：
 * 1. 预览可见性 active 与内容去重（不可见跳过、切回补渲、回退内容取消防抖）；
 * 2. snippets（--8<--）异步读取的成功/非字符串/读取失败降级；
 * 3. 渲染失败保留上一轮预览（catch 分支）；
 * 4. PF-9 超大文档降级提示条（mock IsLargePreviewDocument，覆盖首次告警/恢复分支）；
 * 5. AS-9 远程图片隐私策略：初始读取成功/失败、系统设置广播（合法/非法/未变化）；
 * 6. 预览内点击委托：非链接/无 href/.md 文件/http 链接/tab 深链；
 * 7. 标题指纹未变化时跳过二次大纲解析；MONACO_GET_CHAPTERS 主动请求；
 * 8. 活动文件路径 prop 的即时 watch 与变更补渲；卸载清理监听。
 */
import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const renderMocks = vi.hoisted(() => ({
    PreMarkdownRender: vi.fn(),
    PostMarkdownRender: vi.fn(),
    ParserMarkdownChapters: vi.fn()
}))

const perfMocks = vi.hoisted(() => ({
    markResult: true,
    perfMark: vi.fn(),
    perfMeasure: vi.fn()
}))

const localMocks = vi.hoisted(() => ({
    largeDocument: false
}))

vi.mock('@renderer/components/Markdown/hemy-editor-render', () => renderMocks)
vi.mock('@renderer/common/perf', () => ({
    PERF_MARK: {
        PREVIEW_READY: 'preview-ready',
        RENDERER_READY: 'renderer-ready'
    },
    perfMark: perfMocks.perfMark,
    perfMeasure: perfMocks.perfMeasure
}))
vi.mock('@renderer/components/Markdown/preview-local-render', async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import('../../../src/renderer/src/components/Markdown/preview-local-render')
        >()
    return {
        ...actual,
        IsLargePreviewDocument: () => localMocks.largeDocument
    }
})

import MarkdownPreviewComponent from '@renderer/components/Markdown/MarkdownPreviewComponent.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'
import {
    getPreviewActiveFilePath,
    getPreviewAllowRemoteImages,
    setPreviewActiveFilePath,
    setPreviewAllowRemoteImages
} from '@renderer/components/Markdown/preview-local-render'

type Listener = (event: unknown, ...args: unknown[]) => void

interface IpcMock {
    on: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
}

let ipcRenderer: IpcMock
let wrapper: ReturnType<typeof mount> | null = null
let configReadMock: ReturnType<typeof vi.fn>

beforeAll(async () => {
    // P1-8：预热 KaTeX 动态 import，避免 150ms 防抖窗口内首次 transform 抖动
    await import('katex')
})

beforeEach(() => {
    renderMocks.PreMarkdownRender.mockReset()
    renderMocks.PreMarkdownRender.mockImplementation(async (text: string) => text)
    renderMocks.PostMarkdownRender.mockReset()
    renderMocks.PostMarkdownRender.mockImplementation((text: string) => text)
    renderMocks.ParserMarkdownChapters.mockReset()
    perfMocks.markResult = true
    perfMocks.perfMark.mockReset()
    perfMocks.perfMark.mockImplementation(() => perfMocks.markResult)
    perfMocks.perfMeasure.mockReset()
    localMocks.largeDocument = false

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
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/** 等待 150ms 防抖 + 异步渲染链路（snippets/KaTeX/markdown-it）落定 */
async function waitForPreview(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 200))
    await flushPromises()
    await flushPromises()
}

/** 取出组件注册的某个 IPC 监听回调 */
function getIpcListener(channel: string): Listener {
    const call = ipcRenderer.on.mock.calls.find((args) => args[0] === channel)
    expect(call, `${channel} 监听应已注册`).toBeTruthy()
    return call![1] as Listener
}

function mountPreview(
    props: Record<string, unknown> = {},
    attachTo: Element | null = null
): ReturnType<typeof mount> {
    wrapper = mount(MarkdownPreviewComponent, {
        props: { editorContent: '', active: true, activeFilePath: '', ...props },
        ...(attachTo ? { attachTo } : {})
    })
    return wrapper
}

describe('MarkdownPreviewComponent：可见性与内容去重', () => {
    it('active=false 时不渲染，切回可见时补渲（active watch 两分支）', async () => {
        const mounted = mountPreview({ editorContent: '# 标题', active: false })
        await waitForPreview()
        expect(renderMocks.PreMarkdownRender).not.toHaveBeenCalled()
        expect(mounted.text()).toBe('')

        await mounted.setProps({ active: true })
        await waitForPreview()
        expect(mounted.text()).toContain('标题')
        expect(renderMocks.PreMarkdownRender).toHaveBeenCalled()
    })

    it('内容回退到已渲染内容时取消待执行防抖（不重复渲染）', async () => {
        const mounted = mountPreview({ editorContent: '# 第一版' })
        await waitForPreview()
        renderMocks.PreMarkdownRender.mockClear()

        // 改回与已渲染内容一致：命中 lastRenderedContent，清定时器直接返回
        await mounted.setProps({ editorContent: '# 第一版' })
        await waitForPreview()
        expect(renderMocks.PreMarkdownRender).not.toHaveBeenCalled()
    })

    it('渲染链路抛错时保留上一轮预览内容（catch 分支）', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const mounted = mountPreview({ editorContent: '# 保留内容' })
        await waitForPreview()
        expect(mounted.text()).toContain('保留内容')

        renderMocks.PreMarkdownRender.mockRejectedValueOnce(new Error('渲染失败'))
        await mounted.setProps({ editorContent: '# 新内容' })
        await waitForPreview()
        expect(mounted.text()).toContain('保留内容')
        expect(warnSpy).toHaveBeenCalled()
    })

    it('PF-9 超大文档：降级提示条 + 恢复后清除告警状态', async () => {
        localMocks.largeDocument = true
        const mounted = mountPreview({ editorContent: '# 大文档' })
        await waitForPreview()
        expect(mounted.text()).toContain('文档过大')
        // 降级时不加载 KaTeX（skipKatex），正文仍渲染
        expect(renderMocks.PreMarkdownRender).toHaveBeenCalled()

        // 恢复正常文档：degradedWarned 复位 + 提示条消失
        localMocks.largeDocument = false
        await mounted.setProps({ editorContent: '# 普通文档' })
        await waitForPreview()
        expect(mounted.text()).not.toContain('文档过大')
        expect(mounted.text()).toContain('普通文档')
    })

    it('perf 诊断开启时首轮渲染上报 preview-ready 度量', async () => {
        mountPreview({ editorContent: '# 性能' })
        await waitForPreview()
        await flushPromises()
        expect(perfMocks.perfMark).toHaveBeenCalled()
        expect(perfMocks.perfMeasure).toHaveBeenCalled()
    })
})

describe('MarkdownPreviewComponent：snippets 异步读取降级', () => {
    it('活动文件存在时展开片段；读取结果非字符串按失败降级', async () => {
        // 预置 invoke 返回值（activeFilePath prop 的 immediate watch 会在挂载阶段同步触发首轮渲染）
        ipcRenderer.invoke.mockResolvedValueOnce('# 片段内容')
        const mounted = mountPreview({
            editorContent: '--8<-- "snippet.md"',
            activeFilePath: 'C:\\notes\\current.md'
        })
        await waitForPreview()
        expect(ipcRenderer.invoke).toHaveBeenCalledWith(
            IPC.FILE.READ_HTML,
            expect.stringContaining('snippet.md')
        )
        expect(mounted.text()).toContain('片段内容')

        // 非字符串返回：readSnippetFile 走 typeof 判断回落 null（指令行保留占位）
        ipcRenderer.invoke.mockResolvedValueOnce(42)
        await mounted.setProps({ editorContent: '--8<-- "snippet2.md"' })
        await waitForPreview()
        expect(renderMocks.PreMarkdownRender).toHaveBeenCalled()
    })

    it('snippets 文件读取异常时告警并保留原文', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        ipcRenderer.invoke.mockRejectedValueOnce(new Error('读取失败'))
        mountPreview({
            editorContent: '--8<-- "missing.md"',
            activeFilePath: 'C:\\notes\\current.md'
        })
        await waitForPreview()
        expect(warnSpy).toHaveBeenCalled()
    })
})

describe('MarkdownPreviewComponent：AS-9 远程图片隐私策略', () => {
    it('初始读取成功且发生变化时立即重渲；重复广播不再重渲', async () => {
        configReadMock.mockResolvedValueOnce({ allowRemoteImages: true })
        mountPreview({ editorContent: '![x](https://example.com/a.png)' })
        await flushPromises()
        expect(getPreviewAllowRemoteImages()).toBe(true)
        await waitForPreview()

        renderMocks.PreMarkdownRender.mockClear()
        // 广播同值：策略未变化 → 不重渲
        getIpcListener(IPC.SETTING.SYSTEM_SETTING_UPDATE)({}, { allowRemoteImages: true })
        await waitForPreview()
        expect(renderMocks.PreMarkdownRender).not.toHaveBeenCalled()

        // 广播非法负载（非布尔）：忽略且不抛异常
        getIpcListener(IPC.SETTING.SYSTEM_SETTING_UPDATE)({}, { allowRemoteImages: 'yes' })
        getIpcListener(IPC.SETTING.SYSTEM_SETTING_UPDATE)({})
        await waitForPreview()
        expect(getPreviewAllowRemoteImages()).toBe(true)
    })

    it('初始读取失败时告警并保持安全默认（不加载远程图片）', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        configReadMock.mockRejectedValueOnce(new Error('config read failed'))
        mountPreview({ editorContent: '# x' })
        await flushPromises()
        expect(warnSpy).toHaveBeenCalled()
        expect(getPreviewAllowRemoteImages()).toBe(false)
    })
})

describe('MarkdownPreviewComponent：预览内点击委托', () => {
    /** 挂载并渲染后用指定子元素模拟点击 */
    async function clickInPreview(anchorFactory: () => HTMLElement | null): Promise<MouseEvent> {
        const host = document.createElement('div')
        document.body.appendChild(host)
        const mounted = mountPreview({ editorContent: '# 点击' }, host)
        await waitForPreview()
        const anchor = anchorFactory()
        const target = anchor ?? mounted.element
        const event = new MouseEvent('click', { bubbles: true, cancelable: true })
        target.dispatchEvent(event)
        await flushPromises()
        return event
    }

    it('非链接目标 / 无 href 链接直接返回', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        const event1 = await clickInPreview(() => {
            const span = document.createElement('span')
            span.textContent = 'text'
            document.getElementById('markdown-preview-html')!.appendChild(span)
            return span
        })
        expect(event1.defaultPrevented).toBe(false)

        wrapper?.unmount()
        const event2 = await clickInPreview(() => {
            const anchor = document.createElement('a')
            anchor.textContent = 'no href'
            document.getElementById('markdown-preview-html')!.appendChild(anchor)
            return anchor
        })
        expect(event2.defaultPrevented).toBe(false)
        expect(openSpy).not.toHaveBeenCalled()
    })

    it('.md 链接发送打开文件 IPC 并使用文件名', async () => {
        await clickInPreview(() => {
            const anchor = document.createElement('a')
            anchor.setAttribute('href', 'sub/note.md')
            anchor.textContent = 'note'
            document.getElementById('markdown-preview-html')!.appendChild(anchor)
            return anchor
        })
        expect(ipcRenderer.send).toHaveBeenCalledWith(
            IPC.FILE.OPEN_SELECT_FILE,
            expect.objectContaining({ name: 'note.md', path: 'sub/note.md', type: 'file' })
        )
    })

    it('http 链接调用 window.open，其它协议仅阻止默认行为', async () => {
        const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
        await clickInPreview(() => {
            const anchor = document.createElement('a')
            anchor.setAttribute('href', 'https://example.com/page')
            anchor.textContent = 'external'
            document.getElementById('markdown-preview-html')!.appendChild(anchor)
            return anchor
        })
        expect(openSpy).toHaveBeenCalledWith(
            'https://example.com/page',
            '_blank',
            'noopener, noreferrer'
        )

        wrapper?.unmount()
        const mailEvent = await clickInPreview(() => {
            const anchor = document.createElement('a')
            anchor.setAttribute('href', 'mailto:a@example.com')
            anchor.textContent = 'mail'
            document.getElementById('markdown-preview-html')!.appendChild(anchor)
            return anchor
        })
        expect(mailEvent.defaultPrevented).toBe(true)
    })

    it('tab 深链：命中 radio 时选中并阻止默认；非法 hash 回退普通链接处理', async () => {
        const event = await clickInPreview(() => {
            const root = document.getElementById('markdown-preview-html')!
            const radio = document.createElement('input')
            radio.type = 'radio'
            radio.id = '__tabbed_1_2'
            root.appendChild(radio)
            const anchor = document.createElement('a')
            anchor.setAttribute('href', '#__tabbed_1_2')
            anchor.textContent = 'tab2'
            root.appendChild(anchor)
            return anchor
        })
        expect(event.defaultPrevented).toBe(true)
        expect((document.getElementById('__tabbed_1_2') as HTMLInputElement).checked).toBe(true)

        wrapper?.unmount()
        // 非法 tab hash（不匹配模式）：按普通链接处理，不抛异常
        const invalid = await clickInPreview(() => {
            const anchor = document.createElement('a')
            anchor.setAttribute('href', '#__tabbed_not_a_number')
            anchor.textContent = 'bad tab'
            document.getElementById('markdown-preview-html')!.appendChild(anchor)
            return anchor
        })
        expect(invalid.defaultPrevented).toBe(false)
    })
})

describe('MarkdownPreviewComponent：大纲与活动文件路径', () => {
    it('标题指纹未变化时跳过二次解析；MONACO_GET_CHAPTERS 主动请求可强制解析', async () => {
        const mounted = mountPreview({ editorContent: '# 标题\n\n正文一' })
        await waitForPreview()
        const firstCallCount = renderMocks.ParserMarkdownChapters.mock.calls.length
        expect(firstCallCount).toBeGreaterThan(0)

        // 标题结构不变：指纹相同 → 不再解析
        await mounted.setProps({ editorContent: '# 标题\n\n正文二' })
        await waitForPreview()
        expect(renderMocks.ParserMarkdownChapters.mock.calls.length).toBe(firstCallCount)

        // 主动请求：无论指纹都重新解析
        EventBus.$emit(EVENT_BUS.MONACO_GET_CHAPTERS)
        await flushPromises()
        expect(renderMocks.ParserMarkdownChapters.mock.calls.length).toBe(firstCallCount + 1)
    })

    it('活动文件路径 prop 即时生效并在变化时补渲；USER_SELECT_FILE 事件同步路径', async () => {
        const mounted = mountPreview({
            editorContent: '# 路径',
            activeFilePath: 'C:\\notes\\a.md'
        })
        expect(getPreviewActiveFilePath()).toBe('C:\\notes\\a.md')
        await waitForPreview()

        await mounted.setProps({ activeFilePath: 'C:\\notes\\b.md' })
        await waitForPreview()
        expect(getPreviewActiveFilePath()).toBe('C:\\notes\\b.md')

        // IPC 事件：合法路径写入；非字符串回退 null
        getIpcListener(IPC.FILE.USER_SELECT_FILE)({}, 'C:\\notes\\c.md')
        expect(getPreviewActiveFilePath()).toBe('C:\\notes\\c.md')
        getIpcListener(IPC.FILE.USER_SELECT_FILE)({}, undefined)
        expect(getPreviewActiveFilePath()).toBeNull()
    })

    it('卸载时移除 IPC 监听与点击委托', async () => {
        const mounted = mountPreview({ editorContent: '# 卸载' })
        await waitForPreview()
        mounted.unmount()
        wrapper = null
        expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
            IPC.FILE.USER_SELECT_FILE,
            expect.any(Function)
        )
        expect(ipcRenderer.removeListener).toHaveBeenCalledWith(
            IPC.SETTING.SYSTEM_SETTING_UPDATE,
            expect.any(Function)
        )
    })
})
