<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.calculator.title') }}</h1>
        <div class="divider" style="height: 2px"></div>
        <p>{{ t('toolsConvert.calculator.description') }}</p>

        <div class="calculator">
            <!-- 表达式/结果显示区 -->
            <div class="display" data-testid="calc-display">{{ display }}</div>

            <!-- 按键区 -->
            <div class="keys">
                <button class="key key-clear" @click="clearAll">
                    {{ t('toolsConvert.calculator.clear') }}
                </button>
                <button class="key key-clear" @click="backspace">
                    {{ t('toolsConvert.calculator.backspace') }}
                </button>

                <template v-for="row in keyRows" :key="row.join('')">
                    <button
                        v-for="key in row"
                        :key="key"
                        class="key"
                        :class="{ 'key-op': isOperator(key), 'key-equal': key === '=' }"
                        @click="pressKey(key)"
                    >
                        {{ keyLabel(key) }}
                    </button>
                </template>
            </div>

            <p v-if="errorMessage" class="error-text">{{ errorMessage }}</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { t } from '../../../common/i18n'
import { evaluateExpression } from './calculator-lib'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const display = ref('')
const errorMessage = ref('')

/** 按键布局（含运算符与等号，显示名映射在 keyLabel 中） */
const keyRows: readonly (readonly string[])[] = [
    ['7', '8', '9', '/'],
    ['4', '5', '6', '*'],
    ['1', '2', '3', '-'],
    ['0', '.', '(', ')'],
    ['%', '^', '+', '=']
]

/** 是否运算符键（用于样式高亮） */
function isOperator(key: string): boolean {
    return ['/', '*', '-', '+', '%', '^'].includes(key)
}

/** 按键显示名（×÷ 等视觉符号与表达式字符的映射） */
function keyLabel(key: string): string {
    switch (key) {
        case '*':
            return '×'
        case '/':
            return '÷'
        case '=':
            return t('toolsConvert.calculator.equal')
        default:
            return key
    }
}

/** 按下按键：等号求值，其余追加到表达式 */
function pressKey(key: string): void {
    if (key === '=') {
        evaluate()
        return
    }
    append(key)
}

/** 追加按键内容到表达式（限制总长度防止输入过大） */
function append(char: string): void {
    if (errorMessage.value) errorMessage.value = ''
    if (display.value.length >= 200) return
    display.value += char
}

/** 清空全部 */
function clearAll(): void {
    display.value = ''
    errorMessage.value = ''
}

/** 退格删除最后一个字符 */
function backspace(): void {
    display.value = display.value.slice(0, -1)
}

/** 求值：结果作为新的表达式起点，支持连续运算 */
function evaluate(): void {
    if (display.value.trim() === '') return
    try {
        const result = evaluateExpression(display.value)
        // 展示为可继续运算的数值（限制精度到 12 位有效数字，避免长尾小数）
        display.value = String(Number(result.toPrecision(12)))
        errorMessage.value = ''
    } catch (error) {
        errorMessage.value = String(error)
    }
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';

.calculator {
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-width: 320px;
    margin: 10px auto;
}

.display {
    min-height: 52px;
    padding: 8px 12px;
    background-color: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 22px;
    text-align: right;
    word-break: break-all;
    line-height: 36px;
}

.keys {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
}

.key {
    padding: 12px 0;
    border-width: 1px;
    border-style: solid;
    border-radius: 6px;
    font-size: 18px;
    cursor: pointer;
}

.key-op {
    color: var(--theme-accent-color);
}

.key-clear {
    grid-column: span 2;
}

.key-equal {
    background-color: var(--theme-accent-color);
    color: var(--theme-button-text-color);
    border-color: var(--theme-accent-color);
}

.error-text {
    color: var(--theme-accent-color);
    margin: 0;
}
</style>
