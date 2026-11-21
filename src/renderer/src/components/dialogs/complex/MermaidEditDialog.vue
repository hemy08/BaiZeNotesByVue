<template>
    <!--
        C-4 迁移：large（48px 标题栏 / 16px 标题）+ rounded（32px 圆角关闭按钮）+ 1400×900 容器；
        标题文字 16px/600、关闭按钮 18px 图标、标题栏与底栏不随内容压缩（flex-shrink:0）、
        底栏内边距 15px 24px 与 12px 间距经样式 prop 覆盖还原；遮罩、容器底色/圆角/阴影、
        标题栏渐变、右对齐底栏与 0.2s 动画均与默认壳逐项一致。
        说明：迁移前标题栏/关闭按钮均未声明 -webkit-app-region（对话框整体靠自定义拖拽，
        非 Electron 原生拖拽区），因此这里不额外注入 app-region 覆盖。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.mermaidEdit.title')"
        title-bar-variant="large"
        close-button-variant="rounded"
        width="1400px"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        :title-text-style="titleTextStyle"
        :close-button-style="closeButtonStyle"
        :footer-style="footerStyle"
        @close="handleClose"
    >
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

        <template #footer>
            <button class="dialog-btn dialog-btn--secondary btn btn-cancel" @click="handleClose">
                {{ t('common.cancel') }}
            </button>
            <button class="dialog-btn dialog-btn--primary btn btn-primary" @click="handleInsert">
                {{ t('dialogRenderer.common.insertChart') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'insert', data: string): void
}>()

/**
 * C-4 迁移：外壳覆盖（其余外壳声明与 BaseDialog 默认壳逐项一致）。
 * - 容器：宽度 1400px 由 width 属性承载，固定高 900px 经 containerStyle 覆盖；
 * - 标题栏：48px 高 / 0 24px 内边距由 large 变体提供，旧外壳另声明 flex-shrink: 0；
 * - 标题文字：16px / 600（large 变体同值，显式传入以固定契约）；
 * - 关闭按钮：rounded 变体提供 32px 圆角按钮，旧外壳字号 18px（无 app-region 声明）；
 * - 底栏：旧外壳 15px 24px 内边距、12px 间距、flex-shrink: 0（默认壳为 15px 20px / gap 10px）。
 */
const containerStyle: CSSProperties = { height: '900px' }
const titleBarStyle: CSSProperties = { flexShrink: 0 }
const titleTextStyle: CSSProperties = { fontSize: '16px', fontWeight: 600 }
const closeButtonStyle: CSSProperties = { fontSize: '18px' }
const footerStyle: CSSProperties = { padding: '15px 24px', gap: '12px', flexShrink: 0 }

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
/* 外壳（overlay/container/title-bar/title-text/close-btn/footer/过渡动画）已抽到 BaseDialog；
   底栏按钮视觉见全局 assets/dialog-buttons.css（模板类 dialog-btn dialog-btn--*），
   这里只保留正文（编辑区 / 源码预览区 / 工具栏 tool-btn）样式。 */
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
</style>
