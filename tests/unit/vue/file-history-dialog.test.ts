// @vitest-environment jsdom
/**
 * A3 FileHistoryDialog.vue 组件契约测试（jsdom + @vue/test-utils）
 *
 * 覆盖：
 * - 根节点受 flag 门控（关闭时不渲染）；
 * - 历史列表渲染（时间/大小/最新标记）、选中版本切换；
 * - 选中版本 ↔ 当前内容的行级 diff 渲染与统计；
 * - 恢复二次确认 → 经 EventBus MONACO_REPLACE_TEXT 恢复并关闭对话框；
 * - 删除版本 / 清空历史（确认后 localStorage 清除）；
 * - 无活动文件 / 无历史版本空态；关闭按钮更新显隐状态。
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
    loadActiveDocumentHistory,
    setActiveMarkdownContentProvider
} from '../../../src/renderer/src/composables/useDocumentHistory'
import {
    appendDocumentHistoryVersion,
    buildHistoryStorageKey,
    listDocumentHistoryVersions
} from '../../../src/renderer/src/components/Markdown/history/history-storage'
import FileHistoryDialog from '../../../src/renderer/src/components/Markdown/history/FileHistoryDialog.vue'

const FILE_PATH = 'C:\\notes\\dialog.md'

/** BaseDialog 默认 Teleport 到 body；stub 成内联渲染便于断言与清理 */
const mountOptions = { global: { stubs: { teleport: true } }, attachTo: document.body }

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

/** 预置历史数据 + 当前内容，并打开对话框 */
async function prepareHistory(options: {
    versions?: Array<{ id: string; savedAt: number; content: string }>
    currentContent?: string
    activeFilePath?: string
}): Promise<void> {
    useFeatureFlags().flags.documentHistory = true
    const activeFilePath = options.activeFilePath ?? FILE_PATH
    documentHistoryState.activeFilePath = activeFilePath
    for (const version of options.versions ?? []) {
        appendDocumentHistoryVersion(localStorage, activeFilePath, version.content, {
            savedAt: version.savedAt,
            versionId: version.id
        })
    }
    setActiveMarkdownContentProvider(() => options.currentContent ?? '')
    documentHistoryState.dialogVisible = true
    await loadActiveDocumentHistory()
}

/** 挂载对话框并等待首帧 */
async function mountDialog(): Promise<VueWrapper> {
    const wrapper = track(mount(FileHistoryDialog, mountOptions))
    await flushPromises()
    await nextTick()
    return wrapper
}

beforeEach(() => {
    vi.stubGlobal('electron', {
        ipcRenderer: { on: vi.fn(), removeListener: vi.fn(), invoke: vi.fn() }
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
    localStorage.clear()
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
    localStorage.clear()
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

describe('渲染与门控', () => {
    it('flag 关闭时根节点不渲染', async () => {
        documentHistoryState.dialogVisible = true
        const wrapper = await mountDialog()
        expect(wrapper.find('.dialog-container').exists()).toBe(false)
    })

    it('渲染历史列表（时间/大小/最新标记）与顶部路径/用量', async () => {
        await prepareHistory({
            versions: [
                { id: 'v1', savedAt: 1_700_000_000_000, content: '第一版' },
                { id: 'v2', savedAt: 1_700_000_100_000, content: '第二版' }
            ],
            currentContent: '第二版-当前'
        })
        const wrapper = await mountDialog()
        const items = wrapper.findAll('.version-item')
        expect(items).toHaveLength(2)
        expect(items[0].find('.version-badge').text()).toBe('最新')
        expect(items[1].find('.version-badge').exists()).toBe(false)
        expect(items[0].find('.version-time').text()).toMatch(
            /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
        )
        expect(items[0].find('.version-size').text().length).toBeGreaterThan(0)
        expect(wrapper.find('.history-path').text()).toContain(FILE_PATH)
        expect(wrapper.find('.history-usage').text()).toContain('历史占用')
    })

    it('无活动文件 / 无历史版本时展示空态提示', async () => {
        useFeatureFlags().flags.documentHistory = true
        documentHistoryState.activeFilePath = ''
        documentHistoryState.dialogVisible = true
        await loadActiveDocumentHistory()
        const wrapper = await mountDialog()
        expect(wrapper.find('.history-placeholder').text()).toContain('当前没有打开的文件')

        documentHistoryState.activeFilePath = 'C:\\notes\\empty.md'
        await loadActiveDocumentHistory()
        await nextTick()
        expect(wrapper.find('.history-placeholder').text()).toContain('暂无历史版本')
    })
})

describe('版本选择与 diff', () => {
    it('默认选中最新版本，点击其他版本切换选中并更新 diff', async () => {
        await prepareHistory({
            versions: [
                { id: 'v1', savedAt: 1000, content: '旧版本内容' },
                { id: 'v2', savedAt: 2000, content: '新版本内容' }
            ],
            currentContent: '当前编辑内容'
        })
        const wrapper = await mountDialog()
        const items = wrapper.findAll('.version-item')
        expect(items[0].classes()).toContain('is-selected')
        expect(items[0].attributes('aria-selected')).toBe('true')
        expect(wrapper.findAll('.diff-row').length).toBeGreaterThan(0)
        expect(wrapper.find('.diff-summary').text()).toMatch(/^\+\d+ \/ -\d+$/)

        await items[1].trigger('click')
        await nextTick()
        expect(wrapper.findAll('.version-item')[1].classes()).toContain('is-selected')
        expect(wrapper.find('.detail-title').text()).toContain('版本')
    })

    it('选中版本与当前内容一致时展示「无差异」提示', async () => {
        await prepareHistory({
            versions: [{ id: 'v1', savedAt: 1000, content: '完全一致' }],
            currentContent: '完全一致'
        })
        const wrapper = await mountDialog()
        expect(wrapper.find('.diff-placeholder').text()).toContain('一致')
    })
})

describe('恢复 / 删除 / 清空', () => {
    it('恢复需二次确认，确认后经 EventBus 恢复并关闭对话框', async () => {
        await prepareHistory({
            versions: [{ id: 'v1', savedAt: 1000, content: '历史正文' }],
            currentContent: '当前正文'
        })
        const wrapper = await mountDialog()
        const emitSpy = vi.spyOn(EventBus, '$emit')

        await wrapper.find('.btn-restore').trigger('click')
        expect(wrapper.find('.history-confirm').exists()).toBe(true)
        expect(emitSpy).not.toHaveBeenCalledWith(EVENT_BUS.MONACO_REPLACE_TEXT, expect.anything())

        await wrapper.find('.btn-confirm-history').trigger('click')
        await nextTick()
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.MONACO_REPLACE_TEXT, '历史正文')
        expect(documentHistoryState.dialogVisible).toBe(false)
    })

    it('取消恢复不发射事件、保持对话框打开', async () => {
        await prepareHistory({
            versions: [{ id: 'v1', savedAt: 1000, content: '历史正文' }],
            currentContent: '当前正文'
        })
        const wrapper = await mountDialog()
        const emitSpy = vi.spyOn(EventBus, '$emit')
        await wrapper.find('.btn-restore').trigger('click')
        await wrapper.find('.btn-cancel-history').trigger('click')
        expect(wrapper.find('.history-confirm').exists()).toBe(false)
        expect(emitSpy).not.toHaveBeenCalled()
        expect(documentHistoryState.dialogVisible).toBe(true)
    })

    it('删除选中版本后列表与 localStorage 同步更新', async () => {
        await prepareHistory({
            versions: [
                { id: 'v1', savedAt: 1000, content: '第一版' },
                { id: 'v2', savedAt: 2000, content: '第二版' }
            ],
            currentContent: '当前'
        })
        const wrapper = await mountDialog()
        await wrapper.find('.btn-delete-version').trigger('click')
        await flushPromises()
        expect(wrapper.findAll('.version-item')).toHaveLength(1)
        expect(listDocumentHistoryVersions(localStorage, FILE_PATH)).toHaveLength(1)
    })

    it('清空历史需二次确认，确认后删除 localStorage 并回到空态', async () => {
        await prepareHistory({
            versions: [{ id: 'v1', savedAt: 1000, content: '第一版' }],
            currentContent: '当前'
        })
        const wrapper = await mountDialog()
        await wrapper.find('.btn-clear-history').trigger('click')
        expect(wrapper.find('.history-confirm').text()).toContain('清空')
        await wrapper.find('.btn-confirm-history').trigger('click')
        await flushPromises()
        expect(localStorage.getItem(buildHistoryStorageKey(FILE_PATH))).toBeNull()
        expect(wrapper.find('.history-placeholder').text()).toContain('暂无历史版本')
    })

    it('关闭按钮更新对话框显隐状态（不卸载监听/快照能力）', async () => {
        await prepareHistory({
            versions: [{ id: 'v1', savedAt: 1000, content: '第一版' }],
            currentContent: '当前'
        })
        const wrapper = await mountDialog()
        await wrapper.find('.btn-close-history').trigger('click')
        expect(documentHistoryState.dialogVisible).toBe(false)
    })

    it('长文档 diff 折叠未变更行（gap 行 + 相同行无 +/- 前缀）', async () => {
        const oldLines = Array.from({ length: 30 }, (_, index) => `line-${index + 1}`)
        const newLines = [...oldLines]
        newLines[14] = 'changed-line'
        await prepareHistory({
            versions: [{ id: 'v1', savedAt: 1000, content: oldLines.join('\n') }],
            currentContent: newLines.join('\n')
        })
        const wrapper = await mountDialog()
        expect(wrapper.findAll('.diff-row--gap').length).toBeGreaterThan(0)
        const equalRow = wrapper.find('.diff-row--equal')
        expect(equalRow.exists()).toBe(true)
        expect(equalRow.find('.diff-mark').text()).toBe('')
    })

    it('加载失败状态展示错误占位', async () => {
        useFeatureFlags().flags.documentHistory = true
        documentHistoryState.activeFilePath = FILE_PATH
        documentHistoryState.status = 'error'
        documentHistoryState.versions = []
        documentHistoryState.dialogVisible = true
        const wrapper = await mountDialog()
        expect(wrapper.find('.history-placeholder--error').text()).toContain('加载历史版本失败')
    })

    it('关闭对话框会清空二次确认状态（重新打开不残留确认框）', async () => {
        await prepareHistory({
            versions: [{ id: 'v1', savedAt: 1000, content: '历史正文' }],
            currentContent: '当前正文'
        })
        const wrapper = await mountDialog()
        await wrapper.find('.btn-restore').trigger('click')
        expect(wrapper.find('.history-confirm').exists()).toBe(true)
        await wrapper.find('.btn-close-history').trigger('click')
        await nextTick()

        documentHistoryState.dialogVisible = true
        await nextTick()
        expect(wrapper.find('.history-confirm').exists()).toBe(false)
    })
})
