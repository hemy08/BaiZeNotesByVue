import { describe, it, expect, beforeEach, beforeAll, afterEach, afterAll, vi } from 'vitest'
import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'
import * as iconv from 'iconv-lite'

// CMP-30：主进程用户消息经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

// ============ electron 与外围依赖 mock ============
const electronMocks = vi.hoisted(() => ({
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
    showMessageBoxSync: vi.fn(),
    showMessageBox: vi.fn(),
    showItemInFolder: vi.fn(),
    writeText: vi.fn(),
    getAllWindows: vi.fn(),
    windowSend: vi.fn()
}))

vi.mock('electron', () => {
    class MockBrowserWindow {
        static getAllWindows = electronMocks.getAllWindows
        webContents = { send: electronMocks.windowSend }
    }
    return {
        BrowserWindow: MockBrowserWindow,
        dialog: {
            showSaveDialog: electronMocks.showSaveDialog,
            showOpenDialog: electronMocks.showOpenDialog,
            showMessageBoxSync: electronMocks.showMessageBoxSync,
            showMessageBox: electronMocks.showMessageBox
        },
        shell: { showItemInFolder: electronMocks.showItemInFolder },
        clipboard: { writeText: electronMocks.writeText },
        app: { getPath: () => '', getVersion: () => '1.0.0-test' },
        ipcMain: { on: () => {} }
    }
})

// logger 单例在模块加载时会创建日志目录与写流，用桩替换保证测试不落盘
vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

// file-state-store 依赖 electron-store（ESM + electron 环境），用桩替换并捕获调用
// （ARC-11：file-operations 已改为直接依赖 file-state-store，打破循环依赖）
vi.mock('../../src/main/utils/file-state-store', () => ({
    saveLastOpenedFile: vi.fn(),
    saveLastOpenedDirectory: vi.fn()
}))

import { appState } from '../../src/main/utils/app-state'
import { saveLastOpenedFile, saveLastOpenedDirectory } from '../../src/main/utils/file-state-store'
import { logger } from '../../src/main/utils/logger'
// P1-1（工作区受信根来源收敛）：recent-folders 主进程写入实现经 providers 注入
import { setRecentFolderRecorderProvider } from '../../src/main/utils/providers'
import {
    getMathRandom,
    normalizeEncoding,
    decodeFileContent,
    encodeFileContent,
    SaveActiveFile,
    SaveActiveFileAs,
    TraverseDirectory,
    CreateFileFolder,
    ReloadDirFromDisk,
    OpenSelectFile,
    CreateFile,
    CreateDirectory,
    Rename,
    Delete,
    OpenFolderExplorer,
    GetSelectDir,
    OpenFile,
    OpenDirectory,
    ReopenActiveFileWithEncoding,
    ConvertActiveFileEncoding,
    // PF-05：目录树 fs.watch 增量监听
    CleanupDirectoryWatch,
    GetDirectoryWatchStatus,
    DegradeDirectoryWatch,
    // PF-4：目录树增量重扫
    GetDirectoryReloadStats,
    // PF-10：大文件流式读取
    ReadFileContentAdaptive,
    // FE-32：文件系统错误码 → 中文文案映射（供删除/复制等失败提示复用）
    DescribeFileSystemError
} from '../../src/main/utils/file-utils/file-operations'

const mainSend = vi.fn()
const makeWindow = () => ({ webContents: { send: mainSend } })

let tmpDir = ''

beforeAll(async () => {
    // PF-05：确保上一个测试文件可能遗留的目录监听已关闭
    CleanupDirectoryWatch()
    // 所有文件读写都发生在系统临时目录下，afterAll 统一清理
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-test-'))
})

afterAll(async () => {
    // PF-05：关闭目录监听，避免 fs.watch 句柄阻塞测试进程退出
    CleanupDirectoryWatch()
    await fs.rm(tmpDir, { recursive: true, force: true })
})

afterEach(() => {
    // PF-05：每个用例结束后释放该用例建立的目录监听与批次/合并计时器
    CleanupDirectoryWatch()
})

beforeEach(() => {
    // PF-05：清理上一个用例可能遗留的目录监听（含 pending 计时器）
    CleanupDirectoryWatch()
    vi.clearAllMocks()
    appState._resetForTesting()
    appState.mainWindow = makeWindow() as unknown as Electron.BrowserWindow
    // 默认 mock 行为：所有窗口为空、对话框默认取消
    electronMocks.getAllWindows.mockReturnValue([])
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    electronMocks.showMessageBoxSync.mockReturnValue(0)
    // FUN-30：大文件确认已改为异步对话框，默认继续打开
    electronMocks.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false })
})

describe('getMathRandom', () => {
    it('should return a string of the requested length with allowed characters', () => {
        const id = getMathRandom(16)
        expect(id).toHaveLength(16)
        expect(id).toMatch(/^[A-Za-z0-9]+$/)
    })

    it('should return empty string for zero length', () => {
        expect(getMathRandom(0)).toBe('')
    })
})

describe('normalizeEncoding', () => {
    it('should map jschardet names to iconv-lite encodings', () => {
        const cases: [string | null | undefined, string][] = [
            ['utf-8', 'utf-8'],
            ['utf8', 'utf-8'],
            ['ascii', 'utf-8'],
            ['gb2312', 'gbk'],
            ['gbk', 'gbk'],
            ['gb18030', 'gbk'],
            ['big5', 'big5'],
            ['sjis', 'shift_jis'],
            ['euc-jp', 'euc-jp'],
            ['euc-kr', 'euc-kr'],
            ['windows-1252', 'windows-1252'],
            ['latin1', 'latin1'],
            ['utf-16le', 'utf-16le'],
            ['utf-16be', 'utf-16be']
        ]
        for (const [input, expected] of cases) {
            expect(normalizeEncoding(input)).toBe(expected)
        }
    })

    it('should be case-insensitive and trim input', () => {
        expect(normalizeEncoding('GBK')).toBe('gbk')
        expect(normalizeEncoding(' GB2312 ')).toBe('gbk')
    })

    it('should fall back to utf-8 for unknown, null or undefined encoding', () => {
        expect(normalizeEncoding('unknown-encoding')).toBe('utf-8')
        expect(normalizeEncoding(null)).toBe('utf-8')
        expect(normalizeEncoding(undefined)).toBe('utf-8')
        expect(normalizeEncoding('')).toBe('utf-8')
    })
})

describe('decodeFileContent', () => {
    it('should strip UTF-8 BOM and decode content', () => {
        const buffer = Buffer.concat([
            Buffer.from([0xef, 0xbb, 0xbf]),
            Buffer.from('带BOM的文本', 'utf8')
        ])
        const { content, encoding } = decodeFileContent(buffer)
        expect(content).toBe('带BOM的文本')
        expect(encoding).toBe('utf-8')
    })

    it('should decode UTF-16LE buffer with BOM', () => {
        const buffer = Buffer.concat([
            Buffer.from([0xff, 0xfe]),
            iconv.encode('你好世界', 'utf-16le')
        ])
        const { content, encoding } = decodeFileContent(buffer)
        expect(content).toBe('你好世界')
        expect(encoding).toBe('utf-16le')
    })

    it('should decode UTF-16BE buffer with BOM', () => {
        const buffer = Buffer.concat([
            Buffer.from([0xfe, 0xff]),
            iconv.encode('你好世界', 'utf-16be')
        ])
        const { content, encoding } = decodeFileContent(buffer)
        expect(content).toBe('你好世界')
        expect(encoding).toBe('utf-16be')
    })

    it('should detect and decode GBK encoded Chinese text', () => {
        // 足够长的中文样本，保证 jschardet 能稳定识别出 GB2312/GBK
        const text =
            '这是一个足够长的中文文本，用于让 jschardet 可靠地识别出 GBK 编码。' +
            '包含标点符号，以及更多的汉字字符来增加样本长度，确保编码检测结果稳定。' +
            '白泽笔记是一个 Markdown 笔记软件，支持文件管理、图片粘贴和导入导出功能。'
        const { content, encoding } = decodeFileContent(iconv.encode(text, 'gbk'))
        expect(content).toBe(text)
        expect(encoding).toBe('gbk')
    })

    it('should decode plain UTF-8 buffer', () => {
        const { content, encoding } = decodeFileContent(Buffer.from('普通UTF8文本', 'utf8'))
        expect(content).toBe('普通UTF8文本')
        expect(encoding).toBe('utf-8')
    })
})

describe('encodeFileContent', () => {
    it('should encode UTF-8 without BOM', () => {
        const buffer = encodeFileContent('中文内容', 'utf-8')
        expect(buffer.equals(Buffer.from('中文内容', 'utf8'))).toBe(true)
        expect(buffer[0]).not.toBe(0xef)
    })

    it('should encode GBK via iconv-lite and round-trip decode', () => {
        const text = '中文GBK编码内容'
        const buffer = encodeFileContent(text, 'gbk')
        expect(buffer.equals(iconv.encode(text, 'gbk'))).toBe(true)
        expect(iconv.decode(buffer, 'gbk')).toBe(text)
    })

    it('should fall back to UTF-8 for unsupported encoding names', () => {
        const buffer = encodeFileContent('回退内容', 'x-unknown-encoding')
        expect(buffer.equals(Buffer.from('回退内容', 'utf8'))).toBe(true)
    })
})

describe('TraverseDirectory', () => {
    it('should traverse nested directories and filter by supported extensions', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        // 支持的类型与不支持的类型混合，还包含大写扩展名
        const files = ['a.md', 'b.txt', 'c.png', 'd.pdf', 'e.jpg', 'skip.zip', 'UPPER.MD']
        for (const f of files) {
            await fs.writeFile(path.join(caseDir, f), f)
        }
        await fs.mkdir(path.join(caseDir, 'sub'))
        await fs.writeFile(path.join(caseDir, 'sub', 'child.md'), 'child')
        await fs.writeFile(path.join(caseDir, 'sub', 'skip.exe'), 'exe')

        let tree: unknown = null
        await TraverseDirectory(caseDir, (items) => {
            tree = items
        })

        const items = tree as unknown as {
            name: string
            type: string
            isDirectory: boolean
            fileExtension?: string
            children: unknown[]
        }[]
        const names = items.map((i) => i.name).sort()
        // skip.zip（不支持的扩展名）与 UPPER.MD（扩展名大小写不匹配）均被过滤
        expect(names).toEqual(['a.md', 'b.txt', 'c.png', 'd.pdf', 'e.jpg', 'sub'])
        const sub = items.find((i) => i.name === 'sub')
        expect(sub?.isDirectory).toBe(true)
        expect(sub?.type).toBe('folder')
        expect((sub?.children as { name: string }[]).map((c) => c.name)).toEqual(['child.md'])
        const a = items.find((i) => i.name === 'a.md')
        expect(a?.type).toBe('file')
        expect(a?.fileExtension).toBe('.md')
    })

    it('should show error dialog and skip callback for nonexistent directory', async () => {
        const callback = vi.fn()
        await TraverseDirectory(path.join(tmpDir, 'no-such-dir'), callback)
        expect(callback).not.toHaveBeenCalled()
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ type: 'error' })
        )
    })
})

describe('CreateFileFolder', () => {
    it('should create a folder and reject duplicates', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        await CreateFileFolder('newfolder', caseDir, true, '')
        await expect(fs.access(path.join(caseDir, 'newfolder'))).resolves.toBeUndefined()

        vi.clearAllMocks()
        await CreateFileFolder('newfolder', caseDir, true, '')
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('已存在') })
        )
    })

    it('should create a file with a markdown header and set active file', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        await CreateFileFolder('mynote', caseDir, false, '.md')
        const filePath = path.join(caseDir, 'mynote.md')
        expect(await fs.readFile(filePath, 'utf8')).toBe('# mynote\r\n')
        expect(appState.currentActiveFile?.name).toBe('mynote')
        expect(appState.currentActiveFile?.path).toBe(filePath)
        expect(appState.currentActiveFile?.content).toBe('# mynote\r\n')
        expect(mainSend).toHaveBeenCalledWith('baize:fs:show-selected-file-context', '# mynote\r\n')
    })

    it('should use the part before the first dot as header when name contains dot', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        await CreateFileFolder('note.v2', caseDir, false, '.md')
        expect(await fs.readFile(path.join(caseDir, 'note.v2.md'), 'utf8')).toBe('# note\r\n')
    })

    it('should not overwrite an existing file with the same name', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'dup.md')
        await fs.writeFile(filePath, 'ORIGINAL')
        await CreateFileFolder('dup', caseDir, false, '.md')
        expect(await fs.readFile(filePath, 'utf8')).toBe('ORIGINAL')
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('已存在') })
        )
    })
})

describe('ReloadDirFromDisk', () => {
    it('should do nothing when rootPath is empty', async () => {
        await ReloadDirFromDisk()
        expect(appState.mdFileTree).toBeNull()
        expect(mainSend).not.toHaveBeenCalled()
    })

    it('should build file tree and notify renderer', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        await fs.writeFile(path.join(caseDir, 'a.md'), 'a')
        appState.rootPath = caseDir

        await ReloadDirFromDisk()

        expect(appState.mdFileTree).toHaveLength(1)
        expect(appState.mdFileTree?.[0].name).toBe(path.basename(caseDir))
        expect(appState.mdFileTree?.[0].children).toHaveLength(1)
        const sendCall = mainSend.mock.calls.find((c) => c[0] === 'baize:fs:file-system-data')
        expect(sendCall).toBeDefined()
        const parsed = JSON.parse(sendCall![1])
        expect(parsed[0].children).toHaveLength(1)
    })

    it('should reload the active file content from disk when clean', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'reload.md')
        await fs.writeFile(filePath, '磁盘上的内容', 'utf8')
        appState.rootPath = caseDir
        appState.currentActiveFile = {
            name: 'reload.md',
            path: filePath,
            type: 'file',
            content: '旧内容',
            encoding: 'utf-8'
        }
        appState.markFileLoaded('旧内容')

        await ReloadDirFromDisk()

        expect(appState.currentActiveFile?.content).toBe('磁盘上的内容')
        expect(mainSend).toHaveBeenCalledWith('baize:file:content-reloaded', {
            path: filePath,
            content: '磁盘上的内容'
        })
        expect(appState.isDirty()).toBe(false)
    })

    it('should skip reloading when the active file is dirty and warn user', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'dirty.md')
        await fs.writeFile(filePath, '磁盘内容', 'utf8')
        appState.rootPath = caseDir
        appState.currentActiveFile = {
            name: 'dirty.md',
            path: filePath,
            type: 'file',
            content: 'v1',
            encoding: 'utf-8'
        }
        appState.markFileLoaded('v1')
        appState.syncFileContent('v2') // 标记为脏

        await ReloadDirFromDisk()

        expect(appState.currentActiveFile?.content).toBe('v2')
        expect(mainSend).not.toHaveBeenCalledWith('baize:file:content-reloaded', expect.anything())
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'warning' })
        )
    })
})

// 仅在 Windows/macOS（支持 fs.watch recursive）上断言真实文件事件行为；
// Linux 等平台降级为仅监听根目录，事件语义不同，不做强断言。
const REAL_WATCH_PLATFORM = process.platform === 'win32' || process.platform === 'darwin'

describe('PF-05 目录树 fs.watch 增量监听', () => {
    it('should start a recursive directory watcher after ReloadDirFromDisk', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'watch-start-'))
        await fs.writeFile(path.join(caseDir, 'a.md'), 'a')
        appState.rootPath = caseDir

        await ReloadDirFromDisk()

        const status = GetDirectoryWatchStatus()
        expect(status.active).toBe(true)
        expect(status.rootPath).toBe(caseDir)
        expect(status.degraded).toBe(false)
        // Windows/macOS 支持 recursive；其他平台降级为仅根目录（recursive=false）
        if (REAL_WATCH_PLATFORM) {
            expect(status.recursive).toBe(true)
        }
    })

    it('should close old watcher and rebind to the new directory on directory switch', async () => {
        const firstDir = await fs.mkdtemp(path.join(tmpDir, 'watch-a-'))
        const secondDir = await fs.mkdtemp(path.join(tmpDir, 'watch-b-'))
        appState.rootPath = firstDir
        await ReloadDirFromDisk()
        expect(GetDirectoryWatchStatus().rootPath).toBe(firstDir)

        appState.rootPath = secondDir
        await ReloadDirFromDisk()

        const status = GetDirectoryWatchStatus()
        expect(status.active).toBe(true)
        expect(status.rootPath).toBe(secondDir)
    })

    it.runIf(REAL_WATCH_PLATFORM)(
        'should refresh the file tree after external changes within the 500ms batch window',
        async () => {
            const caseDir = await fs.mkdtemp(path.join(tmpDir, 'watch-ext-'))
            await fs.writeFile(path.join(caseDir, 'a.md'), 'a')
            appState.rootPath = caseDir
            await ReloadDirFromDisk()
            mainSend.mockClear()

            // 外部程序（非应用自身写盘）新增文件
            await fs.writeFile(path.join(caseDir, 'b.md'), 'b')

            await vi.waitFor(
                () => {
                    const sendCall = mainSend.mock.calls.find(
                        (call) => call[0] === 'baize:fs:file-system-data'
                    )
                    expect(sendCall).toBeDefined()
                    const parsed = JSON.parse(sendCall![1]) as { children: { name: string }[] }[]
                    expect(parsed[0].children.map((item) => item.name)).toContain('b.md')
                },
                { timeout: 5000, interval: 100 }
            )
        }
    )

    it.runIf(REAL_WATCH_PLATFORM)(
        'should ignore watcher events caused by the app own writes (self-write suppression)',
        async () => {
            const caseDir = await fs.mkdtemp(path.join(tmpDir, 'watch-self-'))
            const filePath = path.join(caseDir, 'self-save.md')
            await fs.writeFile(filePath, '初始内容', 'utf8')
            appState.rootPath = caseDir
            appState.currentActiveFile = {
                name: 'self-save.md',
                path: filePath,
                type: 'file',
                content: '初始内容',
                encoding: 'utf-8'
            }
            appState.markFileLoaded('初始内容')
            await ReloadDirFromDisk()
            mainSend.mockClear()

            appState.syncFileContent('自身写入的新内容')
            await SaveActiveFile()

            // 自身写入窗口内到达的 fs.watch 事件应被识别并忽略
            await vi.waitFor(
                () => {
                    expect(logger.debug).toHaveBeenCalledWith(
                        expect.stringContaining('自身写入'),
                        expect.anything(),
                        expect.anything()
                    )
                },
                { timeout: 4000, interval: 100 }
            )
            // 保存内容不改变目录树：不应触发目录树 IPC 刷新（无回环）
            expect(mainSend).not.toHaveBeenCalledWith(
                'baize:fs:file-system-data',
                expect.anything()
            )
        }
    )

    it('should degrade to full reload mode and logger.warn when watcher errors', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'watch-degrade-'))
        appState.rootPath = caseDir
        await ReloadDirFromDisk()
        expect(GetDirectoryWatchStatus().active).toBe(true)

        // P2：目录监听降级日志统一走 logger（logger 已在本测试文件顶部 mock）
        vi.mocked(logger.warn).mockClear()
        // 模拟 watcher 异常（如 ENOSPC / 目录被删）
        DegradeDirectoryWatch(new Error('ENOSPC: no space left on device'))
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('已降级为原全量刷新模式'),
            expect.anything()
        )

        const degradedStatus = GetDirectoryWatchStatus()
        expect(degradedStatus.active).toBe(false)
        expect(degradedStatus.degraded).toBe(true)
        expect(degradedStatus.rootPath).toBe('')

        // 降级后原全量刷新仍可用，且同一目录不会反复重试监听
        await ReloadDirFromDisk()
        expect(GetDirectoryWatchStatus().degraded).toBe(true)
        expect(GetDirectoryWatchStatus().active).toBe(false)
        expect(appState.mdFileTree).not.toBeNull()

        // 切换目录后解除降级并重新尝试监听
        const newDir = await fs.mkdtemp(path.join(tmpDir, 'watch-degrade-new-'))
        appState.rootPath = newDir
        await ReloadDirFromDisk()
        expect(GetDirectoryWatchStatus().degraded).toBe(false)
        expect(GetDirectoryWatchStatus().active).toBe(true)
        expect(GetDirectoryWatchStatus().rootPath).toBe(newDir)
    })

    it('should release watcher and timers on CleanupDirectoryWatch', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'watch-cleanup-'))
        appState.rootPath = caseDir
        await ReloadDirFromDisk()
        expect(GetDirectoryWatchStatus().active).toBe(true)

        CleanupDirectoryWatch()

        const status = GetDirectoryWatchStatus()
        expect(status.active).toBe(false)
        expect(status.rootPath).toBe('')
        expect(status.degraded).toBe(false)
        expect(status.batchPending).toBe(false)
    })

    it('should merge multiple directory operations into a single reload (debounce)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'watch-merge-'))
        appState.rootPath = caseDir
        await ReloadDirFromDisk()
        mainSend.mockClear()

        // 同一批内连续执行多个目录操作：ScheduleReloadFromDisk 应合并为一次刷新
        await CreateDirectory(caseDir, 'dir-one')
        await CreateDirectory(caseDir, 'dir-two')

        const treeCalls = () =>
            mainSend.mock.calls.filter((call) => call[0] === 'baize:fs:file-system-data')
        await vi.waitFor(
            () => {
                expect(treeCalls()).toHaveLength(1)
            },
            { timeout: 3000, interval: 100 }
        )
        // 再等一个批次窗口，确认没有重复全量刷新（事件风暴合并生效）
        await new Promise((resolve) => setTimeout(resolve, 700))
        expect(treeCalls()).toHaveLength(1)
    })

    it.runIf(REAL_WATCH_PLATFORM)(
        'watcher-triggered refresh should keep FUN-06 dirty protection (never overwrite unsaved edits)',
        async () => {
            const caseDir = await fs.mkdtemp(path.join(tmpDir, 'watch-dirty-'))
            const activePath = path.join(caseDir, 'active.md')
            await fs.writeFile(activePath, '磁盘上的旧内容', 'utf8')
            appState.rootPath = caseDir
            appState.currentActiveFile = {
                name: 'active.md',
                path: activePath,
                type: 'file',
                content: '用户未保存的修改',
                encoding: 'utf-8'
            }
            // 保存快照与当前内容不一致 → 脏状态（FUN-06）
            appState.markFileLoaded('磁盘上的旧内容')
            await ReloadDirFromDisk()
            expect(appState.isDirty()).toBe(true)
            mainSend.mockClear()

            // 外部变更（另一个文件）触发 watcher 刷新
            await fs.writeFile(path.join(caseDir, 'external.md'), 'x')

            await vi.waitFor(
                () => {
                    expect(mainSend).toHaveBeenCalledWith(
                        'baize:status-bar:update',
                        expect.objectContaining({ type: 'warning' })
                    )
                },
                { timeout: 5000, interval: 100 }
            )
            // FUN-06：未保存编辑不被磁盘内容覆盖，也不向编辑器发送重载事件
            expect(appState.currentActiveFile?.content).toBe('用户未保存的修改')
            expect(mainSend).not.toHaveBeenCalledWith(
                'baize:file:content-reloaded',
                expect.anything()
            )
        }
    )
})

describe('PF-4 目录树增量重扫', () => {
    /** 取最近一次发送的 FILE_SYSTEM_DATA 树 JSON */
    function lastTreeJson(): {
        name: string
        children: { name: string; children?: { name: string }[] }[]
    }[] {
        const calls = mainSend.mock.calls.filter((call) => call[0] === 'baize:fs:file-system-data')
        expect(calls.length).toBeGreaterThan(0)
        return JSON.parse(String(calls[calls.length - 1][1]))
    }

    function treeSendCount(): number {
        return mainSend.mock.calls.filter((call) => call[0] === 'baize:fs:file-system-data').length
    }

    it('should skip dependency/VCS directories during traversal', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'pf4-skip-'))
        await fs.writeFile(path.join(caseDir, 'note.md'), 'note')
        for (const dirName of ['node_modules', '.git', '.vscode']) {
            const dirPath = path.join(caseDir, dirName)
            await fs.mkdir(dirPath)
            await fs.writeFile(path.join(dirPath, 'hidden.md'), 'hidden')
        }
        await fs.mkdir(path.join(caseDir, 'notes'))
        await fs.writeFile(path.join(caseDir, 'notes', 'visible.md'), 'visible')

        let items: Array<{ name: string }> = []
        await TraverseDirectory(caseDir, (result) => {
            items = result
        })

        const names = items.map((item) => item.name).sort()
        expect(names).toEqual(['note.md', 'notes'])
    })

    it('should keep stable node ids so repeated scans produce identical tree JSON', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'pf4-stable-'))
        await fs.mkdir(path.join(caseDir, 'sub'))
        await fs.writeFile(path.join(caseDir, 'a.md'), 'a')
        await fs.writeFile(path.join(caseDir, 'sub', 'b.md'), 'b')
        appState.rootPath = caseDir

        await ReloadDirFromDisk()
        const firstJson = JSON.stringify(appState.mdFileTree)
        await ReloadDirFromDisk()
        const secondJson = JSON.stringify(appState.mdFileTree)

        // PF-4：id 由路径派生（FNV 哈希），同一目录两次扫描的整树 JSON 逐字节一致
        expect(secondJson).toBe(firstJson)
    })

    it('should rescan only the affected subtree for a watcher batch', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'pf4-incremental-'))
        await fs.mkdir(path.join(caseDir, 'sub'))
        await fs.writeFile(path.join(caseDir, 'root.md'), 'root')
        await fs.writeFile(path.join(caseDir, 'sub', 'a.md'), 'a')
        appState.rootPath = caseDir
        await ReloadDirFromDisk()
        mainSend.mockClear()

        // 外部程序新增文件（不经过应用自身写入窗口）
        await fs.writeFile(path.join(caseDir, 'sub', 'external.md'), 'x')
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['sub/external.md'] })

        const stats = GetDirectoryReloadStats()
        expect(stats?.mode).toBe('incremental')
        expect(stats?.rescanDirs).toBe(1)
        expect(stats?.treeSent).toBe(true)
        expect(stats?.elapsedMs).toBeGreaterThanOrEqual(0)
        const tree = lastTreeJson()
        const sub = tree[0].children.find((item) => item.name === 'sub')
        expect((sub?.children ?? []).map((item) => item.name).sort()).toEqual([
            'a.md',
            'external.md'
        ])
        // 未受影响的根目录内容保持原样
        expect(tree[0].children.map((item) => item.name).sort()).toEqual(['root.md', 'sub'])
    })

    it('should collapse nested changed paths into a single subtree rescan', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'pf4-collapse-'))
        await fs.mkdir(path.join(caseDir, 'a', 'b'), { recursive: true })
        await fs.writeFile(path.join(caseDir, 'a', 'b', 'c.md'), 'c')
        appState.rootPath = caseDir
        await ReloadDirFromDisk()

        await ReloadDirFromDisk({
            fromWatcher: true,
            changedPaths: ['a/b/c.md', 'a/b/new.md', 'a/extra.md']
        })

        const stats = GetDirectoryReloadStats()
        expect(stats?.mode).toBe('incremental')
        // a 是 a/b 的祖先 → 折叠后只需重扫 a 一个子树
        expect(stats?.rescanDirs).toBe(1)
    })

    it('should skip refresh entirely when only excluded directories changed', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'pf4-ignored-'))
        await fs.mkdir(path.join(caseDir, 'node_modules'))
        await fs.writeFile(path.join(caseDir, 'node_modules', 'lib.md'), 'lib')
        await fs.writeFile(path.join(caseDir, 'note.md'), 'note')
        appState.rootPath = caseDir
        await ReloadDirFromDisk()
        mainSend.mockClear()

        await ReloadDirFromDisk({
            fromWatcher: true,
            changedPaths: ['node_modules/other.md', 'node_modules/.cache/x.md']
        })

        const stats = GetDirectoryReloadStats()
        expect(stats?.mode).toBe('skipped')
        expect(stats?.treeSent).toBe(false)
        expect(stats?.rescanDirs).toBe(0)
        expect(treeSendCount()).toBe(0)
    })

    it('should fall back to full scan when a new directory appears', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'pf4-newdir-'))
        await fs.writeFile(path.join(caseDir, 'a.md'), 'a')
        appState.rootPath = caseDir
        await ReloadDirFromDisk()
        mainSend.mockClear()

        // 外部新建目录（树中尚不存在 → 无法安全合并，回退全量扫描）
        await fs.mkdir(path.join(caseDir, 'brand-new'))
        await fs.writeFile(path.join(caseDir, 'brand-new', 'note.md'), 'note')
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['brand-new'] })

        const stats = GetDirectoryReloadStats()
        expect(stats?.mode).toBe('full')
        const tree = lastTreeJson()
        expect(tree[0].children.map((item) => item.name).sort()).toEqual(['a.md', 'brand-new'])
    })

    it('should fall back to full scan when too many directories are affected', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'pf4-manydirs-'))
        const changedPaths: string[] = []
        for (let index = 0; index < 10; index += 1) {
            const dirName = `dir-${index}`
            await fs.mkdir(path.join(caseDir, dirName))
            await fs.writeFile(path.join(caseDir, dirName, 'note.md'), 'note')
            changedPaths.push(`${dirName}/external.md`)
        }
        appState.rootPath = caseDir
        await ReloadDirFromDisk()

        await ReloadDirFromDisk({ fromWatcher: true, changedPaths })

        const stats = GetDirectoryReloadStats()
        expect(stats?.mode).toBe('full')
        expect(stats?.reason).toBe('too-many-affected-dirs')
    })

    it('should fall back to full scan when the workspace root itself is affected or changes are unknown', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'pf4-root-'))
        await fs.writeFile(path.join(caseDir, 'a.md'), 'a')
        appState.rootPath = caseDir
        await ReloadDirFromDisk()

        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['new-root-file.md'] })
        expect(GetDirectoryReloadStats()?.mode).toBe('full')
        expect(GetDirectoryReloadStats()?.reason).toBe('root-affected')

        // 工作区外路径：忽略变更，不触发无意义刷新
        mainSend.mockClear()
        await ReloadDirFromDisk({ fromWatcher: true, changedPaths: ['../outside/evil.md'] })
        expect(GetDirectoryReloadStats()?.mode).toBe('skipped')
        expect(treeSendCount()).toBe(0)
    })

    it('should use incremental refresh for real watcher batches (no full rescan)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'pf4-watch-real-'))
        await fs.mkdir(path.join(caseDir, 'sub'))
        await fs.writeFile(path.join(caseDir, 'sub', 'a.md'), 'a')
        appState.rootPath = caseDir
        await ReloadDirFromDisk()
        mainSend.mockClear()

        await fs.writeFile(path.join(caseDir, 'sub', 'external.md'), 'x')

        await vi.waitFor(
            () => {
                expect(treeSendCount()).toBeGreaterThan(0)
                const stats = GetDirectoryReloadStats()
                // 真实 fs.watch 批次：单目录变更应走局部重扫（平台不支持 recursive 时降级为根目录监听，
                // 变更路径仍是 sub/external.md，同样命中增量路径）
                expect(stats?.mode).toBe('incremental')
                expect(stats?.rescanDirs).toBe(1)
            },
            { timeout: 5000, interval: 100 }
        )
        const tree = lastTreeJson()
        const sub = tree[0].children.find((item) => item.name === 'sub')
        expect((sub?.children ?? []).map((item) => item.name).sort()).toEqual([
            'a.md',
            'external.md'
        ])
    })
})

describe('PF-10 大文件流式读取', () => {
    it('should read small files in one pass and keep encoding detection (streamed=false)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'stream-small-'))
        const filePath = path.join(caseDir, 'small.md')
        await fs.writeFile(filePath, '小文件内容', 'utf8')

        const result = await ReadFileContentAdaptive(filePath)

        expect(result.streamed).toBe(false)
        expect(result.content).toBe('小文件内容')
        expect(result.encoding).toBe('utf-8')
    })

    it('should stream large UTF-8 files and keep full content', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'stream-big-'))
        const filePath = path.join(caseDir, 'big-utf8.md')
        const size = 5 * 1024 * 1024 + 1 // 略大于 5MB 阈值
        await fs.writeFile(filePath, Buffer.alloc(size, 0x61))

        const result = await ReadFileContentAdaptive(filePath)

        expect(result.streamed).toBe(true)
        expect(result.encoding).toBe('utf-8')
        expect(result.content.length).toBe(size)
    })

    it('should stream large GBK files without cutting multi-byte chars at chunk boundaries', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'stream-gbk-'))
        const filePath = path.join(caseDir, 'big-gbk.md')
        // 每个汉字 2 字节，足够超过 5MB 阈值且覆盖多个 64KB 分块边界
        const text = '白泽笔记大文件流式读取测试。'.repeat(200000)
        const encoded = iconv.encode(text, 'gbk')
        expect(encoded.length).toBeGreaterThan(5 * 1024 * 1024)
        await fs.writeFile(filePath, encoded)

        const result = await ReadFileContentAdaptive(filePath)

        expect(result.streamed).toBe(true)
        expect(result.encoding).toBe('gbk')
        expect(result.content).toBe(text)
    })

    it('should still allow tuned threshold to force small-file streaming path', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'stream-tuned-'))
        const filePath = path.join(caseDir, 'tuned.md')
        await fs.writeFile(filePath, '阈值调小后也走流式', 'utf8')

        const result = await ReadFileContentAdaptive(filePath, { threshold: 0 })

        expect(result.streamed).toBe(true)
        expect(result.content).toBe('阈值调小后也走流式')
        expect(result.encoding).toBe('utf-8')
    })

    it('should stream large UTF-16LE files with BOM and keep full content', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'stream-utf16-'))
        const filePath = path.join(caseDir, 'big-utf16.md')
        const text = '白泽笔记 UTF-16 流式读取测试。'.repeat(300000)
        const encoded = Buffer.concat([Buffer.from([0xff, 0xfe]), iconv.encode(text, 'utf-16le')])
        expect(encoded.length).toBeGreaterThan(5 * 1024 * 1024)
        await fs.writeFile(filePath, encoded)

        const result = await ReadFileContentAdaptive(filePath)

        expect(result.streamed).toBe(true)
        expect(result.encoding).toBe('utf-16le')
        expect(result.content).toBe(text)
    })

    it('should throw a clear Chinese error when the read stream fails midway', async () => {
        async function* failingStream(): AsyncGenerator<Buffer> {
            yield Buffer.from('半途数据', 'utf8')
            throw new Error('模拟磁盘读取中断')
        }

        await expect(
            ReadFileContentAdaptive('C:\\fake\\big.md', {
                threshold: 0,
                fileSize: 1024,
                createStream: failingStream
            })
        ).rejects.toThrow('读取大文件失败：模拟磁盘读取中断')
    })

    it('should throw a clear Chinese error when the file does not exist (small file)', async () => {
        const missingPath = path.join(tmpDir, 'not-exists', 'missing.md')

        await expect(ReadFileContentAdaptive(missingPath)).rejects.toThrow(
            /文件不存在|缺失|no such file/i
        )
    })
})

describe('OpenSelectFile', () => {
    it('should load a UTF-8 file and notify renderer', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'hello.md')
        await fs.writeFile(filePath, '# Hello\r\nWorld', 'utf8')

        await OpenSelectFile({ name: 'hello.md', path: filePath, type: 'file', content: '' })

        expect(appState.currentActiveFile?.path).toBe(filePath)
        expect(appState.currentActiveFile?.name).toBe('hello.md')
        expect(appState.currentActiveFile?.content).toBe('# Hello\r\nWorld')
        expect(appState.currentActiveFile?.encoding).toBe('utf-8')
        expect(appState.isDirty()).toBe(false)
        expect(mainSend).toHaveBeenCalledWith(
            'baize:fs:show-selected-file-context',
            '# Hello\r\nWorld'
        )
        expect(mainSend).toHaveBeenCalledWith('baize:file:user-select-file', filePath)
        expect(saveLastOpenedFile).toHaveBeenCalledWith(filePath)
    })

    it('should load a GBK encoded file and record its encoding', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'gbk.md')
        const text =
            '这是一个足够长的中文文本，用于让 jschardet 可靠地识别出 GBK 编码。' +
            '包含标点符号，以及更多的汉字字符来增加样本长度，确保编码检测结果稳定。'
        await fs.writeFile(filePath, iconv.encode(text, 'gbk'))

        await OpenSelectFile({ name: 'gbk.md', path: filePath, type: 'file', content: '' })

        expect(appState.currentActiveFile?.content).toBe(text)
        expect(appState.currentActiveFile?.encoding).toBe('gbk')
    })

    it('should keep empty content for an empty file (FUN-29：不再注入 CRLF)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'empty.md')
        await fs.writeFile(filePath, '')

        await OpenSelectFile({ name: 'empty.md', path: filePath, type: 'file', content: '' })

        expect(appState.currentActiveFile?.content).toBe('')
        expect(appState.currentActiveFile?.encoding).toBe('utf-8')
        expect(mainSend).toHaveBeenCalledWith('baize:fs:show-selected-file-context', '')
    })

    it('should auto-save the previous dirty md file before opening a new one', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const prevPath = path.join(caseDir, 'prev.md')
        const newPath = path.join(caseDir, 'next.md')
        await fs.writeFile(prevPath, '旧磁盘内容', 'utf8')
        await fs.writeFile(newPath, '目标内容', 'utf8')
        appState.currentActiveFile = {
            name: 'prev.md',
            path: prevPath,
            type: 'file',
            content: '新修改内容',
            encoding: 'utf-8'
        }

        await OpenSelectFile({ name: 'next.md', path: newPath, type: 'file', content: '' })

        expect(await fs.readFile(prevPath, 'utf8')).toBe('新修改内容')
        expect(appState.currentActiveFile?.path).toBe(newPath)
        expect(appState.isDirty()).toBe(false)
    })

    it('should log error and keep state unchanged when the file is missing', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const missingPath = path.join(caseDir, 'missing.md')

        await OpenSelectFile({ name: 'missing.md', path: missingPath, type: 'file', content: '' })

        expect(logger.error).toHaveBeenCalled()
        expect(appState.currentActiveFile).toBeNull()
        // PF-10：读取失败不再静默，状态栏给出清晰中文错误
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({
                type: 'error',
                message: expect.stringContaining('打开文件失败')
            })
        )
    })

    it('should cancel opening when user rejects the large file warning', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const bigPath = path.join(caseDir, 'big.md')
        // 5MB + 1 字节，超过 LARGE_FILE_THRESHOLD
        await fs.writeFile(bigPath, Buffer.alloc(5 * 1024 * 1024 + 1, 97))
        // FUN-30：异步确认对话框，response 1 表示取消
        electronMocks.showMessageBox.mockResolvedValue({ response: 1, checkboxChecked: false })

        await OpenSelectFile({ name: 'big.md', path: bigPath, type: 'file', content: '' })

        expect(electronMocks.showMessageBox).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                type: 'warning',
                title: '大文件提示',
                buttons: ['继续打开', '取消']
            })
        )
        expect(logger.warn).toHaveBeenCalled()
        expect(appState.currentActiveFile).toBeNull()
    })

    it('should continue opening when user confirms the large file warning', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const bigPath = path.join(caseDir, 'big.md')
        // 5MB + 1 字节，超过 LARGE_FILE_THRESHOLD
        await fs.writeFile(bigPath, Buffer.alloc(5 * 1024 * 1024 + 1, 97))
        electronMocks.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false })

        await OpenSelectFile({ name: 'big.md', path: bigPath, type: 'file', content: '' })

        expect(electronMocks.showMessageBox).toHaveBeenCalled()
        expect(appState.currentActiveFile?.path).toBe(bigPath)
        // PF-10：大文件走流式读取，内容完整（5MB+1 个 'a'）
        expect(appState.currentActiveFile?.content?.length).toBe(5 * 1024 * 1024 + 1)
        expect(appState.currentActiveFile?.encoding).toBe('utf-8')
    })
})

describe('SaveActiveFile', () => {
    // FE-08：原实现在无活动文件时直接 throw（菜单 async handler 无人 await → 主进程未处理拒绝）。
    // 现在改为状态栏提示 + 返回 false，用户可见且不再产生未捕获 Promise 拒绝。
    it('should return false and notify the status bar when there is no active file (FE-08)', async () => {
        await expect(SaveActiveFile()).resolves.toBe(false)
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({
                message: expect.stringContaining('当前没有活动文件'),
                type: 'warning'
            })
        )
    })

    it('should write content to disk, mark saved and notify windows', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'save.md')
        await fs.writeFile(filePath, '初始内容', 'utf8')
        appState.currentActiveFile = {
            name: 'save.md',
            path: filePath,
            type: 'file',
            content: '待保存内容',
            encoding: 'utf-8'
        }
        appState.markFileLoaded('初始内容')
        appState.syncFileContent('待保存内容')
        expect(appState.isDirty()).toBe(true)
        electronMocks.getAllWindows.mockReturnValue([
            { webContents: { send: electronMocks.windowSend } }
        ])

        const ok = await SaveActiveFile()

        expect(ok).toBe(true)
        expect(await fs.readFile(filePath, 'utf8')).toBe('待保存内容')
        expect(appState.isDirty()).toBe(false)
        expect(electronMocks.windowSend).toHaveBeenCalledWith('baize:file:saved')
    })

    it('should write back in GBK when the file encoding is GBK', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'gbk-save.md')
        await fs.writeFile(filePath, '')
        const text = '中文GBK保存内容测试'
        appState.currentActiveFile = {
            name: 'gbk-save.md',
            path: filePath,
            type: 'file',
            content: text,
            encoding: 'gbk'
        }

        const ok = await SaveActiveFile()

        expect(ok).toBe(true)
        const bytes = await fs.readFile(filePath)
        expect(bytes.equals(iconv.encode(text, 'gbk'))).toBe(true)
    })

    it('should return false and notify when writing fails', async () => {
        const filePath = path.join(tmpDir, 'missing-dir', 'f.md')
        appState.currentActiveFile = {
            name: 'f.md',
            path: filePath,
            type: 'file',
            content: 'x',
            encoding: 'utf-8'
        }

        const ok = await SaveActiveFile()

        expect(ok).toBe(false)
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ type: 'error' })
        )
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })
})

describe('SaveActiveFileAs', () => {
    it('should show error dialog when there is no active file', async () => {
        await SaveActiveFileAs()
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: '当前没有活动文件可另存为' })
        )
        expect(electronMocks.showSaveDialog).not.toHaveBeenCalled()
    })

    it('should do nothing when the save dialog is canceled', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        appState.currentActiveFile = {
            name: 'orig.md',
            path: path.join(caseDir, 'orig.md'),
            type: 'file',
            content: '# 标题',
            encoding: 'utf-8'
        }
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })

        await SaveActiveFileAs()

        expect(electronMocks.showSaveDialog).toHaveBeenCalled()
        expect(await fs.readdir(caseDir)).toEqual([])
    })

    it('should save as .md with the original encoding and update active file', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const savePath = path.join(caseDir, 'save.md')
        appState.currentActiveFile = {
            name: 'orig.md',
            path: path.join(caseDir, 'orig.md'),
            type: 'file',
            content: '# 标题\n正文',
            encoding: 'utf-8'
        }
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: savePath })

        await SaveActiveFileAs()

        expect(await fs.readFile(savePath, 'utf8')).toBe('# 标题\n正文')
        expect(appState.currentActiveFile?.path).toBe(savePath)
        expect(appState.currentActiveFile?.name).toBe('save.md')
        expect(appState.isDirty()).toBe(false)
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ type: 'success', message: expect.stringContaining(savePath) })
        )
    })

    it('should export real JSON file with metadata', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const savePath = path.join(caseDir, 'save.json')
        appState.currentActiveFile = {
            name: 'orig.md',
            path: path.join(caseDir, 'orig.md'),
            type: 'file',
            content: '# 标题',
            encoding: 'utf-8'
        }
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: savePath })

        await SaveActiveFileAs()

        const parsed = JSON.parse(await fs.readFile(savePath, 'utf8'))
        expect(parsed.content).toBe('# 标题')
        expect(parsed.metadata.app).toBe('BaiZeNotes')
        expect(parsed.metadata.type).toBe('markdown')
        // json 分支提前 return，当前文件信息不被更新
        expect(appState.currentActiveFile?.name).toBe('orig.md')
    })

    it('should export HTML rendered from markdown', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const savePath = path.join(caseDir, 'save.html')
        appState.currentActiveFile = {
            name: 'orig.md',
            path: path.join(caseDir, 'orig.md'),
            type: 'file',
            content: '# 标题',
            encoding: 'utf-8'
        }
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: savePath })

        await SaveActiveFileAs()

        const html = await fs.readFile(savePath, 'utf8')
        expect(html).toContain('<!DOCTYPE html>')
        expect(html).toContain('<h1>标题</h1>')
    })

    it('should show error dialog for unsupported extension', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const savePath = path.join(caseDir, 'save.xyz')
        appState.currentActiveFile = {
            name: 'orig.md',
            path: path.join(caseDir, 'orig.md'),
            type: 'file',
            content: '# 标题',
            encoding: 'utf-8'
        }
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: savePath })

        await SaveActiveFileAs()

        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('不支持的文件格式') })
        )
        await expect(fs.access(savePath)).rejects.toThrow()
    })
})

describe('CreateFile / CreateDirectory', () => {
    it('should create an empty file with disk/memory/snapshot all consistent (FUN-29)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        await CreateFile(caseDir, 'newfile', '.md')

        const filePath = path.join(caseDir, 'newfile.md')
        // FUN-29：磁盘内容为空，内存内容与保存快照同样为空——三者一致
        expect(await fs.readFile(filePath, 'utf8')).toBe('')
        expect(appState.currentActiveFile?.name).toBe('newfile')
        expect(appState.currentActiveFile?.content).toBe('')
        expect(appState.currentActiveFile?.encoding).toBe('utf-8')
        // 内容与快照一致 → 不脏（不再出现"未输入就把标题写进文件"）
        expect(appState.isDirty()).toBe(false)
        expect(mainSend).toHaveBeenCalledWith('baize:fs:show-selected-file-context', '')
    })

    it('should create a directory and reject duplicates', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        await CreateDirectory(caseDir, 'newdir')
        await expect(fs.access(path.join(caseDir, 'newdir'))).resolves.toBeUndefined()

        vi.clearAllMocks()
        await CreateDirectory(caseDir, 'newdir')
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('已存在') })
        )
    })
})

describe('Rename / Delete', () => {
    it('should rename a file keeping its extension and open the new file', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const oldPath = path.join(caseDir, 'old.md')
        const newPath = path.join(caseDir, 'new.md')
        await fs.writeFile(oldPath, 'hello', 'utf8')

        await Rename(oldPath, 'new', true)

        expect(await fs.readFile(newPath, 'utf8')).toBe('hello')
        await expect(fs.access(oldPath)).rejects.toThrow()
        expect(appState.currentActiveFile?.path).toBe(newPath)
        expect(appState.currentActiveFile?.name).toBe('new.md')
        expect(saveLastOpenedFile).toHaveBeenCalledWith(newPath)
    })

    it('should fail with EINVAL when renaming a folder whose path has no dot', async () => {
        // 真实行为：ParseDirectoryPath 对不含 "." 的路径原样返回目录自身，
        // 新路径被拼到目录内部（olddir\newdir），fs.rename 抛 EINVAL，重命名失败
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const oldDir = path.join(caseDir, 'olddir')
        await fs.mkdir(oldDir)
        await fs.writeFile(path.join(oldDir, 'in.md'), 'inner')

        await expect(Rename(oldDir, 'newdir', false)).rejects.toThrow()
        await expect(fs.access(oldDir)).resolves.toBeUndefined()
    })

    it('should rename a folder when the path contains a dot', async () => {
        // 真实行为：路径任意位置含 "." 时 ParseDirectoryPath 会剥掉目录名，
        // 新路径落在同级目录，重命名才能成功（依赖点号的巧合行为）
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case.with.dot-'))
        const oldDir = path.join(caseDir, 'olddir')
        const newDir = path.join(caseDir, 'newdir')
        await fs.mkdir(oldDir)
        await fs.writeFile(path.join(oldDir, 'in.md'), 'inner')

        await Rename(oldDir, 'newdir', false)

        expect(await fs.readFile(path.join(newDir, 'in.md'), 'utf8')).toBe('inner')
        await expect(fs.access(oldDir)).rejects.toThrow()
    })

    it('should delete a file', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'del.md')
        await fs.writeFile(filePath, 'bye')

        await Delete(filePath, true)

        await expect(fs.access(filePath)).rejects.toThrow()
    })

    it('should delete a folder recursively', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const dirPath = path.join(caseDir, 'deldir')
        await fs.mkdir(dirPath)
        await fs.writeFile(path.join(dirPath, 'inner.md'), 'inner')

        await Delete(dirPath, false)

        await expect(fs.access(dirPath)).rejects.toThrow()
    })

    it('should show error dialog when deleting a missing file', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        await Delete(path.join(caseDir, 'nope.md'), true)
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('ENOENT') })
        )
        // FE-32：错误码已映射中文原因，原始 message 保留在括号内
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({
                message: expect.stringMatching(/删除失败：.*文件不存在或已被移动.*ENOENT/s)
            })
        )
    })

    it('should map a delete EPERM/EISDIR failure to a readable Chinese message (FE-32)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        // 把目录当文件删除：Windows 抛 EPERM，POSIX 抛 EISDIR，两者都必须映射为中文原因
        await Delete(caseDir, true)

        const dialogCall = mainSend.mock.calls.find((call) => call[0] === 'baize:dialog:open-vue')
        expect(dialogCall).toBeDefined()
        const message = String((dialogCall![2] as { message: string }).message)
        expect(message).toContain('删除失败：')
        expect(message).toMatch(/没有读取权限|目标路径是目录/)
    })
})

// FE-32：文件系统错误码映射的纯函数用例（删除/复制共用）
describe('DescribeFileSystemError（FE-32 错误码中文化）', () => {
    const errno = (code: string, message: string): NodeJS.ErrnoException =>
        Object.assign(new Error(message), { code })

    it('should map common errno codes to Chinese reasons and keep the raw message', () => {
        expect(DescribeFileSystemError(errno('ENOENT', 'ENOENT: no such file'))).toMatch(
            /文件不存在或已被移动.*ENOENT/
        )
        expect(DescribeFileSystemError(errno('EACCES', 'EACCES: permission denied'))).toMatch(
            /没有读取权限.*EACCES/
        )
        expect(DescribeFileSystemError(errno('EPERM', 'EPERM: operation not permitted'))).toMatch(
            /没有读取权限.*EPERM/
        )
        expect(DescribeFileSystemError(errno('EBUSY', 'EBUSY: resource busy or locked'))).toMatch(
            /文件被其他程序占用.*EBUSY/
        )
        expect(
            DescribeFileSystemError(errno('EISDIR', 'EISDIR: illegal operation on a directory'))
        ).toMatch(/目标路径是目录而不是文件.*EISDIR/)
    })

    it('should keep the raw message plus the code for unknown errors', () => {
        const mapped = DescribeFileSystemError(errno('EWHATEVER', 'boom'))
        expect(mapped).toContain('boom')
        expect(mapped).toContain('EWHATEVER')
    })

    it('should fall back to String(error) for non-Error payloads', () => {
        expect(DescribeFileSystemError('plain text failure')).toBe('plain text failure')
        expect(DescribeFileSystemError(undefined)).toBe('undefined')
    })
})

describe('OpenFolderExplorer', () => {
    it('should reveal a file path directly', () => {
        // P1-AS-1：资源管理器定位仅允许受信范围路径，用例路径改到临时目录（合法工作区）
        const filePath = path.join(tmpDir, 'notes', 'sub', 'note.md')
        OpenFolderExplorer(filePath)
        expect(electronMocks.showItemInFolder).toHaveBeenCalledWith(filePath)
    })

    it('should reveal the parent folder for a path without extension', () => {
        const folderPath = path.join(tmpDir, 'noextfolder')
        const lastSeparator = Math.max(folderPath.lastIndexOf('//'), folderPath.lastIndexOf('\\'))
        const expectedFolder =
            folderPath.lastIndexOf('.') === -1 ? folderPath.substring(0, lastSeparator) : folderPath
        OpenFolderExplorer(folderPath)
        expect(electronMocks.showItemInFolder).toHaveBeenCalledWith(expectedFolder)
    })

    it('should treat a folder path containing dot as a file path', () => {
        // 路径任意位置包含 "." 时被当作文件处理（真实行为）
        const dottedPath = path.join(tmpDir, 'my.dir', 'sub')
        OpenFolderExplorer(dottedPath)
        expect(electronMocks.showItemInFolder).toHaveBeenCalledWith(dottedPath)
    })

    it('should reject an out-of-scope path with a status bar warning (P1-AS-1)', () => {
        const outsidePath = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd'
        OpenFolderExplorer(outsidePath)
        expect(electronMocks.showItemInFolder).not.toHaveBeenCalled()
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })
})

describe('GetSelectDir', () => {
    const flush = () => new Promise((resolve) => setImmediate(resolve))

    it('should call back with null when dialog is canceled', async () => {
        const cb = vi.fn()
        electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
        GetSelectDir({} as Electron.BrowserWindow, cb)
        await flush()
        expect(cb).toHaveBeenCalledWith(null)
    })

    it('should call back with the selected directory', async () => {
        const cb = vi.fn()
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: ['C:\\selected']
        })
        GetSelectDir({} as Electron.BrowserWindow, cb)
        await flush()
        expect(cb).toHaveBeenCalledWith('C:\\selected')
    })
})

describe('OpenFile / OpenDirectory', () => {
    it('should do nothing when the open file dialog is canceled', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
        await OpenFile({} as Electron.BrowserWindow)
        expect(appState.currentActiveFile).toBeNull()
    })

    it('should open the file selected in the dialog', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'open.md')
        await fs.writeFile(filePath, '打开内容', 'utf8')
        electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [filePath] })

        await OpenFile({} as Electron.BrowserWindow)

        expect(electronMocks.showOpenDialog).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({
                properties: ['openFile'],
                filters: [{ name: 'Markdown Files', extensions: ['md'] }]
            })
        )
        expect(appState.currentActiveFile?.path).toBe(filePath)
        expect(appState.currentActiveFile?.name).toBe('open.md')
        expect(appState.currentActiveFile?.content).toBe('打开内容')
    })

    it('should set rootPath, clear editor, reload tree and save last directory', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        await fs.writeFile(path.join(caseDir, 'a.md'), 'a')
        electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [caseDir] })
        // OpenDirectory 直接调用实参窗口的 webContents.send，需要提供带 send 的窗口
        const openDirSend = vi.fn()
        const win = { webContents: { send: openDirSend } }

        await OpenDirectory(win as unknown as Electron.BrowserWindow)

        expect(appState.rootPath).toBe(caseDir)
        expect(openDirSend).toHaveBeenCalledWith('baize:file:clear-editor-preview')
        expect(appState.mdFileTree?.[0].name).toBe(path.basename(caseDir))
        expect(saveLastOpenedDirectory).toHaveBeenCalledWith(caseDir)
    })

    // P1-1（工作区受信根来源收敛）：菜单/快捷键「打开文件夹」的原生选择结果由主进程
    // 置顶维护 recent-folders（渲染层 config:write('recent-folders') 已被拒绝）
    it('should record the opened directory through the injected recent-folder recorder', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [caseDir] })
        const recorder = vi.fn(async () => {})
        setRecentFolderRecorderProvider(recorder)
        try {
            await OpenDirectory({
                webContents: { send: vi.fn() }
            } as unknown as Electron.BrowserWindow)
            expect(recorder).toHaveBeenCalledWith(caseDir)
        } finally {
            // 注入属进程级全局状态：用例结束复位，避免污染其它用例
            setRecentFolderRecorderProvider(null)
        }
    })
})

describe('ReopenActiveFileWithEncoding / ConvertActiveFileEncoding (FUN-02)', () => {
    it('should reopen a GBK file with the specified encoding and update state', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'gbk.md')
        const text = 'GBK 编码的中文内容测试'
        await fs.writeFile(filePath, iconv.encode(text, 'gbk'))

        appState.currentActiveFile = {
            name: 'gbk.md',
            path: filePath,
            type: 'file',
            content: '',
            encoding: 'utf-8'
        }
        await ReopenActiveFileWithEncoding('gbk')

        expect(appState.currentActiveFile?.content).toBe(text)
        expect(appState.currentActiveFile?.encoding).toBe('gbk')
        expect(appState.isDirty()).toBe(false)
        expect(mainSend).toHaveBeenCalledWith('baize:fs:show-selected-file-context', text)
    })

    it('should fall back to utf-8 for an unsupported encoding name', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'utf8.md')
        await fs.writeFile(filePath, 'hello', 'utf8')

        appState.currentActiveFile = {
            name: 'utf8.md',
            path: filePath,
            type: 'file',
            content: '',
            encoding: 'utf-8'
        }
        await ReopenActiveFileWithEncoding('x-unknown-encoding')

        expect(appState.currentActiveFile?.content).toBe('hello')
        expect(appState.currentActiveFile?.encoding).toBe('utf-8')
    })

    it('should convert the active file content to GBK and save it', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'convert.md')
        const text = '转码保存的中文内容'
        await fs.writeFile(filePath, text, 'utf8')

        appState.currentActiveFile = {
            name: 'convert.md',
            path: filePath,
            type: 'file',
            content: text,
            encoding: 'utf-8'
        }
        await ConvertActiveFileEncoding('gbk')

        expect(iconv.decode(await fs.readFile(filePath), 'gbk')).toBe(text)
        expect(appState.currentActiveFile?.encoding).toBe('gbk')
        expect(appState.isDirty()).toBe(false)
    })

    it('should throw when there is no active file', async () => {
        appState.currentActiveFile = null
        await expect(ReopenActiveFileWithEncoding('gbk')).rejects.toThrow()
        await expect(ConvertActiveFileEncoding('gbk')).rejects.toThrow()
    })
})

// ==================== P1-AS-1：文件 IPC 路径约束 ====================
describe('P1-AS-1 path guard (越界路径拒绝)', () => {
    const OUTSIDE_PATH = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd'
    /** 逃逸出允许根的 `..` 路径：tmpDir/.. 解析到 os.tmpdir 之外 */
    const ESCAPING_PATH = path.join(os.tmpdir(), '..', 'baize-as1-escape.md')

    it('should reject opening a file outside the allowed roots', async () => {
        await OpenSelectFile({ name: 'win.ini', path: OUTSIDE_PATH, type: 'file', content: '' })

        expect(appState.currentActiveFile).toBeNull()
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({
                type: 'error',
                message: expect.stringContaining('打开文件失败')
            })
        )
    })

    it('should reject `..` traversal escaping the allowed roots', async () => {
        await OpenSelectFile({ name: 'escape.md', path: ESCAPING_PATH, type: 'file', content: '' })

        expect(appState.currentActiveFile).toBeNull()
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })

    it('should reject malformed FileProperties payloads without crashing', async () => {
        type OpenSelectFilePayload = Parameters<typeof OpenSelectFile>[0]
        await OpenSelectFile(null as unknown as OpenSelectFilePayload)
        await OpenSelectFile({ name: 'x.md' } as unknown as OpenSelectFilePayload)
        await OpenSelectFile({ name: 'x.md', path: 42 } as unknown as OpenSelectFilePayload)

        expect(appState.currentActiveFile).toBeNull()
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })

    it('should still open a file inside the allowed roots (合法场景不误伤)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'guard-ok-'))
        const filePath = path.join(caseDir, 'ok.md')
        await fs.writeFile(filePath, '# ok', 'utf8')

        await OpenSelectFile({ name: 'ok.md', path: filePath, type: 'file', content: '' })

        expect(appState.currentActiveFile?.path).toBe(filePath)
        expect(appState.currentActiveFile?.content).toBe('# ok')
    })

    it('should refuse to write an active file whose path is out of scope', async () => {
        appState.currentActiveFile = {
            name: 'win.ini',
            path: OUTSIDE_PATH,
            type: 'file',
            content: 'hacked',
            encoding: 'utf-8'
        }

        const ok = await SaveActiveFile()

        expect(ok).toBe(false)
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error', message: expect.stringContaining('保存失败') })
        )
    })

    it('should reject a traversal file name in CreateFileFolder without writing outside the directory', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'guard-name-'))
        const escapedPath = path.join(caseDir, '..', 'evil.md')

        await CreateFileFolder('..\\evil', caseDir, false, '.md')

        await expect(fs.access(escapedPath)).rejects.toThrow()
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })

    it('should reject a traversal newName in Rename and keep the source file', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'guard-rename-'))
        const oldPath = path.join(caseDir, 'old.md')
        await fs.writeFile(oldPath, 'keep', 'utf8')

        await Rename(oldPath, '..\\moved', true)

        expect(await fs.readFile(oldPath, 'utf8')).toBe('keep')
        await expect(fs.access(path.join(caseDir, '..', 'moved.md'))).rejects.toThrow()
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })

    // FE-33：名称白名单复用 security.ts 的 isSafeFileName——除路径分隔符/.. 外，
    // 冒号（含 Windows ADS）、通配符、控制字符、保留设备名同样必须拒绝，且失败提示不静默。
    it('should reject Windows illegal characters in new entry names (FE-33)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'guard-name-chars-'))
        const illegalNames = [
            'a:b',
            'a<b',
            'a>b',
            'a|b',
            'a?b',
            'a*b',
            'a"b',
            'a\u0000b',
            '.',
            '..'
        ]

        for (const name of illegalNames) {
            await CreateFile(caseDir, name, '.md')
            await CreateDirectory(caseDir, name)
            await CreateFileFolder(name, caseDir, true, '')
            await Rename(path.join(caseDir, 'missing.md'), name, true)
        }

        // 全部被拒绝：目标目录中没有任何新产物，且每次拒绝都有状态栏错误提示（不静默）
        expect(await fs.readdir(caseDir)).toEqual([])
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })

    it.runIf(process.platform === 'win32')(
        'should reject Windows reserved device names (FE-33)',
        async () => {
            const caseDir = await fs.mkdtemp(path.join(tmpDir, 'guard-name-reserved-'))
            for (const name of ['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT9', 'con.md']) {
                await CreateFile(caseDir, name, '.md')
                await CreateDirectory(caseDir, name)
            }
            expect(await fs.readdir(caseDir)).toEqual([])
            expect(mainSend).toHaveBeenCalledWith(
                'baize:status-bar:update',
                expect.objectContaining({ type: 'error' })
            )
        }
    )

    it('should reject deleting a path outside the allowed roots without touching it', async () => {
        await Delete(OUTSIDE_PATH, true)

        // 未执行 fs.unlink，因此不会产生 ENOENT/EACCES 类错误对话框；只有状态栏安全提示
        expect(mainSend).not.toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('ENOENT') })
        )
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })

    it('should reject ReloadDirFromDisk when the workspace root is a drive root', async () => {
        appState.rootPath = path.parse(os.tmpdir()).root

        await ReloadDirFromDisk()

        expect(appState.mdFileTree).toBeNull()
        expect(mainSend).not.toHaveBeenCalledWith('baize:fs:file-system-data', expect.anything())
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })
})
