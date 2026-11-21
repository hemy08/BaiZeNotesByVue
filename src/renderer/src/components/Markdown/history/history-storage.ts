/**
 * 文档历史快照存储（A3 文档历史 renderer-only MVP，opt-in：flags.documentHistory）
 *
 * 设计约束（与任务卡 A3 对齐）：
 * - **纯渲染层**：不新增 IPC、不改主进程状态；快照落在本机 `localStorage`；
 * - **按文件路径 hash 分 key**：同一文件的所有版本存一个 key，key 前缀 `baize:document-history:v1:`；
 * - **配额**：每文件最多 20 版、全部历史合计约 2 MiB；超限时**全局淘汰最旧版本**；
 * - **失败静默降级**：localStorage 不可用 / 写入抛错 / JSON 损坏时只记日志，不影响保存主链路；
 * - 本模块只做「读写 + 配额计算」的纯数据操作，不依赖 Vue/Electron，便于 node 环境直接单测
 *   （存储通过 `HistoryStorageLike` 注入，测试用内存替身，不碰真实 localStorage）。
 *
 * 数据形态（每个文件一个 key）：
 * ```json
 * {
 *   "formatVersion": 1,
 *   "path": "C:\\notes\\a.md",
 *   "versions": [
 *     { "id": "m1-1", "savedAt": 1700000000000, "sizeBytes": 123, "content": "# 标题" }
 *   ]
 * }
 * ```
 * versions 按保存时间升序存储（末尾为最新）；读取给 UI 时按时间倒序返回。
 */
import { logger } from '../../../common/logger'

/** localStorage 最小接口（测试可注入内存替身；真实环境传 window.localStorage） */
export interface HistoryStorageLike {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
    removeItem(key: string): void
    readonly length: number
    key(index: number): string | null
}

/** 单个历史版本（content 为保存时点的完整文档文本） */
export interface DocumentHistoryVersion {
    /** 版本 id（同一文件内唯一；用于列表 key 与恢复/删除定位） */
    id: string
    /** 保存时间（毫秒时间戳） */
    savedAt: number
    /** 内容 UTF-8 字节数（列表展示 + 配额估算） */
    sizeBytes: number
    /** 完整文档内容 */
    content: string
}

/** 单文件历史记录（localStorage 中一个 key 的完整值） */
export interface DocumentHistoryFileRecord {
    /** 存储格式版本（后续结构升级时用于迁移/丢弃旧数据） */
    formatVersion: number
    /** 文件绝对路径（展示用；归一化后的 hash 才是 key） */
    path: string
    /** 版本列表（按 savedAt 升序，末尾最新） */
    versions: DocumentHistoryVersion[]
}

/** 追加快照的结果状态（调用方据此决定是否刷新列表/记日志） */
export type AppendDocumentHistoryStatus =
    | 'added'
    | 'duplicate'
    | 'skipped-too-large'
    | 'invalid-argument'
    | 'unavailable'
    | 'write-failed'

/** 追加快照的返回值 */
export interface AppendDocumentHistoryResult {
    status: AppendDocumentHistoryStatus
    /** 本次追加过程中被淘汰的旧版本数量（含每文件上限与全局配额） */
    evictedVersions: number
    /** 淘汰后的历史总占用（字节，估算口径见 calculateDocumentHistoryTotalBytes） */
    totalBytes: number
    /** 追加后的该文件记录（写失败时为尝试写入的记录；不可用时为 null） */
    record: DocumentHistoryFileRecord | null
}

/** 历史存储用量（对话框展示存储配额用） */
export interface DocumentHistoryUsage {
    totalBytes: number
    fileCount: number
    versionCount: number
}

/** 追加参数（测试可固定 savedAt / versionId，保证断言稳定） */
export interface AppendDocumentHistoryOptions {
    savedAt?: number
    versionId?: string
}

/** key 前缀（唯一真源；其它模块引用本常量，禁止手写字符串） */
export const DOCUMENT_HISTORY_KEY_PREFIX = 'baize:document-history:v1:'

/** 存储格式版本 */
export const DOCUMENT_HISTORY_FORMAT_VERSION = 1

/** 每文件最多保留的版本数（超出淘汰最旧） */
export const DOCUMENT_HISTORY_MAX_VERSIONS_PER_FILE = 20

/** 全部历史合计大小上限（2 MiB，估算口径含 key/元数据开销） */
export const DOCUMENT_HISTORY_MAX_TOTAL_BYTES = 2 * 1024 * 1024

/** 单版本内容大小上限（超过则跳过该快照，避免单个超大文件挤占全部配额） */
export const DOCUMENT_HISTORY_MAX_SNAPSHOT_BYTES = 512 * 1024

/** 单版本元数据开销估算（id / savedAt / JSON 字段名等） */
const VERSION_METADATA_OVERHEAD_BYTES = 128

/** 单文件记录元数据开销估算（path / formatVersion / JSON 结构） */
const FILE_METADATA_OVERHEAD_BYTES = 96

/**
 * UTF-8 字节数估算（配额口径）。
 * 优先用 TextEncoder（渲染进程与 node/jsdom 均可用）；极旧环境退化为按码点估算，
 * 保证返回值始终为有限非负整数。
 */
export function estimateUtf8Bytes(text: string): number {
    if (typeof TextEncoder !== 'undefined') {
        try {
            return new TextEncoder().encode(text).length
        } catch {
            // 极端环境下 TextEncoder 初始化/编码失败，走下方码点兜底
        }
    }
    let bytes = 0
    for (const char of text) {
        const code = char.codePointAt(0) ?? 0
        if (code <= 0x7f) {
            bytes += 1
        } else if (code <= 0x7ff) {
            bytes += 2
        } else if (code <= 0xffff) {
            bytes += 3
        } else {
            bytes += 4
        }
    }
    return bytes
}

/**
 * 路径归一化（仅用于 hash 计算，不改真实路径）：
 * - 反斜杠统一为正斜杠；
 * - 折叠重复分隔符、去掉首尾空白；
 * - Windows 盘符路径（`C:` 开头）大小写不敏感，统一小写（避免同一文件因盘符大小写产生两份历史）。
 */
export function normalizeHistoryPath(filePath: string): string {
    const normalized = filePath
        .trim()
        .replace(/\\/g, '/')
        .replace(/\/{2,}/g, '/')
    return /^[A-Za-z]:/.test(normalized) ? normalized.toLowerCase() : normalized
}

/** FNV-1a 32 位哈希（纯函数，返回 8 位十六进制） */
function fnv1aHash(text: string, seed: number): string {
    let hash = seed >>> 0
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index)
        hash = Math.imul(hash, 0x01000193) >>> 0
    }
    return hash.toString(16).padStart(8, '0')
}

/** 文件路径 → 稳定 hash（双 seed 拼接，8+8=16 位十六进制，显著降低碰撞概率） */
export function hashHistoryFilePath(filePath: string): string {
    const normalized = normalizeHistoryPath(filePath)
    return `${fnv1aHash(normalized, 0x811c9dc5)}${fnv1aHash(normalized, 0x9e3779b1)}`
}

/** 文件路径 → localStorage key */
export function buildHistoryStorageKey(filePath: string): string {
    return `${DOCUMENT_HISTORY_KEY_PREFIX}${hashHistoryFilePath(filePath)}`
}

/** 生成版本 id（savedAt + 自增序号，模块内单调递增，避免同毫秒覆盖） */
let versionSeed = 0
export function createHistoryVersionId(savedAt: number): string {
    versionSeed += 1
    return `${savedAt.toString(36)}-${versionSeed.toString(36)}`
}

/** 校验并归一化单个版本（JSON 反序列化后的结构防御） */
function normalizeHistoryVersion(value: unknown): DocumentHistoryVersion | null {
    if (value === null || typeof value !== 'object') {
        return null
    }
    const candidate = value as Partial<DocumentHistoryVersion>
    if (
        typeof candidate.id !== 'string' ||
        candidate.id.length === 0 ||
        typeof candidate.savedAt !== 'number' ||
        !Number.isFinite(candidate.savedAt) ||
        typeof candidate.sizeBytes !== 'number' ||
        !Number.isFinite(candidate.sizeBytes) ||
        typeof candidate.content !== 'string'
    ) {
        return null
    }
    return {
        id: candidate.id,
        savedAt: candidate.savedAt,
        sizeBytes: Math.max(0, Math.floor(candidate.sizeBytes)),
        content: candidate.content
    }
}

/** JSON 反序列化后的记录结构防御（损坏记录按不存在处理并由调用方清理） */
function normalizeHistoryRecord(value: unknown): DocumentHistoryFileRecord | null {
    if (value === null || typeof value !== 'object') {
        return null
    }
    const candidate = value as Partial<DocumentHistoryFileRecord>
    if (typeof candidate.path !== 'string' || candidate.path.trim().length === 0) {
        return null
    }
    if (!Array.isArray(candidate.versions)) {
        return null
    }
    const versions: DocumentHistoryVersion[] = []
    for (const item of candidate.versions) {
        const version = normalizeHistoryVersion(item)
        if (version !== null) {
            versions.push(version)
        }
    }
    // 兼容历史数据：允许 versions 为空数组（空记录由读取方当作不存在）
    versions.sort((left, right) => left.savedAt - right.savedAt)
    return {
        formatVersion:
            typeof candidate.formatVersion === 'number'
                ? candidate.formatVersion
                : DOCUMENT_HISTORY_FORMAT_VERSION,
        path: candidate.path,
        versions
    }
}

/** 安全读取（localStorage 访问在隐私模式/磁盘满时可能抛错，一律降级为 null） */
function safeGetItem(storage: HistoryStorageLike | null, key: string): string | null {
    if (!storage) {
        return null
    }
    try {
        return storage.getItem(key)
    } catch (error) {
        logger.warn('[文档历史] 读取 localStorage 失败（已静默降级）', error)
        return null
    }
}

/** 安全删除（失败只记日志） */
function safeRemoveItem(storage: HistoryStorageLike | null, key: string): boolean {
    if (!storage) {
        return false
    }
    try {
        storage.removeItem(key)
        return true
    } catch (error) {
        logger.warn('[文档历史] 删除 localStorage 失败（已静默降级）', error)
        return false
    }
}

/**
 * 读取单文件历史记录。
 * - 存储不可用 / 无记录 → null；
 * - JSON 损坏或结构非法 → 记 WARN、删除该 key（自愈），返回 null。
 */
export function readDocumentHistoryRecord(
    storage: HistoryStorageLike | null,
    filePath: string
): DocumentHistoryFileRecord | null {
    if (!storage || !filePath || filePath.trim().length === 0) {
        return null
    }
    const key = buildHistoryStorageKey(filePath)
    const raw = safeGetItem(storage, key)
    if (raw === null) {
        return null
    }
    try {
        const record = normalizeHistoryRecord(JSON.parse(raw) as unknown)
        if (record === null || record.versions.length === 0) {
            // 空记录/非法记录：删除后按无历史处理（不阻塞后续保存）
            safeRemoveItem(storage, key)
            return null
        }
        return record
    } catch (error) {
        logger.warn('[文档历史] 历史记录损坏，已清除该文件历史', error)
        safeRemoveItem(storage, key)
        return null
    }
}

/** 写入单文件历史记录；versions 为空时删除 key。返回是否写入成功（失败只记日志） */
export function writeDocumentHistoryRecord(
    storage: HistoryStorageLike | null,
    record: DocumentHistoryFileRecord
): boolean {
    if (!storage) {
        return false
    }
    const key = buildHistoryStorageKey(record.path)
    try {
        if (record.versions.length === 0) {
            storage.removeItem(key)
            return true
        }
        storage.setItem(
            key,
            JSON.stringify({ ...record, formatVersion: DOCUMENT_HISTORY_FORMAT_VERSION })
        )
        return true
    } catch (error) {
        logger.warn('[文档历史] 写入 localStorage 失败（已静默降级）', error)
        return false
    }
}

/** 列出全部历史 key（局部损坏/访问异常时返回已扫描部分） */
export function listDocumentHistoryStorageKeys(storage: HistoryStorageLike | null): string[] {
    if (!storage) {
        return []
    }
    const keys: string[] = []
    try {
        for (let index = 0; index < storage.length; index++) {
            const key = storage.key(index)
            if (typeof key === 'string' && key.startsWith(DOCUMENT_HISTORY_KEY_PREFIX)) {
                keys.push(key)
            }
        }
    } catch (error) {
        logger.warn('[文档历史] 枚举 localStorage 失败（已静默降级）', error)
    }
    return keys
}

/** 读取全部有效历史记录（key → 记录） */
export function readAllDocumentHistoryRecords(
    storage: HistoryStorageLike | null
): Array<{ key: string; record: DocumentHistoryFileRecord }> {
    const out: Array<{ key: string; record: DocumentHistoryFileRecord }> = []
    for (const key of listDocumentHistoryStorageKeys(storage)) {
        const raw = safeGetItem(storage, key)
        if (raw === null) {
            continue
        }
        try {
            const record = normalizeHistoryRecord(JSON.parse(raw) as unknown)
            if (record !== null && record.versions.length > 0) {
                out.push({ key, record })
            }
        } catch {
            // 损坏记录：后续 append/配额计算会跳过；无需在此重复告警
        }
    }
    return out
}

/** 单文件记录占用估算（路径 + 每版内容与元数据） */
function estimateRecordBytes(record: DocumentHistoryFileRecord): number {
    let bytes = FILE_METADATA_OVERHEAD_BYTES + estimateUtf8Bytes(record.path)
    for (const version of record.versions) {
        bytes +=
            version.sizeBytes +
            VERSION_METADATA_OVERHEAD_BYTES +
            estimateUtf8Bytes(version.id) +
            estimateUtf8Bytes(String(version.savedAt))
    }
    return bytes
}

/** 当前全部历史占用估算（字节；含元数据开销，略大于正文合计） */
export function calculateDocumentHistoryTotalBytes(storage: HistoryStorageLike | null): number {
    let total = 0
    for (const { record } of readAllDocumentHistoryRecords(storage)) {
        total += estimateRecordBytes(record)
    }
    return total
}

/** 历史用量统计（文件数/版本数/估算字节数） */
export function getDocumentHistoryUsage(storage: HistoryStorageLike | null): DocumentHistoryUsage {
    const records = readAllDocumentHistoryRecords(storage)
    let totalBytes = 0
    let versionCount = 0
    for (const { record } of records) {
        totalBytes += estimateRecordBytes(record)
        versionCount += record.versions.length
    }
    return {
        totalBytes,
        fileCount: records.length,
        versionCount
    }
}

/**
 * 全局配额淘汰：当总占用超过 `DOCUMENT_HISTORY_MAX_TOTAL_BYTES` 时，
 * 在全部文件间反复删除「savedAt 最旧」的版本（同时间按 id 稳定排序），直到不超限。
 * 写盘失败时立即停止（避免无限循环），返回淘汰数量。
 */
export function enforceDocumentHistoryQuota(storage: HistoryStorageLike | null): number {
    let evicted = 0
    // 防御性上限：即使存储实现异常，也绝不无限循环
    for (let guard = 0; guard < 10_000; guard++) {
        if (calculateDocumentHistoryTotalBytes(storage) <= DOCUMENT_HISTORY_MAX_TOTAL_BYTES) {
            return evicted
        }
        const records = readAllDocumentHistoryRecords(storage)
        let oldest: { record: DocumentHistoryFileRecord; index: number } | null = null
        for (const { record } of records) {
            for (let index = 0; index < record.versions.length; index++) {
                const version = record.versions[index]
                if (oldest === null) {
                    oldest = { record, index }
                    continue
                }
                const oldestVersion = oldest.record.versions[oldest.index]
                if (
                    version.savedAt < oldestVersion.savedAt ||
                    (version.savedAt === oldestVersion.savedAt &&
                        version.id.localeCompare(oldestVersion.id) < 0)
                ) {
                    oldest = { record, index }
                }
            }
        }
        if (oldest === null) {
            return evicted
        }
        oldest.record.versions.splice(oldest.index, 1)
        if (!writeDocumentHistoryRecord(storage, oldest.record)) {
            return evicted
        }
        evicted += 1
    }
    return evicted
}

/**
 * 追加一个保存快照（历史版本核心写入入口）。
 *
 * 流程：参数校验 → 单版本大小上限 → 读取旧记录 → 内容与最新版相同则去重 →
 * 追加并执行「每文件 20 版」淘汰 → 写入 → 全局 2 MiB 配额淘汰。
 */
export function appendDocumentHistoryVersion(
    storage: HistoryStorageLike | null,
    filePath: string,
    content: string,
    options: AppendDocumentHistoryOptions = {}
): AppendDocumentHistoryResult {
    const result: AppendDocumentHistoryResult = {
        status: 'added',
        evictedVersions: 0,
        totalBytes: 0,
        record: null
    }
    if (!storage) {
        return { ...result, status: 'unavailable' }
    }
    if (typeof filePath !== 'string' || normalizeHistoryPath(filePath).length === 0) {
        return { ...result, status: 'invalid-argument' }
    }
    if (typeof content !== 'string') {
        return { ...result, status: 'invalid-argument' }
    }
    const sizeBytes = estimateUtf8Bytes(content)
    if (sizeBytes > DOCUMENT_HISTORY_MAX_SNAPSHOT_BYTES) {
        logger.warn(
            `[文档历史] 文档超过单版本快照上限（${DOCUMENT_HISTORY_MAX_SNAPSHOT_BYTES} 字节），已跳过本次快照：${filePath}`
        )
        return { ...result, status: 'skipped-too-large' }
    }

    const savedAt = options.savedAt ?? Date.now()
    const record = readDocumentHistoryRecord(storage, filePath) ?? {
        formatVersion: DOCUMENT_HISTORY_FORMAT_VERSION,
        path: filePath,
        versions: []
    }
    // 以最新一次保存的路径形态作为展示路径（盘符大小写/分隔符可能前后不一致）
    record.path = filePath
    const latest = record.versions[record.versions.length - 1]
    if (latest !== undefined && latest.content === content) {
        return { ...result, status: 'duplicate', record }
    }

    record.versions.push({
        id: options.versionId ?? createHistoryVersionId(savedAt),
        savedAt,
        sizeBytes,
        content
    })
    // 每文件上限：淘汰最旧版本
    while (record.versions.length > DOCUMENT_HISTORY_MAX_VERSIONS_PER_FILE) {
        record.versions.shift()
        result.evictedVersions += 1
    }
    if (!writeDocumentHistoryRecord(storage, record)) {
        return { ...result, status: 'write-failed', record }
    }
    // 全局配额：超 2 MiB 时跨文件淘汰最旧版本
    result.evictedVersions += enforceDocumentHistoryQuota(storage)
    result.totalBytes = calculateDocumentHistoryTotalBytes(storage)
    return {
        ...result,
        status: 'added',
        record: readDocumentHistoryRecord(storage, filePath) ?? record
    }
}

/** 读取单文件版本列表（倒序：最新在前，供 UI 直接渲染） */
export function listDocumentHistoryVersions(
    storage: HistoryStorageLike | null,
    filePath: string
): DocumentHistoryVersion[] {
    const record = readDocumentHistoryRecord(storage, filePath)
    return record === null ? [] : [...record.versions].reverse()
}

/** 读取指定版本（不存在返回 null） */
export function getDocumentHistoryVersion(
    storage: HistoryStorageLike | null,
    filePath: string,
    versionId: string
): DocumentHistoryVersion | null {
    const record = readDocumentHistoryRecord(storage, filePath)
    if (record === null) {
        return null
    }
    return record.versions.find((version) => version.id === versionId) ?? null
}

/** 删除指定版本；删除后为空则移除整个 key。返回是否实际删除 */
export function deleteDocumentHistoryVersion(
    storage: HistoryStorageLike | null,
    filePath: string,
    versionId: string
): boolean {
    const record = readDocumentHistoryRecord(storage, filePath)
    if (record === null) {
        return false
    }
    const index = record.versions.findIndex((version) => version.id === versionId)
    if (index < 0) {
        return false
    }
    record.versions.splice(index, 1)
    return writeDocumentHistoryRecord(storage, record)
}

/** 清空单文件历史；返回是否成功（无历史也视为成功） */
export function clearDocumentHistoryForFile(
    storage: HistoryStorageLike | null,
    filePath: string
): boolean {
    if (!storage || !filePath || filePath.trim().length === 0) {
        return false
    }
    return safeRemoveItem(storage, buildHistoryStorageKey(filePath))
}

/** 清空全部文档历史（设置页/维护入口预留）；返回清理的 key 数量 */
export function clearAllDocumentHistory(storage: HistoryStorageLike | null): number {
    const keys = listDocumentHistoryStorageKeys(storage)
    let removed = 0
    for (const key of keys) {
        if (safeRemoveItem(storage, key)) {
            removed += 1
        }
    }
    return removed
}
