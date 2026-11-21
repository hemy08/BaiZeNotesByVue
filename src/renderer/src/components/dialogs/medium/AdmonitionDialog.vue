<template>
    <!--
        C-2 迁移：regular（40px 标题栏 / 14px 标题）+ rounded（32px 圆角关闭按钮）+ 650px 宽度。
        底栏与 BaseDialog 默认一致（15px 20px / gap10 / 右对齐 / 顶部边框 / var(--card-bg)），
        故无需 footerStyle；遮罩、容器底色/圆角/阴影、0.2s 动画同默认壳。
    -->
    <BaseDialog
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
                        {{ type.icon }}
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

const admonitionTypes = [
    { id: 'note', name: 'Note', icon: '📝', color: '#667eea' },
    { id: 'tip', name: 'Tip', icon: '💡', color: '#48bb78' },
    { id: 'warning', name: 'Warning', icon: '⚠️', color: '#ed8936' },
    { id: 'danger', name: 'Danger', icon: '⛔', color: '#f56565' },
    { id: 'info', name: 'Info', icon: 'ℹ️', color: '#4299e1' },
    { id: 'abstract', name: 'Abstract', icon: '📋', color: '#667eea' },
    { id: 'todo', name: 'Todo', icon: '✅', color: '#48bb78' },
    { id: 'success', name: 'Success', icon: '🎉', color: '#48bb78' },
    { id: 'question', name: 'Question', icon: '❓', color: '#4299e1' },
    { id: 'bug', name: 'Bug', icon: '🐛', color: '#f56565' },
    { id: 'example', name: 'Example', icon: '📖', color: '#667eea' },
    { id: 'quote', name: 'Quote', icon: '💬', color: '#718096' }
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
    font-size: 20px;
    color: #fff;
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
