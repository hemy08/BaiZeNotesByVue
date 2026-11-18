import { ref } from 'vue'
import { IPC } from '../../../shared/ipc-channels'

type ResizeDirection =
    'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const MIN_WIDTH = 800
const MIN_HEIGHT = 600

// ==================== PF-7：mousemove → IPC 的 requestAnimationFrame 合帧 ====================
// 背景（out/full-scan/perf.md PF-7）：拖拽/缩放此前每个 mousemove 都直接 send IPC
// （1000 Hz 鼠标下拖拽 1,000 次/s、缩放 2,000 次/s，主进程同步 setBounds 同频），
// 分栏拖拽同样每帧多次 layout。本轮改为「每帧最多一次 IPC」，并保证最终位置必发：
// - 拖拽：mousemove 只记录最新位置，rAF 帧内提交一次 WINDOW.MOVE；
// - 缩放：mousemove 只记录最新 bounds，rAF 帧内提交一次 MOVE + SET_SIZE；
// - mouseup：立即 flush 未提交的最终位置（不丢最后一帧），再清理监听与 rAF；
// - 无 requestAnimationFrame 环境（node 单测/极旧运行时）退化为立即发送，行为与优化前一致。
// 注意：用函数在调用时判断而非模块加载期常量——避免测试环境在模块加载后注入 rAF 仍走旧分支。
function hasAnimationFrame(): boolean {
    return typeof requestAnimationFrame === 'function' && typeof cancelAnimationFrame === 'function'
}

export interface UseWindowManagementOptions {
    onReLayout?: () => void
}

export function useWindowManagement(options: UseWindowManagementOptions = {}) {
    const { onReLayout } = options
    const isDragging = ref(false)
    const dragOffset = ref({ x: 0, y: 0 })

    const isResizing = ref(false)
    const resizeInfo = ref<{
        direction: ResizeDirection
        startX: number
        startY: number
        startBounds: { x: number; y: number; width: number; height: number }
    } | null>(null)

    // PF-7：每个 composable 实例各自持有待提交帧状态（避免多实例互相覆盖 pending 坐标）
    /** 待提交的窗口位置（拖拽） */
    let pendingDragPosition: { x: number; y: number } | null = null
    let dragMoveFrameId: number | null = null

    /** 待提交的窗口 bounds（缩放） */
    let pendingResizeBounds: { x: number; y: number; width: number; height: number } | null = null
    let resizeFrameId: number | null = null

    /** 提交拖拽位置（每帧最多一次） */
    function flushDragPosition(): void {
        if (dragMoveFrameId !== null) {
            cancelAnimationFrame(dragMoveFrameId)
            dragMoveFrameId = null
        }
        const position = pendingDragPosition
        pendingDragPosition = null
        if (position) {
            window.electron.ipcRenderer.send(IPC.WINDOW.MOVE, position.x, position.y)
        }
    }

    /** 排队一帧拖拽位置提交（同帧多次 mousemove 只保留最后一次坐标） */
    function scheduleDragPosition(x: number, y: number): void {
        pendingDragPosition = { x, y }
        if (!hasAnimationFrame()) {
            flushDragPosition()
            return
        }
        if (dragMoveFrameId !== null) {
            return
        }
        dragMoveFrameId = requestAnimationFrame(() => {
            dragMoveFrameId = null
            flushDragPosition()
        })
    }

    /** 提交缩放 bounds（每帧最多一次 MOVE + SET_SIZE） */
    function flushResizeBounds(): void {
        if (resizeFrameId !== null) {
            cancelAnimationFrame(resizeFrameId)
            resizeFrameId = null
        }
        const bounds = pendingResizeBounds
        pendingResizeBounds = null
        if (bounds) {
            window.electron.ipcRenderer.send(IPC.WINDOW.MOVE, bounds.x, bounds.y)
            window.electron.ipcRenderer.send(IPC.WINDOW.SET_SIZE, bounds.width, bounds.height)
        }
    }

    /** 排队一帧缩放 bounds 提交 */
    function scheduleResizeBounds(bounds: {
        x: number
        y: number
        width: number
        height: number
    }): void {
        pendingResizeBounds = bounds
        if (!hasAnimationFrame()) {
            flushResizeBounds()
            return
        }
        if (resizeFrameId !== null) {
            return
        }
        resizeFrameId = requestAnimationFrame(() => {
            resizeFrameId = null
            flushResizeBounds()
        })
    }

    /** 取消所有待提交帧（清理/卸载时调用，丢弃未提交位置） */
    function cancelPendingFrames(): void {
        if (dragMoveFrameId !== null) {
            cancelAnimationFrame(dragMoveFrameId)
            dragMoveFrameId = null
        }
        if (resizeFrameId !== null) {
            cancelAnimationFrame(resizeFrameId)
            resizeFrameId = null
        }
        pendingDragPosition = null
        pendingResizeBounds = null
    }

    function minimizeWindow() {
        window.electron.ipcRenderer.send(IPC.WINDOW.MINIMIZE)
        onReLayout?.()
    }

    function maximizeWindow() {
        window.electron.ipcRenderer.send(IPC.WINDOW.MAXIMIZE)
        onReLayout?.()
    }

    function closeWindow() {
        window.electron.ipcRenderer.send(IPC.WINDOW.CLOSE)
    }

    async function onTitleBarMouseDown(e: MouseEvent) {
        if ((e.target as HTMLElement).closest('.window-controls')) return
        if (e.button !== 0) return

        isDragging.value = true
        // 2026-11-18：删除 START_DRAG 空转发送（主进程空 handler，已随死通道清理移除）

        const bounds = await window.electron.ipcRenderer.invoke(IPC.WINDOW.GET_BOUNDS)
        if (bounds) {
            const isMaximized = await window.electron.ipcRenderer.invoke(IPC.WINDOW.IS_MAXIMIZED)
            if (isMaximized) {
                dragOffset.value = {
                    x: (bounds.width * (e.screenX - bounds.x)) / window.innerWidth,
                    y: e.clientY
                }
                const newX = e.screenX - dragOffset.value.x
                const newY = e.screenY - dragOffset.value.y
                window.electron.ipcRenderer.send(IPC.WINDOW.MOVE, newX, newY)
            } else {
                dragOffset.value = {
                    x: e.screenX - bounds.x,
                    y: e.screenY - bounds.y
                }
            }
        }

        document.addEventListener('mousemove', onDragMouseMove)
        document.addEventListener('mouseup', onDragMouseUp)
        e.preventDefault()
        onReLayout?.()
    }

    function onDragMouseMove(e: MouseEvent) {
        if (!isDragging.value) return
        const newX = e.screenX - dragOffset.value.x
        const newY = e.screenY - dragOffset.value.y
        // PF-7：只记录最新坐标，rAF 帧内最多发一次 IPC
        scheduleDragPosition(newX, newY)
    }

    function onDragMouseUp() {
        // PF-7：鼠标抬起时立即提交最终位置（未到下一帧的坐标不能丢）
        flushDragPosition()
        isDragging.value = false
        document.removeEventListener('mousemove', onDragMouseMove)
        document.removeEventListener('mouseup', onDragMouseUp)
    }

    function onTitleBarDblClick(e: MouseEvent) {
        if ((e.target as HTMLElement).closest('.window-controls')) return
        window.electron.ipcRenderer.send(IPC.WINDOW.TOGGLE_MAXIMIZE)
        onReLayout?.()
    }

    async function onResizeMouseDown(direction: ResizeDirection, e: MouseEvent) {
        if (e.button !== 0) return
        const isMaximized = await window.electron.ipcRenderer.invoke(IPC.WINDOW.IS_MAXIMIZED)
        if (isMaximized) return

        isResizing.value = true
        const bounds = await window.electron.ipcRenderer.invoke(IPC.WINDOW.GET_BOUNDS)
        if (!bounds) return

        resizeInfo.value = {
            direction,
            startX: e.screenX,
            startY: e.screenY,
            startBounds: { ...bounds }
        }

        document.addEventListener('mousemove', onResizeMouseMove)
        document.addEventListener('mouseup', onResizeMouseUp)
        e.preventDefault()
    }

    function onResizeMouseMove(e: MouseEvent) {
        if (!isResizing.value || !resizeInfo.value) return
        const { direction, startX, startY, startBounds } = resizeInfo.value
        const dx = e.screenX - startX
        const dy = e.screenY - startY

        let { x, y, width, height } = startBounds

        if (direction.includes('right')) {
            width = Math.max(MIN_WIDTH, startBounds.width + dx)
        }
        if (direction.includes('left')) {
            const newWidth = Math.max(MIN_WIDTH, startBounds.width - dx)
            x = startBounds.x + (startBounds.width - newWidth)
            width = newWidth
        }
        if (direction.includes('bottom')) {
            height = Math.max(MIN_HEIGHT, startBounds.height + dy)
        }
        if (direction.includes('top')) {
            const newHeight = Math.max(MIN_HEIGHT, startBounds.height - dy)
            y = startBounds.y + (startBounds.height - newHeight)
            height = newHeight
        }

        // PF-7：只记录最新 bounds，rAF 帧内最多发一次 MOVE + SET_SIZE
        scheduleResizeBounds({ x, y, width, height })
    }

    function onResizeMouseUp() {
        // PF-7：结束时立即提交最终 bounds
        flushResizeBounds()
        isResizing.value = false
        resizeInfo.value = null
        document.removeEventListener('mousemove', onResizeMouseMove)
        document.removeEventListener('mouseup', onResizeMouseUp)
        onReLayout?.()
    }

    function cleanupWindowEvents() {
        // PF-7：卸载/清理时丢弃未提交的拖拽/缩放帧并取消 rAF
        cancelPendingFrames()
        document.removeEventListener('mousemove', onDragMouseMove)
        document.removeEventListener('mouseup', onDragMouseUp)
        document.removeEventListener('mousemove', onResizeMouseMove)
        document.removeEventListener('mouseup', onResizeMouseUp)
    }

    return {
        isDragging,
        isResizing,
        minimizeWindow,
        maximizeWindow,
        closeWindow,
        onTitleBarMouseDown,
        onTitleBarDblClick,
        onResizeMouseDown,
        cleanupWindowEvents
    }
}
