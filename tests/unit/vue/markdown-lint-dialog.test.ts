// @vitest-environment jsdom
/**
 * A4 MarkdownLintDialog.vue 组件契约测试（jsdom + @vue/test-utils）
 *
 * 覆盖：
 * - 根节点受 flag 门控（关闭时不渲染）；
 * - 打开即检查：问题列表、规则统计、汇总文案；
 * - 点击问题经 EventBus EDITOR_JUMP_LINE 跳行；
 * - 一键格式化：二次确认 → 经 EventBus MONACO_REPLACE_TEXT 应用 → 重新汇总并展示结果；
 * - 重新检查（重新读取内容）、无问题/无文档/文档过大空态、关闭按钮。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import EventBus from '../../../src/renderer/src/common/event-bus/event-bus'
import { EVENT_BUS } from '../../../src/renderer/src/common/event-bus/event-bus-events'
import { useFeatureFlags } from '../../../src/renderer/src/composables/useFeatureFlags'
import {
    disposeDocumentHistoryFeature,
    documentHistoryState,
    setActiveMarkdownContentProvider
} from '../../../src/renderer/src/composables/useDocumentHistory'
import { MARKDOWN_LINT_MAX_INPUT_CHARS } from '../../../src/renderer/src/components/Markdown/lint/markdown-lint'
import { markdownLintDialogState } from '../../../src/renderer/src/components/Markdown/lint/lint-dialog-state'
import MarkdownLintDialog from '../../../src/renderer/src/components/Markdown/lint/MarkdownLintDialog.vue'

/** BaseDialog 默认 Teleport 到 body；stub 成内联渲染便于断言与清理 */
const mountOptions = { global: { stubs: { teleport: true } }, attachTo: document.body }

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

/** 设置内容 provider 并打开 lint 对话框 */
async function prepareLint(content: string | null): Promise<VueWrapper> {
    useFeatureFlags().flags.markdownLint = true
    setActiveMarkdownContentProvider(content === null ? null : () => content)
    markdownLintDialogState.visible = true
    const wrapper = track(mount(MarkdownLintDialog, mountOptions))
    await flushPromises()
    await nextTick()
    return wrapper
}

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
    disposeDocumentHistoryFeature()
    setActiveMarkdownContentProvider(null)
    markdownLintDialogState.visible = false
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

afterEach(async () => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    await nextTick()
    disposeDocumentHistoryFeature()
    vi.unstubAllGlobals()
    markdownLintDialogState.visible = false
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

describe('渲染与门控', () => {
    it('flag 关闭时根节点不渲染', async () => {
        markdownLintDialogState.visible = true
        const wrapper = await prepareLint('### 标题\n')
        // prepareLint 会把 flag 打开；这里显式关闭后再判断门控
        useFeatureFlags().flags.markdownLint = false
        await nextTick()
        expect(wrapper.find('.dialog-container').exists()).toBe(false)
    })

    it('打开即检查：渲染问题列表、规则统计与汇总', async () => {
        const wrapper = await prepareLint('## 标题\n\n正文  \n')
        expect(wrapper.find('.lint-summary').text()).toContain('共')
        expect(wrapper.findAll('.issue-item').length).toBeGreaterThan(0)
        expect(wrapper.findAll('.stat-row').length).toBeGreaterThan(0)
        expect(wrapper.find('.stat-total').text()).toContain('共')
        expect(wrapper.find('.lint-target').text()).toContain('目标')
    })

    it('点击问题经 EventBus 跳转到对应行并高亮', async () => {
        const content = '# 标题\n\n正文  \n'
        const wrapper = await prepareLint(content)
        const emitSpy = vi.spyOn(EventBus, '$emit')
        const issueItem = wrapper.findAll('.issue-item')[0]
        const lineText = issueItem.find('.issue-line').text()
        const expectedLine = Number.parseInt(lineText.replace(/^L/, '').split(':')[0], 10)
        await issueItem.trigger('click')
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.EDITOR_JUMP_LINE, {
            line: expectedLine
        })
        expect(issueItem.attributes('aria-selected')).toBe('true')
    })
})

describe('一键格式化', () => {
    it('二次确认后经 EventBus 应用格式化，并重新汇总（可修复项清零）', async () => {
        const messy = '## 标题\n\n正文  \n\n\n\n结尾\n'
        const wrapper = await prepareLint(messy)
        const emitSpy = vi.spyOn(EventBus, '$emit')
        expect(wrapper.findAll('.issue-item').length).toBeGreaterThan(0)

        await wrapper.find('.btn-format').trigger('click')
        expect(wrapper.find('.lint-confirm').exists()).toBe(true)
        await wrapper.find('.btn-confirm-format').trigger('click')
        await flushPromises()

        const replaceCall = emitSpy.mock.calls.find(
            ([eventName]) => eventName === EVENT_BUS.MONACO_REPLACE_TEXT
        )
        expect(replaceCall).toBeTruthy()
        expect(replaceCall![1]).toBe('## 标题\n\n正文\n\n结尾\n')
        expect(wrapper.find('.lint-status').text()).toContain('已应用格式化')
        expect(wrapper.find('.lint-placeholder--success').exists()).toBe(true)
    })

    it('取消格式化不发射事件', async () => {
        const wrapper = await prepareLint('# 标题\n\n正文  \n')
        const emitSpy = vi.spyOn(EventBus, '$emit')
        await wrapper.find('.btn-format').trigger('click')
        await wrapper.find('.btn-cancel-format').trigger('click')
        expect(wrapper.find('.lint-confirm').exists()).toBe(false)
        expect(emitSpy).not.toHaveBeenCalledWith(EVENT_BUS.MONACO_REPLACE_TEXT, expect.anything())
    })

    it('重新检查会重新读取当前内容并更新问题列表', async () => {
        const wrapper = await prepareLint('# 标题\n\n正文  \n')
        const before = wrapper.findAll('.issue-item').length
        setActiveMarkdownContentProvider(() => '> 引用\n\n- a\n- b\n结尾  \n')
        await wrapper.find('.btn-recheck').trigger('click')
        await flushPromises()
        await nextTick()
        const after = wrapper.findAll('.issue-item').length
        expect(after).not.toBe(before)
        expect(after).toBeGreaterThan(0)
    })
})

describe('空态与关闭', () => {
    it('无问题：展示「未发现规范问题」', async () => {
        const wrapper = await prepareLint('## 标题\n\n正文\n')
        expect(wrapper.find('.lint-placeholder--success').text()).toContain('未发现')
        expect(wrapper.find('.btn-format').attributes('disabled')).toBeDefined()
    })

    it('无文档：展示「没有可检查的文档」', async () => {
        const wrapper = await prepareLint(null)
        expect(wrapper.find('.lint-placeholder').text()).toContain('没有可检查的文档')
    })

    it('文档超过上限：展示过大提示且禁用格式化', async () => {
        const wrapper = await prepareLint('x'.repeat(MARKDOWN_LINT_MAX_INPUT_CHARS + 1))
        expect(wrapper.find('.lint-placeholder').text()).toContain('文档过大')
        expect(wrapper.find('.btn-format').attributes('disabled')).toBeDefined()
    })

    it('关闭按钮更新对话框显隐状态', async () => {
        const wrapper = await prepareLint('# 标题\n\n正文  \n')
        await wrapper.find('.btn-close-lint').trigger('click')
        expect(markdownLintDialogState.visible).toBe(false)
    })
})

describe('内容来源与加载态', () => {
    it('编辑器未就绪（回退已保存内容）时展示来源提示', async () => {
        useFeatureFlags().flags.markdownLint = true
        documentHistoryState.activeFilePath = 'C:\\notes\\saved.md'
        vi.stubGlobal('electron', {
            ipcRenderer: {
                on: vi.fn(),
                removeListener: vi.fn(),
                invoke: vi.fn().mockResolvedValue('# 已保存内容  \n')
            }
        })
        setActiveMarkdownContentProvider(null)
        markdownLintDialogState.visible = true
        const wrapper = track(mount(MarkdownLintDialog, mountOptions))
        await flushPromises()
        await nextTick()
        expect(wrapper.find('.lint-hint').text()).toContain('已保存内容')
        expect(wrapper.find('.lint-target').text()).toContain('saved.md')
    })

    it('检查期间展示「正在检查」占位，完成后渲染问题列表', async () => {
        useFeatureFlags().flags.markdownLint = true
        let resolveContent: ((value: string) => void) | undefined
        const pending = new Promise<string>((resolve) => {
            resolveContent = resolve
        })
        setActiveMarkdownContentProvider(() => pending)
        markdownLintDialogState.visible = true
        const wrapper = track(mount(MarkdownLintDialog, mountOptions))
        await nextTick()
        expect(wrapper.find('.lint-placeholder').text()).toContain('正在检查')
        resolveContent!('# 标题\n\n正文  \n')
        await flushPromises()
        await nextTick()
        expect(wrapper.findAll('.issue-item').length).toBeGreaterThan(0)
    })
})
