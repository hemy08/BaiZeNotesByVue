<template>
    <!--
        C-3 迁移：large（48px 标题栏 / 16px 标题）+ rounded（32px 圆角关闭按钮）+ 800×600 容器。
        迁移前后的外壳差异全部用 BaseDialog 现有能力等价表达：
        - 标题 16px（large 变体默认 16px/600，显式锁定字号防变体后续调整）；
        - 关闭按钮 18px 图标 + Electron no-drag → closeButtonStyle；
        - 标题栏迁移前是 Electron 原生拖拽区（-webkit-app-region: drag，无 JS 拖拽 /
          cursor: move / user-select: none）→ draggable=false + titleBarStyle 还原
          （app-region drag、flex-shrink:0，cursor/user-select 显式恢复初始值）；
        - 底栏内边距 15px 20px（与默认壳一致）、按钮间距 12px 且不随内容压缩 → footerStyle；
        - 容器固定高 600px → containerStyle（宽度由 width 属性承载）。

        设置对话框二期拆分：本组件为壳层（BaseDialog 外壳 + 链接列表/编辑表单组合 +
        底栏保存/取消编排）；草稿与主进程读写见 quick-link-setting/useQuickLinkSettingForm.ts，
        列表见 quick-link-setting/QuickLinkList.vue，表单见 quick-link-setting/QuickLinkForm.vue，
        共享样式见 quick-link-setting/*.css。对外 props/emit 契约不变。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.quickLink.title')"
        title-bar-variant="large"
        close-button-variant="rounded"
        width="800px"
        :draggable="false"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        :title-text-style="titleTextStyle"
        :close-button-style="closeButtonStyle"
        :footer-style="footerStyle"
        @close="handleClose"
    >
        <div class="main-content">
            <div class="content-wrapper">
                <QuickLinkList
                    :links="links"
                    :selected-index="selectedIndex"
                    @select="handleSelect"
                    @add="handleAdd"
                    @edit="handleEdit"
                    @delete="handleDelete"
                />

                <QuickLinkForm
                    v-if="showForm"
                    :initial="editingLink"
                    :is-editing="isEditing"
                    @save="handleSaveForm"
                    @cancel="handleCancelForm"
                />

                <div v-else-if="links.length === 0" class="empty-state">
                    <p>{{ t('dialogRenderer.quickLink.emptyState') }}</p>
                    <button class="add-btn" @click="handleAdd">
                        {{ t('dialogRenderer.quickLink.addFirst') }}
                    </button>
                </div>
            </div>
        </div>

        <template #footer>
            <button class="btn btn-cancel" @click="handleCancel">
                {{ t('common.cancel') }}
            </button>
            <button class="btn btn-apply" @click="handleApply">
                {{ t('common.apply') }}
            </button>
            <button class="btn btn-confirm" @click="handleConfirm">
                {{ t('common.ok') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 快捷链接设置对话框 —— 壳层（设置对话框二期拆分）
 *
 * 职责：BaseDialog 外壳覆盖 + 链接列表/编辑表单组合 + 底栏保存/取消编排。
 * 对外契约不变：props `visible`；emits `close` / `apply(links)`（与拆分前一致）。
 * 草稿 / 初始快照 / 主进程读写 / 表单显隐统一由
 * `./quick-link-setting/useQuickLinkSettingForm` 承担，子组件只做展示与事件上报。
 */
import { watch } from 'vue'
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'
import QuickLinkList from './quick-link-setting/QuickLinkList.vue'
import QuickLinkForm from './quick-link-setting/QuickLinkForm.vue'
import { useQuickLinkSettingForm } from './quick-link-setting/useQuickLinkSettingForm'
import type { Link, QuickLinkDraft } from './quick-link-setting/model'

interface Props {
    visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'apply', links: Link[]): void
}>()

/**
 * C-3 迁移：外壳覆盖（其余外壳声明与 BaseDialog 默认壳一致）。
 *
 * Electron 专有内联样式：BaseDialog 内部的 DialogStyleProperties 未导出，
 * 这里按同构方式在 Vue CSSProperties 上补充 -webkit-app-region（不引入 any）。
 */
interface DialogStyleOverrides extends CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
}

// 迁移前容器固定高 600px（宽度由 width 属性承载 800px）。
const containerStyle: CSSProperties = { height: '600px' }
// 迁移前标题栏是 Electron 原生拖拽区（-webkit-app-region: drag），且没有 JS 拖拽、
// 未声明 cursor / user-select / flex-shrink：BaseDialog 默认标题栏带 cursor:move /
// user-select:none / 可压缩，这里逐项还原（cursor/user-select 显式恢复初始值 auto）。
const titleBarStyle: DialogStyleOverrides = {
    WebkitAppRegion: 'drag',
    flexShrink: 0,
    cursor: 'auto',
    userSelect: 'auto'
}
// 迁移前标题为 16px（large 变体默认 16px/600，显式锁定字号防变体调整造成偏差）。
const titleTextStyle: CSSProperties = { fontSize: '16px' }
// 迁移前关闭按钮为 18px 图标（rounded 变体默认 16px），并保留 no-drag 使按钮在拖拽区内可点击。
const closeButtonStyle: DialogStyleOverrides = {
    fontSize: '18px',
    WebkitAppRegion: 'no-drag'
}
// 迁移前底栏按钮间距 12px 且不随内容压缩（默认壳 gap 10px / 可压缩；内边距 15px 20px 与默认一致）。
const footerStyle: CSSProperties = { gap: '12px', flexShrink: 0 }

/** 共享草稿 / 初始快照 / 主进程读写 / 表单显隐（壳层唯一数据源） */
const form = useQuickLinkSettingForm()
// 模板直接使用：ref 在 <script setup> 顶层绑定会在模板中自动解包
const { links, selectedIndex, showForm, isEditing, editingLink } = form

// FE-34：每次打开都重新从主进程读取最新 quickLinks（与拆分前 watch immediate 一致）
watch(
    () => props.visible,
    (newVal) => {
        if (newVal) {
            void form.loadLinksOnOpen()
        }
    },
    { immediate: true }
)

function handleSelect(index: number): void {
    form.selectLink(index)
}

function handleAdd(): void {
    form.openAddForm()
}

function handleEdit(index: number): void {
    form.openEditForm(index)
}

function handleDelete(index: number): void {
    form.deleteLink(index)
}

function handleCancelForm(): void {
    form.closeForm()
}

function handleSaveForm(draft: QuickLinkDraft): void {
    form.submitForm(draft)
}

function handleClose(): void {
    emit('close')
}

async function handleApply(): Promise<void> {
    if (!(await form.saveLinksToMain())) {
        return
    }
    emit('apply', form.snapshotLinks())
}

async function handleConfirm(): Promise<void> {
    if (!(await form.saveLinksToMain())) {
        return
    }
    emit('apply', form.snapshotLinks())
    emit('close')
}

function handleCancel(): void {
    form.resetLinks()
    handleClose()
}
</script>

<style scoped>
/* 壳层骨架/空状态见 settings-dialog-shell.css；按钮见 dialog-buttons.css。 */
@import './quick-link-setting/settings-dialog-shell.css';
@import './quick-link-setting/dialog-buttons.css';
</style>
