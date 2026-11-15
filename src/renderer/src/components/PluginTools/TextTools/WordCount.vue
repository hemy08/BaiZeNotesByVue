<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.wordCount.title') }}</h1>
        <div class="divider-tool"></div>
        <p>{{ t('toolsConvert.wordCount.description') }}</p>

        <!-- 输入区：输入即统计（150ms 防抖） -->
        <textarea
            v-model="inputText"
            class="tool-textarea"
            :placeholder="t('toolsConvert.wordCount.inputPlaceholder')"
            @input="scheduleRecount"
        ></textarea>

        <!-- 统计结果网格 -->
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">{{ stats.chineseChars }}</div>
                <div class="stat-label">{{ t('toolsConvert.wordCount.chineseChars') }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{ stats.chinesePunctuation }}</div>
                <div class="stat-label">{{ t('toolsConvert.wordCount.chinesePunctuation') }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{ stats.letters }}</div>
                <div class="stat-label">{{ t('toolsConvert.wordCount.letters') }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{ stats.digits }}</div>
                <div class="stat-label">{{ t('toolsConvert.wordCount.digits') }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{ stats.englishPunctuation }}</div>
                <div class="stat-label">{{ t('toolsConvert.wordCount.englishPunctuation') }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{ stats.totalChars }}</div>
                <div class="stat-label">{{ t('toolsConvert.wordCount.totalChars') }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{ stats.noSpaceChars }}</div>
                <div class="stat-label">{{ t('toolsConvert.wordCount.noSpaceChars') }}</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{{ stats.paragraphs }}</div>
                <div class="stat-label">{{ t('toolsConvert.wordCount.paragraphs') }}</div>
            </div>
        </div>

        <div class="div-style-display-row btn-row">
            <button class="tool-btn" @click="clearText">
                {{ t('toolsConvert.wordCount.clearButton') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { t } from '../../../common/i18n'
import { countText, type WordCountStats } from './word-count-lib'

// 编辑器宽度（由宿主 PluginTools 传入）
const props = defineProps({
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const inputText = ref('')
const stats = ref<WordCountStats>(countText(''))

// P3 修复：输入防抖 150ms——避免每次击键都对全文做一次统计重算
let debounceTimer: ReturnType<typeof setTimeout> | undefined

/** 防抖调度重算（输入框 @input 使用；清空按钮仍即时执行） */
function scheduleRecount() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
        debounceTimer = undefined
        recount()
    }, 150)
}

onUnmounted(() => {
    if (debounceTimer) clearTimeout(debounceTimer)
})

/** 重新统计（输入即触发） */
function recount() {
    stats.value = countText(inputText.value)
}

/** 清空输入与统计 */
function clearText() {
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = undefined
    inputText.value = ''
    recount()
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.divider-tool {
    background-color: var(--theme-border-color);
    height: 2px;
}

.tool-textarea {
    width: 100%;
    margin-top: 12px;
    min-height: 180px;
    resize: vertical;
    font-family: inherit;
}

.stats-grid {
    margin-top: 16px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
    gap: 10px;
}

.stat-card {
    background-color: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    padding: 10px;
    text-align: center;
}

.stat-value {
    font-size: 22px;
    font-weight: bold;
    color: var(--theme-accent-color);
}

.stat-label {
    margin-top: 4px;
    font-size: 13px;
    color: var(--theme-secondary-text-color);
}

.btn-row {
    margin-top: 16px;
    gap: 12px;
    justify-content: center;
}

.tool-btn {
    padding: 6px 20px;
    border-radius: 4px;
    cursor: pointer;
}
</style>
