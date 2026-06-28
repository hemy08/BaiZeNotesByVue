import { ref } from 'vue'

type ResizeDirection = 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const MIN_WIDTH = 800
const MIN_HEIGHT = 600

export interface UseWindowManagementOptions {
  onReLayout?: () => void
}

export function useWindowManagement(options: UseWindowManagementOptions = {}) {
  const { onReLayout } = options
  const isDragging = ref(false)
  const dragOffset = ref({ x: 0, y: 0 })

  const isResizing = ref(false)
  const resizeInfo = ref<{ direction: ResizeDirection; startX: number; startY: number; startBounds: { x: number; y: number; width: number; height: number } } | null>(null)

  function minimizeWindow() {
    window.electron.ipcRenderer.send('window-minimize')
    onReLayout?.()
  }

  function maximizeWindow() {
    window.electron.ipcRenderer.send('window-maximize')
    onReLayout?.()
  }

  function closeWindow() {
    window.electron.ipcRenderer.send('window-close')
  }

  async function onTitleBarMouseDown(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.window-controls')) return
    if (e.button !== 0) return

    isDragging.value = true
    window.electron.ipcRenderer.send('window-start-drag')

    const bounds = await window.electron.ipcRenderer.invoke('window-get-bounds')
    if (bounds) {
      const isMaximized = await window.electron.ipcRenderer.invoke('window-is-maximized')
      if (isMaximized) {
        dragOffset.value = {
          x: bounds.width * (e.screenX - bounds.x) / window.innerWidth,
          y: e.clientY
        }
        const newX = e.screenX - dragOffset.value.x
        const newY = e.screenY - dragOffset.value.y
        window.electron.ipcRenderer.send('window-move', newX, newY)
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
    window.electron.ipcRenderer.send('window-move', newX, newY)
  }

  function onDragMouseUp() {
    isDragging.value = false
    document.removeEventListener('mousemove', onDragMouseMove)
    document.removeEventListener('mouseup', onDragMouseUp)
  }

  function onTitleBarDblClick(e: MouseEvent) {
    if ((e.target as HTMLElement).closest('.window-controls')) return
    window.electron.ipcRenderer.send('window-toggle-maximize')
    onReLayout?.()
  }

  async function onResizeMouseDown(direction: ResizeDirection, e: MouseEvent) {
    if (e.button !== 0) return
    const isMaximized = await window.electron.ipcRenderer.invoke('window-is-maximized')
    if (isMaximized) return

    isResizing.value = true
    const bounds = await window.electron.ipcRenderer.invoke('window-get-bounds')
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

    window.electron.ipcRenderer.send('window-move', x, y)
    window.electron.ipcRenderer.send('window-set-size', width, height)
  }

  function onResizeMouseUp() {
    isResizing.value = false
    resizeInfo.value = null
    document.removeEventListener('mousemove', onResizeMouseMove)
    document.removeEventListener('mouseup', onResizeMouseUp)
    onReLayout?.()
  }

  function cleanupWindowEvents() {
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
