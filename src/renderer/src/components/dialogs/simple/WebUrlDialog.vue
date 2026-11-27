<template>
    <BaseDialog
        tool-window
        :visible="visible"
        :title="title || t('dialogRenderer.webUrl.defaultTitle')"
        width="520px"
        reset-position-on-open
        @close="handleCancel"
    >
        <div class="content">
            <div class="input-group">
                <label class="input-label">{{ t('dialogRenderer.webUrl.linkText') }}</label>
                <input
                    v-model="linkText"
                    type="text"
                    class="text-input"
                    :placeholder="t('dialogRenderer.webUrl.linkTextPlaceholder')"
                />
            </div>

            <div class="input-group">
                <label class="input-label">{{ t('dialogRenderer.webUrl.linkUrl') }}</label>
                <input
                    v-model="linkUrl"
                    type="text"
                    class="text-input"
                    :placeholder="t('dialogRenderer.webUrl.linkUrlPlaceholder')"
                    @keyup.enter="handleConfirm"
                />
            </div>
        </div>

        <template #footer>
            <button class="dialog-btn dialog-btn--secondary btn btn-cancel" @click="handleCancel">
                {{ t('common.cancel') }}
            </button>
            <button
                class="dialog-btn dialog-btn--primary btn btn-confirm"
                :disabled="!linkUrl.trim()"
                @click="handleConfirm"
            >
                {{ t('dialogRenderer.common.insert') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    visible: boolean
    title?: string
}

const props = withDefaults(defineProps<Props>(), {
    title: ''
})

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'confirm', data: { text: string; url: string }): void
    (e: 'insert', markdown: string): void
}>()

const linkText = ref('')
const linkUrl = ref('')

// 打开对话框时重置表单；拖拽位置重置由 BaseDialog 的 reset-position-on-open 承担
// （等价于迁移前在本监听内调用的 resetPosition()）。
watch(
    () => props.visible,
    (newVal) => {
        if (newVal) {
            linkText.value = ''
            linkUrl.value = ''
        }
    }
)

function handleCancel() {
    emit('close')
}

function handleConfirm() {
    if (linkUrl.value.trim()) {
        const text = linkText.value.trim() || linkUrl.value.trim()
        const markdown = `[${text}](${linkUrl.value.trim()})`
        emit('insert', markdown)
    }
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/footer/过渡动画）已抽到 BaseDialog；
   底栏按钮视觉见全局 assets/dialog-buttons.css（模板类 dialog-btn dialog-btn--*），
   这里只保留正文与输入框样式。 */
.content {
    padding: 20px;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 16px;
}

.input-group:last-of-type {
    margin-bottom: 0;
}

.input-label {
    font-size: 13px;
    color: var(--text-color);
    font-weight: 500;
}

.text-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--card-bg);
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
}

.text-input:focus {
    border-color: var(--accent-color);
}
</style>
