<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleCancel">
        <Transition name="dialog-scale">
          <div
            class="dialog-container"
            :style="dialogStyle"
            ref="dialogRef"
            @mousedown="onDialogMouseDown"
          >
            <div class="title-bar">
              <span class="title-text">特殊文字编辑</span>
              <button class="close-btn" @click.stop="handleCancel">×</button>
            </div>

            <div class="main-content">
              <div class="left-panel">
                <div class="config-section">
                  <div class="input-row">
                    <label class="label-style">选择字体：</label>
                    <select v-model="fontStyle.fontFamily" class="select-style" @change="updatePreview">
                      <option v-for="font in fontFamilyList" :key="font" :value="font">{{ font }}</option>
                    </select>
                  </div>

                  <div class="input-row">
                    <label class="label-style">字体大小：</label>
                    <select v-model="fontStyle.fontSize" class="select-style" @change="updatePreview">
                      <option v-for="size in fontSizes" :key="size" :value="size">{{ size }}</option>
                    </select>
                  </div>

                  <div class="input-row">
                    <label class="label-style">对齐方式：</label>
                    <select v-model="fontStyle.textAlign" class="select-style" @change="updatePreview">
                      <option value="left">左对齐</option>
                      <option value="center">居中对齐</option>
                      <option value="right">右对齐</option>
                      <option value="justify">两端对齐</option>
                    </select>
                  </div>

                  <div class="style-buttons">
                    <button
                      :class="['font-style-btn', { active: fontStyle.fontBold }]"
                      @click="toggleStyle('fontBold')"
                    >加粗</button>
                    <button
                      :class="['font-style-btn', { active: fontStyle.fontItalic }]"
                      @click="toggleStyle('fontItalic')"
                    >斜体</button>
                    <button
                      :class="['font-style-btn', { active: fontStyle.fontUnderline }]"
                      @click="toggleStyle('fontUnderline')"
                    >下划线</button>
                    <button
                      :class="['font-style-btn', { active: fontStyle.fontDeleteLine }]"
                      @click="toggleStyle('fontDeleteLine')"
                    >删除线</button>
                  </div>

                  <div class="color-section">
                    <div class="color-row">
                      <label class="label-style">字体颜色：</label>
                      <input type="color" v-model="fontStyle.fontColor" class="color-input" @input="updatePreview" />
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
                      <label class="label-style">背景色：</label>
                      <input type="color" v-model="fontStyle.fontBackGroundColor" class="color-input" @input="updatePreview" />
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
                  <label class="section-label">编辑区域：</label>
                  <textarea
                    v-model="fontStyle.textInput"
                    class="text-input-area"
                    placeholder="请输入要编辑的文字..."
                    @input="updatePreview"
                  ></textarea>
                </div>

                <div class="preview-section">
                  <label class="section-label">效果预览：</label>
                  <div class="preview-area" :style="previewStyle">
                    <span>{{ fontStyle.textInput || '这是一段预览文字。' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <div class="footer">
              <button class="btn btn-cancel" @click="handleCancel">取消</button>
              <button class="btn btn-apply" @click="handleApply">应用</button>
              <button class="btn btn-confirm" @click="handleConfirm">确定</button>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { reactive, computed } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'

const fontFamilyList = [
  'Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Verdana',
  'Courier New', 'Impact', 'Comic Sans MS', 'Trebuchet MS', 'Arial Black',
  'Microsoft YaHei', 'SimSun', 'SimHei', 'KaiTi', 'FangSong',
  'Consolas', 'Monaco', 'Courier New'
]

const fontSizes = Array.from({ length: 36 }, (_, i) => `${i + 5}pt`)

const commonColors = [
  '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00', '#FF00FF', '#00FFFF',
  '#800000', '#008000', '#000080', '#808000', '#800080', '#008080', '#C0C0C0', '#808080',
  '#9999FF', '#993366', '#FFFFCC', '#CCFFFF', '#660066', '#FF8080', '#0066CC', '#CCCCFF',
  '#000080', '#FF00FF', '#00FFFF', '#800080', '#800000', '#008080', '#0000FF', '#00CCFF',
  '#CCFFCC', '#FFFF99', '#9999FF', '#FF99FF', '#CC99FF', '#FFCC99', '#3366FF', '#FF99CC',
  '#CC3333', '#00CC99', '#0066CC', '#CC6699', '#993366', '#666699', '#969696', '#003366',
  '#993300', '#333300', '#003300', '#003333', '#000066', '#330099', '#330033', '#330000'
]

interface Props {
  visible: boolean
}

defineProps<Props>()
const emit = defineEmits<{
  (e: 'close'): void
  (e: 'apply', html: string): void
}>()

const { dialogRef, dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

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
  textDecoration: [
    fontStyle.fontUnderline ? 'underline' : '',
    fontStyle.fontDeleteLine ? 'line-through' : ''
  ].filter(Boolean).join(' ') || 'none'
}))

function toggleStyle(style: 'fontBold' | 'fontItalic' | 'fontUnderline' | 'fontDeleteLine') {
  fontStyle[style] = !fontStyle[style]
}

function selectColor(type: 'fontColor' | 'fontBackGroundColor', color: string) {
  fontStyle[type] = color
}

function updatePreview() {
}

function handleCancel() {
  emit('close')
}

function handleApply() {
  const htmlContext = generateHtml()
  emit('apply', htmlContext)
}

function handleConfirm() {
  const htmlContext = generateHtml()
  emit('apply', htmlContext)
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
  width: 1280px;
  height: 800px;
  min-width: 1000px;
  min-height: 600px;
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.title-bar {
  height: 40px;
  background: var(--title-bar-gradient);
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 16px;
  cursor: move;
  user-select: none;
  flex-shrink: 0;
}

.title-text {
  color: #fff;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.5px;
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
  font-size: 16px;
  color: #fff;
  transition: all 0.2s;
}

.close-btn:hover {
  background: rgba(255, 80, 80, 0.95);
}

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
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  color: var(--text-color);
}

.btn-cancel:hover {
  background: var(--border-color);
}

.btn-apply {
  background: var(--card-bg);
  border: 1px solid var(--accent-color);
  color: var(--accent-color);
}

.btn-apply:hover {
  background: var(--accent-color);
  color: #fff;
}

.btn-confirm {
  background: var(--accent-color);
  color: #fff;
}

.btn-confirm:hover {
  opacity: 0.9;
}
</style>
