// @vitest-environment jsdom
/**
 * P0-8 WritingStyleDialog.vue 组件契约测试（jsdom + @vue/test-utils）
 *
 * 覆盖：
 * - 打开即检查：问题列表 / 规则统计 / 汇总文案 / 目标文档展示；
 * - 点击问题经既有 EventBus EDITOR_JUMP_LINE 跳行并高亮；
 * - 规则勾选开关：只基于最近一次检查文本重算、不重新读取编辑器；
 * - 重新检查重新读取内容、加载态、无文档 / 无问题 / 文档过大空态、内容来源提示；
 * - 关闭按钮更新对话框显隐；
 * - 对外入口 openWritingStyleCheck()：首次挂载、关闭不重建、dispose 清理。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'
import EventBus from '../../../src/renderer/src/common/event-bus/event-bus'
import { EVENT_BUS } from '../../../src/renderer/src/common/event-bus/event-bus-events'
import {
    disposeDocumentHistoryFeature,
    documentHistoryState,
    setActiveMarkdownContentProvider
} from '../../../src/renderer/src/composables/useDocumentHistory'
import { useFeatureFlags } from '../../../src/renderer/src/composables/useFeatureFlags'
import { WRITING_STYLE_MAX_INPUT_CHARS } from '../../../src/renderer/src/components/Markdown/writing-style/writing-style-check'
import { writingStyleDialogState } from '../../../src/renderer/src/components/Markdown/writing-style/writing-style-dialog-state'
import WritingStyleDialog from '../../../src/renderer/src/components/Markdown/writing-style/WritingStyleDialog.vue'
import {
    closeWritingStyleCheck,
    disposeWritingStyleHost,
    openWritingStyleCheck
} from '../../../src/renderer/src/components/Markdown/writing-style'

/** BaseDialog 默认 Teleport 到 body；stub 成内联渲染便于断言与清理 */
const mountOptions = { global: { stubs: { teleport: true } }, attachTo: document.body }

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

/** 设置内容 provider 并打开对话框（内容串 / null=无文档） */
async function prepareDialog(content: string | null): Promise<VueWrapper> {
    useFeatureFlags().flags.writingStyleCheck = true
    setActiveMarkdownContentProvider(content === null ? null : () => content)
    writingStyleDialogState.visible = true
    const wrapper = track(mount(WritingStyleDialog, mountOptions))
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
    disposeDocumentHistoryFeature()
    documentHistoryState.activeFilePath = ''
    setActiveMarkdownContentProvider(null)
    writingStyleDialogState.visible = false
    const { flags } = useFeatureFlags()
    for (const key of Object.keys(flags) as Array<keyof typeof flags>) {
        flags[key] = false
    }
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
    disposeWritingStyleHost()
    await nextTick()
    disposeDocumentHistoryFeature()
    vi.unstubAllGlobals()
    writingStyleDialogState.visible = false
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

describe('渲染与内容桥', () => {
    it('打开即检查：渲染问题列表、规则统计与汇总文案', async () => {
        const wrapper = await prepareDialog('其实。你好！！！')
        expect(wrapper.find('.ws-summary').text()).toContain('共')
        expect(wrapper.findAll('.issue-item').length).toBeGreaterThan(0)
        // 规则统计始终列全 8 条规则（含未命中规则，便于开关配置）
        expect(wrapper.findAll('.stat-row')).toHaveLength(8)
        expect(wrapper.find('.stat-total').text()).toContain('已启用')
        expect(wrapper.find('.ws-target').text()).toContain('目标')
        const firstIssue = wrapper.findAll('.issue-item')[0]
        expect(firstIssue.find('.issue-line').text()).toMatch(/^L\d+:\d+$/)
        expect(firstIssue.find('.issue-message').text().length).toBeGreaterThan(0)
        expect(firstIssue.find('.issue-excerpt').text().length).toBeGreaterThan(0)
    })

    it('能力开关关闭时根节点不渲染（宿主在开关关闭时卸载整个实例）', async () => {
        setActiveMarkdownContentProvider(() => '其实。')
        writingStyleDialogState.visible = true
        const wrapper = track(mount(WritingStyleDialog, mountOptions))
        await flushPromises()
        await nextTick()
        expect(wrapper.find('.dialog-container').exists()).toBe(false)
    })

    it('点击问题经 EventBus EDITOR_JUMP_LINE 跳转到对应行并高亮', async () => {
        const wrapper = await prepareDialog('第一行\n\n其实这里')
        const emitSpy = vi.spyOn(EventBus, '$emit')
        const issueItem = wrapper.findAll('.issue-item')[0]
        const lineText = issueItem.find('.issue-line').text()
        const expectedLine = Number.parseInt(lineText.replace(/^L/, '').split(':')[0], 10)
        await issueItem.trigger('click')
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.EDITOR_JUMP_LINE, { line: expectedLine })
        expect(issueItem.attributes('aria-selected')).toBe('true')
    })

    it('规则勾选开关：该规则问题消失，且不重新读取编辑器内容', async () => {
        const provider = vi.fn(() => '其实。你好！！！')
        useFeatureFlags().flags.writingStyleCheck = true
        setActiveMarkdownContentProvider(provider)
        writingStyleDialogState.visible = true
        const wrapper = track(mount(WritingStyleDialog, mountOptions))
        await flushPromises()
        await nextTick()
        expect(provider).toHaveBeenCalledTimes(1)
        const before = wrapper.findAll('.issue-item').length
        const fillerRow = wrapper.findAll('.stat-row').find((row) => row.text().includes('填充词'))
        expect(fillerRow).toBeTruthy()
        await fillerRow!.find('input').trigger('change')
        expect(wrapper.findAll('.issue-item').length).toBe(before - 1)
        // 规则重算基于最近一次检查文本，不触发内容桥读取
        expect(provider).toHaveBeenCalledTimes(1)
    })

    it('重新检查会重新读取当前内容并更新问题列表', async () => {
        const provider = vi.fn(() => '其实。')
        useFeatureFlags().flags.writingStyleCheck = true
        setActiveMarkdownContentProvider(provider)
        writingStyleDialogState.visible = true
        const wrapper = track(mount(WritingStyleDialog, mountOptions))
        await flushPromises()
        await nextTick()
        expect(provider).toHaveBeenCalledTimes(1)
        provider.mockReturnValue('这是一段普通的文字。')
        await wrapper.find('.btn-recheck').trigger('click')
        await flushPromises()
        await nextTick()
        expect(provider).toHaveBeenCalledTimes(2)
        expect(wrapper.find('.ws-placeholder--success').exists()).toBe(true)
    })

    it('全部 8 条规则命中时渲染各自规则名与中文兜底文案', async () => {
        const longCjk = '这'.repeat(61)
        const longEnglish = Array.from({ length: 36 }, () => 'word').join(' ')
        const content = [
            longCjk,
            longEnglish,
            '非常重要非常重要',
            '然后，然后，然后，然后。',
            '其实 basically',
            '你好！！！',
            '字'.repeat(501),
            '中文English混排',
            '这是问题？还是问题?'
        ].join('\n\n')
        const wrapper = await prepareDialog(content)
        const text = wrapper.text()
        for (const label of [
            '长句',
            '重复词',
            '高频口头禅',
            '填充词',
            '连续标点',
            '超长段落',
            '中英混排空格',
            '全半角标点混用'
        ]) {
            expect(text).toContain(label)
        }
        // 覆盖各规则的中文兜底插值文案（词典补齐前界面可读）
        expect(text).toContain('长句共 36 词')
        expect(text).toContain('词语连续重复')
        expect(text).toContain('高频口头禅')
        expect(text).toContain('填充词：「其实」')
        expect(text).toContain('连续标点')
        expect(text).toContain('段落过长')
        expect(text).toContain('中英混排建议加空格')
        expect(text).toContain('全角/半角标点混用')
    })

    it('单条规则命中达上限时展示截断提示', async () => {
        const wrapper = await prepareDialog('其实'.repeat(500))
        expect(wrapper.findAll('.issue-item').length).toBeGreaterThanOrEqual(200)
        expect(wrapper.find('.ws-truncated').text()).toContain('截断')
    })
})

describe('空态与内容来源', () => {
    it('无文档：展示「没有可检查的文档」', async () => {
        const wrapper = await prepareDialog(null)
        expect(wrapper.find('.ws-placeholder').text()).toContain('没有可检查的文档')
    })

    it('无问题：展示「已启用规则未发现写作风格问题」', async () => {
        const wrapper = await prepareDialog('这是一段普通的文字。')
        expect(wrapper.find('.ws-placeholder--success').text()).toContain('未发现')
        expect(wrapper.find('.ws-main').exists()).toBe(false)
    })

    it('文档超过 2 MiB 上限：展示过大提示', async () => {
        const wrapper = await prepareDialog('x'.repeat(WRITING_STYLE_MAX_INPUT_CHARS + 1))
        expect(wrapper.find('.ws-placeholder').text()).toContain('文档过大')
        expect(wrapper.find('.ws-main').exists()).toBe(false)
    })

    it('编辑器未就绪（回退已保存内容）时展示来源提示', async () => {
        documentHistoryState.activeFilePath = 'C:\\notes\\saved.md'
        useFeatureFlags().flags.writingStyleCheck = true
        vi.stubGlobal('electron', {
            ipcRenderer: {
                on: vi.fn(),
                removeListener: vi.fn(),
                invoke: vi.fn().mockResolvedValue('已保存内容里其实有填充词。')
            }
        })
        setActiveMarkdownContentProvider(null)
        writingStyleDialogState.visible = true
        const wrapper = track(mount(WritingStyleDialog, mountOptions))
        await flushPromises()
        await nextTick()
        expect(wrapper.find('.ws-hint').text()).toContain('已保存内容')
        expect(wrapper.find('.ws-target').text()).toContain('saved.md')
        expect(wrapper.findAll('.issue-item').length).toBeGreaterThan(0)
    })

    it('检查期间展示「正在检查」占位，完成后渲染问题列表', async () => {
        let resolveContent: ((value: string) => void) | undefined
        const pending = new Promise<string>((resolve) => {
            resolveContent = resolve
        })
        useFeatureFlags().flags.writingStyleCheck = true
        setActiveMarkdownContentProvider(() => pending)
        writingStyleDialogState.visible = true
        const wrapper = track(mount(WritingStyleDialog, mountOptions))
        await nextTick()
        expect(wrapper.find('.ws-placeholder').text()).toContain('正在检查')
        resolveContent!('其实。')
        await flushPromises()
        await nextTick()
        expect(wrapper.findAll('.issue-item').length).toBeGreaterThan(0)
    })

    it('关闭按钮更新对话框显隐状态', async () => {
        const wrapper = await prepareDialog('其实。')
        await wrapper.find('.btn-close-writing-style').trigger('click')
        expect(writingStyleDialogState.visible).toBe(false)
    })
})

describe('对外入口 openWritingStyleCheck', () => {
    it('首次调用挂载宿主并打开；关闭不重建；dispose 清理后可重新打开', async () => {
        useFeatureFlags().flags.writingStyleCheck = true
        setActiveMarkdownContentProvider(() => '其实。')
        expect(await openWritingStyleCheck()).toBe(true)
        await flushPromises()
        expect(writingStyleDialogState.visible).toBe(true)
        expect(document.querySelectorAll('#baize-writing-style-host')).toHaveLength(1)
        expect(document.querySelectorAll('.issue-item').length).toBeGreaterThan(0)

        closeWritingStyleCheck()
        expect(writingStyleDialogState.visible).toBe(false)
        expect(await openWritingStyleCheck()).toBe(true)
        // 关闭只切显隐，不重新 createApp / 追加容器
        expect(document.querySelectorAll('#baize-writing-style-host')).toHaveLength(1)

        disposeWritingStyleHost()
        expect(document.querySelectorAll('#baize-writing-style-host')).toHaveLength(0)
        expect(writingStyleDialogState.visible).toBe(false)

        // dispose 后再次打开会重新挂载（幂等可重入）
        setActiveMarkdownContentProvider(() => '其实。')
        expect(await openWritingStyleCheck()).toBe(true)
        disposeWritingStyleHost()
    })

    it('无 document 环境（宿主无法挂载）时返回 false 且不抛错', async () => {
        useFeatureFlags().flags.writingStyleCheck = true
        const savedDocument = globalThis.document
        vi.stubGlobal('document', undefined)
        try {
            expect(await openWritingStyleCheck()).toBe(false)
        } finally {
            vi.stubGlobal('document', savedDocument)
        }
        expect(writingStyleDialogState.visible).toBe(false)
    })

    it('能力开关关闭时 open 直接返回 false 且不挂载宿主', async () => {
        expect(await openWritingStyleCheck()).toBe(false)
        expect(document.querySelectorAll('#baize-writing-style-host')).toHaveLength(0)
        expect(writingStyleDialogState.visible).toBe(false)
    })

    it('使用中关闭能力开关时宿主自动卸载', async () => {
        useFeatureFlags().flags.writingStyleCheck = true
        setActiveMarkdownContentProvider(() => '其实。')
        expect(await openWritingStyleCheck()).toBe(true)
        await flushPromises()
        expect(document.querySelectorAll('#baize-writing-style-host')).toHaveLength(1)
        useFeatureFlags().flags.writingStyleCheck = false
        await nextTick()
        expect(document.querySelectorAll('#baize-writing-style-host')).toHaveLength(0)
        expect(writingStyleDialogState.visible).toBe(false)
    })
})
