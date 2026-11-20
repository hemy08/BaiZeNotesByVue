<template>
    <!--
        结构优化第 2 批 2.1（H3）：删除文件/文件夹确认对话框。
        迁移自主进程 electron dialog.showMessageBox（ShowConfirmDeleteDialog），
        改为渲染层 Vue + BaseDialog 后与其余对话框主题/交互一致；
        动作仍由主进程执行（渲染层确认后 invoke IPC.DIALOG.DELETE_FILE_FOLDER_CONFIRM）。
        文案复用共享词典 dialogMain.confirmDelete.* / mainMsg.dialog.*。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogMain.confirmDelete.title')"
        :aria-describedby="messageId"
        width="460px"
        reset-position-on-open
        @close="handleCancel"
    >
        <div class="content">
            <div :id="messageId" class="message">
                {{ t('dialogMain.confirmDelete.message', { path: path }) }}
            </div>
        </div>

        <template #footer>
            <button class="btn btn-cancel" @click="handleCancel">
                {{ t('dialogMain.confirmDelete.no') }}
            </button>
            <button class="btn btn-danger" @click="handleConfirm">
                {{ t('dialogMain.confirmDelete.yes') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 删除文件/文件夹确认对话框（结构优化第 2 批 2.1：electron 原生消息框 → Vue + BaseDialog）。
 *
 * 受控组件：显隐与 path/isFile 来自 useConfigStore.dialogs.confirmDelete
 * （由主进程 OPEN_VUE_DIALOG('confirmDelete', { path, isFile }) 填充）；
 * 点击「是」emit('confirm')，由 BaiZeNotes.vue invoke 主进程执行删除。
 */
import { useId } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    visible: boolean
    /** 待删除的文件/文件夹绝对路径 */
    path?: string
    /** 是否为文件（父组件提交动作时原样回传） */
    isFile?: boolean
}

withDefaults(defineProps<Props>(), {
    path: '',
    isFile: false
})

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'confirm'): void
}>()

/**
 * 删除确认文案节点 id：经 BaseDialog 的 aria-describedby 关联到对话框容器，
 * 读屏播报标题后补充说明「将删除哪个路径」。useId() 保证实例级唯一，不手写固定 id。
 */
const messageId = useId()

function handleCancel(): void {
    emit('close')
}

function handleConfirm(): void {
    emit('confirm')
}
</script>

<style scoped>
.content {
    padding: 20px;
}

.message {
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-color);
    word-break: break-all;
}

.btn {
    min-width: 78px;
    height: 30px;
    padding: 0 16px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    background: var(--card-bg);
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}

.btn:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
}

/* 删除为破坏性操作：确认按钮用危险色（与迁移前原生消息框的语义一致） */
.btn-danger {
    border: none;
    background: #e74c3c;
    color: #fff;
}

.btn-danger:hover {
    opacity: 0.9;
    color: #fff;
}
</style>
