<template>
    <!--
        1.5.7 体验微调（用户反馈批次 A4）：工作区模式切换确认对话框。
        - 入口：右侧边栏 AI 入口（传统模式）与编辑工具条右侧的模式切换按钮；
        - 文案复用「系统设置 → 功能」的确认文案键（同一语义，不重复维护两套词条）；
        - 确认 = 先初始化 raw/ 与 wiki/（主进程白名单通道），成功才写入工作区模式配置并
          展开 AI 面板；Esc / 关闭按钮 / 「取消」= 取消切换（不初始化、不写配置）。
        - 使用模态 BaseDialog 外壳（UI-11：统一外壳/a11y/焦点管理，禁止复制外壳结构）。
    -->
    <BaseDialog
        :visible="true"
        :title="t('dialogRenderer.systemSetting.features.workspaceModeConfirmTitle')"
        :aria-describedby="messageId"
        width-size="confirm"
        reset-position-on-open
        :close-on-overlay="false"
        container-class="workspace-mode-switch-dialog"
        @close="handleCancel"
    >
        <div class="workspace-mode-switch-content">
            <p :id="messageId" class="workspace-mode-switch-message">
                {{ t('dialogRenderer.systemSetting.features.workspaceModeConfirmMessage') }}
            </p>
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn btn-cancel"
                :disabled="workspaceModeSwitchState.busy"
                @click="handleCancel"
            >
                {{ t('common.cancel') }}
            </button>
            <button
                type="button"
                class="dialog-btn dialog-btn--primary btn btn-confirm"
                :disabled="workspaceModeSwitchState.busy"
                @click="handleConfirm"
            >
                {{ t('dialogRenderer.systemSetting.features.workspaceModeConfirmOk') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 工作区模式切换确认对话框（1.5.7 体验微调 A4）。
 *
 * 只负责展示与调用 composable：切换流程（初始化 → 写配置 → 展开面板）在
 * `composables/useWorkspaceModeSwitch.ts` 中实现，右侧边栏入口与工具条按钮共用同一份状态。
 * 宿主（`WorkSpace.vue`）在 `workspaceModeSwitchState.visible` 为 true 时挂载本组件。
 */
import { useId } from 'vue'
import { t } from '../../../common/i18n'
import BaseDialog from '../BaseDialog.vue'
import {
    cancelWorkspaceModeSwitch,
    confirmSwitchToLlmWiki,
    workspaceModeSwitchState
} from '../../../composables/useWorkspaceModeSwitch'

/** 正文 id（写入 BaseDialog 的 aria-describedby，读屏可关联说明文案） */
const messageId = useId()

/** 取消：关闭对话框，不初始化、不写配置（保持原模式） */
function handleCancel(): void {
    cancelWorkspaceModeSwitch()
}

/** 确认：初始化成功才写配置并展开 AI 面板；失败由 composable 给出可见提示 */
async function handleConfirm(): Promise<void> {
    await confirmSwitchToLlmWiki()
}
</script>

<style scoped>
/* 正文内边距走密度令牌（--ui-pad 8/12/16），颜色走语义令牌（四风格 × 三密度零硬编码） */
.workspace-mode-switch-content {
    padding: var(--ui-pad, 12px);
}

.workspace-mode-switch-message {
    margin: 0;
    font-size: var(--ui-font-size, 13px);
    line-height: 1.6;
    color: var(--ui-text, var(--theme-text-color));
}
</style>
