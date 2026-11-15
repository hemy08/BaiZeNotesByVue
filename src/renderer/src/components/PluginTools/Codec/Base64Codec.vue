<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.base64.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p>{{ t('toolsConvert.base64.description') }}</p>
        <div class="codec-row">
            <div class="codec-col" :style="{ width: columnWidth }">
                <div class="codec-label-style">
                    <label for="base64-input">{{ t('toolsConvert.base64.inputLabel') }}</label>
                </div>
                <textarea
                    id="base64-input"
                    v-model="inputText"
                    class="codec-textarea"
                    :placeholder="t('toolsConvert.base64.inputPlaceholder')"
                ></textarea>
            </div>
            <div class="codec-col" :style="{ width: columnWidth }">
                <div class="codec-label-style">
                    <label for="base64-output">{{ t('toolsConvert.base64.outputLabel') }}</label>
                </div>
                <textarea
                    id="base64-output"
                    v-model="outputText"
                    class="codec-textarea"
                    :placeholder="t('toolsConvert.base64.outputPlaceholder')"
                ></textarea>
            </div>
        </div>
        <div class="codec-btn-list" :style="{ width: props.workAreaWidth }">
            <button id="base64-encode" class="codec-btn-style" @click="handleEncode">
                {{ t('toolsConvert.base64.encodeButton') }}
            </button>
            <button id="base64-decode" class="codec-btn-style" @click="handleDecode">
                {{ t('toolsConvert.base64.decodeButton') }}
            </button>
            <button id="base64-copy" class="codec-btn-style" @click="handleCopy">
                {{ t('toolsConvert.base64.copyButton') }}
            </button>
            <button id="base64-clear" class="codec-btn-style" @click="handleClear">
                {{ t('toolsConvert.base64.clearButton') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { copyTextToClipboard } from '../../../common/clipboard'
import { decodeBase64, encodeBase64 } from './base64-lib'

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

// 编码：原文按 UTF-8 转 Base64
function handleEncode() {
    outputText.value = encodeBase64(inputText.value)
}

// 解码：Base64 还原为文本（容忍非法字符）
function handleDecode() {
    outputText.value = decodeBase64(inputText.value)
}

function handleCopy() {
    if (!outputText.value) return
    void copyTextToClipboard(outputText.value)
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
