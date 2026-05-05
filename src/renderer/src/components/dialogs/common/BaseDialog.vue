<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleOverlayClick">
        <Transition name="dialog-scale">
          <div class="dialog-container" :style="containerStyle">
            <TitleBar
              :title="title"
              @close="handleClose"
            />

            <div class="dialog-content">
              <slot></slot>
            </div>

            <div v-if="$slots.footer" class="dialog-footer">
              <slot name="footer"></slot>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TitleBar from './TitleBar.vue'

interface Props {
  visible: boolean
  title: string
  width?: string
  height?: string
  closeOnOverlayClick?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  title: '对话框',
  width: '500px',
  height: 'auto',
  closeOnOverlayClick: true
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm'): void
}>()

const containerStyle = computed(() => ({
  width: props.width,
  height: props.height,
  maxHeight: '90vh'
}))

function handleClose() {
  emit('close')
}

function handleOverlayClick() {
  if (props.closeOnOverlayClick) {
    emit('close')
  }
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-scale-enter-active,
.dialog-scale-leave-active {
  transition: transform 0.2s ease;
}

.dialog-scale-enter-from,
.dialog-scale-leave-to {
  transform: scale(0.9);
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background: rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.dialog-container {
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-content {
  flex: 1;
  padding: 20px;
  overflow-y: auto;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color, #e0e0e0);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: var(--card-bg, #f8f8f8);
}
</style>
