/**
 * 1.5.2 E2：PDF 标注与摘录 —— shared 纯数据 + 纯函数（唯一真源）
 *
 * 设计约束（ARCH-05）：
 * - 本模块属 `src/shared` 叶子层：不依赖 Node / Electron / Vue / DOM，不做任何 IO；
 * - 只负责「侧车路径 / 标注归一化 / 稳定序列化 / 摘录 Markdown / 新标注生成」等可被
 *   主进程、渲染层与单测共同复用的纯逻辑；
 * - 侧车文件（`<pdfPath>.annotations.json`）的**读写与原子替换**只在主进程实现
 *   （`src/main/ipc/pdf-annotations-ipc.ts`），渲染层不得直接访问磁盘。
 *
 * 数据口径：
 * - 侧车文件为 UTF-8 JSON：`{ "version": 1, "annotations": PdfAnnotation[] }`；
 * - 归一化后字段只保留契约内字段（未知字段剥离）、id 去重、总量 ≤ 500、文本/备注裁剪、
 *   矩形清洗到页面内（0~1）且最多 200 个；
 * - 摘录格式固定为「逐行 `> ` 引用 + 空行 + 来源行」，供渲染层插入 Markdown 编辑器。
 */
import type {
    CreatePdfAnnotationInput,
    PdfAnnotation,
    PdfAnnotationRect
} from '../types/pdf-annotations'

/** 侧车文件后缀（与 PDF 同目录：`<pdfPath>.annotations.json`） */
export const PDF_ANNOTATIONS_SUFFIX = '.annotations.json'

/** 单份侧车文件最多保留的标注条数（超出按稳定排序截断） */
export const PDF_ANNOTATIONS_MAX_COUNT = 500

/** 单条标注选中文本最大长度（按 Unicode 码点计） */
export const PDF_ANNOTATION_TEXT_MAX = 2000

/** 单条标注备注最大长度（按 Unicode 码点计） */
export const PDF_ANNOTATION_NOTE_MAX = 1000

/** 单条标注最多保留的高亮矩形数量 */
export const PDF_ANNOTATION_RECTS_MAX = 200

/** 标注 id 最大长度（防御异常侧车数据） */
export const PDF_ANNOTATION_ID_MAX = 128

/** 页码上限（防御异常侧车数据；实际 PDF 页数远小于此） */
export const PDF_ANNOTATION_PAGE_MAX = 100000

/** 侧车文件读写大小上限（10 MiB；防止异常文件一次性读入造成内存压力） */
export const PDF_ANNOTATIONS_FILE_MAX_BYTES = 10 * 1024 * 1024

/** 侧车文件格式版本（后续结构升级时用于兼容判断） */
export const PDF_ANNOTATIONS_SIDECAR_VERSION = 1

/** 矩形坐标保留的小数位（4 位 ≈ 0.01% 页面精度，足够 overlay 使用） */
const RECT_PRECISION = 10000

/** 摘录来源行的固定前缀（多语言共用的符号部分） */
const EXCERPT_QUOTE_PREFIX = '> '
/** 摘录来源行前缀（`> —— `，破折号后跟文件名与页码） */
const EXCERPT_SOURCE_PREFIX = '> —— '

/**
 * 构造 PDF 侧车文件路径：`<pdfPath>` + `.annotations.json`。
 *
 * 纯字符串拼接（shared 层禁止引入 `node:path`）；调用方负责保证传入的是已解析绝对路径。
 * 非字符串 / 空串返回空串（调用方按非法路径处理）。
 */
export function buildPdfAnnotationsSidecarPath(pdfPath: string): string {
    if (typeof pdfPath !== 'string' || pdfPath.trim().length === 0) {
        return ''
    }
    return `${pdfPath}${PDF_ANNOTATIONS_SUFFIX}`
}

/** 是否为普通对象（非 null / 非数组） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 有限数值判断（拒绝 NaN / ±Infinity） */
function isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value)
}

/** 数值钳制到 [min, max] */
function clampNumber(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value))
}

/** 按 Unicode 码点裁剪文本（避免把代理对切成半个字符） */
function clampText(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') {
        return ''
    }
    const normalized = value.replace(/\r\n?/g, '\n').trim()
    if (normalized.length === 0) {
        return ''
    }
    const codePoints = Array.from(normalized)
    return codePoints.length > maxLength ? codePoints.slice(0, maxLength).join('') : normalized
}

/** 单行文本清洗（来源文件名等：换行/制表折叠为空格并裁剪长度） */
function sanitizeSingleLine(value: unknown, maxLength: number): string {
    if (typeof value !== 'string') {
        return ''
    }
    const normalized = value.replace(/[\r\n\t]+/g, ' ').trim()
    return normalized.length > maxLength ? normalized.slice(0, maxLength) : normalized
}

/** 标注 id 清洗：非空字符串、长度 ≤ 128、仅保留去空白后的值 */
function sanitizeAnnotationId(value: unknown): string {
    if (typeof value !== 'string') {
        return ''
    }
    const trimmed = value.trim()
    if (trimmed.length === 0 || trimmed.length > PDF_ANNOTATION_ID_MAX) {
        return ''
    }
    return trimmed
}

/** 生成标注 id：时间戳 36 进制 + 8 位随机后缀（非安全用途，仅需会话内几乎不碰撞） */
function generateAnnotationId(nowMs: number): string {
    const suffix = Math.random().toString(36).slice(2, 10)
    return `pdfa-${nowMs.toString(36)}-${suffix}`
}

/** 归一化创建时间：接受合法 ISO / Date 字符串或毫秒时间戳，返回 ISO 字符串；非法返回空串 */
function normalizeCreatedAt(value: unknown): string {
    if (typeof value === 'number' && isFiniteNumber(value) && value >= 0) {
        const date = new Date(value)
        return Number.isNaN(date.getTime()) ? '' : date.toISOString()
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Date.parse(value)
        return Number.isNaN(parsed) ? '' : new Date(parsed).toISOString()
    }
    return ''
}

/** 归一化页码：1-based 正整数且 ≤ 上限，非法返回 null */
function normalizePage(value: unknown): number | null {
    if (!isFiniteNumber(value)) {
        return null
    }
    const page = Math.floor(value)
    if (page < 1 || page > PDF_ANNOTATION_PAGE_MAX) {
        return null
    }
    return page
}

/**
 * 清洗单条矩形（相对页面 0~1）：
 * - 非对象 / 非有限数值 / 非正尺寸 → null；
 * - 超出页面右/下边界的部分裁掉（保证 `x + w <= 1`、`y + h <= 1`）；
 * - 坐标四舍五入到 4 位小数。
 */
function sanitizePdfAnnotationRect(raw: unknown): PdfAnnotationRect | null {
    if (!isPlainObject(raw)) {
        return null
    }
    const { x, y, w, h } = raw
    if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(w) || !isFiniteNumber(h)) {
        return null
    }
    const left = clampNumber(x, 0, 1)
    const top = clampNumber(y, 0, 1)
    const width = clampNumber(w, 0, 1 - left)
    const height = clampNumber(h, 0, 1 - top)
    if (width <= 0 || height <= 0) {
        return null
    }
    const round = (value: number): number => Math.round(value * RECT_PRECISION) / RECT_PRECISION
    return { x: round(left), y: round(top), w: round(width), h: round(height) }
}

/**
 * 清洗矩形数组：逐项过滤非法项、最多保留 `PDF_ANNOTATION_RECTS_MAX`（200）个。
 *
 * 非数组输入返回空数组（不抛异常），供创建标注与侧车归一化共用。
 */
export function sanitizePdfAnnotationRects(raw: unknown): PdfAnnotationRect[] {
    if (!Array.isArray(raw)) {
        return []
    }
    const rects: PdfAnnotationRect[] = []
    for (const item of raw) {
        if (rects.length >= PDF_ANNOTATION_RECTS_MAX) {
            break
        }
        const rect = sanitizePdfAnnotationRect(item)
        if (rect !== null) {
            rects.push(rect)
        }
    }
    return rects
}

/**
 * 归一化单条标注（来自侧车 JSON 的未知数据）：
 * - id / page / text / createdAt 任一非法 → null（丢弃该条，其余标注继续保留）；
 * - text / note 裁剪到上限，rects 清洗与截断，未知字段一律剥离。
 */
function normalizePdfAnnotation(raw: unknown): PdfAnnotation | null {
    if (!isPlainObject(raw)) {
        return null
    }
    const id = sanitizeAnnotationId(raw.id)
    if (id.length === 0) {
        return null
    }
    const page = normalizePage(raw.page)
    if (page === null) {
        return null
    }
    const text = clampText(raw.text, PDF_ANNOTATION_TEXT_MAX)
    if (text.length === 0) {
        return null
    }
    const createdAt = normalizeCreatedAt(raw.createdAt)
    if (createdAt.length === 0) {
        return null
    }
    const normalized: PdfAnnotation = {
        id,
        page,
        text,
        createdAt,
        rects: sanitizePdfAnnotationRects(raw.rects)
    }
    const note = clampText(raw.note, PDF_ANNOTATION_NOTE_MAX)
    if (note.length > 0) {
        normalized.note = note
    }
    return normalized
}

/** 稳定排序：页码升序 → 创建时间升序 → id 升序（同值保持确定性输出） */
function comparePdfAnnotations(a: PdfAnnotation, b: PdfAnnotation): number {
    if (a.page !== b.page) {
        return a.page - b.page
    }
    if (a.createdAt !== b.createdAt) {
        return a.createdAt < b.createdAt ? -1 : 1
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/** 归一化扫描的候选条数硬上限（防异常超大数组造成 CPU 压力） */
const NORMALIZE_SCAN_MAX = PDF_ANNOTATIONS_MAX_COUNT * 8

/**
 * 归一化侧车文件中的任意数据（读取容错核心）：
 *
 * - 接受两种形态：`PdfAnnotation[]`（历史/手工写入的裸数组）或
 *   `{ annotations: PdfAnnotation[] }`（本模块 `serializePdfAnnotations` 的产物）；
 * - 其他形态（null / 对象 / 字符串 / 数字）返回空数组，不抛异常；
 * - 单条字段类型非法 → 丢弃该条；id 重复 → 保留首条；未知字段剥离；
 * - 最终按 `page → createdAt → id` 稳定排序并截断到 `PDF_ANNOTATIONS_MAX_COUNT`。
 *
 * @param raw JSON.parse 后的任意值（损坏数据由调用方捕获 JSON 解析异常）
 * @returns 可直接渲染/保存的标注数组（保证为普通对象 + 纯 JSON 值）
 */
export function normalizePdfAnnotations(raw: unknown): PdfAnnotation[] {
    let candidate: unknown[]
    if (Array.isArray(raw)) {
        candidate = raw
    } else if (isPlainObject(raw) && Array.isArray(raw.annotations)) {
        candidate = raw.annotations
    } else {
        return []
    }
    const scanLimit = Math.min(candidate.length, NORMALIZE_SCAN_MAX)
    const byId = new Map<string, PdfAnnotation>()
    for (let index = 0; index < scanLimit; index += 1) {
        if (byId.size >= PDF_ANNOTATIONS_MAX_COUNT) {
            break
        }
        const normalized = normalizePdfAnnotation(candidate[index])
        if (normalized !== null && !byId.has(normalized.id)) {
            byId.set(normalized.id, normalized)
        }
    }
    return [...byId.values()].sort(comparePdfAnnotations).slice(0, PDF_ANNOTATIONS_MAX_COUNT)
}

/**
 * 稳定序列化侧车文件内容（写盘用，保证同内容产出字节一致、便于 diff 与测试）：
 * `{ "version": 1, "annotations": [...稳定排序...] }` + 2 空格缩进 + 末尾换行。
 *
 * 入参在序列化前会再归一化一次（防御渲染层传入的异常数据），因此该函数同时是
 * 「保存前清洗」入口；渲染层与主进程均可安全调用。
 */
export function serializePdfAnnotations(list: readonly PdfAnnotation[] | unknown): string {
    const payload = {
        version: PDF_ANNOTATIONS_SIDECAR_VERSION,
        annotations: normalizePdfAnnotations(list)
    }
    return `${JSON.stringify(payload, null, 2)}\n`
}

/**
 * 创建新标注（渲染层点击「添加标注」时调用）：
 *
 * - 页码非法 / 文本为空 → 返回 null（调用方给出可见提示，不生成半合法数据）；
 * - id 缺省按「时间戳 + 随机后缀」生成；`createdAt` 缺省取当前时间；
 * - 文本 / 备注按上限裁剪，矩形清洗到页面内且最多 200 个。
 *
 * @param input 标注输入（页码 / 文本 / 矩形 / 可选备注与测试注入项）
 * @returns 合法标注，或 null 表示输入不可用
 */
export function createPdfAnnotation(input: CreatePdfAnnotationInput): PdfAnnotation | null {
    if (!isPlainObject(input)) {
        return null
    }
    const page = normalizePage((input as CreatePdfAnnotationInput).page)
    if (page === null) {
        return null
    }
    const text = clampText((input as CreatePdfAnnotationInput).text, PDF_ANNOTATION_TEXT_MAX)
    if (text.length === 0) {
        return null
    }
    const now = Date.now()
    const id =
        sanitizeAnnotationId((input as CreatePdfAnnotationInput).id) || generateAnnotationId(now)
    const createdAt =
        normalizeCreatedAt((input as CreatePdfAnnotationInput).createdAt) ||
        new Date(now).toISOString()
    const annotation: PdfAnnotation = {
        id,
        page,
        text,
        createdAt,
        rects: sanitizePdfAnnotationRects((input as CreatePdfAnnotationInput).rects)
    }
    const note = clampText((input as CreatePdfAnnotationInput).note, PDF_ANNOTATION_NOTE_MAX)
    if (note.length > 0) {
        annotation.note = note
    }
    return annotation
}

/** `buildPdfExcerptMarkdown` 入参 */
export interface PdfExcerptInput {
    /** 摘录文本（选中文本；空/纯空白返回空串） */
    text: string
    /** PDF 文件名（来源行展示用；空值降级为省略文件名） */
    pdfFileName: string
    /** 页码（1-based；非法值按第 1 页处理） */
    page: number
}

/**
 * 生成摘录 Markdown 块（纯函数，渲染层插入编辑器 / 复制剪贴板共用）：
 *
 * ```
 * > 第一行
 * > 第二行
 *
 * > —— 手册.pdf · 第 3 页
 * ```
 *
 * - 多行文本逐行加 `> ` 前缀；空行输出 `>`（保持引用块连续）；
 * - 文本为空 / 纯空白 → 返回空串（调用方不得插入空内容）；
 * - 文件名做单行清洗（换行/制表折叠、长度上限 200），空文件名时来源行降级为
 *   `> —— 第 N 页`；
 * - 页码非法（非数值 / <1）按 1 处理，防止把 NaN 写入摘录。
 */
export function buildPdfExcerptMarkdown(input: PdfExcerptInput): string {
    if (!isPlainObject(input)) {
        return ''
    }
    const rawText = (input as PdfExcerptInput).text
    if (typeof rawText !== 'string') {
        return ''
    }
    const normalized = rawText
        .replace(/\r\n?/g, '\n')
        .split('\n')
        .map((line) => line.replace(/[ \t]+$/u, ''))
        .join('\n')
        .replace(/^\n+|\n+$/g, '')
    if (normalized.trim().length === 0) {
        return ''
    }
    const page = normalizePage((input as PdfExcerptInput).page) ?? 1
    const fileName = sanitizeSingleLine((input as PdfExcerptInput).pdfFileName, 200)
    const quotedLines = normalized
        .split('\n')
        .map((line) => (line.length > 0 ? `${EXCERPT_QUOTE_PREFIX}${line}` : '>'))
    const sourceLine =
        fileName.length > 0
            ? `${EXCERPT_SOURCE_PREFIX}${fileName} · 第 ${page} 页`
            : `${EXCERPT_SOURCE_PREFIX}第 ${page} 页`
    return `${quotedLines.join('\n')}\n\n${sourceLine}`
}
