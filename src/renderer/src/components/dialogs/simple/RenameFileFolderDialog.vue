<template>
    <!--
        结构优化第 2 批 2.1（H3）：重命名文件/文件夹对话框。
        迁移自主进程 JSDOM ShowRenameDialog（无边框 BrowserWindow + data:URL HTML）：
        - 交互：展示原路径、输入新名称、空名称校验、取消/确定按钮、回车提交、打开时输入框聚焦；
        - 样式：沿用 BaseDialog 外壳（32px 标题栏 / 8px 圆角 / 主题 CSS 变量），
          正文与按钮尺寸对齐迁移前 JSDOM 版本，主题/i18n 保持一致；
        - 动作：确认后 emit('confirm', newName)，由父组件经
          IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT 提交主进程执行（失败由主进程提示并保留本对话框）。
        文案复用共享词典 dialogMain.* / dialogRenderer.*（中英双语已存在，不新增词条）。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogMain.rename.title')"
        width="500px"
        reset-position-on-open
        @close="handleCancel"
    >
        <div class="content">
            <div class="old-path" :title="path">{{ path }}</div>

            <div class="input-group">
                <label class="input-label" for="rename-file-folder-input">
                    {{ t('dialogMain.rename.newNameLabel') }}
                </label>
                <input
                    id="rename-file-folder-input"
                    ref="inputRef"
                    v-model="newName"
                    type="text"
                    class="name-input"
                    :placeholder="t('dialogMain.rename.newNamePlaceholder')"
                    @keyup.enter="handleConfirm"
                    @input="errorVisible = false"
                />
            </div>

            <div class="error-tip" :class="{ visible: errorVisible }">
                {{ t('dialogMain.rename.nameRequired') }}
            </div>
        </div>

        <template #footer>
            <button class="dialog-btn dialog-btn--secondary btn btn-cancel" @click="handleCancel">
                {{ t('mainMsg.dialog.cancel') }}
            </button>
            <button class="dialog-btn dialog-btn--primary btn btn-confirm" @click="handleConfirm">
                {{ t('mainMsg.dialog.confirm') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 重命名文件/文件夹对话框（结构优化第 2 批 2.1：JSDOM → Vue + BaseDialog）。
 *
 * 受控组件：显隐与 path/isFile 均来自 useConfigStore.dialogs.renameFileFolder
 * （由主进程 OPEN_VUE_DIALOG('renameFileFolder', { path, isFile }) 填充），
 * 本组件不自行发起主进程动作，仅在校验通过后 emit('confirm', newName)，
 * 由 BaiZeNotes.vue 统一 invoke IPC.DIALOG.RENAME_FILE_FOLDER_SUBMIT。
 */
import { nextTick, ref, watch } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    visible: boolean
    /** 待重命名的文件/文件夹绝对路径（用于展示与提交校验） */
    path?: string
    /** 是否为文件（父组件提交动作时原样回传，主进程据此保留扩展名/重命名后打开） */
    isFile?: boolean
}

const props = withDefaults(defineProps<Props>(), {
    path: '',
    isFile: false
})

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'confirm', newName: string): void
}>()

const newName = ref('')
const errorVisible = ref(false)
const inputRef = ref<HTMLInputElement | null>(null)

// 打开时重置表单并聚焦输入框（与迁移前 JSDOM 对话框 inputElement.focus() 一致）；
// 拖拽位置重置由 BaseDialog 的 reset-position-on-open 承担。
watch(
    () => props.visible,
    async (visible) => {
        if (!visible) {
            return
        }
        newName.value = ''
        errorVisible.value = false
        await nextTick()
        inputRef.value?.focus()
    },
    // 2026-11-20：首次挂载时 visible 直接为 true，immediate 保证输入框聚焦
    { immediate: true }
)

function handleCancel(): void {
    emit('close')
}

function handleConfirm(): void {
    const value = newName.value.trim()
    if (value.length === 0) {
        errorVisible.value = true
        inputRef.value?.focus()
        return
    }
    errorVisible.value = false
    emit('confirm', value)
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/footer/过渡动画）由 BaseDialog 承担；
   底栏按钮视觉见全局 assets/dialog-buttons.css（模板类 dialog-btn dialog-btn--*），
   这里仅保留正文与输入区样式，尺寸/配色对齐迁移前 JSDOM ShowRenameDialog。 */
.content {
    padding: 15px 20px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.old-path {
    font-size: 12px;
    color: var(--secondary-text-color);
    padding: 8px 12px;
    background: var(--card-bg);
    border-radius: 4px;
    border: 1px solid var(--border-color);
    word-break: break-all;
}

.input-group {
    display: flex;
    align-items: center;
    gap: 10px;
}

.input-label {
    color: var(--text-color);
    font-size: 13px;
    min-width: 70px;
}

.name-input {
    flex: 1;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    font-size: 13px;
    background: var(--card-bg);
    color: var(--text-color);
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
}

.name-input:focus {
    border-color: var(--accent-color);
}

/* FE-09：空名称校验提示（与迁移前 .error-tip / .visible 形态一致） */
.error-tip {
    display: none;
    font-size: 11px;
    color: #ff4757;
    margin-left: 80px;
}

.error-tip.visible {
    display: block;
}
</style>
