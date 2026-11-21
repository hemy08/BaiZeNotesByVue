// @vitest-environment jsdom
/**
 * A3/A4 对外入口（openFileHistory / openMarkdownLint）集成测试（jsdom）
 *
 * 覆盖：
 * - flag 关闭时入口直接返回 false（不挂载宿主、不渲染）；
 * - flag 开启时动态挂载独立 Vue 应用 + BaseDialog 正常渲染（body 中出现对话框 title）；
 * - 重复调用复用同一宿主（不重复挂载）；
 * - 使用中关闭 flag 自动卸载宿主（不渲染）；
 * - dispose 幂等、可再次打开。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import { useFeatureFlags } from '../../src/renderer/src/composables/useFeatureFlags'
import {
    disposeDocumentHistoryFeature,
    setActiveMarkdownContentProvider
} from '../../src/renderer/src/composables/useDocumentHistory'
import {
    closeFileHistory,
    disposeFileHistoryHost,
    openFileHistory
} from '../../src/renderer/src/components/Markdown/history'
import {
    closeMarkdownLint,
    disposeMarkdownLintHost,
    openMarkdownLint
} from '../../src/renderer/src/components/Markdown/lint'

const HISTORY_HOST_ID = 'baize-file-history-host'
const LINT_HOST_ID = 'baize-markdown-lint-host'

beforeEach(() => {
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: vi.fn(),
            removeListener: vi.fn(),
            invoke: vi.fn().mockResolvedValue(null)
        }
    })
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue(null), write: vi.fn() }
    })
    const { flags } = useFeatureFlags()
    for (const key of Object.keys(flags) as Array<keyof typeof flags>) {
        flags[key] = false
    }
    disposeFileHistoryHost()
    disposeMarkdownLintHost()
    disposeDocumentHistoryFeature()
    setActiveMarkdownContentProvider(null)
    localStorage.clear()
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

afterEach(async () => {
    disposeFileHistoryHost()
    disposeMarkdownLintHost()
    disposeDocumentHistoryFeature()
    await nextTick()
    vi.unstubAllGlobals()
    localStorage.clear()
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

describe('openFileHistory（A3 入口）', () => {
    it('flag 关闭时返回 false 且不挂载宿主', async () => {
        expect(await openFileHistory()).toBe(false)
        expect(document.getElementById(HISTORY_HOST_ID)).toBeNull()
    })

    it('flag 开启时挂载宿主并渲染历史对话框；重复调用不重复挂载', async () => {
        useFeatureFlags().flags.documentHistory = true
        setActiveMarkdownContentProvider(() => '# 当前内容')
        expect(await openFileHistory()).toBe(true)
        await flushPromises()
        await nextTick()
        expect(document.getElementById(HISTORY_HOST_ID)).not.toBeNull()
        expect(document.body.textContent).toContain('文档历史')

        expect(await openFileHistory()).toBe(true)
        await flushPromises()
        expect(document.querySelectorAll(`#${HISTORY_HOST_ID}`)).toHaveLength(1)
    })

    it('使用中关闭 flag 自动卸载宿主（不渲染）', async () => {
        useFeatureFlags().flags.documentHistory = true
        expect(await openFileHistory()).toBe(true)
        await flushPromises()
        expect(document.getElementById(HISTORY_HOST_ID)).not.toBeNull()
        useFeatureFlags().flags.documentHistory = false
        await nextTick()
        await nextTick()
        expect(document.getElementById(HISTORY_HOST_ID)).toBeNull()
    })

    it('dispose 幂等，释放后可再次打开', async () => {
        useFeatureFlags().flags.documentHistory = true
        expect(await openFileHistory()).toBe(true)
        await flushPromises()
        disposeFileHistoryHost()
        disposeFileHistoryHost()
        expect(document.getElementById(HISTORY_HOST_ID)).toBeNull()
        expect(await openFileHistory()).toBe(true)
        await flushPromises()
        expect(document.getElementById(HISTORY_HOST_ID)).not.toBeNull()
    })

    it('宿主容器创建失败时返回 false 且不抛错（挂载失败降级）', async () => {
        useFeatureFlags().flags.documentHistory = true
        const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => {
            throw new Error('appendChild failed')
        })
        expect(await openFileHistory()).toBe(false)
        expect(document.getElementById(HISTORY_HOST_ID)).toBeNull()
        appendSpy.mockRestore()
    })

    it('closeFileHistory 只切换显隐（可重复调用）', async () => {
        useFeatureFlags().flags.documentHistory = true
        expect(await openFileHistory()).toBe(true)
        await flushPromises()
        closeFileHistory()
        closeFileHistory()
        expect(document.getElementById(HISTORY_HOST_ID)).not.toBeNull()
    })
})

describe('openMarkdownLint（A4 入口）', () => {
    it('flag 关闭时返回 false 且不挂载宿主', async () => {
        expect(await openMarkdownLint()).toBe(false)
        expect(document.getElementById(LINT_HOST_ID)).toBeNull()
    })

    it('flag 开启时挂载宿主并渲染 Markdown 检查对话框', async () => {
        useFeatureFlags().flags.markdownLint = true
        setActiveMarkdownContentProvider(() => '# 标题\n\n正文  \n')
        expect(await openMarkdownLint()).toBe(true)
        await flushPromises()
        await nextTick()
        expect(document.getElementById(LINT_HOST_ID)).not.toBeNull()
        expect(document.body.textContent).toContain('Markdown 检查')

        expect(await openMarkdownLint()).toBe(true)
        await flushPromises()
        expect(document.querySelectorAll(`#${LINT_HOST_ID}`)).toHaveLength(1)
    })

    it('使用中关闭 flag 自动卸载宿主；dispose 后可再次打开', async () => {
        useFeatureFlags().flags.markdownLint = true
        setActiveMarkdownContentProvider(() => '# 标题\n\n正文  \n')
        expect(await openMarkdownLint()).toBe(true)
        await flushPromises()
        useFeatureFlags().flags.markdownLint = false
        await nextTick()
        await nextTick()
        expect(document.getElementById(LINT_HOST_ID)).toBeNull()

        disposeMarkdownLintHost()
        useFeatureFlags().flags.markdownLint = true
        expect(await openMarkdownLint()).toBe(true)
        await flushPromises()
        expect(document.getElementById(LINT_HOST_ID)).not.toBeNull()
    })

    it('宿主创建失败时返回 false 且不抛错；closeMarkdownLint 可重复调用', async () => {
        useFeatureFlags().flags.markdownLint = true
        const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementationOnce(() => {
            throw new Error('appendChild failed')
        })
        expect(await openMarkdownLint()).toBe(false)
        expect(document.getElementById(LINT_HOST_ID)).toBeNull()
        appendSpy.mockRestore()

        setActiveMarkdownContentProvider(() => '# 标题\n\n正文  \n')
        expect(await openMarkdownLint()).toBe(true)
        await flushPromises()
        closeMarkdownLint()
        closeMarkdownLint()
        expect(document.getElementById(LINT_HOST_ID)).not.toBeNull()
    })
})
