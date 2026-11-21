/**
 * P0-8 写作风格 / 语法检查对外入口（供主控挂菜单 / 命令面板，**不要改菜单树本身**）
 *
 * 集成方式（主控只需一步）：
 * ```ts
 * import { openWritingStyleCheck } from '@renderer/components/Markdown/writing-style'
 * // 菜单动作 / 命令面板 / 快捷键回调里：
 * void openWritingStyleCheck()
 * ```
 *
 * 为什么自带宿主挂载（与 A3 文档历史、A4 Markdown lint 同构）：
 * - 本批写作用域不允许改根组件 / 菜单 / 系统设置 / i18n，对话框需要在任意位置按需弹出；
 * - `openWritingStyleCheck()` 首次调用时动态 import `WritingStyleDialog.vue`（独立异步
 *   chunk，不进首屏），用 `createApp` 挂到 body 下的独立容器；对话框内部走 BaseDialog 的
 *   Teleport + 模态焦点管理；关闭只切换显隐，不反复重建（再次打开不重新 createApp）；
 * - 不新增 IPC / EventBus 事件：内容读取与跳行复用既有编辑器内容桥
 *   （`readActiveMarkdownContent` / `jumpActiveEditorToLine`），跳行仍走既有
 *   EventBus `EDITOR_JUMP_LINE`。
 *
 * 能力开关：写作体验能力为 opt-in（默认关闭），真源
 * `shared/constants/feature-flags.ts#WRITING_EXPERIENCE_FLAGS`（`writingStyleCheck`，
 * 系统设置 → 编写体验 → 写作风格检查）。开关关闭时 `openWritingStyleCheck()` 直接返回
 * false（不挂载、不读取编辑器内容）；使用中关闭开关时宿主自动卸载（不渲染）。
 * 本入口不写配置、不注册 IPC 监听。
 */
import { createApp, watch, type App } from 'vue'
import { logger } from '../../../common/logger'
import { initFeatureFlags, useFeatureFlags } from '../../../composables/useFeatureFlags'
import { closeWritingStyleDialog, openWritingStyleCheckDialog } from './writing-style-dialog-state'

/** 独立挂载的 Vue 应用实例（null = 尚未挂载） */
let hostApp: App | null = null
/** 宿主容器（body 下的独立 div） */
let hostContainer: HTMLElement | null = null
/** flag 监听停止句柄（开关关闭时自动卸载宿主） */
let stopFlagsWatch: (() => void) | null = null

/** 挂载检查对话框宿主（首次调用时创建；失败返回 false 并记日志） */
async function ensureWritingStyleHost(): Promise<boolean> {
    if (hostApp !== null) {
        return true
    }
    if (typeof document === 'undefined') {
        return false
    }
    try {
        // 动态 import：检查对话框（含 BaseDialog 等依赖）独立分块，菜单点击时才加载
        const { default: WritingStyleDialog } = await import('./WritingStyleDialog.vue')
        const container = document.createElement('div')
        container.id = 'baize-writing-style-host'
        document.body.appendChild(container)
        const app = createApp(WritingStyleDialog)
        app.mount(container)
        hostApp = app
        hostContainer = container
        const { flags } = useFeatureFlags()
        stopFlagsWatch = watch(
            () => flags.writingStyleCheck,
            (enabled) => {
                if (!enabled) {
                    disposeWritingStyleHost()
                }
            }
        )
        return true
    } catch (error) {
        logger.error('[写作风格检查] 挂载检查对话框宿主失败', error)
        disposeWritingStyleHost()
        return false
    }
}

/**
 * 打开写作风格检查对话框（主控菜单 / 命令面板唯一入口）。
 *
 * @returns true = 已打开；false = 能力开关未开启 / 宿主挂载失败（日志已记录，不弹错误框）
 */
export async function openWritingStyleCheck(): Promise<boolean> {
    try {
        await initFeatureFlags()
        const { flags } = useFeatureFlags()
        if (!flags.writingStyleCheck) {
            logger.warn(
                '[写作风格检查] 能力开关未开启，忽略打开请求（系统设置 → 编写体验 → 写作风格检查）'
            )
            return false
        }
        if (!(await ensureWritingStyleHost())) {
            return false
        }
        openWritingStyleCheckDialog()
        return true
    } catch (error) {
        logger.error('[写作风格检查] 打开检查对话框失败', error)
        return false
    }
}

/** 关闭写作风格检查对话框（主控如需「再次点击菜单关闭」可调用） */
export function closeWritingStyleCheck(): void {
    closeWritingStyleDialog()
}

/**
 * 卸载检查对话框宿主（应用卸载 / 测试清理用）。幂等，可再次 open 重新挂载；
 * 关闭对话框本身只切显隐，不调用本函数。
 */
export function disposeWritingStyleHost(): void {
    if (stopFlagsWatch !== null) {
        stopFlagsWatch()
        stopFlagsWatch = null
    }
    if (hostApp !== null) {
        try {
            hostApp.unmount()
        } catch (error) {
            logger.warn('[写作风格检查] 卸载检查对话框宿主失败', error)
        }
        hostApp = null
    }
    if (hostContainer !== null) {
        hostContainer.remove()
        hostContainer = null
    }
    closeWritingStyleDialog()
}

// 便于主控 / 测试直接从本入口取对话框状态与纯规则能力
export {
    closeWritingStyleDialog,
    openWritingStyleCheckDialog,
    writingStyleDialogState
} from './writing-style-dialog-state'
export {
    DEFAULT_CATCHPHRASES,
    DEFAULT_FILLER_WORDS,
    DEFAULT_WRITING_STYLE_THRESHOLDS,
    WRITING_STYLE_ISSUE_MESSAGE_KEYS,
    WRITING_STYLE_MAX_INPUT_CHARS,
    WRITING_STYLE_MAX_ISSUES_PER_RULE,
    WRITING_STYLE_RULES,
    checkWritingStyle,
    maskWritingStyleContent,
    resolveWritingStyleOptions,
    summarizeWritingStyleIssues,
    type ResolvedWritingStyleOptions,
    type WritingStyleCheckOptions,
    type WritingStyleIssue,
    type WritingStyleMaskResult,
    type WritingStyleRuleDefinition,
    type WritingStyleRuleId,
    type WritingStyleRuleStat,
    type WritingStyleSeverity,
    type WritingStyleSummary,
    type WritingStyleThresholds
} from './writing-style-check'
