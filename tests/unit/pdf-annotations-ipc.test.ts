/**
 * 1.5.2 E2：PDF 标注与摘录 —— 主进程 IPC 层单测（`src/main/ipc/pdf-annotations-ipc.ts`，不启动 Electron）
 *
 * 覆盖口径：
 * 1. 路径校验矩阵：非字符串 / 空串 / 相对路径 / 非 .pdf 扩展名 / Path Guard 拒绝 /
 *    侧车路径二次校验 / 合法路径（PDF 与侧车路径均由主进程生成）；
 * 2. 读取容错：侧车缺失 → 空数组；损坏 JSON → 空数组 + WARN；空文件 / BOM / 裸数组旧格式；
 *    非普通文件、超大小上限 → 空数组 + WARN；IO 错误 → ok=false + read-failed；
 * 3. 保存：合法读写往返、保存前归一化（排序/剥离未知字段）、非数组载荷拒绝、
 *    原子写失败（rename 失败）清理 .tmp、成功写后无 .tmp 残留；
 * 4. 注册形状：两个 handle 通道 + componentId 透传 + 监听器透传业务结果。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { promises as fsPromises } from 'node:fs'
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'
import { IPC } from '../../src/shared/ipc-channels'
import {
    PDF_ANNOTATIONS_FILE_MAX_BYTES,
    PDF_ANNOTATIONS_SUFFIX,
    normalizePdfAnnotations,
    serializePdfAnnotations
} from '../../src/shared/constants/pdf-annotations'
import type { PdfAnnotation } from '../../src/shared/types/pdf-annotations'

const mocks = vi.hoisted(() => ({
    isPathAllowed: vi.fn(),
    registerHandleOnce: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

// Path Guard 自身由 security 单测覆盖；本文件只验证「校验被调用 + 拒绝分支返回码」
vi.mock('../../src/main/utils/security', () => ({ isPathAllowed: mocks.isPathAllowed }))
// sender 校验由 ipc-security 单测覆盖；本文件直接放行以验证 handler 形状
vi.mock('../../src/main/utils/ipc-security', () => ({
    withSenderCheck: (_channel: string, handler: unknown) => handler
}))
vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: { registerHandleOnce: mocks.registerHandleOnce }
}))
vi.mock('../../src/main/utils/logger', () => ({ logger: mocks.logger }))

import {
    loadPdfAnnotationsForPath,
    registerPdfAnnotationsIpc,
    resolvePdfAnnotationPaths,
    savePdfAnnotationsForPath
} from '../../src/main/ipc/pdf-annotations-ipc'

/** 临时目录（测试统一 baize- 前缀，afterEach 清理） */
let tempDir = ''
/** 合法 PDF 路径（只校验扩展名与 Path Guard，不要求文件真实存在） */
let pdfPath = ''
/** 侧车文件路径（主进程生成口径） */
let sidecarPath = ''

function makeAnnotation(overrides: Partial<PdfAnnotation> = {}): PdfAnnotation {
    return {
        id: 'a1',
        page: 1,
        text: '摘录文本',
        createdAt: '2026-01-04T09:05:06.000Z',
        rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.05 }],
        ...overrides
    }
}

beforeEach(async () => {
    vi.clearAllMocks()
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'baize-pdf-annotations-'))
    pdfPath = path.join(tempDir, 'manual.pdf')
    sidecarPath = `${pdfPath}${PDF_ANNOTATIONS_SUFFIX}`
    // 默认放行：仅临时目录下的路径（模拟 Path Guard 对系统临时目录的放行）
    mocks.isPathAllowed.mockImplementation(
        (candidate: unknown) =>
            typeof candidate === 'string' &&
            path.resolve(candidate).startsWith(path.resolve(tempDir))
    )
})

afterEach(async () => {
    if (tempDir) {
        await rm(tempDir, { recursive: true, force: true })
        tempDir = ''
    }
})

describe('resolvePdfAnnotationPaths：路径与扩展名校验', () => {
    it('非字符串 / 空串 / 空白 / 含 NUL / 相对路径 → invalid-path', () => {
        for (const raw of [null, undefined, 42, {}, [], '', '   ', 'a\0b.pdf', 'docs/a.pdf']) {
            expect(resolvePdfAnnotationPaths(raw)).toEqual({
                ok: false,
                error: 'invalid-path'
            })
        }
        expect(mocks.isPathAllowed).not.toHaveBeenCalled()
    })

    it('非 .pdf 扩展名（含无扩展名 / 大写非 PDF）→ invalid-extension', () => {
        for (const name of ['manual.txt', 'manual', 'manual.pdf.exe', 'manual.docx']) {
            expect(resolvePdfAnnotationPaths(path.join(tempDir, name))).toEqual({
                ok: false,
                error: 'invalid-extension'
            })
        }
        expect(mocks.isPathAllowed).not.toHaveBeenCalled()
    })

    it('Path Guard 拒绝 PDF 路径 → path-denied', () => {
        mocks.isPathAllowed.mockReturnValue(false)
        expect(resolvePdfAnnotationPaths(pdfPath)).toEqual({
            ok: false,
            error: 'path-denied'
        })
    })

    it('PDF 放行但侧车路径被拒绝 → path-denied（侧车路径二次复核）', () => {
        mocks.isPathAllowed.mockImplementation(
            (candidate: unknown) => typeof candidate === 'string' && candidate === pdfPath
        )
        expect(resolvePdfAnnotationPaths(pdfPath)).toEqual({
            ok: false,
            error: 'path-denied'
        })
        // PDF 路径与侧车路径都做过校验（两次调用）
        expect(mocks.isPathAllowed).toHaveBeenCalledTimes(2)
    })

    it('合法路径：PDF 解析为绝对路径，侧车路径 = PDF 路径 + .annotations.json', () => {
        const result = resolvePdfAnnotationPaths(`  ${pdfPath}  `)
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.paths.pdfPath).toBe(path.resolve(pdfPath))
            expect(result.paths.sidecarPath).toBe(
                `${path.resolve(pdfPath)}${PDF_ANNOTATIONS_SUFFIX}`
            )
        }
    })

    it('大写 .PDF 扩展名同样接受', () => {
        const upperPath = path.join(tempDir, 'MANUAL.PDF')
        const result = resolvePdfAnnotationPaths(upperPath)
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.paths.sidecarPath).toBe(`${path.resolve(upperPath)}.annotations.json`)
        }
    })
})

describe('loadPdfAnnotationsForPath：读取容错', () => {
    it('侧车缺失 → ok=true + 空数组（不告警）', async () => {
        await expect(loadPdfAnnotationsForPath(pdfPath)).resolves.toEqual({
            ok: true,
            annotations: []
        })
        expect(mocks.logger.warn).not.toHaveBeenCalled()
    })

    it('合法侧车（对象包裹）→ 归一化后返回', async () => {
        await writeFile(sidecarPath, serializePdfAnnotations([makeAnnotation()]), 'utf8')
        const result = await loadPdfAnnotationsForPath(pdfPath)
        expect(result).toEqual({ ok: true, annotations: [makeAnnotation()] })
    })

    it('裸数组旧格式 / UTF-8 BOM 同样兼容', async () => {
        await writeFile(sidecarPath, `\uFEFF${JSON.stringify([makeAnnotation()])}`, 'utf8')
        await expect(loadPdfAnnotationsForPath(pdfPath)).resolves.toEqual({
            ok: true,
            annotations: [makeAnnotation()]
        })
    })

    it('损坏 JSON → ok=true + 空数组 + WARN（不崩溃、不阻塞预览）', async () => {
        await writeFile(sidecarPath, '{ "version": 1, "annotations": [', 'utf8')
        await expect(loadPdfAnnotationsForPath(pdfPath)).resolves.toEqual({
            ok: true,
            annotations: []
        })
        expect(mocks.logger.warn).toHaveBeenCalled()
    })

    it('空文件 / 纯空白 → 空数组', async () => {
        await writeFile(sidecarPath, '   \n', 'utf8')
        await expect(loadPdfAnnotationsForPath(pdfPath)).resolves.toEqual({
            ok: true,
            annotations: []
        })
    })

    it('侧车路径是目录 → 空数组 + WARN（非普通文件）', async () => {
        await mkdir(sidecarPath, { recursive: true })
        await expect(loadPdfAnnotationsForPath(pdfPath)).resolves.toEqual({
            ok: true,
            annotations: []
        })
        expect(mocks.logger.warn).toHaveBeenCalled()
    })

    it('超过大小上限 → 空数组 + WARN（不读入内存）', async () => {
        await writeFile(sidecarPath, '', 'utf8')
        await fsPromises.truncate(sidecarPath, PDF_ANNOTATIONS_FILE_MAX_BYTES + 1)
        await expect(loadPdfAnnotationsForPath(pdfPath)).resolves.toEqual({
            ok: true,
            annotations: []
        })
        expect(mocks.logger.warn).toHaveBeenCalled()
    })

    it('读取 IO 失败（非 ENOENT）→ ok=false + read-failed + ERROR 日志', async () => {
        const permissionError = Object.assign(new Error('EACCES: permission denied'), {
            code: 'EACCES'
        })
        const statSpy = vi.spyOn(fsPromises, 'stat').mockRejectedValueOnce(permissionError as never)
        await expect(loadPdfAnnotationsForPath(pdfPath)).resolves.toEqual({
            ok: false,
            annotations: [],
            error: 'read-failed'
        })
        expect(mocks.logger.error).toHaveBeenCalled()
        statSpy.mockRestore()
    })

    it('路径校验失败 → ok=false + 对应错误码（不读盘）', async () => {
        await expect(loadPdfAnnotationsForPath(path.join(tempDir, 'a.txt'))).resolves.toEqual({
            ok: false,
            annotations: [],
            error: 'invalid-extension'
        })
        mocks.isPathAllowed.mockReturnValue(false)
        await expect(loadPdfAnnotationsForPath(pdfPath)).resolves.toEqual({
            ok: false,
            annotations: [],
            error: 'path-denied'
        })
    })
})

describe('savePdfAnnotationsForPath：校验 / 归一化 / 原子写', () => {
    it('合法读写往返：保存后读取结果一致，且不残留 .tmp 文件', async () => {
        const annotations = [makeAnnotation()]
        await expect(savePdfAnnotationsForPath(pdfPath, annotations)).resolves.toEqual({
            ok: true
        })
        await expect(loadPdfAnnotationsForPath(pdfPath)).resolves.toEqual({
            ok: true,
            annotations
        })
        await expect(access(`${sidecarPath}.tmp`)).rejects.toThrow()
    })

    it('保存前归一化：乱序/未知字段/重复 id 按 shared 口径清洗后写盘', async () => {
        const raw = [
            makeAnnotation({ id: 'b', page: 2 }),
            { ...makeAnnotation({ id: 'a', page: 1 }), unknownField: 'x' },
            makeAnnotation({ id: 'a', page: 3 })
        ]
        await savePdfAnnotationsForPath(pdfPath, raw)
        const stored = JSON.parse(await readFile(sidecarPath, 'utf8')) as {
            version: number
            annotations: PdfAnnotation[]
        }
        expect(stored.version).toBe(1)
        expect(stored.annotations).toEqual(normalizePdfAnnotations(raw))
        expect(stored.annotations.map((item) => item.id)).toEqual(['a', 'b'])
    })

    it('非数组载荷 → invalid-payload，且不写盘', async () => {
        for (const payload of [null, undefined, 'x', 42, {}]) {
            await expect(savePdfAnnotationsForPath(pdfPath, payload)).resolves.toEqual({
                ok: false,
                error: 'invalid-payload'
            })
        }
        await expect(access(sidecarPath)).rejects.toThrow()
    })

    it('路径校验失败 → 对应错误码，且不写盘', async () => {
        await expect(
            savePdfAnnotationsForPath(path.join(tempDir, 'a.txt'), [makeAnnotation()])
        ).resolves.toEqual({ ok: false, error: 'invalid-extension' })
        mocks.isPathAllowed.mockReturnValue(false)
        await expect(savePdfAnnotationsForPath(pdfPath, [makeAnnotation()])).resolves.toEqual({
            ok: false,
            error: 'path-denied'
        })
        await expect(access(sidecarPath)).rejects.toThrow()
    })

    it('rename 失败 → write-failed，并清理 .tmp 临时文件（不留半写文件）', async () => {
        const renameSpy = vi
            .spyOn(fsPromises, 'rename')
            .mockRejectedValueOnce(Object.assign(new Error('EPERM'), { code: 'EPERM' }))
        await expect(savePdfAnnotationsForPath(pdfPath, [makeAnnotation()])).resolves.toEqual({
            ok: false,
            error: 'write-failed'
        })
        expect(mocks.logger.error).toHaveBeenCalled()
        await expect(access(`${sidecarPath}.tmp`)).rejects.toThrow()
        await expect(access(sidecarPath)).rejects.toThrow()
        renameSpy.mockRestore()
    })

    it('序列化后超过大小上限 → too-large，且不写盘', async () => {
        // 500 条 × 200 个矩形 + 2000 字文本：pretty JSON 超过 10 MiB
        const rect = { x: 0.1235, y: 0.1235, w: 0.1235, h: 0.1235 }
        const rects = Array.from({ length: 200 }, () => ({ ...rect }))
        const annotations: PdfAnnotation[] = Array.from({ length: 500 }, (_, index) => ({
            id: `id-${index}`,
            page: 1,
            text: '摘'.repeat(2000),
            createdAt: '2026-01-04T09:05:06.000Z',
            rects
        }))
        await expect(savePdfAnnotationsForPath(pdfPath, annotations)).resolves.toEqual({
            ok: false,
            error: 'too-large'
        })
        await expect(access(sidecarPath)).rejects.toThrow()
        expect(mocks.logger.warn).toHaveBeenCalled()
    })
})

describe('registerPdfAnnotationsIpc：注册形状与监听透传', () => {
    it('按契约注册 2 个 handle 通道并透传 componentId', () => {
        registerPdfAnnotationsIpc({} as never, 'global-pdf-annotations-ipc')
        expect(mocks.registerHandleOnce).toHaveBeenCalledTimes(2)
        const calls = mocks.registerHandleOnce.mock.calls.map((call) => ({
            channel: call[0],
            componentId: call[2]
        }))
        expect(calls).toEqual([
            {
                channel: IPC.FILE.LOAD_PDF_ANNOTATIONS,
                componentId: 'global-pdf-annotations-ipc'
            },
            {
                channel: IPC.FILE.SAVE_PDF_ANNOTATIONS,
                componentId: 'global-pdf-annotations-ipc'
            }
        ])
    })

    it('注册的监听器透传业务结果（读取空侧车 / 保存成功）', async () => {
        registerPdfAnnotationsIpc({} as never, 'global-pdf-annotations-ipc')
        const listeners = mocks.registerHandleOnce.mock.calls.map(
            (call) => call[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>
        )
        await expect(listeners[0]({}, pdfPath)).resolves.toEqual({ ok: true, annotations: [] })
        await expect(listeners[1]({}, pdfPath, [makeAnnotation()])).resolves.toEqual({ ok: true })
        await expect(listeners[0]({}, pdfPath)).resolves.toEqual({
            ok: true,
            annotations: [makeAnnotation()]
        })
    })
})
