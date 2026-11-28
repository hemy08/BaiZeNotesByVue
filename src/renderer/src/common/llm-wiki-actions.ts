/**
 * 1.5.7 LLM Wiki L1 —— 初始化工作区（raw/ 与 wiki/）渲染层入口动作
 *
 * ## 职责边界
 * - 只做「调用主进程白名单通道 + 成功/失败可见提示」两件事，不复制主进程的目录创建与
 *   schema.md 模板逻辑（目录约定、幂等与工作区根校验全部在主进程 handler 内）；
 * - 调用方（三处共用一条实现，避免菜单/命令面板/设置页各写一份 invoke）：
 *   1. `components/MenuBar/menu-actions.ts`（「文件 → 初始化 LLM Wiki」菜单动作拦截）；
 *   2. 命令面板 `components/search/command-registry.ts` 注册的 `initialize-llm-wiki`
 *      命令（menuAction 同菜单动作，经 HandleMenuAction 单链路分发到 1）；
 *   3. `components/dialogs/complex/system-setting/FeaturesPanel.vue`（工作区模式从
 *      traditional 切换到 llm-wiki 的确认对话框，确认后先初始化、成功才写入设置草稿）。
 * - 通道：`IPC.FILE.INITIALIZE_LLM_WIKI`（invoke，无参；响应 `{ success: boolean; error?: string }`），
 *   已在 preload 主窗口 send/invoke 白名单内（IPC-06/IPC-07，不得绕过）。
 *
 * ## 失败口径（LOG-08 禁止静默失败）
 * - 受限 ipcRenderer 不可用 / 主进程返回 `success=false` / invoke 抛异常，三种失败都记
 *   error 日志并经应用内消息对话框给用户可见提示（标题取菜单动作名，正文带可读原因）；
 * - 成功统一展示「已初始化 raw/ 与 wiki/」提示，让用户明确目录已就绪；
 * - 本函数不抛异常：菜单动作/设置页确认流程可直接 `void` 调用或 `await` 结果。
 */
import { IPC } from '../../../shared/ipc-channels'
import { describeActionError } from './action-feedback'
import { showAppError, showAppSuccess } from './app-message'
import { t } from './i18n'
import { logger } from './logger'

/** 渲染层受限 ipcRenderer 的最小结构（便于单测注入替身，不直接依赖 Electron 类型） */
interface LlmWikiIpcRendererLike {
    invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
}

/** 取受限 ipcRenderer；非 Electron 环境（测试桩/旧 preload）返回 null */
function getIpcRenderer(): LlmWikiIpcRendererLike | null {
    if (typeof window === 'undefined') {
        return null
    }
    const ipcRenderer = (window as { electron?: { ipcRenderer?: LlmWikiIpcRendererLike } }).electron
        ?.ipcRenderer
    if (!ipcRenderer || typeof ipcRenderer.invoke !== 'function') {
        return null
    }
    return ipcRenderer
}

/** 初始化动作的反馈标题（菜单项名即用户认知里的操作名，三处入口共用） */
function feedbackTitle(): string {
    return t('menu.file.initializeLlmWiki')
}

/**
 * 读取主进程返回的初始化结果（只做运行时结构守卫）。
 *
 * 契约形状 `{ success: boolean; error?: string }` 的跨进程类型真源在 `src/shared/types`
 * （主进程侧维护），渲染层不重复声明同名 interface（ARCH-12/GEN-03）。
 */
function readInitializeResult(raw: unknown): { success: boolean; error?: string } {
    if (!raw || typeof raw !== 'object') {
        return { success: false }
    }
    const record = raw as { success?: unknown; error?: unknown }
    const error =
        typeof record.error === 'string' && record.error.trim().length > 0
            ? record.error.trim()
            : undefined
    return { success: record.success === true, ...(error ? { error } : {}) }
}

/**
 * 初始化 LLM Wiki 工作区（在已打开的工作区根下创建 raw/ 与 wiki/ 目录，幂等）。
 *
 * @returns 是否初始化成功；**失败时已给出可见提示**，调用方只需据此决定是否继续
 *          （设置页：成功才把工作区模式写入草稿；菜单/命令面板：忽略返回值）。
 */
export async function initializeLlmWiki(): Promise<boolean> {
    const ipcRenderer = getIpcRenderer()
    if (!ipcRenderer) {
        logger.error('[LlmWiki] 受限 ipcRenderer 不可用，无法初始化 LLM Wiki 工作区')
        showAppError(t('dialogRenderer.systemSetting.features.workspaceModeInitUnavailable'), {
            title: feedbackTitle()
        })
        return false
    }

    try {
        const raw: unknown = await ipcRenderer.invoke(IPC.FILE.INITIALIZE_LLM_WIKI)
        const result = readInitializeResult(raw)
        if (result.success) {
            showAppSuccess(t('dialogRenderer.systemSetting.features.workspaceModeInitSuccess'), {
                title: feedbackTitle()
            })
            return true
        }
        const detail = result.error ?? t('common.unknown')
        logger.error('[LlmWiki] 初始化 LLM Wiki 工作区失败：', detail)
        showAppError(
            t('dialogRenderer.systemSetting.features.workspaceModeInitFailed', { error: detail }),
            { title: feedbackTitle() }
        )
        return false
    } catch (error) {
        logger.error('[LlmWiki] 初始化 LLM Wiki 工作区 IPC 调用异常：', error)
        showAppError(
            t('dialogRenderer.systemSetting.features.workspaceModeInitFailed', {
                error: describeActionError(error, t('common.unknown'))
            }),
            { title: feedbackTitle() }
        )
        return false
    }
}
