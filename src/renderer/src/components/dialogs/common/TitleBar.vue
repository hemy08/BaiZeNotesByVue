<template>
  <div
    class="title-bar"
    :style="titleBarStyle"
    @mousedown="onDragStart"
  >
    <span class="title-text">{{ title }}</span>
    <button v-if="showClose" class="close-btn" @click.stop="handleClose">×</button>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface Props {
  title: string
  showClose?: boolean
  draggable?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  showClose: true,
  draggable: true
})

const emit = defineEmits<{
  (e: 'close'): void
}>()

const titleBarStyle = computed(() => ({
  background: 'var(--title-bar-gradient, linear-gradient(135deg, #667eea 0%, #764ba2 100%))',
  cursor: props.draggable ? 'move' : 'default'
}))

const isDragging = ref(false)
const dragStartPos = ref({ x: 0, y: 0 })
const dialogStartPos = ref({ x: 0, y: 0 })

function onDragStart(e: MouseEvent) {
  if (!props.draggable) return

  const target = e.target as HTMLElement
  if (target.closest('.close-btn')) return

  isDragging.value = true
  dragStartPos.value = { x: e.clientX, y: e.clientY }

  const dialogContainer = (e.currentTarget as HTMLElement).closest('.dialog-container')
  if (dialogContainer) {
    const rect = dialogContainer.getBoundingClientRect()
    dialogStartPos.value = { x: rect.left, y: rect.top }
  }

  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
  e.preventDefault()
  e.stopPropagation()
}

function onDragMove(e: MouseEvent) {
  if (!isDragging.value) return

  const deltaX = e.clientX - dragStartPos.value.x
  const deltaY = e.clientY - dragStartPos.value.y

  const dialogContainer = document.querySelector('.dialog-container.dragging') as HTMLElement | null
  if (dialogContainer) {
    const newLeft = dialogStartPos.value.x + deltaX
    const newTop = dialogStartPos.value.y + deltaY

    dialogContainer.style.left = `${newLeft}px`
    dialogContainer.style.top = `${newTop}px`
  }
}

function onDragEnd() {
  isDragging.value = false
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)

  const dialogContainer = document.querySelector('.dialog-container.dragging')
  if (dialogContainer) {
    dialogContainer.classList.remove('dragging')
  }
}

function handleClose() {
  emit('close')
}
</script>

<style scoped>
.title-bar {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 15px;
  user-select: none;
  flex-shrink: 0;
}

.title-text {
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: 0.3px;
}

.close-btn {
  width: 28px;
  height: 28px;
  border: none;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  color: #fff;
  transition: all 0.2s ease;
}

.close-btn:hover {
  background: rgba(255, 100, 100, 0.9);
  transform: scale(1.1);
}

.close-btn:active {
  transform: scale(0.95);
}
</style>
