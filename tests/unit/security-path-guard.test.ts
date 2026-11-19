/**
 * P1-AS-1：文件 IPC 路径守卫（src/main/utils/security.ts Path Guard 段）单元测试
 *
 * 覆盖：
 * 1. normalizeLocalPath / isSafeWorkspaceRoot：拒绝非字符串、空串、相对路径、盘符根、
 *    UNC 共享根、设备命名空间（\\?\、\\.\）；UNC 共享子目录按设计允许（task-13 AS-2 保留场景）；
 * 2. isPathAllowed：临时目录/工作区根/对话框受信路径/最近历史/当前活动文件目录 的白名单矩阵，
 *    `..` 解析后仍在根内放行、逃逸拒绝，符号链接/junction 逃逸（可创建时）拒绝；
 * 3. registerTrustedPath / registerTrustedDirectory / setTrustedHistoryProvider 的登记语义；
 * 4. isSafeFileName / isSafeFileExtension 文件名与扩展名白名单；
 * 5. assertSafePath / PathAccessDeniedError 的受控异常语义。
 *
 * 说明：security.ts 不依赖 electron app 模块；这里仅 mock electron 的 shell（模块顶部导入）。
 * 允许根使用系统临时目录（os.tmpdir），白名单外路径使用用户主目录下临时目录（测试后清理）。
 */
import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'

vi.mock('electron', () => ({
    shell: { openExternal: vi.fn() },
    BrowserWindow: class {}
}))

import { appState } from '../../src/main/utils/app-state'
import {
    assertSafePath,
    clearTrustedPathsForTesting,
    getTrustedPathsForTesting,
    isPathAllowed,
    isSafeFileExtension,
    isSafeFileName,
    isSafeShowItemInFolderPath,
    isSafeWorkspaceRoot,
    isSameOrWithin,
    normalizeLocalPath,
    PathAccessDeniedError,
    registerTrustedDirectory,
    registerTrustedPath,
    setTrustedHistoryProvider
} from '../../src/main/utils/security'

const isWindows = process.platform === 'win32'
/** 白名单外的系统路径（不访问，只做判定） */
const SYSTEM_OUTSIDE_PATH = isWindows ? 'C:\\Windows\\win.ini' : '/etc/passwd'

let tmpDir = ''
let outsideBase = ''
let outsideDir = ''
let outsideFile = ''

beforeAll(async () => {
    // 允许根：系统临时目录下的一次性目录
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-as1-tmp-'))
    // 白名单外：用户主目录下的一次性目录（不在 os.tmpdir/工作区/受信集合内）
    outsideBase = await fs.mkdtemp(path.join(os.homedir(), '.baize-as1-outside-'))
    outsideDir = path.join(outsideBase, 'workdir')
    await fs.mkdir(outsideDir)
    outsideFile = path.join(outsideDir, 'secret.md')
    await fs.writeFile(outsideFile, 'outside', 'utf8')
})

afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    await fs.rm(outsideBase, { recursive: true, force: true })
})

beforeEach(() => {
    appState._resetForTesting()
    clearTrustedPathsForTesting()
})

describe('normalizeLocalPath', () => {
    it('should reject non-string, empty and relative inputs', () => {
        for (const input of [
            undefined,
            null,
            42,
            {},
            [],
            '',
            '   ',
            'relative/path.md',
            './a.md'
        ]) {
            expect(normalizeLocalPath(input)).toBeNull()
        }
    })

    it('should accept an absolute path and fold `..` segments', () => {
        const target = path.join(tmpDir, 'sub', '..', 'a.md')
        expect(normalizeLocalPath(target)).toBe(path.resolve(tmpDir, 'a.md'))
    })

    it('should reject device namespace paths', () => {
        for (const input of [
            '\\\\?\\C:\\Windows\\win.ini',
            '\\\\.\\PhysicalDrive0',
            '\\\\??\\C:\\x'
        ]) {
            expect(normalizeLocalPath(input)).toBeNull()
        }
    })

    it('should reject filesystem/drive roots', () => {
        expect(normalizeLocalPath(path.parse(tmpDir).root)).toBeNull()
        if (isWindows) {
            expect(normalizeLocalPath('C:\\')).toBeNull()
            expect(normalizeLocalPath('D:\\')).toBeNull()
        } else {
            expect(normalizeLocalPath('/')).toBeNull()
        }
    })

    it('should reject UNC share roots but allow UNC subdirectories on Windows', () => {
        if (!isWindows) {
            expect(normalizeLocalPath('\\\\server\\share\\sub\\a.md')).toBeNull()
            return
        }
        expect(normalizeLocalPath('\\\\server\\share')).toBeNull()
        expect(normalizeLocalPath('\\\\server\\share\\sub\\a.md')).not.toBeNull()
    })
})

describe('isSameOrWithin（shared/utils/path.isPathWithin 薄包装）', () => {
    it('should treat the root itself and its children as within', () => {
        expect(isSameOrWithin(tmpDir, tmpDir)).toBe(true)
        expect(isSameOrWithin(path.join(tmpDir, 'a.md'), tmpDir)).toBe(true)
        expect(isSameOrWithin(path.join(tmpDir, 'sub', 'deep', 'a.md'), tmpDir)).toBe(true)
    })

    it('should reject sibling prefixes and lexically escaping paths', () => {
        // 前缀相同但不是子目录（/tmp/x 与 /tmp/x2）
        expect(isSameOrWithin(`${tmpDir}2`, tmpDir)).toBe(false)
        // 公共接口归位第 2 批：shared 实现自带 `..` 词法折叠，逃逸路径判为不在根内
        expect(isSameOrWithin(path.join(tmpDir, '..', 'escape.md'), tmpDir)).toBe(false)
        expect(isSameOrWithin(path.join(tmpDir, 'sub', '..', '..'), tmpDir)).toBe(false)
    })
})

describe('isPathAllowed 允许根范围', () => {
    it('should allow files inside the system temp directory', () => {
        expect(isPathAllowed(path.join(tmpDir, 'a.md'))).toBe(true)
        expect(isPathAllowed(path.join(tmpDir, 'not-exists', 'b.txt'))).toBe(true)
    })

    it('should allow `..` segments that resolve back inside an allowed root', () => {
        expect(isPathAllowed(path.join(tmpDir, 'sub', '..', 'c.md'))).toBe(true)
    })

    it('should reject paths outside every allowed root', () => {
        expect(isPathAllowed(outsideFile)).toBe(false)
        expect(isPathAllowed(outsideDir)).toBe(false)
        expect(isPathAllowed(SYSTEM_OUTSIDE_PATH)).toBe(false)
    })

    it('should reject malformed and dangerous path shapes', () => {
        for (const input of [
            undefined,
            null,
            123,
            '',
            'relative.md',
            path.parse(tmpDir).root,
            '\\\\?\\C:\\Windows\\win.ini'
        ]) {
            expect(isPathAllowed(input)).toBe(false)
        }
    })

    it('should allow the workspace root subtree only', () => {
        appState.rootPath = outsideDir
        expect(isPathAllowed(path.join(outsideDir, 'note.md'))).toBe(true)
        expect(isPathAllowed(path.join(outsideBase, 'sibling.md'))).toBe(false)
    })

    it('should ignore an illegal workspace root', () => {
        appState.rootPath = path.parse(tmpDir).root
        expect(isPathAllowed(outsideFile)).toBe(false)
    })

    it('should grant the active file directory when the active file itself is trusted', () => {
        // 未受信的活动文件不会成为授权根
        appState.currentActiveFile = {
            name: 'secret.md',
            path: outsideFile,
            type: 'file',
            content: ''
        }
        expect(isPathAllowed(path.join(outsideDir, 'images', 'a.png'))).toBe(false)

        // 经对话框登记（模拟）后，活动文件目录派生受信：单文件模式下的图片/新建/重命名仍可用
        registerTrustedPath(outsideFile)
        expect(isPathAllowed(path.join(outsideDir, 'images', 'a.png'))).toBe(true)
        expect(isPathAllowed(path.join(outsideDir, 'sibling.md'))).toBe(true)
        // 但目录之外的路径仍然拒绝
        expect(isPathAllowed(path.join(outsideBase, 'other.md'))).toBe(false)
    })

    it('should deny symlink/junction escapes when the platform allows creating them', async () => {
        const linkPath = path.join(tmpDir, 'link-to-outside')
        try {
            await fs.symlink(outsideDir, linkPath, isWindows ? 'junction' : 'dir')
        } catch {
            // 无权限创建链接（如未开启 Windows 开发者模式）时跳过该用例
            return
        }
        try {
            expect(isPathAllowed(path.join(linkPath, 'evil.md'))).toBe(false)
        } finally {
            await fs.rm(linkPath, { force: true, recursive: true })
        }
    })
})

describe('registerTrustedPath / registerTrustedDirectory', () => {
    it('should trust an exact file only (dialog "open file" semantics)', () => {
        registerTrustedPath(outsideFile)
        expect(isPathAllowed(outsideFile)).toBe(true)
        expect(isPathAllowed(path.join(outsideDir, 'sibling.md'))).toBe(false)
        expect(getTrustedPathsForTesting().files).toHaveLength(1)
    })

    it('should auto-detect an existing directory and trust its subtree', () => {
        registerTrustedPath(outsideDir)
        expect(isPathAllowed(path.join(outsideDir, 'child.md'))).toBe(true)
        expect(getTrustedPathsForTesting().directories).toHaveLength(1)
    })

    it('should trust an explicit directory subtree even if it does not exist yet', () => {
        const futureDir = path.join(outsideBase, 'future-dir')
        registerTrustedDirectory(futureDir)
        expect(isPathAllowed(path.join(futureDir, 'nested', 'note.md'))).toBe(true)
    })

    it('should ignore invalid registrations without throwing', () => {
        registerTrustedPath(undefined)
        registerTrustedPath('')
        registerTrustedPath('relative/path')
        registerTrustedPath('\\\\?\\C:\\x')
        registerTrustedDirectory(42)
        expect(getTrustedPathsForTesting().files).toHaveLength(0)
        expect(getTrustedPathsForTesting().directories).toHaveLength(0)
    })

    it('should reset all runtime trusted paths via clearTrustedPathsForTesting', () => {
        registerTrustedPath(outsideFile)
        clearTrustedPathsForTesting()
        expect(isPathAllowed(outsideFile)).toBe(false)
        expect(getTrustedPathsForTesting()).toEqual({ files: [], directories: [] })
    })
})

describe('setTrustedHistoryProvider（最近打开历史）', () => {
    it('should trust files and directories from the history provider', () => {
        setTrustedHistoryProvider(() => ({ files: [outsideFile], directories: [outsideDir] }))
        expect(isPathAllowed(outsideFile)).toBe(true)
        expect(isPathAllowed(path.join(outsideDir, 'history-child.md'))).toBe(true)
    })

    it('should treat a throwing provider as empty history without throwing', () => {
        setTrustedHistoryProvider(() => {
            throw new Error('store corrupted')
        })
        expect(() => isPathAllowed(outsideFile)).not.toThrow()
        expect(isPathAllowed(outsideFile)).toBe(false)
    })
})

describe('isSafeWorkspaceRoot', () => {
    it('should accept normal absolute workspace directories', () => {
        expect(isSafeWorkspaceRoot(tmpDir)).toBe(true)
        expect(isSafeWorkspaceRoot(outsideDir)).toBe(true)
    })

    it('should reject dangerous workspace roots', () => {
        for (const input of [
            '',
            'relative-dir',
            path.parse(tmpDir).root,
            '\\\\?\\C:\\',
            '\\\\server\\share'
        ]) {
            expect(isSafeWorkspaceRoot(input)).toBe(false)
        }
        if (isWindows) {
            // task-13 AS-2 明确保留网络共享子目录场景
            expect(isSafeWorkspaceRoot('\\\\server\\share\\sub')).toBe(true)
        }
    })
})

describe('isSafeFileName', () => {
    it('should accept normal file names', () => {
        for (const name of ['note.md', 'a b.txt', '中文笔记.md', 'v1.2.3', '.hidden']) {
            expect(isSafeFileName(name)).toBe(true)
        }
    })

    it('should reject path traversal and illegal characters', () => {
        for (const name of [
            '',
            ' ',
            '.',
            '..',
            '../evil',
            '..\\evil',
            'a/b',
            'a\\b',
            'x:stream',
            'a<b.md',
            'a>b.md',
            'a|b.md',
            'a*b.md',
            'a?b.md',
            'a"b.md',
            'nul\u0000.md'
        ]) {
            expect(isSafeFileName(name)).toBe(false)
        }
    })

    it('should reject Windows reserved device names and trailing dot/space', () => {
        if (!isWindows) {
            return
        }
        for (const name of [
            'CON',
            'con.txt',
            'NUL',
            'COM1',
            'lpt9.log',
            'trailing.',
            'trailing '
        ]) {
            expect(isSafeFileName(name)).toBe(false)
        }
    })
})

describe('isSafeFileExtension', () => {
    it('should accept dot-prefixed extensions', () => {
        for (const ext of ['.md', '.txt', '.html', '.tar.gz', '.docx']) {
            expect(isSafeFileExtension(ext)).toBe(true)
        }
    })

    it('should reject malformed extensions', () => {
        for (const ext of ['', 'md', '.', '.m d', '.m/d', '../x', '.m\\d', '.m:d']) {
            expect(isSafeFileExtension(ext)).toBe(false)
        }
    })
})

describe('assertSafePath', () => {
    it('should return the normalized absolute path for allowed targets', () => {
        expect(assertSafePath(path.join(tmpDir, 'sub', '..', 'a.md'))).toBe(
            path.resolve(tmpDir, 'a.md')
        )
    })

    it('should throw PathAccessDeniedError for out-of-scope targets', () => {
        let caught: unknown = null
        try {
            assertSafePath(outsideFile)
        } catch (error) {
            caught = error
        }
        expect(caught).toBeInstanceOf(PathAccessDeniedError)
        expect((caught as PathAccessDeniedError).filePath).toBe(outsideFile)
        expect((caught as Error).name).toBe('PathAccessDeniedError')
    })
})

// AS-8：shell.showItemInFolder 目标路径校验（UNC/SMB 与任意路径探测面）
describe('isSafeShowItemInFolderPath (AS-8)', () => {
    it('should allow paths inside trusted roots', () => {
        expect(isSafeShowItemInFolderPath(path.join(tmpDir, 'note.md'))).toBe(true)
        expect(isSafeShowItemInFolderPath(os.tmpdir())).toBe(true)
    })

    it('should reject UNC paths and device namespaces (SMB/NTLM leak surface)', () => {
        const uncPaths = [
            '\\\\attacker\\share\\file.txt',
            '\\\\attacker\\share',
            '//attacker/share/file.txt',
            '\\\\?\\C:\\Windows\\win.ini',
            '\\\\.\\PhysicalDrive0'
        ]
        for (const target of uncPaths) {
            expect(isSafeShowItemInFolderPath(target), target).toBe(false)
        }
    })

    it('should reject relative / empty / non-string / out-of-scope targets', () => {
        for (const target of ['relative/path.md', './note.md', '', '   ', null, 42, {}]) {
            expect(isSafeShowItemInFolderPath(target), String(target)).toBe(false)
        }
        expect(isSafeShowItemInFolderPath(outsideFile)).toBe(false)
    })

    it('should allow a dialog-registered exact file (user explicitly chose it)', () => {
        registerTrustedPath(outsideFile)
        expect(isSafeShowItemInFolderPath(outsideFile)).toBe(true)
    })
})
