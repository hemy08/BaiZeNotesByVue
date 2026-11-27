<template>
    <!--
        C-2 迁移：regular 变体 + 覆盖标题栏 36px 高 / 0 12px 内边距 + circle 关闭按钮 + 1280px 宽度；
        迁移前无 footer（6 个插入按钮在正文 .btn-list 内），故不提供 footer 插槽。
        迁移前标题栏无拖拽区（-webkit-app-region 只出现在关闭按钮上的 no-drag，属历史遗留），
        这里用 closeButtonStyle 保留该声明；打开时重置拖拽位置由 resetPositionOnOpen 承担
        （等价于迁移前 visible 监听内调用的 resetPosition）。
    -->
    <BaseDialog
        tool-window
        :visible="visible"
        :title="t('dialogRenderer.mathText.title')"
        title-bar-variant="regular"
        close-button-variant="circle"
        width="1280px"
        :title-bar-style="titleBarStyle"
        :close-button-style="closeButtonStyle"
        reset-position-on-open
        @close="handleCancel"
    >
        <div class="main-content">
            <div class="preview-section">
                <label class="preview-label">{{
                    t('dialogRenderer.common.previewPlaceholder')
                }}</label>
                <!-- eslint-disable-next-line vue/no-v-html -- 预览为 KaTeX renderToString 输出（trust 默认 false，不产出原始 HTML 标签） -->
                <div class="preview-container" v-html="previewFormulaHtml"></div>
            </div>

            <div class="editor-section">
                <label class="editor-label">{{ t('dialogRenderer.mathText.formulaEdit') }}</label>
                <textarea
                    id="textInput"
                    v-model="latexData"
                    :placeholder="t('dialogRenderer.mathText.formulaPlaceholder')"
                    class="text-input"
                ></textarea>
            </div>

            <div class="btn-list">
                <button class="dialog-btn dialog-btn--primary btn" @click="handleInsertLine">
                    {{ t('dialogRenderer.mathText.insertInline') }}
                </button>
                <button class="dialog-btn dialog-btn--primary btn" @click="handleInsertBlock">
                    {{ t('dialogRenderer.mathText.insertBlock') }}
                </button>
                <button class="dialog-btn dialog-btn--primary btn" @click="handleInsertMath">
                    {{ t('dialogRenderer.mathText.insertMath') }}
                </button>
                <button class="dialog-btn dialog-btn--primary btn" @click="handleInsertKatex">
                    {{ t('dialogRenderer.mathText.insertKatex') }}
                </button>
                <button class="dialog-btn dialog-btn--primary btn" @click="handleInsertLatex">
                    {{ t('dialogRenderer.mathText.insertLatex') }}
                </button>
                <button class="dialog-btn dialog-btn--secondary btn" @click="handleCancel">
                    {{ t('dialogRenderer.mathText.cancelEdit') }}
                </button>
            </div>
        </div>
    </BaseDialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import type { CSSProperties } from 'vue'
import katex from 'katex'
// P1-8 后续（KaTeX CSS 按需）：KaTeX 样式表已从 main.ts 首屏静态样式移出，改为与预览管线
// 同一会话级加载器按需加载（katex.css 与 katex.min.css 内容等价，原两处静态引入已删除）。
import { EnsurePreviewKatexCssLoaded } from '../../Markdown/preview-katex-assets'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

/**
 * Electron 专有内联样式：BaseDialog 内部的 DialogStyleProperties 未导出，
 * 这里按同构方式在 Vue CSSProperties 上补充 -webkit-app-region（不引入 any）。
 */
interface DialogStyleOverrides extends CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
}

const latexInit =
    'x(t) = \\frac{a_0}{2} + \\sum_{n=1}^{\\infty} \\left( a_n \\cos\\left(\\frac{2\\pi nt}{T}\\right) + b_n \\sin\\left(\\frac{2\\pi nt}{T}\\right) \\right)'

interface Props {
    visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'insert', markdown: string): void
}>()

const latexData = ref(latexInit)

// 迁移前标题栏 36px 高、0 12px 内边距（regular 变体默认 40px/0 16px）。
const titleBarStyle: DialogStyleOverrides = { height: '36px', padding: '0 12px' }
// 迁移前关闭按钮上的 -webkit-app-region: no-drag（标题栏本身不是拖拽区，故仅为声明等价）。
const closeButtonStyle: DialogStyleOverrides = { WebkitAppRegion: 'no-drag' }

const renderedFormula = computed(() => {
    try {
        return renderLatex(latexData.value)
    } catch {
        return '<span style="color:red">' + t('dialogRenderer.mathText.syntaxError') + '</span>'
    }
})

/**
 * P1-8 后续：KaTeX 样式是否已就绪。
 * 样式表按需加载（不再随首屏静态样式进入主 CSS），首次打开编辑器时等待加载完成再渲染公式，
 * 避免「无样式公式」闪现后再跳变（本地磁盘 chunk 通常 < 1 帧）。
 */
const katexCssReady = ref(false)

/** 实际写入预览区的 HTML：样式就绪前留空（避免半渲染/样式跳变） */
const previewFormulaHtml = computed(() => (katexCssReady.value ? renderedFormula.value : ''))

onMounted(async () => {
    // 加载失败也放行（Ensure 内部已降级为 warn，不抛异常）：公式按 KaTeX 自带 MathML 回退展示
    await EnsurePreviewKatexCssLoaded()
    katexCssReady.value = true
})

function renderLatex(text: string): string {
    if (!text) return ''
    try {
        return katex.renderToString(text, {
            throwOnError: false,
            displayMode: true
        })
    } catch {
        return '<span style="color:red">' + t('dialogRenderer.mathText.syntaxError') + '</span>'
    }
}

function handleCancel() {
    emit('close')
}

function handleInsertLine() {
    emit('insert', '$' + latexData.value + '$' + '\n')
}

function handleInsertBlock() {
    emit('insert', '$$\r\n' + latexData.value + '\r\n$$\r\n')
}

function handleInsertMath() {
    emit('insert', '~~~math\r\n' + latexData.value + '\r\n~~~')
}

function handleInsertKatex() {
    emit('insert', '~~~katex\r\n' + latexData.value + '\r\n~~~')
}

function handleInsertLatex() {
    emit('insert', '~~~latex\r\n' + latexData.value + '\r\n~~~')
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/close-btn/过渡动画）已抽到 BaseDialog；
   正文 .btn-list 内的操作按钮视觉见全局 assets/dialog-buttons.css
   （模板类 dialog-btn dialog-btn--*），这里只保留正文、公式编辑与按钮排布样式。 */
.main-content {
    flex: 1;
    padding: 15px 20px;
    display: flex;
    flex-direction: column;
}

.preview-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.preview-label {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 500;
    margin-left: 20px;
}

.preview-container {
    width: 100%;
    height: 250px;
    display: flex;
    justify-content: center;
    align-items: center;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 20px;
    color: var(--text-color);
    font-size: 2em;
    overflow-wrap: break-word;
    word-break: break-all;
}

.editor-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-top: 10px;
}

.editor-label {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 500;
    margin-left: 20px;
    margin-top: 10px;
}

.text-input {
    width: 100%;
    height: 100px;
    overflow-y: auto;
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    color: var(--text-color);
    font-size: 14px;
    font-family: 'Fira Code', 'Consolas', monospace;
    resize: none;
    outline: none;
}

.text-input:focus {
    border-color: var(--accent-color);
}

.btn-list {
    width: 100%;
    margin-top: 20px;
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 15px;
}
</style>
