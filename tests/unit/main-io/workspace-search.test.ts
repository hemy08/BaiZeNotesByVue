/**
 * A2 全工作区搜索/替换服务单测（主进程，2026-11-21）
 *
 * 覆盖点（对应任务验收：工作区/忽略目录/大小写/正则/超限/失败）：
 * 1. 工作区范围：无工作区/根非法 → NO_WORKSPACE；只搜索 appState.rootPath（不接受渲染层根）；
 * 2. 文件筛选：只读 .md/.markdown/.txt，跳过 node_modules/.git/.ssh 等忽略目录、非文本文件、
 *    符号链接、空文件、超过 2MiB 的文件；
 * 3. 匹配选项：大小写、整词、正则（含非法正则）、行号/列号/预览、相对路径；
 * 4. 上限：maxResults 截断（truncated）与参数钳制；
 * 5. 替换：全部替换（保持 CRLF 行尾）、单处替换（行/列）、正则回填、大小写/整词；
 * 6. 安全失败：路径越界/忽略目录/符号链接 → PATH_DENIED 且不写盘；位置失效 → FILE_CHANGED；
 *    无匹配 → NO_MATCH；写盘异常 → WRITE_FAILED；非法入参 → INVALID_INPUT。
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// 只按类型使用 electron 的模块在单测中无需真实 electron 运行时；保留最小桩避免解析问题
vi.mock('electron', () => ({
    BrowserWindow: class {},
    shell: {}
}))

// 主进程日志依赖 electron/文件系统；服务单测不校验日志落盘，mock 掉避免副作用
vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import { appState } from '../../../src/main/utils/app-state'
import {
    expandReplacementText,
    replaceWorkspace,
    searchWorkspace,
    MAX_WORKSPACE_SEARCH_MATCHES
} from '../../../src/main/utils/workspace-search'

/** 当前用例的工作区根目录（每个用例新建，互不影响） */
let workspaceRoot = ''

/** 写测试文件（自动建父目录） */
function writeFixture(relativePath: string, content: string): string {
    const fullPath = path.join(workspaceRoot, relativePath)
    fs.mkdirSync(path.dirname(fullPath), { recursive: true })
    fs.writeFileSync(fullPath, content, 'utf-8')
    return fullPath
}

/** 读测试文件内容 */
function readFixture(relativePath: string): string {
    return fs.readFileSync(path.join(workspaceRoot, relativePath), 'utf-8')
}

/** 取搜索结果中相对路径集合（便于断言） */
function relativePaths(result: Awaited<ReturnType<typeof searchWorkspace>>): string[] {
    return (result.files ?? []).map((file) => file.relativePath)
}

/** 符号链接能力探测（Windows 非管理员/未开开发者模式时创建会失败） */
const symlinkProbeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-ws-symlink-'))
const symlinkProbeTarget = path.join(symlinkProbeDir, 'target.md')
const symlinkProbeLink = path.join(symlinkProbeDir, 'link.md')
fs.writeFileSync(symlinkProbeTarget, 'hello', 'utf-8')
let symlinkSupported = true
try {
    fs.symlinkSync(symlinkProbeTarget, symlinkProbeLink, 'file')
} catch {
    symlinkSupported = false
}

beforeEach(() => {
    appState._resetForTesting()
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-ws-search-'))
    appState.rootPath = workspaceRoot
    // 基础夹具
    writeFixture('a.md', '# Hello\nworld hello\nHELLO world\n')
    writeFixture('sub/b.markdown', 'foo bar foo\n')
    writeFixture('sub/c.txt', 'hello from txt')
    writeFixture('sub/deep/d.md', 'deep hello')
    writeFixture('node_modules/x.md', 'hello')
    writeFixture('.git/y.md', 'hello')
    writeFixture('.ssh/secret.md', 'hello')
    writeFixture('image.png', 'hello')
    writeFixture('empty.md', '')
    writeFixture('crlf.md', 'hello\r\nworld\r\n')
    writeFixture('word.md', 'helloWorld hello\r\n')
    // 超过单文件大小上限（2 MiB）的文件：内容含 hello 但必须被跳过。
    // 用 truncate 构造稀疏文件，避免每个用例真实写入 2 MiB 触发磁盘/杀软抖动。
    const bigFilePath = path.join(workspaceRoot, 'big.md')
    fs.writeFileSync(bigFilePath, 'hello', 'utf-8')
    fs.truncateSync(bigFilePath, 2 * 1024 * 1024 + 1)
    if (symlinkSupported) {
        // 指向工作区外的符号链接：搜索必须跳过、替换必须拒绝
        fs.symlinkSync(symlinkProbeTarget, path.join(workspaceRoot, 'link.md'), 'file')
        fs.symlinkSync(symlinkProbeDir, path.join(workspaceRoot, 'link-dir'), 'dir')
    }
})

afterEach(() => {
    appState._resetForTesting()
    fs.rmSync(workspaceRoot, { recursive: true, force: true })
})

afterAll(() => {
    fs.rmSync(symlinkProbeDir, { recursive: true, force: true })
})

describe('searchWorkspace：工作区范围', () => {
    it('无工作区根时返回结构化 NO_WORKSPACE', async () => {
        appState.rootPath = ''
        const result = await searchWorkspace({ query: 'hello' })
        expect(result).toMatchObject({ ok: false, code: 'NO_WORKSPACE', files: [] })
    })

    it('工作区根不存在/不是目录时返回 NO_WORKSPACE', async () => {
        appState.rootPath = path.join(workspaceRoot, 'not-exists')
        expect((await searchWorkspace({ query: 'hello' })).code).toBe('NO_WORKSPACE')

        const filePath = path.join(workspaceRoot, 'a.md')
        appState.rootPath = filePath
        expect((await searchWorkspace({ query: 'hello' })).code).toBe('NO_WORKSPACE')
    })

    it('只搜索工作区根（磁盘盘符根被拒绝）', async () => {
        appState.rootPath = path.parse(workspaceRoot).root
        const result = await searchWorkspace({ query: 'hello' })
        expect(result.code).toBe('NO_WORKSPACE')
    })

    it('listFilesOnly 返回文本文件清单并跳过忽略目录/非文本/符号链接', async () => {
        const result = await searchWorkspace({ listFilesOnly: true })
        expect(result.ok).toBe(true)
        const paths = (result.fileList ?? []).map((entry) => entry.relativePath)
        expect(paths).toEqual(
            expect.arrayContaining([
                'a.md',
                'crlf.md',
                'empty.md',
                'word.md',
                'big.md',
                'sub/b.markdown',
                'sub/c.txt',
                'sub/deep/d.md'
            ])
        )
        expect(paths.some((item) => item.startsWith('node_modules/'))).toBe(false)
        expect(paths.some((item) => item.startsWith('.git/'))).toBe(false)
        expect(paths.some((item) => item.startsWith('.ssh/'))).toBe(false)
        expect(paths).not.toContain('image.png')
        if (symlinkSupported) {
            expect(paths).not.toContain('link.md')
            expect(paths.some((item) => item.startsWith('link-dir/'))).toBe(false)
        }
        // fileList 项应携带绝对路径
        const entry = (result.fileList ?? []).find((item) => item.relativePath === 'a.md')
        expect(entry?.filePath).toBe(path.join(workspaceRoot, 'a.md'))
    })

    it('未开启 listFilesOnly 时不返回 fileList', async () => {
        const result = await searchWorkspace({ query: 'hello' })
        expect(result.ok).toBe(true)
        expect(result.fileList).toBeUndefined()
    })

    it('文件清单超过上限时截断并置 truncated', async () => {
        const bulkDir = path.join(workspaceRoot, 'bulk')
        fs.mkdirSync(bulkDir, { recursive: true })
        for (let index = 0; index < 2005; index += 1) {
            fs.writeFileSync(path.join(bulkDir, `bulk-${index}.md`), 'hello', 'utf-8')
        }
        const result = await searchWorkspace({ listFilesOnly: true })
        expect(result.ok).toBe(true)
        expect(result.fileList).toHaveLength(2000)
        expect(result.truncated).toBe(true)
    })

    it('目录扫描深度超过上限时截断（不无限递归）', async () => {
        let current = path.join(workspaceRoot, 'deep')
        fs.mkdirSync(current, { recursive: true })
        for (let depth = 0; depth < 40; depth += 1) {
            current = path.join(current, 'd')
            fs.mkdirSync(current, { recursive: true })
        }
        fs.writeFileSync(path.join(current, 'deep.md'), 'hello', 'utf-8')

        const result = await searchWorkspace({ query: 'hello' })
        expect(result.ok).toBe(true)
        expect(result.truncated).toBe(true)
    })

    it('目录读取失败时跳过该目录，不抛异常', async () => {
        const readdirSpy = vi
            .spyOn(fs.promises, 'readdir')
            .mockRejectedValueOnce(new Error('EACCES: permission denied') as never)
        try {
            const result = await searchWorkspace({ query: 'hello' })
            expect(result.ok).toBe(true)
            expect(result.files).toEqual([])
        } finally {
            readdirSpy.mockRestore()
        }

        const listSpy = vi
            .spyOn(fs.promises, 'readdir')
            .mockRejectedValueOnce(new Error('EACCES: permission denied') as never)
        try {
            const listed = await searchWorkspace({ listFilesOnly: true })
            expect(listed.ok).toBe(true)
            expect(listed.fileList).toEqual([])
        } finally {
            listSpy.mockRestore()
        }
    })

    it('文件状态读取失败时跳过该文件，不抛异常', async () => {
        const lstatSpy = vi
            .spyOn(fs.promises, 'lstat')
            .mockRejectedValueOnce(new Error('ENOENT: gone') as never)
        try {
            const result = await searchWorkspace({ query: 'hello' })
            expect(result.ok).toBe(true)
        } finally {
            lstatSpy.mockRestore()
        }
    })
})

describe('searchWorkspace：匹配选项', () => {
    it('默认不区分大小写，返回行/列/预览与相对路径', async () => {
        const result = await searchWorkspace({ query: 'hello' })
        expect(result.ok).toBe(true)
        const aFile = result.files.find((file) => file.relativePath === 'a.md')
        expect(aFile).toBeDefined()
        expect(aFile?.matches).toEqual([
            { line: 1, column: 3, preview: '# Hello' },
            { line: 2, column: 7, preview: 'world hello' },
            { line: 3, column: 1, preview: 'HELLO world' }
        ])
        // 命中 files 的相对路径已归一化为正斜杠
        expect(result.files.some((file) => file.relativePath === 'sub/b.markdown')).toBe(false)
        expect(result.files.some((file) => file.relativePath === 'sub/c.txt')).toBe(true)
        expect(result.matchCount).toBeGreaterThan(0)
        expect(result.scannedFiles).toBeGreaterThan(0)
        expect(relativePaths(result)).toContain('sub/deep/d.md')
    })

    it('caseSensitive 只命中大小写完全一致的文本', async () => {
        const result = await searchWorkspace({ query: 'hello', caseSensitive: true })
        const aFile = result.files.find((file) => file.relativePath === 'a.md')
        expect(aFile?.matches).toEqual([{ line: 2, column: 7, preview: 'world hello' }])
    })

    it('wholeWord 排除词内匹配（helloWorld 不算 hello）', async () => {
        const result = await searchWorkspace({ query: 'hello', wholeWord: true })
        const wordFile = result.files.find((file) => file.relativePath === 'word.md')
        expect(wordFile?.matches).toEqual([{ line: 1, column: 12, preview: 'helloWorld hello' }])
    })

    it('useRegex 支持正则并校验非法正则', async () => {
        const result = await searchWorkspace({ query: 'h.llo', useRegex: true })
        expect(result.ok).toBe(true)
        expect(result.files.find((file) => file.relativePath === 'a.md')?.matches.length).toBe(3)

        const invalid = await searchWorkspace({ query: '([', useRegex: true })
        expect(invalid).toMatchObject({ ok: false, code: 'INVALID_REGEX' })
    })

    it('空查询/超长查询/非对象入参返回 INVALID_QUERY 或安全结果', async () => {
        expect((await searchWorkspace({ query: '' })).code).toBe('INVALID_QUERY')
        expect((await searchWorkspace({ query: '   ' })).code).toBe('INVALID_QUERY')
        expect((await searchWorkspace({ query: 'a'.repeat(513) })).code).toBe('INVALID_QUERY')
        expect((await searchWorkspace(null)).code).toBe('INVALID_QUERY')
        expect((await searchWorkspace('bad')).code).toBe('INVALID_QUERY')
    })

    it('正则零宽匹配不会死循环（安全返回）', async () => {
        const result = await searchWorkspace({ query: '(?=hello)', useRegex: true })
        expect(result.ok).toBe(true)
        expect(result.matchCount).toBe(0)
    })

    it('跳过超过单文件大小上限的文件与二进制/非文本扩展名', async () => {
        const result = await searchWorkspace({ query: 'hello' })
        const paths = relativePaths(result)
        expect(paths).not.toContain('big.md')
        expect(paths).not.toContain('image.png')
        expect(paths.some((item) => item.startsWith('node_modules/'))).toBe(false)
        expect(paths.some((item) => item.startsWith('.git/'))).toBe(false)
        expect(paths.some((item) => item.startsWith('.ssh/'))).toBe(false)
        expect(paths).not.toContain('empty.md')
    })

    it('超长行预览截断到上限并加省略号', async () => {
        writeFixture('long-line.md', `${'x'.repeat(260)}hello`)
        const result = await searchWorkspace({ query: 'hello' })
        const longFile = result.files.find((file) => file.relativePath === 'long-line.md')
        expect(longFile?.matches[0].column).toBe(261)
        expect(longFile?.matches[0].preview).toHaveLength(201)
        expect(longFile?.matches[0].preview.endsWith('…')).toBe(true)
    })

    it('整词匹配覆盖行首/行尾边界', async () => {
        writeFixture('boundary.md', 'hello middle hello')
        const result = await searchWorkspace({ query: 'hello', wholeWord: true })
        const boundaryFile = result.files.find((file) => file.relativePath === 'boundary.md')
        expect(boundaryFile?.matches.map((match) => match.column)).toEqual([1, 14])
    })

    it('查询比所有行都长时安全返回空结果', async () => {
        writeFixture('short.md', 'ab')
        const result = await searchWorkspace({ query: 'abcdefghij' })
        expect(result.ok).toBe(true)
        expect(result.matchCount).toBe(0)
    })
})

describe('searchWorkspace：结果上限', () => {
    it('maxResults 生效并置 truncated', async () => {
        const result = await searchWorkspace({ query: 'hello', maxResults: 2 })
        expect(result.ok).toBe(true)
        expect(result.matchCount).toBe(2)
        expect(result.truncated).toBe(true)
        expect(result.files.reduce((sum, file) => sum + file.matches.length, 0)).toBe(2)
    })

    it('maxResults 非法/超上限时钳制到实现上限', async () => {
        const tooSmall = await searchWorkspace({ query: 'hello', maxResults: 0 })
        expect(tooSmall.ok).toBe(true)
        expect(tooSmall.matchCount).toBeGreaterThan(0)

        const tooLarge = await searchWorkspace({ query: 'hello', maxResults: 1e9 })
        expect(tooLarge.ok).toBe(true)
        expect(tooLarge.matchCount).toBeLessThanOrEqual(MAX_WORKSPACE_SEARCH_MATCHES)
    })
})

describe('replaceWorkspace：全部替换', () => {
    it('对给定文件做全部匹配替换，并保持 CRLF 行尾', async () => {
        const aPath = path.join(workspaceRoot, 'a.md')
        const crlfPath = path.join(workspaceRoot, 'crlf.md')
        const result = await replaceWorkspace({
            query: 'hello',
            replacement: 'HI',
            filePaths: [aPath, crlfPath]
        })
        expect(result.ok).toBe(true)
        expect(result.totalReplacements).toBe(4)
        expect(result.files.map((file) => file.relativePath).sort()).toEqual(['a.md', 'crlf.md'])
        expect(readFixture('a.md')).toBe('# HI\nworld HI\nHI world\n')
        // CRLF 文件替换后不得被整体改成 LF（行尾保真）
        expect(readFixture('crlf.md')).toBe('HI\r\nworld\r\n')
    })

    it('支持正则捕获组回填（$1/$2/$&/$$）', async () => {
        writeFixture('ref.md', 'foo bar')
        const refPath = path.join(workspaceRoot, 'ref.md')
        const result = await replaceWorkspace({
            query: '(foo) (bar)',
            useRegex: true,
            replacement: '$2 $1',
            filePaths: [refPath]
        })
        expect(result.ok).toBe(true)
        expect(readFixture('ref.md')).toBe('bar foo')

        // 单元级回填覆盖：$& / $$ / 越界组原样保留
        expect(expandReplacementText('[$&]', 'match', [])).toBe('[match]')
        expect(expandReplacementText('$$1', 'match', ['g1'])).toBe('$1')
        expect(expandReplacementText('$9', 'match', ['g1'])).toBe('$9')
    })

    it('wholeWord + caseSensitive 替换只命中目标文本', async () => {
        writeFixture('case.md', 'HELLO hello helloWorld')
        const casePath = path.join(workspaceRoot, 'case.md')
        const result = await replaceWorkspace({
            query: 'hello',
            caseSensitive: true,
            wholeWord: true,
            replacement: 'HI',
            filePaths: [casePath]
        })
        expect(result.ok).toBe(true)
        expect(result.totalReplacements).toBe(1)
        expect(readFixture('case.md')).toBe('HELLO HI helloWorld')
    })

    it('多个文件同一请求重复去重，按去重后文件写盘', async () => {
        const aPath = path.join(workspaceRoot, 'a.md')
        const result = await replaceWorkspace({
            query: 'hello',
            replacement: 'HI',
            filePaths: [aPath, aPath]
        })
        expect(result.ok).toBe(true)
        expect(result.files).toHaveLength(1)
        expect(result.totalReplacements).toBe(3)
    })

    it('无匹配返回 NO_MATCH 且不写盘', async () => {
        const aPath = path.join(workspaceRoot, 'a.md')
        const before = readFixture('a.md')
        const result = await replaceWorkspace({
            query: 'no-such-text',
            replacement: 'x',
            filePaths: [aPath]
        })
        expect(result).toMatchObject({ ok: false, code: 'NO_MATCH' })
        expect(readFixture('a.md')).toBe(before)
    })
})

describe('replaceWorkspace：单处替换', () => {
    it('按行/列只替换目标匹配', async () => {
        const aPath = path.join(workspaceRoot, 'a.md')
        const result = await replaceWorkspace({
            query: 'hello',
            replacement: 'HI',
            filePaths: [aPath],
            line: 2,
            column: 7
        })
        expect(result.ok).toBe(true)
        expect(result.totalReplacements).toBe(1)
        expect(readFixture('a.md')).toBe('# Hello\nworld HI\nHELLO world\n')
    })

    it('缺省列时替换该行首个匹配', async () => {
        const aPath = path.join(workspaceRoot, 'a.md')
        const result = await replaceWorkspace({
            query: 'hello',
            replacement: 'HI',
            filePaths: [aPath],
            line: 1
        })
        expect(result.ok).toBe(true)
        expect(readFixture('a.md')).toBe('# HI\nworld hello\nHELLO world\n')
    })

    it('位置失效（列不匹配）返回 FILE_CHANGED 且不改文件', async () => {
        const aPath = path.join(workspaceRoot, 'a.md')
        const before = readFixture('a.md')
        const result = await replaceWorkspace({
            query: 'hello',
            replacement: 'HI',
            filePaths: [aPath],
            line: 2,
            column: 1
        })
        expect(result).toMatchObject({ ok: false, code: 'FILE_CHANGED' })
        expect(readFixture('a.md')).toBe(before)
    })

    it('行号越界返回 FILE_CHANGED（不误写）', async () => {
        const aPath = path.join(workspaceRoot, 'a.md')
        const before = readFixture('a.md')
        const result = await replaceWorkspace({
            query: 'hello',
            replacement: 'HI',
            filePaths: [aPath],
            line: 999
        })
        expect(result).toMatchObject({ ok: false, code: 'FILE_CHANGED' })
        expect(readFixture('a.md')).toBe(before)
    })
})

describe('replaceWorkspace：安全边界与失败分支', () => {
    it('拒绝工作区外路径（PATH_DENIED，且不写任何文件）', async () => {
        const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-ws-outside-'))
        const outsideFile = path.join(outsideDir, 'outside.md')
        fs.writeFileSync(outsideFile, 'hello', 'utf-8')
        try {
            const result = await replaceWorkspace({
                query: 'hello',
                replacement: 'HI',
                filePaths: [outsideFile]
            })
            expect(result).toMatchObject({ ok: false, code: 'PATH_DENIED' })
            expect(fs.readFileSync(outsideFile, 'utf-8')).toBe('hello')
        } finally {
            fs.rmSync(outsideDir, { recursive: true, force: true })
        }
    })

    it('拒绝忽略目录内的文件与非文本扩展名', async () => {
        expect(
            (
                await replaceWorkspace({
                    query: 'hello',
                    replacement: 'HI',
                    filePaths: [path.join(workspaceRoot, 'node_modules', 'x.md')]
                })
            ).code
        ).toBe('PATH_DENIED')
        expect(
            (
                await replaceWorkspace({
                    query: 'hello',
                    replacement: 'HI',
                    filePaths: [path.join(workspaceRoot, 'image.png')]
                })
            ).code
        ).toBe('PATH_DENIED')
        // 忽略目录内容保持不变
        expect(readFixture('node_modules/x.md')).toBe('hello')
    })

    it.skipIf(!symlinkSupported)('拒绝符号链接目标（PATH_DENIED）', async () => {
        const linkPath = path.join(workspaceRoot, 'link.md')
        const result = await replaceWorkspace({
            query: 'hello',
            replacement: 'HI',
            filePaths: [linkPath]
        })
        expect(result).toMatchObject({ ok: false, code: 'PATH_DENIED' })
        expect(fs.readFileSync(symlinkProbeTarget, 'utf-8')).toBe('hello')
    })

    it('非法入参返回 INVALID_INPUT', async () => {
        const aPath = path.join(workspaceRoot, 'a.md')
        expect((await replaceWorkspace(null)).code).toBe('INVALID_INPUT')
        expect(
            (await replaceWorkspace({ query: 'hello', replacement: 'HI', filePaths: [] })).code
        ).toBe('INVALID_INPUT')
        expect(
            (
                await replaceWorkspace({
                    query: 'hello',
                    replacement: 123,
                    filePaths: [aPath]
                })
            ).code
        ).toBe('INVALID_INPUT')
        expect(
            (
                await replaceWorkspace({
                    query: 'hello',
                    replacement: 'HI',
                    filePaths: [aPath],
                    line: 0
                })
            ).code
        ).toBe('INVALID_INPUT')
        expect(
            (
                await replaceWorkspace({
                    query: 'hello',
                    replacement: 'HI',
                    filePaths: [aPath],
                    line: 1,
                    column: -2
                })
            ).code
        ).toBe('INVALID_INPUT')
        expect(
            (
                await replaceWorkspace({
                    query: 'hello',
                    replacement: 'x'.repeat(4097),
                    filePaths: [aPath]
                })
            ).code
        ).toBe('INVALID_INPUT')
    })

    it('相对路径/设备命名空间/非字符串路径返回 PATH_DENIED', async () => {
        expect(
            (
                await replaceWorkspace({
                    query: 'hello',
                    replacement: 'HI',
                    filePaths: ['relative/a.md']
                })
            ).code
        ).toBe('PATH_DENIED')
        expect(
            (
                await replaceWorkspace({
                    query: 'hello',
                    replacement: 'HI',
                    filePaths: ['\\\\?\\C:\\w\\a.md']
                })
            ).code
        ).toBe('PATH_DENIED')
        expect(
            (
                await replaceWorkspace({
                    query: 'hello',
                    replacement: 'HI',
                    filePaths: [123 as unknown as string]
                })
            ).code
        ).toBe('PATH_DENIED')
        // 工作区根本身不是文件
        expect(
            (
                await replaceWorkspace({
                    query: 'hello',
                    replacement: 'HI',
                    filePaths: [workspaceRoot]
                })
            ).code
        ).toBe('PATH_DENIED')
    })

    it('替换目标状态读取失败/替换前读取失败均返回结构化失败', async () => {
        const aPath = path.join(workspaceRoot, 'a.md')
        const lstatSpy = vi
            .spyOn(fs.promises, 'lstat')
            .mockRejectedValueOnce(new Error('ENOENT: gone') as never)
        try {
            const denied = await replaceWorkspace({
                query: 'hello',
                replacement: 'HI',
                filePaths: [aPath]
            })
            expect(denied.code).toBe('PATH_DENIED')
        } finally {
            lstatSpy.mockRestore()
        }

        const readSpy = vi
            .spyOn(fs.promises, 'readFile')
            .mockRejectedValueOnce(new Error('EACCES: denied') as never)
        try {
            const failed = await replaceWorkspace({
                query: 'hello',
                replacement: 'HI',
                filePaths: [aPath]
            })
            expect(failed.code).toBe('WRITE_FAILED')
        } finally {
            readSpy.mockRestore()
        }
    })

    it('非法正则返回 INVALID_REGEX', async () => {
        const aPath = path.join(workspaceRoot, 'a.md')
        const result = await replaceWorkspace({
            query: '([',
            useRegex: true,
            replacement: 'x',
            filePaths: [aPath]
        })
        expect(result.code).toBe('INVALID_REGEX')
    })

    it('无工作区返回 NO_WORKSPACE', async () => {
        appState.rootPath = ''
        const result = await replaceWorkspace({
            query: 'hello',
            replacement: 'HI',
            filePaths: [path.join(workspaceRoot, 'a.md')]
        })
        expect(result.code).toBe('NO_WORKSPACE')
    })

    it('写盘异常返回 WRITE_FAILED（不抛异常）', async () => {
        const aPath = path.join(workspaceRoot, 'a.md')
        const writeSpy = vi
            .spyOn(fs.promises, 'writeFile')
            .mockRejectedValueOnce(new Error('EACCES: permission denied'))
        try {
            const result = await replaceWorkspace({
                query: 'hello',
                replacement: 'HI',
                filePaths: [aPath]
            })
            expect(result).toMatchObject({ ok: false, code: 'WRITE_FAILED' })
        } finally {
            writeSpy.mockRestore()
        }
    })
})
