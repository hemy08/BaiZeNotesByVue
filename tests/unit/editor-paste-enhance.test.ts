// @vitest-environment jsdom
/**
 * A8 粘贴 / 复制增强单测（默认开启能力）：
 * - sanitizeClipboardHtml：危险节点移除、标签白名单脱壳、属性/URL 协议清洗、大小上限；
 * - htmlToMarkdown：常见富文本结构转换、脚本剥离、空/超限回退；
 * - selectionToHtml / escapeHtmlText：复制为 HTML 的转义与段落换行结构；
 * - writeClipboardPayload：Clipboard API 优先 + execCommand 回退；
 * - insertMarkdownAtSelection：有选区替换 / 无选区插入、EOL 归一化；
 * - handleNativePasteEvent / attachPasteEnhance：HTML 粘贴拦截、图片与纯文本放行、键盘会话守卫；
 * - pasteFromSystemClipboard：图片 → 既有 INSERT_IMAGE、HTML → Markdown、纯文本回退。
 *
 * 依赖边界：hemy-editor-common 的插入能力以调用契约 mock（本文件验证转换与分发逻辑，
 * 真实插入由 E2E 覆盖）；turndown 使用真实包，确保转换规则与运行时一致。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const commonMocks = vi.hoisted(() => ({
    OnInsertAfterCursor: vi.fn(),
    replaceSelection: vi.fn(),
    EventHandleMaps: {
        insertimage: vi.fn<(dataUrl: string) => void>(),
        paste: vi.fn<(editor: unknown, text: string) => void>()
    }
}))

vi.mock('../../src/renderer/src/components/Markdown/hemy-editor-common', () => ({
    OnInsertAfterCursor: commonMocks.OnInsertAfterCursor,
    replaceSelection: commonMocks.replaceSelection,
    EventHandleMaps: commonMocks.EventHandleMaps
}))

// 日志出口 mock：避免「预期内的回退 warn」在测试输出里打印堆栈
vi.mock('../../src/renderer/src/common/logger', () => ({
    logger: { debug: vi.fn(), info: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import type * as monaco from 'monaco-editor'
import {
    HTML_TO_MARKDOWN_MAX_BYTES,
    attachPasteEnhance,
    beginKeyboardPasteSession,
    endKeyboardPasteSession,
    escapeHtmlText,
    handleNativePasteEvent,
    htmlToMarkdown,
    insertMarkdownAtSelection,
    isKeyboardPasteSessionActive,
    pasteFromSystemClipboard,
    sanitizeClipboardHtml,
    selectionToHtml,
    writeClipboardPayload
} from '../../src/renderer/src/components/Markdown/editor-paste-enhance'

/* ==================== 测试替身 ==================== */

interface FakeEditorOptions {
    eol?: string
    selectionEmpty?: boolean
    domNode?: HTMLElement | null
}

/** 构造最小编辑器替身：只提供 paste 增强链路实际读取的方法 */
function makeEditor(options: FakeEditorOptions = {}): monaco.editor.IStandaloneCodeEditor {
    const value = '原内容'
    const model = {
        getEOL: () => options.eol ?? '\n',
        getValue: () => value,
        getValueInRange: () => value
    }
    const selection = { isEmpty: () => options.selectionEmpty ?? true }
    return {
        getModel: () => model,
        getSelection: () => selection,
        getDomNode: () => options.domNode ?? null
    } as unknown as monaco.editor.IStandaloneCodeEditor
}

interface FakePasteEvent {
    event: ClipboardEvent
    preventDefault: ReturnType<typeof vi.fn>
    stopPropagation: ReturnType<typeof vi.fn>
}

/** 构造原生 paste 事件替身（jsdom 未实现 ClipboardEvent 构造器） */
function makePasteEvent(html: string, options: { image?: boolean } = {}): FakePasteEvent {
    const preventDefault = vi.fn()
    const stopPropagation = vi.fn()
    const items = options.image ? [{ kind: 'file', type: 'image/png' }] : []
    const event = {
        clipboardData: {
            getData: (type: string) => (type === 'text/html' ? html : ''),
            items
        },
        preventDefault,
        stopPropagation
    } as unknown as ClipboardEvent
    return { event, preventDefault, stopPropagation }
}

/** 临时替换 navigator.clipboard（测试结束删除自有属性） */
function stubClipboard(clipboard: unknown): void {
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
}

/** 临时替换 document.execCommand，并返回调用记录与恢复函数 */
function stubExecCommand(impl: () => boolean): {
    execCommand: ReturnType<typeof vi.fn>
    restore: () => void
} {
    const execCommand = vi.fn(impl)
    Object.defineProperty(document, 'execCommand', { configurable: true, value: execCommand })
    return {
        execCommand,
        restore: () => {
            Reflect.deleteProperty(document, 'execCommand')
        }
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    endKeyboardPasteSession()
})

afterEach(() => {
    Reflect.deleteProperty(navigator, 'clipboard')
    vi.unstubAllGlobals()
    endKeyboardPasteSession()
})

/* ==================== 清洗 ==================== */

describe('sanitizeClipboardHtml', () => {
    it('移除 script/style/iframe 等危险节点（含其内容）', () => {
        const html =
            '<p>保留</p><script>alert(1)</script><style>p{color:red}</style>' +
            '<iframe src="https://x"></iframe><!-- 注释 -->'
        const result = sanitizeClipboardHtml(html)
        expect(result).toContain('保留')
        expect(result).not.toContain('alert')
        expect(result).not.toContain('color:red')
        expect(result).not.toContain('iframe')
    })

    it('保留白名单标签，未知标签脱壳保留文本', () => {
        const result = sanitizeClipboardHtml(
            '<custom><b>加粗</b><span>行内</span></custom><p>段落</p>'
        )
        expect(result).toContain('<b>加粗</b>')
        expect(result).toContain('行内')
        expect(result).not.toContain('<custom>')
        expect(result).toContain('<p>段落</p>')
    })

    it('移除事件属性/style/非法属性，保留安全属性', () => {
        const result = sanitizeClipboardHtml(
            '<p onclick="alert(1)" style="color:red">文本</p>' +
                '<a href="https://example.com" onmouseover="x()" data-x="1">链接</a>' +
                '<img src="https://example.com/a.png" onerror="alert(1)" alt="图">'
        )
        expect(result).not.toContain('onclick')
        expect(result).not.toContain('onmouseover')
        expect(result).not.toContain('onerror')
        expect(result).not.toContain('style=')
        expect(result).not.toContain('data-x')
        expect(result).toContain('href="https://example.com"')
        expect(result).toContain('alt="图"')
    })

    it('清洗不安全 URL 协议（javascript:/非图片 data:）', () => {
        const result = sanitizeClipboardHtml(
            '<a href="javascript:alert(1)">坏链接</a>' +
                '<a href="mailto:a@b.c">邮件</a>' +
                '<a href="/relative/path">相对</a>' +
                '<img src="data:text/html;base64,xxx" alt="坏图">' +
                '<img src="data:image/png;base64,xxx" alt="好图">'
        )
        expect(result).not.toContain('javascript:')
        expect(result).not.toContain('data:text/html')
        expect(result).toContain('mailto:a@b.c')
        expect(result).toContain('/relative/path')
        expect(result).toContain('data:image/png;base64,xxx')
    })

    it('空输入/超限输入返回空串', () => {
        expect(sanitizeClipboardHtml('')).toBe('')
        expect(sanitizeClipboardHtml('   ')).toBe('')
        const oversized = `<p>${'a'.repeat(HTML_TO_MARKDOWN_MAX_BYTES)}</p>`
        expect(sanitizeClipboardHtml(oversized)).toBe('')
    })

    it('无 DOMParser 环境返回空串（安全降级，不抛错）', () => {
        vi.stubGlobal('DOMParser', undefined)
        expect(sanitizeClipboardHtml('<p>x</p>')).toBe('')
    })
})

/* ==================== HTML → Markdown ==================== */

describe('htmlToMarkdown', () => {
    it('转换标题/加粗/列表/链接/引用/代码块等常见结构（ATX 标题风格）', () => {
        const markdown = htmlToMarkdown(
            '<h1>标题</h1><p>hello <b>world</b></p>' +
                '<ul><li>一</li><li>二</li></ul>' +
                '<blockquote>引用</blockquote>' +
                '<pre><code class="language-js">const a = 1</code></pre>' +
                '<p><a href="https://example.com">链接</a></p>'
        )
        expect(markdown).toContain('# 标题')
        expect(markdown).toContain('**world**')
        expect(markdown).toContain('-   一')
        expect(markdown).toContain('> 引用')
        expect(markdown).toContain('```js')
        expect(markdown).toContain('[链接](https://example.com)')
    })

    it('脚本/样式内容不进入 Markdown', () => {
        const markdown = htmlToMarkdown('<p>正文</p><script>alert(1)</script><style>.x{}</style>')
        expect(markdown).toBe('正文')
    })

    it('空输入/超限输入返回空串（调用方回退默认粘贴）', () => {
        expect(htmlToMarkdown('')).toBe('')
        expect(htmlToMarkdown(`<p>${'a'.repeat(HTML_TO_MARKDOWN_MAX_BYTES)}</p>`)).toBe('')
    })

    it('纯文本 HTML 片段按文本处理', () => {
        expect(htmlToMarkdown('纯文本内容')).toBe('纯文本内容')
    })

    it('无 TextEncoder 环境按码点估算 UTF-8 字节数（中文超限仍可回退）', () => {
        vi.stubGlobal('TextEncoder', undefined)
        // 中文标题在 1 MiB 以内：正常转换
        expect(htmlToMarkdown('<h2>中文标题</h2>')).toBe('## 中文标题')
        // 超过上限（按 UTF-8 字节估算）：返回空串
        const oversizedCjk = `<p>${'中'.repeat(Math.floor(HTML_TO_MARKDOWN_MAX_BYTES / 3) + 1)}</p>`
        expect(htmlToMarkdown(oversizedCjk)).toBe('')
    })
})

/* ==================== 复制为 HTML ==================== */

describe('selectionToHtml / escapeHtmlText', () => {
    it('转义 HTML 特殊字符，禁止源码被当作标签解析', () => {
        expect(escapeHtmlText('<script>alert("x") & \'y\'</script>')).toBe(
            '&lt;script&gt;alert(&quot;x&quot;) &amp; &#39;y&#39;&lt;/script&gt;'
        )
        expect(selectionToHtml('<script>alert(1)</script>')).not.toContain('<script>')
        expect(selectionToHtml('<script>alert(1)</script>')).toContain('&lt;script&gt;')
    })

    it('保留基本段落结构：空行分段、段内换行用 <br>', () => {
        expect(selectionToHtml('第一行\n第二行\n\n第二段')).toBe(
            '<p>第一行<br>第二行</p>\n<p>第二段</p>'
        )
    })

    it('空文本返回空串', () => {
        expect(selectionToHtml('')).toBe('')
    })
})

/* ==================== 剪贴板写入 ==================== */

describe('writeClipboardPayload', () => {
    it('优先使用 Clipboard API（同时写 text/plain 与 text/html）', async () => {
        const written: unknown[][] = []
        class FakeClipboardItem {
            constructor(public readonly items: Record<string, Blob>) {}
        }
        vi.stubGlobal('ClipboardItem', FakeClipboardItem)
        stubClipboard({
            write: async (items: unknown[]) => {
                written.push(items)
            }
        })

        const ok = await writeClipboardPayload({ text: '纯文本', html: '<p>富文本</p>' })
        expect(ok).toBe(true)
        expect(written).toHaveLength(1)
        const item = written[0][0] as FakeClipboardItem
        expect(Object.keys(item.items).sort()).toEqual(['text/html', 'text/plain'])
        expect(await item.items['text/plain'].text()).toBe('纯文本')
        expect(await item.items['text/html'].text()).toBe('<p>富文本</p>')
    })

    it('Clipboard API 失败时回退 execCommand（copy 事件写入两种格式）', async () => {
        vi.stubGlobal('ClipboardItem', undefined)
        let copied: Map<string, string> | null = null
        const { restore, execCommand } = stubExecCommand(() => {
            copied = new Map()
            const event = new Event('copy', { cancelable: true })
            Object.defineProperty(event, 'clipboardData', {
                configurable: true,
                value: { setData: (type: string, value: string) => copied!.set(type, value) }
            })
            document.dispatchEvent(event)
            return true
        })

        const ok = await writeClipboardPayload({ text: 'md', html: '<p>x</p>' })
        restore()

        expect(ok).toBe(true)
        expect(execCommand).toHaveBeenCalledWith('copy')
        expect(copied!.get('text/plain')).toBe('md')
        expect(copied!.get('text/html')).toBe('<p>x</p>')
    })

    it('execCommand 返回 false 时返回 false（不抛错）', async () => {
        vi.stubGlobal('ClipboardItem', undefined)
        const { restore } = stubExecCommand(() => false)
        const ok = await writeClipboardPayload({ text: 'md' })
        restore()
        expect(ok).toBe(false)
    })

    it('空载荷直接返回 false', async () => {
        expect(await writeClipboardPayload({})).toBe(false)
    })

    it('Clipboard API 抛错时回退 execCommand（覆盖 catch 分支）', async () => {
        class FakeClipboardItem {
            constructor(public readonly items: Record<string, Blob>) {}
        }
        vi.stubGlobal('ClipboardItem', FakeClipboardItem)
        stubClipboard({
            write: async () => {
                throw new Error('NotAllowedError')
            }
        })
        const { restore, execCommand } = stubExecCommand(() => false)
        expect(await writeClipboardPayload({ text: 'md' })).toBe(false)
        restore()
        expect(execCommand).toHaveBeenCalledTimes(1)
    })
})

/* ==================== 插入 ==================== */

describe('insertMarkdownAtSelection', () => {
    it('无 model 返回 false，不写编辑器', () => {
        const editor = { getModel: () => null } as unknown as monaco.editor.IStandaloneCodeEditor
        expect(insertMarkdownAtSelection(editor, '# x')).toBe(false)
        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
    })

    it('无选区：按模型 EOL 归一化后插入光标处', () => {
        const editor = makeEditor({ eol: '\r\n' })
        expect(insertMarkdownAtSelection(editor, '# 标题\n\n正文')).toBe(true)
        expect(commonMocks.OnInsertAfterCursor).toHaveBeenCalledWith(editor, '# 标题\r\n\r\n正文')
    })

    it('有选区：替换选区', () => {
        const editor = makeEditor({ selectionEmpty: false })
        expect(insertMarkdownAtSelection(editor, '替换内容')).toBe(true)
        expect(commonMocks.replaceSelection).toHaveBeenCalledTimes(1)
        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
    })

    it('空 Markdown 返回 false', () => {
        expect(insertMarkdownAtSelection(makeEditor(), '')).toBe(false)
    })
})

/* ==================== 原生 paste 事件 ==================== */

describe('handleNativePasteEvent / attachPasteEnhance', () => {
    it('剪贴板 HTML 转换成功后拦截默认粘贴', () => {
        const editor = makeEditor()
        const { event, preventDefault, stopPropagation } = makePasteEvent('<b>加粗</b>')
        expect(handleNativePasteEvent(editor, event)).toBe(true)
        expect(commonMocks.OnInsertAfterCursor).toHaveBeenCalledWith(editor, '**加粗**')
        expect(preventDefault).toHaveBeenCalledTimes(1)
        expect(stopPropagation).toHaveBeenCalledTimes(1)
    })

    it('图片剪贴板 / 无 HTML / 无 clipboardData 时放行默认粘贴', () => {
        const editor = makeEditor()
        expect(
            handleNativePasteEvent(editor, makePasteEvent('<b>x</b>', { image: true }).event)
        ).toBe(false)
        expect(handleNativePasteEvent(editor, makePasteEvent('').event)).toBe(false)
        expect(
            handleNativePasteEvent(editor, { clipboardData: null } as unknown as ClipboardEvent)
        ).toBe(false)
        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
    })

    it('键盘粘贴会话期间忽略原生 paste（避免同一次粘贴插入两遍）', () => {
        const editor = makeEditor()
        beginKeyboardPasteSession()
        expect(isKeyboardPasteSessionActive()).toBe(true)
        expect(handleNativePasteEvent(editor, makePasteEvent('<b>x</b>').event)).toBe(false)
        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
        endKeyboardPasteSession()
        expect(isKeyboardPasteSessionActive()).toBe(false)
    })

    it('attachPasteEnhance 挂载/释放 DOM 监听', () => {
        const root = document.createElement('div')
        const editor = makeEditor({ domNode: root })
        const disposable = attachPasteEnhance(editor)
        expect(disposable).not.toBeNull()

        const event = new Event('paste', { cancelable: true })
        Object.defineProperty(event, 'clipboardData', {
            configurable: true,
            value: {
                getData: (type: string) => (type === 'text/html' ? '<i>斜体</i>' : ''),
                items: []
            }
        })
        root.dispatchEvent(event)
        expect(commonMocks.OnInsertAfterCursor).toHaveBeenCalledWith(editor, '*斜体*')

        commonMocks.OnInsertAfterCursor.mockClear()
        disposable!.dispose()
        const secondEvent = new Event('paste', { cancelable: true })
        Object.defineProperty(secondEvent, 'clipboardData', {
            configurable: true,
            value: {
                getData: (type: string) => (type === 'text/html' ? '<i>斜体</i>' : ''),
                items: []
            }
        })
        root.dispatchEvent(secondEvent)
        expect(commonMocks.OnInsertAfterCursor).not.toHaveBeenCalled()
    })

    it('编辑器无 DOM 根节点时 attach 返回 null', () => {
        expect(attachPasteEnhance({} as unknown as monaco.editor.IStandaloneCodeEditor)).toBeNull()
        expect(
            attachPasteEnhance({
                getDomNode: () => null
            } as unknown as monaco.editor.IStandaloneCodeEditor)
        ).toBeNull()
    })
})

/* ==================== 键盘 Ctrl+V 粘贴通道 ==================== */

describe('pasteFromSystemClipboard', () => {
    it('HTML → Markdown（图片优先通道不触发）', async () => {
        stubClipboard({
            read: async () => [
                {
                    types: ['text/html'],
                    getType: async () => new Blob(['<h1>标题</h1>'], { type: 'text/html' })
                }
            ],
            readText: vi.fn(async () => '不应读取')
        })
        const editor = makeEditor()
        await expect(pasteFromSystemClipboard(editor)).resolves.toBe('html')
        expect(commonMocks.OnInsertAfterCursor).toHaveBeenCalledWith(editor, '# 标题')
        expect(commonMocks.EventHandleMaps.paste).not.toHaveBeenCalled()
        expect(isKeyboardPasteSessionActive()).toBe(false)
    })

    it('纯文本回退既有 paste 处理', async () => {
        stubClipboard({
            read: async () => [],
            readText: async () => '纯文本剪贴板'
        })
        const editor = makeEditor()
        await expect(pasteFromSystemClipboard(editor)).resolves.toBe('text')
        expect(commonMocks.EventHandleMaps.paste).toHaveBeenCalledWith(editor, '纯文本剪贴板')
    })

    it('图片走既有 INSERT_IMAGE 通道（data URL）', async () => {
        stubClipboard({
            read: async () => [
                {
                    types: ['image/png'],
                    getType: async () => new Blob(['png-bytes'], { type: 'image/png' })
                }
            ],
            readText: async () => '不应读取'
        })
        await expect(pasteFromSystemClipboard(makeEditor())).resolves.toBe('image')
        expect(commonMocks.EventHandleMaps.insertimage).toHaveBeenCalledTimes(1)
        expect(commonMocks.EventHandleMaps.insertimage.mock.calls[0][0]).toMatch(
            /^data:image\/png;base64,/
        )
    })

    it('读取条目被拒时回退 readText', async () => {
        stubClipboard({
            read: async () => {
                throw new Error('NotAllowedError')
            },
            readText: async () => '回退文本'
        })
        const editor = makeEditor()
        await expect(pasteFromSystemClipboard(editor)).resolves.toBe('text')
        expect(commonMocks.EventHandleMaps.paste).toHaveBeenCalledWith(editor, '回退文本')
    })

    it('剪贴板 API 不可用时返回 none（不抛错）', async () => {
        Reflect.deleteProperty(navigator, 'clipboard')
        await expect(pasteFromSystemClipboard(makeEditor())).resolves.toBe('none')
    })

    it('clipboard 无 read 方法时直接走 readText', async () => {
        stubClipboard({ readText: async () => '仅文本' })
        const editor = makeEditor()
        await expect(pasteFromSystemClipboard(editor)).resolves.toBe('text')
        expect(commonMocks.EventHandleMaps.paste).toHaveBeenCalledWith(editor, '仅文本')
    })

    it('HTML 条目读取抛错时回退纯文本；图片条目读取抛错时继续尝试文本', async () => {
        stubClipboard({
            read: async () => [
                {
                    types: ['image/png'],
                    getType: async () => {
                        throw new Error('image read failed')
                    }
                },
                {
                    types: ['text/html'],
                    getType: async () => {
                        throw new Error('html read failed')
                    }
                }
            ],
            readText: async () => '回退文本'
        })
        const editor = makeEditor()
        await expect(pasteFromSystemClipboard(editor)).resolves.toBe('text')
        expect(commonMocks.EventHandleMaps.insertimage).not.toHaveBeenCalled()
        expect(commonMocks.EventHandleMaps.paste).toHaveBeenCalledWith(editor, '回退文本')
    })
})
