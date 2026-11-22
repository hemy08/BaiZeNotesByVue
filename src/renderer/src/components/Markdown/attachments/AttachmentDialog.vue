<template>
    <!--
        B5 附件管理对话框：按「缺失 / 正常」分组展示工作区 Markdown 图片/附件引用。
        - 数据来自主进程工作区索引快照（既有 FILE.GET_WORKSPACE_INDEX，无新增 IPC）；
        - 打开时 refresh(false) 命中缓存/首次索引；「刷新索引 / 重试」refresh(true) 强制重建；
        - 每行显示相对路径、引用来源数（可展开来源文件列表）；
        - 「在资源管理器中显示」复用既有 FILE_MANAGER.OPEN_IN_EXPLORER send 通道；
        - 所有用户文案走 `editorUi.attachments.*` 建议键 + 中文兜底（词典由主控补）。
    -->
    <BaseDialog
        :visible="state.visible"
        :title="tOr(UI.title, '附件管理')"
        width="860px"
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
            <div
                v-else-if="supported && groups.total === 0"
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
                                    class="dialog-btn dialog-btn--ghost attachment-reveal btn-reveal-attachment"
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
                                    <span class="attachment-ref-title">{{ reference.title }}</span>
                                </li>
                            </ul>
                        </li>
                    </ul>
                </section>

                <!-- 正常附件：exists === true -->
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
                                    class="dialog-btn dialog-btn--ghost attachment-reveal btn-reveal-attachment"
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
                                    <span class="attachment-ref-title">{{ reference.title }}</span>
                                </li>
                            </ul>
                        </li>
                    </ul>
                </section>
            </template>

            <div v-if="refreshFailed" class="attachment-hint attachment-hint--error" role="alert">
                {{ tOr(UI.refreshFailed, '刷新索引失败，以下为上次索引结果') }}
            </div>
            <div v-if="loading && snapshot !== null" class="attachment-hint" role="status">
                {{ tOr(UI.refreshing, '正在刷新工作区索引…') }}
            </div>
            <div v-if="revealFailed" class="attachment-hint attachment-hint--error" role="alert">
                {{ tOr(UI.revealFailed, '无法在资源管理器中显示（主进程不可用或路径不受信任）') }}
            </div>
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--ghost btn btn-refresh-attachments"
                :disabled="loading"
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
 * B5 附件管理对话框（renderer-only，默认能力，不新增 IPC / EventBus / i18n 词典）。
 *
 * 数据流：
 * 1. 打开（state.visible → true）→ `useWorkspaceIndex().refresh(false)`：
 *    优先主进程缓存，无缓存时主进程构建索引；主进程不可用只落到错误态，不抛错；
 * 2. `buildAttachmentGroups(snapshot)` 按 exists 分组（缺失在前）+ 统计引用来源数；
 * 3. 行内「N 处引用」展开 → `resolveAttachmentReferences(snapshot, attachment)`
 *    （来源文件绝对路径映射为相对路径/标题，旧数据回退裁剪路径+文件名）；
 * 4. 「在资源管理器中显示」→ 经白名单 send `IPC.FILE_MANAGER.OPEN_IN_EXPLORER`
 *    （主进程做 Path Guard 校验后 shell.showItemInFolder，渲染层不直接触碰文件系统）；
 * 5. 「刷新索引 / 重试」→ `refresh(true)` 强制主进程重建；刷新失败保留上次快照并提示。
 *
 * 兼容：`attachments` 为 task-12 新增可选字段——快照无该字段时展示
 * 「索引版本不支持附件信息」空态（与「字段为空数组」的空态区分）；旧主进程不会抛错。
 *
 * i18n：使用动态键表 + 中文兜底（建议键 `editorUi.attachments.*` 由主控补词典；
 * 补齐词典后自动切换，补词典前界面仍可读）。
 */
import { computed, ref, watch } from 'vue'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import { useWorkspaceIndex } from '../../../composables/useWorkspaceIndex'
import { IPC } from '../../../../../shared/ipc-channels'
import type { WorkspaceAttachment } from '../../../../../shared/types/workspace-index'
import BaseDialog from '../../dialogs/BaseDialog.vue'
import {
    buildAttachmentGroups,
    closeAttachmentDialogState,
    countAttachmentReferences,
    normalizeAttachmentPathKey,
    resolveAttachmentReferences,
    supportsAttachmentIndex,
    attachmentDialogState
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
    targetWorkspaceUnknown: 'editorUi.attachments.targetWorkspaceUnknown'
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
/** 加载请求序号：连续刷新时只保留最后一次结果相关的 UI 状态 */
let loadSequence = 0

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

/** 刷新索引（强制重建快照） */
function handleRefresh(): void {
    void loadIndex(true)
}

/** 关闭对话框（只切显隐，宿主保留；再次打开无需重建） */
function handleClose(): void {
    closeAttachmentDialogState()
}

// 打开即加载（宿主先挂载、后设置 visible，故 immediate 兜底）；关闭时清理临时 UI 状态
watch(
    () => state.visible,
    (visible: boolean) => {
        if (visible) {
            void loadIndex(false)
        } else {
            expandedKey.value = ''
            revealFailed.value = false
            // 关闭时丢弃在途刷新的 UI 状态（请求结果仍由控制器写入快照，下次打开直接复用）
            loadSequence += 1
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
    max-height: 32vh;
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

.attachment-reveal {
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
