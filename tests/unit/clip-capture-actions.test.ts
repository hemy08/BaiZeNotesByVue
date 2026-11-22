// @vitest-environment node
/**
 * 1.5.2 E1 剪贴板剪藏渲染层动作单测（`src/renderer/src/common/clip-capture-actions.ts`）
 *
 * 覆盖口径：
 * 1. 剪贴板读取优先级：`navigator.clipboard.read()`（text/html + text/plain）→ `readText()` 回退；
 * 2. 读取失败/为空/接口不可用的原因判定（供可见提示映射）；
 * 3. 剪藏到新笔记：HTML → Markdown 复用 A8 转换、来源元数据、invoke 载荷（kind='clip'，无新增通道）；
 * 4. 失败可见提示：剪贴板为空/不可用/读取被拒/超限（HTML 1 MiB / 正文 512 KiB）/主进程 reason；
 * 5. 剪藏并插入当前笔记：调用 A8 `insertMarkdownAtSelection`，末尾附来源引用行（无来源时省略）；
 * 6. 活动编辑器注册表 set/get/clear 语义与能力开关关闭提示。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../src/shared/ipc-channels'
import { CLIP_CONTENT_MAX_BYTES } from '../../src/shared/constants/clip-capture'

/** E1 测试内统一的 HTML 上限替身（4096 字节，便于构造超限输入并覆盖 KiB 文案格式） */
const TEST_HTML_MAX_BYTES = 4096

const mocks = vi.hoisted(() => ({
    showError: vi.fn(),
    showWarning: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    htmlToMarkdown: vi.fn(),
    insertMarkdownAtSelection: vi.fn(),
    htmlMaxBytes: 4096
}))

vi.mock('@renderer/common/useConfigStore', () => ({
    getConfigStore: () => ({
        showError: mocks.showError,
        showWarning: mocks.showWarning
    })
}))
vi.mock('@renderer/common/logger', () => ({ logger: mocks.logger }))
// i18n 替身：保留「键 + 插值参数」形态，便于断言 reason → 文案键的映射关系
vi.mock('@renderer/common/i18n', () => ({
    t: (key: string, params?: Record<string, unknown>) =>
        params ? `${key}|${JSON.stringify(params)}` : key
}))
vi.mock('@renderer/common/action-feedback', () => ({
    describeActionError: (error: unknown, fallback: string) =>
        error instanceof Error && error.message ? error.message : fallback
}))
// A8 粘贴增强模块在单测中替身化：验证「复用」而非重复实现（真实转换逻辑由
// tests/unit/editor-paste-enhance.test.ts 覆盖）
vi.mock('@renderer/components/Markdown/editor-paste-enhance', () => ({
    HTML_TO_MARKDOWN_MAX_BYTES: mocks.htmlMaxBytes,
    htmlToMarkdown: mocks.htmlToMarkdown,
    insertMarkdownAtSelection: mocks.insertMarkdownAtSelection
}))

import {
    clearActiveEditor,
    getActiveEditor,
    setActiveEditor
} from '../../src/renderer/src/common/active-editor'
import {
    captureClipToEditor,
    captureClipToNote,
    readClipboardCapture,
    showClipCaptureFeatureDisabled
} from '../../src/renderer/src/common/clip-capture-actions'

/** 固定本地时间：2026-01-04 09:05:06 —— 与 E6/clip-capture 单测同一基准 */
const FIXED_DATE = new Date(2026, 0, 4, 9, 5, 6)

/** 剪贴板条目标替身 */
interface FakeClipboardItem {
    types: readonly string[]
    getType: (type: string) => Promise<{ text: () => Promise<string> }>
}

/** 构造剪贴板条目（data 按 MIME 类型提供文本） */
function createItem(types: string[], data: Record<string, string>): FakeClipboardItem {
    return {
        types,
        getType: async (type: string) => ({
            text: async () => data[type] ?? ''
        })
    }
}

/** 注入 navigator.clipboard（undefined 表示不注入） */
function stubClipboard(clipboard?: Record<string, unknown>): void {
    vi.stubGlobal('navigator', clipboard === undefined ? {} : { clipboard })
}

let invoke: ReturnType<typeof vi.fn>

beforeEach(() => {
    vi.clearAllMocks()
    invoke = vi.fn(async () => ({ ok: true, created: true, filePath: 'C:/w/inbox/x-clip.md' }))
    vi.stubGlobal('window', { electron: { ipcRenderer: { invoke } } })
    mocks.htmlToMarkdown.mockReturnValue('# 正文')
    mocks.insertMarkdownAtSelection.mockReturnValue(true)
    setActiveEditor(null)
})

afterEach(() => {
    vi.unstubAllGlobals()
})

/** 等待动作内部 Promise 链执行完（宏任务一次性冲干净微任务） */
async function flushAction(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0))
}

describe('readClipboardCapture：读取优先级与回退', () => {
    it('优先 read()，同时读取 text/html 与 text/plain（不再调用 readText）', async () => {
        const readText = vi.fn(async () => '不应被使用')
        stubClipboard({
            read: vi.fn(async () => [
                createItem(['text/html', 'text/plain'], {
                    'text/html': '<b>富文本</b>',
                    'text/plain': '纯文本'
                })
            ]),
            readText
        })
        await expect(readClipboardCapture()).resolves.toEqual({
            ok: true,
            html: '<b>富文本</b>',
            text: '纯文本'
        })
        expect(readText).not.toHaveBeenCalled()
    })

    it('read() 抛错（权限被拒）时回退 readText()', async () => {
        stubClipboard({
            read: vi.fn(async () => {
                throw new Error('denied')
            }),
            readText: vi.fn(async () => '回退纯文本')
        })
        await expect(readClipboardCapture()).resolves.toEqual({
            ok: true,
            html: '',
            text: '回退纯文本'
        })
        expect(mocks.logger.warn).toHaveBeenCalled()
    })

    it('read() 返回空条目时回退 readText()', async () => {
        stubClipboard({
            read: vi.fn(async () => []),
            readText: vi.fn(async () => '回退纯文本')
        })
        await expect(readClipboardCapture()).resolves.toEqual({
            ok: true,
            html: '',
            text: '回退纯文本'
        })
    })

    it('条目读取异常且无 readText() 时返回 read-failed', async () => {
        stubClipboard({
            read: vi.fn(async () => [
                {
                    types: ['text/html'],
                    getType: async () => {
                        throw new Error('blob read failed')
                    }
                }
            ])
        })
        await expect(readClipboardCapture()).resolves.toEqual({
            ok: false,
            reason: 'read-failed'
        })
    })

    it('read() 与 readText() 都失败时返回 read-failed（可操作提示）', async () => {
        stubClipboard({
            read: vi.fn(async () => {
                throw new Error('denied')
            }),
            readText: vi.fn(async () => {
                throw new Error('denied too')
            })
        })
        await expect(readClipboardCapture()).resolves.toEqual({
            ok: false,
            reason: 'read-failed'
        })
    })

    it('两者都成功但内容为空时返回 empty', async () => {
        stubClipboard({
            read: vi.fn(async () => []),
            readText: vi.fn(async () => '')
        })
        await expect(readClipboardCapture()).resolves.toEqual({ ok: false, reason: 'empty' })
    })

    it('navigator/clipboard 不可用或缺少读取方法时返回 unavailable', async () => {
        vi.stubGlobal('navigator', {})
        await expect(readClipboardCapture()).resolves.toEqual({ ok: false, reason: 'unavailable' })
        vi.stubGlobal('navigator', { clipboard: {} })
        await expect(readClipboardCapture()).resolves.toEqual({ ok: false, reason: 'unavailable' })
    })
})

describe('captureClipToNote：转换与 IPC 载荷', () => {
    it('HTML 经 A8 转换后以 kind=clip 调用既有通道（含标题/来源 URL）', async () => {
        const html =
            '<html><head><title>网页标题</title><base href="https://example.com/page"></head><body><p>正文</p></body></html>'
        stubClipboard({
            read: vi.fn(async () => [createItem(['text/html'], { 'text/html': html })])
        })
        captureClipToNote()
        await flushAction()

        expect(mocks.htmlToMarkdown).toHaveBeenCalledWith(html)
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.OPEN_OR_CREATE_ENTRY, {
            kind: 'clip',
            content: '# 正文',
            title: '网页标题',
            sourceUrl: 'https://example.com/page'
        })
        expect(mocks.showError).not.toHaveBeenCalled()
    })

    it('无 HTML 时回退纯文本，且不调用 HTML 转换', async () => {
        stubClipboard({
            read: vi.fn(async () => [
                createItem(['text/plain'], { 'text/plain': '纯文本第一行\r\n第二行' })
            ])
        })
        captureClipToNote()
        await flushAction()

        expect(mocks.htmlToMarkdown).not.toHaveBeenCalled()
        expect(invoke).toHaveBeenCalledWith(
            IPC.FILE.OPEN_OR_CREATE_ENTRY,
            expect.objectContaining({ kind: 'clip', content: '纯文本第一行\n第二行' })
        )
    })

    it('HTML 转换结果为空时回退纯文本', async () => {
        mocks.htmlToMarkdown.mockReturnValue('')
        stubClipboard({
            read: vi.fn(async () => [
                createItem(['text/html', 'text/plain'], {
                    'text/html': '<p></p>',
                    'text/plain': '回退正文'
                })
            ])
        })
        captureClipToNote()
        await flushAction()

        expect(invoke).toHaveBeenCalledWith(
            IPC.FILE.OPEN_OR_CREATE_ENTRY,
            expect.objectContaining({ kind: 'clip', content: '回退正文' })
        )
    })

    it('空剪贴板给出明确提示且不调用 IPC', async () => {
        stubClipboard({ read: vi.fn(async () => []), readText: vi.fn(async () => '   ') })
        captureClipToNote()
        await flushAction()

        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.clipCapture.failedTitle',
            'editorUi.clipCapture.emptyClipboard'
        )
        expect(invoke).not.toHaveBeenCalled()
    })

    it('HTML 超过 HTML_TO_MARKDOWN_MAX_BYTES 时提示上限（按 KiB 文案）', async () => {
        const html = 'a'.repeat(TEST_HTML_MAX_BYTES + 1)
        stubClipboard({
            read: vi.fn(async () => [createItem(['text/html'], { 'text/html': html })])
        })
        captureClipToNote()
        await flushAction()

        expect(mocks.htmlToMarkdown).not.toHaveBeenCalled()
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.clipCapture.failedTitle',
            'editorUi.clipCapture.contentTooLarge|{"max":"4 KiB"}'
        )
        expect(invoke).not.toHaveBeenCalled()
    })

    it('转换后 Markdown 超过 CLIP_CONTENT_MAX_BYTES 时提示 512 KiB 上限', async () => {
        mocks.htmlToMarkdown.mockReturnValue('x'.repeat(CLIP_CONTENT_MAX_BYTES + 1))
        stubClipboard({
            read: vi.fn(async () => [createItem(['text/html'], { 'text/html': '<p>x</p>' })])
        })
        captureClipToNote()
        await flushAction()

        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.clipCapture.failedTitle',
            'editorUi.clipCapture.contentTooLarge|{"max":"512 KiB"}'
        )
        expect(invoke).not.toHaveBeenCalled()
    })

    it('剪贴板读取被拒（read/readText 均失败）时提示检查权限', async () => {
        stubClipboard({
            read: vi.fn(async () => {
                throw new Error('denied')
            }),
            readText: vi.fn(async () => {
                throw new Error('denied')
            })
        })
        captureClipToNote()
        await flushAction()

        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.clipCapture.failedTitle',
            'editorUi.clipCapture.readFailed'
        )
    })

    it('主进程结构化 reason 映射为对应文案（未知 reason 回退通用文案）', async () => {
        stubClipboard({
            read: vi.fn(async () => [createItem(['text/plain'], { 'text/plain': '正文' })])
        })
        const cases: Array<{ result: unknown; expected: string }> = [
            {
                result: { ok: false, reason: 'no-workspace' },
                expected: 'editorUi.clipCapture.noWorkspace'
            },
            {
                result: { ok: false, reason: 'invalid-kind' },
                expected: 'editorUi.clipCapture.invalidKind'
            },
            {
                result: { ok: false, reason: 'write-failed' },
                expected: 'editorUi.clipCapture.writeFailed'
            },
            {
                result: { ok: false, reason: 'content-too-large' },
                expected: 'editorUi.clipCapture.contentTooLarge|{"max":"512 KiB"}'
            },
            {
                result: { ok: false, reason: 'weird-reason' },
                expected: 'editorUi.clipCapture.failedMessage'
            },
            { result: undefined, expected: 'editorUi.clipCapture.failedMessage' }
        ]
        for (const testCase of cases) {
            mocks.showError.mockClear()
            invoke.mockResolvedValueOnce(testCase.result)
            captureClipToNote()
            await flushAction()
            expect(mocks.showError).toHaveBeenCalledWith(
                'editorUi.clipCapture.failedTitle',
                testCase.expected
            )
        }
        expect(mocks.logger.error).toHaveBeenCalled()
    })

    it('invoke 拒绝时提示调用异常并携带归一化错误信息', async () => {
        stubClipboard({
            read: vi.fn(async () => [createItem(['text/plain'], { 'text/plain': '正文' })])
        })
        invoke.mockRejectedValueOnce(new Error('ipc broken'))
        captureClipToNote()
        await flushAction()

        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.clipCapture.failedTitle',
            'editorUi.clipCapture.invokeFailed|{"error":"ipc broken"}'
        )
        expect(mocks.logger.error).toHaveBeenCalled()
    })

    it('受限 ipcRenderer 不可用时给出可见错误提示', async () => {
        stubClipboard({
            read: vi.fn(async () => [createItem(['text/plain'], { 'text/plain': '正文' })])
        })
        vi.stubGlobal('window', {})
        captureClipToNote()
        await flushAction()

        expect(invoke).not.toHaveBeenCalled()
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.clipCapture.failedTitle',
            'editorUi.clipCapture.unavailable'
        )
    })
})

describe('captureClipToEditor：插入当前笔记', () => {
    it('调用 A8 insertMarkdownAtSelection 并在末尾附来源引用行', async () => {
        const editor = { id: 'editor' }
        setActiveEditor(editor as never)
        stubClipboard({
            read: vi.fn(async () => [
                createItem(['text/html'], {
                    'text/html': '<html><head><title>网页标题</title></head><body>x</body></html>'
                })
            ])
        })
        captureClipToEditor(FIXED_DATE)
        await flushAction()

        expect(mocks.insertMarkdownAtSelection).toHaveBeenCalledTimes(1)
        const [target, markdown] = mocks.insertMarkdownAtSelection.mock.calls[0]
        expect(target).toBe(editor)
        expect(markdown).toBe(
            '# 正文\n\n> editorUi.clipCapture.sourceLine|{"source":"网页标题","date":"2026-01-04"}'
        )
        expect(mocks.showError).not.toHaveBeenCalled()
    })

    it('无标题/来源信息时省略来源引用行', async () => {
        const editor = { id: 'editor' }
        setActiveEditor(editor as never)
        stubClipboard({
            read: vi.fn(async () => [
                createItem(['text/html'], { 'text/html': '<p>无标题片段</p>' })
            ])
        })
        captureClipToEditor(FIXED_DATE)
        await flushAction()

        const [, markdown] = mocks.insertMarkdownAtSelection.mock.calls[0]
        expect(markdown).toBe('# 正文')
    })

    it('没有活动编辑器时提示先打开笔记且不插入', async () => {
        setActiveEditor(null)
        stubClipboard({
            read: vi.fn(async () => [createItem(['text/plain'], { 'text/plain': '正文' })])
        })
        captureClipToEditor(FIXED_DATE)
        await flushAction()

        expect(mocks.insertMarkdownAtSelection).not.toHaveBeenCalled()
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.clipCapture.failedTitle',
            'editorUi.clipCapture.editorUnavailable'
        )
    })

    it('insertMarkdownAtSelection 返回 false 时提示插入失败', async () => {
        setActiveEditor({ id: 'editor' } as never)
        mocks.insertMarkdownAtSelection.mockReturnValue(false)
        stubClipboard({
            read: vi.fn(async () => [createItem(['text/plain'], { 'text/plain': '正文' })])
        })
        captureClipToEditor(FIXED_DATE)
        await flushAction()

        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.clipCapture.failedTitle',
            'editorUi.clipCapture.insertFailed'
        )
    })

    it('剪贴板为空时给出提示且不插入', async () => {
        setActiveEditor({ id: 'editor' } as never)
        stubClipboard({ read: vi.fn(async () => []), readText: vi.fn(async () => '') })
        captureClipToEditor(FIXED_DATE)
        await flushAction()

        expect(mocks.insertMarkdownAtSelection).not.toHaveBeenCalled()
        expect(mocks.showError).toHaveBeenCalledWith(
            'editorUi.clipCapture.failedTitle',
            'editorUi.clipCapture.emptyClipboard'
        )
    })
})

describe('active-editor 注册表', () => {
    it('set/get 返回最近注册的编辑器', () => {
        const editor = { id: 'first' }
        setActiveEditor(editor as never)
        expect(getActiveEditor()).toBe(editor)
    })

    it('clear 传入其他实例时不误清当前实例', () => {
        const editor = { id: 'first' }
        setActiveEditor(editor as never)
        clearActiveEditor({ id: 'other' } as never)
        expect(getActiveEditor()).toBe(editor)
    })

    it('clear 传入同一实例或省略参数时清空', () => {
        const editor = { id: 'first' }
        setActiveEditor(editor as never)
        clearActiveEditor(editor as never)
        expect(getActiveEditor()).toBeNull()
        setActiveEditor(editor as never)
        clearActiveEditor()
        expect(getActiveEditor()).toBeNull()
    })
})

describe('showClipCaptureFeatureDisabled：能力开关关闭提示', () => {
    it('提示「系统设置 → 功能」开启剪贴板剪藏（不读取剪贴板/不调用 IPC）', () => {
        showClipCaptureFeatureDisabled()
        expect(mocks.showWarning).toHaveBeenCalledWith(
            'editorUi.clipCapture.disabledTitle',
            'editorUi.clipCapture.disabledMessage'
        )
        expect(invoke).not.toHaveBeenCalled()
    })
})
