/**
 * OCR 语言包下载与本地缓存（1.5.2 E3，主进程）
 *
 * ## 为什么运行时下载
 * tesseract 语言包 eng 约 10.4 MiB、chi_sim 更大（数十 MB），不可能打进安装包
 * （体积预算 asar ≤ 47 MiB / Setup ≤ 115 MiB，PERF-01）。因此语言包在**首次使用时**
 * 从官方 https 源下载到用户数据目录并缓存，后续识别直接复用（图片本身从不上传）。
 *
 * ## 缓存位置
 * `<userData>/ocr/tessdata/<lang>.traineddata.gz`（userData 真源 = `getUserDataPath()`
 * 即 `~/.baizenotes`，与配置/日志/备份同一根目录）。
 * worker 侧把该目录作为 tesseract.js 的 `langPath`（本地目录 + gzip=true + cacheMethod='none'），
 * 由 tesseract.js 内部用 node:zlib 解压，不产生第二份未压缩缓存文件。
 *
 * ## 安全与健壮性（硬性约束）
 * - 下载地址只来自 `shared/constants/ocr.ts` 的固定 https 官方源白名单，渲染层不可覆盖；
 *   按「jsdelivr @tesseract.js-data（主，LSTM-only 2.8 MiB）→ projectnaptha tessdata（备，
 *   全量 10.4 MiB）」顺序尝试，单源失败自动回退，全部失败才报错；
 * - 只接受 https（含重定向后的最终 URL），拒绝 http/自定义协议/带凭据地址；
 * - 大小上限 `OCR_TESSDATA_MAX_BYTES`（20 MiB）+ 下限 `OCR_TESSDATA_MIN_BYTES`（1 MiB，
 *   防 HTML 错误页/截断文件）+ gzip 魔数校验；
 * - 下载超时 `OCR_TESSDATA_DOWNLOAD_TIMEOUT_MS`（60s），超时中止并清理；
 * - 先写同目录唯一临时文件，校验通过后 `rename` 原子替换正式缓存；
 *   任何失败路径都删除临时文件，不留下半成品（缓存命中校验同样覆盖大小/魔数）；
 * - 初始化失败（worker 报 initialization failed）时由 IPC 层调用 `invalidateOcrLanguage`
 *   删除缓存，下次重试会重新下载，避免坏文件永久卡死。
 */
import { promises as fs } from 'node:fs'
import * as path from 'node:path'
import {
    OCR_TESSDATA_DOWNLOAD_TIMEOUT_MS,
    OCR_TESSDATA_MAX_BYTES,
    OCR_TESSDATA_MIN_BYTES,
    OCR_TESSDATA_SOURCES,
    buildOcrTessdataFileName,
    buildOcrTessdataUrl,
    isValidOcrTessdataBytes,
    type OcrLanguageId
} from '../../../shared/constants/ocr'
import { getUserDataPath } from '../app-paths'
import { logger } from '../logger'

/** 用户数据目录下 OCR 缓存目录（`<userData>/ocr/tessdata`） */
const OCR_DATA_DIR_NAME = 'ocr'
const OCR_TESSDATA_DIR_NAME = 'tessdata'

/** 下载临时文件后缀（正式文件为 `<lang>.traineddata.gz`，临时文件追加时间戳/pid） */
const DOWNLOAD_TEMP_SUFFIX = '.download'

/** gzip 魔数（缓存命中校验只用前 2 字节，避免每次把 10 MiB 读入内存） */
const GZIP_MAGIC_FIRST = 0x1f
const GZIP_MAGIC_SECOND = 0x8b

/** 进度上报节流间隔（10 MiB 下载约上百次 chunk，限制状态栏 IPC 频率） */
const PROGRESS_THROTTLE_MS = 200

/** 归一化任意抛出值为错误文案（多源失败列表拼接用） */
function toErrorMessage(error: unknown): string {
    if (error instanceof Error) {
        return error.message.trim() || error.name || '未知错误'
    }
    const text = String(error ?? '').trim()
    return text || '未知错误'
}

/** 下载进度（percent 为 null 表示服务端未提供 Content-Length） */
export interface OcrTessdataDownloadProgress {
    /** 已接收字节数 */
    receivedBytes: number
    /** 服务端声明总字节数（未知为 null） */
    totalBytes: number | null
    /** 百分比（0~100；未知为 null） */
    percent: number | null
}

/** 语言包准备成功结果 */
export interface OcrTessdataReadyResult {
    ok: true
    lang: OcrLanguageId
    /** true = 直接命中本地缓存；false = 本次下载成功 */
    fromCache: boolean
    /** 语言包字节数（.gz 文件大小） */
    bytes: number
}

/** 语言包准备失败结果（唯一失败原因：下载/校验/写盘失败） */
export interface OcrTessdataFailureResult {
    ok: false
    error: 'lang-download-failed'
}

/** 语言包准备结果 */
export type OcrTessdataPrepareResult = OcrTessdataReadyResult | OcrTessdataFailureResult

/** fetch 响应头最小结构（便于单测注入替身，不依赖 DOM lib） */
export interface OcrFetchHeadersLike {
    get(name: string): string | null
}

/** fetch 响应体读取器最小结构 */
export interface OcrFetchBodyReaderLike {
    read(): Promise<{ done: boolean; value?: Uint8Array }>
    cancel?(): Promise<unknown>
}

/** fetch 响应体最小结构 */
export interface OcrFetchBodyLike {
    getReader(): OcrFetchBodyReaderLike
}

/** fetch 响应最小结构 */
export interface OcrFetchResponseLike {
    ok: boolean
    status: number
    /** 最终 URL（用于校验重定向后仍为 https） */
    url: string
    headers: OcrFetchHeadersLike
    body: OcrFetchBodyLike | null
}

/** fetch 最小签名（默认实现包装 globalThis.fetch；单测注入可控替身） */
export type OcrFetchLike = (
    url: string,
    init: { signal: AbortSignal; redirect: 'follow' }
) => Promise<OcrFetchResponseLike>

/** 语言包准备选项（全部可选，生产不传；单测注入临时目录/替身 fetch） */
export interface PrepareOcrLanguageOptions {
    /** 覆盖下载实现（单测使用） */
    fetchImpl?: OcrFetchLike
    /** 覆盖缓存目录（单测使用临时目录；生产不传 = `<userData>/ocr/tessdata`） */
    directory?: string
    /** 下载进度回调（主进程 IPC 层用于状态栏进度提示） */
    onProgress?: (progress: OcrTessdataDownloadProgress) => void
    /** 覆盖下载超时（毫秒，单测可缩短） */
    timeoutMs?: number
}

/** 默认 fetch 实现：Electron 43（Node 22+）主进程自带 globalThis.fetch */
function defaultFetchImpl(): OcrFetchLike {
    return (url, init) => (globalThis.fetch as unknown as OcrFetchLike)(url, init)
}

/** OCR 语言包缓存目录绝对路径（`<userData>/ocr/tessdata`） */
export function getOcrTessdataDir(): string {
    return path.join(getUserDataPath(), OCR_DATA_DIR_NAME, OCR_TESSDATA_DIR_NAME)
}

/** 指定语言的缓存文件绝对路径 */
export function getOcrTessdataFilePath(lang: OcrLanguageId): string {
    return path.join(getOcrTessdataDir(), buildOcrTessdataFileName(lang))
}

/**
 * 校验缓存文件是否可用：普通文件 + 大小在 [MIN, MAX] + gzip 魔数。
 *
 * @param filePath 缓存文件绝对路径
 * @returns 可用时返回文件字节数，否则返回 null（不存在/损坏/非普通文件）
 */
async function readValidCachedLanguageSize(filePath: string): Promise<number | null> {
    let fileStat: Awaited<ReturnType<typeof fs.stat>>
    try {
        fileStat = await fs.stat(filePath)
    } catch (error) {
        if ((error as NodeJS.ErrnoException)?.code === 'ENOENT') {
            return null
        }
        // 权限/网络盘等异常：按缓存不可用处理，继续尝试重新下载（下载失败会给出最终错误）
        logger.warn('[OCR] 读取语言包缓存状态失败，将尝试重新下载：', filePath, error)
        return null
    }
    if (!fileStat.isFile()) {
        logger.warn('[OCR] 语言包缓存路径不是普通文件，将重新下载：', filePath)
        return null
    }
    if (fileStat.size < OCR_TESSDATA_MIN_BYTES || fileStat.size > OCR_TESSDATA_MAX_BYTES) {
        logger.warn(
            '[OCR] 语言包缓存大小异常，将重新下载：',
            filePath,
            `size=${fileStat.size}`,
            `range=[${OCR_TESSDATA_MIN_BYTES}, ${OCR_TESSDATA_MAX_BYTES}]`
        )
        return null
    }
    let handle: Awaited<ReturnType<typeof fs.open>> | null = null
    try {
        handle = await fs.open(filePath, 'r')
        const header = Buffer.alloc(2)
        const { bytesRead } = await handle.read(header, 0, 2, 0)
        if (bytesRead < 2 || header[0] !== GZIP_MAGIC_FIRST || header[1] !== GZIP_MAGIC_SECOND) {
            logger.warn('[OCR] 语言包缓存 gzip 魔数不匹配，将重新下载：', filePath)
            return null
        }
        return fileStat.size
    } catch (error) {
        logger.warn('[OCR] 读取语言包缓存文件头失败，将尝试重新下载：', filePath, error)
        return null
    } finally {
        if (handle) {
            await handle.close().catch(() => undefined)
        }
    }
}

/** 清理该语言历史残留的下载临时文件（崩溃/断电可能留下半成品） */
async function cleanupStaleDownloadTempFiles(
    directory: string,
    lang: OcrLanguageId
): Promise<void> {
    const prefix = `${buildOcrTessdataFileName(lang)}${DOWNLOAD_TEMP_SUFFIX}`
    let entries: string[]
    try {
        entries = await fs.readdir(directory)
    } catch {
        return
    }
    for (const entry of entries) {
        if (!entry.startsWith(prefix)) {
            continue
        }
        try {
            await fs.rm(path.join(directory, entry), { force: true })
        } catch (error) {
            logger.warn('[OCR] 清理语言包下载临时文件失败：', entry, error)
        }
    }
}

/**
 * 从单个官方 https 源下载语言包到内存（含大小/协议/gzip 校验），返回字节。
 *
 * @param requestUrl 已由 shared 常量按白名单语言构造的 https URL
 * @param fetchImpl fetch 实现
 * @param onProgress 进度回调
 * @param timeoutMs 下载超时
 */
async function downloadFromSingleSource(
    requestUrl: string,
    fetchImpl: OcrFetchLike,
    onProgress: (progress: OcrTessdataDownloadProgress) => void,
    timeoutMs: number
): Promise<Uint8Array> {
    // 双保险：常量里是固定 https 源，这里仍显式校验协议（防止未来常量被改错）
    if (new URL(requestUrl).protocol !== 'https:') {
        throw new Error('OCR 语言包下载源必须为 https')
    }
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    timer.unref?.()
    try {
        const response = await fetchImpl(requestUrl, {
            signal: controller.signal,
            redirect: 'follow'
        })
        // 重定向后最终地址仍必须是 https（防 https → http 降级）
        const finalUrl =
            typeof response.url === 'string' && response.url.length > 0 ? response.url : requestUrl
        if (new URL(finalUrl).protocol !== 'https:') {
            throw new Error('OCR 语言包下载地址被重定向到非 https 源')
        }
        if (!response.ok) {
            throw new Error(`OCR 语言包下载失败（HTTP ${response.status}）`)
        }
        const lengthHeader = response.headers.get('content-length')
        const declaredLength = lengthHeader === null ? null : Number(lengthHeader)
        if (declaredLength !== null && (!Number.isFinite(declaredLength) || declaredLength <= 0)) {
            throw new Error('OCR 语言包响应 Content-Length 非法')
        }
        if (declaredLength !== null && declaredLength > OCR_TESSDATA_MAX_BYTES) {
            throw new Error(
                `OCR 语言包超过大小上限（${declaredLength} > ${OCR_TESSDATA_MAX_BYTES}）`
            )
        }
        if (!response.body) {
            throw new Error('OCR 语言包响应缺少响应体')
        }
        const reader = response.body.getReader()
        const chunks: Uint8Array[] = []
        let receivedBytes = 0
        let lastProgressAt = 0
        for (;;) {
            const { done, value } = await reader.read()
            if (done) {
                break
            }
            if (!value || value.length === 0) {
                continue
            }
            receivedBytes += value.length
            if (receivedBytes > OCR_TESSDATA_MAX_BYTES) {
                await reader.cancel?.().catch(() => undefined)
                throw new Error(`OCR 语言包超过大小上限（>${OCR_TESSDATA_MAX_BYTES}）`)
            }
            chunks.push(value)
            const now = Date.now()
            if (now - lastProgressAt >= PROGRESS_THROTTLE_MS) {
                lastProgressAt = now
                onProgress({
                    receivedBytes,
                    totalBytes: declaredLength,
                    percent:
                        declaredLength === null
                            ? null
                            : Math.min(100, Math.round((receivedBytes / declaredLength) * 100))
                })
            }
        }
        onProgress({
            receivedBytes,
            totalBytes: declaredLength ?? receivedBytes,
            percent: 100
        })
        const bytes = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))) as Uint8Array
        if (!isValidOcrTessdataBytes(bytes)) {
            throw new Error(
                `OCR 语言包校验失败（size=${bytes.length}，期望 gzip 且在 ` +
                    `[${OCR_TESSDATA_MIN_BYTES}, ${OCR_TESSDATA_MAX_BYTES}] 区间）`
            )
        }
        return bytes
    } finally {
        clearTimeout(timer)
    }
}

/**
 * 按官方源白名单顺序下载语言包：主源失败自动回退备用源（每个源独立超时）。
 *
 * @param lang 语言代码
 * @param fetchImpl fetch 实现
 * @param onProgress 进度回调
 * @param timeoutMs 单源下载超时
 * @returns 通过校验的语言包字节；全部源失败时抛错（错误信息含每个源的失败原因）
 */
async function downloadLanguagePack(
    lang: OcrLanguageId,
    fetchImpl: OcrFetchLike,
    onProgress: (progress: OcrTessdataDownloadProgress) => void,
    timeoutMs: number
): Promise<Uint8Array> {
    const failures: string[] = []
    for (let index = 0; index < OCR_TESSDATA_SOURCES.length; index += 1) {
        const source = OCR_TESSDATA_SOURCES[index]
        const requestUrl = buildOcrTessdataUrl(lang, index)
        try {
            const bytes = await downloadFromSingleSource(
                requestUrl,
                fetchImpl,
                onProgress,
                timeoutMs
            )
            if (index > 0) {
                logger.warn('[OCR] 语言包主源不可用，已回退备用源：', source.id)
            }
            return bytes
        } catch (error) {
            failures.push(`${source.id}: ${toErrorMessage(error)}`)
            logger.warn('[OCR] 语言包下载源失败，尝试下一个官方源：', source.id, error)
        }
    }
    throw new Error(
        `OCR 语言包下载失败（已尝试 ${OCR_TESSDATA_SOURCES.length} 个官方源）：${failures.join(' | ')}`
    )
}

/**
 * 准备 OCR 语言包（幂等）：缓存命中直接返回；否则 https 下载 + 校验 + 原子写缓存。
 *
 * @param lang 语言代码（IPC 层已按白名单校验）
 * @param options 可注入选项（单测）
 * @returns 结构化结果（失败不抛异常，调用方映射错误码/提示）
 */
export async function prepareOcrLanguage(
    lang: OcrLanguageId,
    options: PrepareOcrLanguageOptions = {}
): Promise<OcrTessdataPrepareResult> {
    const directory = options.directory ?? getOcrTessdataDir()
    const filePath = path.join(directory, buildOcrTessdataFileName(lang))
    try {
        await fs.mkdir(directory, { recursive: true })
    } catch (error) {
        logger.error('[OCR] 创建语言包缓存目录失败：', directory, error)
        return { ok: false, error: 'lang-download-failed' }
    }
    await cleanupStaleDownloadTempFiles(directory, lang)
    const cachedSize = await readValidCachedLanguageSize(filePath)
    if (cachedSize !== null) {
        logger.info('[OCR] 语言包缓存命中：', lang, `bytes=${cachedSize}`)
        return { ok: true, lang, fromCache: true, bytes: cachedSize }
    }
    // 缓存不可用（缺失/损坏/被外部创建成目录等）：先清理目标路径，保证后续原子 rename 可覆盖。
    // 仅在缓存校验未通过时执行，不会误删可复用的合法缓存。
    try {
        await fs.rm(filePath, { recursive: true, force: true })
    } catch (error) {
        logger.warn('[OCR] 清理无效语言包缓存失败（将继续尝试下载覆盖）：', filePath, error)
    }
    const fetchImpl = options.fetchImpl ?? defaultFetchImpl()
    const onProgress = options.onProgress ?? (() => undefined)
    const tempPath = `${filePath}${DOWNLOAD_TEMP_SUFFIX}-${process.pid}-${Date.now()}.tmp`
    try {
        const bytes = await downloadLanguagePack(
            lang,
            fetchImpl,
            onProgress,
            options.timeoutMs ?? OCR_TESSDATA_DOWNLOAD_TIMEOUT_MS
        )
        await fs.writeFile(tempPath, bytes)
        await fs.rename(tempPath, filePath)
        logger.info('[OCR] 语言包下载完成：', lang, `bytes=${bytes.length}`, filePath)
        return { ok: true, lang, fromCache: false, bytes: bytes.length }
    } catch (error) {
        logger.error('[OCR] 语言包下载/校验/写盘失败：', lang, error)
        // 清理临时文件（清理失败只告警，不掩盖主错误）
        try {
            await fs.rm(tempPath, { force: true })
        } catch (cleanupError) {
            logger.warn('[OCR] 清理语言包下载临时文件失败：', tempPath, cleanupError)
        }
        return { ok: false, error: 'lang-download-failed' }
    }
}

/**
 * 使某个语言包缓存失效（删除缓存文件）。
 *
 * 使用场景：worker 报 `initialization failed`（语言文件损坏/版本不匹配）时，
 * IPC 层删除缓存，下次用户重试会重新下载，避免坏缓存永久卡死。
 *
 * @param lang 语言代码
 * @returns 是否删除了文件（不存在返回 false）
 */
export async function invalidateOcrLanguage(lang: OcrLanguageId): Promise<boolean> {
    const filePath = getOcrTessdataFilePath(lang)
    try {
        await fs.rm(filePath, { force: true })
        logger.warn('[OCR] 已清除语言包缓存（等待重新下载）：', lang, filePath)
        return true
    } catch (error) {
        logger.error('[OCR] 清除语言包缓存失败：', filePath, error)
        return false
    }
}
