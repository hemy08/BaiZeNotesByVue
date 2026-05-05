import { ref, Ref, StyleValue } from 'vue'

export interface UseDialogDragOptions {
  initialPosition?: 'center' | 'top' | { x: number; y: number }
}

export function useDialogDrag(options: UseDialogDragOptions = {}) {
  const dialogRef = ref<HTMLElement | null>(null)
  const isDragging = ref(false)
  const dragStart = ref({ x: 0, y: 0 })
  const dialogStart = ref({ x: 0, y: 0 })

  const getInitialStyle = (): StyleValue => {
    if (options.initialPosition === 'center') {
      return {
        position: 'fixed' as const,
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        margin: '0'
      }
    } else if (options.initialPosition === 'top') {
      return {
        position: 'fixed' as const,
        left: '50%',
        top: '10%',
        transform: 'translateX(-50%)',
        margin: '0'
      }
    } else if (options.initialPosition) {
      return {
        position: 'fixed' as const,
        left: `${options.initialPosition.x}px`,
        top: `${options.initialPosition.y}px`,
        transform: 'none',
        margin: '0'
      }
    }
    return {}
  }

  const dialogStyle = ref<StyleValue>(getInitialStyle())

  const resetPosition = () => {
    dialogStyle.value = getInitialStyle()
  }

  const onDialogMouseDown = (e: MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.closest('.title-bar') && !target.closest('.close-btn')) {
      if (e.button !== 0) return

      isDragging.value = true
      dragStart.value = { x: e.clientX, y: e.clientY }

      if (dialogRef.value) {
        const rect = dialogRef.value.getBoundingClientRect()
        dialogStart.value = { x: rect.left, y: rect.top }
      }

      document.addEventListener('mousemove', onDragMove)
      document.addEventListener('mouseup', onDragEnd)
      e.preventDefault()
      e.stopPropagation()
    }
  }

  const onDragMove = (e: MouseEvent) => {
    if (!isDragging.value) return

    const deltaX = e.clientX - dragStart.value.x
    const deltaY = e.clientY - dragStart.value.y

    dialogStyle.value = {
      position: 'fixed' as const,
      left: `${dialogStart.value.x + deltaX}px`,
      top: `${dialogStart.value.y + deltaY}px`,
      transform: 'none',
      margin: '0'
    }
  }

  const onDragEnd = () => {
    isDragging.value = false
    document.removeEventListener('mousemove', onDragMove)
    document.removeEventListener('mouseup', onDragEnd)
  }

  return {
    dialogRef,
    dialogStyle,
    isDragging,
    onDialogMouseDown,
    resetPosition
  }
}
