import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useWindowManagement } from '../../src/renderer/src/composables/useWindowManagement'

// 该 composable 本身不依赖 Vue 生命周期钩子，仅依赖 window.electron 与 document，
// 因此在 node 环境下用 stubGlobal 提供浏览器全局对象即可直接调用。

let ipcSend: ReturnType<typeof vi.fn>
let ipcInvoke: ReturnType<typeof vi.fn>
let docListeners: Map<string, Array<(e: unknown) => void>>
let addEventListenerMock: ReturnType<typeof vi.fn>
let removeEventListenerMock: ReturnType<typeof vi.fn>
// onReLayout 作为 UseWindowManagementOptions.onReLayout（() => void）传入，
// 用精确签名替代 vi.fn() 的 Procedure|Constructable 宽签名，否则选项赋值 TS2322。
let onReLayout: Mock<() => void>

beforeEach(() => {
    ipcSend = vi.fn()
    ipcInvoke = vi.fn()
    docListeners = new Map()
    addEventListenerMock = vi.fn((type: string, fn: (e: unknown) => void) => {
        if (!docListeners.has(type)) {
            docListeners.set(type, [])
        }
        docListeners.get(type)!.push(fn)
    })
    removeEventListenerMock = vi.fn((type: string, fn: (e: unknown) => void) => {
        const list = docListeners.get(type)
        if (list) {
            const index = list.indexOf(fn)
            if (index >= 0) {
                list.splice(index, 1)
            }
        }
    })
    onReLayout = vi.fn<() => void>()

    vi.stubGlobal('window', {
        electron: { ipcRenderer: { send: ipcSend, invoke: ipcInvoke } },
        innerWidth: 1000,
        innerHeight: 800
    })
    vi.stubGlobal('document', {
        addEventListener: addEventListenerMock,
        removeEventListener: removeEventListenerMock
    })
})

afterEach(() => {
    vi.unstubAllGlobals()
})

// 触发 document 上注册的指定类型监听器
function fireDocumentListener(type: string, event: unknown) {
    const listeners = docListeners.get(type) ?? []
    for (const listener of [...listeners]) {
        listener(event)
    }
}

// 构造一个基础的鼠标事件：仅实现 composable 实际读取的字段，
// 在声明处一次性断言为 MouseEvent，避免每个调用点重复 TS2352 转换错误。
function mouseEvent(overrides: Record<string, unknown> = {}): MouseEvent {
    return {
        target: { closest: () => null },
        button: 0,
        screenX: 400,
        screenY: 500,
        clientY: 300,
        preventDefault: vi.fn(),
        ...overrides
    } as unknown as MouseEvent
}

describe('useWindowManagement', () => {
    it('should expose reactive state with initial values', () => {
        const mgr = useWindowManagement()
        expect(mgr.isDragging.value).toBe(false)
        expect(mgr.isResizing.value).toBe(false)
    })

    it('should send window-minimize and notify layout on minimize', () => {
        const mgr = useWindowManagement({ onReLayout })
        mgr.minimizeWindow()
        expect(ipcSend).toHaveBeenCalledWith('baize:window:minimize')
        expect(onReLayout).toHaveBeenCalledTimes(1)
    })

    it('should send window-maximize and notify layout on maximize', () => {
        const mgr = useWindowManagement({ onReLayout })
        mgr.maximizeWindow()
        expect(ipcSend).toHaveBeenCalledWith('baize:window:maximize')
        expect(onReLayout).toHaveBeenCalledTimes(1)
    })

    it('should send window-close without notifying layout on close', () => {
        const mgr = useWindowManagement({ onReLayout })
        mgr.closeWindow()
        expect(ipcSend).toHaveBeenCalledWith('baize:window:close')
        expect(onReLayout).not.toHaveBeenCalled()
    })

    it('should ignore title bar mousedown on window-controls', async () => {
        const mgr = useWindowManagement({ onReLayout })
        await mgr.onTitleBarMouseDown(mouseEvent({ target: { closest: () => ({}) } }) as MouseEvent)
        expect(ipcSend).not.toHaveBeenCalled()
        expect(mgr.isDragging.value).toBe(false)
    })

    it('should ignore title bar mousedown for non-left buttons', async () => {
        const mgr = useWindowManagement({ onReLayout })
        await mgr.onTitleBarMouseDown(mouseEvent({ button: 1 }) as MouseEvent)
        expect(ipcSend).not.toHaveBeenCalled()
        expect(mgr.isDragging.value).toBe(false)
    })

    it('should start dragging and move the window for a non-maximized window', async () => {
        ipcInvoke.mockImplementation((channel: string) => {
            if (channel === 'baize:window:get-bounds') {
                return Promise.resolve({ x: 100, y: 200, width: 1000, height: 800 })
            }
            if (channel === 'baize:window:is-maximized') {
                return Promise.resolve(false)
            }
            return Promise.resolve(undefined)
        })
        const mgr = useWindowManagement({ onReLayout })
        const preventDefault = vi.fn()
        await mgr.onTitleBarMouseDown(
            mouseEvent({ screenX: 400, screenY: 500, clientY: 300, preventDefault }) as MouseEvent
        )

        expect(ipcSend).not.toHaveBeenCalledWith('baize:window:start-drag')
        expect(mgr.isDragging.value).toBe(true)
        expect(preventDefault).toHaveBeenCalled()
        expect(onReLayout).toHaveBeenCalled()
        expect(addEventListenerMock).toHaveBeenCalledWith('mousemove', expect.any(Function))
        expect(addEventListenerMock).toHaveBeenCalledWith('mouseup', expect.any(Function))

        // dragOffset = (400-100, 500-200) = (300, 300)，移动时按新坐标发送 window-move
        fireDocumentListener('mousemove', { screenX: 450, screenY: 560 })
        expect(ipcSend).toHaveBeenCalledWith('baize:window:move', 150, 260)
    })

    it('should compute maximized drag offsets with window.innerWidth', async () => {
        ipcInvoke.mockImplementation((channel: string) => {
            if (channel === 'baize:window:get-bounds') {
                return Promise.resolve({ x: 0, y: 0, width: 1000, height: 800 })
            }
            if (channel === 'baize:window:is-maximized') {
                return Promise.resolve(true)
            }
            return Promise.resolve(undefined)
        })
        const mgr = useWindowManagement()
        await mgr.onTitleBarMouseDown(
            mouseEvent({ screenX: 500, screenY: 200, clientY: 100 }) as MouseEvent
        )
        // dragOffset.x = 1000*(500-0)/1000 = 500; newX = 500-500 = 0; newY = 200-100 = 100
        expect(ipcSend).toHaveBeenCalledWith('baize:window:move', 0, 100)

        fireDocumentListener('mousemove', { screenX: 550, screenY: 250 })
        expect(ipcSend).toHaveBeenCalledWith('baize:window:move', 50, 150)
    })

    it('should keep dragging active when bounds are unavailable', async () => {
        ipcInvoke.mockResolvedValue(null)
        const mgr = useWindowManagement()
        await mgr.onTitleBarMouseDown(mouseEvent() as MouseEvent)
        expect(ipcSend).not.toHaveBeenCalledWith('baize:window:start-drag')
        expect(mgr.isDragging.value).toBe(true)
        expect(addEventListenerMock).toHaveBeenCalledWith('mousemove', expect.any(Function))
    })

    it('should stop dragging and remove listeners on mouseup', async () => {
        ipcInvoke.mockResolvedValue({ x: 0, y: 0, width: 1000, height: 800 })
        const mgr = useWindowManagement()
        await mgr.onTitleBarMouseDown(mouseEvent() as MouseEvent)
        expect(mgr.isDragging.value).toBe(true)

        fireDocumentListener('mouseup', {})
        expect(mgr.isDragging.value).toBe(false)
        expect(removeEventListenerMock).toHaveBeenCalledWith('mousemove', expect.any(Function))
        expect(removeEventListenerMock).toHaveBeenCalledWith('mouseup', expect.any(Function))

        // 停止拖动后移动不再发送 window-move
        ipcSend.mockClear()
        fireDocumentListener('mousemove', { screenX: 999, screenY: 999 })
        expect(ipcSend).not.toHaveBeenCalled()
    })

    it('should ignore title bar double-click on window-controls', () => {
        const mgr = useWindowManagement({ onReLayout })
        mgr.onTitleBarDblClick(mouseEvent({ target: { closest: () => ({}) } }) as MouseEvent)
        expect(ipcSend).not.toHaveBeenCalled()
        expect(onReLayout).not.toHaveBeenCalled()
    })

    it('should toggle maximize on title bar double-click', () => {
        const mgr = useWindowManagement({ onReLayout })
        mgr.onTitleBarDblClick(mouseEvent() as MouseEvent)
        expect(ipcSend).toHaveBeenCalledWith('baize:window:toggle-maximize')
        expect(onReLayout).toHaveBeenCalledTimes(1)
    })

    it('should ignore resize mousedown for non-left buttons', async () => {
        const mgr = useWindowManagement({ onReLayout })
        await mgr.onResizeMouseDown('right', mouseEvent({ button: 2 }) as MouseEvent)
        expect(mgr.isResizing.value).toBe(false)
        expect(ipcSend).not.toHaveBeenCalled()
        expect(onReLayout).not.toHaveBeenCalled()
    })

    it('should ignore resize when the window is maximized', async () => {
        ipcInvoke.mockImplementation((channel: string) => {
            if (channel === 'baize:window:is-maximized') {
                return Promise.resolve(true)
            }
            return Promise.resolve(undefined)
        })
        const mgr = useWindowManagement({ onReLayout })
        await mgr.onResizeMouseDown('right', mouseEvent() as MouseEvent)
        expect(mgr.isResizing.value).toBe(false)
        expect(ipcSend).not.toHaveBeenCalled()
    })

    it('should start resizing and register listeners', async () => {
        ipcInvoke.mockImplementation((channel: string) => {
            if (channel === 'baize:window:is-maximized') {
                return Promise.resolve(false)
            }
            if (channel === 'baize:window:get-bounds') {
                return Promise.resolve({ x: 0, y: 0, width: 800, height: 600 })
            }
            return Promise.resolve(undefined)
        })
        const mgr = useWindowManagement({ onReLayout })
        const preventDefault = vi.fn()
        await mgr.onResizeMouseDown(
            'right',
            mouseEvent({ screenX: 100, screenY: 100, preventDefault }) as MouseEvent
        )
        expect(mgr.isResizing.value).toBe(true)
        expect(preventDefault).toHaveBeenCalled()
        expect(addEventListenerMock).toHaveBeenCalledWith('mousemove', expect.any(Function))
        expect(addEventListenerMock).toHaveBeenCalledWith('mouseup', expect.any(Function))
    })

    it('should keep resizing state unchanged when bounds are unavailable', async () => {
        ipcInvoke.mockImplementation((channel: string) => {
            if (channel === 'baize:window:is-maximized') {
                return Promise.resolve(false)
            }
            return Promise.resolve(null)
        })
        const mgr = useWindowManagement()
        await mgr.onResizeMouseDown('right', mouseEvent() as MouseEvent)
        expect(mgr.isResizing.value).toBe(true)
        expect(ipcSend).not.toHaveBeenCalled()
    })

    it('should resize from the right edge and clamp to minimum width', async () => {
        ipcInvoke.mockImplementation((channel: string) => {
            if (channel === 'baize:window:is-maximized') {
                return Promise.resolve(false)
            }
            if (channel === 'baize:window:get-bounds') {
                return Promise.resolve({ x: 0, y: 0, width: 800, height: 600 })
            }
            return Promise.resolve(undefined)
        })
        const mgr = useWindowManagement()
        await mgr.onResizeMouseDown(
            'right',
            mouseEvent({ screenX: 100, screenY: 100 }) as MouseEvent
        )

        // dx = +200 → width = 1000
        fireDocumentListener('mousemove', { screenX: 300, screenY: 100 })
        expect(ipcSend).toHaveBeenCalledWith('baize:window:move', 0, 0)
        expect(ipcSend).toHaveBeenCalledWith('baize:window:set-size', 1000, 600)

        // dx = -150 → width 被 MIN_WIDTH(800) 截断
        ipcSend.mockClear()
        fireDocumentListener('mousemove', { screenX: -50, screenY: 100 })
        expect(ipcSend).toHaveBeenCalledWith('baize:window:set-size', 800, 600)
    })

    it('should adjust x/y when resizing from the left/top edges', async () => {
        ipcInvoke.mockImplementation((channel: string) => {
            if (channel === 'baize:window:is-maximized') {
                return Promise.resolve(false)
            }
            if (channel === 'baize:window:get-bounds') {
                return Promise.resolve({ x: 100, y: 50, width: 900, height: 700 })
            }
            return Promise.resolve(undefined)
        })
        const mgr = useWindowManagement()
        // 从左边缘拖动：dx=-100 → newWidth=max(800,1000)=1000, x=100+(900-1000)=0
        await mgr.onResizeMouseDown(
            'left',
            mouseEvent({ screenX: 100, screenY: 100 }) as MouseEvent
        )
        fireDocumentListener('mousemove', { screenX: 0, screenY: 100 })
        expect(ipcSend).toHaveBeenCalledWith('baize:window:move', 0, 50)
        expect(ipcSend).toHaveBeenCalledWith('baize:window:set-size', 1000, 700)

        // 从上边缘拖动：dy=-100 → newHeight=max(600,800)=800, y=50+(700-800)=-50
        ipcSend.mockClear()
        await mgr.onResizeMouseDown('top', mouseEvent({ screenX: 100, screenY: 100 }) as MouseEvent)
        fireDocumentListener('mousemove', { screenX: 100, screenY: 0 })
        expect(ipcSend).toHaveBeenCalledWith('baize:window:move', 100, -50)
        expect(ipcSend).toHaveBeenCalledWith('baize:window:set-size', 900, 800)
    })

    it('should reset resizing state and notify layout on resize mouseup', async () => {
        ipcInvoke.mockImplementation((channel: string) => {
            if (channel === 'baize:window:is-maximized') {
                return Promise.resolve(false)
            }
            if (channel === 'baize:window:get-bounds') {
                return Promise.resolve({ x: 0, y: 0, width: 800, height: 600 })
            }
            return Promise.resolve(undefined)
        })
        const mgr = useWindowManagement({ onReLayout })
        await mgr.onResizeMouseDown('right', mouseEvent() as MouseEvent)
        expect(mgr.isResizing.value).toBe(true)

        fireDocumentListener('mouseup', {})
        expect(mgr.isResizing.value).toBe(false)
        expect(onReLayout).toHaveBeenCalledTimes(1)
        expect(removeEventListenerMock).toHaveBeenCalledWith('mousemove', expect.any(Function))
        expect(removeEventListenerMock).toHaveBeenCalledWith('mouseup', expect.any(Function))
    })

    it('should remove drag and resize listeners on cleanup', async () => {
        ipcInvoke.mockImplementation((channel: string) => {
            if (channel === 'baize:window:is-maximized') {
                return Promise.resolve(false)
            }
            return Promise.resolve({ x: 0, y: 0, width: 800, height: 600 })
        })
        const mgr = useWindowManagement()
        await mgr.onTitleBarMouseDown(mouseEvent() as MouseEvent)
        await mgr.onResizeMouseDown('right', mouseEvent() as MouseEvent)
        removeEventListenerMock.mockClear()

        mgr.cleanupWindowEvents()
        // 拖拽 + 缩放各 2 个监听器，共 4 次移除
        expect(removeEventListenerMock).toHaveBeenCalledTimes(4)
    })
})
