// @vitest-environment jsdom
/**
 * PF-12：MarkdownEditToolsComponent 的 ResizeObserver 生命周期清理防回归。
 *
 * 背景：组件在 onMounted 中创建 ResizeObserver 观察工具栏容器，但改造前既未保存实例
 * 引用、onBeforeUnmount 也未 disconnect()，组件卸载后 observer 仍观察已脱离 DOM 的
 * 容器，阻碍组件实例与容器节点回收（渲染层内存泄漏缺口）。
 *
 * 隔离策略：
 * - 「结构优化第 2 批 2.2（H4）」后工具栏直接从 hemy-editor-quick-access 引入 QuickAccess
 *   （不再经 hemy-editor 聚合桶把 Monaco/编辑器动作拉进工具栏 chunk）；本文件只验证工具栏
 *   容器的尺寸观察与生命周期，故 mock 为最小 QuickAccess 结构（只需 id/titleKey/svg 等模板字段）。
 * - jsdom 不提供 ResizeObserver，用记录实例的 FakeResizeObserver 桩替代，从而可断言
 *   observe/disconnect 调用与手动触发尺寸回调。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

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

/** 记录实例的 ResizeObserver 桩：jsdom 无原生实现，且需要断言 disconnect */
class FakeResizeObserver {
    static instances: FakeResizeObserver[] = []

    observe = vi.fn()
    unobserve = vi.fn()
    disconnect = vi.fn()

    constructor(public readonly callback: ResizeObserverCallback) {
        FakeResizeObserver.instances.push(this)
    }

    /** 手动触发观察回调，模拟容器尺寸变化 */
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
})

function mountToolbar(): VueWrapper {
    wrapper = mount(MarkdownEditToolsComponent, {
        props: { toolBarWidth: '100%' },
        attachTo: document.body
    })
    return wrapper
}

/** 取本次挂载创建的 ResizeObserver 实例（组件只应创建一个） */
function observer(): FakeResizeObserver {
    expect(FakeResizeObserver.instances).toHaveLength(1)
    return FakeResizeObserver.instances[0]
}

describe('MarkdownEditToolsComponent ResizeObserver lifecycle (PF-12)', () => {
    it('creates one ResizeObserver and observes the toolbar container on mount', () => {
        const w = mountToolbar()
        const instance = observer()

        expect(instance.observe).toHaveBeenCalledTimes(1)
        expect(instance.observe).toHaveBeenCalledWith(w.find('.toolbar-container').element)
        // 挂载阶段不应提前断开
        expect(instance.disconnect).not.toHaveBeenCalled()
    })

    it('disconnects the ResizeObserver when the component unmounts', () => {
        const w = mountToolbar()
        const instance = observer()

        w.unmount()
        wrapper = null

        expect(instance.disconnect).toHaveBeenCalledTimes(1)
    })

    it('removes the window resize listener when the component unmounts', () => {
        const removeListener = vi.spyOn(window, 'removeEventListener')
        const w = mountToolbar()

        w.unmount()
        wrapper = null

        expect(removeListener).toHaveBeenCalledWith('resize', expect.any(Function))
    })

    it('recalculates button size when the observed container reports a resize', async () => {
        const w = mountToolbar()
        await flushPromises()

        // jsdom 默认 clientWidth = 0 → 按钮尺寸落到下限 20px
        expect(w.find('.tool-btn').attributes('style')).toContain('width: 20px')

        const container = w.find('.toolbar-container').element
        Object.defineProperty(container, 'clientWidth', { configurable: true, value: 1000 })

        observer().trigger()
        await w.vm.$nextTick()

        // (1000 - 2 * 2) / 3 ≈ 332px → 被钳制到上限 35px
        expect(w.find('.tool-btn').attributes('style')).toContain('width: 35px')
    })
})
