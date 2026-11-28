/**
 * 1.5.7 LLM Wiki L2：MCP 鉴权纯函数单测（`src/main/mcp/auth.ts`）
 *
 * 覆盖：
 * 1. 令牌生成：每次随机、长度 64 hex（≥32 字节）、形态匹配、两次不同；
 * 2. Authorization 头解析：Bearer 大小写/空白/数组头/非法形态；
 * 3. 令牌恒定时间比较：正确通过、错误/长度不同/空/null 一律拒绝；
 * 4. Host 校验（防 DNS rebinding）：回环地址放行，其它域名/带端口的回环/无 Host 口径；
 * 5. Origin 判定（浏览器请求拒绝依据）。
 */
import { describe, it, expect } from 'vitest'
import {
    generateMcpToken,
    hasBrowserOrigin,
    isAllowedMcpHost,
    isMcpTokenValid,
    MCP_TOKEN_BYTES,
    MCP_TOKEN_PATTERN,
    parseBearerAuthorization
} from '../../src/main/mcp/auth'

describe('generateMcpToken', () => {
    it('生成 64 位小写十六进制令牌（32 字节随机）', () => {
        const token = generateMcpToken()
        expect(token).toMatch(MCP_TOKEN_PATTERN)
        expect(token).toHaveLength(MCP_TOKEN_BYTES * 2)
    })

    it('每次生成都不同（会话级随机，不落盘）', () => {
        const tokens = new Set(Array.from({ length: 20 }, () => generateMcpToken()))
        expect(tokens.size).toBe(20)
    })
})

describe('parseBearerAuthorization', () => {
    it('解析标准 Bearer 头（大小写与前后空白不敏感）', () => {
        expect(parseBearerAuthorization('Bearer abc123')).toBe('abc123')
        expect(parseBearerAuthorization('bearer   abc_-.=~+/')).toBe('abc_-.=~+/')
        expect(parseBearerAuthorization('  BEARER token-value  ')).toBe('token-value')
    })

    it('数组头取第一项（Node 可能给出 string[]）', () => {
        expect(parseBearerAuthorization(['Bearer token-a', 'Bearer token-b'])).toBe('token-a')
    })

    it('缺失/非法形态返回 null', () => {
        for (const header of [
            undefined,
            null,
            '',
            'Bearer',
            'Bearer ',
            'Basic dXNlcjpwYXNz',
            'Token abc',
            123,
            {}
        ] as unknown as (string | string[] | undefined)[]) {
            expect(parseBearerAuthorization(header), String(header)).toBeNull()
        }
    })

    it('超长令牌（>512 字符）不解析，避免异常头占用', () => {
        expect(parseBearerAuthorization(`Bearer ${'a'.repeat(513)}`)).toBeNull()
    })
})

describe('isMcpTokenValid（恒定时间比较）', () => {
    const token = generateMcpToken()

    it('相同令牌通过', () => {
        expect(isMcpTokenValid(token, token)).toBe(true)
    })

    it('不同令牌/长度不同/空值/null 一律拒绝', () => {
        expect(isMcpTokenValid(generateMcpToken(), token)).toBe(false)
        expect(isMcpTokenValid(token.slice(0, -1), token)).toBe(false)
        expect(isMcpTokenValid(`${token}0`, token)).toBe(false)
        expect(isMcpTokenValid('', token)).toBe(false)
        expect(isMcpTokenValid(null, token)).toBe(false)
        expect(isMcpTokenValid(undefined, token)).toBe(false)
        expect(isMcpTokenValid(token, '')).toBe(false)
        expect(isMcpTokenValid(token, null)).toBe(false)
        expect(isMcpTokenValid(token.toUpperCase(), token)).toBe(false)
    })
})

describe('isAllowedMcpHost（防 DNS rebinding）', () => {
    it('放行回环地址（带/不带端口）', () => {
        for (const host of [
            '127.0.0.1',
            '127.0.0.1:3847',
            'localhost',
            'LOCALHOST:3847',
            '[::1]',
            '[::1]:3847'
        ]) {
            expect(isAllowedMcpHost(host as string | undefined), String(host)).toBe(true)
        }
        // 无 Host 头（HTTP/1.0 客户端）按允许处理：鉴权仍由 Bearer token 兜底
        expect(isAllowedMcpHost(undefined)).toBe(true)
    })

    it('拒绝非回环 Host（攻击者域名解析到 127.0.0.1 的 rebinding 场景）', () => {
        for (const host of [
            'evil.example.com',
            'evil.example.com:3847',
            '192.168.1.10:3847',
            '127.0.0.1.evil.example',
            'localhost.evil.example',
            ''
        ]) {
            expect(isAllowedMcpHost(host), host).toBe(false)
        }
    })
})

describe('hasBrowserOrigin', () => {
    it('存在 Origin 头视为浏览器请求（应拒绝）', () => {
        expect(hasBrowserOrigin('http://evil.example')).toBe(true)
        expect(hasBrowserOrigin(['null'])).toBe(true)
        expect(hasBrowserOrigin(undefined)).toBe(false)
        expect(hasBrowserOrigin('')).toBe(false)
    })
})
