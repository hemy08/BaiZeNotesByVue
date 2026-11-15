/**
 * PF-7：窗口拖拽/缩放 IPC 的 requestAnimationFrame 合帧测试。
 *
 * 与 useWindowManagement.test.ts 的 node 环境用例互补：
 * - 该文件在 node（无 requestAnimationFrame）下验证「立即发送」的既有行为；
 * - 本文件在模块加载前 stub requestAnimationFrame/cancelAnimationFrame，验证渲染进程真实环境下
 *   「每帧最多一次 IPC」「mouseup 必发最终位置」「清理时取消未执行帧」。
 *
 * 说明：composable 在模块加载期读取 requestAnimationFrame 是否存在，因此必须先 stub 全局再
 * 动态 import（static import 会被提升到 stub 之前）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Mock } from 'vitest'
import { useWindowManagement as useWindowManagementImpl } from '../../src/renderer/src/composables/useWindowManagement'

type MouseEventLike = Record<string, unknown>

interface WindowManagement {
    isDragging: { value: boolean }
    isResizing: { value: boolean }
    onTitleBarMouseDown: (e: MouseEvent) => Promise<void>
    onResizeMouseDown: (direction: string, e: MouseEvent) => Promise<void>
    cleanupWindowEvents: () => void
}

type UseWindowManagement = (options?: { onReLayout?: () => void }) => WindowManagement

let useWindowManagement: UseWindowManagement | null = null
let ipcSend: Mock
let ipcInvoke: Mock
let docListeners: Map<string, Array<(e: unknown) => void>>
let frames: Map<number, FrameRequestCallback>
let nextFrameId = 1
let canceledFrameIds: number[]
let onReLayout: Mock<() => void>

/** 执行所有待执行动画帧（模拟浏览器的一帧） */
function runAnimationFrames(): void {
    const pending = Array.from(frames.entries())
    frames.clear()
    for (const [, callback] of pending) {
        callback(performance.now())
    }
}

function fireDocumentListener(type: string, event: unknown): void {
    const listeners = docListeners.get(type) ?? []
    for (const listener of [...listeners]) {
        listener(event)
    }
}

function mouseEvent(overrides: MouseEventLike = {}): MouseEvent {
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

/** 统计某个通道的调用次数 */
function sendCallCount(channel: string): number {
    return ipcSend.mock.calls.filter((call) => call[0] === channel).length
}

/** 取某个通道最后一次调用的参数 */
function lastSendArgs(channel: string): unknown[] | null {
    const calls = ipcSend.mock.calls.filter((call) => call[0] === channel)
    if (calls.length === 0) {
        return null
    }
    return calls[calls.length - 1].slice(1)
}

function stubBounds(): void {
    ipcInvoke.mockImplementation((channel: string) => {
        if (channel === 'baize:window:is-maximized') {
            return Promise.resolve(false)
        }
        if (channel === 'baize:window:get-bounds') {
            return Promise.resolve({ x: 100, y: 200, width: 800, height: 600 })
        }
        return Promise.resolve(undefined)
    })
}

beforeEach(() => {
    ipcSend = vi.fn()
    ipcInvoke = vi.fn()
    docListeners = new Map()
    frames = new Map()
    nextFrameId = 1
    canceledFrameIds = []
    onReLayout = vi.fn<() => void>()

    vi.stubGlobal('window', {
        electron: { ipcRenderer: { send: ipcSend, invoke: ipcInvoke } },
        innerWidth: 1000,
        innerHeight: 800
    })
    vi.stubGlobal('document', {
        addEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
            if (!docListeners.has(type)) {
                docListeners.set(type, [])
            }
            docListeners.get(type)!.push(fn)
        }),
        removeEventListener: vi.fn((type: string, fn: (e: unknown) => void) => {
            const list = docListeners.get(type)
            if (!list) {
                return
            }
            const index = list.indexOf(fn)
            if (index >= 0) {
                list.splice(index, 1)
            }
        })
    })
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
        const id = nextFrameId
        nextFrameId += 1
        frames.set(id, callback)
        return id
    })
    vi.stubGlobal('cancelAnimationFrame', (id: number) => {
        canceledFrameIds.push(id)
        frames.delete(id)
    })

    // composable 在每次调度时读取全局 rAF（非模块加载期快照），因此 stub 全局后直接使用即可
    useWindowManagement = useWindowManagementImpl as UseWindowManagement
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    useWindowManagement = null
})

describe('PF-7 窗口拖拽 rAF 合帧', () => {
    it('coalesces multiple mousemove events into a single IPC per frame', async () => {
        stubBounds()
        const manager = useWindowManagement!({ onReLayout })
        await manager.onTitleBarMouseDown(mouseEvent() as MouseEvent)

        // dragOffset = (400-100, 500-200) = (300, 300)
        fireDocumentListener('mousemove', { screenX: 450, screenY: 560 })
        fireDocumentListener('mousemove', { screenX: 500, screenY: 600 })
        fireDocumentListener('mousemove', { screenX: 550, screenY: 640 })

        // 帧尚未执行：不应有任何 WINDOW.MOVE
        expect(sendCallCount('baize:window:move')).toBe(0)

        runAnimationFrames()

        // 一帧内三次 mousemove → 只发一次 IPC，且是最后一次的坐标
        expect(sendCallCount('baize:window:move')).toBe(1)
        expect(lastSendArgs('baize:window:move')).toEqual([250, 340])
    })

    it('flushes the final position immediately on mouseup even if the frame has not run', async () => {
        stubBounds()
        const manager = useWindowManagement!()
        await manager.onTitleBarMouseDown(mouseEvent() as MouseEvent)

        fireDocumentListener('mousemove', { screenX: 700, screenY: 800 })
        fireDocumentListener('mouseup', {})

        // mouseup 立即提交最终位置（不等下一帧）
        expect(sendCallCount('baize:window:move')).toBe(1)
        expect(lastSendArgs('baize:window:move')).toEqual([400, 500])
        expect(manager.isDragging.value).toBe(false)

        // 已暂停的帧不再额外发送
        runAnimationFrames()
        expect(sendCallCount('baize:window:move')).toBe(1)
    })

    it('cancels the pending frame and drops pending position on cleanup', async () => {
        stubBounds()
        const manager = useWindowManagement!()
        await manager.onTitleBarMouseDown(mouseEvent() as MouseEvent)

        fireDocumentListener('mousemove', { screenX: 600, screenY: 700 })
        manager.cleanupWindowEvents()
        runAnimationFrames()

        expect(sendCallCount('baize:window:move')).toBe(0)
        expect(canceledFrameIds.length).toBeGreaterThan(0)
    })
})

describe('PF-7 窗口缩放 rAF 合帧', () => {
    it('coalesces resize mousemove into one MOVE + SET_SIZE per frame with the latest bounds', async () => {
        stubBounds()
        const manager = useWindowManagement!()
        await manager.onResizeMouseDown('right', mouseEvent() as MouseEvent)

        fireDocumentListener('mousemove', { screenX: 300, screenY: 100 })
        fireDocumentListener('mousemove', { screenX: 400, screenY: 100 })
        fireDocumentListener('mousemove', { screenX: 500, screenY: 100 })

        // 帧未执行前不发 IPC
        expect(sendCallCount('baize:window:set-size')).toBe(0)
        expect(sendCallCount('baize:window:move')).toBe(0)

        runAnimationFrames()

        // 每帧最多一次 MOVE + 一次 SET_SIZE，使用最后一次 mousemove 的尺寸
        // startX=400/startWidth=800；最后一次 mousemove screenX=500 → dx=+100 → width=900
        expect(sendCallCount('baize:window:move')).toBe(1)
        expect(sendCallCount('baize:window:set-size')).toBe(1)
        expect(lastSendArgs('baize:window:set-size')).toEqual([900, 600])
    })

    it('flushes the final bounds on mouseup', async () => {
        stubBounds()
        const manager = useWindowManagement!()
        await manager.onResizeMouseDown('right', mouseEvent() as MouseEvent)

        // dx=-200 → width=600 被 MIN_WIDTH(800) 截断
        fireDocumentListener('mousemove', { screenX: 200, screenY: 100 })
        fireDocumentListener('mouseup', {})

        expect(sendCallCount('baize:window:set-size')).toBe(1)
        expect(lastSendArgs('baize:window:set-size')).toEqual([800, 600])
        expect(manager.isResizing.value).toBe(false)

        runAnimationFrames()
        expect(sendCallCount('baize:window:set-size')).toBe(1)
    })
})
