// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki 工作台 UI 状态（AI 面板折叠 / AI 面板宽度）持久化。
 *
 * 1.5.7 体验微调（批次 A5）：原「编辑区单栏 tab」状态（`editorTab` /
 * `baize:llm-wiki:editor-tab`）已被统一三态视图真源
 * （`components/Markdown/workspace-layout` 的 `currentWorkspaceLayout.viewMode`）取代并删除；
 * 本模块只保留 AI 面板收起 / 宽度这两项工作台状态。
 *
 * 覆盖：默认值、localStorage 容错读取（损坏值/存储异常）、写入与恢复、重置接口、
 * 旧 tab 状态删除的回归契约。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY,
    LLM_WIKI_AI_PANEL_WIDTH,
    LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY,
    clampLlmWikiAiPanelWidth,
    ensureLlmWikiAiPanelExpanded,
    ensureLlmWikiWorkbenchStateLoaded,
    llmWikiWorkbenchState,
    normalizeLlmWikiAiPanelWidth,
    resetLlmWikiAiPanelWidth,
    resetLlmWikiWorkbenchStateForTesting,
    setLlmWikiAiPanelCollapsed,
    setLlmWikiAiPanelWidth,
    toggleLlmWikiAiPanelCollapsed
} from '../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench'

/** 旧「编辑区 tab」持久化键（A5 起已删除，仅用于回归断言） */
const LEGACY_EDITOR_TAB_STORAGE_KEY = 'baize:llm-wiki:editor-tab'

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
    it('未持久化时 AI 面板展开且宽度未自定义', () => {
        ensureLlmWikiWorkbenchStateLoaded()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        // null = 未自定义宽度：布局层按窗口宽度分档取默认值
        expect(llmWikiWorkbenchState.aiPanelWidth).toBeNull()
    })

    it('旧「编辑区 tab」状态已被统一 viewMode 取代并删除（无字段、无持久化键、无写入路径）', async () => {
        const module =
            (await import('../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench')) as typeof import('../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench')
        expect('editorTab' in module.llmWikiWorkbenchState).toBe(false)
        expect('LLM_WIKI_EDITOR_TAB_STORAGE_KEY' in module).toBe(false)
        expect('LLM_WIKI_EDITOR_TAB' in module).toBe(false)
        expect('DEFAULT_LLM_WIKI_EDITOR_TAB' in module).toBe(false)
        expect('normalizeLlmWikiEditorTab' in module).toBe(false)
        expect('setLlmWikiEditorTab' in module).toBe(false)

        ensureLlmWikiWorkbenchStateLoaded()
        toggleLlmWikiAiPanelCollapsed()
        setLlmWikiAiPanelWidth(420)
        expect(window.localStorage.getItem(LEGACY_EDITOR_TAB_STORAGE_KEY)).toBeNull()
    })

    it('localStorage 读取异常时回落默认且不抛错', () => {
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage blocked')
        })
        expect(() => ensureLlmWikiWorkbenchStateLoaded()).not.toThrow()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        getItemSpy.mockRestore()
    })

    it('localStorage 写入异常（配额/隐私模式）时内存状态仍生效且不抛错', () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded')
        })
        expect(() => toggleLlmWikiAiPanelCollapsed()).not.toThrow()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        setItemSpy.mockRestore()
    })

    it('无 window 的极端环境（typeof window === undefined）读写安全降级', () => {
        vi.stubGlobal('window', undefined)
        expect(() => ensureLlmWikiWorkbenchStateLoaded()).not.toThrow()
        expect(llmWikiWorkbenchState.aiPanelWidth).toBeNull()
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
    it('切换 AI 面板折叠写入 localStorage', () => {
        toggleLlmWikiAiPanelCollapsed()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('true')

        toggleLlmWikiAiPanelCollapsed()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('false')
    })

    it('新模块实例从 localStorage 恢复上次状态（模拟重启后恢复）', async () => {
        window.localStorage.setItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY, 'true')
        window.localStorage.setItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY, '420')
        vi.resetModules()
        const fresh =
            (await import('../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench')) as typeof import('../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench')
        fresh.ensureLlmWikiWorkbenchStateLoaded()
        expect(fresh.llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(fresh.llmWikiWorkbenchState.aiPanelWidth).toBe(420)
    })

    it('resetLlmWikiWorkbenchStateForTesting 清除内存状态与持久化键', () => {
        toggleLlmWikiAiPanelCollapsed()
        setLlmWikiAiPanelWidth(420)
        resetLlmWikiWorkbenchStateForTesting()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(llmWikiWorkbenchState.aiPanelWidth).toBeNull()
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBeNull()
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBeNull()
    })
})

describe('llm-wiki-workbench AI 面板宽度（split 拖拽）状态', () => {
    it('clampLlmWikiAiPanelWidth：无固定上下限，仅归一化为非负整数；非有限数值回落默认宽度', () => {
        // 1.5.7 体验微调：移除固定上下限（原 MIN 240 / MAX 560），只保留默认宽度常量
        expect(LLM_WIKI_AI_PANEL_WIDTH).toEqual({ DEFAULT: 360 })
        expect(clampLlmWikiAiPanelWidth(320)).toBe(320)
        // 小宽度合法（面板可缩到 0；0 = 面板不可见但保留挂载、可再拖回）
        expect(clampLlmWikiAiPanelWidth(100)).toBe(100)
        expect(clampLlmWikiAiPanelWidth(0)).toBe(0)
        // 大宽度保留为用户偏好（实际渲染宽度由布局层按可用宽度夹取）
        expect(clampLlmWikiAiPanelWidth(9999)).toBe(9999)
        // 负宽度归一化为 0
        expect(clampLlmWikiAiPanelWidth(-120)).toBe(0)
        // 四舍五入到整数 px（拖拽 mouse 坐标可能带小数）
        expect(clampLlmWikiAiPanelWidth(320.6)).toBe(321)
        expect(clampLlmWikiAiPanelWidth(Number.NaN)).toBe(LLM_WIKI_AI_PANEL_WIDTH.DEFAULT)
        expect(clampLlmWikiAiPanelWidth(Number.POSITIVE_INFINITY)).toBe(
            LLM_WIKI_AI_PANEL_WIDTH.DEFAULT
        )
    })

    it('normalizeLlmWikiAiPanelWidth：接受数字/数字字符串，负数归零，损坏值回落 null', () => {
        expect(normalizeLlmWikiAiPanelWidth(420)).toBe(420)
        expect(normalizeLlmWikiAiPanelWidth('420')).toBe(420)
        expect(normalizeLlmWikiAiPanelWidth(' 380 ')).toBe(380)
        // 无固定上限：大整数保留（挂载/窗口 resize 时按可用宽度夹取）
        expect(normalizeLlmWikiAiPanelWidth('9999')).toBe(9999)
        // 负数归一化为 0（面板不可见但保留挂载）
        expect(normalizeLlmWikiAiPanelWidth('-120')).toBe(0)
        // 缺失/损坏值 = 未自定义（null）
        expect(normalizeLlmWikiAiPanelWidth(null)).toBeNull()
        expect(normalizeLlmWikiAiPanelWidth(undefined)).toBeNull()
        expect(normalizeLlmWikiAiPanelWidth('')).toBeNull()
        expect(normalizeLlmWikiAiPanelWidth('not-a-width')).toBeNull()
        expect(normalizeLlmWikiAiPanelWidth({ width: 400 })).toBeNull()
    })

    it('setLlmWikiAiPanelWidth 归一化并持久化；重复设置不重复写', () => {
        setLlmWikiAiPanelWidth(420)
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(420)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('420')

        // 无固定下限：小宽度不再被抬到 240
        setLlmWikiAiPanelWidth(100)
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(100)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('100')

        // 0 合法（面板缩到 0 但仍挂载，可再拖回）
        setLlmWikiAiPanelWidth(0)
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(0)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('0')

        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
        setLlmWikiAiPanelWidth(0)
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

describe('llm-wiki-workbench AI 面板可见性切换（边栏入口 / 工具条共用）', () => {
    it('setLlmWikiAiPanelCollapsed 显式设置折叠态并持久化；无变化时不重复写', () => {
        setLlmWikiAiPanelCollapsed(true)
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('true')

        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
        setLlmWikiAiPanelCollapsed(true)
        expect(setItemSpy).not.toHaveBeenCalled()
        setItemSpy.mockRestore()

        setLlmWikiAiPanelCollapsed(false)
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('false')
    })

    it('ensureLlmWikiAiPanelExpanded 在收起态下展开并持久化（工作区模式切换成功后调用）', () => {
        setLlmWikiAiPanelCollapsed(true)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('true')

        ensureLlmWikiAiPanelExpanded()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('false')
    })

    it('ensureLlmWikiAiPanelExpanded 幂等：已展开时不再写 localStorage', () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
        ensureLlmWikiAiPanelExpanded()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(setItemSpy).not.toHaveBeenCalled()
        setItemSpy.mockRestore()
    })
})
