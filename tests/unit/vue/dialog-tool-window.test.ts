// @vitest-environment jsdom
/**
 * 非模态工具窗统一壳行为契约（视觉升级 1.5.5 P1-B1，T6）
 *
 * 1.5.3 已把「插入/编辑工具」对话框改为非模态工具窗（`tool-window` + 系统开关），本批
 * 视觉升级在此之上补齐统一壳行为，避免各工具窗各自实现而分叉：
 * 1. 壳标记：`data-dialog-shell="tool-window"` / `dialog-container--tool-window` /
 *    `title-bar--tool-window` / 标题栏 6 点拖拽把手（aria-hidden）；
 * 2. 焦点：打开时聚焦正文首个可交互元素（优先输入控件），没有则回落第一个按钮/容器；
 *    关闭时归还打开前焦点；用户已把焦点移到编辑器时不抢回；
 * 3. 键盘：`Esc` 只关最顶层工具窗，且**仅当焦点位于工具窗内**时生效（焦点在编辑器时
 *    把 Esc 交还编辑器，与编辑器焦点/快捷键互不干扰）；`closeOnEscape=false` 时不关闭；
 * 4. 滚动：非模态工具窗不锁 body 滚动（编辑器可继续滚动）；模态对话框仍锁；
 * 5. 外部点击不关闭（保持 1.5.3 行为）、遮罩透明且点击穿透、可拖动标题栏/拖拽把手。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { nextTick } from 'vue'

import BaseDialog from '@renderer/components/dialogs/BaseDialog.vue'

const dialogMountOptions = {
    global: { stubs: { teleport: true } },
    // 焦点断言前提：挂到 document.body（游离 DOM 的 focus() 不写入 activeElement）
    attachTo: document.body
}

let wrappers: VueWrapper[] = []

function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

/** 挂载一个可见的非模态工具窗 */
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

/** 等待打开后的焦点逻辑（watch flush:post + nextTick）完成 */
async function flushFocus(): Promise<void> {
    await nextTick()
    await nextTick()
}

function activeElement(): HTMLElement | null {
    return document.activeElement instanceof HTMLElement ? document.activeElement : null
}

function pressEscape(): KeyboardEvent {
    // cancelable: true —— 只有可取消事件才能让 preventDefault 生效（jsdom 默认 false）
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
    document.dispatchEvent(event)
    return event
}

beforeEach(() => {
    document.body.style.removeProperty('overflow')
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) wrapper.unmount()
    }
    wrappers = []
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
})

describe('T6 工具窗统一壳结构', () => {
    it('壳标记、拖拽把手与非模态语义齐全', () => {
        const wrapper = mountToolWindow()
        const container = wrapper.find('.dialog-container')
        expect(container.classes()).toContain('dialog-container--tool-window')
        expect(container.attributes('data-dialog-shell')).toBe('tool-window')
        expect(container.attributes('role')).toBe('dialog')
        // 非模态：aria-modal=false（读屏不把背后内容当作不可交互）
        expect(container.attributes('aria-modal')).toBe('false')

        const titleBar = wrapper.find('.title-bar')
        expect(titleBar.classes()).toContain('title-bar--tool-window')
        // 6 点拖拽把手：标题栏左侧纹理，装饰性节点不进无障碍树
        const handle = wrapper.find('.tool-window-drag-handle')
        expect(handle.exists()).toBe(true)
        expect(handle.attributes('aria-hidden')).toBe('true')
        // 把手是标题栏直接子节点且在标题文字之前（视觉顺序：把手 → 标题 → 关闭）
        expect(handle.element.parentElement).toBe(titleBar.element)
        expect(titleBar.element.firstElementChild).toBe(handle.element)
    })

    it('tool-window prop 受系统开关控制（默认开启 → 非模态工具窗语义）', () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...dialogMountOptions,
                props: { visible: true, title: '工具窗', toolWindow: true },
                slots: { default: '<input class="tool-input" />' }
            }) as VueWrapper
        )
        expect(wrapper.find('.dialog-container').classes()).toContain(
            'dialog-container--tool-window'
        )
        expect(wrapper.find('.dialog-container').attributes('aria-modal')).toBe('false')
    })

    it('模态对话框不渲染拖拽把手（保持既有标题栏结构）', () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...dialogMountOptions,
                props: { visible: true, title: '对话框' }
            }) as VueWrapper
        )
        expect(wrapper.find('.tool-window-drag-handle').exists()).toBe(false)
        expect(wrapper.find('.dialog-container').classes()).not.toContain(
            'dialog-container--tool-window'
        )
        expect(wrapper.find('.dialog-container').attributes('aria-modal')).toBe('true')
    })
})

describe('T6 工具窗打开焦点', () => {
    it('打开时聚焦正文首个可交互元素，且优先输入控件而非标题栏/底栏按钮', async () => {
        const wrapper = mountToolWindow(
            {},
            {
                default:
                    '<button class="toolbar-btn">工具栏</button><input class="tool-input" /><textarea class="tool-textarea"></textarea>',
                footer: '<button class="footer-btn">插入</button>'
            }
        )
        await flushFocus()
        // 内容区第一个可交互元素是按钮；但 T6 要求优先输入类控件
        expect(activeElement()).toBe(wrapper.find('.tool-input').element)
        expect(activeElement()?.closest('.title-bar')).toBeNull()
        expect(activeElement()?.closest('.footer')).toBeNull()
    })

    it('正文没有输入控件时聚焦首个可交互按钮', async () => {
        const wrapper = mountToolWindow(
            {},
            { default: '<button class="first-action">动作</button><button>次要</button>' }
        )
        await flushFocus()
        expect(activeElement()).toBe(wrapper.find('.first-action').element)
    })

    it('正文没有可交互元素时聚焦容器本身（仍保证焦点在窗内）', async () => {
        const wrapper = mountToolWindow({}, { default: '<p class="plain-text">纯文本</p>' })
        await flushFocus()
        expect(activeElement()).toBe(wrapper.find('.dialog-container').element)
    })

    it('关闭后焦点归还打开前的元素', async () => {
        const trigger = document.createElement('button')
        trigger.textContent = '打开工具窗'
        document.body.appendChild(trigger)
        trigger.focus()

        const wrapper = mountToolWindow()
        await flushFocus()
        expect(activeElement()).toBe(wrapper.find('.tool-input').element)

        await wrapper.setProps({ visible: false })
        await flushFocus()
        expect(activeElement()).toBe(trigger)
    })

    it('用户已把焦点移到编辑器后关闭工具窗：不抢回焦点', async () => {
        const editor = document.createElement('textarea')
        editor.className = 'external-editor'
        document.body.appendChild(editor)
        editor.focus()

        const wrapper = mountToolWindow()
        await flushFocus()
        expect(activeElement()).toBe(wrapper.find('.tool-input').element)

        // 模拟用户点击编辑器继续输入（非模态允许）
        editor.focus()
        await wrapper.setProps({ visible: false })
        await flushFocus()
        expect(activeElement()).toBe(editor)
    })
})

describe('T6 工具窗 Esc 语义（只关最顶层 + 与编辑器互不干扰）', () => {
    it('焦点在工具窗内时 Esc 关闭', async () => {
        const wrapper = mountToolWindow()
        await flushFocus()
        pressEscape()
        await nextTick()
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('焦点在编辑器（工具窗外）时 Esc 不关闭，也不拦截事件', async () => {
        const editor = document.createElement('textarea')
        document.body.appendChild(editor)
        editor.focus()

        const wrapper = mountToolWindow()
        await flushFocus()
        editor.focus()

        const event = pressEscape()
        await nextTick()
        expect(wrapper.emitted('close')).toBeUndefined()
        // 不调用 preventDefault：Esc 仍可被编辑器/其他全局快捷键消费（T6 互不干扰）
        expect(event.defaultPrevented).toBe(false)
    })

    it('输入法组合中的 Esc 不关闭工具窗', async () => {
        const wrapper = mountToolWindow()
        await flushFocus()
        const event = new KeyboardEvent('keydown', {
            key: 'Escape',
            bubbles: true,
            isComposing: true
        })
        document.dispatchEvent(event)
        await nextTick()
        expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('closeOnEscape=false：Esc 被拦截但不关闭', async () => {
        const wrapper = mountToolWindow({ closeOnEscape: false })
        await flushFocus()
        const event = pressEscape()
        await nextTick()
        expect(wrapper.emitted('close')).toBeUndefined()
        expect(event.defaultPrevented).toBe(true)
    })

    it('多个工具窗同时打开时 Esc 只关闭最顶层', async () => {
        const lower = mountToolWindow({ title: '下层工具窗' })
        await flushFocus()
        const upper = mountToolWindow({ title: '上层工具窗' })
        await flushFocus()

        // 上层打开后焦点进入上层内容
        expect(activeElement()?.closest('.dialog-container')).toBe(
            upper.find('.dialog-container').element
        )

        pressEscape()
        await nextTick()
        expect(upper.emitted('close')).toHaveLength(1)
        expect(lower.emitted('close')).toBeUndefined()

        // 上层关闭出栈后，下一次 Esc 才作用于下层
        await upper.setProps({ visible: false })
        await flushFocus()
        const lowerInput = lower.find('.tool-input').element as HTMLElement
        lowerInput.focus()
        pressEscape()
        await nextTick()
        expect(lower.emitted('close')).toHaveLength(1)
    })
})

describe('T6 工具窗滚动锁与外部点击', () => {
    it('非模态工具窗打开期间不锁 body 滚动（编辑器可继续滚动）', async () => {
        const wrapper = mountToolWindow()
        await flushFocus()
        expect(document.body.style.overflow).toBe('')
        await wrapper.setProps({ visible: false })
        await flushFocus()
        expect(document.body.style.overflow).toBe('')
    })

    it('模态对话框仍锁定 body 滚动（既有 UI-13 契约不回退）', async () => {
        const wrapper = track(
            mount(BaseDialog, {
                ...dialogMountOptions,
                props: { visible: true, title: '模态对话框' }
            }) as VueWrapper
        )
        await flushFocus()
        expect(document.body.style.overflow).toBe('hidden')
        await wrapper.setProps({ visible: false })
        await flushFocus()
        expect(document.body.style.overflow).toBe('')
    })

    it('遮罩透明且点击穿透：点击外部不关闭（保持 1.5.3 行为）', async () => {
        const wrapper = mountToolWindow()
        await flushFocus()
        const overlay = wrapper.find('.dialog-overlay')
        const style = overlay.attributes('style') ?? ''
        expect(style).toContain('pointer-events: none')
        expect(style).toContain('background: transparent')

        await overlay.trigger('click')
        await nextTick()
        expect(wrapper.emitted('close')).toBeUndefined()
    })
})

describe('T6 工具窗拖拽', () => {
    it('拖动标题栏（含拖拽把手）改写容器定位', async () => {
        const wrapper = mountToolWindow()
        await flushFocus()
        await wrapper.find('.title-bar').trigger('mousedown', {
            button: 0,
            clientX: 100,
            clientY: 100
        })
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 180, clientY: 160 }))
        await nextTick()
        expect(wrapper.find('.dialog-container').attributes('style')).toContain('left: 80px')
        document.dispatchEvent(new MouseEvent('mouseup'))
    })

    it('从拖拽把手按下同样触发标题栏拖拽（把手在标题栏内）', async () => {
        const wrapper = mountToolWindow()
        await flushFocus()
        await wrapper.find('.tool-window-drag-handle').trigger('mousedown', {
            button: 0,
            clientX: 100,
            clientY: 100
        })
        document.dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 130 }))
        await nextTick()
        expect(wrapper.find('.dialog-container').attributes('style')).toContain('left: 40px')
        document.dispatchEvent(new MouseEvent('mouseup'))
    })
})
