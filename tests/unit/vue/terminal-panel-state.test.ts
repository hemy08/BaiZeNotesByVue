// @vitest-environment jsdom
/**
 * 1.5.7 终端工具（阶段 B）：右侧终端面板 UI 状态（可见 / 收起 / 宽度 / 右侧面板互斥）。
 *
 * 覆盖：
 * 1. 默认值（visible=false / collapsed=false / width=360 / active='ai'）；
 * 2. localStorage 宽度持久化：读取恢复、非法值回落、写入异常降级；
 * 3. 宽度归一化与夹取（非负整数、0 合法、损坏值回落默认）；
 * 4. 打开 / 关闭 / 收起切换语义（收起会话保留：visible 不变）；
 * 5. 与 AI 面板的互斥助手：activateRightPanel 只切右侧归属，不改写 AI 状态；
 * 6. 测试重置接口清理内存状态与持久化键。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    TERMINAL_PANEL_WIDTH,
    TERMINAL_PANEL_WIDTH_STORAGE_KEY,
    activateRightPanel,
    closeTerminalPanel,
    ensureTerminalPanelStateLoaded,
    normalizeTerminalPanelWidth,
    openTerminalPanel,
    resetTerminalPanelStateForTesting,
    resetTerminalPanelWidth,
    setTerminalPanelWidth,
    terminalPanelState,
    toggleTerminalCollapsed
} from '../../../src/renderer/src/components/terminal/terminal-panel-state'

beforeEach(() => {
    window.localStorage.clear()
    resetTerminalPanelStateForTesting()
})

afterEach(() => {
    resetTerminalPanelStateForTesting()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
})

describe('terminal-panel-state 默认值与归一化', () => {
    it('未持久化时：面板未打开、未收起、宽度 360、右侧默认由 AI 面板占据', () => {
        ensureTerminalPanelStateLoaded()
        expect(terminalPanelState.visible).toBe(false)
        expect(terminalPanelState.collapsed).toBe(false)
        expect(terminalPanelState.width).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(terminalPanelState.active).toBe('ai')
        // 宽度默认值常量保持 360（与 AI 面板默认宽度一致）
        expect(TERMINAL_PANEL_WIDTH).toEqual({ DEFAULT: 360 })
    })

    it('normalizeTerminalPanelWidth：接受数字/数字字符串，非负整数，损坏值回落默认', () => {
        expect(normalizeTerminalPanelWidth(420)).toBe(420)
        expect(normalizeTerminalPanelWidth('420')).toBe(420)
        expect(normalizeTerminalPanelWidth(' 380 ')).toBe(380)
        // 0 合法（面板宽度 0，仍可再拖回）
        expect(normalizeTerminalPanelWidth(0)).toBe(0)
        // 负宽度归一化为 0
        expect(normalizeTerminalPanelWidth(-120)).toBe(0)
        expect(normalizeTerminalPanelWidth('-120')).toBe(0)
        // 四舍五入到整数 px（拖拽坐标可能带小数）
        expect(normalizeTerminalPanelWidth(320.6)).toBe(321)
        // 损坏值：回落默认宽度
        expect(normalizeTerminalPanelWidth(Number.NaN)).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(normalizeTerminalPanelWidth(Number.POSITIVE_INFINITY)).toBe(
            TERMINAL_PANEL_WIDTH.DEFAULT
        )
        expect(normalizeTerminalPanelWidth('garbage')).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(normalizeTerminalPanelWidth(null)).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(normalizeTerminalPanelWidth(undefined)).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(normalizeTerminalPanelWidth('')).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(normalizeTerminalPanelWidth({ width: 400 })).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
    })

    it('localStorage 读取异常时回落默认宽度且不抛错', () => {
        const getItemSpy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
            throw new Error('storage blocked')
        })
        expect(() => ensureTerminalPanelStateLoaded()).not.toThrow()
        expect(terminalPanelState.width).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        getItemSpy.mockRestore()
    })

    it('无 window 的极端环境（typeof window === undefined）读写安全降级', () => {
        vi.stubGlobal('window', undefined)
        expect(() => ensureTerminalPanelStateLoaded()).not.toThrow()
        expect(terminalPanelState.width).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(() => openTerminalPanel()).not.toThrow()
        expect(terminalPanelState.visible).toBe(true)
        expect(() => setTerminalPanelWidth(420)).not.toThrow()
        expect(terminalPanelState.width).toBe(420)
        expect(() => resetTerminalPanelWidth()).not.toThrow()
        expect(terminalPanelState.width).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(() => resetTerminalPanelStateForTesting()).not.toThrow()
        vi.unstubAllGlobals()
    })
})

describe('terminal-panel-state 宽度持久化与恢复', () => {
    it('从 localStorage 恢复宽度（只能存字符串）；损坏值回落默认', () => {
        window.localStorage.setItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY, '480')
        ensureTerminalPanelStateLoaded()
        expect(terminalPanelState.width).toBe(480)

        resetTerminalPanelStateForTesting()
        window.localStorage.setItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY, 'not-a-width')
        ensureTerminalPanelStateLoaded()
        expect(terminalPanelState.width).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
    })

    it('setTerminalPanelWidth 归一化并持久化；重复设置不重复写', () => {
        setTerminalPanelWidth(420)
        expect(terminalPanelState.width).toBe(420)
        expect(window.localStorage.getItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY)).toBe('420')

        setTerminalPanelWidth(0)
        expect(terminalPanelState.width).toBe(0)
        expect(window.localStorage.getItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY)).toBe('0')

        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem')
        setTerminalPanelWidth(0)
        expect(setItemSpy).not.toHaveBeenCalled()
        setItemSpy.mockRestore()
    })

    it('resetTerminalPanelWidth 恢复默认 360 并持久化', () => {
        setTerminalPanelWidth(500)
        resetTerminalPanelWidth()
        expect(terminalPanelState.width).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(window.localStorage.getItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY)).toBe('360')
    })

    it('localStorage 写入异常（配额/隐私模式）时内存状态仍生效且不抛错', () => {
        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
            throw new Error('quota exceeded')
        })
        expect(() => setTerminalPanelWidth(450)).not.toThrow()
        expect(terminalPanelState.width).toBe(450)
        expect(() => resetTerminalPanelWidth()).not.toThrow()
        expect(terminalPanelState.width).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        setItemSpy.mockRestore()
    })

    it('resetTerminalPanelStateForTesting 清除内存状态与持久化键', () => {
        openTerminalPanel()
        setTerminalPanelWidth(420)
        resetTerminalPanelStateForTesting()
        expect(terminalPanelState.visible).toBe(false)
        expect(terminalPanelState.collapsed).toBe(false)
        expect(terminalPanelState.width).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(terminalPanelState.active).toBe('ai')
        expect(window.localStorage.getItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY)).toBeNull()
    })
})

describe('terminal-panel-state 打开 / 关闭 / 收起与右侧互斥', () => {
    it('openTerminalPanel：可见 + 展开 + 右侧切到终端（会先恢复持久化宽度）', () => {
        window.localStorage.setItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY, '440')
        openTerminalPanel()
        expect(terminalPanelState.visible).toBe(true)
        expect(terminalPanelState.collapsed).toBe(false)
        expect(terminalPanelState.active).toBe('terminal')
        expect(terminalPanelState.width).toBe(440)
    })

    it('toggleTerminalCollapsed：未打开时等价打开；已打开时收起（会话保留 visible=true）再展开', () => {
        toggleTerminalCollapsed()
        expect(terminalPanelState.visible).toBe(true)
        expect(terminalPanelState.collapsed).toBe(false)
        expect(terminalPanelState.active).toBe('terminal')

        toggleTerminalCollapsed()
        expect(terminalPanelState.visible).toBe(true)
        expect(terminalPanelState.collapsed).toBe(true)

        // 收起态仍占据右侧归属（入口点击展开时无需再次切换 active），再次切换仅展开
        toggleTerminalCollapsed()
        expect(terminalPanelState.visible).toBe(true)
        expect(terminalPanelState.collapsed).toBe(false)
        expect(terminalPanelState.active).toBe('terminal')
    })

    it('activateRightPanel(ai)：只切右侧归属，不改写终端可见/收起与 AI 持久化状态', () => {
        openTerminalPanel()
        setTerminalPanelWidth(410)
        activateRightPanel('ai')
        expect(terminalPanelState.active).toBe('ai')
        // 终端状态本身保持（是否卸载由布局层按 active 决定），宽度偏好不丢
        expect(terminalPanelState.visible).toBe(true)
        expect(terminalPanelState.collapsed).toBe(false)
        expect(terminalPanelState.width).toBe(410)
    })

    it('activateRightPanel(terminal) 等价于打开终端（可见 + 展开 + active=terminal）', () => {
        activateRightPanel('terminal')
        expect(terminalPanelState.active).toBe('terminal')
        expect(terminalPanelState.visible).toBe(true)
        expect(terminalPanelState.collapsed).toBe(false)
    })

    it('closeTerminalPanel：清可见/收起状态，右侧回落 AI；active 已是 ai 时保持不变', () => {
        openTerminalPanel()
        closeTerminalPanel()
        expect(terminalPanelState.visible).toBe(false)
        expect(terminalPanelState.collapsed).toBe(false)
        expect(terminalPanelState.active).toBe('ai')

        // 再次关闭（已经是 ai）：不产生额外状态变化
        closeTerminalPanel()
        expect(terminalPanelState.active).toBe('ai')
        expect(terminalPanelState.visible).toBe(false)
    })

    it('打开终端不修改 AI 面板状态真源（llm-wiki-workbench 状态保持原样）', async () => {
        const {
            llmWikiWorkbenchState,
            resetLlmWikiWorkbenchStateForTesting,
            setLlmWikiAiPanelWidth,
            setLlmWikiAiPanelCollapsed
        } = await import('../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench')
        resetLlmWikiWorkbenchStateForTesting()
        setLlmWikiAiPanelCollapsed(true)
        setLlmWikiAiPanelWidth(480)

        openTerminalPanel()

        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(480)
        // 打开终端只隐藏 AI 面板容器的显示，不改写其持久化状态
        resetLlmWikiWorkbenchStateForTesting()
    })
})
