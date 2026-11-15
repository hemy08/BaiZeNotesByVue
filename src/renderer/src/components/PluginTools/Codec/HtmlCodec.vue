<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.htmlCodec.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p>{{ t('toolsConvert.htmlCodec.description') }}</p>
        <div class="codec-row">
            <div class="codec-col" :style="{ width: columnWidth }">
                <div class="codec-label-style">
                    <label for="html-input">{{ t('toolsConvert.htmlCodec.inputLabel') }}</label>
                </div>
                <textarea
                    id="html-input"
                    v-model="inputText"
                    class="codec-textarea"
                    :placeholder="t('toolsConvert.htmlCodec.inputPlaceholder')"
                ></textarea>
            </div>
            <div class="codec-col" :style="{ width: columnWidth }">
                <div class="codec-label-style">
                    <label for="html-output">{{ t('toolsConvert.htmlCodec.outputLabel') }}</label>
                </div>
                <textarea
                    id="html-output"
                    v-model="outputText"
                    class="codec-textarea"
                    :placeholder="t('toolsConvert.htmlCodec.outputPlaceholder')"
                ></textarea>
            </div>
        </div>
        <div class="codec-btn-list" :style="{ width: props.workAreaWidth }">
            <button id="html-encode" class="codec-btn-style" @click="handleEncode">
                {{ t('toolsConvert.htmlCodec.encodeButton') }}
            </button>
            <button id="html-decode" class="codec-btn-style" @click="handleDecode">
                {{ t('toolsConvert.htmlCodec.decodeButton') }}
            </button>
            <button id="html-copy" class="codec-btn-style" @click="handleCopy">
                {{ t('toolsConvert.htmlCodec.copyButton') }}
            </button>
            <button id="html-clear" class="codec-btn-style" @click="handleClear">
                {{ t('toolsConvert.htmlCodec.clearButton') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { copyTextToClipboard } from '../../../common/clipboard'
import { decodeHtml, encodeHtml } from './html-lib'

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

// 编码：转义 & < > " '
function handleEncode() {
    outputText.value = encodeHtml(inputText.value)
}

// 解码：还原命名实体与数字实体
function handleDecode() {
    outputText.value = decodeHtml(inputText.value)
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
