/**
 * A3 文档历史存储纯函数单测（node 环境，localStorage 用内存替身）
 *
 * 覆盖：
 * - 路径 hash / key 生成（Windows 盘符大小写不敏感、跨分隔符稳定、不同路径不同 key）；
 * - UTF-8 字节估算；
 * - 追加快照（去重、单版本过大跳过、参数非法、存储不可用/写入失败降级）；
 * - 每文件 20 版上限淘汰最旧；
 * - 全局 ~2 MiB 配额跨文件淘汰最旧；
 * - 损坏 JSON 自愈、删除/清空/用量统计、版本列表倒序。
 */
import { describe, it, expect, vi } from 'vitest'
import {
    DOCUMENT_HISTORY_KEY_PREFIX,
    DOCUMENT_HISTORY_MAX_SNAPSHOT_BYTES,
    DOCUMENT_HISTORY_MAX_TOTAL_BYTES,
    DOCUMENT_HISTORY_MAX_VERSIONS_PER_FILE,
    appendDocumentHistoryVersion,
    buildHistoryStorageKey,
    calculateDocumentHistoryTotalBytes,
    clearAllDocumentHistory,
    clearDocumentHistoryForFile,
    deleteDocumentHistoryVersion,
    enforceDocumentHistoryQuota,
    estimateUtf8Bytes,
    getDocumentHistoryUsage,
    getDocumentHistoryVersion,
    hashHistoryFilePath,
    listDocumentHistoryStorageKeys,
    listDocumentHistoryVersions,
    normalizeHistoryPath,
    readAllDocumentHistoryRecords,
    readDocumentHistoryRecord,
    writeDocumentHistoryRecord,
    type HistoryStorageLike
} from '../../src/renderer/src/components/Markdown/history/history-storage'

/** 内存版 localStorage 替身（按 key 隔离，可注入写入失败） */
class FakeStorage implements HistoryStorageLike {
    private readonly store = new Map<string, string>()
    /** 为 true 时 setItem 抛错（模拟磁盘满/隐私模式） */
    failWrites = false
    /** 为 true 时 getItem/枚举抛错（模拟存储不可用） */
    failReads = false

    get length(): number {
        if (this.failReads) {
            throw new Error('storage unavailable')
        }
        return this.store.size
    }

    key(index: number): string | null {
        if (this.failReads) {
            throw new Error('storage unavailable')
        }
        return [...this.store.keys()][index] ?? null
    }

    getItem(key: string): string | null {
        if (this.failReads) {
            throw new Error('storage unavailable')
        }
        return this.store.get(key) ?? null
    }

    setItem(key: string, value: string): void {
        if (this.failWrites) {
            throw new Error('quota exceeded')
        }
        this.store.set(key, value)
    }

    removeItem(key: string): void {
        this.store.delete(key)
    }

    /** 测试辅助：直接写入原始字符串（构造损坏数据） */
    setRaw(key: string, value: string): void {
        this.store.set(key, value)
    }

    /** 测试辅助：当前 key 数量 */
    size(): number {
        return this.store.size
    }
}

const FILE_A = 'C:\\notes\\a.md'
const FILE_B = 'C:\\notes\\b.md'

describe('路径 hash 与 key 生成', () => {
    it('同一路径不同分隔符/盘符大小写生成同一个 key（Windows 大小写不敏感）', () => {
        const forward = buildHistoryStorageKey('C:/notes/a.md')
        const backward = buildHistoryStorageKey('c:\\notes\\A.md')
        const mixed = buildHistoryStorageKey('  C:\\notes//a.md  ')
        expect(forward).toBe(backward)
        expect(forward).toBe(mixed)
        expect(forward.startsWith(DOCUMENT_HISTORY_KEY_PREFIX)).toBe(true)
    })

    it('非 Windows 路径大小写敏感且不同路径 key 不同', () => {
        expect(buildHistoryStorageKey('/home/notes/a.md')).not.toBe(
            buildHistoryStorageKey('/home/notes/A.md')
        )
        expect(buildHistoryStorageKey(FILE_A)).not.toBe(buildHistoryStorageKey(FILE_B))
        expect(hashHistoryFilePath(FILE_A)).toHaveLength(16)
    })

    it('normalizeHistoryPath 折叠重复分隔符并去掉首尾空白', () => {
        expect(normalizeHistoryPath(' C:\\a\\\\b\\c.md ')).toBe('c:/a/b/c.md')
        expect(normalizeHistoryPath('/tmp//x.md')).toBe('/tmp/x.md')
    })
})

describe('字节估算', () => {
    it('按 UTF-8 计算（ASCII/中文/emoji）', () => {
        expect(estimateUtf8Bytes('abc')).toBe(3)
        expect(estimateUtf8Bytes('中文')).toBe(6)
        expect(estimateUtf8Bytes('😀')).toBe(4)
        expect(estimateUtf8Bytes('')).toBe(0)
    })

    it('无 TextEncoder 的极旧环境退化为按码点估算', () => {
        vi.stubGlobal('TextEncoder', undefined)
        try {
            expect(estimateUtf8Bytes('abc')).toBe(3)
            expect(estimateUtf8Bytes('中文')).toBe(6)
            expect(estimateUtf8Bytes('😀')).toBe(4)
        } finally {
            vi.unstubAllGlobals()
        }
    })
})

describe('追加快照 appendDocumentHistoryVersion', () => {
    it('首次追加写入记录：id/时间/大小正确，列表按最新在前返回', () => {
        const storage = new FakeStorage()
        const first = appendDocumentHistoryVersion(storage, FILE_A, '# 标题', {
            savedAt: 1000,
            versionId: 'v1'
        })
        expect(first.status).toBe('added')
        expect(first.record?.versions).toHaveLength(1)
        expect(first.record?.path).toBe(FILE_A)

        const second = appendDocumentHistoryVersion(storage, FILE_A, '# 标题\n\n正文', {
            savedAt: 2000,
            versionId: 'v2'
        })
        expect(second.status).toBe('added')
        const versions = listDocumentHistoryVersions(storage, FILE_A)
        expect(versions.map((version) => version.id)).toEqual(['v2', 'v1'])
        expect(versions[0].savedAt).toBe(2000)
        expect(versions[0].sizeBytes).toBe(estimateUtf8Bytes('# 标题\n\n正文'))
        expect(versions[0].content).toBe('# 标题\n\n正文')
        expect(getDocumentHistoryVersion(storage, FILE_A, 'v1')?.content).toBe('# 标题')
    })

    it('与最新版本内容相同视为重复（不写入重复快照）', () => {
        const storage = new FakeStorage()
        appendDocumentHistoryVersion(storage, FILE_A, 'same', { savedAt: 1, versionId: 'v1' })
        const duplicated = appendDocumentHistoryVersion(storage, FILE_A, 'same', {
            savedAt: 2,
            versionId: 'v2'
        })
        expect(duplicated.status).toBe('duplicate')
        expect(listDocumentHistoryVersions(storage, FILE_A)).toHaveLength(1)
    })

    it('内容与更早版本相同但仍与最新不同时允许追加（记录时间线）', () => {
        const storage = new FakeStorage()
        appendDocumentHistoryVersion(storage, FILE_A, 'a', { savedAt: 1, versionId: 'v1' })
        appendDocumentHistoryVersion(storage, FILE_A, 'b', { savedAt: 2, versionId: 'v2' })
        const revert = appendDocumentHistoryVersion(storage, FILE_A, 'a', {
            savedAt: 3,
            versionId: 'v3'
        })
        expect(revert.status).toBe('added')
        expect(listDocumentHistoryVersions(storage, FILE_A)).toHaveLength(3)
    })

    it('单版本超过上限时跳过，不写 storage', () => {
        const storage = new FakeStorage()
        const result = appendDocumentHistoryVersion(
            storage,
            FILE_A,
            'x'.repeat(DOCUMENT_HISTORY_MAX_SNAPSHOT_BYTES + 1)
        )
        expect(result.status).toBe('skipped-too-large')
        expect(storage.size()).toBe(0)
    })

    it('参数非法/存储不可用时返回降级状态且不抛错', () => {
        const storage = new FakeStorage()
        expect(appendDocumentHistoryVersion(storage, '', 'x').status).toBe('invalid-argument')
        expect(appendDocumentHistoryVersion(storage, '   ', 'x').status).toBe('invalid-argument')
        expect(appendDocumentHistoryVersion(storage, FILE_A, 123 as unknown as string).status).toBe(
            'invalid-argument'
        )
        expect(appendDocumentHistoryVersion(storage, FILE_A, 'x').status).toBe('added')
        expect(appendDocumentHistoryVersion(null, FILE_A, 'x').status).toBe('unavailable')
    })

    it('写入失败（localStorage 抛错）时静默降级返回 write-failed', () => {
        const storage = new FakeStorage()
        storage.failWrites = true
        const result = appendDocumentHistoryVersion(storage, FILE_A, 'x', { savedAt: 1 })
        expect(result.status).toBe('write-failed')
        expect(storage.size()).toBe(0)
    })

    it('每文件最多 20 版：超出淘汰最旧（savedAt 最早）', () => {
        const storage = new FakeStorage()
        for (let index = 0; index < DOCUMENT_HISTORY_MAX_VERSIONS_PER_FILE + 5; index++) {
            appendDocumentHistoryVersion(storage, FILE_A, `version-${index}`, {
                savedAt: 1000 + index,
                versionId: `v${index}`
            })
        }
        const versions = listDocumentHistoryVersions(storage, FILE_A)
        expect(versions).toHaveLength(DOCUMENT_HISTORY_MAX_VERSIONS_PER_FILE)
        // 最旧 5 个被淘汰，最新在前
        expect(versions[versions.length - 1].id).toBe('v5')
        expect(versions[0].id).toBe(`v${DOCUMENT_HISTORY_MAX_VERSIONS_PER_FILE + 4}`)
    })

    it('全局配额：超 2 MiB 跨文件淘汰最旧版本', () => {
        const storage = new FakeStorage()
        // 每个版本约 300 KiB，8 版合计约 2.4 MiB > 2 MiB 上限
        const chunk = 'x'.repeat(300 * 1024)
        for (let index = 0; index < 4; index++) {
            appendDocumentHistoryVersion(storage, FILE_A, `${chunk}${index}`, {
                savedAt: 100 + index,
                versionId: `a-${index}`
            })
            appendDocumentHistoryVersion(storage, FILE_B, `${chunk}b${index}`, {
                savedAt: 200 + index,
                versionId: `b-${index}`
            })
        }
        const total = calculateDocumentHistoryTotalBytes(storage)
        expect(total).toBeLessThanOrEqual(DOCUMENT_HISTORY_MAX_TOTAL_BYTES)
        const allRecords = readAllDocumentHistoryRecords(storage)
        const allVersions = allRecords.flatMap((entry) => entry.record.versions)
        expect(allVersions.length).toBeLessThan(8)
        // 最旧版本（savedAt=100 的 a-0）必被淘汰，最新版本保留
        expect(allVersions.some((version) => version.id === 'a-0')).toBe(false)
        expect(allVersions.some((version) => version.id === 'b-3')).toBe(true)
    })
})

describe('读取 / 损坏自愈', () => {
    it('无记录返回 null；JSON 损坏时清除该 key 并降级', () => {
        const storage = new FakeStorage()
        storage.setRaw(buildHistoryStorageKey(FILE_A), '{not-json')
        expect(readDocumentHistoryRecord(storage, FILE_A)).toBeNull()
        expect(storage.getItem(buildHistoryStorageKey(FILE_A))).toBeNull()
    })

    it('结构非法（缺 path / versions 非数组）按损坏处理', () => {
        const storage = new FakeStorage()
        const key = buildHistoryStorageKey(FILE_A)
        storage.setRaw(key, JSON.stringify({ path: '', versions: [] }))
        expect(readDocumentHistoryRecord(storage, FILE_A)).toBeNull()
        storage.setRaw(key, JSON.stringify({ path: FILE_A, versions: 'bad' }))
        expect(readDocumentHistoryRecord(storage, FILE_A)).toBeNull()
    })

    it('损坏记录不影响后续追加（自愈后重新记录）', () => {
        const storage = new FakeStorage()
        storage.setRaw(buildHistoryStorageKey(FILE_A), 'oops')
        const result = appendDocumentHistoryVersion(storage, FILE_A, 'new', {
            savedAt: 10,
            versionId: 'v1'
        })
        expect(result.status).toBe('added')
        expect(listDocumentHistoryVersions(storage, FILE_A)).toHaveLength(1)
    })

    it('存储枚举失败时返回空列表而不抛错', () => {
        const storage = new FakeStorage()
        storage.failReads = true
        expect(listDocumentHistoryStorageKeys(storage)).toEqual([])
        expect(readAllDocumentHistoryRecords(storage)).toEqual([])
        expect(calculateDocumentHistoryTotalBytes(storage)).toBe(0)
    })

    it('writeDocumentHistoryRecord：versions 为空时删除 key', () => {
        const storage = new FakeStorage()
        appendDocumentHistoryVersion(storage, FILE_A, 'x', { savedAt: 1, versionId: 'v1' })
        expect(
            writeDocumentHistoryRecord(storage, {
                formatVersion: 1,
                path: FILE_A,
                versions: []
            })
        ).toBe(true)
        expect(storage.size()).toBe(0)
    })

    it('结构非法的版本条目被过滤（保留合法条目）', () => {
        const storage = new FakeStorage()
        const key = buildHistoryStorageKey(FILE_A)
        storage.setRaw(
            key,
            JSON.stringify({
                path: FILE_A,
                versions: [null, 'bad', 42, { id: 'ok', savedAt: 1, sizeBytes: 1, content: 'x' }]
            })
        )
        const record = readDocumentHistoryRecord(storage, FILE_A)
        expect(record?.versions.map((version) => version.id)).toEqual(['ok'])
    })

    it('记录结构非法（path 非字符串 / versions 非数组）时按损坏清除', () => {
        const storage = new FakeStorage()
        const key = buildHistoryStorageKey(FILE_A)
        storage.setRaw(key, JSON.stringify({ path: 123, versions: [] }))
        expect(readDocumentHistoryRecord(storage, FILE_A)).toBeNull()
        storage.setRaw(key, JSON.stringify({ path: FILE_A, versions: 'bad' }))
        expect(readDocumentHistoryRecord(storage, FILE_A)).toBeNull()
        expect(storage.size()).toBe(0)
    })

    it('直接读取时 storage.getItem 抛错安全降级为 null', () => {
        const storage = new FakeStorage()
        storage.failReads = true
        expect(readDocumentHistoryRecord(storage, FILE_A)).toBeNull()
    })

    it('writeDocumentHistoryRecord：storage 为 null 返回 false', () => {
        expect(
            writeDocumentHistoryRecord(null, {
                formatVersion: 1,
                path: FILE_A,
                versions: []
            })
        ).toBe(false)
    })

    it('readAllDocumentHistoryRecords：key 存在但 getItem 返回 null 时跳过', () => {
        const storage = {
            length: 1,
            key: () => buildHistoryStorageKey(FILE_A),
            getItem: () => null,
            setItem: () => undefined,
            removeItem: () => undefined
        }
        expect(readAllDocumentHistoryRecords(storage)).toEqual([])
    })
})

describe('删除 / 清空 / 用量统计', () => {
    it('删除指定版本；删除不存在版本返回 false；删空后 key 移除', () => {
        const storage = new FakeStorage()
        appendDocumentHistoryVersion(storage, FILE_A, 'a', { savedAt: 1, versionId: 'v1' })
        appendDocumentHistoryVersion(storage, FILE_A, 'b', { savedAt: 2, versionId: 'v2' })
        expect(deleteDocumentHistoryVersion(storage, FILE_A, 'missing')).toBe(false)
        expect(deleteDocumentHistoryVersion(storage, FILE_A, 'v1')).toBe(true)
        expect(listDocumentHistoryVersions(storage, FILE_A).map((version) => version.id)).toEqual([
            'v2'
        ])
        expect(deleteDocumentHistoryVersion(storage, FILE_A, 'v2')).toBe(true)
        expect(storage.size()).toBe(0)
    })

    it('清空单文件 / 清空全部 / 用量统计', () => {
        const storage = new FakeStorage()
        appendDocumentHistoryVersion(storage, FILE_A, 'a', { savedAt: 1, versionId: 'a1' })
        appendDocumentHistoryVersion(storage, FILE_A, 'b', { savedAt: 2, versionId: 'a2' })
        appendDocumentHistoryVersion(storage, FILE_B, 'c', { savedAt: 3, versionId: 'b1' })
        const usage = getDocumentHistoryUsage(storage)
        expect(usage.fileCount).toBe(2)
        expect(usage.versionCount).toBe(3)
        expect(usage.totalBytes).toBeGreaterThan(0)

        expect(clearDocumentHistoryForFile(storage, FILE_A)).toBe(true)
        expect(clearDocumentHistoryForFile(storage, FILE_A)).toBe(true)
        expect(getDocumentHistoryUsage(storage)).toEqual({
            totalBytes: expect.any(Number),
            fileCount: 1,
            versionCount: 1
        })
        expect(clearAllDocumentHistory(storage)).toBe(1)
        expect(storage.size()).toBe(0)
    })

    it('存储为 null 时各操作安全降级', () => {
        expect(listDocumentHistoryVersions(null, FILE_A)).toEqual([])
        expect(getDocumentHistoryVersion(null, FILE_A, 'v1')).toBeNull()
        expect(deleteDocumentHistoryVersion(null, FILE_A, 'v1')).toBe(false)
        expect(clearDocumentHistoryForFile(null, FILE_A)).toBe(false)
        expect(clearAllDocumentHistory(null)).toBe(0)
        expect(getDocumentHistoryUsage(null)).toEqual({
            totalBytes: 0,
            fileCount: 0,
            versionCount: 0
        })
    })

    it('removeItem 抛错时清空操作返回 false（不抛出）', () => {
        const storage = new FakeStorage()
        appendDocumentHistoryVersion(storage, FILE_A, 'x', { savedAt: 1, versionId: 'v1' })
        vi.spyOn(storage, 'removeItem').mockImplementation(() => {
            throw new Error('remove failed')
        })
        expect(clearDocumentHistoryForFile(storage, FILE_A)).toBe(false)
    })
})

describe('全局配额淘汰的边界路径', () => {
    it('同 savedAt 时按版本 id 稳定淘汰最小 id（配额仍被压到上限内）', () => {
        const storage = new FakeStorage()
        const bigSize = 800 * 1024
        writeDocumentHistoryRecord(storage, {
            formatVersion: 1,
            path: FILE_A,
            versions: [{ id: 'z', savedAt: 1000, sizeBytes: bigSize, content: 'z' }]
        })
        writeDocumentHistoryRecord(storage, {
            formatVersion: 1,
            path: FILE_B,
            versions: [
                { id: 'a', savedAt: 1000, sizeBytes: bigSize, content: 'a' },
                { id: 'b', savedAt: 2000, sizeBytes: bigSize, content: 'b' }
            ]
        })
        const evicted = enforceDocumentHistoryQuota(storage)
        expect(evicted).toBeGreaterThan(0)
        expect(calculateDocumentHistoryTotalBytes(storage)).toBeLessThanOrEqual(
            DOCUMENT_HISTORY_MAX_TOTAL_BYTES
        )
        // 同 savedAt 的 z / a 中淘汰 id 更小的 a（稳定排序）
        const ids = readAllDocumentHistoryRecords(storage).flatMap((entry) =>
            entry.record.versions.map((version) => version.id)
        )
        expect(ids).not.toContain('a')
        expect(ids).toContain('z')
        expect(ids).toContain('b')
    })

    it('配额淘汰写入失败时停止（不无限循环）', () => {
        const storage = new FakeStorage()
        const bigSize = 800 * 1024
        writeDocumentHistoryRecord(storage, {
            formatVersion: 1,
            path: FILE_A,
            versions: [
                { id: 'a', savedAt: 1000, sizeBytes: bigSize, content: 'a' },
                { id: 'b', savedAt: 2000, sizeBytes: bigSize, content: 'b' },
                { id: 'c', savedAt: 3000, sizeBytes: bigSize, content: 'c' }
            ]
        })
        expect(calculateDocumentHistoryTotalBytes(storage)).toBeGreaterThan(
            DOCUMENT_HISTORY_MAX_TOTAL_BYTES
        )
        storage.failWrites = true
        expect(enforceDocumentHistoryQuota(storage)).toBeGreaterThanOrEqual(0)
    })
})
