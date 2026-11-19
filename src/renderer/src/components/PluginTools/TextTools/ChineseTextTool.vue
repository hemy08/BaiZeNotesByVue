<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.chineseText.title') }}</h1>
        <div class="divider-tool"></div>
        <p>{{ t('toolsConvert.chineseText.description') }}</p>

        <!-- 标签页切换：繁简互转 / 汉字转拼音 -->
        <div class="div-style-display-row tab-row">
            <button
                v-for="tab in tabs"
                :key="tab"
                class="tab-btn"
                :class="{ 'tab-btn-active': activeTab === tab }"
                @click="activeTab = tab"
            >
                {{ t(`toolsConvert.chineseText.${tab}`) }}
            </button>
        </div>

        <!-- 输入区 -->
        <textarea
            v-model="inputText"
            class="tool-textarea"
            :placeholder="t('toolsConvert.chineseText.inputPlaceholder')"
        ></textarea>

        <!-- 繁简互转操作区 -->
        <div v-if="activeTab === 'tabConvert'" class="div-style-display-row btn-row">
            <button class="tool-btn" @click="runConvert('toTraditional')">
                {{ t('toolsConvert.chineseText.toTraditional') }}
            </button>
            <button class="tool-btn" @click="runConvert('toSimplified')">
                {{ t('toolsConvert.chineseText.toSimplified') }}
            </button>
        </div>

        <!-- 汉字转拼音操作区 -->
        <div v-else class="div-style-display-row btn-row">
            <button class="tool-btn" @click="runConvert('toPinyin')">
                {{ t('toolsConvert.chineseText.toPinyin') }}
            </button>
            <button class="tool-btn" @click="runConvert('toFirstLetter')">
                {{ t('toolsConvert.chineseText.toFirstLetter') }}
            </button>
        </div>

        <!-- 输出区 -->
        <textarea
            v-model="outputText"
            class="tool-textarea"
            readonly
            :placeholder="t('toolsConvert.chineseText.outputPlaceholder')"
        ></textarea>

        <div class="div-style-display-row btn-row">
            <button class="tool-btn" @click="copyOutput">
                {{ t('toolsConvert.chineseText.copyButton') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../../../common/i18n'
import { copyTextToClipboard } from '../../../common/clipboard'
import { toTraditional, toSimplified, getPinyin, getFirstLetter } from './chinese-lib'

// 编辑器宽度（由宿主 PluginTools 传入）
const props = defineProps({
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const tabs = ['tabConvert', 'tabPinyin'] as const
type TabKey = (typeof tabs)[number]

const activeTab = ref<TabKey>('tabConvert')
const inputText = ref('')
const outputText = ref('')

/** 执行转换：根据目标把输入写入输出区 */
function runConvert(target: 'toTraditional' | 'toSimplified' | 'toPinyin' | 'toFirstLetter') {
    const source = inputText.value
    if (target === 'toTraditional') {
        outputText.value = toTraditional(source)
    } else if (target === 'toSimplified') {
        outputText.value = toSimplified(source)
    } else if (target === 'toPinyin') {
        outputText.value = getPinyin(source)
    } else {
        outputText.value = getFirstLetter(source)
    }
}

/** 复制输出结果 */
function copyOutput() {
    void copyTextToClipboard(outputText.value)
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.tab-row {
    margin-top: 12px;
    gap: 8px;
}

.tab-btn {
    background-color: var(--theme-card-background);
    color: var(--theme-text-color);
    border: 1px solid var(--theme-border-color);
}

.tab-btn:hover {
    background-color: var(--theme-hover-background);
}

.tool-textarea {
    margin-top: 12px;
    min-height: 120px;
    font-family: inherit;
}

.btn-row {
    margin-top: 10px;
    gap: 12px;
}
</style>
