<template>
    <Teleport to="body">
        <Transition name="dialog-fade">
            <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
                <Transition name="dialog-scale">
                    <div
                        v-if="visible"
                        class="dialog-container"
                        :style="dialogStyle"
                        @mousedown="onDialogMouseDown"
                    >
                        <div class="title-bar">
                            <span class="title-text">{{
                                t('dialogRenderer.mermaidEdit.title')
                            }}</span>
                            <button class="close-btn" @click.stop="handleClose">×</button>
                        </div>

                        <div class="main-container">
                            <div class="editor-section">
                                <div class="section-header">
                                    <h3>{{ t('dialogRenderer.mermaidEdit.definition') }}</h3>
                                    <div class="toolbar">
                                        <button class="tool-btn" @click="handleFormat">
                                            {{ t('dialogRenderer.common.format') }}
                                        </button>
                                        <button class="tool-btn" @click="handleClear">
                                            {{ t('dialogRenderer.common.clear') }}
                                        </button>
                                    </div>
                                </div>
                                <textarea
                                    v-model="mermaidCode"
                                    class="code-editor"
                                    :placeholder="t('dialogRenderer.mermaidEdit.codePlaceholder')"
                                    @input="updatePreview"
                                ></textarea>
                            </div>

                            <div class="preview-section">
                                <div class="section-header">
                                    <!-- FE-15：原「预览」文案会让用户误以为此处应渲染图形，实际本对话框是
                       源码预览（渲染在插入后由编辑器完成）。文案改为「源码预览」并附说明。
                       安全约束（task-17 / P1-CQ-2 / AS-3）：预览区保持 <pre> 文本插值，
                       严禁恢复 v-html；若未来要改为 SVG 渲染，必须 DOMPurify.sanitize
                       + mermaid.initialize({ securityLevel: 'strict' }) 并保留 XSS 回归测试。 -->
                                    <h3>{{ t('dialogRenderer.mermaidEdit.sourcePreview') }}</h3>
                                    <div class="toolbar">
                                        <select v-model="chartType" class="chart-select">
                                            <option value="graph">
                                                {{ t('dialogRenderer.mermaidEdit.chartGraph') }}
                                            </option>
                                            <option value="flowchart">flowchart</option>
                                            <option value="sequence">
                                                {{ t('dialogRenderer.mermaidEdit.chartSequence') }}
                                            </option>
                                            <option value="class">
                                                {{ t('dialogRenderer.mermaidEdit.chartClass') }}
                                            </option>
                                            <option value="state">
                                                {{ t('dialogRenderer.mermaidEdit.chartState') }}
                                            </option>
                                            <option value="er">
                                                {{ t('dialogRenderer.mermaidEdit.chartEr') }}
                                            </option>
                                            <option value="pie">
                                                {{ t('dialogRenderer.mermaidEdit.chartPie') }}
                                            </option>
                                            <option value="gantt">
                                                {{ t('dialogRenderer.mermaidEdit.chartGantt') }}
                                            </option>
                                        </select>
                                    </div>
                                </div>
                                <!-- P1-CQ-2 / AS-3：预览区改为纯文本渲染。
                     Mermaid 源码本身是纯文本而非 HTML，用文本插值（Vue 自动转义）
                     放入 <pre> 展示，从根上消除「用户输入拼 HTML 再注入 DOM」的 XSS 面。
                     注意：保留 .mermaid 类名以维持既有 DOM 选择器契约。 -->
                                <div class="preview-area">
                                    <!-- FE-15：UI 明确标注「仅源码预览」，避免用户误判预览功能损坏。 -->
                                    <p class="preview-hint">
                                        {{ t('dialogRenderer.mermaidEdit.sourcePreviewHint') }}
                                    </p>
                                    <p v-if="!previewCode" class="placeholder">
                                        {{ t('dialogRenderer.common.previewPlaceholder') }}
                                    </p>
                                    <pre v-else class="mermaid preview-code">{{ previewCode }}</pre>
                                </div>
                            </div>
                        </div>

                        <div class="footer">
                            <button class="btn btn-cancel" @click="handleClose">
                                {{ t('common.cancel') }}
                            </button>
                            <button class="btn btn-primary" @click="handleInsert">
                                {{ t('dialogRenderer.common.insertChart') }}
                            </button>
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'
import { t } from '../../../common/i18n'

interface Props {
    visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'insert', data: string): void
}>()

const { dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

const mermaidCode = ref(`mermaid
    graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do Something]
    B -->|No| D[Do Something Else]
    C --> E[End]
    D --> E`)

const chartType = ref('graph')
// P1-CQ-2 / AS-3：只保存「待展示的源码文本」，由模板以文本插值渲染（自动转义）。
// 不再拼接 HTML 字符串注入 DOM；初始为空串时显示占位提示（保持原有交互）。
const previewCode = ref('')

function updatePreview() {
    previewCode.value = mermaidCode.value
}

function handleFormat() {
    const lines = mermaidCode.value.split('\n')
    const formatted = '```mermaid\n' + lines.map((line) => '    ' + line).join('\n')
    mermaidCode.value = formatted + '\n```\n'
    updatePreview()
}

function handleClear() {
    mermaidCode.value = ''
    updatePreview()
}

function handleClose() {
    emit('close')
}

function handleInsert() {
    // FE-15：与其他确认类插入对话框（如 FontSelectDialog.handleConfirm）保持一致——
    // 先 emit 插入数据，再 emit close 让父组件 hideDialog，无需用户再手动关闭。
    emit('insert', mermaidCode.value)
    emit('close')
}
</script>

<style scoped>
.dialog-fade-enter-active,
.dialog-fade-leave-active {
    transition: opacity 0.2s ease;
}

.dialog-fade-enter-from,
.dialog-fade-leave-to {
    opacity: 0;
}

.dialog-scale-enter-active,
.dialog-scale-leave-active {
    transition: transform 0.2s ease;
}

.dialog-scale-enter-from,
.dialog-scale-leave-to {
    transform: scale(0.9);
}

.dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
}

.dialog-container {
    width: 1400px;
    height: 900px;
    background: var(--bg-color);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.title-bar {
    height: 48px;
    background: var(--title-bar-gradient);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 24px;
    cursor: move;
    user-select: none;
    flex-shrink: 0;
}

.title-text {
    color: #fff;
    font-size: 16px;
    font-weight: 600;
}

.close-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #fff;
    transition: all 0.2s;
}

.close-btn:hover {
    background: rgba(255, 80, 80, 0.95);
}

.main-container {
    flex: 1;
    display: flex;
    gap: 1px;
    background: var(--border-color);
    overflow: hidden;
}

.editor-section,
.preview-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--bg-color);
    overflow: hidden;
}

.section-header {
    padding: 12px 16px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--border-color);
    background: var(--card-bg);
}

.section-header h3 {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
}

.toolbar {
    display: flex;
    gap: 8px;
}

.tool-btn {
    padding: 6px 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--card-bg);
    color: var(--text-color);
    font-size: 12px;
    cursor: pointer;
    transition: all 0.2s;
}

.tool-btn:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
}

.chart-select {
    padding: 6px 12px;
    border: 1px solid var(--border-color);
    border-radius: 4px;
    background: var(--card-bg);
    color: var(--text-color);
    font-size: 12px;
    cursor: pointer;
}

.code-editor {
    flex: 1;
    width: 100%;
    padding: 16px;
    border: none;
    resize: none;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-color);
    background: var(--bg-color);
    outline: none;
}

.preview-area {
    flex: 1;
    padding: 16px;
    overflow: auto;
    background: var(--card-bg);
}

/* P1-CQ-2 / AS-3：预览改为 <pre> 文本展示，保留换行/缩进（等宽字体与左侧编辑器一致）。 */
.preview-code {
    margin: 0;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 14px;
    line-height: 1.6;
    color: var(--text-color);
    white-space: pre-wrap;
    word-break: break-word;
}

/* FE-15：源码预览说明文案（灰色小字，位于预览区顶部）。 */
.preview-hint {
    margin: 0 0 12px 0;
    padding: 8px 10px;
    border-left: 3px solid var(--accent-color);
    background: var(--bg-color);
    border-radius: 4px;
    font-size: 12px;
    line-height: 1.5;
    color: var(--secondary-text-color);
}

.placeholder {
    color: var(--secondary-text-color);
    font-style: italic;
    text-align: center;
    margin-top: 100px;
}

.footer {
    padding: 15px 24px;
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    border-top: 1px solid var(--border-color);
    background: var(--card-bg);
    flex-shrink: 0;
}

.btn {
    padding: 10px 24px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    transition: all 0.2s;
}

.btn-cancel {
    background: var(--button-bg);
    color: var(--text-color);
}

.btn-primary {
    background: var(--accent-color);
    color: #fff;
}

.btn:hover {
    opacity: 0.9;
}
</style>
