/**
 * B1 Wiki 链接 Ctrl/Cmd+Click 宿主入口（1.5.1 本地知识库基座，2026-11-22）
 *
 * ## 职责
 * 把 `wiki-link-actions.ts` 的纯动作编排接到 Monaco 编辑器上：
 * 1. `editor.onMouseDown`：仅 Ctrl/Cmd + 左键点击触发；普通点击不跳转；
 * 2. `editor.addAction`：注册「打开光标处的 Wiki 链接」命令（命令面板 / 外部触发用，
 *    不带默认键位，不改变既有快捷键契约）；
 * 3. 根据动作结果按需挂载 B1 动作对话框（歧义候选 / 缺失页创建确认 / 被阻止 / 错误）：
 *    首次需要时才动态 import `WikiLinkActionDialog.vue`（独立异步 chunk，不进首屏），
 *    用 `createApp` 挂到 body 下的独立容器；关闭只切显隐，不反复重建；
 * 4. 卸载（`dispose()`）时释放鼠标监听、命令与对话框宿主，幂等可重复调用。
 *
 * ## 边界
 * - 不新增 IPC / EventBus 事件：索引数据来自既有 `FILE.GET_WORKSPACE_INDEX`，
 *   打开文件复用既有 `openIndexedFile`，创建缺失页复用既有 `FILE.CREATE_FILE_FOLDER`；
 * - 只处理 Markdown 编辑器（模型语言判定在 `performWikiLinkAction` 内完成）；
 * - 任何动态加载/注册失败都静默降级（日志 warn），不影响编辑器主链路；
 * - 本模块由 `MarkdownMonacoEditor.vue` 在 Monaco 就绪后动态 import（不增加首屏体积）。
 */
import { createApp, type App } from 'vue'
import { t } from '../../common/i18n'
import { logger } from '../../common/logger'
import {
    isWikiLinkModifierClick,
    performWikiLinkAction,
    readWikiLinkMousePosition,
    type WikiLinkActionDeps,
    type WikiLinkActionEditorLike,
    type WikiLinkActionOutcome,
    type WikiLinkActionPosition,
    type WikiLinkMouseEventLike
} from './wiki-link-actions'
import {
    closeWikiLinkActionDialogState,
    openWikiLinkActionDialogState,
    type WikiLinkActionDialogRequest
} from './wiki-link-action-dialog-state'

/* ============================ 常量 ============================ */

/** 对话框宿主容器 id（正文 Teleport 到 body，容器只承载独立 Vue 应用） */
export const WIKI_LINK_ACTION_HOST_ID = 'baize-wiki-link-action-host'

/** 「打开光标处 Wiki 链接」命令 id（Monaco 命令面板展示用；无默认键位） */
export const WIKI_LINK_ACTION_COMMAND_ID = 'baize.wiki-link.open-at-cursor'

/** 命令文案建议键（主控补词典前用中文兜底） */
export const WIKI_LINK_ACTION_COMMAND_LABEL_KEY = 'editorUi.wikiLinkAction.commandOpen'

/* ============================ 类型 ============================ */

/** 宿主需要的 Monaco 编辑器最小结构（命令注册 / 鼠标监听 / 模型与位置） */
export interface WikiLinkActionsEditorLike extends WikiLinkActionEditorLike {
    onMouseDown?(listener: (event: unknown) => void): { dispose(): void }
    addAction?(descriptor: {
        id: string
        label: string
        run(editor: WikiLinkActionEditorLike): void | Promise<void>
    }): { dispose(): void }
}

/** 宿主可选配置（动作依赖注入 + 命令文案覆盖） */
export interface WikiLinkActionsOptions extends WikiLinkActionDeps {
    /** 命令文案覆盖（缺省取 `editorUi.wikiLinkAction.commandOpen`，未补词典用中文兜底） */
    actionLabel?: string
}

/** 注册句柄（dispose 幂等；isDisposed 便于组件/测试判断） */
export interface WikiLinkActionsHandle {
    readonly isDisposed: boolean
    dispose(): void
}

/* ============================ 宿主挂载 / 卸载 ============================ */

/** 独立挂载的 Vue 应用实例（null = 尚未挂载） */
let hostApp: App | null = null
/** 宿主容器（body 下的独立 div） */
let hostContainer: HTMLElement | null = null
/**
 * 宿主卸载代数：动态 import 期间宿主被卸载时，约定本次挂载作废（防止卸载后补挂载泄漏）。
 */
let hostDisposeGeneration = 0

/** 挂载动作对话框宿主（首次需要时创建；失败返回 false 并记日志） */
async function ensureWikiLinkActionDialogHost(): Promise<boolean> {
    if (hostApp !== null) {
        return true
    }
    if (typeof document === 'undefined') {
        return false
    }
    const generation = hostDisposeGeneration
    try {
        // 动态 import：对话框（含 BaseDialog 等依赖）独立分块，首次 Ctrl/Cmd+Click 才加载
        const { default: WikiLinkActionDialog } = await import('./WikiLinkActionDialog.vue')
        // import 期间组件已卸载 / 宿主已释放：本次挂载作废，不留下悬挂实例
        if (generation !== hostDisposeGeneration || typeof document === 'undefined') {
            return false
        }
        const container = document.createElement('div')
        container.id = WIKI_LINK_ACTION_HOST_ID
        document.body.appendChild(container)
        const app = createApp(WikiLinkActionDialog)
        app.mount(container)
        hostApp = app
        hostContainer = container
        return true
    } catch (error) {
        logger.error('[B1] 挂载 Wiki 链接动作对话框宿主失败', error)
        disposeWikiLinkActionHost()
        return false
    }
}

/**
 * 卸载动作对话框宿主（组件卸载 / 测试清理用）。幂等，可再次触发动作重新挂载；
 * 关闭对话框本身只切显隐，不调用本函数。
 */
export function disposeWikiLinkActionHost(): void {
    // 先关状态再卸载：避免卸载瞬间仍处于 visible=true 时 Transition 离场补丁引用已移除节点
    closeWikiLinkActionDialogState()
    hostDisposeGeneration += 1
    if (hostApp !== null) {
        try {
            hostApp.unmount()
        } catch (error) {
            logger.warn('[B1] 卸载 Wiki 链接动作对话框宿主失败', error)
        }
        hostApp = null
    }
    if (hostContainer !== null) {
        hostContainer.remove()
        hostContainer = null
    }
}

/** 关闭动作对话框（主控如需「再次触发时先关闭」可调用；不销毁宿主） */
export function closeWikiLinkActionDialog(): void {
    closeWikiLinkActionDialogState()
}

/** 展示动作对话框（先确保宿主挂载，再写状态；失败静默降级） */
async function presentWikiLinkActionDialog(request: WikiLinkActionDialogRequest): Promise<void> {
    try {
        if (!(await ensureWikiLinkActionDialogHost())) {
            return
        }
        openWikiLinkActionDialogState(request)
    } catch (error) {
        logger.error('[B1] 展示 Wiki 链接动作对话框失败', error)
    }
}

/* ============================ 动作结果 → 对话框 ============================ */

/**
 * 根据动作编排结果决定后续 UI：
 * - ambiguous / missing / create-blocked / 打开失败 / 索引不可用 → 弹对应对话框；
 * - opened / ignored / invalid-target → 不弹对话框（打开由宿主链路完成，非法目标静默拒绝）。
 */
export async function dispatchWikiLinkActionOutcome(outcome: WikiLinkActionOutcome): Promise<void> {
    switch (outcome.kind) {
        case 'ambiguous':
            await presentWikiLinkActionDialog({
                kind: 'ambiguous',
                raw: outcome.raw,
                target: outcome.target,
                line: outcome.line,
                column: outcome.column,
                candidates: outcome.candidates
            })
            return
        case 'missing':
            await presentWikiLinkActionDialog({
                kind: 'missing',
                raw: outcome.raw,
                target: outcome.target,
                line: outcome.line,
                column: outcome.column,
                plan: outcome.plan
            })
            return
        case 'create-blocked':
            await presentWikiLinkActionDialog({
                kind: 'blocked',
                raw: outcome.raw,
                target: outcome.target,
                line: outcome.line,
                column: outcome.column,
                reason: outcome.reason,
                missingDirectory: outcome.missingDirectory,
                existingFilePath: outcome.existingFilePath
            })
            return
        case 'open-failed':
            await presentWikiLinkActionDialog({
                kind: 'error',
                raw: outcome.raw,
                target: outcome.target,
                line: outcome.line,
                column: outcome.column,
                reason: 'open-failed'
            })
            return
        case 'unavailable':
            await presentWikiLinkActionDialog({
                kind: 'error',
                raw: outcome.raw,
                target: outcome.target,
                line: outcome.line,
                column: outcome.column,
                reason: outcome.reason
            })
            return
        case 'error':
            await presentWikiLinkActionDialog({
                kind: 'error',
                raw: '',
                target: '',
                line: 0,
                column: 0,
                message: outcome.message
            })
            return
        default:
            // opened / ignored / invalid-target：不弹对话框
            if (outcome.kind === 'invalid-target') {
                logger.debug('[B1] Wiki 链接目标不合法，已拒绝跳转/创建：', outcome.reason)
            }
    }
}

/* ============================ 命令文案 ============================ */

/** 解析命令展示文案：显式覆盖 → i18n 词条 → 中文兜底 */
function resolveCommandLabel(options: WikiLinkActionsOptions): string {
    if (typeof options.actionLabel === 'string' && options.actionLabel.length > 0) {
        return options.actionLabel
    }
    const translated = t(WIKI_LINK_ACTION_COMMAND_LABEL_KEY)
    return translated !== WIKI_LINK_ACTION_COMMAND_LABEL_KEY ? translated : '打开光标处的 Wiki 链接'
}

/* ============================ 注册 / 释放 ============================ */

/** 执行一次动作并把结果交给对话框分发（异常内部消化；已释放则不再弹对话框） */
async function runWikiLinkActionAt(
    editor: WikiLinkActionsEditorLike,
    position: WikiLinkActionPosition | null,
    options: WikiLinkActionsOptions,
    isDisposed: () => boolean
): Promise<void> {
    if (!position) {
        return
    }
    const outcome = await performWikiLinkAction(editor, position, options)
    if (isDisposed()) {
        return
    }
    await dispatchWikiLinkActionOutcome(outcome)
}

/**
 * 注册 Wiki 链接 Ctrl/Cmd+Click 动作（编辑器就绪后调用一次）。
 *
 * @param editor Monaco 编辑器实例（最小结构；null/不支持时返回 null）
 * @param options 可选依赖注入（单测替身）与命令文案覆盖
 * @returns 释放句柄；真实注册失败（无 onMouseDown 且无 addAction）返回 null
 */
export async function setupWikiLinkActions(
    editor: WikiLinkActionsEditorLike | null | undefined,
    options: WikiLinkActionsOptions = {}
): Promise<WikiLinkActionsHandle | null> {
    if (!editor || typeof editor !== 'object') {
        return null
    }
    const canListenMouse = typeof editor.onMouseDown === 'function'
    const canRegisterCommand = typeof editor.addAction === 'function'
    if (!canListenMouse && !canRegisterCommand) {
        return null
    }

    let disposed = false
    let mouseDownDisposable: { dispose(): void } | null = null
    let commandDisposable: { dispose(): void } | null = null

    // 鼠标监听：仅 Ctrl/Cmd + 左键；普通点击完全不处理（不跳转、不加载索引）
    if (canListenMouse) {
        try {
            mouseDownDisposable =
                editor.onMouseDown?.((event: unknown) => {
                    if (disposed || !isWikiLinkModifierClick(event)) {
                        return
                    }
                    const position = readWikiLinkMousePosition(event)
                    if (!position) {
                        return
                    }
                    // 阻止 Ctrl/Cmd+Click 落成普通光标/多光标行为（Monaco 已派发，只能阻止默认）
                    try {
                        ;(event as WikiLinkMouseEventLike | null)?.event?.preventDefault?.()
                    } catch {
                        // 测试桩/极旧运行时无 preventDefault：忽略
                    }
                    void runWikiLinkActionAt(editor, position, options, () => disposed)
                }) ?? null
        } catch (error) {
            logger.warn('[B1] 注册 Wiki 链接鼠标监听失败，已跳过：', error)
            mouseDownDisposable = null
        }
    }

    // 命令注册：命令面板 / 外部触发（无默认键位，不改既有快捷键）
    if (canRegisterCommand) {
        try {
            commandDisposable =
                editor.addAction?.({
                    id: WIKI_LINK_ACTION_COMMAND_ID,
                    label: resolveCommandLabel(options),
                    run: (target) => {
                        const position = target?.getPosition?.() ?? editor.getPosition?.() ?? null
                        return runWikiLinkActionAt(editor, position, options, () => disposed)
                    }
                }) ?? null
        } catch (error) {
            logger.warn('[B1] 注册 Wiki 链接命令失败，已跳过：', error)
            commandDisposable = null
        }
    }

    if (mouseDownDisposable === null && commandDisposable === null) {
        return null
    }

    return {
        get isDisposed(): boolean {
            return disposed
        },
        dispose(): void {
            if (disposed) {
                return
            }
            disposed = true
            try {
                mouseDownDisposable?.dispose()
            } catch (error) {
                logger.warn('[B1] 释放 Wiki 链接鼠标监听失败：', error)
            }
            mouseDownDisposable = null
            try {
                commandDisposable?.dispose()
            } catch (error) {
                logger.warn('[B1] 释放 Wiki 链接命令失败：', error)
            }
            commandDisposable = null
            disposeWikiLinkActionHost()
        }
    }
}

// 便于主控 / 测试直接从本入口取对话框状态与关闭语义
export {
    buildWikiLinkCandidateItems,
    closeWikiLinkActionDialogState,
    openWikiLinkActionDialogState,
    setWikiLinkActionDialogBusy,
    setWikiLinkActionDialogError,
    wikiLinkActionDialogState,
    type WikiLinkActionDialogKind,
    type WikiLinkActionDialogRequest,
    type WikiLinkActionDialogState
} from './wiki-link-action-dialog-state'
export {
    cleanWikiLinkTarget,
    createMissingWikiPage,
    isSafeWikiLinkSegment,
    locateWikiLinkAt,
    openWikiLinkTarget,
    performWikiLinkAction,
    planWikiLinkCreation,
    resolveWikiLinkCandidates,
    type WikiLinkCandidate,
    type WikiLinkCreationPlan,
    type WikiLinkActionOutcome,
    type WikiLinkCleanTarget,
    type WikiLinkCreationPlanResult
} from './wiki-link-actions'
