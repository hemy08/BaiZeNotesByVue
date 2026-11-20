/**
 * app:// 协议主进程 handler 单测（2026-11-20 renderer file:// → app:// 迁移）
 *
 * 覆盖范围（安全边界为核心）：
 * 1. 请求解析：renderer/plantuml 根内资源、app://local 白名单文件、未知宿主；
 * 2. 目录穿越/越权拒绝（403）、未知宿主（404）、非 app://（400）；
 * 3. handler 响应：GET 200 + Content-Type、HEAD 无响应体、非 GET/HEAD 405、文件缺失 404、
 *    本地文件白名单拒绝 403；
 * 4. 协议特权/handler 注册（幂等 + 参数契约）。
 *
 * electron 与 logger 均以轻量桩替换（不启动真实 Electron）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

const protocolMock = vi.hoisted(() => ({
    registerSchemesAsPrivileged: vi.fn(),
    handle: vi.fn()
}))

vi.mock('electron', () => ({ protocol: protocolMock }))
vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import {
    createAppProtocolRequestHandler,
    registerAppProtocolHandlers,
    registerAppProtocolSchemes,
    resetAppProtocolRegistrationForTesting,
    resolveAppProtocolRequest
} from '../../src/main/protocol/app-protocol'
import { localPathToAppLocalUrl } from '../../src/shared/protocol/app-protocol'
import { isPathWithin } from '../../src/shared/utils/path'

/** 允许全部本地路径的桩（renderer/plantuml 测试不经过本地白名单） */
const allowAllLocal = (): boolean => true
/** 拒绝全部本地路径的桩 */
const denyAllLocal = (): boolean => false

let tempRoot = ''
let rendererRoot = ''
let plantumlRoot = ''
let localRoot = ''
let localPngPath = ''

/** 读取响应体文本（HEAD 的 200 响应无响应体） */
async function readBodyText(response: Response): Promise<string> {
    return await response.text()
}

beforeEach(() => {
    resetAppProtocolRegistrationForTesting()
    protocolMock.registerSchemesAsPrivileged.mockClear()
    protocolMock.handle.mockClear()

    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-app-proto-'))
    rendererRoot = path.join(tempRoot, 'renderer')
    plantumlRoot = path.join(tempRoot, 'plantuml')
    localRoot = path.join(tempRoot, 'local')
    fs.mkdirSync(path.join(rendererRoot, 'assets'), { recursive: true })
    fs.mkdirSync(plantumlRoot, { recursive: true })
    fs.mkdirSync(localRoot, { recursive: true })
    fs.writeFileSync(path.join(rendererRoot, 'index.html'), '<!doctype html><div>baize</div>')
    fs.writeFileSync(path.join(rendererRoot, 'assets', 'app.js'), 'console.log(1)')
    fs.writeFileSync(path.join(rendererRoot, 'assets', '中文 名称.txt'), '中文资源')
    fs.writeFileSync(path.join(plantumlRoot, 'index.html'), '<!doctype html><div>plantuml</div>')
    localPngPath = path.join(localRoot, 'pic.png')
    fs.writeFileSync(localPngPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
    fs.writeFileSync(path.join(localRoot, 'notes.md'), '# notes')
})

afterEach(() => {
    resetAppProtocolRegistrationForTesting()
    fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('resolveAppProtocolRequest（请求解析与安全边界）', () => {
    const roots = () => ({ rendererRoot, plantumlRoot })

    it('renderer 根内资源解析为绝对路径', () => {
        const result = resolveAppProtocolRequest('app://baize/index.html', roots(), allowAllLocal)
        expect(result).toEqual({ ok: true, filePath: path.resolve(rendererRoot, 'index.html') })

        const asset = resolveAppProtocolRequest('app://baize/assets/app.js', roots(), allowAllLocal)
        expect(asset.ok).toBe(true)
        if (asset.ok) {
            expect(asset.filePath).toBe(path.resolve(rendererRoot, 'assets', 'app.js'))
        }
    })

    it('plantuml 宿主映射自身根目录；未配置时 404', () => {
        const result = resolveAppProtocolRequest(
            'app://plantuml/index.html',
            roots(),
            allowAllLocal
        )
        expect(result.ok).toBe(true)
        const missing = resolveAppProtocolRequest(
            'app://plantuml/index.html',
            { rendererRoot, plantumlRoot: null },
            allowAllLocal
        )
        expect(missing).toEqual({ ok: false, status: 404, reason: expect.any(String) })
    })

    it('目录穿越：URL 归一化后仍限制在根内，反斜杠/盘符变体 403', () => {
        // WHATWG URL 会先归一化 `..` 段（含 %2e 编码形态）：解析结果仍落在 renderer 根内，
        // 不会越界读取；最终是否 200 由文件存在性决定（不存在 → 404）。
        const normalized = resolveAppProtocolRequest(
            'app://baize/%2e%2e/%2e%2e/package.json',
            roots(),
            allowAllLocal
        )
        expect(normalized.ok).toBe(true)
        if (normalized.ok) {
            expect(
                isPathWithin(normalized.filePath, rendererRoot, {
                    win32CaseInsensitive: process.platform === 'win32'
                })
            ).toBe(true)
        }
        // 非 special scheme 不做反斜杠归一化：解码后 `..` 段由 pathname 解析拒绝（403）
        for (const url of [
            'app://baize/..\\package.json',
            'app://baize/assets/..\\..\\package.json'
        ]) {
            expect(resolveAppProtocolRequest(url, roots(), allowAllLocal), url).toMatchObject({
                ok: false,
                status: 403
            })
        }
        // 明文 `..` 段被 URL 归一化折叠到根内（不会越界）
        const collapsed = resolveAppProtocolRequest(
            'app://baize/assets/../../../../../../package.json',
            roots(),
            allowAllLocal
        )
        expect(collapsed.ok).toBe(true)
        if (collapsed.ok) {
            expect(
                isPathWithin(collapsed.filePath, rendererRoot, {
                    win32CaseInsensitive: process.platform === 'win32'
                })
            ).toBe(true)
        }
        // 盘符形态段含冒号 → 直接拒绝
        expect(
            resolveAppProtocolRequest('app://baize/C:/Windows/win.ini', roots(), allowAllLocal)
        ).toMatchObject({ ok: false, status: 403 })
    })

    it('未知宿主 404、非法/非 app:// URL 400', () => {
        expect(
            resolveAppProtocolRequest('app://unknown/index.html', roots(), allowAllLocal)
        ).toMatchObject({ ok: false, status: 404 })
        expect(resolveAppProtocolRequest('not-a-url', roots(), allowAllLocal)).toMatchObject({
            ok: false,
            status: 400
        })
        expect(
            resolveAppProtocolRequest('https://example.com/index.html', roots(), allowAllLocal)
        ).toMatchObject({ ok: false, status: 400 })
    })

    it('app://local：白名单通过时返回归一化绝对路径，拒绝时 403', () => {
        const url = localPathToAppLocalUrl(localPngPath)
        const allowed = resolveAppProtocolRequest(
            url,
            roots(),
            (candidate) => candidate === path.normalize(localPngPath)
        )
        expect(allowed).toEqual({ ok: true, filePath: path.normalize(localPngPath) })

        expect(resolveAppProtocolRequest(url, roots(), denyAllLocal)).toMatchObject({
            ok: false,
            status: 403
        })
    })

    it('app://local 解码失败 400；白名单拒绝 403', () => {
        expect(
            resolveAppProtocolRequest('app://local/%E0%A4%A', roots(), allowAllLocal)
        ).toMatchObject({ ok: false, status: 400 })
        expect(
            resolveAppProtocolRequest('app://local/relative.md', roots(), denyAllLocal)
        ).toMatchObject({ ok: false, status: 403 })
    })
})

describe('createAppProtocolRequestHandler（响应构造）', () => {
    const createHandler = (
        isLocalPathAllowed: (candidatePath: string) => boolean = allowAllLocal
    ) => createAppProtocolRequestHandler({ rendererRoot, plantumlRoot }, { isLocalPathAllowed })

    it('GET 200 + Content-Type + 响应体；HEAD 无响应体但带 Content-Length', async () => {
        const handler = createHandler()
        const getResponse = await handler(new Request('app://baize/assets/app.js'))
        expect(getResponse.status).toBe(200)
        expect(getResponse.headers.get('content-type')).toContain('text/javascript')
        expect(await readBodyText(getResponse)).toBe('console.log(1)')

        const headResponse = await handler(
            new Request('app://baize/assets/app.js', { method: 'HEAD' })
        )
        expect(headResponse.status).toBe(200)
        expect(headResponse.headers.get('content-length')).toBe('14')
        expect(await readBodyText(headResponse)).toBe('')
    })

    it('中文/空格文件名经百分号编码后可正确读取', async () => {
        const handler = createHandler()
        const url = `app://baize/assets/${encodeURIComponent('中文 名称.txt')}`
        const response = await handler(new Request(url))
        expect(response.status).toBe(200)
        expect(await readBodyText(response)).toBe('中文资源')
    })

    it('文件缺失 404、非 GET/HEAD 405、穿越 403（不读文件系统）', async () => {
        const handler = createHandler()
        expect((await handler(new Request('app://baize/assets/missing.js'))).status).toBe(404)
        expect(
            (await handler(new Request('app://baize/assets/app.js', { method: 'POST' }))).status
        ).toBe(405)
        // 反斜杠上跳不经过 URL 归一化，进入 pathname 解析后被拒绝
        expect((await handler(new Request('app://baize/assets/..\\..\\package.json'))).status).toBe(
            403
        )
    })

    it('app://local：白名单文件 200，越权 403', async () => {
        const url = localPathToAppLocalUrl(localPngPath)
        const allowedHandler = createHandler(
            (candidate) => candidate === path.normalize(localPngPath)
        )
        const response = await allowedHandler(new Request(url))
        expect(response.status).toBe(200)
        expect(response.headers.get('content-type')).toBe('image/png')
        expect((await response.arrayBuffer()).byteLength).toBe(4)

        const deniedHandler = createHandler(denyAllLocal)
        expect((await deniedHandler(new Request(url))).status).toBe(403)
    })

    it('非法请求 URL（handler 直接入参）400', async () => {
        const handler = createHandler()
        const response = await handler({ method: 'GET', url: 'not-a-url' } as unknown as Request)
        expect(response.status).toBe(400)
    })
})

describe('协议特权/handler 注册', () => {
    it('registerAppProtocolSchemes 注册 standard/secure/supportFetchAPI 特权且幂等', () => {
        registerAppProtocolSchemes()
        expect(protocolMock.registerSchemesAsPrivileged).toHaveBeenCalledTimes(1)
        expect(protocolMock.registerSchemesAsPrivileged).toHaveBeenCalledWith([
            {
                scheme: 'app',
                privileges: expect.objectContaining({
                    standard: true,
                    secure: true,
                    supportFetchAPI: true,
                    corsEnabled: true
                })
            }
        ])
        // 幂等：重复调用不再注册
        registerAppProtocolSchemes()
        expect(protocolMock.registerSchemesAsPrivileged).toHaveBeenCalledTimes(1)
    })

    it('registerAppProtocolHandlers 以 app scheme 注册 handler 且幂等', () => {
        expect(registerAppProtocolHandlers({ rendererRoot }, allowAllLocal)).toBe(true)
        expect(protocolMock.handle).toHaveBeenCalledTimes(1)
        expect(protocolMock.handle.mock.calls[0][0]).toBe('app')
        expect(typeof protocolMock.handle.mock.calls[0][1]).toBe('function')
        expect(registerAppProtocolHandlers({ rendererRoot }, allowAllLocal)).toBe(false)
        expect(protocolMock.handle).toHaveBeenCalledTimes(1)
    })
})
