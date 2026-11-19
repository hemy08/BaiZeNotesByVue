<template>
    <!--
        C-4 迁移：regular（40px 标题栏 / 14px 标题）+ rounded（32px 圆角关闭按钮）+ 900×600 容器；
        容器宽高由 useDialogResize 动态维护（初始 900×600，拖动 8 个 resize-handle 可调整），
        因此经 containerStyle 内联覆盖；8 个 resize-handle 放进 BaseDialog 的 #prepend 插槽
        （容器内、title-bar 之前，与迁移前 DOM 位置一致；容器由 useDialogDrag 内联 position:fixed
        定位，绝对定位的 resize-handle 仍以容器为基准）；标题栏/底栏 flex-shrink: 0、
        底栏 15px 24px 内边距与 12px 间距经样式 prop 覆盖还原；遮罩、容器底色/圆角/阴影、
        标题栏渐变、关闭按钮样式与 0.2s 动画均与默认壳逐项一致。

        设置对话框二期拆分：本组件为壳层（BaseDialog 外壳 + 左侧页签 + 3 个 panel 组合 +
        底栏保存/取消编排）；共享草稿/主题加载/取消恢复见 theme-setting/useThemeSettingForm.ts，
        页签见 theme-setting/AppThemePanel|EditorThemePanel|FontSettingsPanel.vue，
        主题卡片见 theme-setting/ThemePreviewCard.vue，共享样式见 theme-setting/*.css。
        对外 props/emit 契约不变。
    -->
    <BaseDialog
        :visible="visible"
        :title="t('dialogRenderer.themeSetting.title')"
        title-bar-variant="regular"
        close-button-variant="rounded"
        width="900px"
        :container-style="containerStyle"
        :title-bar-style="titleBarStyle"
        :footer-style="footerStyle"
        @close="handleCancel"
    >
        <template #prepend>
            <!--
                调整大小的边框：class 与指针事件处理与迁移前一致，且仍位于 title-bar 之前。
                第 4 批 P3 缺陷修复：useDialogResize 的 startResize(direction) 是「柯里化」函数——
                它返回真正的 mousedown 处理函数，本身不会启动缩放。此前模板写成
                `@mousedown="startResize('n')"` 只是求值了外层调用、返回的函数未被调用，
                导致 8 个 handle 全部失效（拖拽 resize 无任何反应）。现显式以 $event 调用
                返回的处理函数（内部会 preventDefault / stopPropagation，不会误触发标题栏拖拽）。
            -->
            <div class="resize-handle resize-n" @mousedown="startResize('n')($event)"></div>
            <div class="resize-handle resize-s" @mousedown="startResize('s')($event)"></div>
            <div class="resize-handle resize-e" @mousedown="startResize('e')($event)"></div>
            <div class="resize-handle resize-w" @mousedown="startResize('w')($event)"></div>
            <div class="resize-handle resize-ne" @mousedown="startResize('ne')($event)"></div>
            <div class="resize-handle resize-nw" @mousedown="startResize('nw')($event)"></div>
            <div class="resize-handle resize-se" @mousedown="startResize('se')($event)"></div>
            <div class="resize-handle resize-sw" @mousedown="startResize('sw')($event)"></div>
        </template>

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
                <AppThemePanel
                    v-if="activePanel === 'app-theme'"
                    :categories="themeCategories"
                    :current-theme="currentTheme"
                    @select="handleSelectTheme"
                />
                <EditorThemePanel
                    v-if="activePanel === 'editor-theme'"
                    :themes="allMonacoThemes"
                    :current-monaco-theme="currentMonacoTheme"
                    @select="handleSelectMonacoTheme"
                />
                <FontSettingsPanel
                    v-if="activePanel === 'font-settings'"
                    :fonts="fonts"
                    @update="updateFonts"
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
 * 主题设置对话框 —— 壳层（设置对话框二期拆分）
 *
 * 职责：BaseDialog 外壳覆盖 + resize-handle（#prepend）+ 左侧页签切换（activePanel 保留在壳层）
 * + 3 个 panel 组合 + 底栏应用/取消编排。
 *
 * 对外契约不变：props `visible`；emits `close` / `change(themeType, monacoTheme,
 * separateEditorTheme)`（与拆分前一致）。共享草稿 / 打开时主题加载 / 取消恢复统一由
 * `./theme-setting/useThemeSettingForm` 承担；3 个页签只做展示 + 事件上报。
 */
import { computed, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
import { useDialogResize } from '../../../composables/useDialogResize'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'
import {
    THEME_SETTING_SIDEBAR_ITEMS,
    type ThemeFontSettings,
    type ThemeSettingPanelId
} from './theme-setting/model'
import { useThemeSettingForm } from './theme-setting/useThemeSettingForm'
import AppThemePanel from './theme-setting/AppThemePanel.vue'
import EditorThemePanel from './theme-setting/EditorThemePanel.vue'
import FontSettingsPanel from './theme-setting/FontSettingsPanel.vue'

interface Props {
    visible: boolean
}

const props = defineProps<Props>()
const emit = defineEmits<{
    (e: 'close'): void
    (e: 'change', themeType: string, monacoTheme: string, separateEditorTheme: boolean): void
}>()

const { width, height, startResize } = useDialogResize({
    minWidth: 700,
    minHeight: 500,
    initialWidth: 900,
    initialHeight: 600
})

/**
 * C-4 迁移：外壳覆盖（其余外壳声明与 BaseDialog 默认壳逐项一致）。
 * - 容器：useDialogResize 维护的宽高（初始 900×600）经 computed 同时写入宽与高；
 *   width 属性给出初始宽度声明，拖动 resize-handle 后由 containerStyle 覆盖为实时值；
 *   容器仍由 useDialogDrag（BaseDialog 内部）内联 position:fixed 定位，作为 resize-handle 的
 *   绝对定位基准，与迁移前模板 `{ ...dialogStyle, width, height }` 的定位方式一致。
 * - 标题栏：40px 高 / 0 16px 内边距由 regular 变体提供，旧外壳另声明 flex-shrink: 0；
 * - 底栏：旧外壳 15px 24px 内边距、12px 间距、flex-shrink: 0（默认壳为 15px 20px / gap 10px）。
 */
const containerStyle = computed<CSSProperties>(() => ({
    width: `${width.value}px`,
    height: `${height.value}px`
}))
const titleBarStyle: CSSProperties = { flexShrink: 0 }
const footerStyle: CSSProperties = { padding: '15px 24px', gap: '12px', flexShrink: 0 }

/** 当前页签（壳层状态；拆分前即与 3 个 panel 的 v-if 共享，保留在壳层） */
const activePanel = ref<ThemeSettingPanelId>('app-theme')
/** 左侧页签（纯数据由 ./theme-setting/model.ts 提供） */
const sidebarItems = THEME_SETTING_SIDEBAR_ITEMS

/** 共享草稿 / 主题列表数据 / 打开时加载 / 取消恢复（3 页签共用唯一一份草稿） */
const form = useThemeSettingForm()
const {
    currentTheme,
    separateEditorTheme,
    currentMonacoTheme,
    fonts,
    themeCategories,
    allMonacoThemes
} = form

// ARC-04：打开时读取主题列表与当前主题配置（与拆分前一致：watch 无 immediate）
watch(
    () => props.visible,
    (newVal) => {
        if (newVal) {
            void form.loadThemes()
        }
    }
)

/**
 * 应用主题点选：更新草稿并立即 emit('change')（与拆分前 selectTheme 的即时应用链路一致，
 * 未应用前的取消回滚由 resetSettings 恢复）。
 */
function handleSelectTheme(themeType: string): void {
    currentTheme.value = themeType
    emit('change', currentTheme.value, currentMonacoTheme.value, separateEditorTheme.value)
}

/**
 * 编辑器主题点选：仅更新本地草稿（实际应用走 apply/confirm → @change 链路）。
 * P2 死通道清理：原 `selectMonacoTheme` 内的 IPC.THEME.UPDATE_MONACO_THEME 发送点
 * 主进程全仓无监听，已删除，此处保持同样的本地更新语义。
 */
function handleSelectMonacoTheme(monacoTheme: string): void {
    currentMonacoTheme.value = monacoTheme
}

/** 字体设置页签 → 共享字体草稿（不参与主题配置保存，与拆分前一致） */
function updateFonts(patch: Partial<ThemeFontSettings>): void {
    Object.assign(fonts, patch)
}

function handleCancel(): void {
    form.resetSettings()
    emit('close')
}

function handleApply(): void {
    emit('change', currentTheme.value, currentMonacoTheme.value, separateEditorTheme.value)
}

function handleConfirm(): void {
    handleApply()
    emit('close')
}
</script>

<style scoped>
/* 壳层骨架/resize-handle/按钮样式见 ./theme-setting/settings-dialog-shell.css；
   页签公共样式见 ./theme-setting/settings-panel.css（各 panel 自身 @import）。 */
@import './theme-setting/settings-dialog-shell.css';
</style>
