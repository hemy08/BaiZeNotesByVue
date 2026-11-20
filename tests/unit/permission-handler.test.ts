/**
 * src/main/utils/permission-handler.ts 单元测试（P2-1：Web 权限请求/检查处理器）
 *
 * 覆盖：
 * - 默认拒绝：摄像头/麦克风/地理定位/通知/屏幕捕获等一律 false；
 * - 主窗口本地受信页面（file: renderer/index.html、dev http://localhost）按需放行
 *   fullscreen / clipboard-read / clipboard-sanitized-write；
 * - 在线网页窗口（非主窗口 webContents）即使 URL 看似受信也拒绝；
 * - 主窗口 URL 非受信来源（https/自定义协议/空 URL）拒绝；
 * - 子框架（details.isMainFrame === false）、null webContents、已销毁窗口拒绝；
 * - 注册：幂等、session 缺失/方法缺失安全跳过、deny 时回调一次 false、日志告警；
 * - 判定异常（getURL 抛错）按拒绝处理且不向外抛异常。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as path from 'path'
import { pathToFileURL } from 'url'

vi.mock('electron', () => ({
    shell: { openExternal: vi.fn() },
    BrowserWindow: class {}
}))

const loggerMocks = vi.hoisted(() => ({ warn: vi.fn() }))

vi.mock('../../src/main/utils/logger', () => ({
    logger: {
        warn: loggerMocks.warn
    }
}))

import {
    ALLOWED_APP_PERMISSIONS,
    isTrustedAppPermission,
    registerPermissionHandlers,
    resetPermissionHandlersForTesting,
    type PermissionCheckHandlerLike,
    type PermissionHandlerOptions,
    type PermissionRequestHandlerLike,
    type PermissionWebContentsLike
} from '../../src/main/utils/permission-handler'
import { getAppContext, resetAppContext } from '../../src/main/app-context'

const RENDERER_INDEX_PATH = path.join(process.cwd(), 'src', 'renderer', 'index.html')
const RENDERER_INDEX_URL = pathToFileURL(RENDERER_INDEX_PATH).href
const DEV_URL = 'http://localhost:5173/'
const OPTIONS: PermissionHandlerOptions = {
    rendererIndexPath: RENDERER_INDEX_PATH,
    devUrl: null
}

function makeContents(
    getURL: () => string,
    overrides: Partial<PermissionWebContentsLike> = {}
): PermissionWebContentsLike {
    return {
        getURL,
        isDestroyed: () => false,
        ...overrides
    }
}

/** 把 webContents 装成当前主窗口（AppContext.mainWindow） */
function setMainWindowContents(contents: PermissionWebContentsLike | null): void {
    if (contents === null) {
        getAppContext().mainWindow = null
        return
    }
    getAppContext().mainWindow = {
        isDestroyed: () => false,
        webContents: contents
    } as never
}

function makeSession(): {
    session: {
        setPermissionRequestHandler: (handler: PermissionRequestHandlerLike) => void
        setPermissionCheckHandler: (handler: PermissionCheckHandlerLike) => void
    }
    getRequestHandler: () => PermissionRequestHandlerLike | null
    getCheckHandler: () => PermissionCheckHandlerLike | null
} {
    let requestHandler: PermissionRequestHandlerLike | null = null
    let checkHandler: PermissionCheckHandlerLike | null = null
    return {
        session: {
            setPermissionRequestHandler: (handler) => {
                requestHandler = handler
            },
            setPermissionCheckHandler: (handler) => {
                checkHandler = handler
            }
        },
        getRequestHandler: () => requestHandler,
        getCheckHandler: () => checkHandler
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    resetAppContext()
    resetPermissionHandlersForTesting()
    setMainWindowContents(makeContents(() => RENDERER_INDEX_URL))
})

afterEach(() => {
    resetAppContext()
    resetPermissionHandlersForTesting()
})

describe('ALLOWED_APP_PERMISSIONS', () => {
    it('should only whitelist non-invasive permissions', () => {
        expect([...ALLOWED_APP_PERMISSIONS].sort()).toEqual([
            'clipboard-read',
            'clipboard-sanitized-write',
            'fullscreen'
        ])
        for (const denied of [
            'media',
            'geolocation',
            'notifications',
            'display-capture',
            'pointerLock',
            'hid',
            'serial',
            'usb',
            'openExternal',
            'fileSystem',
            'unknown'
        ]) {
            expect(ALLOWED_APP_PERMISSIONS.has(denied)).toBe(false)
        }
    })
})

describe('isTrustedAppPermission', () => {
    it('should allow safe permissions for the main window local renderer page', () => {
        const contents = makeContents(() => RENDERER_INDEX_URL)
        setMainWindowContents(contents)
        for (const permission of ALLOWED_APP_PERMISSIONS) {
            expect(
                isTrustedAppPermission(contents, permission, { isMainFrame: true }, OPTIONS)
            ).toBe(true)
        }
    })

    it('should allow safe permissions for the dev server origin when devUrl is provided', () => {
        const contents = makeContents(() => `${DEV_URL}index.html`)
        setMainWindowContents(contents)
        const options = { rendererIndexPath: RENDERER_INDEX_PATH, devUrl: DEV_URL }
        expect(isTrustedAppPermission(contents, 'fullscreen', { isMainFrame: true }, options)).toBe(
            true
        )
        // 同源但不同端口不属于 dev server
        const otherPort = makeContents(() => 'http://localhost:6000/')
        setMainWindowContents(otherPort)
        expect(
            isTrustedAppPermission(otherPort, 'fullscreen', { isMainFrame: true }, options)
        ).toBe(false)
    })

    it('should deny every permission when the main window URL is not a trusted app origin', () => {
        for (const url of [
            'https://evil.example.com/',
            'http://localhost:5173.evil.example.com/',
            'file:///C:/Users/public/evil.html',
            'javascript:alert(1)',
            'data:text/html,<script>alert(1)</script>',
            ''
        ]) {
            const contents = makeContents(() => url)
            setMainWindowContents(contents)
            for (const permission of ALLOWED_APP_PERMISSIONS) {
                expect(
                    isTrustedAppPermission(contents, permission, { isMainFrame: true }, OPTIONS),
                    `不应放行 ${permission} @ ${url}`
                ).toBe(false)
            }
        }
    })

    it('should deny invasive permissions even for the trusted main window page', () => {
        const contents = makeContents(() => RENDERER_INDEX_URL)
        setMainWindowContents(contents)
        for (const permission of [
            'media',
            'geolocation',
            'notifications',
            'display-capture',
            'pointerLock',
            'openExternal',
            'unknown'
        ]) {
            expect(
                isTrustedAppPermission(contents, permission, { isMainFrame: true }, OPTIONS)
            ).toBe(false)
        }
    })

    it('should deny permissions for non-main-window contents (online web page window)', () => {
        const mainContents = makeContents(() => RENDERER_INDEX_URL)
        setMainWindowContents(mainContents)
        const onlineWindowContents = makeContents(() => 'https://example.com/')
        for (const permission of ALLOWED_APP_PERMISSIONS) {
            expect(
                isTrustedAppPermission(
                    onlineWindowContents,
                    permission,
                    { isMainFrame: true },
                    OPTIONS
                )
            ).toBe(false)
        }
        // 即使 URL 与主窗口完全一致，只要 webContents 不是主窗口也拒绝（身份校验优先）
        const lookalikeContents = makeContents(() => RENDERER_INDEX_URL)
        expect(
            isTrustedAppPermission(lookalikeContents, 'fullscreen', { isMainFrame: true }, OPTIONS)
        ).toBe(false)
    })

    it('should deny permissions requested by sub frames', () => {
        const contents = makeContents(() => RENDERER_INDEX_URL)
        setMainWindowContents(contents)
        expect(
            isTrustedAppPermission(contents, 'fullscreen', { isMainFrame: false }, OPTIONS)
        ).toBe(false)
    })

    it('should deny when the main window is missing/destroyed or the frame has no contents', () => {
        const contents = makeContents(() => RENDERER_INDEX_URL)
        setMainWindowContents(null)
        expect(isTrustedAppPermission(contents, 'fullscreen', { isMainFrame: true }, OPTIONS)).toBe(
            false
        )

        getAppContext().mainWindow = {
            isDestroyed: () => true,
            webContents: contents
        } as never
        expect(isTrustedAppPermission(contents, 'fullscreen', { isMainFrame: true }, OPTIONS)).toBe(
            false
        )

        expect(isTrustedAppPermission(null, 'fullscreen', { isMainFrame: true }, OPTIONS)).toBe(
            false
        )
    })

    it('should deny (not throw) when getURL throws', () => {
        const contents = makeContents(() => {
            throw new Error('webContents destroyed')
        })
        setMainWindowContents(contents)
        expect(isTrustedAppPermission(contents, 'fullscreen', { isMainFrame: true }, OPTIONS)).toBe(
            false
        )
    })
})

describe('registerPermissionHandlers', () => {
    it('should install both handlers once and be idempotent', () => {
        const { session, getRequestHandler, getCheckHandler } = makeSession()
        expect(registerPermissionHandlers(session, OPTIONS)).toBe(true)
        expect(getRequestHandler()).toBeTypeOf('function')
        expect(getCheckHandler()).toBeTypeOf('function')
        // 幂等：重复注册不覆盖 handler
        expect(registerPermissionHandlers(session, OPTIONS)).toBe(false)
    })

    it('should deny default/invasive permission requests via the request handler', () => {
        const { session, getRequestHandler } = makeSession()
        registerPermissionHandlers(session, OPTIONS)
        const requestHandler = getRequestHandler()!
        const contents = makeContents(() => RENDERER_INDEX_URL)
        setMainWindowContents(contents)

        const callback = vi.fn()
        requestHandler(contents, 'media', callback, { isMainFrame: true })
        expect(callback).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenCalledWith(false)
        expect(loggerMocks.warn).toHaveBeenCalledWith(
            expect.stringContaining('已拒绝 Web 权限请求')
        )
    })

    it('should allow whitelisted permission requests from the main window page', () => {
        const { session, getRequestHandler } = makeSession()
        registerPermissionHandlers(session, OPTIONS)
        const requestHandler = getRequestHandler()!
        const contents = makeContents(() => RENDERER_INDEX_URL)
        setMainWindowContents(contents)

        const callback = vi.fn()
        requestHandler(contents, 'clipboard-read', callback, { isMainFrame: true })
        expect(callback).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenCalledWith(true)
        expect(loggerMocks.warn).not.toHaveBeenCalled()
    })

    it('should answer permission checks consistently with the request handler', () => {
        const { session, getCheckHandler } = makeSession()
        registerPermissionHandlers(session, OPTIONS)
        const checkHandler = getCheckHandler()!
        const contents = makeContents(() => RENDERER_INDEX_URL)
        setMainWindowContents(contents)

        expect(checkHandler(contents, 'fullscreen', 'file://', { isMainFrame: true })).toBe(true)
        expect(checkHandler(contents, 'media', 'file://', { isMainFrame: true })).toBe(false)
        expect(checkHandler(null, 'fullscreen', 'file://', { isMainFrame: true })).toBe(false)
    })

    it('should always invoke the request callback even when the handler throws', () => {
        const { session, getRequestHandler } = makeSession()
        registerPermissionHandlers(session, OPTIONS)
        const requestHandler = getRequestHandler()!
        const contents = makeContents(() => {
            throw new Error('boom')
        })
        setMainWindowContents(contents)

        const callback = vi.fn()
        requestHandler(contents, 'fullscreen', callback, { isMainFrame: true })
        expect(callback).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenCalledWith(false)
    })

    it('should invoke session setters with the session object as receiver', () => {
        // 回归：打包产物中 Session 方法依赖 this 指向 session，解构后裸调用会抛
        // "Illegal invocation: Function must be called on an object of type Session"
        const receivers: unknown[] = []
        const session = {
            setPermissionRequestHandler(this: unknown, _handler: PermissionRequestHandlerLike) {
                void _handler
                receivers.push(this)
            },
            setPermissionCheckHandler(this: unknown, _handler: PermissionCheckHandlerLike) {
                void _handler
                receivers.push(this)
            }
        }
        expect(registerPermissionHandlers(session as never, OPTIONS)).toBe(true)
        expect(receivers).toEqual([session, session])
    })

    it('should safely skip when the session or its permission APIs are unavailable', () => {
        expect(registerPermissionHandlers(null, OPTIONS)).toBe(false)
        expect(registerPermissionHandlers(undefined, OPTIONS)).toBe(false)
        expect(
            registerPermissionHandlers({ setPermissionRequestHandler: vi.fn() } as never, OPTIONS)
        ).toBe(false)
        expect(loggerMocks.warn).toHaveBeenCalledWith(
            expect.stringContaining('Web 权限处理器未注册')
        )
        // 未注册时不应误标 registered：后续合法 session 仍可注册
        resetPermissionHandlersForTesting()
        const { session } = makeSession()
        expect(registerPermissionHandlers(session, OPTIONS)).toBe(true)
    })
})
