<template>
    <!--
        1.5.7 LLM Wiki 迁移批次 M2：批量编译对话框（BaseDialog 外壳，模态）。
        - 准备：读取 AI 配置 / 工作区目录树 / 既有 wiki 页面 → 展示范围摘要、文件数、增量预检、
          远程模型隐私提示；AI 未配置时阻止启动并引导配置；
        - 执行：进度条 + 当前文件 + 已处理列表；暂停（当前文件完成后停）/ 继续 / 取消；
        - 审批：全量/指定目录逐文件审批、分批模式每批集中审批（列表切换 + 逐项应用/跳过）；
          人工修改冲突需显式选择「跳过 / 覆盖 / 查看 diff 后手动确认」；
        - 完成：成功/跳过/冲突/失败/取消汇总 + 单项失败重试 + 重新编译全部 + 打开编译结果。
        展示部分复用 `LlmIngestDiffView`（diff 展示与单文件命令同源）。
    -->
    <BaseDialog
        :visible="true"
        :title="t('editorUi.batchCompile.title')"
        :aria-describedby="descriptionId"
        width-size="complex"
        reset-position-on-open
        :close-on-overlay="false"
        container-class="batch-compile-dialog"
        @close="handleClose"
    >
        <div class="batch-compile" :data-testid="`batch-compile-${state.phase}`">
            <p :id="descriptionId" class="batch-subtitle">
                {{ t('editorUi.batchCompile.subtitle') }}
            </p>

            <!-- 准备中 -->
            <p
                v-if="state.phase === 'idle' || state.phase === 'preparing'"
                class="batch-status"
                role="status"
                data-testid="batch-preparing"
            >
                <span class="batch-spinner" aria-hidden="true"></span>
                <span>{{ t('editorUi.batchCompile.preparing') }}</span>
            </p>

            <!-- 阻止启动（未配置 AI / 无工作区 / 无文件 / 目录树失败） -->
            <div
                v-else-if="state.phase === 'blocked'"
                class="batch-warning batch-warning--blocked"
                role="alert"
                data-testid="batch-blocked"
            >
                <strong class="batch-warning-title">
                    {{ t('editorUi.batchCompile.blockedTitle') }}
                </strong>
                <p class="batch-warning-body">{{ blockedText }}</p>
                <div v-if="state.blockedReason?.detail" class="batch-warning-detail">
                    {{
                        t('editorUi.batchCompile.blockedDetail', {
                            detail: state.blockedReason.detail
                        })
                    }}
                </div>
                <div class="batch-actions">
                    <button
                        v-if="showOpenAiConfigEntry"
                        type="button"
                        class="dialog-btn dialog-btn--secondary"
                        data-action="open-ai-config"
                        @click="handleOpenAiConfig"
                    >
                        {{ t('editorUi.batchCompile.openAiConfig') }}
                    </button>
                    <button
                        type="button"
                        class="dialog-btn dialog-btn--secondary"
                        data-action="retry-prepare"
                        data-testid="batch-retry-prepare"
                        @click="handleRetryPrepare"
                    >
                        {{ t('editorUi.batchCompile.blockedRetry') }}
                    </button>
                </div>
            </div>

            <!-- 启动前参数摘要 -->
            <template v-else-if="state.phase === 'ready'">
                <dl class="batch-summary" data-testid="batch-summary">
                    <div class="batch-summary-item">
                        <dt>{{ t('editorUi.batchCompile.scopeLabel') }}</dt>
                        <dd data-testid="batch-scope">{{ scopeText }}</dd>
                    </div>
                    <div class="batch-summary-item">
                        <dt>{{ t('editorUi.batchCompile.fileCountLabel') }}</dt>
                        <dd data-testid="batch-file-count">
                            {{ t('editorUi.batchCompile.fileCount', { count: state.total }) }}
                        </dd>
                    </div>
                    <div class="batch-summary-item">
                        <dt>{{ t('editorUi.batchCompile.aiModelLabel') }}</dt>
                        <dd data-testid="batch-ai-model">
                            {{
                                state.aiConfig?.defaultModelName ??
                                t('editorUi.batchCompile.aiModelUnknown')
                            }}
                        </dd>
                    </div>
                </dl>

                <p v-if="state.request.degraded" class="batch-hint" data-testid="batch-degraded">
                    {{ t('editorUi.batchCompile.degraded') }}
                </p>

                <!-- 远程模型隐私提示（启动前必须确认；不提供「仅用本地模型」：AI.INGEST 无 modelId） -->
                <div
                    v-if="showRemoteWarning"
                    class="batch-warning batch-warning--remote"
                    role="alert"
                    data-testid="batch-remote-warning"
                >
                    <strong class="batch-warning-title">
                        {{ t('editorUi.batchCompile.remoteTitle') }}
                    </strong>
                    <p class="batch-warning-body">
                        {{
                            t('editorUi.batchCompile.remoteBody', {
                                model: state.aiConfig?.defaultModelName ?? ''
                            })
                        }}
                    </p>
                    <p class="batch-hint" data-testid="batch-remote-local-hint">
                        {{ t('editorUi.batchCompile.remoteLocalHint') }}
                    </p>
                </div>

                <fieldset class="batch-mode" data-testid="batch-mode">
                    <legend class="batch-section-title">
                        {{ t('editorUi.batchCompile.incrementalTitle') }}
                    </legend>
                    <label class="batch-choice">
                        <input
                            type="radio"
                            name="batch-compile-mode"
                            value="incremental"
                            :checked="startMode === 'incremental'"
                            data-testid="batch-mode-incremental"
                            @change="selectStartMode('incremental')"
                        />
                        <span>{{ t('editorUi.batchCompile.incrementalLabel') }}</span>
                    </label>
                    <p class="batch-hint">
                        {{ t('editorUi.batchCompile.incrementalHint') }}
                    </p>
                    <p class="batch-hint" data-testid="batch-preview-skip">
                        {{
                            t('editorUi.batchCompile.previewSkip', {
                                count: state.previewSkipCount
                            })
                        }}
                    </p>
                    <label class="batch-choice">
                        <input
                            type="radio"
                            name="batch-compile-mode"
                            value="all"
                            :checked="startMode === 'all'"
                            data-testid="batch-mode-all"
                            @change="selectStartMode('all')"
                        />
                        <span>{{ t('editorUi.batchCompile.recompileAllLabel') }}</span>
                    </label>
                    <p class="batch-hint">
                        {{ t('editorUi.batchCompile.recompileAllHint') }}
                    </p>
                </fieldset>

                <p
                    v-if="state.previewConflictCount > 0"
                    class="batch-hint batch-hint--warn"
                    role="status"
                    data-testid="batch-preview-conflict"
                >
                    {{
                        t('editorUi.batchCompile.previewConflict', {
                            count: state.previewConflictCount
                        })
                    }}
                </p>
            </template>

            <!-- 执行中 / 已暂停 -->
            <template v-else-if="state.phase === 'generating' || state.phase === 'paused'">
                <div
                    class="batch-progress"
                    role="progressbar"
                    :aria-valuenow="progressPercent"
                    aria-valuemin="0"
                    :aria-valuemax="state.total"
                    :aria-label="t('editorUi.batchCompile.progressLabel')"
                    data-testid="batch-progressbar"
                >
                    <div
                        class="batch-progress-fill"
                        :style="{ width: `${progressPercent}%` }"
                    ></div>
                </div>
                <p class="batch-status" role="status" data-testid="batch-progress">
                    {{
                        t('editorUi.batchCompile.progress', {
                            processed: state.counts.processed,
                            total: state.counts.total
                        })
                    }}
                    <span v-if="state.batchCount > 1" class="batch-batch-progress">
                        {{
                            t('editorUi.batchCompile.batchProgress', {
                                current: Math.min(state.batchIndex + 1, state.batchCount),
                                total: state.batchCount
                            })
                        }}
                    </span>
                </p>
                <p class="batch-hint" data-testid="batch-current-file">
                    {{
                        t('editorUi.batchCompile.currentFile', {
                            path: currentRawPath || t('editorUi.batchCompile.none')
                        })
                    }}
                </p>
                <p v-if="state.pausePending" class="batch-hint" data-testid="batch-pause-pending">
                    {{ t('editorUi.batchCompile.pausePending') }}
                </p>
                <p v-if="state.phase === 'paused'" class="batch-hint" data-testid="batch-paused">
                    {{ t('editorUi.batchCompile.pausedHint') }}
                </p>

                <div class="batch-stats" data-testid="batch-stats">
                    <span class="batch-stat">{{
                        t('editorUi.batchCompile.summaryApplied', { count: state.counts.applied })
                    }}</span>
                    <span class="batch-stat">{{
                        t('editorUi.batchCompile.summarySkipped', { count: state.counts.skipped })
                    }}</span>
                    <span class="batch-stat">{{
                        t('editorUi.batchCompile.summaryConflictSkipped', {
                            count: state.counts.conflictSkipped
                        })
                    }}</span>
                    <span class="batch-stat">{{
                        t('editorUi.batchCompile.summaryFailed', { count: state.counts.failed })
                    }}</span>
                </div>

                <ul class="batch-list" data-testid="batch-processed-list">
                    <li
                        v-for="item in processedItems"
                        :key="item.id"
                        class="batch-list-item"
                        :data-status="item.status"
                    >
                        <span class="batch-list-path">{{ item.rawRelativePath }}</span>
                        <span class="batch-list-status" :class="`is-${item.status}`">
                            {{ statusLabel(item.status) }}
                        </span>
                    </li>
                </ul>
            </template>

            <!-- 审批（逐文件或每批集中） -->
            <template v-else-if="state.phase === 'approving'">
                <p class="batch-section-title" data-testid="batch-approval-title">
                    {{ t('editorUi.batchCompile.approvalTitle') }}
                    <span class="batch-batch-progress">
                        {{
                            t('editorUi.batchCompile.batchProgress', {
                                current: Math.min(state.batchIndex + 1, state.batchCount),
                                total: state.batchCount
                            })
                        }}
                    </span>
                </p>
                <p class="batch-hint">
                    {{ t('editorUi.batchCompile.approvalCount', { count: pendingDraftCount }) }}
                </p>
                <p class="batch-hint">{{ t('editorUi.batchCompile.approvalSelectHint') }}</p>

                <div class="batch-approval" data-testid="batch-approval">
                    <ul
                        class="batch-draft-list"
                        data-testid="batch-draft-list"
                        :aria-label="t('editorUi.batchCompile.approvalListLabel')"
                    >
                        <li v-for="(entry, index) in state.drafts" :key="entry.itemId">
                            <button
                                type="button"
                                class="batch-draft-item"
                                :class="{ 'is-active': entry.itemId === state.activeDraftId }"
                                :data-testid="`batch-draft-${index}`"
                                :data-status="itemStatus(entry.itemId)"
                                @click="queue.setActiveDraft(entry.itemId)"
                            >
                                <span class="batch-draft-path">{{ entry.draft.sourcePath }}</span>
                                <span
                                    v-if="entry.conflict"
                                    class="batch-badge batch-badge--conflict"
                                >
                                    {{ t('editorUi.batchCompile.conflictBadge') }}
                                </span>
                                <span class="batch-draft-status">
                                    {{ statusLabel(itemStatus(entry.itemId)) }}
                                </span>
                            </button>
                        </li>
                    </ul>

                    <div
                        v-if="activeDraft"
                        class="batch-draft-detail"
                        data-testid="batch-draft-detail"
                    >
                        <div
                            v-if="activeDraft.conflict"
                            class="batch-warning batch-warning--conflict"
                            role="alert"
                            data-testid="batch-conflict"
                        >
                            <strong class="batch-warning-title">
                                {{ t('editorUi.batchCompile.conflictTitle') }}
                            </strong>
                            <p class="batch-warning-body">{{ activeConflictText }}</p>
                            <p class="batch-hint">
                                {{ activeDraft.conflict.targetPath }}
                            </p>
                            <div class="batch-actions">
                                <button
                                    type="button"
                                    class="dialog-btn dialog-btn--secondary"
                                    data-action="conflict-skip"
                                    data-testid="batch-conflict-skip"
                                    @click="queue.skipDraft(activeDraft.itemId)"
                                >
                                    {{ t('editorUi.batchCompile.conflictSkip') }}
                                </button>
                                <button
                                    type="button"
                                    class="dialog-btn dialog-btn--secondary"
                                    data-action="conflict-overwrite"
                                    data-testid="batch-conflict-overwrite"
                                    :disabled="isDraftBusy(activeDraft.itemId)"
                                    @click="queue.approveDraft(activeDraft.itemId)"
                                >
                                    {{ t('editorUi.batchCompile.conflictOverwrite') }}
                                </button>
                            </div>
                            <p class="batch-hint">
                                {{ t('editorUi.batchCompile.conflictReviewHint') }}
                            </p>
                        </div>

                        <LlmIngestDiffView :draft="activeDraft.draft" />

                        <p
                            v-if="activeDraftError"
                            class="batch-error"
                            role="alert"
                            data-testid="batch-draft-error"
                        >
                            {{
                                t('editorUi.batchCompile.applyFailed', { error: activeDraftError })
                            }}
                        </p>
                    </div>
                </div>
            </template>

            <!-- 完成汇总 -->
            <template v-else-if="state.phase === 'finished'">
                <h4 class="batch-section-title" data-testid="batch-finished-title">
                    {{
                        state.canceled
                            ? t('editorUi.batchCompile.canceledTitle')
                            : t('editorUi.batchCompile.summaryTitle')
                    }}
                </h4>
                <p v-if="state.canceled" class="batch-hint" data-testid="batch-canceled-hint">
                    {{ t('editorUi.batchCompile.canceledHint') }}
                </p>
                <div class="batch-stats" data-testid="batch-result-summary">
                    <span class="batch-stat">{{
                        t('editorUi.batchCompile.summaryApplied', { count: state.counts.applied })
                    }}</span>
                    <span class="batch-stat">{{
                        t('editorUi.batchCompile.summarySkipped', { count: state.counts.skipped })
                    }}</span>
                    <span class="batch-stat">{{
                        t('editorUi.batchCompile.summaryConflictSkipped', {
                            count: state.counts.conflictSkipped
                        })
                    }}</span>
                    <span class="batch-stat">{{
                        t('editorUi.batchCompile.summaryFailed', { count: state.counts.failed })
                    }}</span>
                    <span class="batch-stat">{{
                        t('editorUi.batchCompile.summaryCanceled', { count: state.counts.canceled })
                    }}</span>
                </div>

                <div
                    v-if="failedItems.length > 0"
                    class="batch-result-group"
                    data-testid="batch-failed-list"
                >
                    <p class="batch-section-title">
                        {{ t('editorUi.batchCompile.failedListTitle') }}
                    </p>
                    <ul class="batch-list">
                        <li v-for="item in failedItems" :key="item.id" class="batch-list-item">
                            <span class="batch-list-path">{{ item.rawRelativePath }}</span>
                            <span class="batch-list-status is-failed">{{ item.error }}</span>
                            <button
                                type="button"
                                class="dialog-btn dialog-btn--secondary batch-retry-btn"
                                data-action="retry-item"
                                :data-testid="`batch-retry-${item.id}`"
                                :disabled="retryBusy"
                                @click="handleRetryItem(item.id)"
                            >
                                {{
                                    retryBusy
                                        ? t('editorUi.batchCompile.retrying')
                                        : t('editorUi.batchCompile.retry')
                                }}
                            </button>
                        </li>
                    </ul>
                </div>

                <div v-if="skippedItems.length > 0" class="batch-result-group">
                    <p class="batch-section-title">
                        {{ t('editorUi.batchCompile.skippedListTitle') }}
                    </p>
                    <ul class="batch-list" data-testid="batch-skipped-list">
                        <li
                            v-for="item in skippedItems"
                            :key="item.id"
                            class="batch-list-item"
                            :data-status="item.status"
                        >
                            <span class="batch-list-path">{{ item.rawRelativePath }}</span>
                            <span class="batch-list-status" :class="`is-${item.status}`">
                                {{ statusLabel(item.status) }}
                            </span>
                        </li>
                    </ul>
                </div>

                <p v-if="notice" class="batch-hint" role="status" data-testid="batch-notice">
                    {{ notice }}
                </p>
            </template>

            <!-- 运行期意外错误（非逐项失败） -->
            <p v-if="state.error" class="batch-error" role="alert" data-testid="batch-error">
                {{ state.error }}
            </p>
        </div>

        <template #footer>
            <!-- 阻止启动 -->
            <template v-if="state.phase === 'blocked'">
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary btn btn-cancel"
                    data-testid="batch-close"
                    @click="handleClose"
                >
                    {{ t('editorUi.batchCompile.close') }}
                </button>
            </template>

            <!-- 启动前参数摘要 -->
            <template v-else-if="state.phase === 'ready'">
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary btn btn-cancel"
                    data-testid="batch-cancel"
                    @click="handleClose"
                >
                    {{ t('editorUi.batchCompile.cancel') }}
                </button>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--primary btn btn-confirm"
                    data-testid="batch-start"
                    @click="handleStart"
                >
                    {{
                        showRemoteWarning
                            ? t('editorUi.batchCompile.remoteContinue')
                            : t('editorUi.batchCompile.start')
                    }}
                </button>
            </template>

            <!-- 执行中 / 暂停 -->
            <template v-else-if="state.phase === 'generating' || state.phase === 'paused'">
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary btn btn-cancel"
                    data-testid="batch-cancel-run"
                    @click="handleCancelRun"
                >
                    {{ t('editorUi.batchCompile.cancelRun') }}
                </button>
                <button
                    v-if="state.phase === 'generating'"
                    type="button"
                    class="dialog-btn dialog-btn--secondary"
                    data-testid="batch-pause"
                    @click="queue.pause()"
                >
                    {{ t('editorUi.batchCompile.pause') }}
                </button>
                <button
                    v-else
                    type="button"
                    class="dialog-btn dialog-btn--primary btn btn-confirm"
                    data-testid="batch-resume"
                    @click="queue.resume()"
                >
                    {{ t('editorUi.batchCompile.resume') }}
                </button>
            </template>

            <!-- 审批 -->
            <template v-else-if="state.phase === 'approving'">
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary btn btn-cancel"
                    data-testid="batch-cancel-approval"
                    @click="handleCancelRun"
                >
                    {{ t('editorUi.batchCompile.cancelRun') }}
                </button>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary"
                    data-testid="batch-skip"
                    :disabled="!approvalActionable"
                    @click="handleSkipActive"
                >
                    {{ t('editorUi.batchCompile.skipItem') }}
                </button>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--primary btn btn-confirm"
                    data-testid="batch-apply"
                    :disabled="!approvalActionable"
                    @click="handleApplyActive"
                >
                    {{
                        isDraftApplying
                            ? t('editorUi.batchCompile.applying')
                            : t('editorUi.batchCompile.applyItem')
                    }}
                </button>
            </template>

            <!-- 完成汇总 -->
            <template v-else-if="state.phase === 'finished'">
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary btn btn-cancel"
                    data-testid="batch-close"
                    @click="handleClose"
                >
                    {{ t('editorUi.batchCompile.close') }}
                </button>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--secondary"
                    data-testid="batch-restart-all"
                    :disabled="restartBusy"
                    @click="handleRestartAll"
                >
                    {{ t('editorUi.batchCompile.restartAll') }}
                </button>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--primary btn btn-confirm"
                    data-testid="batch-open-wiki"
                    :disabled="!state.openablePageAbsolutePath"
                    @click="handleOpenWikiPage"
                >
                    {{ t('editorUi.batchCompile.openWikiHome') }}
                </button>
            </template>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 1.5.7 LLM Wiki 迁移批次 M2：批量编译对话框。
 *
 * ## 数据流
 * 1. `BatchCompileHost` 收到 EventBus `LLM_WIKI_COMPILE_REQUEST` → 打开本对话框并传入
 *    归一化请求（`NormalizedBatchCompileRequest`）；
 * 2. 本组件创建 `BatchCompileQueue`（默认依赖 `createDefaultBatchCompileDeps()`；
 *    单测可经 `deps` prop 注入替身）→ `prepare()` 读取 AI 配置/目录树/wiki 页面索引；
 * 3. 用户选增量/全量并确认（远程模型时启动按钮即隐私确认）→ `start()`；
 * 4. 生成完成进入审批：每项调用 `AI.APPLY_INGEST` 成功后写编译记录；跳过/冲突跳过不写盘；
 * 5. 完成页展示汇总，支持单项重试、重新编译全部、打开编译结果。
 *
 * ## 边界
 * - 不新增 IPC：目录树/READ_HTML/AI.INGEST/AI.APPLY_INGEST/AI.GET_CONFIG 均为既有通道；
 * - 关闭/取消语义：运行中关闭先 `queue.cancel()`（未应用草案不写盘，已应用不回滚）；
 * - 主题：全部颜色/间距消费 `--ui-*` 令牌。
 */
import { computed, onBeforeUnmount, onMounted, ref, useId } from 'vue'
import { t } from '../../common/i18n'
import { logger } from '../../common/logger'
import { createDefaultBatchCompileDeps } from './batch-compile-runtime'
import BaseDialog from '../dialogs/BaseDialog.vue'
import { openAiAssistantDialogState } from '../dialogs/complex/ai-assistant-dialog-state'
import LlmIngestDiffView from './LlmIngestDiffView.vue'
import {
    createBatchCompileQueue,
    type BatchCompileDeps,
    type BatchCompileItemStatus,
    type BatchCompileQueue,
    type BatchCompileQueueSnapshot
} from './batch-compile-queue'
import type { NormalizedBatchCompileRequest } from '../../common/batch-compile'
import type { BatchCompileConflictReason } from '../../common/batch-compile'
import { openWorkspaceFileAtLine } from '../../composables/useWorkspaceSearch'

interface Props {
    /** 本次编译请求（EventBus 载荷归一化结果；缺省 = 全量编译） */
    request?: NormalizedBatchCompileRequest | null
    /** 可注入依赖（单测用；缺省走生产运行时装配） */
    deps?: BatchCompileDeps | null
}

const props = withDefaults(defineProps<Props>(), { request: null, deps: null })

const emit = defineEmits<{
    (e: 'close'): void
}>()

const descriptionId = useId()

/** 创建队列（依赖：优先注入替身；生产为默认装配） */
const injectedDeps = props.deps
const queue: BatchCompileQueue =
    injectedDeps !== null && typeof injectedDeps === 'object'
        ? createBatchCompileQueue(injectedDeps)
        : createBatchCompileQueue(createDefaultBatchCompileDeps())

/** 队列快照（随 onChange 更新，驱动整棵对话框渲染） */
const state = ref<BatchCompileQueueSnapshot>(queue.getState())
const unsubscribe = queue.onChange((snapshot) => {
    state.value = snapshot
})

/** 启动模式（增量 / 重新编译全部） */
const startMode = ref<'incremental' | 'all'>('incremental')
/** 重试/重新编译进行中（按钮禁用，防重复触发） */
const retryBusy = ref(false)
const restartBusy = ref(false)
/** 完成页的行内提示（如打开 wiki 页面失败） */
const notice = ref('')

/** 状态文案键映射（t() 静态键，供 i18n 词典检查） */
const STATUS_LABEL_KEYS: Readonly<Record<BatchCompileItemStatus, string>> = {
    pending: 'editorUi.batchCompile.statusPending',
    skipped: 'editorUi.batchCompile.statusSkipped',
    generating: 'editorUi.batchCompile.statusGenerating',
    waiting: 'editorUi.batchCompile.statusWaiting',
    applying: 'editorUi.batchCompile.statusApplying',
    applied: 'editorUi.batchCompile.statusApplied',
    'skipped-manual': 'editorUi.batchCompile.statusSkippedManual',
    'conflict-skipped': 'editorUi.batchCompile.statusConflictSkipped',
    failed: 'editorUi.batchCompile.statusFailed',
    canceled: 'editorUi.batchCompile.statusCanceled'
}

/** 冲突原因文案键映射 */
const CONFLICT_LABEL_KEYS: Readonly<Record<BatchCompileConflictReason, string>> = {
    'manual-edit': 'editorUi.batchCompile.conflictManualEdit',
    'manual-create': 'editorUi.batchCompile.conflictManualCreate',
    'source-mismatch': 'editorUi.batchCompile.conflictSourceMismatch',
    unverified: 'editorUi.batchCompile.conflictUnverified'
}

/** 当前活动草案 */
const activeDraft = computed(
    () => state.value.drafts.find((entry) => entry.itemId === state.value.activeDraftId) ?? null
)

/** 当前活动草案对应目标项 */
const activeItem = computed(
    () => state.value.items.find((item) => item.id === state.value.activeDraftId) ?? null
)

/** 当前草案的失败原因（写盘失败时展示） */
const activeDraftError = computed(() =>
    activeItem.value?.status === 'failed' ? (activeItem.value.error ?? '') : ''
)

/** 当前活动草案的冲突说明（无冲突为空串；模板内避免对可空嵌套属性二次取值） */
const activeConflictText = computed(() => {
    const conflict = activeDraft.value?.conflict
    return conflict ? conflictText(conflict.reason) : ''
})

/** 待审批草案数量 */
const pendingDraftCount = computed(
    () =>
        state.value.drafts.filter((entry) => {
            const item = state.value.items.find((candidate) => candidate.id === entry.itemId)
            return item?.status === 'waiting' || item?.status === 'applying'
        }).length
)

/** 审批动作是否可用（活动草案存在且为待审批态） */
const approvalActionable = computed(() => activeItem.value?.status === 'waiting')
/** 活动草案是否正在写盘 */
const isDraftApplying = computed(() => activeItem.value?.status === 'applying')

/** 启动前范围文案 */
const scopeText = computed(() => {
    const request = state.value.request
    if (request.scope === 'directory' && request.directory) {
        return t('editorUi.batchCompile.scopeDirectory', { directory: request.directory })
    }
    if (request.scope === 'batch') {
        return t('editorUi.batchCompile.scopeBatch', { size: request.batchSize })
    }
    return t('editorUi.batchCompile.scopeAll')
})

/** 是否需要远程模型隐私提示（默认模型为远程） */
const showRemoteWarning = computed(() => state.value.aiConfig?.defaultModelRemote === true)

/** 阻止启动文案 */
const blockedText = computed(() => {
    const reason = state.value.blockedReason
    if (!reason) {
        return t('editorUi.batchCompile.unknownError')
    }
    switch (reason.code) {
        case 'not-configured':
            return t('editorUi.batchCompile.blockedNotConfigured')
        case 'config-read-failed':
            return t('editorUi.batchCompile.blockedConfigReadFailed')
        case 'workspace-unavailable':
            return t('editorUi.batchCompile.blockedWorkspace')
        case 'no-files':
            return t('editorUi.batchCompile.blockedNoFiles')
        case 'load-failed':
            return t('editorUi.batchCompile.blockedLoadFailed', {
                error: reason.detail ?? t('editorUi.batchCompile.unknownError')
            })
        default:
            return t('editorUi.batchCompile.unknownError')
    }
})

/** 阻止启动时是否展示「去配置 AI 助手」入口 */
const showOpenAiConfigEntry = computed(() => {
    const code = state.value.blockedReason?.code
    return code === 'not-configured' || code === 'config-read-failed'
})

/** 进度百分比（按已处理数；0–100） */
const progressPercent = computed(() => {
    const total = state.value.counts.total
    if (total <= 0) {
        return 0
    }
    return Math.min(100, Math.round((state.value.counts.processed / total) * 100))
})

/** 当前正在生成的文件相对路径（无则空串） */
const currentRawPath = computed(() => {
    const index = state.value.currentIndex
    if (index < 0 || index >= state.value.items.length) {
        return ''
    }
    return state.value.items[index].rawRelativePath
})

/** 已处理（非待处理）目标列表（展示最近 100 项，防长队列撑爆 DOM） */
const processedItems = computed(() =>
    state.value.items
        .filter((item) => item.status !== 'pending' && item.status !== 'skipped')
        .slice(-100)
)

/** 失败清单（完成页） */
const failedItems = computed(() => state.value.items.filter((item) => item.status === 'failed'))

/** 跳过清单（增量 + 审批跳过 + 冲突跳过，完成页） */
const skippedItems = computed(() =>
    state.value.items.filter(
        (item) =>
            item.status === 'skipped' ||
            item.status === 'skipped-manual' ||
            item.status === 'conflict-skipped'
    )
)

/** 状态文案 */
function statusLabel(status: BatchCompileItemStatus): string {
    return t(STATUS_LABEL_KEYS[status])
}

/** 目标项状态（审批列表徽标用） */
function itemStatus(itemId: string): BatchCompileItemStatus {
    return state.value.items.find((item) => item.id === itemId)?.status ?? 'pending'
}

/** 草案是否忙碌（写盘中禁用冲突覆盖等按钮） */
function isDraftBusy(itemId: string): boolean {
    const status = itemStatus(itemId)
    return status === 'applying' || status === 'applied'
}

/** 冲突原因文案 */
function conflictText(reason: BatchCompileConflictReason): string {
    return t(CONFLICT_LABEL_KEYS[reason])
}

/** 选择启动模式（仅准备阶段可切换） */
function selectStartMode(mode: 'incremental' | 'all'): void {
    startMode.value = mode
}

/** 开始编译（远程模型时本按钮即「我已知晓，继续编译」确认） */
function handleStart(): void {
    void queue.start({
        mode: startMode.value,
        remotePrivacyConfirmed: showRemoteWarning.value
    })
}

/** 取消运行（停止后续；已应用不回滚，未应用不写盘） */
function handleCancelRun(): void {
    queue.cancel()
}

/** 跳过当前审批草案 */
function handleSkipActive(): void {
    if (state.value.activeDraftId) {
        queue.skipDraft(state.value.activeDraftId)
    }
}

/** 应用当前审批草案 */
function handleApplyActive(): void {
    if (state.value.activeDraftId) {
        void queue.approveDraft(state.value.activeDraftId)
    }
}

/** 重试单项失败 */
async function handleRetryItem(itemId: string): Promise<void> {
    if (retryBusy.value) {
        return
    }
    retryBusy.value = true
    notice.value = ''
    try {
        await queue.retryItem(itemId)
    } finally {
        retryBusy.value = false
    }
}

/** 重新编译全部（保留本轮已确认的远程隐私提示） */
async function handleRestartAll(): Promise<void> {
    if (restartBusy.value) {
        return
    }
    restartBusy.value = true
    notice.value = ''
    try {
        await queue.restartAll()
    } finally {
        restartBusy.value = false
    }
}

/** 打开编译结果（首个已应用页面；无则首个 wiki 页面） */
async function handleOpenWikiPage(): Promise<void> {
    const targetPath = state.value.openablePageAbsolutePath
    if (!targetPath) {
        notice.value = t('editorUi.batchCompile.openWikiHomeEmpty')
        return
    }
    notice.value = ''
    const opened = await openWorkspaceFileAtLine(targetPath, 1)
    if (!opened) {
        notice.value = t('editorUi.batchCompile.openWikiHomeFailed')
    }
}

/** 打开 AI 助手配置（未配置阻止启动时；先关闭本对话框避免叠层） */
function handleOpenAiConfig(): void {
    emit('close')
    openAiAssistantDialogState()
}

/** 重试准备（目录树/配置读取失败后重新读取） */
function handleRetryPrepare(): void {
    void queue.prepare(state.value.request)
}

/**
 * 关闭对话框：
 * - 运行中（生成/暂停/审批）→ 先取消（未应用草案不写盘），再关闭；
 * - 准备中 → 直接关闭（队列 dispose 后 prepare 后续步骤自行中止）。
 */
function handleClose(): void {
    const phase = state.value.phase
    if (phase === 'generating' || phase === 'paused' || phase === 'approving') {
        queue.cancel()
    }
    emit('close')
}

onMounted(() => {
    void queue.prepare(props.request ?? undefined)
})

onBeforeUnmount(() => {
    unsubscribe()
    queue.dispose()
    logger.info('[批量编译] 对话框已关闭，队列资源已释放')
})
</script>

<style scoped>
/* 1.5.7 LLM Wiki 迁移批次 M2：批量编译对话框（全部颜色/间距消费 --ui-* 令牌） */
.batch-compile {
    display: flex;
    flex-direction: column;
    gap: var(--ui-pad, 12px);
    min-height: 200px;
    max-height: 62vh;
    padding: var(--ui-pad, 12px);
    overflow: auto;
    color: var(--text-color);
}

.batch-subtitle {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--secondary-text-color);
}

.batch-status {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 16px 0;
    font-size: 13px;
    color: var(--secondary-text-color);
}

.batch-spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--ui-border, var(--border-color));
    border-top-color: var(--ui-accent, var(--accent-color));
    border-radius: 50%;
    animation: batch-spin 0.8s linear infinite;
}

@keyframes batch-spin {
    to {
        transform: rotate(360deg);
    }
}

.batch-warning {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--ui-warning, var(--accent-color));
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-bg-sunken, var(--card-bg));
}

.batch-warning--blocked,
.batch-warning--conflict {
    border-color: var(--ui-danger, var(--danger-color));
}

.batch-warning-title {
    font-size: 13px;
    font-weight: 600;
}

.batch-warning-body {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
}

.batch-warning-detail {
    font-size: 12px;
    color: var(--secondary-text-color);
    word-break: break-all;
}

.batch-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 4px;
}

.batch-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 8px;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-md, 4px);
    background: var(--ui-bg-sunken, var(--card-bg));
}

.batch-summary-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
}

.batch-summary-item dt {
    font-size: 11px;
    color: var(--secondary-text-color);
}

.batch-summary-item dd {
    margin: 0;
    font-size: 13px;
    word-break: break-all;
}

.batch-hint {
    margin: 0;
    font-size: 12px;
    line-height: 1.6;
    color: var(--secondary-text-color);
}

.batch-hint--warn {
    color: var(--ui-warning, var(--accent-color));
}

.batch-error {
    margin: 0;
    font-size: 12px;
    color: var(--ui-danger, var(--danger-color));
}

.batch-section-title {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
}

.batch-mode {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin: 0;
    padding: 10px 12px;
    border: 1px solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-md, 4px);
}

.batch-choice {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    cursor: pointer;
}

.batch-progress {
    height: 8px;
    border-radius: 999px;
    background: var(--ui-bg-sunken, var(--bg-color));
    border: 1px solid var(--ui-border, var(--border-color));
    overflow: hidden;
}

.batch-progress-fill {
    height: 100%;
    background: var(--ui-accent, var(--accent-color));
    transition: width var(--ui-duration-fast, 0.15s) var(--ui-ease-standard, ease);
}

.batch-batch-progress {
    margin-left: 8px;
    color: var(--secondary-text-color);
}

.batch-stats {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-size: 12px;
}

.batch-stat {
    color: var(--secondary-text-color);
}

.batch-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 220px;
    overflow: auto;
}

.batch-list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 8px;
    border-radius: var(--ui-radius-sm, 3px);
    background: var(--ui-bg-sunken, var(--card-bg));
    font-size: 12px;
}

.batch-list-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.batch-list-status {
    color: var(--secondary-text-color);
    white-space: nowrap;
}

.batch-list-status.is-failed {
    color: var(--ui-danger, var(--danger-color));
}

.batch-list-status.is-applied {
    color: var(--ui-success, var(--accent-color));
}

.batch-approval {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
}

.batch-draft-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin: 0;
    padding: 0;
    list-style: none;
    max-height: 160px;
    overflow: auto;
}

.batch-draft-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 6px 8px;
    border: 1px solid var(--ui-border, var(--border-color));
    border-radius: var(--ui-radius-sm, 3px);
    background: var(--ui-bg-sunken, var(--card-bg));
    color: var(--text-color);
    font-size: 12px;
    text-align: left;
    cursor: pointer;
}

.batch-draft-item.is-active {
    border-color: var(--ui-accent, var(--accent-color));
}

.batch-draft-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.batch-draft-status {
    color: var(--secondary-text-color);
    white-space: nowrap;
}

.batch-badge {
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 11px;
    border: 1px solid var(--ui-border, var(--border-color));
}

.batch-badge--conflict {
    color: var(--ui-danger, var(--danger-color));
    border-color: var(--ui-danger, var(--danger-color));
}

.batch-draft-detail {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    overflow: auto;
}

.batch-result-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.batch-retry-btn {
    flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
    .batch-spinner,
    .batch-progress-fill {
        animation: none;
        transition: none;
    }
}
</style>
