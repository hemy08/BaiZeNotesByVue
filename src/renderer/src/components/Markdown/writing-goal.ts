/**
 * 每日写作目标（纯函数 + 可注入 storage 的轻量存储层，零依赖）
 *
 * 设计目标：
 * - 不依赖 `window` / `localStorage` / Vue：渲染层传 `window.localStorage` 即可用，
 *   单测传内存替身（`{ getItem, setItem }` 最小接口），主进程/SSR 也可复用；
 * - 每日目标默认 1000 字，记录「今天已写」与记录日期（**本地时区** `YYYY-MM-DD`），
 *   读取时若记录日期不是今天则自动滚动重置「今日已写」（目标值保留）；
 * - 非法/损坏数据一律静默降级为默认值；`setItem` 失败（隐私模式、配额不足）
 *   不抛异常，仍返回内存中的最新结果，不影响写作本身；
 * - 存储键 `baize:writing-goal:v1`，未来结构变更请升版（旧键按默认值降级）。
 *
 * 典型用法（渲染层）：
 * ```ts
 * const storage = window.localStorage
 * const goal = loadWritingGoal(storage)
 * addWritingProgress(storage, 120)          // 今日 +120 字
 * const progress = getWritingGoalProgress(storage) // percent / remaining / achieved
 * ```
 */

/** 最小存储接口：`window.localStorage` 结构兼容，便于渲染层直接传入 */
export interface WritingGoalStorage {
    getItem(key: string): string | null
    setItem(key: string, value: string): void
}

/** 每日写作目标与今日进度（持久化结构） */
export interface WritingGoal {
    /** 每日目标（字符数，100 ~ 100000 的整数） */
    dailyGoal: number
    /** 今日已写字符数（0 ~ 10000000 的整数） */
    written: number
    /** 记录日期（本地时区 YYYY-MM-DD） */
    date: string
}

/** 写作目标进度（在持久化结构上补充展示字段） */
export interface WritingGoalProgress extends WritingGoal {
    /** 进度百分比（0 ~ 100 的整数，向下取整：未达标不会显示 100%） */
    percent: number
    /** 距目标还差多少字符（已达标为 0） */
    remaining: number
    /** 是否已达成每日目标 */
    achieved: boolean
}

/** 存储键（v1：结构变更时升版，旧数据按默认值降级） */
export const WRITING_GOAL_STORAGE_KEY = 'baize:writing-goal:v1'
/** 默认每日目标（字符数） */
export const DEFAULT_DAILY_WRITING_GOAL = 1000
/** 每日目标下限（与写作模式设置范围一致） */
export const MIN_DAILY_WRITING_GOAL = 100
/** 每日目标上限（与写作模式设置范围一致） */
export const MAX_DAILY_WRITING_GOAL = 100000
/** 单日累计写作字数上限（防御异常数据，避免数值失控） */
export const MAX_DAILY_WRITTEN = 10_000_000

/** 是否为可用的最小存储实现（null / 缺方法都按不可用降级） */
function isUsableStorage(
    storage: WritingGoalStorage | null | undefined
): storage is WritingGoalStorage {
    return (
        !!storage && typeof storage.getItem === 'function' && typeof storage.setItem === 'function'
    )
}

/** 本地时区日期字符串（YYYY-MM-DD）；使用本地 getFullYear/getMonth/getDate，不受 UTC 偏移影响 */
export function getLocalDateString(date: Date = new Date()): string {
    const year = date.getFullYear()
    const month = `${date.getMonth() + 1}`.padStart(2, '0')
    const day = `${date.getDate()}`.padStart(2, '0')
    return `${year}-${month}-${day}`
}

/** 子串是否全为 ASCII 数字（调用方保证非空：取自已校验长度的日期片段） */
function isAsciiDigits(value: string): boolean {
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index)
        if (code < 0x30 || code > 0x39) {
            return false
        }
    }
    return true
}

/** 校验 `YYYY-MM-DD` 是否为真实存在的本地日期（如 2026-02-30 判为非法） */
export function isValidLocalDateString(value: unknown): value is string {
    if (typeof value !== 'string' || value.length !== 10) {
        return false
    }
    if (value[4] !== '-' || value[7] !== '-') {
        return false
    }
    const yearPart = value.slice(0, 4)
    const monthPart = value.slice(5, 7)
    const dayPart = value.slice(8, 10)
    if (!isAsciiDigits(yearPart) || !isAsciiDigits(monthPart) || !isAsciiDigits(dayPart)) {
        return false
    }
    const year = Number(yearPart)
    const month = Number(monthPart)
    const day = Number(dayPart)
    if (year < 1970 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) {
        return false
    }
    const localDate = new Date(year, month - 1, day)
    return (
        localDate.getFullYear() === year &&
        localDate.getMonth() === month - 1 &&
        localDate.getDate() === day
    )
}

/** 解析调用方传入的 today；非法值回落到本机当前本地日期 */
function resolveToday(today?: string): string {
    return isValidLocalDateString(today) ? today : getLocalDateString()
}

/** 把已确认有限的目标值四舍五入并钳制到 [min, max] */
function clampRoundedInteger(value: number, min: number, max: number): number {
    const rounded = Math.round(value)
    if (rounded < min) {
        return min
    }
    if (rounded > max) {
        return max
    }
    return rounded
}

/** 归一化每日目标（非法值回落默认；越界钳制到 [MIN, MAX]） */
function normalizeDailyGoal(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 1) {
        return DEFAULT_DAILY_WRITING_GOAL
    }
    return clampRoundedInteger(value, MIN_DAILY_WRITING_GOAL, MAX_DAILY_WRITING_GOAL)
}

/** 归一化今日已写（非法值归零；负数归零；越界钳制到 [0, MAX_DAILY_WRITTEN]） */
function normalizeWritten(value: unknown): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return 0
    }
    const floored = Math.floor(value)
    return floored > MAX_DAILY_WRITTEN ? MAX_DAILY_WRITTEN : floored
}

/** 生成默认目标（今日已写为 0） */
export function createDefaultWritingGoal(today?: string): WritingGoal {
    return {
        dailyGoal: DEFAULT_DAILY_WRITING_GOAL,
        written: 0,
        date: resolveToday(today)
    }
}

/**
 * 把任意存储值 / 外部输入归一化为合法目标。
 *
 * @param raw 已 `JSON.parse` 的原始数据（或任意未知值）
 * @param today 今天的本地日期（非法时回落本机当前日期）
 * @returns 归一化后的目标；记录日期不是今天时自动滚动重置「今日已写」（目标值保留）
 */
export function normalizeWritingGoal(raw: unknown, today?: string): WritingGoal {
    const resolvedToday = resolveToday(today)
    if (!raw || typeof raw !== 'object') {
        return createDefaultWritingGoal(resolvedToday)
    }
    const source = raw as Record<string, unknown>
    const dailyGoal = normalizeDailyGoal(source.dailyGoal)
    const recordDateValid = isValidLocalDateString(source.date)
    // 跨天滚动 / 记录日期损坏：今日已写归零（目标值保留），避免把损坏数据计入进度
    const written =
        recordDateValid && source.date === resolvedToday ? normalizeWritten(source.written) : 0
    return { dailyGoal, written, date: resolvedToday }
}

/** 读取存储中的原始值；存储不可用 / 无数据 / JSON 损坏时返回 null（静默降级） */
export function readWritingGoalRawStorage(storage: WritingGoalStorage | null | undefined): unknown {
    if (!isUsableStorage(storage)) {
        return null
    }
    try {
        const rawValue = storage.getItem(WRITING_GOAL_STORAGE_KEY)
        if (typeof rawValue !== 'string' || rawValue === '') {
            return null
        }
        return JSON.parse(rawValue) as unknown
    } catch {
        // 存储不可用（隐私模式/安全策略）或 JSON 损坏：按无数据处理，不阻塞写作
        return null
    }
}

/** 写入目标；存储不可用 / 写入抛错时返回 false（不抛出，由调用方静默降级） */
function writeWritingGoal(
    storage: WritingGoalStorage | null | undefined,
    goal: WritingGoal
): boolean {
    if (!isUsableStorage(storage)) {
        return false
    }
    try {
        storage.setItem(WRITING_GOAL_STORAGE_KEY, JSON.stringify(goal))
        return true
    } catch {
        // 配额不足/隐私模式：持久化失败可接受，内存结果仍可作为兜底
        return false
    }
}

/**
 * 读取每日写作目标（首次使用 / 数据损坏返回默认值；跨天自动重置今日已写）。
 *
 * 只读：滚动重置不会回写存储，下一次 `addWritingProgress` / `saveWritingGoal` 时自然落盘。
 *
 * @param storage 最小存储实现（不可用时返回默认值）
 * @param today 今天的本地日期 `YYYY-MM-DD`，缺省取本机当前日期（便于测试注入）
 */
export function loadWritingGoal(
    storage: WritingGoalStorage | null | undefined,
    today?: string
): WritingGoal {
    const resolvedToday = resolveToday(today)
    const raw = readWritingGoalRawStorage(storage)
    if (raw === null) {
        return createDefaultWritingGoal(resolvedToday)
    }
    return normalizeWritingGoal(raw, resolvedToday)
}

/**
 * 保存每日写作目标（整体覆盖，写入前做合法化：目标钳制、已写归一、日期校验）。
 *
 * @returns 是否写入成功（存储不可用/写入抛错返回 false，不抛异常）
 */
export function saveWritingGoal(
    storage: WritingGoalStorage | null | undefined,
    goal: WritingGoal
): boolean {
    const fallbackDate = getLocalDateString()
    const source = (goal && typeof goal === 'object' ? goal : {}) as Partial<WritingGoal>
    const date = isValidLocalDateString(source.date) ? source.date : fallbackDate
    const normalized: WritingGoal = {
        dailyGoal: normalizeDailyGoal(source.dailyGoal),
        written: normalizeWritten(source.written),
        date
    }
    return writeWritingGoal(storage, normalized)
}

/**
 * 累加今日写作字数（跨天自动重置后累加），并尝试持久化。
 *
 * 参数非法（非有限数 / ≤0）时视为未发生写入，直接返回当前目标；
 * 持久化失败不抛异常，返回值始终是内存中的最新目标。
 *
 * @param storage 最小存储实现
 * @param chars 本次新增字数（负数/NaN/Infinity 忽略；小数向下取整）
 * @param today 今天的本地日期，缺省取本机当前日期
 */
export function addWritingProgress(
    storage: WritingGoalStorage | null | undefined,
    chars: number,
    today?: string
): WritingGoal {
    const resolvedToday = resolveToday(today)
    const current = loadWritingGoal(storage, resolvedToday)
    const increment = typeof chars === 'number' && Number.isFinite(chars) ? Math.floor(chars) : 0
    if (increment <= 0) {
        return current
    }
    const nextWritten = Math.min(MAX_DAILY_WRITTEN, current.written + increment)
    const next: WritingGoal = {
        dailyGoal: current.dailyGoal,
        written: nextWritten,
        date: resolvedToday
    }
    writeWritingGoal(storage, next)
    return next
}

/**
 * 计算目标进度（纯函数，不读写存储）：百分比向下取整并钳制到 0 ~ 100，
 * 未达标不会出现 100%。
 */
export function computeWritingGoalProgress(goal: WritingGoal): WritingGoalProgress {
    const source = (goal && typeof goal === 'object' ? goal : {}) as Partial<WritingGoal>
    const dailyGoal = normalizeDailyGoal(source.dailyGoal)
    const written = normalizeWritten(source.written)
    const date = isValidLocalDateString(source.date) ? source.date : getLocalDateString()
    // dailyGoal 已归一化为 ≥ MIN_DAILY_WRITING_GOAL，不存在除零
    const percent = Math.min(100, Math.floor((written / dailyGoal) * 100))
    return {
        dailyGoal,
        written,
        date,
        percent,
        remaining: Math.max(0, dailyGoal - written),
        achieved: written >= dailyGoal
    }
}

/**
 * 读取并计算今日写作目标进度（跨天自动重置；存储异常静默降级为默认目标）。
 *
 * @param storage 最小存储实现
 * @param today 今天的本地日期，缺省取本机当前日期
 */
export function getWritingGoalProgress(
    storage: WritingGoalStorage | null | undefined,
    today?: string
): WritingGoalProgress {
    return computeWritingGoalProgress(loadWritingGoal(storage, today))
}
