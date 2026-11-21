/**
 * 每日写作目标单测（writing-goal.ts）
 *
 * 覆盖：首次使用默认目标、持久化读写、跨天滚动重置、非法/损坏数据降级、
 * 存储读写异常静默降级、进度百分比钳制、累计字数边界，以及本地日期工具。
 * 存储一律用内存替身（最小 {getItem,setItem} 接口），不触碰真实 localStorage/window。
 */
import { describe, expect, it } from 'vitest'
import {
    DEFAULT_DAILY_WRITING_GOAL,
    MAX_DAILY_WRITING_GOAL,
    MAX_DAILY_WRITTEN,
    MIN_DAILY_WRITING_GOAL,
    WRITING_GOAL_STORAGE_KEY,
    addWritingProgress,
    computeWritingGoalProgress,
    createDefaultWritingGoal,
    getLocalDateString,
    getWritingGoalProgress,
    isValidLocalDateString,
    loadWritingGoal,
    normalizeWritingGoal,
    saveWritingGoal,
    type WritingGoal,
    type WritingGoalStorage
} from '../../src/renderer/src/components/Markdown/writing-goal'

/** 测试用最小存储替身：记录读写键值，便于断言「是否回写」与异常场景 */
class MemoryStorage implements WritingGoalStorage {
    private readonly data = new Map<string, string>()
    readonly readKeys: string[] = []
    readonly writeKeys: string[] = []
    lastValue: string | null = null

    constructor(initial?: Record<string, string>) {
        for (const [key, value] of Object.entries(initial ?? {})) {
            this.data.set(key, value)
        }
    }

    getItem(key: string): string | null {
        this.readKeys.push(key)
        return this.data.get(key) ?? null
    }

    setItem(key: string, value: string): void {
        this.writeKeys.push(key)
        this.lastValue = value
        this.data.set(key, value)
    }

    /** 直接读取原始存储内容（断言持久化结果） */
    peek(key: string = WRITING_GOAL_STORAGE_KEY): string | null {
        return this.data.get(key) ?? null
    }
}

/** 已持久化目标的原始 JSON 写法 */
function storedGoal(goal: WritingGoal): string {
    return JSON.stringify(goal)
}

describe('本地日期工具', () => {
    it('按本地时区输出 YYYY-MM-DD（不随 UTC 偏移漂移）', () => {
        expect(getLocalDateString(new Date(2026, 10, 21, 23, 59, 59))).toBe('2026-11-21')
        expect(getLocalDateString(new Date(2026, 0, 5, 0, 0, 0))).toBe('2026-01-05')
        expect(getLocalDateString(new Date(2025, 11, 31, 12, 0, 0))).toBe('2025-12-31')
    })

    it('校验真实存在的日期', () => {
        expect(isValidLocalDateString('2026-11-21')).toBe(true)
        expect(isValidLocalDateString('2024-02-29')).toBe(true)
        expect(isValidLocalDateString('1970-01-01')).toBe(true)
    })

    it('拒绝非法日期格式/不存在的日期/非字符串', () => {
        expect(isValidLocalDateString('2026-02-30')).toBe(false)
        expect(isValidLocalDateString('2026-13-01')).toBe(false)
        expect(isValidLocalDateString('2026-00-10')).toBe(false)
        expect(isValidLocalDateString('2026-1-1')).toBe(false)
        expect(isValidLocalDateString('abcd-ef-gh')).toBe(false)
        expect(isValidLocalDateString('2026/11/21')).toBe(false)
        expect(isValidLocalDateString('')).toBe(false)
        expect(isValidLocalDateString(null)).toBe(false)
        expect(isValidLocalDateString(20261121)).toBe(false)
    })
})

describe('首次使用与默认值', () => {
    it('无存储数据时返回默认目标（1000 字、今日已写 0）', () => {
        const storage = new MemoryStorage()
        expect(loadWritingGoal(storage, '2026-11-21')).toEqual({
            dailyGoal: DEFAULT_DAILY_WRITING_GOAL,
            written: 0,
            date: '2026-11-21'
        })
        expect(DEFAULT_DAILY_WRITING_GOAL).toBe(1000)
    })

    it('读取使用固定存储键 baize:writing-goal:v1', () => {
        const storage = new MemoryStorage()
        loadWritingGoal(storage, '2026-11-21')
        expect(WRITING_GOAL_STORAGE_KEY).toBe('baize:writing-goal:v1')
        expect(storage.readKeys).toEqual([WRITING_GOAL_STORAGE_KEY])
    })

    it('首次读取是只读行为，不回写存储', () => {
        const storage = new MemoryStorage()
        loadWritingGoal(storage, '2026-11-21')
        expect(storage.writeKeys).toEqual([])
    })

    it('createDefaultWritingGoal 使用注入日期', () => {
        expect(createDefaultWritingGoal('2026-11-21')).toEqual({
            dailyGoal: 1000,
            written: 0,
            date: '2026-11-21'
        })
    })

    it('today 缺省时使用本机当前本地日期', () => {
        const storage = new MemoryStorage()
        expect(loadWritingGoal(storage).date).toBe(getLocalDateString())
        expect(createDefaultWritingGoal().date).toBe(getLocalDateString())
        expect(addWritingProgress(storage, 10).date).toBe(getLocalDateString())
    })
})

describe('持久化读取', () => {
    it('读取已保存的目标与今日已写', () => {
        const storage = new MemoryStorage({
            [WRITING_GOAL_STORAGE_KEY]: storedGoal({
                dailyGoal: 2000,
                written: 350,
                date: '2026-11-21'
            })
        })
        expect(loadWritingGoal(storage, '2026-11-21')).toEqual({
            dailyGoal: 2000,
            written: 350,
            date: '2026-11-21'
        })
    })

    it('save 后 load 可完整还原', () => {
        const storage = new MemoryStorage()
        const goal: WritingGoal = { dailyGoal: 1500, written: 420, date: '2026-11-21' }
        expect(saveWritingGoal(storage, goal)).toBe(true)
        expect(loadWritingGoal(storage, '2026-11-21')).toEqual(goal)
        expect(storage.writeKeys).toEqual([WRITING_GOAL_STORAGE_KEY])
    })
})

describe('跨天滚动重置', () => {
    it('读取到旧日期记录时今日已写归零、每日目标保留', () => {
        const storage = new MemoryStorage({
            [WRITING_GOAL_STORAGE_KEY]: storedGoal({
                dailyGoal: 1500,
                written: 800,
                date: '2026-11-20'
            })
        })
        expect(loadWritingGoal(storage, '2026-11-21')).toEqual({
            dailyGoal: 1500,
            written: 0,
            date: '2026-11-21'
        })
    })

    it('跨天读取同样不回写存储（等真实写入时落盘）', () => {
        const storage = new MemoryStorage({
            [WRITING_GOAL_STORAGE_KEY]: storedGoal({
                dailyGoal: 1200,
                written: 900,
                date: '2026-11-20'
            })
        })
        loadWritingGoal(storage, '2026-11-21')
        expect(storage.writeKeys).toEqual([])
    })

    it('跨天后累加：先重置本次、再累加新字数', () => {
        const storage = new MemoryStorage({
            [WRITING_GOAL_STORAGE_KEY]: storedGoal({
                dailyGoal: 1200,
                written: 900,
                date: '2026-11-20'
            })
        })
        const next = addWritingProgress(storage, 100, '2026-11-21')
        expect(next).toEqual({ dailyGoal: 1200, written: 100, date: '2026-11-21' })
        expect(JSON.parse(storage.peek() ?? '{}')).toEqual(next)
    })
})

describe('累加今日写作字数', () => {
    it('同日累加并持久化', () => {
        const storage = new MemoryStorage({
            [WRITING_GOAL_STORAGE_KEY]: storedGoal({
                dailyGoal: 1000,
                written: 300,
                date: '2026-11-21'
            })
        })
        const next = addWritingProgress(storage, 120, '2026-11-21')
        expect(next.written).toBe(420)
        expect(storage.writeKeys).toEqual([WRITING_GOAL_STORAGE_KEY])
        expect(JSON.parse(storage.peek() ?? '{}')).toEqual({
            dailyGoal: 1000,
            written: 420,
            date: '2026-11-21'
        })
    })

    it('首次累加自动创建默认目标', () => {
        const storage = new MemoryStorage()
        expect(addWritingProgress(storage, 66, '2026-11-21')).toEqual({
            dailyGoal: DEFAULT_DAILY_WRITING_GOAL,
            written: 66,
            date: '2026-11-21'
        })
    })

    it('小数向下取整，超过上限钳制到 MAX_DAILY_WRITTEN', () => {
        const storage = new MemoryStorage()
        expect(addWritingProgress(storage, 10.9, '2026-11-21').written).toBe(10)
        expect(addWritingProgress(storage, MAX_DAILY_WRITTEN + 100, '2026-11-21').written).toBe(
            MAX_DAILY_WRITTEN
        )
    })

    it('负数 / 0 / NaN / Infinity 忽略，不产生写入', () => {
        const storage = new MemoryStorage({
            [WRITING_GOAL_STORAGE_KEY]: storedGoal({
                dailyGoal: 1000,
                written: 300,
                date: '2026-11-21'
            })
        })
        for (const chars of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(addWritingProgress(storage, chars, '2026-11-21').written).toBe(300)
        }
        expect(storage.writeKeys).toEqual([])
    })
})

describe('进度计算与钳制', () => {
    it('未达标：百分比向下取整、剩余字数正确', () => {
        expect(
            computeWritingGoalProgress({ dailyGoal: 1000, written: 250, date: '2026-11-21' })
        ).toEqual({
            dailyGoal: 1000,
            written: 250,
            date: '2026-11-21',
            percent: 25,
            remaining: 750,
            achieved: false
        })
    })

    it('99.9% 不显示 100%（未达标）', () => {
        const progress = computeWritingGoalProgress({
            dailyGoal: 1000,
            written: 999,
            date: '2026-11-21'
        })
        expect(progress.percent).toBe(99)
        expect(progress.achieved).toBe(false)
        expect(progress.remaining).toBe(1)
    })

    it('恰好达标：100%、剩余 0', () => {
        const progress = computeWritingGoalProgress({
            dailyGoal: 1000,
            written: 1000,
            date: '2026-11-21'
        })
        expect(progress.percent).toBe(100)
        expect(progress.remaining).toBe(0)
        expect(progress.achieved).toBe(true)
    })

    it('超额完成：百分比钳制到 100、剩余不为负', () => {
        const progress = computeWritingGoalProgress({
            dailyGoal: 1000,
            written: 1500,
            date: '2026-11-21'
        })
        expect(progress.percent).toBe(100)
        expect(progress.remaining).toBe(0)
        expect(progress.achieved).toBe(true)
    })

    it('非法目标/已写值在计算前被归一化', () => {
        const progress = computeWritingGoalProgress({
            dailyGoal: 0,
            written: -10,
            date: 'bad-date'
        } as WritingGoal)
        expect(progress.dailyGoal).toBe(DEFAULT_DAILY_WRITING_GOAL)
        expect(progress.written).toBe(0)
        expect(isValidLocalDateString(progress.date)).toBe(true)
    })

    it('从存储读取进度（跨天归零后计算）', () => {
        const storage = new MemoryStorage({
            [WRITING_GOAL_STORAGE_KEY]: storedGoal({
                dailyGoal: 1000,
                written: 500,
                date: '2026-11-20'
            })
        })
        expect(getWritingGoalProgress(storage, '2026-11-21')).toEqual({
            dailyGoal: 1000,
            written: 0,
            date: '2026-11-21',
            percent: 0,
            remaining: 1000,
            achieved: false
        })
    })

    it('goal 为 null 时按默认目标计算进度', () => {
        const progress = computeWritingGoalProgress(null as unknown as WritingGoal)
        expect(progress).toMatchObject({
            dailyGoal: DEFAULT_DAILY_WRITING_GOAL,
            written: 0,
            percent: 0,
            remaining: DEFAULT_DAILY_WRITING_GOAL,
            achieved: false
        })
        expect(isValidLocalDateString(progress.date)).toBe(true)
    })
})

describe('非法 / 损坏数据降级', () => {
    it.each([
        ['not-json', '无法解析的 JSON'],
        ['null', 'null 字面量'],
        ['[]', '数组'],
        ['"字符串"', '字符串字面量'],
        ['123', '数字字面量']
    ])('存储值为 %s（%s）时回落默认目标', (rawValue) => {
        const storage = new MemoryStorage({ [WRITING_GOAL_STORAGE_KEY]: rawValue })
        expect(loadWritingGoal(storage, '2026-11-21')).toEqual({
            dailyGoal: DEFAULT_DAILY_WRITING_GOAL,
            written: 0,
            date: '2026-11-21'
        })
    })

    it('字段类型错误时逐项回落默认值', () => {
        const storage = new MemoryStorage({
            [WRITING_GOAL_STORAGE_KEY]: '{"dailyGoal":"2000","written":"500","date":"2026-11-21"}'
        })
        expect(loadWritingGoal(storage, '2026-11-21')).toEqual({
            dailyGoal: DEFAULT_DAILY_WRITING_GOAL,
            written: 0,
            date: '2026-11-21'
        })
    })

    it('目标值越界钳制到 [100, 100000]，已写值取整并钳制', () => {
        const tooSmall = new MemoryStorage({
            [WRITING_GOAL_STORAGE_KEY]: '{"dailyGoal":50,"written":2000.7,"date":"2026-11-21"}'
        })
        expect(loadWritingGoal(tooSmall, '2026-11-21')).toEqual({
            dailyGoal: MIN_DAILY_WRITING_GOAL,
            written: 2000,
            date: '2026-11-21'
        })
        const tooLarge = new MemoryStorage({
            [WRITING_GOAL_STORAGE_KEY]: '{"dailyGoal":9999999,"date":"2026-11-21"}'
        })
        expect(loadWritingGoal(tooLarge, '2026-11-21').dailyGoal).toBe(MAX_DAILY_WRITING_GOAL)
    })

    it('记录日期非法时视为跨天：今日已写归零', () => {
        const storage = new MemoryStorage({
            [WRITING_GOAL_STORAGE_KEY]: '{"dailyGoal":1300,"written":700,"date":"bad-date"}'
        })
        expect(loadWritingGoal(storage, '2026-11-21')).toEqual({
            dailyGoal: 1300,
            written: 0,
            date: '2026-11-21'
        })
    })

    it('normalizeWritingGoal 可独立归一化任意外部输入', () => {
        expect(normalizeWritingGoal(null, '2026-11-21')).toEqual({
            dailyGoal: DEFAULT_DAILY_WRITING_GOAL,
            written: 0,
            date: '2026-11-21'
        })
        expect(normalizeWritingGoal(undefined, '2026-11-21')).toEqual({
            dailyGoal: DEFAULT_DAILY_WRITING_GOAL,
            written: 0,
            date: '2026-11-21'
        })
        expect(
            normalizeWritingGoal({ dailyGoal: 500, written: 30, date: '2026-11-21' }, '2026-11-21')
        ).toEqual({ dailyGoal: 500, written: 30, date: '2026-11-21' })
    })
})

describe('存储异常静默降级', () => {
    it('getItem 抛错时读取回落默认值、不抛异常', () => {
        const brokenStorage: WritingGoalStorage = {
            getItem(): string | null {
                throw new Error('storage unavailable')
            },
            setItem(): void {
                // 读取已失败，写入不应被调用
            }
        }
        expect(loadWritingGoal(brokenStorage, '2026-11-21')).toEqual({
            dailyGoal: DEFAULT_DAILY_WRITING_GOAL,
            written: 0,
            date: '2026-11-21'
        })
        expect(getWritingGoalProgress(brokenStorage, '2026-11-21').percent).toBe(0)
    })

    it('setItem 抛错时 save 返回 false、不抛异常', () => {
        const brokenStorage: WritingGoalStorage = {
            getItem(): string | null {
                return null
            },
            setItem(): void {
                throw new Error('QuotaExceededError')
            }
        }
        expect(() =>
            saveWritingGoal(brokenStorage, {
                dailyGoal: 1000,
                written: 10,
                date: '2026-11-21'
            })
        ).not.toThrow()
        expect(
            saveWritingGoal(brokenStorage, { dailyGoal: 1000, written: 10, date: '2026-11-21' })
        ).toBe(false)
    })

    it('setItem 抛错时 addWritingProgress 仍返回内存中的最新结果', () => {
        const brokenStorage: WritingGoalStorage = {
            getItem(): string | null {
                return JSON.stringify({
                    dailyGoal: 1000,
                    written: 300,
                    date: '2026-11-21'
                })
            },
            setItem(): void {
                throw new Error('QuotaExceededError')
            }
        }
        expect(addWritingProgress(brokenStorage, 50, '2026-11-21')).toEqual({
            dailyGoal: 1000,
            written: 350,
            date: '2026-11-21'
        })
    })

    it('storage 为 null/undefined 时全部接口静默降级', () => {
        expect(loadWritingGoal(null, '2026-11-21').dailyGoal).toBe(DEFAULT_DAILY_WRITING_GOAL)
        expect(loadWritingGoal(undefined, '2026-11-21').written).toBe(0)
        expect(saveWritingGoal(null, { dailyGoal: 1000, written: 0, date: '2026-11-21' })).toBe(
            false
        )
        expect(addWritingProgress(null, 30, '2026-11-21')).toEqual({
            dailyGoal: DEFAULT_DAILY_WRITING_GOAL,
            written: 30,
            date: '2026-11-21'
        })
    })

    it('storage 缺方法（结构不完整）时按不可用降级', () => {
        const partial = { getItem: () => null } as unknown as WritingGoalStorage
        expect(loadWritingGoal(partial, '2026-11-21').written).toBe(0)
        expect(saveWritingGoal(partial, { dailyGoal: 1000, written: 0, date: '2026-11-21' })).toBe(
            false
        )
    })
})

describe('保存前合法化', () => {
    it('目标越界钳制、已写负数归零、非法日期回落到本机今天', () => {
        const storage = new MemoryStorage()
        expect(
            saveWritingGoal(storage, {
                dailyGoal: 50,
                written: -3,
                date: 'bad-date'
            })
        ).toBe(true)
        expect(JSON.parse(storage.lastValue ?? '{}')).toEqual({
            dailyGoal: MIN_DAILY_WRITING_GOAL,
            written: 0,
            date: getLocalDateString()
        })
    })

    it('保存的上限值同样钳制', () => {
        const storage = new MemoryStorage()
        saveWritingGoal(storage, {
            dailyGoal: Number.MAX_SAFE_INTEGER,
            written: MAX_DAILY_WRITTEN + 1,
            date: '2026-11-21'
        })
        expect(JSON.parse(storage.lastValue ?? '{}')).toEqual({
            dailyGoal: MAX_DAILY_WRITING_GOAL,
            written: MAX_DAILY_WRITTEN,
            date: '2026-11-21'
        })
    })

    it('goal 为 null 时按默认值保存（不抛异常）', () => {
        const storage = new MemoryStorage()
        expect(saveWritingGoal(storage, null as unknown as WritingGoal)).toBe(true)
        expect(JSON.parse(storage.lastValue ?? '{}')).toEqual({
            dailyGoal: DEFAULT_DAILY_WRITING_GOAL,
            written: 0,
            date: getLocalDateString()
        })
    })
})
