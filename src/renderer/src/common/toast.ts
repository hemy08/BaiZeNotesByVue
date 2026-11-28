/**
 * 轻量 Toast 提示（1.5.7 体验优化：减少模态弹窗）。
 *
 * ## 背景
 * 应用内反馈此前只有全局**模态**消息对话框（`common/app-message.ts` → MessageDialog）：
 * 「模式已切换 / 操作已完成」这类无需用户决策的确认也要弹模态框，用户必须点「确定」才能
 * 继续操作，打断操作流。Toast 是非模态、自动消失的轻量反馈，用于这类「已完成」提示；
 * 需要用户决策（如首次迁移方式）或必须可见的失败仍走对话框（LOG-08 失败不静默）。
 *
 * ## 职责边界
 * - 本模块只维护「当前展示的提示队列 + 自动消失定时器」，**不渲染任何 DOM**；
 * - 渲染由 `components/common/ToastHost.vue` 消费 `toastState` 完成（Teleport 到 body，
 *   固定在右下角、避开状态栏与窗口缩放热区；z-index 取 `--ui-z-toast` 低于模态对话框，
 *   不抢焦点）；
 * - 文案由调用方经 `t()` 组装后传入（与 app-message / action-feedback 保持同一 i18n 边界）；
 * - 纯模块可安全调用（不依赖组件实例 / inject / 生命周期上下文）。
 *
 * ## 行为约定
 * - 同屏最多 `MAX_TOAST_COUNT` 条，超出时移除最旧一条（「新条覆盖最旧」）；
 * - 默认 `DEFAULT_TOAST_DURATION` 毫秒后自动消失；`duration <= 0` 表示常驻（仅手动关闭），
 *   供需要细读的提示使用；
 * - 显式传入 `id` 且该 id 正在展示时「原地更新」并重置计时——同一动作重复触发不会叠加
 *   多条相同提示（如模式切换成功提示）；
 * - 自动消失定时器与提示条目一一对应：关闭 / 同 id 覆盖 / 全部复位时同步 `clearTimeout`，
 *   主界面或宿主卸载时调用 `dismissAllToasts()` 回收，避免定时器泄漏（memory:check 的
 *   计时器句柄配对约束）。
 */
import { reactive } from 'vue'

/** Toast 类型（决定图标与强调色；与全局消息类型语义对齐） */
export type ToastType = 'success' | 'info' | 'warning' | 'error'

/** showToast 可选配置 */
export interface ToastOptions {
    /** 类型；缺省 `info` */
    type?: ToastType
    /** 可选标题（粗体首行）；缺省只渲染正文 */
    title?: string
    /** 自动消失时长（毫秒）；缺省 `DEFAULT_TOAST_DURATION`，`<= 0` 表示不自动消失 */
    duration?: number
    /** 可选稳定 id：同 id 再次展示时原地更新并重置计时（防重复提示堆叠） */
    id?: string
}

/** 一条 Toast（宿主只读消费） */
export interface ToastItem {
    /** 稳定 id（自动生成或调用方传入） */
    id: string
    /** 类型（图标/强调色真源） */
    type: ToastType
    /** 可选标题 */
    title?: string
    /** 正文（已本地化） */
    message: string
    /** 自动消失时长（毫秒；`<= 0` 常驻） */
    duration: number
}

/** Toast 响应式状态（模块单例；写入只经本模块导出的函数） */
export interface ToastState {
    /** 当前展示的提示（旧 → 新；宿主按此顺序渲染，最后一条最靠近屏幕底部） */
    toasts: ToastItem[]
}

/** 默认自动消失时长（毫秒）：足够读完一行提示，又不会长时间遮挡内容 */
export const DEFAULT_TOAST_DURATION = 2600

/** 同屏最多提示条数（超出时移除最旧一条） */
export const MAX_TOAST_COUNT = 3

/** 模块单例响应式状态（宿主 `ToastHost.vue` 只读消费） */
export const toastState = reactive<ToastState>({ toasts: [] })

/** 提示 id → 自动消失定时器（模块级；关闭 / 覆盖 / 复位时清理，避免泄漏） */
const toastTimers: Map<string, ReturnType<typeof setTimeout>> = new Map()

/** 自动 id 序号（仅用于生成 `toast-N`，测试复位时归零） */
let toastSequence = 0

/** 生成自动 id */
function nextToastId(): string {
    toastSequence += 1
    return `toast-${toastSequence}`
}

/** 清理某条提示的自动消失定时器（不存在时无操作） */
function clearToastTimer(id: string): void {
    const timer = toastTimers.get(id)
    if (timer === undefined) {
        return
    }
    clearTimeout(timer)
    toastTimers.delete(id)
}

/** 从队列移除指定提示（不处理定时器；调用方负责清理） */
function removeToast(id: string): boolean {
    const index = toastState.toasts.findIndex((toast) => toast.id === id)
    if (index < 0) {
        return false
    }
    toastState.toasts.splice(index, 1)
    return true
}

/** 归一化自动消失时长：非有限数字回退默认值；负数收敛为 0（常驻） */
function normalizeDuration(duration: number | undefined): number {
    if (typeof duration !== 'number' || !Number.isFinite(duration)) {
        return DEFAULT_TOAST_DURATION
    }
    return Math.max(0, Math.trunc(duration))
}

/** 安排自动消失（先清旧定时器；`duration <= 0` 常驻不建定时器） */
function scheduleDismiss(id: string, duration: number): void {
    clearToastTimer(id)
    if (duration <= 0) {
        return
    }
    const timer = setTimeout(() => {
        toastTimers.delete(id)
        removeToast(id)
    }, duration)
    toastTimers.set(id, timer)
}

/**
 * 展示一条轻量 Toast（非模态、自动消失）。
 *
 * @param message 已本地化的正文；空串 / 纯空白直接忽略（不产生空提示）
 * @param options 类型 / 标题 / 时长 / 稳定 id
 * @returns 本次展示的提示 id；消息为空时返回空串
 */
export function showToast(message: string, options: ToastOptions = {}): string {
    const text = typeof message === 'string' ? message.trim() : ''
    if (text.length === 0) {
        return ''
    }
    const type: ToastType = options.type ?? 'info'
    const title =
        typeof options.title === 'string' && options.title.trim().length > 0
            ? options.title.trim()
            : undefined
    const duration = normalizeDuration(options.duration)
    const requestedId =
        typeof options.id === 'string' && options.id.trim().length > 0 ? options.id.trim() : ''

    // 同 id 已在展示：原地更新类型/标题/正文/时长并重置自动消失计时，避免同一动作重复堆叠
    if (requestedId !== '') {
        const existing = toastState.toasts.find((toast) => toast.id === requestedId)
        if (existing) {
            existing.type = type
            existing.message = text
            existing.duration = duration
            if (title === undefined) {
                delete existing.title
            } else {
                existing.title = title
            }
            scheduleDismiss(existing.id, duration)
            return existing.id
        }
    }

    const id = requestedId !== '' ? requestedId : nextToastId()
    const item: ToastItem = {
        id,
        type,
        message: text,
        duration,
        ...(title !== undefined ? { title } : {})
    }
    toastState.toasts.push(item)
    // 超出上限时移除最旧一条（连同其自动消失定时器），保证同屏最多 MAX_TOAST_COUNT 条
    while (toastState.toasts.length > MAX_TOAST_COUNT) {
        const oldest = toastState.toasts.shift()
        if (oldest) {
            clearToastTimer(oldest.id)
        }
    }
    scheduleDismiss(id, duration)
    return id
}

/**
 * 关闭指定 Toast（宿主上点击提示 / 关闭按钮时调用）。
 *
 * @returns 是否关闭了一条正在展示的提示（id 不存在返回 false）
 */
export function dismissToast(id: string): boolean {
    clearToastTimer(id)
    return removeToast(id)
}

/** 关闭全部 Toast（主界面 / 宿主卸载时调用，保证自动消失定时器全部回收） */
export function dismissAllToasts(): void {
    for (const id of [...toastTimers.keys()]) {
        clearToastTimer(id)
    }
    toastTimers.clear()
    toastState.toasts.splice(0, toastState.toasts.length)
}

/** 仅供单元测试：清空状态、定时器与自增 id（生产代码不得调用） */
export function resetToastsForTesting(): void {
    dismissAllToasts()
    toastSequence = 0
}
