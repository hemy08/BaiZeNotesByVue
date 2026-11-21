/**
 * A4 Markdown lint 对外入口（供主控挂菜单/命令面板，**不要改菜单树本身**）
 *
 * 集成方式（主控只需一步）：
 * ```ts
 * import { openMarkdownLint } from '@renderer/components/Markdown/lint'
 * // 菜单动作/命令面板回调里：
 * void openMarkdownLint()
 * ```
 *
 * 与文档历史入口同构：`openMarkdownLint()` 首次调用时动态 import `MarkdownLintDialog.vue`
 * （独立异步 chunk，不进首屏），在 body 下用独立 Vue 应用实例挂载（BaseDialog 自带
 * Teleport + 模态焦点管理），关闭只切换显隐。
 * 功能开关（flags.markdownLint）关闭时：直接返回 false（不挂载、不读取编辑器内容）；
 * 使用中关闭开关时宿主自动卸载（不渲染）。
 */
import { createApp, watch, type App } from 'vue'
import { logger } from '../../../common/logger'
import { initFeatureFlags, useFeatureFlags } from '../../../composables/useFeatureFlags'
import { closeMarkdownLintDialog, openMarkdownLintDialog } from './lint-dialog-state'

/** 独立挂载的 Vue 应用实例（null = 尚未挂载） */
let hostApp: App | null = null
/** 宿主容器（body 下的独立 div） */
let hostContainer: HTMLElement | null = null
/** flag 监听停止句柄（开关关闭时自动卸载宿主） */
let stopFlagsWatch: (() => void) | null = null

/** 挂载 lint 对话框宿主（首次调用时创建；失败返回 false 并记日志） */
async function ensureLintHost(): Promise<boolean> {
    if (hostApp !== null) {
        return true
    }
    if (typeof document === 'undefined') {
        return false
    }
    try {
        // 动态 import：lint 对话框（含 BaseDialog 等依赖）独立分块，菜单点击时才加载
        const { default: MarkdownLintDialog } = await import('./MarkdownLintDialog.vue')
        const container = document.createElement('div')
        container.id = 'baize-markdown-lint-host'
        document.body.appendChild(container)
        const app = createApp(MarkdownLintDialog)
        app.mount(container)
        hostApp = app
        hostContainer = container
        const { flags } = useFeatureFlags()
        stopFlagsWatch = watch(
            () => flags.markdownLint,
            (enabled) => {
                if (!enabled) {
                    disposeMarkdownLintHost()
                }
            }
        )
        return true
    } catch (error) {
        logger.error('[Markdown 检查] 挂载检查对话框宿主失败', error)
        disposeMarkdownLintHost()
        return false
    }
}

/**
 * 打开 Markdown lint 对话框（主控菜单/命令面板唯一入口）。
 *
 * @returns true = 已打开；false = 功能开关未开启 / 挂载失败（日志已记录，不弹错误框）
 */
export async function openMarkdownLint(): Promise<boolean> {
    try {
        await initFeatureFlags()
        const { flags } = useFeatureFlags()
        if (!flags.markdownLint) {
            logger.warn(
                '[Markdown 检查] 能力开关未开启，忽略打开请求（系统设置 → 功能 → Markdown 检查）'
            )
            return false
        }
        if (!(await ensureLintHost())) {
            return false
        }
        openMarkdownLintDialog()
        return true
    } catch (error) {
        logger.error('[Markdown 检查] 打开检查对话框失败', error)
        return false
    }
}

/** 关闭 Markdown lint 对话框（主控如需「再次点击菜单关闭」可调用） */
export function closeMarkdownLint(): void {
    closeMarkdownLintDialog()
}

/** 卸载 lint 对话框宿主（开关关闭/应用卸载/测试清理用）。幂等，可再次 open 重新挂载。 */
export function disposeMarkdownLintHost(): void {
    if (stopFlagsWatch !== null) {
        stopFlagsWatch()
        stopFlagsWatch = null
    }
    if (hostApp !== null) {
        try {
            hostApp.unmount()
        } catch (error) {
            logger.warn('[Markdown 检查] 卸载检查对话框宿主失败', error)
        }
        hostApp = null
    }
    if (hostContainer !== null) {
        hostContainer.remove()
        hostContainer = null
    }
    closeMarkdownLintDialog()
}

// 便于主控/其它模块直接从本入口取对话框状态
export { markdownLintDialogState } from './lint-dialog-state'
