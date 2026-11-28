// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki L5：工作台 UI 状态（编辑区 tab / AI 面板折叠）持久化。
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
    LLM_WIKI_EDITOR_TAB,
    LLM_WIKI_EDITOR_TAB_STORAGE_KEY,
    ensureLlmWikiWorkbenchStateLoaded,
    llmWikiWorkbenchState,
    normalizeLlmWikiEditorTab,
    resetLlmWikiWorkbenchStateForTesting,
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
    it('未持久化时默认编辑器 tab、AI 面板展开', () => {
        ensureLlmWikiWorkbenchStateLoaded()
        expect(llmWikiWorkbenchState.editorTab).toBe(DEFAULT_LLM_WIKI_EDITOR_TAB)
        expect(DEFAULT_LLM_WIKI_EDITOR_TAB).toBe(LLM_WIKI_EDITOR_TAB.EDITOR)
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
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
        expect(() => setLlmWikiEditorTab('preview')).not.toThrow()
        expect(llmWikiWorkbenchState.editorTab).toBe('preview')
        expect(() => toggleLlmWikiAiPanelCollapsed()).not.toThrow()
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
        vi.resetModules()
        const fresh =
            (await import('../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench')) as typeof import('../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench')
        fresh.ensureLlmWikiWorkbenchStateLoaded()
        expect(fresh.llmWikiWorkbenchState.editorTab).toBe('preview')
        expect(fresh.llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
    })

    it('resetLlmWikiWorkbenchStateForTesting 清除内存状态与持久化键', () => {
        setLlmWikiEditorTab('preview')
        toggleLlmWikiAiPanelCollapsed()
        resetLlmWikiWorkbenchStateForTesting()
        expect(llmWikiWorkbenchState.editorTab).toBe('editor')
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(window.localStorage.getItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)).toBeNull()
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBeNull()
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
