<template>
    <!--
        1.5.1 本地知识库查询对话框（B2 标签浏览 / B1 缺失与歧义链接 / B4 反向链接）。
        - 数据来自主进程工作区索引快照（既有无新增 IPC：FILE.GET_WORKSPACE_INDEX）；
        - 打开时 refresh(false) 读取缓存/首次索引；「刷新索引 / 重试」refresh(true) 强制重建；
        - 点击文件/问题行复用既有 openIndexedFile（打开 + 跳行链路），不直接操作编辑器；
        - 所有用户文案走 `editorUi.knowledge.*` 建议键 + 中文兜底（词典由主控补）。
    -->
    <BaseDialog
        non-modal
        :visible="state.visible"
        :title="dialogTitle"
        width="860px"
        reset-position-on-open
        @close="handleClose"
    >
        <div class="knowledge-body" :data-mode="state.mode">
            <div class="knowledge-toolbar">
                <span class="knowledge-target" :title="targetTitle">{{ targetText }}</span>
                <span class="knowledge-summary">{{ summaryText }}</span>
            </div>

            <div v-if="initialLoading" class="knowledge-placeholder" role="status">
                {{ tOr(UI.loading, '正在加载工作区索引…') }}
            </div>
            <div
                v-else-if="errorCode === 'no-workspace'"
                class="knowledge-placeholder knowledge-placeholder--empty"
            >
                {{ tOr(UI.noWorkspace, '尚未打开工作区，无法查询知识库（请先打开一个文件夹）') }}
            </div>
            <div
                v-else-if="errorCode === 'error' && snapshot === null"
                class="knowledge-placeholder knowledge-placeholder--error"
                role="alert"
            >
                <p class="knowledge-error-text">
                    {{ tOr(UI.loadFailed, '加载工作区索引失败，请稍后重试') }}
                </p>
                <button
                    type="button"
                    class="dialog-btn dialog-btn--ghost btn btn-retry-knowledge"
                    :disabled="loading"
                    @click="handleRefresh"
                >
                    {{ tOr(UI.retry, '重试') }}
                </button>
            </div>
            <div
                v-else-if="snapshot !== null && snapshot.files.length === 0"
                class="knowledge-placeholder knowledge-placeholder--empty"
            >
                {{ tOr(UI.emptyWorkspace, '工作区中没有可索引的 Markdown / TXT 文件') }}
            </div>

            <template v-else>
                <!-- B2 标签浏览：标签聚合（tag/count）→ 展开文件 → 点击打开 -->
                <div v-if="state.mode === 'tags'" class="knowledge-mode knowledge-mode--tags">
                    <div
                        v-if="tags.length === 0"
                        class="knowledge-placeholder knowledge-placeholder--empty"
                    >
                        {{ tOr(UI.emptyTags, '工作区中还没有任何标签') }}
                    </div>
                    <ul
                        v-else
                        class="tag-list"
                        role="list"
                        :aria-label="tOr(UI.tagListLabel, '标签列表')"
                    >
                        <li v-for="tag in tags" :key="tag.tag" class="tag-row">
                            <button
                                type="button"
                                class="tag-item"
                                :aria-expanded="expandedTag === tag.tag"
                                :title="tag.tag"
                                @click="toggleTag(tag.tag)"
                            >
                                <span class="tag-name">#{{ tag.tag }}</span>
                                <span class="tag-count">{{ tag.count }}</span>
                            </button>
                            <ul
                                v-if="expandedTag === tag.tag"
                                class="tag-files"
                                role="list"
                                :aria-label="tOr(UI.tagFilesLabel, '包含该标签的文件')"
                            >
                                <li
                                    v-for="file in expandedTagFiles"
                                    :key="file.path"
                                    class="tag-file-row"
                                >
                                    <button
                                        type="button"
                                        class="tag-file"
                                        :title="file.path"
                                        @click="handleOpenFile(file.path, 1)"
                                    >
                                        <span class="tag-file-title">{{ file.title }}</span>
                                        <span class="tag-file-path">{{ file.relativePath }}</span>
                                    </button>
                                </li>
                            </ul>
                        </li>
                    </ul>
                </div>

                <!-- B1 缺失 / 歧义链接：来源文件 / 行号 / target / 状态 → 点击打开来源行 -->
                <div
                    v-else-if="state.mode === 'links'"
                    class="knowledge-mode knowledge-mode--links"
                >
                    <div
                        v-if="linkIssues.length === 0"
                        class="knowledge-placeholder knowledge-placeholder--empty"
                    >
                        {{ tOr(UI.emptyLinks, '没有缺失或歧义的 Wiki 链接') }}
                    </div>
                    <ul
                        v-else
                        class="link-list"
                        role="list"
                        :aria-label="tOr(UI.linkListLabel, '链接问题列表')"
                    >
                        <li
                            v-for="issue in linkIssues"
                            :key="`${issue.sourcePath}-${issue.line}-${issue.column}-${issue.target}`"
                            class="link-row"
                        >
                            <button
                                type="button"
                                class="link-item"
                                :title="issue.sourcePath"
                                @click="handleOpenFile(issue.sourcePath, issue.line)"
                            >
                                <span class="link-location"
                                    >L{{ issue.line }}:{{ issue.column }}</span
                                >
                                <span class="link-source">{{ issue.sourceRelativePath }}</span>
                                <span class="link-target">[[{{ issue.target }}]]</span>
                                <span class="link-status" :class="`link-status--${issue.status}`">
                                    {{ statusLabel(issue.status) }}
                                </span>
                            </button>
                        </li>
                    </ul>
                </div>

                <!-- B4 反向链接：当前活动文件的反向链接列表 -->
                <div v-else class="knowledge-mode knowledge-mode--backlinks">
                    <div
                        v-if="activeFilePath.length === 0"
                        class="knowledge-placeholder knowledge-placeholder--empty"
                    >
                        {{ tOr(UI.noActiveFile, '当前没有打开的文件，无法查询反向链接') }}
                    </div>
                    <div
                        v-else-if="backlinks.length === 0"
                        class="knowledge-placeholder knowledge-placeholder--empty"
                    >
                        {{ tOr(UI.emptyBacklinks, '没有指向当前文件的反向链接') }}
                    </div>
                    <ul
                        v-else
                        class="backlink-list"
                        role="list"
                        :aria-label="tOr(UI.backlinkListLabel, '反向链接列表')"
                    >
                        <li
                            v-for="backlink in backlinks"
                            :key="`${backlink.sourcePath}-${backlink.line}-${backlink.column}`"
                            class="backlink-row"
                        >
                            <button
                                type="button"
                                class="backlink-item"
                                :title="backlink.sourcePath"
                                @click="handleOpenFile(backlink.sourcePath, backlink.line)"
                            >
                                <span class="backlink-location"
                                    >L{{ backlink.line }}:{{ backlink.column }}</span
                                >
                                <span class="backlink-source">{{
                                    backlink.sourceRelativePath
                                }}</span>
                                <span class="backlink-title">{{ backlink.sourceTitle }}</span>
                            </button>
                        </li>
                    </ul>
                </div>
            </template>

            <div v-if="refreshFailed" class="knowledge-hint knowledge-hint--error" role="alert">
                {{ tOr(UI.refreshFailed, '刷新索引失败，以下为上次索引结果') }}
            </div>
            <div v-if="loading && snapshot !== null" class="knowledge-hint" role="status">
                {{ tOr(UI.refreshing, '正在刷新工作区索引…') }}
            </div>
            <div v-if="openFailed" class="knowledge-hint knowledge-hint--error" role="alert">
                {{ tOr(UI.openFailed, '打开文件失败，请稍后重试') }}
            </div>
        </div>

        <template #footer>
            <button
                type="button"
                class="dialog-btn dialog-btn--ghost btn btn-refresh-knowledge"
                :disabled="loading"
                @click="handleRefresh"
            >
                {{ tOr(UI.refresh, '刷新索引') }}
            </button>
            <button
                type="button"
                class="dialog-btn dialog-btn--secondary btn-close-knowledge"
                @click="handleClose"
            >
                {{ tOr(UI.close, '关闭') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * 1.5.1 本地知识库查询对话框（renderer-only，默认能力，不新增 IPC / EventBus / i18n 词典）。
 *
 * 数据流：
 * 1. 打开（state.visible → true）→ `useWorkspaceIndex().refresh(false)`：
 *    优先主进程缓存，无缓存时主进程构建索引；主进程不可用只落到错误态，不抛错；
 * 2. 三个视图共享同一快照：
 *    - tags：`snapshot.tags` + `findFilesByTag(tag)`（点击标签展开文件）；
 *    - links：`buildKnowledgeLinkIssues(snapshot)`（files[].links 中 missing/ambiguous）；
 *    - backlinks：`documentHistoryState.activeFilePath` + `findBacklinks(path)`；
 * 3. 点击文件/问题行 → `openIndexedFile(path, line)`（既有打开 + 跳行链路）；
 * 4. 「刷新索引 / 重试」→ `refresh(true)` 强制主进程重建；刷新失败保留上次快照并提示。
 *
 * i18n：使用动态键表 + 中文兜底（建议键 `editorUi.knowledge.*` 由主控补词典；
 * 补齐词典后自动切换，补词典前界面仍可读）。
 */
import { computed, ref, watch } from 'vue'
import { t } from '../../../common/i18n'
import { logger } from '../../../common/logger'
import { documentHistoryState } from '../../../composables/useDocumentHistory'
import { openIndexedFile, useWorkspaceIndex } from '../../../composables/useWorkspaceIndex'
import BaseDialog from '../../dialogs/BaseDialog.vue'
import {
    buildKnowledgeLinkIssues,
    closeKnowledgeDialogState,
    knowledgeDialogState
} from './knowledge-dialog-state'

/** 对话框文案建议键（主控补 editorUi.knowledge.* 词典后自动生效；未补时用中文兜底） */
const UI = {
    titleTags: 'editorUi.knowledge.titleTags',
    titleLinks: 'editorUi.knowledge.titleLinks',
    titleBacklinks: 'editorUi.knowledge.titleBacklinks',
    loading: 'editorUi.knowledge.loading',
    loadFailed: 'editorUi.knowledge.loadFailed',
    noWorkspace: 'editorUi.knowledge.noWorkspace',
    emptyWorkspace: 'editorUi.knowledge.emptyWorkspace',
    emptyTags: 'editorUi.knowledge.emptyTags',
    emptyLinks: 'editorUi.knowledge.emptyLinks',
    noActiveFile: 'editorUi.knowledge.noActiveFile',
    emptyBacklinks: 'editorUi.knowledge.emptyBacklinks',
    retry: 'editorUi.knowledge.retry',
    refresh: 'editorUi.knowledge.refresh',
    refreshing: 'editorUi.knowledge.refreshing',
    refreshFailed: 'editorUi.knowledge.refreshFailed',
    openFailed: 'editorUi.knowledge.openFailed',
    close: 'editorUi.knowledge.close',
    statusMissing: 'editorUi.knowledge.statusMissing',
    statusAmbiguous: 'editorUi.knowledge.statusAmbiguous',
    summaryTags: 'editorUi.knowledge.summaryTags',
    summaryLinks: 'editorUi.knowledge.summaryLinks',
    summaryBacklinks: 'editorUi.knowledge.summaryBacklinks',
    targetWorkspace: 'editorUi.knowledge.targetWorkspace',
    targetWorkspaceUnknown: 'editorUi.knowledge.targetWorkspaceUnknown',
    targetActiveFile: 'editorUi.knowledge.targetActiveFile',
    targetNoActiveFile: 'editorUi.knowledge.targetNoActiveFile',
    tagListLabel: 'editorUi.knowledge.tagListLabel',
    tagFilesLabel: 'editorUi.knowledge.tagFilesLabel',
    linkListLabel: 'editorUi.knowledge.linkListLabel',
    backlinkListLabel: 'editorUi.knowledge.backlinkListLabel'
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
const state = knowledgeDialogState

/** 工作区索引控制器（本实例独立 loading/error；快照由主进程缓存） */
const { state: indexState, refresh, findBacklinks, findFilesByTag } = useWorkspaceIndex()

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

/** 已展开的标签（空串 = 全部收起；同一时间只展开一个，保持列表紧凑） */
const expandedTag = ref('')
/** 最近一次打开文件是否失败（可见反馈，不弹错误框） */
const openFailed = ref(false)
/** 加载请求序号：连续刷新时只保留最后一次结果相关的 UI 状态 */
let loadSequence = 0

/** 当前视图标题（三视图共用同一宿主，标题随 mode 切换） */
const dialogTitle = computed(() => {
    if (state.mode === 'links') {
        return tOr(UI.titleLinks, '链接问题')
    }
    if (state.mode === 'backlinks') {
        return tOr(UI.titleBacklinks, '反向链接')
    }
    return tOr(UI.titleTags, '标签浏览')
})

/** 视图次级标题 / 目标提示：backlinks 强调当前活动文件，其余展示工作区根 */
const targetTitle = computed(() => {
    if (state.mode === 'backlinks') {
        return documentHistoryState.activeFilePath
    }
    return snapshot.value?.rootPath ?? ''
})

const targetText = computed(() => {
    if (state.mode === 'backlinks') {
        const activePath = documentHistoryState.activeFilePath
        return activePath.length > 0
            ? tOr(UI.targetActiveFile, '当前文件：{path}', { path: activePath })
            : tOr(UI.targetNoActiveFile, '当前没有打开的文件')
    }
    const rootPath = snapshot.value?.rootPath ?? ''
    return rootPath.length > 0
        ? tOr(UI.targetWorkspace, '工作区：{path}', { path: rootPath })
        : tOr(UI.targetWorkspaceUnknown, '工作区索引')
})

/** 标签聚合列表（快照已按数量降序 + 标签名升序） */
const tags = computed(() => {
    const list = snapshot.value?.tags
    return Array.isArray(list) ? list : []
})

/** 当前展开标签下的文件（复用控制器查询，不遍历 UI） */
const expandedTagFiles = computed(() => {
    if (expandedTag.value.length === 0) {
        return []
    }
    return findFilesByTag(expandedTag.value)
})

/** 缺失 / 歧义链接清单（含来源文件、行号、target、状态） */
const linkIssues = computed(() => buildKnowledgeLinkIssues(snapshot.value))

/** 当前活动文件路径（backlinks 视图目标） */
const activeFilePath = computed(() => documentHistoryState.activeFilePath)

/** 当前活动文件的反向链接（活动文件变化/刷新快照后自动重算） */
const backlinks = computed(() => {
    const target = documentHistoryState.activeFilePath
    return target.length > 0 ? findBacklinks(target) : []
})

/** 顶部汇总文案（随视图切换） */
const summaryText = computed(() => {
    if (state.mode === 'links') {
        const missing = linkIssues.value.filter((issue) => issue.status === 'missing').length
        const ambiguous = linkIssues.value.length - missing
        return tOr(UI.summaryLinks, '缺失 {missing} 个 / 歧义 {ambiguous} 个', {
            missing,
            ambiguous
        })
    }
    if (state.mode === 'backlinks') {
        return tOr(UI.summaryBacklinks, '共 {count} 条反向链接', {
            count: backlinks.value.length
        })
    }
    return tOr(UI.summaryTags, '共 {tags} 个标签 / {files} 个文件', {
        tags: tags.value.length,
        files: snapshot.value?.files.length ?? 0
    })
})

/** 链接状态文案（缺失 / 歧义） */
function statusLabel(status: 'missing' | 'ambiguous'): string {
    return status === 'missing' ? tOr(UI.statusMissing, '缺失') : tOr(UI.statusAmbiguous, '歧义')
}

/** 展开 / 收起某个标签下的文件列表 */
function toggleTag(tag: string): void {
    expandedTag.value = expandedTag.value === tag ? '' : tag
}

/**
 * 打开索引命中文件（既有打开 + 跳行链路）。
 * 失败时只给对话框内可见提示并记日志，不弹错误框、不影响对话框继续使用。
 */
async function handleOpenFile(filePath: string, line = 1): Promise<void> {
    openFailed.value = false
    try {
        const opened = await openIndexedFile(filePath, line)
        if (!opened) {
            openFailed.value = true
            logger.warn('[知识库查询] 打开索引文件失败', filePath)
        }
    } catch (error) {
        openFailed.value = true
        logger.warn('[知识库查询] 打开索引文件异常', error)
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
    openFailed.value = false
    try {
        await refresh(force)
    } catch (error) {
        logger.warn('[知识库查询] 加载工作区索引失败', error)
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
    closeKnowledgeDialogState()
}

// 打开即加载（宿主先挂载、后设置 visible，故 immediate 兜底）；关闭时清理临时 UI 状态
watch(
    () => state.visible,
    (visible: boolean) => {
        if (visible) {
            void loadIndex(false)
        } else {
            expandedTag.value = ''
            openFailed.value = false
        }
    },
    { immediate: true }
)

/** 视图切换（同一宿主内通过入口再次打开另一视图）时收起标签展开项 */
watch(
    () => state.mode,
    () => {
        expandedTag.value = ''
    }
)
</script>

<style scoped>
.knowledge-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px 8px;
    min-height: 360px;
}

.knowledge-toolbar {
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

.knowledge-target {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.knowledge-summary {
    flex: none;
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.knowledge-placeholder {
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

.knowledge-placeholder--empty {
    color: var(--theme-secondary-text-color);
}

.knowledge-placeholder--error {
    color: var(--theme-accent-color);
}

.knowledge-error-text {
    margin: 0;
}

/* ==================== 标签浏览 ==================== */
.knowledge-mode {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-height: 0;
    flex: 1;
}

.tag-list,
.tag-files,
.link-list,
.backlink-list {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 46vh;
    overflow-y: auto;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
}

.tag-row + .tag-row {
    margin-top: 2px;
}

.tag-item,
.tag-file,
.link-item,
.backlink-item {
    display: flex;
    align-items: baseline;
    gap: 8px;
    width: 100%;
    padding: 5px 8px;
    border: 1px solid transparent;
    border-radius: 4px;
    background: transparent;
    color: var(--theme-text-color);
    font-size: 12px;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    transition: all 0.2s ease;
}

.tag-item:hover,
.tag-file:hover,
.link-item:hover,
.backlink-item:hover {
    background: var(--theme-hover-background);
}

.tag-item:focus-visible,
.tag-file:focus-visible,
.link-item:focus-visible,
.backlink-item:focus-visible {
    outline: 2px solid var(--theme-accent-color);
    outline-offset: 1px;
}

.tag-item[aria-expanded='true'] {
    background: var(--theme-hover-background);
    border-color: var(--theme-accent-color);
}

.tag-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-accent-color);
}

.tag-count {
    flex: none;
    min-width: 2em;
    text-align: right;
    color: var(--theme-secondary-text-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.tag-files {
    margin: 2px 0 6px 20px;
    border-style: dotted;
}

.tag-file-title {
    flex: none;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.tag-file-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-secondary-text-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

/* ==================== 链接问题 ==================== */
.link-location,
.backlink-location {
    flex: none;
    width: 6em;
    color: var(--theme-secondary-text-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.link-source,
.backlink-source {
    flex: none;
    max-width: 34%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.link-target {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-accent-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.link-status {
    flex: none;
    padding: 0 6px;
    font-size: 11px;
    line-height: 18px;
    border-radius: 3px;
    border: 1px solid var(--theme-border-color);
    color: var(--theme-secondary-text-color);
}

.link-status--missing {
    border-color: var(--theme-accent-color);
    color: var(--theme-accent-color);
}

.link-status--ambiguous {
    border-style: dashed;
    color: var(--theme-accent-color);
}

/* ==================== 反向链接 ==================== */
.backlink-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-secondary-text-color);
}

/* ==================== 提示条 ==================== */
.knowledge-hint {
    padding: 6px 12px;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
    background: var(--theme-hover-background);
    border-radius: 4px;
}

.knowledge-hint--error {
    color: var(--theme-accent-color);
}
</style>
