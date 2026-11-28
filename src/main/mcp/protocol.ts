/**
 * 1.5.7 LLM Wiki L2：MCP JSON-RPC 2.0 协议层（与 HTTP 传输解耦，便于单测）
 *
 * ## 支持的请求
 * - `initialize`：返回 protocolVersion / capabilities（仅 tools）/ serverInfo / instructions；
 * - `notifications/initialized` 等通知：不返回响应体（传输层回 202）；
 * - `ping`：返回 `{}`（MCP 心跳，便于客户端检测连通性）；
 * - `tools/list`：返回 7 个只读工具的 name/description/inputSchema；
 * - `tools/call`：执行只读工具，返回 content blocks（可预期失败 isError=true）。
 *
 * ## 错误口径（JSON-RPC 2.0）
 * - 非对象请求 / 缺少合法 method → -32600 Invalid Request；
 * - 未知方法 → -32601 Method Not Found；
 * - `tools/call` 参数非法 / 未知工具 → -32602 Invalid Params；
 * - 协议层内部异常 → -32603 Internal error（不向客户端泄漏堆栈）。
 * 工具业务失败（无工作区/路径越界/文件不存在等）走 tools/call 的 `isError: true` 结果，
 * 而不是 JSON-RPC error——Agent 可据此读取结构化原因并调整参数。
 *
 * ## 传输无关
 * 本模块不 import http/electron，只处理「解析后的 JSON 值 → 响应对象」；
 * HTTP 传输（鉴权/请求体上限/超时/日志）在 server.ts。
 */
import { logger } from '../utils/logger'
import {
    MCP_DEFAULT_PROTOCOL_VERSION,
    MCP_SERVER_NAME,
    MCP_SUPPORTED_PROTOCOL_VERSIONS
} from './constants'
import {
    executeMcpTool,
    isMcpToolName,
    listMcpTools,
    type McpToolCallResult,
    type McpToolDefinition
} from './tools'

/** JSON-RPC 2.0 标准错误码（协议层保留错误区间 -32768 ~ -32000） */
export const JSON_RPC_ERROR_CODES = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603
} as const

/** JSON-RPC 错误对象 */
export interface JsonRpcErrorObject {
    code: number
    message: string
    data?: unknown
}

/** JSON-RPC 响应（id 为 null 表示无法识别请求 id，如解析失败） */
export interface JsonRpcResponse {
    jsonrpc: '2.0'
    id: string | number | null
    result?: unknown
    error?: JsonRpcErrorObject
}

/** 协议层依赖（可注入便于单测；默认接真实工具实现） */
export interface McpProtocolDependencies {
    /** initialize 的 serverInfo */
    serverInfo: { name: string; version: string }
    /** initialize 的 instructions（如何使用本 wiki 的说明） */
    instructions: string
    /** tools/list 数据源 */
    listTools: () => readonly McpToolDefinition[]
    /** tools/call 执行器 */
    callTool: (name: string, args: unknown) => Promise<McpToolCallResult>
}

/** 协议层实例 */
export interface McpProtocolHandler {
    /**
     * 处理一条已解析的 JSON-RPC 消息。
     *
     * @returns 需要回写的响应；通知（无 id）返回 null（传输层回 202 且不写响应体）
     */
    handle: (request: unknown) => Promise<JsonRpcResponse | null>
}

/** initialize 的默认 instructions（英文，供外部 LLM Agent 理解工作区约定） */
export const MCP_DEFAULT_INSTRUCTIONS = [
    'BaiZe Notes is a local Markdown knowledge-base app. This MCP server exposes READ-ONLY tools over the current open workspace (an LLM Wiki workspace usually has raw/ for immutable source material and wiki/ for compiled knowledge).',
    'Use list_pages / list_tags / search_wiki to explore, read_page to read a wiki page (raw Markdown + parsed front matter), read_schema to read the workspace conventions, and read_raw to read source material under raw/.',
    'All paths are workspace-relative; absolute paths and .. traversal are rejected. No tool writes, renames or deletes anything.'
].join('\n')

/** 是否为普通对象（排除 null/数组） */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 组装成功响应 */
function successResponse(id: string | number | null, result: unknown): JsonRpcResponse {
    return { jsonrpc: '2.0', id, result }
}

/** 组装错误响应 */
function errorResponse(id: string | number | null, code: number, message: string): JsonRpcResponse {
    return { jsonrpc: '2.0', id, error: { code, message } }
}

/** 解析 initialize 请求中的客户端协议版本（非法/缺失返回空串） */
function readRequestedProtocolVersion(params: unknown): string {
    if (!isRecord(params) || typeof params.protocolVersion !== 'string') {
        return ''
    }
    return params.protocolVersion
}

/** 按客户端请求版本协商协议版本（未知版本回落默认，保证客户端仍可完成握手） */
function negotiateProtocolVersion(requested: string): string {
    return (MCP_SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
        ? requested
        : MCP_DEFAULT_PROTOCOL_VERSION
}

/** 解析 clientInfo（仅用于审计日志，不参与协议判定） */
function readClientName(params: unknown): string {
    if (!isRecord(params) || !isRecord(params.clientInfo)) {
        return 'unknown'
    }
    const name = params.clientInfo.name
    return typeof name === 'string' && name.length > 0 ? name : 'unknown'
}

/**
 * 创建 MCP JSON-RPC 协议处理器。
 *
 * @param overrides 部分依赖覆盖（单测注入工具替身；生产只用 serverInfo.version）
 */
export function createMcpProtocolHandler(
    overrides: Partial<McpProtocolDependencies> = {}
): McpProtocolHandler {
    const dependencies: McpProtocolDependencies = {
        serverInfo: overrides.serverInfo ?? { name: MCP_SERVER_NAME, version: '0.0.0' },
        instructions: overrides.instructions ?? MCP_DEFAULT_INSTRUCTIONS,
        listTools: overrides.listTools ?? listMcpTools,
        callTool: overrides.callTool ?? executeMcpTool
    }

    /** tools/call 处理（未知工具按 Invalid Params 返回 JSON-RPC error） */
    async function handleToolsCall(
        id: string | number | null,
        params: unknown
    ): Promise<JsonRpcResponse> {
        if (!isRecord(params)) {
            return errorResponse(
                id,
                JSON_RPC_ERROR_CODES.INVALID_PARAMS,
                'tools/call 参数必须是对象：{ name: string, arguments?: object }'
            )
        }
        const name = params.name
        if (typeof name !== 'string' || name.trim().length === 0) {
            return errorResponse(
                id,
                JSON_RPC_ERROR_CODES.INVALID_PARAMS,
                'tools/call 缺少合法工具名（params.name）'
            )
        }
        if (!isMcpToolName(name)) {
            return errorResponse(
                id,
                JSON_RPC_ERROR_CODES.INVALID_PARAMS,
                `未知工具：${name}（可用工具见 tools/list）`
            )
        }
        const args = params.arguments
        if (args !== undefined && args !== null && !isRecord(args)) {
            return errorResponse(
                id,
                JSON_RPC_ERROR_CODES.INVALID_PARAMS,
                'tools/call 的 params.arguments 必须是 JSON 对象'
            )
        }
        const result = await dependencies.callTool(name, args)
        return successResponse(id, result)
    }

    return {
        async handle(request: unknown): Promise<JsonRpcResponse | null> {
            if (!isRecord(request)) {
                return errorResponse(
                    null,
                    JSON_RPC_ERROR_CODES.INVALID_REQUEST,
                    'JSON-RPC 请求必须是对象（不支持批量数组/空值）'
                )
            }
            // 通知（无 id）不返回响应体；错误通知同样不回写，避免客户端等待超时
            const isNotification = request.id === undefined
            const rawId = request.id
            const id: string | number | null =
                typeof rawId === 'string' || typeof rawId === 'number' ? rawId : null
            // MCP 客户端固定发 '2.0'；这里兼容缺省（不因版本字段缺失直接拒绝连接）
            if (request.jsonrpc !== undefined && request.jsonrpc !== '2.0') {
                return isNotification
                    ? null
                    : errorResponse(
                          id,
                          JSON_RPC_ERROR_CODES.INVALID_REQUEST,
                          'jsonrpc 必须为 "2.0"'
                      )
            }
            const method = request.method
            if (typeof method !== 'string' || method.length === 0) {
                return isNotification
                    ? null
                    : errorResponse(
                          id,
                          JSON_RPC_ERROR_CODES.INVALID_REQUEST,
                          'JSON-RPC 请求缺少合法 method'
                      )
            }
            const params = request.params
            try {
                if (method.startsWith('notifications/')) {
                    // initialized / cancelled / progress 等通知：无需响应（transport 回 202）
                    return null
                }
                switch (method) {
                    case 'initialize': {
                        const requested = readRequestedProtocolVersion(params)
                        const protocolVersion = negotiateProtocolVersion(requested)
                        logger.info(
                            `[MCP] initialize：client=${readClientName(params)} / protocolVersion=${protocolVersion}`
                        )
                        return successResponse(id, {
                            protocolVersion,
                            capabilities: { tools: { listChanged: false } },
                            serverInfo: dependencies.serverInfo,
                            instructions: dependencies.instructions
                        })
                    }
                    case 'ping':
                        return successResponse(id, {})
                    case 'tools/list':
                        return successResponse(id, { tools: dependencies.listTools() })
                    case 'tools/call':
                        return await handleToolsCall(id, params)
                    default:
                        if (isNotification) {
                            return null
                        }
                        return errorResponse(
                            id,
                            JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND,
                            `未知方法：${method}`
                        )
                }
            } catch (error) {
                logger.error('[MCP] JSON-RPC 请求处理异常：', method, error)
                if (isNotification) {
                    return null
                }
                return errorResponse(
                    id,
                    JSON_RPC_ERROR_CODES.INTERNAL_ERROR,
                    'MCP 请求处理内部错误'
                )
            }
        }
    }
}
