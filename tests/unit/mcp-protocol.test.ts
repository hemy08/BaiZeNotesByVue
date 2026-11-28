/**
 * 1.5.7 LLM Wiki L2：MCP JSON-RPC 协议层单测（`src/main/mcp/protocol.ts`）
 *
 * 覆盖：
 * 1. initialize：协议版本协商/回显、capabilities（仅 tools）、serverInfo、instructions；
 * 2. 通知（notifications/initialized）返回 null（HTTP 层回 202）；
 * 3. ping / tools/list / tools/call 正常路径（tools/call 注入替身，验证参数透传）；
 * 4. JSON-RPC 错误：未知方法 -32601、未知工具/非法参数 -32602、非对象请求 -32600、
 *    jsonrpc 版本非法 -32600、内部异常 -32603；
 * 5. 默认依赖：未注入时 tools/list 返回真实 7 个只读工具定义。
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock('electron', () => ({
    BrowserWindow: class {},
    shell: {}
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import {
    createMcpProtocolHandler,
    JSON_RPC_ERROR_CODES,
    type McpProtocolDependencies
} from '../../src/main/mcp/protocol'
import { MCP_DEFAULT_PROTOCOL_VERSION, MCP_SERVER_NAME } from '../../src/main/mcp/constants'
import type { McpToolDefinition } from '../../src/main/mcp/tools'

/** 假的单工具定义（协议层单测不关心真实工具清单） */
const FAKE_TOOL: McpToolDefinition = {
    name: 'search_wiki',
    title: 'Search wiki',
    description: 'fake',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false }
}

/** 构造注入替身的协议处理器 */
function createHandler(overrides: Partial<McpProtocolDependencies> = {}) {
    const listTools = vi.fn(() => [FAKE_TOOL])
    const callTool = vi.fn(async () => ({
        content: [{ type: 'text' as const, text: '{"ok":true}' }]
    }))
    const handler = createMcpProtocolHandler({
        serverInfo: { name: 'baize-test', version: '9.9.9' },
        instructions: 'test instructions',
        listTools,
        callTool,
        ...overrides
    })
    return { handler, listTools, callTool }
}

/** 构造 JSON-RPC 请求体 */
function rpc(method: string, params?: unknown, id: string | number = 1) {
    return { jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }
}

describe('MCP protocol：initialize', () => {
    it('回显受支持的客户端协议版本，返回 tools 能力/serverInfo/instructions', async () => {
        const { handler } = createHandler()
        const response = await handler.handle(
            rpc('initialize', {
                protocolVersion: '2025-03-26',
                capabilities: {},
                clientInfo: { name: 'vitest-client', version: '1.0.0' }
            })
        )
        expect(response).not.toBeNull()
        expect(response!.id).toBe(1)
        expect(response!.error).toBeUndefined()
        expect(response!.result).toEqual({
            protocolVersion: '2025-03-26',
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'baize-test', version: '9.9.9' },
            instructions: 'test instructions'
        })
    })

    it('客户端请求 2025-06-18 时同样回显（JSON 响应模式兼容）', async () => {
        const { handler } = createHandler()
        const response = await handler.handle(
            rpc('initialize', { protocolVersion: '2025-06-18' }, 'init-2')
        )
        expect(response!.id).toBe('init-2')
        expect((response!.result as { protocolVersion: string }).protocolVersion).toBe('2025-06-18')
    })

    it('未知/缺失协议版本回落默认版本（客户端仍可完成握手）', async () => {
        const { handler } = createHandler()
        for (const params of [{ protocolVersion: '2024-11-05' }, {}, undefined]) {
            const response = await handler.handle(rpc('initialize', params, 7))
            expect((response!.result as { protocolVersion: string }).protocolVersion).toBe(
                MCP_DEFAULT_PROTOCOL_VERSION
            )
        }
    })
})

describe('MCP protocol：通知与心跳', () => {
    it('notifications/initialized 等通知不返回响应体（HTTP 层 202）', async () => {
        const { handler } = createHandler()
        const request = { jsonrpc: '2.0', method: 'notifications/initialized' }
        await expect(handler.handle(request)).resolves.toBeNull()
        await expect(
            handler.handle({ jsonrpc: '2.0', method: 'notifications/anything' })
        ).resolves.toBeNull()
    })

    it('未知方法的「通知」同样不返回响应（避免客户端等待超时）', async () => {
        const { handler } = createHandler()
        await expect(
            handler.handle({ jsonrpc: '2.0', method: 'unknown/notification' })
        ).resolves.toBeNull()
    })

    it('ping 返回空结果', async () => {
        const { handler } = createHandler()
        const response = await handler.handle(rpc('ping'))
        expect(response!.result).toEqual({})
    })
})

describe('MCP protocol：tools/list 与 tools/call', () => {
    it('tools/list 返回注入的工具清单', async () => {
        const { handler, listTools } = createHandler()
        const response = await handler.handle(rpc('tools/list'))
        expect(listTools).toHaveBeenCalledTimes(1)
        expect(response!.result).toEqual({ tools: [FAKE_TOOL] })
    })

    it('tools/call 透传工具名与参数并返回工具结果', async () => {
        const { handler, callTool } = createHandler()
        const response = await handler.handle(
            rpc('tools/call', { name: 'search_wiki', arguments: { query: 'LLM' } })
        )
        expect(callTool).toHaveBeenCalledWith('search_wiki', { query: 'LLM' })
        expect(response!.result).toEqual({ content: [{ type: 'text', text: '{"ok":true}' }] })
    })

    it('tools/call 参数省略 arguments 时传 undefined（工具自行按空对象处理）', async () => {
        const { handler, callTool } = createHandler()
        await handler.handle(rpc('tools/call', { name: 'search_wiki' }))
        expect(callTool).toHaveBeenCalledWith('search_wiki', undefined)
    })

    it('未知工具按 JSON-RPC Invalid Params 返回（不调用工具实现）', async () => {
        const { handler, callTool } = createHandler()
        const response = await handler.handle(
            rpc('tools/call', { name: 'ingest_raw', arguments: {} })
        )
        expect(callTool).not.toHaveBeenCalled()
        expect(response!.error?.code).toBe(JSON_RPC_ERROR_CODES.INVALID_PARAMS)
        expect(response!.error?.message).toContain('ingest_raw')
    })

    it('tools/call 缺少工具名 / arguments 非对象 → Invalid Params', async () => {
        const { handler, callTool } = createHandler()
        for (const params of [
            undefined,
            {},
            { name: '' },
            { name: 42 },
            { name: 'search_wiki', arguments: 'x' }
        ]) {
            const response = await handler.handle(rpc('tools/call', params, 3))
            expect(response!.error?.code, JSON.stringify(params)).toBe(
                JSON_RPC_ERROR_CODES.INVALID_PARAMS
            )
        }
        expect(callTool).not.toHaveBeenCalled()
    })

    it('工具实现抛异常 → Internal error（不向客户端泄漏堆栈）', async () => {
        const callTool = vi.fn(async () => {
            throw new Error('boom')
        })
        const { handler } = createHandler({ callTool })
        const response = await handler.handle(rpc('tools/call', { name: 'search_wiki' }))
        expect(response!.error?.code).toBe(JSON_RPC_ERROR_CODES.INTERNAL_ERROR)
        expect(response!.error?.message).not.toContain('boom')
    })
})

describe('MCP protocol：请求合法性', () => {
    it('未知方法返回 -32601 Method Not Found', async () => {
        const { handler } = createHandler()
        const response = await handler.handle(rpc('resources/list', {}))
        expect(response!.error?.code).toBe(JSON_RPC_ERROR_CODES.METHOD_NOT_FOUND)
        expect(response!.error?.message).toContain('resources/list')
    })

    it('非对象请求（null/数组/字符串）返回 -32600 且 id=null', async () => {
        const { handler } = createHandler()
        for (const request of [null, [], 'x', 42]) {
            const response = await handler.handle(request)
            expect(response).not.toBeNull()
            expect(response!.id).toBeNull()
            expect(response!.error?.code).toBe(JSON_RPC_ERROR_CODES.INVALID_REQUEST)
        }
    })

    it('缺少 method / jsonrpc 版本非法 返回 -32600', async () => {
        const { handler } = createHandler()
        const missingMethod = await handler.handle({ jsonrpc: '2.0', id: 5 })
        expect(missingMethod!.error?.code).toBe(JSON_RPC_ERROR_CODES.INVALID_REQUEST)

        const badVersion = await handler.handle({ jsonrpc: '1.0', id: 6, method: 'ping' })
        expect(badVersion!.error?.code).toBe(JSON_RPC_ERROR_CODES.INVALID_REQUEST)
    })

    it('数字 id 0 与字符串 id 原样回写', async () => {
        const { handler } = createHandler()
        const zero = await handler.handle(rpc('ping', undefined, 0))
        expect(zero!.id).toBe(0)
        const stringId = await handler.handle(rpc('ping', undefined, 'req-abc'))
        expect(stringId!.id).toBe('req-abc')
    })
})

describe('MCP protocol：默认依赖（真实 7 个只读工具）', () => {
    it('未注入 listTools 时 tools/list 返回 7 个只读工具且 serverInfo 默认名合法', async () => {
        const handler = createMcpProtocolHandler()
        const response = await handler.handle(rpc('tools/list'))
        const tools = (response!.result as { tools: McpToolDefinition[] }).tools
        expect(tools).toHaveLength(7)
        expect(tools.map((tool) => tool.name)).toEqual([
            'search_wiki',
            'read_page',
            'list_pages',
            'read_schema',
            'list_tags',
            'get_backlinks',
            'read_raw'
        ])

        const init = await handler.handle(rpc('initialize', { protocolVersion: '2025-03-26' }))
        expect((init!.result as { serverInfo: { name: string } }).serverInfo.name).toBe(
            MCP_SERVER_NAME
        )
    })
})
