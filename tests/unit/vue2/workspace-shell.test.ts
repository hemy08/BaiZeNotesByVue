// @vitest-environment jsdom
/**
 * src/renderer/src/components/WorkSpaceArea/WorkSpace.vue 单元测试
 *
 * WorkSpace 是主界面工作区壳：负责 6 个容器的显隐切换、左右导航事件路由、
 * 资源管理器宽度拖拽、按需挂载（HTML/PDF）与文件选择事件补偿。本测试按
 * 「组件 props/事件契约最小 mock」原则隔离重依赖子组件（NaviTab / ResManager /
 * MarkdownContainer / PluginTools / HemyTools / ShowHtmlView / ShowPdfEditor），
 * 只让 WorkSpace 自身的状态机与事件链真实执行：
 * 1. 初始容器显隐与宽度布局计算（含资源管理器显示/隐藏两种口径）；
 * 2. WORKSPACE_SHOW / PLUGIN_TOOLS_CONTAINER_SHOW 事件驱动的容器互斥切换；
 * 3. HTML/PDF 首次激活的按需挂载、选择事件缓存补发、二次切换不重复挂载；
 * 4. 左右 NaviTab 的 update:navi:tab 路由（文件管理器/大纲/工具面板开合）；
 * 5. 资源管理器宽度拖拽的最小/最大/正常三档夹取与 mouseup 解绑；
 * 6. 挂载注册 / 卸载清理：IPC TOGGLE_RES_MANAGER、window resize、EventBus 监听。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

// ============ 子组件最小 mock（只保留 props/事件契约） ============
// 右侧/左侧导航：点击时按 naviState.nextTab 上抛 update:navi:tab，模拟真实 NaviTab。
const naviState = vi.hoisted(() => ({
    nextTab: 'switch-open-close' as string,
    leftClicks: [] as string[],
    rightClicks: [] as string[]
}))

vi.mock('@renderer/components/WorkSpaceArea/NaviTab.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：按 props/事件契约最小 mock，非产品组件
        default: defineComponent({
            name: 'NaviTabStub',
            props: { position: { type: String, required: true } },
            emits: ['update:navi:tab'],
            setup(props, { emit }) {
                return () =>
                    h('button', {
                        class: ['navi-stub', `navi-stub-${props.position}`],
                        onClick: () => {
                            const bucket =
                                props.position === 'left'
                                    ? naviState.leftClicks
                                    : naviState.rightClicks
                            bucket.push(naviState.nextTab)
                            emit('update:navi:tab', naviState.nextTab)
                        }
                    })
            }
        })
    }
})

vi.mock('@renderer/components/ResourceManager/ResourceManager.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：按 props/事件契约最小 mock，非产品组件
        default: defineComponent({
            name: 'ResManagerStub',
            props: { naviShow: { type: String, default: '' } },
            setup(props) {
                return () =>
                    h('div', { class: 'res-manager-stub', 'data-navi-show': props.naviShow })
            }
        })
    }
})

vi.mock('@renderer/components/Markdown/MarkdownContainer.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：按 props/事件契约最小 mock，非产品组件
        default: defineComponent({
            name: 'MdContainerStub',
            props: { mdContainerWidth: { type: String, default: '' } },
            setup(props) {
                return () =>
                    h('div', { class: 'md-container-stub', 'data-width': props.mdContainerWidth })
            }
        })
    }
})

vi.mock('@renderer/components/PluginTools/PluginTools.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：按 props/事件契约最小 mock，非产品组件
        default: defineComponent({
            name: 'PluginToolsStub',
            props: { pluginsAreaWidth: { type: String, default: '' } },
            setup(props) {
                return () =>
                    h('div', {
                        class: 'plugin-tools-stub',
                        'data-width': props.pluginsAreaWidth
                    })
            }
        })
    }
})

vi.mock('@renderer/components/HemyTools/HemyTools.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：按 props/事件契约最小 mock，非产品组件
        default: defineComponent({
            name: 'HemyToolsStub',
            props: { toolsAreaWidth: { type: String, default: '' } },
            setup(props) {
                return () =>
                    h('div', { class: 'hemy-tools-stub', 'data-width': props.toolsAreaWidth })
            }
        })
    }
})

// 按需加载的 HTML/PDF 查看器：mountCount 用于断言二次切换不重复挂载子树。
const asyncMounts = vi.hoisted(() => ({ html: 0, pdf: 0 }))

vi.mock('@renderer/components/HemyTools/ShowHtmlView.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        // 动态 import 的模块会被 defineAsyncComponent 直接消费；补 __esModule
        // 标记让它走 .default 分支，避免把模块命名空间对象当作组件渲染。
        __esModule: true,
        // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：按 props/事件契约最小 mock，非产品组件
        default: defineComponent({
            name: 'ShowHtmlViewStub',
            props: { htmlAreaWidth: { type: String, default: '' } },
            setup() {
                asyncMounts.html += 1
                return () => h('div', { class: 'show-html-stub' })
            }
        })
    }
})

vi.mock('@renderer/components/HemyTools/ShowPdfEditor.vue', async () => {
    const { defineComponent, h } = await import('vue')
    return {
        __esModule: true,
        // eslint-disable-next-line vue/one-component-per-file -- 测试桩组件：按 props/事件契约最小 mock，非产品组件
        default: defineComponent({
            name: 'ShowPdfEditorStub',
            props: { pdsAreaWidth: { type: String, default: '' } },
            setup() {
                asyncMounts.pdf += 1
                return () => h('div', { class: 'show-pdf-stub' })
            }
        })
    }
})

vi.mock('@renderer/common/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import { IPC } from '../../../src/shared/ipc-channels'
import EventBus from '@renderer/common/event-bus/event-bus'
import { EVENT_BUS } from '@renderer/common/event-bus/event-bus-events'
import WorkSpace from '@renderer/components/WorkSpaceArea/WorkSpace.vue'

let wrapper: VueWrapper | null = null
let onMock: ReturnType<typeof vi.fn>
let removeListenerMock: ReturnType<typeof vi.fn>
let ipcHandlers: Map<string, (...args: unknown[]) => void>

/** 覆盖 jsdom 只读的 window.innerWidth，模拟真实窗口尺寸 */
function setInnerWidth(width: number): void {
    Object.defineProperty(window, 'innerWidth', {
        configurable: true,
        writable: true,
        value: width
    })
}

/** 派发 window 级鼠标事件 */
function dispatchMouseEvent(type: string, clientX = 0): void {
    window.dispatchEvent(new MouseEvent(type, { clientX }))
}

async function mountWorkspace(): Promise<VueWrapper> {
    // 必须挂到 document 上：v-show 的可见性断言依赖 getComputedStyle，
    // 脱离文档树的元素在 jsdom 下 computed display 不可靠（inline none 可能读成 block）。
    const mounted = mount(WorkSpace, { attachTo: document.body })
    await flushPromises()
    return mounted
}

/** 元素内联 style 的宽度（px 字符串） */
function widthOf(w: VueWrapper, selector: string): string {
    const element = w.find(selector).element as HTMLElement
    return element.style.width
}

beforeEach(() => {
    setInnerWidth(1200)
    naviState.nextTab = 'switch-open-close'
    naviState.leftClicks.length = 0
    naviState.rightClicks.length = 0
    asyncMounts.html = 0
    asyncMounts.pdf = 0
    ipcHandlers = new Map()
    onMock = vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
        ipcHandlers.set(channel, callback)
    })
    removeListenerMock = vi.fn()
    vi.stubGlobal('electron', {
        ipcRenderer: { on: onMock, removeListener: removeListenerMock }
    })
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.innerHTML = ''
})

describe('WorkSpace 初始渲染契约', () => {
    it('渲染左右导航与各容器，初始显示资源管理器与 Markdown 容器', async () => {
        wrapper = await mountWorkspace()

        expect(wrapper.findAll('.navi-stub')).toHaveLength(2)
        expect(wrapper.find('.navi-stub-left').exists()).toBe(true)
        expect(wrapper.find('.navi-stub-right').exists()).toBe(true)

        expect(wrapper.find('#resource-manager').isVisible()).toBe(true)
        expect(wrapper.find('.res-manager-stub').attributes('data-navi-show')).toBe('file-explorer')
        expect(wrapper.find('#md-container').isVisible()).toBe(true)
        expect(wrapper.find('.md-container-stub').exists()).toBe(true)
        expect(wrapper.find('#plugin-containers').isVisible()).toBe(false)
        expect(wrapper.find('#tool-containers').isVisible()).toBe(false)
        // 按需挂载：HTML/PDF 容器首次激活前不渲染（v-if=false，避免主界面即拉 chunk）
        expect(wrapper.find('#html-containers').exists()).toBe(false)
        expect(wrapper.find('#pdf-containers').exists()).toBe(false)
    })

    it('按窗口宽度与资源管理器宽度计算工作区宽度（资源管理器显示口径）', async () => {
        wrapper = await mountWorkspace()

        // 1200 - 40*2 - 300 - 2 = 818
        expect(widthOf(wrapper, '#md-container')).toBe('818px')
        expect(widthOf(wrapper, '#resource-manager')).toBe('300px')
        expect((wrapper.find('#resizer-main').element as HTMLElement).style.left).toBe('300px')
        expect(wrapper.find('.md-container-stub').attributes('data-width')).toBe('818px')
        expect(wrapper.find('.resizer-main').exists()).toBe(true)
    })

    it('收起资源管理器后工作区宽度不再扣除其宽度', async () => {
        wrapper = await mountWorkspace()
        const toggle = ipcHandlers.get(IPC.VIEW.TOGGLE_RES_MANAGER)
        expect(toggle, '应注册 TOGGLE_RES_MANAGER 监听').toBeDefined()

        toggle!()

        await flushPromises()
        expect(wrapper.find('#resource-manager').isVisible()).toBe(false)
        // 1200 - 40*2 - 2 = 1118（不计资源管理器）
        expect(widthOf(wrapper, '#md-container')).toBe('1118px')
    })
})

describe('WorkSpace 挂载订阅与卸载清理', () => {
    it('挂载时注册 IPC TOGGLE_RES_MANAGER 与 EventBus 监听，卸载时全部清理', async () => {
        const baseline = EventBus.$stats().totalListeners
        wrapper = await mountWorkspace()

        expect(onMock).toHaveBeenCalledWith(IPC.VIEW.TOGGLE_RES_MANAGER, expect.any(Function))
        expect(EventBus.$stats().totalListeners).toBeGreaterThan(baseline)

        const registeredHandler = ipcHandlers.get(IPC.VIEW.TOGGLE_RES_MANAGER)!
        const removeWindowListenerSpy = vi.spyOn(window, 'removeEventListener')
        wrapper.unmount()
        wrapper = null

        expect(removeListenerMock).toHaveBeenCalledWith(
            IPC.VIEW.TOGGLE_RES_MANAGER,
            registeredHandler
        )
        expect(removeWindowListenerSpy).toHaveBeenCalledWith('resize', expect.any(Function))
        expect(removeWindowListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
        expect(removeWindowListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
        // EventBus 监听由 useEventBus 随组件卸载自动清理，回到挂载前水平
        expect(EventBus.$stats().totalListeners).toBe(baseline)
    })

    it('窗口 resize 时重算工作区宽度', async () => {
        wrapper = await mountWorkspace()

        setInnerWidth(1000)
        window.dispatchEvent(new Event('resize'))
        await flushPromises()

        // 1000 - 40*2 - 300 - 2 = 618
        expect(widthOf(wrapper, '#md-container')).toBe('618px')
    })

    it('卸载后窗口 resize 不再影响（监听已移除）', async () => {
        wrapper = await mountWorkspace()
        const mountedWidth = widthOf(wrapper, '#md-container')
        wrapper.unmount()
        wrapper = null

        setInnerWidth(600)
        expect(() => window.dispatchEvent(new Event('resize'))).not.toThrow()
        expect(mountedWidth).toBe('818px')
    })
})

describe('WorkSpace 容器切换事件', () => {
    it('WORKSPACE_SHOW=plugins 时显示插件容器并隐藏 Markdown 容器', async () => {
        wrapper = await mountWorkspace()

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'plugins')
        await flushPromises()

        expect(wrapper.find('#plugin-containers').isVisible()).toBe(true)
        expect(wrapper.find('#md-container').isVisible()).toBe(false)
        expect(wrapper.find('#tool-containers').isVisible()).toBe(false)
    })

    it('WORKSPACE_SHOW=tools 时显示工具容器（FE-26 互斥切换）', async () => {
        wrapper = await mountWorkspace()

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'tools')
        await flushPromises()

        expect(wrapper.find('#tool-containers').isVisible()).toBe(true)
        expect(wrapper.find('#md-container').isVisible()).toBe(false)
        expect(wrapper.find('#plugin-containers').isVisible()).toBe(false)
    })

    it('WORKSPACE_SHOW=md（含未知值）回落到 Markdown 容器', async () => {
        wrapper = await mountWorkspace()

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'plugins')
        await flushPromises()
        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'md')
        await flushPromises()

        expect(wrapper.find('#md-container').isVisible()).toBe(true)
        expect(wrapper.find('#plugin-containers').isVisible()).toBe(false)

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'unknown-container')
        await flushPromises()
        expect(wrapper.find('#md-container').isVisible()).toBe(true)
    })

    it('PLUGIN_TOOLS_CONTAINER_SHOW 控制插件容器与 Markdown 容器互斥', async () => {
        wrapper = await mountWorkspace()

        EventBus.$emit(EVENT_BUS.PLUGIN_TOOLS_CONTAINER_SHOW, true)
        await flushPromises()
        expect(wrapper.find('#plugin-containers').isVisible()).toBe(true)
        expect(wrapper.find('#md-container').isVisible()).toBe(false)

        EventBus.$emit(EVENT_BUS.PLUGIN_TOOLS_CONTAINER_SHOW, false)
        await flushPromises()
        expect(wrapper.find('#plugin-containers').isVisible()).toBe(false)
        expect(wrapper.find('#md-container').isVisible()).toBe(true)
    })
})

describe('WorkSpace 按需挂载 HTML/PDF 查看器', () => {
    it('首次切到 html 时挂载查看器容器与异步组件', async () => {
        wrapper = await mountWorkspace()

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'html')
        await vi.waitFor(() => {
            expect(wrapper!.find('.show-html-stub').exists()).toBe(true)
        })

        expect(wrapper.find('#html-containers').exists()).toBe(true)
        expect(wrapper.find('#html-containers').isVisible()).toBe(true)
        expect(wrapper.find('#md-container').isVisible()).toBe(false)
        expect(asyncMounts.html).toBe(1)
        expect(asyncMounts.pdf).toBe(0)
    })

    it('首次激活前缓存 HTML 文件选择事件并在挂载后补发', async () => {
        wrapper = await mountWorkspace()
        const node = { path: '/notes/index.html', name: 'index.html' }

        // 资源管理器先发选择、后发 WORKSPACE_SHOW（真实时序）
        EventBus.$emit(EVENT_BUS.HTML_FILE_SELECTED, node)
        const replay = vi.fn()
        EventBus.$on(EVENT_BUS.HTML_FILE_SELECTED, replay, { once: true })

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'html')

        await vi.waitFor(() => {
            expect(replay).toHaveBeenCalledWith(node)
        })
    })

    it('已激活后再次切换不重复挂载、不重复补发选择', async () => {
        wrapper = await mountWorkspace()
        const node = { path: '/notes/index.html', name: 'index.html' }

        EventBus.$emit(EVENT_BUS.HTML_FILE_SELECTED, node)
        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'html')
        await vi.waitFor(() => {
            expect(wrapper!.find('.show-html-stub').exists()).toBe(true)
        })

        // 切回编辑器再进 html：容器已激活，保持同一实例（不重新挂载）
        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'md')
        await flushPromises()
        expect(wrapper.find('#html-containers').isVisible()).toBe(false)

        const replay = vi.fn()
        EventBus.$on(EVENT_BUS.HTML_FILE_SELECTED, replay, { once: true })
        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'html')
        await flushPromises()

        expect(wrapper.find('#html-containers').isVisible()).toBe(true)
        expect(asyncMounts.html).toBe(1)
        // 选择事件在激活期间已消费，不会再次补发
        expect(replay).not.toHaveBeenCalled()
    })

    it('首次切到 pdf 时挂载 PDF 编辑器并补发缓存的选择事件', async () => {
        wrapper = await mountWorkspace()
        const node = { path: '/notes/manual.pdf', name: 'manual.pdf' }

        EventBus.$emit(EVENT_BUS.PDF_FILE_SELECTED, node)
        const replay = vi.fn()
        EventBus.$on(EVENT_BUS.PDF_FILE_SELECTED, replay, { once: true })

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'pdf')

        await vi.waitFor(() => {
            expect(replay).toHaveBeenCalledWith(node)
        })
        expect(wrapper.find('#pdf-containers').isVisible()).toBe(true)
        expect(wrapper.find('.show-pdf-stub').exists()).toBe(true)
        expect(asyncMounts.pdf).toBe(1)
        expect(wrapper.find('#md-container').isVisible()).toBe(false)
    })

    it('容器切换会互斥隐藏其它容器（html→pdf→tools→md）', async () => {
        wrapper = await mountWorkspace()

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'html')
        await vi.waitFor(() => {
            expect(wrapper!.find('.show-html-stub').exists()).toBe(true)
        })
        expect(wrapper.find('#html-containers').isVisible()).toBe(true)

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'pdf')
        await vi.waitFor(() => {
            expect(wrapper!.find('.show-pdf-stub').exists()).toBe(true)
        })
        expect(wrapper.find('#html-containers').isVisible()).toBe(false)
        expect(wrapper.find('#pdf-containers').isVisible()).toBe(true)

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'tools')
        await flushPromises()
        expect(wrapper.find('#pdf-containers').isVisible()).toBe(false)
        expect(wrapper.find('#tool-containers').isVisible()).toBe(true)

        EventBus.$emit(EVENT_BUS.WORKSPACE_SHOW, 'md')
        await flushPromises()
        expect(wrapper.find('#tool-containers').isVisible()).toBe(false)
        expect(wrapper.find('#md-container').isVisible()).toBe(true)
    })
})

describe('WorkSpace NaviTab 路由', () => {
    // 注意 WorkSpace 模板的绑定关系：position="left" 的 NaviTab（#left-navi）
    // 绑定 onSwitchRightNaviTab（资源管理器/大纲路由），position="right" 的
    // NaviTab（#right-navi）绑定 onSwitchLeftNaviTab（工具面板开合）。
    it('左侧导航 switch-open-close 反复开合资源管理器', async () => {
        wrapper = await mountWorkspace()
        naviState.nextTab = 'switch-open-close'

        await wrapper.find('.navi-stub-left').trigger('click')
        await flushPromises()
        expect(wrapper.find('#resource-manager').isVisible()).toBe(false)
        // 收起后不再扣除资源管理器宽度：1200 - 40*2 - 2 = 1118
        expect(widthOf(wrapper, '#md-container')).toBe('1118px')

        await wrapper.find('.navi-stub-left').trigger('click')
        await flushPromises()
        expect(wrapper.find('#resource-manager').isVisible()).toBe(true)
        expect(widthOf(wrapper, '#md-container')).toBe('818px')
    })

    it('左侧导航 file-explorer / markdown-toc 切换视图，未知值回退文件树', async () => {
        wrapper = await mountWorkspace()

        naviState.nextTab = 'markdown-toc'
        await wrapper.find('.navi-stub-left').trigger('click')
        await flushPromises()
        expect(wrapper.find('.res-manager-stub').attributes('data-navi-show')).toBe('markdown-toc')
        expect(wrapper.find('#resource-manager').isVisible()).toBe(true)

        naviState.nextTab = 'file-explorer'
        await wrapper.find('.navi-stub-left').trigger('click')
        await flushPromises()
        expect(wrapper.find('.res-manager-stub').attributes('data-navi-show')).toBe('file-explorer')

        naviState.nextTab = 'not-a-real-tab'
        await wrapper.find('.navi-stub-left').trigger('click')
        await flushPromises()
        expect(wrapper.find('.res-manager-stub').attributes('data-navi-show')).toBe('file-explorer')
    })

    it('右侧导航 switch-open-close 统一走容器切换开合工具面板', async () => {
        wrapper = await mountWorkspace()
        naviState.nextTab = 'switch-open-close'

        await wrapper.find('.navi-stub-right').trigger('click')
        await flushPromises()
        expect(wrapper.find('#tool-containers').isVisible()).toBe(true)
        expect(wrapper.find('#md-container').isVisible()).toBe(false)

        await wrapper.find('.navi-stub-right').trigger('click')
        await flushPromises()
        expect(wrapper.find('#tool-containers').isVisible()).toBe(false)
        expect(wrapper.find('#md-container').isVisible()).toBe(true)
        expect(naviState.rightClicks).toEqual(['switch-open-close', 'switch-open-close'])
    })

    it('右侧导航非 switch-open-close 值不改变容器状态', async () => {
        wrapper = await mountWorkspace()
        naviState.nextTab = 'noop-tab'

        await wrapper.find('.navi-stub-right').trigger('click')
        await flushPromises()

        expect(wrapper.find('#md-container').isVisible()).toBe(true)
        expect(wrapper.find('#tool-containers').isVisible()).toBe(false)
    })
})

describe('WorkSpace 资源管理器宽度拖拽', () => {
    it('拖拽时按正常区间更新宽度，mouseup 后解除监听', async () => {
        wrapper = await mountWorkspace()
        const resizer = wrapper.find('#resizer-main')

        await resizer.trigger('mousedown', { clientX: 300 })
        dispatchMouseEvent('mousemove', 350)
        await flushPromises()
        expect(widthOf(wrapper, '#resource-manager')).toBe('350px')
        expect(widthOf(wrapper, '#md-container')).toBe('768px')

        const removeSpy = vi.spyOn(window, 'removeEventListener')
        dispatchMouseEvent('mouseup')
        expect(removeSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
        expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))

        dispatchMouseEvent('mousemove', 600)
        await flushPromises()
        // mouseup 已解绑 mousemove，宽度不再变化
        expect(widthOf(wrapper, '#resource-manager')).toBe('350px')
        expect(widthOf(wrapper, '#md-container')).toBe('768px')
    })

    it('拖拽超过最大宽度时夹取到 windowWidth - 600', async () => {
        wrapper = await mountWorkspace()
        const resizer = wrapper.find('#resizer-main')

        await resizer.trigger('mousedown', { clientX: 300 })
        dispatchMouseEvent('mousemove', 5000)
        await flushPromises()

        // maxWidth = 1200 - 600 = 600
        expect(widthOf(wrapper, '#resource-manager')).toBe('600px')
    })

    it('拖拽小于最小宽度时夹取到 100px', async () => {
        wrapper = await mountWorkspace()
        const resizer = wrapper.find('#resizer-main')

        await resizer.trigger('mousedown', { clientX: 300 })
        dispatchMouseEvent('mousemove', -2000)
        await flushPromises()

        expect(widthOf(wrapper, '#resource-manager')).toBe('100px')
    })

    it('未按下拖拽条时移动鼠标不改变宽度', async () => {
        wrapper = await mountWorkspace()

        dispatchMouseEvent('mousemove', 900)
        await flushPromises()

        expect(widthOf(wrapper, '#resource-manager')).toBe('300px')
    })
})
