/**
 * 1.5.7 LLM Wiki L2：MCP 只读桥鉴权（Bearer token）
 *
 * ## 职责
 * - 生成每次启用时的随机访问令牌（≥32 字节随机数 → 64 位十六进制字符串）；
 * - 解析 `Authorization: Bearer <token>` 头；
 * - 恒定时间比较令牌（timingSafeEqual），避免通过响应时间侧信道逐字符猜测。
 *
 * ## 安全边界
 * - 令牌**不落盘**（不写系统设置/日志/配置文件），进程内仅由 server 持有，
 *   经 `MCP.GET_STATUS` 只返回给受信主窗口；服务停止/应用重启后旧令牌立即失效；
 * - 本模块不记录令牌明文（日志只记录「已生成/已清空」）。
 */
import { randomBytes, timingSafeEqual } from 'crypto'

/** 令牌随机字节数（≥32 字节；256 位熵，爆破不可行） */
export const MCP_TOKEN_BYTES = 32

/** 合法令牌形态：64 位小写十六进制（由 {@link generateMcpToken} 生成） */
export const MCP_TOKEN_PATTERN = /^[a-f0-9]{64}$/

/**
 * 生成新的 MCP 访问令牌（每次启用随机生成，未持久化）。
 *
 * @returns 64 位十六进制字符串（32 字节随机数）
 */
export function generateMcpToken(): string {
    return randomBytes(MCP_TOKEN_BYTES).toString('hex')
}

/**
 * 从 `Authorization` 请求头解析 Bearer 令牌。
 *
 * 宽松解析（不强制令牌形态）：大小写不敏感匹配 `Bearer <token>`，允许前后空白；
 * 缺失/非字符串/形态不符返回 null（由调用方统一按 401 处理，不区分具体原因）。
 */
export function parseBearerAuthorization(header: string | string[] | undefined): string | null {
    const raw = Array.isArray(header) ? header[0] : header
    if (typeof raw !== 'string') {
        return null
    }
    const match = /^Bearer\s+([A-Za-z0-9._~+/=-]{1,512})$/i.exec(raw.trim())
    return match ? match[1] : null
}

/**
 * 恒定时间比较令牌：长度不同直接 false，长度相同用 `timingSafeEqual` 比较内容。
 *
 * @param provided 请求携带的令牌（可能为 null/非字符串）
 * @param expected 服务当前持有的令牌（服务未运行时为空串/null）
 */
export function isMcpTokenValid(
    provided: string | null | undefined,
    expected: string | null | undefined
): boolean {
    if (typeof provided !== 'string' || typeof expected !== 'string' || expected.length === 0) {
        return false
    }
    const providedBuffer = Buffer.from(provided, 'utf8')
    const expectedBuffer = Buffer.from(expected, 'utf8')
    if (providedBuffer.length !== expectedBuffer.length) {
        return false
    }
    return timingSafeEqual(providedBuffer, expectedBuffer)
}

/**
 * 校验 `Host` 请求头是否为本机回环地址（防 DNS rebinding：攻击者域名解析到 127.0.0.1 时，
 * 浏览器发来的 Host 是攻击者域名而不是回环地址）。
 *
 * 允许：`127.0.0.1[:port]` / `localhost[:port]` / `[::1][:port]`（大小写不敏感）。
 * 无 Host 头（HTTP/1.0 客户端）按允许处理——鉴权仍由 Bearer token 兜底。
 */
export function isAllowedMcpHost(hostHeader: string | string[] | undefined): boolean {
    const raw = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader
    if (raw === undefined) {
        return true
    }
    if (typeof raw !== 'string') {
        return false
    }
    const host = raw.trim().toLowerCase()
    if (host.length === 0) {
        return false
    }
    return (
        /^127\.0\.0\.1(?::\d{1,5})?$/.test(host) ||
        /^localhost(?::\d{1,5})?$/.test(host) ||
        /^\[::1\](?::\d{1,5})?$/.test(host)
    )
}

/**
 * 是否携带 `Origin` 请求头。
 *
 * 非浏览器 MCP 客户端（Node/Python/Claude 等）不会发送 Origin；浏览器页面发起的请求必带
 * Origin（且受 CORS 预检限制）。直接拒绝带 Origin 的请求，阻断「恶意网页访问本机服务」
 * 这一类浏览器侧攻击面，同时不引入任何 CORS 放行头。
 */
export function hasBrowserOrigin(originHeader: string | string[] | undefined): boolean {
    const raw = Array.isArray(originHeader) ? originHeader[0] : originHeader
    return typeof raw === 'string' && raw.trim().length > 0
}
