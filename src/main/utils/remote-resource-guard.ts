/**
 * AS-9（P3）：远程图表/资源外发阻断（隐私加固）
 *
 * 背景：渲染层 `markdown-it-plantuml` 是 PlantUML 本地离线渲染失败时的"远程降级"路径：
 * 它把 `@startuml` 源码 deflate+base64 后拼成 `https://www.plantuml.com/plantuml/svg/...`
 * 的远程图片请求，浏览器会自动加载。一旦 `resources/plantuml` 缺失或主进程隐藏窗口
 * 渲染不可用，文档里的图表源码（可能含内部业务信息）就会被外发给第三方站点。
 *
 * 修复策略（主进程侧统一收口，不改渲染层 Markdown 渲染管线）：
 * 在 `session.defaultSession.webRequest.onBeforeRequest` 上按主机名白名单阻断
 * plantuml.com 的远程请求——本地离线渲染成功时不产生该请求（无行为变化），
 * 渲染失败时请求被 cancel，源码不再外发（图表降级为破图，用户可感知本地资源问题）。
 *
 * 注意：应用内"在线工具 → PlantUML Server"菜单经 shell.openExternal 交给系统浏览器，
 * 不经过本进程 session，因此不受影响。
 */
import { logger } from './logger'

/** 需要阻断的远程图表外发主机（精确域名 + 子域，均以 `.host` 形式匹配） */
export const BLOCKED_REMOTE_RESOURCE_HOSTS: readonly string[] = ['plantuml.com']

/** 从 URL 中解析主机名；非法 URL 返回 null（不抛异常） */
function parseHostname(rawUrl: string): string | null {
    try {
        const parsed = new URL(rawUrl)
        return parsed.hostname.toLowerCase()
    } catch {
        return null
    }
}

/**
 * AS-9 纯函数：给定请求 URL，是否应阻断（用于单元测试与 webRequest 过滤器共享同一判定）。
 * 命中阻断主机或其子域（如 www.plantuml.com、plantuml.com）返回 true。
 */
export function shouldBlockRemoteResource(rawUrl: unknown): boolean {
    if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
        return false
    }
    const hostname = parseHostname(rawUrl)
    if (hostname === null) {
        return false
    }
    return BLOCKED_REMOTE_RESOURCE_HOSTS.some(
        (blockedHost) => hostname === blockedHost || hostname.endsWith(`.${blockedHost}`)
    )
}

/** webRequest 过滤器（Electron 的 URL 模式，仅用于减少回调次数；最终判定仍以 shouldBlockRemoteResource 为准） */
export function getRemoteResourceBlockFilterUrls(): string[] {
    return BLOCKED_REMOTE_RESOURCE_HOSTS.flatMap((host) => [`*://${host}/*`, `*://*.${host}/*`])
}

/** 与 Electron Session/WebRequest 兼容的最小结构（便于单测注入轻量桩） */
export interface BeforeRequestDetailsLike {
    url: string
    resourceType?: string
}
export interface WebRequestLike {
    onBeforeRequest: (
        filter: { urls: string[] },
        listener: (
            details: BeforeRequestDetailsLike,
            callback: (response: { cancel?: boolean }) => void
        ) => void
    ) => void
    onBeforeRequestCompleted?: unknown
}
export interface SessionLike {
    webRequest?: WebRequestLike
}

/** 最近一次注册的阻断结果（仅供测试/诊断） */
let registered = false

/**
 * 注册远程资源外发阻断（幂等：重复调用直接返回 false）。
 * 在 app.whenReady 后由主进程入口传入 `session.defaultSession`；未传/不可用
 * （单测、异常环境）时安全跳过并返回 false，不影响应用启动。
 */
export function registerRemoteResourceGuard(session?: SessionLike | null): boolean {
    if (registered) {
        return false
    }
    const webRequest = session?.webRequest
    if (!webRequest || typeof webRequest.onBeforeRequest !== 'function') {
        logger.warn('[Security] 远程资源外发阻断未注册：缺少 session.webRequest（AS-9）')
        return false
    }
    try {
        webRequest.onBeforeRequest(
            { urls: getRemoteResourceBlockFilterUrls() },
            (details, callback) => {
                if (shouldBlockRemoteResource(details.url)) {
                    logger.warn(`[Security] 已阻断远程图表外发请求（AS-9）：${details.url}`)
                    callback({ cancel: true })
                    return
                }
                callback({})
            }
        )
        registered = true
        return true
    } catch (error) {
        logger.warn('[Security] 注册远程资源外发阻断失败（AS-9）：', error)
        return false
    }
}

/** 重置注册标记（仅测试隔离使用） */
export function resetRemoteResourceGuardForTesting(): void {
    registered = false
}
