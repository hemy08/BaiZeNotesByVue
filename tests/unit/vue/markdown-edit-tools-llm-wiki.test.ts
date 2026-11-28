// @vitest-environment jsdom
/**
 * 1.5.7 体验修正（用户反馈批次 A6）：视图 / 工作区模式切换按钮已从编辑工具条迁移到菜单栏。
 *
 * 背景：批次 A5 曾在 `MarkdownEditToolsComponent.vue` 工具条右侧放置「视图三态切换 +
 * 传统 / LLM Wiki 模式切换」两个按钮；用户反馈要求挪到顶部菜单栏右侧（不是编辑器工具栏
 * 右侧），本批次迁移到 `MenuBar.vue` 的 `.menu-bar-actions`（交互/图标/DOM 契约测试见
 * `tests/unit/vue/menubar-actions.test.ts`）。
 *
 * 本文件覆盖：
 * 1. 工具条不再渲染两个迁移按钮与右侧操作区（DOM 断言 + 源码断言，防止旧入口回流导致
 *    出现两个入口）；
 * 2. 右侧宽度扣除逻辑已移除：按钮尺寸只按工具条自身 clientWidth 计算；
 * 3. 既有格式快捷按钮渲染 / SVG 注入 / 加粗等激活态 / 自适应尺寸行为保持不变。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import * as fs from 'fs'
import * as path from 'path'
import { nextTick } from 'vue'

// ============ 最小 QuickAccess 桩（只保留模板字段，不引入 Monaco 依赖） ============
const { quickAccessMock } = vi.hoisted(() => {
    const makeItem = (id: string, param: string) => ({
        id,
        titleKey: `editorUi.toolbar.${id}`,
        class: `tool-${id}`,
        clickFn: vi.fn(),
        param,
        svg: '<svg viewBox="0 0 24 24"><path d="M0 0" /></svg>'
    })
    return {
        quickAccessMock: {
            bold: makeItem('bold', 'bold'),
            italic: makeItem('italic', 'italic'),
            underline: makeItem('underline', 'underline')
        }
    }
})

vi.mock('@renderer/components/Markdown/hemy-editor-quick-access', () => ({
    MdEditQuickAccess: quickAccessMock
}))

import MarkdownEditToolsComponent from '@renderer/components/Markdown/MarkdownEditToolsComponent.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'

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
    FakeResizeObserver.instances = []
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
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

/** 组件源码（去掉 CRLF，便于跨平台断言） */
function componentSource(): string {
    return fs
        .readFileSync(
            path.resolve(
                __dirname,
                '../../../src/renderer/src/components/Markdown/MarkdownEditToolsComponent.vue'
            ),
            'utf8'
        )
        .replace(/\r\n/g, '\n')
}

describe('MarkdownEditToolsComponent：视图/模式按钮迁移（A6）后的工具条 DOM', () => {
    it('工具条只渲染格式快捷按钮：两个迁移按钮与右侧操作区均不再存在', async () => {
        const w = await mountToolbar()

        expect(w.find('#workspace-view-mode-toggle').exists()).toBe(false)
        expect(w.find('#llm-workspace-mode-toggle').exists()).toBe(false)
        expect(w.find('.toolbar-actions').exists()).toBe(false)
        expect(w.find('[data-toolbar-llm-wiki-actions]').exists()).toBe(false)

        // 仅剩左侧格式按钮区（唯一子节点）
        const container = w.find('.toolbar-container').element
        expect(Array.from(container.children).map((child) => child.className)).toEqual([
            'toolbar-quick-access'
        ])
        expect(w.findAll('.tool-btn')).toHaveLength(3)
    })

    it('源码不再引用视图/模式切换能力（迁移后不保留第二入口）', () => {
        const source = componentSource()

        for (const removed of [
            'workspace-view-mode-toggle',
            'llm-workspace-mode-toggle',
            'data-workspace-view-mode-toggle',
            'data-workspace-mode-toggle',
            'data-toolbar-llm-wiki-actions',
            'toolbarActions',
            'toolbar-actions',
            'toolbar-action-btn',
            'useWorkspaceMode',
            'useWorkspaceModeSwitch',
            'workspace-layout',
            'updateCurrentWorkspaceViewMode',
            'requestSwitchToLlmWiki',
            'switchToTraditional',
            'cycleWorkspaceViewMode',
            'handleWorkspaceModeToggle',
            'actionsWidth',
            'offsetWidth'
        ]) {
            expect(source, `迁移后不应残留 ${removed}`).not.toContain(removed)
        }

        // 格式按钮区仍保留既有自适应契约（可收缩 + 最小宽度 0）
        const quickBlock = source.match(/\.toolbar-quick-access\s*\{[\s\S]*?\}/)?.[0] ?? ''
        expect(quickBlock).toContain('flex: 1 1 auto')
        expect(quickBlock).toContain('min-width: 0')
    })
})

describe('MarkdownEditToolsComponent：格式快捷按钮既有行为（A6 迁移未回归）', () => {
    it('渲染全部格式按钮并注入内联 SVG（既有 initButtonSvg 行为保留）', async () => {
        await mountToolbar()
        const buttons = document.querySelectorAll<HTMLElement>('.tool-btn')
        expect(buttons).toHaveLength(3)
        expect(buttons[0]!.id).toBe('bold')
        expect(buttons[0]!.title).toBeTruthy()
        // onMounted 把 QuickAccess.svg 写入按钮 innerHTML
        expect(buttons[0]!.innerHTML).toContain('<svg viewBox="0 0 24 24">')
        expect(buttons[1]!.innerHTML).toContain('<svg viewBox="0 0 24 24">')
    })

    it('编辑格式状态广播时同步按钮激活态（加粗/斜体；未映射参数保持非激活）', async () => {
        const w = await mountToolbar()

        EventBus.$emit(EVENT_BUS.MONACO_FORMAT_STATE_CHANGED, {
            bold: true,
            italic: false,
            strike: false,
            code: false
        })
        await nextTick()

        expect(w.find('#bold').classes()).toContain('tool-btn--active')
        expect(w.find('#italic').classes()).not.toContain('tool-btn--active')
        // underline 不在 InlineFormatState 映射内 → 永远非激活（既有行为）
        expect(w.find('#underline').classes()).not.toContain('tool-btn--active')

        EventBus.$emit(EVENT_BUS.MONACO_FORMAT_STATE_CHANGED, {
            bold: false,
            italic: true,
            strike: false,
            code: false
        })
        await nextTick()
        expect(w.find('#bold').classes()).not.toContain('tool-btn--active')
        expect(w.find('#italic').classes()).toContain('tool-btn--active')
    })

    it('按钮尺寸只按工具条自身宽度计算（不再扣除右侧按钮区宽度）', async () => {
        const w = await mountToolbar()
        const container = w.find('.toolbar-container').element
        Object.defineProperty(container, 'clientWidth', { configurable: true, value: 1000 })

        FakeResizeObserver.instances[0]!.trigger()
        await nextTick()

        // (1000 - 2 * 2) / 3 ≈ 332 → 夹到上限 35px
        expect(w.find('.tool-btn').attributes('style')).toContain('width: 35px')

        Object.defineProperty(container, 'clientWidth', { configurable: true, value: 62 })
        FakeResizeObserver.instances[0]!.trigger()
        await nextTick()
        // (62 - 4) / 3 ≈ 19.3 → 夹到下限 20px
        expect(w.find('.tool-btn').attributes('style')).toContain('width: 20px')
    })

    it('工具栏宽度 prop 变化时重新计算按钮尺寸（既有行为保留）', async () => {
        const w = await mountToolbar()

        await w.setProps({ toolBarWidth: '50%' })
        await nextTick()

        // jsdom 中 clientWidth 为 0 → 下限 20px（不抛错）
        expect(w.find('.tool-btn').attributes('style')).toContain('width: 20px')
    })
})
