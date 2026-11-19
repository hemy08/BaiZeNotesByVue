<template>
    <!--
        C-2 迁移：regular（40px 标题栏 / 14px 标题）+ rounded（32px 圆角关闭按钮）+ 530px 宽度；
        迁移前无 footer（取消/插入按钮在正文 .content 内），故不提供 footer 插槽；
        迁移前标题额外声明 letter-spacing: 0.5px，用 BaseDialog 的 titleTextStyle 内联覆盖还原。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.mdSheet.title')"
        title-bar-variant="regular"
        close-button-variant="rounded"
        width="530px"
        :title-text-style="titleTextStyle"
        @close="handleCancel"
    >
        <div class="content">
            <div class="left-right-container">
                <div class="left-section">
                    <div class="input-group">
                        <label class="label-style">{{ t('dialogRenderer.mdSheet.rows') }}</label>
                        <input
                            v-model.number="sheetStyle.row"
                            type="number"
                            min="1"
                            class="input-style"
                        />
                    </div>
                    <div class="input-group">
                        <label class="label-style">{{ t('dialogRenderer.mdSheet.cols') }}</label>
                        <input
                            v-model.number="sheetStyle.col"
                            type="number"
                            min="1"
                            class="input-style"
                        />
                    </div>
                </div>

                <div class="right-section">
                    <div class="checkbox-list">
                        <label
                            v-for="option in alignOptions"
                            :key="option.value"
                            :class="{ active: sheetStyle.align === option.value }"
                        >
                            <input v-model="sheetStyle.align" type="radio" :value="option.value" />
                            {{ t(option.labelKey) }}
                        </label>
                    </div>
                </div>
            </div>

            <div class="btn-style">
                <button class="btn" @click="handleCancel">
                    {{ t('common.cancel') }}
                </button>
                <button class="btn btn-primary" @click="handleInsert">
                    {{ t('dialogRenderer.common.insert') }}
                </button>
            </div>
        </div>
    </BaseDialog>
</template>

<script setup lang="ts">
import { reactive } from 'vue'
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    visible: boolean
}

// 迁移前不重置拖拽位置（useDialogDrag 未调用 resetPosition），与 BaseDialog 默认 false 等价。
defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'insert', markdown: string): void
}>()

// 迁移前 .title-text 额外声明 letter-spacing: 0.5px（其余标题样式由 regular 变体承载）。
const titleTextStyle: CSSProperties = { letterSpacing: '0.5px' }

const sheetStyle = reactive({
    row: 3,
    col: 3,
    align: 'default' as 'default' | 'left' | 'center' | 'right'
})

const alignOptions = [
    { value: 'default' as const, labelKey: 'dialogRenderer.mdSheet.alignDefault' },
    { value: 'left' as const, labelKey: 'dialogRenderer.mdSheet.alignLeft' },
    { value: 'center' as const, labelKey: 'dialogRenderer.mdSheet.alignCenter' },
    { value: 'right' as const, labelKey: 'dialogRenderer.mdSheet.alignRight' }
]

const alignMaps = {
    default: ' --- |',
    left: ' :-- |',
    center: ' :--: |',
    right: ' --: |'
}

function generateMarkdown(): string {
    let rowContent = '|'
    let titleContent = '|'

    for (let i = 0; i < sheetStyle.col; i++) {
        rowContent += ' ' + t('dialogRenderer.mdSheet.columnLabel', { index: i + 1 }) + ' |'
        titleContent += alignMaps[sheetStyle.align]
    }

    rowContent += '\n'
    titleContent += '\n'

    let inputSheet = rowContent + titleContent
    for (let i = 0; i < sheetStyle.row; i++) {
        inputSheet += rowContent
    }

    return inputSheet
}

function handleCancel() {
    emit('close')
}

function handleInsert() {
    const markdown = generateMarkdown()
    emit('insert', markdown)
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/过渡动画）已抽到 BaseDialog；
   这里只保留正文与按钮样式。 */
.content {
    flex: 1;
    padding: 24px 28px;
    display: flex;
    flex-direction: column;
}

.left-right-container {
    display: flex;
    flex-direction: row;
    gap: 40px;
    align-items: flex-start;
    margin-bottom: 24px;
}

.left-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.input-group {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
}

.label-style {
    min-width: 60px;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 500;
}

.input-style {
    width: 120px;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 10px 14px;
    color: var(--text-color);
    font-size: 13px;
    transition: all 0.2s;
}

.input-style:focus {
    border-color: var(--accent-color);
    outline: none;
    box-shadow: 0 0 0 3px rgba(100, 150, 255, 0.1);
}

.right-section {
    flex: 1;
}

.checkbox-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px 20px;
}

.checkbox-list label {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    padding: 8px 12px;
    border-radius: 6px;
    transition: all 0.2s;
    color: var(--text-color);
    font-size: 13px;
}

.checkbox-list label:hover {
    color: var(--accent-color);
}

.checkbox-list label.active {
    background: rgba(102, 126, 234, 0.1);
    color: var(--accent-color);
}

.checkbox-list input[type='radio'] {
    accent-color: var(--accent-color);
    width: 16px;
    height: 16px;
    cursor: pointer;
}

.btn-style {
    width: 100%;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 60px;
}

.btn {
    padding: 10px 24px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--card-bg);
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
}

.btn:hover {
    background: var(--hover-bg);
    border-color: var(--accent-color);
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.btn:active {
    transform: translateY(0);
}

.btn-primary {
    background: var(--accent-color);
    color: #fff;
    border-color: var(--accent-color);
}

.btn-primary:hover {
    background: var(--accent-color);
    opacity: 0.9;
}
</style>
