// @vitest-environment jsdom
/**
 * 1.5.7 体验修正（用户反馈批次 A6）：菜单栏右侧视图 / 工作区模式快捷按钮。
 *
 * 背景：用户反馈「两个切换按钮应该挪到菜单栏右侧，而不是编辑器工具栏的右侧」。按钮从
 * `MarkdownEditToolsComponent.vue`（编辑格式工具条）迁移到 `MenuBar.vue` 的
 * `.menu-bar-actions`，DOM id / data-* 契约保持不变，便于既有主题/测试继续定位。
 *
 * 覆盖：
 * 1. 渲染：两个纯图标按钮位于菜单项之后（菜单栏右侧），DOM id / data-* / aria 契约不变；
 *    传统模式与 LLM Wiki 模式都常显；
 * 2. 视图三态：点击按「编辑 → 预览 → 编辑+预览 → 编辑」循环，只写 workspace-layout 单一
 *    真源（updateCurrentWorkspaceViewMode），图标与 title 随当前视图刷新，外部改动同步；
 * 3. 模式切换：传统 → LLM Wiki 请求统一确认流程（requestSwitchToLlmWiki），
 *    LLM Wiki → 传统直接写配置（switchToTraditional）；
 * 4. 键盘与无障碍隔离：按钮容器 @keydown.stop，方向键 / Home / End / Esc 不冒泡到菜单栏
 *    根处理器（不移动菜单焦点、不展开下拉）；Tab 可达、Enter/Space 走原生激活；
 *    Alt 激活态下按钮仍可用且不参与 roving tabindex / Alt+字母助记符；
 * 5. 点击右侧按钮会收起已展开的顶层菜单（点击发生在菜单栏内部，外部点击关闭不触发）；
 * 6. 静态契约：布局（margin-left:auto / flex:0 0 auto / gap:4px / padding:0 8px）、
 *    颜色/尺寸/焦点全部走 --ui-* 令牌、图标 24 网格 stroke 1.5 currentColor。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import * as fs from 'fs'
import * as path from 'path'
import { nextTick } from 'vue'
import { t } from '../../../src/renderer/src/common/i18n'

// ============ 菜单动作替身：本文件不打开子菜单项动作，避免拉起真实动作链路 ============
const handleMenuActionMock = vi.hoisted(() => vi.fn())
vi.mock('@renderer/components/MenuBar/menu-actions', () => ({
    HandleMenuAction: handleMenuActionMock
}))

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

import MenuBar from '@renderer/components/MenuBar.vue'
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

let wrapper: VueWrapper | null = null

function stubShellGlobals(): void {
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: vi.fn(),
            removeListener: vi.fn(),
            send: vi.fn(),
            invoke: vi.fn().mockResolvedValue(undefined)
        }
    })
    vi.stubGlobal('api', {
        config: { read: vi.fn().mockResolvedValue({}) }
    })
}

beforeEach(() => {
    stubShellGlobals()
    testWorkspaceModeState.llmWiki = false
    currentWorkspaceLayout.viewMode = 'edit-preview'
    layoutMock.updateCalls.length = 0
    switchMock.requestSwitchToLlmWiki.mockClear()
    switchMock.switchToTraditional.mockClear()
    switchMock.__testWorkspaceModeSwitchState.visible = false
    switchMock.__testWorkspaceModeSwitchState.busy = false
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

/** 挂载菜单栏（挂到真实 DOM：键盘焦点断言依赖 document.activeElement） */
async function mountMenuBar(): Promise<VueWrapper> {
    wrapper = mount(MenuBar, { attachTo: document.body })
    await flushPromises()
    return wrapper
}

/** 菜单栏根节点（role=menubar，右侧操作区是其直接子节点） */
function menubarRoot(w: VueWrapper) {
    return w.find('[role="menubar"]')
}

/** 右侧操作区容器 */
function actions(w: VueWrapper) {
    return w.find('.menu-bar-actions')
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

/** 向元素派发键盘事件（bubbles=true，模拟真实按键冒泡） */
function pressKey(target: Element, key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init })
    target.dispatchEvent(event)
    return event
}

describe('MenuBar 右侧操作区：渲染与位置契约', () => {
    it('两个纯图标按钮渲染在菜单项之后（菜单栏右侧），DOM id / data-* / aria 契约不变', async () => {
        const w = await mountMenuBar()

        // 操作区是 [role=menubar] 的直接子节点，且位于全部菜单项之后（菜单栏右侧）
        const bar = menubarRoot(w)
        const actionArea = actions(w)
        expect(actionArea.exists()).toBe(true)
        expect(actionArea.element.parentElement).toBe(bar.element)
        expect(actionArea.attributes('data-menu-bar-actions')).toBe('')
        const elementChildren = Array.from(bar.element.children)
        expect(elementChildren[elementChildren.length - 1]).toBe(actionArea.element)
        expect(bar.findAll('.menu-item')).toHaveLength(12)

        // 操作区内两个按钮顺序稳定：视图三态切换 → 工作区模式切换
        const actionChildren = Array.from(actionArea.element.children).map((child) => child.id)
        expect(actionChildren).toEqual(['workspace-view-mode-toggle', 'llm-workspace-mode-toggle'])

        // 视图三态按钮：纯图标、非开关语义（循环按钮不用 aria-pressed）
        const viewToggle = w.find('#workspace-view-mode-toggle')
        expect(viewToggle.element.tagName).toBe('BUTTON')
        expect(viewToggle.attributes('type')).toBe('button')
        expect(viewToggle.classes()).toContain('menu-bar-action')
        expect(viewToggle.attributes('data-workspace-view-mode-toggle')).toBe('true')
        expect(viewToggle.attributes('data-view-mode')).toBe('edit-preview')
        expect(viewToggle.attributes('title')).toBe(
            expectedViewToggleTitle('currentEditPreview', 'switchToEdit')
        )
        expect(viewToggle.attributes('aria-label')).toBe(viewToggle.attributes('title'))
        expect(viewToggle.attributes('aria-pressed')).toBeUndefined()
        expect(buttonText(w, '#workspace-view-mode-toggle')).toBe('')
        expect(viewToggle.find('svg').exists()).toBe(true)
        expect(viewToggle.html()).toContain('aria-hidden="true"')

        // 模式按钮：纯图标、aria-pressed 表达当前是否 LLM Wiki 模式
        const modeToggle = w.find('#llm-workspace-mode-toggle')
        expect(modeToggle.element.tagName).toBe('BUTTON')
        expect(modeToggle.attributes('type')).toBe('button')
        expect(modeToggle.classes()).toContain('menu-bar-action')
        expect(modeToggle.attributes('data-workspace-mode-toggle')).toBe('true')
        expect(modeToggle.attributes('data-workspace-mode')).toBe('traditional')
        expect(modeToggle.attributes('title')).toBe(t('editorUi.llmWikiPanel.switchToLlmWiki'))
        expect(modeToggle.attributes('aria-label')).toBe(t('editorUi.llmWikiPanel.switchToLlmWiki'))
        expect(modeToggle.attributes('aria-pressed')).toBe('false')
        expect(buttonText(w, '#llm-workspace-mode-toggle')).toBe('')
        expect(modeToggle.find('svg').exists()).toBe(true)

        // 不参与菜单栏 roving tabindex / 助记符：无 tabindex / role=menuitem / data-mnemonic
        for (const selector of ['#workspace-view-mode-toggle', '#llm-workspace-mode-toggle']) {
            const button = w.find(selector)
            expect(button.attributes('tabindex')).toBeUndefined()
            expect(button.attributes('role')).toBeUndefined()
            expect(button.attributes('data-mnemonic')).toBeUndefined()
        }
    })

    it('LLM Wiki 模式下两个按钮同样常显，模式按钮语义切换为「切换到传统模式」', async () => {
        testWorkspaceModeState.llmWiki = true
        const w = await mountMenuBar()

        expect(w.find('#workspace-view-mode-toggle').exists()).toBe(true)
        const modeToggle = w.find('#llm-workspace-mode-toggle')
        expect(modeToggle.exists()).toBe(true)
        expect(modeToggle.attributes('data-workspace-mode')).toBe('llm-wiki')
        expect(modeToggle.attributes('aria-pressed')).toBe('true')
        expect(modeToggle.attributes('title')).toBe(t('editorUi.llmWikiPanel.switchToTraditional'))
    })
})

describe('MenuBar 右侧操作区：视图三态切换', () => {
    it('点击循环 edit-preview → edit → preview → edit-preview：只写单一真源并刷新图标/文案', async () => {
        const w = await mountMenuBar()
        const viewToggle = w.find('#workspace-view-mode-toggle')

        // 默认「编辑+预览」= 分栏图标（rect + 竖分隔线）
        expect(viewToggleIcon(w)).toContain('<rect')
        expect(viewToggleIcon(w)).toContain('M12 4v16')

        // → 仅编辑（铅笔图标）
        await viewToggle.trigger('click')
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
        await viewToggle.trigger('click')
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
        await viewToggle.trigger('click')
        await nextTick()
        expect(layoutMock.updateCalls).toEqual(['edit', 'preview', 'edit-preview'])
        expect(currentWorkspaceLayout.viewMode).toBe('edit-preview')
        expect(viewToggleIcon(w)).toContain('<rect')

        // 第四次点击继续循环回「仅编辑」
        await viewToggle.trigger('click')
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('edit')
        expect(layoutMock.updateCalls).toEqual(['edit', 'preview', 'edit-preview', 'edit'])
    })

    it('单一真源被外部改动（视图菜单 F9/F10/F11）时按钮图标/文案同步更新', async () => {
        const w = await mountMenuBar()
        expect(w.find('#workspace-view-mode-toggle').attributes('data-view-mode')).toBe(
            'edit-preview'
        )

        currentWorkspaceLayout.viewMode = 'preview'
        await nextTick()
        expect(w.find('#workspace-view-mode-toggle').attributes('data-view-mode')).toBe('preview')
        expect(w.find('#workspace-view-mode-toggle').attributes('title')).toBe(
            expectedViewToggleTitle('currentPreview', 'switchToEditPreview')
        )
        expect(viewToggleIcon(w)).toContain('<circle')
    })

    it('非法/损坏的 viewMode 兜底「编辑+预览」，点击后回到合法循环', async () => {
        ;(currentWorkspaceLayout as unknown as { viewMode: string }).viewMode = 'broken-mode'
        const w = await mountMenuBar()

        expect(w.find('#workspace-view-mode-toggle').attributes('data-view-mode')).toBe(
            'edit-preview'
        )
        expect(viewToggleIcon(w)).toContain('<rect')

        await w.find('#workspace-view-mode-toggle').trigger('click')
        await nextTick()
        expect(currentWorkspaceLayout.viewMode).toBe('edit')
        expect(layoutMock.updateCalls).toEqual(['edit'])
    })
})

describe('MenuBar 右侧操作区：传统 / LLM Wiki 模式快速切换', () => {
    it('传统模式：点击请求统一切换流程（确认 + 初始化 + 写配置）', async () => {
        const w = await mountMenuBar()
        const modeToggle = w.find('#llm-workspace-mode-toggle')

        await modeToggle.trigger('click')
        await flushPromises()

        expect(switchMock.requestSwitchToLlmWiki).toHaveBeenCalledTimes(1)
        expect(switchMock.switchToTraditional).not.toHaveBeenCalled()
    })

    it('LLM Wiki 模式：点击直接切换到传统模式', async () => {
        testWorkspaceModeState.llmWiki = true
        const w = await mountMenuBar()
        const modeToggle = w.find('#llm-workspace-mode-toggle')

        expect(modeToggle.attributes('aria-pressed')).toBe('true')
        await modeToggle.trigger('click')
        await flushPromises()

        expect(switchMock.switchToTraditional).toHaveBeenCalledTimes(1)
        expect(switchMock.requestSwitchToLlmWiki).not.toHaveBeenCalled()
    })

    it('点击右侧按钮会收起已展开的顶层菜单（菜单栏内部点击不触发外部关闭）', async () => {
        const w = await mountMenuBar()
        await w.findAll('.menu-item')[0].trigger('click')
        await flushPromises()
        expect(document.querySelector('.submenu-container')).not.toBeNull()

        await w.find('#llm-workspace-mode-toggle').trigger('click')
        await flushPromises()
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(switchMock.requestSwitchToLlmWiki).toHaveBeenCalledTimes(1)

        // 视图按钮同理：先重新打开下拉，再点击视图切换
        await w.findAll('.menu-item')[0].trigger('click')
        await flushPromises()
        expect(document.querySelector('.submenu-container')).not.toBeNull()
        await w.find('#workspace-view-mode-toggle').trigger('click')
        await flushPromises()
        expect(document.querySelector('.submenu-container')).toBeNull()
        expect(layoutMock.updateCalls).toHaveLength(1)
    })
})

describe('MenuBar 右侧操作区：键盘与无障碍隔离', () => {
    it('按钮上的方向键 / Home / End / Esc 不冒泡到菜单栏，不移动焦点、不展开下拉', async () => {
        const w = await mountMenuBar()
        const bar = menubarRoot(w)
        const viewButton = w.find('#workspace-view-mode-toggle').element as HTMLButtonElement
        viewButton.focus()
        expect(document.activeElement).toBe(viewButton)

        // 记录根节点收到的 keydown：容器 @keydown.stop 后不应再收到来自操作区的事件
        const rootKeydownSpy = vi.fn()
        bar.element.addEventListener('keydown', rootKeydownSpy)

        const items = w.findAll('.menu-item')
        for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End']) {
            const event = pressKey(viewButton, key)
            await nextTick()
            expect(event.defaultPrevented, `方向键 ${key} 不应被菜单栏消费`).toBe(false)
            expect(document.activeElement).toBe(viewButton)
            expect(document.querySelector('.submenu-container')).toBeNull()
            // roving tabindex 未被方向键改写
            expect(items[0].attributes('tabindex')).toBe('0')
            expect(items[1].attributes('tabindex')).toBe('-1')
        }

        // Esc 不触发「关闭下拉 / 退出 Alt 激活」等菜单栏语义
        const escEvent = pressKey(viewButton, 'Escape')
        await nextTick()
        expect(escEvent.defaultPrevented).toBe(false)
        expect(document.activeElement).toBe(viewButton)
        expect(bar.classes()).not.toContain('menu-bar--alt-active')

        expect(rootKeydownSpy).not.toHaveBeenCalled()
        bar.element.removeEventListener('keydown', rootKeydownSpy)
    })

    it('Tab/Enter/Space 不被菜单栏消费（Tab 原生移出、Enter/Space 走原生按钮激活）', async () => {
        const w = await mountMenuBar()
        const viewButton = w.find('#workspace-view-mode-toggle').element as HTMLButtonElement
        viewButton.focus()

        for (const key of ['Tab', 'Enter', ' ']) {
            const event = pressKey(viewButton, key)
            expect(event.defaultPrevented, `按键 ${key} 不应被菜单栏消费`).toBe(false)
        }
        // 按钮仍在焦点上（Tab 的焦点移动由浏览器完成，jsdom 不实现）
        expect(document.activeElement).toBe(viewButton)
        expect(document.querySelector('.submenu-container')).toBeNull()
    })

    it('Alt 激活态下两个按钮仍可用，且不参与 roving tabindex / Alt+字母助记符', async () => {
        const w = await mountMenuBar()
        pressKey(document.body, 'Alt', { altKey: true })
        await nextTick()
        const bar = menubarRoot(w)
        expect(bar.classes()).toContain('menu-bar--alt-active')

        const viewButton = w.find('#workspace-view-mode-toggle')
        const modeButton = w.find('#llm-workspace-mode-toggle')
        expect(viewButton.attributes('tabindex')).toBeUndefined()
        expect(modeButton.attributes('tabindex')).toBeUndefined()

        // Alt+字母助记符不作用于操作区按钮（事件被 @keydown.stop 隔离，不打开菜单）
        const mnemonicEvent = pressKey(viewButton.element, 'f', { altKey: true })
        await flushPromises()
        expect(mnemonicEvent.defaultPrevented).toBe(false)
        expect(document.querySelector('.submenu-container')).toBeNull()

        // 激活态下点击两个按钮均正常执行
        await viewButton.trigger('click')
        await nextTick()
        expect(layoutMock.updateCalls).toEqual(['edit'])
        await modeButton.trigger('click')
        await flushPromises()
        expect(switchMock.requestSwitchToLlmWiki).toHaveBeenCalledTimes(1)
    })
})

describe('MenuBar 右侧操作区：静态契约与四风格 × 三密度适配', () => {
    it('布局/尺寸/颜色/焦点全部走令牌，图标为纯图标（24 网格 / stroke 1.5 / currentColor）', () => {
        const source = fs
            .readFileSync(
                path.resolve(__dirname, '../../../src/renderer/src/components/MenuBar.vue'),
                'utf8'
            )
            .replace(/\r\n/g, '\n')

        // 操作区：菜单项之后、靠右、不收缩、不换行（窄窗时菜单项按既有 flex 行为收缩）
        expect(source).toMatch(/<div class="menu-bar-actions"[^>]*@keydown\.stop/)
        const actionsBlock = source.match(/\.menu-bar-actions\s*\{[\s\S]*?\}/)?.[0] ?? ''
        expect(actionsBlock).toContain('display: flex')
        expect(actionsBlock).toContain('flex: 0 0 auto')
        expect(actionsBlock).toContain('margin-left: auto')
        expect(actionsBlock).toContain('gap: 4px')
        expect(actionsBlock).toContain('padding: 0 8px')
        const menuBarBlock = source.match(/\.menu-bar\s*\{[\s\S]*?\}/)?.[0] ?? ''
        expect(menuBarBlock).toContain('display: flex')

        // 按钮：尺寸随密度行高、圆角/焦点/动效走令牌（不写死颜色/尺寸分支）
        const buttonBlock = source.match(/\.menu-bar-action\s*\{[\s\S]*?\}/)?.[0] ?? ''
        expect(buttonBlock).toContain('var(--ui-row-height')
        expect(buttonBlock).toContain('var(--ui-radius-sm')
        expect(buttonBlock).toContain('var(--ui-hairline-width')
        expect(buttonBlock).toContain('var(--ui-duration-fast')
        expect(buttonBlock).toContain('var(--ui-ease-standard')
        expect(buttonBlock).toContain('var(--ui-text')
        expect(source).toContain('.menu-bar-action:hover')
        expect(source).toContain('var(--ui-accent-soft')
        expect(source).toContain('.menu-bar-action:focus-visible')
        expect(source).toContain('var(--ui-focus-shadow)')
        expect(source).toContain(".menu-bar-action[aria-pressed='true']")
        expect(source).toContain('var(--ui-accent)')
        expect(source).toContain('height: 18px')

        // 纯图标：无文字节点，24 网格 stroke 1.5 currentColor + aria-hidden
        expect(source).not.toMatch(/>\s*(切换到|编辑器|预览|传统|LLM Wiki|仅编辑)\s*</)
        expect(source).toContain('viewBox="0 0 24 24"')
        expect(source).toContain('stroke-width="1.5"')
        expect(source).toContain('stroke="currentColor"')
        expect(source).toContain('aria-hidden="true"')

        // DOM id / data-* / 单一真源调用契约保持（迁移不改变对外标识）
        expect(source).toContain('id="workspace-view-mode-toggle"')
        expect(source).toContain('data-workspace-view-mode-toggle="true"')
        expect(source).toContain(':data-view-mode="currentViewMode"')
        expect(source).toContain('id="llm-workspace-mode-toggle"')
        expect(source).toContain('data-workspace-mode-toggle="true"')
        expect(source).toContain(':data-workspace-mode="isLlmWikiMode ? ')
        expect(source).toContain('updateCurrentWorkspaceViewMode(nextViewMode.value)')
        expect(source).toContain('requestSwitchToLlmWiki')
        expect(source).toContain('switchToTraditional')

        // 组件内不得写风格 / 密度分支（UI-15：唯一入口 useTheme）
        expect(source).not.toMatch(/data-(style|density)\s*[=\]]/)
    })
})
