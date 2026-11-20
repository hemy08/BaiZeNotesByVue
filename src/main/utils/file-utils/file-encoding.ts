/**
 * 文件编码探测与读写模块（主进程）
 *
 * CQ-7：从 file-operations.ts 拆出（原文件 2,390 行 → 多模块），职责：
 * - 编码名归一化（jschardet 返回名 → iconv-lite 可用名）；
 * - 编码探测 / 一次性解码 / 按原编码写回（BOM 处理、iconv-lite 转码）；
 * - PF-10 大文件流式分块读取与流式解码（StringDecoder / iconv 增量解码）；
 * - 文件读写异常 → 用户可读中文文案（DescribeFileSystemError / DescribeFileReadError）。
 *
 * 本模块为叶子依赖：仅依赖 fs / string_decoder / jschardet / iconv-lite / logger / i18n，
 * 不依赖 app-state / security / 其他 file-utils 模块（避免循环依赖）。
 */

import { promises as fs, createReadStream } from 'fs'
import { StringDecoder } from 'string_decoder'
import { detect } from 'jschardet'
import * as iconv from 'iconv-lite'
// 公共接口归位第 2 批：大文件阈值与编码别名表统一引用 shared 真源
import { MAX_FILE_ENCODING_SIZE } from '../../../shared/constants/limits'
import { ENCODING_ALIASES } from '../../../shared/constants/encodings'
import { logger } from '../logger'
import { tMain } from '../i18n'

/* 大文件阈值 (5MB)——PF-10：超过该阈值的文件打开/重载改为流式分块读取。
 * 公共接口归位第 2 批：数值真源迁移到 shared/constants/limits.MAX_FILE_ENCODING_SIZE，
 * 保留既有导出名 LARGE_FILE_THRESHOLD（既有调用方与单测按该名字引用），值引用 shared 常量。 */
export const LARGE_FILE_THRESHOLD = MAX_FILE_ENCODING_SIZE

// 编码名归一化表（D-4/FUN-02）：将 jschardet 的返回名（如 GB2312/ASCII）映射为
// iconv-lite 可用的编码名。公共接口归位第 2 批：表内容迁至
// shared/constants/encodings.ENCODING_ALIASES（15 项逐字对齐），本模块直接引用。

/**
 * 归一化编码名；未识别时保守回退 UTF-8（D-4）
 */
export function normalizeEncoding(rawEncoding: string | null | undefined): string {
    if (!rawEncoding) {
        return 'utf-8'
    }
    const key = rawEncoding.toLowerCase().trim()
    return ENCODING_ALIASES[key] || 'utf-8'
}

/**
 * 编码探测结果（PF-10：一次性解码与流式解码共用同一套探测规则）
 */
interface EncodingProbeResult {
    /** 归一化后的编码名 */
    encoding: string
    /** BOM 字节长度（0 表示无 BOM） */
    bomLength: number
}

/**
 * 探测字节流的编码（D-4/FUN-02、PF-10 共用）：
 * 先按 BOM 判断（UTF-8 BOM / UTF-16 LE/BE），再按指定编码或 jschardet 探测；
 * 结果经 normalizeEncoding 归一化，iconv-lite 不支持的编码保守回退 UTF-8。
 * @param buffer 文件字节（流式读取时为文件首块样本）
 * @param preferredEncoding 可选的指定编码名
 */
function ProbeFileEncoding(buffer: Buffer, preferredEncoding?: string): EncodingProbeResult {
    // 1. BOM 检测（优先于启发式探测与指定编码）
    if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        return { encoding: 'utf-8', bomLength: 3 }
    }
    if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
        // UTF-16 LE BOM
        return { encoding: 'utf-16le', bomLength: 2 }
    }
    if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
        // UTF-16 BE BOM
        return { encoding: 'utf-16be', bomLength: 2 }
    }
    // 2. 指定编码优先，否则 jschardet 探测；iconv 不支持的编码回退 UTF-8
    const encoding = normalizeEncoding(preferredEncoding ?? detect(buffer)?.encoding)
    return { encoding: iconv.encodingExists(encoding) ? encoding : 'utf-8', bomLength: 0 }
}

/**
 * 探测文件编码并解码文件内容（D-4/FUN-02）
 * 先按 BOM 判断（UTF-8 BOM / UTF-16 LE/BE），再交给 jschardet 探测；
 * 非 UTF-8 用 iconv-lite 转码读取。
 * FUN-02：preferredEncoding 为指定编码时跳过启发式探测（编码菜单
 * "以指定编码打开"复用本函数，编码名经 normalizeEncoding 归一化）。
 * PF-10：编码探测逻辑抽取为 ProbeFileEncoding，供大文件流式读取复用。
 * @param buffer 文件原始字节
 * @param preferredEncoding 可选的指定编码名（如 'gbk'/'utf16-le'）
 * @returns 解码后的文本内容与归一化编码名
 */
export function decodeFileContent(
    buffer: Buffer,
    preferredEncoding?: string
): { content: string; encoding: string } {
    const { encoding, bomLength } = ProbeFileEncoding(buffer, preferredEncoding)
    const payload = bomLength > 0 ? buffer.subarray(bomLength) : buffer
    if (encoding === 'utf-8') {
        return { content: payload.toString('utf8'), encoding: 'utf-8' }
    }
    // 非 UTF-8：用 iconv-lite 转码（ProbeFileEncoding 已保证 iconv 支持该编码）
    if (iconv.encodingExists(encoding)) {
        return { content: iconv.decode(payload, encoding), encoding }
    }
    // 兜底：iconv 不支持该编码时回退 UTF-8
    return { content: payload.toString('utf8'), encoding: 'utf-8' }
}

// ==================== PF-10：大文件流式读取 ====================
// 背景（../../../../docs/wiki/06-历史报告/md/01-检查与扫描/性能检查报告.md PF-10）：大文件打开全量 readFile 后
// 一次性过 IPC，存在整块 Buffer 峰值。本轮改为：超过 LARGE_FILE_THRESHOLD（5MB）
// 时用 fs.createReadStream 分块读取 + 流式解码（多字节字符跨块不截断），
// 解码后的字符串分片累积、最后 join，避免一次性 Buffer 峰值。
// 注意：本轮仍保持"单次 IPC 传输完整内容"（分块传输协议不在范围，后续可在此处
// 改为边读边 send、渲染端增量注入 Monaco）。
const STREAM_CHUNK_SIZE = 64 * 1024

/**
 * 可注入的文件读取流工厂（仅用于测试注入失败流，生产默认 fs.createReadStream）
 */
type FileReadStreamFactory = (
    filePath: string,
    options: { highWaterMark: number }
) => AsyncIterable<Buffer | string>

/**
 * 自适应读取选项（PF-10）
 */
export interface AdaptiveReadOptions {
    /** 流式读取阈值（默认 LARGE_FILE_THRESHOLD = 5MB） */
    threshold?: number
    /** 指定编码（编码菜单"以指定编码打开"），为空时自动探测 */
    preferredEncoding?: string
    /** 已知文件大小（打开文件前已 stat 过，避免重复 IO；未知时内部 stat） */
    fileSize?: number
    /** 仅测试注入：自定义读取流工厂（生产调用不传） */
    createStream?: FileReadStreamFactory
}

/**
 * 自适应读取结果（PF-10）
 */
export interface AdaptiveReadResult {
    /** 解码后的文本内容 */
    content: string
    /** 文本编码（归一化） */
    encoding: string
    /** 是否走了流式读取分支（false = 小文件一次性 readFile） */
    streamed: boolean
}

/**
 * 流式文本解码器中间层（UTF-8 用 Node StringDecoder，其他编码用 iconv-lite 增量解码），
 * 保证多字节字符被分块边界截断时不会产生乱码。
 */
interface StreamingTextDecoder {
    write(chunk: Buffer): string
    end(): string
}

/**
 * 创建流式文本解码器（PF-10）
 * @param encoding 归一化编码名（ProbeFileEncoding 已保证 iconv 可用或为 utf-8）
 */
function CreateStreamingDecoder(encoding: string): StreamingTextDecoder {
    if (encoding === 'utf-8') {
        const decoder = new StringDecoder('utf8')
        return {
            write: (chunk) => decoder.write(chunk),
            end: () => decoder.end()
        }
    }
    if (iconv.encodingExists(encoding)) {
        const iconvEncoding = encoding
        const decoder = iconv.getDecoder(iconvEncoding)
        return {
            write: (chunk) => decoder.write(chunk),
            end: () => decoder.end() ?? ''
        }
    }
    // 未知编码保守回退 UTF-8（与 decodeFileContent 一致）
    const decoder = new StringDecoder('utf8')
    return {
        write: (chunk) => decoder.write(chunk),
        end: () => decoder.end()
    }
}

/**
 * PF-10：分块流式读取并解码大文件
 * @param filePath 文件路径
 * @param options 读取选项（preferredEncoding 透传，createStream 仅供测试注入）
 * @returns 解码后的完整内容与编码
 */
async function StreamDecodeFile(
    filePath: string,
    options: AdaptiveReadOptions
): Promise<{ content: string; encoding: string }> {
    const createStream: FileReadStreamFactory = options.createStream ?? createReadStream
    const parts: string[] = []
    let decoder: StreamingTextDecoder | null = null
    let encoding = ''
    // 编码探测样本：首块（STREAM_CHUNK_SIZE）通常已足够；不足时继续累积
    let sample: Buffer | null = null
    try {
        for await (const chunk of createStream(filePath, { highWaterMark: STREAM_CHUNK_SIZE })) {
            const buffer: Buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
            if (!decoder) {
                sample = sample ? Buffer.concat([sample, buffer]) : buffer
                if (sample.length < STREAM_CHUNK_SIZE) {
                    continue
                }
                const probe = ProbeFileEncoding(sample, options.preferredEncoding)
                encoding = probe.encoding
                decoder = CreateStreamingDecoder(encoding)
                // BOM 在首块内剥除后再增量解码（多字节字符跨块由解码器暂存）
                const head = decoder.write(sample.subarray(probe.bomLength))
                if (head) {
                    parts.push(head)
                }
                sample = null
                continue
            }
            const text = decoder.write(buffer)
            if (text) {
                parts.push(text)
            }
        }
        if (!decoder) {
            // 兜底：文件小于一个分块（阈值被外部调小时可能出现，如单测注入阈值 0）
            const buffer = sample ?? Buffer.alloc(0)
            const decoded = decodeFileContent(buffer, options.preferredEncoding)
            return { content: decoded.content, encoding: decoded.encoding }
        }
        const tail = decoder.end()
        if (tail) {
            parts.push(tail)
        }
        return { content: parts.join(''), encoding }
    } catch (err) {
        // 半途流错误（ENOENT/EACCES/设备中断等）统一转成清晰中文错误
        throw new Error(
            tMain('mainMsg.file.readLargeFileFailed', {
                message: (err as Error)?.message || String(err)
            }),
            { cause: err }
        )
    }
}

/**
 * FE-32：把文件系统操作异常转换为用户可读的中文文案。
 *
 * 常见错误码（ENOENT/EACCES/EPERM/EISDIR/EBUSY/EMFILE）复用
 * mainMsg.file.readError.* 词典映射为中文原因，并把原始 message 放在括号内便于排查；
 * 未知错误保留原始 message 并追加错误码（不吞掉诊断信息）。
 * 供删除/复制等文件操作失败提示统一复用，避免把 Electron/Node 英文原始错误直出给用户。
 */
export function DescribeFileSystemError(error: unknown): string {
    const err = error as NodeJS.ErrnoException | undefined
    const rawMessage = err?.message || String(error)
    const code = typeof err?.code === 'string' ? err.code : ''
    const codeMessages: Record<string, string> = {
        ENOENT: tMain('mainMsg.file.readError.enoent'),
        EACCES: tMain('mainMsg.file.readError.eacces'),
        EPERM: tMain('mainMsg.file.readError.eperm'),
        EISDIR: tMain('mainMsg.file.readError.eisdir'),
        EBUSY: tMain('mainMsg.file.readError.ebusy'),
        EMFILE: tMain('mainMsg.file.readError.emfile')
    }
    const friendly = code ? codeMessages[code] : undefined
    if (friendly) {
        return tMain('mainMsg.file.readErrorWithDetail', { reason: friendly, message: rawMessage })
    }
    return code ? `${rawMessage}（${code}）` : rawMessage
}

/**
 * 把文件读取异常转换为用户可读的中文描述（PF-10，保留原始 message 便于排查）
 */
function DescribeFileReadError(error: unknown): string {
    const rawMessage = (error as NodeJS.ErrnoException | undefined)?.message || String(error)
    // 流式分支已带中文前缀，直接返回
    if (rawMessage.startsWith(tMain('mainMsg.file.readLargeFileFailedPrefix'))) {
        return rawMessage
    }
    // FE-32：错误码 → 中文原因的映射与删除/复制等文件操作共用同一实现
    return DescribeFileSystemError(error)
}

/**
 * PF-10：自适应读取文件内容。
 * 文件大小超过阈值（默认 5MB）时走 fs.createReadStream 分块读取 + 流式解码，
 * 避免一次性 Buffer 峰值；小文件保持原有一次性读取 + decodeFileContent 行为。
 * 读取失败/流错误统一抛出清晰中文错误（供调用方提示用户）。
 * @param filePath 文件路径
 * @param options 读取选项（阈值/指定编码/已知大小/测试流工厂）
 * @returns 内容、编码与是否流式读取
 */
export async function ReadFileContentAdaptive(
    filePath: string,
    options: AdaptiveReadOptions = {}
): Promise<AdaptiveReadResult> {
    const threshold = options.threshold ?? LARGE_FILE_THRESHOLD
    let fileSize = options.fileSize
    if (typeof fileSize !== 'number') {
        try {
            fileSize = (await fs.stat(filePath)).size
        } catch {
            // stat 失败（不存在/无权限）交由后续读取给出明确错误
            fileSize = 0
        }
    }
    if (fileSize > threshold) {
        // PF-10：分块流式读取；后续如需分块 IPC 传输，可在此处改为逐块发送
        try {
            const { content, encoding } = await StreamDecodeFile(filePath, options)
            logger.debug?.('大文件流式读取完成（PF-10）', filePath, fileSize)
            return { content, encoding, streamed: true }
        } catch (error) {
            logger.error('流式读取大文件失败', filePath, error)
            throw new Error(DescribeFileReadError(error), { cause: error })
        }
    }
    try {
        const buffer = await fs.readFile(filePath)
        const { content, encoding } = decodeFileContent(buffer, options.preferredEncoding)
        return { content, encoding, streamed: false }
    } catch (error) {
        logger.error('读取文件失败', filePath, error)
        throw new Error(DescribeFileReadError(error), { cause: error })
    }
}

/**
 * 按编码将文本内容编码为字节（D-4/FUN-02）
 * UTF-8 写回不带 BOM；GBK 等编码经 iconv-lite 编码。
 */
export function encodeFileContent(content: string, encoding: string): Buffer {
    const enc = normalizeEncoding(encoding)
    if (enc === 'utf-8') {
        return Buffer.from(content, 'utf8')
    }
    if (iconv.encodingExists(enc)) {
        return iconv.encode(content, enc)
    }
    return Buffer.from(content, 'utf8')
}
