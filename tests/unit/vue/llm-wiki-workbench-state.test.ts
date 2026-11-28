// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki 工作台 UI 状态（编辑区 tab / AI 面板折叠 / AI 面板宽度）持久化。
 *
 * 覆盖：默认值、localStorage 容错读取（损坏值/存储异常）、写入与恢复、重置接口，
 * 以及编辑区 tab 分段控件的渲染/切换/无障碍属性。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { nextTick } from 'vue'
import {
    DEFAULT_LLM_WIKI_EDITOR_TAB,
    LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY,
    LLM_WIKI_AI_PANEL_WIDTH,
    LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY,
    LLM_WIKI_EDITOR_TAB,
    LLM_WIKI_EDITOR_TAB_STORAGE_KEY,
    clampLlmWikiAiPanelWidth,
    ensureLlmWikiWorkbenchStateLoaded,
    llmWikiWorkbenchState,
    normalizeLlmWikiAiPanelWidth,
    normalizeLlmWikiEditorTab,
    resetLlmWikiAiPanelWidth,
    resetLlmWikiWorkbenchStateForTesting,
    setLlmWikiAiPanelWidth,
    setLlmWikiEditorTab,
    toggleLlmWikiAiPanelCollapsed
} from '../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench'
import LlmWikiEditorTabs from '../../../src/renderer/src/components/llm-wiki/LlmWikiEditorTabs.vue'
import { t } from '../../../src/renderer/src/common/i18n'

beforeEach(() => {
    window.localStorage.clear()
    resetLlmWikiWorkbenchStateForTesting()
})

afterEach(() => {
    resetLlmWikiWorkbenchStateForTesting()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('llm-wiki-workbench 状态默认值与归一化', () => {
    it('未持久化时默认编辑器 tab、AI 面板展开且宽度未自定义', () => {
        ensureLlmWikiWorkbenchStateLoaded()
        expect(llmWikiWorkbenchState.editorTab).toBe(DEFAULT_LLM_WIKI_EDITOR_TAB)
        expect(DEFAULT_LLM_WIKI_EDITOR_TAB).toBe(LLM_WIKI_EDITOR_TAB.EDITOR)
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        // null = 未自定义宽度：布局层按窗口宽度分档取默认值
        expect(llmWikiWorkbenchState.aiPanelWidth).toBeNull()
    })

    it('normalizeLlmWikiEditorTab 只接受 preview，其余回落 editor', () => {
        expect(normalizeLlmWikiEditorTab('preview')).toBe('preview')
        expect(normalizeLlmWikiEditorTab('editor')).toBe('editor')
        expect(normalizeLlmWikiEditorTab('garbage')).toBe('editor')
        expect(normalizeLlmWikiEditorTab(undefined)).toBe('editor')
        expect(normalizeLlmWikiEditorTab(42)).toBe('editor')
    })

    it('localStorage 中的损坏值回落默认（容错读取）', () => {
        window.localStorage.setItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY, 'not-a-tab')
        ensureLlmWikiWorkbenchStateLoaded()
        expect(llmWikiWorkbenchState.editorTab).toBe('editor')
    })

    it('localStorage 读取异常时回落默认且不抛错', () => {
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage blocked')
        })
        expect(() => ensureLlmWikiWorkbenchStateLoaded()).not.toThrow()
        expect(llmWikiWorkbenchState.editorTab).toBe('editor')
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        getItemSpy.mockRestore()
    })

    it('localStorage 写入异常（配额/隐私模式）时内存状态仍生效且不抛错', () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded')
        })
        expect(() => setLlmWikiEditorTab('preview')).not.toThrow()
        expect(llmWikiWorkbenchState.editorTab).toBe('preview')
        expect(() => toggleLlmWikiAiPanelCollapsed()).not.toThrow()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        setItemSpy.mockRestore()
    })

    it('无 window 的极端环境（typeof window === undefined）读写安全降级', () => {
        vi.stubGlobal('window', undefined)
        expect(() => ensureLlmWikiWorkbenchStateLoaded()).not.toThrow()
        expect(llmWikiWorkbenchState.editorTab).toBe('editor')
        expect(llmWikiWorkbenchState.aiPanelWidth).toBeNull()
        expect(() => setLlmWikiEditorTab('preview')).not.toThrow()
        expect(llmWikiWorkbenchState.editorTab).toBe('preview')
        expect(() => toggleLlmWikiAiPanelCollapsed()).not.toThrow()
        expect(() => setLlmWikiAiPanelWidth(420)).not.toThrow()
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(420)
        expect(() => resetLlmWikiAiPanelWidth()).not.toThrow()
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(LLM_WIKI_AI_PANEL_WIDTH.DEFAULT)
        expect(() => resetLlmWikiWorkbenchStateForTesting()).not.toThrow()
        vi.unstubAllGlobals()
    })
})

describe('llm-wiki-workbench 状态写入与恢复', () => {
    it('切换编辑区 tab 写入 localStorage，重复设置不重复写', () => {
        setLlmWikiEditorTab('preview')
        expect(llmWikiWorkbenchState.editorTab).toBe('preview')
        expect(window.localStorage.getItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)).toBe('preview')

        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
        setLlmWikiEditorTab('preview')
        expect(setItemSpy).not.toHaveBeenCalled()
        setItemSpy.mockRestore()
    })

    it('切换 AI 面板折叠写入 localStorage', () => {
        toggleLlmWikiAiPanelCollapsed()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('true')

        toggleLlmWikiAiPanelCollapsed()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('false')
    })

    it('新模块实例从 localStorage 恢复上次状态（模拟重启后恢复）', async () => {
        window.localStorage.setItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY, 'preview')
        window.localStorage.setItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY, 'true')
        window.localStorage.setItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY, '420')
        vi.resetModules()
        const fresh =
            (await import('../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench')) as typeof import('../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench')
        fresh.ensureLlmWikiWorkbenchStateLoaded()
        expect(fresh.llmWikiWorkbenchState.editorTab).toBe('preview')
        expect(fresh.llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(fresh.llmWikiWorkbenchState.aiPanelWidth).toBe(420)
    })

    it('resetLlmWikiWorkbenchStateForTesting 清除内存状态与持久化键', () => {
        setLlmWikiEditorTab('preview')
        toggleLlmWikiAiPanelCollapsed()
        setLlmWikiAiPanelWidth(420)
        resetLlmWikiWorkbenchStateForTesting()
        expect(llmWikiWorkbenchState.editorTab).toBe('editor')
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(llmWikiWorkbenchState.aiPanelWidth).toBeNull()
        expect(window.localStorage.getItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)).toBeNull()
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBeNull()
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBeNull()
    })
})

describe('llm-wiki-workbench AI 面板宽度（split 拖拽）状态', () => {
    it('clampLlmWikiAiPanelWidth：夹取到 [MIN, MAX]，非有限数值回落默认宽度', () => {
        expect(LLM_WIKI_AI_PANEL_WIDTH).toEqual({ MIN: 240, DEFAULT: 360, MAX: 560 })
        expect(clampLlmWikiAiPanelWidth(320)).toBe(320)
        expect(clampLlmWikiAiPanelWidth(100)).toBe(LLM_WIKI_AI_PANEL_WIDTH.MIN)
        expect(clampLlmWikiAiPanelWidth(9999)).toBe(LLM_WIKI_AI_PANEL_WIDTH.MAX)
        // 四舍五入到整数 px（拖拽 mouse 坐标可能带小数）
        expect(clampLlmWikiAiPanelWidth(320.6)).toBe(321)
        expect(clampLlmWikiAiPanelWidth(Number.NaN)).toBe(LLM_WIKI_AI_PANEL_WIDTH.DEFAULT)
        expect(clampLlmWikiAiPanelWidth(Number.POSITIVE_INFINITY)).toBe(
            LLM_WIKI_AI_PANEL_WIDTH.DEFAULT
        )
    })

    it('normalizeLlmWikiAiPanelWidth：接受数字/数字字符串，损坏值回落 null', () => {
        expect(normalizeLlmWikiAiPanelWidth(420)).toBe(420)
        expect(normalizeLlmWikiAiPanelWidth('420')).toBe(420)
        expect(normalizeLlmWikiAiPanelWidth(' 380 ')).toBe(380)
        // 越界字符串夹取到合法区间
        expect(normalizeLlmWikiAiPanelWidth('100')).toBe(LLM_WIKI_AI_PANEL_WIDTH.MIN)
        expect(normalizeLlmWikiAiPanelWidth('9999')).toBe(LLM_WIKI_AI_PANEL_WIDTH.MAX)
        // 缺失/损坏值 = 未自定义（null）
        expect(normalizeLlmWikiAiPanelWidth(null)).toBeNull()
        expect(normalizeLlmWikiAiPanelWidth(undefined)).toBeNull()
        expect(normalizeLlmWikiAiPanelWidth('')).toBeNull()
        expect(normalizeLlmWikiAiPanelWidth('not-a-width')).toBeNull()
        expect(normalizeLlmWikiAiPanelWidth({ width: 400 })).toBeNull()
    })

    it('setLlmWikiAiPanelWidth 夹取并持久化；重复设置不重复写', () => {
        setLlmWikiAiPanelWidth(420)
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(420)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('420')

        setLlmWikiAiPanelWidth(100)
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(LLM_WIKI_AI_PANEL_WIDTH.MIN)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('240')

        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
        setLlmWikiAiPanelWidth(LLM_WIKI_AI_PANEL_WIDTH.MIN)
        expect(setItemSpy).not.toHaveBeenCalled()
        setItemSpy.mockRestore()
    })

    it('从 localStorage 恢复宽度（localStorage 只能存字符串）；损坏值回落未自定义', () => {
        window.localStorage.setItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY, '480')
        ensureLlmWikiWorkbenchStateLoaded()
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(480)

        resetLlmWikiWorkbenchStateForTesting()
        window.localStorage.setItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY, 'garbage')
        ensureLlmWikiWorkbenchStateLoaded()
        expect(llmWikiWorkbenchState.aiPanelWidth).toBeNull()
    })

    it('resetLlmWikiAiPanelWidth 恢复默认 360px 并持久化', () => {
        setLlmWikiAiPanelWidth(500)
        resetLlmWikiAiPanelWidth()
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(LLM_WIKI_AI_PANEL_WIDTH.DEFAULT)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('360')
    })

    it('localStorage 写入异常（配额/隐私模式）时宽度内存状态仍生效且不抛错', () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded')
        })
        expect(() => setLlmWikiAiPanelWidth(450)).not.toThrow()
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(450)
        expect(() => resetLlmWikiAiPanelWidth()).not.toThrow()
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(LLM_WIKI_AI_PANEL_WIDTH.DEFAULT)
        setItemSpy.mockRestore()
    })

    it('localStorage 读取异常时宽度回落未自定义且不抛错', () => {
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage blocked')
        })
        expect(() => ensureLlmWikiWorkbenchStateLoaded()).not.toThrow()
        expect(llmWikiWorkbenchState.aiPanelWidth).toBeNull()
        getItemSpy.mockRestore()
    })
})

describe('LlmWikiEditorTabs 分段控件', () => {
    it('渲染编辑器/预览两项，默认编辑器选中且 aria-pressed 正确', async () => {
        const wrapper = mount(LlmWikiEditorTabs)
        await flushPromises()

        const tabs = wrapper.findAll('.llm-wiki-editor-tab')
        expect(tabs).toHaveLength(2)
        expect(tabs[0].attributes('data-tab')).toBe('editor')
        expect(tabs[0].attributes('aria-pressed')).toBe('true')
        expect(tabs[0].text()).toBe(t('editorUi.llmWikiPanel.tabEditor'))
        expect(tabs[1].attributes('data-tab')).toBe('preview')
        expect(tabs[1].attributes('aria-pressed')).toBe('false')
        expect(tabs[1].text()).toBe(t('editorUi.llmWikiPanel.tabPreview'))

        const group = wrapper.find('.llm-wiki-editor-tabs')
        expect(group.attributes('role')).toBe('group')
        expect(group.attributes('aria-label')).toBe(t('editorUi.llmWikiPanel.editorTabsLabel'))
    })

    it('点击预览切换激活态并持久化到 localStorage', async () => {
        const wrapper = mount(LlmWikiEditorTabs)
        await wrapper.find('.llm-wiki-editor-tab[data-tab="preview"]').trigger('click')
        await nextTick()

        expect(
            wrapper.find('.llm-wiki-editor-tab[data-tab="preview"]').attributes('aria-pressed')
        ).toBe('true')
        expect(wrapper.find('.llm-wiki-editor-tab[data-tab="editor"]').classes()).not.toContain(
            'is-active'
        )
        expect(window.localStorage.getItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)).toBe('preview')

        await wrapper.find('.llm-wiki-editor-tab[data-tab="editor"]').trigger('click')
        await nextTick()
        expect(window.localStorage.getItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)).toBe('editor')
    })
})
