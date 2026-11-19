<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.regexTester.title') }}</h1>
        <div class="divider-tool"></div>
        <p>{{ t('toolsConvert.regexTester.description') }}</p>

        <!-- 表达式与标志 -->
        <div class="div-style-display-row field-row">
            <label class="field-label">{{ t('toolsConvert.regexTester.patternLabel') }}</label>
            <input v-model="patternText" class="field-input mono" type="text" />
        </div>
        <div class="div-style-display-row field-row">
            <label class="field-label">{{ t('toolsConvert.regexTester.flagsLabel') }}</label>
            <label v-for="flag in flagList" :key="flag" class="flag-option">
                <input
                    v-model="selectedFlags"
                    type="checkbox"
                    :value="flag"
                    :disabled="isFlagDisabled(flag)"
                    @change="onFlagChange"
                />
                <span>{{ flag }}</span>
            </label>
        </div>

        <!-- 测试文本 -->
        <div class="div-style-display-row field-row">
            <label class="field-label">{{ t('toolsConvert.regexTester.inputLabel') }}</label>
            <textarea v-model="inputText" class="field-textarea mono"></textarea>
        </div>

        <!-- 替换模板 -->
        <div class="div-style-display-row field-row">
            <label class="field-label">{{ t('toolsConvert.regexTester.replacementLabel') }}</label>
            <input v-model="replacementText" class="field-input mono" type="text" />
        </div>

        <!-- 操作按钮 -->
        <div class="div-style-display-row btn-row">
            <button class="tool-btn" :disabled="running" @click="runTest">
                {{ t('toolsConvert.regexTester.testButton') }}
            </button>
            <button class="tool-btn" :disabled="running" @click="runReplace">
                {{ t('toolsConvert.regexTester.replaceButton') }}
            </button>
        </div>

        <!-- 提示与错误 -->
        <div v-if="running" class="notice-box">{{ t('toolsConvert.regexTester.running') }}</div>
        <div v-else-if="noticeMessage" class="notice-box">{{ noticeMessage }}</div>
        <div v-if="errorMessage" class="error-box">
            {{ t('toolsConvert.regexTester.errorPrefix') }} {{ errorMessage }}
        </div>

        <!-- 替换结果 -->
        <div v-if="replaceOutput !== ''" class="result-panel">
            <div class="result-label">{{ t('toolsConvert.regexTester.replaceOutputLabel') }}</div>
            <textarea v-model="replaceOutput" class="field-textarea mono" readonly></textarea>
        </div>

        <!-- 匹配列表 -->
        <div v-if="matches.length > 0" class="result-panel">
            <div class="result-label">
                {{ t('toolsConvert.regexTester.matchCount') }}: {{ matches.length }}
            </div>
            <div class="match-list">
                <div v-for="(item, index) in matches" :key="index" class="match-item">
                    <span class="match-index">#{{ index + 1 }} @{{ item.index }}</span>
                    <span class="match-value">{{
                        item.match === '' ? t('toolsConvert.regexTester.emptyMatch') : item.match
                    }}</span>
                    <span v-if="item.groups.some((g) => g !== undefined)" class="match-groups">
                        [
                        <span v-for="(g, gi) in item.groups" :key="gi">
                            {{ gi > 0 ? ', ' : '' }}<i v-if="g === undefined">∅</i
                            ><i v-else>{{ g }}</i>
                        </span>
                        ]
                    </span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onUnmounted, ref } from 'vue'
import { t } from '../../../common/i18n'
import {
    runRegex,
    substituteReplace,
    disposeRegexRunner,
    MAX_MATCHES,
    RegexTimeoutError,
    type RegexMatch
} from './regex-lib'

// 编辑器宽度（由宿主 PluginTools 传入）
const props = defineProps({
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

/** 支持的 JS 标志全集（u/v 互斥） */
const flagList = ['d', 'g', 'i', 'm', 's', 'u', 'v', 'y'] as const

const patternText = ref('')
const selectedFlags = ref<string[]>(['g'])
const inputText = ref('')
const replacementText = ref('')
const matches = ref<RegexMatch[]>([])
const replaceOutput = ref('')
const errorMessage = ref('')
const noticeMessage = ref('')
/** 匹配执行中（Worker 在途）：显示「匹配中」并禁用操作按钮 */
const running = ref(false)

/** u/v 互斥：另一标志已启用时禁用当前项 */
function isFlagDisabled(flag: string): boolean {
    if (flag === 'u') return selectedFlags.value.includes('v')
    if (flag === 'v') return selectedFlags.value.includes('u')
    return false
}

/** 勾选变化：u/v 不能同时启用（给出提示并自动纠偏，保留最新勾选的一项） */
function onFlagChange() {
    noticeMessage.value = ''
    const hasU = selectedFlags.value.includes('u')
    const hasV = selectedFlags.value.includes('v')
    if (hasU && hasV) {
        // 数组位置更靠后的是最新勾选的，保留它；移除另一项
        const keepLatest =
            selectedFlags.value.indexOf('u') > selectedFlags.value.indexOf('v') ? 'u' : 'v'
        selectedFlags.value = selectedFlags.value.filter(
            (f) => f === keepLatest || (f !== 'u' && f !== 'v')
        )
        noticeMessage.value = t('toolsConvert.regexTester.uvExclusive')
    }
}

/** 组装 flags 字符串（按标志位顺序拼接） */
function buildFlags(): string {
    return selectedFlags.value.join('')
}

/** 执行匹配：后台 Worker 运行，捕获错误 / 超时与截断提示 */
async function runTest() {
    if (running.value) return
    clearMessages()
    matches.value = []
    running.value = true
    try {
        const result = await runRegex(patternText.value, buildFlags(), inputText.value)
        matches.value = result
        if (result.truncated || result.length >= MAX_MATCHES) {
            noticeMessage.value = t('toolsConvert.regexTester.truncated')
        }
    } catch (error) {
        matches.value = []
        errorMessage.value = describeRunError(error)
    } finally {
        running.value = false
    }
}

/** 执行替换：后台 Worker 匹配，再用自写 substitute 展开替换模板 */
async function runReplace() {
    if (running.value) return
    clearMessages()
    replaceOutput.value = ''
    running.value = true
    try {
        const result = await runRegex(patternText.value, buildFlags(), inputText.value)
        matches.value = result
        replaceOutput.value = substituteReplace(inputText.value, replacementText.value, result)
        if (result.truncated || result.length >= MAX_MATCHES) {
            noticeMessage.value = t('toolsConvert.regexTester.truncated')
        }
    } catch (error) {
        matches.value = []
        errorMessage.value = describeRunError(error)
    } finally {
        running.value = false
    }
}

/** 运行错误转用户提示：超时走 i18n 词条，其余显示原始中文信息 */
function describeRunError(error: unknown): string {
    if (error instanceof RegexTimeoutError) {
        return t('toolsConvert.regexTester.timeout')
    }
    return error instanceof Error ? error.message : String(error)
}

/** 清空提示与错误 */
function clearMessages() {
    errorMessage.value = ''
    noticeMessage.value = ''
}

// 卸载时释放常驻 Worker（避免后台线程随路由切换而常驻）
onUnmounted(() => {
    disposeRegexRunner()
})
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.field-row {
    margin-top: 10px;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
}

.field-label {
    flex: none;
    width: 110px;
}

.field-input {
    flex: 1;
    min-width: 220px;
    padding: 5px 8px;
}

.field-textarea {
    flex: 1;
    min-width: 220px;
    min-height: 120px;
    resize: vertical;
}

.mono {
    font-family: monospace;
}

.flag-option {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    color: var(--theme-text-color);
    cursor: pointer;
}

.btn-row {
    margin-top: 12px;
    gap: 12px;
}

.notice-box {
    margin-top: 10px;
    padding: 8px 12px;
    background-color: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 4px;
    color: var(--theme-secondary-text-color);
}

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

.result-panel {
    margin-top: 14px;
}

.result-label {
    color: var(--theme-secondary-text-color);
    margin-bottom: 6px;
}

.match-list {
    max-height: 320px;
    overflow: auto;
    border: 1px solid var(--theme-border-color);
    border-radius: 4px;
    font-family: monospace;
    font-size: 13px;
}

.match-item {
    display: flex;
    gap: 10px;
    padding: 3px 8px;
    border-bottom: 1px solid var(--theme-border-color);
    word-break: break-all;
}

.match-index {
    flex: none;
    color: var(--theme-secondary-text-color);
}

.match-value {
    flex: none;
    color: var(--theme-accent-color);
}

.match-groups {
    color: var(--theme-secondary-text-color);
}
</style>
