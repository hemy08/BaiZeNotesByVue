<template>
    <!--
        C-4 迁移：large（48px 标题栏 / 16px 标题）+ rounded（32px 圆角关闭按钮）+ 900×700 容器；
        标题文字 16px/600、关闭按钮 18px 图标 + Electron 拖拽区 no-drag、标题栏与底栏
        不随内容压缩（flex-shrink:0）、底栏内边距 15px 24px 与 12px 间距经样式 prop 覆盖还原；
        遮罩、容器底色/圆角/阴影、标题栏渐变、右对齐底栏与 0.2s 动画均与默认壳逐项一致。

        设置对话框二期拆分：本组件为壳层（BaseDialog 外壳 + 左侧页签 + 4 个 panel 组合 +
        底栏保存/取消编排）；共享草稿/加载/保存/取消见 editor-setting/useEditorSettingForm.ts，
        页签见 editor-setting/BasicPanel|AppearancePanel|MarkdownPanel|AdvancedPanel.vue，
        共享样式见 editor-setting/*.css。对外 props/emit 契约不变。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.editorSetting.title')"
        title-bar-variant="large"
        close-button-variant="rounded"
        width="900px"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        :title-text-style="titleTextStyle"
        :close-button-style="closeButtonStyle"
        :footer-style="footerStyle"
        @close="handleClose"
    >
        <div class="main-container">
            <div class="sidebar">
                <div
                    v-for="item in sidebarItems"
                    :key="item.id"
                    :class="['sidebar-item', { active: activePanel === item.id }]"
                    @click="activePanel = item.id"
                >
                    <span class="sidebar-icon">{{ item.icon }}</span>
                    <span class="sidebar-name">{{ t(item.nameKey) }}</span>
                </div>
            </div>

            <div class="content-area">
                <BasicPanel
                    v-show="activePanel === 'basic'"
                    :settings="settings"
                    @update="updateSettings"
                />
                <AppearancePanel
                    v-show="activePanel === 'appearance'"
                    :settings="settings"
                    @update="updateSettings"
                />
                <MarkdownPanel
                    v-show="activePanel === 'markdown'"
                    :settings="settings"
                    @update="updateSettings"
                />
                <AdvancedPanel
                    v-show="activePanel === 'advanced'"
                    :settings="settings"
                    @update="updateSettings"
                />
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
 * 编辑器设置对话框 —— 壳层（设置对话框二期拆分）
 *
 * 职责：BaseDialog 外壳覆盖 + 左侧页签切换（activePanel 状态保留在壳层）+ 4 个 panel
 * 的组合 + 底栏保存/取消编排。
 *
 * 对外契约不变：props `visible`；emits `close` / `apply(settings)`（与拆分前一致）。
 * 共享草稿 / 打开时加载 / 应用写配置 / 取消恢复统一由
 * `./editor-setting/useEditorSettingForm` 承担；4 个页签各自只读 props + emit 字段补丁。
 */
import { ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'
import {
    EDITOR_SETTING_SIDEBAR_ITEMS,
    type EditorDialogSettings,
    type EditorSettingPanelId
} from './editor-setting/model'
import { useEditorSettingForm } from './editor-setting/useEditorSettingForm'
import BasicPanel from './editor-setting/BasicPanel.vue'
import AppearancePanel from './editor-setting/AppearancePanel.vue'
import MarkdownPanel from './editor-setting/MarkdownPanel.vue'
import AdvancedPanel from './editor-setting/AdvancedPanel.vue'

interface Props {
    visible: boolean
}

const props = defineProps<Props>()

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'apply', settings: EditorDialogSettings): void
}>()

/**
 * Electron 专有内联样式：BaseDialog 内部的 DialogStyleProperties 未导出，
 * 这里按同构方式在 Vue CSSProperties 上补充 -webkit-app-region（不引入 any）。
 */
interface DialogStyleOverrides extends CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
}

/**
 * C-4 迁移：外壳覆盖（其余外壳声明与 BaseDialog 默认壳逐项一致）。
 * - 容器：宽度 900px 由 width 属性承载，固定高 700px 经 containerStyle 覆盖；
 * - 标题栏：48px 高 / 0 24px 内边距由 large 变体提供，旧外壳另声明 flex-shrink: 0；
 * - 标题文字：16px / 600（large 变体同值，显式传入以固定契约）；
 * - 关闭按钮：rounded 变体提供 32px 圆角按钮，旧外壳字号 18px 且声明 Electron no-drag；
 * - 底栏：旧外壳 15px 24px 内边距、12px 间距、flex-shrink: 0（默认壳为 15px 20px / gap 10px）。
 */
const containerStyle: CSSProperties = { height: '700px' }
const titleBarStyle: CSSProperties = { flexShrink: 0 }
const titleTextStyle: CSSProperties = { fontSize: '16px', fontWeight: 600 }
const closeButtonStyle: DialogStyleOverrides = { fontSize: '18px', WebkitAppRegion: 'no-drag' }
const footerStyle: CSSProperties = { padding: '15px 24px', gap: '12px', flexShrink: 0 }

/** 当前页签（壳层状态；拆分前即与 4 个 panel 的 v-show 共享，保留在壳层） */
const activePanel = ref<EditorSettingPanelId>('basic')
/** 左侧页签（纯数据由 ./editor-setting/model.ts 提供） */
const sidebarItems = EDITOR_SETTING_SIDEBAR_ITEMS

/** 共享草稿状态 / 加载 / 保存 / 取消（4 页签共用唯一一份草稿） */
const { settings, loadSettings, saveSettings, resetSettings } = useEditorSettingForm()

// ARC-04：打开时读取主进程配置；2026-11-20 增加 immediate（首次由父级 v-if 以 visible=true 挂载时也能加载）
watch(
    () => props.visible,
    async (newVal) => {
        if (!newVal) {
            return
        }
        await loadSettings()
    },
    // 2026-11-20：首次打开由父级 v-if 直接以 visible=true 挂载，必须 immediate 才能加载设置
    { immediate: true }
)

/** panel → 共享草稿：浅合并字段补丁（唯一写入口，保证 4 个页签共享同一份草稿） */
function updateSettings(patch: Partial<EditorDialogSettings>): void {
    Object.assign(settings, patch)
}

function handleClose(): void {
    emit('close')
}

function handleApply(): void {
    emit('apply', saveSettings())
}

function handleConfirm(): void {
    handleApply()
    handleClose()
}

function handleCancel(): void {
    resetSettings()
    handleClose()
}
</script>

<style scoped>
/* 壳层骨架（侧边栏/内容区）与底栏按钮样式见 ./editor-setting/settings-dialog-shell.css；
   设置项公共样式（面板标题/分组卡片/设置行/输入控件）见 ./editor-setting/settings-panel.css。 */
@import './editor-setting/settings-dialog-shell.css';
</style>
