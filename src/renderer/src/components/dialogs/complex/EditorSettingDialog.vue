<template>
    <!--
        C-4 迁移：large（48px 标题栏 / 16px 标题）+ rounded（32px 圆角关闭按钮）+ 900×700 容器；
        标题文字 16px/600、关闭按钮 18px 图标 + Electron 拖拽区 no-drag、标题栏与底栏
        不随内容压缩（flex-shrink:0）、底栏内边距 15px 24px 与 12px 间距经样式 prop 覆盖还原；
        遮罩、容器底色/圆角/阴影、标题栏渐变、右对齐底栏与 0.2s 动画均与默认壳逐项一致。
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
                <div v-show="activePanel === 'basic'" class="setting-panel">
                    <div class="panel-header">
                        <h3>
                            {{ t('dialogRenderer.editorSetting.panelBasicTitle') }}
                        </h3>
                        <p>
                            {{ t('dialogRenderer.editorSetting.panelBasicDesc') }}
                        </p>
                        <!-- P1-FE-05：保存后主进程广播 INIT_SETTING，Monaco 立即应用 -->
                        <p class="panel-hint">
                            {{ t('dialogRenderer.editorSetting.hintAppliedImmediately') }}
                        </p>
                    </div>

                    <div class="settings-group">
                        <div class="group-title">
                            {{ t('dialogRenderer.editorSetting.groupAutoSave') }}
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelEnableAutoSave')
                            }}</label>
                            <input
                                v-model="settings.autoSave"
                                type="checkbox"
                                class="setting-checkbox"
                            />
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelAutoSaveInterval')
                            }}</label>
                            <input
                                v-model.number="settings.autoSaveInterval"
                                type="number"
                                class="setting-input"
                                min="10"
                                max="300"
                            />
                        </div>
                    </div>

                    <div class="settings-group">
                        <div class="group-title">
                            {{ t('dialogRenderer.editorSetting.groupEditing') }}
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelEnableFolding')
                            }}</label>
                            <input
                                v-model="settings.enableFolding"
                                type="checkbox"
                                class="setting-checkbox"
                            />
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelShowLineNumbers')
                            }}</label>
                            <input
                                v-model="settings.showLineNumbers"
                                type="checkbox"
                                class="setting-checkbox"
                            />
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelEnableAutoComplete')
                            }}</label>
                            <input
                                v-model="settings.enableAutoComplete"
                                type="checkbox"
                                class="setting-checkbox"
                            />
                        </div>
                    </div>
                </div>

                <div v-show="activePanel === 'appearance'" class="setting-panel">
                    <div class="panel-header">
                        <h3>
                            {{ t('dialogRenderer.editorSetting.panelAppearanceTitle') }}
                        </h3>
                        <p>
                            {{ t('dialogRenderer.editorSetting.panelAppearanceDesc') }}
                        </p>
                    </div>

                    <div class="settings-group">
                        <div class="group-title">
                            {{ t('dialogRenderer.editorSetting.groupCursor') }}
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelCursorStyle')
                            }}</label>
                            <select v-model="settings.cursorStyle" class="setting-select">
                                <option value="line">
                                    {{ t('dialogRenderer.editorSetting.cursorLine') }}
                                </option>
                                <option value="block">
                                    {{ t('dialogRenderer.editorSetting.cursorBlock') }}
                                </option>
                                <option value="underline">
                                    {{ t('dialogRenderer.editorSetting.cursorUnderline') }}
                                </option>
                                <option value="blink">
                                    {{ t('dialogRenderer.editorSetting.cursorBlink') }}
                                </option>
                            </select>
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelCursorWidth')
                            }}</label>
                            <input
                                v-model.number="settings.cursorWidth"
                                type="range"
                                class="setting-range"
                                min="1"
                                max="5"
                            />
                        </div>
                    </div>

                    <div class="settings-group">
                        <div class="group-title">
                            {{ t('dialogRenderer.editorSetting.groupFont') }}
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelFontSize')
                            }}</label>
                            <input
                                v-model.number="settings.fontSize"
                                type="number"
                                class="setting-input"
                                min="10"
                                max="24"
                            />
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelLineHeight')
                            }}</label>
                            <input
                                v-model.number="settings.lineHeight"
                                type="number"
                                class="setting-input"
                                min="1"
                                max="3"
                                step="0.1"
                            />
                        </div>
                    </div>
                </div>

                <div v-show="activePanel === 'markdown'" class="setting-panel">
                    <div class="panel-header">
                        <h3>
                            {{ t('dialogRenderer.editorSetting.panelMarkdownTitle') }}
                        </h3>
                        <p>
                            {{ t('dialogRenderer.editorSetting.panelMarkdownDesc') }}
                        </p>
                        <!-- P1-FE-05：以下 4 项无 Monaco/渲染层消费方，禁用并标注「暂未实现」 -->
                        <p class="panel-hint panel-hint-warning">
                            {{ t('dialogRenderer.editorSetting.hintNotImplemented') }}
                        </p>
                    </div>

                    <div class="settings-group">
                        <div class="group-title">
                            {{ t('dialogRenderer.editorSetting.groupLivePreview') }}
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelEnableLivePreview')
                            }}</label>
                            <input
                                v-model="settings.enableLivePreview"
                                type="checkbox"
                                class="setting-checkbox"
                                disabled
                                :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                            />
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelPreviewDelay')
                            }}</label>
                            <input
                                v-model.number="settings.previewDelay"
                                type="number"
                                class="setting-input"
                                min="100"
                                max="2000"
                                disabled
                                :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                            />
                        </div>
                    </div>

                    <div class="settings-group">
                        <div class="group-title">
                            {{ t('dialogRenderer.editorSetting.groupSyntaxHighlight') }}
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelEnableCodeHighlight')
                            }}</label>
                            <input
                                v-model="settings.enableCodeHighlight"
                                type="checkbox"
                                class="setting-checkbox"
                                disabled
                                :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                            />
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelEnableLinkHighlight')
                            }}</label>
                            <input
                                v-model="settings.enableLinkHighlight"
                                type="checkbox"
                                class="setting-checkbox"
                                disabled
                                :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                            />
                        </div>
                    </div>
                </div>

                <div v-show="activePanel === 'advanced'" class="setting-panel">
                    <div class="panel-header">
                        <h3>
                            {{ t('dialogRenderer.editorSetting.panelAdvancedTitle') }}
                        </h3>
                        <p>
                            {{ t('dialogRenderer.editorSetting.panelAdvancedDesc') }}
                        </p>
                        <!-- P1-FE-05：以下 3 项无消费方，禁用并标注「暂未实现」 -->
                        <p class="panel-hint panel-hint-warning">
                            {{ t('dialogRenderer.editorSetting.hintNotImplemented') }}
                        </p>
                    </div>

                    <div class="settings-group">
                        <div class="group-title">
                            {{ t('dialogRenderer.editorSetting.groupPerformance') }}
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelMaxFileSize')
                            }}</label>
                            <input
                                v-model.number="settings.maxFileSize"
                                type="number"
                                class="setting-input"
                                min="1"
                                max="100"
                                disabled
                                :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                            />
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelRenderDelay')
                            }}</label>
                            <input
                                v-model.number="settings.renderDelay"
                                type="number"
                                class="setting-input"
                                min="50"
                                max="500"
                                disabled
                                :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                            />
                        </div>
                    </div>

                    <div class="settings-group">
                        <div class="group-title">
                            {{ t('dialogRenderer.editorSetting.groupExperimental') }}
                        </div>
                        <div class="setting-row">
                            <label class="setting-label">{{
                                t('dialogRenderer.editorSetting.labelEnableExperimental')
                            }}</label>
                            <input
                                v-model="settings.enableExperimental"
                                type="checkbox"
                                class="setting-checkbox"
                                disabled
                                :title="t('dialogRenderer.editorSetting.hintNotImplemented')"
                            />
                        </div>
                    </div>
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
import { reactive, ref, watch } from 'vue'
import type { CSSProperties } from 'vue'
// 第 2 批契约重构：主进程 'editor' 配置读取形状以 shared RendererEditorConfig 为唯一真源
import type { RendererEditorConfig } from '../../../../../shared/types'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import BaseDialog from '../BaseDialog.vue'

interface Props {
    visible: boolean
}

// 编辑器设置对话框的全部字段（渲染层扩展配置，与主进程 editor-setting.json 同源持久化）
export interface EditorDialogSettings {
    autoSave: boolean
    autoSaveInterval: number
    enableFolding: boolean
    showLineNumbers: boolean
    enableAutoComplete: boolean
    cursorStyle: string
    cursorWidth: number
    fontSize: number
    lineHeight: number
    enableLivePreview: boolean
    previewDelay: number
    enableCodeHighlight: boolean
    enableLinkHighlight: boolean
    maxFileSize: number
    renderDelay: number
    enableExperimental: boolean
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

const activePanel = ref('basic')

const sidebarItems = [
    { id: 'basic', nameKey: 'dialogRenderer.editorSetting.sidebarBasic', icon: '⚙️' },
    { id: 'appearance', nameKey: 'dialogRenderer.editorSetting.sidebarAppearance', icon: '🎨' },
    { id: 'markdown', nameKey: 'dialogRenderer.editorSetting.markdown', icon: '📝' },
    { id: 'advanced', nameKey: 'dialogRenderer.editorSetting.sidebarAdvanced', icon: '🔧' }
]

const initialSettings = ref({
    autoSave: true,
    autoSaveInterval: 30,
    enableFolding: true,
    showLineNumbers: true,
    enableAutoComplete: true,
    cursorStyle: 'line',
    cursorWidth: 2,
    fontSize: 14,
    lineHeight: 1.6,
    enableLivePreview: true,
    previewDelay: 300,
    enableCodeHighlight: true,
    enableLinkHighlight: true,
    maxFileSize: 10,
    renderDelay: 100,
    enableExperimental: false
})

const settings = reactive({ ...initialSettings.value })

/**
 * P1-FE-05：打开对话框时从主进程读取已保存的真实生效值回填。
 * config:read('editor') 已由 config-manager 路由到主进程 editorSetting 的反算结果，
 * 自动保存相关字段属于系统设置（config:read('system')）。
 * 读取失败时保持默认值，不阻塞对话框打开。
 */
async function loadSettings(): Promise<void> {
    try {
        const read = window.api?.config?.read
        if (typeof read !== 'function') {
            return
        }
        const [editor, system] = await Promise.all([
            // 第 2 批契约重构：主进程 'editor' 实际只返回 RendererEditorConfig 的 7 个
            // 反算字段（fontSize/lineHeight/showLineNumbers/enableFolding/enableAutoComplete/
            // cursorStyle/cursorWidth），是下方 EditorDialogSettings 的子集；旧断言
            // Partial<EditorDialogSettings> 虽结构兼容但未体现真实形状，改为 shared 真源类型。
            read<RendererEditorConfig>('editor'),
            read<{ autoSaveEnabled?: boolean; autoSaveInterval?: number }>('system')
        ])
        if (editor && typeof editor === 'object') {
            // 主进程实际返回形状中没有 autoSave 等字段，这里按字符串键读取并复用下方
            // typeof 逐字段守卫合并（仅类型断言跨越“实际子集 ↔ 对话框全字段”边界，
            // 不改变运行时对象与合并逻辑）。
            const editorValues = editor as unknown as Readonly<Record<string, unknown>>
            for (const key of Object.keys(settings) as (keyof EditorDialogSettings)[]) {
                const value = editorValues[key]
                if (value !== undefined && typeof value === typeof settings[key]) {
                    ;(settings as Record<string, unknown>)[key] = value
                }
            }
        }
        if (system && typeof system === 'object') {
            if (typeof system.autoSaveEnabled === 'boolean') {
                settings.autoSave = system.autoSaveEnabled
            }
            if (typeof system.autoSaveInterval === 'number') {
                settings.autoSaveInterval = system.autoSaveInterval
            }
        }
    } catch (error) {
        logger.error('加载编辑器设置失败:', error)
    }
}

watch(
    () => props.visible,
    async (newVal) => {
        if (!newVal) {
            return
        }
        await loadSettings()
        initialSettings.value = { ...settings }
    }
)

function handleClose() {
    emit('close')
}

function handleApply() {
    // P1-FE-05：主进程 config-manager 将该 payload 映射进 Monaco 唯一真源
    // editorSetting，并广播 INIT_SETTING 让当前编辑器立即生效。
    try {
        const pending = window.api.config.write('editor', { ...settings })
        if (pending && typeof pending.catch === 'function') {
            pending.catch((error: unknown) => logger.error('保存编辑器设置失败:', error))
        }
    } catch (error) {
        logger.error('保存编辑器设置失败:', error)
    }
    emit('apply', { ...settings })
}

function handleConfirm() {
    handleApply()
    handleClose()
}

function handleCancel() {
    Object.assign(settings, initialSettings.value)
    handleClose()
}
</script>

<style scoped>
/* 外壳（overlay/container/title-bar/title-text/close-btn/footer/过渡动画）已抽到 BaseDialog；
   这里只保留正文（侧边栏 / 设置面板 / 底栏按钮）样式。 */
.main-container {
    flex: 1;
    display: flex;
    overflow: hidden;
}

.sidebar {
    width: 220px;
    background: var(--card-bg);
    border-right: 1px solid var(--border-color);
    padding: 16px 0;
    flex-shrink: 0;
}

.sidebar-item {
    height: 44px;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 20px;
    cursor: pointer;
    color: var(--text-color);
    transition: all 0.2s;
    border-left: 3px solid transparent;
}

.sidebar-item:hover {
    background: var(--hover-bg);
}

.sidebar-item.active {
    background: var(--hover-bg);
    color: var(--accent-color);
    border-left-color: var(--accent-color);
}

.sidebar-icon {
    font-size: 18px;
}

.sidebar-name {
    font-size: 13px;
}

.content-area {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
}

.setting-panel {
    height: 100%;
}

.panel-header {
    margin-bottom: 24px;
}

.panel-header h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 8px;
}

.panel-header p {
    font-size: 13px;
    color: var(--secondary-text-color);
}

/* P1-FE-05：面板级提示（保存生效说明 / 暂未实现标注） */
.panel-hint {
    font-size: 12px;
    color: var(--secondary-text-color);
    margin-top: 6px;
}

.panel-hint-warning {
    color: #d48806;
}

/* 暂未实现的设置项：禁用态输入统一弱化展示 */
.setting-checkbox:disabled,
.setting-input:disabled,
.setting-select:disabled {
    cursor: not-allowed;
    opacity: 0.55;
}

.settings-group {
    margin-bottom: 24px;
    padding: 16px;
    background: var(--card-bg);
    border-radius: 8px;
    border: 1px solid var(--border-color);
}

.group-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-color);
    margin-bottom: 16px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-color);
}

.setting-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
}

.setting-row:last-child {
    margin-bottom: 0;
}

.setting-label {
    font-size: 13px;
    color: var(--text-color);
}

.setting-input {
    width: 150px;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--bg-color);
    transition: border-color 0.2s;
}

.setting-input:focus {
    border-color: var(--accent-color);
    outline: none;
}

.setting-select {
    width: 150px;
    padding: 8px 12px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    font-size: 13px;
    color: var(--text-color);
    background: var(--bg-color);
    cursor: pointer;
}

.setting-checkbox {
    width: 20px;
    height: 20px;
    cursor: pointer;
    accent-color: var(--accent-color);
}

.setting-range {
    width: 150px;
    cursor: pointer;
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

.btn:hover {
    opacity: 0.9;
}
</style>
