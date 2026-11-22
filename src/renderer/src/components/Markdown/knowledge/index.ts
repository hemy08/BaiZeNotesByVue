/**
 * B2/B1/B4 知识库查询对外入口（供主控挂菜单 / 命令面板，**不要改菜单树本身**）
 *
 * 集成方式（主控只需一步）：
 * ```ts
 * import { openKnowledgeDialog } from '@renderer/components/Markdown/knowledge'
 * // 菜单动作 / 命令面板 / 快捷键回调里（三个视图分别对应三个菜单项）：
 * void openKnowledgeDialog('tags')      // B2 标签浏览
 * void openKnowledgeDialog('links')     // B1 缺失 / 歧义链接
 * void openKnowledgeDialog('backlinks') // B4 当前文件反向链接
 * ```
 *
 * 为什么自带宿主挂载（与 A3 文档历史、A4 Markdown lint、P0-8 写作风格检查同构）：
 * - 本批写作用域不允许改根组件 / 菜单 / 系统设置 / i18n，对话框需要在任意位置按需弹出；
 * - `openKnowledgeDialog()` 首次调用时动态 import `KnowledgeDialog.vue`（独立异步 chunk，
 *   不进首屏），用 `createApp` 挂到 body 下的独立容器；对话框内部走 BaseDialog 的
 *   Teleport + 模态焦点管理；关闭只切显隐，不反复重建（再次打开不重新 createApp）；
 * - 不新增 IPC / EventBus 事件：索引数据来自既有 `FILE.GET_WORKSPACE_INDEX`（经
 *   `useWorkspaceIndex`），打开命中文件复用既有 `openIndexedFile`（打开 + 跳行链路）。
 *
 * 能力开关：知识库查询为默认能力，不新增 feature flag；主进程不可用时对话框内部
 * 展示错误态，入口本身不抛错（返回 false 仅代表宿主挂载失败）。
 */
import { createApp, type App } from 'vue'
import { logger } from '../../../common/logger'
import {
    closeKnowledgeDialogState,
    isKnowledgeDialogMode,
    openKnowledgeDialogState,
    type KnowledgeDialogMode
} from './knowledge-dialog-state'

/** 独立挂载的 Vue 应用实例（null = 尚未挂载） */
let hostApp: App | null = null
/** 宿主容器（body 下的独立 div） */
let hostContainer: HTMLElement | null = null

/** 挂载知识库查询对话框宿主（首次调用时创建；失败返回 false 并记日志） */
async function ensureKnowledgeHost(): Promise<boolean> {
    if (hostApp !== null) {
        return true
    }
    if (typeof document === 'undefined') {
        return false
    }
    try {
        // 动态 import：知识库对话框（含 BaseDialog 等依赖）独立分块，菜单点击时才加载
        const { default: KnowledgeDialog } = await import('./KnowledgeDialog.vue')
        const container = document.createElement('div')
        container.id = 'baize-knowledge-host'
        document.body.appendChild(container)
        const app = createApp(KnowledgeDialog)
        app.mount(container)
        hostApp = app
        hostContainer = container
        return true
    } catch (error) {
        logger.error('[知识库查询] 挂载知识库查询对话框宿主失败', error)
        disposeKnowledgeHost()
        return false
    }
}

/**
 * 打开知识库查询对话框（主控菜单 / 命令面板唯一入口）。
 *
 * @param mode 查询视图：tags=标签浏览 / links=缺失与歧义链接 / backlinks=反向链接；
 *             非法值归一化为 tags（不让调用方传错导致对话框空白）
 * @returns true = 已打开；false = 宿主挂载失败（日志已记录，不弹错误框）
 */
export async function openKnowledgeDialog(mode: KnowledgeDialogMode): Promise<boolean> {
    try {
        if (!(await ensureKnowledgeHost())) {
            return false
        }
        openKnowledgeDialogState(isKnowledgeDialogMode(mode) ? mode : 'tags')
        return true
    } catch (error) {
        logger.error('[知识库查询] 打开知识库查询对话框失败', error)
        return false
    }
}

/** 关闭知识库查询对话框（主控如需「再次点击菜单关闭」可调用） */
export function closeKnowledgeDialog(): void {
    closeKnowledgeDialogState()
}

/**
 * 卸载知识库查询对话框宿主（应用卸载 / 测试清理用）。幂等，可再次 open 重新挂载；
 * 关闭对话框本身只切显隐，不调用本函数。
 */
export function disposeKnowledgeHost(): void {
    if (hostApp !== null) {
        try {
            hostApp.unmount()
        } catch (error) {
            logger.warn('[知识库查询] 卸载知识库查询对话框宿主失败', error)
        }
        hostApp = null
    }
    if (hostContainer !== null) {
        hostContainer.remove()
        hostContainer = null
    }
    closeKnowledgeDialogState()
}

// 便于主控 / 测试直接从本入口取对话框状态与纯查询辅助
export {
    KNOWLEDGE_DIALOG_MODES,
    buildKnowledgeLinkIssues,
    closeKnowledgeDialogState,
    isKnowledgeDialogMode,
    knowledgeDialogState,
    openKnowledgeDialogState,
    setKnowledgeDialogMode,
    type KnowledgeDialogMode,
    type KnowledgeDialogState
} from './knowledge-dialog-state'
