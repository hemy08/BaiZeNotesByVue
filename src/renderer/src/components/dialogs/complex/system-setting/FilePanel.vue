<template>
    <div class="setting-panel">
        <div class="panel-header">
            <h3>
                {{ t('dialogRenderer.systemSetting.panelFileTitle') }}
            </h3>
            <p>{{ t('dialogRenderer.systemSetting.panelFileDesc') }}</p>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.systemSetting.groupDefaultPath') }}
            </div>
            <p class="group-hint">
                {{ t('dialogRenderer.systemSetting.hintDefaultFilePath') }}
            </p>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelDefaultFilePath')
                }}</label>
                <div class="path-input-group">
                    <input
                        v-model="defaultFilePath"
                        type="text"
                        class="setting-input"
                        readonly
                        :title="t('dialogRenderer.systemSetting.hintDefaultFilePath')"
                    />
                    <button class="browse-btn" @click="browseDefaultPath">
                        {{ t('common.browse') }}
                    </button>
                </div>
            </div>
        </div>

        <div class="settings-group">
            <div class="group-title">
                {{ t('dialogRenderer.systemSetting.groupFileOperations') }}
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelEnableAutoSave')
                }}</label>
                <input
                    v-model="autoSaveEnabled"
                    type="checkbox"
                    class="setting-checkbox"
                    @change="handleAutoSaveChange"
                />
            </div>
            <div v-if="autoSaveEnabled" class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelAutoSaveInterval')
                }}</label>
                <input
                    v-model.number="autoSaveInterval"
                    type="number"
                    class="setting-input"
                    min="10"
                    max="300"
                />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelRecentFilesCount')
                }}</label>
                <input
                    v-model.number="recentFilesCount"
                    type="number"
                    class="setting-input"
                    min="5"
                    max="20"
                    :title="t('dialogRenderer.systemSetting.hintRecentFilesCount')"
                />
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 文件设置页签（设置页拆分 P0；原 SystemSettingDialog.vue 的 activePanel === 'file' 区段）。
 *
 * 契约：props.settings 为壳层共享草稿（只读），字段修改经 emit('update', 补丁) 上报。
 * 本页签自身承载两个既有 IPC 副作用（与拆分前逐字一致）：
 * - 浏览默认路径：IPC.FILE.SELECT_DIRECTORY；
 * - 切换自动保存：IPC.SETTING.AUTO_SAVE_CHANGED（必须 invoke，P0-B/AUTO_SAVE_CHANGED 契约）。
 */
import { IPC } from '../../../../../../shared/ipc-channels'
import { t } from '../../../../common/i18n'
import { logger } from '../../../../common/logger'
import type { SystemDialogSettings } from './model'
import { usePanelFields } from './panel-model'

const props = defineProps<{ settings: SystemDialogSettings }>()
const emit = defineEmits<{
    (e: 'update', patch: Partial<SystemDialogSettings>): void
}>()

const field = usePanelFields(
    () => props.settings,
    (patch) => emit('update', patch)
)

const defaultFilePath = field('defaultFilePath')
const autoSaveEnabled = field('autoSaveEnabled')
const autoSaveInterval = field('autoSaveInterval')
const recentFilesCount = field('recentFilesCount')

/**
 * P1-FE-06：「浏览」默认路径——经既有 IPC.FILE.SELECT_DIRECTORY 拉起系统目录选择器，
 * 选中的路径写入设置，点击「应用/确定」后持久化到 systemSetting.json。
 */
async function browseDefaultPath(): Promise<void> {
    try {
        const selected: unknown = await window.electron.ipcRenderer.invoke(
            IPC.FILE.SELECT_DIRECTORY
        )
        if (typeof selected === 'string' && selected) {
            defaultFilePath.value = selected
        }
    } catch (error) {
        logger.error('选择默认路径失败:', error)
    }
}

// P0-B：主进程该通道以 ipcMain.handle 注册（registerHandleOnce），只有 invoke 可达。
// 原实现用 send 与 handle 模式不匹配 → 切换自动保存开关静默失效；此处统一为 invoke，
// 失败时 console.error 留痕（与上方加载系统设置失败的提示风格一致）。
async function handleAutoSaveChange(event: Event): Promise<void> {
    // 目标值直接取事件目标：本组件对 props 只读，v-model 的补丁经壳层合并后 props 在
    // 本次事件内尚未刷新；读 checked 与拆分前读 settings.value.autoSaveEnabled 等价。
    const enabled = (event.target as HTMLInputElement).checked
    try {
        const result: unknown = await window.electron.ipcRenderer.invoke(
            IPC.SETTING.AUTO_SAVE_CHANGED,
            {
                autoSaveEnabled: enabled,
                autoSaveInterval: props.settings.autoSaveInterval
            }
        )
        // 主进程正常路径返回 { ok: true }；显式失败标志时补一条错误日志，便于排查
        if (result && typeof result === 'object' && (result as { ok?: boolean }).ok === false) {
            logger.error('同步自动保存设置失败: 主进程返回失败标志', result)
        }
    } catch (error) {
        logger.error('同步自动保存设置失败:', error)
    }
}
</script>

<style scoped>
@import './settings-panel.css';

/* 默认路径行：只读输入框 + 浏览按钮 */
.path-input-group {
    display: flex;
    gap: 8px;
}
</style>
