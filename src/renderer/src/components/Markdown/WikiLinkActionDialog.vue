<template>
    <BaseDialog
        :visible="state.visible"
        :title="dialogTitle"
        width="560px"
        reset-position-on-open
        aria-describedby="wiki-link-action-dialog-hint"
        @close="handleClose"
    >
        <div v-if="request" class="wiki-link-dialog-body" :data-kind="request.kind">
            <!-- 链接上下文：原文 + 位置（歧义/缺失/阻止都展示，便于用户确认点的是哪条链接） -->
            <div v-if="request.raw.length > 0" class="wiki-link-context">
                <span class="wiki-link-raw">{{ request.raw }}</span>
                <span class="wiki-link-location">L{{ request.line }}:{{ request.column }}</span>
            </div>

            <!-- 歧义：候选列表（标题 + 相对路径），选择后打开 -->
            <template v-if="request.kind === 'ambiguous'">
                <p id="wiki-link-action-dialog-hint" class="wiki-link-hint">
                    {{ tOr(UI.ambiguousHint, '链接目标不唯一，请选择要打开的笔记：') }}
                </p>
                <ul
                    class="wiki-link-candidate-list"
                    role="list"
                    :aria-label="tOr(UI.candidateListLabel, '候选笔记列表')"
                >
                    <li
                        v-for="(item, index) in candidateItems"
                        :key="item.path"
                        class="wiki-link-candidate-row"
                    >
                        <button
                            type="button"
                            class="wiki-link-candidate btn-wiki-link-candidate"
                            :title="item.path"
                            :disabled="state.busy"
                            @click="handleSelectCandidate(index)"
                        >
                            <span class="wiki-link-candidate-title">{{ item.title }}</span>
                            <span class="wiki-link-candidate-path">{{ item.relativePath }}</span>
                        </button>
                    </li>
                </ul>
                <div v-if="candidateItems.length === 0" class="wiki-link-empty" role="status">
                    {{ tOr(UI.ambiguousEmpty, '目标候选已失效，请刷新索引后重试') }}
                </div>
            </template>

            <!-- 缺失：确认框展示「将创建 <相对路径>.md」，确认后走既有 CREATE_FILE_FOLDER -->
            <template v-else-if="request.kind === 'missing' && request.plan">
                <p id="wiki-link-action-dialog-hint" class="wiki-link-hint">
                    {{ tOr(UI.missingHint, '目标笔记不存在，是否创建？') }}
                </p>
                <p class="wiki-link-create-notice">
                    {{ tOr(UI.createNotice, '将创建 {path}', { path: request.plan.relativePath }) }}
                </p>
                <p class="wiki-link-create-dir">
                    {{ tOr(UI.createLocation, '保存到：{dir}', { dir: request.plan.dirPath }) }}
                </p>
            </template>

            <!-- 创建被阻止（目录不存在 / 已存在 / 非法目标 / 无工作区） -->
            <template v-else-if="request.kind === 'blocked'">
                <p
                    id="wiki-link-action-dialog-hint"
                    class="wiki-link-hint wiki-link-hint--error"
                    role="alert"
                >
                    {{ blockedMessage }}
                </p>
            </template>

            <!-- 动作错误（打开失败 / 索引不可用 / 其他异常） -->
            <template v-else>
                <p
                    id="wiki-link-action-dialog-hint"
                    class="wiki-link-hint wiki-link-hint--error"
                    role="alert"
                >
                    {{ errorMessage }}
                </p>
            </template>

            <!-- 请求失败（候选打开失败 / 创建失败）：不关闭对话框，允许重试 -->
            <div v-if="state.error.length > 0" class="wiki-link-dialog-error" role="alert">
                {{ state.error }}
            </div>
        </div>

        <template #footer>
            <button
                v-if="canCancel"
                type="button"
                class="dialog-btn dialog-btn--ghost btn-wiki-link-cancel"
                :disabled="state.busy"
                @click="handleClose"
            >
                {{ tOr(UI.cancel, '取消') }}
            </button>
            <button
                v-if="request?.kind === 'missing' && request.plan"
                type="button"
                class="dialog-btn dialog-btn--primary btn-wiki-link-create"
                :disabled="state.busy"
                @click="handleCreate"
            >
                {{ state.busy ? tOr(UI.creating, '创建中…') : tOr(UI.create, '创建') }}
            </button>
            <button
                v-else-if="!canCancel"
                type="button"
                class="dialog-btn dialog-btn--secondary btn-wiki-link-close"
                @click="handleClose"
            >
                {{ tOr(UI.close, '关闭') }}
            </button>
        </template>
    </BaseDialog>
</template>

<script setup lang="ts">
/**
 * B1 Wiki 链接动作对话框（歧义选择 / 缺失页创建确认 / 创建被阻止 / 动作错误）。
 *
 * 数据流：
 * 1. 宿主 `wiki-link-actions.index.ts` 在 Ctrl/Cmd+Click 后把 `WikiLinkActionOutcome`
 *    写入模块单例状态（`wiki-link-action-dialog-state.ts`）并打开本对话框；
 * 2. 歧义：候选列表来自索引快照（标题 + 相对路径），点击后复用既有
 *    `openWikiLinkTarget`（打开 + 跳行链路）打开，成功后关闭；
 * 3. 缺失：确认后调用 `createMissingWikiPage`（复用既有 `FILE.CREATE_FILE_FOLDER`，
 *    不新增 IPC），主进程成功时会自动打开新文件，本对话框关闭；
 * 4. 创建被阻止（目录不存在 / 文件已存在 / 非法目标）：只展示原因与「关闭」，
 *    不提供创建按钮（目录不存在时提示用户先创建目录，不递归建目录）。
 *
 * i18n：使用动态键表 + 中文兜底（建议键 `editorUi.wikiLinkAction.*`，由主控补词典；
 * 补词典前界面仍可读，补齐后自动切换）。
 */
import { computed } from 'vue'
import { t } from '../../common/i18n'
import BaseDialog from '../dialogs/BaseDialog.vue'
import { createMissingWikiPage, openWikiLinkTarget } from './wiki-link-actions'
import {
    buildWikiLinkCandidateItems,
    closeWikiLinkActionDialogState,
    setWikiLinkActionDialogBusy,
    setWikiLinkActionDialogError,
    wikiLinkActionDialogState
} from './wiki-link-action-dialog-state'

/** 对话框文案建议键（主控补 editorUi.wikiLinkAction.* 词典后自动生效；未补时用中文兜底） */
const UI = {
    titleAmbiguous: 'editorUi.wikiLinkAction.titleAmbiguous',
    titleMissing: 'editorUi.wikiLinkAction.titleMissing',
    titleBlocked: 'editorUi.wikiLinkAction.titleBlocked',
    titleError: 'editorUi.wikiLinkAction.titleError',
    ambiguousHint: 'editorUi.wikiLinkAction.ambiguousHint',
    ambiguousEmpty: 'editorUi.wikiLinkAction.ambiguousEmpty',
    candidateListLabel: 'editorUi.wikiLinkAction.candidateListLabel',
    missingHint: 'editorUi.wikiLinkAction.missingHint',
    createNotice: 'editorUi.wikiLinkAction.createNotice',
    createLocation: 'editorUi.wikiLinkAction.createLocation',
    blockedDirectoryMissing: 'editorUi.wikiLinkAction.blockedDirectoryMissing',
    blockedAlreadyExists: 'editorUi.wikiLinkAction.blockedAlreadyExists',
    blockedInvalidTarget: 'editorUi.wikiLinkAction.blockedInvalidTarget',
    blockedDefault: 'editorUi.wikiLinkAction.blockedDefault',
    noWorkspace: 'editorUi.wikiLinkAction.noWorkspace',
    indexError: 'editorUi.wikiLinkAction.indexError',
    openFailed: 'editorUi.wikiLinkAction.openFailed',
    createFailed: 'editorUi.wikiLinkAction.createFailed',
    createIpcUnavailable: 'editorUi.wikiLinkAction.createIpcUnavailable',
    createInvalidPlan: 'editorUi.wikiLinkAction.createInvalidPlan',
    errorHint: 'editorUi.wikiLinkAction.errorHint',
    cancel: 'editorUi.wikiLinkAction.cancel',
    create: 'editorUi.wikiLinkAction.create',
    creating: 'editorUi.wikiLinkAction.creating',
    close: 'editorUi.wikiLinkAction.close'
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
const state = wikiLinkActionDialogState

/** 当前请求（null = 关闭状态，visible=false 时正文不渲染） */
const request = computed(() => state.request)

/** 候选展示项（标题 + 相对路径；空/非法候选已在纯函数内过滤） */
const candidateItems = computed(() => buildWikiLinkCandidateItems(request.value?.candidates))

/** 是否允许「取消」（歧义/缺失确认场景；阻止/错误场景只有一个关闭按钮） */
const canCancel = computed(
    () => request.value?.kind === 'ambiguous' || request.value?.kind === 'missing'
)

/** 对话框标题（按形态切换） */
const dialogTitle = computed(() => {
    switch (request.value?.kind) {
        case 'ambiguous':
            return tOr(UI.titleAmbiguous, '链接目标不唯一')
        case 'missing':
            return tOr(UI.titleMissing, '创建缺失的笔记')
        case 'blocked':
            return tOr(UI.titleBlocked, '无法创建笔记')
        default:
            return tOr(UI.titleError, '链接动作失败')
    }
})

/** 创建被阻止原因文案（目录不存在时明确提示「请先创建目录」） */
const blockedMessage = computed(() => {
    const current = request.value
    if (!current) {
        return ''
    }
    switch (current.reason) {
        case 'directory-missing':
            return tOr(UI.blockedDirectoryMissing, '目录不存在，请先创建目录：{dir}', {
                dir: current.missingDirectory ?? current.target
            })
        case 'already-exists':
            return tOr(UI.blockedAlreadyExists, '目标文件已存在：{path}', {
                path: current.existingFilePath ?? current.target
            })
        case 'no-workspace':
            return tOr(UI.noWorkspace, '尚未打开工作区，无法跳转或创建笔记（请先打开一个文件夹）')
        case 'index-error':
            return tOr(UI.indexError, '加载工作区索引失败，请稍后重试')
        case 'open-failed':
            return tOr(UI.openFailed, '打开文件失败，请稍后重试')
        case 'invalid-target':
            return tOr(UI.blockedInvalidTarget, '链接目标不合法，无法创建笔记')
        default:
            return tOr(UI.blockedDefault, '无法完成该链接动作')
    }
})

/** 动作错误文案（优先展示宿主/主进程给出的具体信息） */
const errorMessage = computed(() => {
    const current = request.value
    if (!current) {
        return ''
    }
    if (typeof current.message === 'string' && current.message.length > 0) {
        return current.message
    }
    if (current.reason === 'no-workspace') {
        return tOr(UI.noWorkspace, '尚未打开工作区，无法跳转或创建笔记（请先打开一个文件夹）')
    }
    if (current.reason === 'index-error') {
        return tOr(UI.indexError, '加载工作区索引失败，请稍后重试')
    }
    if (current.reason === 'open-failed') {
        return tOr(UI.openFailed, '打开文件失败，请稍后重试')
    }
    return tOr(UI.errorHint, '操作失败，请稍后重试')
})

/** 创建失败文案（IPC 不可用 / 参数非法 / 主进程异常 message） */
function formatCreateFailure(error?: string): string {
    if (error === 'IPC_UNAVAILABLE') {
        return tOr(UI.createIpcUnavailable, '无法连接主进程，创建失败')
    }
    if (error === 'INVALID_PLAN') {
        return tOr(UI.createInvalidPlan, '创建参数不合法，无法创建')
    }
    const hint = tOr(UI.createFailed, '创建笔记失败，请稍后重试')
    return typeof error === 'string' && error.length > 0 ? `${hint}（${error}）` : hint
}

/** 选择歧义候选：打开命中文件；成功后关闭，失败在对话框内提示（可重试） */
async function handleSelectCandidate(index: number): Promise<void> {
    const candidate = candidateItems.value[index]
    if (!candidate || state.busy) {
        return
    }
    setWikiLinkActionDialogError('')
    setWikiLinkActionDialogBusy(true)
    try {
        const opened = await openWikiLinkTarget(candidate.path)
        if (opened) {
            closeWikiLinkActionDialogState()
        } else {
            setWikiLinkActionDialogError(tOr(UI.openFailed, '打开文件失败，请稍后重试'))
        }
    } finally {
        setWikiLinkActionDialogBusy(false)
    }
}

/** 确认创建缺失页：复用既有 CREATE_FILE_FOLDER（主进程成功后自动打开新文件） */
async function handleCreate(): Promise<void> {
    const plan = request.value?.plan
    if (!plan || state.busy) {
        return
    }
    setWikiLinkActionDialogError('')
    setWikiLinkActionDialogBusy(true)
    try {
        const result = await createMissingWikiPage(plan)
        if (result.ok) {
            closeWikiLinkActionDialogState()
        } else {
            setWikiLinkActionDialogError(formatCreateFailure(result.error))
        }
    } finally {
        setWikiLinkActionDialogBusy(false)
    }
}

/** 关闭对话框（只切显隐，宿主保留；再次打开无需重建） */
function handleClose(): void {
    closeWikiLinkActionDialogState()
}
</script>

<style scoped>
.wiki-link-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px 16px 8px;
    min-height: 140px;
}

.wiki-link-context {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 10px;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
    font-size: 12px;
}

.wiki-link-raw {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-accent-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.wiki-link-location {
    flex: none;
    color: var(--theme-secondary-text-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.wiki-link-hint {
    margin: 0;
    font-size: 13px;
    color: var(--theme-text-color);
}

.wiki-link-hint--error {
    color: var(--theme-accent-color);
}

.wiki-link-create-notice {
    margin: 0;
    padding: 8px 10px;
    border: 1px dashed var(--theme-border-color);
    border-radius: 6px;
    background: var(--theme-card-background);
    font-size: 13px;
    color: var(--theme-text-color);
    word-break: break-all;
}

.wiki-link-create-dir {
    margin: 0;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
    word-break: break-all;
}

.wiki-link-candidate-list {
    list-style: none;
    margin: 0;
    padding: 4px;
    max-height: 42vh;
    overflow-y: auto;
    background: var(--theme-card-background);
    border: 1px solid var(--theme-border-color);
    border-radius: 6px;
}

.wiki-link-candidate-row + .wiki-link-candidate-row {
    margin-top: 2px;
}

.wiki-link-candidate {
    display: flex;
    align-items: baseline;
    gap: 10px;
    width: 100%;
    padding: 6px 10px;
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

.wiki-link-candidate:hover:not(:disabled) {
    background: var(--theme-hover-background);
}

.wiki-link-candidate:focus-visible {
    outline: 2px solid var(--theme-accent-color);
    outline-offset: 1px;
}

.wiki-link-candidate-title {
    flex: none;
    max-width: 46%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-text-color);
}

.wiki-link-candidate-path {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--theme-secondary-text-color);
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
}

.wiki-link-empty {
    padding: 12px;
    text-align: center;
    font-size: 12px;
    color: var(--theme-secondary-text-color);
}

.wiki-link-dialog-error {
    padding: 6px 10px;
    font-size: 12px;
    color: var(--theme-accent-color);
    background: var(--theme-hover-background);
    border-radius: 4px;
    word-break: break-all;
}
</style>
