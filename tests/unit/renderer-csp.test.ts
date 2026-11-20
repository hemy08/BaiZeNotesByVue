/**
 * 渲染层 CSP 契约测试（CMP-17 + 遗留清单 #6 + P2-4 dev/prod 拆分）
 *
 * 目的：把 src/renderer/index.html 的 Content-Security-Policy 当契约锁定——
 * 新增/收紧指令必须同步本测试，防止误删关键放行项导致功能回归（本地图片、Monaco worker），
 * 也防止安全收紧被无意回退（object-src/base-uri/form-action）。
 *
 * P2-4（2026-11-20）：源 index.html 是「开发口径」CSP（dev server / Monaco 调试链路），
 * 生产构建由 build/renderer-csp.ts 剥离 'unsafe-eval' 与 localhost 放行；
 * 本测试同时锁定两套口径，并验证生产口径自检门禁。
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'fs'
import * as path from 'path'
import {
    applyProductionCsp,
    assertProductionCsp,
    buildProductionCsp,
    DEV_ONLY_DIRECTIVE_TOKENS
} from '../../build/renderer-csp'

const ROOT = process.cwd()
const INDEX_HTML = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf-8')

/** 从 HTML 文本中提取 CSP meta 的 content 值 */
function extractCsp(html: string = INDEX_HTML): string {
    const match = html.match(/http-equiv="Content-Security-Policy"[\s\S]*?content="([^"]+)"/)
    expect(match, 'index.html 应包含 http-equiv CSP meta').not.toBeNull()
    return match![1]
}

const DEV_CSP = extractCsp()
const PRODUCTION_HTML = applyProductionCsp(INDEX_HTML)
const PRODUCTION_CSP = extractCsp(PRODUCTION_HTML)

describe('开发口径 CSP（源 index.html，dev server 使用）', () => {
    it('should declare the CSP meta with key directives', () => {
        const directives = DEV_CSP.split(';')
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
        expect(DEV_CSP).toContain("object-src 'none'")
        expect(DEV_CSP).toContain("form-action 'none'")
        // 2026-11-19：不设 base-uri——HTML 查看器需在 srcdoc 中注入 file:// <base>
        // 修正相对链接（见 html-view-utils.ts），base-uri 'self' 会拦截该注入。
        expect(DEV_CSP).not.toContain('base-uri')
    })

    it('should keep file: in img-src for dev-server local image rendering (FE-12 regression guard)', () => {
        expect(DEV_CSP).toMatch(/img-src [^;]*\bfile:/)
    })

    it('should keep app: scheme for app://local local resources (2026-11-20 file:// → app://)', () => {
        // 生产/构建产物由 app://baize 加载：本地用户文件走 app://local（'self' 只覆盖
        // app://baize），预览本地图片、HTML 查看器相对 CSS/字体需要按 scheme 放行 app:
        expect(DEV_CSP).toMatch(/img-src [^;]*\bapp:/)
        expect(DEV_CSP).toMatch(/style-src [^;]*\bapp:/)
        expect(DEV_CSP).toMatch(/font-src [^;]*\bapp:/)
    })

    it('should keep blob: worker support for Monaco workers', () => {
        expect(DEV_CSP).toMatch(/worker-src [^;]*\bblob:/)
    })

    it('should keep dev-only tokens for the Vite/Monaco development chain', () => {
        // 开发口径保留 unsafe-eval / localhost（生产口径由构建期剥离，见下方用例）
        expect(DEV_CSP).toMatch(/script-src 'self' 'unsafe-eval'/)
        expect(DEV_CSP).toMatch(/connect-src [^;]*http:\/\/localhost:\*/)
        expect(DEV_CSP).toMatch(/connect-src [^;]*ws:\/\/localhost:\*/)
        // 不得出现更宽的 script-src（如 unsafe-inline）
        expect(DEV_CSP).not.toMatch(/script-src [^;]*unsafe-inline/)
    })

    it('should not allow remote or file frame sources (PDF 已改 canvas/srcdoc)', () => {
        expect(DEV_CSP).not.toMatch(/frame-src [^;]*\bhttps?:/)
        expect(DEV_CSP).not.toMatch(/frame-src [^;]*\bfile:/)
    })
})

describe('生产口径 CSP（构建期注入，P2-4）', () => {
    it('should remove dev-only tokens from the built CSP', () => {
        for (const token of Object.values(DEV_ONLY_DIRECTIVE_TOKENS).flat()) {
            expect(PRODUCTION_CSP.split(/\s+/)).not.toContain(token)
        }
        expect(PRODUCTION_CSP).not.toMatch(/unsafe-eval/)
        expect(PRODUCTION_CSP).not.toContain('localhost')
        expect(PRODUCTION_CSP).not.toContain('127.0.0.1')
    })

    it('should keep required self/hardening directives after transformation', () => {
        expect(PRODUCTION_CSP).toMatch(/script-src 'self'(;|$)/)
        expect(PRODUCTION_CSP).toMatch(/connect-src 'self'(;|$)/)
        expect(PRODUCTION_CSP).toContain("object-src 'none'")
        expect(PRODUCTION_CSP).toContain("form-action 'none'")
        expect(PRODUCTION_CSP).toContain("default-src 'self'")
        // 2026-11-20（file:// → app:// 迁移）：本地资源改走 app://local，file: 必须被剥离
        expect(PRODUCTION_CSP).not.toMatch(/\bfile:/)
        expect(PRODUCTION_CSP).toMatch(/img-src [^;]*\bapp:/)
        expect(PRODUCTION_CSP).toMatch(/style-src [^;]*\bapp:/)
        expect(PRODUCTION_CSP).toMatch(/font-src [^;]*\bapp:/)
        expect(PRODUCTION_CSP).toMatch(/worker-src [^;]*\bblob:/)
    })

    it('should keep the CSP meta and the rest of the document intact', () => {
        expect(PRODUCTION_HTML).toContain('http-equiv="Content-Security-Policy"')
        expect(PRODUCTION_HTML.match(/http-equiv="Content-Security-Policy"/g)).toHaveLength(1)
        expect(PRODUCTION_HTML).toContain('<script type="module" src="./src/main.ts"></script>')
        expect(PRODUCTION_HTML).toContain('<div id="app"></div>')
    })

    it('should be idempotent for already-production CSP', () => {
        expect(buildProductionCsp(PRODUCTION_CSP)).toBe(PRODUCTION_CSP)
    })

    it('should fail the build when the CSP meta is missing', () => {
        expect(() => applyProductionCsp('<html><head></head><body></body></html>')).toThrow(
            /缺少 Content-Security-Policy meta/
        )
    })

    it('should fail the production self-check when dev-only tokens remain', () => {
        expect(() => assertProductionCsp(DEV_CSP)).toThrow(/unsafe-eval/)
        expect(() =>
            assertProductionCsp(
                "default-src 'self'; script-src 'self'; connect-src 'self' http://localhost:*"
            )
        ).toThrow(/localhost/)
    })

    it('should fail the production self-check when file: remains (file protocol fuse off)', () => {
        expect(() =>
            assertProductionCsp(
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' app:; img-src 'self' data: https: file: app:; connect-src 'self'; object-src 'none'; form-action 'none'"
            )
        ).toThrow(/file:/)
    })

    it('should fail the production self-check when app: local-resource allowance is missing', () => {
        expect(() =>
            assertProductionCsp(
                "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https:; connect-src 'self'; object-src 'none'; form-action 'none'"
            )
        ).toThrow(/app:/)
    })

    it('should fail the production self-check when hardening directives are missing', () => {
        expect(() =>
            assertProductionCsp(
                "script-src 'self'; style-src 'self' app:; img-src 'self' app:; connect-src 'self'"
            )
        ).toThrow(/object-src/)
    })
})
