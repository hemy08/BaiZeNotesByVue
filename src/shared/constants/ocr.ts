/**
 * 1.5.2 E3 图片 OCR（MVP：剪贴板截图识别）—— shared 纯常量 + 纯函数（唯一真源）
 *
 * 设计约束（ARCH-05）：
 * - 本模块属 `src/shared` 叶子层：不依赖 Node / Electron / Vue / DOM，不做任何 IO；
 * - 只放「语言白名单 / 字节上限 / 官方下载源 / 文本归一化 / 插入 Markdown」等可被
 *   主进程、渲染层与单测共同复用的纯逻辑；真正的下载、wasm 执行与 IPC 在进程层实现。
 *
 * MVP 边界（1.5.2 E3）：
 * - 只识别**剪贴板图片**（截图场景，仅接受 PNG 字节）；不做工作区图片文件 OCR、
 *   不做全库 OCR 索引（后续批次）；
 * - 语言固定 `eng`（`chi_sim` 留作后续扩展：新增 OCR_LANGUAGES 条目 + 设置项下拉 +
 *   下载上限评估即可，IPC 与 worker 已按「语言白名单」而非硬编码实现）。
 *
 * 安全边界：
 * - 下载源只允许本文件内的固定 https 官方地址（projectnaptha 的 tesseract 4.0.0
 *   tessdata，与 tesseract.js 官方文档推荐源一致）；渲染层不能传任意 URL；
 * - 语言包只接受 gzip 魔数 + 字节数区间 [1 MiB, 20 MiB]（防 HTML 错误页/空文件/超大文件）；
 * - PNG 字节校验使用文件头魔数，渲染层即便伪造类型也进不了 wasm 解码分支。
 */

/** OCR 语言标识（MVP 仅 eng；chi_sim 见模块头「MVP 边界」） */
export type OcrLanguageId = 'eng'

/** 单条 OCR 语言定义 */
export interface OcrLanguageDefinition {
    /** Tesseract 语言代码（traineddata 文件名前缀） */
    code: string
    /**
     * 界面显示名。语言自名不翻译（I18N-15 例外项），直接使用官方英文名，
     * 避免在 zh/en 词典里重复维护同一份语言名。
     */
    label: string
}

/**
 * OCR 语言白名单（顺序即设置页展示顺序）。
 *
 * 注意：新增语言必须同时评估下载体积（`OCR_TESSDATA_MAX_BYTES`）与
 * `tests/unit/ocr.test.ts` 的白名单断言；主进程与渲染层都只认本表。
 */
export const OCR_LANGUAGES: Readonly<Record<OcrLanguageId, OcrLanguageDefinition>> = {
    eng: { code: 'eng', label: 'English' }
} as const

/** 语言白名单 id 列表（稳定顺序，供遍历/测试使用） */
export const OCR_LANGUAGE_IDS: readonly OcrLanguageId[] = Object.keys(
    OCR_LANGUAGES
) as OcrLanguageId[]

/** 默认 OCR 语言（MVP 固定 eng，命令/菜单不暴露语言选择） */
export const OCR_DEFAULT_LANGUAGE: OcrLanguageId = 'eng'

/** 判定任意值是否为白名单内的 OCR 语言（IPC 入参归一化的唯一入口） */
export function isOcrLanguage(value: unknown): value is OcrLanguageId {
    return typeof value === 'string' && Object.prototype.hasOwnProperty.call(OCR_LANGUAGES, value)
}

/** 取语言显示名（未知语言回退原值，避免渲染层出现空标签） */
export function getOcrLanguageLabel(lang: OcrLanguageId): string {
    return OCR_LANGUAGES[lang]?.label ?? lang
}

/**
 * 官方语言包下载源（固定 https 白名单，渲染层不可覆盖；按顺序尝试，失败自动回退下一个）。
 *
 * 选源依据（`language` 白名单外的 URL 不接受）：
 * 1. **jsdelivr `@tesseract.js-data`**：tesseract.js 官方文档的默认语言包 CDN，
 *    使用 LSTM-only 的 `4.0.0_best_int` 数据（eng 实测 2.82 MiB，比全量 4.0.0 的
 *    10.4 MiB 小得多，正是 LSTM_ONLY 模式所需），版本路径固定、不可变；
 * 2. **projectnaptha tessdata 4.0.0**：tesseract.js 官方文档同款备用源（全量数据，
 *    eng 实测 10.4 MiB），仅在主源不可用时回退，保证弱网/镜像不可用场景仍可首次使用。
 *
 * 两个源都必须是 https、无查询串/凭据，且 URL 只由白名单语言代码拼接（不接受外部输入）。
 */
export interface OcrTessdataSource {
    /** 源标识（日志/报告用） */
    id: string
    /** 按语言构造下载 URL */
    buildUrl: (lang: OcrLanguageId) => string
}

/** 语言包文件名（磁盘缓存名与下载名共用同一规则） */
export function buildOcrTessdataFileName(lang: OcrLanguageId): string {
    return `${lang}.traineddata.gz`
}

/** 官方语言包下载源顺序（主源 → 备用源） */
export const OCR_TESSDATA_SOURCES: readonly OcrTessdataSource[] = [
    {
        id: 'jsdelivr-tesseract-js-data',
        buildUrl: (lang: OcrLanguageId) =>
            `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}/4.0.0_best_int/${buildOcrTessdataFileName(lang)}`
    },
    {
        id: 'projectnaptha-tessdata',
        buildUrl: (lang: OcrLanguageId) =>
            `https://tessdata.projectnaptha.com/4.0.0/${buildOcrTessdataFileName(lang)}`
    }
] as const

/**
 * 语言包下载 URL（只由白名单语言构造，调用方不可传自定义地址）。
 *
 * @param lang 语言代码
 * @param sourceIndex 源下标（默认 0 = 主源；越界回退主源）
 */
export function buildOcrTessdataUrl(lang: OcrLanguageId, sourceIndex = 0): string {
    const source = OCR_TESSDATA_SOURCES[sourceIndex] ?? OCR_TESSDATA_SOURCES[0]
    return source.buildUrl(lang)
}

/** 单张剪贴板图片字节上限（20 MiB；超过直接拒绝，不进 OCR 队列） */
export const OCR_IMAGE_MAX_BYTES = 20 * 1024 * 1024

/** 单个语言包下载字节上限（20 MiB；eng 约 10.4 MiB，chi_sim 后续评估） */
export const OCR_TESSDATA_MAX_BYTES = 20 * 1024 * 1024

/**
 * 语言包最小有效字节（1 MiB）。
 *
 * 仅在「下载临时文件 + 缓存命中」两处作为快速体检：正常 eng 约 10.4 MiB，
 * 明显小于该值只能是错误页 / 被截断 / 空文件，必须重新下载。
 */
export const OCR_TESSDATA_MIN_BYTES = 1024 * 1024

/** 语言包下载超时（60s；10 MiB 在慢网络下仍有余量，超时后清理临时文件） */
export const OCR_TESSDATA_DOWNLOAD_TIMEOUT_MS = 60 * 1000

/** gzip 魔数（tesseract.js 支持 .traineddata.gz，运行时由 node:zlib 解压） */
const GZIP_MAGIC_FIRST = 0x1f
const GZIP_MAGIC_SECOND = 0x8b

/** PNG 文件头魔数（89 50 4E 47 0D 0A 1A 0A） */
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const

/**
 * 判定字节是否为 PNG 图片（剪贴板截图统一走 `image/png`，MVP 只接受 PNG）。
 *
 * @param bytes 待判定字节（渲染层 arrayBuffer 转换结果）
 */
export function isPngImageBytes(bytes: Uint8Array | null | undefined): boolean {
    if (!bytes || bytes.length < PNG_SIGNATURE.length) {
        return false
    }
    return PNG_SIGNATURE.every((value, index) => bytes[index] === value)
}

/**
 * 判定语言包字节是否可信：gzip 魔数 + 字节数在 [MIN, MAX] 区间内。
 *
 * 主进程在「下载完成」与「缓存命中」两处复用；渲染层不接触语言包字节。
 *
 * @param bytes 语言包字节（.traineddata.gz）
 */
export function isValidOcrTessdataBytes(bytes: Uint8Array | null | undefined): boolean {
    if (!bytes || bytes.length < OCR_TESSDATA_MIN_BYTES || bytes.length > OCR_TESSDATA_MAX_BYTES) {
        return false
    }
    return bytes[0] === GZIP_MAGIC_FIRST && bytes[1] === GZIP_MAGIC_SECOND
}

/**
 * 是否为需要剥离的控制字符：保留 \n（0x0A）与 \t（0x09），其余 C0 控制符与 DEL（0x7F）移除。
 *
 * 逐字符判断而非正则字符类：避免 ESLint `no-control-regex` 规则命中（仓内同类实现口径一致）。
 */
function isStrippedControlChar(code: number): boolean {
    return (code < 0x20 && code !== 0x0a && code !== 0x09) || code === 0x7f
}

/** 行尾空白（逐行剥离，避免 Markdown 行尾空格触发硬换行） */
const OCR_TRAILING_SPACE_RE = /[ \t]+$/

/**
 * 归一化 OCR 识别文本（插入 Markdown 前的唯一清洗入口）。
 *
 * 规则（只做「无损整理」，不改写内容）：
 * 1. 统一换行：`\r\n` / `\r` → `\n`；
 * 2. 剥离控制字符（保留换行与制表）；
 * 3. 逐行去掉行尾空格/制表；
 * 4. 连续 2 行以上空行折叠为 1 行空行（保留段落分隔，去掉 OCR 常见的大段空白）；
 * 5. 去掉首尾空行与逐行行尾空白；**保留首行缩进**（Markdown 列表/代码块缩进有意义）。
 *
 * @param raw 识别原文（可能含 CRLF/控制字符/多余空行）
 * @returns 归一化文本；无有效内容时返回空串
 */
export function normalizeOcrText(raw: string): string {
    if (typeof raw !== 'string' || raw.length === 0) {
        return ''
    }
    const unified = raw.replace(/\r\n?/g, '\n')
    // 逐字符剥离控制字符（保留换行与制表；见 isStrippedControlChar 注释）
    let filtered = ''
    for (const char of unified) {
        if (!isStrippedControlChar(char.charCodeAt(0))) {
            filtered += char
        }
    }
    const lines = filtered.split('\n').map((line) => line.replace(OCR_TRAILING_SPACE_RE, ''))
    const cleaned: string[] = []
    let previousBlank = true // 首部空行一律丢弃
    for (const line of lines) {
        const isBlank = line.trim().length === 0
        if (isBlank) {
            if (previousBlank) {
                continue
            }
            cleaned.push('')
            previousBlank = true
            continue
        }
        cleaned.push(line)
        previousBlank = false
    }
    // 尾部空行（上一轮折叠后最多 1 行）删除
    while (cleaned.length > 0 && cleaned[cleaned.length - 1] === '') {
        cleaned.pop()
    }
    // 不做整体 trim：逐行已去行尾空白，这里保留首行缩进（列表/代码块语义）
    return cleaned.join('\n')
}

/**
 * 构造「插入当前笔记」的 Markdown 片段。
 *
 * - 正文：`normalizeOcrText` 归一化后的原文（保留段落，不自动加引用块——OCR 文本
 *   多行段落加 `>` 会破坏换行语义，MVP 直接插入原文更通用）；
 * - 来源标注：传入 `sourceLabel` 时在末尾追加一行引用式来源说明
 *   （`> —— 来自图片文字识别`），便于用户区分「自己的原文」与「识别内容」；
 *   不传则只插入正文（复制到剪贴板场景不附带标注）。
 *
 * @param text 识别原文
 * @param sourceLabel 已本地化的来源标注文案（渲染层经 i18n 传入）
 * @returns 可直接写入编辑器/剪贴板的 Markdown；无有效文本时返回空串
 */
export function buildOcrInsertMarkdown(text: string, sourceLabel?: string): string {
    const normalized = normalizeOcrText(text)
    if (!normalized) {
        return ''
    }
    const label = typeof sourceLabel === 'string' ? sourceLabel.trim() : ''
    return label ? `${normalized}\n\n> —— ${label}` : normalized
}

/**
 * 字节上限 → 可读文案（用于超限提示中的 `{max}` 占位符）。
 *
 * @param bytes 字节数
 */
export function formatOcrSizeLimit(bytes: number): string {
    if (bytes >= 1024 * 1024 && bytes % (1024 * 1024) === 0) {
        return `${bytes / (1024 * 1024)} MiB`
    }
    if (bytes >= 1024 && bytes % 1024 === 0) {
        return `${bytes / 1024} KiB`
    }
    return `${bytes} B`
}
