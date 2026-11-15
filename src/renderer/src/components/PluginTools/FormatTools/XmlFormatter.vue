<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.xmlFormatter.title') }}</h1>
        <div class="divider-tool"></div>
        <p>{{ t('toolsConvert.xmlFormatter.description') }}</p>

        <!-- 标签页：格式化 / 压缩 -->
        <div class="div-style-display-row tab-row">
            <button
                v-for="tab in tabs"
                :key="tab"
                class="tab-btn"
                :class="{ 'tab-btn-active': activeTab === tab }"
                @click="switchTab(tab)"
            >
                {{ t(`toolsConvert.xmlFormatter.${tab}`) }}
            </button>
        </div>

        <!-- 缩进设置（仅格式化页） -->
        <div v-if="activeTab === 'tabFormat'" class="div-style-display-row indent-row">
            <label class="indent-label">{{ t('toolsConvert.xmlFormatter.indentLabel') }}</label>
            <select v-model="indentSize" class="indent-select">
                <option :value="2">2</option>
                <option :value="4">4</option>
            </select>
        </div>

        <!-- 输入区 -->
        <textarea
            v-model="inputText"
            class="tool-textarea"
            :placeholder="t('toolsConvert.xmlFormatter.inputPlaceholder')"
        ></textarea>

        <!-- 操作按钮 -->
        <div class="div-style-display-row btn-row">
            <button v-if="activeTab === 'tabFormat'" class="tool-btn" @click="runFormat">
                {{ t('toolsConvert.xmlFormatter.formatButton') }}
            </button>
            <button v-else class="tool-btn" @click="runMinify">
                {{ t('toolsConvert.xmlFormatter.minifyButton') }}
            </button>
        </div>

        <!-- 错误提示 -->
        <div v-if="errorMessage" class="error-box">
            {{ t('toolsConvert.xmlFormatter.errorPrefix') }} {{ errorMessage }}
        </div>

        <!-- 输出区 -->
        <textarea
            v-model="outputText"
            class="tool-textarea"
            readonly
            :placeholder="t('toolsConvert.xmlFormatter.outputPlaceholder')"
        ></textarea>

        <div class="div-style-display-row btn-row">
            <button class="tool-btn" @click="copyOutput">
                {{ t('toolsConvert.xmlFormatter.copyButton') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../../../common/i18n'
import { copyTextToClipboard } from '../../../common/clipboard'
import { formatXml, minifyXml } from './xml-format-lib'

// 编辑器宽度（由宿主 PluginTools 传入）
const props = defineProps({
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const tabs = ['tabFormat', 'tabMinify'] as const
type TabKey = (typeof tabs)[number]

const activeTab = ref<TabKey>('tabFormat')
const indentSize = ref(2)
const inputText = ref('')
const outputText = ref('')
const errorMessage = ref('')

/** 切换标签页并清空错误 */
function switchTab(tab: TabKey) {
    activeTab.value = tab
    errorMessage.value = ''
}

/** 格式化：词法重排 + DOMParser 校验，缩进按用户选择 */
function runFormat() {
    errorMessage.value = ''
    try {
        outputText.value = formatXml(inputText.value, indentSize.value)
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error)
    }
}

/** 压缩：去除标签间空白 */
function runMinify() {
    errorMessage.value = ''
    try {
        outputText.value = minifyXml(inputText.value)
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error)
    }
}

/** 复制输出结果 */
function copyOutput() {
    void copyTextToClipboard(outputText.value)
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.divider-tool {
    background-color: var(--theme-border-color);
    height: 2px;
}

.tab-row {
    margin-top: 12px;
    gap: 8px;
}

.tab-btn {
    padding: 6px 18px;
    background-color: var(--theme-card-background);
    color: var(--theme-text-color);
    border: 1px solid var(--theme-border-color);
    border-radius: 4px;
    cursor: pointer;
}

.tab-btn:hover {
    background-color: var(--theme-hover-background);
}

.tab-btn-active {
    background-color: var(--theme-accent-color);
    color: var(--theme-button-text-color);
    border-color: var(--theme-accent-color);
}

.indent-row {
    margin-top: 12px;
    align-items: center;
    gap: 8px;
}

.indent-label {
    color: var(--theme-secondary-text-color);
}

.indent-select {
    padding: 4px 8px;
}

.tool-textarea {
    width: 100%;
    margin-top: 12px;
    min-height: 140px;
    resize: vertical;
    font-family: monospace;
}

.btn-row {
    margin-top: 10px;
    gap: 12px;
}

.tool-btn {
    padding: 6px 20px;
    border-radius: 4px;
    cursor: pointer;
}

/* 错误提示：主题中性色 + ✗ 符号标注（不硬编码红绿） */
.error-box {
    margin-top: 10px;
    padding: 8px 12px;
    background-color: var(--theme-card-background);
    border: 1px solid var(--theme-accent-color);
    border-radius: 4px;
    color: var(--theme-secondary-text-color);
    white-space: pre-wrap;
    word-break: break-all;
}
</style>
