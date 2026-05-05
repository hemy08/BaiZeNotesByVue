<template>
  <button 
    :class="['dialog-btn', `btn-${type}`]"
    :disabled="disabled"
    @click="handleClick"
  >
    <slot></slot>
  </button>
</template>

<script setup lang="ts">
interface Props {
  type?: 'primary' | 'default' | 'success' | 'danger'
  disabled?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  type: 'default',
  disabled: false
})

const emit = defineEmits<{
  (e: 'click'): void
}>()

function handleClick() {
  if (!props.disabled) {
    emit('click')
  }
}
</script>

<style scoped>
.dialog-btn {
  padding: 8px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s ease;
  user-select: none;
}

.dialog-btn:hover:not(:disabled) {
  opacity: 0.9;
  transform: translateY(-1px);
}

.dialog-btn:active:not(:disabled) {
  transform: translateY(0);
}

.dialog-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: var(--accent-color, #667eea);
  color: #fff;
}

.btn-default {
  background: var(--button-bg, #e8e8e8);
  color: var(--text-color, #333);
}

.btn-success {
  background: #52c41a;
  color: #fff;
}

.btn-danger {
  background: #ff4d4f;
  color: #fff;
}
</style>
