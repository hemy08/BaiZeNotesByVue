<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.textDiff.title') }}</h1>
        <div class="divider-tool"></div>
        <p>{{ t('toolsConvert.textDiff.description') }}</p>

        <!-- 左右输入区 -->
        <div class="input-panel">
            <div class="input-col">
                <div class="col-label">{{ t('toolsConvert.textDiff.originalLabel') }}</div>
                <textarea
                    v-model="leftText"
                    class="tool-textarea"
                    :placeholder="t('toolsConvert.textDiff.originalPlaceholder')"
                ></textarea>
            </div>
            <div class="input-col">
                <div class="col-label">{{ t('toolsConvert.textDiff.modifiedLabel') }}</div>
                <textarea
                    v-model="rightText"
                    class="tool-textarea"
                    :placeholder="t('toolsConvert.textDiff.modifiedPlaceholder')"
                ></textarea>
            </div>
        </div>

        <div class="div-style-display-row btn-row">
            <button class="tool-btn" @click="compare">
                {{ t('toolsConvert.textDiff.compareButton') }}
            </button>
        </div>

        <!-- 过大提示：仅显示两侧不同 -->
        <div v-if="tooLarge" class="notice-box">
            {{ t('toolsConvert.textDiff.tooLarge') }}
        </div>

        <!-- 比对结果：左右并排渲染，新增带 + 前缀、删除带 - 前缀 -->
        <div v-else-if="rows.length > 0" class="diff-grid">
            <div class="diff-header">
                <span>{{ t('toolsConvert.textDiff.originalLabel') }}</span>
                <span>{{ t('toolsConvert.textDiff.modifiedLabel') }}</span>
            </div>
            <div
                v-for="(row, index) in rows"
                :key="index"
                class="diff-row"
                :class="`diff-row-${row.type}`"
            >
                <div class="diff-cell">
                    <span class="diff-lineno">{{ row.leftLineNo ?? '' }}</span>
                    <span
                        v-if="row.type !== 'add'"
                        class="diff-mark"
                        :class="{ 'diff-mark-remove': row.type === 'remove' }"
                    >
                        {{ row.type === 'remove' ? '-' : ' ' }}
                    </span>
                    <span class="diff-line">{{ row.type !== 'add' ? row.line : '' }}</span>
                </div>
                <div class="diff-cell">
                    <span class="diff-lineno">{{ row.rightLineNo ?? '' }}</span>
                    <span
                        v-if="row.type !== 'remove'"
                        class="diff-mark"
                        :class="{ 'diff-mark-add': row.type === 'add' }"
                    >
                        {{ row.type === 'add' ? '+' : ' ' }}
                    </span>
                    <span class="diff-line">{{ row.type !== 'remove' ? row.line : '' }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { diffLines, DIFF_TOO_LARGE_MARK, type DiffLine } from './text-diff-lib'

// 编辑器宽度（由宿主 PluginTools 传入）
const props = defineProps({
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const leftText = ref('')
const rightText = ref('')
const diffResult = ref<DiffLine[]>([])
const tooLarge = ref(false)

/** 渲染行：附带左右行号，供并排展示 */
interface RenderRow {
    type: DiffLine['type']
    line: string
    leftLineNo?: number
    rightLineNo?: number
}

const rows = computed<RenderRow[]>(() => {
    const out: RenderRow[] = []
    let leftNo = 1
    let rightNo = 1
    for (const item of diffResult.value) {
        if (item.type === 'equal') {
            out.push({
                type: 'equal',
                line: item.line,
                leftLineNo: leftNo++,
                rightLineNo: rightNo++
            })
        } else if (item.type === 'remove') {
            out.push({ type: 'remove', line: item.line, leftLineNo: leftNo++ })
        } else {
            out.push({ type: 'add', line: item.line, rightLineNo: rightNo++ })
        }
    }
    return out
})

/** 执行比对；输入过大时仅提示"两侧不同" */
function compare() {
    tooLarge.value = false
    diffResult.value = []
    try {
        diffResult.value = diffLines(leftText.value, rightText.value)
    } catch (error) {
        if (error instanceof Error && error.message === DIFF_TOO_LARGE_MARK) {
            tooLarge.value = true
        }
    }
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.input-panel {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
    margin-top: 12px;
}

.input-col {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.col-label {
    color: var(--theme-secondary-text-color);
    font-size: 14px;
}

.tool-textarea {
    min-height: 140px;
    font-family: monospace;
}

.btn-row {
    margin-top: 12px;
    gap: 12px;
    justify-content: center;
}

.notice-box {
    margin-top: 16px;
    padding: 10px 14px;
    background-color: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 4px;
    color: var(--theme-secondary-text-color);
}

.diff-grid {
    margin-top: 16px;
    border: 1px solid var(--theme-border-color);
    border-radius: 4px;
    overflow: auto;
    font-family: monospace;
    font-size: 13px;
}

.diff-header {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background-color: var(--theme-card-background);
    color: var(--theme-secondary-text-color);
    border-bottom: 1px solid var(--theme-border-color);
}

.diff-header span {
    padding: 6px 8px;
    border-right: 1px solid var(--theme-border-color);
}

.diff-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: 1px solid var(--theme-border-color);
}

/* 颜色一律走主题变量：新增行用 hover 底色，删除行用边框底色，另以 + / - 符号标注 */
.diff-row-add .diff-cell {
    background-color: var(--theme-hover-background);
}

.diff-row-remove .diff-cell {
    background-color: var(--theme-card-background);
    color: var(--theme-secondary-text-color);
}

.diff-cell {
    display: flex;
    align-items: baseline;
    padding: 2px 8px;
    border-right: 1px solid var(--theme-border-color);
    white-space: pre-wrap;
    word-break: break-all;
}

.diff-lineno {
    flex: none;
    width: 3em;
    text-align: right;
    color: var(--theme-secondary-text-color);
    user-select: none;
}

.diff-mark {
    flex: none;
    width: 1.2em;
    font-weight: bold;
}

.diff-mark-add {
    color: var(--theme-accent-color);
}

.diff-mark-remove {
    color: var(--theme-accent-color);
}

.diff-line {
    flex: 1;
}
</style>
