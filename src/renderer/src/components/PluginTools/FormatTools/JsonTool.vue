<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.jsonTool.title') }}</h1>
        <div class="divider-tool"></div>
        <p>{{ t('toolsConvert.jsonTool.description') }}</p>

        <!-- 标签页：格式化 / 压缩 / 转义·去转义 -->
        <div class="div-style-display-row tab-row">
            <button
                v-for="tab in tabs"
                :key="tab"
                class="tab-btn"
                :class="{ 'tab-btn-active': activeTab === tab }"
                @click="switchTab(tab)"
            >
                {{ t(`toolsConvert.jsonTool.${tab}`) }}
            </button>
        </div>

        <!-- 输入区 -->
        <textarea
            v-model="inputText"
            class="tool-textarea"
            :placeholder="t('toolsConvert.jsonTool.inputPlaceholder')"
        ></textarea>

        <!-- 操作按钮 -->
        <div class="div-style-display-row btn-row">
            <button v-if="activeTab === 'tabFormat'" class="tool-btn" @click="runFormat">
                {{ t('toolsConvert.jsonTool.formatButton') }}
            </button>
            <button v-else-if="activeTab === 'tabMinify'" class="tool-btn" @click="runMinify">
                {{ t('toolsConvert.jsonTool.minifyButton') }}
            </button>
            <template v-else>
                <button class="tool-btn" @click="runEscape">
                    {{ t('toolsConvert.jsonTool.escapeButton') }}
                </button>
                <button class="tool-btn" @click="runUnescape">
                    {{ t('toolsConvert.jsonTool.unescapeButton') }}
                </button>
            </template>
        </div>

        <!-- 错误提示（解析失败含位置） -->
        <div v-if="errorMessage" class="error-box">
            {{ t('toolsConvert.jsonTool.errorPrefix') }} {{ errorMessage }}
        </div>

        <!-- 输出区 -->
        <textarea
            v-model="outputText"
            class="tool-textarea"
            readonly
            :placeholder="t('toolsConvert.jsonTool.outputPlaceholder')"
        ></textarea>

        <div class="div-style-display-row btn-row">
            <button class="tool-btn" @click="copyOutput">
                {{ t('toolsConvert.jsonTool.copyButton') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../../../common/i18n'
import { copyTextToClipboard } from '../../../common/clipboard'
import { formatJson, minifyJson, escapeJson, unescapeJson } from './json-tool-lib'

// 编辑器宽度（由宿主 PluginTools 传入）
const props = defineProps({
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const tabs = ['tabFormat', 'tabMinify', 'tabEscape'] as const
type TabKey = (typeof tabs)[number]

const activeTab = ref<TabKey>('tabFormat')
const inputText = ref('')
const outputText = ref('')
const errorMessage = ref('')

/** 切换标签页并清空错误 */
function switchTab(tab: TabKey) {
    activeTab.value = tab
    errorMessage.value = ''
}

/** 统一执行入口：捕获异常写入错误提示 */
function run(action: () => string) {
    errorMessage.value = ''
    try {
        outputText.value = action()
    } catch (error) {
        errorMessage.value = error instanceof Error ? error.message : String(error)
    }
}

/** 格式化：JSON.parse 校验 + 2 空格缩进 */
function runFormat() {
    run(() => formatJson(inputText.value))
}

/** 压缩：JSON.parse 校验 + 无空格 stringify */
function runMinify() {
    run(() => minifyJson(inputText.value))
}

/** 转义 */
function runEscape() {
    run(() => escapeJson(inputText.value))
}

/** 去转义 */
function runUnescape() {
    run(() => unescapeJson(inputText.value))
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
