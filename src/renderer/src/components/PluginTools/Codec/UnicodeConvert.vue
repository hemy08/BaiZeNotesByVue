<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.unicode.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p>{{ t('toolsConvert.unicode.description') }}</p>
        <div class="codec-row">
            <div class="codec-col" :style="{ width: columnWidth }">
                <div class="codec-label-style">
                    <label for="unicode-input">{{ t('toolsConvert.unicode.inputLabel') }}</label>
                </div>
                <textarea
                    id="unicode-input"
                    v-model="inputText"
                    class="codec-textarea"
                    :placeholder="t('toolsConvert.unicode.inputPlaceholder')"
                ></textarea>
            </div>
            <div class="codec-col" :style="{ width: columnWidth }">
                <div class="codec-label-style">
                    <label for="unicode-output">{{ t('toolsConvert.unicode.outputLabel') }}</label>
                </div>
                <textarea
                    id="unicode-output"
                    v-model="outputText"
                    class="codec-textarea"
                    :placeholder="t('toolsConvert.unicode.outputPlaceholder')"
                ></textarea>
            </div>
        </div>
        <div class="codec-btn-list" :style="{ width: props.workAreaWidth }">
            <button id="unicode-to-unicode" class="codec-btn-style" @click="handleToUnicode">
                {{ t('toolsConvert.unicode.toUnicodeButton') }}
            </button>
            <button id="unicode-to-text" class="codec-btn-style" @click="handleToText">
                {{ t('toolsConvert.unicode.toTextButton') }}
            </button>
            <button id="unicode-to-entity" class="codec-btn-style" @click="handleToEntity">
                {{ t('toolsConvert.unicode.toEntityButton') }}
            </button>
            <button id="unicode-entity-to-text" class="codec-btn-style" @click="handleEntityToText">
                {{ t('toolsConvert.unicode.entityToTextButton') }}
            </button>
            <button id="unicode-copy" class="codec-btn-style" @click="handleCopy">
                {{ t('toolsConvert.unicode.copyButton') }}
            </button>
            <button id="unicode-clear" class="codec-btn-style" @click="handleClear">
                {{ t('toolsConvert.unicode.clearButton') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { asciiToEntity, entityToAscii, textToUnicode, unicodeToText } from './unicode-lib'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const inputText = ref('')
const outputText = ref('')

// 左右两栏各占工作区宽度的一半（去掉栏间距），单位 px；宽度无法解析时回落 340px
const columnWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const total = Number.isFinite(workWidthVal) ? workWidthVal : 680
    return Math.max(240, Math.floor((total - 40) / 2)) + 'px'
})

// 中文/非 ASCII 字符 → \uXXXX
function handleToUnicode() {
    outputText.value = textToUnicode(inputText.value)
}

// \uXXXX → 文本
function handleToText() {
    outputText.value = unicodeToText(inputText.value)
}

// 文本 → &#十进制; 实体
function handleToEntity() {
    outputText.value = asciiToEntity(inputText.value)
}

// &#nn; / &#xhh; 实体 → 文本
function handleEntityToText() {
    outputText.value = entityToAscii(inputText.value)
}

function handleCopy() {
    if (!outputText.value) return
    navigator.clipboard.writeText(outputText.value)
}

function handleClear() {
    inputText.value = ''
    outputText.value = ''
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';
.codec-row {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    justify-content: center;
    gap: 20px;
    margin-top: 10px;
}

.codec-col {
    display: flex;
    flex-direction: column;
}

.codec-label-style {
    width: 150px;
    text-align: justify;
    background-color: #e1e4e8;
}

.codec-textarea {
    width: 100%;
    min-height: 120px;
    resize: vertical;
    margin-top: 5px;
}

.codec-btn-list {
    margin-top: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
}

.codec-btn-style {
    padding: 5px 20px;
    border-radius: 5px;
    cursor: pointer;
}
</style>
