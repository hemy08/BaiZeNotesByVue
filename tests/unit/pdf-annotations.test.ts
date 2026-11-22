/**
 * 1.5.2 E2：PDF 标注与摘录 —— shared 纯函数单测（`src/shared/constants/pdf-annotations.ts`）
 *
 * 覆盖口径：
 * 1. 常量口径（侧车后缀 / 数量上限 / 文本与备注上限）；
 * 2. 侧车路径生成（拼接、空输入容错）；
 * 3. normalize 容错：裸数组 / 对象包裹、非法条目丢弃、字段类型清洗、id 去重、
 *    未知字段剥离、rects 清洗（0~1 + 最多 200）、上限截断、稳定排序；
 * 4. serialize 稳定 JSON（版本号 + 排序 + 末尾换行 + 幂等）；
 * 5. buildPdfExcerptMarkdown：多行 `> ` 前缀、空文本、空文件名、页码安全、换行注入清洗；
 * 6. createPdfAnnotation：id/createdAt 生成与注入、文本/备注裁剪、rects 清洗、非法输入。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import {
    PDF_ANNOTATIONS_FILE_MAX_BYTES,
    PDF_ANNOTATIONS_MAX_COUNT,
    PDF_ANNOTATIONS_SIDECAR_VERSION,
    PDF_ANNOTATIONS_SUFFIX,
    PDF_ANNOTATION_NOTE_MAX,
    PDF_ANNOTATION_RECTS_MAX,
    PDF_ANNOTATION_TEXT_MAX,
    buildPdfAnnotationsSidecarPath,
    buildPdfExcerptMarkdown,
    createPdfAnnotation,
    normalizePdfAnnotations,
    sanitizePdfAnnotationRects,
    serializePdfAnnotations
} from '../../src/shared/constants/pdf-annotations'
import type { PdfAnnotation } from '../../src/shared/types/pdf-annotations'

/** 构造一条合法标注（便于各用例局部覆盖字段） */
function makeAnnotation(overrides: Partial<PdfAnnotation> = {}): PdfAnnotation {
    return {
        id: 'a1',
        page: 1,
        text: '文本',
        createdAt: '2026-01-04T09:05:06.000Z',
        rects: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.05 }],
        ...overrides
    }
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('常量口径', () => {
    it('侧车后缀为 .annotations.json，数量/文本/备注上限符合契约', () => {
        expect(PDF_ANNOTATIONS_SUFFIX).toBe('.annotations.json')
        expect(PDF_ANNOTATIONS_MAX_COUNT).toBe(500)
        expect(PDF_ANNOTATION_TEXT_MAX).toBe(2000)
        expect(PDF_ANNOTATION_NOTE_MAX).toBe(1000)
        expect(PDF_ANNOTATION_RECTS_MAX).toBe(200)
        expect(PDF_ANNOTATIONS_FILE_MAX_BYTES).toBe(10 * 1024 * 1024)
        expect(PDF_ANNOTATIONS_SIDECAR_VERSION).toBe(1)
    })
})

describe('buildPdfAnnotationsSidecarPath', () => {
    it('在 PDF 路径后追加 .annotations.json（保留原扩展名）', () => {
        expect(buildPdfAnnotationsSidecarPath('C:\\docs\\manual.pdf')).toBe(
            'C:\\docs\\manual.pdf.annotations.json'
        )
        expect(buildPdfAnnotationsSidecarPath('/home/u/a.PDF')).toBe(
            '/home/u/a.PDF.annotations.json'
        )
    })

    it('非字符串 / 空串 / 空白返回空串（不抛异常）', () => {
        expect(buildPdfAnnotationsSidecarPath('')).toBe('')
        expect(buildPdfAnnotationsSidecarPath('   ')).toBe('')
        expect(buildPdfAnnotationsSidecarPath(42 as unknown as string)).toBe('')
        expect(buildPdfAnnotationsSidecarPath(null as unknown as string)).toBe('')
    })
})

describe('normalizePdfAnnotations：容错归一化', () => {
    it('接受裸数组与 { annotations: [] } 两种形态', () => {
        const raw = [makeAnnotation()]
        expect(normalizePdfAnnotations(raw)).toHaveLength(1)
        expect(normalizePdfAnnotations({ version: 1, annotations: raw })).toHaveLength(1)
    })

    it('非数组 / null / 字符串 / 数字 / 无 annotations 对象返回空数组', () => {
        for (const raw of [null, undefined, 'x', 42, {}, { annotations: 'x' }, [1, 2]]) {
            expect(normalizePdfAnnotations(raw)).toEqual([])
        }
    })

    it('丢弃结构非法条目（非对象 / 缺 id / 非法页码 / 空文本 / 非法时间）', () => {
        const result = normalizePdfAnnotations([
            null,
            'str',
            [],
            makeAnnotation({ id: '' }),
            makeAnnotation({ id: '  ' }),
            makeAnnotation({ page: 0 }),
            makeAnnotation({ page: -1 }),
            makeAnnotation({ page: 1.2 }),
            makeAnnotation({ page: '3' as unknown as number }),
            makeAnnotation({ text: '   ' }),
            makeAnnotation({ text: 42 as unknown as string }),
            makeAnnotation({ createdAt: 'not-a-date' }),
            makeAnnotation()
        ])
        expect(result).toEqual([makeAnnotation()])
    })

    it('id 去重（保留首条）并按 page → createdAt → id 稳定排序', () => {
        const result = normalizePdfAnnotations([
            makeAnnotation({ id: 'b', page: 2, createdAt: '2026-01-02T00:00:00.000Z' }),
            makeAnnotation({ id: 'a', page: 1, createdAt: '2026-01-02T00:00:00.000Z' }),
            makeAnnotation({ id: 'a', page: 9, text: '重复 id 保留首条' }),
            makeAnnotation({ id: 'c', page: 2, createdAt: '2026-01-01T00:00:00.000Z' })
        ])
        expect(result.map((item) => item.id)).toEqual(['a', 'c', 'b'])
        // 首条 a 是 page=1 的那条，重复 id 的 page=9 被丢弃
        expect(result[0].page).toBe(1)
    })

    it('剥离未知字段（只保留契约字段）', () => {
        const result = normalizePdfAnnotations([
            {
                id: 'x',
                page: 1,
                text: '正文',
                createdAt: '2026-01-01T00:00:00.000Z',
                rects: [],
                hacked: '<script>',
                extra: { nested: true }
            }
        ])
        expect(result).toHaveLength(1)
        expect(Object.keys(result[0]).sort()).toEqual(
            ['createdAt', 'id', 'page', 'rects', 'text'].sort()
        )
        expect(result[0]).not.toHaveProperty('hacked')
        expect(result[0]).not.toHaveProperty('extra')
    })

    it('文本/备注按上限裁剪，空备注不保留 note 字段', () => {
        const longText = '文'.repeat(PDF_ANNOTATION_TEXT_MAX + 20)
        const longNote = '注'.repeat(PDF_ANNOTATION_NOTE_MAX + 20)
        const [clamped] = normalizePdfAnnotations([
            makeAnnotation({ text: longText, note: longNote })
        ])
        expect(Array.from(clamped.text)).toHaveLength(PDF_ANNOTATION_TEXT_MAX)
        expect(Array.from(clamped.note ?? '')).toHaveLength(PDF_ANNOTATION_NOTE_MAX)

        const [withoutNote] = normalizePdfAnnotations([makeAnnotation({ note: '   ' })])
        expect(withoutNote).not.toHaveProperty('note')
        const [invalidNote] = normalizePdfAnnotations([
            makeAnnotation({ note: 42 as unknown as string })
        ])
        expect(invalidNote).not.toHaveProperty('note')
    })

    it('rects 清洗：越界 clamp、非有限值/非正尺寸丢弃、NaN 清理、最多 200 个', () => {
        const cleaned = normalizePdfAnnotations([
            makeAnnotation({
                rects: [
                    { x: -0.2, y: -0.1, w: 0.5, h: 0.5 },
                    { x: 0.9, y: 0.9, w: 0.5, h: 0.5 },
                    { x: Number.NaN, y: 0, w: 0.1, h: 0.1 },
                    { x: 0.1, y: 0.1, w: 0, h: 0.1 },
                    { x: 0.1, y: 0.1, w: 0.1, h: -1 },
                    { x: 0.1, y: 0.1, w: Number.POSITIVE_INFINITY, h: 0.1 },
                    'not-a-rect',
                    null
                ] as never
            })
        ])[0].rects
        expect(cleaned).toEqual([
            { x: 0, y: 0, w: 0.5, h: 0.5 },
            { x: 0.9, y: 0.9, w: 0.1, h: 0.1 }
        ])

        const many = Array.from({ length: PDF_ANNOTATION_RECTS_MAX + 50 }, () => ({
            x: 0.1,
            y: 0.1,
            w: 0.2,
            h: 0.02
        }))
        const [clamped] = normalizePdfAnnotations([makeAnnotation({ rects: many })])
        expect(clamped.rects).toHaveLength(PDF_ANNOTATION_RECTS_MAX)
    })

    it('总量上限截断到 500 条（稳定排序后保留前 500）', () => {
        const raw = Array.from({ length: PDF_ANNOTATIONS_MAX_COUNT + 100 }, (_, index) =>
            makeAnnotation({
                id: `id-${index}`,
                page: 1,
                createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString()
            })
        )
        const result = normalizePdfAnnotations(raw)
        expect(result).toHaveLength(PDF_ANNOTATIONS_MAX_COUNT)
        expect(result[0].id).toBe('id-0')
        expect(result[result.length - 1].id).toBe(`id-${PDF_ANNOTATIONS_MAX_COUNT - 1}`)
    })

    it('时间字段兼容毫秒时间戳，统一转 ISO 字符串', () => {
        const [normalized] = normalizePdfAnnotations([
            makeAnnotation({ createdAt: Date.UTC(2026, 0, 4, 9, 5, 6) as unknown as string })
        ])
        expect(normalized.createdAt).toBe('2026-01-04T09:05:06.000Z')
    })
})

describe('sanitizePdfAnnotationRects', () => {
    it('非数组返回空数组；合法矩形保留 4 位小数', () => {
        expect(sanitizePdfAnnotationRects(null)).toEqual([])
        expect(sanitizePdfAnnotationRects('x')).toEqual([])
        expect(sanitizePdfAnnotationRects([{ x: 0.123456, y: 0.2, w: 0.3, h: 0.4 }])).toEqual([
            { x: 0.1235, y: 0.2, w: 0.3, h: 0.4 }
        ])
    })
})

describe('serializePdfAnnotations：稳定 JSON', () => {
    it('输出 { version: 1, annotations: [...] } + 2 空格缩进 + 末尾换行', () => {
        const json = serializePdfAnnotations([makeAnnotation()])
        expect(json.endsWith('\n')).toBe(true)
        const parsed = JSON.parse(json) as { version: number; annotations: PdfAnnotation[] }
        expect(parsed.version).toBe(PDF_ANNOTATIONS_SIDECAR_VERSION)
        expect(parsed.annotations).toEqual([makeAnnotation()])
        expect(json).toContain('\n  "version": 1,')
    })

    it('乱序/含非法字段的入参序列化前会被归一化，且同内容输出字节一致', () => {
        const first = serializePdfAnnotations([
            makeAnnotation({ id: 'b', page: 2 }),
            makeAnnotation({ id: 'a', page: 1 }),
            { bogus: true } as unknown as PdfAnnotation
        ])
        const second = serializePdfAnnotations([
            makeAnnotation({ id: 'a', page: 1 }),
            makeAnnotation({ id: 'b', page: 2 })
        ])
        expect(first).toBe(second)
    })
})

describe('buildPdfExcerptMarkdown：摘录 Markdown', () => {
    const PDF_NAME = '手册.pdf'

    it('多行文本逐行加 > 前缀，空行输出 >，并附来源行', () => {
        expect(
            buildPdfExcerptMarkdown({
                text: '第一行\n第二行\n\n第四行',
                pdfFileName: PDF_NAME,
                page: 3
            })
        ).toBe('> 第一行\n> 第二行\n>\n> 第四行\n\n> —— 手册.pdf · 第 3 页')
    })

    it('CRLF 归一化并去掉首尾空行/行尾空白', () => {
        expect(
            buildPdfExcerptMarkdown({
                text: '\r\n第一行   \r\n第二行\r\n\r\n',
                pdfFileName: PDF_NAME,
                page: 1
            })
        ).toBe('> 第一行\n> 第二行\n\n> —— 手册.pdf · 第 1 页')
    })

    it('空文本 / 纯空白 / 非字符串返回空串（调用方不得插入空内容）', () => {
        for (const text of ['', '   ', '\r\n\t', null, 42]) {
            expect(
                buildPdfExcerptMarkdown({
                    text: text as unknown as string,
                    pdfFileName: PDF_NAME,
                    page: 1
                })
            ).toBe('')
        }
    })

    it('空文件名时来源行降级为省略文件名；文件名中的换行被折叠（防注入）', () => {
        expect(buildPdfExcerptMarkdown({ text: '正文', pdfFileName: '', page: 2 })).toBe(
            '> 正文\n\n> —— 第 2 页'
        )
        expect(
            buildPdfExcerptMarkdown({
                text: '正文',
                pdfFileName: 'a\nb\tc.pdf',
                page: 2
            })
        ).toBe('> 正文\n\n> —— a b c.pdf · 第 2 页')
    })

    it('页码非法（NaN/0/负数/小数）按安全值处理，不写入 NaN', () => {
        for (const page of [Number.NaN, 0, -3, 2.9, '3' as unknown as number]) {
            const markdown = buildPdfExcerptMarkdown({
                text: '正文',
                pdfFileName: PDF_NAME,
                page
            })
            expect(markdown).not.toContain('NaN')
            expect(markdown).toMatch(/第 [1-9]\d* 页$/)
        }
    })

    it('首行以 > 开头时仍保持合法引用块（不会产生嵌套引用歧义）', () => {
        expect(
            buildPdfExcerptMarkdown({
                text: '> 已引用文本',
                pdfFileName: PDF_NAME,
                page: 1
            })
        ).toBe('> > 已引用文本\n\n> —— 手册.pdf · 第 1 页')
    })
})

describe('createPdfAnnotation：新标注生成与清洗', () => {
    it('缺省生成 id 与 createdAt（时间戳 + 随机后缀 / ISO 时间）', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1_767_000_000_000)
        const created = createPdfAnnotation({ page: 2, text: '选中的文本' })
        expect(created).not.toBeNull()
        expect(created!.id).toMatch(/^pdfa-[a-z0-9]+-[a-z0-9]+$/)
        expect(created!.createdAt).toBe(new Date(1_767_000_000_000).toISOString())
        expect(created!.page).toBe(2)
        expect(created!.text).toBe('选中的文本')
        expect(created!.rects).toEqual([])
        expect(created).not.toHaveProperty('note')
    })

    it('支持注入 id / createdAt 并清洗文本、备注与矩形', () => {
        const created = createPdfAnnotation({
            page: 3,
            text: '  a\r\nb  ',
            id: ' fixed-id ',
            createdAt: '2026-01-04T09:05:06.000Z',
            note: '  备注  ',
            rects: [
                { x: -1, y: 0.5, w: 0.2, h: 0.1 },
                { x: 0.1, y: 0.1, w: 0.2, h: 0.02 }
            ]
        })
        expect(created).toEqual({
            id: 'fixed-id',
            page: 3,
            text: 'a\nb',
            createdAt: '2026-01-04T09:05:06.000Z',
            note: '备注',
            rects: [
                { x: 0, y: 0.5, w: 0.2, h: 0.1 },
                { x: 0.1, y: 0.1, w: 0.2, h: 0.02 }
            ]
        })
    })

    it('非法页码 / 空文本 / 非对象输入返回 null', () => {
        expect(createPdfAnnotation({ page: 0, text: 'x' })).toBeNull()
        expect(createPdfAnnotation({ page: Number.NaN, text: 'x' })).toBeNull()
        expect(createPdfAnnotation({ page: 1, text: '   ' })).toBeNull()
        expect(createPdfAnnotation({ page: 1, text: 42 as unknown as string })).toBeNull()
        expect(createPdfAnnotation(null as never)).toBeNull()
    })

    it('文本/备注超长时按码点裁剪（不切坏代理对）', () => {
        const created = createPdfAnnotation({
            page: 1,
            text: '😀'.repeat(PDF_ANNOTATION_TEXT_MAX + 10),
            note: '注'.repeat(PDF_ANNOTATION_NOTE_MAX + 10)
        })
        expect(created).not.toBeNull()
        expect(Array.from(created!.text)).toHaveLength(PDF_ANNOTATION_TEXT_MAX)
        expect(Array.from(created!.note ?? '')).toHaveLength(PDF_ANNOTATION_NOTE_MAX)
        // 裁剪后最后一个码点仍是完整 emoji（不是半个代理对）
        expect(created!.text.endsWith('😀')).toBe(true)
    })
})
