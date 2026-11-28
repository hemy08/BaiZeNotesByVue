// @vitest-environment node
/**
 * A9 命令面板本机持久化纯逻辑单测（1.5.6 P2 批次 C / REQ-10 + REQ-11）
 *
 * 覆盖：
 * 1. 存储契约：localStorage 键名 / 容量上限 / 最近使用条数上限；
 * 2. 使用历史读取容错：存储缺失、JSON 损坏、顶层类型非法、条目字段非法；
 * 3. 使用历史写入/记录：count 累加、lastUsed 刷新、100 条裁剪（淘汰最旧）、不修改入参；
 * 4. 「最近使用」id 顺序（lastUsed 倒序 → count 倒序 → id 字典序）；
 * 5. 排序比较器 `compareCommandUsage`（有记录优先 / 时间新优先 / 次数大优先）；
 * 6. 分组折叠状态：读取容错、排序写入、切换纯函数。
 *
 * 本文件不依赖 jsdom：存储通过内存替身注入，纯逻辑可在 node 环境稳定复跑。
 */
import { describe, it, expect, vi } from 'vitest'

import {
    applyCommandUsage,
    COMMAND_COLLAPSED_GROUPS_STORAGE_KEY,
    COMMAND_USAGE_LIMIT,
    COMMAND_USAGE_STORAGE_KEY,
    compareCommandUsage,
    getRecentCommandIds,
    normalizeCommandUsage,
    pruneCommandUsage,
    readCollapsedGroupKeys,
    readCommandUsage,
    RECENT_COMMANDS_LIMIT,
    recordCommandUsage,
    toggleCollapsedGroupKey,
    writeCollapsedGroupKeys,
    writeCommandUsage,
    type CommandPaletteStorageLike,
    type CommandUsageMap
} from '../../../src/renderer/src/components/search/command-palette-storage'

/** 内存存储替身（与 window.localStorage 结构兼容；可模拟写入失败） */
function createMemoryStorage(options: { failWrites?: boolean } = {}): CommandPaletteStorageLike & {
    data: Map<string, string>
} {
    const data = new Map<string, string>()
    return {
        data,
        getItem: (key: string) => data.get(key) ?? null,
        setItem: (key: string, value: string) => {
            if (options.failWrites) {
                throw new Error('QuotaExceededError')
            }
            data.set(key, value)
        }
    }
}

/** 构造一条使用记录 */
function entry(lastUsed: number, count: number): { lastUsed: number; count: number } {
    return { lastUsed, count }
}

describe('REQ-10 存储契约', () => {
    it('键名与容量上限符合需求约定', () => {
        expect(COMMAND_USAGE_STORAGE_KEY).toBe('baize:command-palette:usage')
        expect(COMMAND_COLLAPSED_GROUPS_STORAGE_KEY).toBe('baize:command-palette:collapsed-groups')
        expect(COMMAND_USAGE_LIMIT).toBe(100)
        expect(RECENT_COMMANDS_LIMIT).toBe(5)
    })
})

describe('readCommandUsage：读取容错', () => {
    it('存储不可用 / 无记录时返回空对象', () => {
        expect(readCommandUsage(null)).toEqual({})
        expect(readCommandUsage(createMemoryStorage())).toEqual({})
    })

    it('JSON 损坏 / 顶层非对象时回退空对象，不抛错', () => {
        const broken = createMemoryStorage()
        broken.data.set(COMMAND_USAGE_STORAGE_KEY, '{not-json')
        expect(readCommandUsage(broken)).toEqual({})

        const arrayTop = createMemoryStorage()
        arrayTop.data.set(COMMAND_USAGE_STORAGE_KEY, '[1,2,3]')
        expect(readCommandUsage(arrayTop)).toEqual({})

        const stringTop = createMemoryStorage()
        stringTop.data.set(COMMAND_USAGE_STORAGE_KEY, '"save"')
        expect(readCommandUsage(stringTop)).toEqual({})
    })

    it('丢弃非法条目，保留合法记录', () => {
        const storage = createMemoryStorage()
        storage.data.set(
            COMMAND_USAGE_STORAGE_KEY,
            JSON.stringify({
                save: entry(100, 3),
                'open-file': { lastUsed: 'yesterday', count: 1 },
                'open-folder': { lastUsed: 200, count: 0 },
                broken: null,
                '': entry(300, 1)
            })
        )
        expect(readCommandUsage(storage)).toEqual({ save: entry(100, 3) })
    })

    it('读取侧同样按 100 条上限裁剪（防止手改 localStorage 后膨胀）', () => {
        const raw: Record<string, { lastUsed: number; count: number }> = {}
        for (let index = 0; index < 120; index += 1) {
            raw[`cmd-${index}`] = entry(index + 1, 1)
        }
        const storage = createMemoryStorage()
        storage.data.set(COMMAND_USAGE_STORAGE_KEY, JSON.stringify(raw))
        const usage = readCommandUsage(storage)
        expect(Object.keys(usage)).toHaveLength(COMMAND_USAGE_LIMIT)
        // 淘汰最旧（lastUsed 最小）的 20 条
        expect(usage['cmd-0']).toBeUndefined()
        expect(usage['cmd-19']).toBeUndefined()
        expect(usage['cmd-20']).toBeDefined()
        expect(usage['cmd-119']).toBeDefined()
    })
})

describe('写回 / 记录命令执行', () => {
    it('writeCommandUsage 按上限裁剪后写回；存储不可用/写入失败返回 false', () => {
        const storage = createMemoryStorage()
        const usage: Record<string, { lastUsed: number; count: number }> = {}
        for (let index = 0; index < 110; index += 1) {
            usage[`cmd-${index}`] = entry(index + 1, 1)
        }
        expect(writeCommandUsage(storage, usage)).toBe(true)
        const persisted = JSON.parse(storage.data.get(COMMAND_USAGE_STORAGE_KEY) ?? '{}')
        expect(Object.keys(persisted)).toHaveLength(COMMAND_USAGE_LIMIT)
        expect(writeCommandUsage(null, usage)).toBe(false)
        expect(writeCommandUsage(createMemoryStorage({ failWrites: true }), usage)).toBe(false)
    })

    it('applyCommandUsage：count 累加、lastUsed 刷新，不修改入参', () => {
        const current: CommandUsageMap = { save: entry(100, 2) }
        const next = applyCommandUsage(current, 'save', 500)
        expect(next.save).toEqual({ lastUsed: 500, count: 3 })
        // 纯函数：入参保持不变
        expect(current.save).toEqual({ lastUsed: 100, count: 2 })
    })

    it('applyCommandUsage：新命令首次记录 count=1', () => {
        expect(applyCommandUsage({}, 'open-file', 42)['open-file']).toEqual({
            lastUsed: 42,
            count: 1
        })
    })

    it('applyCommandUsage：非法时间戳回退真实时钟（仍为正数）', () => {
        const usage = applyCommandUsage({}, 'save', Number.NaN)
        expect(usage.save?.lastUsed).toBeGreaterThan(0)
        expect(usage.save?.count).toBe(1)
    })

    it('recordCommandUsage：读取→记录→写回，并在内存返回最新 map', () => {
        const storage = createMemoryStorage()
        storage.data.set(COMMAND_USAGE_STORAGE_KEY, JSON.stringify({ save: entry(100, 1) }))
        const next = recordCommandUsage(storage, 'save', 900)
        expect(next.save).toEqual({ lastUsed: 900, count: 2 })
        expect(JSON.parse(storage.data.get(COMMAND_USAGE_STORAGE_KEY) ?? '{}').save).toEqual({
            lastUsed: 900,
            count: 2
        })
    })

    it('recordCommandUsage：写入失败时仍返回内存结果（本会话排序不受影响）', () => {
        const failed = createMemoryStorage({ failWrites: true })
        const next = recordCommandUsage(failed, 'save', 777)
        expect(next.save).toEqual({ lastUsed: 777, count: 1 })
    })

    it('超过 100 条时淘汰 lastUsed 最旧的记录', () => {
        const usage: Record<string, { lastUsed: number; count: number }> = {}
        for (let index = 0; index < COMMAND_USAGE_LIMIT; index += 1) {
            usage[`cmd-${index}`] = entry(index + 1, 1)
        }
        const next = applyCommandUsage(usage, 'new-command', 10_000)
        expect(Object.keys(next)).toHaveLength(COMMAND_USAGE_LIMIT)
        expect(next['new-command']).toBeDefined()
        // 最旧的 cmd-0（lastUsed=1）被淘汰
        expect(next['cmd-0']).toBeUndefined()
        expect(next['cmd-1']).toBeDefined()
    })
})

describe('最近使用顺序与排序比较器', () => {
    it('getRecentCommandIds：lastUsed 倒序 → count 倒序 → id 字典序，默认最多 5 条', () => {
        const usage: CommandUsageMap = {
            alpha: entry(100, 1),
            beta: entry(300, 1),
            gamma: entry(200, 5),
            delta: entry(200, 9),
            epsilon: entry(50, 1),
            zeta: entry(50, 2)
        }
        expect(getRecentCommandIds(usage)).toEqual(['beta', 'delta', 'gamma', 'alpha', 'zeta'])
        expect(getRecentCommandIds(usage, 2)).toEqual(['beta', 'delta'])
        expect(getRecentCommandIds(usage, 0)).toEqual([])
        expect(getRecentCommandIds({})).toEqual([])
    })

    it('compareCommandUsage：有记录优先于无记录', () => {
        const usage = { save: entry(10, 1) }
        expect(compareCommandUsage('save', 'open-file', usage)).toBeLessThan(0)
        expect(compareCommandUsage('open-file', 'save', usage)).toBeGreaterThan(0)
        expect(compareCommandUsage('open-file', 'open-folder', usage)).toBe(0)
    })

    it('compareCommandUsage：lastUsed 新者优先，次数大者优先', () => {
        const usage = {
            newer: entry(200, 1),
            older: entry(100, 99),
            frequent: entry(200, 8)
        }
        expect(compareCommandUsage('newer', 'older', usage)).toBeLessThan(0)
        expect(compareCommandUsage('frequent', 'newer', usage)).toBeLessThan(0)
    })

    it('normalize/prune 对同时间记录按 count 与 id 稳定排序', () => {
        const normalized = normalizeCommandUsage({
            b: entry(100, 1),
            a: entry(100, 5),
            c: entry(100, 5)
        })
        const pruned = pruneCommandUsage(normalized, 2)
        expect(Object.keys(pruned)).toEqual(['a', 'c'])
    })
})

describe('REQ-11 分组折叠持久化', () => {
    it('读取容错：存储不可用 / JSON 损坏 / 非数组 / 非字符串项 → 空集合或过滤后集合', () => {
        expect(readCollapsedGroupKeys(null)).toEqual(new Set())
        expect(readCollapsedGroupKeys(createMemoryStorage())).toEqual(new Set())

        const broken = createMemoryStorage()
        broken.data.set(COMMAND_COLLAPSED_GROUPS_STORAGE_KEY, 'not-json')
        expect(readCollapsedGroupKeys(broken)).toEqual(new Set())

        const notArray = createMemoryStorage()
        notArray.data.set(COMMAND_COLLAPSED_GROUPS_STORAGE_KEY, JSON.stringify({ a: 1 }))
        expect(readCollapsedGroupKeys(notArray)).toEqual(new Set())

        const mixed = createMemoryStorage()
        mixed.data.set(
            COMMAND_COLLAPSED_GROUPS_STORAGE_KEY,
            JSON.stringify(['category.file', 42, '', 'category.edit'])
        )
        expect(readCollapsedGroupKeys(mixed)).toEqual(new Set(['category.file', 'category.edit']))
    })

    it('写入去重排序；存储不可用/写入失败返回 false', () => {
        const storage = createMemoryStorage()
        expect(writeCollapsedGroupKeys(storage, new Set(['category.view', 'category.file']))).toBe(
            true
        )
        expect(storage.data.get(COMMAND_COLLAPSED_GROUPS_STORAGE_KEY)).toBe(
            JSON.stringify(['category.file', 'category.view'])
        )
        expect(writeCollapsedGroupKeys(null, new Set())).toBe(false)
        expect(writeCollapsedGroupKeys(createMemoryStorage({ failWrites: true }), new Set())).toBe(
            false
        )
    })

    it('toggleCollapsedGroupKey：纯函数切换，不修改入参', () => {
        const current = new Set(['category.file'])
        const collapsed = toggleCollapsedGroupKey(current, 'category.file')
        expect(collapsed).toEqual(new Set())
        expect(current).toEqual(new Set(['category.file']))

        const expanded = toggleCollapsedGroupKey(collapsed, 'category.edit')
        expect(expanded).toEqual(new Set(['category.edit']))
        // 空 key 不写入
        expect(toggleCollapsedGroupKey(expanded, '')).toEqual(expanded)
    })

    it('读写往返一致', () => {
        const storage = createMemoryStorage()
        writeCollapsedGroupKeys(storage, new Set(['recent', 'category.file']))
        expect(readCollapsedGroupKeys(storage)).toEqual(new Set(['recent', 'category.file']))
    })
})

describe('存储异常不影响主链路', () => {
    it('getItem 抛错时读取降级为空数据（不抛异常）', () => {
        const throwing: CommandPaletteStorageLike = {
            getItem: () => {
                throw new Error('SecurityError')
            },
            setItem: vi.fn()
        }
        expect(readCommandUsage(throwing)).toEqual({})
        expect(readCollapsedGroupKeys(throwing)).toEqual(new Set())
    })
})
