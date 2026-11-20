/**
 * P2-1：Electron Web 权限请求处理器（默认拒绝）
 *
 * 背景（2026-11-20 全量安全扫描 P2-1）：应用从未调用 `setPermissionRequestHandler` /
 * `setPermissionCheckHandler`，Electron 对未安装 handler 的 session 默认**自动批准**权限。
 * 「在线网页」窗口会加载任意外部 http/https 页面，第三方站点可在无应用级提示的情况下
 * 获得摄像头、麦克风、地理位置、剪贴板读取、通知、屏幕捕获等权限；主渲染层一旦出现
 * XSS 也可滥用同一策略。
 *
 * 策略（最小权限 + 默认拒绝）：
 * 1. 默认 `false`：所有未显式放行的权限请求/检查一律拒绝；
 * 2. 仅「主窗口 + 本地受信页面（file: 的 renderer index.html / dev http://localhost）」
 *    按需放行少量安全权限（见 ALLOWED_APP_PERMISSIONS）：fullscreen 与剪贴板读写——
 *    编辑器 Ctrl+V 读取剪贴板图片的既有功能依赖 clipboard-read，收窄来源即可，
 *    不改变主窗口功能；
 * 3. 在线网页窗口、PlantUML/PDF 导出等隐藏窗口、子框架（iframe）与所有非主窗口
 *    webContents 一律拒绝；
 * 4. session 缺失/单测桩不完整时安全跳过（不阻断应用启动），返回 false 并告警；
 *    未来若新增独立 partition session，应在创建处同样调用本函数（当前应用仅用
 *    defaultSession，主窗口/在线窗口共享）。
 *
 * 实现只依赖 AppContext 与既有导航白名单（isAllowedAppNavigation），
 * 与主窗口导航边界使用同一「受信来源」定义，避免两处规则漂移。
 */
import { getAppContext } from '../app-context'
import { isAllowedAppNavigation } from './security'
import { logger } from './logger'

/**
 * 主窗口本地受信页面按需放行的安全权限白名单。
 *
 * - `fullscreen`：预览/编辑器全屏等标准 Web 能力；
 * - `clipboard-read`：编辑器 Ctrl+V 读取剪贴板图片（hemy-editor-shortcut.ts）依赖；
 * - `clipboard-sanitized-write`：程序化写入剪贴板的 Chromium 标准权限。
 *
 * 摄像头/麦克风/地理定位/通知/屏幕捕获/USB/串口/文件系统等一律不在白名单内。
 */
export const ALLOWED_APP_PERMISSIONS: ReadonlySet<string> = new Set([
    'fullscreen',
    'clipboard-read',
    'clipboard-sanitized-write'
])

/** 与 Electron WebContents 兼容的最小结构（便于单测注入轻量桩） */
export interface PermissionWebContentsLike {
    getURL: () => string
    isDestroyed?: () => boolean
}

/** 权限请求/检查详情中本模块关心的公共子集 */
export interface PermissionDetailsLike {
    /** 是否为主框架；iframe/子框架一律不授予权限 */
    isMainFrame?: boolean
}

/** 与 Electron setPermissionRequestHandler 兼容的最小签名 */
export type PermissionRequestHandlerLike = (
    webContents: PermissionWebContentsLike | null,
    permission: string,
    callback: (granted: boolean) => void,
    details?: PermissionDetailsLike
) => void

/** 与 Electron setPermissionCheckHandler 兼容的最小签名 */
export type PermissionCheckHandlerLike = (
    webContents: PermissionWebContentsLike | null,
    permission: string,
    requestingOrigin: string,
    details?: PermissionDetailsLike
) => boolean

/** 与 Electron Session 兼容的最小结构（便于单测注入轻量桩/启动早期安全跳过） */
export interface PermissionSessionLike {
    setPermissionRequestHandler?: (handler: PermissionRequestHandlerLike) => void
    setPermissionCheckHandler?: (handler: PermissionCheckHandlerLike) => void
}

/** 受信来源判定参数：与主窗口导航边界共用同一组来源（dev server / renderer index.html） */
export interface PermissionHandlerOptions {
    /** 开发模式下的渲染进程 dev server 地址（生产不传） */
    devUrl?: string | null
    /** 打包/构建后的 renderer index.html 绝对路径 */
    rendererIndexPath?: string | null
}

/** 是否已注册（进程级一次性，防重复覆盖 handler） */
let registered = false

/** 取当前主窗口的 webContents（窗口不存在/已销毁时返回 null） */
function getCurrentMainWindowContents(): PermissionWebContentsLike | null {
    try {
        const mainWindow = getAppContext().mainWindow
        if (!mainWindow || mainWindow.isDestroyed()) {
            return null
        }
        const contents = mainWindow.webContents as unknown as PermissionWebContentsLike | null
        if (!contents || contents.isDestroyed?.()) {
            return null
        }
        return contents
    } catch {
        return null
    }
}

/**
 * P2-1 核心判定（纯函数，便于单测）：
 * 仅当「权限在白名单内 + 主框架 + 主窗口 webContents + 当前 URL 属于本地受信页面」时放行。
 */
export function isTrustedAppPermission(
    webContents: PermissionWebContentsLike | null,
    permission: string,
    details: PermissionDetailsLike | undefined,
    options: PermissionHandlerOptions = {}
): boolean {
    if (!webContents || typeof permission !== 'string') {
        return false
    }
    if (!ALLOWED_APP_PERMISSIONS.has(permission)) {
        return false
    }
    // 子框架一律不给权限（HTML 查看器等 iframe 沙箱之外的纵深防御）；
    // 注：Electron 对 fileSystem 的 isMainFrame 恒为 false，该权限不在白名单内，无影响。
    if (details?.isMainFrame === false) {
        return false
    }
    const mainContents = getCurrentMainWindowContents()
    if (mainContents === null || mainContents !== webContents) {
        return false
    }
    let currentUrl: string
    try {
        currentUrl = webContents.getURL()
    } catch {
        return false
    }
    return isAllowedAppNavigation(currentUrl, {
        devUrl: options.devUrl ?? null,
        rendererIndexPath: options.rendererIndexPath ?? null
    })
}

/** 记录被拒绝的权限请求（日志异常不影响权限决策） */
function logDeniedPermission(
    permission: string,
    webContents: PermissionWebContentsLike | null
): void {
    try {
        let currentUrl = '<unknown>'
        try {
            currentUrl = webContents?.getURL() || '<unknown>'
        } catch {
            // 已销毁的 webContents 取 URL 可能抛错，按 unknown 记录
        }
        logger.warn(`[Security] 已拒绝 Web 权限请求（P2-1）：${permission} @ ${currentUrl}`)
    } catch {
        // 日志失败不影响权限决策
    }
}

/**
 * 注册 Web 权限处理器（幂等）。
 *
 * 在 `app.whenReady` 中传入 `session.defaultSession` 调用；session 缺失（单测/异常环境）
 * 时安全跳过并返回 false，不阻断启动。返回是否完成注册。
 */
export function registerPermissionHandlers(
    session?: PermissionSessionLike | null,
    options: PermissionHandlerOptions = {}
): boolean {
    if (registered) {
        return false
    }
    const setRequestHandler = session?.setPermissionRequestHandler
    const setCheckHandler = session?.setPermissionCheckHandler
    if (typeof setRequestHandler !== 'function' || typeof setCheckHandler !== 'function') {
        logger.warn('[Security] Web 权限处理器未注册：session 不可用（P2-1）')
        return false
    }
    try {
        const requestHandler: PermissionRequestHandlerLike = (
            webContents,
            permission,
            callback,
            details
        ) => {
            let granted = false
            try {
                granted = isTrustedAppPermission(webContents, permission, details, options)
            } catch (error) {
                logger.warn('[Security] Web 权限请求判定异常，按拒绝处理（P2-1）：', error)
            }
            if (!granted) {
                logDeniedPermission(permission, webContents)
            }
            // 无论判定如何都必须回调，否则请求方会永久挂起
            try {
                callback(granted)
            } catch {
                // 回调本身抛错（请求方已销毁）不得冒泡到主进程
            }
        }
        const checkHandler: PermissionCheckHandlerLike = (
            webContents,
            permission,
            _requestingOrigin,
            details
        ) => {
            try {
                return isTrustedAppPermission(webContents, permission, details, options)
            } catch {
                return false
            }
        }
        // 2026-11-20（打包 E2E 实测）：Session 方法依赖 `this` 指向 session 实例；
        // 解构后直接调用会抛 "Illegal invocation: Function must be called on an object
        // of type Session"。必须通过属性调用（或 call(session)）绑定接收者。
        const targetSession = session as PermissionSessionLike
        targetSession.setPermissionRequestHandler?.(requestHandler)
        targetSession.setPermissionCheckHandler?.(checkHandler)
        registered = true
        return true
    } catch (error) {
        logger.warn('[Security] 注册 Web 权限处理器失败（P2-1）：', error)
        return false
    }
}

/** 重置注册标记（仅测试隔离使用） */
export function resetPermissionHandlersForTesting(): void {
    registered = false
}
