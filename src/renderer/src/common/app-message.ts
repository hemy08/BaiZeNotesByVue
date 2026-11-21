/**
 * 渲染层应用内消息 helper（浏览器原生 alert 应用内化批次）
 *
 * 背景：插件工具与剪贴板等路径此前直接调用浏览器原生 alert()——阻塞渲染、
 * 样式不可控、与 BaseDialog 风格的应用内反馈体系不一致。
 *
 * 职责边界：
 * - 统一复用 useConfigStore 的全局消息对话框（MessageDialog，BaseDialog 外壳，
 *   支持 success/error/warning/info/failed 五种类型与图标/渐变标题栏）；
 * - **纯模块可安全调用**（如 common/clipboard.ts）：只经 getConfigStore() 操作
 *   模块级全局状态，不依赖 Vue 组件实例 / inject / 生命周期上下文；
 * - 文案由调用方经 t() 组装后传入（i18n 边界与 action-feedback.ts 一致）；标题
 *   缺省时按消息类型回退 common.* 既有词条，调用时 t() 取当前语言，不缓存翻译结果。
 *
 * 防刷屏：同一操作高频失败时可传 throttleKey + throttleMs（默认 5s），窗口期内
 * 重复消息只展示首次（错误日志仍由调用方自行记录，排查线索不丢；依据 LOG-08）。
 */
import { t } from './i18n'
import { getConfigStore } from './useConfigStore'

/** 应用内消息类型（与 MessageDialog / DialogState.messageDialog.type 对齐） */
export type AppMessageType = 'success' | 'error' | 'warning' | 'info' | 'failed'

/** 应用内消息可选配置 */
export interface AppMessageOptions {
    /** 可选标题；缺省时按类型取 common.success/error/warning/info/failed */
    title?: string
    /** 节流键：同一键在窗口期内重复提示只展示一次（防高频失败刷屏；缺省不节流） */
    throttleKey?: string
    /** 节流窗口（毫秒，默认 5000）；仅在提供 throttleKey 时生效 */
    throttleMs?: number
}

/** 高频失败提示默认节流窗口（5 秒） */
const DEFAULT_THROTTLE_MS = 5000

/** 节流键（类型 + 键）→ 上次真正展示提示的时间戳（模块级内存状态，不持久化） */
const throttleTimestamps = new Map<string, number>()

/**
 * 判定某条消息是否处于节流窗口内（是则本次跳过弹框）。
 *
 * 使用 Date.now() 而非定时器：无需清理定时器，窗口按「上次真正提示」滑动，
 * 持续失败时最多每 throttleMs 提示一次。
 */
function isThrottled(type: AppMessageType, key: string, windowMs: number): boolean {
    const composite = `${type}:${key}`
    const lastShownAt = throttleTimestamps.get(composite)
    const now = Date.now()
    if (lastShownAt !== undefined && now - lastShownAt < windowMs) {
        return true
    }
    throttleTimestamps.set(composite, now)
    return false
}

/** 仅供单测：清空节流记录（生产代码不得调用） */
export function resetAppMessageThrottleForTesting(): void {
    throttleTimestamps.clear()
}

/**
 * 缺省标题：按消息类型回退到 common.* 既有词条。
 * 使用字面量 t('...') 调用（满足 I18N-07 静态引用门禁），且不缓存翻译结果。
 */
function defaultTitle(type: AppMessageType): string {
    switch (type) {
        case 'success':
            return t('common.success')
        case 'error':
            return t('common.error')
        case 'warning':
            return t('common.warning')
        case 'info':
            return t('common.info')
        case 'failed':
            return t('common.failed')
    }
    // 联合类型已穷尽（此处 type 收窄为 never）；保留兜底返回值满足 noImplicitReturns
    return type
}

/**
 * 展示一条应用内消息（复用全局消息对话框，替代浏览器原生 alert）。
 *
 * @param type 消息类型（success/error/warning/info/failed）
 * @param message 已本地化的消息正文
 * @param options 可选标题与节流配置
 */
export function showAppMessage(
    type: AppMessageType,
    message: string,
    options: AppMessageOptions = {}
): void {
    if (options.throttleKey !== undefined) {
        const windowMs = options.throttleMs ?? DEFAULT_THROTTLE_MS
        if (isThrottled(type, options.throttleKey, windowMs)) {
            return
        }
    }
    const title = options.title && options.title.length > 0 ? options.title : defaultTitle(type)
    getConfigStore().showDialog(type, { title, message })
}

/** 错误/失败反馈（如 IPC 调用失败、文件读取失败） */
export function showAppError(message: string, options: AppMessageOptions = {}): void {
    showAppMessage('error', message, options)
}

/** 校验/前置条件不满足的警告反馈（如空输入、非法 IP） */
export function showAppWarning(message: string, options: AppMessageOptions = {}): void {
    showAppMessage('warning', message, options)
}

/** 成功反馈（如操作完成的确认提示） */
export function showAppSuccess(message: string, options: AppMessageOptions = {}): void {
    showAppMessage('success', message, options)
}

/** 中性提示（如操作说明、不可用提示） */
export function showAppInfo(message: string, options: AppMessageOptions = {}): void {
    showAppMessage('info', message, options)
}

/** 失败反馈（保留 MessageDialog 的 failed 语义，供后续区分「错误」与「失败」） */
export function showAppFailed(message: string, options: AppMessageOptions = {}): void {
    showAppMessage('failed', message, options)
}
