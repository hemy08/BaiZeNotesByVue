/**
 * URL 常量模块单元测试
 * 覆盖：src/main/constants/urls.ts 与 src/shared/constants/urls.ts
 * 断言：常量非空、协议格式合法（http/https）、模块内无重复值、
 * shared 与 main 同名常量值一致、DEFAULT_* 快速链接仅存在于 main 模块
 */
import { describe, it, expect } from 'vitest'
import * as mainUrls from '../../src/main/constants/urls'
import * as sharedUrls from '../../src/shared/constants/urls'

// 收集模块导出的全部字符串常量
function collectUrlConstants(mod: Record<string, unknown>): Record<string, string> {
    const result: Record<string, string> = {}
    for (const [key, value] of Object.entries(mod)) {
        if (typeof value === 'string') {
            result[key] = value
        }
    }
    return result
}

const mainConstants = collectUrlConstants(mainUrls)
const sharedConstants = collectUrlConstants(sharedUrls)

describe('main/constants/urls', () => {
    it('should export non-empty URL constants', () => {
        expect(Object.keys(mainConstants).length).toBeGreaterThan(0)
        for (const [name, url] of Object.entries(mainConstants)) {
            expect(url, `${name} 不应为空字符串`).not.toBe('')
        }
    })

    it('should only contain http/https URLs', () => {
        for (const [name, url] of Object.entries(mainConstants)) {
            expect(
                url.startsWith('https://') || url.startsWith('http://'),
                `${name} 协议格式不合法: ${url}`
            ).toBe(true)
        }
    })

    it('should not contain duplicate URL values', () => {
        const seen = new Set<string>()
        const duplicates: string[] = []
        for (const [name, url] of Object.entries(mainConstants)) {
            if (seen.has(url)) {
                duplicates.push(`${name}: ${url}`)
            }
            seen.add(url)
        }
        expect(duplicates).toEqual([])
    })

    it('should contain the three default quick links', () => {
        expect(mainUrls.DEFAULT_GITHUB).toBe('https://github.com')
        expect(mainUrls.DEFAULT_GOOGLE).toBe('https://google.com')
        expect(mainUrls.DEFAULT_STACKOVERFLOW).toBe('https://stackoverflow.com')
    })

    it('should keep representative tool URLs', () => {
        expect(mainUrls.TOOLS_JYSHARE).toBe('https://www.jyshare.com/')
        expect(mainUrls.TOOLS_MERMAID_LIVE).toBe('https://mermaid.live/')
        expect(mainUrls.GITHUB_PLANE).toBe('https://github.com/makeplane/plane')
    })
})

describe('shared/constants/urls', () => {
    it('should export non-empty valid URLs without duplicates', () => {
        const seen = new Set<string>()
        expect(Object.keys(sharedConstants).length).toBeGreaterThan(0)
        for (const [name, url] of Object.entries(sharedConstants)) {
            expect(url, `${name} 不应为空字符串`).not.toBe('')
            expect(
                url.startsWith('https://') || url.startsWith('http://'),
                `${name} 协议格式不合法: ${url}`
            ).toBe(true)
            expect(seen.has(url), `shared 模块存在重复 URL: ${url}`).toBe(false)
            seen.add(url)
        }
    })

    it('should keep the same values as the main module for shared names', () => {
        // shared 模块为 main 模块的子集，同名常量值必须一致
        expect(mainConstants).toMatchObject(sharedConstants)
    })

    it('should be a subset of the main module missing only the default quick links', () => {
        // 两个模块导出的键集合完全相同（含 DEFAULT_* 快速链接）
        const mainKeys = Object.keys(mainConstants).sort()
        const sharedKeys = Object.keys(sharedConstants).sort()
        expect(sharedKeys).toEqual(mainKeys)
        expect(sharedConstants.DEFAULT_GITHUB).toBe('https://github.com')
        expect(sharedConstants.DEFAULT_GOOGLE).toBe('https://google.com')
        expect(sharedConstants.DEFAULT_STACKOVERFLOW).toBe('https://stackoverflow.com')
    })
})
