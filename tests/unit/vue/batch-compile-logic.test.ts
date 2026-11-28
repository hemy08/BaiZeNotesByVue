/**
 * 1.5.7 LLM Wiki 迁移批次 M2：批量编译纯逻辑单测（`src/renderer/src/common/batch-compile.ts`）
 *
 * 覆盖：
 * 1. EventBus 编译请求载荷归一化（非法范围/目录/批次数的宽容降级）；
 * 2. 工作区目录树解析（raw/ 可编译文件 + wiki/ 页面、扩展名过滤、目录缺失、非法载荷）；
 * 3. 编译范围过滤（全量/指定目录大小写不敏感）与分批切分；
 * 4. wiki 页面索引（front matter source、内容哈希、读取失败）与冲突/增量判定；
 * 5. 编译记录 localStorage 存储（归一化、工作区/页面数量上限、配额失败降级内存、
 *    隐私模式无 window 兜底）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    BATCH_COMPILE_RECORD_MAX_PAGES,
    BATCH_COMPILE_RECORD_MAX_WORKSPACES,
    BATCH_COMPILE_RECORD_STORAGE_KEY,
    buildBatchCompileWikiPageIndex,
    chunkBatchCompileTargets,
    classifyBatchCompilePageState,
    createBatchCompileRecordStore,
    createDefaultBatchCompileRequest,
    findBatchCompileWikiPageByPath,
    findBatchCompileWikiPageBySource,
    hashBatchCompileContent,
    normalizeBatchCompileRecordSnapshot,
    normalizeBatchCompileRequest,
    normalizeBatchCompileSourcePath,
    parseBatchCompileWorkspaceTree,
    readBatchCompilePageSource,
    resolveBatchCompileLocalStorage,
    resolveBatchCompileTargets,
    resolveBatchCompileWorkspaceKey,
    shouldSkipBatchCompileTarget,
    toBatchCompileConflictReason,
    toLlmWikiCompileRequest,
    toWorkspaceRelativePath,
    type BatchCompileRawFile,
    type BatchCompileRecordStorage,
    type BatchCompileWikiPage
} from '../../../src/renderer/src/common/batch-compile'

/* ============================================================================
 * 测试工具
 * ========================================================================== */

/** 构造目录树节点（FileItem 最小形状） */
function node(
    name: string,
    path: string,
    options: {
        isDirectory?: boolean
        children?: ReadonlyArray<Record<string, unknown>>
        extension?: string
    } = {}
): Record<string, unknown> {
    const isDirectory = options.isDirectory === true
    return {
        id: `id-${path}`,
        name,
        path,
        type: isDirectory ? 'folder' : 'file',
        isDirectory,
        fileExtension: options.extension ?? (isDirectory ? '' : name.slice(name.lastIndexOf('.'))),
        children: options.children ?? []
    }
}

/** 构造工作区目录树 JSON 载荷（根节点 + raw/ + wiki/） */
function makeTreePayload(
    rootPath = 'E:/ws',
    rawChildren: ReadonlyArray<Record<string, unknown>> = [],
    wikiChildren: ReadonlyArray<Record<string, unknown>> = []
): string {
    return JSON.stringify([
        node('ws', rootPath, {
            isDirectory: true,
            children: [
                node('raw', `${rootPath}/raw`, { isDirectory: true, children: rawChildren }),
                node('wiki', `${rootPath}/wiki`, { isDirectory: true, children: wikiChildren })
            ]
        })
    ])
}

/** 构造 raw 文件条目 */
function rawFile(relativePath: string): BatchCompileRawFile {
    return {
        relativePath,
        absolutePath: `E:/ws/${relativePath}`,
        name: relativePath.split('/').pop() ?? relativePath
    }
}

/** 构造 wiki 页面条目 */
function wikiPage(relativePath: string): BatchCompileWikiPage {
    return {
        relativePath,
        absolutePath: `E:/ws/${relativePath}`,
        name: relativePath.split('/').pop() ?? relativePath
    }
}

/** 内存 storage 替身 */
function createMemoryStorage(initial: Record<string, string> = {}): BatchCompileRecordStorage {
    const map = new Map(Object.entries(initial))
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => {
            map.set(key, value)
        }
    }
}

/* ============================================================================
 * 一、请求归一化
 * ========================================================================== */

describe('normalizeBatchCompileRequest：编译请求宽容归一化', () => {
    it('缺省/空载荷 → 全量编译（不标记降级）', () => {
        expect(normalizeBatchCompileRequest(undefined)).toEqual(createDefaultBatchCompileRequest())
        expect(normalizeBatchCompileRequest(null)).toEqual(createDefaultBatchCompileRequest())
        expect(normalizeBatchCompileRequest({})).toEqual({
            scope: 'all',
            directory: null,
            batchSize: 10,
            degraded: false
        })
    })

    it('非对象载荷 → 回退全量并标记降级', () => {
        expect(normalizeBatchCompileRequest(42)).toEqual({
            scope: 'all',
            directory: null,
            batchSize: 10,
            degraded: true
        })
        expect(normalizeBatchCompileRequest('bad')).toEqual({
            scope: 'all',
            directory: null,
            batchSize: 10,
            degraded: true
        })
    })

    it('非法 scope → 全量 + 降级；合法 scope 原样保留', () => {
        expect(normalizeBatchCompileRequest({ scope: 'nope' })).toMatchObject({
            scope: 'all',
            degraded: true
        })
        expect(normalizeBatchCompileRequest({ scope: 'all' })).toMatchObject({
            scope: 'all',
            degraded: false
        })
    })

    it('指定目录：合法值统一分隔符/去首尾斜杠；非法目录 → 回退全量 + 降级', () => {
        expect(
            normalizeBatchCompileRequest({ scope: 'directory', directory: 'notes/子目录' })
        ).toEqual({
            scope: 'directory',
            directory: 'notes/子目录',
            batchSize: 10,
            degraded: false
        })
        expect(
            normalizeBatchCompileRequest({ scope: 'directory', directory: 'a\\b/' })
        ).toMatchObject({
            scope: 'directory',
            directory: 'a/b'
        })
        expect(normalizeBatchCompileRequest({ scope: 'directory', directory: '../etc' })).toEqual({
            scope: 'all',
            directory: null,
            batchSize: 10,
            degraded: true
        })
    })

    it('分批：合法批次数量保留；非法数量 → 默认 10 + 降级', () => {
        expect(normalizeBatchCompileRequest({ scope: 'batch', batchSize: 3 })).toEqual({
            scope: 'batch',
            directory: null,
            batchSize: 3,
            degraded: false
        })
        expect(normalizeBatchCompileRequest({ scope: 'batch', batchSize: '5' })).toMatchObject({
            scope: 'batch',
            batchSize: 5,
            degraded: false
        })
        expect(normalizeBatchCompileRequest({ scope: 'batch', batchSize: 0 })).toMatchObject({
            scope: 'batch',
            batchSize: 10,
            degraded: true
        })
        expect(normalizeBatchCompileRequest({ scope: 'batch', batchSize: 9999 })).toMatchObject({
            scope: 'batch',
            batchSize: 10,
            degraded: true
        })
    })

    it('归一化结果可还原为 LlmWikiCompileRequest（EventBus 交接载荷）', () => {
        expect(toLlmWikiCompileRequest(normalizeBatchCompileRequest({ scope: 'all' }))).toEqual({
            scope: 'all'
        })
        expect(
            toLlmWikiCompileRequest(
                normalizeBatchCompileRequest({ scope: 'directory', directory: 'notes' })
            )
        ).toEqual({ scope: 'directory', directory: 'notes' })
        expect(
            toLlmWikiCompileRequest(normalizeBatchCompileRequest({ scope: 'batch', batchSize: 2 }))
        ).toEqual({ scope: 'batch', batchSize: 2 })
    })
})

/* ============================================================================
 * 二、目录树解析
 * ========================================================================== */

describe('parseBatchCompileWorkspaceTree：工作区目录树解析', () => {
    it('解析 raw/ 可编译文件与 wiki/ 页面（扩展名过滤、嵌套目录、排序）', () => {
        const payload = makeTreePayload(
            'E:/ws',
            [
                node('draft.md', 'E:/ws/raw/draft.md'),
                node('notes', 'E:/ws/raw/notes', {
                    isDirectory: true,
                    children: [
                        node('b.markdown', 'E:/ws/raw/notes/b.markdown'),
                        node('c.txt', 'E:/ws/raw/notes/c.txt'),
                        node('pic.png', 'E:/ws/raw/notes/pic.png'),
                        node('sub', 'E:/ws/raw/notes/sub', {
                            isDirectory: true,
                            children: [node('d.md', 'E:/ws/raw/notes/sub/d.md')]
                        })
                    ]
                })
            ],
            [
                node('a.md', 'E:/ws/wiki/a.md'),
                node('x.txt', 'E:/ws/wiki/x.txt'),
                node('y.markdown', 'E:/ws/wiki/y.markdown')
            ]
        )
        const result = parseBatchCompileWorkspaceTree(payload)
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.tree.rootPath).toBe('E:/ws')
        expect(result.tree.rawRootPath).toBe('E:/ws/raw')
        expect(result.tree.wikiRootPath).toBe('E:/ws/wiki')
        expect(result.tree.rawFiles.map((file) => file.relativePath)).toEqual([
            'raw/draft.md',
            'raw/notes/b.markdown',
            'raw/notes/c.txt',
            'raw/notes/sub/d.md'
        ])
        expect(result.tree.rawFiles[0].name).toBe('draft.md')
        expect(result.tree.wikiPages.map((page) => page.relativePath)).toEqual([
            'wiki/a.md',
            'wiki/y.markdown'
        ])
    })

    it('同时接受 JSON 字符串与已解析数组；wiki/ 缺失时页面为空', () => {
        const rootOnly = JSON.stringify([
            node('ws', 'E:/ws', {
                isDirectory: true,
                children: [
                    node('raw', 'E:/ws/raw', {
                        isDirectory: true,
                        children: [node('a.md', 'E:/ws/raw/a.md')]
                    })
                ]
            })
        ])
        const fromString = parseBatchCompileWorkspaceTree(rootOnly)
        expect(fromString.ok).toBe(true)
        if (fromString.ok) {
            expect(fromString.tree.wikiRootPath).toBeNull()
            expect(fromString.tree.wikiPages).toEqual([])
            expect(fromString.tree.rawFiles).toHaveLength(1)
        }
        const fromArray = parseBatchCompileWorkspaceTree(JSON.parse(rootOnly))
        expect(fromArray.ok).toBe(true)
    })

    it('raw/ 缺失时 rawRootPath=null、rawFiles 为空（工作区未初始化）', () => {
        const payload = JSON.stringify([
            node('ws', 'E:/ws', {
                isDirectory: true,
                children: [node('notes', 'E:/ws/notes', { isDirectory: true })]
            })
        ])
        const result = parseBatchCompileWorkspaceTree(payload)
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.tree.rawRootPath).toBeNull()
            expect(result.tree.rawFiles).toEqual([])
        }
    })

    it('空/非法 JSON → INVALID_TREE；空数组 → NO_WORKSPACE；根节点非法 → INVALID_TREE', () => {
        expect(parseBatchCompileWorkspaceTree('')).toEqual({ ok: false, code: 'INVALID_TREE' })
        expect(parseBatchCompileWorkspaceTree('   ')).toEqual({ ok: false, code: 'INVALID_TREE' })
        expect(parseBatchCompileWorkspaceTree('{bad json')).toEqual({
            ok: false,
            code: 'INVALID_TREE'
        })
        expect(parseBatchCompileWorkspaceTree([])).toEqual({ ok: false, code: 'NO_WORKSPACE' })
        expect(parseBatchCompileWorkspaceTree([{ name: 'ws' }])).toEqual({
            ok: false,
            code: 'INVALID_TREE'
        })
        expect(parseBatchCompileWorkspaceTree(undefined)).toEqual({
            ok: false,
            code: 'NO_WORKSPACE'
        })
    })

    it('目录树含非法子节点/非法目录项时忽略，不影响整体解析', () => {
        const payload = JSON.stringify([
            node('ws', 'E:/ws', {
                isDirectory: true,
                children: [
                    null,
                    'bad',
                    node('raw', 'E:/ws/raw', {
                        isDirectory: true,
                        children: [
                            null,
                            node('a.md', 'E:/ws/raw/a.md')
                        ] as unknown as ReadonlyArray<Record<string, unknown>>
                    })
                ] as unknown as ReadonlyArray<Record<string, unknown>>
            })
        ])
        const result = parseBatchCompileWorkspaceTree(payload)
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.tree.rawFiles).toHaveLength(1)
        }
    })
})

describe('toWorkspaceRelativePath：工作区相对路径计算', () => {
    it('根内路径去根前缀；根外路径回退去首斜杠；空根回退', () => {
        expect(toWorkspaceRelativePath('E:/ws', 'E:/ws/raw/a.md')).toBe('raw/a.md')
        expect(toWorkspaceRelativePath('E:\\ws\\', 'E:\\ws\\raw\\a.md')).toBe('raw/a.md')
        expect(toWorkspaceRelativePath('E:/ws', 'D:/other/a.md')).toBe('D:/other/a.md')
        expect(toWorkspaceRelativePath('', '/abs/a.md')).toBe('abs/a.md')
    })
})

/* ============================================================================
 * 三、范围过滤与分批
 * ========================================================================== */

describe('resolveBatchCompileTargets：编译范围过滤', () => {
    const files = [rawFile('raw/a.md'), rawFile('raw/notes/b.md'), rawFile('raw/notes/sub/c.md')]

    it('全量/分批范围返回全部目标', () => {
        expect(
            resolveBatchCompileTargets(files, normalizeBatchCompileRequest({ scope: 'all' }))
        ).toHaveLength(3)
        expect(
            resolveBatchCompileTargets(files, normalizeBatchCompileRequest({ scope: 'batch' }))
        ).toHaveLength(3)
    })

    it('指定目录按前缀过滤（大小写不敏感）且不修改原数组', () => {
        const request = normalizeBatchCompileRequest({
            scope: 'directory',
            directory: 'Notes'
        })
        const targets = resolveBatchCompileTargets(files, request)
        expect(targets.map((file) => file.relativePath)).toEqual([
            'raw/notes/b.md',
            'raw/notes/sub/c.md'
        ])
        expect(files).toHaveLength(3)
    })

    it('指定目录无匹配 → 空数组；directory 为 null 时返回全部', () => {
        expect(
            resolveBatchCompileTargets(
                files,
                normalizeBatchCompileRequest({ scope: 'directory', directory: 'nope' })
            )
        ).toEqual([])
        expect(
            resolveBatchCompileTargets(files, {
                ...normalizeBatchCompileRequest({ scope: 'directory', directory: 'notes' }),
                directory: null
            })
        ).toHaveLength(3)
    })
})

describe('chunkBatchCompileTargets：分批切分', () => {
    const files = [rawFile('raw/a.md'), rawFile('raw/b.md'), rawFile('raw/c.md')]

    it('按 batchSize 切分（含不足一批的尾批）', () => {
        expect(chunkBatchCompileTargets(files, 2).map((chunk) => chunk.length)).toEqual([2, 1])
        expect(chunkBatchCompileTargets(files, 10).map((chunk) => chunk.length)).toEqual([3])
        expect(chunkBatchCompileTargets(files, 1)).toHaveLength(3)
        expect(chunkBatchCompileTargets([], 2)).toEqual([])
    })

    it('非法 batchSize 按 1 兜底', () => {
        expect(chunkBatchCompileTargets(files, 0)).toHaveLength(3)
        expect(chunkBatchCompileTargets(files, Number.NaN)).toHaveLength(3)
    })
})

/* ============================================================================
 * 四、wiki 页面索引与状态判定
 * ========================================================================== */

/** 构造页面内容（含 front matter source） */
function pageContent(source: string | string[] | null, title = '页面'): string {
    const sourceLine = Array.isArray(source)
        ? `source: [${source.join(', ')}]\n`
        : source === null
          ? ''
          : `source: ${source}\n`
    return `---\ntitle: ${title}\n${sourceLine}---\n\n# ${title}\n`
}

describe('normalizeBatchCompileSourcePath / readBatchCompilePageSource：来源路径归一化', () => {
    it('归一化反斜杠、去掉 ./ 与前导斜杠；空/含 .. 返回 null', () => {
        expect(normalizeBatchCompileSourcePath('raw\\a.md')).toBe('raw/a.md')
        expect(normalizeBatchCompileSourcePath('./raw/a.md')).toBe('raw/a.md')
        expect(normalizeBatchCompileSourcePath('/raw/a.md')).toBe('raw/a.md')
        expect(normalizeBatchCompileSourcePath('  ')).toBeNull()
        expect(normalizeBatchCompileSourcePath('../raw/a.md')).toBeNull()
        expect(normalizeBatchCompileSourcePath(42)).toBeNull()
    })

    it('读取 front matter source：标量 / 数组 / 缺失 / 无 front matter / 非法值', () => {
        expect(readBatchCompilePageSource(pageContent('raw/a.md'))).toBe('raw/a.md')
        expect(readBatchCompilePageSource(pageContent(['raw/b.md', 'raw/c.md']))).toBe('raw/b.md')
        expect(readBatchCompilePageSource(pageContent(null))).toBeNull()
        expect(readBatchCompilePageSource('# 无 front matter')).toBeNull()
        expect(readBatchCompilePageSource(pageContent('../escape.md'))).toBeNull()
    })
})

describe('buildBatchCompileWikiPageIndex / find*：页面索引', () => {
    const pages = [wikiPage('wiki/a.md'), wikiPage('wiki/b.md'), wikiPage('wiki/c.md')]

    it('构建索引：内容读取成功 → source + 哈希；读取失败 → unreadable', () => {
        const index = buildBatchCompileWikiPageIndex([
            { page: pages[0], content: pageContent('raw/a.md') },
            { page: pages[1], content: null },
            { page: pages[2], content: pageContent(['raw/x.md', 'raw/c.md']) }
        ])
        expect(index).toHaveLength(3)
        expect(index[0]).toMatchObject({ relativePath: 'wiki/a.md', source: 'raw/a.md' })
        expect(index[0].contentHash).toBe(hashBatchCompileContent(pageContent('raw/a.md')))
        expect(index[1]).toMatchObject({ source: null, contentHash: null, unreadable: true })
        expect(index[2].source).toBe('raw/x.md')
    })

    it('按路径/来源查找（大小写不敏感）；非法路径返回 null', () => {
        const index = buildBatchCompileWikiPageIndex([
            { page: pages[0], content: pageContent('raw/a.md') }
        ])
        expect(findBatchCompileWikiPageByPath(index, 'WIKI/A.MD')?.relativePath).toBe('wiki/a.md')
        expect(findBatchCompileWikiPageByPath(index, 'wiki/none.md')).toBeNull()
        expect(findBatchCompileWikiPageByPath(index, '../wiki/a.md')).toBeNull()
        expect(findBatchCompileWikiPageBySource(index, 'RAW/A.MD')?.relativePath).toBe('wiki/a.md')
        expect(findBatchCompileWikiPageBySource(index, 'raw/none.md')).toBeNull()
        expect(findBatchCompileWikiPageBySource(index, 1 as unknown as string)).toBeNull()
    })
})

describe('classifyBatchCompilePageState：人工修改保护判定', () => {
    const pageContentText = pageContent('raw/a.md')
    const page = buildBatchCompileWikiPageIndex([
        { page: wikiPage('wiki/a.md'), content: pageContentText }
    ])[0]
    const record = {
        targetPath: 'wiki/a.md',
        sourcePath: 'raw/a.md',
        contentHash: hashBatchCompileContent(pageContentText),
        updatedAt: 1
    }

    it('missing / unverified / manual-create / manual-edit / source-mismatch / verified', () => {
        expect(
            classifyBatchCompilePageState({ page: null, record: null, sourcePath: 'raw/a.md' })
        ).toBe('missing')
        expect(
            classifyBatchCompilePageState({
                page: { ...page, unreadable: true, contentHash: null },
                record,
                sourcePath: 'raw/a.md'
            })
        ).toBe('unverified')
        expect(classifyBatchCompilePageState({ page, record: null, sourcePath: 'raw/a.md' })).toBe(
            'manual-create'
        )
        expect(
            classifyBatchCompilePageState({
                page,
                record: { ...record, contentHash: 'stale-hash' },
                sourcePath: 'raw/a.md'
            })
        ).toBe('manual-edit')
        expect(
            classifyBatchCompilePageState({
                page,
                record: { ...record, sourcePath: 'raw/other.md' },
                sourcePath: 'raw/a.md'
            })
        ).toBe('source-mismatch')
        expect(
            classifyBatchCompilePageState({
                page,
                record: { ...record, sourcePath: 'raw\\a.md' },
                sourcePath: 'raw/a.md'
            })
        ).toBe('verified')
    })

    it('冲突原因映射与增量跳过判定', () => {
        expect(toBatchCompileConflictReason('verified')).toBeNull()
        expect(toBatchCompileConflictReason('missing')).toBeNull()
        expect(toBatchCompileConflictReason('manual-edit')).toBe('manual-edit')
        expect(toBatchCompileConflictReason('unverified')).toBe('unverified')
        expect(shouldSkipBatchCompileTarget('verified', 'incremental')).toBe(true)
        expect(shouldSkipBatchCompileTarget('verified', 'all')).toBe(false)
        expect(shouldSkipBatchCompileTarget('manual-edit', 'incremental')).toBe(false)
    })
})

/* ============================================================================
 * 五、编译记录存储
 * ========================================================================== */

describe('编译记录快照归一化', () => {
    it('非法快照回落空结构；合法记录保留；非法记录丢弃', () => {
        expect(normalizeBatchCompileRecordSnapshot(null)).toEqual({ version: 1, workspaces: {} })
        expect(normalizeBatchCompileRecordSnapshot({ workspaces: 'bad' })).toEqual({
            version: 1,
            workspaces: {}
        })
        const snapshot = normalizeBatchCompileRecordSnapshot({
            version: 99,
            workspaces: {
                key1: {
                    rootPath: 'E:/ws',
                    pages: {
                        'wiki/a.md': {
                            targetPath: 'wiki/a.md',
                            sourcePath: 'raw\\a.md',
                            contentHash: 'h1',
                            updatedAt: 12.9
                        },
                        'wiki/bad.md': { sourcePath: 'raw/b.md' },
                        'wiki/c.md': {
                            targetPath: 'wiki/c.md',
                            sourcePath: '../escape.md',
                            contentHash: 'h2',
                            updatedAt: -5
                        }
                    }
                },
                key2: { rootPath: '', pages: {} },
                key3: 'bad'
            }
        })
        expect(snapshot.version).toBe(1)
        expect(snapshot.workspaces.key1.pages['wiki/a.md']).toEqual({
            targetPath: 'wiki/a.md',
            sourcePath: 'raw/a.md',
            contentHash: 'h1',
            updatedAt: 12
        })
        expect(snapshot.workspaces.key1.pages['wiki/bad.md']).toBeUndefined()
        expect(snapshot.workspaces.key1.pages['wiki/c.md']).toBeUndefined()
        expect(snapshot.workspaces.key2).toBeUndefined()
        expect(snapshot.workspaces.key3).toBeUndefined()
    })

    it('工作区键大小写/分隔符归一化后稳定', () => {
        expect(resolveBatchCompileWorkspaceKey('E:/ws')).toBe(
            resolveBatchCompileWorkspaceKey('e:\\WS\\')
        )
        expect(resolveBatchCompileWorkspaceKey('E:/ws')).not.toBe(
            resolveBatchCompileWorkspaceKey('E:/other')
        )
    })
})

describe('createBatchCompileRecordStore：编译记录读写', () => {
    it('set/get/getAll/remove 全链路；仅记录写入过的页面', () => {
        const store = createBatchCompileRecordStore(createMemoryStorage())
        expect(store.get('E:/ws', 'wiki/a.md')).toBeNull()
        expect(store.getAll('E:/ws')).toEqual([])
        store.set('E:/ws', {
            targetPath: 'wiki/a.md',
            sourcePath: 'raw/a.md',
            contentHash: 'h1',
            updatedAt: 100
        })
        expect(store.get('E:/ws', 'WIKI/A.MD')).toMatchObject({ contentHash: 'h1' })
        expect(store.getAll('E:/ws')).toHaveLength(1)
        store.remove('E:/ws', 'wiki/a.md')
        expect(store.get('E:/ws', 'wiki/a.md')).toBeNull()
        // 非法目标路径：静默忽略
        store.set('E:/ws', {
            targetPath: '',
            sourcePath: 'raw/a.md',
            contentHash: 'h',
            updatedAt: 1
        })
        expect(store.getAll('E:/ws')).toEqual([])
        store.remove('E:/ws', '')
        expect(store.get('E:/ws', '../bad')).toBeNull()
    })

    it('工作区隔离：不同根路径互不影响', () => {
        const store = createBatchCompileRecordStore(createMemoryStorage())
        store.set('E:/ws-a', {
            targetPath: 'wiki/a.md',
            sourcePath: 'raw/a.md',
            contentHash: 'a',
            updatedAt: 1
        })
        store.set('E:/ws-b', {
            targetPath: 'wiki/a.md',
            sourcePath: 'raw/a.md',
            contentHash: 'b',
            updatedAt: 2
        })
        expect(store.get('E:/ws-a', 'wiki/a.md')?.contentHash).toBe('a')
        expect(store.get('E:/ws-b', 'wiki/a.md')?.contentHash).toBe('b')
    })

    it('localStorage 损坏 JSON → 按空记录处理，不抛异常', () => {
        const storage = createMemoryStorage({ [BATCH_COMPILE_RECORD_STORAGE_KEY]: '{bad' })
        const store = createBatchCompileRecordStore(storage)
        expect(store.getAll('E:/ws')).toEqual([])
    })

    it('写入配额失败 → 降级为本次会话内存存储（后续读取仍可见）', () => {
        const storage: BatchCompileRecordStorage = {
            getItem: () => null,
            setItem: () => {
                throw new Error('QuotaExceededError')
            }
        }
        const store = createBatchCompileRecordStore(storage)
        store.set('E:/ws', {
            targetPath: 'wiki/a.md',
            sourcePath: 'raw/a.md',
            contentHash: 'h',
            updatedAt: 1
        })
        expect(store.get('E:/ws', 'wiki/a.md')?.contentHash).toBe('h')
    })

    it('无 storage（隐私模式/非 Electron）→ 仅内存存储可用', () => {
        const store = createBatchCompileRecordStore(null)
        store.set('E:/ws', {
            targetPath: 'wiki/a.md',
            sourcePath: 'raw/a.md',
            contentHash: 'h',
            updatedAt: 1
        })
        expect(store.get('E:/ws', 'wiki/a.md')?.contentHash).toBe('h')
    })

    it('单工作区页面记录超上限时淘汰最久未更新项', () => {
        const store = createBatchCompileRecordStore(createMemoryStorage())
        for (let index = 0; index < BATCH_COMPILE_RECORD_MAX_PAGES + 5; index += 1) {
            store.set('E:/ws', {
                targetPath: `wiki/p${index}.md`,
                sourcePath: `raw/p${index}.md`,
                contentHash: `h${index}`,
                updatedAt: index
            })
        }
        const records = store.getAll('E:/ws')
        expect(records).toHaveLength(BATCH_COMPILE_RECORD_MAX_PAGES)
        // 最久（前 5 条）已被淘汰
        expect(records.some((record) => record.targetPath === 'wiki/p0.md')).toBe(false)
        expect(records.some((record) => record.targetPath === 'wiki/p4.md')).toBe(false)
        expect(records.some((record) => record.targetPath === 'wiki/p5.md')).toBe(true)
    })

    it('工作区数量超上限时淘汰最久未更新的工作区', () => {
        const store = createBatchCompileRecordStore(createMemoryStorage())
        for (let index = 0; index < BATCH_COMPILE_RECORD_MAX_WORKSPACES + 2; index += 1) {
            store.set(`E:/ws-${index}`, {
                targetPath: 'wiki/a.md',
                sourcePath: 'raw/a.md',
                contentHash: `h${index}`,
                updatedAt: index
            })
        }
        expect(store.getAll('E:/ws-0')).toEqual([])
        expect(store.getAll('E:/ws-1')).toEqual([])
        expect(store.getAll(`E:/ws-${BATCH_COMPILE_RECORD_MAX_WORKSPACES + 1}`)).toHaveLength(1)
    })
})

describe('resolveBatchCompileLocalStorage：localStorage 解析', () => {
    afterEach(() => {
        vi.unstubAllGlobals()
    })

    it('window 不存在 / localStorage 访问抛错 → null', () => {
        expect(resolveBatchCompileLocalStorage()).toBeNull()
        vi.stubGlobal('window', {
            get localStorage(): Storage {
                throw new Error('SecurityError')
            }
        })
        expect(resolveBatchCompileLocalStorage()).toBeNull()
        vi.stubGlobal('window', { localStorage: {} })
        expect(resolveBatchCompileLocalStorage()).toBeNull()
    })

    it('合法 localStorage → 返回该 storage', () => {
        const storage = {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {}
        }
        vi.stubGlobal('window', { localStorage: storage })
        expect(resolveBatchCompileLocalStorage()).toBe(storage)
    })
})

describe('hashBatchCompileContent：内容哈希', () => {
    it('同内容哈希相同、异内容不同（含长度）', () => {
        expect(hashBatchCompileContent('abc')).toBe(hashBatchCompileContent('abc'))
        expect(hashBatchCompileContent('abc')).not.toBe(hashBatchCompileContent('abd'))
        expect(hashBatchCompileContent('abc')).toContain('3-')
    })
})

beforeEach(() => {
    // 保持各用例相互独立（内存 storage 每次新建，无需额外清理）
})
