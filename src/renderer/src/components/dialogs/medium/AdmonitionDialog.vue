<template>
    <!--
        C-2 迁移：regular（40px 标题栏 / 14px 标题）+ rounded（32px 圆角关闭按钮）+ 650px 宽度。
        底栏与 BaseDialog 默认一致（15px 20px / gap10 / 右对齐 / 顶部边框 / var(--card-bg)），
        故无需 footerStyle；遮罩、容器底色/圆角/阴影、0.2s 动画同默认壳。
    -->
    <BaseDialog
        tool-window
        :visible="visible"
        :title="t('dialogRenderer.admonition.title')"
        title-bar-variant="regular"
        close-button-variant="rounded"
        width="650px"
        @close="handleCancel"
    >
        <div class="content">
            <div class="type-grid">
                <div
                    v-for="type in admonitionTypes"
                    :key="type.id"
                    class="type-card"
                    :class="{ selected: selectedType === type.id }"
                    @click="selectedType = type.id"
                >
                    <div class="type-icon" :style="{ backgroundColor: type.color }">
                        <!-- MDI fill 型图标：24 网格 / currentColor（父级 color: #fff）；装饰性，可访问名由 type-name 承载 -->
                        <svg
                            class="type-icon-svg"
                            viewBox="0 0 24 24"
                            width="20"
                            height="20"
                            fill="currentColor"
                            aria-hidden="true"
                            focusable="false"
                        >
                            <path :d="ADMONITION_ICON_PATHS[type.id]" />
                        </svg>
                    </div>
                    <div class="type-name">{{ type.name }}</div>
                </div>
            </div>

            <div class="input-group">
                <label class="input-label">{{ t('dialogRenderer.common.titleLabel') }}</label>
                <input
                    v-model="title"
                    type="text"
                    class="text-input"
                    :placeholder="t('dialogRenderer.admonition.titlePlaceholder')"
                />
            </div>

            <div class="input-group">
                <label class="input-label">{{ t('dialogRenderer.common.content') }}</label>
                <textarea
                    v-model="content"
                    class="textarea-input"
                    :placeholder="t('dialogRenderer.admonition.contentPlaceholder')"
                ></textarea>
            </div>

            <div class="preview-section">
                <label class="preview-label">{{ t('dialogRenderer.common.preview') }}</label>
                <div
                    class="preview-card"
                    :style="{
                        backgroundColor: previewColor + '15',
                        borderLeftColor: previewColor
                    }"
                >
                    <div v-if="title" class="preview-title" :style="{ color: previewColor }">
                        {{ title || selectedTypeName }}
                    </div>
                    <div class="preview-content">
                        {{ content || t('dialogRenderer.admonition.contentFallback') }}
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <button class="dialog-btn dialog-btn--secondary btn btn-cancel" @click="handleCancel">
                {{ t('common.cancel') }}
            </button>
            <button class="dialog-btn dialog-btn--primary btn btn-confirm" @click="handleInsert">
                {{ t('dialogRenderer.common.insert') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
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

const selectedType = ref('note')
const title = ref('')
const content = ref('')

const selectedTypeName = computed(
    () => admonitionTypes.find((t) => t.id === selectedType.value)?.name || ''
)

/**
 * Admonition 类型图标（P2 T14 遗留项 5）：12 个 emoji 功能图标 → MDI fill 型 SVG。
 *
 * - 数据来自项目 MDI 子集 `components/Markdown/mdi-icons-data.ts`（上游 `@mdi/js` 7.4.47，
 *   Apache-2.0 / MIT），此处只内联本对话框所需的 12 条 path，不整包 import 图标数据，
 *   避免把 95KB 图标库打进懒加载对话框 chunk；
 * - fill 型图形库与「24 网格 / stroke 1.5 / currentColor」线框功能图标并存的口径见
 *   `docs/design/COMPONENTS.md` §8；
 * - 语义对照：note→pencil-outline、tip→lightbulb-on、warning→alert-circle-outline、
 *   danger→close-circle-outline、info→information-outline、abstract→clipboard-outline、
 *   todo→calendar-check、success→check-circle、question→help-circle-outline、
 *   bug→bug-outline、example→book-open-variant、quote→comment-outline。
 */
const ADMONITION_ICON_PATHS = {
    note: 'M14.06,9L15,9.94L5.92,19H5V18.08L14.06,9M17.66,3C17.41,3 17.15,3.1 16.96,3.29L15.13,5.12L18.88,8.87L20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18.17,3.09 17.92,3 17.66,3M14.06,6.19L3,17.25V21H6.75L17.81,9.94L14.06,6.19Z',
    tip: 'M12,6A6,6 0 0,1 18,12C18,14.22 16.79,16.16 15,17.2V19A1,1 0 0,1 14,20H10A1,1 0 0,1 9,19V17.2C7.21,16.16 6,14.22 6,12A6,6 0 0,1 12,6M14,21V22A1,1 0 0,1 13,23H11A1,1 0 0,1 10,22V21H14M20,11H23V13H20V11M1,11H4V13H1V11M13,1V4H11V1H13M4.92,3.5L7.05,5.64L5.63,7.05L3.5,4.93L4.92,3.5M16.95,5.63L19.07,3.5L20.5,4.93L18.37,7.05L16.95,5.63Z',
    warning:
        'M11,15H13V17H11V15M11,7H13V13H11V7M12,2C6.47,2 2,6.5 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20Z',
    danger: 'M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2C6.47,2 2,6.47 2,12C2,17.53 6.47,22 12,22C17.53,22 22,17.53 22,12C22,6.47 17.53,2 12,2M14.59,8L12,10.59L9.41,8L8,9.41L10.59,12L8,14.59L9.41,16L12,13.41L14.59,16L16,14.59L13.41,12L16,9.41L14.59,8Z',
    info: 'M11,9H13V7H11M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M11,17H13V11H11V17Z',
    abstract:
        'M19,3H14.82C14.4,1.84 13.3,1 12,1C10.7,1 9.6,1.84 9.18,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M12,3A1,1 0 0,1 13,4A1,1 0 0,1 12,5A1,1 0 0,1 11,4A1,1 0 0,1 12,3M7,7H17V5H19V19H5V5H7V7Z',
    todo: 'M19,19H5V8H19M19,3H18V1H16V3H8V1H6V3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M16.53,11.06L15.47,10L10.59,14.88L8.47,12.76L7.41,13.82L10.59,17L16.53,11.06Z',
    success:
        'M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z',
    question:
        'M11,18H13V16H11V18M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,20C7.59,20 4,16.41 4,12C4,7.59 7.59,4 12,4C16.41,4 20,7.59 20,12C20,16.41 16.41,20 12,20M12,6A4,4 0 0,0 8,10H10A2,2 0 0,1 12,8A2,2 0 0,1 14,10C14,12 11,11.75 11,15H13C13,12.75 16,12.5 16,10A4,4 0 0,0 12,6Z',
    bug: 'M20,8H17.19C16.74,7.2 16.12,6.5 15.37,6L17,4.41L15.59,3L13.42,5.17C12.96,5.06 12.5,5 12,5C11.5,5 11.05,5.06 10.59,5.17L8.41,3L7,4.41L8.62,6C7.87,6.5 7.26,7.21 6.81,8H4V10H6.09C6.03,10.33 6,10.66 6,11V12H4V14H6V15C6,15.34 6.03,15.67 6.09,16H4V18H6.81C8.47,20.87 12.14,21.84 15,20.18C15.91,19.66 16.67,18.9 17.19,18H20V16H17.91C17.97,15.67 18,15.34 18,15V14H20V12H18V11C18,10.66 17.97,10.33 17.91,10H20V8M16,15A4,4 0 0,1 12,19A4,4 0 0,1 8,15V11A4,4 0 0,1 12,7A4,4 0 0,1 16,11V15M14,10V12H10V10H14M10,14H14V16H10V14Z',
    example:
        'M12 21.5C10.65 20.65 8.2 20 6.5 20C4.85 20 3.15 20.3 1.75 21.05C1.65 21.1 1.6 21.1 1.5 21.1C1.25 21.1 1 20.85 1 20.6V6C1.6 5.55 2.25 5.25 3 5C4.11 4.65 5.33 4.5 6.5 4.5C8.45 4.5 10.55 4.9 12 6C13.45 4.9 15.55 4.5 17.5 4.5C18.67 4.5 19.89 4.65 21 5C21.75 5.25 22.4 5.55 23 6V20.6C23 20.85 22.75 21.1 22.5 21.1C22.4 21.1 22.35 21.1 22.25 21.05C20.85 20.3 19.15 20 17.5 20C15.8 20 13.35 20.65 12 21.5M12 8V19.5C13.35 18.65 15.8 18 17.5 18C18.7 18 19.9 18.15 21 18.5V7C19.9 6.65 18.7 6.5 17.5 6.5C15.8 6.5 13.35 7.15 12 8M13 11.5C14.11 10.82 15.6 10.5 17.5 10.5C18.41 10.5 19.26 10.59 20 10.78V9.23C19.13 9.08 18.29 9 17.5 9C15.73 9 14.23 9.28 13 9.84V11.5M17.5 11.67C15.79 11.67 14.29 11.93 13 12.46V14.15C14.11 13.5 15.6 13.16 17.5 13.16C18.54 13.16 19.38 13.24 20 13.4V11.9C19.13 11.74 18.29 11.67 17.5 11.67M20 14.57C19.13 14.41 18.29 14.33 17.5 14.33C15.67 14.33 14.17 14.6 13 15.13V16.82C14.11 16.16 15.6 15.83 17.5 15.83C18.54 15.83 19.38 15.91 20 16.07V14.57Z',
    quote: 'M9,22A1,1 0 0,1 8,21V18H4A2,2 0 0,1 2,16V4C2,2.89 2.9,2 4,2H20A2,2 0 0,1 22,4V16A2,2 0 0,1 20,18H13.9L10.2,21.71C10,21.9 9.75,22 9.5,22V22H9M10,16V19.08L13.08,16H20V4H4V16H10Z'
} as const

type AdmonitionTypeId = keyof typeof ADMONITION_ICON_PATHS

interface AdmonitionType {
    id: AdmonitionTypeId
    name: string
    color: string
}

const admonitionTypes: AdmonitionType[] = [
    { id: 'note', name: 'Note', color: '#667eea' },
    { id: 'tip', name: 'Tip', color: '#48bb78' },
    { id: 'warning', name: 'Warning', color: '#ed8936' },
    { id: 'danger', name: 'Danger', color: '#f56565' },
    { id: 'info', name: 'Info', color: '#4299e1' },
    { id: 'abstract', name: 'Abstract', color: '#667eea' },
    { id: 'todo', name: 'Todo', color: '#48bb78' },
    { id: 'success', name: 'Success', color: '#48bb78' },
    { id: 'question', name: 'Question', color: '#4299e1' },
    { id: 'bug', name: 'Bug', color: '#f56565' },
    { id: 'example', name: 'Example', color: '#667eea' },
    { id: 'quote', name: 'Quote', color: '#718096' }
]

const previewColor = computed(() => {
    return admonitionTypes.find((t) => t.id === selectedType.value)?.color || '#667eea'
})

function handleCancel() {
    emit('close')
}

function handleInsert() {
    let markdown = '!!! ' + selectedType.value
    if (title.value) {
        markdown += ' "' + title.value + '"'
    }
    markdown += '\n'

    if (content.value) {
        markdown += '    ' + content.value + '\n'
    } else {
        markdown += t('dialogRenderer.admonition.defaultContent') + '\n'
    }

    emit('insert', markdown)
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/footer/过渡动画）已抽到 BaseDialog；
   底栏按钮视觉见全局 assets/dialog-buttons.css（模板类 dialog-btn dialog-btn--*），
   这里只保留正文、表单与预览样式。 */
.content {
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
}

.type-grid {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 12px;
}

.type-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 12px 8px;
    border: 2px solid var(--border-color);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    background: var(--card-bg);
}

.type-card:hover {
    border-color: var(--accent-color);
    transform: translateY(-2px);
}

.type-card.selected {
    border-color: var(--accent-color);
    background: rgba(102, 126, 234, 0.08);
}

.type-icon {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
}

/* MDI fill 型图标以父级 color 渲染（currentColor），尺寸固定 20×20 与替换前 emoji 字号一致 */
.type-icon-svg {
    display: block;
    flex-shrink: 0;
}

.type-name {
    font-size: 12px;
    color: var(--text-color);
    font-weight: 500;
}

.input-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.input-label {
    font-size: 13px;
    color: var(--text-color);
    font-weight: 500;
}

.text-input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--card-bg);
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
}

.textarea-input {
    width: 100%;
    min-height: 100px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--card-bg);
    outline: none;
    resize: vertical;
    transition: border-color 0.2s;
    box-sizing: border-box;
}

.text-input:focus,
.textarea-input:focus {
    border-color: var(--accent-color);
}

.preview-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.preview-label {
    font-size: 13px;
    color: var(--text-color);
    font-weight: 500;
}

.preview-card {
    border-left: 4px solid;
    border-radius: 4px;
    padding: 12px 16px;
}

.preview-title {
    font-weight: 600;
    margin-bottom: 8px;
    font-size: 14px;
}

.preview-content {
    font-size: 13px;
    color: var(--text-color);
}
</style>
