<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.urlCodec.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p>{{ t('toolsConvert.urlCodec.description') }}</p>
        <div class="codec-row">
            <div class="codec-col" :style="{ width: columnWidth }">
                <div class="codec-label-style">
                    <label for="url-input">{{ t('toolsConvert.urlCodec.inputLabel') }}</label>
                </div>
                <textarea
                    id="url-input"
                    v-model="inputText"
                    class="codec-textarea"
                    :placeholder="t('toolsConvert.urlCodec.inputPlaceholder')"
                ></textarea>
            </div>
            <div class="codec-col" :style="{ width: columnWidth }">
                <div class="codec-label-style">
                    <label for="url-output">{{ t('toolsConvert.urlCodec.outputLabel') }}</label>
                </div>
                <textarea
                    id="url-output"
                    v-model="outputText"
                    class="codec-textarea"
                    :placeholder="t('toolsConvert.urlCodec.outputPlaceholder')"
                ></textarea>
            </div>
        </div>
        <div class="codec-btn-list" :style="{ width: props.workAreaWidth }">
            <button id="url-encode" class="codec-btn-style" @click="handleEncode">
                {{ t('toolsConvert.urlCodec.encodeButton') }}
            </button>
            <button id="url-decode" class="codec-btn-style" @click="handleDecode">
                {{ t('toolsConvert.urlCodec.decodeButton') }}
            </button>
            <button id="url-copy" class="codec-btn-style" @click="handleCopy">
                {{ t('toolsConvert.urlCodec.copyButton') }}
            </button>
            <button id="url-clear" class="codec-btn-style" @click="handleClear">
                {{ t('toolsConvert.urlCodec.clearButton') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { copyTextToClipboard } from '../../../common/clipboard'
import { decodeUrl, encodeUrl } from './url-lib'

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

// 编码：encodeURIComponent 百分号编码
function handleEncode() {
    outputText.value = encodeUrl(inputText.value)
}

// 解码：decodeURIComponent；非法百分号序列抛出 URIError，捕获后提示
function handleDecode() {
    try {
        outputText.value = decodeUrl(inputText.value)
    } catch (error) {
        alert(t('toolsConvert.urlCodec.decodeErrorAlert', { error: String(error) }))
    }
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
