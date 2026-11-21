<template>
    <BaseDialog
        :visible="visible"
        :title="title || t('dialogRenderer.createFileFolder.defaultTitle')"
        width="500px"
        reset-position-on-open
        @close="handleCancel"
    >
        <div class="content">
            <div class="input-group">
                <label class="input-label">{{
                    t('dialogRenderer.createFileFolder.dirLabel')
                }}</label>
                <div class="path-input-wrapper">
                    <input v-model="dirPathInput" type="text" class="path-input" readonly />
                    <button class="btn-select-path" @click="handleSelectPath">
                        {{ t('dialogRenderer.common.select') }}
                    </button>
                </div>
            </div>

            <div class="input-group">
                <label class="input-label">{{
                    t('dialogRenderer.createFileFolder.nameLabel')
                }}</label>
                <input
                    v-model="name"
                    type="text"
                    class="name-input"
                    :placeholder="t('dialogRenderer.createFileFolder.namePlaceholder')"
                    autofocus
                    @keyup.enter="handleCreateFile"
                />
            </div>
        </div>

        <template #footer>
            <button class="dialog-btn dialog-btn--secondary btn btn-cancel" @click="handleCancel">
                {{ t('common.cancel') }}
            </button>
            <button
                class="dialog-btn dialog-btn--primary btn btn-create-file"
                :disabled="!name.trim()"
                @click="handleCreateFile"
            >
                {{ t('dialogRenderer.createFileFolder.createFile') }}
            </button>
            <button
                class="dialog-btn dialog-btn--primary btn btn-create-folder"
                :disabled="!name.trim()"
                @click="handleCreateFolder"
            >
                {{ t('dialogRenderer.createFileFolder.createFolder') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import { IPC } from '../../../../../shared/ipc-channels'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    visible: boolean
    title?: string
    dirPath?: string
}

const props = withDefaults(defineProps<Props>(), {
    title: '',
    dirPath: ''
})

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'create', data: { type: 'file' | 'folder'; name: string; dirPath: string }): void
}>()

const name = ref('')
// 与 props.dirPath 区分命名，避免 script setup 顶层与 props 声明冲突（vue/no-dupe-keys）
const dirPathInput = ref('')

// 打开对话框时重置表单；拖拽位置重置由 BaseDialog 的 reset-position-on-open 承担
// （等价于迁移前在本监听内调用的 resetPosition()）。
watch(
    () => props.visible,
    (newVal) => {
        if (newVal) {
            name.value = ''
            dirPathInput.value = props.dirPath || ''
        }
    },
    // 2026-11-20：首次挂载时 visible 直接为 true，immediate 保证默认路径回填
    { immediate: true }
)

function handleCancel() {
    emit('close')
}

async function handleSelectPath() {
    try {
        const selectedPath = await window.electron.ipcRenderer.invoke(IPC.FILE.SELECT_DIRECTORY)
        if (selectedPath) {
            dirPathInput.value = selectedPath
        }
    } catch (error) {
        logger.error('选择目录失败:', error)
    }
}

function handleCreateFile() {
    if (name.value.trim()) {
        emit('create', {
            type: 'file',
            name: name.value.trim(),
            dirPath: dirPathInput.value
        })
    }
}

function handleCreateFolder() {
    if (name.value.trim()) {
        emit('create', {
            type: 'folder',
            name: name.value.trim(),
            dirPath: dirPathInput.value
        })
    }
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/footer/过渡动画）已抽到 BaseDialog；
   底栏按钮视觉见全局 assets/dialog-buttons.css（模板类 dialog-btn dialog-btn--*），
   这里只保留正文、输入框与「选择路径」输入区按钮样式。 */
.content {
    padding: 20px;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.input-label {
    font-size: 13px;
    color: var(--text-color);
    font-weight: 500;
}

.path-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--secondary-text-color);
    background: var(--card-bg);
    outline: none;
    box-sizing: border-box;
    cursor: not-allowed;
}

.path-input-wrapper {
    display: flex;
    gap: 8px;
}

.path-input-wrapper .path-input {
    flex: 1;
}

.btn-select-path {
    padding: 8px 16px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    background: var(--button-bg);
    color: var(--text-color);
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
}

.btn-select-path:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
}

.name-input {
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

.name-input:focus {
    border-color: var(--accent-color);
}
</style>
