<template>
    <!--
        C-3 迁移：regular（40px 标题栏 / 14px 标题）+ rounded（32px 圆角关闭按钮）+ 1280×800 容器。
        迁移前后的外壳差异全部用 BaseDialog 现有能力等价表达：
        - 标题额外声明 letter-spacing: 0.5px → titleTextStyle；
        - 标题栏/容器/底栏固定不随内容压缩（迁移前显式 flex-shrink: 0）→ titleBarStyle/footerStyle 补充；
        - 底栏内边距 15px 24px、按钮间距 12px → footerStyle（默认壳为 15px 20px / gap 10px）；
        - 最小尺寸 min-width: 1000px / min-height: 600px → containerStyle；
        - 拖拽沿用 JS 拖拽（useDialogDrag 的 center 初始位置），由 BaseDialog 默认 draggable 承载。
    -->
    <BaseDialog
        tool-window
        :visible="visible"
        :title="t('dialogRenderer.fontSelect.title')"
        title-bar-variant="regular"
        close-button-variant="rounded"
        width="1280px"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        :title-text-style="titleTextStyle"
        :footer-style="footerStyle"
        @close="handleCancel"
    >
        <div class="main-content">
            <div class="left-panel">
                <div class="config-section">
                    <div class="input-row">
                        <label class="label-style">{{
                            t('dialogRenderer.fontSelect.labelFontFamily')
                        }}</label>
                        <select
                            v-model="fontStyle.fontFamily"
                            class="select-style"
                            @change="updatePreview"
                        >
                            <option v-for="font in fontFamilyList" :key="font" :value="font">
                                {{ font }}
                            </option>
                        </select>
                    </div>

                    <div class="input-row">
                        <label class="label-style">{{
                            t('dialogRenderer.fontSelect.labelFontSize')
                        }}</label>
                        <select
                            v-model="fontStyle.fontSize"
                            class="select-style"
                            @change="updatePreview"
                        >
                            <option v-for="size in fontSizes" :key="size" :value="size">
                                {{ size }}
                            </option>
                        </select>
                    </div>

                    <div class="input-row">
                        <label class="label-style">{{
                            t('dialogRenderer.fontSelect.labelAlign')
                        }}</label>
                        <select
                            v-model="fontStyle.textAlign"
                            class="select-style"
                            @change="updatePreview"
                        >
                            <option value="left">
                                {{ t('dialogRenderer.fontSelect.alignLeft') }}
                            </option>
                            <option value="center">
                                {{ t('dialogRenderer.fontSelect.alignCenter') }}
                            </option>
                            <option value="right">
                                {{ t('dialogRenderer.fontSelect.alignRight') }}
                            </option>
                            <option value="justify">
                                {{ t('dialogRenderer.fontSelect.alignJustify') }}
                            </option>
                        </select>
                    </div>

                    <div class="style-buttons">
                        <button
                            :class="['font-style-btn', { active: fontStyle.fontBold }]"
                            @click="toggleStyle('fontBold')"
                        >
                            {{ t('dialogRenderer.fontSelect.bold') }}
                        </button>
                        <button
                            :class="['font-style-btn', { active: fontStyle.fontItalic }]"
                            @click="toggleStyle('fontItalic')"
                        >
                            {{ t('dialogRenderer.fontSelect.italic') }}
                        </button>
                        <button
                            :class="['font-style-btn', { active: fontStyle.fontUnderline }]"
                            @click="toggleStyle('fontUnderline')"
                        >
                            {{ t('dialogRenderer.fontSelect.underline') }}
                        </button>
                        <button
                            :class="['font-style-btn', { active: fontStyle.fontDeleteLine }]"
                            @click="toggleStyle('fontDeleteLine')"
                        >
                            {{ t('dialogRenderer.fontSelect.strikethrough') }}
                        </button>
                    </div>

                    <div class="color-section">
                        <div class="color-row">
                            <label class="label-style">{{
                                t('dialogRenderer.fontSelect.fontColor')
                            }}</label>
                            <input
                                v-model="fontStyle.fontColor"
                                type="color"
                                class="color-input"
                                @input="updatePreview"
                            />
                        </div>
                        <div class="color-palette">
                            <button
                                v-for="color in commonColors"
                                :key="color"
                                class="color-btn"
                                :style="{ backgroundColor: color }"
                                @click="selectColor('fontColor', color)"
                            ></button>
                        </div>
                    </div>

                    <div class="color-section">
                        <div class="color-row">
                            <label class="label-style">{{
                                t('dialogRenderer.fontSelect.backgroundColor')
                            }}</label>
                            <input
                                v-model="fontStyle.fontBackGroundColor"
                                type="color"
                                class="color-input"
                                @input="updatePreview"
                            />
                        </div>
                        <div class="color-palette">
                            <button
                                v-for="color in commonColors"
                                :key="color"
                                class="color-btn"
                                :style="{ backgroundColor: color }"
                                @click="selectColor('fontBackGroundColor', color)"
                            ></button>
                        </div>
                    </div>
                </div>
            </div>

            <div class="divider"></div>

            <div class="right-panel">
                <div class="edit-section">
                    <label class="section-label">{{
                        t('dialogRenderer.fontSelect.editArea')
                    }}</label>
                    <textarea
                        v-model="fontStyle.textInput"
                        class="text-input-area"
                        :placeholder="t('dialogRenderer.fontSelect.editPlaceholder')"
                        @input="updatePreview"
                    ></textarea>
                </div>

                <div class="preview-section">
                    <label class="section-label">{{
                        t('dialogRenderer.fontSelect.preview')
                    }}</label>
                    <div class="preview-area" :style="previewStyle">
                        <span>{{
                            fontStyle.textInput || t('dialogRenderer.fontSelect.previewText')
                        }}</span>
                    </div>
                </div>
            </div>
        </div>

        <template #footer>
            <button class="dialog-btn dialog-btn--secondary btn btn-cancel" @click="handleCancel">
                {{ t('common.cancel') }}
            </button>
            <button class="dialog-btn dialog-btn--primary btn btn-insert" @click="handleInsert">
                {{ t('common.insert') }}
            </button>
            <button class="dialog-btn dialog-btn--apply btn btn-confirm" @click="handleConfirm">
                {{ t('common.ok') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'

const fontFamilyList = [
    'Arial',
    'Helvetica',
    'Times New Roman',
    'Georgia',
    'Verdana',
    'Courier New',
    'Impact',
    'Comic Sans MS',
    'Trebuchet MS',
    'Arial Black',
    'Microsoft YaHei',
    'SimSun',
    'SimHei',
    'KaiTi',
    'FangSong',
    'Consolas',
    'Monaco',
    'Courier New'
]

const fontSizes = Array.from({ length: 36 }, (_, i) => `${i + 5}pt`)

const commonColors = [
    '#000000',
    '#FFFFFF',
    '#FF0000',
    '#00FF00',
    '#0000FF',
    '#FFFF00',
    '#FF00FF',
    '#00FFFF',
    '#800000',
    '#008000',
    '#000080',
    '#808000',
    '#800080',
    '#008080',
    '#C0C0C0',
    '#808080',
    '#9999FF',
    '#993366',
    '#FFFFCC',
    '#CCFFFF',
    '#660066',
    '#FF8080',
    '#0066CC',
    '#CCCCFF',
    '#000080',
    '#FF00FF',
    '#00FFFF',
    '#800080',
    '#800000',
    '#008080',
    '#0000FF',
    '#00CCFF',
    '#CCFFCC',
    '#FFFF99',
    '#9999FF',
    '#FF99FF',
    '#CC99FF',
    '#FFCC99',
    '#3366FF',
    '#FF99CC',
    '#CC3333',
    '#00CC99',
    '#0066CC',
    '#CC6699',
    '#993366',
    '#666699',
    '#969696',
    '#003366',
    '#993300',
    '#333300',
    '#003300',
    '#003333',
    '#000066',
    '#330099',
    '#330033',
    '#330000'
]

interface Props {
    visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'apply', html: string): void
}>()

// C-3 迁移：外壳覆盖（其余外壳声明与 BaseDialog 默认壳一致）。
// 迁移前容器固定 1280×800（宽度由 width 属性承载）且带 min-width / min-height 下限。
const containerStyle: CSSProperties = {
    height: '800px',
    minWidth: '1000px',
    minHeight: '600px'
}
// 迁移前标题栏固定高度不随内容压缩（容器为固定高度，显式 flex-shrink: 0 保持布局不变）。
const titleBarStyle: CSSProperties = { flexShrink: 0 }
// 迁移前标题额外声明 letter-spacing: 0.5px（14px 字号 / 500 字重由 regular 变体承载）。
const titleTextStyle: CSSProperties = { letterSpacing: '0.5px' }
// 迁移前底栏内边距 15px 24px、按钮间距 12px 且不随内容压缩
// （默认壳为 15px 20px / gap 10px / 可压缩）。
const footerStyle: CSSProperties = {
    padding: '15px 24px',
    gap: '12px',
    flexShrink: 0
}

const fontStyle = reactive({
    fontFamily: 'Arial',
    fontSize: '15pt',
    fontColor: '#000000',
    fontBackGroundColor: '#FFFFFF',
    fontBold: false,
    fontItalic: false,
    fontUnderline: false,
    fontDeleteLine: false,
    textAlign: 'left' as 'left' | 'center' | 'right' | 'justify',
    textInput: ''
})

const previewStyle = computed(() => ({
    fontFamily: fontStyle.fontFamily,
    fontSize: fontStyle.fontSize,
    color: fontStyle.fontColor,
    backgroundColor: fontStyle.fontBackGroundColor,
    textAlign: fontStyle.textAlign,
    fontWeight: fontStyle.fontBold ? 'bold' : 'normal',
    fontStyle: fontStyle.fontItalic ? 'italic' : 'normal',
    textDecoration:
        [fontStyle.fontUnderline ? 'underline' : '', fontStyle.fontDeleteLine ? 'line-through' : '']
            .filter(Boolean)
            .join(' ') || 'none'
}))

function toggleStyle(style: 'fontBold' | 'fontItalic' | 'fontUnderline' | 'fontDeleteLine') {
    fontStyle[style] = !fontStyle[style]
}

function selectColor(type: 'fontColor' | 'fontBackGroundColor', color: string) {
    fontStyle[type] = color
}

function updatePreview() {
    // 预览样式由 previewStyle computed 实时响应，此处保留事件占位
    void 0
}

function handleCancel() {
    emit('close')
}

/** 「插入」按钮：仅执行一次插入，窗口保持打开，便于多次插入或调整后再插入 */
function handleInsert() {
    const htmlContext = generateHtml()
    emit('apply', htmlContext)
}

/** 「确定」按钮：只关闭窗口，不再触发插入（避免与「插入」按钮重复插入） */
function handleConfirm() {
    emit('close')
}

function generateHtml(): string {
    let htmlContext = fontStyle.textInput
    const fontBold = '<b>'
    const fontItalic = '<i>'
    const fontUnderline = '<u>'
    const fontDeleteLine = '<s>'
    htmlContext = '\r\n' + htmlContext + '\r\n'

    if (fontStyle.fontBold) {
        htmlContext = fontBold + htmlContext + '</b>'
    }
    if (fontStyle.fontItalic) {
        htmlContext = fontItalic + htmlContext + '</i>'
    }
    if (fontStyle.fontUnderline) {
        htmlContext = fontUnderline + htmlContext + '</u>'
        if (fontStyle.fontDeleteLine) {
            htmlContext = fontDeleteLine + htmlContext + '</s>'
        }
    } else {
        if (fontStyle.fontDeleteLine) {
            htmlContext = fontUnderline + htmlContext + '</s>'
        }
    }

    let fontBefore = '<span style="'
    fontBefore += `font-size: ${fontStyle.fontSize}; `
    fontBefore += `color: ${fontStyle.fontColor}; `
    fontBefore += `background-color: ${fontStyle.fontBackGroundColor}; `
    fontBefore += `font-family: '${fontStyle.fontFamily}';`
    fontBefore += `text-align: ${fontStyle.textAlign};`
    fontBefore += `display: block;`
    fontBefore += '">' + htmlContext

    return fontBefore + '</span>\n'
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/title-text/close-btn/footer/过渡动画）已抽到 BaseDialog；
   底栏按钮视觉见全局 assets/dialog-buttons.css（模板类 dialog-btn dialog-btn--*），
   这里只保留正文（配置面板/预览区）样式。 */
.main-content {
    flex: 1;
    padding: 20px 24px;
    display: flex;
    flex-direction: row;
    gap: 24px;
    min-height: 0;
}

.left-panel {
    width: 420px;
    flex-shrink: 0;
    overflow-y: auto;
}

.config-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.input-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
}

.label-style {
    min-width: 80px;
    color: var(--text-color);
    font-size: 13px;
    font-weight: 500;
    text-align: right;
}

.select-style {
    width: 200px;
    height: 32px;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 0 12px;
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    transition: border-color 0.2s;
}

.select-style:focus {
    border-color: var(--accent-color);
    outline: none;
}

.style-buttons {
    display: flex;
    flex-direction: row;
    gap: 20px;
}

.font-style-btn {
    padding: 8px 20px;
    min-width: 80px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--card-bg);
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
}

.font-style-btn:hover {
    background: var(--hover-bg);
    border-color: var(--accent-color);
}

.font-style-btn.active {
    background: var(--accent-color);
    color: #fff;
    border-color: var(--accent-color);
}

.color-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 8px 0;
}

.color-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 12px;
}

.color-input {
    width: 100px;
    height: 32px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    cursor: pointer;
}

.color-palette {
    display: grid;
    grid-template-columns: repeat(10, 1fr);
    gap: 4px;
    margin-left: 92px;
}

.color-btn {
    width: 20px;
    height: 20px;
    border: 1px solid var(--border-color);
    border-radius: 0;
    cursor: pointer;
    transition: all 0.2s;
    padding: 0;
}

.color-btn:hover {
    transform: scale(1.1);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.divider {
    width: 2px;
    background: var(--border-color);
    opacity: 0.3;
    flex-shrink: 0;
}

.right-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
}

.section-label {
    color: var(--text-color);
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 8px;
    display: block;
}

.text-input-area {
    width: 100%;
    height: 150px;
    overflow-y: auto;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
    color: var(--text-color);
    font-size: 13px;
    resize: none;
    outline: none;
    transition: border-color 0.2s;
}

.text-input-area:focus {
    border-color: var(--accent-color);
}

.preview-area {
    width: 100%;
    flex: 1;
    min-height: 200px;
    overflow: auto;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 12px;
}
</style>
