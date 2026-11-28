<template>
    <!--
        C-3 迁移：regular + rounded + 900×650；标题 16px/600、关闭按钮 18px + Electron no-drag、
        底栏 15px 24px / gap 12px、标题栏与底栏 flex-shrink:0、容器固定高 650px，均由下方
        属性 / 内联样式常量等价承载（与迁移前 BaseDialog 外壳逐条对应，见各常量注释）。
        设置页拆分 P0：本组件为壳层（侧边栏 + 7 个 panel + 保存/取消）；共享草稿/加载/保存/
        取消/脏标记/校验见 system-setting/useSystemSettingForm.ts，页签见同目录 *Panel.vue。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.systemSetting.title')"
        title-bar-variant="regular"
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
                    @click="selectPanel(item.id)"
                >
                    <span class="sidebar-icon">{{ item.icon }}</span>
                    <span class="sidebar-name">{{ t(item.nameKey) }}</span>
                </div>
            </div>

            <div class="content-area">
                <GeneralPanel
                    v-show="activePanel === 'general'"
                    :settings="settings"
                    @update="updateSettings"
                />
                <FilePanel
                    v-show="activePanel === 'file'"
                    :settings="settings"
                    @update="updateSettings"
                />
                <AppearancePanel
                    v-show="activePanel === 'appearance'"
                    :settings="settings"
                    :theme-display="appThemeDisplay"
                    :theme-display-fallback="appThemeDisplayFallback"
                    @update="updateSettings"
                    @open-theme-setting="handleOpenThemeSetting"
                />
                <FeaturesPanel
                    v-show="activePanel === 'features'"
                    :settings="settings"
                    @update="updateSettings"
                />
                <WritingPanel
                    v-show="activePanel === 'writing'"
                    :settings="settings"
                    @update="updateSettings"
                />
                <BackupPanel
                    v-show="activePanel === 'backup'"
                    :settings="settings"
                    @update="updateSettings"
                    @reload="handleBackupReload"
                />
                <!--
                    1.5.7 体验升级 B：第 7 页签「AI 助手」（多模型管理 + MCP 配置）。
                    懒加载：首次切到该页签时才触发异步 chunk 加载（v-if 门控 + 之后 v-show 保活），
                    避免打开设置页即加载 AI/MCP 面板代码与 IPC。
                -->
                <AiAssistantPanel
                    v-if="aiAssistantPanelLoaded"
                    v-show="activePanel === 'aiAssistant'"
                />
            </div>
        </div>

        <template #footer>
            <button class="dialog-btn dialog-btn--secondary btn btn-cancel" @click="handleCancel">
                {{ t('common.cancel') }}
            </button>
            <button
                class="dialog-btn dialog-btn--apply btn btn-apply"
                :disabled="isSaving"
                @click="handleApply"
            >
                {{ t('common.apply') }}
            </button>
            <button
                class="dialog-btn dialog-btn--primary btn btn-confirm"
                :disabled="isSaving"
                @click="handleConfirm"
            >
                {{ t('common.ok') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 系统设置对话框 —— 壳层（设置页拆分 P0）
 *
 * 职责：BaseDialog 外壳覆盖 + 左侧页签切换（activePanel 状态保留在壳层）+ 7 个 panel
 * 的组合 + 底栏保存/取消编排。
 *
 * 对外契约不变：props `visible`；emits `close` / `apply(settings)`（与拆分前一致）。
 * 共享草稿 / 打开时加载 / 应用写配置 / 取消恢复 / 脏标记 / 保存前诊断校验统一由
 * `./system-setting/useSystemSettingForm` 承担；各页签各自只读 props + emit 字段补丁
 * （「AI 助手」页签配置独立保存，不进入系统设置草稿）。
 */
import { defineAsyncComponent, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'
// 批次 C #10：「打开主题设置」复用菜单动作同款调用链（menu-actions.ts 的
// configStore.showDialog('themeSettings')），不新增 IPC 通道
import { getConfigStore } from '../../../common/useConfigStore'
import {
    SYSTEM_SETTING_SIDEBAR_ITEMS,
    type SystemDialogSettings,
    type SystemSettingPanelId
} from './system-setting/model'
import { useSystemSettingForm } from './system-setting/useSystemSettingForm'
import GeneralPanel from './system-setting/GeneralPanel.vue'
import FilePanel from './system-setting/FilePanel.vue'
import AppearancePanel from './system-setting/AppearancePanel.vue'
import FeaturesPanel from './system-setting/FeaturesPanel.vue'
import WritingPanel from './system-setting/WritingPanel.vue'
import BackupPanel from './system-setting/BackupPanel.vue'

/**
 * 1.5.7 体验升级 B：第 7 页签「AI 助手」面板懒加载（defineAsyncComponent）。
 *
 * 原因：AI 助手页承载多模型管理与 MCP 配置，代码量较大且首次打开设置页时通常不需要；
 * 用异步组件拆分独立 chunk，仅当用户首次切到该页签时才请求加载（见模板 v-if 门控），
 * 不增加打开设置页的首屏负担。加载期间显示 BaseDialog 内占位（空面板）。
 */
const AiAssistantPanel = defineAsyncComponent(() => import('./system-setting/AiAssistantPanel.vue'))

interface Props {
    visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'apply', settings: SystemDialogSettings): void
}>()

/** Electron 专有内联样式：BaseDialog 的 DialogStyleProperties 未导出，按同构方式在
 *  Vue CSSProperties 上补充 -webkit-app-region（不引入 any）。 */
interface DialogStyleOverrides extends CSSProperties {
    WebkitAppRegion?: 'drag' | 'no-drag'
}

// 迁移前容器固定高 650px（宽度由 width 属性承载 900px）。
const containerStyle: CSSProperties = { height: '650px' }
// 迁移前标题栏固定高度不随内容压缩（容器为固定高度，显式 flex-shrink: 0 保持布局不变）。
const titleBarStyle: CSSProperties = { flexShrink: 0 }
// 迁移前标题为 16px/600（regular 变体默认 14px/500，需显式覆盖字号与字重）。
const titleTextStyle: CSSProperties = { fontSize: '16px', fontWeight: 600 }
// 迁移前关闭按钮为 18px 图标（rounded 变体默认 16px），并声明 Electron no-drag 保持原状。
const closeButtonStyle: DialogStyleOverrides = {
    fontSize: '18px',
    WebkitAppRegion: 'no-drag'
}
// 迁移前底栏内边距 15px 24px、按钮间距 12px 且不随内容压缩
// （默认壳为 15px 20px / gap 10px / 可压缩）。
const footerStyle: CSSProperties = {
    padding: '15px 24px',
    gap: '12px',
    flexShrink: 0
}

/** 当前页签（壳层状态；拆分前即与 4 个 panel 的 v-show 共享，保留在壳层） */
const activePanel = ref<SystemSettingPanelId>('general')
/**
 * AI 助手面板是否已首次加载过（懒加载门控）：
 * 首次切到「AI 助手」页签才置 true 触发异步 chunk 加载；之后保持挂载（v-show 保活），
 * 与其它页签一致地保留页内状态（未保存的表单/测试结果不因切页丢失）。
 */
const aiAssistantPanelLoaded = ref(false)
/** 左侧页签（纯数据由 ./system-setting/model.ts 提供） */
const sidebarItems = SYSTEM_SETTING_SIDEBAR_ITEMS

/** 切换页签（唯一入口：确保「AI 助手」懒加载面板在首次访问时才开始加载） */
function selectPanel(panelId: SystemSettingPanelId): void {
    activePanel.value = panelId
    if (panelId === 'aiAssistant') {
        aiAssistantPanelLoaded.value = true
    }
}
/** P2 功能错误处理修复：保存中标志（防重复提交；保存失败时对话框保持打开） */
const isSaving = ref(false)

/** 共享草稿状态 / 加载 / 保存 / 取消 / 脏标记 / 校验（4 页签共用唯一一份草稿） */
const {
    settings,
    appThemeDisplay,
    appThemeDisplayFallback,
    loadSettings,
    saveSettings,
    resetSettings
} = useSystemSettingForm()

// ARC-04 + 首开回填修复：打开时读取主进程配置。
// 1) 对话框由 lazyDialog 包装，**首次打开时才挂载**，挂载时 visible 已经是 true：
//    非 immediate 的 watch 不会触发 loadSettings()，首开一直展示默认值（P0 缺陷）。
//    因此这里必须 `immediate: true`，让「首次挂载即已打开」也走同一加载路径；
// 2) 打开过一次后 dialog 保持挂载（lazyDialog 语义），后续每次 visible false→true
//    仍会重新加载（与拆分前「重新打开重新读取」的行为一致，见行为基线单测）。
watch(
    () => props.visible,
    async (newVal) => {
        if (!newVal) return
        await loadSettings()
    },
    { immediate: true }
)

/** panel → 共享草稿：浅合并字段补丁（唯一写入口，保证 4 个页签共享同一份草稿） */
function updateSettings(patch: Partial<SystemDialogSettings>): void {
    settings.value = { ...settings.value, ...patch }
}

/** 批次 C #10：先关闭本对话框（避免两个模态叠加），再经既有菜单动作同款调用链打开主题设置 */
function handleOpenThemeSetting(): void {
    emit('close')
    getConfigStore().showDialog('themeSettings')
}

/** 备份页签「从备份恢复」成功后请求重新加载（等价于拆分前 handleRestore 内的 loadSettings） */
function handleBackupReload(): void {
    void loadSettings()
}

function handleClose(): void {
    emit('close')
}

// 应用当前配置，不关闭窗口（写配置 + emit apply 由 composable/壳层分工完成）
// P2 功能错误处理修复：保存改为 await——失败时 composable 已弹错误提示并返回 null，
// 此时不 emit apply（避免上游按「已保存」处理），对话框保持打开供用户重试。
async function handleApply(): Promise<void> {
    if (isSaving.value) return
    isSaving.value = true
    try {
        const saved = await saveSettings()
        if (saved) {
            emit('apply', saved)
        }
    } finally {
        isSaving.value = false
    }
}

// 应用配置并关闭窗口：保存失败时**不关闭**（草稿不丢，用户可修正后重试）
async function handleConfirm(): Promise<void> {
    if (isSaving.value) return
    isSaving.value = true
    try {
        const saved = await saveSettings()
        if (!saved) {
            return
        }
        emit('apply', saved)
        emit('close')
    } finally {
        isSaving.value = false
    }
}

// 取消：恢复初始配置，关闭窗口
function handleCancel(): void {
    resetSettings()
    handleClose()
}
</script>

<style scoped>
/* 壳层骨架（侧边栏/内容区）与底栏按钮样式：拆分见 ./system-setting/settings-dialog-shell.css；
   设置项公共样式（分组卡片/设置行/输入控件）见 ./system-setting/settings-panel.css。 */
@import './system-setting/settings-dialog-shell.css';
</style>
