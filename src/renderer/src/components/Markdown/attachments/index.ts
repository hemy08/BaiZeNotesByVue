/**
 * B5 附件管理对外入口（供主控挂菜单 / 命令面板，**不要改菜单树本身**）
 *
 * 集成方式（主控只需一步）：
 * ```ts
 * import { openAttachmentDialog } from '@renderer/components/Markdown/attachments'
 * // 菜单动作 / 命令面板 / 快捷键回调里：
 * void openAttachmentDialog()
 * ```
 *
 * 为什么自带宿主挂载（与 A3 文档历史、A4 Markdown lint、P0-8 写作风格检查、
 * B1-B4 知识库查询同构）：
 * - 本批写作用域不允许改根组件 / 菜单 / 系统设置 / i18n，对话框需要在任意位置按需弹出；
 * - `openAttachmentDialog()` 首次调用时动态 import `AttachmentDialog.vue`（独立异步
 *   chunk，不进首屏），用 `createApp` 挂到 body 下的独立容器；对话框内部走 BaseDialog
 *   的 Teleport + 模态焦点管理；关闭只切换显隐，不反复重建（再次打开不重新 createApp）；
 * - 不新增 IPC / EventBus 事件：附件清单来自既有 `FILE.GET_WORKSPACE_INDEX`（经
 *   `useWorkspaceIndex`）；「在资源管理器中显示」复用既有
 *   `IPC.FILE_MANAGER.OPEN_IN_EXPLORER` send 通道（主进程负责 Path Guard 校验）。
 *
 * 能力开关：附件管理为默认能力，不新增 feature flag；主进程不可用/旧索引版本时
 * 对话框内部展示对应空态，入口本身不抛错（返回 false 仅代表宿主挂载失败）。
 */
import { createApp, type App } from 'vue'
import { logger } from '../../../common/logger'
import { closeAttachmentDialogState, openAttachmentDialogState } from './attachment-dialog-state'

/** 独立挂载的 Vue 应用实例（null = 尚未挂载） */
let hostApp: App | null = null
/** 宿主容器（body 下的独立 div） */
let hostContainer: HTMLElement | null = null

/** 挂载附件管理对话框宿主（首次调用时创建；失败返回 false 并记日志） */
async function ensureAttachmentHost(): Promise<boolean> {
    if (hostApp !== null) {
        return true
    }
    if (typeof document === 'undefined') {
        return false
    }
    try {
        // 动态 import：附件管理对话框（含 BaseDialog 等依赖）独立分块，菜单点击时才加载
        const { default: AttachmentDialog } = await import('./AttachmentDialog.vue')
        const container = document.createElement('div')
        container.id = 'baize-attachment-host'
        document.body.appendChild(container)
        const app = createApp(AttachmentDialog)
        app.mount(container)
        hostApp = app
        hostContainer = container
        return true
    } catch (error) {
        logger.error('[附件管理] 挂载附件管理对话框宿主失败', error)
        disposeAttachmentHost()
        return false
    }
}

/**
 * 打开附件管理对话框（主控菜单 / 命令面板唯一入口）。
 *
 * @returns true = 已打开；false = 宿主挂载失败（日志已记录，不弹错误框）
 */
export async function openAttachmentDialog(): Promise<boolean> {
    try {
        if (!(await ensureAttachmentHost())) {
            return false
        }
        openAttachmentDialogState()
        return true
    } catch (error) {
        logger.error('[附件管理] 打开附件管理对话框失败', error)
        return false
    }
}

/** 关闭附件管理对话框（主控如需「再次点击菜单关闭」可调用） */
export function closeAttachmentDialog(): void {
    closeAttachmentDialogState()
}

/**
 * 卸载附件管理对话框宿主（应用卸载 / 测试清理用）。幂等，可再次 open 重新挂载；
 * 关闭对话框本身只切显隐，不调用本函数。
 */
export function disposeAttachmentHost(): void {
    if (hostApp !== null) {
        try {
            hostApp.unmount()
        } catch (error) {
            logger.warn('[附件管理] 卸载附件管理对话框宿主失败', error)
        }
        hostApp = null
    }
    if (hostContainer !== null) {
        hostContainer.remove()
        hostContainer = null
    }
    closeAttachmentDialogState()
}

// 便于主控 / 测试直接从本入口取对话框状态与纯查询辅助
export {
    attachmentDialogState,
    buildAttachmentGroups,
    closeAttachmentDialogState,
    countAttachmentReferences,
    normalizeAttachmentPathKey,
    openAttachmentDialogState,
    resolveAttachmentReferences,
    supportsAttachmentIndex,
    type AttachmentDialogState,
    type AttachmentGroup,
    type AttachmentReferenceView
} from './attachment-dialog-state'
