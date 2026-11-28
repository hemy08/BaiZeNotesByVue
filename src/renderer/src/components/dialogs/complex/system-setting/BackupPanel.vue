<template>
    <div class="setting-panel">
        <div class="panel-header">
            <h3>
                {{ t('dialogRenderer.systemSetting.panelBackupTitle') }}
            </h3>
            <p>
                {{ t('dialogRenderer.systemSetting.panelBackupDesc') }}
            </p>
        </div>

        <div class="settings-group">
            <div class="group-title">
                <span class="group-title-text">{{
                    t('dialogRenderer.systemSetting.groupAutoBackup')
                }}</span>
                <!-- 1.5.6 UI 简洁化：自动备份行为说明（默认关闭/备份范围/滚动清理）→ ⓘ 悬停提示 -->
                <InfoTip :text="t('dialogRenderer.systemSetting.hintAutoBackupGroup')" />
            </div>
            <div class="setting-row">
                <label class="setting-label">{{
                    t('dialogRenderer.systemSetting.labelEnableAutoBackup')
                }}</label>
                <input v-model="enableAutoBackup" type="checkbox" class="setting-checkbox" />
            </div>
            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label">{{
                        t('dialogRenderer.systemSetting.labelBackupInterval')
                    }}</label>
                    <!-- 1.5.6 UI 简洁化：间隔范围与重启定时器行为 → ⓘ 悬停提示 -->
                    <InfoTip :text="t('dialogRenderer.systemSetting.hintBackupInterval')" />
                </div>
                <input
                    v-model.number="backupInterval"
                    type="number"
                    class="setting-input"
                    min="1"
                    max="72"
                />
            </div>
            <div class="setting-row">
                <div class="setting-label-group">
                    <label class="setting-label">{{
                        t('dialogRenderer.systemSetting.labelBackupCount')
                    }}</label>
                    <!-- 1.5.6 UI 简洁化：保留数量语义说明 → ⓘ 悬停提示 -->
                    <InfoTip :text="t('dialogRenderer.systemSetting.hintBackupRetention')" />
                </div>
                <input
                    v-model.number="backupCount"
                    type="number"
                    class="setting-input"
                    min="1"
                    max="10"
                />
            </div>
        </div>

        <div class="settings-group">
            <div class="group-title">
                <span class="group-title-text">{{
                    t('dialogRenderer.systemSetting.groupOperations')
                }}</span>
            </div>
            <div class="button-group">
                <button class="action-btn" @click="handleBackupNow">
                    {{ t('dialogRenderer.systemSetting.backupNow') }}
                </button>
                <button class="action-btn" @click="handleRestore">
                    {{ t('dialogRenderer.systemSetting.restoreFromBackup') }}
                </button>
            </div>
            <p v-if="status" class="backup-status">
                {{ status }}
            </p>
        </div>
    </div>
</template>

<script setup lang="ts">
/**
 * 备份与恢复页签（设置页拆分 P0；原 SystemSettingDialog.vue 的 activePanel === 'backup' 区段）。
 *
 * 契约：props.settings 为壳层共享草稿（只读，读取 backupCount 作为「立即备份」保留数量）；
 * emit('update', patch) 上报字段修改；emit('reload') 请求壳层在恢复成功后重新加载配置
 * （拆分前由对话框直接调用 loadSettings，现改为面板事件，壳层统一承担加载职责）。
 *
 * P1-FE-06：备份/恢复都复用既有 CONFIG 通道（configName = 'backup'），不新增 IPC 通道。
 */
import { ref } from 'vue'
import type { ConfigBackupState } from '../../../../../../shared/types'
import { t } from '../../../../common/i18n'
import InfoTip from '../../../common/InfoTip.vue'
import { logger } from '../../../../common/logger'
import { SYSTEM_BACKUP_CONFIG_NAME, type SystemDialogSettings } from './model'
import { usePanelFields } from './panel-model'

const props = defineProps<{ settings: SystemDialogSettings }>()
const emit = defineEmits<{
    (e: 'update', patch: Partial<SystemDialogSettings>): void
    (e: 'reload'): void
}>()

const field = usePanelFields(
    () => props.settings,
    (patch) => emit('update', patch)
)

const enableAutoBackup = field('enableAutoBackup')
const backupInterval = field('backupInterval')
const backupCount = field('backupCount')

/** P1-FE-06：备份/恢复操作结果提示（成功后展示备份名与文件数） */
const status = ref('')

/**
 * P1-FE-06：「立即备份」——主进程把配置目录拷贝到 ~/.baizenotes/config-backups/，
 * 保留数量取当前草稿的 backupCount。结果写入 status 供用户确认。
 */
async function handleBackupNow(): Promise<void> {
    status.value = ''
    try {
        const ok = await window.api.config.write(SYSTEM_BACKUP_CONFIG_NAME, {
            action: 'create',
            keep: props.settings.backupCount
        })
        if (!ok) {
            status.value = t('dialogRenderer.systemSetting.backupStatusFailed')
            return
        }
        const state = await window.api.config.read<ConfigBackupState>(SYSTEM_BACKUP_CONFIG_NAME)
        const latest = state?.backups?.[0]
        status.value = latest
            ? t('dialogRenderer.systemSetting.backupStatusSuccess', {
                  name: latest.name,
                  count: latest.fileCount
              })
            : t('dialogRenderer.systemSetting.backupStatusFailed')
    } catch (error) {
        logger.error('配置备份失败:', error)
        status.value = t('dialogRenderer.systemSetting.backupStatusFailed')
    }
}

/**
 * P1-FE-06：「从备份恢复」——恢复到最近一次备份（读取备份列表取最新），
 * 主进程拷回配置目录并重新载入各 store，随后请求壳层刷新对话框显示。
 */
async function handleRestore(): Promise<void> {
    status.value = ''
    try {
        const state = await window.api.config.read<ConfigBackupState>(SYSTEM_BACKUP_CONFIG_NAME)
        const name = state?.latest ?? state?.backups?.[0]?.name
        if (!name) {
            status.value = t('dialogRenderer.systemSetting.restoreStatusNoBackup')
            return
        }
        const ok = await window.api.config.write(SYSTEM_BACKUP_CONFIG_NAME, {
            action: 'restore',
            name
        })
        if (!ok) {
            status.value = t('dialogRenderer.systemSetting.restoreStatusFailed')
            return
        }
        status.value = t('dialogRenderer.systemSetting.restoreStatusSuccess', { name })
        emit('reload')
    } catch (error) {
        logger.error('从备份恢复失败:', error)
        status.value = t('dialogRenderer.systemSetting.restoreStatusFailed')
    }
}
</script>

<style scoped>
@import './settings-panel.css';

/* 备份操作按钮组 */
.button-group {
    display: flex;
    gap: 12px;
}

.action-btn {
    padding: 10px 20px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--card-bg);
    color: var(--text-color);
    font-size: 13px;
    cursor: pointer;
    transition: all 0.2s;
}

.action-btn:hover {
    border-color: var(--accent-color);
    color: var(--accent-color);
}

/* 备份/恢复结果提示 */
.backup-status {
    margin-top: 12px;
    font-size: 12px;
    color: var(--secondary-text-color);
    word-break: break-all;
}
</style>
