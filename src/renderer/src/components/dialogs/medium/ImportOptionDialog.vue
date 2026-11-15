<template>
    <Teleport to="body">
        <Transition name="dialog-fade">
            <div v-if="visible" class="dialog-overlay" @click.self="handleCancel">
                <Transition name="dialog-scale">
                    <div
                        v-if="visible"
                        class="dialog-container"
                        :style="dialogStyle"
                        @mousedown="onDialogMouseDown"
                    >
                        <div class="title-bar">
                            <span class="title-text">{{
                                t('dialogRenderer.importOption.title')
                            }}</span>
                            <button class="close-btn" @click.stop="handleCancel">×</button>
                        </div>

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

                        <div class="footer">
                            <button class="btn btn-cancel" @click="handleCancel">
                                {{ t('common.cancel') }}
                            </button>
                            <button
                                class="btn btn-confirm"
                                :disabled="!selectedOption"
                                @click="handleConfirm"
                            >
                                {{ t('common.ok') }}
                            </button>
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'
import { t } from '../../../common/i18n'

type ImportOption = 'replace' | 'newfile' | 'insert'

interface Props {
    visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'confirm', option: ImportOption): void
}>()

const { dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

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
    width: 500px;
    background: var(--bg-color);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.title-bar {
    height: 32px;
    background: var(--title-bar-gradient);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 15px;
    cursor: move;
    user-select: none;
}

.title-text {
    color: #fff;
    font-size: 13px;
    font-weight: 500;
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

.footer {
    padding: 15px 20px;
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    border-top: 1px solid var(--border-color);
    background: var(--card-bg);
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
