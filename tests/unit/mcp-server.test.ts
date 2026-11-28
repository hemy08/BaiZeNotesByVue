/**
 * 1.5.7 LLM Wiki L2：MCP HTTP 传输单测（`src/main/mcp/server.ts`）
 *
 * 覆盖（对应任务验收「server 启停（随机端口/状态）」「token 校验 401」）：
 * 1. 生命周期：start 只绑定 127.0.0.1、自动选端口、token 随机生成、URL/toolCount 正确；
 *    重复 start 幂等；stop 清空 token/端口；start→stop→start 生成不同 token；
 * 2. 鉴权：缺失/错误 Bearer token → 401（WWW-Authenticate）；正确 token 通过；
 * 3. MCP 协议端到端：initialize（含 Mcp-Session-Id 头）/tools/list（7 个只读工具）/
 *    ping/tools/call（无工作区时工具级 isError 结果）/notifications（202 空体）；
 * 4. JSON-RPC 错误：未知方法 -32601、未知工具 -32602、非法 JSON -32700（HTTP 400）；
 * 5. 传输边界：非 application/json → 415；GET → 405（SSE 未实现）；DELETE → 204；
 *    错误路径 → 404；带 Origin → 403；Host 非回环 → 403；请求体超限 → 413；
 * 6. 端口占用：候选端口被占用时回退（下一个/系统分配），状态返回实际端口。
 *
 * 说明：使用 Node 内置 http 客户端直连 127.0.0.1，不依赖 fetch/Electron。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as http from 'http'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'

vi.mock('electron', () => ({
    BrowserWindow: class {},
    shell: {}
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import { McpHttpServer } from '../../src/main/mcp/server'
import { MCP_TOKEN_PATTERN } from '../../src/main/mcp/auth'
import { invalidateMcpWorkspaceCache } from '../../src/main/mcp/tools'
import { appState } from '../../src/main/utils/app-state'

/** 一次 HTTP 响应 */
interface TestHttpResponse {
    status: number
    headers: http.IncomingHttpHeaders
    body: string
}

/** 发起本机 HTTP 请求（测试客户端） */
function request(options: {
    port: number
    method?: string
    path?: string
    headers?: http.OutgoingHttpHeaders
    body?: string
}): Promise<TestHttpResponse> {
    return new Promise((resolve, reject) => {
        let settled = false
        const req = http.request(
            {
                host: '127.0.0.1',
                port: options.port,
                method: options.method ?? 'GET',
                path: options.path ?? '/mcp',
                headers: options.headers ?? {}
            },
            (res) => {
                const chunks: Buffer[] = []
                res.on('data', (chunk: Buffer) => chunks.push(chunk))
                res.on('end', () => {
                    settled = true
                    resolve({
                        status: res.statusCode ?? 0,
                        headers: res.headers,
                        body: Buffer.concat(chunks).toString('utf8')
                    })
                })
            }
        )
        req.on('error', (error) => {
            if (!settled) {
                reject(error)
            }
        })
        if (typeof options.body === 'string') {
            req.write(options.body)
        }
        req.end()
    })
}

/** JSON-RPC 请求体 */
function rpcBody(method: string, params?: unknown, id: string | number = 1): string {
    return JSON.stringify({
        jsonrpc: '2.0',
        id,
        method,
        ...(params === undefined ? {} : { params })
    })
}

/** 带鉴权的标准 JSON 请求头 */
function authHeaders(
    token: string,
    extra: http.OutgoingHttpHeaders = {}
): http.OutgoingHttpHeaders {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...extra }
}

let server: McpHttpServer
let status: Awaited<ReturnType<McpHttpServer['start']>>

beforeEach(async () => {
    appState._resetForTesting()
    server = new McpHttpServer({ preferredPorts: [0] })
    status = await server.start({ version: '1.5.7-test' })
})

afterEach(async () => {
    await server.stop()
    appState._resetForTesting()
})

describe('启动/停止与状态', () => {
    it('start 返回运行状态：127.0.0.1 随机端口 + 32 字节 hex token + 7 个只读工具', () => {
        expect(status.running).toBe(true)
        expect(status.enabled).toBe(true)
        expect(status.port).toBeGreaterThan(0)
        expect(status.token).toMatch(MCP_TOKEN_PATTERN)
        expect(status.url).toBe(`http://127.0.0.1:${status.port}/mcp`)
        expect(status.toolCount).toBe(7)
        // 状态查询与 start 返回同源实时值
        expect(server.getStatus()).toEqual(status)
    })

    it('重复 start 幂等（不换端口/token）', async () => {
        const again = await server.start({ version: '1.5.7-test' })
        expect(again.port).toBe(status.port)
        expect(again.token).toBe(status.token)
    })

    it('并发 start 串行化（设置页连点不会产生并发 listen）', async () => {
        const [first, second] = await Promise.all([
            server.start({ version: '1.5.7-test' }),
            server.start({ version: '1.5.7-test' })
        ])
        expect(first.port).toBe(second.port)
        expect(first.token).toBe(second.token)
    })

    it('stop 清空 token/端口；start→stop→start 生成全新 token 且端口可复用', async () => {
        await server.stop()
        const stopped = server.getStatus()
        expect(stopped).toEqual({
            enabled: false,
            running: false,
            port: 0,
            token: '',
            url: '',
            toolCount: 7
        })
        // 停止后旧端口不再监听
        await expect(request({ port: status.port })).rejects.toThrow()

        const restarted = await server.start({ version: '1.5.7-test' })
        expect(restarted.token).not.toBe(status.token)
        expect(restarted.running).toBe(true)
    })

    it('候选端口被占用时回退到下一个/系统分配端口（仍只绑定 127.0.0.1）', async () => {
        // 先占用一个端口
        const occupied = net.createServer()
        const occupiedPort: number = await new Promise((resolve, reject) => {
            occupied.once('error', reject)
            occupied.listen(0, '127.0.0.1', () => {
                const address = occupied.address()
                resolve(typeof address === 'object' && address !== null ? address.port : 0)
            })
        })
        const fallbackServer = new McpHttpServer({ preferredPorts: [occupiedPort, 0] })
        try {
            const fallbackStatus = await fallbackServer.start({ version: '1.5.7-test' })
            expect(fallbackStatus.port).toBeGreaterThan(0)
            expect(fallbackStatus.port).not.toBe(occupiedPort)
            // 回退后的端口可正常响应鉴权请求
            const response = await request({
                port: fallbackStatus.port,
                method: 'POST',
                headers: authHeaders(fallbackStatus.token),
                body: rpcBody('ping')
            })
            expect(response.status).toBe(200)
        } finally {
            await fallbackServer.stop()
            await new Promise<void>((resolve) => occupied.close(() => resolve()))
        }
    })
})

describe('鉴权（Bearer token）', () => {
    it('缺少 Authorization → 401 + WWW-Authenticate', async () => {
        const response = await request({
            port: status.port,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: rpcBody('ping')
        })
        expect(response.status).toBe(401)
        expect(response.headers['www-authenticate']).toContain('Bearer')
    })

    it('错误 token / 错误方案 → 401', async () => {
        for (const authorization of [
            'Bearer 0000000000000000000000000000000000000000000000000000000000000000',
            `Basic ${status.token}`,
            'Bearer'
        ]) {
            const response = await request({
                port: status.port,
                method: 'POST',
                headers: { Authorization: authorization, 'Content-Type': 'application/json' },
                body: rpcBody('ping')
            })
            expect(response.status, authorization).toBe(401)
        }
    })

    it('正确 token → 200（服务停止后旧 token 立即失效）', async () => {
        const ok = await request({
            port: status.port,
            method: 'POST',
            headers: authHeaders(status.token),
            body: rpcBody('ping')
        })
        expect(ok.status).toBe(200)
        await server.stop()
        await expect(
            request({
                port: status.port,
                method: 'POST',
                headers: authHeaders(status.token),
                body: rpcBody('ping')
            })
        ).rejects.toThrow()
    })
})

describe('MCP 协议端到端', () => {
    it('initialize：返回协议版本/能力/serverInfo，并携带 Mcp-Session-Id 头', async () => {
        const response = await request({
            port: status.port,
            method: 'POST',
            headers: authHeaders(status.token),
            body: rpcBody('initialize', {
                protocolVersion: '2025-03-26',
                clientInfo: { name: 'vitest', version: '1.0.0' }
            })
        })
        expect(response.status).toBe(200)
        expect(response.headers['content-type']).toContain('application/json')
        expect(response.headers['cache-control']).toBe('no-store')
        expect(response.headers['mcp-session-id']).toBeDefined()
        const payload = JSON.parse(response.body) as {
            result: {
                protocolVersion: string
                capabilities: { tools: unknown }
                serverInfo: { name: string; version: string }
            }
        }
        expect(payload.result.protocolVersion).toBe('2025-03-26')
        expect(payload.result.capabilities.tools).toBeDefined()
        expect(payload.result.serverInfo.version).toBe('1.5.7-test')
    })

    it('tools/list：返回 7 个只读工具（无写工具）', async () => {
        const response = await request({
            port: status.port,
            method: 'POST',
            headers: authHeaders(status.token),
            body: rpcBody('tools/list')
        })
        const payload = JSON.parse(response.body) as {
            result: { tools: Array<{ name: string; inputSchema: { type: string } }> }
        }
        expect(payload.result.tools).toHaveLength(7)
        expect(payload.result.tools.map((tool) => tool.name)).toEqual([
            'search_wiki',
            'read_page',
            'list_pages',
            'read_schema',
            'list_tags',
            'get_backlinks',
            'read_raw'
        ])
        for (const tool of payload.result.tools) {
            expect(tool.inputSchema.type).toBe('object')
        }
    })

    it('ping 返回空结果', async () => {
        const response = await request({
            port: status.port,
            method: 'POST',
            headers: authHeaders(status.token),
            body: rpcBody('ping')
        })
        expect(JSON.parse(response.body)).toEqual({ jsonrpc: '2.0', id: 1, result: {} })
    })

    it('tools/call：无工作区时返回工具级 isError 结果（不是 JSON-RPC error）', async () => {
        const response = await request({
            port: status.port,
            method: 'POST',
            headers: authHeaders(status.token),
            body: rpcBody('tools/call', { name: 'search_wiki', arguments: { query: 'x' } })
        })
        expect(response.status).toBe(200)
        const payload = JSON.parse(response.body) as {
            result: { isError?: boolean; content: Array<{ text: string }> }
        }
        expect(payload.result.isError).toBe(true)
        const content = JSON.parse(payload.result.content[0].text) as Record<string, unknown>
        expect(content.ok).toBe(false)
        expect(content.code).toBe('NO_WORKSPACE')
    })

    it('tools/call 端到端：真实工作区下 search_wiki / read_page 只读可用（PoC）', async () => {
        const workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-mcp-http-'))
        try {
            fs.mkdirSync(path.join(workspaceRoot, 'wiki'), { recursive: true })
            fs.writeFileSync(
                path.join(workspaceRoot, 'wiki', 'hello.md'),
                [
                    '---',
                    'title: Hello',
                    'tags: [demo]',
                    '---',
                    '',
                    '# Hello',
                    '',
                    'needle over http',
                    ''
                ].join('\n'),
                'utf-8'
            )
            appState.rootPath = workspaceRoot
            invalidateMcpWorkspaceCache()

            const searchResponse = await request({
                port: status.port,
                method: 'POST',
                headers: authHeaders(status.token),
                body: rpcBody('tools/call', {
                    name: 'search_wiki',
                    arguments: { query: 'needle over http' }
                })
            })
            const searchPayload = JSON.parse(searchResponse.body) as {
                result: { isError?: boolean; content: Array<{ text: string }> }
            }
            expect(searchPayload.result.isError).toBeUndefined()
            const searchContent = JSON.parse(searchPayload.result.content[0].text) as {
                ok: boolean
                total: number
                results: Array<{ path: string }>
            }
            expect(searchContent.ok).toBe(true)
            expect(searchContent.total).toBe(1)
            expect(searchContent.results[0].path).toBe('wiki/hello.md')

            const readResponse = await request({
                port: status.port,
                method: 'POST',
                headers: authHeaders(status.token),
                body: rpcBody('tools/call', {
                    name: 'read_page',
                    arguments: { path: 'wiki/hello.md' }
                })
            })
            const readPayload = JSON.parse(readResponse.body) as {
                result: { isError?: boolean; content: Array<{ text: string }> }
            }
            expect(readPayload.result.isError).toBeUndefined()
            const readContent = JSON.parse(readPayload.result.content[0].text) as {
                ok: boolean
                title: string
                content: string
            }
            expect(readContent.ok).toBe(true)
            expect(readContent.title).toBe('Hello')
            expect(readContent.content).toContain('needle over http')
        } finally {
            appState.rootPath = ''
            invalidateMcpWorkspaceCache()
            fs.rmSync(workspaceRoot, { recursive: true, force: true, maxRetries: 3 })
        }
    })

    it('notifications/initialized 回 202 且无响应体', async () => {
        const response = await request({
            port: status.port,
            method: 'POST',
            headers: authHeaders(status.token),
            body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
        })
        expect(response.status).toBe(202)
        expect(response.body).toBe('')
    })

    it('未知方法 → JSON-RPC -32601；未知工具 → -32602', async () => {
        const unknownMethod = await request({
            port: status.port,
            method: 'POST',
            headers: authHeaders(status.token),
            body: rpcBody('resources/list', {})
        })
        expect(JSON.parse(unknownMethod.body).error.code).toBe(-32601)

        const unknownTool = await request({
            port: status.port,
            method: 'POST',
            headers: authHeaders(status.token),
            body: rpcBody('tools/call', { name: 'ingest_raw', arguments: {} })
        })
        expect(JSON.parse(unknownTool.body).error.code).toBe(-32602)
    })

    it('非法 JSON → HTTP 400 + JSON-RPC -32700', async () => {
        const response = await request({
            port: status.port,
            method: 'POST',
            headers: authHeaders(status.token),
            body: '{ not json'
        })
        expect(response.status).toBe(400)
        expect(JSON.parse(response.body).error.code).toBe(-32700)
    })
})

describe('传输安全边界', () => {
    it('非 application/json 请求体 → 415', async () => {
        const response = await request({
            port: status.port,
            method: 'POST',
            headers: { Authorization: `Bearer ${status.token}`, 'Content-Type': 'text/plain' },
            body: 'hello'
        })
        expect(response.status).toBe(415)
    })

    it('GET（SSE 未实现）→ 405 且 Allow 仅 POST/DELETE', async () => {
        const response = await request({
            port: status.port,
            method: 'GET',
            headers: { Authorization: `Bearer ${status.token}` }
        })
        expect(response.status).toBe(405)
        expect(response.headers.allow).toBe('POST, DELETE')
    })

    it('DELETE 会话结束 → 204（无状态会话）', async () => {
        const response = await request({
            port: status.port,
            method: 'DELETE',
            headers: { Authorization: `Bearer ${status.token}` }
        })
        expect(response.status).toBe(204)
    })

    it('未知路径 → 404', async () => {
        const response = await request({
            port: status.port,
            method: 'POST',
            path: '/other',
            headers: authHeaders(status.token),
            body: rpcBody('ping')
        })
        expect(response.status).toBe(404)
    })

    it('带 Origin（浏览器）→ 403（不提供 CORS 放行）', async () => {
        const response = await request({
            port: status.port,
            method: 'POST',
            headers: authHeaders(status.token, { Origin: 'http://evil.example' }),
            body: rpcBody('ping')
        })
        expect(response.status).toBe(403)
    })

    it('Host 非回环（DNS rebinding）→ 403', async () => {
        const response = await request({
            port: status.port,
            method: 'POST',
            headers: authHeaders(status.token, { Host: 'evil.example.com' }),
            body: rpcBody('ping')
        })
        expect(response.status).toBe(403)
    })

    it('请求体超过上限 → 413（在读取正文前按 Content-Length 拒绝）', async () => {
        const smallLimitServer = new McpHttpServer({
            preferredPorts: [0],
            maxRequestBodyBytes: 128
        })
        try {
            const smallStatus = await smallLimitServer.start({ version: '1.5.7-test' })
            const oversizedBody = rpcBody('ping', { pad: 'x'.repeat(256) })
            const response = await request({
                port: smallStatus.port,
                method: 'POST',
                headers: authHeaders(smallStatus.token, {
                    'Content-Length': String(Buffer.byteLength(oversizedBody))
                }),
                body: oversizedBody
            })
            expect(response.status).toBe(413)
        } finally {
            await smallLimitServer.stop()
        }
    })
})
