<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.color.title') }}</h1>
        <div class="divider" style="height: 2px"></div>
        <p>{{ t('toolsConvert.color.description') }}</p>

        <div class="convert-layout">
            <!-- 颜色预览条 -->
            <div class="color-preview" :style="{ backgroundColor: previewHex }"></div>

            <!-- HEX 区块 -->
            <div class="card color-card">
                <h3>{{ t('toolsConvert.color.hex') }}</h3>
                <div class="row-line">
                    <input
                        v-model="hexInput"
                        type="text"
                        placeholder="#FF8000"
                        @input="updateFromHex"
                    />
                </div>
            </div>

            <!-- RGB 区块 -->
            <div class="card color-card">
                <h3>{{ t('toolsConvert.color.rgb') }}</h3>
                <div class="row-line">
                    <input
                        v-model="rgbInput"
                        type="text"
                        placeholder="255,128,0"
                        @input="updateFromRgb"
                    />
                </div>
            </div>

            <!-- HSL 区块 -->
            <div class="card color-card">
                <h3>{{ t('toolsConvert.color.hsl') }}</h3>
                <div class="row-line">
                    <input
                        v-model.number="hslH"
                        type="number"
                        min="0"
                        max="360"
                        :title="t('toolsConvert.color.hue')"
                        @input="updateFromHsl"
                    />
                    <input
                        v-model.number="hslS"
                        type="number"
                        min="0"
                        max="100"
                        :title="t('toolsConvert.color.saturation')"
                        @input="updateFromHsl"
                    />
                    <input
                        v-model.number="hslL"
                        type="number"
                        min="0"
                        max="100"
                        :title="t('toolsConvert.color.lightness')"
                        @input="updateFromHsl"
                    />
                </div>
            </div>

            <!-- HSV 区块 -->
            <div class="card color-card">
                <h3>{{ t('toolsConvert.color.hsv') }}</h3>
                <div class="row-line">
                    <input
                        v-model.number="hsvH"
                        type="number"
                        min="0"
                        max="360"
                        :title="t('toolsConvert.color.hue')"
                        @input="updateFromHsv"
                    />
                    <input
                        v-model.number="hsvS"
                        type="number"
                        min="0"
                        max="100"
                        :title="t('toolsConvert.color.saturation')"
                        @input="updateFromHsv"
                    />
                    <input
                        v-model.number="hsvV"
                        type="number"
                        min="0"
                        max="100"
                        :title="t('toolsConvert.color.value')"
                        @input="updateFromHsv"
                    />
                </div>
            </div>

            <!-- CMYK 区块 -->
            <div class="card color-card">
                <h3>{{ t('toolsConvert.color.cmyk') }}</h3>
                <div class="row-line">
                    <input
                        v-model.number="cmykC"
                        type="number"
                        min="0"
                        max="100"
                        :title="t('toolsConvert.color.cyan')"
                        @input="updateFromCmyk"
                    />
                    <input
                        v-model.number="cmykM"
                        type="number"
                        min="0"
                        max="100"
                        :title="t('toolsConvert.color.magenta')"
                        @input="updateFromCmyk"
                    />
                    <input
                        v-model.number="cmykY"
                        type="number"
                        min="0"
                        max="100"
                        :title="t('toolsConvert.color.yellow')"
                        @input="updateFromCmyk"
                    />
                    <input
                        v-model.number="cmykK"
                        type="number"
                        min="0"
                        max="100"
                        :title="t('toolsConvert.color.black')"
                        @input="updateFromCmyk"
                    />
                </div>
            </div>

            <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../../../common/i18n'
import {
    cmykToRgb,
    hexToRgb,
    hslToRgb,
    hsvToRgb,
    parseRgbInput,
    rgbToCmyk,
    rgbToHex,
    rgbToHsl,
    rgbToHsv,
    type RgbColor
} from './color-lib'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

// 各格式输入状态
const hexInput = ref('#FF8000')
const rgbInput = ref('255,128,0')
const hslH = ref(30)
const hslS = ref(100)
const hslL = ref(50)
const hsvH = ref(30)
const hsvS = ref(100)
const hsvV = ref(100)
const cmykC = ref(0)
const cmykM = ref(50)
const cmykY = ref(100)
const cmykK = ref(0)
const errorMessage = ref('')
const previewHex = ref('#FF8000')

/** 把 RGB 同步到除指定源之外的所有格式区块 */
function syncAllFromRgb(rgb: RgbColor, source: string): void {
    const hex = rgbToHex(rgb)
    previewHex.value = hex
    if (source !== 'hex') hexInput.value = hex
    if (source !== 'rgb') rgbInput.value = rgb.r + ',' + rgb.g + ',' + rgb.b
    if (source !== 'hsl') {
        const hsl = rgbToHsl(rgb)
        hslH.value = Math.round(hsl.h)
        hslS.value = Math.round(hsl.s)
        hslL.value = Math.round(hsl.l)
    }
    if (source !== 'hsv') {
        const hsv = rgbToHsv(rgb)
        hsvH.value = Math.round(hsv.h)
        hsvS.value = Math.round(hsv.s)
        hsvV.value = Math.round(hsv.v)
    }
    if (source !== 'cmyk') {
        const cmyk = rgbToCmyk(rgb)
        cmykC.value = Math.round(cmyk.c)
        cmykM.value = Math.round(cmyk.m)
        cmykY.value = Math.round(cmyk.y)
        cmykK.value = Math.round(cmyk.k)
    }
}

/** 由 RGB 字符串触发转换 */
function updateFromRgb(): void {
    const rgb = parseRgbInput(rgbInput.value)
    if (!rgb) {
        errorMessage.value = t('toolsConvert.color.invalidInput')
        return
    }
    errorMessage.value = ''
    syncAllFromRgb(rgb, 'rgb')
}

/** 由 HEX 输入触发转换 */
function updateFromHex(): void {
    try {
        const rgb = hexToRgb(hexInput.value)
        errorMessage.value = ''
        syncAllFromRgb(rgb, 'hex')
    } catch {
        errorMessage.value = t('toolsConvert.color.invalidInput') + '：' + hexInput.value
    }
}

/** 由 HSL 输入触发转换 */
function updateFromHsl(): void {
    if (!validNumber(hslH.value) || !validNumber(hslS.value) || !validNumber(hslL.value)) {
        errorMessage.value = t('toolsConvert.color.invalidInput')
        return
    }
    errorMessage.value = ''
    syncAllFromRgb(hslToRgb({ h: hslH.value, s: hslS.value, l: hslL.value }), 'hsl')
}

/** 由 HSV 输入触发转换 */
function updateFromHsv(): void {
    if (!validNumber(hsvH.value) || !validNumber(hsvS.value) || !validNumber(hsvV.value)) {
        errorMessage.value = t('toolsConvert.color.invalidInput')
        return
    }
    errorMessage.value = ''
    syncAllFromRgb(hsvToRgb({ h: hsvH.value, s: hsvS.value, v: hsvV.value }), 'hsv')
}

/** 由 CMYK 输入触发转换 */
function updateFromCmyk(): void {
    if (
        !validNumber(cmykC.value) ||
        !validNumber(cmykM.value) ||
        !validNumber(cmykY.value) ||
        !validNumber(cmykK.value)
    ) {
        errorMessage.value = t('toolsConvert.color.invalidInput')
        return
    }
    errorMessage.value = ''
    syncAllFromRgb(
        cmykToRgb({ c: cmykC.value, m: cmykM.value, y: cmykY.value, k: cmykK.value }),
        'cmyk'
    )
}

/** 数值合法性校验（允许空串，由调用方语义判断） */
function validNumber(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value)
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.convert-layout {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.color-preview {
    height: 48px;
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
}

.color-card {
    padding: 8px 12px;
}

.color-card h3 {
    margin: 0 0 6px;
    font-size: 14px;
}

.row-line {
    display: flex;
    gap: 8px;
    align-items: center;
}

.row-line input {
    padding: 4px 6px;
    border-width: 1px;
    border-style: solid;
    border-radius: 4px;
}

.error-text {
    color: var(--theme-accent-color);
    margin: 0;
}
</style>
