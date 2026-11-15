// @vitest-environment jsdom

/**
 * useDialogDrag 组合式函数单元测试
 *
 * 被测模块：src/renderer/src/composables/useDialogDrag.ts
 * 环境说明：该 composable 依赖 document 全局对象（拖拽监听器）与 Vue 生命周期
 * （onUnmounted 兜底清理），因此使用 jsdom 环境 + @vue/test-utils 挂载测试组件，
 * 使 useDialogDrag 运行在真实组件实例内，保证 onUnmounted 钩子真实生效。
 *
 * 覆盖点：初始样式（center/top/自定义坐标/缺省）、拖拽开始条件（标题栏区域、
 * 关闭按钮、非左键）、document 监听器绑定/解绑、位置增量计算、重置、卸载兜底清理。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { defineComponent } from 'vue'
import { mount, VueWrapper } from '@vue/test-utils'
import {
    useDialogDrag,
    type UseDialogDragOptions
} from '../../../src/renderer/src/composables/useDialogDrag'

type DragApi = ReturnType<typeof useDialogDrag>

// 关闭按钮选择器在源码中为 '.close-btn'，标题栏为 '.title-bar'
const CLOSE_BTN_CLASS = 'close-btn'
const TITLE_BAR_CLASS = 'title-bar'

let addEventListenerSpy: ReturnType<typeof vi.spyOn>
let removeEventListenerSpy: ReturnType<typeof vi.spyOn>
let wrappers: VueWrapper[]

/**
 * document.addEventListener 的被调参数元组。
 * vi.spyOn 的 mock.calls 丢失了重载参数类型（上下文回调参数为隐式 any，TS7006），
 * 故显式声明元组类型供 filter/find 回调标注。
 */
type AddEventListenerCall = [
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: boolean | AddEventListenerOptions
]

beforeEach(() => {
    wrappers = []
    addEventListenerSpy = vi.spyOn(document, 'addEventListener')
    removeEventListenerSpy = vi.spyOn(document, 'removeEventListener')
})

afterEach(() => {
    // 兜底卸载未显式 unmount 的组件，并清理测试 DOM
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    document.body.innerHTML = ''
    addEventListenerSpy.mockRestore()
    removeEventListenerSpy.mockRestore()
    vi.restoreAllMocks()
})

/** 在真实组件上下文中调用 useDialogDrag（onUnmounted 需要组件实例） */
function mountDrag(options?: UseDialogDragOptions): { wrapper: VueWrapper; api: DragApi } {
    let api: DragApi | undefined
    const wrapper = mount(
        defineComponent({
            setup() {
                api = useDialogDrag(options)
                // 无渲染内容，仅提供组件生命周期上下文
                return () => null
            }
        })
    )
    wrappers.push(wrapper)
    if (!api) {
        throw new Error('useDialogDrag 未在组件 setup 中初始化')
    }
    return { wrapper, api }
}

/** 构造最小对话框 DOM：容器 + 标题栏 + 关闭按钮 + 正文 */
function createDialogDom(rect: { left: number; top: number } = { left: 120, top: 80 }) {
    const dialog = document.createElement('div')
    // jsdom 不做布局，手动补 getBoundingClientRect
    dialog.getBoundingClientRect = () =>
        ({
            left: rect.left,
            top: rect.top,
            right: rect.left + 400,
            bottom: rect.top + 300,
            width: 400,
            height: 300,
            x: rect.left,
            y: rect.top,
            toJSON: () => ({})
        }) as DOMRect

    const titleBar = document.createElement('div')
    titleBar.className = TITLE_BAR_CLASS

    const closeBtn = document.createElement('button')
    closeBtn.className = CLOSE_BTN_CLASS
    titleBar.appendChild(closeBtn)

    const body = document.createElement('div')
    body.className = 'dialog-body'

    dialog.append(titleBar, body)
    document.body.appendChild(dialog)
    return { dialog, titleBar, closeBtn, body }
}

/** 构造 mousedown 事件对象：target/currentTarget 显式指定为真实 DOM 节点 */
function createMouseDownEvent(params: {
    target: Element
    currentTarget: Element
    button?: number
    clientX?: number
    clientY?: number
}): MouseEvent {
    const event = new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        button: params.button ?? 0,
        clientX: params.clientX ?? 0,
        clientY: params.clientY ?? 0
    })
    // 单元测试直接调用 handler，不需要真实坐标换算，target/currentTarget 手动固定
    Object.defineProperty(event, 'target', { value: params.target })
    Object.defineProperty(event, 'currentTarget', { value: params.currentTarget })
    return event
}

/** 向 document 派发鼠标事件，触发拖拽期间注册的 document 级监听器 */
function dispatchOnDocument(type: string, options: MouseEventInit = {}) {
    document.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, ...options }))
}

/** 统计绑定到 document 的 mousemove/mouseup 监听器数量 */
function countDragListeners(): number {
    return addEventListenerSpy.mock.calls.filter(
        (call: AddEventListenerCall) => call[0] === 'mousemove' || call[0] === 'mouseup'
    ).length
}

describe('useDialogDrag initial style', () => {
    it('should provide an empty style when no initial position is configured', () => {
        const { api } = mountDrag()
        expect(api.dialogStyle.value).toEqual({})
        expect(api.isDragging.value).toBe(false)
    })

    it('should center the dialog for the center initial position', () => {
        const { api } = mountDrag({ initialPosition: 'center' })
        expect(api.dialogStyle.value).toEqual({
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            margin: '0'
        })
    })

    it('should place the dialog at 10% from the top for the top initial position', () => {
        const { api } = mountDrag({ initialPosition: 'top' })
        expect(api.dialogStyle.value).toEqual({
            position: 'fixed',
            left: '50%',
            top: '10%',
            transform: 'translateX(-50%)',
            margin: '0'
        })
    })

    it('should use explicit pixel coordinates for a custom initial position', () => {
        const { api } = mountDrag({ initialPosition: { x: 320, y: 180 } })
        expect(api.dialogStyle.value).toEqual({
            position: 'fixed',
            left: '320px',
            top: '180px',
            transform: 'none',
            margin: '0'
        })
    })
})

describe('useDialogDrag drag start', () => {
    it('should not start dragging when mousedown happens outside the title bar', () => {
        const { api } = mountDrag({ initialPosition: 'center' })
        const { dialog, body } = createDialogDom()

        api.onDialogMouseDown(
            createMouseDownEvent({ target: body, currentTarget: dialog, clientX: 10, clientY: 10 })
        )

        expect(api.isDragging.value).toBe(false)
        expect(countDragListeners()).toBe(0)
        expect(api.dialogStyle.value).toMatchObject({ top: '50%' })
    })

    it('should ignore mousedown on the close button', () => {
        const { api } = mountDrag({ initialPosition: 'center' })
        const { dialog, closeBtn } = createDialogDom()

        api.onDialogMouseDown(
            createMouseDownEvent({
                target: closeBtn,
                currentTarget: dialog,
                clientX: 10,
                clientY: 10
            })
        )

        expect(api.isDragging.value).toBe(false)
        expect(countDragListeners()).toBe(0)
    })

    it('should ignore non-left mouse buttons', () => {
        const { api } = mountDrag({ initialPosition: 'center' })
        const { dialog, titleBar } = createDialogDom()

        api.onDialogMouseDown(
            createMouseDownEvent({
                target: titleBar,
                currentTarget: dialog,
                button: 2,
                clientX: 10,
                clientY: 10
            })
        )

        expect(api.isDragging.value).toBe(false)
        expect(countDragListeners()).toBe(0)
    })

    it('should start dragging from the title bar and bind document listeners', () => {
        const { api } = mountDrag({ initialPosition: 'center' })
        const { dialog, titleBar } = createDialogDom({ left: 120, top: 80 })

        const event = createMouseDownEvent({
            target: titleBar,
            currentTarget: dialog,
            clientX: 200,
            clientY: 150
        })
        api.onDialogMouseDown(event)

        expect(api.isDragging.value).toBe(true)
        expect(event.defaultPrevented).toBe(true)
        expect(event.cancelBubble).toBe(true)
        expect(addEventListenerSpy).toHaveBeenCalledWith('mousemove', expect.any(Function))
        expect(addEventListenerSpy).toHaveBeenCalledWith('mouseup', expect.any(Function))
    })

    it('should treat a child element inside the title bar as draggable', () => {
        const { api } = mountDrag({ initialPosition: 'center' })
        const { dialog, titleBar } = createDialogDom()
        const titleText = document.createElement('span')
        titleBar.appendChild(titleText)

        api.onDialogMouseDown(
            createMouseDownEvent({
                target: titleText,
                currentTarget: dialog,
                clientX: 0,
                clientY: 0
            })
        )

        expect(api.isDragging.value).toBe(true)
        expect(countDragListeners()).toBe(2)
    })
})

describe('useDialogDrag dragging', () => {
    it('should move the dialog following pointer deltas while dragging', () => {
        const { api } = mountDrag({ initialPosition: 'center' })
        const { dialog, titleBar } = createDialogDom({ left: 120, top: 80 })

        api.onDialogMouseDown(
            createMouseDownEvent({
                target: titleBar,
                currentTarget: dialog,
                clientX: 200,
                clientY: 150
            })
        )
        dispatchOnDocument('mousemove', { clientX: 230, clientY: 170 })

        expect(api.dialogStyle.value).toEqual({
            position: 'fixed',
            left: '150px', // 120 + (230 - 200)
            top: '100px', // 80 + (170 - 150)
            transform: 'none',
            margin: '0'
        })
        expect(api.isDragging.value).toBe(true)
    })

    it('should compute each position from the drag start instead of accumulating deltas', () => {
        const { api } = mountDrag({ initialPosition: 'center' })
        const { dialog, titleBar } = createDialogDom({ left: 120, top: 80 })

        api.onDialogMouseDown(
            createMouseDownEvent({
                target: titleBar,
                currentTarget: dialog,
                clientX: 200,
                clientY: 150
            })
        )
        // 连续两次 mousemove：位置都相对 mousedown 起点计算
        dispatchOnDocument('mousemove', { clientX: 230, clientY: 170 })
        dispatchOnDocument('mousemove', { clientX: 260, clientY: 200 })

        expect(api.dialogStyle.value).toMatchObject({ left: '180px', top: '130px' })
    })

    it('should ignore mousemove when not dragging', () => {
        const { api } = mountDrag({ initialPosition: 'center' })
        const initialStyle = api.dialogStyle.value

        dispatchOnDocument('mousemove', { clientX: 300, clientY: 300 })

        expect(api.dialogStyle.value).toBe(initialStyle)
        expect(api.isDragging.value).toBe(false)
    })

    it('should stop dragging and remove document listeners on mouseup', () => {
        const { api } = mountDrag({ initialPosition: 'center' })
        const { dialog, titleBar } = createDialogDom({ left: 120, top: 80 })

        api.onDialogMouseDown(
            createMouseDownEvent({
                target: titleBar,
                currentTarget: dialog,
                clientX: 200,
                clientY: 150
            })
        )
        const moveHandler = addEventListenerSpy.mock.calls.find(
            (call: AddEventListenerCall) => call[0] === 'mousemove'
        )?.[1] as EventListener
        const upHandler = addEventListenerSpy.mock.calls.find(
            (call: AddEventListenerCall) => call[0] === 'mouseup'
        )?.[1] as EventListener

        dispatchOnDocument('mouseup')

        expect(api.isDragging.value).toBe(false)
        expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', moveHandler)
        expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', upHandler)

        // 结束后再移动，位置不再变化
        const styleAfterDrag = api.dialogStyle.value
        dispatchOnDocument('mousemove', { clientX: 999, clientY: 999 })
        expect(api.dialogStyle.value).toBe(styleAfterDrag)
    })

    it('should restore the initial style on resetPosition', () => {
        const { api } = mountDrag({ initialPosition: 'center' })
        const { dialog, titleBar } = createDialogDom({ left: 120, top: 80 })

        api.onDialogMouseDown(
            createMouseDownEvent({
                target: titleBar,
                currentTarget: dialog,
                clientX: 200,
                clientY: 150
            })
        )
        dispatchOnDocument('mousemove', { clientX: 250, clientY: 200 })
        expect(api.dialogStyle.value).toMatchObject({ left: '170px', top: '130px' })

        api.resetPosition()

        expect(api.dialogStyle.value).toEqual({
            position: 'fixed',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            margin: '0'
        })
    })
})

describe('useDialogDrag cleanup', () => {
    it('should reset dragging state and remove document listeners on unmount', () => {
        const { wrapper, api } = mountDrag({ initialPosition: 'center' })
        const { dialog, titleBar } = createDialogDom({ left: 120, top: 80 })

        api.onDialogMouseDown(
            createMouseDownEvent({
                target: titleBar,
                currentTarget: dialog,
                clientX: 200,
                clientY: 150
            })
        )
        expect(api.isDragging.value).toBe(true)
        const moveHandler = addEventListenerSpy.mock.calls.find(
            (call: AddEventListenerCall) => call[0] === 'mousemove'
        )?.[1] as EventListener
        const upHandler = addEventListenerSpy.mock.calls.find(
            (call: AddEventListenerCall) => call[0] === 'mouseup'
        )?.[1] as EventListener

        wrapper.unmount()

        expect(api.isDragging.value).toBe(false)
        expect(removeEventListenerSpy).toHaveBeenCalledWith('mousemove', moveHandler)
        expect(removeEventListenerSpy).toHaveBeenCalledWith('mouseup', upHandler)

        // 卸载后 document 上不再残留监听器：移动不会改写样式
        const styleAfterUnmount = api.dialogStyle.value
        dispatchOnDocument('mousemove', { clientX: 400, clientY: 400 })
        expect(api.dialogStyle.value).toBe(styleAfterUnmount)
    })
})
