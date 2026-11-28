// @vitest-environment jsdom
/**
 * 1.5.7 终端工具（阶段 B）：WorkSpace 右侧边栏终端入口 + 终端面板布局 + 与 AI 面板互斥。
 *
 * 覆盖：
 * 1. 传统模式 / LLM Wiki 模式下右侧边栏终端入口都显示（编辑区可见时），非编辑区容器隐藏；
 * 2. 点击入口打开终端面板（右侧停靠、宽度默认 360、编辑区让位 = 可用宽度 − 面板 − 分隔条）；
 * 3. 与 AI 面板互斥：打开终端时 AI 面板容器隐藏但收起/宽度持久化状态不变，切回 AI 时
 *    终端容器卸载（回收 pty）、AI 面板恢复；LLM Wiki 模式默认仍展示 AI 面板；
 * 4. 收起/展开：面板头部收起 → 容器隐藏且宽度 0（组件仍挂载、会话保留）、入口回到右侧边栏；
 * 5. 分离条：拖动 / 键盘 ←→±16 / Home 0 / End 最大 / 双击复位 360，宽度持久化；
 * 6. 宽度按可用宽度夹取（持久化超宽值渲染时夹取、偏好不覆盖）；
 * 7. 工作区模式切换成功后右侧交还 AI 面板（watch 接线）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import WorkSpace from '@renderer/components/WorkSpaceArea/WorkSpace.vue'
import * as workspaceModeModule from '@renderer/composables/useWorkspaceMode'
import * as workspaceModeSwitchModule from '@renderer/composables/useWorkspaceModeSwitch'
import {
    TERMINAL_PANEL_WIDTH,
    TERMINAL_PANEL_WIDTH_STORAGE_KEY,
    resetTerminalPanelStateForTesting,
    terminalPanelState
} from '../../../src/renderer/src/components/terminal/terminal-panel-state'
import {
    resetLlmWikiWorkbenchStateForTesting,
    setLlmWikiAiPanelWidth,
    llmWikiWorkbenchState
} from '../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench'
import { t } from '../../../src/renderer/src/common/i18n'

// ============ 工作区模式 mock（测试内可切换 llm-wiki / traditional） ============
vi.mock('@renderer/composables/useWorkspaceMode', async () => {
    const { computed, reactive } = await import('vue')
    const state = reactive({ llmWiki: false })
    return {
        __testWorkspaceModeState: state,
        useWorkspaceMode: () => ({
            workspaceMode: computed(() => (state.llmWiki ? 'llm-wiki' : 'traditional')),
            isLlmWikiMode: computed(() => state.llmWiki)
        }),
        disposeWorkspaceModeListener: () => undefined
    }
})

// ============ 工作区模式切换 mock（入口点击断言 requestSwitchToLlmWiki） ============
vi.mock('@renderer/composables/useWorkspaceModeSwitch', async () => {
    const { reactive } = await import('vue')
    const state = reactive({ visible: false, busy: false })
    return {
        workspaceModeSwitchState: state,
        requestSwitchToLlmWiki: vi.fn(),
        switchToTraditional: vi.fn(),
        confirmSwitchToLlmWiki: vi.fn(),
        cancelWorkspaceModeSwitch: vi.fn()
    }
})

// ============ 迁移弹窗桩（异步组件消费，需 __esModule 标记） ============
vi.mock('@renderer/components/dialogs/simple/MigrationWizardDialog.vue', async () => {
    const { defineComponent } = await import('vue')
    return {
        __esModule: true,
        // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：对话框自身行为由专门用例覆盖
        default: defineComponent({
            name: 'MigrationWizardDialogStub',
            template: '<div class="migration-wizard-dialog-stub" />'
        })
    }
})

// ============ AI 面板桩（只保留收起事件；避免加载真实面板依赖） ============
vi.mock('@renderer/components/llm-wiki/LlmAiPanel.vue', async () => {
    const { defineComponent, h: render } = await import('vue')
    return {
        __esModule: true,
        // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：仅保留收起事件契约，隔离真实 AI 面板依赖
        default: defineComponent({
            name: 'LlmAiPanelStub',
            props: {
                documentName: { type: String, default: '' },
                selectionText: { type: String, default: '' },
                collapsed: { type: Boolean, default: false }
            },
            emits: ['toggle-collapse', 'reset-width'],
            setup(_props, { emit }) {
                return () =>
                    render('div', { class: 'llm-ai-panel-stub' }, [
                        render('button', {
                            class: 'llm-ai-panel-collapse',
                            onClick: () => emit('toggle-collapse')
                        })
                    ])
            }
        })
    }
})

// ============ 终端面板桩（异步组件消费，需 __esModule 标记） ============
vi.mock('@renderer/components/terminal/TerminalPanel.vue', async () => {
    const { defineComponent, h: render } = await import('vue')
    return {
        __esModule: true,
        // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：仅保留收起事件契约，避免加载真实 xterm 依赖
        default: defineComponent({
            name: 'TerminalPanelStub',
            emits: ['toggle-collapse'],
            setup(_props, { emit }) {
                return () =>
                    render('div', { class: 'terminal-panel-stub' }, [
                        render('button', {
                            class: 'terminal-panel-stub-collapse',
                            onClick: () => emit('toggle-collapse')
                        })
                    ])
            }
        })
    }
})

// ============ 其余子组件最小桩（只保留宽度 props 契约） ============
// eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：仅保留 mdContainerWidth props 契约
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

const testWorkspaceModeState = (
    workspaceModeModule as unknown as { __testWorkspaceModeState: { llmWiki: boolean } }
).__testWorkspaceModeState

const workspaceModeSwitchMock = workspaceModeSwitchModule as unknown as {
    requestSwitchToLlmWiki: ReturnType<typeof vi.fn>
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
    await flushPromises()
    return mounted
}

/** 元素内联宽度（px 字符串） */
function widthOf(mounted: VueWrapper, selector: string): string {
    const element = mounted.find(selector).element as HTMLElement | undefined
    return element ? element.style.width : ''
}

/** 面板宽度（数值 px） */
function terminalPanelWidthPx(mounted: VueWrapper): number {
    return parseInt(widthOf(mounted, '#terminal-panel-container'), 10) || 0
}

/** 执行容器相关测试后回到编辑区，避免影响后续用例 */
async function showMdContainer(): Promise<void> {
    EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'md')
    await flushPromises()
}

/** 打开终端面板（右侧边栏入口） */
async function openTerminalFromSidebar(mounted: VueWrapper): Promise<void> {
    await mounted.find('#terminal-sidebar-entry').trigger('click')
    await flushPromises()
    await flushPromises()
}

beforeEach(() => {
    setInnerWidth(1200)
    testWorkspaceModeState.llmWiki = false
    window.localStorage.clear()
    resetTerminalPanelStateForTesting()
    resetLlmWikiWorkbenchStateForTesting()
    workspaceModeSwitchMock.requestSwitchToLlmWiki.mockClear()
    ipcOnMock = vi.fn()
    ipcRemoveListenerMock = vi.fn()
    vi.stubGlobal('electron', {
        ipcRenderer: { on: ipcOnMock, removeListener: ipcRemoveListenerMock }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    resetTerminalPanelStateForTesting()
    resetLlmWikiWorkbenchStateForTesting()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

describe('WorkSpace 右侧边栏终端入口：显示条件', () => {
    it('传统模式：编辑区可见时显示终端入口（纯图标按钮 + i18n title/aria-label）', async () => {
        wrapper = await mountWorkspace()

        const entry = wrapper.find('#right-navi #terminal-sidebar-entry')
        expect(entry.exists()).toBe(true)
        expect(entry.element.tagName).toBe('BUTTON')
        expect(entry.attributes('type')).toBe('button')
        expect(entry.attributes('title')).toBe(t('editorUi.terminalPanel.entryTitle'))
        expect(entry.attributes('aria-label')).toBe(t('editorUi.terminalPanel.entryAriaLabel'))
        // 面板尚未打开（容器不存在）时不关联 aria-controls 目标（与 AI 入口同口径）
        expect(entry.attributes('aria-controls')).toBeUndefined()
        // 图标为 24 网格 stroke 1.5（无 emoji / 无位图资产）
        const svg = entry.find('svg')
        expect(svg.attributes('viewBox')).toBe('0 0 24 24')
        expect(svg.attributes('stroke-width')).toBe('1.5')
        expect(svg.attributes('stroke')).toBe('currentColor')
        // 入口不占编辑区宽度
        expect(widthOf(wrapper, '#md-container')).toBe('818px')
        // 未打开面板：容器不渲染
        expect(wrapper.find('#terminal-panel-container').exists()).toBe(false)
    })

    it('LLM Wiki 模式：默认 AI 面板展开时也显示终端入口（两模式都可用）', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(true)
        expect(wrapper.find('#terminal-sidebar-entry').exists()).toBe(true)
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
    })

    it('非编辑区容器（插件/工具/HTML/PDF）时两个入口一致隐藏，返回编辑区恢复', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        for (const container of ['plugins', 'tools']) {
            EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, container)
            await flushPromises()
            expect(wrapper.find('#terminal-sidebar-entry').exists(), container).toBe(false)
            expect(wrapper.find('#llm-ai-sidebar-entry').exists(), container).toBe(false)
        }

        await showMdContainer()
        expect(wrapper.find('#terminal-sidebar-entry').exists()).toBe(true)
    })
})

describe('WorkSpace 终端面板：打开 / 布局 / 分隔条（传统模式）', () => {
    it('点击入口打开：右侧渲染终端面板 360px、编辑区让位、入口隐藏、分隔条无障碍属性', async () => {
        wrapper = await mountWorkspace()
        await openTerminalFromSidebar(wrapper)

        expect(terminalPanelState.visible).toBe(true)
        expect(terminalPanelState.active).toBe('terminal')
        expect(wrapper.find('#terminal-panel-container').exists()).toBe(true)
        expect(wrapper.find('#terminal-panel-container').isVisible()).toBe(true)
        expect(wrapper.find('.terminal-panel-stub').exists()).toBe(true)
        expect(terminalPanelWidthPx(wrapper)).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        // 编辑区 = 818 − 360 − 5 = 453
        expect(widthOf(wrapper, '#md-container')).toBe('453px')
        // 面板显示时入口隐藏（收起按钮在面板头部）
        expect(wrapper.find('#terminal-sidebar-entry').exists()).toBe(false)

        const splitter = wrapper.find('#terminal-splitter')
        expect(splitter.exists()).toBe(true)
        expect(splitter.attributes('role')).toBe('separator')
        expect(splitter.attributes('aria-orientation')).toBe('vertical')
        expect(splitter.attributes('aria-controls')).toBe('terminal-panel-container')
        expect(splitter.attributes('tabindex')).toBe('0')
        expect((splitter.element as HTMLElement).style.width).toBe('5px')
        expect(splitter.attributes('aria-valuenow')).toBe('360')
        expect(splitter.attributes('aria-valuemin')).toBe('0')
        expect(splitter.attributes('aria-valuemax')).toBe('813')
        expect(splitter.attributes('title')).toBe(t('editorUi.terminalPanel.splitterHint'))
    })

    it('面板头部「收起」：容器隐藏且宽度 0（组件仍挂载）、编辑区恢复、入口回到边栏', async () => {
        wrapper = await mountWorkspace()
        await openTerminalFromSidebar(wrapper)

        await wrapper.find('.terminal-panel-stub-collapse').trigger('click')
        await flushPromises()

        expect(terminalPanelState.collapsed).toBe(true)
        expect(wrapper.find('#terminal-panel-container').exists()).toBe(true)
        expect(wrapper.find('#terminal-panel-container').isVisible()).toBe(false)
        expect(terminalPanelWidthPx(wrapper)).toBe(0)
        expect(wrapper.find('#terminal-splitter').exists()).toBe(false)
        expect(widthOf(wrapper, '#md-container')).toBe('818px')
        // 收起后面板组件仍挂载（运行中的终端会话保留）
        expect(wrapper.find('.terminal-panel-stub').exists()).toBe(true)
        const entry = wrapper.find('#right-navi #terminal-sidebar-entry')
        expect(entry.exists()).toBe(true)
        // 收起态容器仍挂载：入口可关联面板并声明 aria-expanded=false
        expect(entry.attributes('aria-controls')).toBe('terminal-panel-container')
        expect(entry.attributes('aria-expanded')).toBe('false')
        expect(
            (wrapper.find('#right-navi').element as HTMLElement).dataset.terminalEntryVisible
        ).toBe('true')

        // 再次点击入口重新展开（恢复上次宽度）
        await openTerminalFromSidebar(wrapper)
        expect(terminalPanelState.collapsed).toBe(false)
        expect(terminalPanelWidthPx(wrapper)).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(widthOf(wrapper, '#md-container')).toBe('453px')
    })

    it('切到插件容器时面板隐藏、会话保留；返回编辑区恢复（与 AI 面板同口径）', async () => {
        wrapper = await mountWorkspace()
        await openTerminalFromSidebar(wrapper)

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'plugins')
        await flushPromises()
        expect(wrapper.find('#terminal-panel-container').isVisible()).toBe(false)
        expect(wrapper.find('.terminal-panel-stub').exists()).toBe(true)
        expect(wrapper.find('#terminal-sidebar-entry').exists()).toBe(false)

        await showMdContainer()
        expect(wrapper.find('#terminal-panel-container').isVisible()).toBe(true)
    })

    it('拖动分隔条改变宽度并在 mouseup 持久化；编辑区同步让位', async () => {
        wrapper = await mountWorkspace()
        await openTerminalFromSidebar(wrapper)

        await wrapper.find('#terminal-splitter').trigger('mousedown', { clientX: 800 })
        dispatchWindowMouse('mousemove', 700)
        await flushPromises()

        // delta = 800 − 700 = 100 → 面板 460；编辑区 818 − 460 − 5 = 353
        expect(terminalPanelWidthPx(wrapper)).toBe(460)
        expect(widthOf(wrapper, '#md-container')).toBe('353px')
        expect(window.localStorage.getItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY)).toBeNull()

        dispatchWindowMouse('mouseup')
        await flushPromises()
        expect(window.localStorage.getItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY)).toBe('460')
        expect(terminalPanelState.width).toBe(460)
    })

    it('拖动边界：向左占满工作区（813、编辑区 0）/ 向右缩到 0（编辑区 813、面板保留）', async () => {
        wrapper = await mountWorkspace()
        await openTerminalFromSidebar(wrapper)

        await wrapper.find('#terminal-splitter').trigger('mousedown', { clientX: 800 })
        dispatchWindowMouse('mousemove', -2000)
        await flushPromises()
        expect(terminalPanelWidthPx(wrapper)).toBe(813)
        expect(widthOf(wrapper, '#md-container')).toBe('0px')

        await wrapper.find('#terminal-splitter').trigger('mousedown', { clientX: 500 })
        dispatchWindowMouse('mousemove', 5000)
        await flushPromises()
        expect(terminalPanelWidthPx(wrapper)).toBe(0)
        expect(widthOf(wrapper, '#md-container')).toBe('813px')
        expect(wrapper.find('#terminal-panel-container').classes()).toContain(
            'terminal-panel-container--zero-width'
        )
        dispatchWindowMouse('mouseup')
        await flushPromises()
        expect(window.localStorage.getItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY)).toBe('0')
    })

    it('键盘：← 变宽 / → 变窄 ±16，Home 0 / End 813，双击复位 360 并持久化', async () => {
        wrapper = await mountWorkspace()
        await openTerminalFromSidebar(wrapper)
        const splitter = wrapper.find('#terminal-splitter')

        await splitter.trigger('keydown', { key: 'ArrowLeft' })
        await flushPromises()
        expect(terminalPanelWidthPx(wrapper)).toBe(376)

        await splitter.trigger('keydown', { key: 'ArrowRight' })
        await flushPromises()
        expect(terminalPanelWidthPx(wrapper)).toBe(360)

        await splitter.trigger('keydown', { key: 'Home' })
        await flushPromises()
        expect(terminalPanelWidthPx(wrapper)).toBe(0)
        expect(window.localStorage.getItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY)).toBe('0')

        await splitter.trigger('keydown', { key: 'End' })
        await flushPromises()
        expect(terminalPanelWidthPx(wrapper)).toBe(813)
        expect(splitter.attributes('aria-valuenow')).toBe('813')

        await splitter.trigger('dblclick')
        await flushPromises()
        expect(terminalPanelWidthPx(wrapper)).toBe(TERMINAL_PANEL_WIDTH.DEFAULT)
        expect(window.localStorage.getItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY)).toBe('360')
    })

    it('持久化超宽宽度：渲染时按可用宽度夹取（813），用户偏好 9999 不被覆盖', async () => {
        window.localStorage.setItem(TERMINAL_PANEL_WIDTH_STORAGE_KEY, '9999')
        wrapper = await mountWorkspace()
        await openTerminalFromSidebar(wrapper)

        expect(terminalPanelState.width).toBe(9999)
        expect(terminalPanelWidthPx(wrapper)).toBe(813)
        expect(widthOf(wrapper, '#md-container')).toBe('0px')
    })
})

describe('WorkSpace 终端面板：与 AI 面板互斥（LLM Wiki 模式）', () => {
    it('打开终端：AI 面板容器隐藏但状态不改写；切回 AI 时终端容器卸载、AI 面板恢复', async () => {
        testWorkspaceModeState.llmWiki = true
        setLlmWikiAiPanelWidth(420)
        wrapper = await mountWorkspace()

        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(true)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('420px')
        expect(widthOf(wrapper, '#md-container')).toBe('393px')

        await openTerminalFromSidebar(wrapper)

        // 终端占据右侧；AI 面板容器隐藏（v-show），但挂载状态与持久化宽度不变
        expect(wrapper.find('#terminal-panel-container').isVisible()).toBe(true)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(false)
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(420)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('0px')
        expect(widthOf(wrapper, '#md-container')).toBe('453px')
        // 两个入口：AI 入口出现（可切回），终端入口隐藏（面板显示中）
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(true)
        expect(wrapper.find('#terminal-sidebar-entry').exists()).toBe(false)

        // 切回 AI：终端容器卸载（组件卸载链路回收 pty），AI 面板恢复原宽度
        await wrapper.find('#llm-ai-sidebar-entry').trigger('click')
        await flushPromises()

        expect(terminalPanelState.active).toBe('ai')
        expect(wrapper.find('#terminal-panel-container').exists()).toBe(false)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(true)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('420px')
        expect(widthOf(wrapper, '#md-container')).toBe('393px')
        expect(wrapper.find('#terminal-sidebar-entry').exists()).toBe(true)
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
    })

    it('AI 面板已收起时点击终端入口：AI 保持收起；切回 AI 时入口展开面板', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        await wrapper.find('.llm-ai-panel-collapse').trigger('click')
        await flushPromises()
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(false)
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(true)

        await openTerminalFromSidebar(wrapper)
        expect(wrapper.find('#terminal-panel-container').isVisible()).toBe(true)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(false)
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)

        // LLM Wiki 模式 AI 入口点击 = 展开面板（沿用既有收起态展开语义）
        await wrapper.find('#llm-ai-sidebar-entry').trigger('click')
        await flushPromises()
        expect(terminalPanelState.active).toBe('ai')
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(true)
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(wrapper.find('#terminal-panel-container').exists()).toBe(false)
    })

    it('传统模式点击 AI 入口：走统一切换流程，不直接切右侧归属（终端保持显示）', async () => {
        wrapper = await mountWorkspace()
        await openTerminalFromSidebar(wrapper)
        expect(wrapper.find('#terminal-panel-container').isVisible()).toBe(true)

        await wrapper.find('#llm-ai-sidebar-entry').trigger('click')
        await flushPromises()

        expect(workspaceModeSwitchMock.requestSwitchToLlmWiki).toHaveBeenCalledTimes(1)
        expect(terminalPanelState.active).toBe('terminal')
        expect(wrapper.find('#terminal-panel-container').isVisible()).toBe(true)
    })

    it('工作区模式切换到 LLM Wiki 成功后：右侧交还 AI 面板（watch 接线）', async () => {
        wrapper = await mountWorkspace()
        await openTerminalFromSidebar(wrapper)
        expect(terminalPanelState.active).toBe('terminal')

        testWorkspaceModeState.llmWiki = true
        await flushPromises()

        expect(terminalPanelState.active).toBe('ai')
        expect(wrapper.find('#terminal-panel-container').exists()).toBe(false)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(true)
    })
})
