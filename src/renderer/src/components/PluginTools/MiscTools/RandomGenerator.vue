<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.random.title') }}</h1>
        <div class="divider" style="height: 2px"></div>
        <p>{{ t('toolsConvert.random.description') }}</p>

        <!-- 标签页 -->
        <div class="tab-bar">
            <button
                v-for="tab in tabs"
                :key="tab.key"
                class="tab-btn"
                :class="{ 'tab-active': activeTab === tab.key }"
                @click="activeTab = tab.key"
            >
                {{ t('toolsConvert.random.tabs.' + tab.key) }}
            </button>
        </div>

        <!-- 密码生成 -->
        <div v-show="activeTab === 'password'" class="card panel-card">
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.random.passwordLength') }}</label>
                <input
                    v-model.number="passwordLength"
                    type="number"
                    min="4"
                    max="128"
                    class="value-input"
                />
            </div>
            <div class="row-line">
                <label class="check-label">
                    <input v-model="passwordOpts.uppercase" type="checkbox" />
                    {{ t('toolsConvert.random.uppercase') }}
                </label>
                <label class="check-label">
                    <input v-model="passwordOpts.lowercase" type="checkbox" />
                    {{ t('toolsConvert.random.lowercase') }}
                </label>
                <label class="check-label">
                    <input v-model="passwordOpts.numbers" type="checkbox" />
                    {{ t('toolsConvert.random.numbers') }}
                </label>
                <label class="check-label">
                    <input v-model="passwordOpts.symbols" type="checkbox" />
                    {{ t('toolsConvert.random.symbols') }}
                </label>
            </div>
            <div class="btn-row">
                <button class="plugin-tools-btn" @click="generatePassword">
                    {{ t('toolsConvert.random.generateButton') }}
                </button>
                <button class="plugin-tools-btn" @click="copyPassword">
                    {{ t('toolsConvert.random.copyButton') }}
                </button>
            </div>
            <textarea v-model="passwordOutput" rows="2" class="value-area" readonly></textarea>
        </div>

        <!-- 随机字符串 -->
        <div v-show="activeTab === 'string'" class="card panel-card">
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.random.stringLength') }}</label>
                <input
                    v-model.number="stringLength"
                    type="number"
                    min="1"
                    max="4096"
                    class="value-input"
                />
            </div>
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.random.charsetLabel') }}</label>
                <select v-model="charsetPreset" class="value-input">
                    <option v-for="preset in charsetPresets" :key="preset.key" :value="preset.key">
                        {{ t('toolsConvert.random.charsets.' + preset.key) }}
                    </option>
                    <option value="custom">{{ t('toolsConvert.random.customCharset') }}</option>
                </select>
            </div>
            <div v-if="charsetPreset === 'custom'" class="row-line">
                <label class="field-label">{{ t('toolsConvert.random.customCharset') }}</label>
                <input v-model="customCharset" type="text" class="value-input" />
            </div>
            <div class="btn-row">
                <button class="plugin-tools-btn" @click="generateString">
                    {{ t('toolsConvert.random.generateButton') }}
                </button>
                <button class="plugin-tools-btn" @click="copyString">
                    {{ t('toolsConvert.random.copyButton') }}
                </button>
            </div>
            <textarea v-model="stringOutput" rows="2" class="value-area" readonly></textarea>
        </div>

        <!-- 随机数 -->
        <div v-show="activeTab === 'number'" class="card panel-card">
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.random.minLabel') }}</label>
                <input
                    v-model.number="numberMin"
                    type="number"
                    min="-1000000000"
                    max="1000000000"
                    class="value-input"
                />
                <label class="field-label">{{ t('toolsConvert.random.maxLabel') }}</label>
                <input
                    v-model.number="numberMax"
                    type="number"
                    min="-1000000000"
                    max="1000000000"
                    class="value-input"
                />
                <label class="field-label">{{ t('toolsConvert.random.countLabel') }}</label>
                <input
                    v-model.number="numberCount"
                    type="number"
                    min="1"
                    max="100"
                    class="value-input"
                />
            </div>
            <div class="btn-row">
                <button class="plugin-tools-btn" @click="generateNumbers">
                    {{ t('toolsConvert.random.generateButton') }}
                </button>
                <button class="plugin-tools-btn" @click="copyNumbers">
                    {{ t('toolsConvert.random.copyButton') }}
                </button>
            </div>
            <textarea v-model="numbersOutput" rows="3" class="value-area" readonly></textarea>
        </div>

        <!-- 随机颜色 -->
        <div v-show="activeTab === 'color'" class="card panel-card">
            <div class="row-line">
                <label class="field-label">{{ t('toolsConvert.random.colorModeLabel') }}</label>
                <button
                    class="tab-btn"
                    :class="{ 'tab-active': colorMode === 'vivid' }"
                    @click="colorMode = 'vivid'"
                >
                    {{ t('toolsConvert.random.vividColor') }}
                </button>
                <button
                    class="tab-btn"
                    :class="{ 'tab-active': colorMode === 'randomBright' }"
                    @click="colorMode = 'randomBright'"
                >
                    {{ t('toolsConvert.random.randomBrightness') }}
                </button>
            </div>
            <div class="btn-row">
                <button class="plugin-tools-btn" @click="generateColor">
                    {{ t('toolsConvert.random.generateButton') }}
                </button>
                <button class="plugin-tools-btn" @click="copyColor">
                    {{ t('toolsConvert.random.copyButton') }}
                </button>
            </div>
            <div class="color-display">
                <div class="color-block" :style="{ backgroundColor: colorResult.hex }"></div>
                <div class="color-text">
                    <span data-testid="color-hex">{{ colorResult.hex }}</span>
                    <span data-testid="color-rgb">rgb({{ colorResult.rgb }})</span>
                </div>
            </div>
        </div>

        <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
    </div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { t } from '../../../common/i18n'
import { copyTextToClipboard } from '../../../common/clipboard'
import {
    generatePassword as libGeneratePassword,
    generateRandomNumbers as libGenerateRandomNumbers,
    generateRandomString as libGenerateRandomString,
    randomColorHsv,
    PASSWORD_DIGITS,
    PASSWORD_LOWER,
    PASSWORD_UPPER
} from './random-lib'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const tabs = [{ key: 'password' }, { key: 'string' }, { key: 'number' }, { key: 'color' }] as const

const activeTab = ref<'password' | 'string' | 'number' | 'color'>('password')
const errorMessage = ref('')

// ---- 密码 ----
const passwordLength = ref(16)
const passwordOpts = reactive({
    uppercase: true,
    lowercase: true,
    numbers: true,
    symbols: false
})
const passwordOutput = ref('')

// ---- 随机字符串 ----
const stringLength = ref(16)
const charsetPresets = [
    { key: 'alnum' },
    { key: 'alpha' },
    { key: 'lower' },
    { key: 'upper' },
    { key: 'digits' }
] as const
const charsetPreset = ref<'alnum' | 'alpha' | 'lower' | 'upper' | 'digits' | 'custom'>('alnum')
const customCharset = ref('')
const stringOutput = ref('')

/** 字符集预置表 */
const charsetMap: Record<string, string> = {
    alnum: PASSWORD_LOWER + PASSWORD_UPPER + PASSWORD_DIGITS,
    alpha: PASSWORD_LOWER + PASSWORD_UPPER,
    lower: PASSWORD_LOWER,
    upper: PASSWORD_UPPER,
    digits: PASSWORD_DIGITS
}

// ---- 随机数 ----
const numberMin = ref(1)
const numberMax = ref(100)
const numberCount = ref(10)
const numbersOutput = ref('')

// ---- 随机颜色 ----
const colorMode = ref<'vivid' | 'randomBright'>('vivid')
const colorResult = reactive({ hex: '#000000', rgb: '0,0,0' })

/** 当前选中的字符集 */
const activeCharset = computed(() =>
    charsetPreset.value === 'custom' ? customCharset.value : charsetMap[charsetPreset.value]
)

/** 生成密码（crypto 无偏采样） */
function generatePassword(): void {
    try {
        passwordOutput.value = libGeneratePassword(passwordLength.value, passwordOpts)
        errorMessage.value = ''
    } catch (error) {
        errorMessage.value = String(error)
    }
}

/** 生成随机字符串 */
function generateString(): void {
    try {
        stringOutput.value = libGenerateRandomString(stringLength.value, activeCharset.value)
        errorMessage.value = ''
    } catch (error) {
        errorMessage.value = String(error)
    }
}

/** 生成一批不重复随机数 */
function generateNumbers(): void {
    try {
        numbersOutput.value = libGenerateRandomNumbers(
            numberMin.value,
            numberMax.value,
            numberCount.value
        ).join(', ')
        errorMessage.value = ''
    } catch (error) {
        errorMessage.value = String(error)
    }
}

/** 生成随机颜色（HSV 均匀 hue，固定/随机亮度） */
function generateColor(): void {
    try {
        const result =
            colorMode.value === 'vivid'
                ? randomColorHsv(undefined, { s: 80, v: 90 })
                : randomColorHsv()
        colorResult.hex = result.hex
        colorResult.rgb = result.rgb
        errorMessage.value = ''
    } catch (error) {
        errorMessage.value = String(error)
    }
}

/** 各复制按钮 */
function copyPassword(): void {
    if (passwordOutput.value) void copyTextToClipboard(passwordOutput.value)
}
function copyString(): void {
    if (stringOutput.value) void copyTextToClipboard(stringOutput.value)
}
function copyNumbers(): void {
    if (numbersOutput.value) void copyTextToClipboard(numbersOutput.value)
}
function copyColor(): void {
    void copyTextToClipboard(colorResult.hex + ' / rgb(' + colorResult.rgb + ')')
}

// 初始生成
generatePassword()
generateString()
generateNumbers()
generateColor()
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.tab-bar {
    display: flex;
    gap: 8px;
    margin: 10px 0;
    flex-wrap: wrap;
}

.tab-btn {
    padding: 5px 16px;
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

.panel-card {
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.row-line {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
}

.field-label {
    min-width: 90px;
    color: var(--theme-secondary-text-color);
}

.check-label {
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--theme-secondary-text-color);
}

.value-input {
    padding: 5px 8px;
    border-width: 1px;
    border-style: solid;
    border-radius: 4px;
    min-width: 120px;
}

.value-area {
    padding: 8px;
    border-width: 1px;
    border-style: solid;
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.btn-row {
    display: flex;
    gap: 10px;
    justify-content: center;
}

.color-display {
    display: flex;
    align-items: center;
    gap: 14px;
}

.color-block {
    width: 72px;
    height: 72px;
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
}

.color-text {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-weight: bold;
}

.error-text {
    color: var(--theme-accent-color);
    margin: 8px 0 0;
}
</style>
