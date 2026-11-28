// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki 工作台布局（WorkSpace）——体验升级批次 A + 体验调整（用户新要求）+ 体验微调：
 * 「编辑区单栏切换 + 右侧 AI 面板 + 可拖动 split」，并按用户要求移除「编辑器最小宽度」、
 * 把「AI 面板收起」移到工作区右侧边栏；
 * 体验微调（用户反馈「AI 面板宽度也不要限制，往左拖动一点距离后就拖不动了」）：
 * **移除 AI 面板宽度固定上下限（原 240/560）**，可拖范围改为
 * `[0, 当前工作区可用宽度 − 分隔条宽度]`（0 = 面板不可见但仍挂载，可再拖回）。
 * 体验微调（用户反馈批次 A4）：右侧边栏 AI 入口在**传统模式与 LLM Wiki 模式都显示**，
 * 传统模式点击走「切换到 LLM Wiki 模式」确认 + 初始化流程（与系统设置同样处理）。
 *
 * 覆盖：
 * 1. traditional 模式：AI 面板零渲染（无右侧面板、无 split 分隔条），右侧边栏 AI 入口常显；
 * 2. llm-wiki 模式：右侧渲染 LlmAiPanel、编辑区宽度扣除面板与分隔条宽度；
 * 3. split 拖动：范围为 [0, 可用宽度 − 分隔条 5]（无固定上下限）——向左可把面板拉到占满
 *    工作区（编辑区 0），向右可把面板缩到 0（编辑区占满、面板保留挂载并可再拖回）；
 * 4. 无窗口自动收起：窄窗口只按可用宽度夹取面板宽度，收起只由用户手动触发；
 * 5. 收起后 AI 面板容器 v-show=false 且宽度 0（完全不占编辑区宽度），工作区右侧边栏
 *    渲染 AI 入口按钮；点击入口展开面板并隐藏入口（恢复上次持久化宽度）；
 * 6. 收起状态（localStorage）重启恢复、入口无障碍（原生 button + title/aria-label）；
 * 7. 键盘 ←/→/Home/End 调整（Home=0、End=可用宽度−5）；双击分隔条 / 面板按钮恢复默认 360px
 *    （可用宽度不足 360+5 时夹到可用宽度−5）；持久化宽度在挂载 / resize 时按可用宽度夹取；
 * 8. 切到其它工作区容器时面板与入口隐藏（v-show 保留实例）；传统模式仅面板零渲染。
 *
 * 说明：编辑区内部视图（编辑 / 预览 / 编辑+预览）已统一为 `workspace-layout` 三态单一真源
 * （体验微调批次 A5），入口在菜单栏右侧图标按钮（`MenuBar.vue`，A6 起从编辑工具条迁移），
 * 对应渲染/切换行为由 `markdown-edit-tools-llm-wiki.test.ts`、`menubar-actions.test.ts` 与
 * `markdown-edit-llm-wiki-layout.test.ts` 覆盖；旧「编辑区单栏 tab」状态已删除。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent } from 'vue'
import * as fs from 'fs'
import * as path from 'path'
import {
    LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY,
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
import * as workspaceModeSwitchModule from '@renderer/composables/useWorkspaceModeSwitch'
import LlmAiPanel from '@renderer/components/llm-wiki/LlmAiPanel.vue'
import { t } from '../../../src/renderer/src/common/i18n'

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

// ============ 工作区模式快速切换 mock（边栏入口/工具条复用；本文件只验证 WorkSpace 接线） ============
vi.mock('@renderer/composables/useWorkspaceModeSwitch', async () => {
    const { reactive } = await import('vue')
    const state = reactive({ visible: false, busy: false })
    return {
        // 仅测试可见的状态（业务代码消费同名导出）
        __testWorkspaceModeSwitchState: state,
        workspaceModeSwitchState: state,
        requestSwitchToLlmWiki: vi.fn(),
        switchToTraditional: vi.fn(),
        confirmSwitchToLlmWiki: vi.fn(),
        cancelWorkspaceModeSwitch: vi.fn()
    }
})

// ============ 迁移弹窗桩（对话框自身渲染/交互由 migration-wizard-dialog 用例覆盖） ============
vi.mock('@renderer/components/dialogs/simple/MigrationWizardDialog.vue', async () => {
    const { defineComponent } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试用对话框桩组件（vi.mock 工厂内联定义）
        default: defineComponent({
            name: 'MigrationWizardDialogStub',
            template: '<div class="migration-wizard-dialog-stub" />'
        })
    }
})

/** 测试用工作区模式开关（与 mock 工厂共享同一 reactive state） */
const testWorkspaceModeState = (
    workspaceModeModule as unknown as {
        __testWorkspaceModeState: { llmWiki: boolean }
    }
).__testWorkspaceModeState

/** 测试用模式切换 composable mock（断言调用顺序/参数） */
const workspaceModeSwitchMock = workspaceModeSwitchModule as unknown as {
    __testWorkspaceModeSwitchState: { visible: boolean; busy: boolean }
    requestSwitchToLlmWiki: ReturnType<typeof vi.fn>
    switchToTraditional: ReturnType<typeof vi.fn>
    confirmSwitchToLlmWiki: ReturnType<typeof vi.fn>
    cancelWorkspaceModeSwitch: ReturnType<typeof vi.fn>
}

// ============ 子组件桩（只保留宽度 props 契约） ============
// eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：与 vi.mock 工厂内的对话框桩同文件，非产品组件
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

/** 通过面板头部的「收起」按钮把手动收起 AI 面板 */
async function collapseLlmAiPanel(mounted: VueWrapper): Promise<void> {
    await mounted.find('.llm-ai-panel-collapse').trigger('click')
    await flushPromises()
}

/** 通过右侧边栏入口按钮展开 AI 面板 */
async function expandLlmAiPanelFromSidebar(mounted: VueWrapper): Promise<void> {
    await mounted.find('#llm-ai-sidebar-entry').trigger('click')
    await flushPromises()
}

beforeEach(() => {
    setInnerWidth(1200)
    testWorkspaceModeState.llmWiki = false
    window.localStorage.clear()
    resetLlmWikiWorkbenchStateForTesting()
    workspaceModeSwitchMock.__testWorkspaceModeSwitchState.visible = false
    workspaceModeSwitchMock.__testWorkspaceModeSwitchState.busy = false
    workspaceModeSwitchMock.requestSwitchToLlmWiki.mockClear()
    workspaceModeSwitchMock.switchToTraditional.mockClear()
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

describe('WorkSpace 布局：traditional 模式（AI 面板零渲染 + 右侧边栏 AI 入口常显）', () => {
    it('不渲染右侧 AI 面板与 split 分隔条，编辑区宽度沿用既有口径；右侧边栏 AI 入口显示', async () => {
        wrapper = await mountWorkspace()

        expect(wrapper.find('#llm-ai-panel-container').exists()).toBe(false)
        expect(wrapper.findComponent(LlmAiPanel).exists()).toBe(false)
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(false)
        // 1.5.7 体验微调（用户反馈）：传统模式也显示右侧边栏 AI 入口（点击切换到 LLM Wiki 模式）
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(true)
        // 1200 - 40*2 - 300 - 2 = 818（入口不占编辑区宽度）
        expect(widthOf(wrapper, '#md-container')).toBe('818px')
        expect(wrapper.find('.md-container-stub').attributes('data-width')).toBe('818px')
    })
})

describe('WorkSpace 右侧边栏 AI 入口：传统模式（用户反馈批次 A4）', () => {
    it('传统模式显示入口：title/aria-label=切换到 LLM Wiki 模式并打开 AI 助手，不占编辑区宽度', async () => {
        wrapper = await mountWorkspace()

        const entry = wrapper.find('#right-navi #llm-ai-sidebar-entry')
        expect(entry.exists()).toBe(true)
        expect(entry.element.tagName).toBe('BUTTON')
        expect(entry.attributes('type')).toBe('button')
        expect(entry.attributes('title')).toBe(t('editorUi.llmWikiPanel.switchToLlmWikiEntry'))
        expect(entry.attributes('aria-label')).toBe(t('editorUi.llmWikiPanel.switchToLlmWikiEntry'))
        expect(entry.attributes('data-llm-ai-entry-mode')).toBe('traditional')
        // 传统模式无 AI 面板容器：入口仅作为模式切换动作，不关联不存在的 aria-controls 目标
        expect(entry.attributes('aria-controls')).toBeUndefined()
        expect(wrapper.find('#llm-ai-panel-container').exists()).toBe(false)
        expect(widthOf(wrapper, '#md-container')).toBe('818px')
    })

    it('传统模式点击入口：请求统一切换流程（迁移弹窗 → 初始化 → 写配置 → 展开面板），不直接展开面板', async () => {
        wrapper = await mountWorkspace()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)

        await wrapper.find('#llm-ai-sidebar-entry').trigger('click')
        await flushPromises()

        // 复用系统设置同款切换链路：只请求切换（弹迁移弹窗），不写渲染层面板状态
        expect(workspaceModeSwitchMock.requestSwitchToLlmWiki).toHaveBeenCalledTimes(1)
        expect(workspaceModeSwitchMock.switchToTraditional).not.toHaveBeenCalled()
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBeNull()
    })

    it('传统模式切到其它工作区容器（插件/工具/HTML/PDF）时入口隐藏，返回编辑区后恢复', async () => {
        wrapper = await mountWorkspace()
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(true)

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'plugins')
        await flushPromises()
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)

        await showMdContainer()
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(true)
        // 入口在最右侧导航条内，不占编辑区宽度
        expect(widthOf(wrapper, '#md-container')).toBe('818px')
    })

    it('迁移弹窗按模块单例状态挂载（三处入口共用）', async () => {
        wrapper = await mountWorkspace()
        expect(wrapper.find('.migration-wizard-dialog-stub').exists()).toBe(false)

        workspaceModeSwitchMock.__testWorkspaceModeSwitchState.visible = true
        await flushPromises()
        expect(wrapper.find('.migration-wizard-dialog-stub').exists()).toBe(true)

        workspaceModeSwitchMock.__testWorkspaceModeSwitchState.visible = false
        await flushPromises()
        expect(wrapper.find('.migration-wizard-dialog-stub').exists()).toBe(false)
    })
})

describe('WorkSpace 布局：llm-wiki 模式（单栏编辑 + 右侧 AI 面板）', () => {
    it('右侧渲染 LlmAiPanel，编辑区宽度扣除面板与分隔条宽度；右侧边栏无入口', async () => {
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
        // 展开态入口不渲染（收起按钮在面板头部）
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
        // 编辑区内部视图由统一三态真源驱动（入口在菜单栏右侧），无旧 tab 行节点
        expect(wrapper.find('.llm-wiki-editor-tabs').exists()).toBe(false)
    })

    it('窄窗口（<= 1100）无自定义宽度时使用窄档默认面板宽度（不自动收起）', async () => {
        testWorkspaceModeState.llmWiki = true
        setInnerWidth(1000)
        wrapper = await mountWorkspace()

        // 1000 - 80 - 300 - 2 = 618；无编辑区最小宽度约束后仍优先用窄档默认 280（不超过 MAX）
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('280px')
        expect(widthOf(wrapper, '#md-container')).toBe('333px')
        // 无自动收起：分隔条渲染、入口不渲染
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(true)
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
    })

    it('窄窗口不再自动收起：编辑区可被压到 320 以下甚至接近 0', async () => {
        testWorkspaceModeState.llmWiki = true
        setInnerWidth(900)
        wrapper = await mountWorkspace()

        // 900 - 80 - 300 - 2 = 518；面板 280 → 编辑区 233（< 320，不再触发自动收起）
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('280px')
        expect(widthOf(wrapper, '#md-container')).toBe('233px')
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(true)

        // 再缩窄：318 可用宽度 → 面板 280、编辑区仅 33，仍然保持展开（仅用户可收起）
        setInnerWidth(700)
        window.dispatchEvent(new Event('resize'))
        await flushPromises()
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('280px')
        expect(widthOf(wrapper, '#md-container')).toBe('33px')
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
    })

    it('手动收起：面板容器不占位（隐藏 + 宽度 0）、编辑区占满、右侧边栏出现入口', async () => {
        testWorkspaceModeState.llmWiki = true
        setInnerWidth(1200)
        wrapper = await mountWorkspace()
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(true)

        await collapseLlmAiPanel(wrapper)

        // 状态 + 持久化
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('true')

        // 面板容器仍在 DOM（v-show 保留对话状态），但不可见且宽度 0（不占编辑区宽度）
        const panel = wrapper.find('#llm-ai-panel-container')
        expect(panel.isVisible()).toBe(false)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('0px')
        expect(wrapper.findComponent(LlmAiPanel).exists()).toBe(true)
        // 收起态面板内容不渲染（入口不在面板内，而在右侧边栏）
        expect(wrapper.find('.llm-ai-panel-header').exists()).toBe(false)
        expect(wrapper.find('.llm-ai-panel-collapse').exists()).toBe(false)
        // 分隔条消失，编辑区占满整个工作区可用宽度
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(false)
        expect(widthOf(wrapper, '#md-container')).toBe('818px')

        // 右侧边栏入口出现（位于 #right-navi 内，非编辑区）
        const entry = wrapper.find('#right-navi #llm-ai-sidebar-entry')
        expect(entry.exists()).toBe(true)
        expect(entry.element.tagName).toBe('BUTTON')
        expect(entry.attributes('type')).toBe('button')
        expect(entry.attributes('title')).toBe(t('editorUi.llmWikiPanel.expand'))
        expect(entry.attributes('aria-label')).toBe(t('editorUi.llmWikiPanel.expand'))
        expect(entry.attributes('aria-controls')).toBe('llm-ai-panel-container')
        expect(entry.attributes('aria-expanded')).toBe('false')
        expect(entry.attributes('disabled')).toBeUndefined()
        expect((wrapper.find('#right-navi').element as HTMLElement).dataset.llmAiEntryVisible).toBe(
            'true'
        )
    })

    it('点击右侧边栏入口展开面板：入口消失、分隔条恢复、编辑区重新让位', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        await collapseLlmAiPanel(wrapper)
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(true)

        await expandLlmAiPanelFromSidebar(wrapper)

        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY)).toBe('false')
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(true)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('360px')
        expect(widthOf(wrapper, '#md-container')).toBe('453px')
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(true)
    })

    it('切到插件容器时 AI 面板与分隔条隐藏（v-show 保留实例），返回编辑区后恢复', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'plugins')
        await flushPromises()
        expect(wrapper.find('#md-container').isVisible()).toBe(false)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(false)
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(false)
        // 面板不可用上下文时不渲染右侧边栏入口
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)

        await showMdContainer()
        expect(wrapper.find('#md-container').isVisible()).toBe(true)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(true)
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(true)
        // 组件实例未被卸载（对话状态可保留）
        expect(wrapper.findComponent(LlmAiPanel).exists()).toBe(true)
    })

    it('收起态切到其它容器：右侧边栏入口隐藏，返回编辑区后重新出现', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        await collapseLlmAiPanel(wrapper)
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(true)

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'tools')
        await flushPromises()
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
        expect((wrapper.find('#right-navi').element as HTMLElement).dataset.llmAiEntryVisible).toBe(
            'false'
        )

        await showMdContainer()
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(true)
    })

    it('收起态切回 traditional 模式：面板容器不渲染，右侧边栏入口保留（点击可切回 LLM Wiki）', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        await collapseLlmAiPanel(wrapper)
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(true)

        testWorkspaceModeState.llmWiki = false
        await flushPromises()

        expect(wrapper.find('#llm-ai-panel-container').exists()).toBe(false)
        // 1.5.7 体验微调：传统模式同样保留入口（点击走确认 + 初始化切换流程）
        const entry = wrapper.find('#llm-ai-sidebar-entry')
        expect(entry.exists()).toBe(true)
        expect(entry.attributes('data-llm-ai-entry-mode')).toBe('traditional')
        expect(entry.attributes('title')).toBe(t('editorUi.llmWikiPanel.switchToLlmWikiEntry'))
        expect(widthOf(wrapper, '#md-container')).toBe('818px')
        // 用户收起偏好保留在状态中（下次进入 llm-wiki 仍为收起态）
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
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
        // 1.5.7 体验微调：无固定上下限，可拖范围 = [0, 可用宽度 818 − 分隔条 5 = 813]
        expect(splitter.attributes('aria-valuenow')).toBe('360')
        expect(splitter.attributes('aria-valuemin')).toBe('0')
        expect(splitter.attributes('aria-valuemax')).toBe('813')
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

    it('向左拖动到尽头：面板占满整个工作区（可用宽度 − 分隔条 = 813），编辑区宽 0', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        await wrapper.find('#llm-ai-splitter').trigger('mousedown', { clientX: 800 })
        dispatchWindowMouse('mousemove', -2000)
        await flushPromises()

        // 1.5.7 体验微调：不再被固定 MAX 560 卡住，面板可一路拉到 818 - 5 = 813
        expect(panelWidthPx(wrapper)).toBe(813)
        expect(widthOf(wrapper, '#md-container')).toBe('0px')
        expect(wrapper.find('#llm-ai-splitter').attributes('aria-valuenow')).toBe('813')
        // 超过可用宽度继续拖动仍保持在 813（拖满后不再变化）
        dispatchWindowMouse('mousemove', -4000)
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(813)
    })

    it('向右拖动到尽头：面板缩到 0（编辑区占满可用宽度 − 分隔条），面板保留挂载并可再拖回', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()

        await wrapper.find('#llm-ai-splitter').trigger('mousedown', { clientX: 500 })
        dispatchWindowMouse('mousemove', 5000)
        await flushPromises()

        // 1.5.7 体验微调：不再被固定 MIN 240 卡住，面板可缩到 0；编辑区 = 818 - 0 - 5 = 813
        expect(panelWidthPx(wrapper)).toBe(0)
        expect(widthOf(wrapper, '#md-container')).toBe('813px')
        // 面板仍挂载（对话状态不丢）、分隔条仍在（可再拖回），不是「收起」状态
        expect(wrapper.findComponent(LlmAiPanel).exists()).toBe(true)
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(true)
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
        // 0 宽时去掉左侧 hairline，视觉上等于收起
        expect(wrapper.find('#llm-ai-panel-container').classes()).toContain(
            'llm-ai-panel-container--zero-width'
        )

        dispatchWindowMouse('mouseup')
        await flushPromises()
        // 0 为合法宽度：mouseup 持久化 0
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('0')
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(0)

        // 用户可再拖回：从 0 宽起步向左拖 100px → 面板 100
        await wrapper.find('#llm-ai-splitter').trigger('mousedown', { clientX: 500 })
        dispatchWindowMouse('mousemove', 400)
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(100)
        expect(widthOf(wrapper, '#md-container')).toBe('713px')
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
        // 拖动中按 Home：applyLlmWikiAiPanelWidth 清空内存态临时宽度（window 监听仍在），
        // 1.5.7 体验微调：Home 缩到 0（最小可拖宽度）
        await splitter.trigger('keydown', { key: 'Home' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(0)

        // 临时宽度为 null → handleLlmPanelResizeMove 早退，拖动不再改写宽度
        dispatchWindowMouse('mousemove', 700)
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(0)

        // 宽度为 null 时 mouseup：stopLlmPanelResize 跳过持久化，但仍摘除监听
        const removeSpy = vi.spyOn(window, 'removeEventListener')
        dispatchWindowMouse('mouseup')
        await flushPromises()
        expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
        expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
        // 保持 Home 已持久化的宽度（0），不被 null 宽度覆盖
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('0')
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

    it('窗口 resize 时按可用宽度夹取面板宽度（编辑区下限 0），但不覆盖用户保存的宽度偏好', async () => {
        testWorkspaceModeState.llmWiki = true
        // 用户偏好 900（无固定上限，允许大于当前可用宽度）
        setLlmWikiAiPanelWidth(900)
        wrapper = await mountWorkspace()

        // 1200 宽：可用宽度 818 → 上限 = 818 - 5 = 813，编辑区 0
        expect(panelWidthPx(wrapper)).toBe(813)
        expect(widthOf(wrapper, '#md-container')).toBe('0px')
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(900)

        // 窗口缩窄到 900：可用宽度 518 → 上限 513，面板随之夹取且不自动收起
        setInnerWidth(900)
        window.dispatchEvent(new Event('resize'))
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(513)
        expect(widthOf(wrapper, '#md-container')).toBe('0px')
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
        // 用户保存的宽度偏好不被覆盖
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(900)

        // 窗口放大到 1600：可用宽度 1218 → 上限 1213，恢复用户保存的 900
        setInnerWidth(1600)
        window.dispatchEvent(new Event('resize'))
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(900)
        expect(widthOf(wrapper, '#md-container')).toBe('313px')
    })

    it('持久化的超范围宽度（大于可用宽度）挂载时被夹取到「可用宽度 − 分隔条」，偏好保留', async () => {
        testWorkspaceModeState.llmWiki = true
        window.localStorage.setItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY, '9999')
        wrapper = await mountWorkspace()

        // 无固定上限：9999 作为用户偏好保留，实际渲染夹取到 818 - 5 = 813（编辑区 0）
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(9999)
        expect(panelWidthPx(wrapper)).toBe(813)
        expect(widthOf(wrapper, '#md-container')).toBe('0px')
        const splitter = wrapper.find('#llm-ai-splitter')
        expect(splitter.attributes('aria-valuenow')).toBe('813')
        expect(splitter.attributes('aria-valuemax')).toBe('813')
    })

    it('持久化的负数宽度归一化为 0：面板挂载但不可见，分隔条仍在（可再拖回）', async () => {
        testWorkspaceModeState.llmWiki = true
        window.localStorage.setItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY, '-120')
        wrapper = await mountWorkspace()

        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(0)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('0px')
        expect(widthOf(wrapper, '#md-container')).toBe('813px')
        // 与「手动收起」不同：面板容器仍可见（v-show=true）、仍挂载、分隔条仍在
        expect(wrapper.find('#llm-ai-panel-container').exists()).toBe(true)
        expect(wrapper.findComponent(LlmAiPanel).exists()).toBe(true)
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(true)
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(false)
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

    it('可用宽度不足 360 + 分隔条时，双击复位夹到「可用宽度 − 分隔条」（持久化仍写默认 360）', async () => {
        testWorkspaceModeState.llmWiki = true
        // 700 宽：可用宽度 318 → 分隔条外最大 313 < 360
        setInnerWidth(700)
        wrapper = await mountWorkspace()
        // 无自定义宽度 + 窄窗 → 窄档默认 280（可放下，不夹取）
        expect(panelWidthPx(wrapper)).toBe(280)

        // 先拖窄到 150 再双击复位 → 360 被夹到 313（不会超出可用宽度）
        setLlmWikiAiPanelWidth(150)
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(150)

        await wrapper.find('#llm-ai-splitter').trigger('dblclick')
        await flushPromises()

        expect(panelWidthPx(wrapper)).toBe(313)
        expect(widthOf(wrapper, '#md-container')).toBe('0px')
        // 持久化的是默认 360（窗口恢复后即用回默认宽度），渲染时按可用宽度夹取
        expect(llmWikiWorkbenchState.aiPanelWidth).toBe(LLM_WIKI_AI_PANEL_WIDTH.DEFAULT)
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

    it('键盘 Home 缩到 0 / End 拉到可用宽度 − 分隔条（813），无固定上下限', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        const splitter = wrapper.find('#llm-ai-splitter')

        // Home = 0（最小可拖宽度）：面板不可见但挂载保留，编辑区占满 818 - 5 = 813
        await splitter.trigger('keydown', { key: 'Home' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(0)
        expect(widthOf(wrapper, '#md-container')).toBe('813px')
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('0')
        expect(wrapper.find('#llm-ai-splitter').attributes('aria-valuenow')).toBe('0')

        // End = 可用宽度 − 分隔条 = 813（最大可拖宽度）：编辑区 0
        await splitter.trigger('keydown', { key: 'End' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(813)
        expect(widthOf(wrapper, '#md-container')).toBe('0px')
        expect(wrapper.find('#llm-ai-splitter').attributes('aria-valuenow')).toBe('813')
        expect(window.localStorage.getItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY)).toBe('813')

        // Home/End 与 aria-valuemin/max 同步：min 0、max 813
        expect(wrapper.find('#llm-ai-splitter').attributes('aria-valuemin')).toBe('0')
        expect(wrapper.find('#llm-ai-splitter').attributes('aria-valuemax')).toBe('813')
    })

    it('方向键微调在边界处停止（Home 后 → 回不到负值、End 后 ← 不超出可用宽度）', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        const splitter = wrapper.find('#llm-ai-splitter')

        await splitter.trigger('keydown', { key: 'Home' })
        await flushPromises()
        await splitter.trigger('keydown', { key: 'ArrowRight' })
        await flushPromises()
        // ArrowRight 在 0 处继续收缩：结果被夹到 0（不会出现负宽度）
        expect(panelWidthPx(wrapper)).toBe(0)
        await splitter.trigger('keydown', { key: 'ArrowLeft' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(16)

        await splitter.trigger('keydown', { key: 'End' })
        await flushPromises()
        await splitter.trigger('keydown', { key: 'ArrowLeft' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(813)
        await splitter.trigger('keydown', { key: 'ArrowRight' })
        await flushPromises()
        expect(panelWidthPx(wrapper)).toBe(797)
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

describe('WorkSpace 右侧边栏 AI 入口：键盘可达与契约', () => {
    it('入口为原生 button：可聚焦并响应点击展开', async () => {
        testWorkspaceModeState.llmWiki = true
        wrapper = await mountWorkspace()
        await collapseLlmAiPanel(wrapper)

        const entry = wrapper.find('#llm-ai-sidebar-entry')
        const element = entry.element as HTMLButtonElement
        // 原生 button 默认 tabIndex 0，不设置 tabindex=-1
        expect(element.tagName).toBe('BUTTON')
        expect(element.tabIndex).toBe(0)
        element.focus()
        expect(document.activeElement).toBe(element)

        element.click()
        await flushPromises()
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(true)
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
    })

    it('静态契约：收起入口在右侧边栏、走 --ui-* 令牌；旧「最小编辑宽度/自动收起/面板内折叠侧栏」已移除', () => {
        const workspaceSource = fs.readFileSync(
            path.resolve(
                __dirname,
                '../../../src/renderer/src/components/WorkSpaceArea/WorkSpace.vue'
            ),
            'utf8'
        )
        // 入口 DOM：位于 #right-navi 内，i18n「展开 AI 面板」为 title/aria-label，关联面板容器
        const rightNaviStart = workspaceSource.indexOf('id="right-navi"')
        const rightNaviBlock = workspaceSource.slice(
            rightNaviStart,
            workspaceSource.indexOf('</div>', workspaceSource.indexOf('<NaviTab position="right"'))
        )
        expect(rightNaviBlock).toContain('id="llm-ai-sidebar-entry"')
        // aria-controls 仅在 LLM Wiki 模式（面板真实存在）时关联面板容器
        expect(rightNaviBlock).toContain(
            ':aria-controls="isLlmWikiMode ? \'llm-ai-panel-container\' : undefined"'
        )
        // 入口 title/aria-label 随模式变化：LLM Wiki 收起 = 展开面板；传统模式 = 切换模式并打开助手
        expect(rightNaviBlock).toContain('llmAiSidebarEntryLabel')
        expect(workspaceSource).toContain("t('editorUi.llmWikiPanel.expand')")
        expect(workspaceSource).toContain("t('editorUi.llmWikiPanel.switchToLlmWikiEntry')")
        // 点击分派：传统模式走统一切换 composable（确认 + 初始化 + 写配置），LLM Wiki 展开面板
        expect(rightNaviBlock).toContain('handleLlmAiSidebarEntryClick')
        expect(workspaceSource).toContain('requestSwitchToLlmWiki()')
        // 迁移弹窗由 WorkSpace 按模块单例状态挂载（三处入口共用）
        expect(workspaceSource).toContain(
            'MigrationWizardDialog v-if="workspaceModeSwitchState.visible"'
        )
        expect(workspaceSource).toContain('v-if="showLlmAiSidebarEntry"')
        // 样式：图标按钮走令牌 + focus-visible 焦点环，不写死颜色
        const entryBlock = workspaceSource.slice(workspaceSource.indexOf('.llm-ai-sidebar-entry {'))
        expect(entryBlock).toContain('cursor: pointer')
        expect(entryBlock).toContain('var(--ui-accent')
        expect(entryBlock).toContain('background-color: var(--bz-shell-surface')
        expect(entryBlock).toContain('box-shadow: var(--ui-focus-shadow)')
        // 入口按钮不占编辑区宽度：右侧边栏纵向 flex，NaviTab 内容区滚动
        const rightNaviStyle = workspaceSource.slice(workspaceSource.indexOf('#right-navi {'))
        expect(rightNaviStyle).toContain('flex-direction: column')
        expect(rightNaviStyle).toContain('overflow: hidden')
        // 旧语义移除：编辑器最小宽度 / 窄窗口自动收起 / 面板内 48px 折叠侧栏
        expect(workspaceSource).not.toContain('AI_PANEL_MIN_EDITOR_WIDTH')
        expect(workspaceSource).not.toContain('isLlmWikiAiPanelAutoCollapsed')
        expect(workspaceSource).not.toContain('AI_PANEL_WIDTH_COLLAPSED')
        expect(workspaceSource).not.toContain('narrowCollapsedHint')
        // 旧固定上下限移除（1.5.7 体验微调：用户反馈「往左拖一点就拖不动」）
        expect(workspaceSource).not.toContain('LLM_WIKI_AI_PANEL_WIDTH.MIN')
        expect(workspaceSource).not.toContain('LLM_WIKI_AI_PANEL_WIDTH.MAX')
        // 1.5.7 体验微调：面板宽度拖到 0 时视觉上等于收起（去 hairline + 隐藏不可见控件，
        // 面板仍挂载、对话状态不丢，宽度恢复后样式自动还原）
        const zeroWidthBlock = workspaceSource.slice(
            workspaceSource.indexOf('.llm-ai-panel-container--zero-width {')
        )
        expect(zeroWidthBlock).toContain('border-left: none')
        expect(zeroWidthBlock).toContain('visibility: hidden')

        const panelSource = fs.readFileSync(
            path.resolve(__dirname, '../../../src/renderer/src/components/llm-wiki/LlmAiPanel.vue'),
            'utf8'
        )
        expect(panelSource).not.toContain('llm-ai-panel-expand')
        expect(panelSource).not.toContain('llm-ai-panel--collapsed')
        expect(panelSource).not.toContain('canExpand')
        expect(panelSource).not.toContain('narrowCollapsedHint')
    })
})

describe('WorkSpace split：收起态与展开态切换（右侧边栏入口）', () => {
    it('手动收起再经右侧边栏展开：恢复收起前的持久化宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        setLlmWikiAiPanelWidth(440)
        wrapper = await mountWorkspace()
        expect(panelWidthPx(wrapper)).toBe(440)

        await collapseLlmAiPanel(wrapper)
        expect(panelWidthPx(wrapper)).toBe(0)
        expect(widthOf(wrapper, '#md-container')).toBe('818px')

        await expandLlmAiPanelFromSidebar(wrapper)
        expect(panelWidthPx(wrapper)).toBe(440)
        expect(widthOf(wrapper, '#md-container')).toBe('373px')
        expect(wrapper.find('#llm-ai-splitter').exists()).toBe(true)
    })

    it('收起状态持久化：重启后恢复收起（入口在右侧边栏），点击入口恢复上次宽度', async () => {
        testWorkspaceModeState.llmWiki = true
        window.localStorage.setItem(LLM_WIKI_AI_PANEL_COLLAPSED_STORAGE_KEY, 'true')
        window.localStorage.setItem(LLM_WIKI_AI_PANEL_WIDTH_STORAGE_KEY, '420')
        wrapper = await mountWorkspace()

        // 首帧即恢复收起态：面板隐藏且不占宽度、编辑区占满、入口在右侧边栏
        expect(llmWikiWorkbenchState.aiPanelCollapsed).toBe(true)
        expect(wrapper.find('#llm-ai-panel-container').isVisible()).toBe(false)
        expect(panelWidthPx(wrapper)).toBe(0)
        expect(widthOf(wrapper, '#md-container')).toBe('818px')
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(true)

        // 点击入口展开：恢复持久化的 420
        await expandLlmAiPanelFromSidebar(wrapper)
        expect(panelWidthPx(wrapper)).toBe(420)
        expect(widthOf(wrapper, '#md-container')).toBe('393px')
    })
})

describe('WorkSpace 布局：可用宽度解析防御分支', () => {
    it('容器可用宽度解析为 0 时按 0 处理（parseInt 结果 falsy 的兜底，不出现负宽度）', async () => {
        testWorkspaceModeState.llmWiki = true
        // 382 - 40*2 - 300 - 2 = 0 → workAreaWidth = '0px'，parseInt 结果为 0（falsy）
        setInnerWidth(382)
        wrapper = await mountWorkspace()

        // 可用宽度 0：面板宽度夹取到 0（不自动收起、入口不渲染），编辑区宽度被夹取到 0 而不是负数
        expect(wrapper.find('#llm-ai-sidebar-entry').exists()).toBe(false)
        expect(widthOf(wrapper, '#llm-ai-panel-container')).toBe('0px')
        expect(widthOf(wrapper, '#md-container')).toBe('0px')
        // 展开态仍渲染分隔条（仅用户可收起），ARIA 数值随可用宽度收缩为 0
        const splitter = wrapper.find('#llm-ai-splitter')
        expect(splitter.exists()).toBe(true)
        expect(splitter.attributes('aria-valuemin')).toBe('0')
        expect(splitter.attributes('aria-valuemax')).toBe('0')
        expect(splitter.attributes('aria-valuenow')).toBe('0')
    })
})
