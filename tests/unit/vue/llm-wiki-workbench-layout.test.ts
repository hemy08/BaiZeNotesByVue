// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki 工作台布局（WorkSpace）——体验升级批次 A：
 * 「编辑区右上角切换（由 MarkdownEditComponent 承接）+ 右侧 AI 面板 + 可拖动 split」。
 *
 * 覆盖：
 * 1. traditional 模式：布局零变化（无右侧 AI 面板、无 split 分隔条、编辑区宽度沿用既有口径）；
 * 2. llm-wiki 模式：右侧渲染 LlmAiPanel、编辑区宽度扣除面板与分隔条宽度；
 * 3. split 拖动：实时改 AI 面板宽度、min/max 夹取（编辑区最小 320 / 面板 [240,560]）、
 *    mouseup 后解除 window 监听与持久化；
 * 4. 宽度持久化恢复、窗口 resize 夹取、折叠态/传统模式不渲染分隔条；
 * 5. 键盘 ←/→/Home/End 调整；双击分隔条 / 面板按钮恢复默认 360px；
 * 6. AI 面板手动折叠 / 窄窗口自动折叠；切到其它工作区容器时面板与分隔条隐藏。
 *
 * 说明：编辑区「编辑器 / 预览」分段控件已移到 MarkdownEditComponent 的编辑区右上角 dock，
 * 对应渲染/切换/持久化行为由 `markdown-edit-llm-wiki-layout.test.ts` 覆盖。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import * as fs from 'fs'
import * as path from 'path'
import {
    LLM_WIKI_AI_PANEL_WIDTH,
    LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY,
    resetLlmWikiWorkbenchStateForTesting,
    llmWikiWorkbenchState,
    setLlmWikiAiPanelWidth
} from '../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import WorkSpace from '@renderer/components/WorkSpaceArea/WorkSpace.vue'
import * as workspaceModeModule from '@renderer/composables/useWorkspaceMode'
import LlmAiPanel from '@renderer/components/llm-wiki/LlmAiPanel.vue'

// ============ 工作区模式 mock（测试内可切换 llm-wiki / traditional） ============
vi.mock('@renderer/composables/useWorkspaceMode', async () => {
    const { computed, reactive } = await import('vue')
    const state = reactive({ llmWiki: false })
    return {
        // 仅测试可见的开关（业务代码不消费）
        __testWorkspaceModeState: state,
        useWorkspaceMode: () => ({
            workspaceMode: computed(() => (state.llmWiki ? 'llm-wiki' : 'traditional')),
            isLlmWikiMode: computed(() => state.llmWiki)
        }),
        disposeWorkspaceModeListener: () => undefined
    }
})

/** 测试用工作区模式开关（与 mock 工厂共享同一 reactive state） */
const testWorkspaceModeState = (
    workspaceModeModule as unknown as {
        __testWorkspaceModeState: { llmWiki: boolean }
    }
).__testWorkspaceModeState

// ============ 子组件桩（只保留宽度 props 契约） ============
const MdContainerStub = defineComponent({
    name: 'MdContainerStub',
    props: { mdContainerWidth: { type: String, default: '' } },
    template: '<div class="md-container-stub" :data-width="mdContainerWidth" />'
})

const STUBS = {
    NaviTab: true,
    ResManager: true,
    MdContainer: MdContainerStub,
    PluginTools: true,
    HemyTools: true
}

let wrapper: VueWrapper | null = null
let ipcOnMock: ReturnType<typeof vi.fn>
let ipcRemoveListenerMock: ReturnType<typeof vi.fn>

/** 覆盖 jsdom 只读的 window.innerWidth，模拟真实窗口尺寸 */
function setInnerWidth(width: number): void {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: width
    })
}

/** 派发 window 级鼠标事件（分隔条拖拽监听挂在 window 上） */
function dispatchWindowMouse(type: 'mousemove' | 'mouseup', clientX = 0): void {
    window.dispatchEvent(new MouseEvent(type, { clientX }))
}

async function mountWorkspace(): Promise<VueWrapper> {
    const mounted = mount(WorkSpace, {
        global: { stubs: STUBS },
        attachTo: document.body
    })
    await flushPromises()
    return mounted
}

/** 元素内联宽度（px 字符串） */
function widthOf(mounted: VueWrapper, selector: string): string {
    const element = mounted.find(selector).element as HTMLElement | undefined
    return element ? element.style.width : ''
}

/** 面板宽度（数值 px） */
function panelWidthPx(mounted: VueWrapper): number {
    return parseInt(widthOf(mounted, '#llm-ai-panel-container'), 10) || 0
}

/** 执行对话/容器相关测试后回到编辑区，避免影响后续用例 */
async function showMdContainer(): Promise<void> {
    EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'md')
    await flushPromises()
}

beforeEach(() => {
    setInnerWidth(1200)
    testWorkspaceModeState.llmWiki = false
    window.localStorage.clear()
    resetLlmWikiWorkbenchStateForTesting()
    ipcOnMock = vi.fn()
    ipcRemoveListenerMock = vi.fn()
    vi.stubGlobal('electron', {
        ipcRenderer: { on: ipcOnMock, removeListener: ipcRemoveListenerMock }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

describe('WorkSpace 布局：traditional 模式零变化', () => {
    it('不渲染右侧 AI 面板与 split 分隔条，编辑区宽度沿用既有口径', async () => {
        wrapper = await mountWorkspace()

        expect(wrapper.find('#llm-ai-panel-container').exists()).toBe(false)
        expect(wrapper.findComponent(LlmAiPanel).exists()).toBe(false)
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(false)
        // 1200 - 40*2 - 300 - 2 = 818
        expect(widthOf(wrapper, '#md-container')).toBe('818px')
        expect(wrapper.find('.md-container-stub').attributes('data-width')).toBe('818px')
    })
})

describe('WorkSpace 布局：llm-wiki 模式（单栏编辑 + 右侧 AI 面板）', () => {
    it('右侧渲染 LlmAiPanel，编辑区宽度扣除面板与分隔条宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        setInnerWidth(1200)
        wrapper = await mountWorkspace()

        // 右侧 AI 面板：真实组件 + 默认展开宽度 360px（1200 > 1100 断点）
        expect(wrapper.find('#llm-ai-panel-container').exists()).toBe(true)
        expect(wrapper.findComponent(LlmAiPanel).exists()).toBe(true)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('360px')
        // 编辑区 = 818 - 360 - 5（分隔条）= 453
        expect(widthOf(wrapper, '#md-container')).toBe('453px')
        expect(wrapper.find('.md-container-stub').attributes('data-width')).toBe('453px')
        // 编辑区顶部不再有 tab 行（切换控件已移到编辑区右上角悬浮 dock）
        expect(wrapper.find('.llm-wiki-editor-tabs').exists()).toBe(false)
    })

    it('窄窗口（<= 1100）无自定义宽度时使用窄档默认面板宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        setInnerWidth(1000)
        wrapper = await mountWorkspace()

        // 1000 - 80 - 300 - 2 = 618；618 >= 320+240+5 不自动折叠；618-320-5=293 > 280 → 280
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('280px')
        expect(widthOf(wrapper, '#md-container')).toBe('333px')
    })

    it('窄于「最小编辑区 + 最小展开面板 + 分隔条」时 AI 面板自动折叠为 48px 侧栏', async () => {
        testWorkspaceModeState.llmWiki = true
        setInnerWidth(900)
        wrapper = await mountWorkspace()

        // 900 - 80 - 300 - 2 = 518 < 565 → 自动折叠
        expect(wrapper.find('.llm-ai-panel--collapsed').exists()).toBe(true)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('48px')
        expect(widthOf(wrapper, '#md-container')).toBe('470px')
        // 折叠态不渲染分隔条
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(false)
        // 自动折叠时不允许展开（提示加宽窗口）
        const expandButton = wrapper.find('.llm-ai-panel-expand')
        expect(expandButton.attributes('disabled')).toBeDefined()
    })

    it('手动折叠 AI 面板后面板宽度收为 48px，编辑区让出空间且分隔条消失', async () => {
        testWorkspaceModeState.llmWiki = true
        setInnerWidth(1200)
        wrapper = await mountWorkspace()
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(true)

        await wrapper.find('.llm-ai-panel-collapse').trigger('click')
        await flushPromises()

        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(wrapper.find('.llm-ai-panel--collapsed').exists()).toBe(true)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('48px')
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(false)
        // 818 - 48 = 770
        expect(widthOf(wrapper, '#md-container')).toBe('770px')
    })

    it('切到插件容器时 AI 面板与分隔条隐藏（v-show 保留实例），返回编辑区后恢复', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'plugins')
        await flushPromises()
        expect(wrapper.find('#md-container').isVisible()).toBe(false)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(false)
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(false)

        await showMdContainer()
        expect(wrapper.find('#md-container').isVisible()).toBe(true)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(true)
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(true)
        // 组件实例未被卸载（对话状态可保留）
        expect(wrapper.findComponent(LlmAiPanel).exists()).toBe(true)
    })
})

describe('WorkSpace split 分隔条：渲染与无障碍属性', () => {
    it('展开态渲染垂直分隔条：role/aria-orientation/tabindex/aria-value*', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        const splitter = wrapper.find('#llm-ai-splitter')
        expect(splitter.exists()).toBe(true)
        expect(splitter.attributes('role')).toBe('separator')
        expect(splitter.attributes('aria-orientation')).toBe('vertical')
        expect(splitter.attributes('tabindex')).toBe('0')
        expect(splitter.attributes('aria-controls')).toBe('llm-ai-panel-container')
        // 5px 热区（宽度由脚本常量单一真源绑定）
        expect((splitter.element as HTMLElement).style.width).toBe('5px')
        // 当前可用宽度下：maxByEditor = 818 - 320 - 5 = 493
        expect(splitter.attributes('aria-valuenow')).toBe('360')
        expect(splitter.attributes('aria-valuemin')).toBe('240')
        expect(splitter.attributes('aria-valuemax')).toBe('493')
        expect(splitter.attributes('title')).toBeTruthy()
    })

    it('静态契约：分隔条 4~6px 热区 / col-resize / hover 与 focus-visible 高亮走 --ui-* 令牌', () => {
        const source = fs.readFileSync(
            path.resolve(
                __dirname,
                '../../../src/renderer/src/components/WorkSpaceArea/WorkSpace.vue'
            ),
            'utf8'
        )
        const splitterBlock = source.slice(source.indexOf('.llm-ai-splitter {'))
        expect(splitterBlock).toContain('cursor: col-resize')
        expect(splitterBlock).toContain('flex: 0 0 auto')
        expect(splitterBlock).toContain('min-height: 0')
        // hover / 键盘聚焦高亮：强调色派生，不写死颜色
        const hoverBlock = source.slice(source.indexOf('.llm-ai-splitter:hover,'))
        expect(hoverBlock).toContain('var(--ui-accent-soft')
        expect(source).toContain('background-color: var(--ui-accent, var(--theme-accent-color))')
        expect(source).toContain('box-shadow: var(--ui-focus-shadow)')
        // 分隔条宽度符合 4~6px 热区要求（脚本常量）
        expect(source).toContain('const LLM_WIKI_SPLITTER_WIDTH = 5')
    })
})

describe('WorkSpace split 分隔条：鼠标拖动', () => {
    it('向左拖动 AI 面板变宽、编辑区让位；mouseup 后解除监听并持久化宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        const splitter = wrapper.find('#llm-ai-splitter')

        await splitter.trigger('mousedown', { clientX: 800 })
        dispatchWindowMouse('mousemove', 700)
        await flushPromises()

        // delta = 800 - 700 = 100 → 面板 460；编辑区 818 - 460 - 5 = 353
        expect(panelWidthPx(wrapper)).toBe(460)
        expect(widthOf(wrapper, '#md-container')).toBe('353px')
        // 拖动过程中不写 localStorage（mouseup 才持久化）
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBeNull()

        const removeSpy = vi.spyOn(window, 'removeEventListener')
        dispatchWindowMouse('mouseup')
        await flushPromises()
        expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
        expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('460')
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(460)

        // mouseup 已解绑：继续移动鼠标不再改变宽度
        dispatchWindowMouse('mousemove', 200)
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(460)
    })

    it('向左拖动超过最大宽度时夹取到「可用宽度 − 编辑区最小 320 − 分隔条」', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        await wrapper.find('#llm-ai-splitter').trigger('mousedown', { clientX: 800 })
        dispatchWindowMouse('mousemove', -2000)
        await flushPromises()

        // maxByEditor = 818 - 320 - 5 = 493，编辑区保持 320
        expect(panelWidthPx(wrapper)).toBe(493)
        expect(widthOf(wrapper, '#md-container')).toBe('320px')
        expect(wrapper.find('#llm-ai-splitter').attributes('aria-valuenow')).toBe('493')
    })

    it('向右拖动超过最小宽度时夹取到面板最小 240px', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        await wrapper.find('#llm-ai-splitter').trigger('mousedown', { clientX: 500 })
        dispatchWindowMouse('mousemove', 5000)
        await flushPromises()

        expect(panelWidthPx(wrapper)).toBe(LLM_WIKI_AI_PANEL_WIDTH.MIN)
        expect(widthOf(wrapper, '#md-container')).toBe('573px')
    })

    it('未按下分隔条时移动鼠标不改变宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        dispatchWindowMouse('mousemove', 100)
        await flushPromises()

        expect(panelWidthPx(wrapper)).toBe(360)
    })

    it('非左键按下分隔条不进入拖动态（button !== 0 防御分支）', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        const splitter = wrapper.find('#llm-ai-splitter').element as HTMLElement
        const addSpy = vi.spyOn(window, 'addEventListener')

        // 右键按下：startLlmWikiPanelResize 立即 return，不挂 window 监听、不改宽度
        splitter.dispatchEvent(
            new MouseEvent('mousedown', { button: 2, clientX: 800, bubbles: true })
        )
        await flushPromises()

        expect(addSpy).not.toHaveBeenCalledWith('mousemove', expect.any(Function))
        expect(addSpy).not.toHaveBeenCalledWith('mouseup', expect.any(Function))
        dispatchWindowMouse('mousemove', 700)
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(360)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBeNull()
    })

    it('拖动中键盘调整会清空临时宽度：后续 mousemove 被忽略、mouseup 不再写回', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        const splitter = wrapper.find('#llm-ai-splitter')

        await splitter.trigger('mousedown', { clientX: 800 })
        // 拖动中按 Home：applyLlmWikiAiPanelWidth 清空内存态临时宽度（window 监听仍在）
        await splitter.trigger('keydown', { key: 'Home' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(LLM_WIKI_AI_PANEL_WIDTH.MIN)

        // 临时宽度为 null → handleLlmPanelResizeMove 早退，拖动不再改写宽度
        dispatchWindowMouse('mousemove', 700)
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(LLM_WIKI_AI_PANEL_WIDTH.MIN)

        // 宽度为 null 时 mouseup：stopLlmPanelResize 跳过持久化，但仍摘除监听
        const removeSpy = vi.spyOn(window, 'removeEventListener')
        dispatchWindowMouse('mouseup')
        await flushPromises()
        expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
        expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
        // 保持 Home 已持久化的最小宽度，不被 null 宽度覆盖
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('240')
    })
})

describe('WorkSpace split 分隔条：持久化 / resize 夹取 / 恢复默认', () => {
    it('从 localStorage 恢复上次拖拽的面板宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        window.localStorage.setItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY, '420')
        wrapper = await mountWorkspace()

        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(420)
        expect(panelWidthPx(wrapper)).toBe(420)
        expect(widthOf(wrapper, '#md-container')).toBe('393px')
        expect(wrapper.find('#llm-ai-splitter').attributes('aria-valuenow')).toBe('420')
    })

    it('窗口 resize 时夹取可用宽度，但不覆盖用户保存的宽度偏好', async () => {
        testWorkspaceModeState.llmWiki = true
        setLlmWikiAiPanelWidth(LLM_WIKI_AI_PANEL_WIDTH.MAX)
        wrapper = await mountWorkspace()

        // 1200 宽：可用宽度 818 → 面板被夹取到 493（编辑区最小 320）
        expect(panelWidthPx(wrapper)).toBe(493)
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(560)

        // 窗口放大：恢复用户保存的 560
        setInnerWidth(1600)
        window.dispatchEvent(new Event('resize'))
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(560)

        // 窗口再缩小：再次夹取到可用上限
        setInnerWidth(1200)
        window.dispatchEvent(new Event('resize'))
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(493)
    })

    it('双击分隔条恢复默认 360px 并持久化', async () => {
        testWorkspaceModeState.llmWiki = true
        setLlmWikiAiPanelWidth(480)
        wrapper = await mountWorkspace()
        expect(panelWidthPx(wrapper)).toBe(480)

        await wrapper.find('#llm-ai-splitter').trigger('dblclick')
        await flushPromises()

        expect(panelWidthPx(wrapper)).toBe(LLM_WIKI_AI_PANEL_WIDTH.DEFAULT)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('360')
    })

    it('面板「恢复默认面板宽度」按钮同样恢复 360px', async () => {
        testWorkspaceModeState.llmWiki = true
        setLlmWikiAiPanelWidth(500)
        wrapper = await mountWorkspace()

        await wrapper.find('.llm-ai-panel-reset-width').trigger('click')
        await flushPromises()

        expect(panelWidthPx(wrapper)).toBe(LLM_WIKI_AI_PANEL_WIDTH.DEFAULT)
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(LLM_WIKI_AI_PANEL_WIDTH.DEFAULT)
    })
})

describe('WorkSpace split 分隔条：键盘调整', () => {
    it('← 变宽 / → 变窄各 16px，并持久化', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        const splitter = wrapper.find('#llm-ai-splitter')

        await splitter.trigger('keydown', { key: 'ArrowLeft' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(376)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('376')

        await splitter.trigger('keydown', { key: 'ArrowRight' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(360)
    })

    it('键盘调整同样受 min/max 夹取（Home 最小 / End 最大）', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        const splitter = wrapper.find('#llm-ai-splitter')

        await splitter.trigger('keydown', { key: 'Home' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(LLM_WIKI_AI_PANEL_WIDTH.MIN)
        expect(widthOf(wrapper, '#md-container')).toBe('573px')

        await splitter.trigger('keydown', { key: 'End' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(493)
        expect(widthOf(wrapper, '#md-container')).toBe('320px')
    })

    it('输入法组合态 keydown（isComposing）不调整宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        const splitter = wrapper.find('#llm-ai-splitter').element as HTMLElement

        const composing = new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })
        Object.defineProperty(composing, 'isComposing', { configurable: true, value: true })
        splitter.dispatchEvent(composing)
        await flushPromises()

        expect(panelWidthPx(wrapper)).toBe(360)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBeNull()
    })

    it('其它按键（非方向键/Home/End）不调整宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        const splitter = wrapper.find('#llm-ai-splitter')

        await splitter.trigger('keydown', { key: 'Tab' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(360)

        await splitter.trigger('keydown', { key: 'Enter' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(360)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBeNull()
    })
})

describe('WorkSpace split：折叠态与展开态切换', () => {
    it('手动折叠再展开：恢复折叠前的持久化宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        setLlmWikiAiPanelWidth(440)
        wrapper = await mountWorkspace()
        expect(panelWidthPx(wrapper)).toBe(440)

        await wrapper.find('.llm-ai-panel-collapse').trigger('click')
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(48)

        await wrapper.find('.llm-ai-panel-expand').trigger('click')
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(440)
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(true)
    })
})

describe('WorkSpace 布局：可用宽度解析防御分支', () => {
    it('容器可用宽度解析为 0 时按 0 处理（parseInt 结果 falsy 的兜底）', async () => {
        testWorkspaceModeState.llmWiki = true
        // 382 - 40*2 - 300 - 2 = 0 → workAreaWidth = '0px'，parseInt 结果为 0（falsy）
        setInnerWidth(382)
        wrapper = await mountWorkspace()

        // 可用宽度 0 < 320+240+5 → 自动折叠为 48px 侧栏；编辑区宽度被夹取到 0 而不是负数
        expect(wrapper.find('.llm-ai-panel--collapsed').exists()).toBe(true)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('48px')
        expect(widthOf(wrapper, '#md-container')).toBe('0px')
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(false)
    })
})
