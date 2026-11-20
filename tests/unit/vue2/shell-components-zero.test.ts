// @vitest-environment jsdom
/**
 * 渲染层容器壳组件 0% 补测（第二批）：
 * 1. `PluginTools/PluginTools.vue`（26 语句/7 函数）——插件工具面板壳：
 *    占位提示、PLUGIN_TOOL_SHOW 事件驱动容器显示与工具组件动态渲染、
 *    toolsViewWidth 宽度换算、关闭按钮回编辑器、THEME_UPDATED 空处理；
 * 2. `Markdown/MarkdownContainer.vue`（11 语句/6 函数）——编辑器容器：
 *    工具栏二级懒加载的「骨架 → 真实组件」切换、chunk 加载失败兜底占位、
 *    宽度 prop 透传给编辑/工具栏；
 * 3. `HemyTools/HemyTools.vue`（10 语句/4 函数）——工具面板壳：
 *    宽度换算与 props 变化响应、返回编辑器按钮发 WORKSPACE_SHOW('md')。
 *
 * 依赖边界：三个文件都是「壳」，子组件按 props/事件契约最小 mock；
 * EventBus 跑真实实现（只监听/断言事件，不替换），确保事件名与负载契约不变。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h } from 'vue'

// ============ 子组件 / 模块最小 mock ============
const toolsConstState = vi.hoisted(() => ({ loaded: 0 }))

vi.mock('@renderer/components/PluginTools/plugin-tools-const', async () => {
    // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：按 props 契约最小 mock，非产品组件
    const ToolStub = defineComponent({
        name: 'ToolStub',
        props: { workAreaWidth: { type: String, default: '' } },
        setup(props) {
            toolsConstState.loaded += 1
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

vi.mock('@renderer/components/Markdown/MarkdownEditComponent.vue', async () => ({
    // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：按 props 契约最小 mock，非产品组件
    default: defineComponent({
        name: 'MdEditCompStub',
        props: { editorPreviewWidth: { type: String, default: '' } },
        setup(props) {
            return () =>
                h('div', {
                    class: 'md-edit-comp-stub',
                    'data-width': props.editorPreviewWidth
                })
        }
    })
}))

const editToolsState = vi.hoisted(() => ({ fail: false }))

vi.mock('@renderer/components/Markdown/MarkdownEditToolsComponent.vue', async () => {
    // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：按 props 契约最小 mock，非产品组件
    const EditToolsStub = defineComponent({
        name: 'EditToolsStub',
        props: { toolBarWidth: { type: String, default: '' } },
        setup(props) {
            return () =>
                h('div', {
                    class: 'edit-tools-stub',
                    'data-width': props.toolBarWidth
                })
        }
    })
    return {
        __esModule: true,
        get default() {
            if (editToolsState.fail) {
                throw new Error('模拟工具栏 chunk 加载失败')
            }
            return EditToolsStub
        }
    }
})

import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import PluginTools from '@renderer/components/PluginTools/PluginTools.vue'
import MarkdownContainer from '@renderer/components/Markdown/MarkdownContainer.vue'
import HemyTools from '@renderer/components/HemyTools/HemyTools.vue'

let wrapper: VueWrapper | null = null
const workspaceEvents: string[] = []

function workspaceListener(mode: string): void {
    workspaceEvents.push(mode)
}

beforeEach(() => {
    workspaceEvents.length = 0
    editToolsState.fail = false
    toolsConstState.loaded = 0
    EventBus.$on(EVENT_BUS.WORKSPACE_SHOW, workspaceListener)
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    EventBus.$off(EVENT_BUS.WORKSPACE_SHOW, workspaceListener)
    document.body.innerHTML = ''
})

describe('PluginTools.vue 插件工具面板壳', () => {
    it('初始渲染占位提示，宽度按「总宽 - 100」换算', () => {
        wrapper = mount(PluginTools, { props: { pluginsAreaWidth: '820px' } })
        expect(wrapper.find('.plugin-tool-placeholder').exists()).toBe(true)
        expect(wrapper.find('.plugin-tool-content').exists()).toBe(false)

        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, 'tool-a')
        return flushPromises().then(() => {
            const stub = wrapper!.find('.tool-stub')
            expect(stub.attributes('data-width')).toBe('720px')
        })
    })

    it('PLUGIN_TOOL_SHOW 显示容器并发出 WORKSPACE_SHOW(plugins)，重复点击不重复发', async () => {
        wrapper = mount(PluginTools)
        expect(workspaceEvents).toEqual([])

        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, 'tool-a')
        await flushPromises()
        expect(workspaceEvents).toEqual(['plugins'])
        expect(wrapper.find('#plugin-tool-tool-a').exists()).toBe(true)

        // 容器已显示：只切换工具，不再重复发工作区切换事件
        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, 'tool-b')
        await flushPromises()
        expect(workspaceEvents).toEqual(['plugins'])
        expect(wrapper.find('#plugin-tool-tool-b').exists()).toBe(true)
    })

    it('未知工具 id 时保持占位（visibleTool 为空）', async () => {
        wrapper = mount(PluginTools)
        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, 'not-exist')
        await flushPromises()
        expect(wrapper.find('.plugin-tool-placeholder').exists()).toBe(true)
        expect(wrapper.find('.plugin-tool-content').exists()).toBe(false)
    })

    it('关闭按钮回到编辑器；再次打开会重新发 WORKSPACE_SHOW(plugins)', async () => {
        wrapper = mount(PluginTools)
        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, 'tool-a')
        await flushPromises()

        await wrapper.find('#plugin-tool-close').trigger('click')
        expect(workspaceEvents).toEqual(['plugins', 'md'])
        expect(wrapper.find('.plugin-tool-placeholder').exists()).toBe(true)

        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, 'tool-a')
        await flushPromises()
        expect(workspaceEvents).toEqual(['plugins', 'md', 'plugins'])
    })

    it('THEME_UPDATED 事件走空实现（主题由 CSS 变量应用）', async () => {
        wrapper = mount(PluginTools)
        EventBus.$emit(EVENT_BUS.THEME_UPDATED)
        await flushPromises()
        expect(wrapper.find('.plugin-tools-container').exists()).toBe(true)
    })

    it('默认 pluginsAreaWidth（100%）换算为 0px', () => {
        wrapper = mount(PluginTools)
        expect((wrapper.find('#plugin-tool-close button').element as HTMLElement).tagName).toBe(
            'BUTTON'
        )
        EventBus.$emit(EVENT_BUS.PLUGIN_TOOL_SHOW, 'tool-a')
        return flushPromises().then(() => {
            expect(wrapper!.find('.tool-stub').attributes('data-width')).toBe('0px')
        })
    })
})

describe('MarkdownContainer.vue 编辑器容器（工具栏二级懒加载）', () => {
    it('chunk 加载失败时渲染等高错误兜底占位', async () => {
        editToolsState.fail = true
        wrapper = mount(MarkdownContainer, { props: { mdContainerWidth: '60%' } })
        await flushPromises()

        expect(wrapper.find('.md-edit-tools-skeleton.is-error').exists()).toBe(true)
        expect(wrapper.find('[role="alert"]').exists()).toBe(true)
    })

    it('加载成功后渲染真实工具栏，骨架消失并透传宽度', async () => {
        wrapper = mount(MarkdownContainer, { props: { mdContainerWidth: '60%' } })
        // 异步 chunk 解析前先显示骨架（delay=0）
        expect(wrapper.find('[role="status"]').exists()).toBe(true)

        await flushPromises()
        const tools = wrapper.find('.edit-tools-stub')
        expect(tools.exists()).toBe(true)
        expect(tools.attributes('data-width')).toBe('60%')
        expect(wrapper.find('[role="status"]').exists()).toBe(false)
    })

    it('编辑器编排组件同步渲染并接收宽度 prop', async () => {
        wrapper = mount(MarkdownContainer, { props: { mdContainerWidth: '55%' } })
        await flushPromises()

        expect(wrapper.find('.md-edit-comp-stub').exists()).toBe(true)
        expect(wrapper.find('.md-edit-comp-stub').attributes('data-width')).toBe('55%')
        expect(wrapper.find('#md-edit-tools-bar').exists()).toBe(true)
        expect(wrapper.find('#md-edit-component').exists()).toBe(true)
    })

    it('默认 mdContainerWidth 为 100%', async () => {
        wrapper = mount(MarkdownContainer)
        await flushPromises()
        expect(wrapper.find('.md-edit-comp-stub').attributes('data-width')).toBe('100%')
    })
})

describe('HemyTools.vue 工具面板壳', () => {
    it('宽度按「总宽 - 100」换算，props 变化后同步更新', async () => {
        wrapper = mount(HemyTools, { props: { toolsAreaWidth: '500px' } })
        const closeButton = wrapper.find('#tool-close')
        expect((closeButton.element as HTMLElement).style.width).toBe('400px')

        await wrapper.setProps({ toolsAreaWidth: '740px' })
        expect((wrapper.find('#tool-close').element as HTMLElement).style.width).toBe('640px')
    })

    it('返回编辑器按钮发出 WORKSPACE_SHOW(md)', async () => {
        wrapper = mount(HemyTools)
        await wrapper.find('#tool-close button').trigger('click')
        expect(workspaceEvents).toEqual(['md'])
    })
})
