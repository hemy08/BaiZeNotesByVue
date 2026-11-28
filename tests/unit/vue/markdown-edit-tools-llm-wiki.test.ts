// @vitest-environment jsdom
/**
 * 1.5.7 体验微调（用户反馈批次 A5）：编辑工具条右侧图标按钮。
 *
 * 覆盖：
 * 1. 编辑视图三态切换按钮：**传统模式与 LLM Wiki 模式都渲染**，纯图标（无文字），
 *    图标 = 当前视图（编辑=铅笔 / 预览=眼睛 / 编辑+预览=分栏），title/aria-label 同时说明
 *    「当前视图 + 点击后的目标视图」；点击按 编辑 → 预览 → 编辑+预览 → 编辑 循环，
 *    单一真源写入 `workspace-layout` 的 `updateCurrentWorkspaceViewMode`（不新增状态）；
 * 2. 工作区模式快速切换按钮：两模式都渲染，传统模式点击请求统一确认流程（初始化+写配置），
 *    LLM Wiki 模式点击直接切换到传统模式；
 * 3. 右侧按钮区不参与左侧格式按钮的收缩裁剪（宽度计算扣除右侧区，右侧始终可见）；
 * 4. 图标契约：24 网格 / stroke 1.5 / currentColor（纯图标无文字）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import * as fs from 'fs'
import * as path from 'path'
import { nextTick } from 'vue'
import { t } from '../../../src/renderer/src/common/i18n'

// ============ 工作区布局单一真源 mock：记录 updateCurrentWorkspaceViewMode 调用 ============
// 保留真实 reactive 状态（组件与断言共用），只把写入函数包一层记录调用参数，
// 以验证「点击只写单一真源、不新增第二份视图状态」。
const layoutMock = vi.hoisted(() => ({ updateCalls: [] as string[] }))

vi.mock('@renderer/components/Markdown/workspace-layout', async (importOriginal) => {
    const actual =
        await importOriginal<
            typeof import('../../../src/renderer/src/components/Markdown/workspace-layout')
        >()
    return {
        ...actual,
        updateCurrentWorkspaceViewMode: (
            mode: import('../../../src/renderer/src/components/Markdown/workspace-layout').WorkspaceLayoutViewMode
        ) => {
            layoutMock.updateCalls.push(mode)
            actual.updateCurrentWorkspaceViewMode(mode)
        }
    }
})

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
        })
    }
})

// ============ 工作区模式快速切换 mock（复用系统设置同款切换流程） ============
vi.mock('@renderer/composables/useWorkspaceModeSwitch', async () => {
    const { reactive } = await import('vue')
    const state = reactive({ visible: false, busy: false })
    return {
        __testWorkspaceModeSwitchState: state,
        workspaceModeSwitchState: state,
        requestSwitchToLlmWiki: vi.fn(),
        switchToTraditional: vi.fn(),
        confirmSwitchToLlmWiki: vi.fn(),
        cancelWorkspaceModeSwitch: vi.fn()
    }
})

// ============ 最小 QuickAccess 桩（只保留模板字段，不引入 Monaco 依赖） ============
const { quickAccessMock } = vi.hoisted(() => {
    const makeItem = (id: string) => ({
        id,
        titleKey: `editorUi.toolbar.${id}`,
        class: `tool-${id}`,
        clickFn: vi.fn(),
        param: '',
        svg: '<svg viewBox="0 0 24 24"><path d="M0 0" /></svg>'
    })
    return {
        quickAccessMock: {
            bold: makeItem('bold'),
            italic: makeItem('italic'),
            underline: makeItem('underline')
        }
    }
})

vi.mock('@renderer/components/Markdown/hemy-editor-quick-access', () => ({
    MdEditQuickAccess: quickAccessMock
}))

import MarkdownEditToolsComponent from '@renderer/components/Markdown/MarkdownEditToolsComponent.vue'
import { currentWorkspaceLayout } from '@renderer/components/Markdown/workspace-layout'
import * as workspaceModeModule from '@renderer/composables/useWorkspaceMode'
import * as workspaceModeSwitchModule from '@renderer/composables/useWorkspaceModeSwitch'

/** 测试用工作区模式开关（与 mock 工厂共享同一 reactive state） */
const testWorkspaceModeState = (
    workspaceModeModule as unknown as {
        __testWorkspaceModeState: { llmWiki: boolean }
    }
).__testWorkspaceModeState

/** 测试用模式切换 composable mock */
const switchMock = workspaceModeSwitchModule as unknown as {
    __testWorkspaceModeSwitchState: { visible: boolean; busy: boolean }
    requestSwitchToLlmWiki: ReturnType<typeof vi.fn>
    switchToTraditional: ReturnType<typeof vi.fn>
}

/** 记录实例的 ResizeObserver 桩（jsdom 无原生实现） */
class FakeResizeObserver {
    static instances: FakeResizeObserver[] = []

    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()

    constructor(public readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.instances.push(this)
    }

    trigger(): void {
        this.callback([], this as unknown as ResizeObserver)
    }
}

let wrapper: VueWrapper | null = null

beforeEach(() => {
    testWorkspaceModeState.llmWiki = false
    window.localStorage.clear()
    currentWorkspaceLayout.viewMode = 'edit-preview'
    layoutMock.updateCalls.length = 0
    switchMock.requestSwitchToLlmWiki.mockClear()
    switchMock.switchToTraditional.mockClear()
    switchMock.__testWorkspaceModeSwitchState.visible = false
    switchMock.__testWorkspaceModeSwitchState.busy = false
    FakeResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
    currentWorkspaceLayout.viewMode = 'edit-preview'
    layoutMock.updateCalls.length = 0
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

async function mountToolbar(): Promise<VueWrapper> {
    wrapper = mount(MarkdownEditToolsComponent, {
        props: { toolBarWidth: '100%' },
        attachTo: document.body
    })
    await flushPromises()
    return wrapper
}

/** 按钮内部文本（纯图标按钮应为空字符串） */
function buttonText(w: VueWrapper, selector: string): string {
    return w.find(selector).text()
}

/** 当前视图切换按钮的图标 SVG 源码 */
function viewToggleIcon(w: VueWrapper): string {
    return w.find('#workspace-view-mode-toggle svg').html()
}

/** 期望的视图按钮 title：当前 + 目标视图（中英词典对称，按 i18n 实际值断言） */
function expectedViewToggleTitle(
    currentKey: 'currentEdit' | 'currentPreview' | 'currentEditPreview',
    nextKey: 'switchToEdit' | 'switchToPreview' | 'switchToEditPreview'
): string {
    return t('editorUi.viewModeToggle.title', {
        current: t(`editorUi.viewModeToggle.${currentKey}`),
        next: t(`editorUi.viewModeToggle.${nextKey}`)
    })
}

describe('MarkdownEditToolsComponent：视图三态切换按钮（两模式都渲染）', () => {
    it('传统模式：渲染视图按钮与模式按钮；默认 edit-preview → 图标分栏、title 指向「切换到仅编辑」', async () => {
        const w = await mountToolbar()

        const toggle = w.find('#workspace-view-mode-toggle')
        expect(toggle.exists()).toBe(true)
        expect(toggle.element.tagName).toBe('BUTTON')
        expect(toggle.attributes('type')).toBe('button')
        expect(toggle.attributes('data-workspace-view-mode-toggle')).toBe('true')
        expect(toggle.attributes('data-view-mode')).toBe('edit-preview')
        expect(toggle.attributes('title')).toBe(
            expectedViewToggleTitle('currentEditPreview', 'switchToEdit')
        )
        expect(toggle.attributes('aria-label')).toBe(toggle.attributes('title'))
        // 循环式三态按钮不使用 aria-pressed（非开/关语义），当前态由图标 + data-view-mode 表达
        expect(toggle.attributes('aria-pressed')).toBeUndefined()
        // 纯图标：按钮内只有 svg，无文本；默认「编辑+预览」= 分栏图标（rect + 竖分隔线）
        expect(buttonText(w, '#workspace-view-mode-toggle')).toBe('')
        expect(toggle.find('svg').exists()).toBe(true)
        expect(viewToggleIcon(w)).toContain('<rect')
        expect(viewToggleIcon(w)).toContain('M12 4v16')

        // 模式按钮同时渲染在右侧
        expect(w.find('#llm-workspace-mode-toggle').exists()).toBe(true)
    })

    it('点击循环切换 edit-preview → edit → preview → edit-preview：只写单一真源并刷新图标/文案', async () => {
        const w = await mountToolbar()
        const toggle = w.find('#workspace-view-mode-toggle')

        // → 仅编辑（铅笔图标）
        await toggle.trigger('click')
        await nextTick()
        expect(layoutMock.updateCalls).toEqual(['edit'])
        expect(currentWorkspaceLayout.viewMode).toBe('edit')
        expect(w.find('#workspace-view-mode-toggle').attributes('data-view-mode')).toBe('edit')
        expect(w.find('#workspace-view-mode-toggle').attributes('title')).toBe(
            expectedViewToggleTitle('currentEdit', 'switchToPreview')
        )
        expect(viewToggleIcon(w)).toContain('M4 20h4L18.5 9.5')
        expect(viewToggleIcon(w)).not.toContain('<rect')

        // → 仅预览（眼睛图标）
        await toggle.trigger('click')
        await nextTick()
        expect(layoutMock.updateCalls).toEqual(['edit', 'preview'])
        expect(currentWorkspaceLayout.viewMode).toBe('preview')
        expect(w.find('#workspace-view-mode-toggle').attributes('data-view-mode')).toBe('preview')
        expect(w.find('#workspace-view-mode-toggle').attributes('title')).toBe(
            expectedViewToggleTitle('currentPreview', 'switchToEditPreview')
        )
        expect(viewToggleIcon(w)).toContain('<circle')
        expect(viewToggleIcon(w)).not.toContain('<rect')

        // → 回到编辑+预览（分栏图标）
        await toggle.trigger('click')
        await nextTick()
        expect(layoutMock.updateCalls).toEqual(['edit', 'preview', 'edit-preview'])
        expect(currentWorkspaceLayout.viewMode).toBe('edit-preview')
        expect(w.find('#workspace-view-mode-toggle').attributes('title')).toBe(
            expectedViewToggleTitle('currentEditPreview', 'switchToEdit')
        )
        expect(viewToggleIcon(w)).toContain('<rect')

        // 第四次点击继续循环回「仅编辑」
        await toggle.trigger('click')
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('edit')
        expect(layoutMock.updateCalls).toEqual(['edit', 'preview', 'edit-preview', 'edit'])
    })

    it('LLM Wiki 模式：视图按钮同样渲染且循环切换语义一致（不依赖 LLM Wiki 专属 tab 状态）', async () => {
        testWorkspaceModeState.llmWiki = true
        currentWorkspaceLayout.viewMode = 'edit'
        const w = await mountToolbar()

        const toggle = w.find('#workspace-view-mode-toggle')
        expect(toggle.exists()).toBe(true)
        expect(toggle.attributes('data-view-mode')).toBe('edit')

        await toggle.trigger('click')
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('preview')
        expect(layoutMock.updateCalls).toEqual(['preview'])
        // 旧「LLM Wiki 编辑区 tab」持久化键不再被写入（状态已由统一 viewMode 取代）
        expect(window.localStorage.getItem('baize:llm-wiki:editor-tab')).toBeNull()
    })

    it('单一真源被外部改动（视图菜单 F9/F10/F11）时按钮图标/文案同步更新', async () => {
        const w = await mountToolbar()
        expect(w.find('#workspace-view-mode-toggle').attributes('data-view-mode')).toBe(
            'edit-preview'
        )

        currentWorkspaceLayout.viewMode = 'preview'
        await nextTick()
        expect(w.find('#workspace-view-mode-toggle').attributes('data-view-mode')).toBe('preview')
        expect(w.find('#workspace-view-mode-toggle').attributes('title')).toBe(
            expectedViewToggleTitle('currentPreview', 'switchToEditPreview')
        )
    })

    it('非法/损坏的 viewMode 兜底「编辑+预览」，点击后回到合法循环', async () => {
        ;(currentWorkspaceLayout as unknown as { viewMode: string }).viewMode = 'broken-mode'
        const w = await mountToolbar()

        expect(w.find('#workspace-view-mode-toggle').attributes('data-view-mode')).toBe(
            'edit-preview'
        )

        await w.find('#workspace-view-mode-toggle').trigger('click')
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('edit')
        expect(layoutMock.updateCalls).toEqual(['edit'])
    })
})

describe('MarkdownEditToolsComponent：工作区模式快速切换按钮', () => {
    it('传统模式：title=切换到 LLM Wiki 模式，点击请求统一切换流程（确认 + 初始化 + 写配置）', async () => {
        const w = await mountToolbar()
        const modeButton = w.find('#llm-workspace-mode-toggle')

        expect(modeButton.attributes('title')).toBe(t('editorUi.llmWikiPanel.switchToLlmWiki'))
        expect(modeButton.attributes('aria-label')).toBe(t('editorUi.llmWikiPanel.switchToLlmWiki'))
        expect(modeButton.attributes('aria-pressed')).toBe('false')
        expect(modeButton.attributes('data-workspace-mode')).toBe('traditional')
        // 纯图标：按钮内只有 svg，无文本
        expect(buttonText(w, '#llm-workspace-mode-toggle')).toBe('')
        expect(modeButton.find('svg').exists()).toBe(true)

        await modeButton.trigger('click')
        await flushPromises()

        expect(switchMock.requestSwitchToLlmWiki).toHaveBeenCalledTimes(1)
        expect(switchMock.switchToTraditional).not.toHaveBeenCalled()
    })

    it('LLM Wiki 模式：title=切换到传统模式，点击直接切换到传统模式', async () => {
        testWorkspaceModeState.llmWiki = true
        const w = await mountToolbar()
        const modeButton = w.find('#llm-workspace-mode-toggle')

        expect(modeButton.attributes('title')).toBe(t('editorUi.llmWikiPanel.switchToTraditional'))
        expect(modeButton.attributes('aria-pressed')).toBe('true')
        expect(modeButton.attributes('data-workspace-mode')).toBe('llm-wiki')

        await modeButton.trigger('click')
        await flushPromises()

        expect(switchMock.switchToTraditional).toHaveBeenCalledTimes(1)
        expect(switchMock.requestSwitchToLlmWiki).not.toHaveBeenCalled()
    })
})

describe('MarkdownEditToolsComponent：右侧按钮区布局与自适应', () => {
    it('右侧按钮区在快速访问区之后渲染（右侧常驻、不参与左侧收缩）', async () => {
        const w = await mountToolbar()
        const container = w.find('.toolbar-container').element
        const children = Array.from(container.children).map((child) => child.className)
        expect(children).toEqual(['toolbar-quick-access', 'toolbar-actions'])

        // 快捷访问按钮数量不变（既有格式按钮全保留）
        expect(w.findAll('.tool-btn')).toHaveLength(3)
        expect(w.find('.toolbar-actions').attributes('data-toolbar-llm-wiki-actions')).toBe('')
        // 右侧两个图标按钮：视图三态切换 + 工作区模式切换（顺序稳定）
        const actions = Array.from(w.find('.toolbar-actions').element.children).map(
            (child) => child.id
        )
        expect(actions).toEqual(['workspace-view-mode-toggle', 'llm-workspace-mode-toggle'])
    })

    it('按钮尺寸计算扣除右侧按钮区宽度（右侧区始终可见，不被工具栏裁剪）', async () => {
        const w = await mountToolbar()
        const container = w.find('.toolbar-container').element
        const actions = w.find('.toolbar-actions').element
        Object.defineProperty(container, 'clientWidth', { configurable: true, value: 1000 })
        Object.defineProperty(actions, 'offsetWidth', { configurable: true, value: 960 })

        FakeResizeObserver.instances[0]!.trigger()
        await nextTick()

        // 可用宽度 = 1000 - 960 = 40 → (40 - 2*2) / 3 ≈ 12 → 夹到下限 20px
        expect(w.find('.tool-btn').attributes('style')).toContain('width: 20px')
    })

    it('宽度充足时格式按钮维持既有上限尺寸（扣除右侧区后仍可最大）', async () => {
        const w = await mountToolbar()
        const container = w.find('.toolbar-container').element
        const actions = w.find('.toolbar-actions').element
        Object.defineProperty(container, 'clientWidth', { configurable: true, value: 1000 })
        Object.defineProperty(actions, 'offsetWidth', { configurable: true, value: 100 })

        FakeResizeObserver.instances[0]!.trigger()
        await nextTick()

        // (900 - 4) / 3 ≈ 298 → 上限 35px
        expect(w.find('.tool-btn').attributes('style')).toContain('width: 35px')
    })

    it('工具栏宽度 prop 变化时重新计算格式按钮尺寸（既有行为保留）', async () => {
        const w = await mountToolbar()

        await w.setProps({ toolBarWidth: '50%' })
        await nextTick()

        // jsdom 中 clientWidth 为 0 → 下限 20px（不抛错）
        expect(w.find('.tool-btn').attributes('style')).toContain('width: 20px')
    })
})

describe('MarkdownEditToolsComponent：图标与令牌静态契约（体验微调 A5）', () => {
    it('右侧按钮为纯图标（24 网格 / stroke 1.5 / currentColor），布局与交互走 --ui-* 令牌', () => {
        const source = fs.readFileSync(
            path.resolve(
                __dirname,
                '../../../src/renderer/src/components/Markdown/MarkdownEditToolsComponent.vue'
            ),
            'utf8'
        )
        // 按钮均无文字内容节点：模板中按钮内只有 svg 与注释
        expect(source).not.toMatch(/>\s*(切换到|编辑器|预览|传统|LLM Wiki|仅编辑)\s*</)
        expect(source).toContain('viewBox="0 0 24 24"')
        expect(source).toContain('stroke-width="1.5"')
        expect(source).toContain('stroke="currentColor"')
        expect(source).toContain('aria-hidden="true"')
        // 视图三态按钮：两模式都渲染（无 v-if="isLlmWikiMode" 包裹），点击只写单一真源
        expect(source).toContain('id="workspace-view-mode-toggle"')
        expect(source).toContain('data-workspace-view-mode-toggle="true"')
        expect(source).toContain(':data-view-mode="currentViewMode"')
        expect(source).toContain('@click="cycleWorkspaceViewMode"')
        expect(source).toContain('updateCurrentWorkspaceViewMode(nextViewMode.value)')
        // 三种当前视图图标：铅笔 / 眼睛 / 分栏
        expect(source).toContain('M4 20h4L18.5 9.5')
        expect(source).toContain('M2 12s3.5-7 10-7')
        expect(source).toContain('<rect x="3" y="4" width="18" height="16" rx="2" />')
        // 模式切换复用统一 composable（与系统设置同样处理）
        expect(source).toContain('requestSwitchToLlmWiki')
        expect(source).toContain('switchToTraditional')
        // 旧 LLM Wiki 专属 tab 依赖已彻底移除
        expect(source).not.toContain('llm-wiki-workbench')
        expect(source).not.toContain('llm-editor-view-toggle')
        // 右侧区域布局：不收缩 + 靠右；左侧区域可收缩
        const actionsBlock = source.slice(source.indexOf('.toolbar-actions {'))
        expect(actionsBlock).toContain('flex: 0 0 auto')
        expect(actionsBlock).toContain('margin-left: auto')
        const quickBlock = source.slice(source.indexOf('.toolbar-quick-access {'))
        expect(quickBlock).toContain('flex: 1 1 auto')
        expect(quickBlock).toContain('min-width: 0')
        // 按钮样式：hover / 激活 / 焦点环全部走 --ui-* 令牌，不写死颜色
        const actionButtonBlock = source.slice(source.indexOf('.toolbar-action-btn {'))
        expect(actionButtonBlock).toContain('var(--ui-row-height')
        expect(actionButtonBlock).toContain('var(--ui-radius-sm')
        expect(source).toContain('var(--ui-accent-soft')
        expect(source).toContain('var(--ui-focus-shadow)')
        expect(source).toContain('var(--ui-duration-fast')
    })
})
