import { ref, onUnmounted } from 'vue'

interface UseDialogResizeOptions {
  minWidth?: number
  minHeight?: number
  maxWidth?: number
  maxHeight?: number
  initialWidth?: number
  initialHeight?: number
}

export function useDialogResize(options: UseDialogResizeOptions = {}) {
  const {
    minWidth = 600,
    minHeight = 400,
    maxWidth = window.innerWidth - 100,
    maxHeight = window.innerHeight - 100,
    initialWidth = 900,
    initialHeight = 600
  } = options

  const width = ref(initialWidth)
  const height = ref(initialHeight)
  const isResizing = ref(false)
  const resizeDirection = ref('')

  let startX = 0
  let startY = 0
  let startWidth = 0
  let startHeight = 0

  const onMouseMove = (e: MouseEvent) => {
    if (!isResizing.value) return

    const deltaX = e.clientX - startX
    const deltaY = e.clientY - startY

    let newWidth = startWidth
    let newHeight = startHeight

    // 根据调整方向计算新尺寸
    if (resizeDirection.value.includes('e')) {
      newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + deltaX))
    }
    if (resizeDirection.value.includes('w')) {
      newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth - deltaX))
    }
    if (resizeDirection.value.includes('s')) {
      newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight + deltaY))
    }
    if (resizeDirection.value.includes('n')) {
      newHeight = Math.min(maxHeight, Math.max(minHeight, startHeight - deltaY))
    }

    width.value = newWidth
    height.value = newHeight
  }

  const onMouseUp = () => {
    isResizing.value = false
    resizeDirection.value = ''
    document.body.style.cursor = ''
  }

  const startResize = (direction: string) => (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    isResizing.value = true
    resizeDirection.value = direction
    startX = e.clientX
    startY = e.clientY
    startWidth = width.value
    startHeight = height.value

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }

  const getCursorStyle = (direction: string): string => {
    const cursorMap: Record<string, string> = {
      'n': 'ns-resize',
      's': 'ns-resize',
      'e': 'ew-resize',
      'w': 'ew-resize',
      'ne': 'nesw-resize',
      'nw': 'nwse-resize',
      'se': 'nwse-resize',
      'sw': 'nesw-resize'
    }
    return cursorMap[direction] || 'default'
  }

  onUnmounted(() => {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
  })

  return {
    width,
    height,
    isResizing,
    resizeDirection,
    startResize,
    getCursorStyle
  }
}