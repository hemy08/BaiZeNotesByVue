<template>
    <!--
        B5 附件管理对话框：按「缺失 / 正常 / 孤儿」三区展示工作区附件。
        - 缺失 / 正常分组来自主进程工作区索引快照（既有 FILE.GET_WORKSPACE_INDEX，无新增字段依赖）；
        - 孤儿候选来自新增只读审计 FILE.GET_ATTACHMENT_AUDIT（未被任何 Markdown 引用的附件）；
        - 打开时并行拉取索引与审计；「刷新索引 / 重新审计」分别强制刷新；
        - 孤儿区支持多选 + 对话框内二次确认 + 批量移入系统回收站（FILE.TRASH_ATTACHMENTS），
          逐项展示部分失败原因，完成后刷新索引与审计；
        - 正常附件行支持内联重命名（FILE.RENAME_ATTACHMENT），成功刷新、失败可见提示；
        - 所有用户文案走 `editorUi.attachments.*` 建议键 + 中文兜底（词典由主控补）；
        - IPC 调用全部容错：渲染层 IPC 不可用 / 主进程异常只给对话框内可见提示，不抛错。
    -->
    <BaseDialog
        non-modal
        :visible="state.visible"
        :title="tOr(UI.title, '附件管理')"
        width="980px"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="attachment-body">
            <div class="attachment-toolbar">
                <span class="attachment-target" :title="targetTitle">{{ targetText }}</span>
                <span class="attachment-summary">{{ summaryText }}</span>
            </div>

            <div v-if="initialLoading" class="attachment-placeholder" role="status">
                {{ tOr(UI.loading, '正在加载工作区索引…') }}
            </div>
            <div
                v-else-if="errorCode === 'no-workspace'"
                class="attachment-placeholder attachment-placeholder--empty"
            >
                {{ tOr(UI.noWorkspace, '尚未打开工作区，无法查询附件（请先打开一个文件夹）') }}
            </div>
            <div
                v-else-if="errorCode === 'error' && snapshot === null"
                class="attachment-placeholder attachment-placeholder--error"
                role="alert"
            >
                <p class="attachment-error-text">
                    {{ tOr(UI.loadFailed, '加载工作区索引失败，请稍后重试') }}
                </p>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--ghost btn btn-retry-attachment"
                    :disabled="loading"
                    @click="handleRefresh"
                >
                    {{ tOr(UI.retry, '重试') }}
                </button>
            </div>
            <div
                v-else-if="snapshot !== null && !supported"
                class="attachment-placeholder attachment-placeholder--empty attachment-placeholder--unsupported"
            >
                {{ tOr(UI.unsupported, '索引版本不支持附件信息，请刷新索引或更新应用后重试') }}
            </div>

            <template v-else>
                <div
                    v-if="supported && groups.total === 0"
                    class="attachment-placeholder attachment-placeholder--empty"
                >
                    {{ tOr(UI.empty, '工作区中还没有引用任何附件（图片 / PDF / Office 文件等）') }}
                </div>
                <template v-else>
                    <!-- 缺失附件优先展示：存在性来自索引快照 exists 字段 -->
                    <section
                        v-if="groups.missing.length > 0"
                        class="attachment-section attachment-section--missing"
                        :aria-label="tOr(UI.missingSectionLabel, '缺失附件列表')"
                    >
                        <div class="attachment-section-title">
                            {{
                                tOr(UI.missingSection, '缺失附件（{count}）', {
                                    count: groups.missing.length
                                })
                            }}
                        </div>
                        <ul class="attachment-list" role="list">
                            <li
                                v-for="attachment in groups.missing"
                                :key="attachment.path"
                                class="attachment-item"
                            >
                                <div class="attachment-row attachment-row--missing">
                                    <span class="attachment-badge attachment-badge--missing">
                                        {{ tOr(UI.missingBadge, '缺失') }}
                                    </span>
                                    <span class="attachment-path" :title="attachment.path">
                                        {{ attachment.relativePath }}
                                    </span>
                                    <button
                                        type="button"
                                        class="attachment-ref-toggle"
                                        :aria-expanded="isExpanded(attachment)"
                                        :aria-label="
                                            tOr(UI.refToggleLabel, '展开/收起引用来源：{path}', {
                                                path: attachment.relativePath
                                            })
                                        "
                                        @click="toggleReferences(attachment)"
                                    >
                                        {{ referenceCountText(attachment) }}
                                    </button>
                                    <button
                                        type="button"
                                        class="dialog-btn dialog-btn--ghost attachment-action btn-reveal-attachment"
                                        :title="attachment.path"
                                        @click="revealAttachment(attachment)"
                                    >
                                        {{ tOr(UI.reveal, '在资源管理器中显示') }}
                                    </button>
                                </div>
                                <ul
                                    v-if="isExpanded(attachment)"
                                    class="attachment-refs"
                                    role="list"
                                    :aria-label="tOr(UI.refListLabel, '引用来源文件')"
                                >
                                    <li
                                        v-for="reference in referencesFor(attachment)"
                                        :key="reference.path"
                                        class="attachment-ref"
                                        :title="reference.path"
                                    >
                                        <span class="attachment-ref-path">
                                            {{ reference.relativePath }}
                                        </span>
                                        <span class="attachment-ref-title">{{
                                            reference.title
                                        }}</span>
                                    </li>
                                </ul>
                            </li>
                        </ul>
                    </section>

                    <!-- 正常附件：exists === true，支持在资源管理器中显示 + 内联重命名 -->
                    <section
                        v-if="groups.available.length > 0"
                        class="attachment-section attachment-section--available"
                        :aria-label="tOr(UI.availableSectionLabel, '正常附件列表')"
                    >
                        <div class="attachment-section-title">
                            {{
                                tOr(UI.availableSection, '正常附件（{count}）', {
                                    count: groups.available.length
                                })
                            }}
                        </div>
                        <ul class="attachment-list" role="list">
                            <li
                                v-for="attachment in groups.available"
                                :key="attachment.path"
                                class="attachment-item"
                            >
                                <div class="attachment-row">
                                    <span class="attachment-path" :title="attachment.path">
                                        {{ attachment.relativePath }}
                                    </span>
                                    <button
                                        type="button"
                                        class="attachment-ref-toggle"
                                        :aria-expanded="isExpanded(attachment)"
                                        :aria-label="
                                            tOr(UI.refToggleLabel, '展开/收起引用来源：{path}', {
                                                path: attachment.relativePath
                                            })
                                        "
                                        @click="toggleReferences(attachment)"
                                    >
                                        {{ referenceCountText(attachment) }}
                                    </button>
                                    <button
                                        type="button"
                                        class="dialog-btn dialog-btn--ghost attachment-action btn-reveal-attachment"
                                        :title="attachment.path"
                                        @click="revealAttachment(attachment)"
                                    >
                                        {{ tOr(UI.reveal, '在资源管理器中显示') }}
                                    </button>
                                    <button
                                        type="button"
                                        class="dialog-btn dialog-btn--ghost attachment-action btn-rename-attachment"
                                        :disabled="renameOperating"
                                        @click="startRename(attachment)"
                                    >
                                        {{ tOr(UI.rename, '重命名') }}
                                    </button>
                                </div>
                                <ul
                                    v-if="isExpanded(attachment)"
                                    class="attachment-refs"
                                    role="list"
                                    :aria-label="tOr(UI.refListLabel, '引用来源文件')"
                                >
                                    <li
                                        v-for="reference in referencesFor(attachment)"
                                        :key="reference.path"
                                        class="attachment-ref"
                                        :title="reference.path"
                                    >
                                        <span class="attachment-ref-path">
                                            {{ reference.relativePath }}
                                        </span>
                                        <span class="attachment-ref-title">{{
                                            reference.title
                                        }}</span>
                                    </li>
                                </ul>

                                <!-- 内联重命名：输入为不含扩展名的新名称（与既有文件重命名对话框约定一致） -->
                                <div v-if="isRenaming(attachment)" class="attachment-rename-box">
                                    <span class="attachment-rename-prompt">
                                        {{ renamePromptText(attachment) }}
                                    </span>
                                    <input
                                        :ref="setRenameInputRef"
                                        v-model="renameDraft"
                                        type="text"
                                        class="attachment-rename-input"
                                        :placeholder="
                                            tOr(UI.renamePlaceholder, '输入新文件名（不含扩展名）')
                                        "
                                        :aria-label="
                                            tOr(UI.renameInputLabel, '新文件名（不含扩展名）')
                                        "
                                        :disabled="renameOperating"
                                        @keydown.enter.prevent="confirmRename"
                                        @keydown.esc.prevent="cancelRename"
                                    />
                                    <button
                                        type="button"
                                        class="dialog-btn dialog-btn--primary btn-confirm-rename"
                                        :disabled="renameOperating"
                                        @click="confirmRename"
                                    >
                                        {{ tOr(UI.renameConfirm, '确认重命名') }}
                                    </button>
                                    <button
                                        type="button"
                                        class="dialog-btn dialog-btn--secondary btn-cancel-rename"
                                        :disabled="renameOperating"
                                        @click="cancelRename"
                                    >
                                        {{ tOr(UI.cancel, '取消') }}
                                    </button>
                                    <p
                                        v-if="renameErrorText !== ''"
                                        class="attachment-rename-error"
                                        role="alert"
                                    >
                                        {{ renameErrorText }}
                                    </p>
                                </div>
                            </li>
                        </ul>
                    </section>
                </template>

                <!-- ==================== 孤儿附件（只读审计 + 移入回收站） ==================== -->
                <section
                    class="attachment-orphan-section"
                    :aria-label="tOr(UI.orphanSection, '孤儿附件')"
                >
                    <div class="attachment-orphan-title">
                        <span>
                            {{
                                tOr(UI.titleOrphans, '孤儿附件（{count}）', {
                                    count: orphans.length
                                })
                            }}
                        </span>
                        <span v-if="audit?.truncated === true" class="attachment-orphan-badge">
                            {{ tOr(UI.auditTruncated, '审计结果已截断，仅显示部分孤儿附件') }}
                        </span>
                    </div>
                    <p class="attachment-orphan-hint">
                        {{
                            tOr(
                                UI.orphanHint,
                                '孤儿指工作区中未被任何 Markdown 引用的附件（审计已做保守排除）；移入系统回收站后仍可恢复。'
                            )
                        }}
                    </p>

                    <div
                        v-if="auditLoading || audit === null"
                        class="attachment-audit-status"
                        role="status"
                    >
                        {{ tOr(UI.auditLoading, '正在审计孤儿附件…') }}
                    </div>
                    <div
                        v-else-if="audit.status === 'failed'"
                        class="attachment-audit-status attachment-audit-status--error"
                        role="alert"
                    >
                        <span>{{ auditFailureText }}</span>
                        <button
                            type="button"
                            class="dialog-btn dialog-btn--ghost btn-retry-audit"
                            @click="handleRetryAudit"
                        >
                            {{ tOr(UI.retryAudit, '重新审计') }}
                        </button>
                    </div>
                    <div
                        v-else-if="audit.status === 'unsupported'"
                        class="attachment-audit-status"
                        role="status"
                    >
                        {{
                            tOr(
                                UI.auditUnsupported,
                                '当前主进程版本不支持孤儿审计，请更新应用后重试'
                            )
                        }}
                    </div>
                    <div
                        v-else-if="orphans.length === 0"
                        class="attachment-audit-status"
                        role="status"
                    >
                        {{ tOr(UI.emptyOrphans, '没有发现孤儿附件') }}
                    </div>
                    <template v-else>
                        <div class="attachment-orphan-toolbar">
                            <label class="attachment-orphan-select-all-label">
                                <input
                                    type="checkbox"
                                    class="attachment-orphan-select-all"
                                    :checked="allOrphansSelected"
                                    :disabled="trashOperating"
                                    @change="handleToggleSelectAll"
                                />
                                <span>{{ tOr(UI.selectAll, '全选') }}</span>
                            </label>
                            <span class="attachment-orphan-selected">{{ selectedCountText }}</span>
                            <button
                                type="button"
                                class="dialog-btn dialog-btn--danger btn-trash-orphans"
                                :disabled="selectedKeys.size === 0 || trashOperating"
                                @click="requestTrash"
                            >
                                {{ tOr(UI.trash, '移入回收站') }}
                            </button>
                        </div>

                        <ul class="attachment-orphan-list" role="list">
                            <li
                                v-for="orphan in orphans"
                                :key="orphan.path"
                                class="attachment-orphan-item"
                            >
                                <label class="attachment-orphan-row">
                                    <input
                                        type="checkbox"
                                        class="attachment-orphan-check"
                                        :checked="isOrphanSelected(orphan)"
                                        :disabled="trashOperating"
                                        :aria-label="
                                            tOr(UI.selectOrphan, '选择孤儿附件：{path}', {
                                                path: orphan.relativePath
                                            })
                                        "
                                        @change="handleToggleOrphan(orphan, $event)"
                                    />
                                    <span class="attachment-orphan-path" :title="orphan.path">
                                        {{ orphan.relativePath }}
                                    </span>
                                    <span class="attachment-orphan-meta">
                                        <span
                                            class="attachment-orphan-size"
                                            :title="tOr(UI.sizeLabel, '大小')"
                                        >
                                            {{ formatAttachmentSize(orphan.size) }}
                                        </span>
                                        <span
                                            class="attachment-orphan-mtime"
                                            :title="tOr(UI.mtimeLabel, '修改时间')"
                                        >
                                            {{ formatAttachmentMtime(orphan.mtimeMs) }}
                                        </span>
                                    </span>
                                </label>
                            </li>
                        </ul>

                        <!-- 对话框内二次确认（不使用 window.confirm，保持模态焦点/主题一致） -->
                        <div
                            v-if="confirmingTrash"
                            class="attachment-confirm"
                            role="alert"
                            :aria-label="tOr(UI.trashConfirm, '确认移入回收站')"
                        >
                            <p class="attachment-confirm-message">{{ trashConfirmMessage }}</p>
                            <p class="attachment-confirm-hint">
                                {{
                                    tOr(
                                        UI.trashConfirmHint,
                                        '主进程会重新校验路径与引用；移入系统回收站后可从系统回收站恢复。'
                                    )
                                }}
                            </p>
                            <div class="attachment-confirm-actions">
                                <button
                                    type="button"
                                    class="dialog-btn dialog-btn--danger btn-confirm-trash"
                                    :disabled="trashOperating"
                                    @click="confirmTrash"
                                >
                                    {{ tOr(UI.trashConfirm, '确认移入回收站') }}
                                </button>
                                <button
                                    type="button"
                                    class="dialog-btn dialog-btn--secondary btn-cancel-trash"
                                    :disabled="trashOperating"
                                    @click="cancelTrash"
                                >
                                    {{ tOr(UI.cancel, '取消') }}
                                </button>
                            </div>
                        </div>
                        <div v-if="trashOperating" class="attachment-audit-status" role="status">
                            {{ tOr(UI.trashOperating, '正在移入回收站…') }}
                        </div>
                    </template>
                </section>

                <!-- 操作结果（回收站 / 重命名）：独立于各类列表渲染，刷新后仍可见 -->
                <div
                    v-if="trashResult !== null"
                    class="attachment-op-status"
                    :class="
                        trashResult.ok && trashResult.failed.length === 0
                            ? 'attachment-op-status--ok'
                            : 'attachment-op-status--error'
                    "
                    role="alert"
                >
                    <template v-if="trashResult.ok && trashResult.failed.length === 0">
                        {{
                            tOr(UI.trashSuccess, '已将 {count} 个孤儿附件移入系统回收站', {
                                count: trashResult.trashed
                            })
                        }}
                    </template>
                    <template v-else-if="trashResult.ok">
                        <p class="attachment-op-message">
                            {{
                                tOr(
                                    UI.trashPartial,
                                    '已移入回收站 {trashed} 个，失败 {failed} 个',
                                    {
                                        trashed: trashResult.trashed,
                                        failed: trashResult.failed.length
                                    }
                                )
                            }}
                        </p>
                        <ul class="attachment-op-failures" role="list">
                            <li
                                v-for="failure in trashResult.failed"
                                :key="failure.path"
                                :title="failure.path"
                            >
                                {{
                                    tOr(UI.trashItemFailed, '{path}：{reason}', {
                                        path: failure.path,
                                        reason: trashFailureReasonText(failure.reason)
                                    })
                                }}
                            </li>
                        </ul>
                    </template>
                    <template v-else>{{ trashFailureText }}</template>
                </div>

                <div
                    v-if="renameSuccess !== null"
                    class="attachment-op-status attachment-op-status--ok"
                    role="status"
                >
                    <p class="attachment-op-message">{{ renameSuccessText }}</p>
                    <p
                        v-if="renameSuccess.failedFiles.length > 0"
                        class="attachment-op-warning"
                        role="alert"
                    >
                        {{ renameRefUpdateWarning }}
                    </p>
                </div>

                <div
                    v-if="refreshFailed"
                    class="attachment-hint attachment-hint--error"
                    role="alert"
                >
                    {{ tOr(UI.refreshFailed, '刷新索引失败，以下为上次索引结果') }}
                </div>
                <div v-if="loading && snapshot !== null" class="attachment-hint" role="status">
                    {{ tOr(UI.refreshing, '正在刷新工作区索引…') }}
                </div>
                <div
                    v-if="revealFailed"
                    class="attachment-hint attachment-hint--error"
                    role="alert"
                >
                    {{
                        tOr(UI.revealFailed, '无法在资源管理器中显示（主进程不可用或路径不受信任）')
                    }}
                </div>
            </template>
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--ghost btn btn-refresh-attachments"
                :disabled="loading || auditLoading"
                @click="handleRefresh"
            >
                {{ tOr(UI.refresh, '刷新索引') }}
            </button>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn-close-attachment"
                @click="handleClose"
            >
                {{ tOr(UI.close, '关闭') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * B5 附件管理对话框（renderer-only，默认能力，不新增 i18n 词典）。
 *
 * 数据流：
 * 1. 打开（state.visible → true）→ **并行**拉取：
 *    - `useWorkspaceIndex().refresh(false)`：优先主进程缓存，无缓存时主进程构建索引；
 *    - `invoke(IPC.FILE.GET_ATTACHMENT_AUDIT)`：只读孤儿审计（相对路径 / 大小 / mtime）；
 * 2. `buildAttachmentGroups(snapshot)` 按 exists 分组（缺失在前）+ 统计引用来源数；
 * 3. 孤儿区：`normalizeAttachmentAuditResult` 归一化后渲染，多选 + 全选，
 *    「移入回收站」先进入对话框内二次确认（不用 window.confirm），确认后
 *    `invoke(IPC.FILE.TRASH_ATTACHMENTS, paths)` 传绝对路径数组；主进程返回逐项结果，
 *    全部成功 / 部分失败 / 整体失败分别可见提示，完成后刷新索引与审计；
 * 4. 正常附件行「重命名」→ 内联输入（默认当前文件名不含扩展名）→
 *    `invoke(IPC.FILE.RENAME_ATTACHMENT, oldPath, newName)`；成功刷新，冲突/路径非法
 *    等失败码经 `describeAttachmentRenameFailure` 映射为可见提示；
 * 5. 「在资源管理器中显示」→ 经白名单 send `IPC.FILE_MANAGER.OPEN_IN_EXPLORER`；
 * 6. 「刷新索引 / 重试」→ 索引 `refresh(true)` 强制重建 + 审计重新拉取。
 *
 * 容错边界：
 * - 渲染层 IPC 不可用（`window.electron` 缺失）或 invoke 抛错时统一返回 null，
 *   由 `normalize*` 转换为失败视图，只在对话框内给可见提示并记日志，不抛给 UI；
 * - 旧主进程：审计返回 `ok:true` 但无 `orphans` 字段 → 展示「不支持孤儿审计」空态；
 *   索引快照无 `attachments` 字段 → 展示「索引版本不支持附件信息」空态；
 * - 重命名成功但部分来源文件写回失败：result.failedFiles 逐条提示需手动修复。
 *
 * i18n：使用动态键表 + 中文兜底（建议键 `editorUi.attachments.*` 由主控补词典；
 * 补齐词典后自动切换，补词典前界面仍可读）；既有键保持兼容不变。
 */
import { computed, nextTick, ref, watch, type ComponentPublicInstance } from 'vue'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import { useWorkspaceIndex } from '../../../composables/useWorkspaceIndex'
import { IPC } from '../../../../../shared/ipc-channels'
import type { AttachmentAuditEntry } from '../../../../../shared/types/ipc'
import type { WorkspaceAttachment } from '../../../../../shared/types/workspace-index'
import BaseDialog from '../../dialogs/BaseDialog.vue'
import {
    attachmentDialogState,
    buildAttachmentGroups,
    closeAttachmentDialogState,
    countAttachmentReferences,
    defaultRenameBaseName,
    describeAttachmentRenameFailure,
    describeAttachmentTrashFailure,
    formatAttachmentMtime,
    formatAttachmentSize,
    isAllOrphanSelected,
    normalizeAttachmentAuditResult,
    normalizeAttachmentPathKey,
    normalizeAttachmentRenameResult,
    normalizeAttachmentTrashResult,
    orphanSelectionKey,
    prepareAttachmentRename,
    pruneSelectedKeys,
    resolveAttachmentReferences,
    selectAllOrphanKeys,
    sumAttachmentSizes,
    supportsAttachmentIndex,
    toggleOrphanSelected
} from './attachment-dialog-state'
import type {
    AttachmentAuditView,
    AttachmentMessageDescriptor,
    AttachmentTrashView
} from './attachment-dialog-state'

/** 对话框文案建议键（主控补 editorUi.attachments.* 词典后自动生效；未补时用中文兜底） */
const UI = {
    title: 'editorUi.attachments.title',
    loading: 'editorUi.attachments.loading',
    loadFailed: 'editorUi.attachments.loadFailed',
    noWorkspace: 'editorUi.attachments.noWorkspace',
    unsupported: 'editorUi.attachments.unsupported',
    empty: 'editorUi.attachments.empty',
    retry: 'editorUi.attachments.retry',
    refresh: 'editorUi.attachments.refresh',
    refreshing: 'editorUi.attachments.refreshing',
    refreshFailed: 'editorUi.attachments.refreshFailed',
    reveal: 'editorUi.attachments.reveal',
    revealFailed: 'editorUi.attachments.revealFailed',
    close: 'editorUi.attachments.close',
    summary: 'editorUi.attachments.summary',
    missingSection: 'editorUi.attachments.missingSection',
    missingSectionLabel: 'editorUi.attachments.missingSectionLabel',
    missingBadge: 'editorUi.attachments.missingBadge',
    availableSection: 'editorUi.attachments.availableSection',
    availableSectionLabel: 'editorUi.attachments.availableSectionLabel',
    refCount: 'editorUi.attachments.refCount',
    refToggleLabel: 'editorUi.attachments.refToggleLabel',
    refListLabel: 'editorUi.attachments.refListLabel',
    targetWorkspace: 'editorUi.attachments.targetWorkspace',
    targetWorkspaceUnknown: 'editorUi.attachments.targetWorkspaceUnknown',

    // ===== 新增：孤儿附件审计 =====
    titleOrphans: 'editorUi.attachments.titleOrphans',
    orphanSection: 'editorUi.attachments.orphanSection',
    orphanHint: 'editorUi.attachments.orphanHint',
    auditLoading: 'editorUi.attachments.auditLoading',
    auditFailed: 'editorUi.attachments.auditFailed',
    auditUnsupported: 'editorUi.attachments.auditUnsupported',
    auditTruncated: 'editorUi.attachments.auditTruncated',
    emptyOrphans: 'editorUi.attachments.emptyOrphans',
    retryAudit: 'editorUi.attachments.retryAudit',
    noWorkspaceOrphans: 'editorUi.attachments.noWorkspaceOrphans',
    selectAll: 'editorUi.attachments.selectAll',
    selectOrphan: 'editorUi.attachments.selectOrphan',
    selectedCount: 'editorUi.attachments.selectedCount',
    sizeLabel: 'editorUi.attachments.sizeLabel',
    mtimeLabel: 'editorUi.attachments.mtimeLabel',

    // ===== 新增：批量移入回收站 =====
    trash: 'editorUi.attachments.trash',
    trashConfirm: 'editorUi.attachments.trashConfirm',
    trashConfirmMessage: 'editorUi.attachments.trashConfirmMessage',
    trashConfirmHint: 'editorUi.attachments.trashConfirmHint',
    trashOperating: 'editorUi.attachments.trashOperating',
    trashSuccess: 'editorUi.attachments.trashSuccess',
    trashPartial: 'editorUi.attachments.trashPartial',
    trashFailed: 'editorUi.attachments.trashFailed',
    trashItemFailed: 'editorUi.attachments.trashItemFailed',
    trashReasonPathDenied: 'editorUi.attachments.trashReasonPathDenied',
    trashReasonNotFile: 'editorUi.attachments.trashReasonNotFile',
    trashReasonStillReferenced: 'editorUi.attachments.trashReasonStillReferenced',
    trashReasonTrashFailed: 'editorUi.attachments.trashReasonTrashFailed',
    trashReasonLimitExceeded: 'editorUi.attachments.trashReasonLimitExceeded',

    // ===== 新增：附件重命名 =====
    rename: 'editorUi.attachments.rename',
    renameConfirm: 'editorUi.attachments.renameConfirm',
    renamePlaceholder: 'editorUi.attachments.renamePlaceholder',
    renameInputLabel: 'editorUi.attachments.renameInputLabel',
    renamePrompt: 'editorUi.attachments.renamePrompt',
    renameNameRequired: 'editorUi.attachments.renameNameRequired',
    renameInvalidName: 'editorUi.attachments.renameInvalidName',
    renameConflict: 'editorUi.attachments.renameConflict',
    renamePathDenied: 'editorUi.attachments.renamePathDenied',
    renameNotFile: 'editorUi.attachments.renameNotFile',
    renameFailed: 'editorUi.attachments.renameFailed',
    renameSuccess: 'editorUi.attachments.renameSuccess',
    renameRefUpdateFailed: 'editorUi.attachments.renameRefUpdateFailed',
    cancel: 'editorUi.attachments.cancel'
} as const

/** t() 取词，词典缺键时回退中文兜底（并手动补插值，保证补词典前界面可用） */
function tOr(key: string, fallback: string, params?: Record<string, string | number>): string {
    const text = t(key, params)
    if (text !== key) {
        return text
    }
    if (params === undefined) {
        return fallback
    }
    return fallback.replace(/\{(\w+)\}/g, (match, name: string) =>
        params[name] === undefined ? match : String(params[name])
    )
}

/** 对话框状态（模块单例，宿主负责挂载 / 卸载） */
const state = attachmentDialogState

/** 工作区索引控制器（本实例独立 loading/error；快照由主进程缓存） */
const { state: indexState, refresh } = useWorkspaceIndex()

/** 索引快照（null = 尚未加载成功） */
const snapshot = computed(() => indexState.snapshot)
/** 是否正在请求主进程（首次加载 / 刷新） */
const loading = computed(() => indexState.loading)
/** 首次加载失败原因（no-workspace / error；成功时 null） */
const errorCode = computed(() => indexState.error)
/** 首次加载占位（有旧快照时刷新不阻塞列表展示） */
const initialLoading = computed(() => indexState.loading && indexState.snapshot === null)
/** 刷新失败但保留上次快照（提示用户结果可能过期） */
const refreshFailed = computed(() => indexState.error !== null && indexState.snapshot !== null)
/** 快照是否支持附件清单字段（旧索引版本 → 单独空态） */
const supported = computed(() => supportsAttachmentIndex(indexState.snapshot))
/** 附件分组（缺失在前 / 正常在后，组内保持快照顺序） */
const groups = computed(() => buildAttachmentGroups(indexState.snapshot))

/** 当前展开引用来源的附件（路径比较键；空串 = 全部收起，同一时间只展开一个） */
const expandedKey = ref('')
/** 最近一次「在资源管理器中显示」是否失败（可见反馈，不弹错误框） */
const revealFailed = ref(false)
/** 索引加载请求序号：连续刷新时只保留最后一次结果相关的 UI 状态 */
let loadSequence = 0

/* ==================== 孤儿审计状态 ==================== */

/** 归一化后的审计结果（null = 尚未加载完成） */
const audit = ref<AttachmentAuditView | null>(null)
/** 审计请求中（与索引 loading 独立，互不阻塞） */
const auditLoading = ref(false)
/** 审计请求序号（连续触发只保留最后一次结果） */
let auditSequence = 0
/** 孤儿列表（仅 status === 'ok' 时非空） */
const orphans = computed<AttachmentAuditEntry[]>(() =>
    audit.value?.status === 'ok' ? audit.value.orphans : []
)
/** 选中项（路径比较键集合；刷新/关闭后按新列表剔除残留） */
const selectedKeys = ref<Set<string>>(new Set())
/** 当前孤儿列表的全选键 */
const orphanKeys = computed(() => orphans.value.map((orphan) => orphanSelectionKey(orphan)))
/** 是否全部选中（空列表返回 false） */
const allOrphansSelected = computed(() => isAllOrphanSelected(selectedKeys.value, orphanKeys.value))
/** 当前选中的孤儿（保持列表顺序） */
const selectedOrphans = computed(() =>
    orphans.value.filter((orphan) => selectedKeys.value.has(orphanSelectionKey(orphan)))
)
/** 审计失败提示：NO_WORKSPACE 单独提示，其余统一「审计失败」 */
const auditFailureText = computed(() => {
    if (audit.value?.code === 'NO_WORKSPACE') {
        return tOr(UI.noWorkspaceOrphans, '尚未打开工作区，无法审计孤儿附件')
    }
    return tOr(UI.auditFailed, '孤儿附件审计失败，请稍后重试')
})
/** 选中数量文案 */
const selectedCountText = computed(() =>
    tOr(UI.selectedCount, '已选 {selected} 个 / 共 {total} 个', {
        selected: selectedOrphans.value.length,
        total: orphans.value.length
    })
)

/* ==================== 移入回收站状态 ==================== */

/** 是否处于对话框内二次确认步骤 */
const confirmingTrash = ref(false)
/** 回收站操作进行中 */
const trashOperating = ref(false)
/** 最近一次回收站操作结果（null = 尚未操作；刷新后保留用于可见提示） */
const trashResult = ref<AttachmentTrashView | null>(null)
/** 孤儿操作序号：关闭/重新打开后丢弃旧在途结果 */
let operationSequence = 0

/** 确认文案：数量 + 选中总大小 */
const trashConfirmMessage = computed(() =>
    tOr(UI.trashConfirmMessage, '确认将 {count} 个孤儿附件（共 {size}）移入系统回收站？', {
        count: selectedOrphans.value.length,
        size: formatAttachmentSize(sumAttachmentSizes(selectedOrphans.value))
    })
)

/** 回收站整体失败提示（无工作区单独提示） */
const trashFailureText = computed(() => {
    if (trashResult.value?.code === 'NO_WORKSPACE') {
        return tOr(UI.noWorkspaceOrphans, '尚未打开工作区，无法审计孤儿附件')
    }
    return tOr(UI.trashFailed, '移入回收站失败，请稍后重试')
})

/** 回收站单条失败原因文案（建议键 + 中文兜底） */
function trashFailureReasonText(reason: string): string {
    const descriptor: AttachmentMessageDescriptor = describeAttachmentTrashFailure(reason)
    return tOr(descriptor.key, descriptor.fallback)
}

/* ==================== 内联重命名状态 ==================== */

/** 当前正在重命名的附件（null = 未进入重命名） */
const renameTarget = ref<WorkspaceAttachment | null>(null)
/** 输入框草稿（默认当前文件名不含扩展名） */
const renameDraft = ref('')
/** 重命名请求中 */
const renameOperating = ref(false)
/** 重命名错误提示（建议键 + 兜底） */
const renameError = ref<AttachmentMessageDescriptor | null>(null)
/** 重命名成功结果（含来源文件写回失败清单） */
const renameSuccess = ref<{
    newName: string
    updatedFiles: number
    replacements: number
    failedFiles: string[]
} | null>(null)
/** 重命名输入框 DOM 引用（进入重命名后聚焦） */
const renameInputEl = ref<HTMLInputElement | null>(null)

const renameErrorText = computed(() => {
    const error = renameError.value
    return error === null ? '' : tOr(error.key, error.fallback)
})

/** 重命名成功提示 */
const renameSuccessText = computed(() => {
    const success = renameSuccess.value
    if (success === null) {
        return ''
    }
    return tOr(
        UI.renameSuccess,
        '已重命名为 {name}，并更新 {files} 个文件 / {replacements} 处引用',
        {
            name: success.newName,
            files: success.updatedFiles,
            replacements: success.replacements
        }
    )
})

/** 重命名成功但部分来源文件引用写回失败（需手动修复） */
const renameRefUpdateWarning = computed(() => {
    const success = renameSuccess.value
    if (success === null || success.failedFiles.length === 0) {
        return ''
    }
    return tOr(
        UI.renameRefUpdateFailed,
        '有 {count} 个来源文件引用更新失败（文件已改名，需手动修复）：{files}',
        {
            count: success.failedFiles.length,
            files: success.failedFiles.join('、')
        }
    )
})

/* ==================== 索引加载（既有） ==================== */

/** 顶部目标提示：工作区根路径 */
const targetTitle = computed(() => snapshot.value?.rootPath ?? '')

const targetText = computed(() => {
    const rootPath = snapshot.value?.rootPath ?? ''
    return rootPath.length > 0
        ? tOr(UI.targetWorkspace, '工作区：{path}', { path: rootPath })
        : tOr(UI.targetWorkspaceUnknown, '工作区索引')
})

/** 顶部汇总文案：附件总数 / 缺失 / 正常 / 引用来源总数 */
const summaryText = computed(() =>
    tOr(UI.summary, '共 {total} 个附件：缺失 {missing} / 正常 {available}，引用 {references} 处', {
        total: groups.value.total,
        missing: groups.value.missing.length,
        available: groups.value.available.length,
        references: groups.value.referenceTotal
    })
)

/** 某附件的引用来源数（去重后） */
function referenceCountText(attachment: WorkspaceAttachment): string {
    return tOr(UI.refCount, '{count} 处引用', {
        count: countAttachmentReferences(attachment)
    })
}

/** 该附件的引用来源列表是否展开 */
function isExpanded(attachment: WorkspaceAttachment): boolean {
    return expandedKey.value === normalizeAttachmentPathKey(attachment.path)
}

/** 展开 / 收起某附件的引用来源（同一时间只展开一个，保持列表紧凑） */
function toggleReferences(attachment: WorkspaceAttachment): void {
    const key = normalizeAttachmentPathKey(attachment.path)
    expandedKey.value = expandedKey.value === key ? '' : key
}

/** 当前展开附件的引用来源展示清单（快照映射相对路径/标题，旧数据回退） */
function referencesFor(attachment: WorkspaceAttachment) {
    return resolveAttachmentReferences(indexState.snapshot, attachment)
}

/**
 * 在系统资源管理器中显示附件位置。
 *
 * 复用既有白名单 send 通道（主进程做 Path Guard 校验后 shell.showItemInFolder）；
 * 主进程不可用/异常只给对话框内可见提示并记日志，不抛错、不影响继续浏览。
 */
function revealAttachment(attachment: WorkspaceAttachment): void {
    revealFailed.value = false
    try {
        const ipc = typeof window !== 'undefined' ? window.electron?.ipcRenderer : undefined
        if (!ipc || typeof ipc.send !== 'function') {
            revealFailed.value = true
            logger.warn('[附件管理] 渲染层 IPC 不可用，无法在资源管理器中显示', attachment.path)
            return
        }
        ipc.send(IPC.FILE_MANAGER.OPEN_IN_EXPLORER, attachment.path)
    } catch (error) {
        revealFailed.value = true
        logger.warn('[附件管理] 在资源管理器中显示附件失败', error)
    }
}

/**
 * 加载 / 刷新索引。
 *
 * force=false：打开对话框时使用（命中主进程缓存即返回，无缓存才构建）；
 * force=true：用户点「刷新索引 / 重试」时强制主进程重建快照。
 * 失败状态由控制器写入（no-workspace / error），这里只兜异常，保证不抛给 UI。
 */
async function loadIndex(force: boolean): Promise<void> {
    const sequence = ++loadSequence
    revealFailed.value = false
    try {
        await refresh(force)
    } catch (error) {
        logger.warn('[附件管理] 加载工作区索引失败', error)
    }
    if (sequence !== loadSequence) {
        // 连续刷新时旧请求结果不覆盖新请求的 UI 状态（控制器内部也会合并 loading）
        return
    }
}

/* ==================== IPC 调用（统一容错） ==================== */

interface IpcInvokeLike {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>
}

/** 解析渲染层 IPC（不可用/访问抛错返回 null） */
function resolveIpc(): IpcInvokeLike | null {
    try {
        const ipc = typeof window !== 'undefined' ? window.electron?.ipcRenderer : undefined
        return ipc && typeof ipc.invoke === 'function' ? ipc : null
    } catch {
        return null
    }
}

/**
 * 调用主进程 invoke 通道并吞掉所有异常（返回 null 表示调用失败）。
 *
 * 安全边界不变：通道均在 preload 白名单内；主进程失败仍以 ok=false 结构化返回。
 * 渲染层只根据归一化结果给可见提示，不把异常抛给 UI / 不弹全局错误框。
 */
async function invokeRenderer(channel: string, ...args: unknown[]): Promise<unknown> {
    const ipc = resolveIpc()
    if (ipc === null) {
        logger.warn(`[附件管理] 渲染层 IPC 不可用，跳过调用：${channel}`)
        return null
    }
    try {
        return await ipc.invoke(channel, ...args)
    } catch (error) {
        logger.warn(`[附件管理] IPC 调用失败：${channel}`, error)
        return null
    }
}

/* ==================== 孤儿审计 ==================== */

/**
 * 拉取孤儿审计（FILE.GET_ATTACHMENT_AUDIT，只读）。
 *
 * - 主进程不可用 / 旧版本无该通道 / 返回异常：归一化为 failed/unsupported 视图，
 *   对话框内显示可见提示，不抛错；
 * - 完成后按最新孤儿列表剔除失效的选择项（避免刷新后残留不可见选中项）。
 */
async function loadAudit(): Promise<void> {
    const sequence = ++auditSequence
    auditLoading.value = true
    try {
        const raw = await invokeRenderer(IPC.FILE.GET_ATTACHMENT_AUDIT)
        if (sequence !== auditSequence) {
            return
        }
        const view = normalizeAttachmentAuditResult(raw)
        audit.value = view
        selectedKeys.value = pruneSelectedKeys(
            selectedKeys.value,
            view.status === 'ok' ? view.orphans.map((orphan) => orphanSelectionKey(orphan)) : []
        )
        if (view.status !== 'ok' || view.orphans.length === 0) {
            confirmingTrash.value = false
        }
    } finally {
        if (sequence === auditSequence) {
            auditLoading.value = false
        }
    }
}

/** 重新审计（孤儿失败态的重试入口） */
function handleRetryAudit(): void {
    audit.value = null
    void loadAudit()
}

/** 某孤儿是否被选中 */
function isOrphanSelected(orphan: AttachmentAuditEntry): boolean {
    return selectedKeys.value.has(orphanSelectionKey(orphan))
}

/** 勾选 / 取消勾选单个孤儿 */
function handleToggleOrphan(orphan: AttachmentAuditEntry, event: Event): void {
    const checked = event.target instanceof HTMLInputElement ? event.target.checked : false
    selectedKeys.value = toggleOrphanSelected(
        selectedKeys.value,
        orphanSelectionKey(orphan),
        checked
    )
    if (selectedKeys.value.size === 0) {
        confirmingTrash.value = false
    }
}

/** 全选 / 取消全选 */
function handleToggleSelectAll(event: Event): void {
    const checked = event.target instanceof HTMLInputElement ? event.target.checked : false
    selectedKeys.value = checked ? selectAllOrphanKeys(orphanKeys.value) : new Set<string>()
    if (!checked) {
        confirmingTrash.value = false
    }
}

/** 进入「移入回收站」对话框内二次确认步骤（不立即执行） */
function requestTrash(): void {
    if (selectedOrphans.value.length === 0 || trashOperating.value) {
        return
    }
    trashResult.value = null
    confirmingTrash.value = true
}

/** 取消二次确认（保留当前勾选） */
function cancelTrash(): void {
    if (trashOperating.value) {
        return
    }
    confirmingTrash.value = false
}

/**
 * 确认移入回收站。
 *
 * 传**选中孤儿的绝对路径数组**（同一路径已按比较键去重）；主进程会重新校验
 * 工作区边界、普通文件、是否仍被引用与回收站可用性，并返回逐项结果。
 * 成功后刷新索引与审计（失败时保留选择与结果，便于用户重试 / 取消）。
 */
async function confirmTrash(): Promise<void> {
    if (trashOperating.value) {
        return
    }
    const paths = selectedOrphans.value.map((orphan) => orphan.path)
    if (paths.length === 0) {
        confirmingTrash.value = false
        return
    }
    const sequence = ++operationSequence
    trashOperating.value = true
    confirmingTrash.value = false
    try {
        const raw = await invokeRenderer(IPC.FILE.TRASH_ATTACHMENTS, paths)
        if (sequence !== operationSequence) {
            return
        }
        const view = normalizeAttachmentTrashResult(raw)
        trashResult.value = view
        if (view.ok) {
            selectedKeys.value = new Set()
            await Promise.all([loadIndex(true), loadAudit()])
        }
    } finally {
        trashOperating.value = false
    }
}

/* ==================== 内联重命名 ==================== */

/** 输入框函数 ref：记录 DOM 以便进入重命名后聚焦 */
function setRenameInputRef(el: Element | ComponentPublicInstance | null): void {
    renameInputEl.value = el instanceof HTMLInputElement ? el : null
}

/** 该附件是否正处于重命名编辑态 */
function isRenaming(attachment: WorkspaceAttachment): boolean {
    return (
        renameTarget.value !== null &&
        normalizeAttachmentPathKey(renameTarget.value.path) ===
            normalizeAttachmentPathKey(attachment.path)
    )
}

/** 重命名提示文案 */
function renamePromptText(attachment: WorkspaceAttachment): string {
    return tOr(UI.renamePrompt, '重命名：{path}', { path: attachment.relativePath })
}

/** 进入重命名编辑态（默认当前文件名不含扩展名，聚焦输入框） */
function startRename(attachment: WorkspaceAttachment): void {
    if (renameOperating.value) {
        return
    }
    renameTarget.value = attachment
    renameDraft.value = defaultRenameBaseName(attachment.relativePath)
    renameError.value = null
    renameSuccess.value = null
    void nextTick(() => {
        renameInputEl.value?.focus()
        renameInputEl.value?.select()
    })
}

/** 取消重命名（保留原文件，不调用 IPC） */
function cancelRename(): void {
    if (renameOperating.value) {
        return
    }
    renameTarget.value = null
    renameDraft.value = ''
    renameError.value = null
    renameInputEl.value = null
}

/**
 * 确认重命名：前端只做空/明显非法输入提示，冲突与路径安全由主进程二次校验。
 *
 * 成功：显示「已重命名 + 引用更新数量」，刷新索引与审计（让列表反映新路径）；
 * 失败：按失败码展示可见提示（ALREADY_EXISTS → 冲突、INVALID_NAME/PATH_DENIED →
 * 路径/名称非法），保留输入框供用户修改重试。
 */
async function confirmRename(): Promise<void> {
    const target = renameTarget.value
    if (target === null || renameOperating.value) {
        return
    }
    const prepared = prepareAttachmentRename(renameDraft.value)
    if (!prepared.valid) {
        renameError.value =
            prepared.reason === 'empty'
                ? { key: UI.renameNameRequired, fallback: '请输入新文件名' }
                : {
                      key: UI.renameInvalidName,
                      fallback: '文件名不合法（不能包含路径分隔符或特殊字符）'
                  }
        return
    }
    const sequence = ++operationSequence
    renameOperating.value = true
    renameError.value = null
    try {
        const raw = await invokeRenderer(IPC.FILE.RENAME_ATTACHMENT, target.path, prepared.newName)
        if (sequence !== operationSequence) {
            return
        }
        const result = normalizeAttachmentRenameResult(raw)
        if (!result.ok) {
            renameError.value = describeAttachmentRenameFailure(result.code)
            return
        }
        renameSuccess.value = {
            newName: prepared.newName,
            updatedFiles: result.updatedFiles,
            replacements: result.replacements,
            failedFiles: result.failedFiles
        }
        renameTarget.value = null
        renameDraft.value = ''
        renameInputEl.value = null
        await Promise.all([loadIndex(true), loadAudit()])
    } finally {
        renameOperating.value = false
    }
}

/* ==================== 打开 / 关闭生命周期 ==================== */

/** 刷新索引 + 审计（强制重建索引 + 重新拉取审计） */
function handleRefresh(): void {
    void Promise.all([loadIndex(true), loadAudit()])
}

/** 关闭对话框（只切显隐，宿主保留；再次打开无需重建宿主） */
function handleClose(): void {
    closeAttachmentDialogState()
}

/** 重置所有临时 UI 状态（关闭时调用；在途请求结果由序号丢弃） */
function resetTransientState(): void {
    loadSequence += 1
    auditSequence += 1
    operationSequence += 1
    expandedKey.value = ''
    revealFailed.value = false
    audit.value = null
    auditLoading.value = false
    selectedKeys.value = new Set()
    confirmingTrash.value = false
    trashOperating.value = false
    trashResult.value = null
    renameTarget.value = null
    renameDraft.value = ''
    renameOperating.value = false
    renameError.value = null
    renameSuccess.value = null
    renameInputEl.value = null
}

// 打开即**并行**拉取索引与审计（宿主先挂载、后设置 visible，故 immediate 兜底）；
// 关闭时清理临时 UI 状态（索引快照由控制器/主进程缓存保留，下次打开可复用）。
watch(
    () => state.visible,
    (visible: boolean) => {
        if (visible) {
            void loadIndex(false)
            void loadAudit()
        } else {
            resetTransientState()
        }
    },
    { immediate: true }
)
</script>

<style scoped>
.attachment-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px 8px;
    min-height: 360px;
    max-height: 72vh;
    overflow-y: auto;
}

.attachment-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

.attachment-target {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.attachment-summary {
    flex: none;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.attachment-placeholder {
    min-height: 250px;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 24px;
    text-align: center;
    font-size: 13px;
    color: var(--theme-secondary-text-color);
    background: var(--theme-card-background);
    border: 1px dashed var(--theme-border-color);
    border-radius: 6px;
}

.attachment-placeholder--error {
    color: var(--theme-accent-color);
}

.attachment-error-text {
    margin: 0;
}

/* ==================== 分组列表 ==================== */
.attachment-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    min-height: 0;
}

.attachment-section-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--theme-secondary-text-color);
    padding: 0 2px;
}

.attachment-section--missing .attachment-section-title {
    color: var(--theme-accent-color);
}

.attachment-list {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 28vh;
    overflow-y: auto;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
}

.attachment-item + .attachment-item {
    margin-top: 2px;
}

.attachment-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    border: 1px solid transparent;
    border-radius: 4px;
    font-size: 12px;
}

.attachment-row:hover {
    background: var(--theme-hover-background);
}

.attachment-row--missing {
    border-style: dashed;
    border-color: var(--theme-accent-color);
}

.attachment-badge {
    flex: none;
    padding: 0 6px;
    font-size: 11px;
    line-height: 18px;
    border-radius: 3px;
    border: 1px solid var(--theme-accent-color);
    color: var(--theme-accent-color);
    white-space: nowrap;
}

.attachment-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.attachment-row--missing .attachment-path {
    color: var(--theme-accent-color);
}

.attachment-ref-toggle {
    flex: none;
    padding: 0 6px;
    font-size: 11px;
    line-height: 20px;
    border: 1px solid var(--theme-border-color);
    border-radius: 3px;
    background: transparent;
    color: var(--theme-secondary-text-color);
    font-family: inherit;
    cursor: pointer;
    transition: all 0.2s ease;
}

.attachment-ref-toggle:hover {
    background: var(--theme-hover-background);
    color: var(--theme-text-color);
}

.attachment-ref-toggle:focus-visible {
    outline: 2px solid var(--theme-accent-color);
    outline-offset: 1px;
}

.attachment-ref-toggle[aria-expanded='true'] {
    border-color: var(--theme-accent-color);
    color: var(--theme-accent-color);
}

.attachment-action {
    flex: none;
    font-size: 11px;
    padding: 2px 8px;
    white-space: nowrap;
}

/* ==================== 引用来源 ==================== */
.attachment-refs {
    list-style: none;
    margin: 2px 0 4px 20px;
    padding: 4px;
    background: var(--theme-hover-background);
    border: 1px dotted var(--theme-border-color);
    border-radius: 4px;
}

.attachment-ref {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 2px 6px;
    font-size: 12px;
}

.attachment-ref-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.attachment-ref-title {
    flex: none;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-secondary-text-color);
}

/* ==================== 内联重命名 ==================== */
.attachment-rename-box {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 2px 0 4px 20px;
    padding: 6px 8px;
    background: var(--theme-hover-background);
    border: 1px dotted var(--theme-border-color);
    border-radius: 4px;
    font-size: 12px;
}

.attachment-rename-prompt {
    flex: none;
    color: var(--theme-secondary-text-color);
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.attachment-rename-input {
    flex: 1;
    min-width: 140px;
    padding: 3px 8px;
    font-size: 12px;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    color: var(--theme-text-color);
    background: var(--theme-card-background);
    border: 1px solid var(--theme-accent-color);
    border-radius: 4px;
    outline: none;
}

.attachment-rename-error {
    flex-basis: 100%;
    margin: 0;
    color: var(--theme-accent-color);
    font-size: 12px;
}

/* ==================== 孤儿附件 ==================== */
.attachment-orphan-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
    padding: 8px;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
}

.attachment-orphan-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: var(--theme-secondary-text-color);
    padding: 0 2px;
}

.attachment-orphan-badge {
    flex: none;
    padding: 0 6px;
    font-size: 11px;
    font-weight: 400;
    line-height: 18px;
    border-radius: 3px;
    border: 1px solid var(--theme-accent-color);
    color: var(--theme-accent-color);
}

.attachment-orphan-hint {
    margin: 0;
    padding: 0 2px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

.attachment-audit-status {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
    background: var(--theme-hover-background);
    border-radius: 4px;
}

.attachment-audit-status--error {
    color: var(--theme-accent-color);
}

.attachment-orphan-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 2px 2px 4px;
    font-size: 12px;
}

.attachment-orphan-select-all-label {
    display: flex;
    align-items: center;
    gap: 6px;
    color: var(--theme-text-color);
    cursor: pointer;
    user-select: none;
}

.attachment-orphan-selected {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-secondary-text-color);
}

.attachment-orphan-list {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 26vh;
    overflow-y: auto;
    border: 1px solid var(--theme-border-color);
    border-radius: 4px;
}

.attachment-orphan-item + .attachment-orphan-item {
    margin-top: 2px;
}

.attachment-orphan-row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
}

.attachment-orphan-row:hover {
    background: var(--theme-hover-background);
}

.attachment-orphan-check {
    flex: none;
    cursor: pointer;
}

.attachment-orphan-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.attachment-orphan-meta {
    flex: none;
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--theme-secondary-text-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 11px;
}

/* ==================== 二次确认 / 操作结果 ==================== */
.attachment-confirm {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid var(--theme-accent-color);
    border-radius: 6px;
    background: var(--theme-hover-background);
    font-size: 12px;
}

.attachment-confirm-message {
    margin: 0;
    color: var(--theme-text-color);
    font-weight: 600;
}

.attachment-confirm-hint {
    margin: 0;
    color: var(--theme-secondary-text-color);
}

.attachment-confirm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
}

.attachment-op-status {
    padding: 8px 12px;
    font-size: 12px;
    border-radius: 4px;
    background: var(--theme-hover-background);
    color: var(--theme-secondary-text-color);
}

.attachment-op-status--ok {
    color: var(--theme-text-color);
}

.attachment-op-status--error {
    color: var(--theme-accent-color);
}

.attachment-op-message {
    margin: 0;
}

.attachment-op-warning {
    margin: 4px 0 0;
    color: var(--theme-accent-color);
}

.attachment-op-failures {
    margin: 4px 0 0;
    padding-left: 18px;
    max-height: 18vh;
    overflow-y: auto;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 11px;
}

/* ==================== 提示条 ==================== */
.attachment-hint {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
    background: var(--theme-hover-background);
    border-radius: 4px;
}

.attachment-hint--error {
    color: var(--theme-accent-color);
}
</style>
