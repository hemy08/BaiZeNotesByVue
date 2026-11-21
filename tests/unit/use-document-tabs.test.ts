/**
 * A1 多标签 / 会话恢复：纯逻辑与控制器单测（opt-in，featureTabs 默认关闭）。
 *
 * 覆盖：
 * 1. 路径归一化 / 展示名 / 标签增删 / 相邻标签 / 上限淘汰；
 * 2. 切回内容恢复判定（内存快照 vs 磁盘内容）；
 * 3. 会话序列化 / 解析 / 校验 / 存取（损坏、版本不符、存储不可用均静默降级）；
 * 4. 控制器：禁用态零副作用、打开/切换/关闭/循环快捷键/会话恢复兜底/开关启停/脏标记。
 *
 * 说明：控制器副作用全部经注入回调，本文件在 node 环境即可运行（无需 jsdom）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    DOCUMENT_TABS_SESSION_VERSION,
    DOCUMENT_TABS_STORAGE_KEY,
    MAX_DOCUMENT_TABS,
    addDocumentTab,
    clearDocumentTabsSession,
    createDocumentTab,
    findDocumentTab,
    getAdjacentDocumentPath,
    getDocumentName,
    loadDocumentTabsSession,
    normalizeDocumentPath,
    parseDocumentTabsSession,
    removeDocumentTab,
    resolveDocumentRestoreContent,
    sameDocumentPath,
    saveDocumentTabsSession,
    serializeDocumentTabsSession,
    useDocumentTabs,
    type DocumentTab,
    type DocumentTabsStorageLike,
    type UseDocumentTabsOptions
} from '../../src/renderer/src/components/Markdown/useDocumentTabs'

/** 内存 localStorage 替身（带调用记录，便于断言「关闭态零读写」） */
function createStorage(initial: Record<string, string> = {}): DocumentTabsStorageLike & {
    getItem: ReturnType<typeof vi.fn>
    setItem: ReturnType<typeof vi.fn>
    removeItem: ReturnType<typeof vi.fn>
} {
    const map = new Map<string, string>(Object.entries(initial))
    return {
        getItem: vi.fn((key: string) => map.get(key) ?? null),
        setItem: vi.fn((key: string, value: string) => {
            map.set(key, value)
        }),
        removeItem: vi.fn((key: string) => {
            map.delete(key)
        })
    }
}

/** 构造标签记录（简化测试数据） */
function tab(path: string): DocumentTab {
    const created = createDocumentTab(path)
    if (!created) {
        throw new Error(`测试路径非法: ${path}`)
    }
    return created
}

describe('normalizeDocumentPath / getDocumentName / createDocumentTab', () => {
    it('归一化反斜杠、首尾空白与末尾斜杠', () => {
        expect(normalizeDocumentPath(' C:\\notes\\a.md ')).toBe('C:/notes/a.md')
        expect(normalizeDocumentPath('C:/notes/')).toBe('C:/notes')
        expect(normalizeDocumentPath('/')).toBe('/')
        expect(normalizeDocumentPath('  ')).toBe('')
        expect(normalizeDocumentPath(undefined)).toBe('')
        expect(normalizeDocumentPath(42)).toBe('')
    })

    it('从路径取显示名（跨平台分隔符）', () => {
        expect(getDocumentName('C:\\notes\\a.md')).toBe('a.md')
        expect(getDocumentName('C:/notes/b.md')).toBe('b.md')
        expect(getDocumentName('C:/')).toBe('C:')
        expect(getDocumentName('')).toBe('')
    })

    it('新建标签记录：非法路径返回 null，合法路径带默认状态', () => {
        expect(createDocumentTab('')).toBeNull()
        expect(createDocumentTab(null)).toBeNull()
        expect(createDocumentTab('C:\\a.md')).toEqual({
            path: 'C:/a.md',
            name: 'a.md',
            dirty: false,
            snapshot: null,
            snapshotDirty: false
        })
    })

    it('路径同一性比较大小写不敏感（Windows 盘符/文件名）', () => {
        expect(sameDocumentPath('C:\\A.md', 'c:/a.md')).toBe(true)
        expect(sameDocumentPath('C:/a.md', 'C:/b.md')).toBe(false)
        expect(sameDocumentPath('', '')).toBe(false)
    })

    it('findDocumentTab 命中/未命中', () => {
        const tabs = [tab('C:/a.md'), tab('C:/b.md')]
        expect(findDocumentTab(tabs, 'c:\\A.MD')?.path).toBe('C:/a.md')
        expect(findDocumentTab(tabs, 'C:/c.md')).toBeUndefined()
    })
})

describe('addDocumentTab / removeDocumentTab / getAdjacentDocumentPath', () => {
    it('追加新标签；重复路径不重复追加', () => {
        const first = addDocumentTab([], 'C:/a.md')
        expect(first.added).toBe(true)
        expect(first.tabs.map((item) => item.path)).toEqual(['C:/a.md'])
        const second = addDocumentTab(first.tabs, 'c:\\A.md')
        expect(second.added).toBe(false)
        expect(second.tabs.map((item) => item.path)).toEqual(['C:/a.md'])
        expect(addDocumentTab(first.tabs, '').added).toBe(false)
    })

    it('超过上限时淘汰最早标签，并跳过保护路径', () => {
        let tabs: DocumentTab[] = []
        for (let index = 0; index < 3; index += 1) {
            tabs = addDocumentTab(tabs, `C:/f${index}.md`, { maxTabs: 3 }).tabs
        }
        const overflow = addDocumentTab(tabs, 'C:/f3.md', { maxTabs: 3 })
        expect(overflow.tabs.map((item) => item.path)).toEqual(['C:/f1.md', 'C:/f2.md', 'C:/f3.md'])
        expect(overflow.evictedPath).toBe('C:/f0.md')

        // protectPath 指定为当前活动标签时，不淘汰它而淘汰更早的标签
        const protectedResult = addDocumentTab(tabs, 'C:/f3.md', {
            maxTabs: 3,
            protectPath: 'C:/f0.md'
        })
        expect(protectedResult.tabs.map((item) => item.path)).toEqual([
            'C:/f0.md',
            'C:/f2.md',
            'C:/f3.md'
        ])
        expect(protectedResult.evictedPath).toBe('C:/f1.md')
    })

    it('maxTabs 至少为 1；上限非法值被钳制', () => {
        const result = addDocumentTab([tab('C:/a.md')], 'C:/b.md', { maxTabs: 0 })
        expect(result.tabs).toHaveLength(1)
        expect(result.tabs[0].path).toBe('C:/b.md')
        expect(result.evictedPath).toBe('C:/a.md')
    })

    it('移除标签：命中/未命中', () => {
        const tabs = [tab('C:/a.md'), tab('C:/b.md')]
        const removed = removeDocumentTab(tabs, 'c:\\a.md')
        expect(removed.removed).toBe(true)
        expect(removed.tabs.map((item) => item.path)).toEqual(['C:/b.md'])
        expect(removeDocumentTab(tabs, 'C:/c.md').removed).toBe(false)
        // 不修改入参
        expect(tabs).toHaveLength(2)
    })

    it('相邻标签循环取值', () => {
        const tabs = [tab('C:/a.md'), tab('C:/b.md'), tab('C:/c.md')]
        expect(getAdjacentDocumentPath(tabs, 'C:/a.md', 1)).toBe('C:/b.md')
        expect(getAdjacentDocumentPath(tabs, 'C:/c.md', 1)).toBe('C:/a.md')
        expect(getAdjacentDocumentPath(tabs, 'C:/a.md', -1)).toBe('C:/c.md')
        expect(getAdjacentDocumentPath(tabs, 'C:/b.md', 0)).toBe('C:/c.md')
        expect(getAdjacentDocumentPath(tabs, 'C:/unknown.md', 1)).toBe('C:/a.md')
        expect(getAdjacentDocumentPath([], 'C:/a.md', 1)).toBe('')
        expect(getAdjacentDocumentPath([tab('C:/a.md')], 'C:/a.md', 1)).toBe('C:/a.md')
    })
})

describe('resolveDocumentRestoreContent：切回标签内容判定', () => {
    it('无快照 / 快照不脏 / 快照与磁盘一致时使用磁盘内容', () => {
        expect(resolveDocumentRestoreContent(undefined, 'disk')).toEqual({
            content: 'disk',
            restored: false
        })
        const clean: DocumentTab = { ...tab('C:/a.md'), snapshot: 'old', snapshotDirty: false }
        expect(resolveDocumentRestoreContent(clean, 'disk')).toEqual({
            content: 'disk',
            restored: false
        })
        const sameContent: DocumentTab = {
            ...tab('C:/a.md'),
            snapshot: 'disk',
            snapshotDirty: true
        }
        expect(resolveDocumentRestoreContent(sameContent, 'disk').restored).toBe(false)
    })

    it('离开时未保存且内存快照与磁盘不同 → 用快照恢复', () => {
        const dirtyTab: DocumentTab = {
            ...tab('C:/a.md'),
            snapshot: '未保存内容',
            snapshotDirty: true
        }
        expect(resolveDocumentRestoreContent(dirtyTab, '磁盘旧内容')).toEqual({
            content: '未保存内容',
            restored: true
        })
    })

    it('空白快照视为无快照（避免把空文档误判为未保存正文）', () => {
        const emptySnapshot: DocumentTab = { ...tab('C:/a.md'), snapshot: '', snapshotDirty: true }
        expect(resolveDocumentRestoreContent(emptySnapshot, 'disk').restored).toBe(false)
    })
})

describe('会话序列化 / 解析 / 存取', () => {
    it('序列化保存路径与活动标签；空标签返回 null', () => {
        const tabs = [tab('C:/a.md'), tab('C:/b.md')]
        const raw = serializeDocumentTabsSession(tabs, 'c:\\b.md')
        expect(raw).not.toBeNull()
        expect(JSON.parse(raw as string)).toEqual({
            version: DOCUMENT_TABS_SESSION_VERSION,
            paths: ['C:/a.md', 'C:/b.md'],
            activePath: 'C:/b.md'
        })
        expect(serializeDocumentTabsSession([], 'C:/a.md')).toBeNull()
    })

    it('活动标签不在列表内时回落第一个标签；重复路径去重', () => {
        const tabs = [tab('C:/a.md'), tab('C:/a.md'), tab('C:/b.md')]
        const parsed = parseDocumentTabsSession(
            serializeDocumentTabsSession(tabs, 'C:/missing.md') as string
        )
        expect(parsed?.paths).toEqual(['C:/a.md', 'C:/b.md'])
        expect(parsed?.activePath).toBe('C:/a.md')
    })

    it('解析：非法 JSON / 版本不符 / 结构非法 / 空列表均返回 null', () => {
        expect(parseDocumentTabsSession(null)).toBeNull()
        expect(parseDocumentTabsSession('')).toBeNull()
        expect(parseDocumentTabsSession('not-json')).toBeNull()
        expect(parseDocumentTabsSession('null')).toBeNull()
        expect(
            parseDocumentTabsSession(
                JSON.stringify({ version: 999, paths: ['C:/a.md'], activePath: 'C:/a.md' })
            )
        ).toBeNull()
        expect(parseDocumentTabsSession(JSON.stringify({ version: 1, paths: 'x' }))).toBeNull()
        expect(
            parseDocumentTabsSession(
                JSON.stringify({ version: 1, paths: ['  ', null, 3], activePath: '' })
            )
        ).toBeNull()
    })

    it('解析时过滤非法项并按上限截断', () => {
        const paths = Array.from({ length: MAX_DOCUMENT_TABS + 5 }, (_, index) => `C:/f${index}.md`)
        const parsed = parseDocumentTabsSession(
            JSON.stringify({ version: 1, paths: ['', ...paths], activePath: 'C:/f0.md' })
        )
        expect(parsed?.paths).toHaveLength(MAX_DOCUMENT_TABS)
        expect(parsed?.paths[0]).toBe('C:/f0.md')
    })

    it('存储不可用/损坏时静默降级', () => {
        expect(saveDocumentTabsSession(null, [tab('C:/a.md')], 'C:/a.md')).toBe(false)
        expect(loadDocumentTabsSession(null)).toBeNull()
        expect(() => clearDocumentTabsSession(null)).not.toThrow()

        const throwing: DocumentTabsStorageLike = {
            getItem: () => {
                throw new Error('denied')
            },
            setItem: () => {
                throw new Error('quota')
            },
            removeItem: () => {
                throw new Error('denied')
            }
        }
        expect(saveDocumentTabsSession(throwing, [tab('C:/a.md')], 'C:/a.md')).toBe(false)
        expect(loadDocumentTabsSession(throwing)).toBeNull()
        expect(() => clearDocumentTabsSession(throwing)).not.toThrow()
    })

    it('读写往返；损坏数据读取时删除键', () => {
        const storage = createStorage()
        expect(saveDocumentTabsSession(storage, [tab('C:/a.md')], 'C:/a.md')).toBe(true)
        expect(loadDocumentTabsSession(storage)?.paths).toEqual(['C:/a.md'])

        storage.setItem(DOCUMENT_TABS_STORAGE_KEY, '{broken')
        expect(loadDocumentTabsSession(storage)).toBeNull()
        expect(storage.removeItem).toHaveBeenCalledWith(DOCUMENT_TABS_STORAGE_KEY)
    })

    it('空标签保存时移除旧会话键', () => {
        const storage = createStorage({
            [DOCUMENT_TABS_STORAGE_KEY]: JSON.stringify({
                version: 1,
                paths: ['C:/a.md'],
                activePath: 'C:/a.md'
            })
        })
        expect(saveDocumentTabsSession(storage, [], '')).toBe(true)
        expect(storage.removeItem).toHaveBeenCalledWith(DOCUMENT_TABS_STORAGE_KEY)
    })
})

/** 控制器测试替身：所有副作用可观测 */
interface ControllerHarness {
    controller: ReturnType<typeof useDocumentTabs>
    storage: ReturnType<typeof createStorage>
    options: {
        getActivePath: ReturnType<typeof vi.fn>
        getCurrentContent: ReturnType<typeof vi.fn>
        hasLoadedDocument: ReturnType<typeof vi.fn>
        flushContent: ReturnType<typeof vi.fn>
        saveContent: ReturnType<typeof vi.fn>
        openFile: ReturnType<typeof vi.fn>
        warn: ReturnType<typeof vi.fn>
    }
}

function createHarness(overrides: Partial<UseDocumentTabsOptions> = {}): ControllerHarness {
    const baseOptions = {
        getActivePath: vi.fn(() => ''),
        getCurrentContent: vi.fn(() => ''),
        hasLoadedDocument: vi.fn(() => true),
        flushContent: vi.fn(),
        saveContent: vi.fn(),
        openFile: vi.fn(),
        warn: vi.fn()
    }
    const storage =
        overrides.storage === undefined
            ? createStorage()
            : (overrides.storage as ReturnType<typeof createStorage>)
    const controller = useDocumentTabs({
        // 先展开默认回调，再用 overrides 覆盖（含 storage 注入）
        ...baseOptions,
        storage,
        switchTimeoutMs: 1000,
        restoreDelayMs: 500,
        ...overrides
    })
    return { controller, storage, options: baseOptions }
}

describe('useDocumentTabs：禁用态零副作用', () => {
    it('未调用 setEnabled(true) 前不读写存储、不调用任何注入副作用', () => {
        const harness = createHarness()
        expect(harness.storage.getItem).not.toHaveBeenCalled()
        expect(harness.controller.enabled.value).toBe(false)

        harness.controller.handleFileActivated('C:/a.md')
        expect(harness.controller.handleLoadedContent('内容')).toBe('内容')
        harness.controller.handleEditorContent('输入')
        harness.controller.handleSaved()
        expect(harness.controller.selectTab('C:/a.md')).toBe(false)
        expect(harness.controller.closeTab('C:/a.md')).toBe(false)
        expect(harness.controller.cycleTab(1)).toBe(false)
        expect(harness.controller.tabs.value).toHaveLength(0)
        expect(harness.storage.setItem).not.toHaveBeenCalled()
        expect(harness.options.openFile).not.toHaveBeenCalled()
        expect(harness.options.flushContent).not.toHaveBeenCalled()
        expect(harness.options.saveContent).not.toHaveBeenCalled()
    })

    it('关闭开关后停止登记标签与会话写入', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        const writes = harness.storage.setItem.mock.calls.length

        harness.controller.setEnabled(false)
        harness.controller.handleFileActivated('C:/b.md')
        expect(harness.controller.tabs.value.map((item) => item.path)).toEqual(['C:/a.md'])
        expect(harness.storage.setItem.mock.calls.length).toBe(writes)
    })
})

describe('useDocumentTabs：打开/激活/脏标记/保存', () => {
    it('文件激活后登记标签并持久化会话', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:\\notes\\a.md')

        expect(harness.controller.activePath.value).toBe('C:/notes/a.md')
        expect(harness.controller.tabs.value.map((item) => item.name)).toEqual(['a.md'])
        const saved = JSON.parse(harness.storage.setItem.mock.calls.at(-1)?.[1] as string)
        expect(saved.paths).toEqual(['C:/notes/a.md'])
        expect(saved.activePath).toBe('C:/notes/a.md')
        expect(harness.controller.canCloseTabs.value).toBe(false)
    })

    it('开关打开前已存在的活动文件在启用时被采纳为干净标签', () => {
        const harness = createHarness({
            getActivePath: vi.fn(() => 'C:/current.md'),
            getCurrentContent: vi.fn(() => '当前内容')
        })
        harness.controller.setEnabled(true)
        expect(harness.controller.tabs.value.map((item) => item.path)).toEqual(['C:/current.md'])
        expect(harness.controller.tabs.value[0].dirty).toBe(false)
        expect(harness.controller.tabs.value[0].snapshot).toBeNull()
    })

    it('内容变化置脏，保存成功后清脏并推进基准', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleLoadedContent('初始内容')
        harness.controller.handleFileActivated('C:/a.md')

        harness.controller.handleEditorContent('编辑后内容')
        expect(harness.controller.tabs.value[0].dirty).toBe(true)
        harness.controller.handleSaved()
        expect(harness.controller.tabs.value[0].dirty).toBe(false)
        // 保存后基准已推进：同样内容不算脏
        harness.controller.handleEditorContent('编辑后内容')
        expect(harness.controller.tabs.value[0].dirty).toBe(false)
    })

    it('切换中的保存成功事件被忽略（属于切走前的旧文件）', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleFileActivated('C:/b.md')
        harness.controller.handleEditorContent('b 内容')
        expect(harness.controller.tabs.value[1].dirty).toBe(true)

        expect(harness.controller.selectTab('C:/a.md')).toBe(true)
        harness.controller.handleSaved()
        // 切换未确认前不得清除目标标签的脏状态
        expect(harness.controller.tabs.value[1].dirty).toBe(true)
    })

    it('标签数量达到上限时淘汰最早标签', () => {
        const harness = createHarness({ maxTabs: 2 })
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleFileActivated('C:/b.md')
        harness.controller.handleFileActivated('C:/c.md')
        expect(harness.controller.tabs.value.map((item) => item.path)).toEqual([
            'C:/b.md',
            'C:/c.md'
        ])
        expect(harness.options.warn).toHaveBeenCalled()
    })
})

describe('useDocumentTabs：切换标签', () => {
    it('切换前同步当前全文并复用既有打开链路；确认后激活目标标签', () => {
        const harness = createHarness({
            getCurrentContent: vi.fn(() => 'a 的最新内容')
        })
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleFileActivated('C:/b.md')
        harness.options.flushContent.mockClear()

        expect(harness.controller.selectTab('C:/a.md')).toBe(true)
        expect(harness.controller.switching.value).toBe(true)
        expect(harness.options.flushContent).toHaveBeenCalledWith('a 的最新内容')
        expect(harness.options.openFile).toHaveBeenCalledWith({ path: 'C:/a.md', name: 'a.md' })

        // 主进程内容 + 路径回发后确认切换
        harness.controller.handleLoadedContent('a 的磁盘内容')
        harness.controller.handleFileActivated('C:/a.md')
        expect(harness.controller.switching.value).toBe(false)
        expect(harness.controller.activePath.value).toBe('C:/a.md')
        expect(harness.controller.tabs.value).toHaveLength(2)
    })

    it('编辑器未装载内容时不同步全文（防空内容覆盖磁盘）', () => {
        const harness = createHarness({
            hasLoadedDocument: vi.fn(() => false),
            getCurrentContent: vi.fn(() => '')
        })
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleFileActivated('C:/b.md')
        harness.options.flushContent.mockClear()

        harness.controller.selectTab('C:/a.md')
        expect(harness.options.flushContent).not.toHaveBeenCalled()
    })

    it('点击当前活动标签 / 未知标签 / 切换中再次点击均返回 false', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleFileActivated('C:/b.md')

        expect(harness.controller.selectTab('C:/b.md')).toBe(false)
        expect(harness.controller.selectTab('C:/missing.md')).toBe(false)
        expect(harness.controller.selectTab('')).toBe(false)
        expect(harness.controller.selectTab('C:/a.md')).toBe(true)
        expect(harness.controller.selectTab('C:/b.md')).toBe(false)
    })

    it('切换确认超时后回退等待态，保留当前活动标签', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleFileActivated('C:/b.md')

        harness.controller.selectTab('C:/a.md')
        expect(harness.controller.switching.value).toBe(true)
        vi.advanceTimersByTime(1000)
        expect(harness.controller.switching.value).toBe(false)
        expect(harness.controller.activePath.value).toBe('C:/b.md')
        expect(harness.options.warn).toHaveBeenCalled()
    })

    it('切走时保留脏标签内存快照；切回时磁盘内容不同则用快照恢复', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        // 打开 a（主进程先下发内容、再下发活动文件路径）
        harness.controller.handleLoadedContent('a 的磁盘内容')
        harness.controller.handleFileActivated('C:/a.md')
        // 外部打开 b：内容事件先到（此时把 a 的正文存入内存快照），随后路径事件激活 b
        harness.controller.handleLoadedContent('b 的磁盘内容')
        harness.controller.handleFileActivated('C:/b.md')
        const aTab = harness.controller.tabs.value.find((item) => item.path === 'C:/a.md')
        expect(aTab?.snapshot).toBe('a 的磁盘内容')
        expect(aTab?.snapshotDirty).toBe(false)

        // 在 b 标签输入未保存内容后切到 a（模拟落盘失败：b 的磁盘仍为旧内容）
        harness.controller.handleEditorContent('b 的未保存修改')
        expect(harness.controller.tabs.value[1].dirty).toBe(true)
        harness.controller.selectTab('C:/a.md')
        harness.controller.handleLoadedContent('a 的磁盘内容')
        harness.controller.handleFileActivated('C:/a.md')

        const bTab = harness.controller.tabs.value.find((item) => item.path === 'C:/b.md')
        expect(bTab?.snapshot).toBe('b 的未保存修改')
        expect(bTab?.snapshotDirty).toBe(true)

        // 切回 b：磁盘内容仍是旧值 → 用内存快照恢复并保持脏标记
        harness.controller.selectTab('C:/b.md')
        expect(harness.controller.handleLoadedContent('b 的磁盘内容')).toBe('b 的未保存修改')
        harness.controller.handleFileActivated('C:/b.md')
        const restored = harness.controller.tabs.value.find((item) => item.path === 'C:/b.md')
        expect(restored?.dirty).toBe(true)
        expect(harness.options.warn).toHaveBeenCalled()
    })

    it('切回时磁盘内容与快照一致则按磁盘内容展示（不误判脏）', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleLoadedContent('a 的磁盘内容')
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleLoadedContent('b 的磁盘内容')
        harness.controller.handleFileActivated('C:/b.md')
        harness.controller.handleEditorContent('已自动保存的内容')
        harness.controller.selectTab('C:/a.md')
        harness.controller.handleLoadedContent('a 的磁盘内容')
        harness.controller.handleFileActivated('C:/a.md')

        harness.controller.selectTab('C:/b.md')
        expect(harness.controller.handleLoadedContent('已自动保存的内容')).toBe('已自动保存的内容')
        harness.controller.handleFileActivated('C:/b.md')
        const bTab = harness.controller.tabs.value.find((item) => item.path === 'C:/b.md')
        expect(bTab?.dirty).toBe(false)
        expect(bTab?.snapshotDirty).toBe(false)
    })

    it('主进程主动重读（reload）时以磁盘内容为准，清除快照与脏标记', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleLoadedContent('初始内容')
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleEditorContent('未保存内容')
        expect(harness.controller.tabs.value[0].dirty).toBe(true)

        const displayed = harness.controller.handleLoadedContent('磁盘新内容', 'reload')
        expect(displayed).toBe('磁盘新内容')
        expect(harness.controller.tabs.value[0].dirty).toBe(false)
        harness.controller.handleFileActivated('C:/a.md')
        expect(harness.controller.tabs.value[0].snapshot).toBeNull()
    })
})

describe('useDocumentTabs：关闭标签', () => {
    it('关闭非活动标签直接移除；最后一个标签不可关闭', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleFileActivated('C:/b.md')

        expect(harness.controller.closeTab('C:/a.md')).toBe(true)
        expect(harness.controller.tabs.value.map((item) => item.path)).toEqual(['C:/b.md'])
        expect(harness.controller.closeTab('C:/b.md')).toBe(false)
        expect(harness.controller.closeTab('C:/missing.md')).toBe(false)
        expect(harness.controller.tabs.value).toHaveLength(1)
    })

    it('关闭活动脏标签：先保存再切到相邻标签，确认后移除旧标签', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleFileActivated('C:/b.md')
        harness.controller.handleLoadedContent('b 初始内容')
        harness.controller.handleFileActivated('C:/b.md')
        harness.controller.handleEditorContent('b 未保存内容')

        expect(harness.controller.closeTab('C:/b.md')).toBe(true)
        // 脏内容先走既有保存链路
        expect(harness.options.saveContent).toHaveBeenCalledWith('b 未保存内容')
        expect(harness.options.flushContent).toHaveBeenCalled()
        expect(harness.options.openFile).toHaveBeenCalledWith({ path: 'C:/a.md', name: 'a.md' })

        harness.controller.handleLoadedContent('a 内容')
        harness.controller.handleFileActivated('C:/a.md')
        expect(harness.controller.tabs.value.map((item) => item.path)).toEqual(['C:/a.md'])
        expect(harness.controller.activePath.value).toBe('C:/a.md')
    })

    it('关闭活动干净标签不额外触发保存', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleFileActivated('C:/b.md')
        harness.controller.handleLoadedContent('b 内容')
        harness.controller.handleFileActivated('C:/b.md')

        expect(harness.controller.closeTab('C:/b.md')).toBe(true)
        expect(harness.options.saveContent).not.toHaveBeenCalled()
    })

    it('关闭时主动保存的迟到成功事件不会误清新活动标签的脏标记', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleLoadedContent('a 内容')
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleLoadedContent('b 内容')
        harness.controller.handleFileActivated('C:/b.md')
        harness.controller.handleEditorContent('b 未保存内容')

        expect(harness.controller.closeTab('C:/b.md')).toBe(true)
        expect(harness.options.saveContent).toHaveBeenCalled()

        // 主进程确认切到 a 后，用户在新活动标签继续编辑
        harness.controller.handleLoadedContent('a 内容')
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.handleEditorContent('a 的新编辑')
        const aTab = harness.controller.tabs.value.find((item) => item.path === 'C:/a.md')
        expect(aTab?.dirty).toBe(true)

        // 迟到的旧文件保存成功事件被吞掉：不清除新活动标签的脏标记
        harness.controller.handleSaved()
        expect(aTab?.dirty).toBe(true)
        // 第二次属于当前标签的保存成功：正常清除
        harness.controller.handleSaved()
        expect(aTab?.dirty).toBe(false)
    })
})

describe('useDocumentTabs：循环切换与启用/停用', () => {
    it('循环切换：下一个/上一个/只有一个标签/切换中', () => {
        const harness = createHarness()
        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        expect(harness.controller.cycleTab(1)).toBe(false)

        harness.controller.handleFileActivated('C:/b.md')
        expect(harness.controller.cycleTab(1)).toBe(true)
        expect(harness.options.openFile).toHaveBeenLastCalledWith({ path: 'C:/a.md', name: 'a.md' })

        harness.controller.handleLoadedContent('a')
        harness.controller.handleFileActivated('C:/a.md')
        // 上一个标签（从 a 回到 b）
        expect(harness.controller.cycleTab(-1)).toBe(true)
        expect(harness.controller.cycleTab(-1)).toBe(false) // 切换中
        harness.controller.handleFileActivated('C:/b.md')
        expect(harness.controller.cycleTab(0)).toBe(true) // step=0 视为下一个：b → a
    })

    it('启用时恢复会话；主界面迟迟无文件事件时兜底打开上次活动标签', () => {
        const storage = createStorage({
            [DOCUMENT_TABS_STORAGE_KEY]: JSON.stringify({
                version: 1,
                paths: ['C:/a.md', 'C:/b.md'],
                activePath: 'C:/b.md'
            })
        })
        const harness = createHarness({ storage })
        harness.controller.setEnabled(true)
        expect(harness.controller.tabs.value.map((item) => item.path)).toEqual([
            'C:/a.md',
            'C:/b.md'
        ])
        expect(harness.controller.activePath.value).toBe('C:/b.md')
        expect(harness.options.openFile).not.toHaveBeenCalled()

        vi.advanceTimersByTime(499)
        expect(harness.options.openFile).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(harness.options.openFile).toHaveBeenCalledWith({ path: 'C:/b.md', name: 'b.md' })
    })

    it('启动恢复文件事件到达后取消兜底打开', () => {
        const storage = createStorage({
            [DOCUMENT_TABS_STORAGE_KEY]: JSON.stringify({
                version: 1,
                paths: ['C:/a.md', 'C:/b.md'],
                activePath: 'C:/b.md'
            })
        })
        const harness = createHarness({ storage })
        harness.controller.setEnabled(true)

        harness.controller.handleLoadedContent('启动恢复内容')
        harness.controller.handleFileActivated('C:/b.md')
        vi.advanceTimersByTime(5000)
        expect(harness.options.openFile).not.toHaveBeenCalled()
        expect(harness.controller.activePath.value).toBe('C:/b.md')
    })

    it('切换前已打开的文件在启用时采纳，并清理会话兜底定时器', () => {
        const storage = createStorage({
            [DOCUMENT_TABS_STORAGE_KEY]: JSON.stringify({
                version: 1,
                paths: ['C:/old.md'],
                activePath: 'C:/old.md'
            })
        })
        const harness = createHarness({
            storage,
            getActivePath: vi.fn(() => 'C:/current.md'),
            getCurrentContent: vi.fn(() => '当前内容')
        })
        harness.controller.setEnabled(true)
        vi.advanceTimersByTime(5000)
        expect(harness.options.openFile).not.toHaveBeenCalled()
        expect(harness.controller.tabs.value.map((item) => item.path)).toEqual([
            'C:/old.md',
            'C:/current.md'
        ])
        expect(harness.controller.activePath.value).toBe('C:/current.md')
    })

    it('重复 setEnabled(false) 幂等；dispose 后不再响应', () => {
        const harness = createHarness()
        harness.controller.setEnabled(false)
        harness.controller.setEnabled(false)
        expect(harness.controller.enabled.value).toBe(false)

        harness.controller.setEnabled(true)
        harness.controller.handleFileActivated('C:/a.md')
        harness.controller.dispose()
        expect(harness.controller.enabled.value).toBe(false)
        expect(harness.storage.setItem).toHaveBeenCalled()
        harness.controller.setEnabled(true)
        expect(harness.controller.enabled.value).toBe(false) // dispose 后 setEnabled 为空操作
        harness.controller.dispose()
        expect(harness.controller.tabs.value).toHaveLength(1)
    })

    it('未注入 storage 时使用全局 localStorage（存在时可持久化）', () => {
        const globalStorage = createStorage()
        vi.stubGlobal('localStorage', globalStorage)
        const controller = useDocumentTabs({
            getActivePath: vi.fn(() => ''),
            getCurrentContent: vi.fn(() => ''),
            flushContent: vi.fn(),
            saveContent: vi.fn(),
            openFile: vi.fn()
        })
        controller.setEnabled(true)
        controller.handleFileActivated('C:/a.md')
        expect(globalStorage.setItem).toHaveBeenCalled()
        controller.dispose()
    })
})

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})
