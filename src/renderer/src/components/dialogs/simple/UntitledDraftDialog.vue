<template>
    <!--
        未命名草稿保存确认框。
        用户尚未打开文件就编辑了内容，点击文件树中的文件时由 request-open-file 挂载：
        - 保存并打开：走系统“另存为”对话框，再打开目标文件；
        - 不保存：清空草稿并打开目标文件；
        - 取消 / Esc / 右上角关闭：保持当前编辑，不打开文件。
    -->
    <BaseDialog
        :visible="true"
        :title="t('dialogRenderer.untitledDraft.title')"
        :aria-describedby="messageId"
        width="480px"
        reset-position-on-open
        :close-on-overlay="false"
        container-class="untitled-draft-dialog"
        @close="emit('cancel')"
    >
        <div class="content">
            <p :id="messageId" class="message">
                {{ t('dialogRenderer.untitledDraft.message') }}
            </p>
            <p class="detail">{{ t('dialogRenderer.untitledDraft.detail') }}</p>
        </div>

        <template #footer>
            <button
                ref="saveButton"
                type="button"
                class="dialog-btn dialog-btn--primary btn btn-save"
                @click="emit('save')"
            >
                {{ t('dialogRenderer.untitledDraft.save') }}
            </button>
            <button
                type="button"
                class="dialog-btn dialog-btn--danger btn btn-discard"
                @click="emit('discard')"
            >
                {{ t('dialogRenderer.untitledDraft.discard') }}
            </button>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn btn-cancel"
                @click="emit('cancel')"
            >
                {{ t('dialogRenderer.untitledDraft.cancel') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 未命名草稿保存确认框。
 *
 * 只负责展示与 emit，不执行保存/打开；文件打开协调器在收到选择后处理 IPC。
 * 使用模态 BaseDialog：这是需要用户明确决策的数据安全确认，不应能被外部点击穿透。
 */
import { nextTick, onMounted, ref, useId } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

const emit = defineEmits<{
    (e: 'save'): void
    (e: 'discard'): void
    (e: 'cancel'): void
}>()

const messageId = useId()
const saveButton = ref<HTMLButtonElement | null>(null)

onMounted(async () => {
    await nextTick()
    saveButton.value?.focus()
})
</script>

<style scoped>
.content {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.message {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-color);
}

.detail {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--secondary-text-color);
}
</style>
