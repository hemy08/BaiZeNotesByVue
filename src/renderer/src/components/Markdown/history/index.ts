/**
 * A3 文档历史对外入口（供主控挂菜单/命令面板，**不要改菜单树本身**）
 *
 * 集成方式（主控只需一步）：
 * ```ts
 * import { openFileHistory } from '@renderer/components/Markdown/history'
 * // 菜单动作/命令面板回调里：
 * void openFileHistory()
 * ```
 *
 * 为什么自带宿主挂载：
 * - 本批写作用域不允许改根组件 / 菜单 / 系统设置，历史对话框需要在任意位置按需弹出；
 * - 因此 `openFileHistory()` 在首次调用时动态 import `FileHistoryDialog.vue`（独立异步 chunk，
 *   不影响首屏），用 `createApp` 挂到 body 下的独立容器，对话框内部走 BaseDialog 的
 *   Teleport + 模态焦点管理；关闭只切换显隐，不反复重建。
 * - 功能开关（flags.documentHistory）关闭时：`openFileHistory()` 直接返回 false（不挂载、
 *   不注册 IPC 监听、不读写 localStorage）；使用中关闭开关则宿主自动卸载（不渲染）。
 *
 * 可选：若希望「应用启动即开始记录保存快照」，主控可在主界面挂载后主动调用
 * `initDocumentHistoryFeature()`（幂等）；不调用则从首次 `openFileHistory()` 开始记录。
 */
import { createApp, watch, type App } from 'vue'
import { logger } from '../../../common/logger'
import { initFeatureFlags, useFeatureFlags } from '../../../composables/useFeatureFlags'
import {
    closeFileHistoryDialog,
    disposeDocumentHistoryFeature,
    ensureDocumentHistoryFeature,
    openFileHistoryDialog
} from '../../../composables/useDocumentHistory'

/** 独立挂载的 Vue 应用实例（null = 尚未挂载） */
let hostApp: App | null = null
/** 宿主容器（body 下的独立 div） */
let hostContainer: HTMLElement | null = null
/** flag 监听停止句柄（开关关闭时自动卸载宿主） */
let stopFlagsWatch: (() => void) | null = null

/** 挂载历史对话框宿主（首次调用时创建；失败返回 false 并记日志） */
async function ensureHistoryHost(): Promise<boolean> {
    if (hostApp !== null) {
        return true
    }
    if (typeof document === 'undefined') {
        return false
    }
    try {
        // 动态 import：历史对话框（含 diff/BaseDialog 等依赖）独立分块，菜单点击时才加载
        const { default: FileHistoryDialog } = await import('./FileHistoryDialog.vue')
        const container = document.createElement('div')
        container.id = 'baize-file-history-host'
        document.body.appendChild(container)
        const app = createApp(FileHistoryDialog)
        app.mount(container)
        hostApp = app
        hostContainer = container
        const { flags } = useFeatureFlags()
        stopFlagsWatch = watch(
            () => flags.documentHistory,
            (enabled) => {
                if (!enabled) {
                    disposeFileHistoryHost()
                }
            }
        )
        return true
    } catch (error) {
        logger.error('[文档历史] 挂载历史对话框宿主失败', error)
        disposeFileHistoryHost()
        return false
    }
}

/**
 * 打开文档历史对话框（主控菜单/命令面板唯一入口）。
 *
 * @returns true = 已打开；false = 功能开关未开启 / 挂载失败（调用方无需额外处理，
 *          日志已记录；不弹错误框，避免打断用户）
 */
export async function openFileHistory(): Promise<boolean> {
    try {
        await initFeatureFlags()
        const { flags } = useFeatureFlags()
        if (!flags.documentHistory) {
            logger.warn('[文档历史] 能力开关未开启，忽略打开请求（系统设置 → 功能 → 文档历史）')
            return false
        }
        await ensureDocumentHistoryFeature()
        if (!(await ensureHistoryHost())) {
            return false
        }
        return await openFileHistoryDialog()
    } catch (error) {
        logger.error('[文档历史] 打开历史对话框失败', error)
        return false
    }
}

/** 关闭文档历史对话框（主控如需「再次点击菜单关闭」可调用） */
export function closeFileHistory(): void {
    closeFileHistoryDialog()
}

/**
 * 卸载历史对话框宿主并释放能力状态（开关关闭/应用卸载/测试清理用）。
 * 幂等；卸载后可再次调用 `openFileHistory()` 重新挂载。
 */
export function disposeFileHistoryHost(): void {
    if (stopFlagsWatch !== null) {
        stopFlagsWatch()
        stopFlagsWatch = null
    }
    if (hostApp !== null) {
        try {
            hostApp.unmount()
        } catch (error) {
            logger.warn('[文档历史] 卸载历史对话框宿主失败', error)
        }
        hostApp = null
    }
    if (hostContainer !== null) {
        hostContainer.remove()
        hostContainer = null
    }
    closeFileHistoryDialog()
    disposeDocumentHistoryFeature()
}

// 便于主控/其它模块直接从本入口取状态与能力初始化函数
export {
    documentHistoryState,
    ensureDocumentHistoryFeature,
    initDocumentHistoryFeature,
    useDocumentHistory
} from '../../../composables/useDocumentHistory'
