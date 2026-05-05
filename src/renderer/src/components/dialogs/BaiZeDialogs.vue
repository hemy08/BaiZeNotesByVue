<template>
  <Teleport to="body">
    <Transition name="dialog-fade">
      <div v-if="visible" class="dialog-overlay" @click.self="handleOverlayClick">
        <Transition name="dialog-scale">
          <div class="dialog-container" :style="containerStyle">
            <TitleBar
              v-if="showTitleBar"
              :title="title"
              @close="handleClose"
            />

            <div class="dialog-content">
              <component
                :is="currentComponent"
                v-bind="dialogProps"
                @close="handleClose"
                @confirm="handleConfirm"
                @apply="handleApply"
                @cancel="handleCancel"
                @update:visible="handleVisibleUpdate"
              />
            </div>

            <div v-if="$slots.footer" class="dialog-footer">
              <slot name="footer"></slot>
            </div>
          </div>
        </Transition>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import TitleBar from './common/TitleBar.vue'

import CreateFileFolderDialog from './simple/CreateFileFolderDialog.vue'
import NewFileFolderDialog from './simple/NewFileFolderDialog.vue'
import RenameDialog from './simple/RenameDialog.vue'
import MessageDialog from './simple/MessageDialog.vue'
import WebUrlDialog from './simple/WebUrlDialog.vue'

import AdmonitionDialog from './medium/AdmonitionDialog.vue'
import ImportOptionDialog from './medium/ImportOptionDialog.vue'
import InsertImageDialog from './medium/InsertImageDialog.vue'
import MathTextDialog from './medium/MathTextDialog.vue'
import MdSheetDialog from './medium/MdSheetDialog.vue'

import EditorSettingDialog from './complex/EditorSettingDialog.vue'
import FontSelectDialog from './complex/FontSelectDialog.vue'
import MermaidEditDialog from './complex/MermaidEditDialog.vue'
import SystemSettingDialog from './complex/SystemSettingDialog.vue'
import ThemeSettingDialog from './complex/ThemeSettingDialog.vue'

import HelpAboutDialog from './help/HelpAboutDialog.vue'
import HelpContactUsDialog from './help/HelpContactUsDialog.vue'
import MermaidRenderFrame from './help/MermaidRenderFrame.vue'
import OnlineWebPage from './help/OnlineWebPage.vue'
import QuickLinkSettingDialog from './help/QuickLinkSettingDialog.vue'
import TechStackDialog from './help/TechStackDialog.vue'

export type DialogType =
  | 'CreateFileFolderDialog'
  | 'NewFileFolderDialog'
  | 'RenameDialog'
  | 'MessageDialog'
  | 'WebUrlDialog'
  | 'AdmonitionDialog'
  | 'ImportOptionDialog'
  | 'InsertImageDialog'
  | 'MathTextDialog'
  | 'MdSheetDialog'
  | 'EditorSettingDialog'
  | 'FontSelectDialog'
  | 'MermaidEditDialog'
  | 'SystemSettingDialog'
  | 'ThemeSettingDialog'
  | 'HelpAboutDialog'
  | 'HelpContactUsDialog'
  | 'MermaidRenderFrame'
  | 'OnlineWebPage'
  | 'QuickLinkSettingDialog'
  | 'TechStackDialog'

interface Props {
  visible: boolean
  type: DialogType
  title?: string
  width?: string
  height?: string
  closeOnOverlayClick?: boolean
  showTitleBar?: boolean
  dialogProps?: Record<string, unknown>
}

const props = withDefaults(defineProps<Props>(), {
  visible: false,
  title: '对话框',
  width: '500px',
  height: 'auto',
  closeOnOverlayClick: true,
  showTitleBar: true,
  dialogProps: () => ({})
})

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'confirm', ...args: unknown[]): void
  (e: 'apply', ...args: unknown[]): void
  (e: 'cancel'): void
  (e: 'update:visible', value: boolean): void
}>()

const components: Record<DialogType, unknown> = {
  CreateFileFolderDialog,
  NewFileFolderDialog,
  RenameDialog,
  MessageDialog,
  WebUrlDialog,
  AdmonitionDialog,
  ImportOptionDialog,
  InsertImageDialog,
  MathTextDialog,
  MdSheetDialog,
  EditorSettingDialog,
  FontSelectDialog,
  MermaidEditDialog,
  SystemSettingDialog,
  ThemeSettingDialog,
  HelpAboutDialog,
  HelpContactUsDialog,
  MermaidRenderFrame,
  OnlineWebPage,
  QuickLinkSettingDialog,
  TechStackDialog
}

const currentComponent = computed(() => components[props.type])

const containerStyle = computed(() => ({
  width: props.width,
  height: props.height,
  maxHeight: '90vh'
}))

function handleClose() {
  emit('close')
  emit('update:visible', false)
}

function handleConfirm(...args: unknown[]) {
  emit('confirm', ...args)
}

function handleApply(...args: unknown[]) {
  emit('apply', ...args)
}

function handleCancel() {
  emit('cancel')
  emit('update:visible', false)
}

function handleOverlayClick() {
  if (props.closeOnOverlayClick) {
    handleClose()
  }
}

function handleVisibleUpdate(value: boolean) {
  emit('update:visible', value)
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
  background: var(--bg-color);
  border-radius: 8px;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.dialog-content {
  flex: 1;
  overflow-y: auto;
}

.dialog-footer {
  padding: 16px 20px;
  border-top: 1px solid var(--border-color, #e0e0e0);
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  background: var(--card-bg, #f8f8f8);
}
</style>