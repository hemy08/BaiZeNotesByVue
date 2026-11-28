// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki L5 / T5.1：工作台布局切换（WorkSpace）。
 *
 * 覆盖：
 * 1. traditional 模式：布局零变化（无编辑区 tab、无右侧 AI 面板、编辑区宽度沿用既有口径）；
 * 2. llm-wiki 模式：编辑区渲染「编辑器 / 预览」分段控件、右侧渲染 LlmAiPanel、
 *    编辑区宽度扣除 AI 面板宽度；
 * 3. tab 切换持久化（localStorage `baize:llm-wiki:editor-tab`）；
 * 4. AI 面板手动折叠（宽度收为 48px 侧栏）与窄窗口自动折叠（can-expand=false）；
 * 5. 切到其它工作区容器时 AI 面板隐藏（v-show 保留实例），返回编辑区后恢复。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import {
    resetLlmWikiWorkbenchStateForTesting,
    llmWikiWorkbenchState,
    LLM_WIKI_EDITOR_TAB_STORAGE_KEY
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
    it('不渲染编辑区 tab / 右侧 AI 面板，编辑区宽度沿用既有口径', async () => {
        wrapper = await mountWorkspace()

        expect(wrapper.find('.llm-wiki-editor-tabs').exists()).toBe(false)
        expect(wrapper.find('#llm-ai-panel-container').exists()).toBe(false)
        expect(wrapper.findComponent(LlmAiPanel).exists()).toBe(false)
        // 1200 - 40*2 - 300 - 2 = 818
        expect(widthOf(wrapper, '#md-container')).toBe('818px')
        expect(wrapper.find('.md-container-stub').attributes('data-width')).toBe('818px')
    })
})

describe('WorkSpace 布局：llm-wiki 模式（单栏编辑 + 右侧 AI 面板）', () => {
    it('编辑区渲染编辑器/预览 tab，右侧渲染 LlmAiPanel，编辑区宽度扣除面板宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        setInnerWidth(1200)
        wrapper = await mountWorkspace()

        // 编辑区 tab：两个分段按钮
        const tabs = wrapper.findAll('.llm-wiki-editor-tab')
        expect(tabs).toHaveLength(2)
        expect(tabs[0].attributes('data-tab')).toBe('editor')
        expect(tabs[1].attributes('data-tab')).toBe('preview')
        // 默认编辑器 tab 选中
        expect(tabs[0].attributes('aria-pressed')).toBe('true')

        // 右侧 AI 面板：真实组件 + 展开宽度 360px（1200 > 1100 断点）
        expect(wrapper.find('#llm-ai-panel-container').exists()).toBe(true)
        expect(wrapper.findComponent(LlmAiPanel).exists()).toBe(true)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('360px')
        // 编辑区 = 818 - 360 = 458
        expect(widthOf(wrapper, '#md-container')).toBe('458px')
        expect(wrapper.find('.md-container-stub').attributes('data-width')).toBe('458px')
    })

    it('窄窗口（<= 1100）使用窄档面板宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        setInnerWidth(1000)
        wrapper = await mountWorkspace()

        // 1000 - 80 - 300 - 2 = 618；618 >= 320+240 不自动折叠；618-320=298 > 280 → 280
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('280px')
        expect(widthOf(wrapper, '#md-container')).toBe('338px')
    })

    it('窄于「最小编辑区 + 最小展开面板」时 AI 面板自动折叠为 48px 侧栏', async () => {
        testWorkspaceModeState.llmWiki = true
        setInnerWidth(900)
        wrapper = await mountWorkspace()

        // 900 - 80 - 300 - 2 = 518 < 560 → 自动折叠
        expect(wrapper.find('.llm-ai-panel--collapsed').exists()).toBe(true)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('48px')
        expect(widthOf(wrapper, '#md-container')).toBe('470px')
        // 自动折叠时不允许展开（提示加宽窗口）
        const expandButton = wrapper.find('.llm-ai-panel-expand')
        expect(expandButton.attributes('disabled')).toBeDefined()
    })

    it('点击 tab 切换编辑区视图并持久化', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        await wrapper.find('.llm-wiki-editor-tab[data-tab="preview"]').trigger('click')
        await flushPromises()

        expect(
            wrapper.find('.llm-wiki-editor-tab[data-tab="preview"]').attributes('aria-pressed')
        ).toBe('true')
        expect(llmWikiWorkbenchState.editorTab).toBe('preview')
        expect(window.localStorage.getItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)).toBe('preview')
    })

    it('手动折叠 AI 面板后面板宽度收为 48px，编辑区让出空间', async () => {
        testWorkspaceModeState.llmWiki = true
        setInnerWidth(1200)
        wrapper = await mountWorkspace()

        await wrapper.find('.llm-ai-panel-collapse').trigger('click')
        await flushPromises()

        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(wrapper.find('.llm-ai-panel--collapsed').exists()).toBe(true)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('48px')
        // 818 - 48 = 770
        expect(widthOf(wrapper, '#md-container')).toBe('770px')
    })

    it('切到插件容器时 AI 面板隐藏（v-show 保留实例），返回编辑区后恢复', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'plugins')
        await flushPromises()
        expect(wrapper.find('#md-container').isVisible()).toBe(false)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(false)

        await showMdContainer()
        expect(wrapper.find('#md-container').isVisible()).toBe(true)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(true)
        // 组件实例未被卸载（对话状态可保留）
        expect(wrapper.findComponent(LlmAiPanel).exists()).toBe(true)
    })
})
