<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
        <Transition name="dialog-scale">
          <div
            class="dialog-container"
            :class="`${type}-dialog`"
            :style="dialogStyle"
            ref="dialogRef"
            @mousedown="onDialogMouseDown"
          >
            <div class="title-bar" :style="titleBarStyle">
              <span class="title-text">{{ title }}</span>
              <button class="close-btn" @click.stop="handleClose">×</button>
            </div>

            <div class="container">
              <!-- Success 图标 -->
              <svg v-if="type === 'success'" class="message-icon" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" :stroke="iconColor" stroke-width="3"/>
                <path d="M 30 50 L 45 65 L 70 35" fill="none" :stroke="iconColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              
              <!-- Error 图标 -->
              <svg v-else-if="type === 'error'" class="message-icon" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" :stroke="iconColor" stroke-width="3"/>
                <path d="M 35 35 L 65 65 M 65 35 L 35 65" fill="none" :stroke="iconColor" stroke-width="4" stroke-linecap="round"/>
              </svg>
              
              <!-- Warning 图标 -->
              <svg v-else-if="type === 'warning'" class="message-icon" viewBox="0 0 100 100">
                <path d="M 50 10 L 90 85 L 10 85 Z" fill="none" :stroke="iconColor" stroke-width="3"/>
                <line x1="50" y1="35" x2="50" y2="55" :stroke="iconColor" stroke-width="4" stroke-linecap="round"/>
                <circle cx="50" cy="68" r="3" :fill="iconColor"/>
              </svg>
              
              <!-- Info 图标 -->
              <svg v-else-if="type === 'info'" class="message-icon" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" :stroke="iconColor" stroke-width="3"/>
                <line x1="50" y1="35" x2="50" y2="55" :stroke="iconColor" stroke-width="4" stroke-linecap="round"/>
                <circle cx="50" cy="68" r="3" :fill="iconColor"/>
              </svg>
              
              <!-- Failed 图标 -->
              <svg v-else-if="type === 'failed'" class="message-icon" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" :stroke="iconColor" stroke-width="3"/>
                <circle cx="50" cy="50" r="20" fill="none" :stroke="iconColor" stroke-width="3"/>
                <line x1="35" y1="35" x2="65" y2="65" :stroke="iconColor" stroke-width="3" stroke-linecap="round"/>
              </svg>
              
              <div class="message-text">{{ message }}</div>
            </div>

            <div class="footer">
              <button class="btn-confirm" :style="buttonStyle" @click="handleClose">确定</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'

type MessageType = 'success' | 'error' | 'warning' | 'info' | 'failed'

interface Props {
  visible: boolean
  type: MessageType
  title: string
  message: string
}

const props = defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
}>()

const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

// 颜色配置
const colorConfig = {
  success: { color: '#2ed573', gradient: 'linear-gradient(135deg, #2ed573 0%, #7bed9f 100%)' },
  error: { color: '#ff4757', gradient: 'linear-gradient(135deg, #ff4757 0%, #ff6b81 100%)' },
  warning: { color: '#ffa502', gradient: 'linear-gradient(135deg, #ffa502 0%, #ffbe76 100%)' },
  info: { color: '#3742fa', gradient: 'linear-gradient(135deg, #3742fa 0%, #5352ed 100%)' },
  failed: { color: '#e84393', gradient: 'linear-gradient(135deg, #e84393 0%, #fd79a8 100%)' }
}

// 计算属性
const iconColor = computed(() => colorConfig[props.type].color)
const titleBarStyle = computed(() => ({
  background: colorConfig[props.type].gradient
}))
const buttonStyle = computed(() => ({
  background: colorConfig[props.type].color
}))

function handleClose() {
  emit('close')
}
</script>

<style scoped>
.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.dialog-container {
  background: var(--card-bg);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  min-width: 400px;
  max-width: 500px;
  overflow: hidden;
}

.title-bar {
  padding: 12px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: move;
  user-select: none;
}

.title-text {
  font-size: 14px;
  font-weight: 500;
  color: #fff;
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
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 100, 100, 0.9);
}

.container {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px 20px;
}

.message-icon {
  width: 60px;
  height: 60px;
  margin-bottom: 15px;
  animation: scaleIn 0.3s ease-out;
}

@keyframes scaleIn {
  from { transform: scale(0); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.message-text {
  font-size: 14px;
  color: var(--text-color);
  text-align: center;
  line-height: 1.6;
  max-width: 380px;
  word-wrap: break-word;
}

.footer {
  padding: 15px 20px;
  display: flex;
  justify-content: center;
  border-top: 1px solid var(--border-color);
  background: var(--card-bg);
}

.btn-confirm {
  padding: 8px 30px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 13px;
  font-weight: 500;
  transition: all 0.2s;
  color: #fff;
}

.btn-confirm:hover {
  opacity: 0.9;
}

/* 动画 */
.dialog-fade-enter-active,
.dialog-fade-leave-active {
  transition: opacity 0.3s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
  opacity: 0;
}

.dialog-scale-enter-active,
.dialog-scale-leave-active {
  transition: all 0.3s ease;
}

.dialog-scale-enter-from,
.dialog-scale-leave-to {
  transform: scale(0.9);
  opacity: 0;
}
</style>
