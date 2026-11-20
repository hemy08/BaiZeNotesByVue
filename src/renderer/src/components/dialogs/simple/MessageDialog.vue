<template>
    <BaseDialog
        :visible="visible"
        :title="title"
        title-bar-variant="plain"
        animation="smooth"
        footer-align="center"
        :container-class="`${type}-dialog`"
        :overlay-style="overlayStyle"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        @close="handleClose"
    >
        <div class="container">
            <!-- Success 图标 -->
            <svg v-if="type === 'success'" class="message-icon" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" :stroke="iconColor" stroke-width="3" />
                <path
                    d="M 30 50 L 45 65 L 70 35"
                    fill="none"
                    :stroke="iconColor"
                    stroke-width="4"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                />
            </svg>

            <!-- Error 图标 -->
            <svg v-else-if="type === 'error'" class="message-icon" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" :stroke="iconColor" stroke-width="3" />
                <path
                    d="M 35 35 L 65 65 M 65 35 L 35 65"
                    fill="none"
                    :stroke="iconColor"
                    stroke-width="4"
                    stroke-linecap="round"
                />
            </svg>

            <!-- Warning 图标 -->
            <svg v-else-if="type === 'warning'" class="message-icon" viewBox="0 0 100 100">
                <path
                    d="M 50 10 L 90 85 L 10 85 Z"
                    fill="none"
                    :stroke="iconColor"
                    stroke-width="3"
                />
                <line
                    x1="50"
                    y1="35"
                    x2="50"
                    y2="55"
                    :stroke="iconColor"
                    stroke-width="4"
                    stroke-linecap="round"
                />
                <circle cx="50" cy="68" r="3" :fill="iconColor" />
            </svg>

            <!-- Info 图标 -->
            <svg v-else-if="type === 'info'" class="message-icon" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" :stroke="iconColor" stroke-width="3" />
                <line
                    x1="50"
                    y1="35"
                    x2="50"
                    y2="55"
                    :stroke="iconColor"
                    stroke-width="4"
                    stroke-linecap="round"
                />
                <circle cx="50" cy="68" r="3" :fill="iconColor" />
            </svg>

            <!-- Failed 图标 -->
            <svg v-else-if="type === 'failed'" class="message-icon" viewBox="0 0 100 100">
                <circle cx="50" cy="50" r="45" fill="none" :stroke="iconColor" stroke-width="3" />
                <circle cx="50" cy="50" r="20" fill="none" :stroke="iconColor" stroke-width="3" />
                <line
                    x1="35"
                    y1="35"
                    x2="65"
                    y2="65"
                    :stroke="iconColor"
                    stroke-width="3"
                    stroke-linecap="round"
                />
            </svg>

            <div class="message-text">{{ message }}</div>
        </div>

        <template #footer>
            <!-- P2 功能错误处理修复：可重试错误（如编码转换/按编码重开失败）由宿主经本插槽
                 注入「重试」按钮；普通消息框不传插槽，外观与行为保持不变。 -->
            <slot name="footer-extra" />
            <button class="btn-confirm" :style="buttonStyle" @click="handleClose">
                {{ t('common.ok') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

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
// 标题栏背景按消息类型动态渐变：迁移前写在本组件模板 `:style` 上，抽层后仍以覆盖档传入，
// 其余标题栏形态（无固定高度、12px 16px 内边距）由 BaseDialog 的 plain 变体承载。
const titleBarStyle = computed<CSSProperties>(() => ({
    background: colorConfig[props.type].gradient
}))
const buttonStyle = computed(() => ({
    background: colorConfig[props.type].color
}))

// MessageDialog 迁移前的专属外壳覆盖（BaseDialog 默认壳不同，必须显式传回保持视觉一致）：
// 1) 遮罩更暗：rgba(0,0,0,0.5)；2) 容器用卡片背景 + 更柔阴影；3) 宽度自适应 400~500px。
const overlayStyle: CSSProperties = { background: 'rgba(0, 0, 0, 0.5)' }
const containerStyle: CSSProperties = {
    width: 'auto',
    minWidth: '400px',
    maxWidth: '500px',
    background: 'var(--card-bg)',
    boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)'
}

function handleClose() {
    emit('close')
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/footer/过渡动画）已抽到 BaseDialog；
   这里只保留 MessageDialog 正文与按钮样式。 */
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
    from {
        transform: scale(0);
        opacity: 0;
    }
    to {
        transform: scale(1);
        opacity: 1;
    }
}

.message-text {
    font-size: 14px;
    color: var(--text-color);
    text-align: center;
    line-height: 1.6;
    max-width: 380px;
    word-wrap: break-word;
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
</style>
