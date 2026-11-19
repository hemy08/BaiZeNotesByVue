/**
 * 第 1 批公共接口归位：`src/shared/utils/` 纯函数层单元测试。
 *
 * 测试目标（与迁移计划「每项新增等价性单测（迁移前后同输入同输出）」一致）：
 * 1. 边界行为：Windows/POSIX 路径、UNC、中文/空格/`#`/`?`、尾分隔符、大小写、
 *    `.`/`..` 折叠、无扩展名解析、LRU 命中提升/淘汰、HTML 三分支注入、随机字符集、
 *    校验边界、格式化边界、并发顺序/上限、防抖 cancel/flush、备份时间戳/逃逸拒绝；
 * 2. 与原实现的**等价性**：对 `toFileUrl` / `dirToBaseHref` / `parseDirectoryPath` /
 *    `fnv1a32` / `injectIntoHead` / `formatBackupStamp` / `resolveBackupDirSafe` /
 *    `sortBackupNames` 等，用下方「参考实现」（逐字拷贝自原文件）或原实现生成的
 *    已知值做对照，保证同输入同输出。
 *
 * 已知值说明：FNV / TOC 指纹 / 章节指纹的期望数字均由原实现（directory-tree.ts、
 * resource-manager.ts、preview-chapters.ts）同算法生成，生成方式见各断言前注释。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import * as path from 'node:path'
import {
    dirToBaseHref,
    getBaseName,
    getExtension,
    isPathWithin,
    normalizePathForCompare,
    normalizeSlashes,
    parseDirectoryPath,
    toFileUrl,
    toPosixPath
} from '../../src/shared/utils/path'
import {
    FNV_OFFSET_BASIS,
    FNV_PRIME,
    fnv1a32,
    fnv1a32Mix,
    toRadixString
} from '../../src/shared/utils/hash'
import { LRUCache } from '../../src/shared/utils/lru-cache'
import { escapeHtml, injectIntoHead } from '../../src/shared/utils/html'
import { randomAlnum, randomDigits, uniqueSuffix } from '../../src/shared/utils/random'
import {
    clampNumber,
    hasControlChars,
    isFiniteNumber,
    isPlainObject
} from '../../src/shared/utils/validate'
import { formatFileSize } from '../../src/shared/utils/format'
import { createSemaphore, limitConcurrency } from '../../src/shared/utils/concurrency'
import { debounce } from '../../src/shared/utils/debounce'
import { formatDateTime } from '../../src/shared/utils/date'
import {
    formatBackupStamp,
    isValidBackupName,
    parseBackupStamp,
    resolveBackupDirSafe,
    sortBackupNames,
    type PathApi
} from '../../src/shared/utils/backup-dir'

/**
 * 结构优化第 1 批 1.3（L4）：shared/utils/backup-dir 的 `resolveBackupDirSafe` 改为
 * 显式注入路径能力（shared 层不再 import node:path）。测试文件允许依赖 Node 内建，
 * 这里直接传真实 node:path 实现，断言与改造前逐字等价。
 */
const nodePathApi: PathApi = {
    resolve: path.resolve,
    relative: path.relative,
    isAbsolute: path.isAbsolute
}

/* ============================== 参考实现（原文件逐字拷贝） ============================== */

/** 参考实现：preview-local-render.ts:199-206 的 toFileUrl（用于等价性对照） */
function referenceToFileUrl(localPath: string): string {
    const normalized = localPath.replace(/\\/g, '/')
    const withLeadingSlash = normalized.startsWith('/') ? normalized : '/' + normalized
    return (
        'file://' +
        encodeURI(withLeadingSlash).replace(/[?#]/g, (ch) => (ch === '#' ? '%23' : '%3F'))
    )
}

/** 参考实现：html-view-utils.ts:20-37 的 base href 计算（用于等价性对照） */
function referenceDirToBaseHref(filePath: string): string {
    const normalized = String(filePath || '').replace(/\\/g, '/')
    const slash = normalized.lastIndexOf('/')
    const dir = slash >= 0 ? normalized.slice(0, slash + 1) : normalized
    const encodedDir = encodeURI(dir).replace(/#/g, '%23').replace(/\?/g, '%3F')
    return dir.startsWith('/') ? `file://${encodedDir}` : `file:///${encodedDir}`
}

/** 参考实现：html-view-utils.ts:30-36 的 withBaseHref（用于组合等价性对照） */
function referenceWithBaseHref(html: string, filePath: string): string {
    const tag = `<base href="${referenceDirToBaseHref(filePath)}">`
    if (/<head(\s[^>]*)?>/i.test(html)) {
        return html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n    ${tag}`)
    }
    if (/<html(\s[^>]*)?>/i.test(html)) {
        return html.replace(/<html(\s[^>]*)?>/i, (m) => `${m}\n<head>${tag}</head>`)
    }
    return `${tag}\n${html}`
}

/** 参考实现：path-utils.ts:80-88 的 ParseDirectoryPath（用于等价性对照） */
function referenceParseDirectoryPath(fullName: string): string {
    if (fullName.lastIndexOf('.') === -1) {
        return fullName
    }
    const lastIndex1 = fullName.lastIndexOf('\\')
    const lastIndex2 = fullName.lastIndexOf('/')
    const lastIndex = Math.max(lastIndex1, lastIndex2)
    return fullName.substring(0, lastIndex)
}

/** 参考实现：preview-md-blocks.ts:756-761 的 getLowerExtension（含点版本） */
function referenceGetLowerExtension(filePath: string): string {
    const fileName = filePath.slice(filePath.lastIndexOf('/') + 1)
    const dot = fileName.lastIndexOf('.')
    return dot <= 0 ? '' : fileName.slice(dot).toLowerCase()
}

/** 参考实现：config-schema.ts:80-95 的 clampNumber 区间分支（非法值分支返回 null） */
function referenceClampNumber(value: number, min: number, max: number): number {
    if (value < min) {
        return min
    }
    if (value > max) {
        return max
    }
    return value
}

/** 参考实现：auto-backup.ts:97-104 / config-backup.ts:68-75 的时间戳拼装 */
function referenceFormatBackupStamp(date: Date): string {
    const pad = (value: number): string => String(value).padStart(2, '0')
    return (
        `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
        `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
    )
}

/** 参考实现：auto-backup.ts:115-126 的路径守卫（不含名称白名单，名称由调用方先过滤） */
function referenceResolveBackupDirSafe(root: string, name: string): string | null {
    const resolvedRoot = path.resolve(root)
    const target = path.resolve(resolvedRoot, name)
    const relativePath = path.relative(resolvedRoot, target)
    if (relativePath === '' || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
        return null
    }
    return target
}

/** 参考实现：auto-backup.ts:199 的倒序排序 */
function referenceSortBackupNames(names: string[]): string[] {
    return [...names].sort((left, right) => right.localeCompare(left))
}

/* ============================== path.ts：分隔符归一化 ============================== */

describe('normalizeSlashes / toPosixPath', () => {
    it('should convert all backslashes to forward slashes', () => {
        expect(normalizeSlashes('E:\\notes\\a.md')).toBe('E:/notes/a.md')
        expect(normalizeSlashes('\\\\server\\share\\a.md')).toBe('//server/share/a.md')
        expect(normalizeSlashes('a\\b\\c')).toBe('a/b/c')
    })

    it('should keep POSIX paths and empty strings untouched', () => {
        expect(normalizeSlashes('/notes/a.md')).toBe('/notes/a.md')
        expect(normalizeSlashes('')).toBe('')
    })

    it('toPosixPath should be an alias with identical output', () => {
        const samples = ['E:\\notes\\a.md', '/notes/a.md', '\\\\server\\share', 'a\\b', '']
        for (const sample of samples) {
            expect(toPosixPath(sample)).toBe(normalizeSlashes(sample))
        }
    })
})

/* ============================== path.ts：file:// URL ============================== */

describe('toFileUrl', () => {
    it('should convert Windows drive path to file:///E:/...', () => {
        expect(toFileUrl('E:\\notes\\a.md')).toBe('file:///E:/notes/a.md')
        expect(toFileUrl('C:/notes/a.md')).toBe('file:///C:/notes/a.md')
    })

    it('should convert POSIX absolute path to file:///notes/...', () => {
        expect(toFileUrl('/notes/a.md')).toBe('file:///notes/a.md')
        expect(toFileUrl('/home/user/笔记.md')).toBe('file:///home/user/%E7%AC%94%E8%AE%B0.md')
    })

    it('should percent-encode Chinese characters and spaces', () => {
        expect(toFileUrl('E:\\笔记 目录\\图 1.png')).toBe(
            'file:///E:/%E7%AC%94%E8%AE%B0%20%E7%9B%AE%E5%BD%95/%E5%9B%BE%201.png'
        )
    })

    it('should encode # and ? so they do not become fragment/query', () => {
        expect(toFileUrl('E:\\notes\\a#b?c.md')).toBe('file:///E:/notes/a%23b%3Fc.md')
        expect(toFileUrl('/notes/a#b.md')).toBe('file:///notes/a%23b.md')
        expect(toFileUrl('/notes/a?b.md')).toBe('file:///notes/a%3Fb.md')
    })

    it('should encode percent signs in file names', () => {
        expect(toFileUrl('C:\\notes\\100% done.md')).toBe('file:///C:/notes/100%25%20done.md')
    })

    it('should keep the legacy UNC shape (four slashes, aligned with original)', () => {
        // 归一化后以 `//` 开头 → 原实现的「补前导斜杠」分支不会再加斜杠，
        // 因此输出 file:////server/...（4 个斜杠）。这里保持与现有实现逐字对齐。
        expect(toFileUrl('\\\\server\\share\\a.md')).toBe('file:////server/share/a.md')
    })

    it('should be equivalent to the preview-local-render original implementation', () => {
        const samples = [
            'E:\\notes\\a.md',
            'E:/notes/a.md',
            '/notes/a.md',
            'E:\\笔记 目录\\图 1.png',
            'E:\\notes\\a#b?c.md',
            '/notes/a#b.md',
            '\\\\server\\share\\a.md',
            'C:\\notes\\100% done.md',
            '',
            'relative/a.md'
        ]
        for (const sample of samples) {
            expect(toFileUrl(sample)).toBe(referenceToFileUrl(sample))
        }
    })
})

describe('dirToBaseHref', () => {
    it('should return directory base URL with trailing slash (Windows)', () => {
        expect(dirToBaseHref('E:\\notes\\a.md')).toBe('file:///E:/notes/')
        expect(dirToBaseHref('E:/notes/sub/a.md')).toBe('file:///E:/notes/sub/')
    })

    it('should return directory base URL with trailing slash (POSIX)', () => {
        expect(dirToBaseHref('/notes/a.md')).toBe('file:///notes/')
        expect(dirToBaseHref('/notes/sub/a.md')).toBe('file:///notes/sub/')
    })

    it('should encode Chinese characters and spaces in directory', () => {
        expect(dirToBaseHref('E:\\笔记 目录\\图 1.png')).toBe(
            'file:///E:/%E7%AC%94%E8%AE%B0%20%E7%9B%AE%E5%BD%95/'
        )
    })

    it('should encode # and ? in directory names', () => {
        expect(dirToBaseHref('E:\\a#b\\c?d\\file.md')).toBe('file:///E:/a%23b/c%3Fd/')
    })

    it('should keep legacy UNC shape (four slashes)', () => {
        expect(dirToBaseHref('\\\\server\\share\\dir\\a.md')).toBe('file:////server/share/dir/')
    })

    it('should keep original behavior when path has no separator', () => {
        // 原实现：无分隔符时 dir = 原路径（不补斜杠），保持逐字对齐
        expect(dirToBaseHref('notes.md')).toBe('file:///notes.md')
        expect(dirToBaseHref('')).toBe('file:///')
    })

    it('should be equivalent to the html-view-utils original implementation', () => {
        const samples = [
            'E:\\notes\\a.md',
            '/notes/a.md',
            'E:\\笔记 目录\\图 1.png',
            'E:\\a#b\\c?d\\file.md',
            '\\\\server\\share\\dir\\a.md',
            'notes.md',
            ''
        ]
        for (const sample of samples) {
            expect(dirToBaseHref(sample)).toBe(referenceDirToBaseHref(sample))
        }
    })
})

/* ============================== path.ts：比较归一化/包含判定 ============================== */

describe('normalizePathForCompare', () => {
    it('should trim trailing separators', () => {
        expect(normalizePathForCompare('/notes/', false)).toBe('/notes')
        expect(normalizePathForCompare('/notes///', false)).toBe('/notes')
        expect(normalizePathForCompare('C:/notes/', false)).toBe('C:/notes')
        expect(normalizePathForCompare('E:\\Notes\\', false)).toBe('E:/Notes')
    })

    it('should lowercase only when win32CaseInsensitive is true', () => {
        expect(normalizePathForCompare('E:\\Notes\\A.md', true)).toBe('e:/notes/a.md')
        expect(normalizePathForCompare('E:\\Notes\\A.md', false)).toBe('E:/Notes/A.md')
        expect(normalizePathForCompare('//Server/Share/', true)).toBe('//server/share')
        expect(normalizePathForCompare('//SERVER/SHARE', false)).toBe('//SERVER/SHARE')
    })

    it('should keep root markers (POSIX root, drive root, UNC share root)', () => {
        expect(normalizePathForCompare('/', false)).toBe('/')
        expect(normalizePathForCompare('C:\\', true)).toBe('c:')
        expect(normalizePathForCompare('//server/share', false)).toBe('//server/share')
        expect(normalizePathForCompare('', false)).toBe('')
    })

    it('should lexically fold . and .. (security.ts path.normalize semantics)', () => {
        expect(normalizePathForCompare('/notes/a/../b', false)).toBe('/notes/b')
        expect(normalizePathForCompare('/notes/./a/', false)).toBe('/notes/a')
        expect(normalizePathForCompare('/../etc', false)).toBe('/etc')
        expect(normalizePathForCompare('//server/share/notes/../a', false)).toBe('//server/share/a')
        expect(normalizePathForCompare('a/../b', false)).toBe('b')
        expect(normalizePathForCompare('../a', false)).toBe('../a')
        expect(normalizePathForCompare('a/../../b', false)).toBe('../b')
    })
})

describe('isPathWithin', () => {
    it('should accept root itself and direct/descendant children', () => {
        expect(isPathWithin('/notes', '/notes')).toBe(true)
        expect(isPathWithin('/notes/', '/notes')).toBe(true)
        expect(isPathWithin('/notes/a.md', '/notes')).toBe(true)
        expect(isPathWithin('/notes/sub/deep/a.md', '/notes')).toBe(true)
        expect(isPathWithin('/notes/a.md', '/notes/')).toBe(true)
    })

    it('should reject sibling paths with a common prefix', () => {
        expect(isPathWithin('/notes2/a.md', '/notes')).toBe(false)
        expect(isPathWithin('/notes-other', '/notes')).toBe(false)
    })

    it('should reject .. escapes and accept internal .. folding', () => {
        expect(isPathWithin('/notes/../etc/passwd', '/notes')).toBe(false)
        expect(isPathWithin('/notes/..', '/notes')).toBe(false)
        expect(isPathWithin('/notes/sub/../a.md', '/notes')).toBe(true)
        expect(isPathWithin('/notes/sub/../../etc', '/notes')).toBe(false)
    })

    it('should normalize POSIX backslashes before comparing', () => {
        expect(isPathWithin('\\notes\\sub\\a.md', '/notes')).toBe(true)
        expect(isPathWithin('/notes\\sub\\a.md', '/notes')).toBe(true)
        expect(isPathWithin('\\notes\\..\\etc', '/notes')).toBe(false)
    })

    it('should compare Windows paths case-insensitively only when requested', () => {
        expect(isPathWithin('C:\\NOTES\\a.md', 'C:/notes', { win32CaseInsensitive: true })).toBe(
            true
        )
        expect(isPathWithin('C:\\NOTES\\a.md', 'C:/notes')).toBe(false)
        expect(isPathWithin('C:\\Notes\\a.md', 'C:\\Notes')).toBe(true)
    })

    it('should handle UNC paths', () => {
        expect(isPathWithin('\\\\server\\share\\notes\\a.md', '\\\\server\\share\\notes')).toBe(
            true
        )
        expect(isPathWithin('\\\\server\\share\\notes', '\\\\server\\share\\notes')).toBe(true)
        expect(isPathWithin('\\\\server\\share\\other\\a.md', '\\\\server\\share\\notes')).toBe(
            false
        )
        expect(isPathWithin('\\\\server\\share\\a.md', '\\\\server\\share')).toBe(true)
    })

    it('should handle filesystem root and drive root', () => {
        expect(isPathWithin('/a', '/')).toBe(true)
        expect(isPathWithin('/', '/')).toBe(true)
        expect(isPathWithin('C:/a', '/')).toBe(false)
        expect(isPathWithin('C:\\a', 'C:\\')).toBe(true)
        expect(isPathWithin('C:\\a', 'C:')).toBe(true)
        expect(isPathWithin('D:\\a', 'C:\\')).toBe(false)
    })

    it('should treat empty root as invalid for non-empty children', () => {
        expect(isPathWithin('', '')).toBe(true)
        expect(isPathWithin('/a', '')).toBe(false)
    })
})

/* ============================== path.ts：文件名/目录解析 ============================== */

describe('getBaseName / getExtension', () => {
    it('should extract base name across separators', () => {
        expect(getBaseName('/notes/a.md')).toBe('a.md')
        expect(getBaseName('E:\\notes\\a.md')).toBe('a.md')
        expect(getBaseName('a.md')).toBe('a.md')
        expect(getBaseName('/notes/')).toBe('')
        expect(getBaseName('E:\\notes')).toBe('notes')
        expect(getBaseName('C:\\')).toBe('')
        expect(getBaseName('')).toBe('')
    })

    it('should return lowercase extension without dot', () => {
        expect(getExtension('/notes/a.md')).toBe('md')
        expect(getExtension('E:\\notes\\A.MD')).toBe('md')
        expect(getExtension('archive.tar.GZ')).toBe('gz')
        expect(getExtension('E:\\notes\\archive.tar.gz')).toBe('gz')
    })

    it('should treat dot-less / hidden / trailing-dot names as no extension', () => {
        expect(getExtension('/notes/a')).toBe('')
        expect(getExtension('/notes/.gitignore')).toBe('')
        expect(getExtension('a.')).toBe('')
        expect(getExtension('')).toBe('')
        expect(getExtension('/notes/')).toBe('')
    })

    it('should be equivalent to preview-md-blocks getLowerExtension (dot stripped)', () => {
        const samples = ['/notes/a.md', '/notes/A.MD', '/notes/.gitignore', '/notes/archive.tar.gz']
        for (const sample of samples) {
            expect(getExtension(sample)).toBe(referenceGetLowerExtension(sample).slice(1))
        }
    })
})

describe('parseDirectoryPath', () => {
    it('should extract directory part for normal paths', () => {
        expect(parseDirectoryPath('/notes/a.md')).toBe('/notes')
        expect(parseDirectoryPath('E:\\notes\\a.md')).toBe('E:\\notes')
        // 原实现取 substring(0, lastIndex)，分隔符本身也会被截掉
        expect(parseDirectoryPath('relative/file.md')).toBe('relative')
    })

    it('should keep the special "no dot means original path" semantics', () => {
        // 整个路径没有 `.` → 原样返回（不按分隔符截断），与主进程 ParseDirectoryPath 一致
        expect(parseDirectoryPath('/notes/folder')).toBe('/notes/folder')
        expect(parseDirectoryPath('E:\\notes\\folder')).toBe('E:\\notes\\folder')
    })

    it('should return empty string for dot-name without separator (substring(0,-1))', () => {
        expect(parseDirectoryPath('file.md')).toBe('')
        expect(parseDirectoryPath('.hidden')).toBe('')
    })

    it('should use the last separator between backslash and slash', () => {
        expect(parseDirectoryPath('C:\\dir.with.dot\\file')).toBe('C:\\dir.with.dot')
        expect(parseDirectoryPath('E:/notes/sub\\a.md')).toBe(
            referenceParseDirectoryPath('E:/notes/sub\\a.md')
        )
    })

    it('should be equivalent to the main-process original implementation', () => {
        const samples = [
            '/notes/a.md',
            'E:\\notes\\a.md',
            '/notes/folder',
            'E:\\notes\\folder',
            'relative/file.md',
            'file.md',
            '.hidden',
            'C:\\dir.with.dot\\file',
            'E:/notes/sub\\a.md',
            '',
            '/'
        ]
        for (const sample of samples) {
            expect(parseDirectoryPath(sample)).toBe(referenceParseDirectoryPath(sample))
        }
    })
})

/* ============================== hash.ts ============================== */

describe('fnv1a32 / fnv1a32Mix / toRadixString', () => {
    it('should expose the same constants as the four original implementations', () => {
        expect(FNV_OFFSET_BASIS).toBe(0x811c9dc5)
        expect(FNV_PRIME).toBe(0x01000193)
    })

    it('should match known values generated by the existing implementations', () => {
        // 期望值由 directory-tree.ts:466-474 / hemy-editor-render.ts:73-83 的原算法生成
        expect(fnv1a32('')).toBe(2166136261)
        expect(fnv1a32('a')).toBe(3826002220)
        expect(fnv1a32('abc')).toBe(440920331)
        expect(fnv1a32('hello')).toBe(1335831723)
        expect(fnv1a32('白泽笔记')).toBe(2291420899)
        expect(fnv1a32('The quick brown fox jumps over the lazy dog')).toBe(76545936)
        expect(fnv1a32('E:/notes/README.md')).toBe(1517442970)
        expect(fnv1a32('src\\main\\utils\\security.ts')).toBe(163512718)
    })

    it('should keep the original radix conversion semantics (hash >>> 0 then toString)', () => {
        expect(toRadixString(fnv1a32('hello'), 16)).toBe('4f9f2cab')
        expect(toRadixString(fnv1a32('hello'), 36)).toBe('m3bicr')
        expect(toRadixString(fnv1a32(''), 36)).toBe('ztntfp')
        // 负数按 >>> 0 转成无符号 32 位（与原实现 `(hash >>> 0)` 一致）
        expect(toRadixString(-1, 16)).toBe('ffffffff')
        expect(() => toRadixString(1, 1)).toThrow(RangeError)
    })

    it('fnv1a32Mix should be the incremental form of fnv1a32', () => {
        for (const sample of ['', 'abc', '白泽笔记', 'E:/notes/README.md']) {
            // fnv1a32Mix 返回有符号 32 位（Math.imul 语义），>>> 0 后与 fnv1a32 等价
            expect(fnv1a32Mix(FNV_OFFSET_BASIS, sample) >>> 0).toBe(fnv1a32(sample))
        }
    })

    it('should reproduce ResourceManager.ComputeTocSignature (PF-8 fingerprint)', () => {
        // 期望值由 resource-manager.ts:36-57 原实现生成（level 为字符串，与 MarkdownTOC 一致）
        const mixString = (hash: number, value: string): number => fnv1a32Mix(hash, value)
        const computeTocSignature = (
            toc: Array<{ id: string; level: string; text: string }>
        ): number => {
            let hash = FNV_OFFSET_BASIS
            hash = mixString(hash, String(toc.length))
            for (const item of toc) {
                hash = mixString(hash, '\u0000')
                hash = mixString(hash, item.id)
                hash = mixString(hash, '\u0001')
                hash = mixString(hash, item.level)
                hash = mixString(hash, '\u0002')
                hash = mixString(hash, item.text)
            }
            return hash >>> 0
        }
        const toc = [
            { id: 'h-1', level: '1', text: '标题' },
            { id: 'h-2', level: '2', text: 'Sub' }
        ]
        expect(computeTocSignature(toc)).toBe(789331450)
        expect(
            computeTocSignature([
                { id: 'h-1', level: '1', text: '标题' },
                { id: 'h-2', level: '2', text: '改过的标题' }
            ])
        ).not.toBe(789331450)
    })

    it('should reproduce preview-chapters.ComputeChaptersFingerprint', () => {
        // 期望值由 preview-chapters.ts:59-79 原实现生成（候选标题行 + 行号混入）
        const containerPrefix = '(?:[\\s>]|(?:[-*+]|\\d+[.)])\\s+)*'
        const atxCandidate = new RegExp(`^${containerPrefix}#{1,6}(?:\\s|$)`)
        const setextCandidate = new RegExp(`^${containerPrefix}[-=]+[\\s>]*$`)
        const computeFingerprint = (text: string): number => {
            let hash = FNV_OFFSET_BASIS
            let lineNumber = 0
            let lineStart = 0
            for (let index = 0; index <= text.length; index += 1) {
                if (index !== text.length && text.charCodeAt(index) !== 10) {
                    continue
                }
                const rawLine = text.slice(lineStart, index)
                const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine
                lineStart = index + 1
                if (atxCandidate.test(line) || setextCandidate.test(line)) {
                    hash = fnv1a32Mix(hash, `${lineNumber}\u0000${line}\u0001`)
                }
                lineNumber += 1
            }
            return hash >>> 0
        }
        const markdown =
            ['# 标题', '', '正文', '', '## 二级标题', '', '```', 'code', '```'].join('\n') + '\n'
        expect(computeFingerprint(markdown)).toBe(2328501271)
        // CRLF 表示应得到相同指纹（原实现会去掉行尾 \r）
        expect(computeFingerprint(markdown.replace(/\n/g, '\r\n'))).toBe(2328501271)
        // 标题变化 → 指纹变化
        expect(computeFingerprint(markdown.replace('## 二级标题', '## 改过的标题'))).not.toBe(
            2328501271
        )
    })
})

/* ============================== lru-cache.ts ============================== */

describe('LRUCache', () => {
    it('should store/get/has/clear and expose size', () => {
        const cache = new LRUCache<string>(2)
        expect(cache.size).toBe(0)
        expect(cache.get('missing')).toBeUndefined()
        cache.set('a', 'A')
        expect(cache.has('a')).toBe(true)
        expect(cache.get('a')).toBe('A')
        expect(cache.size).toBe(1)
        cache.clear()
        expect(cache.size).toBe(0)
        expect(cache.has('a')).toBe(false)
    })

    it('should promote hit entries and evict the least recently used one', () => {
        const cache = new LRUCache<string>(2)
        cache.set('a', 'A')
        cache.set('b', 'B')
        // 命中 a → a 变最新，b 变最旧
        expect(cache.get('a')).toBe('A')
        cache.set('c', 'C')
        expect(cache.has('a')).toBe(true)
        expect(cache.has('b')).toBe(false)
        expect(cache.has('c')).toBe(true)
        expect(cache.size).toBe(2)
    })

    it('should promote existing key on re-set (standard LRU semantics)', () => {
        const cache = new LRUCache<string>(2)
        cache.set('a', 'A1')
        cache.set('b', 'B')
        cache.set('a', 'A2')
        cache.set('c', 'C')
        expect(cache.has('a')).toBe(true)
        expect(cache.get('a')).toBe('A2')
        expect(cache.has('b')).toBe(false)
        expect(cache.has('c')).toBe(true)
    })

    it('should evict oldest entry when exceeding max entries', () => {
        const cache = new LRUCache<number>(3)
        cache.set('k1', 1)
        cache.set('k2', 2)
        cache.set('k3', 3)
        cache.set('k4', 4)
        expect(cache.has('k1')).toBe(false)
        expect(cache.size).toBe(3)
        expect([cache.get('k2'), cache.get('k3'), cache.get('k4')]).toEqual([2, 3, 4])
    })

    it('should work with capacity 1', () => {
        const cache = new LRUCache<string>(1)
        cache.set('a', 'A')
        cache.set('b', 'B')
        expect(cache.has('a')).toBe(false)
        expect(cache.get('b')).toBe('B')
        expect(cache.size).toBe(1)
    })

    it('should reject invalid capacities', () => {
        for (const invalid of [0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
            expect(() => new LRUCache<string>(invalid)).toThrow(RangeError)
        }
    })

    it('should be equivalent to the four existing Map-based implementations', () => {
        // 参考实现逐字对齐 plantuml-local.ts:181-199 / hemy-editor-render.ts:270-289 /
        // preview-local-render.ts:57-73 的 get/set 组合
        const reference = (() => {
            const max = 3
            const store = new Map<string, string>()
            return {
                get: (key: string): string | null => {
                    const cached = store.get(key)
                    if (!cached) {
                        return null
                    }
                    store.delete(key)
                    store.set(key, cached)
                    return cached
                },
                set: (key: string, value: string): void => {
                    if (store.size >= max) {
                        const oldestKey = store.keys().next().value
                        if (oldestKey !== undefined) {
                            store.delete(oldestKey)
                        }
                    }
                    store.set(key, value)
                },
                has: (key: string): boolean => store.has(key),
                size: (): number => store.size
            }
        })()
        const cache = new LRUCache<string>(3)
        const operations: Array<[string, string]> = [
            ['set', 'a'],
            ['set', 'b'],
            ['get', 'a'],
            ['set', 'c'],
            ['set', 'd'],
            ['get', 'b'],
            ['set', 'e'],
            ['get', 'c']
        ]
        for (const [operation, key] of operations) {
            if (operation === 'set') {
                reference.set(key, key.toUpperCase())
                cache.set(key, key.toUpperCase())
            } else {
                expect(cache.get(key)).toBe(reference.get(key) ?? undefined)
            }
            expect(cache.size).toBe(reference.size())
            for (const candidate of ['a', 'b', 'c', 'd', 'e']) {
                expect(cache.has(candidate)).toBe(reference.has(candidate))
            }
        }
    })
})

/* ============================== html.ts ============================== */

describe('escapeHtml', () => {
    it('should escape the five HTML special characters', () => {
        expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;')
    })

    it('should escape & first so existing entities are not decoded again', () => {
        expect(escapeHtml('&lt;b&gt;')).toBe('&amp;lt;b&amp;gt;')
    })

    it('should keep plain text / Unicode / empty strings untouched', () => {
        expect(escapeHtml('普通标题 2026-11-19')).toBe('普通标题 2026-11-19')
        expect(escapeHtml('')).toBe('')
    })
})

describe('injectIntoHead', () => {
    const tag = '<meta http-equiv="Content-Security-Policy" content="x">'

    it('should insert after existing <head> tag with 4-space indent', () => {
        expect(injectIntoHead('<html><head><meta charset="utf-8"></head></html>', tag)).toBe(
            '<html><head>\n    ' + tag + '<meta charset="utf-8"></head></html>'
        )
    })

    it('should support <head> tags with attributes', () => {
        expect(injectIntoHead('<html><head data-x="1"></head></html>', tag)).toBe(
            '<html><head data-x="1">\n    ' + tag + '</head></html>'
        )
    })

    it('should add a <head> block when only <html> exists', () => {
        expect(injectIntoHead('<html><body>hi</body></html>', tag)).toBe(
            `<html>\n<head>${tag}</head><body>hi</body></html>`
        )
    })

    it('should prepend the tag when neither <head> nor <html> exists', () => {
        expect(injectIntoHead('<div>hi</div>', tag)).toBe(`${tag}\n<div>hi</div>`)
        expect(injectIntoHead('', tag)).toBe(`${tag}\n`)
    })

    it('should match tags case-insensitively', () => {
        expect(injectIntoHead('<HTML><HEAD></HEAD></HTML>', tag)).toBe(
            `<HTML><HEAD>\n    ${tag}</HEAD></HTML>`
        )
    })

    it('should not be idempotent (caller handles duplicate prevention)', () => {
        const once = injectIntoHead('<html><head></head></html>', tag)
        const twice = injectIntoHead(once, tag)
        expect(twice.split(tag)).toHaveLength(3)
    })

    it('should be equivalent to html-view-utils.withBaseHref when composing base tag', () => {
        const htmlSamples = [
            '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body></body></html>',
            '<html><head data-x="1"></head><body></body></html>',
            '<html><body>content</body></html>',
            '<div>content</div>'
        ]
        const filePaths = ['E:\\notes\\a.md', '/notes/a.md', 'E:\\笔记 目录\\a.md']
        for (const html of htmlSamples) {
            for (const filePath of filePaths) {
                const injected = injectIntoHead(html, `<base href="${dirToBaseHref(filePath)}">`)
                expect(injected).toBe(referenceWithBaseHref(html, filePath))
            }
        }
    })

    it('should be equivalent to dialog-defaults.withDialogCsp injection branches', () => {
        const cspTag = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">'
        const htmlSamples = [
            '<html><head><title>t</title></head><body></body></html>',
            '<html><body></body></html>',
            '<p>no html tag</p>'
        ]
        for (const html of htmlSamples) {
            // 参考实现：dialog-defaults.ts:47-53 的三分支（CSP 幂等判断由调用方负责，这里输入不含 CSP）
            let expected: string
            if (/<head(\s[^>]*)?>/i.test(html)) {
                expected = html.replace(/<head(\s[^>]*)?>/i, (m) => `${m}\n    ${cspTag}`)
            } else if (/<html(\s[^>]*)?>/i.test(html)) {
                expected = html.replace(/<html(\s[^>]*)?>/i, (m) => `${m}\n<head>${cspTag}</head>`)
            } else {
                expected = `${cspTag}\n${html}`
            }
            expect(injectIntoHead(html, cspTag)).toBe(expected)
        }
    })
})

/* ============================== random.ts ============================== */

describe('randomDigits / randomAlnum / uniqueSuffix', () => {
    it('randomDigits should produce digits with the requested length', () => {
        expect(randomDigits(0)).toBe('')
        expect(randomDigits(-3)).toBe('')
        expect(randomDigits(12)).toMatch(/^\d{12}$/)
        expect(randomDigits(1)).toMatch(/^\d$/)
    })

    it('randomDigits should use Math.floor(random * 10) per digit', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        expect(randomDigits(4)).toBe('5555')
        vi.spyOn(Math, 'random').mockReturnValue(0)
        expect(randomDigits(3)).toBe('000')
    })

    it('randomAlnum should produce alphanumeric strings with the requested length', () => {
        expect(randomAlnum(0)).toBe('')
        expect(randomAlnum(32)).toMatch(/^[A-Za-z0-9]{32}$/)
    })

    it('randomAlnum should use the original character set order', () => {
        vi.spyOn(Math, 'random').mockReturnValue(0)
        expect(randomAlnum(5)).toBe('AAAAA')
        // 0.999999 * 62 → charAt(61) 是字符集末位数字 '9'
        vi.spyOn(Math, 'random').mockReturnValue(0.999999)
        expect(randomAlnum(3)).toBe('999')
    })

    it('uniqueSuffix should be Date.now() + ":" + 9 base36 chars', () => {
        vi.spyOn(Date, 'now').mockReturnValue(1700000000000)
        vi.spyOn(Math, 'random').mockReturnValue(0.5)
        // 0.5.toString(36) === '0.i' → slice(2, 11) === 'i'
        expect(uniqueSuffix()).toBe('1700000000000:i')
        vi.restoreAllMocks()
        expect(uniqueSuffix()).toMatch(/^\d+:[0-9a-z]{0,9}$/)
    })
})

/* ============================== validate.ts ============================== */

describe('hasControlChars', () => {
    it('should detect NUL/newline/tab/DEL and other C0 controls', () => {
        expect(hasControlChars('\u0000')).toBe(true)
        expect(hasControlChars('a\u001fb')).toBe(true)
        expect(hasControlChars('\t\n\r')).toBe(true)
        expect(hasControlChars('\u007f')).toBe(true)
    })

    it('should accept normal text (including C1 range and Unicode)', () => {
        expect(hasControlChars('')).toBe(false)
        expect(hasControlChars('普通文本')).toBe(false)
        expect(hasControlChars('E:\\notes\\a.md')).toBe(false)
        expect(hasControlChars('\u0080')).toBe(false)
    })

    it('should return false for non-string unknown inputs', () => {
        expect(hasControlChars(null)).toBe(false)
        expect(hasControlChars(undefined)).toBe(false)
        expect(hasControlChars(123)).toBe(false)
        expect(hasControlChars({})).toBe(false)
    })
})

describe('isPlainObject', () => {
    it('should accept plain objects and reject arrays/null/primitives/functions', () => {
        expect(isPlainObject({})).toBe(true)
        expect(isPlainObject({ a: 1 })).toBe(true)
        expect(isPlainObject(Object.create(null))).toBe(true)
        expect(isPlainObject([])).toBe(false)
        expect(isPlainObject(null)).toBe(false)
        expect(isPlainObject('x')).toBe(false)
        expect(isPlainObject(1)).toBe(false)
        expect(isPlainObject(() => undefined)).toBe(false)
    })
})

describe('isFiniteNumber', () => {
    it('should accept finite numbers only', () => {
        expect(isFiniteNumber(0)).toBe(true)
        expect(isFiniteNumber(-1.5)).toBe(true)
        expect(isFiniteNumber(Number.MAX_SAFE_INTEGER)).toBe(true)
        expect(isFiniteNumber(Number.NaN)).toBe(false)
        expect(isFiniteNumber(Number.POSITIVE_INFINITY)).toBe(false)
        expect(isFiniteNumber('1')).toBe(false)
        expect(isFiniteNumber(null)).toBe(false)
        expect(isFiniteNumber(undefined)).toBe(false)
    })
})

describe('clampNumber', () => {
    it('should clamp to [min, max] and keep in-range values', () => {
        expect(clampNumber(5, 0, 10)).toBe(5)
        expect(clampNumber(0, 0, 10)).toBe(0)
        expect(clampNumber(10, 0, 10)).toBe(10)
        expect(clampNumber(-1, 0, 10)).toBe(0)
        expect(clampNumber(11, 0, 10)).toBe(10)
        expect(clampNumber(-1.5, 0, 10)).toBe(0)
    })

    it('should clamp infinities to bounds', () => {
        expect(clampNumber(Number.POSITIVE_INFINITY, 0, 10)).toBe(10)
        expect(clampNumber(Number.NEGATIVE_INFINITY, 0, 10)).toBe(0)
    })

    it('should fall back to min for NaN (documented difference from config-schema null)', () => {
        expect(clampNumber(Number.NaN, 0, 10)).toBe(0)
    })

    it('should be equivalent to config-schema clamp branch for finite values', () => {
        const samples = [-100, -1, 0, 3, 10, 11, 100, 13.5]
        for (const sample of samples) {
            expect(clampNumber(sample, 0, 10)).toBe(referenceClampNumber(sample, 0, 10))
        }
    })
})

/* ============================== format.ts ============================== */

describe('formatFileSize', () => {
    it('should format bytes below 1KB as integer B', () => {
        expect(formatFileSize(0)).toBe('0 B')
        expect(formatFileSize(1)).toBe('1 B')
        expect(formatFileSize(1023)).toBe('1023 B')
        expect(formatFileSize(1023.9)).toBe('1023 B')
    })

    it('should format KB/MB/GB with two decimals and a space', () => {
        expect(formatFileSize(1024)).toBe('1.00 KB')
        expect(formatFileSize(1536)).toBe('1.50 KB')
        expect(formatFileSize(1024 * 1024)).toBe('1.00 MB')
        expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.50 MB')
        expect(formatFileSize(1024 * 1024 * 1024)).toBe('1.00 GB')
        expect(formatFileSize(2.25 * 1024 * 1024 * 1024)).toBe('2.25 GB')
    })

    it('should keep GB unit beyond 1TB', () => {
        expect(formatFileSize(1024 * 1024 * 1024 * 1024)).toBe('1024.00 GB')
    })

    it('should normalize invalid/negative inputs to 0 B', () => {
        expect(formatFileSize(-1)).toBe('0 B')
        expect(formatFileSize(Number.NaN)).toBe('0 B')
        expect(formatFileSize(Number.POSITIVE_INFINITY)).toBe('0 B')
    })

    it('should always match the unified format pattern', () => {
        for (const bytes of [0, 1, 1023, 1024, 1536, 1024 * 1024, 3 * 1024 * 1024 * 1024]) {
            expect(formatFileSize(bytes)).toMatch(/^\d+(\.\d{2})? (B|KB|MB|GB)$/)
        }
    })
})

/* ============================== concurrency.ts ============================== */

describe('limitConcurrency', () => {
    it('should keep results in task order', async () => {
        const tasks = [
            () => Promise.resolve(1),
            async (): Promise<number> => {
                await new Promise<void>((resolve) => setTimeout(resolve, 5))
                return 2
            },
            () => Promise.resolve(3)
        ]
        await expect(limitConcurrency(tasks, 2)).resolves.toEqual([1, 2, 3])
    })

    it('should return empty array for empty tasks', async () => {
        await expect(limitConcurrency<number>([], 2)).resolves.toEqual([])
    })

    it('should not exceed concurrency limit', async () => {
        vi.useFakeTimers()
        try {
            let active = 0
            let maxActive = 0
            const tasks = Array.from({ length: 6 }, (_, index) => async (): Promise<number> => {
                active += 1
                maxActive = Math.max(maxActive, active)
                await new Promise<void>((resolve) => setTimeout(resolve, 10))
                active -= 1
                return index
            })
            const pending = limitConcurrency(tasks, 2)
            await vi.runAllTimersAsync()
            await expect(pending).resolves.toEqual([0, 1, 2, 3, 4, 5])
            expect(maxActive).toBe(2)
        } finally {
            vi.useRealTimers()
        }
    })

    it('should execute serially when concurrency is 0 (legacy behavior)', async () => {
        vi.useFakeTimers()
        try {
            let active = 0
            let maxActive = 0
            const tasks = Array.from({ length: 3 }, (_, index) => async (): Promise<number> => {
                active += 1
                maxActive = Math.max(maxActive, active)
                await new Promise<void>((resolve) => setTimeout(resolve, 1))
                active -= 1
                return index
            })
            const pending = limitConcurrency(tasks, 0)
            await vi.runAllTimersAsync()
            await pending
            expect(maxActive).toBe(1)
        } finally {
            vi.useRealTimers()
        }
    })

    it('should run all tasks in parallel when concurrency exceeds task count', async () => {
        vi.useFakeTimers()
        try {
            let active = 0
            let maxActive = 0
            const tasks = Array.from({ length: 4 }, (_, index) => async (): Promise<number> => {
                active += 1
                maxActive = Math.max(maxActive, active)
                await new Promise<void>((resolve) => setTimeout(resolve, 1))
                active -= 1
                return index
            })
            const pending = limitConcurrency(tasks, 10)
            await vi.runAllTimersAsync()
            await pending
            expect(maxActive).toBe(4)
        } finally {
            vi.useRealTimers()
        }
    })

    it('should store task rejection as the result value (legacy behavior)', async () => {
        const boom = new Error('boom')
        const tasks: Array<() => Promise<number | Error>> = [
            async () => {
                throw boom
            },
            async () => 2
        ]
        const results = await limitConcurrency(tasks, 2)
        expect(results[0]).toBe(boom)
        expect(results[1]).toBe(2)
    })
})

describe('createSemaphore', () => {
    it('should allow acquiring up to max immediately', async () => {
        const semaphore = createSemaphore(2)
        const releaseFirst = await semaphore.acquire()
        const releaseSecond = await semaphore.acquire()
        expect(typeof releaseFirst).toBe('function')
        expect(typeof releaseSecond).toBe('function')
        releaseFirst()
        releaseSecond()
    })

    it('should queue waiters and hand over the slot on release (FIFO)', async () => {
        const semaphore = createSemaphore(1)
        const releaseFirst = await semaphore.acquire()
        const acquiredOrder: number[] = []
        const waitOne = semaphore.acquire().then((release) => {
            acquiredOrder.push(1)
            return release
        })
        const waitTwo = semaphore.acquire().then((release) => {
            acquiredOrder.push(2)
            return release
        })
        await Promise.resolve()
        expect(acquiredOrder).toEqual([])
        releaseFirst()
        const releaseWaiterOne = await waitOne
        expect(acquiredOrder).toEqual([1])
        // 第二个等待者仍未获得名额
        await Promise.resolve()
        expect(acquiredOrder).toEqual([1])
        releaseWaiterOne()
        const releaseWaiterTwo = await waitTwo
        expect(acquiredOrder).toEqual([1, 2])
        releaseWaiterTwo()
    })

    it('should make release idempotent and allow new acquires afterwards', async () => {
        const semaphore = createSemaphore(1)
        const release = await semaphore.acquire()
        release()
        release()
        release()
        const releaseAgain = await semaphore.acquire()
        expect(typeof releaseAgain).toBe('function')
        releaseAgain()
    })

    it('should normalize invalid max to 1', async () => {
        const semaphore = createSemaphore(0)
        const release = await semaphore.acquire()
        let secondAcquired = false
        const second = semaphore.acquire().then((value) => {
            secondAcquired = true
            return value
        })
        await Promise.resolve()
        expect(secondAcquired).toBe(false)
        release()
        const releaseSecond = await second
        expect(secondAcquired).toBe(true)
        releaseSecond()
    })

    it('should act as a real concurrency gate', async () => {
        const semaphore = createSemaphore(2)
        let active = 0
        let maxActive = 0
        const workers = Array.from({ length: 6 }, async () => {
            const release = await semaphore.acquire()
            active += 1
            maxActive = Math.max(maxActive, active)
            await Promise.resolve()
            await Promise.resolve()
            active -= 1
            release()
        })
        await Promise.all(workers)
        expect(maxActive).toBe(2)
    })
})

/* ============================== debounce.ts ============================== */

describe('debounce', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('should invoke once after ms with the latest arguments', () => {
        const fn = vi.fn<(value: string) => void>()
        const debounced = debounce(fn, 100)
        debounced('a')
        debounced('b')
        debounced('c')
        expect(fn).not.toHaveBeenCalled()
        vi.advanceTimersByTime(99)
        expect(fn).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn).toHaveBeenCalledWith('c')
    })

    it('should restart the timer on each call', () => {
        const fn = vi.fn<() => void>()
        const debounced = debounce(fn, 100)
        debounced()
        vi.advanceTimersByTime(60)
        debounced()
        vi.advanceTimersByTime(60)
        expect(fn).not.toHaveBeenCalled()
        vi.advanceTimersByTime(40)
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('cancel should drop the pending invocation', () => {
        const fn = vi.fn<() => void>()
        const debounced = debounce(fn, 100)
        debounced()
        debounced.cancel()
        vi.advanceTimersByTime(1000)
        expect(fn).not.toHaveBeenCalled()
    })

    it('flush should invoke pending call immediately and clear it', () => {
        const fn = vi.fn<(value: number) => void>()
        const debounced = debounce(fn, 100)
        debounced(42)
        debounced.flush()
        expect(fn).toHaveBeenCalledTimes(1)
        expect(fn).toHaveBeenCalledWith(42)
        vi.advanceTimersByTime(1000)
        expect(fn).toHaveBeenCalledTimes(1)
    })

    it('flush without pending call / after cancel should be a no-op', () => {
        const fn = vi.fn<() => void>()
        const debounced = debounce(fn, 100)
        debounced.flush()
        expect(fn).not.toHaveBeenCalled()
        debounced()
        debounced.cancel()
        debounced.flush()
        expect(fn).not.toHaveBeenCalled()
    })

    it('should work again after flush or cancel', () => {
        const fn = vi.fn<(value: string) => void>()
        const debounced = debounce(fn, 100)
        debounced('first')
        debounced.flush()
        debounced('second')
        vi.advanceTimersByTime(100)
        expect(fn).toHaveBeenCalledTimes(2)
        expect(fn).toHaveBeenLastCalledWith('second')
        debounced.cancel()
        debounced('third')
        vi.advanceTimersByTime(100)
        expect(fn).toHaveBeenLastCalledWith('third')
    })
})

/* ============================== date.ts ============================== */

describe('formatDateTime', () => {
    it('should format YYYYMMDD-HHmmss (backup stamp format)', () => {
        const date = new Date(2026, 10, 19, 13, 55, 51)
        expect(formatDateTime(date, 'YYYYMMDD-HHmmss')).toBe('20261119-135551')
    })

    it('should format YYYY-MM-DD HH:mm:ss (default pattern)', () => {
        const date = new Date(2026, 10, 19, 13, 55, 51)
        expect(formatDateTime(date)).toBe('2026-11-19 13:55:51')
        expect(formatDateTime(date, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-11-19 13:55:51')
    })

    it('should zero-pad every field', () => {
        const date = new Date(2026, 0, 1, 0, 0, 0)
        expect(formatDateTime(date, 'YYYYMMDD-HHmmss')).toBe('20260101-000000')
        expect(formatDateTime(date, 'YYYY-MM-DD HH:mm:ss')).toBe('2026-01-01 00:00:00')
        const date2 = new Date(2026, 8, 9, 8, 7, 6)
        expect(formatDateTime(date2, 'YYYYMMDD-HHmmss')).toBe('20260909-080706')
    })

    it('should support partial/custom patterns and keep unknown text', () => {
        const date = new Date(2026, 10, 19, 13, 55, 51)
        expect(formatDateTime(date, 'YYYY/MM/DD')).toBe('2026/11/19')
        expect(formatDateTime(date, 'HH:mm:ss')).toBe('13:55:51')
        expect(formatDateTime(date, '年份=YYYY')).toBe('年份=2026')
        expect(formatDateTime(date, 'YYYY年MM月DD日 HH时mm分ss秒')).toBe(
            '2026年11月19日 13时55分51秒'
        )
    })

    it('should return empty string for invalid date', () => {
        expect(formatDateTime(new Date(Number.NaN))).toBe('')
    })

    it('should be equivalent to the original assembly (textblock.ts / backup modules)', () => {
        const dates = [
            new Date(2026, 10, 19, 13, 55, 51),
            new Date(2026, 0, 1, 0, 0, 0),
            new Date(2026, 8, 9, 8, 7, 6),
            new Date(2025, 11, 31, 23, 59, 59)
        ]
        for (const date of dates) {
            const pad = (value: number): string => String(value).padStart(2, '0')
            const expectedTextblock =
                `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
                ` ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
            const expectedBackup =
                `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
                `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
            expect(formatDateTime(date, 'YYYY-MM-DD HH:mm:ss')).toBe(expectedTextblock)
            expect(formatDateTime(date, 'YYYYMMDD-HHmmss')).toBe(expectedBackup)
        }
    })
})

/* ============================== backup-dir.ts ============================== */

describe('formatBackupStamp', () => {
    it('should format local time as YYYYMMDD-HHmmss', () => {
        expect(formatBackupStamp(new Date(2026, 10, 19, 13, 55, 51))).toBe('20261119-135551')
        expect(formatBackupStamp(new Date(2026, 0, 1, 0, 0, 0))).toBe('20260101-000000')
        expect(formatBackupStamp(new Date(2026, 8, 9, 8, 7, 6))).toBe('20260909-080706')
    })

    it('should be equivalent to the auto-backup/config-backup original assembly', () => {
        const dates = [
            new Date(2026, 10, 19, 13, 55, 51),
            new Date(2026, 0, 1, 0, 0, 0),
            new Date(2025, 11, 31, 23, 59, 59)
        ]
        for (const date of dates) {
            expect(formatBackupStamp(date)).toBe(referenceFormatBackupStamp(date))
        }
    })

    it('should be consistent with formatDateTime', () => {
        const date = new Date(2026, 10, 19, 13, 55, 51)
        expect(formatBackupStamp(date)).toBe(formatDateTime(date, 'YYYYMMDD-HHmmss'))
    })
})

describe('isValidBackupName', () => {
    it('should accept both auto-backup and config-backup names', () => {
        expect(isValidBackupName('20261119-135551')).toBe(true)
        expect(isValidBackupName('20261119-135551-1')).toBe(true)
        expect(isValidBackupName('20261119-135551-12')).toBe(true)
        expect(isValidBackupName('config-backup-20261119-135551')).toBe(true)
        expect(isValidBackupName('config-backup-20261119-135551-3')).toBe(true)
    })

    it('should reject paths, traversal, malformed timestamps and other names', () => {
        for (const invalid of [
            '',
            '20261119-13555',
            '20261119-1355511',
            '2026-11-19-135551',
            '20261119-135551-',
            '20261119-135551-x',
            'prefix-20261119-135551',
            'config-backup-20261119-13555',
            '../20261119-135551',
            '..\\20261119-135551',
            '20261119-135551/../../etc',
            '20261119-135551 ',
            '备份20261119-135551'
        ]) {
            expect(isValidBackupName(invalid)).toBe(false)
        }
    })

    it('should match the two original whitelist regexes', () => {
        const autoPattern = /^\d{8}-\d{6}(-\d+)?$/
        const configPattern = /^config-backup-\d{8}-\d{6}(-\d+)?$/
        const samples = [
            '20261119-135551',
            '20261119-135551-7',
            'config-backup-20261119-135551',
            'config-backup-20261119-135551-7',
            'bad-name',
            'config-backup-bad'
        ]
        for (const sample of samples) {
            expect(isValidBackupName(sample)).toBe(
                autoPattern.test(sample) || configPattern.test(sample)
            )
        }
    })
})

describe('parseBackupStamp', () => {
    it('should round-trip formatBackupStamp', () => {
        const date = new Date(2026, 10, 19, 13, 55, 51)
        const stamp = formatBackupStamp(date)
        expect(parseBackupStamp(stamp)).toBe(date.getTime())
    })

    it('should support config-backup prefix and -N suffix', () => {
        const expected = new Date(2026, 10, 19, 13, 55, 51).getTime()
        expect(parseBackupStamp('config-backup-20261119-135551')).toBe(expected)
        expect(parseBackupStamp('20261119-135551-3')).toBe(expected)
        expect(parseBackupStamp('config-backup-20261119-135551-12')).toBe(expected)
    })

    it('should return null for malformed names', () => {
        for (const invalid of [
            '',
            '20261119-13555',
            'abc',
            '../20261119-135551',
            '2026-11-19 13:55:51'
        ]) {
            expect(parseBackupStamp(invalid)).toBeNull()
        }
    })

    it('should return null for out-of-range calendar fields (stricter than original)', () => {
        // 原实现依赖 Date 静默归一化，月份 13 / 2 月 30 日都能"解析成功"；本实现回读校验
        expect(parseBackupStamp('20261340-000000')).toBeNull()
        expect(parseBackupStamp('20260230-000000')).toBeNull()
        expect(parseBackupStamp('20261119-256099')).toBeNull()
    })
})

describe('resolveBackupDirSafe', () => {
    const root = path.resolve('baize-vitest-backup-root')

    it('should resolve valid backup names inside root', () => {
        const name = '20261119-135551'
        expect(resolveBackupDirSafe(root, name, nodePathApi)).toBe(path.resolve(root, name))
        expect(resolveBackupDirSafe(root, 'config-backup-20261119-135551', nodePathApi)).toBe(
            path.resolve(root, 'config-backup-20261119-135551')
        )
        // 根目录带尾分隔符也能正确解析
        expect(resolveBackupDirSafe(`${root}${path.sep}`, name, nodePathApi)).toBe(
            path.resolve(root, name)
        )
    })

    it('should reject invalid names including traversal and absolute paths', () => {
        for (const invalid of [
            '../evil',
            '..\\evil',
            '../../etc/passwd',
            '/etc/passwd',
            'C:\\Windows\\System32',
            'abc',
            ''
        ]) {
            expect(resolveBackupDirSafe(root, invalid, nodePathApi)).toBeNull()
        }
    })

    it('should go through the injected path api only (no node:path fallback)', () => {
        // 纯注入实现：resolve 只拼接、relative 只裁剪，不与 node:path 产生任何耦合
        const injectedPathApi: PathApi = {
            resolve: (...parts: string[]) => parts.join('/'),
            relative: (from: string, to: string) => to.slice(from.length + 1),
            isAbsolute: (target: string) => target.startsWith('/')
        }
        expect(resolveBackupDirSafe('fake/root', '20261119-135551', injectedPathApi)).toBe(
            'fake/root/20261119-135551'
        )

        // 注入的 relative 返回逃逸结果 → 即便名称合法也必须拒绝（守卫逻辑走注入实现）
        const escapingPathApi: PathApi = {
            resolve: (...parts: string[]) => parts.join('/'),
            relative: () => '..',
            isAbsolute: () => false
        }
        expect(resolveBackupDirSafe('fake/root', '20261119-135551', escapingPathApi)).toBeNull()

        // 注入的 isAbsolute 对 relative 结果返回 true（模拟 Windows 跨盘符）→ 同样拒绝
        const crossDrivePathApi: PathApi = {
            resolve: (...parts: string[]) => parts.join('/'),
            relative: () => 'D:/elsewhere/20261119-135551',
            isAbsolute: () => true
        }
        expect(resolveBackupDirSafe('fake/root', '20261119-135551', crossDrivePathApi)).toBeNull()
    })

    it('should be equivalent to the two original safe-path implementations', () => {
        const samples = ['20261119-135551', '20261119-135551-2', 'config-backup-20261119-135551']
        for (const sample of samples) {
            expect(resolveBackupDirSafe(root, sample, nodePathApi)).toBe(
                referenceResolveBackupDirSafe(root, sample)
            )
        }
    })
})

describe('sortBackupNames', () => {
    it('should sort descending (newest first)', () => {
        const names = ['20260101-000000', '20261231-235959', '20261119-135550', '20261119-135551']
        expect(sortBackupNames(names)).toEqual([
            '20261231-235959',
            '20261119-135551',
            '20261119-135550',
            '20260101-000000'
        ])
    })

    it('should keep the latest N after slice (prune semantics)', () => {
        const names = [
            '20261119-135551',
            '20260101-000000',
            '20261120-000000',
            '20261119-135550',
            '20260301-000000'
        ]
        const sorted = sortBackupNames(names)
        expect(sorted.slice(0, 2)).toEqual(['20261120-000000', '20261119-135551'])
    })

    it('should not mutate the input array', () => {
        const names = ['20260101-000000', '20261231-235959']
        const sorted = sortBackupNames(names)
        expect(sorted).not.toBe(names)
        expect(names).toEqual(['20260101-000000', '20261231-235959'])
    })

    it('should be equivalent to the original list sort comparators', () => {
        const names = [
            '20260101-000000',
            'config-backup-20261119-135551',
            '20261231-235959',
            '20261119-135551-2'
        ]
        expect(sortBackupNames(names)).toEqual(referenceSortBackupNames(names))
    })
})
