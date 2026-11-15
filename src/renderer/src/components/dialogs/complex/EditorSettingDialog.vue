<template>
    <Teleport to="body">
        <Transition name="dialog-fade">
            <div v-if="visible" class="dialog-overlay" @click.self="handleClose">
                <Transition name="dialog-scale">
                    <div
                        v-if="visible"
                        class="dialog-container"
                        :style="dialogStyle"
                        @mousedown="onDialogMouseDown"
                    >
                        <div class="title-bar">
                            <span class="title-text">{{
                                t('dialogRenderer.editorSetting.title')
                            }}</span>
                            <button class="close-btn" @click.stop="handleClose">×</button>
                        </div>

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
                                            {{
                                                t(
                                                    'dialogRenderer.editorSetting.hintAppliedImmediately'
                                                )
                                            }}
                                        </p>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{ t('dialogRenderer.editorSetting.groupAutoSave') }}
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.editorSetting.labelEnableAutoSave'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.autoSave"
                                                type="checkbox"
                                                class="setting-checkbox"
                                            />
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.editorSetting.labelAutoSaveInterval'
                                                )
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
                                                t(
                                                    'dialogRenderer.editorSetting.labelShowLineNumbers'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.showLineNumbers"
                                                type="checkbox"
                                                class="setting-checkbox"
                                            />
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.editorSetting.labelEnableAutoComplete'
                                                )
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
                                            {{
                                                t(
                                                    'dialogRenderer.editorSetting.panelAppearanceTitle'
                                                )
                                            }}
                                        </h3>
                                        <p>
                                            {{
                                                t(
                                                    'dialogRenderer.editorSetting.panelAppearanceDesc'
                                                )
                                            }}
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
                                            <select
                                                v-model="settings.cursorStyle"
                                                class="setting-select"
                                            >
                                                <option value="line">
                                                    {{
                                                        t('dialogRenderer.editorSetting.cursorLine')
                                                    }}
                                                </option>
                                                <option value="block">
                                                    {{
                                                        t(
                                                            'dialogRenderer.editorSetting.cursorBlock'
                                                        )
                                                    }}
                                                </option>
                                                <option value="underline">
                                                    {{
                                                        t(
                                                            'dialogRenderer.editorSetting.cursorUnderline'
                                                        )
                                                    }}
                                                </option>
                                                <option value="blink">
                                                    {{
                                                        t(
                                                            'dialogRenderer.editorSetting.cursorBlink'
                                                        )
                                                    }}
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
                                            {{
                                                t('dialogRenderer.editorSetting.panelMarkdownTitle')
                                            }}
                                        </h3>
                                        <p>
                                            {{
                                                t('dialogRenderer.editorSetting.panelMarkdownDesc')
                                            }}
                                        </p>
                                        <!-- P1-FE-05：以下 4 项无 Monaco/渲染层消费方，禁用并标注「暂未实现」 -->
                                        <p class="panel-hint panel-hint-warning">
                                            {{
                                                t('dialogRenderer.editorSetting.hintNotImplemented')
                                            }}
                                        </p>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{ t('dialogRenderer.editorSetting.groupLivePreview') }}
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.editorSetting.labelEnableLivePreview'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.enableLivePreview"
                                                type="checkbox"
                                                class="setting-checkbox"
                                                disabled
                                                :title="
                                                    t(
                                                        'dialogRenderer.editorSetting.hintNotImplemented'
                                                    )
                                                "
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
                                                :title="
                                                    t(
                                                        'dialogRenderer.editorSetting.hintNotImplemented'
                                                    )
                                                "
                                            />
                                        </div>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{
                                                t(
                                                    'dialogRenderer.editorSetting.groupSyntaxHighlight'
                                                )
                                            }}
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.editorSetting.labelEnableCodeHighlight'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.enableCodeHighlight"
                                                type="checkbox"
                                                class="setting-checkbox"
                                                disabled
                                                :title="
                                                    t(
                                                        'dialogRenderer.editorSetting.hintNotImplemented'
                                                    )
                                                "
                                            />
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.editorSetting.labelEnableLinkHighlight'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.enableLinkHighlight"
                                                type="checkbox"
                                                class="setting-checkbox"
                                                disabled
                                                :title="
                                                    t(
                                                        'dialogRenderer.editorSetting.hintNotImplemented'
                                                    )
                                                "
                                            />
                                        </div>
                                    </div>
                                </div>

                                <div v-show="activePanel === 'advanced'" class="setting-panel">
                                    <div class="panel-header">
                                        <h3>
                                            {{
                                                t('dialogRenderer.editorSetting.panelAdvancedTitle')
                                            }}
                                        </h3>
                                        <p>
                                            {{
                                                t('dialogRenderer.editorSetting.panelAdvancedDesc')
                                            }}
                                        </p>
                                        <!-- P1-FE-05：以下 3 项无消费方，禁用并标注「暂未实现」 -->
                                        <p class="panel-hint panel-hint-warning">
                                            {{
                                                t('dialogRenderer.editorSetting.hintNotImplemented')
                                            }}
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
                                                :title="
                                                    t(
                                                        'dialogRenderer.editorSetting.hintNotImplemented'
                                                    )
                                                "
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
                                                :title="
                                                    t(
                                                        'dialogRenderer.editorSetting.hintNotImplemented'
                                                    )
                                                "
                                            />
                                        </div>
                                    </div>

                                    <div class="settings-group">
                                        <div class="group-title">
                                            {{
                                                t('dialogRenderer.editorSetting.groupExperimental')
                                            }}
                                        </div>
                                        <div class="setting-row">
                                            <label class="setting-label">{{
                                                t(
                                                    'dialogRenderer.editorSetting.labelEnableExperimental'
                                                )
                                            }}</label>
                                            <input
                                                v-model="settings.enableExperimental"
                                                type="checkbox"
                                                class="setting-checkbox"
                                                disabled
                                                :title="
                                                    t(
                                                        'dialogRenderer.editorSetting.hintNotImplemented'
                                                    )
                                                "
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div class="footer">
                            <button class="btn btn-cancel" @click="handleCancel">
                                {{ t('common.cancel') }}
                            </button>
                            <button class="btn btn-apply" @click="handleApply">
                                {{ t('common.apply') }}
                            </button>
                            <button class="btn btn-confirm" @click="handleConfirm">
                                {{ t('common.ok') }}
                            </button>
                        </div>
                    </div>
                </Transition>
            </div>
        </Transition>
    </Teleport>
</template>

<script setup lang="ts">
import { reactive, ref, watch } from 'vue'
import { useDialogDrag } from '../../../composables/useDialogDrag'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'

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
const { dialogStyle, onDialogMouseDown } = useDialogDrag({ initialPosition: 'center' })

const emit = defineEmits<{
    (e: 'close'): void
    (e: 'apply', settings: EditorDialogSettings): void
}>()

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
            read<Partial<EditorDialogSettings>>('editor'),
            read<{ autoSaveEnabled?: boolean; autoSaveInterval?: number }>('system')
        ])
        if (editor && typeof editor === 'object') {
            for (const key of Object.keys(settings) as (keyof EditorDialogSettings)[]) {
                const value = editor[key]
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
    width: 900px;
    height: 700px;
    background: var(--bg-color);
    border-radius: 8px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.25);
    overflow: hidden;
    display: flex;
    flex-direction: column;
}

.title-bar {
    height: 48px;
    background: var(--title-bar-gradient);
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0 24px;
    cursor: move;
    user-select: none;
    flex-shrink: 0;
}

.title-text {
    color: #fff;
    font-size: 16px;
    font-weight: 600;
}

.close-btn {
    -webkit-app-region: no-drag;
    width: 32px;
    height: 32px;
    border: none;
    background: rgba(255, 255, 255, 0.15);
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    color: #fff;
    transition: all 0.2s;
}

.close-btn:hover {
    background: rgba(255, 80, 80, 0.95);
}

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

.btn:hover {
    opacity: 0.9;
}
</style>
