/**
 * A5 Front matter 属性对话框对外入口（供主控挂菜单 / 命令面板，**不要改菜单树本身**）
 *
 * 集成方式（主控只需一步）：
 * ```ts
 * import { openFrontMatterDialog } from '@renderer/components/Markdown/front-matter'
 * // 菜单动作 / 命令面板 / 快捷键回调里：
 * void openFrontMatterDialog()
 * ```
 *
 * 为什么自带宿主挂载（与 A3 文档历史、A4 Markdown lint、P0-8 写作风格检查同构）：
 * - 本批写作用域不允许改根组件 / 菜单 / i18n，对话框需要在任意位置按需弹出；
 * - `openFrontMatterDialog()` 首次调用时动态 import `FrontMatterDialog.vue`（独立异步
 *   chunk，不进首屏），用 `createApp` 挂到 body 下的独立容器；对话框内部走 BaseDialog 的
 *   Teleport + 模态焦点管理；关闭只切换显隐，不反复重建（再次打开不重新 createApp）；
 * - 不新增 IPC / EventBus 事件：打开时复用既有编辑器内容桥 `readActiveMarkdownContent()`，
 *   保存时复用既有 EventBus `MONACO_REPLACE_TEXT`（`MarkdownEditComponent` 已有全文替换
 *   接收器）写回编辑器。
 *
 * 与 A3/A4 的差异：Front matter 属性属于基础编辑能力，不带能力开关（默认可用），
 * 因此本入口不读写 feature flags、不注册 flag 监听。
 */
import { createApp, type App } from 'vue'
import { logger } from '../../../common/logger'
import {
    closeFrontMatterDialogState,
    openFrontMatterDialogState
} from './front-matter-dialog-state'

/** 宿主容器 id（body 下的独立 div，测试按此查询） */
const HOST_CONTAINER_ID = 'baize-front-matter-host'

/** 独立挂载的 Vue 应用实例（null = 尚未挂载） */
let hostApp: App | null = null
/** 宿主容器（body 下的独立 div） */
let hostContainer: HTMLElement | null = null

/** 挂载属性对话框宿主（首次调用时创建；失败返回 false 并记日志） */
async function ensureFrontMatterHost(): Promise<boolean> {
    if (hostApp !== null) {
        return true
    }
    if (typeof document === 'undefined') {
        return false
    }
    try {
        // 动态 import：属性对话框（含 BaseDialog 等依赖）独立分块，菜单点击时才加载
        const { default: FrontMatterDialog } = await import('./FrontMatterDialog.vue')
        const container = document.createElement('div')
        container.id = HOST_CONTAINER_ID
        document.body.appendChild(container)
        const app = createApp(FrontMatterDialog)
        app.mount(container)
        hostApp = app
        hostContainer = container
        return true
    } catch (error) {
        logger.error('[Front matter 属性] 挂载属性对话框宿主失败', error)
        disposeFrontMatterHost()
        return false
    }
}

/**
 * 打开 Front matter 属性对话框（主控菜单 / 命令面板唯一入口）。
 *
 * @returns true = 已打开；false = 宿主挂载失败（日志已记录，不弹错误框）
 */
export async function openFrontMatterDialog(): Promise<boolean> {
    try {
        if (!(await ensureFrontMatterHost())) {
            return false
        }
        openFrontMatterDialogState()
        return true
    } catch (error) {
        logger.error('[Front matter 属性] 打开属性对话框失败', error)
        return false
    }
}

/** 关闭 Front matter 属性对话框（主控如需「再次点击菜单关闭」可调用） */
export function closeFrontMatterDialog(): void {
    closeFrontMatterDialogState()
}

/**
 * 卸载属性对话框宿主（应用卸载 / 测试清理用）。幂等，可再次 open 重新挂载；
 * 关闭对话框本身只切显隐，不调用本函数。
 */
export function disposeFrontMatterHost(): void {
    if (hostApp !== null) {
        try {
            hostApp.unmount()
        } catch (error) {
            logger.warn('[Front matter 属性] 卸载属性对话框宿主失败', error)
        }
        hostApp = null
    }
    if (hostContainer !== null) {
        hostContainer.remove()
        hostContainer = null
    }
    closeFrontMatterDialogState()
}

// 便于主控 / 测试直接从本入口取对话框状态
export {
    closeFrontMatterDialogState,
    frontMatterDialogState,
    openFrontMatterDialogState
} from './front-matter-dialog-state'
