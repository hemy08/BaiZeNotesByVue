// @vitest-environment jsdom
/**
 * 1.5.7 体验微调（用户反馈批次 A4）：编辑工具条右侧图标按钮。
 *
 * 覆盖：
 * 1. 编辑器/预览切换按钮：仅 LLM Wiki 模式下渲染，纯图标（无文字），title/aria 随当前
 *    tab 指向目标动作，点击切换共享 tab 状态并持久化；
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
import {
    LLM_WIKI_EDITOR_TAB_STORAGE_KEY,
    llmWikiWorkbenchState,
    resetLlmWikiWorkbenchStateForTesting,
    setLlmWikiEditorTab
} from '../../../src/renderer/src/components/llm-wiki/llm-wiki-workbench'

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
    resetLlmWikiWorkbenchStateForTesting()
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
    resetLlmWikiWorkbenchStateForTesting()
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

describe('MarkdownEditToolsComponent：传统模式（仅模式快速切换按钮）', () => {
    it('只渲染模式切换图标按钮：无文字、aria/title 指向「切换到 LLM Wiki 模式」', async () => {
        const w = await mountToolbar()

        expect(w.find('#llm-editor-view-toggle').exists()).toBe(false)
        const modeButton = w.find('#llm-workspace-mode-toggle')
        expect(modeButton.exists()).toBe(true)
        expect(modeButton.element.tagName).toBe('BUTTON')
        expect(modeButton.attributes('type')).toBe('button')
        expect(modeButton.attributes('title')).toBe(t('editorUi.llmWikiPanel.switchToLlmWiki'))
        expect(modeButton.attributes('aria-label')).toBe(t('editorUi.llmWikiPanel.switchToLlmWiki'))
        expect(modeButton.attributes('aria-pressed')).toBe('false')
        expect(modeButton.attributes('data-workspace-mode')).toBe('traditional')
        // 纯图标：按钮内只有 svg，无文本
        expect(buttonText(w, '#llm-workspace-mode-toggle')).toBe('')
        expect(modeButton.find('svg').exists()).toBe(true)
    })

    it('点击模式按钮：请求统一切换流程（确认 + 初始化 + 写配置），不直接切换配置', async () => {
        const w = await mountToolbar()

        await w.find('#llm-workspace-mode-toggle').trigger('click')
        await flushPromises()

        expect(switchMock.requestSwitchToLlmWiki).toHaveBeenCalledTimes(1)
        expect(switchMock.switchToTraditional).not.toHaveBeenCalled()
    })
})

describe('MarkdownEditToolsComponent：LLM Wiki 模式（编辑器/预览 + 模式切换）', () => {
    beforeEach(() => {
        testWorkspaceModeState.llmWiki = true
    })

    it('默认编辑器 tab：切换按钮 title=切换到预览，点击切到预览并持久化', async () => {
        const w = await mountToolbar()
        const toggle = w.find('#llm-editor-view-toggle')
        expect(toggle.exists()).toBe(true)
        expect(toggle.attributes('title')).toBe(t('editorUi.llmWikiPanel.switchToPreview'))
        expect(toggle.attributes('aria-label')).toBe(t('editorUi.llmWikiPanel.switchToPreview'))
        expect(toggle.attributes('aria-pressed')).toBe('false')
        expect(toggle.attributes('data-active-tab')).toBe('editor')
        expect(buttonText(w, '#llm-editor-view-toggle')).toBe('')

        await toggle.trigger('click')
        await nextTick()
        await nextTick()

        expect(llmWikiWorkbenchState.editorTab).toBe('preview')
        expect(window.localStorage.getItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)).toBe('preview')
        const updated = w.find('#llm-editor-view-toggle')
        expect(updated.attributes('title')).toBe(t('editorUi.llmWikiPanel.switchToEditor'))
        expect(updated.attributes('aria-pressed')).toBe('true')
        expect(updated.attributes('data-active-tab')).toBe('preview')
    })

    it('预览 tab 下点击切换回编辑器（tab 状态双向切换）', async () => {
        setLlmWikiEditorTab('preview')
        const w = await mountToolbar()

        expect(w.find('#llm-editor-view-toggle').attributes('title')).toBe(
            t('editorUi.llmWikiPanel.switchToEditor')
        )
        await w.find('#llm-editor-view-toggle').trigger('click')
        await nextTick()

        expect(llmWikiWorkbenchState.editorTab).toBe('editor')
        expect(window.localStorage.getItem(LLM_WIKI_EDITOR_TAB_STORAGE_KEY)).toBe('editor')
    })

    it('模式切换按钮：title=切换到传统模式，点击直接切换到传统模式', async () => {
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

    it('模式切换为传统后按钮即时卸载（状态变化防御分支：传统模式下 tab 按钮不生效）', async () => {
        const w = await mountToolbar()
        const toggle = w.find('#llm-editor-view-toggle').element as HTMLButtonElement

        // 同一 tick 内切回传统模式：按钮尚未从 DOM 移除，点击命中「非 LLM Wiki 模式」防御分支
        testWorkspaceModeState.llmWiki = false
        toggle.click()
        await nextTick()
        await nextTick()

        expect(llmWikiWorkbenchState.editorTab).toBe('editor')
        expect(w.find('#llm-editor-view-toggle').exists()).toBe(false)
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

describe('MarkdownEditToolsComponent：图标与令牌静态契约（体验微调 A4）', () => {
    it('右侧按钮为纯图标（24 网格 / stroke 1.5 / currentColor），布局与交互走 --ui-* 令牌', () => {
        const source = fs.readFileSync(
            path.resolve(
                __dirname,
                '../../../src/renderer/src/components/Markdown/MarkdownEditToolsComponent.vue'
            ),
            'utf8'
        )
        // 两个按钮均无文字内容节点：模板中按钮内只有 svg 与注释
        expect(source).not.toMatch(/>\s*(切换到|编辑器|预览|传统|LLM Wiki)\s*</)
        expect(source).toContain('viewBox="0 0 24 24"')
        expect(source).toContain('stroke-width="1.5"')
        expect(source).toContain('stroke="currentColor"')
        expect(source).toContain('aria-hidden="true"')
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
