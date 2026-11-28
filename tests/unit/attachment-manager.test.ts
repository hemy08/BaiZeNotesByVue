/**
 * B5 附件管理主进程服务单测（`src/main/utils/attachment-manager.ts`，不启动 Electron）
 *
 * 覆盖口径：
 * - 审计：根校验、全部/部分引用、缺失引用、忽略目录、非附件扩展名、文件/目录符号链接、
 *   深度上限、附件数上限（truncated）、索引未解析来源（保守排除）、只读性；
 * - 回收站：载荷校验、越界/相对路径/目录/不存在/笔记正文/仍被引用、成功/失败/混合、
 *   累计大小上限、重复项、默认 shell.trashItem 分支；
 * - 重命名：根/路径/名称校验、冲突、两阶段事务（改名失败不改引用、写回失败清单）、
 *   引用更新（多来源/`./`/尖括号/标题/`#fragment`/百分号编码）、代码块与行内代码跳过、
 *   BOM/CRLF/GBK 原编码写回、无扩展名归一化、大小写改名、引用上限。
 *
 * 全部用例使用 `os.tmpdir()` 下独立 `baize-attachment-*` 临时目录，afterEach 清理。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as iconv from 'iconv-lite'

/** Electron shell 桩：只有回收站通道会被本服务使用 */
const electronMocks = vi.hoisted(() => ({ trashItem: vi.fn() }))

/** 工作区索引替身控制：覆盖「索引不可用/超限/构建异常」等难以构造的分支 */
const wsIndexControl = vi.hoisted(() => ({
    snapshotOverride: null as unknown,
    shouldThrow: false
}))

vi.mock('electron', () => ({
    app: { getPath: () => '' },
    BrowserWindow: class MockBrowserWindow {},
    shell: electronMocks
}))
// logger 模块顶层会创建真实日志文件；单测统一替空，避免写盘与状态栏依赖
vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))
// 默认委托真实索引实现；仅当用例设置 override/shouldThrow 时替换（其余常量仍取真源）
vi.mock('../../src/main/utils/workspace-index', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/main/utils/workspace-index')>()
    return {
        ...actual,
        buildWorkspaceIndex: async (indexRootPath: string) => {
            if (wsIndexControl.shouldThrow) {
                throw new Error('索引构建失败')
            }
            if (wsIndexControl.snapshotOverride !== null) {
                return wsIndexControl.snapshotOverride
            }
            return actual.buildWorkspaceIndex(indexRootPath)
        }
    }
})

import {
    MAX_ATTACHMENT_TRASH_BATCH,
    auditAttachments,
    renameAttachment,
    trashAttachments
} from '../../src/main/utils/attachment-manager'
import { MAX_WORKSPACE_INDEX_FILES } from '../../src/main/utils/workspace-index'
// 1.5.7 LLM Wiki L1（T1.3）：注入工作区模式，验证 raw/ 只读守卫的附件变更分支
import { setSystemSettingProvider } from '../../src/main/utils/providers'
import { SYSTEM_SETTING_FALLBACK } from '../../src/shared/constants/system-defaults'
import type { SystemSetting } from '../../src/shared/types/system'
import type { WorkspaceIndexSnapshot } from '../../src/shared/types/workspace-index'

/** 构造最小工作区索引快照（用于覆盖索引异常/超限分支） */
function createIndexSnapshot(rootPath: string, fileCount = 0): WorkspaceIndexSnapshot {
    return {
        rootPath,
        generatedAt: 1,
        files: Array.from({ length: fileCount }, () => ({
            path: path.join(rootPath, 'note.md'),
            relativePath: 'note.md',
            name: 'note.md',
            title: 'note',
            tags: [],
            links: [],
            size: 1,
            mtimeMs: 1
        })),
        tags: [],
        missingLinks: [],
        attachments: [],
        stats: {
            fileCount,
            linkCount: 0,
            missingCount: 0,
            ambiguousCount: 0,
            attachmentCount: 0,
            missingAttachmentCount: 0
        }
    }
}

/** 当前用例的隔离工作区根 */
let root = ''

/** 在工作区内写文本文件（自动创建父目录），返回绝对路径 */
function write(relativePath: string, content: string): string {
    const fullPath = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    return fullPath
}

/** 在工作区内写二进制文件（自动创建父目录），返回绝对路径 */
function writeBytes(relativePath: string, content: Buffer): string {
    const fullPath = path.join(root, relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content)
    return fullPath
}

/** 读取工作区内文本文件 */
function read(relativePath: string): string {
    return fs.readFileSync(path.join(root, relativePath), 'utf-8')
}

/** 读取工作区内二进制文件 */
function readBytes(relativePath: string): Buffer {
    return fs.readFileSync(path.join(root, relativePath))
}

/** 生成工作区内的资源管理器视图（排序后便于断言大小写改名） */
function readdir(relativePath: string): string[] {
    return fs.readdirSync(path.join(root, relativePath)).sort()
}

/** 创建文件符号链接；平台不支持时返回 false（用例 skip） */
function tryCreateFileSymlink(targetPath: string, linkPath: string): boolean {
    try {
        fs.symlinkSync(targetPath, linkPath, 'file')
        return true
    } catch {
        return false
    }
}

/** 创建目录符号链接/junction；平台不支持时返回 false（用例 skip） */
function tryCreateDirectorySymlink(targetPath: string, linkPath: string): boolean {
    try {
        fs.symlinkSync(targetPath, linkPath, 'junction')
        return true
    } catch {
        return false
    }
}

/** 回收站桩：删除文件模拟「移入回收站」 */
async function rmTrashItem(targetPath: string): Promise<void> {
    fs.rmSync(targetPath, { force: true })
}

beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-attachment-'))
    electronMocks.trashItem.mockReset()
    electronMocks.trashItem.mockResolvedValue(undefined)
    wsIndexControl.snapshotOverride = null
    wsIndexControl.shouldThrow = false
})

afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true })
    vi.clearAllMocks()
})

/* ========================================================================== */
/* 一、附件孤儿审计                                                            */
/* ========================================================================== */

describe('auditAttachments：根校验', () => {
    it('空串/空白/相对路径/不存在/非目录根一律 NO_WORKSPACE', async () => {
        const fileRoot = path.join(root, 'not-a-dir.png')
        fs.writeFileSync(fileRoot, 'png')
        const results = await Promise.all([
            auditAttachments(''),
            auditAttachments('   '),
            auditAttachments('docs/notes'),
            auditAttachments(path.join(root, 'missing-root')),
            auditAttachments(fileRoot),
            auditAttachments(undefined)
        ])
        for (const result of results) {
            expect(result).toEqual({ ok: false, code: 'NO_WORKSPACE' })
        }
    })

    it('文件系统根（盘符根/POSIX 根）一律 NO_WORKSPACE', async () => {
        const result = await auditAttachments(path.parse(root).root)
        expect(result).toEqual({ ok: false, code: 'NO_WORKSPACE' })
    })

    it('空工作区返回成功且计数为 0', async () => {
        const result = await auditAttachments(root)
        expect(result).toEqual({
            ok: true,
            orphans: [],
            referencedCount: 0,
            totalCount: 0,
            truncated: false
        })
    })
})

describe('auditAttachments：孤儿判定', () => {
    it('全部被引用时没有孤儿', async () => {
        write('images/a.png', 'png')
        write('note.md', '# 笔记\n\n![图](images/a.png)\n')
        const result = await auditAttachments(root)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.orphans).toEqual([])
        expect(result.referencedCount).toBe(1)
        expect(result.totalCount).toBe(1)
        expect(result.truncated).toBe(false)
    })

    it('未被引用的附件成为孤儿，条目含 path/relativePath/size/mtimeMs', async () => {
        const orphanPath = write('images/orphan.png', 'png-data')
        write('images/referenced.png', 'png')
        write('note.md', '![引用](images/referenced.png)\n')
        const result = await auditAttachments(root)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.orphans).toHaveLength(1)
        const [orphan] = result.orphans
        expect(orphan).toEqual({
            path: orphanPath,
            relativePath: 'images/orphan.png',
            size: Buffer.byteLength('png-data'),
            mtimeMs: fs.statSync(orphanPath).mtimeMs
        })
        expect(result.totalCount).toBe(2)
        expect(result.referencedCount).toBe(1)
    })

    it('同一附件被多个来源引用时 referencedCount 去重', async () => {
        write('images/a.png', 'png')
        write('a.md', '![a](images/a.png)\n')
        write('b.md', '![b](./images/a.png)\n')
        const result = await auditAttachments(root)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.referencedCount).toBe(1)
        expect(result.totalCount).toBe(1)
        expect(result.orphans).toEqual([])
    })

    it('缺失引用不计入 referencedCount，孤儿照常输出', async () => {
        write('images/orphan.png', 'png')
        write('note.md', '![缺失](images/missing.png)\n')
        const result = await auditAttachments(root)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.referencedCount).toBe(0)
        expect(result.totalCount).toBe(1)
        expect(result.orphans.map((entry) => entry.relativePath)).toEqual(['images/orphan.png'])
    })

    it('只扫描附件扩展名：笔记/脚本/无扩展名文件不出现', async () => {
        write('a.md', '# 笔记')
        write('b.txt', 'text')
        write('c.js', 'console.log(1)')
        write('d', 'no-extension')
        write('images/keep.pdf', 'pdf')
        const result = await auditAttachments(root)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.totalCount).toBe(1)
        expect(result.orphans.map((entry) => entry.relativePath)).toEqual(['images/keep.pdf'])
    })
})

describe('auditAttachments：扫描口径与保守排除', () => {
    it('跳过忽略目录（node_modules/.git 等）中的附件', async () => {
        write('images/orphan.png', 'png')
        write('node_modules/pkg/dep.png', 'png')
        write('.git/objects/blob.png', 'png')
        const result = await auditAttachments(root)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.totalCount).toBe(1)
        expect(result.orphans.map((entry) => entry.relativePath)).toEqual(['images/orphan.png'])
    })

    it('支持调用方覆盖忽略目录集合', async () => {
        write('images/orphan.png', 'png')
        write('skipme/inside.png', 'png')
        const result = await auditAttachments(root, { ignoredDirs: new Set(['skipme']) })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.totalCount).toBe(1)
        expect(result.orphans.map((entry) => entry.relativePath)).toEqual(['images/orphan.png'])
    })

    it('跳过文件符号链接（不把链接计入附件全集）', async (context) => {
        const realPath = write('images/real.png', 'png')
        const linkPath = path.join(root, 'images', 'link.png')
        if (!tryCreateFileSymlink(realPath, linkPath)) {
            context.skip()
            return
        }
        const result = await auditAttachments(root)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.totalCount).toBe(1)
        expect(result.orphans.map((entry) => entry.relativePath)).toEqual(['images/real.png'])
    })

    it('跳过目录符号链接/junction（不读取链接目标内的附件）', async (context) => {
        const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-attachment-link-'))
        try {
            fs.writeFileSync(path.join(outsideRoot, 'inside.png'), 'png')
            write('images/orphan.png', 'png')
            const linkPath = path.join(root, 'linked')
            if (!tryCreateDirectorySymlink(outsideRoot, linkPath)) {
                context.skip()
                return
            }
            const result = await auditAttachments(root)
            expect(result.ok).toBe(true)
            if (!result.ok) return
            expect(result.totalCount).toBe(1)
            expect(result.orphans.map((entry) => entry.relativePath)).toEqual(['images/orphan.png'])
        } finally {
            fs.rmSync(outsideRoot, { recursive: true, force: true })
        }
    })

    it('超过深度上限的附件不扫描', async () => {
        write('top.png', 'png')
        write('a/b/deep.png', 'png')
        const result = await auditAttachments(root, { maxDepth: 1 })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.totalCount).toBe(1)
        expect(result.orphans.map((entry) => entry.relativePath)).toEqual(['top.png'])
    })

    it('附件数达上限时 truncated=true 且不给出孤儿清单', async () => {
        write('a.png', 'a')
        write('b.png', 'b')
        write('c.png', 'c')
        const result = await auditAttachments(root, { maxFiles: 2 })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.truncated).toBe(true)
        expect(result.orphans).toEqual([])
        expect(result.totalCount).toBe(2)
    })

    it('子目录内提前截断后，父目录剩余条目不再扫描', async () => {
        // 排序后 a(目录) 先于 b.png：在 a/ 内触达上限，父循环下一项必须立即退出
        write('a/x.png', 'x')
        write('a/y.png', 'y')
        write('b.png', 'b')
        const result = await auditAttachments(root, { maxFiles: 1 })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.truncated).toBe(true)
        expect(result.totalCount).toBe(1)
    })

    it('目录 readdir 失败时保守排除孤儿（truncated=true）', async () => {
        write('orphan.png', 'png')
        const readdirSpy = vi
            .spyOn(fs.promises, 'readdir')
            .mockRejectedValueOnce(new Error('EACCES'))
        try {
            const result = await auditAttachments(root)
            expect(result.ok).toBe(true)
            if (!result.ok) return
            expect(result.truncated).toBe(true)
            expect(result.orphans).toEqual([])
            expect(result.totalCount).toBe(0)
        } finally {
            readdirSpy.mockRestore()
        }
    })

    it('索引未解析的超大 Markdown 使引用分析不完整：保守排除孤儿', async () => {
        write('orphan.png', 'png')
        write('big.md', 'a'.repeat(2 * 1024 * 1024 + 1))
        const normal = await auditAttachments(root)
        expect(normal.ok).toBe(true)
        if (!normal.ok) return
        expect(normal.truncated).toBe(true)
        expect(normal.orphans).toEqual([])
    })

    it('审计只读：不修改附件内容与 mtime', async () => {
        const attachmentPath = write('images/a.png', 'png')
        const before = fs.statSync(attachmentPath)
        await auditAttachments(root)
        const after = fs.statSync(attachmentPath)
        expect(fs.readFileSync(attachmentPath, 'utf-8')).toBe('png')
        expect(after.size).toBe(before.size)
        expect(after.mtimeMs).toBe(before.mtimeMs)
    })
})

describe('索引不可用/超限/异常（工作区索引替身）', () => {
    it('索引根不可用时审计保守返回 truncated=true', async () => {
        write('orphan.png', 'png')
        wsIndexControl.snapshotOverride = createIndexSnapshot('')
        const result = await auditAttachments(root)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.truncated).toBe(true)
        expect(result.orphans).toEqual([])
        expect(result.totalCount).toBe(1)
    })

    it('索引文件数达上限时审计保守返回 truncated=true', async () => {
        wsIndexControl.snapshotOverride = createIndexSnapshot(root, MAX_WORKSPACE_INDEX_FILES)
        const result = await auditAttachments(root)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.truncated).toBe(true)
        expect(result.orphans).toEqual([])
    })

    it('索引构建抛异常时审计返回 AUDIT_ERROR', async () => {
        wsIndexControl.shouldThrow = true
        const result = await auditAttachments(root)
        expect(result).toEqual({ ok: false, code: 'AUDIT_ERROR' })
    })

    it('索引根不可用时回收站返回 TRASH_ERROR（拒绝删除）', async () => {
        const attachmentPath = write('orphan.png', 'png')
        wsIndexControl.snapshotOverride = createIndexSnapshot('')
        const result = await trashAttachments(root, [attachmentPath], {
            trashItem: rmTrashItem
        })
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.code).toBe('TRASH_ERROR')
        expect(fs.existsSync(attachmentPath)).toBe(true)
    })

    it('索引构建抛异常时回收站返回 TRASH_ERROR', async () => {
        const attachmentPath = write('orphan.png', 'png')
        wsIndexControl.shouldThrow = true
        const result = await trashAttachments(root, [attachmentPath], {
            trashItem: rmTrashItem
        })
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.code).toBe('TRASH_ERROR')
        expect(fs.existsSync(attachmentPath)).toBe(true)
    })

    it('索引根不可用时重命名返回 RENAME_FAILED（不改名）', async () => {
        const oldPath = write('images/a.png', 'png')
        wsIndexControl.snapshotOverride = createIndexSnapshot('')
        const result = await renameAttachment(root, oldPath, 'b.png')
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.code).toBe('RENAME_FAILED')
        expect(fs.existsSync(oldPath)).toBe(true)
    })

    it('索引构建抛异常时重命名返回 RENAME_FAILED（不改名）', async () => {
        const oldPath = write('images/a.png', 'png')
        write('note.md', '![图](images/a.png)\n')
        wsIndexControl.shouldThrow = true
        const result = await renameAttachment(root, oldPath, 'b.png')
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.code).toBe('RENAME_FAILED')
        expect(fs.existsSync(oldPath)).toBe(true)
    })
})

/* ========================================================================== */
/* 二、批量移入回收站                                                          */
/* ========================================================================== */

describe('trashAttachments：载荷与根校验', () => {
    it('根非法返回 NO_WORKSPACE', async () => {
        expect(await trashAttachments('', ['a.png'])).toEqual({
            ok: false,
            code: 'NO_WORKSPACE'
        })
    })

    it('载荷非数组/空数组/超批量/含非字符串一律 INVALID_PAYLOAD', async () => {
        write('orphan.png', 'png')
        const tooMany = Array.from({ length: MAX_ATTACHMENT_TRASH_BATCH + 1 }, () => 'orphan.png')
        const results = await Promise.all([
            trashAttachments(root, 'orphan.png'),
            trashAttachments(root, []),
            trashAttachments(root, tooMany),
            trashAttachments(root, [1, 2])
        ])
        for (const result of results) {
            expect(result).toEqual({ ok: false, code: 'INVALID_PAYLOAD' })
        }
    })
})

describe('trashAttachments：逐项路径校验', () => {
    it('工作区外路径与相对路径 → PATH_DENIED', async () => {
        write('orphan.png', 'png')
        const outside = path.join(os.tmpdir(), `baize-attachment-outside-${Date.now()}.png`)
        fs.writeFileSync(outside, 'png')
        try {
            const outsideResult = await trashAttachments(root, [outside])
            expect(outsideResult).toEqual({
                ok: true,
                trashed: 0,
                failed: [{ path: outside, reason: 'PATH_DENIED' }]
            })
            const relativeResult = await trashAttachments(root, ['orphan.png'])
            expect(relativeResult).toEqual({
                ok: true,
                trashed: 0,
                failed: [{ path: 'orphan.png', reason: 'PATH_DENIED' }]
            })
        } finally {
            fs.rmSync(outside, { force: true })
        }
    })

    it('空白字符串路径 → PATH_DENIED（不访问磁盘）', async () => {
        write('orphan.png', 'png')
        const result = await trashAttachments(root, ['   '])
        expect(result).toEqual({
            ok: true,
            trashed: 0,
            failed: [{ path: '   ', reason: 'PATH_DENIED' }]
        })
    })

    it('经目录 junction 逃逸到工作区外的路径 → PATH_DENIED', async (context) => {
        const outsideRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-attachment-escape-'))
        try {
            fs.writeFileSync(path.join(outsideRoot, 'secret.png'), 'png')
            const linkPath = path.join(root, 'linked')
            if (!tryCreateDirectorySymlink(outsideRoot, linkPath)) {
                context.skip()
                return
            }
            const escapedPath = path.join(linkPath, 'secret.png')
            const result = await trashAttachments(root, [escapedPath], {
                trashItem: rmTrashItem
            })
            expect(result.ok).toBe(true)
            if (!result.ok) return
            expect(result.trashed).toBe(0)
            expect(result.failed).toEqual([{ path: escapedPath, reason: 'PATH_DENIED' }])
            expect(fs.existsSync(path.join(outsideRoot, 'secret.png'))).toBe(true)
        } finally {
            fs.rmSync(outsideRoot, { recursive: true, force: true })
        }
    })

    it('不存在/目录/符号链接 → NOT_FILE', async (context) => {
        fs.mkdirSync(path.join(root, 'folder.png'))
        const missingPath = path.join(root, 'missing.png')
        const missingResult = await trashAttachments(root, [missingPath])
        expect(missingResult.ok).toBe(true)
        if (missingResult.ok) {
            expect(missingResult.failed).toEqual([{ path: missingPath, reason: 'NOT_FILE' }])
        }
        const directoryPath = path.join(root, 'folder.png')
        const directoryResult = await trashAttachments(root, [directoryPath])
        expect(directoryResult.ok).toBe(true)
        if (directoryResult.ok) {
            expect(directoryResult.failed).toEqual([{ path: directoryPath, reason: 'NOT_FILE' }])
        }
        // 符号链接：用目录 junction 间接验证「lstat 为符号链接 → NOT_FILE」
        // （文件符号链接在 Windows 需开发者模式，junction 无需提权）
        fs.mkdirSync(path.join(root, 'real-folder'))
        const linkPath = path.join(root, 'link.png')
        if (!tryCreateDirectorySymlink(path.join(root, 'real-folder'), linkPath)) {
            context.skip()
            return
        }
        const linkResult = await trashAttachments(root, [linkPath])
        expect(linkResult.ok).toBe(true)
        if (linkResult.ok) {
            expect(linkResult.failed).toEqual([{ path: linkPath, reason: 'NOT_FILE' }])
        }
    })

    it('笔记正文（.md/.txt）→ PATH_DENIED', async () => {
        const notePath = write('note.md', '# 笔记')
        const result = await trashAttachments(root, [notePath])
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.failed).toEqual([{ path: notePath, reason: 'PATH_DENIED' }])
        }
    })

    it('LLM Wiki 模式：raw/ 内附件移入回收站被拒且文件保留（T1.3）', async () => {
        const rawPng = write('raw/source.png', 'png')
        setSystemSettingProvider(
            () =>
                ({
                    ...SYSTEM_SETTING_FALLBACK,
                    workspaceMode: 'llm-wiki'
                }) as unknown as SystemSetting
        )
        try {
            const result = await trashAttachments(root, [rawPng], { trashItem: rmTrashItem })
            expect(result.ok).toBe(true)
            if (!result.ok) return
            expect(result.trashed).toBe(0)
            expect(result.failed).toEqual([{ path: rawPng, reason: 'PATH_DENIED' }])
            expect(fs.existsSync(rawPng)).toBe(true)
        } finally {
            setSystemSettingProvider(null)
        }
    })
})

describe('trashAttachments：引用复核与回收站执行', () => {
    it('仍被 Markdown 引用的附件一律拒绝（STILL_REFERENCED）且文件仍在', async () => {
        const attachmentPath = write('images/used.png', 'png')
        write('note.md', '![引用](images/used.png)\n')
        const result = await trashAttachments(root, [attachmentPath], {
            trashItem: rmTrashItem
        })
        expect(result).toEqual({
            ok: true,
            trashed: 0,
            failed: [{ path: attachmentPath, reason: 'STILL_REFERENCED' }]
        })
        expect(fs.existsSync(attachmentPath)).toBe(true)
    })

    it('孤儿附件默认经 shell.trashItem 移入回收站', async () => {
        const attachmentPath = write('images/orphan.png', 'png')
        electronMocks.trashItem.mockImplementation(rmTrashItem)
        const result = await trashAttachments(root, [attachmentPath])
        expect(result).toEqual({ ok: true, trashed: 1, failed: [] })
        expect(electronMocks.trashItem).toHaveBeenCalledTimes(1)
        expect(electronMocks.trashItem).toHaveBeenCalledWith(attachmentPath)
        expect(fs.existsSync(attachmentPath)).toBe(false)
    })

    it('回收站不可用/抛错 → TRASH_FAILED（不永久删除）', async () => {
        const attachmentPath = write('images/orphan.png', 'png')
        const result = await trashAttachments(root, [attachmentPath], {
            trashItem: async () => {
                throw new Error('回收站不可用')
            }
        })
        expect(result).toEqual({
            ok: true,
            trashed: 0,
            failed: [{ path: attachmentPath, reason: 'TRASH_FAILED' }]
        })
        expect(fs.existsSync(attachmentPath)).toBe(true)
    })

    it('混合批次：成功项计数、失败项逐项返回原因', async () => {
        const orphanPath = write('images/orphan.png', 'png')
        const usedPath = write('images/used.png', 'png')
        write('note.md', '![引用](images/used.png)\n')
        const result = await trashAttachments(root, [orphanPath, usedPath], {
            trashItem: rmTrashItem
        })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.trashed).toBe(1)
        expect(result.failed).toEqual([{ path: usedPath, reason: 'STILL_REFERENCED' }])
        expect(fs.existsSync(orphanPath)).toBe(false)
        expect(fs.existsSync(usedPath)).toBe(true)
    })

    it('累计大小超过上限的项 → LIMIT_EXCEEDED', async () => {
        const firstPath = write('a.png', '0123456789')
        const secondPath = write('b.png', '0123456789')
        const result = await trashAttachments(root, [firstPath, secondPath], {
            trashItem: rmTrashItem,
            maxTotalBytes: 5
        })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.trashed).toBe(0)
        expect(result.failed).toEqual([
            { path: firstPath, reason: 'LIMIT_EXCEEDED' },
            { path: secondPath, reason: 'LIMIT_EXCEEDED' }
        ])
    })

    it('重复路径：首次成功后第二次按 NOT_FILE 返回', async () => {
        const attachmentPath = write('orphan.png', 'png')
        const result = await trashAttachments(root, [attachmentPath, attachmentPath], {
            trashItem: rmTrashItem
        })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.trashed).toBe(1)
        expect(result.failed).toEqual([{ path: attachmentPath, reason: 'NOT_FILE' }])
    })
})

/* ========================================================================== */
/* 三、附件重命名 + 引用更新                                                   */
/* ========================================================================== */

describe('renameAttachment：根与载荷校验', () => {
    it('根非法返回 NO_WORKSPACE', async () => {
        expect(await renameAttachment('', 'a.png', 'b.png')).toEqual({
            ok: false,
            code: 'NO_WORKSPACE'
        })
    })

    it('旧路径/新名为非字符串或旧路径为空 → INVALID_PAYLOAD', async () => {
        write('images/a.png', 'png')
        const oldPath = path.join(root, 'images/a.png')
        const results = await Promise.all([
            renameAttachment(root, 1, 'b.png'),
            renameAttachment(root, oldPath, ['b.png']),
            renameAttachment(root, '   ', 'b.png')
        ])
        for (const result of results) {
            expect(result).toEqual({ ok: false, code: 'INVALID_PAYLOAD' })
        }
    })
})

describe('renameAttachment：旧路径校验', () => {
    it('相对路径与工作区外路径 → PATH_DENIED', async () => {
        write('images/a.png', 'png')
        const outside = path.join(os.tmpdir(), `baize-attachment-outside-${Date.now()}.png`)
        fs.writeFileSync(outside, 'png')
        try {
            const relativeResult = await renameAttachment(root, 'images/a.png', 'b.png')
            expect(relativeResult).toEqual({ ok: false, code: 'PATH_DENIED' })
            const outsideResult = await renameAttachment(root, outside, 'b.png')
            expect(outsideResult).toEqual({ ok: false, code: 'PATH_DENIED' })
        } finally {
            fs.rmSync(outside, { force: true })
        }
    })

    it('不存在/目录/笔记正文 → NOT_FILE 或 PATH_DENIED', async () => {
        fs.mkdirSync(path.join(root, 'folder.png'))
        const missing = await renameAttachment(root, path.join(root, 'missing.png'), 'b.png')
        expect(missing).toEqual({ ok: false, code: 'NOT_FILE' })
        const directory = await renameAttachment(root, path.join(root, 'folder.png'), 'b.png')
        expect(directory).toEqual({ ok: false, code: 'NOT_FILE' })
        const notePath = write('note.md', '# 笔记')
        const note = await renameAttachment(root, notePath, 'renamed.md')
        expect(note).toEqual({ ok: false, code: 'PATH_DENIED' })
    })

    it('源文件为符号链接 → NOT_FILE', async (context) => {
        // 同上：目录 junction 即可覆盖「lstat 为符号链接」的拒绝分支，无需文件符号链接权限
        fs.mkdirSync(path.join(root, 'real-folder'))
        const linkPath = path.join(root, 'link.png')
        if (!tryCreateDirectorySymlink(path.join(root, 'real-folder'), linkPath)) {
            context.skip()
            return
        }
        const result = await renameAttachment(root, linkPath, 'renamed.png')
        expect(result).toEqual({ ok: false, code: 'NOT_FILE' })
    })

    it('LLM Wiki 模式：raw/ 内附件重命名被拒且文件保持原名（T1.3）', async () => {
        const rawPng = write('raw/source.png', 'png')
        setSystemSettingProvider(
            () =>
                ({
                    ...SYSTEM_SETTING_FALLBACK,
                    workspaceMode: 'llm-wiki'
                }) as unknown as SystemSetting
        )
        try {
            const result = await renameAttachment(root, rawPng, 'renamed.png')
            expect(result).toEqual({ ok: false, code: 'PATH_DENIED' })
            expect(fs.existsSync(rawPng)).toBe(true)
            expect(fs.existsSync(path.join(root, 'raw/renamed.png'))).toBe(false)
        } finally {
            setSystemSettingProvider(null)
        }
    })
})

describe('renameAttachment：新文件名校验', () => {
    it('空名/含路径分隔符/绝对路径/设备名/改扩展名 → INVALID_NAME', async () => {
        write('images/a.png', 'png')
        const oldPath = path.join(root, 'images/a.png')
        const cases = [
            '',
            '   ',
            'b/c.png',
            'b\\c.png',
            '../b.png',
            'CON',
            'CON.tar.gz',
            'a\u0000b.png',
            'b.jpg'
        ]
        for (const newName of cases) {
            const result = await renameAttachment(root, oldPath, newName)
            expect(result.ok).toBe(false)
            if (result.ok) continue
            expect(result.code).toBe('INVALID_NAME')
        }
    })

    it('目标已存在 → ALREADY_EXISTS 且旧文件未改名', async () => {
        const oldPath = write('images/a.png', 'old')
        const existingPath = write('images/b.png', 'existing')
        const result = await renameAttachment(root, oldPath, 'b.png')
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.code).toBe('ALREADY_EXISTS')
        expect(fs.existsSync(oldPath)).toBe(true)
        expect(fs.readFileSync(existingPath, 'utf-8')).toBe('existing')
    })

    it('与原文件名相同 → ALREADY_EXISTS', async () => {
        const oldPath = write('images/a.png', 'png')
        const result = await renameAttachment(root, oldPath, 'a.png')
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.code).toBe('ALREADY_EXISTS')
    })
})

describe('renameAttachment：成功路径与引用更新', () => {
    it('基础改名：文件移动、单处引用更新、计数正确', async () => {
        write('images/a.png', 'png')
        write('note.md', '# 笔记\n\n![图](images/a.png)\n')
        const oldPath = path.join(root, 'images/a.png')
        const result = await renameAttachment(root, oldPath, 'b.png')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.newPath).toBe(path.join(root, 'images/b.png'))
        expect(result.updatedFiles).toBe(1)
        expect(result.replacements).toBe(1)
        expect(result.failedFiles).toEqual([])
        expect(fs.existsSync(oldPath)).toBe(false)
        expect(fs.existsSync(result.newPath)).toBe(true)
        expect(read('note.md')).toBe('# 笔记\n\n![图](images/b.png)\n')
    })

    it('新名不含扩展名时自动补全原扩展名', async () => {
        write('images/a.png', 'png')
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'renamed')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.newPath).toBe(path.join(root, 'images/renamed.png'))
    })

    it('新名含大写原扩展名时统一保留原扩展名写法', async () => {
        write('images/a.png', 'png')
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'B.PNG')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.newPath).toBe(path.join(root, 'images/B.png'))
    })

    it('多来源多处引用：保留 ../ 相对写法并更新全部来源', async () => {
        write('images/a.png', 'png')
        write('note.md', '![一](images/a.png) 与 ![二](./images/a.png)\n')
        write('sub/note.md', '![上级](../images/a.png)\n')
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'b.png')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.updatedFiles).toBe(2)
        expect(result.replacements).toBe(3)
        expect(read('note.md')).toContain('![一](images/b.png)')
        expect(read('note.md')).toContain('![二](./images/b.png)')
        expect(read('sub/note.md')).toContain('![上级](../images/b.png)')
    })

    it('保留尖括号 + 链接标题写法', async () => {
        write('images/a.png', 'png')
        write('note.md', '![图](<images/a.png> "示意图")\n')
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'b.png')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(read('note.md')).toBe('![图](<images/b.png> "示意图")\n')
    })

    it('保留 #fragment 与百分号编码写法', async () => {
        write('images/a b.png', 'png')
        write('note.md', '![锚点](images/a%20b.png#part)\n')
        const result = await renameAttachment(root, path.join(root, 'images/a b.png'), 'c d')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(read('note.md')).toBe('![锚点](images/c%20d.png#part)\n')
    })

    it('围栏代码块与行内代码中的引用不更新', async () => {
        write('images/a.png', 'png')
        write(
            'note.md',
            [
                '```md',
                '![代码块内](images/a.png)',
                '```',
                '`![行内代码](images/a.png)`',
                '![真实引用](images/a.png)',
                ''
            ].join('\n')
        )
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'b.png')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.replacements).toBe(1)
        const content = read('note.md')
        expect(content).toContain('![代码块内](images/a.png)')
        expect(content).toContain('`![行内代码](images/a.png)`')
        expect(content).toContain('![真实引用](images/b.png)')
    })

    it('保留 UTF-8 BOM 与 CRLF，按原编码写回', async () => {
        write('images/a.png', 'png')
        writeBytes(
            'note.md',
            Buffer.concat([
                Buffer.from([0xef, 0xbb, 0xbf]),
                Buffer.from('[[旧]]\r\n![图](images/a.png)\r\n', 'utf-8')
            ])
        )
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'b.png')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        const bytes = readBytes('note.md')
        expect([bytes[0], bytes[1], bytes[2]]).toEqual([0xef, 0xbb, 0xbf])
        const text = bytes.subarray(3).toString('utf-8')
        expect(text).toContain('\r\n')
        expect(text).toContain('![图](images/b.png)')
    })

    it('GBK 来源文件按原编码写回，不损坏中文', async () => {
        write('images/a.png', 'png')
        const notePath = path.join(root, 'note.md')
        fs.writeFileSync(notePath, iconv.encode('中文 ![图](images/a.png) 结尾', 'gbk'))
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'b.png')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        const decoded = iconv.decode(fs.readFileSync(notePath), 'gbk')
        expect(decoded).toBe('中文 ![图](images/b.png) 结尾')
    })

    it('非法/外链/越界/其它附件引用保持不变，只替换命中旧附件的引用', async () => {
        write('images/a.png', 'png')
        write('images/other.png', 'png')
        write('note.md', '# 其他笔记\n')
        const noteLines = [
            '![空目标]()',
            '![未闭合](<images/a.png)',
            '![尖括号空](<>)',
            '![外链](https://example.com/a.png)',
            '![数据](data:image/png;base64,AAAA)',
            '![绝对](/images/a.png)',
            '![编码](images/%ZZ.png)',
            '![越界](../outside.png)',
            '![笔记](note.md)',
            '![其它](images/other.png)',
            '![有效](images/a.png)'
        ]
        write('malformed.md', `${noteLines.join('\n')}\n`)
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'b.png')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.updatedFiles).toBe(1)
        expect(result.replacements).toBe(1)
        expect(result.failedFiles).toEqual([])
        const content = read('malformed.md')
        // 前 10 行原样保留，仅最后一行目标被替换
        expect(content).toBe(`${noteLines.slice(0, -1).join('\n')}\n![有效](images/b.png)\n`)
    })

    it('无任何引用时只改名，引用计数为 0', async () => {
        write('images/a.png', 'png')
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'b.png')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.updatedFiles).toBe(0)
        expect(result.replacements).toBe(0)
        expect(result.failedFiles).toEqual([])
    })

    it('仅修改大小写（Windows 大小写不敏感口径）', async (context) => {
        if (process.platform !== 'win32') {
            context.skip()
            return
        }
        write('images/a.png', 'png')
        write('note.md', '![图](images/a.png)\n')
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'A.png')
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(path.basename(result.newPath)).toBe('A.png')
        expect(readdir('images')).toEqual(['A.png'])
        expect(read('note.md')).toContain('images/A.png')
    })
})

describe('renameAttachment：失败与半更新报告', () => {
    it('改名失败 → RENAME_FAILED 且不改引用', async () => {
        write('images/a.png', 'png')
        write('note.md', '![图](images/a.png)\n')
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'b.png', {
            renameFile: async () => {
                throw new Error('设备忙')
            }
        })
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.code).toBe('RENAME_FAILED')
        expect(fs.existsSync(path.join(root, 'images/a.png'))).toBe(true)
        expect(read('note.md')).toBe('![图](images/a.png)\n')
    })

    it('引用写回失败：改名成功、失败来源进入 failedFiles', async () => {
        write('images/a.png', 'png')
        const notePath = write('note.md', '![图](images/a.png)\n')
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'b.png', {
            writeFile: async () => {
                throw new Error('磁盘只读')
            }
        })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.newPath).toBe(path.join(root, 'images/b.png'))
        expect(result.updatedFiles).toBe(0)
        expect(result.failedFiles).toEqual([notePath])
        expect(fs.existsSync(path.join(root, 'images/b.png'))).toBe(true)
        expect(read('note.md')).toBe('![图](images/a.png)\n')
    })

    it('引用来源读取失败：跳过该来源并报告，不强行覆盖', async () => {
        write('images/a.png', 'png')
        const notePath = write('note.md', '![图](images/a.png)\n')
        const result = await renameAttachment(root, path.join(root, 'images/a.png'), 'b.png', {
            readFile: async (targetPath: string) => {
                if (targetPath === notePath) {
                    throw new Error('EACCES')
                }
                return fs.readFileSync(targetPath)
            }
        })
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.updatedFiles).toBe(0)
        expect(result.failedFiles).toEqual([notePath])
        expect(read('note.md')).toBe('![图](images/a.png)\n')
        expect(fs.existsSync(path.join(root, 'images/b.png'))).toBe(true)
    })

    it('引用数量超过上限 → RENAME_FAILED 且不改名（避免半更新）', async () => {
        write('images/a.png', 'png')
        write('note.md', '![一](images/a.png) ![二](images/a.png)\n')
        const oldPath = path.join(root, 'images/a.png')
        const result = await renameAttachment(root, oldPath, 'b.png', {
            maxReferenceReplacements: 1
        })
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.code).toBe('RENAME_FAILED')
        expect(fs.existsSync(oldPath)).toBe(true)
    })
})
