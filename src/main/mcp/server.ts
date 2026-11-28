/**
 * 1.5.7 LLM Wiki L2：MCP 只读桥 HTTP 传输（Streamable HTTP / JSON 响应模式）
 *
 * ## 为什么是 HTTP 传输（而非 stdio）
 * 白泽是长期运行的 GUI 应用，无法被外部 Agent 作为 stdio 子进程拉起；因此 L2 批次实现
 * **Streamable HTTP 传输**：主进程监听 `127.0.0.1`，外部 MCP 客户端（Claude Code / DSH /
 * Cursor 等）经 `http://127.0.0.1:<port>/mcp` 以 JSON-RPC 2.0 over HTTP POST 调用只读工具。
 * stdio 传输作为后续 CLI 增强（需独立 CLI 入口），本期不做。
 *
 * ## 安全边界（逐条实现）
 * 1. **默认关闭**：只有 `MCP.SET_ENABLED { enabled:true }` 才启动监听（用户在设置页显式启用）；
 * 2. **仅回环**：`server.listen(host: '127.0.0.1')`，不监听 0.0.0.0，外网/局域网不可达；
 * 3. **Bearer token**：每次启用随机生成（32 字节 hex），`Authorization: Bearer <token>`
 *    恒定时间比较；token 不落盘、不写日志，停止/重启后旧 token 立即失效；
 * 4. **Host 校验**：只接受 127.0.0.1/localhost/[::1]（防 DNS rebinding 把恶意域名解析到回环）；
 * 5. **拒绝浏览器 Origin**：带 Origin 的请求一律 403（阻断恶意网页访问本机服务），不设 CORS 头；
 * 6. **请求体上限 1 MiB** + 请求超时 30s + 头部超时 10s（防内存/事件循环占用）；
 * 7. **只读工具**：7 个工具全部只读（见 tools.ts），传输层不提供任何写入口；
 * 8. **端口**：优先 3847，被占用依次 +1 最多 10 次，仍失败回退系统分配（port 0）；
 *    实际端口经 `GET_STATUS` 返回给设置页。
 *
 * ## 协议能力范围（本期）
 * - POST：`initialize` / `tools/list` / `tools/call` / `ping` / `notifications/*`（202 空响应）；
 * - 响应统一为 `application/json`（不实现 SSE 流式响应；GET 返回 405 并说明）；
 * - DELETE：按无状态会话处理（回 204，无会话存储）。
 * - `initialize` 响应携带 `Mcp-Session-Id` 头（无状态实现，仅用于兼容要求会话头的客户端）。
 *
 * ## 日志
 * 只记录「启动/停止/端口/工具名/协议方法/状态码」，**绝不记录 token 与请求正文**
 * （见 LOG 规范：日志不得主动记录密钥/笔记正文）。
 */
import { randomBytes } from 'crypto'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { McpServerStatus } from '../../shared/types/ipc'
import { logger } from '../utils/logger'
import {
    generateMcpToken,
    hasBrowserOrigin,
    isAllowedMcpHost,
    isMcpTokenValid,
    parseBearerAuthorization
} from './auth'
import {
    MCP_DEFAULT_PORT,
    MCP_ENDPOINT_PATH,
    MCP_HEADERS_TIMEOUT_MS,
    MCP_HOST,
    MCP_KEEP_ALIVE_TIMEOUT_MS,
    MCP_MAX_REQUEST_BODY_BYTES,
    MCP_PORT_ATTEMPTS,
    MCP_REQUEST_TIMEOUT_MS,
    MCP_SERVER_NAME
} from './constants'
import { createMcpProtocolHandler, JSON_RPC_ERROR_CODES, type McpProtocolHandler } from './protocol'
import { MCP_TOOL_COUNT } from './tools'

/** MCP 服务启动选项 */
export interface McpServerStartOptions {
    /** serverInfo.version（生产由主进程 app.getVersion() 注入；缺省 '0.0.0'） */
    version?: string
}

/** MCP HTTP 服务构造选项（仅测试注入用；生产走 {@link mcpServer} 单例默认值） */
export interface McpServerOptions {
    /** 顺序尝试的端口列表（缺省 3847..3856） */
    preferredPorts?: readonly number[]
    /** 请求体上限（缺省 1 MiB；单测用小值验证 413） */
    maxRequestBodyBytes?: number
    /** 请求超时（ms，缺省 30s） */
    requestTimeoutMs?: number
}

/** 请求体超过上限（内部异常，转换为 413） */
class RequestBodyTooLargeError extends Error {
    constructor() {
        super('Request body too large')
        this.name = 'RequestBodyTooLargeError'
    }
}

/** 读取当前主窗口可用的回环 URL */
function buildMcpUrl(port: number): string {
    return `http://${MCP_HOST}:${port}${MCP_ENDPOINT_PATH}`
}

/** 是否为端口占用错误（EADDRINUSE → 尝试下一个端口） */
function isPortInUseError(error: unknown): boolean {
    return (error as NodeJS.ErrnoException)?.code === 'EADDRINUSE'
}

/** 在指定端口启动监听（EADDRINUSE 由调用方读取错误码后继续尝试） */
function listenOnPort(server: Server, port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
        const onError = (error: Error): void => {
            server.off('listening', onListening)
            reject(error)
        }
        const onListening = (): void => {
            server.off('error', onError)
            resolve()
        }
        server.once('error', onError)
        server.once('listening', onListening)
        server.listen({ host: MCP_HOST, port })
    })
}

/** 读取 server 实际监听端口 */
function readListeningPort(server: Server): number {
    const address = server.address()
    return typeof address === 'object' && address !== null ? address.port : 0
}

/** 请求体是否声明为 JSON（宽松匹配 application/json + 可选 charset） */
function isJsonContentType(contentType: string | string[] | undefined): boolean {
    const raw = Array.isArray(contentType) ? contentType[0] : contentType
    if (typeof raw !== 'string') {
        return false
    }
    return /^application\/(?:[a-z0-9.+-]*\+)?json\b/i.test(raw.trim())
}

/** 读取请求体（超过上限抛 {@link RequestBodyTooLargeError}） */
function readRequestBody(req: IncomingMessage, maxBytes: number): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = []
        let total = 0
        let settled = false
        const cleanup = (): void => {
            req.off('data', onData)
            req.off('end', onEnd)
            req.off('error', onError)
        }
        const onData = (chunk: Buffer): void => {
            total += chunk.length
            if (total > maxBytes) {
                if (!settled) {
                    settled = true
                    cleanup()
                    req.pause()
                    reject(new RequestBodyTooLargeError())
                }
                return
            }
            chunks.push(chunk)
        }
        const onEnd = (): void => {
            if (settled) {
                return
            }
            settled = true
            cleanup()
            resolve(Buffer.concat(chunks).toString('utf8'))
        }
        const onError = (error: Error): void => {
            if (settled) {
                return
            }
            settled = true
            cleanup()
            reject(error)
        }
        req.on('data', onData)
        req.on('end', onEnd)
        req.on('error', onError)
    })
}

/** 解析请求 URL（异常 URL 返回 null） */
function parseRequestUrl(rawUrl: string | undefined): URL | null {
    if (typeof rawUrl !== 'string' || rawUrl.length === 0) {
        return null
    }
    try {
        return new URL(rawUrl, `http://${MCP_HOST}`)
    } catch {
        return null
    }
}

/**
 * MCP 只读桥 HTTP 服务（可独立实例化，便于单测覆盖随机端口/413/鉴权等分支）。
 *
 * 生命周期：`start()` ↔ `stop()` 幂等且串行化（防设置页快速连点导致并发 listen/close）；
 * 状态（端口/token/URL）只存在于内存，`getStatus()` 为实时值。
 */
export class McpHttpServer {
    private server: Server | null = null
    private protocol: McpProtocolHandler | null = null
    private token = ''
    private port = 0
    private sessionId = ''
    private pending: Promise<unknown> = Promise.resolve()
    private readonly options: Required<Omit<McpServerOptions, 'preferredPorts'>> & {
        preferredPorts: readonly number[]
    }

    constructor(options: McpServerOptions = {}) {
        this.options = {
            preferredPorts:
                options.preferredPorts ??
                Array.from({ length: MCP_PORT_ATTEMPTS }, (_, index) => MCP_DEFAULT_PORT + index),
            maxRequestBodyBytes: options.maxRequestBodyBytes ?? MCP_MAX_REQUEST_BODY_BYTES,
            requestTimeoutMs: options.requestTimeoutMs ?? MCP_REQUEST_TIMEOUT_MS
        }
    }

    /**
     * 启动服务（已运行则直接返回当前状态）。
     *
     * @throws 端口冲突以外的监听错误（由调用方转换为结构化失败并记日志）
     */
    start(options: McpServerStartOptions = {}): Promise<McpServerStatus> {
        return this.enqueueTask(async () => {
            if (this.server !== null) {
                return this.getStatus()
            }
            const token = generateMcpToken()
            const protocol = createMcpProtocolHandler({
                serverInfo: { name: MCP_SERVER_NAME, version: options.version ?? '0.0.0' }
            })
            const server = createServer((req, res) => {
                void this.handleRequest(req, res)
            })
            server.requestTimeout = this.options.requestTimeoutMs
            server.headersTimeout = MCP_HEADERS_TIMEOUT_MS
            server.keepAliveTimeout = MCP_KEEP_ALIVE_TIMEOUT_MS

            let listeningPort = 0
            for (const candidatePort of this.options.preferredPorts) {
                try {
                    await listenOnPort(server, candidatePort)
                    listeningPort = readListeningPort(server)
                    break
                } catch (error) {
                    if (isPortInUseError(error)) {
                        continue
                    }
                    throw error
                }
            }
            if (listeningPort === 0) {
                // 全部候选端口被占用：回退系统分配的空闲端口（仍只绑定 127.0.0.1）
                await listenOnPort(server, 0)
                listeningPort = readListeningPort(server)
            }
            // 常驻错误处理：监听成功后的网络错误只记日志，不让 'error' 事件冒泡导致主进程崩溃
            server.on('error', (error) => {
                logger.warn('[MCP] HTTP 服务运行期错误：', error)
            })
            // 不阻塞应用退出（Electron 主进程由其它 handle 保活；测试进程也不会被挂住）
            server.unref()

            this.server = server
            this.protocol = protocol
            this.token = token
            this.port = listeningPort
            this.sessionId = randomBytes(16).toString('hex')
            logger.info(
                `[MCP] 只读桥已启动：${buildMcpUrl(listeningPort)}（工具 ${MCP_TOOL_COUNT} 个；token 已生成，不落盘）`
            )
            return this.getStatus()
        })
    }

    /** 停止服务（清空 token/端口；未运行则直接返回当前状态） */
    stop(): Promise<McpServerStatus> {
        return this.enqueueTask(async () => {
            const server = this.server
            this.server = null
            this.protocol = null
            this.token = ''
            this.port = 0
            this.sessionId = ''
            if (server !== null) {
                await new Promise<void>((resolve) => {
                    server.close(() => resolve())
                    // 主动关闭 keep-alive 空闲连接，避免 stop 后仍有旧连接可用
                    if (typeof server.closeAllConnections === 'function') {
                        server.closeAllConnections()
                    }
                })
                logger.info('[MCP] 只读桥已停止：token 已清空，端口已释放')
            }
            return this.getStatus()
        })
    }

    /** 读取实时状态（token 只在运行态返回；调用方负责只提供给受信主窗口） */
    getStatus(): McpServerStatus {
        const running = this.server !== null
        return {
            enabled: running,
            running,
            port: running ? this.port : 0,
            token: running ? this.token : '',
            url: running ? buildMcpUrl(this.port) : '',
            toolCount: MCP_TOOL_COUNT
        }
    }

    /** 串行化 start/stop 调用（防设置页连点导致并发 listen/close 竞态） */
    private enqueueTask<T>(task: () => Promise<T>): Promise<T> {
        const next = this.pending.then(task, task)
        // 保持链继续可执行：失败只影响本次调用的返回值，不阻塞后续 start/stop
        this.pending = next.then(
            () => undefined,
            () => undefined
        )
        return next
    }

    /** 统一的请求入口（所有异常在此收敛，不向事件循环抛出） */
    private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
        try {
            const url = parseRequestUrl(req.url)
            if (url === null || (url.pathname !== MCP_ENDPOINT_PATH && url.pathname !== '/')) {
                this.sendPlain(res, 404, 'Not Found')
                return
            }
            // 防 DNS rebinding：Host 必须是本机回环地址
            if (!isAllowedMcpHost(req.headers.host)) {
                logger.warn('[MCP] 已拒绝非回环 Host 的请求')
                this.sendPlain(res, 403, 'Forbidden: invalid Host header')
                return
            }
            // 拒绝浏览器发起（带 Origin）的跨源请求：不提供 CORS 放行，避免恶意网页调用本机服务
            if (hasBrowserOrigin(req.headers.origin)) {
                logger.warn('[MCP] 已拒绝来自浏览器 Origin 的请求')
                this.sendPlain(res, 403, 'Forbidden: browser origins are not allowed')
                return
            }
            // Bearer token 恒定时间校验（服务未运行时 token 为空 → 一律 401）
            const providedToken = parseBearerAuthorization(req.headers.authorization)
            if (!isMcpTokenValid(providedToken, this.token)) {
                res.setHeader('WWW-Authenticate', 'Bearer realm="baize-mcp"')
                this.sendPlain(res, 401, 'Unauthorized')
                return
            }
            if (req.method === 'POST') {
                await this.handlePost(req, res)
                return
            }
            if (req.method === 'DELETE') {
                // 无状态会话：DELETE 仅作为会话结束确认（不保存任何会话数据）
                res.writeHead(204, { 'Cache-Control': 'no-store' })
                res.end()
                return
            }
            if (req.method === 'GET') {
                // 本期不实现 SSE：明确 405（客户端应改用 POST JSON 模式）
                res.setHeader('Allow', 'POST, DELETE')
                this.sendPlain(res, 405, 'SSE transport is not supported; use POST with JSON-RPC')
                return
            }
            res.setHeader('Allow', 'POST, DELETE')
            this.sendPlain(res, 405, 'Method Not Allowed')
        } catch (error) {
            logger.error('[MCP] HTTP 请求处理异常：', error)
            if (!res.headersSent) {
                this.sendPlain(res, 500, 'Internal Server Error')
            } else {
                res.end()
            }
        }
    }

    /** 处理 POST：body 上限 → JSON 解析 → JSON-RPC → 响应 */
    private async handlePost(req: IncomingMessage, res: ServerResponse): Promise<void> {
        if (!isJsonContentType(req.headers['content-type'])) {
            this.sendPlain(res, 415, 'Unsupported Media Type: expected application/json')
            return
        }
        // Content-Length 声明超限时直接拒绝（不读取正文）
        const declaredLength = Number(req.headers['content-length'])
        if (Number.isFinite(declaredLength) && declaredLength > this.options.maxRequestBodyBytes) {
            this.respondTooLarge(req, res)
            return
        }
        let body: string
        try {
            body = await readRequestBody(req, this.options.maxRequestBodyBytes)
        } catch (error) {
            if (error instanceof RequestBodyTooLargeError) {
                this.respondTooLarge(req, res)
                return
            }
            this.sendPlain(res, 400, 'Bad Request: failed to read body')
            return
        }
        let parsed: unknown
        try {
            parsed = JSON.parse(body)
        } catch {
            this.sendJsonRpc(res, 400, {
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: JSON_RPC_ERROR_CODES.PARSE_ERROR,
                    message: 'JSON 解析失败'
                }
            })
            return
        }
        const protocol = this.protocol
        if (protocol === null) {
            this.sendPlain(res, 503, 'MCP server is not running')
            return
        }
        const startedAt = Date.now()
        const response = await protocol.handle(parsed)
        const elapsedMs = Date.now() - startedAt
        this.logProtocolCall(parsed, elapsedMs)
        if (response === null) {
            // 通知（notifications/*）：按 MCP 规范回 202 且不写响应体
            res.writeHead(202, this.baseResponseHeaders())
            res.end()
            return
        }
        const headers = this.baseResponseHeaders()
        // initialize 响应回传会话头（无状态实现；客户端后续带不带均可）
        headers['Mcp-Session-Id'] = this.sessionId
        this.sendJsonRpc(res, 200, response, headers)
    }

    /** 记录协议调用审计日志（只记录方法/工具名/耗时，不记录参数与正文） */
    private logProtocolCall(parsed: unknown, elapsedMs: number): void {
        if (typeof parsed !== 'object' || parsed === null) {
            return
        }
        const record = parsed as Record<string, unknown>
        const method = typeof record.method === 'string' ? record.method : 'unknown'
        if (method === 'tools/call') {
            const params = record.params
            const toolName =
                typeof params === 'object' && params !== null
                    ? String((params as Record<string, unknown>).name ?? 'unknown')
                    : 'unknown'
            logger.info(`[MCP] tools/call ${toolName} 完成：${elapsedMs}ms`)
            return
        }
        if (method === 'initialize' || method === 'tools/list' || method === 'ping') {
            logger.info(`[MCP] ${method} 完成：${elapsedMs}ms`)
        }
    }

    /** 请求体超限：回 413 并在响应发出后关闭连接（避免继续读取超限载荷） */
    private respondTooLarge(req: IncomingMessage, res: ServerResponse): void {
        logger.warn('[MCP] 已拒绝超限请求体')
        res.setHeader('Connection', 'close')
        this.sendPlain(res, 413, 'Payload Too Large')
        res.once('finish', () => {
            req.destroy()
        })
    }

    /** 统一响应头（JSON、禁缓存、禁嗅探；不设置任何 CORS 头） */
    private baseResponseHeaders(): Record<string, string> {
        return {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        }
    }

    /** 写 JSON-RPC 响应 */
    private sendJsonRpc(
        res: ServerResponse,
        statusCode: number,
        payload: unknown,
        extraHeaders: Record<string, string> = {}
    ): void {
        const body = JSON.stringify(payload)
        res.writeHead(statusCode, {
            ...this.baseResponseHeaders(),
            ...extraHeaders,
            'Content-Length': Buffer.byteLength(body)
        })
        res.end(body)
    }

    /** 写纯文本响应（鉴权/方法错误等 HTTP 层失败） */
    private sendPlain(res: ServerResponse, statusCode: number, message: string): void {
        res.writeHead(statusCode, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Content-Length': Buffer.byteLength(message),
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff'
        })
        res.end(message)
    }
}

/** 进程内唯一 MCP 服务实例（由 ipc/mcp-ipc.ts 启停；token 只经受信主窗口读取） */
export const mcpServer = new McpHttpServer()

/** 启动 MCP 只读桥（幂等；失败抛错由 IPC 层转换为结构化结果） */
export function startMcpServer(options: McpServerStartOptions = {}): Promise<McpServerStatus> {
    return mcpServer.start(options)
}

/** 停止 MCP 只读桥（幂等；token/端口立即清空） */
export function stopMcpServer(): Promise<McpServerStatus> {
    return mcpServer.stop()
}

/** 读取 MCP 只读桥实时状态（不含持久化语义） */
export function getMcpServerStatus(): McpServerStatus {
    return mcpServer.getStatus()
}
