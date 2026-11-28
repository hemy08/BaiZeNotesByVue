/**
 * 1.5.7 LLM Wiki L2：MCP 只读工具单测（`src/main/mcp/tools.ts`）
 *
 * 覆盖（对应任务验收「7 个工具只读可用；越权/非法参数被拒」）：
 * 1. 工具清单：恰好 7 个只读工具（无写工具）、inputSchema 结构合法；
 * 2. search_wiki：wiki/ 全文检索（过滤 raw/ 与非 wiki 目录）、大小写/正则/分页；
 * 3. read_page：Markdown + front matter、路径白名单（仅 wiki/、绝对路径/.. 拒绝）；
 * 4. list_pages：分页、子目录过滤、目录清单；
 * 5. read_schema：schema.md 读取 / 缺失时 exists=false；
 * 6. list_tags：wiki/ 标签与计数（数量降序）与分页；
 * 7. get_backlinks：入链（反链）+ 出链（双链图）；
 * 8. read_raw：raw/ 只读（wiki/ 路径拒绝）；
 * 9. 只读/路径边界：绝对路径、`..`、符号链接目录逃逸、超 2 MiB、非文本扩展名、未知参数、
 *    未知工具、无工作区，全部返回结构化 isError 结果且不抛异常。
 *
 * 说明：全部用例在 `os.tmpdir()` 下创建隔离工作区（真实文件 + 真实索引/搜索服务），
 * 不依赖 Electron/appState 之外的运行时；appState.rootPath 是工作区根唯一真源。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('electron', () => ({
    BrowserWindow: class {},
    shell: {}
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import {
    executeMcpTool,
    invalidateMcpWorkspaceCache,
    isMcpToolName,
    listMcpTools,
    MCP_TOOL_COUNT,
    MCP_TOOL_DEFINITIONS
} from '../../src/main/mcp/tools'
import { appState } from '../../src/main/utils/app-state'
import type { McpToolCallResult } from '../../src/main/mcp/tools'

/** 当前用例的隔离工作区根 */
let workspaceRoot = ''

/** 写工作区夹具文件（自动建父目录） */
function writeFixture(relativePath: string, content: string): string {
    const fullPath = path.join(workspaceRoot, relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    return fullPath
}

/** 解析工具返回的 JSON 文本（断言用） */
function readToolPayload(result: McpToolCallResult): Record<string, unknown> {
    expect(result.content).toHaveLength(1)
    expect(result.content[0].type).toBe('text')
    return JSON.parse(result.content[0].text) as Record<string, unknown>
}

beforeEach(() => {
    appState._resetForTesting()
    invalidateMcpWorkspaceCache()
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-mcp-tools-'))
    appState.rootPath = workspaceRoot
    // 基础夹具：wiki 页面（含 front matter/标签/双链）、raw 原始资料、schema.md、
    // 以及一个「wiki 外的同名命中」用于验证 search_wiki 的检索范围过滤
    writeFixture(
        'wiki/topics/alpha.md',
        [
            '---',
            'title: Alpha Topic',
            'tags:',
            '  - topic',
            '  - ai',
            '---',
            '',
            '# Alpha',
            '',
            'needle in alpha',
            'another needle here',
            'Link to [[beta]] page.',
            ''
        ].join('\n')
    )
    writeFixture(
        'wiki/concepts/beta.md',
        ['---', 'title: Beta Concept', 'tags: [topic]', '---', '', '# Beta', ''].join('\n')
    )
    writeFixture('wiki/root-page.md', '# Root page\n\nplain content\n')
    writeFixture('notes/other.md', '# Other\n\nneedle outside wiki\n')
    writeFixture('raw/source.md', '# Raw source\n\nneedle in raw\n')
    writeFixture('schema.md', '# Schema\n\nraw/ read-only\n')
})

afterEach(() => {
    appState._resetForTesting()
    invalidateMcpWorkspaceCache()
    const target = workspaceRoot
    workspaceRoot = ''
    fs.rmSync(target, { recursive: true, force: true, maxRetries: 3 })
})

describe('工具清单（7 个只读工具）', () => {
    it('恰好 7 个工具且名称/顺序固定（无写工具）', () => {
        expect(MCP_TOOL_COUNT).toBe(7)
        expect(listMcpTools()).toBe(MCP_TOOL_DEFINITIONS)
        expect(MCP_TOOL_DEFINITIONS.map((tool) => tool.name)).toEqual([
            'search_wiki',
            'read_page',
            'list_pages',
            'read_schema',
            'list_tags',
            'get_backlinks',
            'read_raw'
        ])
        // 每个工具都有标题/说明/对象型 inputSchema，且不允许额外属性（严格 schema）
        for (const tool of MCP_TOOL_DEFINITIONS) {
            expect(tool.title.length).toBeGreaterThan(0)
            expect(tool.description.length).toBeGreaterThan(0)
            expect(tool.inputSchema.type).toBe('object')
            expect(tool.inputSchema.additionalProperties).toBe(false)
        }
        expect(isMcpToolName('search_wiki')).toBe(true)
        expect(isMcpToolName('ingest_raw')).toBe(false)
    })
})

describe('search_wiki', () => {
    it('只返回 wiki/ 命中（raw/ 与非 wiki 目录不返回），默认分页 limit=20', async () => {
        const payload = readToolPayload(await executeMcpTool('search_wiki', { query: 'needle' }))
        expect(payload.ok).toBe(true)
        expect(payload.total).toBe(2)
        expect(payload.limit).toBe(20)
        expect(payload.offset).toBe(0)
        expect(payload.hasMore).toBe(false)
        expect(payload.truncated).toBe(false)
        const results = payload.results as Array<{ path: string; line: number }>
        expect(results).toHaveLength(2)
        for (const result of results) {
            expect(result.path.startsWith('wiki/')).toBe(true)
        }
    })

    it('分页 limit/offset 生效（limit 1）', async () => {
        const first = readToolPayload(
            await executeMcpTool('search_wiki', { query: 'needle', limit: 1 })
        )
        expect(first.results).toHaveLength(1)
        expect(first.hasMore).toBe(true)
        const second = readToolPayload(
            await executeMcpTool('search_wiki', { query: 'needle', limit: 1, offset: 1 })
        )
        expect(second.results).toHaveLength(1)
        expect(second.hasMore).toBe(false)
        expect((second.results as Array<{ line: number }>)[0].line).not.toBe(
            (first.results as Array<{ line: number }>)[0].line
        )
    })

    it('大小写/正则/非法正则行为与主进程搜索服务同口径', async () => {
        const insensitive = readToolPayload(
            await executeMcpTool('search_wiki', { query: 'NEEDLE' })
        )
        expect(insensitive.total).toBe(2)
        const sensitive = readToolPayload(
            await executeMcpTool('search_wiki', { query: 'NEEDLE', caseSensitive: true })
        )
        expect(sensitive.total).toBe(0)
        const regex = readToolPayload(
            await executeMcpTool('search_wiki', { query: 'needle\\s+in', useRegex: true })
        )
        expect(regex.total).toBe(1)
        const badRegex = readToolPayload(
            await executeMcpTool('search_wiki', { query: '(', useRegex: true })
        )
        expect(badRegex.ok).toBe(false)
        expect(badRegex.code).toBe('INVALID_ARGUMENTS')
    })

    it('非法入参（空查询/未知参数/limit 非法）返回 INVALID_ARGUMENTS', async () => {
        for (const args of [
            {},
            { query: '' },
            { query: '   ' },
            { query: 'needle', limit: 0 },
            { query: 'needle', offset: -1 },
            { query: 'needle', limit: 1.5 },
            { query: 'needle', unknownOption: true }
        ]) {
            const payload = readToolPayload(await executeMcpTool('search_wiki', args))
            expect(payload.ok, JSON.stringify(args)).toBe(false)
            expect(payload.code).toBe('INVALID_ARGUMENTS')
        }
    })
})

describe('read_page', () => {
    it('读取 wiki 页面：原文 + 解析后的 front matter / body', async () => {
        const payload = readToolPayload(
            await executeMcpTool('read_page', { path: 'wiki/topics/alpha.md' })
        )
        expect(payload.ok).toBe(true)
        expect(payload.path).toBe('wiki/topics/alpha.md')
        expect(payload.title).toBe('Alpha Topic')
        expect(payload.hasFrontMatter).toBe(true)
        expect(payload.frontMatter).toEqual({ title: 'Alpha Topic', tags: ['topic', 'ai'] })
        expect(payload.content as string).toContain('another needle here')
        expect(payload.body as string).toContain('# Alpha')
        expect(payload.encoding).toBe('utf-8')
        expect(payload.size as number).toBeGreaterThan(0)
    })

    it('接受 Windows 反斜杠写法（统一归一化为 /）', async () => {
        const payload = readToolPayload(
            await executeMcpTool('read_page', { path: 'wiki\\topics\\alpha.md' })
        )
        expect(payload.ok).toBe(true)
        expect(payload.path).toBe('wiki/topics/alpha.md')
    })

    it('只允许 wiki/ 内相对路径：绝对路径/.. 越界/wiki 外文件全部拒绝', async () => {
        const absolute = readToolPayload(
            await executeMcpTool('read_page', {
                path: path.join(workspaceRoot, 'wiki/topics/alpha.md')
            })
        )
        expect(absolute.code).toBe('INVALID_ARGUMENTS')

        for (const relativePath of [
            '../outside.md',
            'wiki/../raw/source.md',
            'raw/source.md',
            'schema.md'
        ]) {
            const payload = readToolPayload(
                await executeMcpTool('read_page', { path: relativePath })
            )
            expect(payload.ok, relativePath).toBe(false)
            expect(['PATH_DENIED', 'INVALID_ARGUMENTS']).toContain(payload.code)
        }
    })

    it('不存在的页面返回 NOT_FOUND；非文本扩展名返回 UNSUPPORTED_FILE_TYPE', async () => {
        const missing = readToolPayload(
            await executeMcpTool('read_page', { path: 'wiki/missing.md' })
        )
        expect(missing.code).toBe('NOT_FOUND')

        writeFixture('wiki/data.json', '{}')
        const unsupported = readToolPayload(
            await executeMcpTool('read_page', { path: 'wiki/data.json' })
        )
        expect(unsupported.code).toBe('UNSUPPORTED_FILE_TYPE')
    })

    it('超过 2 MiB 的页面返回 FILE_TOO_LARGE（不整块读取进 IPC/结果）', async () => {
        writeFixture('wiki/big.md', 'x'.repeat(2 * 1024 * 1024 + 10))
        const payload = readToolPayload(await executeMcpTool('read_page', { path: 'wiki/big.md' }))
        expect(payload.ok).toBe(false)
        expect(payload.code).toBe('FILE_TOO_LARGE')
    })

    it('未知参数被拒绝（严格 schema，避免 Agent 误用静默生效）', async () => {
        const payload = readToolPayload(
            await executeMcpTool('read_page', { path: 'wiki/root-page.md', extra: 1 })
        )
        expect(payload.code).toBe('INVALID_ARGUMENTS')
    })
})

describe('list_pages', () => {
    it('返回 wiki/ 页面树（分页 + 目录清单）', async () => {
        const payload = readToolPayload(await executeMcpTool('list_pages', {}))
        expect(payload.ok).toBe(true)
        expect(payload.total).toBe(3)
        expect(payload.directories).toEqual(['', 'concepts', 'topics'])
        const pages = payload.pages as Array<{ path: string; title: string }>
        expect(pages).toHaveLength(3)
        expect(pages.map((page) => page.path)).toEqual([
            'wiki/concepts/beta.md',
            'wiki/root-page.md',
            'wiki/topics/alpha.md'
        ])
        expect(pages[2].title).toBe('Alpha Topic')
    })

    it('分页与子目录过滤生效', async () => {
        const firstPage = readToolPayload(await executeMcpTool('list_pages', { limit: 2 }))
        expect(firstPage.pages).toHaveLength(2)
        expect(firstPage.hasMore).toBe(true)

        const filtered = readToolPayload(
            await executeMcpTool('list_pages', { directory: 'topics' })
        )
        expect(filtered.total).toBe(1)
        expect((filtered.pages as Array<{ path: string }>)[0].path).toBe('wiki/topics/alpha.md')

        const invalidDirectory = readToolPayload(
            await executeMcpTool('list_pages', { directory: '../raw' })
        )
        expect(invalidDirectory.code).toBe('INVALID_ARGUMENTS')
    })
})

describe('read_schema', () => {
    it('读取工作区根 schema.md', async () => {
        const payload = readToolPayload(await executeMcpTool('read_schema', {}))
        expect(payload.ok).toBe(true)
        expect(payload.exists).toBe(true)
        expect(payload.path).toBe('schema.md')
        expect(payload.content as string).toContain('raw/ read-only')
    })

    it('schema.md 缺失时返回 exists=false（非错误，供 Agent 提示初始化）', async () => {
        fs.rmSync(path.join(workspaceRoot, 'schema.md'))
        const payload = readToolPayload(await executeMcpTool('read_schema', {}))
        expect(payload.ok).toBe(true)
        expect(payload.exists).toBe(false)
        expect(payload.hint as string).toContain('初始化')
    })

    it('拒绝未知参数', async () => {
        const payload = readToolPayload(await executeMcpTool('read_schema', { path: 'x' }))
        expect(payload.code).toBe('INVALID_ARGUMENTS')
    })
})

describe('list_tags', () => {
    it('统计 wiki/ 标签并按数量降序（含分页）', async () => {
        const payload = readToolPayload(await executeMcpTool('list_tags', {}))
        expect(payload.ok).toBe(true)
        expect(payload.total).toBe(2)
        const tags = payload.tags as Array<{ tag: string; count: number }>
        expect(tags).toEqual([
            {
                tag: 'topic',
                count: 2,
                files: ['wiki/concepts/beta.md', 'wiki/topics/alpha.md']
            },
            { tag: 'ai', count: 1, files: ['wiki/topics/alpha.md'] }
        ])

        const paginated = readToolPayload(await executeMcpTool('list_tags', { limit: 1 }))
        expect(paginated.tags).toHaveLength(1)
        expect(paginated.hasMore).toBe(true)
        expect((paginated.tags as Array<{ tag: string }>)[0].tag).toBe('topic')
    })
})

describe('get_backlinks', () => {
    it('返回反链（谁链接到目标页）', async () => {
        const payload = readToolPayload(
            await executeMcpTool('get_backlinks', { path: 'wiki/concepts/beta.md' })
        )
        expect(payload.ok).toBe(true)
        expect(payload.backlinkCount).toBe(1)
        expect(payload.backlinks).toEqual([
            {
                path: 'wiki/topics/alpha.md',
                title: 'Alpha Topic',
                line: expect.any(Number),
                column: expect.any(Number)
            }
        ])
    })

    it('返回出链（目标页链接到哪些页面，含解析状态）', async () => {
        const payload = readToolPayload(
            await executeMcpTool('get_backlinks', { path: 'wiki/topics/alpha.md' })
        )
        expect(payload.ok).toBe(true)
        expect(payload.backlinkCount).toBe(0)
        const links = payload.links as Array<{
            target: string
            status: string
            resolvedPath?: string
        }>
        expect(links).toHaveLength(1)
        expect(links[0].target).toBe('beta')
        expect(links[0].status).toBe('resolved')
        expect(links[0].resolvedPath).toBe('wiki/concepts/beta.md')
    })

    it('wiki 外路径拒绝；索引快照中不存在的页面返回 NOT_FOUND', async () => {
        const denied = readToolPayload(
            await executeMcpTool('get_backlinks', { path: 'notes/other.md' })
        )
        expect(denied.code).toBe('PATH_DENIED')

        // 先用 list_pages 建立索引缓存（快照不含随后新增的页面），验证 NOT_FOUND 分支
        await executeMcpTool('list_pages', {})
        writeFixture('wiki/not-indexed.md', '# 新页面\n')
        const notFound = readToolPayload(
            await executeMcpTool('get_backlinks', { path: 'wiki/not-indexed.md' })
        )
        expect(notFound.code).toBe('NOT_FOUND')
    })
})

describe('read_raw', () => {
    it('只读 raw/ 原始资料', async () => {
        const payload = readToolPayload(await executeMcpTool('read_raw', { path: 'raw/source.md' }))
        expect(payload.ok).toBe(true)
        expect(payload.path).toBe('raw/source.md')
        expect(payload.content as string).toContain('needle in raw')
    })

    it('只允许 raw/ 内路径：wiki 页面/越界/非文本扩展名/不存在均拒绝', async () => {
        const wikiPath = readToolPayload(
            await executeMcpTool('read_raw', { path: 'wiki/topics/alpha.md' })
        )
        expect(wikiPath.code).toBe('PATH_DENIED')

        const traversal = readToolPayload(
            await executeMcpTool('read_raw', { path: 'raw/../wiki/topics/alpha.md' })
        )
        expect(traversal.code).toBe('PATH_DENIED')

        writeFixture('raw/shot.png', 'not an image')
        const unsupported = readToolPayload(
            await executeMcpTool('read_raw', { path: 'raw/shot.png' })
        )
        expect(unsupported.code).toBe('UNSUPPORTED_FILE_TYPE')

        const missing = readToolPayload(await executeMcpTool('read_raw', { path: 'raw/none.md' }))
        expect(missing.code).toBe('NOT_FOUND')
    })
})

describe('只读边界与失败口径', () => {
    it('工具定义不包含任何写工具（L3 的 ingest/apply 未注册）', () => {
        const names = MCP_TOOL_DEFINITIONS.map((tool) => tool.name)
        for (const forbidden of ['ingest_raw', 'apply_ingest', 'write_page', 'delete_page']) {
            expect(names).not.toContain(forbidden)
        }
    })

    it('未知工具返回 INVALID_ARGUMENTS 的 isError 结果（不抛异常）', async () => {
        const result = await executeMcpTool('ingest_raw', {})
        expect(result.isError).toBe(true)
        expect(readToolPayload(result).code).toBe('INVALID_ARGUMENTS')
    })

    it('arguments 非对象返回 INVALID_ARGUMENTS', async () => {
        for (const args of ['x', 42, [1, 2]]) {
            const result = await executeMcpTool('search_wiki', args)
            expect(result.isError).toBe(true)
            expect(readToolPayload(result).code).toBe('INVALID_ARGUMENTS')
        }
    })

    it('未打开工作区时 7 个工具都返回结构化 NO_WORKSPACE（不抛异常）', async () => {
        appState.rootPath = ''
        invalidateMcpWorkspaceCache()
        const cases: Array<[string, Record<string, unknown>]> = [
            ['search_wiki', { query: 'needle' }],
            ['read_page', { path: 'wiki/root-page.md' }],
            ['list_pages', {}],
            ['read_schema', {}],
            ['list_tags', {}],
            ['get_backlinks', { path: 'wiki/root-page.md' }],
            ['read_raw', { path: 'raw/source.md' }]
        ]
        for (const [tool, args] of cases) {
            const payload = readToolPayload(await executeMcpTool(tool, args))
            expect(payload.ok, tool).toBe(false)
            expect(payload.code, tool).toBe('NO_WORKSPACE')
        }
    })
})
