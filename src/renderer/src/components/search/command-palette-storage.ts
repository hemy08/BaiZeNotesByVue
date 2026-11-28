/**
 * A9 命令面板 —— 本机持久化纯逻辑（1.5.6 P2 批次 C：REQ-10 最近命令/使用频率 + REQ-11 分组折叠）
 *
 * 设计约束（与开发规范对齐）：
 * - **纯函数 + 注入存储**：本模块不直接访问 `window` / `localStorage`，组件传入存储替身，
 *   单测用内存实现复跑；不新增 IPC、不写主进程配置文件（REQ-10 明确前端 localStorage 足够）。
 * - **读取容错**：localStorage 缺失（隐私模式/被禁用）、JSON 损坏、字段类型非法、条目
 *   结构畸形一律降级为空数据，绝不抛错；写入失败返回 false（本次会话内存内仍生效）。
 * - **容量上限**：使用历史最多保留 `COMMAND_USAGE_LIMIT`（100）条命令，按 `lastUsed`
 *   倒序淘汰最旧记录，避免长期使用无限膨胀。
 * - **I18N-08**：只存命令 id / 时间戳 / 次数，不存展示名；展示文案由组件按 i18n 键渲染。
 * - 空查询「最近使用」分区展示条数由 `RECENT_COMMANDS_LIMIT`（5）约束；只展示「执行后
 *   会关闭面板的真实命令」，模式切换类命令（`closeOnRun === false`）由组件侧过滤，
 *   避免「最近使用」里出现「显示命令面板」这类面板自身导航项。
 */

// ==================== 存储契约（localStorage 键 / 容量上限 / 接口） ====================

/** 最近命令与使用频率的本机存储键（命令 id → { lastUsed, count }） */
export const COMMAND_USAGE_STORAGE_KEY = 'baize:command-palette:usage'

/** 分组折叠状态的本机存储键（分组 key 数组；最近使用分区使用保留 key 'recent'） */
export const COMMAND_COLLAPSED_GROUPS_STORAGE_KEY = 'baize:command-palette:collapsed-groups'

/** 使用历史容量上限（需求：限 100 条） */
export const COMMAND_USAGE_LIMIT = 100

/** 空查询「最近使用」分区的展示条数上限（需求：最近执行的 N 条，置顶） */
export const RECENT_COMMANDS_LIMIT = 5

/** 最近使用分区的固定分组 key（与分类 key `editorUi.commandPalette.category.*` 区分） */
export const RECENT_COMMANDS_SECTION_KEY = 'recent'

/** 命令使用记录（单条命令） */
export interface CommandUsageEntry {
    /** 最近一次执行时间（毫秒时间戳，正数） */
    lastUsed: number
    /** 累计执行次数（正整数） */
    count: number
}

/** 命令 id → 使用记录（读取后已归一化，且已按容量上限裁剪） */
export type CommandUsageMap = Readonly<Record<string, CommandUsageEntry>>

/**
 * 最小存储接口（`window.localStorage` 结构兼容）。
 * 用注入而非直接读全局，保证纯逻辑可在 node/jsdom 单测中用内存替身复跑。
 */
export interface CommandPaletteStorageLike {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

// ==================== 使用历史（REQ-10） ====================

/** 是否为普通对象（数组 / null 视为非对象） */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 归一化单条使用记录（lastUsed/count 必须为正数，否则丢弃） */
function normalizeUsageEntry(raw: unknown): CommandUsageEntry | null {
    if (!isRecord(raw)) {
        return null
    }
    const { lastUsed, count } = raw
    if (typeof lastUsed !== 'number' || !Number.isFinite(lastUsed) || lastUsed <= 0) {
        return null
    }
    if (typeof count !== 'number' || !Number.isFinite(count) || count <= 0) {
        return null
    }
    return {
        lastUsed: Math.trunc(lastUsed),
        count: Math.max(1, Math.trunc(count))
    }
}

/** 按使用记录排序：lastUsed 倒序 → count 倒序 → 命令 id 字典序（结果稳定可测） */
function sortUsageEntries(usage: CommandUsageMap): Array<[string, CommandUsageEntry]> {
    return Object.entries(usage).sort((left, right) => {
        const byLastUsed = right[1].lastUsed - left[1].lastUsed
        if (byLastUsed !== 0) {
            return byLastUsed
        }
        const byCount = right[1].count - left[1].count
        if (byCount !== 0) {
            return byCount
        }
        return left[0].localeCompare(right[0])
    })
}

/**
 * 归一化原始 JSON（仅保留「键为非空字符串 + 值为合法记录」的条目）。
 * @param raw JSON.parse 后的任意值（不受信任，来自可被用户/历史版本改写的 localStorage）
 */
export function normalizeCommandUsage(raw: unknown): CommandUsageMap {
    const result: Record<string, CommandUsageEntry> = {}
    if (!isRecord(raw)) {
        return result
    }
    for (const [id, value] of Object.entries(raw)) {
        if (id.length === 0) {
            continue
        }
        const entry = normalizeUsageEntry(value)
        if (entry) {
            result[id] = entry
        }
    }
    return result
}

/**
 * 按 lastUsed 倒序裁剪到 `limit` 条（同时间按 count 倒序、再按 id 字典序）。
 * 纯函数：返回新对象，不修改入参。
 */
export function pruneCommandUsage(
    usage: CommandUsageMap,
    limit: number = COMMAND_USAGE_LIMIT
): CommandUsageMap {
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0
    const result: Record<string, CommandUsageEntry> = {}
    for (const [id, entry] of sortUsageEntries(usage).slice(0, safeLimit)) {
        result[id] = entry
    }
    return result
}

/**
 * 读取使用历史：
 * - 存储不可用 → {}；
 * - 无记录 / JSON 解析失败 / 顶层非对象 → {}（回退空数据，不抛错）；
 * - 非法条目丢弃、超量按容量上限裁剪（读取侧同样防御，防止手改 localStorage 后膨胀）。
 */
export function readCommandUsage(storage: CommandPaletteStorageLike | null): CommandUsageMap {
    if (!storage) {
        return {}
    }
    let parsed: unknown
    try {
        const raw = storage.getItem(COMMAND_USAGE_STORAGE_KEY)
        if (!raw) {
            return {}
        }
        parsed = JSON.parse(raw)
    } catch {
        return {}
    }
    return pruneCommandUsage(normalizeCommandUsage(parsed))
}

/** 写入使用历史（先按容量上限裁剪）；存储不可用或写入抛错时返回 false，调用方静默降级 */
export function writeCommandUsage(
    storage: CommandPaletteStorageLike | null,
    usage: CommandUsageMap
): boolean {
    if (!storage) {
        return false
    }
    try {
        storage.setItem(COMMAND_USAGE_STORAGE_KEY, JSON.stringify(pruneCommandUsage(usage)))
        return true
    } catch {
        return false
    }
}

/**
 * 记录一次命令执行（纯函数：返回新 map，不修改入参）。
 * 同一命令累加 count 并把 lastUsed 刷新为 `now`，随后按容量上限裁剪。
 */
export function applyCommandUsage(
    usage: CommandUsageMap,
    commandId: string,
    now: number = Date.now()
): CommandUsageMap {
    if (commandId.length === 0) {
        return pruneCommandUsage(usage)
    }
    const current = usage[commandId]
    const next: Record<string, CommandUsageEntry> = { ...usage }
    next[commandId] = {
        lastUsed: Number.isFinite(now) ? Math.max(1, Math.trunc(now)) : Date.now(),
        count: (current?.count ?? 0) + 1
    }
    return pruneCommandUsage(next)
}

/**
 * 读取 → 记录一次 → 写回；即使写入失败也返回内存中最新 map（本次会话内排序仍生效）。
 * @param now 可注入时间戳（单测固定时间，避免依赖真实时钟）
 */
export function recordCommandUsage(
    storage: CommandPaletteStorageLike | null,
    commandId: string,
    now: number = Date.now()
): CommandUsageMap {
    const next = applyCommandUsage(readCommandUsage(storage), commandId, now)
    writeCommandUsage(storage, next)
    return next
}

/**
 * 按使用记录取「最近执行」的命令 id 列表：
 * lastUsed 倒序 → count 倒序 → id 字典序，最多 `limit` 条（默认最近 5 条）。
 */
export function getRecentCommandIds(
    usage: CommandUsageMap,
    limit: number = RECENT_COMMANDS_LIMIT
): string[] {
    const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.trunc(limit)) : 0
    return sortUsageEntries(usage)
        .slice(0, safeLimit)
        .map(([id]) => id)
}

/**
 * 使用记录比较器（供搜索排序使用：REQ-10「最近使用 > 频率」）。
 * 返回值语义与 `Array.prototype.sort` 一致：负数 = left 在前。
 * - 有记录优先于无记录（最近用过 → 更靠前）；
 * - 均有记录时 lastUsed 新者优先，其次 count 大者优先；
 * - 完全并列返回 0（调用方继续用后续权重比较）。
 */
export function compareCommandUsage(
    leftId: string,
    rightId: string,
    usage: CommandUsageMap | undefined
): number {
    const left = usage?.[leftId]
    const right = usage?.[rightId]
    if (!left && !right) {
        return 0
    }
    if (!left) {
        return 1
    }
    if (!right) {
        return -1
    }
    if (left.lastUsed !== right.lastUsed) {
        return right.lastUsed - left.lastUsed
    }
    if (left.count !== right.count) {
        return right.count - left.count
    }
    return 0
}

// ==================== 分组折叠（REQ-11） ====================

/** 读取折叠分组 key 集合（非法项丢弃；存储不可用/JSON 损坏 → 空集合） */
export function readCollapsedGroupKeys(storage: CommandPaletteStorageLike | null): Set<string> {
    const result = new Set<string>()
    if (!storage) {
        return result
    }
    let parsed: unknown
    try {
        const raw = storage.getItem(COMMAND_COLLAPSED_GROUPS_STORAGE_KEY)
        if (!raw) {
            return result
        }
        parsed = JSON.parse(raw)
    } catch {
        return result
    }
    if (!Array.isArray(parsed)) {
        return result
    }
    for (const item of parsed) {
        if (typeof item === 'string' && item.length > 0) {
            result.add(item)
        }
    }
    return result
}

/** 写入折叠分组 key 集合（排序后写，保证同一状态在存储中稳定可比） */
export function writeCollapsedGroupKeys(
    storage: CommandPaletteStorageLike | null,
    keys: ReadonlySet<string>
): boolean {
    if (!storage) {
        return false
    }
    const normalized = [...keys].filter((key) => typeof key === 'string' && key.length > 0).sort()
    try {
        storage.setItem(COMMAND_COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify(normalized))
        return true
    } catch {
        return false
    }
}

/** 切换单个分组的折叠状态（纯函数：返回新 Set，不修改入参） */
export function toggleCollapsedGroupKey(current: ReadonlySet<string>, key: string): Set<string> {
    const next = new Set(current)
    if (key.length === 0) {
        return next
    }
    if (next.has(key)) {
        next.delete(key)
    } else {
        next.add(key)
    }
    return next
}
