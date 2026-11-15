/**
 * src/main/renders/plantuml-local.ts 单元测试（PF-08）
 *
 * 覆盖：
 * 1. 源码 hash 稳定性；
 * 2. resources/plantuml 资源定位（开发环境 / 打包环境 / 关键文件缺失降级）；
 * 3. 隐藏窗口渲染成功路径、内容缓存、窗口复用；
 * 4. 渲染失败（error）与 10 秒超时兜底；
 * 5. IPC 注册（通道常量、重复注册幂等、非字符串入参校验）；
 * 6. disposePlantumlLocalWindows 销毁隐藏窗口。
 *
 * 说明：资源定位使用真实临时目录（不 mock fs），只有 electron 被 mock，
 * 因此同时覆盖 getPlantumlPath 的开发/打包双分支与文件存在性检查。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Mock } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

/** BrowserWindow mock 的 executeJavaScript 返回类型固定为 Promise（渲染流程 await） */
type ExecuteJavaScriptMock = Mock<() => Promise<unknown>>
/** setWindowOpenHandler 入参为 Electron 的 window.open 处理器（测试只断言注册与返回值） */
type SetWindowOpenHandler = (handler: (details: { url: string }) => { action: string }) => void

// CMP-30：PlantUML 渲染错误提示经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

const state = vi.hoisted(() => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const windows: MockBrowserWindow[] = []

    class MockBrowserWindow {
        static fromWebContents = vi.fn((): MockBrowserWindow | null => null)
        options: Record<string, unknown>
        destroyed = false
        /** 记录 loadFile 入参 */
        loadFile = vi.fn<(filePath: string) => Promise<void>>((): Promise<void> =>
            Promise.resolve()
        )
        setWindowOpenHandler = vi.fn<SetWindowOpenHandler>()
        executeJavaScript = vi.fn<() => Promise<unknown>>((): Promise<unknown> =>
            Promise.resolve(true)
        )
        private windowListeners = new Map<string, Array<(...args: unknown[]) => void>>()
        private webContentsListeners = new Map<string, Array<(...args: unknown[]) => void>>()
        webContents: {
            executeJavaScript: ExecuteJavaScriptMock
            setWindowOpenHandler: Mock<SetWindowOpenHandler>
            on: (event: string, callback: (...args: unknown[]) => void) => void
            once: (event: string, callback: (...args: unknown[]) => void) => void
            removeListener: (event: string, callback: (...args: unknown[]) => void) => void
        }

        constructor(options: Record<string, unknown>) {
            this.options = options
            this.webContents = {
                executeJavaScript: this.executeJavaScript,
                setWindowOpenHandler: this.setWindowOpenHandler,
                on: (event, callback) => {
                    const list = this.webContentsListeners.get(event) ?? []
                    list.push(callback)
                    this.webContentsListeners.set(event, list)
                },
                once: (event, callback) => {
                    const list = this.webContentsListeners.get(event) ?? []
                    list.push(callback)
                    this.webContentsListeners.set(event, list)
                },
                removeListener: (event, callback) => {
                    const list = this.webContentsListeners.get(event) ?? []
                    const index = list.indexOf(callback)
                    if (index !== -1) {
                        list.splice(index, 1)
                    }
                }
            }
            windows.push(this)
        }

        on(event: string, callback: (...args: unknown[]) => void): void {
            const list = this.windowListeners.get(event) ?? []
            list.push(callback)
            this.windowListeners.set(event, list)
        }

        once(event: string, callback: (...args: unknown[]) => void): void {
            const list = this.windowListeners.get(event) ?? []
            list.push(callback)
            this.windowListeners.set(event, list)
        }

        /** 触发窗口事件（如 closed） */
        emitWindow(event: string): void {
            const list = this.windowListeners.get(event) ?? []
            this.windowListeners.set(event, [])
            list.forEach((callback) => callback())
        }

        /** 触发 webContents 事件（如 did-finish-load / did-fail-load） */
        emitWebContents(event: string, ...args: unknown[]): void {
            const list = this.webContentsListeners.get(event) ?? []
            this.webContentsListeners.set(event, [])
            list.forEach((callback) => callback(...args))
        }

        isDestroyed(): boolean {
            return this.destroyed
        }

        destroy(): void {
            if (this.destroyed) {
                return
            }
            this.destroyed = true
            this.emitWindow('closed')
        }
    }

    return {
        handlers,
        windows,
        MockBrowserWindow,
        appPath: '',
        packaged: false,
        resourcesPath: ''
    }
})

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn(() => ''),
        getAppPath: vi.fn(() => state.appPath),
        get isPackaged() {
            return state.packaged
        }
    },
    BrowserWindow: state.MockBrowserWindow,
    ipcMain: {
        handle: vi.fn(
            (channel: string, listener: (event: unknown, ...args: unknown[]) => unknown) => {
                if (state.handlers.has(channel)) {
                    throw new Error(`Attempted to register a second handler for '${channel}'`)
                }
                state.handlers.set(channel, listener)
            }
        ),
        removeHandler: vi.fn((channel: string) => {
            state.handlers.delete(channel)
        }),
        on: vi.fn(),
        removeListener: vi.fn(),
        listenerCount: vi.fn(() => 0)
    }
}))

import {
    PLANTUML_LOCAL_RENDER_CHANNEL,
    PLANTUML_RENDER_TIMEOUT_MS,
    hashPlantumlSource,
    resolvePlantumlIndexHtmlPath,
    renderPlantumlDiagram,
    registerPlantumlLocalRenderIpc,
    disposePlantumlLocalWindows,
    clearPlantumlRenderCache
} from '../../src/main/renders/plantuml-local'
// AS-6：PlantUML 本地渲染通道补发送方校验，测试需登记受信主窗口并携带匹配的 sender
import { resetTrustedSenderRegistry, setTrustedMainWindow } from '../../src/main/utils/ipc-security'

/** 受信主窗口桩（webContents 引用即 sender 判定依据） */
const trustedWebContents = { id: 4242 }
const trustedMainWindow = {
    webContents: trustedWebContents,
    isDestroyed: () => false
}
const TRUSTED_EVENT = { sender: trustedWebContents }

let tempRoot = ''

/** 在指定目录写入渲染页关键文件（index.html / plantuml.js / viz-global.js） */
function writePlantumlResourceFiles(plantumlDir: string): void {
    fs.mkdirSync(plantumlDir, { recursive: true })
    fs.writeFileSync(
        path.join(plantumlDir, 'index.html'),
        '<!doctype html><html><body><div id="out"></div></body></html>'
    )
    fs.writeFileSync(
        path.join(plantumlDir, 'plantuml.js'),
        'window.plantumlRender = function () {}'
    )
    fs.writeFileSync(path.join(plantumlDir, 'viz-global.js'), 'window.viz = {}')
}

/** 等待若干轮微任务，让渲染队列推进到窗口创建/渲染脚本执行阶段 */
async function flushMicrotasks(times = 6): Promise<void> {
    for (let index = 0; index < times; index += 1) {
        await Promise.resolve()
    }
}

const SAMPLE_SOURCE = '@startuml\nAlice -> Bob : Hello\n@enduml'

beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-plantuml-test-'))
    state.appPath = tempRoot
    state.packaged = false
    state.windows.length = 0
    state.handlers.clear()
    delete (process as { resourcesPath?: string }).resourcesPath
    writePlantumlResourceFiles(path.join(tempRoot, 'resources', 'plantuml'))
    clearPlantumlRenderCache()
    vi.clearAllMocks()
    // AS-6：登记受信主窗口，后续 handler 事件桩携带同一 webContents
    resetTrustedSenderRegistry()
    setTrustedMainWindow(trustedMainWindow as never)
})

afterEach(() => {
    disposePlantumlLocalWindows()
    vi.useRealTimers()
    fs.rmSync(tempRoot, { recursive: true, force: true })
    delete (process as { resourcesPath?: string }).resourcesPath
})

describe('hashPlantumlSource', () => {
    it('should produce a stable sha1 hash for identical source', () => {
        const first = hashPlantumlSource(SAMPLE_SOURCE)
        const second = hashPlantumlSource(SAMPLE_SOURCE)
        expect(first).toBe(second)
        expect(first).toMatch(/^[0-9a-f]{40}$/)
    })

    it('should produce different hashes for different source', () => {
        expect(hashPlantumlSource('@startuml\nA\n@enduml')).not.toBe(
            hashPlantumlSource('@startuml\nB\n@enduml')
        )
    })
})

describe('resolvePlantumlIndexHtmlPath', () => {
    it('should resolve resources/plantuml/index.html in development', () => {
        const result = resolvePlantumlIndexHtmlPath()
        expect(result).toBe(path.join(tempRoot, 'resources', 'plantuml', 'index.html'))
    })

    it('should resolve <resourcesPath>/plantuml/index.html in packaged app', () => {
        state.packaged = true
        state.resourcesPath = tempRoot
        ;(process as { resourcesPath?: string }).resourcesPath = tempRoot
        writePlantumlResourceFiles(path.join(tempRoot, 'plantuml'))

        const result = resolvePlantumlIndexHtmlPath()
        expect(result).toBe(path.join(tempRoot, 'plantuml', 'index.html'))
    })

    it('should return null when a required script is missing (降级远程方案)', () => {
        fs.rmSync(path.join(tempRoot, 'resources', 'plantuml', 'viz-global.js'))
        expect(resolvePlantumlIndexHtmlPath()).toBeNull()
    })
})

describe('renderPlantumlDiagram', () => {
    it('should render svg in a hidden BrowserWindow and return it', async () => {
        const renderPromise = renderPlantumlDiagram(SAMPLE_SOURCE)
        await flushMicrotasks()

        expect(state.windows).toHaveLength(1)
        const win = state.windows[0]
        expect(win.options.show).toBe(false)
        expect(win.loadFile).toHaveBeenCalledTimes(1)
        expect(String(win.loadFile.mock.calls[0][0])).toContain('plantuml')

        // 第一次 executeJavaScript 为"渲染页就绪探测"，第二次才注入源码取 SVG
        win.executeJavaScript
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce({ status: 'ok', svg: '<svg id="plantuml-local">OK</svg>' })
        win.emitWebContents('did-finish-load')

        await expect(renderPromise).resolves.toEqual({
            status: 'ok',
            svg: '<svg id="plantuml-local">OK</svg>'
        })
    })

    it('should serve repeated identical source from cache without re-rendering', async () => {
        const firstPromise = renderPlantumlDiagram(SAMPLE_SOURCE)
        await flushMicrotasks()
        const win = state.windows[0]
        win.executeJavaScript
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce({ status: 'ok', svg: '<svg>CACHED</svg>' })
        win.emitWebContents('did-finish-load')
        await firstPromise

        const second = await renderPlantumlDiagram(SAMPLE_SOURCE)
        expect(second).toEqual({ status: 'ok', svg: '<svg>CACHED</svg>' })
        // 第二次命中缓存：窗口未重建，也没有新的 executeJavaScript 调用
        expect(state.windows).toHaveLength(1)
        expect(win.executeJavaScript).toHaveBeenCalledTimes(2)
    })

    it('should reuse the same hidden window for different sources', async () => {
        const firstPromise = renderPlantumlDiagram(SAMPLE_SOURCE)
        await flushMicrotasks()
        const win = state.windows[0]
        win.executeJavaScript
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce({ status: 'ok', svg: '<svg>FIRST</svg>' })
        win.emitWebContents('did-finish-load')
        await firstPromise

        // 复用已就绪的窗口：不再执行"就绪探测"，直接注入源码渲染
        const secondPromise = renderPlantumlDiagram('@startuml\nA -> B\n@enduml')
        win.executeJavaScript.mockResolvedValueOnce({ status: 'ok', svg: '<svg>SECOND</svg>' })
        await expect(secondPromise).resolves.toEqual({ status: 'ok', svg: '<svg>SECOND</svg>' })

        expect(state.windows).toHaveLength(1)
        expect(win.loadFile).toHaveBeenCalledTimes(1)
    })

    it('should return unavailable and skip window creation when resources are missing', async () => {
        fs.rmSync(path.join(tempRoot, 'resources', 'plantuml', 'plantuml.js'))

        const result = await renderPlantumlDiagram(SAMPLE_SOURCE)
        expect(result.status).toBe('unavailable')
        expect(result.reason).toContain('resources/plantuml')
        expect(state.windows).toHaveLength(0)
    })

    it('should return error when page reports a render failure', async () => {
        const renderPromise = renderPlantumlDiagram(SAMPLE_SOURCE)
        await flushMicrotasks()
        const win = state.windows[0]
        win.executeJavaScript
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce({ status: 'error', message: 'PlantUML 语法错误' })
        win.emitWebContents('did-finish-load')

        const result = await renderPromise
        expect(result.status).toBe('error')
        expect(result.message).toContain('PlantUML 语法错误')
    })

    it('should time out after PLANTUML_RENDER_TIMEOUT_MS and return error', async () => {
        vi.useFakeTimers()
        const renderPromise = renderPlantumlDiagram(SAMPLE_SOURCE)
        await vi.advanceTimersByTimeAsync(0)
        const win = state.windows[0]
        // 就绪探测立即返回 true，真正渲染永不返回，触发 10 秒超时兜底
        win.executeJavaScript
            .mockResolvedValueOnce(true)
            .mockImplementationOnce(() => new Promise<unknown>(() => undefined))
        win.emitWebContents('did-finish-load')

        await vi.advanceTimersByTimeAsync(PLANTUML_RENDER_TIMEOUT_MS + 10)
        const result = await renderPromise
        expect(result.status).toBe('error')
        expect(result.message).toContain('超时')
        // 超时后丢弃隐藏窗口，避免残留的旧渲染污染后续请求
        expect(win.isDestroyed()).toBe(true)
    })
})

describe('registerPlantumlLocalRenderIpc', () => {
    it('should register a handler under the local render channel', () => {
        registerPlantumlLocalRenderIpc()
        expect(state.handlers.has(PLANTUML_LOCAL_RENDER_CHANNEL)).toBe(true)
    })

    it('should be idempotent when registered twice (防重复注册)', () => {
        registerPlantumlLocalRenderIpc()
        registerPlantumlLocalRenderIpc()
        expect(state.handlers.size).toBe(1)
    })

    it('should reject non-string source payload with error status', async () => {
        registerPlantumlLocalRenderIpc()
        const handler = state.handlers.get(PLANTUML_LOCAL_RENDER_CHANNEL)!
        const result = await handler(TRUSTED_EVENT, 123)
        expect(result).toEqual({ status: 'error', message: 'PlantUML 源码参数无效（期望字符串）' })
    })

    it('should return unavailable for string source when resources are missing', async () => {
        fs.rmSync(path.join(tempRoot, 'resources', 'plantuml', 'index.html'))
        registerPlantumlLocalRenderIpc()
        const handler = state.handlers.get(PLANTUML_LOCAL_RENDER_CHANNEL)!
        const result = (await handler(TRUSTED_EVENT, SAMPLE_SOURCE)) as { status: string }
        expect(result.status).toBe('unavailable')
    })

    // AS-6：发送方校验——非主窗口 sender 不触发隐藏窗口渲染
    it('should reject untrusted senders without rendering', async () => {
        const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
        registerPlantumlLocalRenderIpc()
        const handler = state.handlers.get(PLANTUML_LOCAL_RENDER_CHANNEL)!

        const result = await handler({ sender: { id: 999 } }, SAMPLE_SOURCE)

        expect(result).toEqual(expect.objectContaining({ ok: false, code: 'untrusted-sender' }))
        expect(state.windows).toHaveLength(0)
        expect(consoleWarn).toHaveBeenCalled()
        consoleWarn.mockRestore()
    })
})

describe('disposePlantumlLocalWindows', () => {
    it('should destroy the hidden render window and recreate it on next render', async () => {
        const firstPromise = renderPlantumlDiagram(SAMPLE_SOURCE)
        await flushMicrotasks()
        const firstWindow = state.windows[0]
        firstWindow.executeJavaScript
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce({ status: 'ok', svg: '<svg>ONE</svg>' })
        firstWindow.emitWebContents('did-finish-load')
        await firstPromise

        disposePlantumlLocalWindows()
        expect(firstWindow.isDestroyed()).toBe(true)

        const secondPromise = renderPlantumlDiagram('@startuml\nX -> Y\n@enduml')
        await flushMicrotasks()
        expect(state.windows).toHaveLength(2)
        const secondWindow = state.windows[1]
        secondWindow.executeJavaScript
            .mockResolvedValueOnce(true)
            .mockResolvedValueOnce({ status: 'ok', svg: '<svg>TWO</svg>' })
        secondWindow.emitWebContents('did-finish-load')
        await expect(secondPromise).resolves.toEqual({ status: 'ok', svg: '<svg>TWO</svg>' })
    })
})
