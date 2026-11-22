/**
 * 1.5.2 E3 图片 OCR —— 语言包下载/缓存单测（`src/main/utils/ocr/ocr-tessdata.ts`，不触网）
 *
 * 覆盖口径：
 * 1. 缓存目录口径：`<userData>/ocr/tessdata/<lang>.traineddata.gz`；
 * 2. 首次下载：官方主源 URL、gzip/大小校验、进度 100%、原子写缓存、临时文件零残留；
 * 3. 缓存命中：不触发 fetch；缓存损坏（过小/魔数不符）→ 重新下载并覆盖；
 * 4. 主源失败自动回退备用源；两源都失败 → 结构化 lang-download-failed + 临时文件清理；
 * 5. 安全边界：HTTP 错误 / 声明或实际字节超限 / 重定向到非 https / 非 gzip 内容均拒绝；
 * 6. `invalidateOcrLanguage` 删除坏缓存（供 worker 初始化失败自愈）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fs } from 'node:fs'
import { mkdtemp, readdir, rm, stat, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import {
    OCR_TESSDATA_MAX_BYTES,
    OCR_TESSDATA_MIN_BYTES,
    buildOcrTessdataFileName,
    buildOcrTessdataUrl
} from '../../src/shared/constants/ocr'
import type { OcrFetchBodyLike, OcrFetchResponseLike } from '../../src/main/utils/ocr/ocr-tessdata'

const mocks = vi.hoisted(() => ({
    userDataPath: '',
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// userData 根目录用临时目录（避免碰真实 ~/.baizenotes 与 Electron app API）
vi.mock('../../src/main/utils/app-paths', () => ({
    getUserDataPath: () => mocks.userDataPath
}))
vi.mock('../../src/main/utils/logger', () => ({ logger: mocks.logger }))

import {
    getOcrTessdataDir,
    getOcrTessdataFilePath,
    invalidateOcrLanguage,
    prepareOcrLanguage
} from '../../src/main/utils/ocr/ocr-tessdata'

/** 合法的 .traineddata.gz 字节（大小在区间内 + gzip 魔数；不真正解压） */
function makeLanguagePackBytes(size = OCR_TESSDATA_MIN_BYTES): Uint8Array {
    const bytes = new Uint8Array(size)
    bytes[0] = 0x1f
    bytes[1] = 0x8b
    return bytes
}

/** 构造单块响应体 */
function bodyOfChunks(chunks: Uint8Array[]): OcrFetchBodyLike {
    let index = 0
    return {
        getReader: () => ({
            read: async () => {
                if (index >= chunks.length) {
                    return { done: true }
                }
                const value = chunks[index]
                index += 1
                return { done: false, value }
            },
            cancel: async () => undefined
        })
    }
}

/** 构造 fetch 响应替身 */
function responseOf(
    bytes: Uint8Array,
    overrides: Partial<OcrFetchResponseLike> & {
        contentLength?: string | null
        declaredUrl?: string
        chunks?: Uint8Array[]
    } = {}
): OcrFetchResponseLike {
    const headerValue = overrides.contentLength ?? String(bytes.length)
    return {
        ok: overrides.ok ?? true,
        status: overrides.status ?? 200,
        url: overrides.declaredUrl ?? buildOcrTessdataUrl('eng'),
        headers: {
            get: (name: string) => (name.toLowerCase() === 'content-length' ? headerValue : null)
        },
        body:
            overrides.body === undefined
                ? bodyOfChunks(overrides.chunks ?? [bytes])
                : overrides.body
    }
}

let tempRoot = ''

beforeEach(async () => {
    vi.clearAllMocks()
    tempRoot = await mkdtemp(path.join(os.tmpdir(), 'baize-ocr-tessdata-'))
    mocks.userDataPath = tempRoot
})

afterEach(async () => {
    if (tempRoot) {
        await rm(tempRoot, { recursive: true, force: true })
        tempRoot = ''
    }
})

describe('缓存目录与文件名口径', () => {
    it('<userData>/ocr/tessdata/<lang>.traineddata.gz', () => {
        const dir = getOcrTessdataDir()
        expect(dir).toBe(path.join(tempRoot, 'ocr', 'tessdata'))
        expect(getOcrTessdataFilePath('eng')).toBe(path.join(dir, buildOcrTessdataFileName('eng')))
    })
})

describe('prepareOcrLanguage：首次下载与缓存命中', () => {
    it('首次下载主源成功：gzip/大小校验通过 → 原子写缓存、进度 100%、临时文件零残留', async () => {
        const pack = makeLanguagePackBytes()
        const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(pack)
        )
        const progress = vi.fn()
        const result = await prepareOcrLanguage('eng', {
            fetchImpl: fetchImpl as never,
            onProgress: progress
        })
        expect(result).toEqual({ ok: true, lang: 'eng', fromCache: false, bytes: pack.length })
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        expect(fetchImpl.mock.calls[0][0]).toBe(buildOcrTessdataUrl('eng'))
        const target = getOcrTessdataFilePath('eng')
        const fileStat = await stat(target)
        expect(fileStat.size).toBe(pack.length)
        // 进度：只要求有事件且最后一次为 100%（中间进度按 200ms 节流，单块下载可能只有末尾一次）
        expect(progress).toHaveBeenCalled()
        expect(progress.mock.calls.at(-1)?.[0]).toMatchObject({
            receivedBytes: pack.length,
            percent: 100
        })
        // 目录内只有正式缓存文件，无下载临时文件
        const entries = await readdir(getOcrTessdataDir())
        expect(entries).toEqual([buildOcrTessdataFileName('eng')])
    })

    it('缓存命中：不再发起下载', async () => {
        const target = getOcrTessdataFilePath('eng')
        await fs.mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, makeLanguagePackBytes())
        const fetchImpl = vi.fn()
        const result = await prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })
        expect(result).toMatchObject({ ok: true, lang: 'eng', fromCache: true })
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('缓存损坏（过小/魔数不符/超限）→ 重新下载并覆盖', async () => {
        const target = getOcrTessdataFilePath('eng')
        await fs.mkdir(path.dirname(target), { recursive: true })
        // 1) 过小
        await writeFile(target, new Uint8Array(16).fill(0x1f))
        let fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(makeLanguagePackBytes())
        )
        await expect(
            prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })
        ).resolves.toMatchObject({ ok: true, fromCache: false })
        expect(fetchImpl).toHaveBeenCalledTimes(1)
        // 2) 魔数不符
        const wrongMagic = makeLanguagePackBytes()
        wrongMagic[0] = 0x1e
        await writeFile(target, wrongMagic)
        fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(makeLanguagePackBytes())
        )
        await expect(
            prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })
        ).resolves.toMatchObject({ ok: true, fromCache: false })
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })
})

describe('prepareOcrLanguage：多源回退与失败清理', () => {
    it('主源网络失败 → 自动回退备用源成功', async () => {
        const pack = makeLanguagePackBytes()
        const fetchImpl = vi
            .fn()
            .mockRejectedValueOnce(new Error('main source down'))
            .mockResolvedValueOnce(responseOf(pack))
        await expect(
            prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })
        ).resolves.toMatchObject({ ok: true, fromCache: false })
        expect(fetchImpl).toHaveBeenCalledTimes(2)
        expect(fetchImpl.mock.calls[0][0]).toBe(buildOcrTessdataUrl('eng'))
        expect(fetchImpl.mock.calls[1][0]).toBe(buildOcrTessdataUrl('eng', 1))
    })

    it('两源都失败 → lang-download-failed，且不残留正式/临时文件', async () => {
        const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () => {
            throw new Error('network down')
        })
        await expect(prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })).resolves.toEqual(
            { ok: false, error: 'lang-download-failed' }
        )
        expect(fetchImpl).toHaveBeenCalledTimes(2)
        const entries = await readdir(getOcrTessdataDir()).catch(() => [])
        expect(entries.filter((name) => name.includes('.download'))).toEqual([])
        expect(entries).not.toContain(buildOcrTessdataFileName('eng'))
    })

    it('HTTP 错误状态 → 失败（两源均被尝试）', async () => {
        const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(new Uint8Array(0), { ok: false, status: 503 })
        )
        await expect(prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })).resolves.toEqual(
            { ok: false, error: 'lang-download-failed' }
        )
        expect(fetchImpl).toHaveBeenCalledTimes(2)
    })
})

describe('prepareOcrLanguage：安全边界（字节/协议校验）', () => {
    it('Content-Length 声明超过 20 MiB → 拒绝（不读取响应体）', async () => {
        const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(makeLanguagePackBytes(), {
                contentLength: String(OCR_TESSDATA_MAX_BYTES + 1)
            })
        )
        await expect(prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })).resolves.toEqual(
            { ok: false, error: 'lang-download-failed' }
        )
        expect(fetchImpl).toHaveBeenCalledTimes(2)
    })

    it('流式实际字节超过 20 MiB → 拒绝', async () => {
        const oversized = makeLanguagePackBytes(OCR_TESSDATA_MAX_BYTES + 1)
        const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(oversized, {
                contentLength: null,
                chunks: [oversized]
            })
        )
        await expect(prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })).resolves.toEqual(
            { ok: false, error: 'lang-download-failed' }
        )
    })

    it('重定向到非 https 最终地址 → 拒绝', async () => {
        const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(makeLanguagePackBytes(), {
                declaredUrl: 'http://evil.example.com/eng.traineddata.gz'
            })
        )
        await expect(prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })).resolves.toEqual(
            { ok: false, error: 'lang-download-failed' }
        )
    })

    it('内容不是 gzip（魔数不符）→ 拒绝且无残留文件', async () => {
        const badPack = new Uint8Array(OCR_TESSDATA_MIN_BYTES).fill(0x42)
        const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(badPack)
        )
        await expect(prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })).resolves.toEqual(
            { ok: false, error: 'lang-download-failed' }
        )
        const entries = await readdir(getOcrTessdataDir()).catch(() => [])
        expect(entries.filter((name) => name.includes('.download'))).toEqual([])
    })
})

describe('prepareOcrLanguage：边界分支（覆盖率补测）', () => {
    it('历史残留的下载临时文件会在准备阶段清理', async () => {
        const dir = getOcrTessdataDir()
        await fs.mkdir(dir, { recursive: true })
        const stale = path.join(dir, `${buildOcrTessdataFileName('eng')}.download-999-1.tmp`)
        await writeFile(stale, new Uint8Array(8))
        const pack = makeLanguagePackBytes()
        const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(pack)
        )
        await expect(
            prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })
        ).resolves.toMatchObject({ ok: true })
        const entries = await readdir(dir)
        expect(entries).toEqual([buildOcrTessdataFileName('eng')])
    })

    it('缓存路径是目录（非普通文件）→ 视为损坏并重新下载', async () => {
        const target = getOcrTessdataFilePath('eng')
        await fs.mkdir(target, { recursive: true })
        const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(makeLanguagePackBytes())
        )
        await expect(
            prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })
        ).resolves.toMatchObject({ ok: true, fromCache: false })
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })

    it('响应缺少响应体 → 失败（两源均尝试）', async () => {
        const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(makeLanguagePackBytes(), { body: null })
        )
        await expect(prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })).resolves.toEqual(
            { ok: false, error: 'lang-download-failed' }
        )
        expect(fetchImpl).toHaveBeenCalledTimes(2)
    })

    it('Content-Length 非数字/为 0 → 失败（不读取响应体）', async () => {
        for (const contentLength of ['abc', '0', '-1']) {
            const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
                responseOf(makeLanguagePackBytes(), { contentLength })
            )
            await expect(
                prepareOcrLanguage('eng', { fetchImpl: fetchImpl as never })
            ).resolves.toEqual({ ok: false, error: 'lang-download-failed' })
        }
    })

    it('空 chunk 被跳过；未声明 Content-Length 时进度按已接收字节上报', async () => {
        const pack = makeLanguagePackBytes()
        const half = pack.length >> 1
        const chunks = [new Uint8Array(0), pack.subarray(0, half), pack.subarray(half)]
        const fetchImpl = vi.fn<(url: string) => Promise<OcrFetchResponseLike>>(async () =>
            responseOf(pack, { contentLength: null, chunks })
        )
        const progress = vi.fn()
        await expect(
            prepareOcrLanguage('eng', {
                fetchImpl: fetchImpl as never,
                onProgress: progress
            })
        ).resolves.toMatchObject({ ok: true })
        const last = progress.mock.calls.at(-1)?.[0] as {
            receivedBytes: number
            totalBytes: number
            percent: number
        }
        expect(last.receivedBytes).toBe(pack.length)
        expect(last.totalBytes).toBe(pack.length)
        expect(last.percent).toBe(100)
    })

    it('未注入 fetchImpl 时使用 globalThis.fetch（默认实现接线）', async () => {
        const pack = makeLanguagePackBytes()
        const globalFetch = vi.fn(async () => responseOf(pack))
        vi.stubGlobal('fetch', globalFetch)
        try {
            await expect(prepareOcrLanguage('eng')).resolves.toMatchObject({
                ok: true,
                fromCache: false
            })
            expect(globalFetch).toHaveBeenCalledTimes(1)
        } finally {
            vi.unstubAllGlobals()
        }
    })
})

describe('invalidateOcrLanguage：坏缓存自愈', () => {
    it('删除缓存文件（存在时），供 worker 初始化失败后重新下载', async () => {
        const target = getOcrTessdataFilePath('eng')
        await fs.mkdir(path.dirname(target), { recursive: true })
        await writeFile(target, makeLanguagePackBytes())
        await expect(invalidateOcrLanguage('eng')).resolves.toBe(true)
        await expect(stat(target)).rejects.toThrow()
        // 再删一次不抛错（幂等）
        await expect(invalidateOcrLanguage('eng')).resolves.toBe(true)
    })
})
