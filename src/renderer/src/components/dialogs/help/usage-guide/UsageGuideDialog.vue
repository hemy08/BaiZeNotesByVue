<template>
    <BaseDialog
        :visible="state.visible"
        :title="t('menu.help.guide')"
        width="min(980px, 94vw)"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="usage-guide-body">
            <iframe
                class="usage-guide-frame"
                :src="guideUrl"
                :title="t('menu.help.guide')"
                sandbox="allow-same-origin"
                referrerpolicy="no-referrer"
            ></iframe>
        </div>
        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn-usage-guide-close"
                @click="handleClose"
            >
                {{ t('common.close') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 帮助 → 使用指导：用 iframe 承载随安装包分发的本地 HTML 指南。
 *
 * 安全边界：
 * - iframe sandbox 仅 allow-same-origin（与现有 ShowHtmlView 一致），不执行脚本；
 * - 地址来自当前入口页同源的 public 资源，不读取用户任意文件、不走 file://；
 * - 不新增 IPC/CSP 例外。
 */
import { computed } from 'vue'
import BaseDialog from '../../BaseDialog.vue'
import { t } from '../../../../common/i18n'
import {
    closeUsageGuideDialogState,
    getUsageGuideUrl,
    usageGuideDialogState
} from './usage-guide-state'

const state = usageGuideDialogState
const guideUrl = computed(() => getUsageGuideUrl())

function handleClose(): void {
    closeUsageGuideDialogState()
}
</script>

<style scoped>
.usage-guide-body {
    width: 100%;
    min-height: 68vh;
    display: flex;
    padding: 0;
    overflow: hidden;
    background: var(--bg-primary, #fbf9fe);
}

.usage-guide-frame {
    width: 100%;
    min-height: 68vh;
    border: 0;
    display: block;
    background: var(--bg-primary, #fff);
}

.btn-usage-guide-close {
    min-width: 88px;
}
</style>
