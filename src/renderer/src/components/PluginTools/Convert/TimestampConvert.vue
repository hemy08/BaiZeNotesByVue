<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.timestamp.title') }}</h1>
        <div class="divider" style="height: 2px"></div>
        <p>{{ t('toolsConvert.timestamp.description') }}</p>

        <!-- 单位切换 + 当前时间戳 -->
        <div class="card panel-card">
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.timestamp.unitLabel') }}</label>
                <button
                    class="tab-btn"
                    :class="{ 'tab-active': unit === 's' }"
                    @click="switchUnit('s')"
                >
                    {{ t('toolsConvert.timestamp.seconds') }}
                </button>
                <button
                    class="tab-btn"
                    :class="{ 'tab-active': unit === 'ms' }"
                    @click="switchUnit('ms')"
                >
                    {{ t('toolsConvert.timestamp.milliseconds') }}
                </button>
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.timestamp.currentLabel') }}</label>
                <span class="result-text" data-testid="current-timestamp">{{
                    currentTimestamp
                }}</span>
                <button class="plugin-tools-btn" @click="copyCurrent">
                    {{ t('toolsConvert.timestamp.copyButton') }}
                </button>
            </div>
        </div>

        <!-- 时间戳 → 本地时间 -->
        <div class="card panel-card">
            <h3>{{ t('toolsConvert.timestamp.tsToLocalTitle') }}</h3>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.timestamp.timestampLabel') }}</label>
                <input
                    v-model="tsInput"
                    type="text"
                    class="value-input"
                    :placeholder="t('toolsConvert.timestamp.tsPlaceholder')"
                    @keyup.enter="convertTsToLocal"
                />
                <button class="plugin-tools-btn" @click="convertTsToLocal">
                    {{ t('toolsConvert.timestamp.convertButton') }}
                </button>
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.timestamp.localTimeLabel') }}</label>
                <span class="result-text" data-testid="ts-to-local-result">{{
                    localTimeResult
                }}</span>
            </div>
        </div>

        <!-- 本地时间 → 时间戳 -->
        <div class="card panel-card">
            <h3>{{ t('toolsConvert.timestamp.localToTsTitle') }}</h3>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.timestamp.dateTimeLabel') }}</label>
                <input
                    v-model="dateTimeInput"
                    type="text"
                    class="value-input"
                    :placeholder="t('toolsConvert.timestamp.dateTimePlaceholder')"
                    @keyup.enter="convertLocalToTs"
                />
                <button class="plugin-tools-btn" @click="convertLocalToTs">
                    {{ t('toolsConvert.timestamp.convertButton') }}
                </button>
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.timestamp.timestampLabel') }}</label>
                <span class="result-text" data-testid="local-to-ts-result">{{
                    timestampResult
                }}</span>
            </div>
        </div>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { t } from '../../../common/i18n'
import { copyTextToClipboard } from '../../../common/clipboard'
import { localToTimestamp, timestampToLocal } from './timestamp-lib'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const unit = ref<'s' | 'ms'>('s')
const currentTimestamp = ref('')
const tsInput = ref('')
const localTimeResult = ref('')
const dateTimeInput = ref('')
const timestampResult = ref('')
const errorMessage = ref('')
let timer: ReturnType<typeof setInterval> | undefined

/** 当前时间戳（秒/毫秒随单位切换） */
function refreshCurrent(): void {
    const now = Date.now()
    currentTimestamp.value = unit.value === 'ms' ? String(now) : String(Math.floor(now / 1000))
}

/** 切换秒/毫秒单位 */
function switchUnit(next: 's' | 'ms'): void {
    unit.value = next
    refreshCurrent()
}

/** 时间戳 → 本地时间 */
function convertTsToLocal(): void {
    const text = tsInput.value.trim()
    // P3 修复：空输入不再静默产出 1970-01-01（Number('') === 0 的坑），改为提示
    if (text === '') {
        localTimeResult.value = ''
        errorMessage.value = t('toolsConvert.timestamp.emptyInput')
        return
    }
    try {
        const value = Number(text)
        localTimeResult.value = timestampToLocal(value, unit.value === 'ms')
        errorMessage.value = ''
    } catch (error) {
        localTimeResult.value = ''
        errorMessage.value = String(error)
    }
}

/** 本地时间字符串 → 时间戳 */
function convertLocalToTs(): void {
    try {
        timestampResult.value = String(localToTimestamp(dateTimeInput.value, unit.value === 'ms'))
        errorMessage.value = ''
    } catch (error) {
        timestampResult.value = ''
        errorMessage.value = String(error)
    }
}

/** 复制当前时间戳 */
function copyCurrent(): void {
    if (currentTimestamp.value) {
        void copyTextToClipboard(currentTimestamp.value)
    }
}

onMounted(() => {
    refreshCurrent()
    // 每秒刷新当前时间戳，卸载时清理
    timer = setInterval(refreshCurrent, 1000)
})

onUnmounted(() => {
    if (timer) clearInterval(timer)
})
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.panel-card {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
}

.panel-card h3 {
    margin: 0;
    font-size: 14px;
}

.row-line {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.field-label {
    min-width: 110px;
    color: var(--theme-secondary-text-color);
}

.value-input {
    padding: 5px 8px;
    border-width: 1px;
    border-style: solid;
    border-radius: 4px;
    min-width: 220px;
}

.tab-btn {
    padding: 5px 18px;
    border-width: 1px;
    border-style: solid;
    border-radius: 4px;
    cursor: pointer;
}

.tab-active {
    background-color: var(--theme-accent-color);
    color: var(--theme-button-text-color);
    border-color: var(--theme-accent-color);
}

.result-text {
    font-weight: bold;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.error-text {
    color: var(--theme-accent-color);
    margin: 8px 0 0;
}
</style>
