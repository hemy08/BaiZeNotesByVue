/**
 * AS-9：远程图表外发阻断（src/main/utils/remote-resource-guard.ts）单元测试
 *
 * 覆盖：
 * - shouldBlockRemoteResource：plantuml.com 及其子域命中阻断，其他 https 资源放行；
 * - getRemoteResourceBlockFilterUrls：webRequest 过滤模式覆盖主域与子域；
 * - registerRemoteResourceGuard：注册 onBeforeRequest、命中请求 callback({cancel:true})、
 *   非命中请求放行；幂等（重复注册返回 false）；session/webRequest 缺失时安全降级。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
    BLOCKED_REMOTE_RESOURCE_HOSTS,
    getRemoteResourceBlockFilterUrls,
    registerRemoteResourceGuard,
    resetRemoteResourceGuardForTesting,
    shouldBlockRemoteResource,
    type BeforeRequestDetailsLike,
    type SessionLike
} from '../../src/main/utils/remote-resource-guard'

/** 构造可捕获注册结果的 session 桩 */
function makeSession() {
    const registration: {
        filter: { urls: string[] } | null
        listener:
            | ((
                  details: BeforeRequestDetailsLike,
                  callback: (response: { cancel?: boolean }) => void
              ) => void)
            | null
    } = { filter: null, listener: null }
    const session: SessionLike = {
        webRequest: {
            onBeforeRequest: (filter, listener) => {
                registration.filter = filter
                registration.listener = listener
            }
        }
    }
    return { session, registration }
}

describe('AS-9 shouldBlockRemoteResource', () => {
    it('should block plantuml.com and all of its subdomains', () => {
        for (const url of [
            'https://plantuml.com/plantuml/svg/abc',
            'https://www.plantuml.com/plantuml/svg/abc',
            'http://www.plantuml.com/plantuml/png/abc',
            'https://PLANTUML.COM/plantuml/svg/abc',
            'https://sub.plantuml.com/x'
        ]) {
            expect(shouldBlockRemoteResource(url), url).toBe(true)
        }
    })

    it('should allow other remote resources', () => {
        for (const url of [
            'https://example.com/image.png',
            'https://notplantuml.com/x',
            'https://plantuml.com.evil.example/x',
            'https://evil.example/plantuml.com/x',
            'data:image/png;base64,AAAA',
            'file:///C:/tmp/a.png'
        ]) {
            expect(shouldBlockRemoteResource(url), url).toBe(false)
        }
    })

    it('should tolerate invalid / non-string inputs', () => {
        for (const input of [undefined, null, 42, '', 'not a url']) {
            expect(shouldBlockRemoteResource(input), String(input)).toBe(false)
        }
    })

    it('should expose an Electron webRequest filter covering host and subdomains', () => {
        const urls = getRemoteResourceBlockFilterUrls()
        expect(BLOCKED_REMOTE_RESOURCE_HOSTS).toEqual(['plantuml.com'])
        expect(urls).toContain('*://plantuml.com/*')
        expect(urls).toContain('*://*.plantuml.com/*')
    })
})

describe('AS-9 registerRemoteResourceGuard', () => {
    beforeEach(() => {
        resetRemoteResourceGuardForTesting()
        vi.spyOn(console, 'warn').mockImplementation(() => {})
    })

    it('should register an onBeforeRequest listener with the block filter', () => {
        const { session, registration } = makeSession()

        expect(registerRemoteResourceGuard(session)).toBe(true)
        expect(registration.filter?.urls).toContain('*://*.plantuml.com/*')
        expect(typeof registration.listener).toBe('function')
    })

    it('should cancel blocked requests and allow other requests', () => {
        const { session, registration } = makeSession()
        registerRemoteResourceGuard(session)

        const blockedCallback = vi.fn()
        registration.listener?.(
            { url: 'https://www.plantuml.com/plantuml/svg/abc', resourceType: 'image' },
            blockedCallback
        )
        expect(blockedCallback).toHaveBeenCalledWith({ cancel: true })

        const allowedCallback = vi.fn()
        registration.listener?.({ url: 'https://example.com/a.png' }, allowedCallback)
        expect(allowedCallback).toHaveBeenCalledWith({})
    })

    it('should be idempotent (second registration returns false)', () => {
        const first = makeSession()
        expect(registerRemoteResourceGuard(first.session)).toBe(true)

        const second = makeSession()
        expect(registerRemoteResourceGuard(second.session)).toBe(false)
        expect(second.registration.listener).toBeNull()
    })

    it('should safely skip when the session/webRequest is unavailable', () => {
        expect(registerRemoteResourceGuard(null)).toBe(false)
        expect(registerRemoteResourceGuard(undefined)).toBe(false)
        expect(registerRemoteResourceGuard({} as SessionLike)).toBe(false)
        expect(console.warn).toHaveBeenCalled()
    })

    it('should not throw when onBeforeRequest throws', () => {
        const broken: SessionLike = {
            webRequest: {
                onBeforeRequest: () => {
                    throw new Error('webRequest unavailable')
                }
            }
        }
        expect(registerRemoteResourceGuard(broken)).toBe(false)
        expect(console.warn).toHaveBeenCalled()
    })
})
