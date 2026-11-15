<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.imageBase64.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p>{{ t('toolsConvert.imageBase64.description') }}</p>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="codec-label-style">
                <label>{{ t('toolsConvert.imageBase64.chooseFileLabel') }}</label>
            </div>
            <input
                id="image-file-input"
                ref="fileInputRef"
                type="file"
                accept="image/*"
                style="display: none"
                @change="handleFileChange"
            />
            <button id="image-choose-file" class="codec-btn-style" @click="openFilePicker">
                {{ t('toolsConvert.imageBase64.chooseFileButton') }}
            </button>
            <span v-if="fileName" class="image-file-name">{{ fileName }}</span>
        </div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="codec-label-style">
                <label for="image-base64-text">{{
                    t('toolsConvert.imageBase64.base64Label')
                }}</label>
            </div>
            <textarea
                id="image-base64-text"
                v-model="base64Text"
                class="image-textarea"
                :placeholder="t('toolsConvert.imageBase64.base64Placeholder')"
            ></textarea>
        </div>
        <div class="codec-btn-list" :style="{ width: props.workAreaWidth }">
            <button id="image-base64-to-preview" class="codec-btn-style" @click="handleDecode">
                {{ t('toolsConvert.imageBase64.decodeButton') }}
            </button>
            <button id="image-copy" class="codec-btn-style" @click="handleCopy">
                {{ t('toolsConvert.imageBase64.copyButton') }}
            </button>
            <button id="image-clear" class="codec-btn-style" @click="handleClear">
                {{ t('toolsConvert.imageBase64.clearButton') }}
            </button>
        </div>
        <div v-if="previewUrl" class="image-preview-area">
            <h2>{{ t('toolsConvert.imageBase64.previewLabel') }}</h2>
            <img id="image-preview" :src="previewUrl" class="image-preview" alt="preview" />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { t } from '../../../common/i18n'
import { copyTextToClipboard } from '../../../common/clipboard'
import { base64ToBytes, bytesToBase64 } from './image-base64-lib'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

/** 图片大小上限：20MB（与 jyshare 原版一致） */
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
/**
 * P3 修复：粘贴 Base64 的输入长度预检上限（≈20MB×4/3，另加少量余量容纳
 * DataURL 前缀/空白字符）。先按长度拦截再 atob 解码，避免 20MB+ 数据先解码
 * 产生内存峰值后再校验。
 */
const MAX_BASE64_TEXT_LENGTH = Math.ceil((MAX_IMAGE_BYTES / 3) * 4) + 1024

const fileInputRef = ref<HTMLInputElement | null>(null)
const fileName = ref('')
const base64Text = ref('')
const previewUrl = ref('')
// 当前预览 Blob 的 object URL，切换/清空/卸载时需要 revoke 防内存泄漏
let currentObjectUrl = ''

// Base64 输入框宽度：工作区宽度去掉标签列，单位 px
const textareaWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const total = Number.isFinite(workWidthVal) ? workWidthVal : 680
    return Math.max(240, total - 200) + 'px'
})

// 选择图片：读字节 → bytesToBase64 → 生成 DataURL 填入文本框并预览
async function handleFileChange(event: Event) {
    const input = event.target as HTMLInputElement
    const file = input.files && input.files[0]
    if (!file) return
    if (file.size > MAX_IMAGE_BYTES) {
        alert(t('toolsConvert.imageBase64.sizeLimitAlert'))
        input.value = ''
        return
    }
    try {
        const buffer = await file.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        const base64 = bytesToBase64(bytes)
        base64Text.value = 'data:' + (file.type || 'image/png') + ';base64,' + base64
        fileName.value = file.name
        showImageFromBytes(bytes, file.type)
    } catch (error) {
        alert(t('toolsConvert.imageBase64.readFailedAlert', { error: String(error) }))
    }
}

// Base64/DataURL → 字节 → Blob → objectURL 预览
function handleDecode() {
    try {
        const text = base64Text.value
        // P3 修复：先按长度预检（20MB 上限对应约 26.7M 字符的 Base64），超限不进入 atob
        if (text.length > MAX_BASE64_TEXT_LENGTH) {
            alert(t('toolsConvert.imageBase64.sizeLimitAlert'))
            return
        }
        const bytes = base64ToBytes(text)
        if (bytes.length === 0) {
            alert(t('toolsConvert.imageBase64.emptyInputAlert'))
            return
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
            alert(t('toolsConvert.imageBase64.sizeLimitAlert'))
            return
        }
        const mime = detectMime(text)
        showImageFromBytes(bytes, mime)
    } catch (error) {
        alert(t('toolsConvert.imageBase64.decodeFailedAlert', { error: String(error) }))
    }
}

/** 用字节与 MIME 生成 objectURL 并更新预览（旧的 URL 及时 revoke） */
function showImageFromBytes(bytes: Uint8Array, mime: string) {
    // TS 泛型化 TypedArray（ArrayBufferLike）不满足 BlobPart（要求 ArrayBuffer），用底层 ArrayBuffer 构造
    const blob = new Blob([bytes.buffer as ArrayBuffer], { type: mime || 'image/png' })
    const url = URL.createObjectURL(blob)
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
    currentObjectUrl = url
    previewUrl.value = url
}

/** 从 Base64 文本解析图片 MIME（无 DataURL 前缀时回落 image/png） */
function detectMime(text: string): string {
    const match = text.trim().match(/^data:([^;,]+)/i)
    return match ? match[1] : 'image/png'
}

function openFilePicker() {
    fileInputRef.value?.click()
}

function handleCopy() {
    if (!base64Text.value) return
    void copyTextToClipboard(base64Text.value)
}

function handleClear() {
    base64Text.value = ''
    fileName.value = ''
    if (currentObjectUrl) {
        URL.revokeObjectURL(currentObjectUrl)
        currentObjectUrl = ''
    }
    previewUrl.value = ''
    if (fileInputRef.value) fileInputRef.value.value = ''
}

// 组件卸载时释放预览的 objectURL，避免内存泄漏
onBeforeUnmount(() => {
    if (currentObjectUrl) URL.revokeObjectURL(currentObjectUrl)
})
</script>

<style scoped>
@import '../plugin-tools-theme.css';
.codec-label-style {
    width: 150px;
    text-align: justify;
    background-color: #e1e4e8;
}

.image-file-name {
    margin-left: 20px;
    align-self: center;
    color: var(--theme-secondary-text-color);
}

.image-textarea {
    width: v-bind(textareaWidth);
    min-height: 100px;
    resize: vertical;
    margin-left: 20px;
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
    margin-left: 20px;
    border-radius: 5px;
    cursor: pointer;
}

.image-preview-area {
    margin-top: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.image-preview {
    max-width: 100%;
    max-height: 400px;
    margin-top: 10px;
}
</style>
