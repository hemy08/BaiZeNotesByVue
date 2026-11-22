/**
 * 1.5.2 E3 图片 OCR —— shared 纯常量/纯函数单测（`src/shared/constants/ocr.ts`）
 *
 * 覆盖口径：
 * 1. 语言白名单（MVP 仅 eng）、默认语言、标签与非法值判定（含原型链键防穿透）；
 * 2. 官方语言包下载源（https / 版本固定 / 仅白名单语言可构造 / 主备两个源）；
 * 3. 字节上限常量（图片 20 MiB、语言包 20 MiB / 最小 1 MiB）与 gzip/PNG 魔数校验；
 * 4. 文本归一化（CRLF/控制字符/行尾空白/多余空行/首尾空白/段落保留）；
 * 5. 插入 Markdown 构造（可选来源标注行、空文本、label 空白处理）；
 * 6. 体积文案格式化。
 */
import { describe, expect, it } from 'vitest'
import {
    OCR_DEFAULT_LANGUAGE,
    OCR_IMAGE_MAX_BYTES,
    OCR_LANGUAGES,
    OCR_LANGUAGE_IDS,
    OCR_TESSDATA_MAX_BYTES,
    OCR_TESSDATA_MIN_BYTES,
    OCR_TESSDATA_SOURCES,
    buildOcrInsertMarkdown,
    buildOcrTessdataFileName,
    buildOcrTessdataUrl,
    formatOcrSizeLimit,
    getOcrLanguageLabel,
    isOcrLanguage,
    isPngImageBytes,
    isValidOcrTessdataBytes,
    normalizeOcrText
} from '../../src/shared/constants/ocr'

/** PNG 文件头（8 字节魔数） */
const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** 构造「合法大小 + gzip 魔数」语言包字节（只校验魔数与区间，不真正解压） */
function makeGzipBytes(size: number): Uint8Array {
    const bytes = new Uint8Array(size)
    bytes[0] = 0x1f
    bytes[1] = 0x8b
    return bytes
}

describe('OCR 语言白名单（MVP 仅 eng）', () => {
    it('白名单只有 eng，默认语言为 eng，标签为语言自名 English（不翻译）', () => {
        expect(OCR_LANGUAGE_IDS).toEqual(['eng'])
        expect(Object.keys(OCR_LANGUAGES)).toEqual(['eng'])
        expect(OCR_DEFAULT_LANGUAGE).toBe('eng')
        expect(OCR_LANGUAGES.eng.code).toBe('eng')
        expect(getOcrLanguageLabel('eng')).toBe('English')
    })

    it('isOcrLanguage 只接受白名单内的字符串（含原型链键防穿透）', () => {
        expect(isOcrLanguage('eng')).toBe(true)
        for (const value of [
            'chi_sim',
            'ENG',
            '',
            ' eng',
            null,
            undefined,
            42,
            true,
            {},
            ['eng'],
            '__proto__',
            'toString',
            'constructor'
        ]) {
            expect(isOcrLanguage(value), `isOcrLanguage(${String(value)})`).toBe(false)
        }
    })
})

describe('语言包下载源（官方 https 白名单）', () => {
    it('提供主备两个官方源，id 稳定、文件名为 <lang>.traineddata.gz', () => {
        expect(OCR_TESSDATA_SOURCES).toHaveLength(2)
        expect(OCR_TESSDATA_SOURCES.map((source) => source.id)).toEqual([
            'jsdelivr-tesseract-js-data',
            'projectnaptha-tessdata'
        ])
        expect(buildOcrTessdataFileName('eng')).toBe('eng.traineddata.gz')
    })

    it('默认返回主源（LSTM-only 数据），sourceIndex=1 返回备用源；均为固定 https 地址', () => {
        const primary = buildOcrTessdataUrl('eng')
        const fallback = buildOcrTessdataUrl('eng', 1)
        expect(primary).toBe(
            'https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'
        )
        expect(fallback).toBe('https://tessdata.projectnaptha.com/4.0.0/eng.traineddata.gz')
        for (const url of [primary, fallback]) {
            const parsed = new URL(url)
            expect(parsed.protocol).toBe('https:')
            expect(parsed.search).toBe('')
            expect(parsed.username).toBe('')
            expect(parsed.password).toBe('')
            expect(parsed.pathname.endsWith('/eng.traineddata.gz')).toBe(true)
        }
    })

    it('sourceIndex 越界时回退主源（防御性口径）', () => {
        expect(buildOcrTessdataUrl('eng', 99)).toBe(buildOcrTessdataUrl('eng'))
        expect(buildOcrTessdataUrl('eng', -1)).toBe(buildOcrTessdataUrl('eng'))
    })
})

describe('字节上限与魔数校验', () => {
    it('图片上限 20 MiB；语言包上限 20 MiB、下限 1 MiB', () => {
        expect(OCR_IMAGE_MAX_BYTES).toBe(20 * 1024 * 1024)
        expect(OCR_TESSDATA_MAX_BYTES).toBe(20 * 1024 * 1024)
        expect(OCR_TESSDATA_MIN_BYTES).toBe(1024 * 1024)
    })

    it('isPngImageBytes：仅 8 字节 PNG 魔数通过（长度不足/魔数不符/空值拒绝）', () => {
        expect(isPngImageBytes(new Uint8Array(PNG_HEADER))).toBe(true)
        expect(isPngImageBytes(new Uint8Array([...PNG_HEADER, 0x00]))).toBe(true)
        expect(isPngImageBytes(new Uint8Array(PNG_HEADER.slice(0, 7)))).toBe(false)
        expect(isPngImageBytes(new Uint8Array([0xff, ...PNG_HEADER.slice(1)]))).toBe(false)
        expect(isPngImageBytes(new Uint8Array([0x42, 0x4d]))).toBe(false) // BMP
        expect(isPngImageBytes(new Uint8Array([]))).toBe(false)
        expect(isPngImageBytes(null)).toBe(false)
        expect(isPngImageBytes(undefined)).toBe(false)
    })

    it('isValidOcrTessdataBytes：gzip 魔数 + [1 MiB, 20 MiB] 区间', () => {
        expect(isValidOcrTessdataBytes(makeGzipBytes(OCR_TESSDATA_MIN_BYTES))).toBe(true)
        expect(isValidOcrTessdataBytes(makeGzipBytes(OCR_TESSDATA_MAX_BYTES))).toBe(true)
        // 小于下限 / 大于上限 / 非 gzip 魔数
        expect(isValidOcrTessdataBytes(makeGzipBytes(OCR_TESSDATA_MIN_BYTES - 1))).toBe(false)
        expect(isValidOcrTessdataBytes(makeGzipBytes(OCR_TESSDATA_MAX_BYTES + 1))).toBe(false)
        const wrongMagic = makeGzipBytes(OCR_TESSDATA_MIN_BYTES)
        wrongMagic[0] = 0x1e
        expect(isValidOcrTessdataBytes(wrongMagic)).toBe(false)
        expect(isValidOcrTessdataBytes(null)).toBe(false)
        expect(isValidOcrTessdataBytes(undefined)).toBe(false)
    })
})

describe('normalizeOcrText：识别文本归一化', () => {
    it('统一换行：CRLF / 单独 CR → LF', () => {
        expect(normalizeOcrText('a\r\nb\rc')).toBe('a\nb\nc')
    })

    it('剥离控制字符，但保留换行与制表符', () => {
        expect(normalizeOcrText('a\u0000b\u000bc\u001fd')).toBe('abcd')
        expect(normalizeOcrText('\ta\tb')).toBe('\ta\tb')
    })

    it('去掉逐行行尾空格/制表符', () => {
        expect(normalizeOcrText('第一行   \n第二行\t\n第三行')).toBe('第一行\n第二行\n第三行')
    })

    it('连续空行折叠为 1 行空行（保留段落），并去掉首尾空行', () => {
        expect(normalizeOcrText('\n\n第一段\n\n\n\n第二段\n\n\n')).toBe('第一段\n\n第二段')
        expect(normalizeOcrText('a\n\n\nb')).toBe('a\n\nb')
        // 单个空行（段落分隔）保持不变
        expect(normalizeOcrText('a\n\nb')).toBe('a\n\nb')
    })

    it('空串 / 纯空白 / 非字符串输入 → 空串', () => {
        expect(normalizeOcrText('')).toBe('')
        expect(normalizeOcrText('   \n\t\n  ')).toBe('')
        expect(normalizeOcrText(undefined as unknown as string)).toBe('')
        expect(normalizeOcrText(null as unknown as string)).toBe('')
    })
})

describe('buildOcrInsertMarkdown：插入当前笔记的 Markdown', () => {
    it('无来源标注时只返回归一化原文', () => {
        expect(buildOcrInsertMarkdown('Hello\r\n\r\n\r\nWorld')).toBe('Hello\n\nWorld')
        // 逐行去行尾空白，但保留首行缩进（列表/代码块语义）
        expect(buildOcrInsertMarkdown('  单行  ')).toBe('  单行')
        expect(buildOcrInsertMarkdown('\t缩进行\t')).toBe('\t缩进行')
    })

    it('传来源标注时末尾追加引用式说明行（固定格式）', () => {
        expect(buildOcrInsertMarkdown('Hello', '来自图片文字识别')).toBe(
            'Hello\n\n> —— 来自图片文字识别'
        )
        expect(buildOcrInsertMarkdown('A\n\nB', 'From image text recognition')).toBe(
            'A\n\nB\n\n> —— From image text recognition'
        )
    })

    it('来源标注为空白/非字符串时省略；正文为空时返回空串（不插入空内容）', () => {
        expect(buildOcrInsertMarkdown('Hello', '   ')).toBe('Hello')
        expect(buildOcrInsertMarkdown('Hello', undefined)).toBe('Hello')
        expect(buildOcrInsertMarkdown('Hello', 42 as unknown as string)).toBe('Hello')
        expect(buildOcrInsertMarkdown('', '来源')).toBe('')
        expect(buildOcrInsertMarkdown('  \n\n ', '来源')).toBe('')
    })
})

describe('formatOcrSizeLimit：体积文案', () => {
    it('整 MiB / 整 KiB / 普通字节三种格式', () => {
        expect(formatOcrSizeLimit(20 * 1024 * 1024)).toBe('20 MiB')
        expect(formatOcrSizeLimit(1024 * 1024)).toBe('1 MiB')
        expect(formatOcrSizeLimit(512 * 1024)).toBe('512 KiB')
        expect(formatOcrSizeLimit(1536)).toBe('1536 B')
        expect(formatOcrSizeLimit(123)).toBe('123 B')
    })
})
