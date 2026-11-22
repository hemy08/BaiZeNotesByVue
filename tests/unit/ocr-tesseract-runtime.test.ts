/**
 * 1.5.2 E3 OCR worker 内 tesseract.js 运行时单测（`src/main/utils/ocr/ocr-tesseract-runtime.ts`）
 *
 * 通过 mock tesseract.js 内部 worker-script / node gunzip / node cache 与 tesseract.js-core，
 * 在不加载真实 wasm 的前提下覆盖：
 * 1. adapter 注入（getCore 固定返回 baseline LSTM 单变体 + gunzip/cache/fetch 接线）；
 * 2. 单例状态机：core 只加载一次、语言只 loadLanguage 一次、切换语言重新 initialize；
 * 3. dispatch 协议：load/loadLanguage/initialize/recognize 的 packet 形状与完成/失败归一化；
 * 4. 内部任务超时（90s 兜底）与 adapter 注入失败；
 * 5. recognize 结果归一化（缺失/非对象 text → 空串）与耗时记录。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
    setAdapter: vi.fn(),
    dispatchHandlers: vi.fn(),
    gunzip: vi.fn((data: Uint8Array) => data),
    readCache: vi.fn(async () => new Uint8Array()),
    writeCache: vi.fn(async () => undefined),
    deleteCache: vi.fn(async () => undefined),
    checkCache: vi.fn(async () => true),
    core: vi.fn(async () => 'TESS_MODULE')
}))

vi.mock('tesseract.js/src/worker-script/index.js', () => ({
    setAdapter: mocks.setAdapter,
    dispatchHandlers: mocks.dispatchHandlers
}))
vi.mock('tesseract.js/src/worker-script/node/gunzip.js', () => ({ default: mocks.gunzip }))
vi.mock('tesseract.js/src/worker-script/node/cache.js', () => ({
    readCache: mocks.readCache,
    writeCache: mocks.writeCache,
    deleteCache: mocks.deleteCache,
    checkCache: mocks.checkCache
}))
vi.mock('tesseract.js-core/tesseract-core-lstm', () => ({ default: mocks.core }))

/** 运行时模块类型（每次 resetModules 后动态导入，隔离模块级单例状态） */
type RuntimeModule = typeof import('../../src/main/utils/ocr/ocr-tesseract-runtime')

/** 从 setAdapter 调用中取出的 adapter 结构（测试侧最小类型） */
interface AdapterLike {
    getCore: (
        oem: unknown,
        corePath: unknown,
        res: { progress: (message: { status: string; progress: number }) => void }
    ) => Promise<unknown>
    gunzip: unknown
    fetch: (url: string) => Promise<unknown>
    readCache: unknown
    writeCache: unknown
    deleteCache: unknown
    checkCache: unknown
}

/** dispatch 记录：action + packet */
interface DispatchCall {
    action: string
    packet: { jobId: number; workerId: string; action: string; payload: unknown }
}

let dispatchCalls: DispatchCall[] = []

/**
 * 安装 dispatchHandlers 替身：按 action 异步回包。
 * @param handler 返回 data 的处理器（可抛错 → 转为 reject status）
 */
function installDispatch(
    handler: (call: DispatchCall) => unknown = (call) =>
        call.action === 'recognize' ? { text: 'Hello OCR' } : undefined
): void {
    dispatchCalls = []
    mocks.dispatchHandlers.mockImplementation(
        (
            packet: DispatchCall['packet'],
            send: (message: { jobId: number; status: 'resolve' | 'reject'; data?: unknown }) => void
        ) => {
            const call: DispatchCall = { action: packet.action, packet }
            dispatchCalls.push(call)
            queueMicrotask(() => {
                try {
                    send({ jobId: packet.jobId, status: 'resolve', data: handler(call) })
                } catch (error) {
                    send({
                        jobId: packet.jobId,
                        status: 'reject',
                        data: error instanceof Error ? error.message : String(error)
                    })
                }
            })
        }
    )
}

async function loadModule(): Promise<RuntimeModule> {
    vi.resetModules()
    return import('../../src/main/utils/ocr/ocr-tesseract-runtime')
}

beforeEach(() => {
    vi.clearAllMocks()
    dispatchCalls = []
    mocks.gunzip.mockImplementation((data: Uint8Array) => data)
    mocks.readCache.mockResolvedValue(new Uint8Array())
    mocks.writeCache.mockResolvedValue(undefined)
    mocks.deleteCache.mockResolvedValue(undefined)
    mocks.checkCache.mockResolvedValue(true)
    mocks.core.mockResolvedValue('TESS_MODULE')
    installDispatch()
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
})

describe('ocr-tesseract-runtime：adapter 与 core 单变体', () => {
    it('导出唯一 core 变体标识；注入 adapter 一次并固定返回 baseline LSTM core', async () => {
        const runtime = await loadModule()
        expect(runtime.OCR_TESSERACT_CORE_VARIANT).toBe('tesseract-core-lstm')
        await runtime.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([1]))

        expect(mocks.setAdapter).toHaveBeenCalledTimes(1)
        const adapter = mocks.setAdapter.mock.calls[0][0] as AdapterLike
        expect(adapter.gunzip).toBe(mocks.gunzip)
        expect(adapter.readCache).toBe(mocks.readCache)
        expect(adapter.writeCache).toBe(mocks.writeCache)
        expect(adapter.deleteCache).toBe(mocks.deleteCache)
        expect(adapter.checkCache).toBe(mocks.checkCache)

        const progress = vi.fn()
        const factory = await adapter.getCore(1, '/ignored-core-path', { progress })
        expect(factory).toBe(mocks.core)
        expect(progress.mock.calls).toEqual([
            [{ status: 'loading tesseract core', progress: 0 }],
            [{ status: 'loading tesseract core', progress: 1 }]
        ])
    })

    it('adapter.fetch 包装 globalThis.fetch（本地语言包路径下实际不会触发网络）', async () => {
        const fetchStub = vi.fn(async () => 'FETCH_OK')
        vi.stubGlobal('fetch', fetchStub)
        const runtime = await loadModule()
        await runtime.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([1]))
        const adapter = mocks.setAdapter.mock.calls[0][0] as AdapterLike
        await expect(adapter.fetch('https://example.com/x')).resolves.toBe('FETCH_OK')
        expect(fetchStub).toHaveBeenCalledWith('https://example.com/x')
    })
})

describe('ocr-tesseract-runtime：加载状态机', () => {
    it('首次识别依次 load → loadLanguage → initialize → recognize，packet 形状正确', async () => {
        const runtime = await loadModule()
        const imageBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47])
        const result = await runtime.recognizeOcrImageInWorker('/lang/dir', 'eng', imageBytes)

        expect(result.text).toBe('Hello OCR')
        expect(typeof result.elapsedMs).toBe('number')
        expect(dispatchCalls.map((call) => call.action)).toEqual([
            'load',
            'loadLanguage',
            'initialize',
            'recognize'
        ])
        expect(dispatchCalls[0].packet.payload).toEqual({
            options: { lstmOnly: true, corePath: '', logging: false }
        })
        expect(dispatchCalls[1].packet.payload).toEqual({
            langs: ['eng'],
            options: {
                langPath: '/lang/dir',
                cacheMethod: 'none',
                gzip: true,
                lstmOnly: true
            }
        })
        expect(dispatchCalls[2].packet.payload).toEqual({ langs: 'eng', oem: 1, config: {} })
        const recognizePayload = dispatchCalls[3].packet.payload as {
            image: Uint8Array
            output: { text: boolean }
        }
        expect(Buffer.isBuffer(recognizePayload.image)).toBe(true)
        expect(Array.from(recognizePayload.image)).toEqual(Array.from(imageBytes))
        expect(recognizePayload.output).toEqual({ text: true })
        expect(dispatchCalls[3].packet.workerId).toBe('baize-ocr-worker')
    })

    it('同语言重复识别：core/语言/initialize 不重复，只重复 recognize', async () => {
        const runtime = await loadModule()
        await runtime.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([1]))
        await runtime.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([2]))
        expect(dispatchCalls.map((call) => call.action)).toEqual([
            'load',
            'loadLanguage',
            'initialize',
            'recognize',
            'recognize'
        ])
        expect(mocks.setAdapter).toHaveBeenCalledTimes(1)
    })

    it('切换语言：重新 loadLanguage + initialize（core 不重复加载）', async () => {
        const runtime = await loadModule()
        await runtime.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([1]))
        await runtime.recognizeOcrImageInWorker('/lang', 'chi_sim', new Uint8Array([2]))
        expect(dispatchCalls.map((call) => call.action)).toEqual([
            'load',
            'loadLanguage',
            'initialize',
            'recognize',
            'loadLanguage',
            'initialize',
            'recognize'
        ])
        expect(dispatchCalls[4].packet.payload).toMatchObject({ langs: ['chi_sim'] })
        expect(dispatchCalls[5].packet.payload).toMatchObject({ langs: 'chi_sim', oem: 1 })
    })

    it('loadLanguage 失败：不标记语言已加载，下次重试会重新 loadLanguage', async () => {
        let firstLoadLanguage = true
        installDispatch((call) => {
            if (call.action === 'loadLanguage' && firstLoadLanguage) {
                firstLoadLanguage = false
                throw new Error('Network error while fetching traineddata')
            }
            return call.action === 'recognize' ? { text: 'ok' } : undefined
        })
        const runtime = await loadModule()
        await expect(
            runtime.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([1]))
        ).rejects.toThrow('Network error')

        dispatchCalls = []
        await expect(
            runtime.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([2]))
        ).resolves.toMatchObject({ text: 'ok' })
        // 重试：core 已加载，不再 load；重新 loadLanguage + initialize + recognize
        expect(dispatchCalls.map((call) => call.action)).toEqual([
            'loadLanguage',
            'initialize',
            'recognize'
        ])
    })

    it('adapter 注入失败：识别直接 reject（不吞异常）', async () => {
        mocks.setAdapter.mockImplementationOnce(() => {
            throw new Error('adapter injected failed')
        })
        const runtime = await loadModule()
        await expect(
            runtime.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([1]))
        ).rejects.toThrow('adapter injected failed')
    })

    it('内部任务 reject：错误归一化（字符串 → Error.message）', async () => {
        installDispatch(() => {
            throw new Error('initialization failed')
        })
        const runtime = await loadModule()
        await expect(
            runtime.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([1]))
        ).rejects.toThrow('initialization failed')
    })

    it('识别结果缺失/非对象 text → 返回空串（不抛异常）', async () => {
        installDispatch(() => undefined)
        const runtime = await loadModule()
        await expect(
            runtime.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([1]))
        ).resolves.toMatchObject({ text: '' })

        installDispatch(() => ({ text: 42 }))
        const runtimeSecond = await loadModule()
        await expect(
            runtimeSecond.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([1]))
        ).resolves.toMatchObject({ text: '' })
    })

    it('内部任务超时（90s 兜底）：reject 含超时文案', async () => {
        vi.useFakeTimers()
        mocks.dispatchHandlers.mockImplementation(() => undefined)
        const runtime = await loadModule()
        const pending = runtime.recognizeOcrImageInWorker('/lang', 'eng', new Uint8Array([1]))
        const assertion = expect(pending).rejects.toThrow('OCR 内部任务超时')
        await Promise.resolve()
        vi.advanceTimersByTime(90 * 1000)
        await assertion
    })
})
