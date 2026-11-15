<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.rmb.title') }}</h1>
        <div class="divider" style="height: 2px"></div>
        <p>{{ t('toolsConvert.rmb.description') }}</p>

        <div class="card panel-card">
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.rmb.inputLabel') }}</label>
                <input
                    v-model="amountInput"
                    type="text"
                    class="value-input"
                    :placeholder="t('toolsConvert.rmb.placeholder')"
                    @keyup.enter="convert"
                />
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.rmb.resultLabel') }}</label>
                <span class="result-text" data-testid="rmb-result">{{ upperResult }}</span>
            </div>
            <div class="btn-row">
                <button class="plugin-tools-btn" @click="convert">
                    {{ t('toolsConvert.rmb.convertButton') }}
                </button>
                <button class="plugin-tools-btn" @click="copyResult">
                    {{ t('toolsConvert.rmb.copyButton') }}
                </button>
            </div>
        </div>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../../../common/i18n'
import { copyTextToClipboard } from '../../../common/clipboard'
import { rmbToUpper } from './rmb-lib'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const amountInput = ref('100.5')
const upperResult = ref('')
const errorMessage = ref('')

/** 执行转换并展示结果/错误 */
function convert(): void {
    try {
        upperResult.value = rmbToUpper(amountInput.value)
        errorMessage.value = ''
    } catch (error) {
        upperResult.value = ''
        errorMessage.value = String(error)
    }
}

/** 复制结果到剪贴板 */
function copyResult(): void {
    if (upperResult.value) {
        void copyTextToClipboard(upperResult.value)
    }
}

// 初始转换
convert()
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.panel-card {
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.row-line {
    display: flex;
    align-items: center;
    gap: 10px;
}

.field-label {
    min-width: 90px;
    color: var(--theme-secondary-text-color);
}

.value-input {
    padding: 5px 8px;
    border-width: 1px;
    border-style: solid;
    border-radius: 4px;
    min-width: 240px;
}

.result-text {
    font-weight: bold;
    font-size: 16px;
}

.btn-row {
    display: flex;
    gap: 10px;
    justify-content: center;
}

.error-text {
    color: var(--theme-accent-color);
    margin: 8px 0 0;
}
</style>
