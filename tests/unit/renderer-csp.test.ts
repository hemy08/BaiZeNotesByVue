/**
 * 渲染层 CSP 契约测试（CMP-17 + 2026-11-18 遗留清单 #6）
 *
 * 目的：把 src/renderer/index.html 的 Content-Security-Policy 当契约锁定——
 * 新增/收紧指令必须同步本测试，防止误删关键放行项导致功能回归（本地图片、Monaco worker），
 * 也防止安全收紧被无意回退（object-src/base-uri/form-action）。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'

const ROOT = process.cwd()
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf-8')

function extractCsp(): string {
    const match = INDEX_HTML.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/)
    expect(match, 'index.html 应包含 http-equiv CSP meta').not.toBeNull()
    return match![1]
}

describe('renderer CSP 契约', () => {
    it('should declare the CSP meta with key directives', () => {
        const csp = extractCsp()
        const directives = csp
            .split(';')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => part.split(/\s+/)[0])
        expect(directives).toEqual(
            expect.arrayContaining([
                'default-src',
                'script-src',
                'style-src',
                'img-src',
                'font-src',
                'frame-src',
                'connect-src',
                'worker-src'
            ])
        )
    })

    it('should keep hardening directives added for 遗留清单 #6', () => {
        const csp = extractCsp()
        expect(csp).toContain("object-src 'none'")
        expect(csp).toContain("base-uri 'self'")
        expect(csp).toContain("form-action 'none'")
    })

    it('should keep file: in img-src for local image rendering (FE-12 regression guard)', () => {
        const csp = extractCsp()
        expect(csp).toMatch(/img-src [^;]*\bfile:/)
    })

    it('should keep blob: worker support for Monaco workers', () => {
        const csp = extractCsp()
        expect(csp).toMatch(/worker-src [^;]*\bblob:/)
    })

    it('should allow Monaco eval only via unsafe-eval (移除需实机验证)', () => {
        const csp = extractCsp()
        expect(csp).toMatch(/script-src 'self' 'unsafe-eval'/)
        // 不得出现更宽的 script-src（如 unsafe-inline）
        expect(csp).not.toMatch(/script-src [^;]*unsafe-inline/)
    })

    it('should not allow remote frame sources', () => {
        const csp = extractCsp()
        expect(csp).not.toMatch(/frame-src [^;]*\bhttps?:/)
    })
})
