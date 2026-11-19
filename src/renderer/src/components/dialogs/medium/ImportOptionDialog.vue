<template>
    <!--
        C-2 迁移：默认变体零覆盖。
        迁移前外壳声明（.dialog-overlay / .dialog-container / .title-bar / .title-text /
        .close-btn / .footer / 过渡动画）与 BaseDialog 默认壳逐属性一致：
        遮罩 rgba(0,0,0,0.4)+z-index 9999、容器 500px/var(--bg-color)/8px 圆角/
        0 10px 40px rgba(0,0,0,0.25)、标题栏 32px+0 15px+13px 标题、关闭按钮 28px 圆形
        rgba(255,255,255,0.2)、底栏 15px 20px+gap10+右对齐+顶部边框+var(--card-bg)、
        0.2s 淡入+scale(0.9)。因此不传任何外壳样式覆盖，仅替换标签结构。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.importOption.title')"
        @close="handleCancel"
    >
        <div class="container">
            <div class="header">
                <h2>{{ t('dialogRenderer.importOption.header') }}</h2>
                <p>{{ t('dialogRenderer.importOption.subtitle') }}</p>
            </div>

            <div class="options">
                <div
                    v-for="option in importOptions"
                    :key="option.value"
                    class="option-card"
                    :class="{ selected: selectedOption === option.value }"
                    @click="selectOption(option.value)"
                >
                    <div class="option-icon">{{ option.icon }}</div>
                    <div class="option-content">
                        <div class="option-title">{{ t(option.titleKey) }}</div>
                        <div class="option-desc">{{ t(option.descKey) }}</div>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <button class="btn btn-cancel" @click="handleCancel">
                {{ t('common.cancel') }}
            </button>
            <button class="btn btn-confirm" :disabled="!selectedOption" @click="handleConfirm">
                {{ t('common.ok') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

type ImportOption = 'replace' | 'newfile' | 'insert'

interface Props {
    visible: boolean
}

// 迁移前本对话框不重置拖拽位置（useDialogDrag 未调用 resetPosition），
// BaseDialog 的 resetPositionOnOpen 默认 false 与之等价。
defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'confirm', option: ImportOption): void
}>()

const selectedOption = ref<ImportOption | null>(null)

const importOptions = [
    {
        value: 'replace' as const,
        titleKey: 'dialogRenderer.importOption.replaceTitle',
        descKey: 'dialogRenderer.importOption.replaceDesc',
        icon: '🔄'
    },
    {
        value: 'newfile' as const,
        titleKey: 'dialogRenderer.importOption.newFileTitle',
        descKey: 'dialogRenderer.importOption.newFileDesc',
        icon: '📄'
    },
    {
        value: 'insert' as const,
        titleKey: 'dialogRenderer.importOption.insertTitle',
        descKey: 'dialogRenderer.importOption.insertDesc',
        icon: '📝'
    }
]

function selectOption(option: ImportOption) {
    selectedOption.value = option
}

function handleCancel() {
    emit('close')
}

function handleConfirm() {
    if (selectedOption.value) {
        emit('confirm', selectedOption.value)
    }
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/footer/过渡动画）已抽到 BaseDialog；
   这里只保留正文与按钮样式。 */
.container {
    flex: 1;
    padding: 20px;
    display: flex;
    flex-direction: column;
}

.header {
    text-align: center;
    margin-bottom: 20px;
}

.header h2 {
    font-size: 18px;
    color: var(--text-color);
    margin-bottom: 8px;
}

.header p {
    font-size: 13px;
    color: var(--secondary-text-color);
}

.options {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
}

.option-card {
    background: var(--card-bg);
    border: 2px solid var(--border-color);
    border-radius: 8px;
    padding: 15px;
    cursor: pointer;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    gap: 12px;
}

.option-card:hover {
    border-color: var(--accent-color);
    transform: translateX(5px);
}

.option-card.selected {
    border-color: var(--accent-color);
    background: rgba(102, 126, 234, 0.08);
}

.option-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: rgba(102, 126, 234, 0.13);
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    flex-shrink: 0;
}

.option-content {
    flex: 1;
}

.option-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 4px;
}

.option-desc {
    font-size: 12px;
    color: var(--secondary-text-color);
}

.btn {
    padding: 8px 20px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
}

.btn-cancel {
    background: var(--border-color);
    color: var(--text-color);
}

.btn-cancel:hover {
    opacity: 0.9;
}

.btn-confirm {
    background: var(--accent-color);
    color: #fff;
}

.btn-confirm:hover {
    opacity: 0.9;
}

.btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
}
</style>
