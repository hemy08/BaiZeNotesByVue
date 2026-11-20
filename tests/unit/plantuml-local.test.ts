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

// 资源路径异常分支：getPlantumlPath 抛错时 resolvePlantumlIndexHtmlPath 必须降级返回 null。
// 正常用例仍委托真实实现（临时目录 + 真实 fs 检查），只在 flag 打开时抛错。
const appPathsState = vi.hoisted(() => ({ throwOnGetPlantumlPath: false }))

vi.mock('../../src/main/utils/app-paths', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/main/utils/app-paths')>()
    return {
        ...actual,
        getPlantumlPath: () => {
            if (appPathsState.throwOnGetPlantumlPath) {
                throw new Error('模拟 app-paths 异常')
            }
            return actual.getPlantumlPath()
        }
    }
})

const state = vi.hoisted(() => {
    const handlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>()
    const windows: MockBrowserWindow[] = []

    class MockBrowserWindow {
        static fromWebContents = vi.fn((): MockBrowserWindow | null => null)
        options: Record<string, unknown>
        destroyed = false
        /** 记录 loadURL 入参；state.loadURLFailure 非空时模拟加载失败 */
        loadURL = vi.fn<(filePath: string) => Promise<void>>((): Promise<void> =>
            state.loadURLFailure === null ? Promise.resolve() : Promise.reject(state.loadURLFailure)
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
            if (state.destroyThrows) {
                throw new Error('模拟销毁失败')
            }
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
        resourcesPath: '',
        /** 非空时 loadURL 返回 reject（Error 或原始字符串，覆盖异常类型两分支） */
        loadURLFailure: null as Error | string | null,
        /** true 时 MockBrowserWindow.destroy 抛错（覆盖销毁失败 catch 分支） */
        destroyThrows: false
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
    PLANTUML_WINDOW_LOAD_TIMEOUT_MS,
    hashPlantumlSource,
    resolvePlantumlIndexHtmlPath,
    renderPlantumlDiagram,
    registerPlantumlLocalRenderIpc,
    disposePlantumlLocalWindows,
    clearPlantumlRenderCache,
    getLastPlantumlWindowError
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
    state.loadURLFailure = null
    state.destroyThrows = false
    appPathsState.throwOnGetPlantumlPath = false
    delete (process as { resourcesPath?: string }).resourcesPath
    writePlantumlResourceFiles(path.join(tempRoot, 'resources', 'plantuml'))
    clearPlantumlRenderCache()
    vi.clearAllMocks()
    // AS-6：登记受信主窗口，后续 handler 事件桩携带同一 webContents
    resetTrustedSenderRegistry()
    setTrustedMainWindow(trustedMainWindow as never)
})

afterEach(() => {
    state.loadURLFailure = null
    state.destroyThrows = false
    appPathsState.throwOnGetPlantumlPath = false
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
        expect(win.loadURL).toHaveBeenCalledTimes(1)
        expect(String(win.loadURL.mock.calls[0][0])).toBe('app://plantuml/index.html')

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
        expect(win.loadURL).toHaveBeenCalledTimes(1)
    })

    it('should dispose the hidden window after the idle timeout (遗留清单 #13)', async () => {
        vi.useFakeTimers()
        try {
            const renderPromise = renderPlantumlDiagram(SAMPLE_SOURCE)
            await flushMicrotasks()
            const win = state.windows[0]
            win.executeJavaScript
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce({ status: 'ok', svg: '<svg>IDLE</svg>' })
            win.emitWebContents('did-finish-load')
            await expect(renderPromise).resolves.toEqual({
                status: 'ok',
                svg: '<svg>IDLE</svg>'
            })

            // 空闲超时前不销毁；60s 后销毁隐藏窗释放渲染进程资源
            await vi.advanceTimersByTimeAsync(59_000)
            expect(win.destroyed).toBe(false)
            await vi.advanceTimersByTimeAsync(1_000)
            expect(win.destroyed).toBe(true)
        } finally {
            vi.useRealTimers()
        }
    })

    it('should cancel the idle disposal when a new render arrives', async () => {
        vi.useFakeTimers()
        try {
            const firstPromise = renderPlantumlDiagram(SAMPLE_SOURCE)
            await flushMicrotasks()
            const win = state.windows[0]
            win.executeJavaScript
                .mockResolvedValueOnce(true)
                .mockResolvedValueOnce({ status: 'ok', svg: '<svg>FIRST</svg>' })
            win.emitWebContents('did-finish-load')
            await firstPromise

            // 空闲计时进行中发起新渲染：取消销毁并复用窗口
            await vi.advanceTimersByTimeAsync(30_000)
            const secondPromise = renderPlantumlDiagram('@startuml\nA -> C\n@enduml')
            win.executeJavaScript.mockResolvedValueOnce({ status: 'ok', svg: '<svg>SECOND</svg>' })
            await expect(secondPromise).resolves.toEqual({ status: 'ok', svg: '<svg>SECOND</svg>' })
            // 第二次渲染完成后重新计时：30s 尚未到期
            await vi.advanceTimersByTimeAsync(30_000)
            expect(win.destroyed).toBe(false)
        } finally {
            vi.useRealTimers()
        }
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

// ==================== 第二批补测：失败 / 降级 / 清理分支 ====================

/** 启动一次渲染并返回隐藏窗口（首次 executeJavaScript 由用例决定就绪探测结果） */
async function startRender(): Promise<{
    promise: Promise<{ status: string; message?: string }>
    win: InstanceType<typeof state.MockBrowserWindow>
}> {
    const promise = renderPlantumlDiagram(SAMPLE_SOURCE)
    await flushMicrotasks()
    const win = state.windows[state.windows.length - 1]
    return { promise, win }
}

/** 当前仍可复用的隐藏窗口（已创建且未销毁） */
function reusableWindow(): InstanceType<typeof state.MockBrowserWindow> | null {
    for (let index = state.windows.length - 1; index >= 0; index -= 1) {
        if (!state.windows[index].isDestroyed()) {
            return state.windows[index]
        }
    }
    return null
}

/** 完成「就绪探测 + 渲染结果」两步，返回渲染结果 */
async function renderWithPayload(payload: unknown): Promise<{ status: string; message?: string }> {
    const readyWindow = reusableWindow()
    const promise = renderPlantumlDiagram(SAMPLE_SOURCE)
    if (readyWindow) {
        // 复用已就绪窗口：不再执行就绪探测，直接注入渲染结果（mock 需在微任务前挂好）
        readyWindow.executeJavaScript.mockResolvedValueOnce(payload)
        return await promise
    }
    await flushMicrotasks()
    const win = state.windows[state.windows.length - 1]
    win.executeJavaScript.mockResolvedValueOnce(true).mockResolvedValueOnce(payload)
    win.emitWebContents('did-finish-load')
    return await promise
}

describe('renderPlantumlDiagram 参数校验与资源异常（补测）', () => {
    it('空/空白/非字符串源码直接返回 error，不创建隐藏窗口', async () => {
        await expect(renderPlantumlDiagram('')).resolves.toMatchObject({ status: 'error' })
        await expect(renderPlantumlDiagram('   ')).resolves.toMatchObject({ status: 'error' })
        await expect(renderPlantumlDiagram(123 as never)).resolves.toMatchObject({
            status: 'error'
        })
        expect(state.windows).toHaveLength(0)
    })

    it('getPlantumlPath 抛错时资源定位降级为 null（不抛到调用方）', () => {
        appPathsState.throwOnGetPlantumlPath = true
        expect(resolvePlantumlIndexHtmlPath()).toBeNull()
    })

    it('预检查通过后资源消失：创建窗口阶段失败返回 error 并记录失败原因', async () => {
        const promise = renderPlantumlDiagram(SAMPLE_SOURCE)
        // 同步预检查已通过；在队列任务创建窗口前删掉资源，触发 createRenderWindow 失败
        fs.rmSync(path.join(tempRoot, 'resources', 'plantuml', 'index.html'))

        const result = await promise
        expect(result.status).toBe('error')
        expect(result.message).toContain('resources/plantuml')
        expect(state.windows).toHaveLength(0)
        // 资源缺失在创建 BrowserWindow 之前就 reject，不产生窗口初始化诊断记录
        expect(getLastPlantumlWindowError()).toBeNull()
    })
})

describe('renderPlantumlDiagram 窗口初始化失败分支（补测）', () => {
    it('渲染页就绪探测返回 false → error', async () => {
        const { promise, win } = await startRender()
        win.executeJavaScript.mockResolvedValueOnce(false)
        win.emitWebContents('did-finish-load')

        const result = await promise
        expect(result.status).toBe('error')
        expect(getLastPlantumlWindowError()).not.toBeNull()
        expect(win.isDestroyed()).toBe(true)
    })

    it('就绪探测抛 Error / 原始字符串 → error 消息透传', async () => {
        const first = await startRender()
        first.win.executeJavaScript.mockRejectedValueOnce(new Error('probe boom'))
        first.win.emitWebContents('did-finish-load')
        await expect(first.promise).resolves.toMatchObject({
            status: 'error',
            message: expect.stringContaining('probe boom')
        })

        const second = await startRender()
        second.win.executeJavaScript.mockRejectedValueOnce('probe string')
        second.win.emitWebContents('did-finish-load')
        await expect(second.promise).resolves.toMatchObject({
            status: 'error',
            message: expect.stringContaining('probe string')
        })
    })

    it('did-fail-load → error 含页面加载失败信息', async () => {
        const { promise, win } = await startRender()
        win.emitWebContents('did-fail-load', {}, -105, 'ERR_NAME_NOT_RESOLVED')

        const result = await promise
        expect(result.status).toBe('error')
        expect(result.message).toContain('ERR_NAME_NOT_RESOLVED')
    })

    it('隐藏窗口加载超时（20s）→ error 且销毁窗口；销毁失败被吞掉', async () => {
        vi.useFakeTimers()
        try {
            const { promise, win } = await startRender()
            state.destroyThrows = true
            await vi.advanceTimersByTimeAsync(PLANTUML_WINDOW_LOAD_TIMEOUT_MS + 10)
            const result = await promise
            expect(result.status).toBe('error')
            expect(result.message).toBeTruthy()
            // destroy 抛错被 catch：窗口未标记销毁，但流程不抛
            expect(win.isDestroyed()).toBe(false)
        } finally {
            state.destroyThrows = false
            vi.useRealTimers()
        }
    })

    it('loadURL 失败（Error / 字符串）→ error；重复 settle 幂等', async () => {
        state.loadURLFailure = new Error('load failed raw')
        const first = await startRender()
        // 先由 loadURL reject 触发 settleReject，随后 did-fail-load 再次 settle 应早退
        first.win.emitWebContents('did-fail-load', {}, -2, 'SECOND_SETTLE')
        await expect(first.promise).resolves.toMatchObject({
            status: 'error',
            message: expect.stringContaining('load failed raw')
        })

        state.loadURLFailure = 'string load failure'
        const second = await startRender()
        await expect(second.promise).resolves.toMatchObject({
            status: 'error',
            message: expect.stringContaining('string load failure')
        })
    })

    it('先 did-fail-load 再 did-finish-load：settleResolve 幂等早退，结果保持首个错误', async () => {
        const { promise, win } = await startRender()
        win.executeJavaScript.mockResolvedValueOnce(true)
        win.emitWebContents('did-fail-load', {}, -3, 'FIRST_FAIL')
        win.emitWebContents('did-finish-load')

        const result = await promise
        expect(result.status).toBe('error')
        expect(result.message).toContain('FIRST_FAIL')
    })

    it('渲染进程异常退出（未 settle）→ error 含 reason；destroy 抛错被吞', async () => {
        const { promise, win } = await startRender()
        state.destroyThrows = true
        win.emitWebContents('render-process-gone', {}, { reason: 'crashed' })

        const result = await promise
        expect(result.status).toBe('error')
        expect(result.message).toContain('crashed')
        state.destroyThrows = false
    })

    it('渲染进程异常退出（已 settle）→ 销毁窗口；reason 缺失回落 unknown', async () => {
        const result = await renderWithPayload({ status: 'ok', svg: '<svg>OK</svg>' })
        expect(result.status).toBe('ok')
        const win = state.windows[state.windows.length - 1]

        win.emitWebContents('render-process-gone', {}, undefined)
        expect(win.isDestroyed()).toBe(true)

        // 已销毁窗口的进程退出重复通知：不抛错
        expect(() =>
            win.emitWebContents('render-process-gone', {}, { reason: 'oom' })
        ).not.toThrow()
    })

    it('隐藏窗口安全加固：拒绝新窗口 + 阻止导航', async () => {
        const { promise, win } = await startRender()
        const openHandler = win.setWindowOpenHandler.mock.calls[0][0] as (details: {
            url: string
        }) => { action: string }
        expect(openHandler({ url: 'https://example.com' })).toEqual({ action: 'deny' })

        const preventDefault = vi.fn()
        win.emitWebContents('will-navigate', { preventDefault })
        expect(preventDefault).toHaveBeenCalled()

        // 收尾：完成渲染避免悬挂
        win.executeJavaScript.mockResolvedValueOnce(true).mockResolvedValueOnce({
            status: 'ok',
            svg: '<svg>OK</svg>'
        })
        win.emitWebContents('did-finish-load')
        await expect(promise).resolves.toMatchObject({ status: 'ok' })
    })
})

describe('renderPlantumlDiagram 页面结果规整与渲染异常（补测）', () => {
    it('页面返回非对象 / 缺少 svg / 状态非 ok → 统一规整为 error', async () => {
        await expect(renderWithPayload(null)).resolves.toMatchObject({ status: 'error' })
        await expect(renderWithPayload('not-object')).resolves.toMatchObject({
            status: 'error'
        })
        await expect(renderWithPayload({ status: 'ok' })).resolves.toMatchObject({
            status: 'error'
        })
        await expect(renderWithPayload({ status: 'ok', svg: 'no-svg-tag' })).resolves.toMatchObject(
            { status: 'error' }
        )
        await expect(renderWithPayload({ status: 'error' })).resolves.toMatchObject({
            status: 'error'
        })
        await expect(
            renderWithPayload({ status: 'error', message: '自定义渲染错误' })
        ).resolves.toMatchObject({ status: 'error', message: '自定义渲染错误' })
    })

    it('执行渲染脚本抛 Error / 原始字符串 → error 异常信息透传', async () => {
        const first = await startRender()
        first.win.executeJavaScript
            .mockResolvedValueOnce(true)
            .mockRejectedValueOnce(new Error('render boom'))
        first.win.emitWebContents('did-finish-load')
        await expect(first.promise).resolves.toMatchObject({
            status: 'error',
            message: expect.stringContaining('render boom')
        })

        // 渲染脚本异常不会销毁窗口：显式销毁以验证「下次重建窗口」路径
        disposePlantumlLocalWindows()
        const second = await startRender()
        second.win.executeJavaScript.mockResolvedValueOnce(true).mockRejectedValueOnce('raw boom')
        second.win.emitWebContents('did-finish-load')
        await expect(second.promise).resolves.toMatchObject({
            status: 'error',
            message: expect.stringContaining('raw boom')
        })
    })

    it('单个任务失败不阻塞串行队列：后续源码仍可正常渲染', async () => {
        // 第一张：页面返回 error
        const failed = await renderWithPayload({ status: 'error', message: '第一张失败' })
        expect(failed.status).toBe('error')

        // 第二张：复用已就绪窗口正常渲染
        const secondPromise = renderPlantumlDiagram('@startuml\nA -> B : retry\n@enduml')
        const win = state.windows[state.windows.length - 1]
        win.executeJavaScript.mockResolvedValueOnce({ status: 'ok', svg: '<svg>RETRY</svg>' })
        await expect(secondPromise).resolves.toEqual({ status: 'ok', svg: '<svg>RETRY</svg>' })
    })

    it('超时后已销毁窗口（reset 时窗口为空）仍返回超时 error', async () => {
        vi.useFakeTimers()
        try {
            const { promise, win } = await startRender()
            win.executeJavaScript
                .mockResolvedValueOnce(true)
                .mockImplementationOnce(() => new Promise<unknown>(() => undefined))
            win.emitWebContents('did-finish-load')
            // 等就绪探测与渲染脚本调用都已发出（settled=true），再模拟渲染进程崩溃
            await flushMicrotasks()
            win.emitWebContents('render-process-gone', {}, { reason: 'killed' })

            await vi.advanceTimersByTimeAsync(PLANTUML_RENDER_TIMEOUT_MS + 10)
            const result = await promise
            expect(result.status).toBe('error')
            expect(result.message).toContain('超时')
        } finally {
            vi.useRealTimers()
        }
    })
})

describe('主窗口关闭清理挂接（补测）', () => {
    /** 取得注册后的 IPC 处理器（受信 sender） */
    function trustedHandler(): (event: unknown, ...args: unknown[]) => unknown {
        registerPlantumlLocalRenderIpc()
        return state.handlers.get(PLANTUML_LOCAL_RENDER_CHANNEL)!
    }

    it('挂接主窗口 closed → 销毁隐藏渲染窗口；重复调用只挂接一次', async () => {
        // 先创建并复用隐藏窗口
        await renderWithPayload({ status: 'ok', svg: '<svg>OK</svg>' })
        const hiddenWindow = state.windows[state.windows.length - 1]
        expect(hiddenWindow.isDestroyed()).toBe(false)

        // 资源移除以让 handler 内的渲染快速返回 unavailable（不影响清理挂接）
        fs.rmSync(path.join(tempRoot, 'resources', 'plantuml', 'index.html'))
        const closedHandlers: Array<() => void> = []
        state.MockBrowserWindow.fromWebContents.mockReturnValue({
            once: (event: string, handler: () => void) => {
                if (event === 'closed') closedHandlers.push(handler)
            }
        } as never)

        const handler = trustedHandler()
        const firstResult = (await handler(TRUSTED_EVENT, SAMPLE_SOURCE)) as { status: string }
        expect(firstResult.status).toBe('unavailable')
        expect(closedHandlers).toHaveLength(1)

        // 第二次调用：ownerWindowCleanupHooked 已置位，不再重复挂接
        await handler(TRUSTED_EVENT, SAMPLE_SOURCE)
        expect(closedHandlers).toHaveLength(1)

        // 主窗口关闭 → 隐藏窗口被销毁
        closedHandlers[0]()
        expect(hiddenWindow.isDestroyed()).toBe(true)

        // dispose 复位挂接标记后允许重新挂接
        disposePlantumlLocalWindows()
        closedHandlers.length = 0
        await handler(TRUSTED_EVENT, SAMPLE_SOURCE)
        expect(closedHandlers).toHaveLength(1)
    })

    it('主窗口解析异常/缺失时安全跳过（不抛错、渲染照常降级）', async () => {
        fs.rmSync(path.join(tempRoot, 'resources', 'plantuml', 'index.html'))
        const handler = trustedHandler()

        // fromWebContents 抛错 → catch 后继续
        state.MockBrowserWindow.fromWebContents.mockImplementation(() => {
            throw new Error('fromWebContents boom')
        })
        await expect(handler(TRUSTED_EVENT, SAMPLE_SOURCE)).resolves.toMatchObject({
            status: 'unavailable'
        })

        // fromWebContents 返回不带 once 的对象 → 跳过挂接
        state.MockBrowserWindow.fromWebContents.mockReturnValue({} as never)
        await expect(handler(TRUSTED_EVENT, SAMPLE_SOURCE)).resolves.toMatchObject({
            status: 'unavailable'
        })

        // BrowserWindow.fromWebContents 不是函数 → 提前 return
        const original = state.MockBrowserWindow.fromWebContents
        ;(state.MockBrowserWindow as unknown as { fromWebContents: unknown }).fromWebContents =
            undefined
        await expect(handler(TRUSTED_EVENT, SAMPLE_SOURCE)).resolves.toMatchObject({
            status: 'unavailable'
        })
        ;(state.MockBrowserWindow as unknown as { fromWebContents: unknown }).fromWebContents =
            original
    })
})

describe('disposePlantumlLocalWindows 与诊断接口（补测）', () => {
    it('销毁隐藏窗口抛错时只记录警告，不中断退出流程', async () => {
        // 先完成一次正常渲染，确保窗口创建 promise 已 settle（否则队列会悬挂）
        await renderWithPayload({ status: 'ok', svg: '<svg>OK</svg>' })
        const win = state.windows[state.windows.length - 1]
        expect(win.isDestroyed()).toBe(false)

        state.destroyThrows = true
        expect(() => disposePlantumlLocalWindows()).not.toThrow()
        // destroy 抛错被 catch，窗口未标记销毁；renderWindow 引用已复位
        expect(win.isDestroyed()).toBe(false)
        state.destroyThrows = false
        // 手动销毁残留窗口并清缓存后，按需重建新窗口
        win.destroy()
        clearPlantumlRenderCache()
        await renderWithPayload({ status: 'ok', svg: '<svg>REBUILT</svg>' })
        expect(state.windows.length).toBeGreaterThan(1)
    })

    it('getLastPlantumlWindowError 在无失败时返回 null，失败后返回原因字符串', async () => {
        // 失败一次（就绪探测返回 false）
        const { promise, win } = await startRender()
        win.executeJavaScript.mockResolvedValueOnce(false)
        win.emitWebContents('did-finish-load')
        await promise
        expect(typeof getLastPlantumlWindowError()).toBe('string')
    })
})
