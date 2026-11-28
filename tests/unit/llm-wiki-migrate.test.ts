/**
 * 1.5.7 迁移批次：主进程文件迁移服务单测（`src/main/utils/llm-wiki-migrate.ts`）
 *
 * 覆盖：
 * 1. 格式归类 / 忽略目录 / 忽略文件 / 格式统计汇总；
 * 2. 扫描：根校验失败、格式统计、跳过 raw//wiki//隐藏目录/node_modules/schema.md/符号链接、
 *    Markdown 链接影响（相对链接、图片、Wiki 链接、锚点/远程/代码围栏不计）；
 * 3. 迁移：复制（原文件保留）/ 移动（原文件消失）/ 格式过滤 / 同名冲突跳过 / 逐项失败；
 *    路径越界、符号链接目录逃逸、跨盘 EXDEV 回退、日志写入（status/entries/无内容）；
 * 4. 回滚：copy 删除复制体、move 移回原位并清理空目录、冲突检测（目标被修改/缺失）、
 *    指定日志 id、最近日志选择（跳过已回滚）、日志损坏/工作区不匹配/路径篡改拒绝；
 * 5. 日志目录不可用 / 写日志失败时迁移仍成功但 logId 为 null（回滚不可用）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import type { PathLike } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => path.join(os.tmpdir(), 'baize-migrate-userdata')) },
    BrowserWindow: class {},
    shell: {}
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import {
    extractMarkdownLinkTargets,
    formatLlmWikiMigratableFile,
    formatLlmWikiMigrationLogTimestamp,
    inspectLlmWikiWorkspaceStatus,
    isSkippedLlmWikiMigrationDirectory,
    isSkippedLlmWikiMigrationFile,
    LLM_WIKI_MIGRATION_ERROR_INVALID_PAYLOAD,
    LLM_WIKI_MIGRATION_ERROR_LOG_INVALID,
    LLM_WIKI_MIGRATION_ERROR_LOG_NOT_FOUND,
    LLM_WIKI_MIGRATION_ERROR_LOG_ROOT_MISMATCH,
    LLM_WIKI_MIGRATION_ERROR_LOG_UNAVAILABLE,
    LLM_WIKI_MIGRATION_ERROR_NO_LOG,
    LLM_WIKI_MIGRATION_ERROR_NO_WORKSPACE,
    LLM_WIKI_MIGRATION_ERROR_RAW_UNAVAILABLE,
    LLM_WIKI_MIGRATION_ERROR_ROOT_UNAVAILABLE,
    LLM_WIKI_MIGRATION_REASON,
    migrateLlmWikiFiles,
    normalizeLlmWikiMigrateRequest,
    normalizeLlmWikiRollbackRequest,
    rollbackLlmWikiMigration,
    scanLlmWikiMigratableFiles,
    scanLlmWikiLinkImpacts,
    summarizeLlmWikiMigrationFormats
} from '../../src/main/utils/llm-wiki-migrate'

let workspaceRoot = ''
let logDir = ''

/** 固定时间源：日志 id 可预测，便于断言 */
function fixedNow(): Date {
    return new Date(2026, 10, 28, 12, 0, 0, 123)
}

beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-migrate-ws-'))
    logDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-migrate-log-'))
})

afterEach(async () => {
    vi.restoreAllMocks()
    await fs.rm(workspaceRoot, { recursive: true, force: true })
    await fs.rm(logDir, { recursive: true, force: true })
})

/** 在工作区写入文件（自动创建父目录） */
async function writeWorkspaceFile(relativePath: string, content = 'content'): Promise<string> {
    const filePath = path.join(workspaceRoot, ...relativePath.split('/'))
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf8')
    return filePath
}

/** 读取迁移日志（唯一 json） */
async function readOnlyLog(): Promise<Record<string, unknown>> {
    const names = (await fs.readdir(logDir)).filter((name) => name.endsWith('.json'))
    expect(names).toHaveLength(1)
    return JSON.parse(await fs.readFile(path.join(logDir, names[0]!), 'utf8')) as Record<
        string,
        unknown
    >
}

/** 便携的「目录符号链接」（Windows 用 junction，无需管理员权限） */
async function tryCreateDirectoryLink(targetDir: string, linkPath: string): Promise<boolean> {
    try {
        await fs.symlink(targetDir, linkPath, 'junction')
        return true
    } catch {
        return false
    }
}

describe('格式归类与忽略口径', () => {
    it('按扩展名归类 5 种格式（大小写不敏感）', () => {
        expect(formatLlmWikiMigratableFile('a.md')).toBe('markdown')
        expect(formatLlmWikiMigratableFile('A.MARKDOWN')).toBe('markdown')
        expect(formatLlmWikiMigratableFile('pic.PNG')).toBe('image')
        expect(formatLlmWikiMigratableFile('doc.pdf')).toBe('pdf')
        expect(formatLlmWikiMigratableFile('page.htm')).toBe('html')
        expect(formatLlmWikiMigratableFile('note.txt')).toBe('text')
        expect(formatLlmWikiMigratableFile('archive.zip')).toBeNull()
        expect(formatLlmWikiMigratableFile('noext')).toBeNull()
    })

    it('忽略目录：raw/wiki、隐藏目录、依赖与凭据目录', () => {
        for (const name of [
            'raw',
            'wiki',
            '.git',
            '.obsidian',
            'node_modules',
            '.ssh',
            '.vscode'
        ]) {
            expect(isSkippedLlmWikiMigrationDirectory(name), name).toBe(true)
        }
        for (const name of ['notes', 'images', 'docs']) {
            expect(isSkippedLlmWikiMigrationDirectory(name), name).toBe(false)
        }
    })

    it('忽略文件：schema.md（大小写不敏感）', () => {
        expect(isSkippedLlmWikiMigrationFile('schema.md')).toBe(true)
        expect(isSkippedLlmWikiMigrationFile('SCHEMA.MD')).toBe(true)
        expect(isSkippedLlmWikiMigrationFile('other.md')).toBe(false)
    })

    it('格式统计汇总固定 5 类且合计正确', () => {
        const stats = summarizeLlmWikiMigrationFormats([
            { format: 'markdown', bytes: 10 },
            { format: 'markdown', bytes: 20 },
            { format: 'image', bytes: 30 }
        ])
        expect(stats.map((item) => item.id)).toEqual(['markdown', 'image', 'pdf', 'html', 'text'])
        expect(stats.find((item) => item.id === 'markdown')).toEqual({
            id: 'markdown',
            count: 2,
            bytes: 30
        })
        expect(stats.reduce((sum, item) => sum + item.count, 0)).toBe(3)
    })

    it('日志时间戳格式为 Windows 文件名安全的 YYYYMMDD-HHmmss-SSS', () => {
        expect(formatLlmWikiMigrationLogTimestamp(fixedNow())).toBe('20261128-120000-123')
    })
})

describe('inspectLlmWikiWorkspaceStatus：工作区初始化状态检测', () => {
    it('根不可用（空/相对/不存在/非目录）时全部 false（保守回退弹窗）', async () => {
        const empty = { initialized: false, hasRaw: false, hasWiki: false, hasSchema: false }
        await expect(inspectLlmWikiWorkspaceStatus({ rootPath: '' })).resolves.toEqual(empty)
        await expect(inspectLlmWikiWorkspaceStatus({ rootPath: 'relative/path' })).resolves.toEqual(
            empty
        )
        await expect(
            inspectLlmWikiWorkspaceStatus({ rootPath: path.join(workspaceRoot, 'missing') })
        ).resolves.toEqual(empty)

        const fileRoot = await writeWorkspaceFile('not-a-dir.md', '# x')
        await expect(inspectLlmWikiWorkspaceStatus({ rootPath: fileRoot })).resolves.toEqual(empty)
    })

    it('三项均不存在：initialized=false', async () => {
        await writeWorkspaceFile('notes/a.md', '# a')
        await expect(inspectLlmWikiWorkspaceStatus({ rootPath: workspaceRoot })).resolves.toEqual({
            initialized: false,
            hasRaw: false,
            hasWiki: false,
            hasSchema: false
        })
    })

    it('raw/ + wiki/ + schema.md 齐全：逐项 true 且 initialized=true', async () => {
        await fs.mkdir(path.join(workspaceRoot, 'raw'), { recursive: true })
        await fs.mkdir(path.join(workspaceRoot, 'wiki'), { recursive: true })
        await writeWorkspaceFile('schema.md', '# 约定')
        await expect(inspectLlmWikiWorkspaceStatus({ rootPath: workspaceRoot })).resolves.toEqual({
            initialized: true,
            hasRaw: true,
            hasWiki: true,
            hasSchema: true
        })
    })

    it('仅存在部分结构：initialized 为「任一存在」，且按目录/普通文件类型精确判定', async () => {
        // 仅 wiki/ 目录：已初始化
        await fs.mkdir(path.join(workspaceRoot, 'wiki'), { recursive: true })
        await expect(inspectLlmWikiWorkspaceStatus({ rootPath: workspaceRoot })).resolves.toEqual({
            initialized: true,
            hasRaw: false,
            hasWiki: true,
            hasSchema: false
        })

        // raw 位置是普通文件、schema.md 位置是目录：两者都不算存在（只认类型匹配）
        await writeWorkspaceFile('raw', 'not a dir')
        await fs.mkdir(path.join(workspaceRoot, 'schema.md'))
        await expect(inspectLlmWikiWorkspaceStatus({ rootPath: workspaceRoot })).resolves.toEqual({
            initialized: true,
            hasRaw: false,
            hasWiki: true,
            hasSchema: false
        })
    })

    it('缺省 rootPath 读取 appState.rootPath（未打开工作区时为 false）', async () => {
        const { appState } = await import('../../src/main/utils/app-state')
        appState._resetForTesting()
        await expect(inspectLlmWikiWorkspaceStatus()).resolves.toEqual({
            initialized: false,
            hasRaw: false,
            hasWiki: false,
            hasSchema: false
        })
        appState.rootPath = workspaceRoot
        await fs.mkdir(path.join(workspaceRoot, 'raw'), { recursive: true })
        await expect(inspectLlmWikiWorkspaceStatus()).resolves.toMatchObject({
            initialized: true,
            hasRaw: true
        })
        appState._resetForTesting()
    })
})

describe('scanLlmWikiMigratableFiles：根校验与格式统计', () => {
    it('无工作区 / 非法根 / 不存在的根返回结构化失败', async () => {
        const noWorkspace = await scanLlmWikiMigratableFiles({ rootPath: '' })
        expect(noWorkspace.ok).toBe(false)
        expect(noWorkspace.error).toBe(LLM_WIKI_MIGRATION_ERROR_NO_WORKSPACE)

        const invalid = await scanLlmWikiMigratableFiles({ rootPath: 'relative/path' })
        expect(invalid.ok).toBe(false)

        const missing = await scanLlmWikiMigratableFiles({
            rootPath: path.join(workspaceRoot, 'missing')
        })
        expect(missing.ok).toBe(false)
        expect(missing.error).toBe(LLM_WIKI_MIGRATION_ERROR_ROOT_UNAVAILABLE)

        const fileRoot = await writeWorkspaceFile('not-a-dir.md', '# x')
        const notDirectory = await scanLlmWikiMigratableFiles({ rootPath: fileRoot })
        expect(notDirectory.ok).toBe(false)
        expect(notDirectory.error).toBe(LLM_WIKI_MIGRATION_ERROR_ROOT_UNAVAILABLE)
    })

    it('按格式统计数量与字节，跳过 raw/wiki/隐藏目录/node_modules/schema.md', async () => {
        await writeWorkspaceFile('a.md', 'aaaa')
        await writeWorkspaceFile('notes/b.markdown', 'bb')
        await writeWorkspaceFile('notes/img/pic.png', 'png-bytes')
        await writeWorkspaceFile('doc.pdf', 'pdf')
        await writeWorkspaceFile('page.html', '<p>')
        await writeWorkspaceFile('note.txt', 'txt')
        await writeWorkspaceFile('schema.md', '# schema')
        await writeWorkspaceFile('raw/already.md', 'raw')
        await writeWorkspaceFile('wiki/compiled.md', 'wiki')
        await writeWorkspaceFile('.hidden/secret.md', 'secret')
        await writeWorkspaceFile('node_modules/pkg/readme.md', 'dep')
        await writeWorkspaceFile('archive.zip', 'zip')

        const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })

        expect(result.ok).toBe(true)
        expect(result.total).toBe(6)
        const byId = new Map(result.formats.map((item) => [item.id, item]))
        expect(byId.get('markdown')?.count).toBe(2)
        expect(byId.get('markdown')?.bytes).toBe(6)
        expect(byId.get('image')?.count).toBe(1)
        expect(byId.get('pdf')?.count).toBe(1)
        expect(byId.get('html')?.count).toBe(1)
        expect(byId.get('text')?.count).toBe(1)
    })

    it('Markdown 链接影响：相对链接/图片/Wiki 链接命中可迁移文件，锚点/远程/代码围栏忽略', async () => {
        await writeWorkspaceFile('a.md', '# a')
        await writeWorkspaceFile('images/pic.png', 'png')
        await writeWorkspaceFile(
            'index.md',
            [
                '# 索引',
                '[相对链接](a.md)',
                '![图片](./images/pic.png)',
                '[[b]]',
                '[锚点](#section)',
                '[远程](https://example.com/x.md)',
                '[绝对](/a.md)',
                '```',
                '[代码块内链接](a.md)',
                '```'
            ].join('\n')
        )
        await writeWorkspaceFile('b.md', '# b')

        const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })

        expect(result.ok).toBe(true)
        expect(result.links.total).toBe(3)
        expect(result.links.items.map((item) => `${item.file}:${item.line}`)).toEqual([
            'index.md:2',
            'index.md:3',
            'index.md:4'
        ])
        expect(result.links.items[0]).toMatchObject({ targetFile: 'a.md', format: 'markdown' })
        expect(result.links.items[1]).toMatchObject({
            targetFile: 'images/pic.png',
            format: 'image'
        })
        expect(result.links.items[2]).toMatchObject({ targetFile: 'b.md', format: 'markdown' })
    })

    it('链接影响明细按上限截断时 total 仍为完整计数', async () => {
        const links = Array.from({ length: 5 }, (_, index) => `[链接${index}](target${index}.md)`)
        await writeWorkspaceFile('block.md', links.join('\n'))
        for (let index = 0; index < 5; index += 1) {
            await writeWorkspaceFile(`target${index}.md`, '# t')
        }
        const files = [
            {
                absolutePath: path.join(workspaceRoot, 'block.md'),
                relativePath: 'block.md',
                format: 'markdown' as const,
                bytes: 100
            },
            ...Array.from({ length: 5 }, (_, index) => ({
                absolutePath: path.join(workspaceRoot, `target${index}.md`),
                relativePath: `target${index}.md`,
                format: 'markdown' as const,
                bytes: 3
            }))
        ]
        const summary = await scanLlmWikiLinkImpacts(files)
        expect(summary.total).toBe(5)
        expect(summary.items).toHaveLength(5)
    })

    it('链接影响明细超过 200 条时截断，但 total 保持完整计数', async () => {
        const links: string[] = []
        for (let index = 0; index < 201; index += 1) {
            await writeWorkspaceFile(`targets/t${index}.md`, '# t')
            links.push(`[链接${index}](targets/t${index}.md)`)
        }
        await writeWorkspaceFile('block.md', links.join('\n'))

        const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })

        expect(result.ok).toBe(true)
        expect(result.links.total).toBe(201)
        expect(result.links.items).toHaveLength(200)
    })

    it('超过 1 MiB 的 Markdown 不参与链接解析（仅统计格式）', async () => {
        await writeWorkspaceFile('big.md', 'x'.repeat(1024 * 1024 + 10))
        await writeWorkspaceFile('target.md', '# t')
        // 大文件内的链接不参与解析
        const bigPath = path.join(workspaceRoot, 'big.md')
        await fs.appendFile(bigPath, '\n[链接](target.md)', 'utf8')

        const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })

        expect(result.ok).toBe(true)
        expect(result.links.total).toBe(0)
    })

    it('目录深度超过上限时标记 truncated（不再深入）', async () => {
        const segments = Array.from({ length: 34 }, (_, index) => `d${index}`)
        await writeWorkspaceFile([...segments, 'deep.md'].join('/'), '# deep')

        const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })

        expect(result.ok).toBe(true)
        expect(result.truncated).toBe(true)
    })

    it('工作区内符号链接目录被跳过（junction 不支持则跳过）', async () => {
        const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-migrate-link-'))
        await fs.writeFile(path.join(outsideDir, 'outside.md'), '# outside', 'utf8')
        const linkCreated = await tryCreateDirectoryLink(
            outsideDir,
            path.join(workspaceRoot, 'linked-dir')
        )
        try {
            await writeWorkspaceFile('normal.md', '# normal')
            const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })
            expect(result.ok).toBe(true)
            if (linkCreated) {
                expect(result.total).toBe(1)
                expect(result.formats.find((item) => item.id === 'markdown')?.count).toBe(1)
            }
        } finally {
            await fs.rm(outsideDir, { recursive: true, force: true })
        }
    })

    it('提取 Markdown 链接目标：行号正确、尖括号与标题语法兼容', () => {
        const content = [
            '# 标题',
            '[a](<has space.md>)',
            '[b](b.md "标题")',
            '[[wiki 目标|别名]]',
            '![img](img.png)'
        ].join('\n')
        const links = extractMarkdownLinkTargets(content).map(({ line, target, wiki }) => ({
            line,
            target,
            wiki
        }))
        expect(links).toEqual([
            { line: 2, target: 'has space.md', wiki: false },
            { line: 3, target: 'b.md', wiki: false },
            { line: 4, target: 'wiki 目标|别名', wiki: true },
            { line: 5, target: 'img.png', wiki: false }
        ])
    })
})

describe('migrateLlmWikiFiles：复制 / 移动 / 冲突 / 日志', () => {
    it('非法载荷返回结构化失败（mode/formats 校验）', async () => {
        for (const payload of [
            null,
            {},
            { mode: 'copy' },
            { mode: 'x', formats: ['markdown'] },
            { mode: 'copy', formats: [] },
            { mode: 'copy', formats: ['zip'] }
        ]) {
            const result = await migrateLlmWikiFiles(payload, {
                rootPath: workspaceRoot,
                logDir
            })
            expect(result.ok, JSON.stringify(payload)).toBe(false)
            expect(result.error).toBe(LLM_WIKI_MIGRATION_ERROR_INVALID_PAYLOAD)
            expect(result.mode).toBeNull()
        }
    })

    it('无工作区时返回结构化失败', async () => {
        const result = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: '' }
        )
        expect(result.ok).toBe(false)
        expect(result.error).toBe(LLM_WIKI_MIGRATION_ERROR_NO_WORKSPACE)
    })

    it('复制：保持相对目录结构、原文件保留、目标已存在同名文件跳过、日志记录映射且无内容', async () => {
        await writeWorkspaceFile('notes/a.md', 'AAAA')
        await writeWorkspaceFile('notes/sub/b.md', 'BB')
        await writeWorkspaceFile('notes/conflict.md', 'NEW')
        // raw/ 已存在同名文件 → 必须跳过不覆盖
        await writeWorkspaceFile('raw/notes/conflict.md', 'OLD')

        const result = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )

        expect(result.ok).toBe(true)
        expect(result.mode).toBe('copy')
        expect(result.copied.map((file) => file.relativePath).sort()).toEqual([
            'notes/a.md',
            'notes/sub/b.md'
        ])
        expect(result.moved).toHaveLength(0)
        expect(result.skipped).toEqual([
            { path: 'notes/conflict.md', reason: LLM_WIKI_MIGRATION_REASON.targetExists }
        ])
        // 原文件保留 + raw 副本存在
        await expect(fs.readFile(path.join(workspaceRoot, 'notes/a.md'), 'utf8')).resolves.toBe(
            'AAAA'
        )
        await expect(
            fs.readFile(path.join(workspaceRoot, 'raw/notes/sub/b.md'), 'utf8')
        ).resolves.toBe('BB')
        await expect(
            fs.readFile(path.join(workspaceRoot, 'raw/notes/conflict.md'), 'utf8')
        ).resolves.toBe('OLD')

        const log = await readOnlyLog()
        expect(result.logId).toBe(log.id)
        expect(log).toMatchObject({
            version: 1,
            mode: 'copy',
            status: 'applied',
            rootPath: workspaceRoot
        })
        const entries = log.entries as Array<Record<string, unknown>>
        expect(entries).toHaveLength(2)
        expect(entries[0]).toMatchObject({
            relativePath: 'notes/a.md',
            sourcePath: path.join(workspaceRoot, 'notes/a.md'),
            targetPath: path.join(workspaceRoot, 'raw/notes/a.md'),
            bytes: 4,
            action: 'copy'
        })
        expect(entries[0]!.targetSize).toBe(4)
        expect(typeof entries[0]!.targetMtimeMs).toBe('number')
        expect(JSON.stringify(log)).not.toContain('AAAA')
    })

    it('移动：原文件消失、按格式过滤、只迁移选中格式', async () => {
        await writeWorkspaceFile('a.md', 'md')
        await writeWorkspaceFile('pic.png', 'png')

        const result = await migrateLlmWikiFiles(
            { mode: 'move', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )

        expect(result.ok).toBe(true)
        expect(result.moved.map((file) => file.relativePath)).toEqual(['a.md'])
        await expect(fs.stat(path.join(workspaceRoot, 'a.md'))).rejects.toThrow()
        await expect(fs.readFile(path.join(workspaceRoot, 'raw/a.md'), 'utf8')).resolves.toBe('md')
        // 未选中的图片保持原位、未被复制
        await expect(fs.readFile(path.join(workspaceRoot, 'pic.png'), 'utf8')).resolves.toBe('png')
        await expect(fs.stat(path.join(workspaceRoot, 'raw/pic.png'))).rejects.toThrow()
    })

    it('raw 目录不可用（同名文件占位）时返回结构化失败', async () => {
        await writeWorkspaceFile('raw', 'not a directory')
        const result = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir }
        )
        expect(result.ok).toBe(false)
        expect(result.error).toBeTruthy()
    })

    it('日志目录不可用：迁移仍成功但 logId 为 null（回滚不可用）', async () => {
        await writeWorkspaceFile('a.md', 'a')
        const result = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir: null }
        )
        expect(result.ok).toBe(true)
        expect(result.copied).toHaveLength(1)
        expect(result.logId).toBeNull()
    })

    it('日志目录写入失败（路径被文件占用）：迁移仍成功、logId 为 null', async () => {
        await writeWorkspaceFile('a.md', 'a')
        const logFile = path.join(workspaceRoot, 'log-file')
        await fs.writeFile(logFile, 'x', 'utf8')
        const result = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir: logFile }
        )
        expect(result.ok).toBe(true)
        expect(result.logId).toBeNull()
    })

    it('源文件为符号链接时拒绝迁移并记录失败（不支持符号链接的平台跳过）', async () => {
        const target = path.join(workspaceRoot, 'target.md')
        await fs.writeFile(target, 'target', 'utf8')
        const linkPath = path.join(workspaceRoot, 'link.md')
        let linkCreated = false
        try {
            await fs.symlink(target, linkPath, 'file')
            linkCreated = true
        } catch {
            // 无符号链接权限（Windows 默认）：按平台跳过符号链接分支
        }
        if (linkCreated) {
            const result = await migrateLlmWikiFiles(
                { mode: 'copy', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir }
            )
            // 符号链接在扫描阶段即被跳过（不会进入迁移清单），普通文件 target.md 正常迁移
            expect(result.ok).toBe(true)
            expect(result.copied.map((file) => file.relativePath)).toEqual(['target.md'])
        } else {
            // Windows 无符号链接权限：仅验证扫描不崩溃
            const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })
            expect(result.ok).toBe(true)
        }
    })

    it('raw/ 内预置符号链接目录时拒绝目标越界（junction 不支持则跳过）', async () => {
        const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-migrate-outside-'))
        await fs.writeFile(path.join(outsideDir, 'x.md'), 'outside', 'utf8')
        await fs.mkdir(path.join(workspaceRoot, 'raw'), { recursive: true })
        // 源文件位于普通目录 safe-link/，其 raw/ 目标父目录被预置为符号链接 → 必须拒绝
        await writeWorkspaceFile('safe-link/x.md', 'inside')
        const linkCreated = await tryCreateDirectoryLink(
            outsideDir,
            path.join(workspaceRoot, 'raw', 'safe-link')
        )
        try {
            const result = await migrateLlmWikiFiles(
                { mode: 'copy', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir }
            )
            expect(result.ok).toBe(true)
            if (!linkCreated) {
                return
            }
            const failed = result.failed.find((issue) => issue.path === 'safe-link/x.md')
            expect(failed?.reason).toBe(LLM_WIKI_MIGRATION_REASON.targetEscape)
        } finally {
            await fs.rm(outsideDir, { recursive: true, force: true })
        }
    })

    it('跨盘 EXDEV：rename 失败时回退「独占复制 + 删除源文件」', async () => {
        await writeWorkspaceFile('a.md', 'cross-device')
        const renameSpy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(
            Object.assign(new Error('EXDEV: cross-device link not permitted'), {
                code: 'EXDEV'
            })
        )
        try {
            const result = await migrateLlmWikiFiles(
                { mode: 'move', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir, now: fixedNow }
            )
            expect(result.ok).toBe(true)
            expect(result.moved.map((file) => file.relativePath)).toEqual(['a.md'])
            await expect(fs.stat(path.join(workspaceRoot, 'a.md'))).rejects.toThrow()
            await expect(fs.readFile(path.join(workspaceRoot, 'raw/a.md'), 'utf8')).resolves.toBe(
                'cross-device'
            )
        } finally {
            renameSpy.mockRestore()
        }
    })

    it('跨盘 EXDEV 且删除源文件失败：清理复制体并按失败记录', async () => {
        await writeWorkspaceFile('a.md', 'x')
        vi.spyOn(fs, 'rename').mockRejectedValueOnce(
            Object.assign(new Error('EXDEV'), { code: 'EXDEV' })
        )
        vi.spyOn(fs, 'unlink').mockRejectedValueOnce(new Error('EPERM: denied'))
        const result = await migrateLlmWikiFiles(
            { mode: 'move', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir }
        )
        expect(result.ok).toBe(true)
        expect(result.failed).toHaveLength(1)
        expect(result.failed[0]!.reason).toContain('跨盘移动删除源文件失败')
        // 半成品复制体已清理，源文件仍在
        await expect(fs.readFile(path.join(workspaceRoot, 'a.md'), 'utf8')).resolves.toBe('x')
        await expect(fs.stat(path.join(workspaceRoot, 'raw/a.md'))).rejects.toThrow()
    })

    it('迁移过程中每 25 个成功条目持久化一次 in-progress 日志（崩溃可恢复）', async () => {
        for (let index = 0; index < 26; index += 1) {
            await writeWorkspaceFile(`bulk/f${index}.md`, `content-${index}`)
        }
        const result = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        expect(result.ok).toBe(true)
        expect(result.copied).toHaveLength(26)
        const log = await readOnlyLog()
        expect(log.status).toBe('applied')
        expect(log.entries).toHaveLength(26)
    })

    it('同一时间戳的两次迁移写日志时自动追加序号（不覆盖既有日志）', async () => {
        await writeWorkspaceFile('a.md', 'a')
        const first = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        await writeWorkspaceFile('b.md', 'b')
        const second = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        expect(first.logId).toBe('20261128-120000-123')
        expect(second.logId).toBe('20261128-120000-123-1')
        const logs = (await fs.readdir(logDir)).filter((name) => name.endsWith('.json'))
        expect(logs).toHaveLength(2)
    })

    it('缺省日志目录（userData/migrations）：迁移成功后写入默认目录', async () => {
        await writeWorkspaceFile('a.md', 'a')
        const { app } = await import('electron')
        const userData = path.join(os.tmpdir(), `baize-migrate-userdata-${Date.now()}`)
        vi.mocked(app.getPath).mockReturnValue(userData)
        try {
            const result = await migrateLlmWikiFiles(
                { mode: 'copy', formats: ['markdown'] },
                { rootPath: workspaceRoot, now: fixedNow }
            )
            expect(result.ok).toBe(true)
            expect(result.logId).toBe('20261128-120000-123')
            const names = await fs.readdir(path.join(userData, 'migrations'))
            expect(names).toContain('20261128-120000-123.json')
        } finally {
            await fs.rm(userData, { recursive: true, force: true })
        }
    })

    it('userData 不可解析（app.getPath 抛错）：迁移成功但 logId 为 null', async () => {
        await writeWorkspaceFile('a.md', 'a')
        const { app } = await import('electron')
        vi.mocked(app.getPath).mockImplementationOnce(() => {
            throw new Error('userData unavailable')
        })
        const result = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot }
        )
        expect(result.ok).toBe(true)
        expect(result.logId).toBeNull()
    })

    it('跨盘 EXDEV 且复制失败：记录失败且源文件保留', async () => {
        await writeWorkspaceFile('a.md', 'x')
        vi.spyOn(fs, 'rename').mockRejectedValueOnce(
            Object.assign(new Error('EXDEV'), { code: 'EXDEV' })
        )
        vi.spyOn(fs, 'copyFile').mockRejectedValueOnce(new Error('ENOSPC'))
        const result = await migrateLlmWikiFiles(
            { mode: 'move', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir }
        )
        expect(result.ok).toBe(true)
        expect(result.failed[0]!.reason).toContain('跨盘移动复制失败')
        await expect(fs.readFile(path.join(workspaceRoot, 'a.md'), 'utf8')).resolves.toBe('x')
    })

    it('扫描/统计失败降级：目录读取失败只记录警告并跳过', async () => {
        await writeWorkspaceFile('a.md', 'a')
        vi.spyOn(fs, 'readdir').mockRejectedValueOnce(new Error('EACCES'))
        const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })
        expect(result.ok).toBe(true)
        expect(result.total).toBe(0)
    })
})

describe('rollbackLlmWikiMigration：复制 / 移动回滚与冲突', () => {
    it('复制回滚：删除 raw 复制体、保留原文件、日志标记 rolled-back', async () => {
        await writeWorkspaceFile('notes/a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        expect(migration.ok).toBe(true)

        const result = await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )

        expect(result.ok).toBe(true)
        expect(result.mode).toBe('copy')
        expect(result.restored).toBe(1)
        expect(result.failed).toEqual([])
        await expect(fs.readFile(path.join(workspaceRoot, 'notes/a.md'), 'utf8')).resolves.toBe('A')
        await expect(fs.stat(path.join(workspaceRoot, 'raw/notes/a.md'))).rejects.toThrow()
        const log = await readOnlyLog()
        expect(log.status).toBe('rolled-back')
        expect(typeof log.rolledBackAt).toBe('string')
    })

    it('移动回滚：移回原路径并清理 raw 空目录', async () => {
        await writeWorkspaceFile('notes/deep/a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'move', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        expect(migration.moved).toHaveLength(1)
        await expect(fs.stat(path.join(workspaceRoot, 'notes/deep/a.md'))).rejects.toThrow()

        const result = await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )

        expect(result.ok).toBe(true)
        expect(result.restored).toBe(1)
        await expect(
            fs.readFile(path.join(workspaceRoot, 'notes/deep/a.md'), 'utf8')
        ).resolves.toBe('A')
        // raw/notes/deep 空目录被清理（raw 根保留）
        await expect(fs.stat(path.join(workspaceRoot, 'raw/notes'))).rejects.toThrow()
        await expect(fs.stat(path.join(workspaceRoot, 'raw'))).resolves.toBeTruthy()
    })

    it('回滚冲突检测：复制体在迁移后被修改 → 跳过并逐项报告，不误删', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        // 模拟迁移后 raw/ 副本被外部修改（内容变化 → 大小/mtime 变化）
        await fs.writeFile(path.join(workspaceRoot, 'raw/a.md'), 'MODIFIED-CONTENT', 'utf8')

        const result = await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )

        expect(result.ok).toBe(false)
        expect(result.restored).toBe(0)
        expect(result.failed).toEqual([
            { path: 'a.md', reason: LLM_WIKI_MIGRATION_REASON.targetModified }
        ])
        await expect(fs.readFile(path.join(workspaceRoot, 'raw/a.md'), 'utf8')).resolves.toBe(
            'MODIFIED-CONTENT'
        )
    })

    it('回滚冲突检测：目标缺失 / 原位置被占用（move）逐项报告', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'move', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        // 原位置被用户后来创建的同名文件占用
        await fs.writeFile(path.join(workspaceRoot, 'a.md'), 'LATER', 'utf8')

        const result = await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        expect(result.ok).toBe(false)
        expect(result.failed[0]).toEqual({
            path: 'a.md',
            reason: LLM_WIKI_MIGRATION_REASON.restoreConflict
        })
        // 不覆盖用户后来创建的文件，raw 中文件保留
        await expect(fs.readFile(path.join(workspaceRoot, 'a.md'), 'utf8')).resolves.toBe('LATER')
        await expect(fs.readFile(path.join(workspaceRoot, 'raw/a.md'), 'utf8')).resolves.toBe('A')

        // 有冲突时日志保持 applied（用户处理后仍可重试回滚剩余条目）
        const movedLog = await readOnlyLog()
        expect(movedLog.status).toBe('applied')
    })

    it('缺省回滚最近一次迁移；已回滚的日志被跳过', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const first = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        await rollbackLlmWikiMigration({}, { rootPath: workspaceRoot, logDir, now: fixedNow })

        // 第二次迁移（时间戳不同，日志按名称倒序选最新）
        await fs.writeFile(path.join(workspaceRoot, 'b.md'), 'B', 'utf8')
        const second = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: () => new Date(2026, 10, 28, 12, 0, 1, 0) }
        )
        expect(first.logId).not.toBe(second.logId)

        const result = await rollbackLlmWikiMigration({}, { rootPath: workspaceRoot, logDir })
        expect(result.ok).toBe(true)
        expect(result.logId).toBe(second.logId)
        // 第二次迁移覆盖 a.md 与 b.md 两个文件
        expect(result.restored).toBe(2)
    })

    it('无可用日志 / 指定日志不存在 / 日志损坏 / 工作区不匹配返回结构化失败', async () => {
        const noLog = await rollbackLlmWikiMigration({}, { rootPath: workspaceRoot, logDir })
        expect(noLog.ok).toBe(false)
        expect(noLog.error).toBe(LLM_WIKI_MIGRATION_ERROR_NO_LOG)

        const missing = await rollbackLlmWikiMigration(
            { logId: '20260101-000000-000' },
            { rootPath: workspaceRoot, logDir }
        )
        expect(missing.ok).toBe(false)
        expect(missing.error).toBe(LLM_WIKI_MIGRATION_ERROR_LOG_NOT_FOUND)

        const invalidId = await rollbackLlmWikiMigration(
            { logId: '../escape' },
            { rootPath: workspaceRoot, logDir }
        )
        expect(invalidId.ok).toBe(false)
        expect(invalidId.error).toBe(LLM_WIKI_MIGRATION_ERROR_LOG_NOT_FOUND)

        const corrupted = path.join(logDir, '20260101-000000-001.json')
        await fs.writeFile(corrupted, 'not-json', 'utf8')
        const corruptedResult = await rollbackLlmWikiMigration(
            {},
            { rootPath: workspaceRoot, logDir }
        )
        expect(corruptedResult.ok).toBe(false)
        expect(corruptedResult.error).toBe(LLM_WIKI_MIGRATION_ERROR_NO_LOG)

        // 合法结构但工作区不匹配
        await writeWorkspaceFile('a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        const otherRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-migrate-other-'))
        try {
            const mismatch = await rollbackLlmWikiMigration(
                { logId: migration.logId },
                { rootPath: otherRoot, logDir }
            )
            expect(mismatch.ok).toBe(false)
            expect(mismatch.error).toBe(LLM_WIKI_MIGRATION_ERROR_LOG_ROOT_MISMATCH)
        } finally {
            await fs.rm(otherRoot, { recursive: true, force: true })
        }
    })

    it('日志被篡改（目标路径越界）时拒绝该条目，不越界删除/移动', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-migrate-tamper-'))
        const outsideFile = path.join(outside, 'victim.txt')
        await fs.writeFile(outsideFile, 'victim', 'utf8')
        try {
            const logPath = path.join(logDir, `${migration.logId}.json`)
            const record = JSON.parse(await fs.readFile(logPath, 'utf8')) as {
                entries: Array<Record<string, unknown>>
            }
            record.entries[0]!.targetPath = outsideFile
            await fs.writeFile(logPath, JSON.stringify(record, null, 2), 'utf8')

            const result = await rollbackLlmWikiMigration(
                { logId: migration.logId },
                { rootPath: workspaceRoot, logDir }
            )
            expect(result.ok).toBe(false)
            expect(result.failed[0]).toEqual({
                path: 'a.md',
                reason: LLM_WIKI_MIGRATION_REASON.logPathInvalid
            })
            await expect(fs.readFile(outsideFile, 'utf8')).resolves.toBe('victim')
        } finally {
            await fs.rm(outside, { recursive: true, force: true })
        }
    })

    it('复制回滚：目标缺失逐项报告；目标被替换为目录时按非普通文件报告', async () => {
        await writeWorkspaceFile('a.md', 'A')
        await writeWorkspaceFile('b.md', 'B')
        const migration = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        expect(migration.copied).toHaveLength(2)
        await fs.rm(path.join(workspaceRoot, 'raw/a.md'))
        await fs.rm(path.join(workspaceRoot, 'raw/b.md'))
        await fs.mkdir(path.join(workspaceRoot, 'raw/b.md'))

        const result = await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir }
        )
        expect(result.ok).toBe(false)
        expect(result.failed).toEqual([
            { path: 'a.md', reason: LLM_WIKI_MIGRATION_REASON.targetMissing },
            { path: 'b.md', reason: LLM_WIKI_MIGRATION_REASON.targetNotRegular }
        ])
    })

    it('复制回滚删除失败：记录 failed 且不标记 rolled-back', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        vi.spyOn(fs, 'unlink').mockRejectedValueOnce(new Error('EPERM: denied'))
        const result = await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir }
        )
        expect(result.ok).toBe(false)
        expect(result.failed[0]!.reason).toContain('删除复制体失败')
        const log = await readOnlyLog()
        expect(log.status).toBe('applied')
    })

    it('移动回滚失败分支：创建原目录失败 / 移回失败', async () => {
        await writeWorkspaceFile('notes/a.md', 'A')
        const first = await migrateLlmWikiFiles(
            { mode: 'move', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        const mkdirSpy = vi.spyOn(fs, 'mkdir').mockRejectedValueOnce(new Error('EACCES'))
        const mkdirFail = await rollbackLlmWikiMigration(
            { logId: first.logId },
            { rootPath: workspaceRoot, logDir }
        )
        mkdirSpy.mockRestore()
        expect(mkdirFail.ok).toBe(false)
        expect(mkdirFail.failed[0]!.reason).toContain('创建原目录失败')

        const renameSpy = vi.spyOn(fs, 'rename').mockRejectedValueOnce(new Error('EPERM'))
        const renameFail = await rollbackLlmWikiMigration(
            { logId: first.logId },
            { rootPath: workspaceRoot, logDir }
        )
        renameSpy.mockRestore()
        expect(renameFail.ok).toBe(false)
        expect(renameFail.failed[0]!.reason).toContain('移回原位置失败')
    })

    it('日志版本不匹配视为损坏（按无可用日志处理）', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        const logPath = path.join(logDir, `${migration.logId}.json`)
        const record = JSON.parse(await fs.readFile(logPath, 'utf8')) as Record<string, unknown>
        record.version = 99
        await fs.writeFile(logPath, JSON.stringify(record), 'utf8')
        const result = await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir }
        )
        expect(result.ok).toBe(false)
        expect(result.error).toBe(LLM_WIKI_MIGRATION_ERROR_LOG_NOT_FOUND)
    })

    it('回滚参数非法 / 无工作区 / 日志目录不可用返回结构化失败', async () => {
        const invalid = await rollbackLlmWikiMigration(
            { logId: 42 },
            { rootPath: workspaceRoot, logDir }
        )
        expect(invalid.ok).toBe(false)
        expect(invalid.error).toBeTruthy()

        const nonObject = await rollbackLlmWikiMigration('bad', { rootPath: workspaceRoot, logDir })
        expect(nonObject.ok).toBe(false)

        const noWorkspace = await rollbackLlmWikiMigration({}, { rootPath: '', logDir })
        expect(noWorkspace.ok).toBe(false)
        expect(noWorkspace.error).toBe(LLM_WIKI_MIGRATION_ERROR_NO_WORKSPACE)

        const noLogDir = await rollbackLlmWikiMigration(
            {},
            { rootPath: workspaceRoot, logDir: null }
        )
        expect(noLogDir.ok).toBe(false)
        expect(noLogDir.error).toBe(LLM_WIKI_MIGRATION_ERROR_LOG_UNAVAILABLE)
    })

    it('重复回滚同一日志：已回滚日志返回结构化失败', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir }
        )
        const second = await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir }
        )
        expect(second.ok).toBe(false)
        expect(second.error).toBe(LLM_WIKI_MIGRATION_ERROR_LOG_INVALID)
    })

    it('移动日志残留 in-progress（崩溃场景）也可回滚已记录条目', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'move', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        // 模拟崩溃：把日志状态改回 in-progress
        const logPath = path.join(logDir, `${migration.logId}.json`)
        const record = JSON.parse(await fs.readFile(logPath, 'utf8')) as Record<string, unknown>
        record.status = 'in-progress'
        await fs.writeFile(logPath, JSON.stringify(record, null, 2), 'utf8')

        const result = await rollbackLlmWikiMigration({}, { rootPath: workspaceRoot, logDir })
        expect(result.ok).toBe(true)
        expect(result.restored).toBe(1)
        await expect(fs.readFile(path.join(workspaceRoot, 'a.md'), 'utf8')).resolves.toBe('A')
    })
})

describe('迁移单文件异常分支（路径/权限/IO 错误结构化）', () => {
    it('源文件 lstat 失败 / 不是普通文件 → failed 记录且不中断整批', async () => {
        await writeWorkspaceFile('a.md', 'A')
        await writeWorkspaceFile('b.md', 'B')
        const realLstat = fs.lstat.bind(fs)
        let call = 0
        const lstatSpy = vi.spyOn(fs, 'lstat').mockImplementation(async (target: PathLike) => {
            call += 1
            if (call === 1) {
                throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
            }
            if (call === 2) {
                return { isSymbolicLink: () => false, isFile: () => false } as never
            }
            return realLstat(target)
        })
        try {
            const result = await migrateLlmWikiFiles(
                { mode: 'copy', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir }
            )
            expect(result.ok).toBe(true)
            expect(result.failed).toEqual(
                expect.arrayContaining([
                    { path: 'a.md', reason: LLM_WIKI_MIGRATION_REASON.sourceMissing },
                    { path: 'b.md', reason: LLM_WIKI_MIGRATION_REASON.sourceNotFile }
                ])
            )
        } finally {
            lstatSpy.mockRestore()
        }
    })

    it('创建目标目录失败 / 检查目标文件失败 → failed 记录', async () => {
        await writeWorkspaceFile('nested/a.md', 'A')
        const realMkdir = fs.mkdir.bind(fs)
        const mkdirSpy = vi.spyOn(fs, 'mkdir').mockImplementation(async (target, options) => {
            if (String(target).includes(`${path.sep}raw${path.sep}nested`)) {
                throw new Error('EACCES: denied')
            }
            return realMkdir(target as string, options as never) as never
        })
        try {
            const result = await migrateLlmWikiFiles(
                { mode: 'copy', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir }
            )
            expect(result.failed[0]!.reason).toContain('创建目标目录失败')
        } finally {
            mkdirSpy.mockRestore()
        }

        await writeWorkspaceFile('x.md', 'X')
        await fs.mkdir(path.join(workspaceRoot, 'raw'), { recursive: true })
        const realLstat = fs.lstat.bind(fs)
        const lstatSpy = vi.spyOn(fs, 'lstat').mockImplementation(async (target: PathLike) => {
            if (String(target).includes(`${path.sep}raw${path.sep}x.md`)) {
                throw Object.assign(new Error('EACCES'), { code: 'EACCES' })
            }
            return realLstat(target)
        })
        try {
            const result = await migrateLlmWikiFiles(
                { mode: 'copy', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir }
            )
            expect(result.failed.find((issue) => issue.path === 'x.md')?.reason).toContain(
                '检查目标文件失败'
            )
        } finally {
            lstatSpy.mockRestore()
        }
    })

    it('复制遇到同名竞态（EEXIST）→ 跳过；复制底层字符串异常 → 复制失败文案归一化', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const copySpy = vi
            .spyOn(fs, 'copyFile')
            .mockRejectedValueOnce(Object.assign(new Error('EEXIST'), { code: 'EEXIST' }))
        try {
            const result = await migrateLlmWikiFiles(
                { mode: 'copy', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir }
            )
            expect(result.skipped).toEqual([
                { path: 'a.md', reason: LLM_WIKI_MIGRATION_REASON.targetExists }
            ])
        } finally {
            copySpy.mockRestore()
        }

        const stringSpy = vi.spyOn(fs, 'copyFile').mockRejectedValueOnce('boom-string' as never)
        try {
            const result = await migrateLlmWikiFiles(
                { mode: 'copy', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir }
            )
            expect(result.failed).toEqual([{ path: 'a.md', reason: '复制失败：boom-string' }])
        } finally {
            stringSpy.mockRestore()
        }
    })

    it('移动 rename EPERM → 同名跳过；rename 其他错误 → 移动失败', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const epermSpy = vi
            .spyOn(fs, 'rename')
            .mockRejectedValueOnce(Object.assign(new Error('EPERM'), { code: 'EPERM' }))
        try {
            const result = await migrateLlmWikiFiles(
                { mode: 'move', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir }
            )
            expect(result.skipped).toEqual([
                { path: 'a.md', reason: LLM_WIKI_MIGRATION_REASON.targetExists }
            ])
        } finally {
            epermSpy.mockRestore()
        }

        const eaccesSpy = vi
            .spyOn(fs, 'rename')
            .mockRejectedValueOnce(Object.assign(new Error('EACCES'), { code: 'EACCES' }))
        try {
            const result = await migrateLlmWikiFiles(
                { mode: 'move', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir }
            )
            expect(result.failed[0]!.reason).toContain('移动失败')
        } finally {
            eaccesSpy.mockRestore()
        }
    })

    it('跨盘 EXDEV 且删除源/清理复制体均失败：保留源文件并记录失败', async () => {
        await writeWorkspaceFile('a.md', 'A')
        vi.spyOn(fs, 'rename').mockRejectedValueOnce(
            Object.assign(new Error('EXDEV'), { code: 'EXDEV' })
        )
        vi.spyOn(fs, 'unlink').mockRejectedValue(new Error('EPERM: denied'))
        const result = await migrateLlmWikiFiles(
            { mode: 'move', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir }
        )
        expect(result.failed[0]!.reason).toContain('跨盘移动删除源文件失败')
        await expect(fs.readFile(path.join(workspaceRoot, 'a.md'), 'utf8')).resolves.toBe('A')
    })

    it('目标指纹读取失败时按未知记录（-1），回滚仍可执行', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const realStat = fs.stat.bind(fs)
        const statSpy = vi.spyOn(fs, 'stat').mockImplementation(async (target: PathLike) => {
            if (String(target).includes(`${path.sep}raw${path.sep}a.md`)) {
                throw new Error('EPERM')
            }
            return realStat(target)
        })
        let migration
        try {
            migration = await migrateLlmWikiFiles(
                { mode: 'copy', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir, now: fixedNow }
            )
        } finally {
            statSpy.mockRestore()
        }
        expect(migration.ok).toBe(true)
        const logPath = path.join(logDir, `${migration.logId}.json`)
        const record = JSON.parse(await fs.readFile(logPath, 'utf8')) as {
            entries: Array<Record<string, unknown>>
        }
        expect(record.entries[0]!.targetSize).toBe(-1)
        expect(record.entries[0]!.targetMtimeMs).toBe(-1)

        const result = await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir }
        )
        expect(result.ok).toBe(true)
        expect(result.restored).toBe(1)
    })

    it('工作区根 realpath 解析失败 → ROOT_UNAVAILABLE', async () => {
        const realpathSpy = vi.spyOn(fs, 'realpath').mockRejectedValueOnce(new Error('ENOENT'))
        try {
            const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })
            expect(result.ok).toBe(false)
            expect(result.error).toBe(LLM_WIKI_MIGRATION_ERROR_ROOT_UNAVAILABLE)
        } finally {
            realpathSpy.mockRestore()
        }
    })

    it('扫描单文件 stat 失败 / 目录真实路径越界 → 跳过对应文件', async () => {
        await writeWorkspaceFile('bad.md', 'bad')
        await writeWorkspaceFile('good.md', 'good')
        const realStat = fs.stat.bind(fs)
        const statSpy = vi.spyOn(fs, 'stat').mockImplementation(async (target: PathLike) => {
            if (String(target).endsWith(`${path.sep}bad.md`)) {
                throw new Error('EACCES')
            }
            return realStat(target)
        })
        try {
            const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })
            expect(result.total).toBe(1)
        } finally {
            statSpy.mockRestore()
        }

        await fs.mkdir(path.join(workspaceRoot, 'sneaky'), { recursive: true })
        const realRealpath = fs.realpath.bind(fs)
        const realpathSpy = vi
            .spyOn(fs, 'realpath')
            .mockImplementation(async (target: PathLike) => {
                if (String(target).endsWith(`${path.sep}sneaky`)) {
                    return os.tmpdir()
                }
                return realRealpath(target)
            })
        try {
            const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })
            expect(result.ok).toBe(true)
        } finally {
            realpathSpy.mockRestore()
        }
    })
})

describe('链接解析补充分支', () => {
    it('锚点/查询串/绝对路径/协议/非法转义/Wiki 空目标与协议目标均不计入影响', async () => {
        await writeWorkspaceFile('a.md', 'A')
        await writeWorkspaceFile(
            'rich.md',
            [
                '[锚点](#section)',
                '[查询](a.md?x=1#frag)',
                '[绝对](/a.md)',
                '[反斜杠](\\\\server\\share\\a.md)',
                '[协议](mailto:user@example.com)',
                '[非法转义](%E0%A4%A)',
                '[[#only-anchor]]',
                '[[https://example.com]]'
            ].join('\n')
        )
        const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })
        expect(result.ok).toBe(true)
        // 查询串链接指向 a.md → 计入 1；其余均忽略
        expect(result.links.total).toBe(1)
        expect(result.links.items[0]!.target).toContain('a.md?x=1')
    })

    it('Wiki 链接路径不命中时回退按文件名词干匹配', async () => {
        await writeWorkspaceFile('b.md', 'B')
        await writeWorkspaceFile('index.md', '[[deep/b]]')
        const result = await scanLlmWikiMigratableFiles({ rootPath: workspaceRoot })
        expect(result.links.total).toBe(1)
        expect(result.links.items[0]!.targetFile).toBe('b.md')
    })

    it('链接扫描读取文件失败：跳过该文件并继续（不中断）', async () => {
        const summary = await scanLlmWikiLinkImpacts([
            {
                absolutePath: path.join(workspaceRoot, 'missing.md'),
                relativePath: 'missing.md',
                format: 'markdown',
                bytes: 10
            }
        ])
        expect(summary.total).toBe(0)
        expect(summary.items).toEqual([])
    })
})

describe('操作日志健壮性', () => {
    it('日志创建写入失败（非 EEXIST）→ 迁移成功但 logId 为 null', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const writeSpy = vi
            .spyOn(fs, 'writeFile')
            .mockRejectedValueOnce(Object.assign(new Error('ENOSPC'), { code: 'ENOSPC' }))
        try {
            const result = await migrateLlmWikiFiles(
                { mode: 'copy', formats: ['markdown'] },
                { rootPath: workspaceRoot, logDir }
            )
            expect(result.ok).toBe(true)
            expect(result.logId).toBeNull()
        } finally {
            writeSpy.mockRestore()
        }
    })

    it('日志更新失败（rename 失败 + 临时文件清理失败）不影响迁移结果', async () => {
        await writeWorkspaceFile('a.md', 'A')
        vi.spyOn(fs, 'rename').mockRejectedValue(new Error('EPERM'))
        vi.spyOn(fs, 'unlink').mockRejectedValue(new Error('EPERM'))
        const result = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        expect(result.ok).toBe(true)
        expect(result.logId).toBe('20261128-120000-123')
        // 日志停留在 in-progress（崩溃可恢复语义）：仍可回滚
        vi.restoreAllMocks()
        const rollback = await rollbackLlmWikiMigration(
            { logId: result.logId },
            { rootPath: workspaceRoot, logDir }
        )
        // 最终更新失败：日志停留在 in-progress 且条目未落盘 → 回滚无条目可恢复（不误删）
        expect(rollback.ok).toBe(true)
        expect(rollback.restored).toBe(0)
    })

    it('日志 JSON 为 null / 条目结构非法时安全降级', async () => {
        await writeWorkspaceFile('a.md', 'A')
        await fs.writeFile(path.join(logDir, '20260101-000000-000.json'), 'null', 'utf8')
        const noLog = await rollbackLlmWikiMigration({}, { rootPath: workspaceRoot, logDir })
        expect(noLog.error).toBe(LLM_WIKI_MIGRATION_ERROR_NO_LOG)

        const migration = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        const logPath = path.join(logDir, `${migration.logId}.json`)
        const record = JSON.parse(await fs.readFile(logPath, 'utf8')) as Record<string, unknown>
        record.formats = 'not-array'
        record.skipped = 'not-array'
        record.failed = 'not-array'
        record.updatedAt = 42
        record.entries = [
            null,
            'junk',
            { relativePath: 'a.md' },
            {
                relativePath: 'a.md',
                sourcePath: path.join(workspaceRoot, 'a.md'),
                targetPath: path.join(workspaceRoot, 'raw/a.md')
            }
        ]
        await fs.writeFile(logPath, JSON.stringify(record), 'utf8')

        const result = await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir }
        )
        expect(result.ok).toBe(true)
        expect(result.restored).toBe(1)
    })

    it('日志目录不可读取（路径为普通文件）→ 回滚返回 NO_LOG', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const logFile = path.join(workspaceRoot, 'logs-as-file')
        await fs.writeFile(logFile, 'x', 'utf8')
        const result = await rollbackLlmWikiMigration(
            {},
            { rootPath: workspaceRoot, logDir: logFile }
        )
        expect(result.ok).toBe(false)
        expect(result.error).toBe(LLM_WIKI_MIGRATION_ERROR_NO_LOG)
    })

    it('移动回滚：原目录真实路径越界 → 逐项报告 targetEscape', async () => {
        await writeWorkspaceFile('notes/a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'move', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        const realRealpath = fs.realpath.bind(fs)
        const realpathSpy = vi
            .spyOn(fs, 'realpath')
            .mockImplementation(async (target: PathLike) => {
                if (String(target).endsWith(`${path.sep}notes`)) {
                    return os.tmpdir()
                }
                return realRealpath(target)
            })
        try {
            const result = await rollbackLlmWikiMigration(
                { logId: migration.logId },
                { rootPath: workspaceRoot, logDir }
            )
            expect(result.ok).toBe(false)
            expect(result.failed[0]!.reason).toBe(LLM_WIKI_MIGRATION_REASON.targetEscape)
        } finally {
            realpathSpy.mockRestore()
        }
    })
})

describe('归一化辅助函数', () => {
    it('normalizeLlmWikiMigrateRequest：去重 + 白名单过滤 + 非法返回 null', () => {
        expect(
            normalizeLlmWikiMigrateRequest({
                mode: 'move',
                formats: ['markdown', 'markdown', 'pdf', 'zip', 42]
            })
        ).toEqual({ mode: 'move', formats: ['markdown', 'pdf'] })
        expect(normalizeLlmWikiMigrateRequest({ mode: 'move', formats: [] })).toBeNull()
        expect(normalizeLlmWikiMigrateRequest({ mode: 'delete', formats: ['pdf'] })).toBeNull()
    })

    it('normalizeLlmWikiRollbackRequest：缺省/空 logId 归一化为 {}', () => {
        expect(normalizeLlmWikiRollbackRequest(undefined)).toEqual({})
        expect(normalizeLlmWikiRollbackRequest(null)).toEqual({})
        expect(normalizeLlmWikiRollbackRequest({})).toEqual({})
        expect(normalizeLlmWikiRollbackRequest({ logId: '  ' })).toBeNull()
        expect(normalizeLlmWikiRollbackRequest({ logId: 'abc' })).toEqual({ logId: 'abc' })
        expect(normalizeLlmWikiRollbackRequest(42)).toBeNull()
    })

    it('raw 目录被删除后回滚返回 RAW_UNAVAILABLE', async () => {
        await writeWorkspaceFile('a.md', 'A')
        const migration = await migrateLlmWikiFiles(
            { mode: 'copy', formats: ['markdown'] },
            { rootPath: workspaceRoot, logDir, now: fixedNow }
        )
        await fs.rm(path.join(workspaceRoot, 'raw'), { recursive: true, force: true })
        const result = await rollbackLlmWikiMigration(
            { logId: migration.logId },
            { rootPath: workspaceRoot, logDir }
        )
        expect(result.ok).toBe(false)
        expect(result.error).toBe(LLM_WIKI_MIGRATION_ERROR_RAW_UNAVAILABLE)
    })
})
