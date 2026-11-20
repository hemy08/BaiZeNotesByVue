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
 *
 * P2 剩余静默失败提示（本批修复）：两个 IPC 副作用失败此前都只写 logger.error，用户界面
 * 毫无反馈。现统一经 common/action-feedback 的 reportActionFailure 弹错误对话框 + 「重试」
 * 按钮（自动保存同步失败还会回滚开关并做同错误 10s 节流，见下方 syncAutoSaveToggle）。
 */
import { IPC } from '../../../../../../shared/ipc-channels'
import { t } from '../../../../common/i18n'
import { logger } from '../../../../common/logger'
import { describeActionError, reportActionFailure } from '../../../../common/action-feedback'
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
        // P2 剩余静默失败提示：原实现只写日志（按钮无反馈），现弹错误对话框 + 重试
        reportActionFailure({
            title: t('dialogRenderer.systemSetting.browseFailedTitle'),
            message: t('dialogRenderer.systemSetting.browseFailedMessage', {
                error: describeActionError(error, t('common.unknown'))
            }),
            retry: () => browseDefaultPath()
        })
    }
}

/**
 * 自动保存运行时开关同步（IPC.SETTING.AUTO_SAVE_CHANGED，必须 invoke；P0-B 契约）。
 *
 * P2 剩余静默失败提示：主进程返回 ok:false 或 invoke 异常此前只写日志——开关 UI 已即时
 * 变更但主进程定时器未同步，用户无感知。现在：
 * 1. 任何「非 ok:true」结果都判定为失败（含返回非法/空结果）；
 * 2. 失败时把开关草稿回滚到操作前状态（避免界面与主进程运行时状态不一致），并弹错误
 *    对话框 + 「重试」按钮（重试按用户期望的目标状态重新同步）；
 * 3. 防刷屏：同一目标状态在 10s 内重复失败只记日志（reportActionFailure 节流），
 *    用户显式点「重试」时不节流，重试结果始终可见。
 *
 * @param enabled 用户期望的目标状态（事件目标 checked 值）
 * @param throttle 是否对重复失败节流（用户显式重试时传 false）
 */
async function syncAutoSaveToggle(enabled: boolean, throttle = true): Promise<void> {
    try {
        const result: unknown = await window.electron.ipcRenderer.invoke(
            IPC.SETTING.AUTO_SAVE_CHANGED,
            {
                autoSaveEnabled: enabled,
                autoSaveInterval: props.settings.autoSaveInterval
            }
        )
        if (!result || typeof result !== 'object' || (result as { ok?: boolean }).ok !== true) {
            // 主进程失败分支形如 { ok: false, reason }：把 reason 作为错误详情展示
            const reason = (result as { reason?: unknown } | null)?.reason
            throw new Error(typeof reason === 'string' && reason ? reason : t('common.unknown'))
        }
        // 重试成功时把回滚过的草稿重新对齐到用户目标状态；正常路径 v-model 已写入同值，
        // 此处仅在确实偏离时补一次补丁，避免多余 emit。
        if (autoSaveEnabled.value !== enabled) {
            autoSaveEnabled.value = enabled
        }
    } catch (error) {
        logger.error('同步自动保存设置失败:', error)
        // 主进程未接受本次切换：回滚开关到操作前状态，界面不误导用户
        autoSaveEnabled.value = !enabled
        reportActionFailure({
            title: t('dialogRenderer.systemSetting.autoSaveSyncFailedTitle'),
            message: t('dialogRenderer.systemSetting.autoSaveSyncFailedMessage', {
                error: describeActionError(error, t('common.unknown'))
            }),
            retry: () => syncAutoSaveToggle(enabled, false),
            throttleKey: throttle ? `system-setting:auto-save-sync:${String(enabled)}` : undefined
        })
    }
}

async function handleAutoSaveChange(event: Event): Promise<void> {
    // 目标值直接取事件目标：本组件对 props 只读，v-model 的补丁经壳层合并后 props 在
    // 本次事件内尚未刷新；读 checked 与拆分前读 settings.value.autoSaveEnabled 等价。
    const enabled = (event.target as HTMLInputElement).checked
    await syncAutoSaveToggle(enabled)
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
