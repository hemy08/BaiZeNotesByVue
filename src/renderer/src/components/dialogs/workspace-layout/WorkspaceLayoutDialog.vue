<template>
    <BaseDialog
        :visible="state.visible"
        :title="t('dialogRenderer.workspaceLayout.title')"
        width="min(680px, 92vw)"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="layout-dialog-body">
            <p class="layout-description">{{ t('dialogRenderer.workspaceLayout.description') }}</p>

            <section class="current-layout" aria-live="polite">
                <strong>{{ t('dialogRenderer.workspaceLayout.current') }}</strong>
                <span>{{ currentSummary }}</span>
            </section>

            <section class="profile-list" :aria-label="t('dialogRenderer.workspaceLayout.title')">
                <article
                    v-for="profile in profiles"
                    :key="profile.id"
                    class="profile-card"
                    :class="{ 'profile-card--builtin': profile.builtin }"
                >
                    <div class="profile-main">
                        <div class="profile-title-row">
                            <strong>{{ displayName(profile) }}</strong>
                            <span v-if="profile.builtin" class="profile-badge">
                                {{ t('dialogRenderer.workspaceLayout.builtin') }}
                            </span>
                        </div>
                        <small class="profile-detail">
                            {{ viewModeLabel(profile.viewMode) }} ·
                            {{
                                profile.resourceManagerVisible
                                    ? t('dialogRenderer.workspaceLayout.resourceVisible')
                                    : t('dialogRenderer.workspaceLayout.resourceHidden')
                            }}
                            ·
                            {{
                                t('dialogRenderer.workspaceLayout.width', {
                                    width: profile.resourceManagerWidth
                                })
                            }}
                        </small>
                    </div>
                    <div class="profile-actions">
                        <button
                            type="button"
                            class="dialog-btn dialog-btn--primary layout-apply"
                            @click="handleApply(profile)"
                        >
                            {{ t('dialogRenderer.workspaceLayout.apply') }}
                        </button>
                        <button
                            v-if="!profile.builtin"
                            type="button"
                            class="dialog-btn dialog-btn--secondary layout-delete"
                            @click="handleDelete(profile)"
                        >
                            {{ t('dialogRenderer.workspaceLayout.delete') }}
                        </button>
                    </div>
                </article>
            </section>

            <p v-if="!customProfiles.length" class="layout-empty-hint">
                {{ t('dialogRenderer.workspaceLayout.noCustom') }}
            </p>

            <section class="save-layout-row">
                <input
                    v-model="layoutName"
                    class="layout-name-input"
                    type="text"
                    maxlength="40"
                    :placeholder="t('dialogRenderer.workspaceLayout.savePlaceholder')"
                    @keydown.enter.prevent="handleSave"
                />
                <button
                    type="button"
                    class="dialog-btn dialog-btn--primary layout-save"
                    :disabled="!layoutName.trim()"
                    @click="handleSave"
                >
                    {{ t('dialogRenderer.workspaceLayout.saveCurrent') }}
                </button>
            </section>
            <p v-if="message" class="layout-message" role="status">{{ message }}</p>
        </div>
        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary layout-close"
                @click="handleClose"
            >
                {{ t('common.close') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * E11：工作区布局 / 多配置对话框。
 * 应用布局只广播 CustomEvent；资源管理器与编辑区各自消费，不直接跨组件改状态。
 */
import { computed, ref, watch } from 'vue'
import BaseDialog from '../BaseDialog.vue'
import { t } from '../../../common/i18n'
import {
    applyWorkspaceLayout,
    currentWorkspaceLayout,
    deleteCustomWorkspaceLayout,
    getAllWorkspaceLayouts,
    saveCurrentWorkspaceLayout,
    type WorkspaceLayoutProfile,
    type WorkspaceLayoutViewMode
} from '../../Markdown/workspace-layout'
import {
    closeWorkspaceLayoutDialogState,
    workspaceLayoutDialogState
} from './workspace-layout-state'

const state = workspaceLayoutDialogState
const profiles = ref<WorkspaceLayoutProfile[]>(getAllWorkspaceLayouts())
const customProfiles = computed(() => profiles.value.filter((profile) => !profile.builtin))
const layoutName = ref('')
const message = ref('')

const currentSummary = computed(
    () =>
        `${viewModeLabel(currentWorkspaceLayout.viewMode)} · ${
            currentWorkspaceLayout.resourceManagerVisible
                ? t('dialogRenderer.workspaceLayout.resourceVisible')
                : t('dialogRenderer.workspaceLayout.resourceHidden')
        } · ${t('dialogRenderer.workspaceLayout.width', {
            width: currentWorkspaceLayout.resourceManagerWidth
        })}`
)

function viewModeLabel(mode: WorkspaceLayoutViewMode): string {
    return t(`dialogRenderer.workspaceLayout.viewModes.${mode}`)
}

function displayName(profile: WorkspaceLayoutProfile): string {
    return profile.labelKey ? t(profile.labelKey) : (profile.name ?? '')
}

function refreshProfiles(): void {
    profiles.value = getAllWorkspaceLayouts()
}

watch(
    () => state.visible,
    (visible) => {
        if (visible) {
            message.value = ''
            refreshProfiles()
        }
    }
)

function handleClose(): void {
    closeWorkspaceLayoutDialogState()
}

function handleApply(profile: WorkspaceLayoutProfile): void {
    applyWorkspaceLayout(profile)
    closeWorkspaceLayoutDialogState()
}

function handleSave(): void {
    const saved = saveCurrentWorkspaceLayout(layoutName.value)
    if (!saved) {
        message.value = t('dialogRenderer.workspaceLayout.saveFailed')
        return
    }
    layoutName.value = ''
    refreshProfiles()
    message.value = t('dialogRenderer.workspaceLayout.saved', { name: saved.name ?? '' })
}

function handleDelete(profile: WorkspaceLayoutProfile): void {
    const deleted = deleteCustomWorkspaceLayout(profile.id)
    refreshProfiles()
    message.value = deleted
        ? t('dialogRenderer.workspaceLayout.deleted', { name: displayName(profile) })
        : t('dialogRenderer.workspaceLayout.deleteFailed')
}
</script>

<style scoped>
/* 遗留项 6 说明（2026-11-27）：本文件历史样式引用了 --text-primary / --bg-primary /
   --bg-secondary 等从未在主题层定义过的变量名（实际生效值是兜底色），本轮只清理
   已定义令牌（--border-color / --accent-color）的冗余颜色兜底，并把与 --ui-bg-elevated
   默认值等值的白底兜底改为语义令牌；其余未定义变量名的迁移需先补主题令牌定义，见
   《硬编码颜色清理-1.5.5-P2B》报告的「未定义令牌兜底」类别。 */
.layout-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 14px;
    width: 100%;
    color: var(--text-primary, #252233);
}

.layout-description,
.layout-empty-hint,
.layout-message {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--text-secondary, #6d6980);
}

.current-layout {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--bg-secondary, #f7f3fb);
    font-size: 13px;
}

.profile-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 40vh;
    overflow-y: auto;
}

.profile-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 10px 12px;
    border: 1px solid var(--border-color);
    border-radius: 8px;
    background: var(--ui-bg-elevated);
}

.profile-card--builtin {
    background: var(--bg-secondary, #fbf9fe);
}

.profile-main {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
}

.profile-title-row {
    display: flex;
    align-items: center;
    gap: 8px;
}

.profile-badge {
    font-size: 11px;
    padding: 1px 6px;
    border-radius: 999px;
    color: var(--accent-color);
    background: var(--bg-secondary, #f1ebf9);
}

.profile-detail {
    color: var(--text-secondary, #6d6980);
    overflow-wrap: anywhere;
}

.profile-actions {
    display: flex;
    gap: 6px;
    flex: 0 0 auto;
}

.save-layout-row {
    display: flex;
    gap: 8px;
}

.layout-name-input {
    flex: 1;
    min-width: 0;
    padding: 7px 9px;
    border: 1px solid var(--border-color);
    border-radius: 6px;
    background: var(--ui-bg-elevated);
    color: var(--text-primary, #252233);
}
</style>
