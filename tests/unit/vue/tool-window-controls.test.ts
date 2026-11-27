// @vitest-environment jsdom
/**
 * 用户反馈 2026-11-27：各工具右上角「最大化 / 最小化」按钮（jsdom 行为契约）。
 *
 * 覆盖两部分：
 * 1. **非模态工具窗（BaseDialog）**：`isNonModal` 时标题栏在关闭按钮左侧新增
 *    [最小化][最大化/还原] 两个按钮——
 *    - 最小化：容器 class + 内联高度切到「仅标题栏」态，按钮文案/图标切「还原」；
 *    - 最大化：containerStyles 末位写入 `100vw/100vh - 32px` + 四周 16px 内联几何，
 *      覆盖调用方 containerStyle（resize 尺寸），再次点击恢复 dialogStyle 原位置；
 *    - 两状态互斥；最大化时从标题栏开始拖拽先复位 normal；控制按钮本身不触发拖拽；
 *    - 模态对话框（isNonModal=false）不渲染这两个按钮（title-bar 仍为「标题 + 关闭」）。
 * 2. **插件工具面板（PluginTools）**：44px 顶部工具条（左标题 / 右 [最小化][最大化]
 *    [返回编辑器]）——最小化 class、最大化 class + 工具工作区宽度加宽、返回编辑器链路
 *    仍发 WORKSPACE_SHOW('md')，且折叠态复位。
 *
 * 说明：真实几何（像素高度/视口撑满）由 E2E `e2e/tool-window-controls.spec.ts` 在真实
 * Electron 窗口内验证；本文件只锁定 DOM class / 内联样式 / 状态切换与 i18n 接线。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type DOMWrapper, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'

// 插件工具注册表是 38 个 defineAsyncComponent（各自独立 chunk）：用最小 stub 替换，
// 只验证面板壳自身的窗口控制行为，避免真实懒加载 chunk 与 100ms 占位延迟进入断言。
vi.mock('@renderer/components/PluginTools/plugin-tools-const', async () => {
    const ToolStub = defineComponent({
        name: 'ToolStub',
        props: { workAreaWidth: { type: String, default: '' } },
        setup(props) {
            return () =>
                h('div', {
                    class: 'tool-stub',
                    'data-width': props.workAreaWidth
                })
        }
    })
    return {
        pluginTools: [
            { id: 'tool-a', component: ToolStub },
            { id: 'tool-b', component: ToolStub }
        ]
    }
})

import BaseDialog from '@renderer/components/dialogs/BaseDialog.vue'
import PluginTools from '@renderer/components/PluginTools/PluginTools.vue'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import { setLocale } from '@renderer/common/i18n'

/** 对话框默认 Teleport 到 body；测试统一 stub 成内联渲染，便于对内联样式/class 断言 */
const dialogMountOptions = {
    global: { stubs: { teleport: true } },
    attachTo: document.body
}

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

/** 挂载一个可见的非模态工具窗（默认带一个正文输入框，模拟工具窗内容） */
function mountToolWindow(
    props: Record<string, unknown> = {},
    slots: Record<string, string> = { default: '<input class="tool-input" />' }
): VueWrapper {
    return track(
        mount(BaseDialog, {
            ...dialogMountOptions,
            props: { visible: true, title: '工具窗', nonModal: true, ...props },
            slots
        }) as VueWrapper
    )
}

/** 挂载一个模态对话框（普通对话框，不应渲染窗口控制按钮） */
function mountModalDialog(props: Record<string, unknown> = {}): VueWrapper {
    return track(
        mount(BaseDialog, {
            ...dialogMountOptions,
            props: { visible: true, title: '模态对话框', ...props },
            slots: { default: '<p class="dialog-body">正文</p>' }
        }) as VueWrapper
    )
}

/** 工具窗标题栏控制按钮（顺序：[最小化][最大化]） */
function controlButtons(wrapper: VueWrapper): DOMWrapper<Element>[] {
    return wrapper.findAll('.tool-window-control-btn')
}

function minimizeButton(wrapper: VueWrapper): DOMWrapper<Element> {
    return controlButtons(wrapper)[0]
}

function maximizeButton(wrapper: VueWrapper): DOMWrapper<Element> {
    return controlButtons(wrapper)[1]
}

function container(wrapper: VueWrapper): DOMWrapper<Element> {
    return wrapper.find('.dialog-container')
}

function containerStyle(wrapper: VueWrapper): string {
    return container(wrapper).attributes('style') ?? ''
}

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) wrapper.unmount()
    }
    wrappers = []
    document.body.innerHTML = ''
    setLocale('zh-CN')
    vi.restoreAllMocks()
})

describe('BaseDialog 非模态工具窗：窗口控制按钮结构', () => {
    it('标题栏渲染 [最小化][最大化][关闭] 三个按钮，aria-label 与 title 同步', () => {
        const wrapper = mountToolWindow()
        const buttons = controlButtons(wrapper)
        expect(buttons).toHaveLength(2)

        const minBtn = buttons[0]
        const maxBtn = buttons[1]
        expect(minBtn.attributes('type')).toBe('button')
        expect(minBtn.attributes('aria-label')).toBe('最小化')
        expect(minBtn.attributes('title')).toBe('最小化')
        expect(maxBtn.attributes('aria-label')).toBe('最大化')
        expect(maxBtn.attributes('title')).toBe('最大化')

        // 顺序：最小化 → 最大化 → 关闭（关闭按钮恒为标题栏最后一个控件）
        const titleBarButtons = wrapper.find('.title-bar').findAll('button')
        expect(titleBarButtons).toHaveLength(3)
        expect(titleBarButtons[0].classes()).toContain('tool-window-control-btn')
        expect(titleBarButtons[1].classes()).toContain('tool-window-control-btn')
        expect(titleBarButtons[2].classes()).toContain('close-btn')
        // 图标为内联 SVG（24 网格 / stroke 1.5 / currentColor，装饰性不进无障碍树）
        const icon = minBtn.find('svg')
        expect(icon.exists()).toBe(true)
        expect(icon.attributes('viewBox')).toBe('0 0 24 24')
        expect(icon.attributes('stroke')).toBe('currentColor')
        expect(icon.attributes('stroke-width')).toBe('1.5')
        expect(icon.attributes('aria-hidden')).toBe('true')
    })

    it('模态对话框不渲染最小化/最大化按钮（标题栏仍为「标题 + 关闭」两节点，零回归）', () => {
        const wrapper = mountModalDialog()
        expect(wrapper.find('.tool-window-control-btn').exists()).toBe(false)
        expect(wrapper.find('.tool-window-controls').exists()).toBe(false)
        expect(wrapper.find('.title-bar').element.children).toHaveLength(2)
        expect(container(wrapper).attributes('data-tool-window-state')).toBeUndefined()
        expect(containerStyle(wrapper)).not.toContain('calc(100vw')
    })

    it('英文界面下按钮 aria-label 走 en-US 词典', async () => {
        setLocale('en-US')
        const wrapper = mountToolWindow()
        await nextTick()
        expect(minimizeButton(wrapper).attributes('aria-label')).toBe('Minimize')
        expect(maximizeButton(wrapper).attributes('aria-label')).toBe('Maximize')
    })
})

describe('BaseDialog 非模态工具窗：最小化 / 还原', () => {
    it('点击最小化 → 容器进入最小化态（class + 内联高度），按钮变「还原」', async () => {
        const wrapper = mountToolWindow()
        expect(container(wrapper).attributes('data-tool-window-state')).toBe('normal')

        await minimizeButton(wrapper).trigger('click')
        await nextTick()

        expect(container(wrapper).classes()).toContain('dialog-container--minimized')
        expect(container(wrapper).classes()).not.toContain('dialog-container--maximized')
        expect(container(wrapper).attributes('data-tool-window-state')).toBe('minimized')
        // 高度走密度令牌（compact 36 / default 40 / spacious 44），不是写死像素
        const style = containerStyle(wrapper)
        expect(style).toContain('height: var(--ui-titlebar-height, 40px)')
        expect(style).toContain('min-height: var(--ui-titlebar-height, 40px)')
        // 按钮切换为还原态（图标/文案），再次点击可恢复
        expect(minimizeButton(wrapper).attributes('aria-label')).toBe('还原')
        expect(minimizeButton(wrapper).attributes('title')).toBe('还原')
        expect(containerStyle(wrapper)).not.toContain('calc(100vw')
        // 正文节点仍在 DOM（由最小化 CSS 规则隐藏），避免业务组件状态被销毁
        expect(wrapper.find('.tool-input').exists()).toBe(true)
    })

    it('再次点击最小化按钮（还原态）→ 恢复原尺寸，文案回到「最小化」', async () => {
        const wrapper = mountToolWindow()
        await minimizeButton(wrapper).trigger('click')
        await nextTick()
        expect(container(wrapper).classes()).toContain('dialog-container--minimized')

        await minimizeButton(wrapper).trigger('click')
        await nextTick()
        expect(container(wrapper).classes()).not.toContain('dialog-container--minimized')
        expect(container(wrapper).attributes('data-tool-window-state')).toBe('normal')
        expect(containerStyle(wrapper)).not.toContain('var(--ui-titlebar-height')
        expect(minimizeButton(wrapper).attributes('aria-label')).toBe('最小化')
        // 恢复后仍保留 dialogStyle 的居中定位与宽度
        expect(containerStyle(wrapper)).toContain('left: 50%')
        expect(containerStyle(wrapper)).toContain('transform: translate(-50%, -50%)')
    })
})

describe('BaseDialog 非模态工具窗：最大化 / 还原', () => {
    it('点击最大化 → containerStyles 末位写入撑满视口几何，按钮变「还原」', async () => {
        const wrapper = mountToolWindow()
        expect(container(wrapper).attributes('data-tool-window-state')).toBe('normal')

        await maximizeButton(wrapper).trigger('click')
        await nextTick()

        expect(container(wrapper).classes()).toContain('dialog-container--maximized')
        expect(container(wrapper).classes()).not.toContain('dialog-container--minimized')
        expect(container(wrapper).attributes('data-tool-window-state')).toBe('maximized')

        const style = containerStyle(wrapper)
        // 主窗口可用区域 = 视口 - 32px，四周留白 16px（规格值）
        expect(style).toContain('width: calc(100vw - 32px)')
        expect(style).toContain('height: calc(100vh - 32px)')
        expect(style).toContain('left: 16px')
        expect(style).toContain('top: 16px')
        // 必须清除 dialogStyle 的居中 transform，否则会整体偏移
        expect(style).toContain('transform: none')
        expect(style).not.toContain('translate(-50%, -50%)')
        expect(maximizeButton(wrapper).attributes('aria-label')).toBe('还原')
        expect(maximizeButton(wrapper).attributes('title')).toBe('还原')
        // 最小化按钮文案不受最大化影响
        expect(minimizeButton(wrapper).attributes('aria-label')).toBe('最小化')
    })

    it('最大化覆盖调用方 containerStyle 的 resize 尺寸，还原后回到原尺寸与位置', async () => {
        const wrapper = mountToolWindow({
            width: 'min(1000px, 95vw)',
            containerStyle: { width: '860px', height: '560px' }
        })
        const normalStyle = containerStyle(wrapper)
        expect(normalStyle).toContain('width: 860px')
        expect(normalStyle).toContain('height: 560px')

        await maximizeButton(wrapper).trigger('click')
        await nextTick()
        // 末位覆盖：resize 宽高被视口几何覆盖
        expect(containerStyle(wrapper)).toContain('width: calc(100vw - 32px)')
        expect(containerStyle(wrapper)).toContain('height: calc(100vh - 32px)')

        await maximizeButton(wrapper).trigger('click')
        await nextTick()
        expect(container(wrapper).classes()).not.toContain('dialog-container--maximized')
        // 恢复后回到原尺寸（containerStyle 的 resize 值）与原居中位置
        const restored = containerStyle(wrapper)
        expect(restored).toContain('width: 860px')
        expect(restored).toContain('height: 560px')
        expect(restored).not.toContain('calc(100vw')
        expect(restored).toContain('left: 50%')
        expect(restored).toContain('transform: translate(-50%, -50%)')
    })

    it('最大化时从标题栏开始拖拽：先把状态复位为 normal（覆盖样式不与拖拽定位冲突）', async () => {
        const wrapper = mountToolWindow()
        await maximizeButton(wrapper).trigger('click')
        await nextTick()
        expect(container(wrapper).classes()).toContain('dialog-container--maximized')

        await wrapper.find('.title-bar').trigger('mousedown', {
            button: 0,
            clientX: 100,
            clientY: 100
        })
        await nextTick()
        expect(container(wrapper).classes()).not.toContain('dialog-container--maximized')
        expect(container(wrapper).attributes('data-tool-window-state')).toBe('normal')
        expect(containerStyle(wrapper)).not.toContain('calc(100vw')
        // 拖拽确实启动（mousemove 后写入内联定位），随后清理 document 监听
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 160, clientY: 140 }))
        await nextTick()
        expect(containerStyle(wrapper)).toContain('left: 60px')
        document.dispatchEvent(new MouseEvent('mouseup'))
    })

    it('正文区域点击不触发最大化复位（最大化窗内编辑不受影响）', async () => {
        const wrapper = mountToolWindow()
        await maximizeButton(wrapper).trigger('click')
        await nextTick()

        await wrapper.find('.tool-input').trigger('mousedown', { button: 0 })
        await nextTick()
        expect(container(wrapper).classes()).toContain('dialog-container--maximized')
    })
})

describe('BaseDialog 非模态工具窗：状态互斥与生命周期复位', () => {
    it('最小化/最大化互斥：从最小化切最大化、从最大化切最小化都正确切换', async () => {
        const wrapper = mountToolWindow()

        await minimizeButton(wrapper).trigger('click')
        await nextTick()
        expect(container(wrapper).classes()).toContain('dialog-container--minimized')

        // 最小化态点最大化 → 直接进入最大化（互斥，不同时保留两个 class）
        await maximizeButton(wrapper).trigger('click')
        await nextTick()
        expect(container(wrapper).classes()).toContain('dialog-container--maximized')
        expect(container(wrapper).classes()).not.toContain('dialog-container--minimized')
        expect(containerStyle(wrapper)).toContain('calc(100vw - 32px)')

        // 最大化态点最小化 → 切到最小化（高度恢复标题栏）
        await minimizeButton(wrapper).trigger('click')
        await nextTick()
        expect(container(wrapper).classes()).toContain('dialog-container--minimized')
        expect(container(wrapper).classes()).not.toContain('dialog-container--maximized')
        expect(containerStyle(wrapper)).not.toContain('calc(100vw')
    })

    it('重新打开（visible false → true）复位为 normal（v-show 复用兜底）', async () => {
        const wrapper = mountToolWindow()
        await maximizeButton(wrapper).trigger('click')
        await nextTick()
        expect(container(wrapper).classes()).toContain('dialog-container--maximized')

        await wrapper.setProps({ visible: false })
        await nextTick()
        expect(wrapper.find('.dialog-container').exists()).toBe(false)

        await wrapper.setProps({ visible: true })
        await nextTick()
        expect(container(wrapper).attributes('data-tool-window-state')).toBe('normal')
        expect(container(wrapper).classes()).not.toContain('dialog-container--maximized')
        expect(containerStyle(wrapper)).not.toContain('calc(100vw')
    })

    it('控制按钮不触发对话框拖拽（点击最小化/最大化不会顺带移动窗口）', async () => {
        const wrapper = mountToolWindow()
        await maximizeButton(wrapper).trigger('click')
        await nextTick()
        await maximizeButton(wrapper).trigger('click')
        await nextTick()

        // 按钮自身的 mousedown 被 @mousedown.stop 拦截：不会注册 document 级拖拽监听
        await minimizeButton(wrapper).trigger('mousedown', {
            button: 0,
            clientX: 100,
            clientY: 100
        })
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }))
        await nextTick()
        expect(containerStyle(wrapper)).toContain('left: 50%')
        expect(containerStyle(wrapper)).not.toContain('left: 100px')

        await wrapper.find('.close-btn').trigger('mousedown', { button: 0 })
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }))
        await nextTick()
        expect(containerStyle(wrapper)).toContain('left: 50%')
        document.dispatchEvent(new MouseEvent('mouseup'))
    })
})

describe('PluginTools 插件工具面板：窗口控制按钮', () => {
    const workspaceEvents: string[] = []

    function workspaceListener(mode: string): void {
        workspaceEvents.push(mode)
    }

    function mountPluginTools(pluginsAreaWidth = '820px'): VueWrapper {
        return track(mount(PluginTools, { props: { pluginsAreaWidth } }) as VueWrapper)
    }

    function pluginControls(wrapper: VueWrapper): DOMWrapper<Element>[] {
        return wrapper.findAll('.plugin-tools-control-btn')
    }

    function pluginContainer(wrapper: VueWrapper): DOMWrapper<Element> {
        return wrapper.find('#plugin-tools-container')
    }

    beforeEach(() => {
        workspaceEvents.length = 0
        EventBus.$on(EVENT_BUS.WORKSPACE_SHOW, workspaceListener)
    })

    afterEach(() => {
        EventBus.$off(EVENT_BUS.WORKSPACE_SHOW, workspaceListener)
    })

    it('顶部工具条渲染标题与 [最小化][最大化][返回编辑器] 按钮', () => {
        const wrapper = mountPluginTools()
        const bar = wrapper.find('.plugin-tools-bar')
        expect(bar.exists()).toBe(true)
        expect(wrapper.find('.plugin-tools-bar-title').text()).toBe('插件工具')

        const buttons = pluginControls(wrapper)
        expect(buttons).toHaveLength(2)
        expect(buttons[0].attributes('type')).toBe('button')
        expect(buttons[0].attributes('aria-label')).toBe('最小化')
        expect(buttons[1].attributes('aria-label')).toBe('最大化')
        // 返回编辑器按钮仍保留原 id 与文案（既有事件链路不变）
        expect(wrapper.find('#plugin-tool-close button').text()).toBe('返回编辑器')
        // 三个控件都在右侧按钮组内，顺序为 [最小化][最大化][返回编辑器]
        const actionButtons = wrapper.find('.plugin-tools-bar-actions').findAll('button')
        expect(actionButtons).toHaveLength(3)
    })

    it('点击最小化 → 容器折叠 class，按钮变「还原」；再次点击还原', async () => {
        const wrapper = mountPluginTools()
        expect(pluginContainer(wrapper).attributes('data-tool-window-state')).toBe('normal')

        await pluginControls(wrapper)[0].trigger('click')
        await nextTick()
        expect(pluginContainer(wrapper).classes()).toContain('plugin-tools-container--minimized')
        expect(pluginContainer(wrapper).attributes('data-tool-window-state')).toBe('minimized')
        expect(pluginControls(wrapper)[0].attributes('aria-label')).toBe('还原')

        await pluginControls(wrapper)[0].trigger('click')
        await nextTick()
        expect(pluginContainer(wrapper).classes()).not.toContain(
            'plugin-tools-container--minimized'
        )
        expect(pluginControls(wrapper)[0].attributes('aria-label')).toBe('最小化')
    })

    it('点击最大化 → 容器最大化 class，工具工作区宽度加宽；再次点击还原', async () => {
        const wrapper = mountPluginTools('820px')
        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, 'tool-a')
        await nextTick()
        // 正常态沿用既有口径：总宽 - 100
        expect(wrapper.find('.tool-stub').attributes('data-width')).toBe('720px')

        await pluginControls(wrapper)[1].trigger('click')
        await nextTick()
        expect(pluginContainer(wrapper).classes()).toContain('plugin-tools-container--maximized')
        expect(pluginContainer(wrapper).attributes('data-tool-window-state')).toBe('maximized')
        // 最大化只预留 16px 视觉留白：工具内容真正变宽
        expect(wrapper.find('.tool-stub').attributes('data-width')).toBe('804px')
        expect(pluginControls(wrapper)[1].attributes('aria-label')).toBe('还原')

        await pluginControls(wrapper)[1].trigger('click')
        await nextTick()
        expect(pluginContainer(wrapper).classes()).not.toContain(
            'plugin-tools-container--maximized'
        )
        expect(wrapper.find('.tool-stub').attributes('data-width')).toBe('720px')
        expect(pluginControls(wrapper)[1].attributes('aria-label')).toBe('最大化')
    })

    it('最小化/最大化互斥（插件面板同一状态机）', async () => {
        const wrapper = mountPluginTools()
        await pluginControls(wrapper)[0].trigger('click')
        await nextTick()
        expect(pluginContainer(wrapper).classes()).toContain('plugin-tools-container--minimized')

        await pluginControls(wrapper)[1].trigger('click')
        await nextTick()
        expect(pluginContainer(wrapper).classes()).toContain('plugin-tools-container--maximized')
        expect(pluginContainer(wrapper).classes()).not.toContain(
            'plugin-tools-container--minimized'
        )

        await pluginControls(wrapper)[0].trigger('click')
        await nextTick()
        expect(pluginContainer(wrapper).classes()).toContain('plugin-tools-container--minimized')
        expect(pluginContainer(wrapper).classes()).not.toContain(
            'plugin-tools-container--maximized'
        )
    })

    it('返回编辑器按钮仍工作：发 WORKSPACE_SHOW(md) 并清空当前工具，折叠态复位', async () => {
        const wrapper = mountPluginTools()
        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, 'tool-a')
        await nextTick()
        expect(wrapper.find('.plugin-tool-content').exists()).toBe(true)
        expect(workspaceEvents).toEqual(['plugins'])

        await pluginControls(wrapper)[0].trigger('click')
        await nextTick()
        expect(pluginContainer(wrapper).classes()).toContain('plugin-tools-container--minimized')

        await wrapper.find('#plugin-tool-close').trigger('click')
        await nextTick()
        expect(workspaceEvents).toEqual(['plugins', 'md'])
        expect(wrapper.find('.plugin-tool-content').exists()).toBe(false)
        expect(wrapper.find('.plugin-tool-placeholder').exists()).toBe(true)
        expect(pluginContainer(wrapper).attributes('data-tool-window-state')).toBe('normal')
    })

    it('折叠态下从菜单再次选择工具 → 自动还原，保证新工具内容可见', async () => {
        const wrapper = mountPluginTools()
        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, 'tool-a')
        await nextTick()
        await pluginControls(wrapper)[0].trigger('click')
        await nextTick()
        expect(pluginContainer(wrapper).classes()).toContain('plugin-tools-container--minimized')

        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, 'tool-b')
        await nextTick()
        expect(pluginContainer(wrapper).classes()).not.toContain(
            'plugin-tools-container--minimized'
        )
        expect(wrapper.find('#plugin-tool-tool-b').exists()).toBe(true)
    })
})
