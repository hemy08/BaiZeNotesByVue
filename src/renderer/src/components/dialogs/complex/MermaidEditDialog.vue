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
        :overlay-style="overlayStyle"
        :close-on-overlay="false"
        :close-on-escape="false"
        :modal="false"
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
                    @input="schedulePreview"
                ></textarea>
            </div>

            <div class="preview-section">
                <div class="section-header">
                    <h3>{{ t('dialogRenderer.mermaidEdit.chartPreview') }}</h3>
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
                <!-- 安全边界：Mermaid 使用 strict + htmlLabels:false；SVG 输出必须经
                     SanitizePreviewHtml（DOMPurify 唯一入口）后再 v-html。 -->
                <div class="preview-area">
                    <p class="preview-hint">
                        {{ t('dialogRenderer.mermaidEdit.chartPreviewHint') }}
                    </p>
                    <p v-if="!normalizedCode" class="placeholder">
                        {{ t('dialogRenderer.common.previewPlaceholder') }}
                    </p>
                    <div v-else-if="rendering" class="preview-loading">
                        {{ t('dialogRenderer.mermaidEdit.rendering') }}
                    </div>
                    <div v-else-if="renderError" class="preview-error">
                        <p class="preview-error-title">
                            {{ t('dialogRenderer.mermaidEdit.renderFailed') }}
                        </p>
                        <pre class="preview-error-detail">{{ renderError }}</pre>
                    </div>
                    <!-- eslint-disable-next-line vue/no-v-html -- Mermaid SVG 已经 SanitizePreviewHtml(DOMPurify) 消毒，且 securityLevel=strict -->
                    <div v-else class="mermaid-preview" v-html="renderedSvg"></div>
                </div>
            </div>
            <div
                class="resize-grip"
                :title="t('common.resize')"
                @pointerdown.stop.prevent="startResize"
                @mousedown.stop.prevent
            >
                <span></span><span></span><span></span>
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
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'
import { SanitizePreviewHtml } from '../../Markdown/preview-sanitize'

interface Props {
    visible: boolean
}

const props = defineProps<Props>()
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
/** 非模态工具窗：遮罩不拦截底层编辑器点击，点击外部不关闭 */
const overlayStyle: CSSProperties = {
    pointerEvents: 'none',
    background: 'transparent'
}
const panelSize = reactive<{ width: number | null; height: number }>({
    width: null,
    height: 900
})
const containerStyle = computed<CSSProperties>(() => ({
    pointerEvents: 'auto',
    ...(panelSize.width ? { width: `${panelSize.width}px` } : {}),
    height: `${panelSize.height}px`
}))
let resizeCleanup: (() => void) | null = null

function startResize(event: PointerEvent): void {
    const handle = event.currentTarget as HTMLElement | null
    const container = handle?.closest('.dialog-container') as HTMLElement | null
    if (!container) return
    const rect = container.getBoundingClientRect()
    const startX = event.clientX
    const startY = event.clientY
    const startWidth = rect.width
    const startHeight = rect.height
    const minWidth = 760
    const minHeight = 520
    const maxWidth = Math.max(minWidth, window.innerWidth - 20)
    const maxHeight = Math.max(minHeight, window.innerHeight - 20)
    const onMove = (moveEvent: PointerEvent): void => {
        panelSize.width = Math.min(
            maxWidth,
            Math.max(minWidth, startWidth + moveEvent.clientX - startX)
        )
        panelSize.height = Math.min(
            maxHeight,
            Math.max(minHeight, startHeight + moveEvent.clientY - startY)
        )
    }
    const cleanup = (): void => {
        window.removeEventListener('pointermove', onMove)
        window.removeEventListener('pointerup', cleanup)
        resizeCleanup = null
    }
    resizeCleanup?.()
    resizeCleanup = cleanup
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', cleanup)
}
const titleBarStyle: CSSProperties = { flexShrink: 0 }
const titleTextStyle: CSSProperties = { fontSize: '16px', fontWeight: 600 }
const closeButtonStyle: CSSProperties = { fontSize: '18px' }
const footerStyle: CSSProperties = { padding: '15px 24px', gap: '12px', flexShrink: 0 }

const mermaidCode = ref(`graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Do Something]
    B -->|No| D[Do Something Else]
    C --> E[End]
    D --> E`)

const chartType = ref('graph')
const PREVIEW_DEBOUNCE_MS = 260
const MERMAID_PREVIEW_INIT = {
    startOnLoad: false,
    securityLevel: 'strict',
    htmlLabels: false
} as const

let mermaidPromise: Promise<typeof import('mermaid').default> | null = null
let previewTimer: ReturnType<typeof setTimeout> | null = null
let previewSeq = 0
let renderSeq = 0
const renderedSvg = ref('')
const renderError = ref('')
const rendering = ref(false)

/** 去掉代码围栏与遗留的 mermaid 语言标记行，得到可渲染的图表定义 */
function normalizeMermaidCode(raw: string): string {
    let code = raw.trim()
    const fenced = code.match(/^```(?:mermaid)?\s*\n([\s\S]*?)\n```$/i)
    if (fenced) code = fenced[1].trim()
    const lines = code.split(/\r?\n/)
    if (lines[0]?.trim().toLowerCase() === 'mermaid') {
        code = lines.slice(1).join('\n').trim()
    }
    return code
}

const normalizedCode = computed(() => normalizeMermaidCode(mermaidCode.value))

async function getMermaid() {
    if (!mermaidPromise) {
        mermaidPromise = import('mermaid').then((module) => {
            const instance = module.default
            instance.initialize(MERMAID_PREVIEW_INIT)
            return instance
        })
    }
    return mermaidPromise
}

async function renderDiagram() {
    const seq = ++renderSeq
    const code = normalizedCode.value
    renderError.value = ''
    if (!code) {
        renderedSvg.value = ''
        rendering.value = false
        return
    }
    rendering.value = true
    try {
        const mermaid = await getMermaid()
        const id = `mermaidPreview${Date.now()}${previewSeq++}`
        const result = await mermaid.render(id, code)
        document.getElementById(`d${id}`)?.remove()
        if (seq !== renderSeq) return
        renderedSvg.value = SanitizePreviewHtml(result.svg)
        if (!renderedSvg.value) {
            throw new Error(t('dialogRenderer.mermaidEdit.renderFailed'))
        }
    } catch (error) {
        if (seq !== renderSeq) return
        renderedSvg.value = ''
        renderError.value = error instanceof Error ? error.message : String(error)
    } finally {
        if (seq === renderSeq) rendering.value = false
    }
}

function schedulePreview() {
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = setTimeout(() => {
        previewTimer = null
        void renderDiagram()
    }, PREVIEW_DEBOUNCE_MS)
}

onMounted(schedulePreview)
watch(
    () => props.visible,
    (visible) => {
        if (visible) schedulePreview()
    }
)
onBeforeUnmount(() => {
    if (previewTimer) clearTimeout(previewTimer)
    previewTimer = null
    renderSeq += 1
    resizeCleanup?.()
})

function handleFormat() {
    const lines = normalizedCode.value.split('\n')
    const formatted = '```mermaid\n' + lines.map((line) => '    ' + line).join('\n')
    mermaidCode.value = formatted + '\n```\n'
    schedulePreview()
}

function handleClear() {
    mermaidCode.value = ''
    schedulePreview()
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
    position: relative;
    flex: 1;
    display: flex;
    gap: 1px;
    background: var(--border-color);
    overflow: hidden;
}

.resize-grip {
    position: absolute;
    right: 2px;
    bottom: 2px;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    justify-content: flex-end;
    gap: 2px;
    width: 22px;
    height: 22px;
    padding: 4px;
    cursor: nwse-resize;
    opacity: 0.6;
    z-index: 10;
}

.resize-grip span {
    display: block;
    height: 2px;
    border-radius: 1px;
    background: var(--secondary-text-color);
}

.resize-grip span:nth-child(1) {
    width: 6px;
}

.resize-grip span:nth-child(2) {
    width: 10px;
}

.resize-grip span:nth-child(3) {
    width: 14px;
}

.resize-grip:hover {
    opacity: 1;
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

.mermaid-preview {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    min-height: 160px;
    overflow: auto;
}

.mermaid-preview :deep(svg) {
    max-width: 100%;
    height: auto;
}

.preview-loading {
    padding: 24px;
    color: var(--secondary-text-color);
    text-align: center;
}

.preview-error {
    padding: 12px;
    border: 1px solid #d97706;
    border-radius: 6px;
    background: #fff7ed;
    color: #9a3412;
}

.preview-error-title {
    margin: 0 0 8px;
    font-weight: 600;
}

.preview-error-detail {
    margin: 0;
    max-height: 220px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
    font-family: 'Consolas', 'Monaco', monospace;
    font-size: 12px;
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
