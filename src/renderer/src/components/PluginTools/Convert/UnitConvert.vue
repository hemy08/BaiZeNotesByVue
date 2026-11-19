<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.unit.title') }}</h1>
        <div class="divider" style="height: 2px"></div>
        <p>{{ t('toolsConvert.unit.description') }}</p>

        <!-- 标签页切换 -->
        <div class="tab-bar">
            <button
                class="tab-btn"
                :class="{ 'tab-active': activeTab === 'length' }"
                @click="activeTab = 'length'"
            >
                {{ t('toolsConvert.unit.lengthTab') }}
            </button>
            <button
                class="tab-btn"
                :class="{ 'tab-active': activeTab === 'storage' }"
                @click="activeTab = 'storage'"
            >
                {{ t('toolsConvert.unit.storageTab') }}
            </button>
        </div>

        <!-- 长度换算 -->
        <div v-show="activeTab === 'length'" class="card panel-card">
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.unit.valueLabel') }}</label>
                <input
                    v-model="lengthValue"
                    type="text"
                    class="value-input"
                    @input="computeLength"
                />
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.unit.fromLabel') }}</label>
                <select v-model="lengthFrom" @change="computeLength">
                    <option v-for="unit in lengthOrder" :key="unit" :value="unit">
                        {{ t('toolsConvert.unit.units.' + unit) }}
                    </option>
                </select>
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.unit.toLabel') }}</label>
                <select v-model="lengthTo" @change="computeLength">
                    <option v-for="unit in lengthOrder" :key="unit" :value="unit">
                        {{ t('toolsConvert.unit.units.' + unit) }}
                    </option>
                </select>
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.unit.resultLabel') }}</label>
                <span class="result-text" data-testid="length-result">{{ lengthResult }}</span>
            </div>
        </div>

        <!-- 存储换算 -->
        <div v-show="activeTab === 'storage'" class="card panel-card">
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.unit.modeLabel') }}</label>
                <button
                    class="tab-btn"
                    :class="{ 'tab-active': storageMode === 'binary' }"
                    @click="selectStorageMode('binary')"
                >
                    {{ t('toolsConvert.unit.binary') }}
                </button>
                <button
                    class="tab-btn"
                    :class="{ 'tab-active': storageMode === 'si' }"
                    @click="selectStorageMode('si')"
                >
                    {{ t('toolsConvert.unit.si') }}
                </button>
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.unit.valueLabel') }}</label>
                <input
                    v-model="storageValue"
                    type="text"
                    class="value-input"
                    @input="computeStorage"
                />
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.unit.fromLabel') }}</label>
                <select v-model="storageFrom" @change="computeStorage">
                    <option v-for="unit in storageOrder" :key="unit" :value="unit">
                        {{ unit }}
                    </option>
                </select>
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.unit.toLabel') }}</label>
                <select v-model="storageTo" @change="computeStorage">
                    <option v-for="unit in storageOrder" :key="unit" :value="unit">
                        {{ unit }}
                    </option>
                </select>
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.unit.resultLabel') }}</label>
                <span class="result-text" data-testid="storage-result">{{ storageResult }}</span>
            </div>
        </div>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import {
    convertLength,
    convertStorage,
    LENGTH_UNIT_ORDER,
    STORAGE_BINARY_ORDER,
    STORAGE_SI_ORDER,
    type LengthUnitKey,
    type StorageUnitKey
} from './unit-lib'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const activeTab = ref<'length' | 'storage'>('length')

// ---- 长度换算状态 ----
const lengthValue = ref('1')
const lengthFrom = ref<LengthUnitKey>('m')
const lengthTo = ref<LengthUnitKey>('km')
const lengthResult = ref('')
const lengthOrder = LENGTH_UNIT_ORDER

// ---- 存储换算状态 ----
const storageValue = ref('1')
const storageFrom = ref<StorageUnitKey>('KB')
const storageTo = ref<StorageUnitKey>('MB')
const storageMode = ref<'binary' | 'si'>('binary')
const storageResult = ref('')
const errorMessage = ref('')

/** 存储单位下拉列表随制式变化（SI 制无 PB） */
const storageOrder = computed<readonly StorageUnitKey[]>(() =>
    storageMode.value === 'si' ? STORAGE_SI_ORDER : STORAGE_BINARY_ORDER
)

/** 结果格式化：≥1e6 或 ≤0.0001 用科学计数法，否则保留 6 位小数 */
function formatResult(value: number): string {
    if (Math.abs(value) >= 1e6 || (value !== 0 && Math.abs(value) < 1e-4)) {
        return value.toExponential(6)
    }
    return String(Number(value.toFixed(6)))
}

/** 长度换算计算 */
function computeLength(): void {
    const value = Number(lengthValue.value)
    if (lengthValue.value.trim() === '' || !Number.isFinite(value)) {
        errorMessage.value = t('toolsConvert.unit.invalidValue')
        lengthResult.value = ''
        return
    }
    try {
        errorMessage.value = ''
        lengthResult.value = formatResult(convertLength(value, lengthFrom.value, lengthTo.value))
    } catch (error) {
        errorMessage.value = String(error)
        lengthResult.value = ''
    }
}

/** 存储换算计算 */
function computeStorage(): void {
    const value = Number(storageValue.value)
    if (storageValue.value.trim() === '' || !Number.isFinite(value)) {
        errorMessage.value = t('toolsConvert.unit.invalidValue')
        storageResult.value = ''
        return
    }
    // 二进制制在 si=false 下换算；SI 制在 si=true 下换算
    const si = storageMode.value === 'si'
    if (si && storageFrom.value === 'PB') storageFrom.value = 'TB'
    if (si && storageTo.value === 'PB') storageTo.value = 'TB'
    try {
        errorMessage.value = ''
        storageResult.value = formatResult(
            convertStorage(value, storageFrom.value, storageTo.value, si)
        )
    } catch (error) {
        errorMessage.value = String(error)
        storageResult.value = ''
    }
}

/** 切换存储制式并立即重算（模板按钮点击；单一表达式避免模板内多语句处理器） */
function selectStorageMode(mode: 'binary' | 'si'): void {
    storageMode.value = mode
    computeStorage()
}

// 初始化计算
computeLength()
computeStorage()
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.tab-bar {
    display: flex;
    gap: 8px;
    margin: 10px 0;
}

.tab-btn {
    padding: 5px 18px;
}

.panel-card {
    padding: 12px;
}

.value-input,
select {
    padding: 4px 8px;
    border-width: 1px;
    border-style: solid;
    border-radius: 4px;
    min-width: 160px;
}

.result-text {
    font-weight: bold;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.error-text {
    margin: 6px 0 0;
}
</style>
