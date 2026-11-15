<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.base.title') }}</h1>
        <div class="divider" style="height: 2px"></div>
        <p>{{ t('toolsConvert.base.description') }}</p>

        <div class="convert-layout">
            <!-- 源进制 -->
            <div class="card panel-card">
                <h3>{{ t('toolsConvert.base.fromBaseLabel') }}</h3>
                <div class="base-btns">
                    <button
                        v-for="base in quickBases"
                        :key="base"
                        class="base-btn"
                        :class="{ 'base-active': fromBase === base }"
                        @click="fromBase = base; convert()"
                    >
                        {{ base }}
                    </button>
                    <input
                        v-model.number="fromCustom"
                        type="number"
                        min="2"
                        max="36"
                        class="custom-base-input"
                        :placeholder="t('toolsConvert.base.customPlaceholder')"
                        @input="onCustomFrom"
                    />
                </div>
                <textarea
                    v-model="inputValue"
                    class="value-area"
                    rows="2"
                    :placeholder="t('toolsConvert.base.inputPlaceholder')"
                    @input="scheduleConvert"
                ></textarea>
            </div>

            <!-- 目标进制 -->
            <div class="card panel-card">
                <h3>{{ t('toolsConvert.base.toBaseLabel') }}</h3>
                <div class="base-btns">
                    <button
                        v-for="base in quickBases"
                        :key="base"
                        class="base-btn"
                        :class="{ 'base-active': toBase === base }"
                        @click="toBase = base; convert()"
                    >
                        {{ base }}
                    </button>
                    <input
                        v-model.number="toCustom"
                        type="number"
                        min="2"
                        max="36"
                        class="custom-base-input"
                        :placeholder="t('toolsConvert.base.customPlaceholder')"
                        @input="onCustomTo"
                    />
                </div>
                <div class="row-line">
                    <label class="field-label">{{ t('toolsConvert.base.resultLabel') }}</label>
                    <span class="result-text" data-testid="base-result">{{ resultValue }}</span>
                </div>
                <div class="btn-row">
                    <button class="plugin-tools-btn" @click="swapBases">
                        {{ t('toolsConvert.base.swapButton') }}
                    </button>
                    <button class="plugin-tools-btn" @click="copyResult">
                        {{ t('toolsConvert.base.copyButton') }}
                    </button>
                </div>
            </div>
        </div>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { t } from '../../../common/i18n'
import { convertBase, isValidForBase, MAX_BASE_INPUT_LENGTH } from './base-lib'
import { copyTextToClipboard } from '../../../common/clipboard'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const quickBases = [2, 8, 10, 16]
const fromBase = ref(10)
const toBase = ref(2)
const fromCustom = ref<number | null>(null)
const toCustom = ref<number | null>(null)
const inputValue = ref('255')
const resultValue = ref('')
const errorMessage = ref('')

// P2 修复：输入防抖 200ms——避免每次击键都执行进制转换（超长小数会做巨大指数运算冻结 UI）
let debounceTimer: ReturnType<typeof setTimeout> | undefined

/** 防抖调度转换（输入框 @input 使用；按钮/交换操作仍即时执行） */
function scheduleConvert(): void {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
        debounceTimer = undefined
        convert()
    }, 200)
}

onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
})

/** 执行转换（实时联动） */
function convert(): void {
    const text = inputValue.value.trim()
    if (text === '') {
        resultValue.value = ''
        errorMessage.value = ''
        return
    }
    // P2 修复：输入长度上限（10000 字符），超限提示并停止转换
    if (text.length > MAX_BASE_INPUT_LENGTH) {
        resultValue.value = ''
        errorMessage.value = t('toolsConvert.base.inputTooLong', { limit: MAX_BASE_INPUT_LENGTH })
        return
    }
    if (!isValidForBase(text, fromBase.value)) {
        resultValue.value = ''
        errorMessage.value = t('toolsConvert.base.invalidInput', { base: fromBase.value })
        return
    }
    try {
        resultValue.value = convertBase(text, fromBase.value, toBase.value)
        errorMessage.value = ''
    } catch (error) {
        resultValue.value = ''
        errorMessage.value = String(error)
    }
}

/** 自定义源进制输入（2-36） */
function onCustomFrom(): void {
    const value = fromCustom.value
    if (typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 36) {
        fromBase.value = value
        convert()
    }
}

/** 自定义目标进制输入（2-36） */
function onCustomTo(): void {
    const value = toCustom.value
    if (typeof value === 'number' && Number.isInteger(value) && value >= 2 && value <= 36) {
        toBase.value = value
        convert()
    }
}

/** 交换源/目标进制 */
function swapBases(): void {
    const tmp = fromBase.value
    fromBase.value = toBase.value
    toBase.value = tmp
    fromCustom.value = null
    toCustom.value = null
    convert()
}

/** 复制转换结果 */
function copyResult(): void {
    if (resultValue.value) {
        void copyTextToClipboard(resultValue.value)
    }
}

// 初始转换
convert()
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.convert-layout {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.panel-card {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.panel-card h3 {
    margin: 0;
    font-size: 14px;
}

.base-btns {
    display: flex;
    gap: 8px;
    align-items: center;
    flex-wrap: wrap;
}

.base-btn {
    padding: 6px 16px;
    border-width: 1px;
    border-style: solid;
    border-radius: 4px;
    cursor: pointer;
    min-width: 44px;
}

.base-active {
    background-color: var(--theme-accent-color);
    color: var(--theme-button-text-color);
    border-color: var(--theme-accent-color);
}

.custom-base-input {
    width: 90px;
    padding: 5px 8px;
    border-width: 1px;
    border-style: solid;
    border-radius: 4px;
}

.value-area {
    padding: 8px;
    border-width: 1px;
    border-style: solid;
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 16px;
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

.result-text {
    font-weight: bold;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    word-break: break-all;
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
