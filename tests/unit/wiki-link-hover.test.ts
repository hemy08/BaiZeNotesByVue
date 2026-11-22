/**
 * E10 Wiki 链接悬浮预览单测（wiki-link-hover.ts）
 *
 * 覆盖：
 * 1. 纯定位 `parseWikiLinkAt`（三种写法 / 多链接 / 边界列 / 空目标）；
 * 2. 目标解析 `resolveWikiLinkTarget`（根相对 / 源目录相对 / basename / title /
 *    缺失 / 歧义 / Windows 绝对路径与 UNC 拒绝），与主进程解析阶段同口径；
 * 3. 悬停信息 `buildWikiLinkHoverInfo`（快照记录复用 / 按 target 重解析 / 摘要截断 /
 *    反向链接数量 / 快照缺失降级）；
 * 4. 文案格式化 `formatWikiLinkHoverMarkdown`（标签注入，不写死用户可见文案）；
 * 5. 注册/释放 `registerWikiLinkHover`（注册幂等、释放幂等、快照缓存与失败冷却、
 *    非 Markdown 模型/非链接位置不触发索引加载、异常静默降级）。
 */
import { describe, expect, it } from 'vitest'
import {
    buildWikiLinkHoverInfo,
    countWikiBacklinks,
    createDefaultWikiLinkHoverLabels,
    findSnapshotFile,
    findWikiLinkInSnapshot,
    formatWikiLinkHoverMarkdown,
    normalizeHoverExcerpt,
    parseWikiLinkAt,
    registerWikiLinkHover,
    resolveWikiLinkTarget,
    WIKI_LINK_HOVER_EXCERPT_MAX_LENGTH,
    type WikiLinkHoverEditorLike,
    type WikiLinkHoverLabels,
    type WikiLinkHoverModelLike,
    type WikiLinkHoverMonacoLike,
    type WikiLinkHoverProviderLike,
    type WikiLinkHoverResultLike
} from '../../src/renderer/src/components/Markdown/wiki-link-hover'
import type { WorkspaceIndexResult } from '../../src/shared/types/ipc'
import type {
    WorkspaceIndexFile,
    WorkspaceIndexLink,
    WorkspaceIndexSnapshot
} from '../../src/shared/types/workspace-index'

/* ============================ 测试替身与夹具 ============================ */

/** 测试用悬停文案（生产由组件传入 `t()` 结果；此处固定便于断言） */
const TEST_LABELS: WikiLinkHoverLabels = {
    missing: '目标不存在',
    ambiguous: '目标不唯一',
    backlinks: (count: number) => `反向链接 ${count} 条`
}

interface FileSpec {
    path: string
    relativePath: string
    title?: string
    /** task-12 新增的可选摘要字段（类型尚未扩展，经 unknown 注入以兼容） */
    excerpt?: string
    links?: Array<Partial<WorkspaceIndexLink> & { line: number; column: number }>
}

/** 创建快照文件（字段按当前契约给全，excerpt 走可选注入） */
function createFile(spec: FileSpec): WorkspaceIndexFile {
    const name = spec.relativePath.split('/').pop() ?? spec.relativePath
    const links = (spec.links ?? []).map((link) => ({
        target: link.target ?? '',
        raw: link.raw ?? '',
        line: link.line,
        column: link.column,
        status: link.status ?? 'resolved',
        resolvedPath: link.resolvedPath
    }))
    const file: Record<string, unknown> = {
        path: spec.path,
        relativePath: spec.relativePath,
        name,
        title: spec.title ?? '',
        tags: [],
        links,
        size: 100,
        mtimeMs: 0
    }
    if (spec.excerpt !== undefined) {
        file.excerpt = spec.excerpt
    }
    return file as unknown as WorkspaceIndexFile
}

/** 创建快照（未知新增字段经 unknown 转换，兼容 task-12 的 excerpt/attachments 扩展） */
function createSnapshot(
    files: WorkspaceIndexFile[],
    rootPath = 'E:/notes'
): WorkspaceIndexSnapshot {
    return {
        rootPath,
        generatedAt: 0,
        files,
        tags: [],
        missingLinks: [],
        stats: {
            fileCount: files.length,
            linkCount: 0,
            missingCount: 0,
            ambiguousCount: 0
        }
    } as unknown as WorkspaceIndexSnapshot
}

/** 默认工作区快照：a.md（含指向 b 的已解析链接）、b.md、sub/c.md、两个同名 dup.md */
function createWorkspaceSnapshot(): WorkspaceIndexSnapshot {
    return createSnapshot([
        createFile({
            path: 'E:\\notes\\a.md',
            relativePath: 'a.md',
            title: '源文件',
            links: [
                {
                    target: 'b',
                    raw: '[[b]]',
                    line: 1,
                    column: 3,
                    status: 'resolved',
                    resolvedPath: 'E:/notes/b.md'
                }
            ]
        }),
        createFile({
            path: 'E:/notes/b.md',
            relativePath: 'b.md',
            title: '目标笔记',
            excerpt: '目标笔记的摘要内容'
        }),
        createFile({ path: 'E:/notes/sub/c.md', relativePath: 'sub/c.md', title: '子目录笔记' }),
        createFile({
            path: 'E:/notes/sub/d.md',
            relativePath: 'sub/d.md',
            title: '子目录源文件'
        }),
        createFile({ path: 'E:/notes/dup1/dup.md', relativePath: 'dup1/dup.md', title: '重复一' }),
        createFile({ path: 'E:/notes/dup2/dup.md', relativePath: 'dup2/dup.md', title: '重复二' })
    ])
}

/** 创建 fake 文本模型（默认 file 协议 + markdown 语言） */
function createModel(
    lines: string[],
    filePath = 'E:/notes/a.md',
    languageId = 'markdown'
): WikiLinkHoverModelLike {
    const normalized = filePath.replace(/\\/g, '/')
    const uriPath = /^[A-Za-z]:/.test(normalized) ? `/${normalized}` : normalized
    return {
        uri: { scheme: 'file', path: uriPath },
        getLanguageId: () => languageId,
        getLineContent: (lineNumber: number) => lines[lineNumber - 1] ?? ''
    }
}

/** 创建 fake 编辑器（getModel 供路径兜底） */
function createEditor(model: WikiLinkHoverModelLike | null): WikiLinkHoverEditorLike {
    return { getModel: () => model }
}

interface FakeMonaco {
    api: WikiLinkHoverMonacoLike
    providers: Array<{ selector: string; provider: WikiLinkHoverProviderLike }>
    disposeCount: () => number
}

/** 创建 fake Monaco API：记录注册的 provider 与 dispose 次数 */
function createFakeMonaco(): FakeMonaco {
    const providers: Array<{ selector: string; provider: WikiLinkHoverProviderLike }> = []
    let disposeCount = 0
    const api: WikiLinkHoverMonacoLike = {
        languages: {
            registerHoverProvider(selector, provider) {
                providers.push({ selector, provider })
                return {
                    dispose() {
                        disposeCount += 1
                    }
                }
            }
        },
        Range: class FakeRange {
            constructor(
                public startLineNumber: number,
                public startColumn: number,
                public endLineNumber: number,
                public endColumn: number
            ) {}
        }
    }
    return { api, providers, disposeCount: () => disposeCount }
}

/** 成功索引结果 */
function okResult(snapshot: WorkspaceIndexSnapshot): WorkspaceIndexResult {
    return { ok: true, snapshot, cached: false }
}

/** 对 provider 发起一次悬停 */
function hoverAt(
    provider: WikiLinkHoverProviderLike,
    model: WikiLinkHoverModelLike,
    lineNumber: number,
    column: number
): Promise<WikiLinkHoverResultLike | null> {
    return provider.provideHover(model, { lineNumber, column })
}

/* ============================ 1. 链接定位（纯函数） ============================ */

describe('parseWikiLinkAt 链接定位', () => {
    it('定位 `[[target]]` 并返回原文与 1-based 列范围', () => {
        const line = '见 [[b]] 完毕'
        expect(parseWikiLinkAt(line, 5)).toEqual({
            target: 'b',
            alias: '',
            heading: '',
            raw: '[[b]]',
            startColumn: 3,
            endColumn: 8
        })
    })

    it('解析别名与 heading 锚点（`[[target#heading|alias]]`）', () => {
        const link = parseWikiLinkAt('见 [[sub/c#小节一|别名]] 完毕', 8)
        expect(link).not.toBeNull()
        expect(link?.target).toBe('sub/c')
        expect(link?.heading).toBe('小节一')
        expect(link?.alias).toBe('别名')
        expect(link?.raw).toBe('[[sub/c#小节一|别名]]')
    })

    it('同一行多个链接时按列命中对应链接', () => {
        const line = '[[a]] 与 [[b]]'
        expect(parseWikiLinkAt(line, 2)?.target).toBe('a')
        // `[[b]]` 起始下标 8 → 起始列 9
        expect(parseWikiLinkAt(line, 10)?.target).toBe('b')
        // 两段链接之间的空格不属于任何链接
        expect(parseWikiLinkAt(line, 7)).toBeNull()
    })

    it('列落在链接范围外（含 endColumn 边界）返回 null', () => {
        const line = '见 [[b]] 完毕'
        expect(parseWikiLinkAt(line, 2)).toBeNull()
        expect(parseWikiLinkAt(line, 8)).toBeNull()
        expect(parseWikiLinkAt(line, 0)).toBeNull()
        expect(parseWikiLinkAt(line, Number.NaN)).toBeNull()
    })

    it('空目标（`[[#heading]]` / `[[|别名]]`）按不可解析链接返回 null', () => {
        expect(parseWikiLinkAt('[[#小节]]', 2)).toBeNull()
        expect(parseWikiLinkAt('[[|别名]]', 2)).toBeNull()
    })

    it('非链接文本 / 空行返回 null', () => {
        expect(parseWikiLinkAt('普通文本 [单括号]', 3)).toBeNull()
        expect(parseWikiLinkAt('', 1)).toBeNull()
    })
})

/* ============================ 2. 目标解析（纯函数） ============================ */

describe('resolveWikiLinkTarget 目标解析', () => {
    const snapshot = createWorkspaceSnapshot()

    it('阶段①：工作区根相对路径（无扩展名自动补 .md）', () => {
        const resolution = resolveWikiLinkTarget(snapshot, 'E:/notes/a.md', 'b')
        expect(resolution.status).toBe('resolved')
        if (resolution.status === 'resolved') {
            expect(resolution.file.relativePath).toBe('b.md')
        }
    })

    it('阶段①：带扩展名与目录的相对路径', () => {
        const resolution = resolveWikiLinkTarget(snapshot, 'E:/notes/a.md', 'sub/c.md')
        expect(resolution.status).toBe('resolved')
        if (resolution.status === 'resolved') {
            expect(resolution.file.relativePath).toBe('sub/c.md')
        }
    })

    it('阶段②：相对源文件所在目录解析', () => {
        const resolution = resolveWikiLinkTarget(snapshot, 'E:/notes/sub/d.md', 'c')
        expect(resolution.status).toBe('resolved')
        if (resolution.status === 'resolved') {
            expect(resolution.file.relativePath).toBe('sub/c.md')
        }
    })

    it('阶段③：全库 basename 唯一匹配', () => {
        const resolution = resolveWikiLinkTarget(snapshot, '', 'c')
        expect(resolution.status).toBe('resolved')
        if (resolution.status === 'resolved') {
            expect(resolution.file.relativePath).toBe('sub/c.md')
        }
    })

    it('阶段③：全库 title 唯一匹配', () => {
        const resolution = resolveWikiLinkTarget(snapshot, '', '目标笔记')
        expect(resolution.status).toBe('resolved')
        if (resolution.status === 'resolved') {
            expect(resolution.file.relativePath).toBe('b.md')
        }
    })

    it('目标不存在 → missing', () => {
        expect(resolveWikiLinkTarget(snapshot, 'E:/notes/a.md', 'nope').status).toBe('missing')
    })

    it('目标不唯一（同名文件） → ambiguous', () => {
        expect(resolveWikiLinkTarget(snapshot, 'E:/notes/a.md', 'dup').status).toBe('ambiguous')
    })

    it('盘符 / UNC 开头的目标不当作工作区笔记 → missing', () => {
        expect(resolveWikiLinkTarget(snapshot, 'E:/notes/a.md', 'C:/Windows/a.md').status).toBe(
            'missing'
        )
        expect(
            resolveWikiLinkTarget(snapshot, 'E:/notes/a.md', '\\\\server\\share\\a.md').status
        ).toBe('missing')
    })

    it('快照不可用 / 空目标 → missing（不抛错）', () => {
        expect(resolveWikiLinkTarget(null, 'E:/notes/a.md', 'b').status).toBe('missing')
        expect(resolveWikiLinkTarget(snapshot, 'E:/notes/a.md', '   ').status).toBe('missing')
    })
})

/* ============================ 3. 快照查找 / 反链 / 摘要 ============================ */

describe('快照查找与反链统计', () => {
    it('findSnapshotFile 按分隔符归一化 + 大小写不敏感匹配', () => {
        const snapshot = createWorkspaceSnapshot()
        expect(findSnapshotFile(snapshot, 'E:/notes/a.md')?.relativePath).toBe('a.md')
        expect(findSnapshotFile(snapshot, 'e:\\NOTES\\A.MD')?.relativePath).toBe('a.md')
        expect(findSnapshotFile(snapshot, 'E:/notes/none.md')).toBeNull()
        expect(findSnapshotFile(null, 'E:/notes/a.md')).toBeNull()
    })

    it('findWikiLinkInSnapshot 优先同 raw + 同位置命中', () => {
        const snapshot = createWorkspaceSnapshot()
        const link = findWikiLinkInSnapshot(snapshot, 'E:/notes/a.md', 1, 4, '[[b]]')
        expect(link?.target).toBe('b')
        expect(link?.resolvedPath).toBe('E:/notes/b.md')
    })

    it('findWikiLinkInSnapshot 行号漂移时回退到「同 raw 且唯一」的记录', () => {
        const snapshot = createWorkspaceSnapshot()
        const link = findWikiLinkInSnapshot(snapshot, 'E:/notes/a.md', 99, 4, '[[b]]')
        expect(link?.target).toBe('b')
    })

    it('findWikiLinkInSnapshot 同 raw 多条或 raw 不存在时返回 null', () => {
        const snapshot = createSnapshot([
            createFile({
                path: 'E:/notes/a.md',
                relativePath: 'a.md',
                title: '源文件',
                links: [
                    { raw: '[[b]]', line: 2, column: 1 },
                    { raw: '[[b]]', line: 5, column: 1 }
                ]
            })
        ])
        expect(findWikiLinkInSnapshot(snapshot, 'E:/notes/a.md', 99, 1, '[[b]]')).toBeNull()
        expect(findWikiLinkInSnapshot(snapshot, 'E:/notes/a.md', 1, 1, '[[x]]')).toBeNull()
    })

    it('countWikiBacklinks 统计指向目标文件的反链数量', () => {
        const snapshot = createWorkspaceSnapshot()
        expect(countWikiBacklinks(snapshot, 'E:/notes/b.md')).toBe(1)
        expect(countWikiBacklinks(snapshot, 'e:\\notes\\B.md')).toBe(1)
        expect(countWikiBacklinks(snapshot, 'E:/notes/sub/c.md')).toBe(0)
        expect(countWikiBacklinks(null, 'E:/notes/b.md')).toBe(0)
    })

    it('normalizeHoverExcerpt 压缩空白、按码点截断、非字符串返回空串', () => {
        expect(normalizeHoverExcerpt('第一行\n第二行\t内容')).toBe('第一行 第二行 内容')
        expect(normalizeHoverExcerpt('😀😀😀', 2)).toBe('😀😀')
        expect(normalizeHoverExcerpt('abc', 0)).toBe('')
        expect(normalizeHoverExcerpt(undefined)).toBe('')
        expect(normalizeHoverExcerpt(123)).toBe('')
        const long = '长'.repeat(WIKI_LINK_HOVER_EXCERPT_MAX_LENGTH + 10)
        expect(Array.from(normalizeHoverExcerpt(long))).toHaveLength(
            WIKI_LINK_HOVER_EXCERPT_MAX_LENGTH
        )
    })
})

/* ============================ 4. 悬停信息构建与格式化 ============================ */

describe('buildWikiLinkHoverInfo 悬停信息', () => {
    const snapshot = createWorkspaceSnapshot()

    it('resolved：给出标题 / 相对路径 / 摘要 / 反链数量', () => {
        const info = buildWikiLinkHoverInfo({
            snapshot,
            sourcePath: 'E:/notes/a.md',
            lineNumber: 1,
            column: 4,
            lineText: '见 [[b]] 完毕'
        })
        expect(info).not.toBeNull()
        expect(info?.status).toBe('resolved')
        expect(info?.target).toBe('b')
        expect(info?.title).toBe('目标笔记')
        expect(info?.relativePath).toBe('b.md')
        expect(info?.excerpt).toBe('目标笔记的摘要内容')
        expect(info?.backlinkCount).toBe(1)
    })

    it('快照中同位置链接记录优先（即便按 target 重解析结果不同）', () => {
        const localSnapshot = createSnapshot([
            createFile({
                path: 'E:/notes/a.md',
                relativePath: 'a.md',
                title: '源文件',
                links: [
                    {
                        target: 'b',
                        raw: '[[b]]',
                        line: 1,
                        column: 3,
                        status: 'ambiguous'
                    }
                ]
            }),
            createFile({ path: 'E:/notes/b.md', relativePath: 'b.md', title: '目标笔记' })
        ])
        const info = buildWikiLinkHoverInfo({
            snapshot: localSnapshot,
            sourcePath: 'E:/notes/a.md',
            lineNumber: 1,
            column: 4,
            lineText: '见 [[b]] 完毕'
        })
        expect(info?.status).toBe('ambiguous')
        expect(info?.title).toBeUndefined()
    })

    it('快照无链接记录时按 target 重新解析（源目录相对）', () => {
        const info = buildWikiLinkHoverInfo({
            snapshot,
            sourcePath: 'E:/notes/sub/d.md',
            lineNumber: 1,
            column: 2,
            lineText: '[[c]]'
        })
        expect(info?.status).toBe('resolved')
        expect(info?.title).toBe('子目录笔记')
        expect(info?.relativePath).toBe('sub/c.md')
    })

    it('目标不存在 / 不唯一时只返回状态与原文', () => {
        const missing = buildWikiLinkHoverInfo({
            snapshot,
            sourcePath: 'E:/notes/a.md',
            lineNumber: 1,
            column: 4,
            lineText: '看 [[nope]]'
        })
        expect(missing?.status).toBe('missing')
        expect(missing?.title).toBeUndefined()

        const ambiguous = buildWikiLinkHoverInfo({
            snapshot,
            sourcePath: 'E:/notes/a.md',
            lineNumber: 1,
            column: 4,
            lineText: '看 [[dup]]'
        })
        expect(ambiguous?.status).toBe('ambiguous')
    })

    it('摘要按 excerptMaxLength 截断；快照无 excerpt 字段时省略', () => {
        const truncated = buildWikiLinkHoverInfo(
            {
                snapshot,
                sourcePath: 'E:/notes/a.md',
                lineNumber: 1,
                column: 4,
                lineText: '[[b]]'
            },
            { excerptMaxLength: 4 }
        )
        expect(truncated?.excerpt).toBe('目标笔记')

        const noExcerpt = buildWikiLinkHoverInfo({
            snapshot,
            sourcePath: 'E:/notes/a.md',
            lineNumber: 1,
            column: 2,
            lineText: '[[c]]'
        })
        expect(noExcerpt?.status).toBe('resolved')
        expect(noExcerpt?.excerpt).toBeUndefined()
    })

    it('快照不可用 / 非链接位置返回 null', () => {
        expect(
            buildWikiLinkHoverInfo({
                snapshot: null,
                sourcePath: 'E:/notes/a.md',
                lineNumber: 1,
                column: 4,
                lineText: '见 [[b]]'
            })
        ).toBeNull()
        expect(
            buildWikiLinkHoverInfo({
                snapshot,
                sourcePath: 'E:/notes/a.md',
                lineNumber: 1,
                column: 1,
                lineText: '见 [[b]]'
            })
        ).toBeNull()
    })
})

describe('formatWikiLinkHoverMarkdown 文案格式化', () => {
    const snapshot = createWorkspaceSnapshot()

    it('resolved：标题 + 相对路径 + 摘要 + 反链数量', () => {
        const info = buildWikiLinkHoverInfo({
            snapshot,
            sourcePath: 'E:/notes/a.md',
            lineNumber: 1,
            column: 4,
            lineText: '见 [[b]] 完毕'
        })
        expect(info).not.toBeNull()
        if (!info) {
            return
        }
        expect(formatWikiLinkHoverMarkdown(info, TEST_LABELS)).toBe(
            '**目标笔记**\n\n`b.md`\n\n目标笔记的摘要内容\n\n反向链接 1 条'
        )
    })

    it('无摘要 / 无反链时省略对应行', () => {
        const info = buildWikiLinkHoverInfo({
            snapshot,
            sourcePath: 'E:/notes/sub/d.md',
            lineNumber: 1,
            column: 2,
            lineText: '[[c]]'
        })
        expect(info).not.toBeNull()
        if (!info) {
            return
        }
        expect(formatWikiLinkHoverMarkdown(info, TEST_LABELS)).toBe('**子目录笔记**\n\n`sub/c.md`')
    })

    it('missing / ambiguous 展示注入的状态文案与链接原文', () => {
        const missing: Parameters<typeof formatWikiLinkHoverMarkdown>[0] = {
            status: 'missing',
            target: 'nope',
            raw: '[[nope]]',
            alias: '',
            heading: '',
            line: 1,
            column: 4
        }
        expect(formatWikiLinkHoverMarkdown(missing, TEST_LABELS)).toBe(
            '**目标不存在**\n\n`[[nope]]`'
        )
        const ambiguous = { ...missing, status: 'ambiguous' as const, raw: '[[dup]]' }
        expect(formatWikiLinkHoverMarkdown(ambiguous, TEST_LABELS)).toBe(
            '**目标不唯一**\n\n`[[dup]]`'
        )
    })

    it('标题中的 Markdown 特殊字符按纯文本转义', () => {
        const info: Parameters<typeof formatWikiLinkHoverMarkdown>[0] = {
            status: 'resolved',
            target: 'star',
            raw: '[[star]]',
            alias: '',
            heading: '',
            line: 1,
            column: 2,
            title: 'a*b',
            relativePath: 'star.md',
            backlinkCount: 0
        }
        expect(formatWikiLinkHoverMarkdown(info, TEST_LABELS)).toContain('**a\\*b**')
    })

    it('默认文案取自既有 i18n 词条（不返回键名）', () => {
        const labels = createDefaultWikiLinkHoverLabels()
        expect(labels.missing.length).toBeGreaterThan(0)
        expect(labels.missing).not.toBe('editorUi.knowledge.statusMissing')
        expect(labels.ambiguous).not.toBe('editorUi.knowledge.statusAmbiguous')
        expect(labels.backlinks(3)).toContain('3')
    })
})

/* ============================ 5. 注册 / 释放 / 快照缓存 ============================ */

describe('registerWikiLinkHover 注册与释放', () => {
    it('注册 markdown HoverProvider 并返回可释放句柄', () => {
        const snapshot = createWorkspaceSnapshot()
        const { api, providers, disposeCount } = createFakeMonaco()
        const editor = createEditor(createModel([]))
        const handle = registerWikiLinkHover(editor, api, {
            loadIndex: async () => okResult(snapshot),
            labels: TEST_LABELS
        })
        expect(handle.isRegistered).toBe(true)
        expect(providers).toHaveLength(1)
        expect(providers[0].selector).toBe('markdown')

        handle.dispose()
        expect(handle.isRegistered).toBe(false)
        expect(disposeCount()).toBe(1)
        // 幂等：重复释放不抛错、不重复 dispose
        expect(() => handle.dispose()).not.toThrow()
        expect(disposeCount()).toBe(1)
    })

    it('同一编辑器重复注册返回同一句柄且只注册一次', () => {
        const snapshot = createWorkspaceSnapshot()
        const { api, providers, disposeCount } = createFakeMonaco()
        const editor = createEditor(createModel([]))
        const options = {
            loadIndex: async () => okResult(snapshot),
            labels: TEST_LABELS
        }
        const first = registerWikiLinkHover(editor, api, options)
        const second = registerWikiLinkHover(editor, api, options)
        expect(second).toBe(first)
        expect(providers).toHaveLength(1)
        first.dispose()
        expect(disposeCount()).toBe(1)
        // 释放后允许重新注册
        const third = registerWikiLinkHover(editor, api, options)
        expect(providers).toHaveLength(2)
        expect(third.isRegistered).toBe(true)
        third.dispose()
    })

    it('悬停命中链接时返回链接范围与 Markdown 内容（首次悬停触发加载）', async () => {
        const snapshot = createWorkspaceSnapshot()
        const { api, providers } = createFakeMonaco()
        const model = createModel(['见 [[b]] 完毕'])
        let loadCalls = 0
        const handle = registerWikiLinkHover(createEditor(model), api, {
            loadIndex: async () => {
                loadCalls += 1
                return okResult(snapshot)
            },
            labels: TEST_LABELS
        })
        const result = await hoverAt(providers[0].provider, model, 1, 4)
        expect(loadCalls).toBe(1)
        expect(result).not.toBeNull()
        expect(result?.range).toEqual({
            startLineNumber: 1,
            startColumn: 3,
            endLineNumber: 1,
            endColumn: 8
        })
        expect(result?.contents[0].value).toBe(
            '**目标笔记**\n\n`b.md`\n\n目标笔记的摘要内容\n\n反向链接 1 条'
        )
        handle.dispose()
    })

    it('默认 TTL 内两次悬停只加载一次快照', async () => {
        const snapshot = createWorkspaceSnapshot()
        const { api, providers } = createFakeMonaco()
        const model = createModel(['[[b]] 与 [[sub/c]]'])
        let loadCalls = 0
        const handle = registerWikiLinkHover(createEditor(model), api, {
            loadIndex: async () => {
                loadCalls += 1
                return okResult(snapshot)
            },
            labels: TEST_LABELS
        })
        const first = await hoverAt(providers[0].provider, model, 1, 2)
        const second = await hoverAt(providers[0].provider, model, 1, 10)
        expect(first).not.toBeNull()
        expect(second).not.toBeNull()
        expect(loadCalls).toBe(1)
        handle.dispose()
    })

    it('snapshotTtlMs=0 时每次悬停都重新加载快照', async () => {
        const snapshot = createWorkspaceSnapshot()
        const { api, providers } = createFakeMonaco()
        const model = createModel(['[[b]] 与 [[sub/c]]'])
        let loadCalls = 0
        const handle = registerWikiLinkHover(createEditor(model), api, {
            loadIndex: async () => {
                loadCalls += 1
                return okResult(snapshot)
            },
            labels: TEST_LABELS,
            snapshotTtlMs: 0
        })
        await hoverAt(providers[0].provider, model, 1, 2)
        await hoverAt(providers[0].provider, model, 1, 10)
        expect(loadCalls).toBe(2)
        handle.dispose()
    })

    it('索引加载失败返回 null，失败冷却期内不重复请求 IPC', async () => {
        const { api, providers } = createFakeMonaco()
        const model = createModel(['[[b]]'])
        let loadCalls = 0
        const handle = registerWikiLinkHover(createEditor(model), api, {
            loadIndex: async () => {
                loadCalls += 1
                throw new Error('索引不可用')
            },
            labels: TEST_LABELS
        })
        await expect(hoverAt(providers[0].provider, model, 1, 4)).resolves.toBeNull()
        await expect(hoverAt(providers[0].provider, model, 1, 4)).resolves.toBeNull()
        expect(loadCalls).toBe(1)
        handle.dispose()
    })

    it('索引返回非成功形态（未打开工作区）时静默返回 null', async () => {
        const { api, providers } = createFakeMonaco()
        const model = createModel(['[[b]]'])
        const handle = registerWikiLinkHover(createEditor(model), api, {
            loadIndex: async () => ({ ok: false, code: 'NO_WORKSPACE' }),
            labels: TEST_LABELS
        })
        await expect(hoverAt(providers[0].provider, model, 1, 4)).resolves.toBeNull()
        handle.dispose()
    })

    it('非 Markdown 模型 / 非链接位置不触发索引加载', async () => {
        const snapshot = createWorkspaceSnapshot()
        const { api, providers } = createFakeMonaco()
        let loadCalls = 0
        const handle = registerWikiLinkHover(createEditor(createModel([])), api, {
            loadIndex: async () => {
                loadCalls += 1
                return okResult(snapshot)
            },
            labels: TEST_LABELS
        })
        const plainModel = createModel(['[[b]]'], 'E:/notes/a.md', 'plaintext')
        await expect(hoverAt(providers[0].provider, plainModel, 1, 4)).resolves.toBeNull()
        const markdownModel = createModel(['普通文本 [[b]]', '见 [[b]] 完毕'])
        // 列 1 不在链接内
        await expect(hoverAt(providers[0].provider, markdownModel, 2, 1)).resolves.toBeNull()
        expect(loadCalls).toBe(0)
        handle.dispose()
    })

    it('释放后 provider 不再返回结果', async () => {
        const snapshot = createWorkspaceSnapshot()
        const { api, providers } = createFakeMonaco()
        const model = createModel(['见 [[b]] 完毕'])
        const handle = registerWikiLinkHover(createEditor(model), api, {
            loadIndex: async () => okResult(snapshot),
            labels: TEST_LABELS
        })
        handle.dispose()
        await expect(hoverAt(providers[0].provider, model, 1, 4)).resolves.toBeNull()
    })

    it('模型 URI 非 file 协议时用编辑器模型路径兜底', async () => {
        const snapshot = createWorkspaceSnapshot()
        const { api, providers } = createFakeMonaco()
        const editorModel = createModel([''], 'E:/notes/a.md')
        const editor = createEditor(editorModel)
        const hoverModel: WikiLinkHoverModelLike = {
            uri: { scheme: 'inmemory', path: '/model/1' },
            getLanguageId: () => 'markdown',
            getLineContent: () => '见 [[b]] 完毕'
        }
        const handle = registerWikiLinkHover(editor, api, {
            loadIndex: async () => okResult(snapshot),
            labels: TEST_LABELS
        })
        const result = await hoverAt(providers[0].provider, hoverModel, 1, 4)
        expect(result?.contents[0].value).toContain('**目标笔记**')
        handle.dispose()
    })

    it('Monaco 能力缺失时返回未注册句柄且释放不抛错', () => {
        const unsupportedApi = {} as unknown as WikiLinkHoverMonacoLike
        const handle = registerWikiLinkHover(createEditor(null), unsupportedApi, {
            labels: TEST_LABELS
        })
        expect(handle.isRegistered).toBe(false)
        expect(() => handle.dispose()).not.toThrow()
    })

    it('未传 labels 时回落到既有 i18n 文案且可正常格式化', async () => {
        const snapshot = createWorkspaceSnapshot()
        const { api, providers } = createFakeMonaco()
        const model = createModel(['见 [[b]] 完毕'])
        const handle = registerWikiLinkHover(createEditor(model), api, {
            loadIndex: async () => okResult(snapshot)
        })
        const result = await hoverAt(providers[0].provider, model, 1, 4)
        expect(result).not.toBeNull()
        expect(result?.contents[0].value).toContain('目标笔记')
        handle.dispose()
    })
})
