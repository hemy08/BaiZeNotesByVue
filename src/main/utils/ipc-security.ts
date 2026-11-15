/**
 * P1/N-05：IPC 发送方授权校验（sender authorization）
 *
 * 背景：ipcMain 的 handler 默认信任任何渲染进程（含对话框窗口、被注入/导航到
 * 不可信页面的窗口）发来的消息。N-05 复查发现 86 个业务 IPC handler 中仅
 * OPEN_EXE 一处校验了 event.sender，文件读写删、配置写、菜单动作等高风险通道
 * 均无发送方校验。
 *
 * 本模块提供统一的发送方信任判定：
 * - 主窗口：event.sender 必须严格等于主窗口 webContents（由 setTrustedMainWindow
 *   同步，macOS activate 重建窗口后以最新窗口为准）；
 * - 对话框窗口：显式登记（registerTrustedDialogWindow）其 webContents 归属，
 *   仅供 dialog preload 白名单通道（新建/重命名等）使用，窗口 closed 后自动注销；
 * - assertTrustedSender 在拒绝时统一 console.warn，调用方据此直接 return
 *   （ipcMain.on）或返回错误对象（ipcMain.handle，见 withSenderCheck）。
 *
 * 设计约束：本模块不 import electron 运行时（仅 type import），
 * 因此单测无需 electron 运行时 mock，主进程各注册模块也可安全引用。
 *
 * 安全边界说明：sender 判定以 Electron 注入的 event.sender（WebContents 实例）
 * 为准，渲染层无法伪造；主要威胁模型是"主窗口渲染层被 XSS 注入后调用任意 IPC"
 * 与"对话框窗口加载了非预期页面"。
 */
import type { BrowserWindow, WebContents } from 'electron'

/** 受信发送方范围：main-window 仅主窗口；dialog 仅已登记的对话框窗口 */
export type TrustedSenderScope = 'main-window' | 'dialog'

/** on / handle 两类事件的最小兼容形状（便于单测传入轻量事件桩） */
export interface IpcSenderEvent {
    sender?: unknown
    senderFrame?: { url?: string } | null
}

/** handle 通道拒绝不受信任发送方时的统一返回对象 */
export interface UntrustedSenderResult {
    ok: false
    code: 'untrusted-sender'
    error: string
}

/** handle 通道拒绝结果（只读常量，避免每次拒绝都新建对象） */
export const UNTRUSTED_SENDER_RESULT: UntrustedSenderResult = Object.freeze({
    ok: false as const,
    code: 'untrusted-sender' as const,
    error: 'IPC sender is not trusted'
})

/** 窗口最小兼容形状（真实 BrowserWindow 或测试桩） */
interface WindowLike {
    webContents?: unknown
    isDestroyed?: () => boolean
    // once/on 用 unknown 承载：Electron 的 BrowserWindow.once 是重载签名，
    // 直接声明通用签名会导致真实 BrowserWindow 无法赋值（TS 重载不兼容）
    once?: unknown
    on?: unknown
}

/** 窗口事件订阅的最小签名（调用前运行时判型） */
interface WindowEventSource {
    once?: (event: string, listener: () => void) => unknown
    on?: (event: string, listener: () => void) => unknown
}

// ============================ 受信窗口登记表 ============================

/** 主窗口引用（由 setTrustedMainWindow 同步；各注册模块在注册时同步一次） */
let trustedMainWindow: BrowserWindow | null = null

/** 已登记的对话框窗口 webContents（对象引用为主，id 兜底兼容测试桩/跨封装） */
const trustedDialogWebContents = new Set<unknown>()
const trustedDialogWebContentsIds = new Set<number>()

function isWindowDestroyed(window: WindowLike | null | undefined): boolean {
    if (!window) {
        return true
    }
    try {
        return typeof window.isDestroyed === 'function' ? window.isDestroyed() : false
    } catch {
        // isDestroyed 自身抛错（窗口已释放等）按已销毁处理
        return true
    }
}

function getWebContentsId(contents: unknown): number | null {
    if (!contents || typeof contents !== 'object') {
        return null
    }
    const id = (contents as { id?: unknown }).id
    return typeof id === 'number' ? id : null
}

/** 判断两个 webContents 是否同一对象（对象引用优先，数字 id 兜底） */
function isSameWebContents(left: unknown, right: unknown): boolean {
    if (!left || !right) {
        return false
    }
    if (left === right) {
        return true
    }
    const leftId = getWebContentsId(left)
    const rightId = getWebContentsId(right)
    return leftId !== null && rightId !== null && leftId === rightId
}

function extractSender(event: unknown): unknown {
    if (!event || typeof event !== 'object') {
        return undefined
    }
    return (event as IpcSenderEvent).sender
}

/**
 * 登记/更新受信主窗口（进程内唯一）。
 * 调用点：src/main/ipc/handlers.ts 的 setMainWindow / registerIpcHandlers，
 * 以及 src/main/index.ts 创建窗口时（覆盖 macOS activate 重建窗口场景）。
 */
export function setTrustedMainWindow(window: BrowserWindow | null): void {
    trustedMainWindow = window
}

/** 读取当前登记的主窗口（诊断/测试用） */
export function getTrustedMainWindow(): BrowserWindow | null {
    return trustedMainWindow
}

/**
 * 登记对话框窗口为受信发送方（仅 dialog 范围），窗口 closed 后自动注销。
 * 用于 HTML 对话框窗口经 dialog preload 白名单发送的通道（新建/重命名）。
 */
export function registerTrustedDialogWindow(window: WindowLike | null | undefined): void {
    // 注册时一次性捕获 webContents 引用与 id：Electron 的 'closed' 事件触发时窗口已销毁，
    // 此时再访问 window.webContents 会抛 "TypeError: Object has been destroyed"，
    // 导致主进程未捕获异常弹窗（新建/重命名对话框关闭时复现）。
    let contents: unknown
    try {
        contents = window?.webContents
    } catch (error) {
        // 传入对象本身已销毁（防御性处理，正常注册路径不会走到）
        console.warn('[Security] 登记对话框窗口时读取 webContents 失败:', error)
        return
    }
    if (!contents) {
        return
    }
    trustedDialogWebContents.add(contents)
    const contentsId = getWebContentsId(contents)
    if (contentsId !== null) {
        trustedDialogWebContentsIds.add(contentsId)
    }

    // 清理函数只使用上面捕获的引用/id，绝不再访问 window 属性
    const unregister = (): void => {
        trustedDialogWebContents.delete(contents)
        if (contentsId !== null) {
            trustedDialogWebContentsIds.delete(contentsId)
        }
    }
    const eventSource = window as WindowEventSource | null | undefined
    try {
        if (typeof eventSource?.once === 'function') {
            eventSource.once('closed', unregister)
        } else if (typeof eventSource?.on === 'function') {
            eventSource.on('closed', unregister)
        }
    } catch (error) {
        console.warn('[Security] 登记对话框窗口 closed 清理失败:', error)
    }
}

/** 注销对话框窗口受信发送方（窗口 closed 时自动调用，也可显式调用） */
export function unregisterTrustedDialogWindow(window: WindowLike | null | undefined): void {
    if (!window) {
        return
    }
    let contents: unknown
    try {
        contents = window.webContents
    } catch {
        // 窗口已销毁：无法再读取 webContents，且 closed 监听器（注册时捕获引用）
        // 已负责清理登记表，这里直接返回即可，不能抛出到窗口事件循环。
        return
    }
    if (!contents) {
        return
    }
    trustedDialogWebContents.delete(contents)
    const contentsId = getWebContentsId(contents)
    if (contentsId !== null) {
        trustedDialogWebContentsIds.delete(contentsId)
    }
}

/**
 * 重置全部受信窗口登记（仅测试隔离使用）。
 * 生产代码不应调用：主窗口引用由窗口生命周期管理。
 */
export function resetTrustedSenderRegistry(): void {
    trustedMainWindow = null
    trustedDialogWebContents.clear()
    trustedDialogWebContentsIds.clear()
}

// ============================ 发送方信任判定 ============================

/**
 * 是否为主窗口发出的可信 IPC。
 * @param event IPC 事件（IpcMainEvent / IpcMainInvokeEvent / 测试桩）
 * @param mainWindow 显式主窗口；缺省使用 setTrustedMainWindow 登记的最新主窗口
 */
export function isTrustedSender(
    event: unknown,
    mainWindow: BrowserWindow | null = trustedMainWindow
): boolean {
    const sender = extractSender(event)
    const window = mainWindow as WindowLike | null
    if (!sender || isWindowDestroyed(window)) {
        return false
    }
    // 与对话框注销同因：窗口销毁瞬间访问 webContents 可能抛 "Object has been destroyed"，
    // 这里按"非受信发送方"处理，绝不让异常冒泡到 IPC 事件循环。
    let mainContents: unknown
    try {
        mainContents = window?.webContents
    } catch {
        return false
    }
    if (!mainContents) {
        return false
    }
    return isSameWebContents(sender, mainContents)
}

/** 是否为已登记的对话框窗口发出的可信 IPC（dialog preload 白名单通道） */
export function isTrustedDialogSender(event: unknown): boolean {
    const sender = extractSender(event)
    if (!sender) {
        return false
    }
    if (trustedDialogWebContents.has(sender)) {
        return true
    }
    const senderId = getWebContentsId(sender)
    return senderId !== null && trustedDialogWebContentsIds.has(senderId)
}

/**
 * 按范围判定发送方是否可信：
 * - 'main-window'（默认）：仅主窗口；
 * - 'dialog'：仅显式登记的对话框窗口（含 closed 后自动注销）。
 */
export function isTrustedIpcSender(
    event: unknown,
    scope: TrustedSenderScope = 'main-window',
    mainWindow: BrowserWindow | null = trustedMainWindow
): boolean {
    return scope === 'dialog' ? isTrustedDialogSender(event) : isTrustedSender(event, mainWindow)
}

/** 组装拒绝日志里的发送方来源信息（URL 优先，其次 webContents id） */
function describeSender(event: unknown): string {
    try {
        const senderFrame = (event as IpcSenderEvent | null)?.senderFrame
        if (senderFrame && typeof senderFrame.url === 'string' && senderFrame.url) {
            return senderFrame.url
        }
        const sender = extractSender(event) as { getURL?: () => string; id?: number } | undefined
        if (sender && typeof sender.getURL === 'function') {
            const url = sender.getURL()
            if (url) {
                return url
            }
        }
        if (sender && typeof sender.id === 'number') {
            return `webContents#${sender.id}`
        }
    } catch {
        // 诊断信息获取失败不应影响拒绝判定
    }
    return 'unknown(无法识别的发送方)'
}

/** assertTrustedSender 可选参数 */
export interface AssertTrustedSenderOptions {
    /** 通道名（仅用于拒绝日志与审计定位） */
    channel?: string
    /** 受信范围，默认 'main-window' */
    scope?: TrustedSenderScope
    /** 显式主窗口（缺省用登记的主窗口） */
    mainWindow?: BrowserWindow | null
}

/**
 * 校验 IPC 发送方：合法返回 true；非法 console.warn 并返回 false。
 * 调用方在 false 时直接 return（on）或返回 UNTRUSTED_SENDER_RESULT（handle）。
 */
export function assertTrustedSender(
    event: unknown,
    options: AssertTrustedSenderOptions = {}
): boolean {
    const scope = options.scope ?? 'main-window'
    const mainWindow = options.mainWindow ?? trustedMainWindow
    if (isTrustedIpcSender(event, scope, mainWindow)) {
        return true
    }
    const channelText = options.channel ? `（通道：${options.channel}）` : ''
    console.warn(`[Security] 已拒绝不受信任的 IPC 发送方${channelText}：${describeSender(event)}`)
    return false
}

// ============================ 注册包装器 ============================

/** withSenderCheck 可选参数 */
export interface SenderCheckOptions {
    /** 受信范围，默认 'main-window'；对话框通道传 'dialog' */
    scope?: TrustedSenderScope
    /** handle 通道拒绝时返回错误对象；on 通道拒绝时返回 undefined */
    kind?: 'on' | 'handle'
}

/**
 * 给 IPC 监听器套上发送方校验（保持原监听器类型签名）。
 *
 * - on 通道：非法 sender → console.warn 后返回 undefined（不执行业务）；
 * - handle 通道：非法 sender → 返回 UNTRUSTED_SENDER_RESULT 错误对象（invoke 调用方可判别）。
 *
 * @example
 * ipcListenerManager.registerOnce(IPC.FILE.SAVE_TO_DISK, withSenderCheck(IPC.FILE.SAVE_TO_DISK, handler), id)
 * ipcListenerManager.registerHandleOnce(IPC.CONFIG.WRITE, withSenderCheck(IPC.CONFIG.WRITE, handler, { kind: 'handle' }), id)
 */
export function withSenderCheck<TListener extends (...args: never[]) => unknown>(
    channel: string,
    listener: TListener,
    options: SenderCheckOptions = {}
): TListener {
    const scope = options.scope ?? 'main-window'
    const guarded = (event: unknown, ...args: unknown[]): unknown => {
        if (!assertTrustedSender(event, { channel, scope })) {
            return options.kind === 'handle' ? UNTRUSTED_SENDER_RESULT : undefined
        }
        // CQ-15：TListener 是调用方传入的任意监听器签名（(...args: never[]) => unknown），
        // 而包装器需要以 unknown 参数转发；这里用双重断言把"精确签名"收敛到
        // "宽签名调用"再原样返回，属于泛型透传边界，无法用更精确的类型表达。
        const rawListener = listener as unknown as (event: unknown, ...rest: unknown[]) => unknown
        return rawListener(event, ...args)
    }
    // CQ-15：同上——guarded 的宽签名需还原为调用方期望的 TListener 以保持 register 类型推断。
    return guarded as unknown as TListener
}

/**
 * 判断 handle 通道返回值是否为"发送方被拒绝"错误对象。
 * 供渲染层/测试侧判别 invoke 结果（正常业务返回值与拒绝对象不会混淆）。
 */
export function isUntrustedSenderResult(value: unknown): value is UntrustedSenderResult {
    if (!value || typeof value !== 'object') {
        return false
    }
    return (value as { code?: unknown }).code === UNTRUSTED_SENDER_RESULT.code
}

/** 对外导出 WebContents 类型别名，便于调用方声明对话框 webContents 引用 */
export type TrustedWebContents = WebContents
