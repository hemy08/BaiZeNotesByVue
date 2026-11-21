/**
 * 覆盖率补测第五批：file-operations.ts 对话框 / 路径守卫 / 异常分支。
 *
 * 本文件独立于既有 file-operations.test.ts（并行批次可能改动该文件），只新增用例；
 * 覆盖点（此前未覆盖的语句/分支）：
 * - SaveActiveFile：越界路径、编码/内容缺省、写盘失败（interactive 与 auto-save 去重）；
 * - SaveActiveFileAs：无活动文件/空内容、主窗口已销毁、取消、越界、各格式导出
 *   （word/html/json/pdf）、非法扩展名、写盘失败；
 * - CreateFileFolder / CreateFile / CreateDirectory：目录与文件名白名单、完整路径二次守卫、
 *   目录/文件已存在、创建成功下发事件；
 * - OpenSelectFile：非法载荷、路径越界、切换文件前自动保存（越界跳过 / 写盘失败）、
 *   大文件取消（有/无父窗口）、stat 失败回退、读取失败提示；
 * - Reopen/Convert 编码：无活动文件、越界、成功写盘与广播；
 * - OpenFile / OpenDirectory / GetSelectDir / Rename / Delete：取消、异常兜底与删除失败提示。
 */
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'

const electronMocks = vi.hoisted(() => ({
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
    showMessageBox: vi.fn(),
    showMessageBoxSync: vi.fn(),
    showItemInFolder: vi.fn(),
    getAllWindows: vi.fn<
        () => Array<{ webContents: { send: (channel: string, ...args: unknown[]) => void } }>
    >(() => [])
}))

vi.mock('electron', () => {
    class MockBrowserWindow {
        static getAllWindows = electronMocks.getAllWindows
        webContents = { send: vi.fn() }
    }
    return {
        BrowserWindow: MockBrowserWindow,
        dialog: {
            showSaveDialog: electronMocks.showSaveDialog,
            showOpenDialog: electronMocks.showOpenDialog,
            showMessageBox: electronMocks.showMessageBox,
            showMessageBoxSync: electronMocks.showMessageBoxSync
        },
        shell: { showItemInFolder: electronMocks.showItemInFolder },
        clipboard: { writeText: vi.fn() },
        app: { getPath: () => '', getVersion: () => '1.5.0-test' },
        ipcMain: { on: () => {} }
    }
})

vi.mock('../../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../../src/main/utils/file-state-store', () => ({
    saveLastOpenedDirectory: vi.fn(),
    saveLastOpenedFile: vi.fn()
}))

const providerMocks = vi.hoisted(() => ({
    recordRecentFolderFromProvider: vi.fn(async () => undefined)
}))
vi.mock('../../../src/main/utils/providers', () => providerMocks)

const exportMocks = vi.hoisted(() => ({
    ToWord: vi.fn(async () => undefined),
    ToHtml: vi.fn(async () => undefined),
    ToJson: vi.fn(async () => undefined),
    ToPdf: vi.fn(async () => undefined)
}))
vi.mock('../../../src/main/utils/file-utils/export', () => exportMocks)

const securityMocks = vi.hoisted(() => ({
    isPathAllowed: vi.fn((target: unknown) => {
        void target
        return true
    }),
    isSafeFileName: vi.fn((name: unknown) => {
        void name
        return true
    }),
    isSafeFileExtension: vi.fn((extension: unknown) => {
        void extension
        return true
    }),
    registerTrustedDirectory: vi.fn(),
    registerTrustedPath: vi.fn()
}))

vi.mock('../../../src/main/utils/security', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/main/utils/security')>()
    return { ...actual, ...securityMocks }
})

const fileEncodingMocks = vi.hoisted(() => ({
    LARGE_FILE_THRESHOLD: 5 * 1024 * 1024,
    encodeFileContent: vi.fn((content: string, encoding: string) => {
        void encoding
        return Buffer.from(content, 'utf8')
    }),
    normalizeEncoding: vi.fn((encoding: string) => encoding),
    ReadFileContentAdaptive: vi.fn(async () => ({
        content: 'disk-content',
        encoding: 'utf-8',
        streamed: false
    })),
    DescribeFileSystemError: vi.fn(() => '中文原因')
}))
vi.mock('../../../src/main/utils/file-utils/file-encoding', () => fileEncodingMocks)

const directoryTreeMocks = vi.hoisted(() => ({
    ReloadDirFromDisk: vi.fn(async () => undefined),
    ScheduleReloadFromDisk: vi.fn(),
    stopDirectoryWatcher: vi.fn(),
    CleanupDirectoryWatch: vi.fn(),
    DegradeDirectoryWatch: vi.fn(),
    GetDirectoryReloadStats: vi.fn(() => null),
    GetDirectoryWatchStatus: vi.fn(() => ({
        active: false,
        rootPath: '',
        recursive: false,
        degraded: false,
        batchPending: false
    })),
    TraverseDirectory: vi.fn()
}))
vi.mock('../../../src/main/utils/file-utils/directory-tree', () => directoryTreeMocks)

const sharedMocks = vi.hoisted(() => ({
    beginSelfWrite: vi.fn(),
    endSelfWrite: vi.fn(),
    notifyInvalidFileName: vi.fn(),
    notifyPathAccessDenied: vi.fn(),
    refreshActiveFileDiskStamp: vi.fn(async () => undefined),
    rememberActiveFileDiskStamp: vi.fn()
}))
vi.mock('../../../src/main/utils/file-utils/shared', () => sharedMocks)

const fsOverrides = vi.hoisted(() => ({
    writeFile: null as null | ((file: string, data: unknown) => Promise<void>),
    access: null as null | ((target: string) => Promise<void>),
    mkdir: null as null | ((target: string) => Promise<void>),
    rename: null as null | ((from: string, to: string) => Promise<void>),
    unlink: null as null | ((target: string) => Promise<void>),
    rm: null as null | ((target: string) => Promise<void>),
    stat: null as null | ((target: string) => Promise<{ size: number; mtimeMs: number }>)
}))

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>()
    // 惰性回退：未设覆盖时才调用真实实现，避免真实 IO 产生未处理的 Promise 拒绝
    const wrap = <T>(override: () => T | null, real: () => T): T => override() ?? real()
    return {
        ...actual,
        promises: {
            ...actual.promises,
            writeFile: (file: string, data: unknown): Promise<void> =>
                wrap(
                    () => fsOverrides.writeFile?.(file, data) ?? null,
                    () => actual.promises.writeFile(file, data as never)
                ),
            access: (target: string): Promise<void> =>
                wrap(
                    () => fsOverrides.access?.(target) ?? null,
                    () => actual.promises.access(target)
                ),
            mkdir: (target: string, options?: unknown): Promise<void> =>
                wrap(
                    () => fsOverrides.mkdir?.(target) ?? null,
                    () =>
                        (
                            actual.promises.mkdir as unknown as (
                                t: string,
                                o?: unknown
                            ) => Promise<void>
                        )(target, options)
                ),
            rename: (from: string, to: string): Promise<void> =>
                wrap(
                    () => fsOverrides.rename?.(from, to) ?? null,
                    () => actual.promises.rename(from, to)
                ),
            unlink: (target: string): Promise<void> =>
                wrap(
                    () => fsOverrides.unlink?.(target) ?? null,
                    () => actual.promises.unlink(target)
                ),
            rm: (target: string, options?: unknown): Promise<void> =>
                wrap(
                    () => fsOverrides.rm?.(target) ?? null,
                    () =>
                        (
                            actual.promises.rm as unknown as (
                                t: string,
                                o?: unknown
                            ) => Promise<void>
                        )(target, options)
                ),
            stat: (target: string): Promise<{ size: number; mtimeMs: number }> =>
                wrap(
                    () => fsOverrides.stat?.(target) ?? null,
                    () =>
                        actual.promises.stat(target) as unknown as Promise<{
                            size: number
                            mtimeMs: number
                        }>
                )
        }
    }
})

import {
    ConvertActiveFileEncoding,
    CreateDirectory,
    CreateFile,
    CreateFileFolder,
    Delete,
    GetSelectDir,
    OpenDirectory,
    OpenFile,
    OpenSelectFile,
    ReopenActiveFileWithEncoding,
    Rename,
    SaveActiveFile,
    SaveActiveFileAs,
    resetAutoSaveFailureNoticeForTesting
} from '../../../src/main/utils/file-utils/file-operations'
import { appState } from '../../../src/main/utils/app-state'
import { logger } from '../../../src/main/utils/logger'
import { IPC } from '../../../src/shared/ipc-channels'
import { ReadFileContentAdaptive } from '../../../src/main/utils/file-utils/file-encoding'

const mainSend = vi.fn()
const mainWindow = {
    webContents: { id: 1, send: mainSend, isDestroyed: () => false },
    isDestroyed: () => false
}
const WORKSPACE = path.join(
    os.tmpdir(),
    `baize-file-ops-extra-${process.pid}-${Date.now().toString(36)}`
)
const OUTSIDE = 'C:\\Windows\\win.ini'
let actualFs: typeof import('fs') | null = null

beforeAll(async () => {
    // 本文件把 'fs' 模块整体 mock；用 importActual 拿到真实实现，创建临时工作区。
    // 不能使用硬编码 E:\workspace：CI 无 E: 盘/目录，真实写盘会失败（本地因目录残留
    // 而碰巧通过）。临时目录同时使 8.3 短路径/realpath 归一化与 CI 保持一致。
    actualFs = await vi.importActual<typeof import('fs')>('fs')
    actualFs.mkdirSync(WORKSPACE, { recursive: true })
})

afterAll(() => {
    actualFs?.rmSync(WORKSPACE, { recursive: true, force: true })
})

/** 收集经 Vue 对话框下发的消息文案（showErrorMessageBox 走 IPC.DIALOG.OPEN_VUE_DIALOG） */
function dialogMessages(): string[] {
    return mainSend.mock.calls
        .filter((call) => call[0] === IPC.DIALOG.OPEN_VUE_DIALOG)
        .map((call) => String((call[2] as { message?: string } | undefined)?.message ?? ''))
}

function resetOverrides(): void {
    fsOverrides.writeFile = null
    fsOverrides.access = null
    fsOverrides.mkdir = null
    fsOverrides.rename = null
    fsOverrides.unlink = null
    fsOverrides.rm = null
    fsOverrides.stat = null
}

function grantAllPaths(): void {
    securityMocks.isPathAllowed.mockImplementation(() => true)
    securityMocks.isSafeFileName.mockImplementation(() => true)
    securityMocks.isSafeFileExtension.mockImplementation(() => true)
}

function makeActiveFile(overrides: Record<string, unknown> = {}): void {
    appState.currentActiveFile = {
        name: 'note.md',
        path: path.join(WORKSPACE, 'note.md'),
        type: 'file',
        content: 'hello',
        encoding: 'utf-8',
        ...overrides
    } as never
}

beforeEach(() => {
    vi.clearAllMocks()
    appState._resetForTesting()
    appState.mainWindow = mainWindow as unknown as Electron.BrowserWindow
    resetOverrides()
    resetAutoSaveFailureNoticeForTesting()
    grantAllPaths()
    electronMocks.getAllWindows.mockReturnValue([])
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    electronMocks.showMessageBox.mockResolvedValue({ response: 0, checkboxChecked: false })
    electronMocks.showMessageBoxSync.mockReturnValue(0)
    directoryTreeMocks.ReloadDirFromDisk.mockResolvedValue(undefined)
    providerMocks.recordRecentFolderFromProvider.mockResolvedValue(undefined)
    fileEncodingMocks.ReadFileContentAdaptive.mockResolvedValue({
        content: 'disk-content',
        encoding: 'utf-8',
        streamed: false
    })
    fileEncodingMocks.encodeFileContent.mockImplementation((content: string) =>
        Buffer.from(content, 'utf8')
    )
    sharedMocks.refreshActiveFileDiskStamp.mockResolvedValue(undefined)
})

afterEach(() => {
    resetOverrides()
})

describe('SaveActiveFile 边界', () => {
    it('越界活动文件路径只提示不写盘', async () => {
        makeActiveFile({ path: 'C:\\Windows\\note.md' })
        securityMocks.isPathAllowed.mockReturnValue(false)
        await expect(SaveActiveFile()).resolves.toBe(false)
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalled()
        expect(fsOverrides.writeFile).toBeNull()
    })

    it('编码/内容缺省时按 utf-8 写盘并通知所有窗口', async () => {
        makeActiveFile({ encoding: undefined, content: undefined })
        const windowSend = vi.fn()
        electronMocks.getAllWindows.mockReturnValue([{ webContents: { send: windowSend } }])

        await expect(SaveActiveFile()).resolves.toBe(true)
        expect(fileEncodingMocks.encodeFileContent).toHaveBeenCalledWith('', 'utf-8')
        expect(windowSend).toHaveBeenCalledWith(IPC.EVENTS.FILE_SAVED_SUCCESS)
        expect(sharedMocks.beginSelfWrite).toHaveBeenCalled()
        expect(sharedMocks.endSelfWrite).toHaveBeenCalled()
        expect(sharedMocks.refreshActiveFileDiskStamp).toHaveBeenCalled()
    })

    it('interactive 失败：弹错误框 + 状态栏 error', async () => {
        makeActiveFile()
        fsOverrides.writeFile = async () => {
            throw new Error('EACCES')
        }
        await expect(SaveActiveFile()).resolves.toBe(false)
        expect(mainSend).toHaveBeenCalledWith(
            IPC.EVENTS.STATUS_BAR_UPDATE,
            expect.objectContaining({ type: 'error' })
        )
        expect(logger.error).toHaveBeenCalled()
        expect(sharedMocks.endSelfWrite).toHaveBeenCalled()
    })

    it('auto-save 失败：只发状态栏且同一错误 5 分钟内去重，成功保存后清除记录', async () => {
        makeActiveFile()
        fsOverrides.writeFile = async () => {
            throw new Error('EBUSY')
        }
        await expect(SaveActiveFile({ failureNotice: 'auto-save' })).resolves.toBe(false)
        const firstNoticeCount = mainSend.mock.calls.filter(
            (call) =>
                call[0] === IPC.EVENTS.STATUS_BAR_UPDATE &&
                (call[1] as { type?: string }).type === 'error'
        ).length
        expect(firstNoticeCount).toBe(1)

        // 同一文件 + 同一错误：窗口内不再重复提示
        await expect(SaveActiveFile({ failureNotice: 'auto-save' })).resolves.toBe(false)
        const secondNoticeCount = mainSend.mock.calls.filter(
            (call) =>
                call[0] === IPC.EVENTS.STATUS_BAR_UPDATE &&
                (call[1] as { type?: string }).type === 'error'
        ).length
        expect(secondNoticeCount).toBe(1)

        // 保存成功清除去重记录：下一次失败立即提示
        fsOverrides.writeFile = null
        await expect(SaveActiveFile({ failureNotice: 'auto-save' })).resolves.toBe(true)
        fsOverrides.writeFile = async () => {
            throw new Error('EBUSY')
        }
        await expect(SaveActiveFile({ failureNotice: 'auto-save' })).resolves.toBe(false)
        expect(
            mainSend.mock.calls.filter(
                (call) =>
                    call[0] === IPC.EVENTS.STATUS_BAR_UPDATE &&
                    (call[1] as { type?: string }).type === 'error'
            ).length
        ).toBe(2)
    })
})

describe('SaveActiveFileAs 边界', () => {
    it('无活动文件或内容为空时提示', async () => {
        await SaveActiveFileAs()
        expect(dialogMessages().some((text) => text.length > 0)).toBe(true)

        makeActiveFile({ content: '' })
        mainSend.mockClear()
        await SaveActiveFileAs()
        expect(dialogMessages().some((text) => text.length > 0)).toBe(true)
    })

    it('主窗口不可用时记录日志并取消', async () => {
        makeActiveFile()
        appState.mainWindow = null
        await SaveActiveFileAs()
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('主窗口已销毁'))
    })

    it('用户取消保存对话框时静默返回', async () => {
        makeActiveFile()
        await SaveActiveFileAs()
        expect(fsOverrides.writeFile).toBeNull()
        expect(electronMocks.showSaveDialog).toHaveBeenCalled()
    })

    it('另存为目标越界时提示并中止', async () => {
        makeActiveFile()
        electronMocks.showSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: path.join(WORKSPACE, 'out.md')
        })
        securityMocks.isPathAllowed.mockReturnValue(false)
        await SaveActiveFileAs()
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalled()
    })

    it('非法扩展名提示不支持', async () => {
        makeActiveFile()
        electronMocks.showSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: path.join(WORKSPACE, 'out.xyz')
        })
        await SaveActiveFileAs()
        expect(dialogMessages().some((text) => text.length > 0)).toBe(true)
    })

    it('md/txt 保存成功：写盘 + 更新活动文件 + 成功提示', async () => {
        makeActiveFile({ name: undefined, encoding: undefined, content: 'body' })
        electronMocks.showSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: path.join(WORKSPACE, 'saved.md')
        })
        await SaveActiveFileAs()
        expect(fsOverrides.writeFile).toBeNull() // 未覆盖 fs，走真实写盘（临时目录外）
        expect(fileEncodingMocks.encodeFileContent).toHaveBeenCalledWith('body', 'utf-8')
        expect(appState.currentActiveFile?.path).toBe(path.join(WORKSPACE, 'saved.md'))
        expect(mainSend).toHaveBeenCalledWith(
            IPC.DIALOG.OPEN_VUE_DIALOG,
            'message',
            expect.objectContaining({ type: 'success' })
        )
        expect(sharedMocks.refreshActiveFileDiskStamp).toHaveBeenCalledWith(
            path.join(WORKSPACE, 'saved.md')
        )
    })

    it('word/html/json/pdf 导出分支分别转发到 export 模块', async () => {
        makeActiveFile()
        for (const [ext, mockFn] of [
            ['.docx', exportMocks.ToWord],
            ['.html', exportMocks.ToHtml],
            ['.JSON', exportMocks.ToJson],
            ['.pdf', exportMocks.ToPdf]
        ] as const) {
            vi.clearAllMocks()
            grantAllPaths()
            makeActiveFile()
            electronMocks.showSaveDialog.mockResolvedValue({
                canceled: false,
                filePath: path.join(WORKSPACE, `out${ext}`)
            })
            await SaveActiveFileAs()
            expect(mockFn).toHaveBeenCalledTimes(1)
        }
    })

    it('导出/写盘失败时提示另存为失败（标题修正为失败）', async () => {
        makeActiveFile()
        electronMocks.showSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: path.join(WORKSPACE, 'out.json')
        })
        exportMocks.ToJson.mockRejectedValueOnce(new Error('write failed'))
        await SaveActiveFileAs()
        expect(logger.error).toHaveBeenCalled()
        const call = mainSend.mock.calls.find(
            (item) => item[0] === IPC.DIALOG.OPEN_VUE_DIALOG && item[1] === 'message'
        )
        expect((call?.[2] as { type?: string }).type).toBe('error')
    })
})

describe('CreateFileFolder / CreateFile / CreateDirectory 守卫', () => {
    it('目录越界 / 文件名非法 / 扩展名非法三条守卫各自提示', async () => {
        securityMocks.isPathAllowed.mockReturnValueOnce(false)
        await CreateFileFolder('a', WORKSPACE, false, '.md')
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(1)

        securityMocks.isPathAllowed.mockReturnValue(true)
        securityMocks.isSafeFileName.mockReturnValueOnce(false)
        await CreateFileFolder('..', WORKSPACE, false, '.md')
        expect(sharedMocks.notifyInvalidFileName).toHaveBeenCalledWith('..')

        securityMocks.isSafeFileName.mockReturnValue(true)
        securityMocks.isSafeFileExtension.mockReturnValueOnce(false)
        await CreateFileFolder('a', WORKSPACE, false, '.exe')
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('已拒绝非法文件扩展名'),
            '.exe'
        )
    })

    it('完整目标路径二次守卫拒绝（dir 允许、拼接后拒绝）', async () => {
        securityMocks.isPathAllowed.mockReturnValueOnce(true).mockReturnValueOnce(false)
        await CreateFileFolder('a', WORKSPACE, false, '.md')
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(1)
        expect(directoryTreeMocks.ScheduleReloadFromDisk).not.toHaveBeenCalled()
    })

    it('文件夹已存在时提示，不重复创建', async () => {
        fsOverrides.access = async () => undefined
        await CreateFileFolder('exists', WORKSPACE, true, '')
        expect(dialogMessages().some((text) => text.includes('已存在'))).toBe(true)
    })

    it('文件已存在时提示并返回', async () => {
        fsOverrides.access = async () => undefined
        await CreateFileFolder('exists.md', WORKSPACE, false, '')
        expect(dialogMessages().some((text) => text.includes('已存在'))).toBe(true)
    })

    it('新建文件夹成功：mkdir + 目录刷新调度', async () => {
        fsOverrides.access = async () => {
            throw new Error('ENOENT')
        }
        await CreateFileFolder('new-folder', WORKSPACE, true, '')
        expect(directoryTreeMocks.ScheduleReloadFromDisk).toHaveBeenCalled()
        expect(sharedMocks.beginSelfWrite).toHaveBeenCalled()
    })

    it('新建带扩展名文件成功：写标题内容并下发打开事件', async () => {
        fsOverrides.access = async () => {
            throw new Error('ENOENT')
        }
        await CreateFileFolder('chapter.one.md', WORKSPACE, false, '')
        expect(mainSend).toHaveBeenCalledWith(
            IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT,
            expect.stringContaining('chapter.one')
        )
        expect(appState.currentActiveFile?.path).toContain('chapter.one.md')
        expect(directoryTreeMocks.ScheduleReloadFromDisk).toHaveBeenCalled()
    })

    it('新建无扩展名文件成功：标题为完整名称', async () => {
        fsOverrides.access = async () => {
            throw new Error('ENOENT')
        }
        await CreateFileFolder('plain', WORKSPACE, false, '')
        expect(mainSend).toHaveBeenCalledWith(
            IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT,
            expect.stringContaining('plain')
        )
    })

    it('CreateFile：目录越界 / 文件名非法 / 扩展名非法 / 完整路径越界各自拒绝', async () => {
        securityMocks.isPathAllowed.mockReturnValueOnce(false)
        await CreateFile(WORKSPACE, 'a', '.md')
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(1)

        securityMocks.isPathAllowed.mockReturnValue(true)
        securityMocks.isSafeFileName.mockReturnValueOnce(false)
        await CreateFile(WORKSPACE, '..', '.md')
        expect(sharedMocks.notifyInvalidFileName).toHaveBeenCalledWith('..')

        securityMocks.isSafeFileName.mockReturnValue(true)
        securityMocks.isSafeFileExtension.mockReturnValueOnce(false)
        await CreateFile(WORKSPACE, 'a', '.exe')
        expect(sharedMocks.notifyInvalidFileName).toHaveBeenCalledTimes(2)

        securityMocks.isSafeFileExtension.mockReturnValue(true)
        securityMocks.isPathAllowed.mockReturnValueOnce(true).mockReturnValueOnce(false)
        await CreateFile(WORKSPACE, 'a', '.md')
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(2)
    })

    it('CreateFile 成功：写空内容、记录活动文件并调度刷新', async () => {
        await CreateFile(WORKSPACE, 'created', '.md')
        expect(directoryTreeMocks.ScheduleReloadFromDisk).toHaveBeenCalled()
        expect(appState.currentActiveFile?.content).toBe('')
        expect(appState.currentActiveFile?.path).toBe(path.join(WORKSPACE, 'created.md'))
        expect(sharedMocks.endSelfWrite).toHaveBeenCalled()
    })

    it('CreateDirectory：目录越界 / 名称非法 / 完整路径越界各自拒绝', async () => {
        securityMocks.isPathAllowed.mockReturnValueOnce(false)
        await CreateDirectory(WORKSPACE, 'dir')
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(1)

        securityMocks.isPathAllowed.mockReturnValue(true)
        securityMocks.isSafeFileName.mockReturnValueOnce(false)
        await CreateDirectory(WORKSPACE, '..')
        expect(sharedMocks.notifyInvalidFileName).toHaveBeenCalled()

        securityMocks.isSafeFileName.mockReturnValue(true)
        securityMocks.isPathAllowed.mockReturnValueOnce(true).mockReturnValueOnce(false)
        await CreateDirectory(WORKSPACE, 'dir')
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(2)
    })

    it('CreateDirectory：已存在提示 / 不存在时 mkdir 并调度刷新', async () => {
        fsOverrides.access = async () => undefined
        await CreateDirectory(WORKSPACE, 'existing')
        expect(dialogMessages().some((text) => text.includes('已存在'))).toBe(true)

        fsOverrides.access = async () => {
            throw new Error('ENOENT')
        }
        await CreateDirectory(WORKSPACE, 'created')
        expect(directoryTreeMocks.ScheduleReloadFromDisk).toHaveBeenCalled()
    })
})

describe('OpenSelectFile 边界', () => {
    it('非法载荷与越界路径仅提示', async () => {
        await OpenSelectFile(null as never)
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledWith(
            '(invalid FileProperties)',
            'mainMsg.status.openFileFailed'
        )

        securityMocks.isPathAllowed.mockReturnValue(false)
        await OpenSelectFile({ name: 'x', path: OUTSIDE, type: 'file', content: '' })
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(2)
    })

    it('切换前自动保存：越界活动文件跳过写盘并告警', async () => {
        makeActiveFile({ path: 'C:\\Windows\\note.md' })
        securityMocks.isPathAllowed
            .mockReturnValueOnce(true) // 新文件路径允许
            .mockReturnValueOnce(false) // 旧活动文件越界
            .mockReturnValue(true)
        fsOverrides.stat = async () => ({ size: 10, mtimeMs: 1 })
        await OpenSelectFile({
            name: 'new.md',
            path: path.join(WORKSPACE, 'new.md'),
            type: 'file',
            content: ''
        })
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('已跳过越界活动文件的自动保存'),
            'C:\\Windows\\note.md'
        )
        expect(appState.currentActiveFile?.path).toBe(path.join(WORKSPACE, 'new.md'))
    })

    it('切换前自动保存写盘失败只记录错误，仍继续打开新文件', async () => {
        makeActiveFile()
        fsOverrides.writeFile = async () => {
            throw new Error('EWRITE')
        }
        fsOverrides.stat = async () => ({ size: 10, mtimeMs: 1 })
        await OpenSelectFile({
            name: 'new.md',
            path: path.join(WORKSPACE, 'new.md'),
            type: 'file',
            content: ''
        })
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Failed to automatically save the file'),
            expect.anything(),
            expect.any(Error)
        )
    })

    it('大文件确认：用户取消时中止（有父窗口与无父窗口两条调用）', async () => {
        fsOverrides.stat = async () => ({ size: 6 * 1024 * 1024, mtimeMs: 1 })
        electronMocks.showMessageBox.mockResolvedValue({ response: 1 })
        await OpenSelectFile({
            name: 'big.md',
            path: path.join(WORKSPACE, 'big.md'),
            type: 'file',
            content: ''
        })
        expect(electronMocks.showMessageBox).toHaveBeenCalledWith(
            mainWindow,
            expect.objectContaining({ type: 'warning' })
        )
        expect(ReadFileContentAdaptive).not.toHaveBeenCalled()

        // 无主窗口时使用无父窗口对话框
        appState.mainWindow = null
        electronMocks.showMessageBox.mockClear()
        await OpenSelectFile({
            name: 'big2.md',
            path: path.join(WORKSPACE, 'big2.md'),
            type: 'file',
            content: ''
        })
        expect(electronMocks.showMessageBox).toHaveBeenCalledTimes(1)
        expect(electronMocks.showMessageBox.mock.calls[0]).toHaveLength(1)
    })

    it('stat 失败时记录日志并继续读取（签名回退补 stat）', async () => {
        fsOverrides.stat = async () => {
            throw new Error('EPERM')
        }
        await OpenSelectFile({
            name: 'file.md',
            path: path.join(WORKSPACE, 'file.md'),
            type: 'file',
            content: ''
        })
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('check file size failed'),
            expect.anything(),
            expect.any(Error)
        )
        expect(ReadFileContentAdaptive).toHaveBeenCalledWith(
            path.join(WORKSPACE, 'file.md'),
            expect.objectContaining({ fileSize: undefined })
        )
        expect(sharedMocks.refreshActiveFileDiskStamp).toHaveBeenCalled()
        expect(mainSend).toHaveBeenCalledWith(
            IPC.EVENTS.STATUS_BAR_UPDATE,
            expect.objectContaining({ type: 'success' })
        )
    })

    it('正常打开：记录已 stat 签名并状态栏显示实际编码', async () => {
        fsOverrides.stat = async () => ({ size: 12, mtimeMs: 100 })
        await OpenSelectFile({
            name: 'file.md',
            path: path.join(WORKSPACE, 'file.md'),
            type: 'file',
            content: ''
        })
        expect(sharedMocks.rememberActiveFileDiskStamp).toHaveBeenCalledWith(
            path.join(WORKSPACE, 'file.md'),
            { mtimeMs: 100, size: 12 }
        )
    })

    it('读取失败时状态栏错误提示（非 Error 负载走 String 兜底）', async () => {
        fileEncodingMocks.ReadFileContentAdaptive.mockRejectedValueOnce('plain failure')
        await OpenSelectFile({
            name: 'file.md',
            path: path.join(WORKSPACE, 'file.md'),
            type: 'file',
            content: ''
        })
        expect(mainSend).toHaveBeenCalledWith(
            IPC.EVENTS.STATUS_BAR_UPDATE,
            expect.objectContaining({
                type: 'error',
                message: expect.stringContaining('plain failure')
            })
        )
    })
})

describe('编码重开 / 转码', () => {
    it('无活动文件时抛出受控错误', async () => {
        await expect(ReopenActiveFileWithEncoding('gbk')).rejects.toThrow()
        await expect(ConvertActiveFileEncoding('gbk')).rejects.toThrow()
    })

    it('活动文件路径越界时提示并抛 PathAccessDeniedError', async () => {
        makeActiveFile({ path: 'C:\\Windows\\note.md' })
        securityMocks.isPathAllowed.mockReturnValue(false)
        await expect(ReopenActiveFileWithEncoding('gbk')).rejects.toThrow()
        await expect(ConvertActiveFileEncoding('gbk')).rejects.toThrow()
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(2)
    })

    it('按指定编码重开成功：更新内容/编码并下发', async () => {
        makeActiveFile()
        fileEncodingMocks.ReadFileContentAdaptive.mockResolvedValueOnce({
            content: 'reopened',
            encoding: 'gbk',
            streamed: false
        })
        await ReopenActiveFileWithEncoding('gbk')
        expect(appState.currentActiveFile?.content).toBe('reopened')
        expect(appState.currentActiveFile?.encoding).toBe('gbk')
        expect(mainSend).toHaveBeenCalledWith(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT, 'reopened')
    })

    it('转码成功：按目标编码写盘 + 通知所有窗口', async () => {
        makeActiveFile({ content: undefined })
        const windowSend = vi.fn()
        electronMocks.getAllWindows.mockReturnValue([{ webContents: { send: windowSend } }])
        await ConvertActiveFileEncoding('gbk')
        expect(fileEncodingMocks.normalizeEncoding).toHaveBeenCalledWith('gbk')
        expect(fileEncodingMocks.encodeFileContent).toHaveBeenCalledWith('', 'gbk')
        expect(appState.currentActiveFile?.encoding).toBe('gbk')
        expect(windowSend).toHaveBeenCalledWith(IPC.EVENTS.FILE_SAVED_SUCCESS)
        expect(sharedMocks.refreshActiveFileDiskStamp).toHaveBeenCalled()
    })
})

describe('对话框入口', () => {
    it('OpenFile：取消静默返回；选中后异常时记录日志', async () => {
        await OpenFile(mainWindow as unknown as Electron.BrowserWindow)

        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [path.join(WORKSPACE, 'picked.md')]
        })
        securityMocks.registerTrustedPath.mockImplementationOnce(() => {
            throw new Error('register failed')
        })
        await OpenFile(mainWindow as unknown as Electron.BrowserWindow)
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('Error reading file'),
            expect.any(Error)
        )
    })

    it('OpenDirectory：取消静默返回；成功切换目录并持久化最近目录；记录失败只告警', async () => {
        await OpenDirectory(mainWindow as unknown as Electron.BrowserWindow)
        expect(securityMocks.registerTrustedDirectory).not.toHaveBeenCalled()

        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [path.join(WORKSPACE, 'dir')]
        })
        providerMocks.recordRecentFolderFromProvider.mockRejectedValueOnce(new Error('record fail'))
        await OpenDirectory(mainWindow as unknown as Electron.BrowserWindow)
        expect(appState.rootPath).toBe(path.join(WORKSPACE, 'dir'))
        expect(directoryTreeMocks.ReloadDirFromDisk).toHaveBeenCalled()
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('更新最近文件夹历史失败'),
            expect.any(Error)
        )
    })

    it('OpenDirectory：目录刷新失败时弹错误框', async () => {
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [path.join(WORKSPACE, 'dir2')]
        })
        directoryTreeMocks.ReloadDirFromDisk.mockRejectedValueOnce(new Error('reload broken'))
        await OpenDirectory(mainWindow as unknown as Electron.BrowserWindow)
        expect(dialogMessages().some((text) => text.includes('reload broken'))).toBe(true)
    })

    it('GetSelectDir：取消回传 null；成功回传目录并登记受信；异常提示并回传 null', async () => {
        const cb = vi.fn()
        GetSelectDir(mainWindow as unknown as Electron.BrowserWindow, cb)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(cb).toHaveBeenCalledWith(null)

        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [path.join(WORKSPACE, 'selected')]
        })
        const okCb = vi.fn()
        GetSelectDir(mainWindow as unknown as Electron.BrowserWindow, okCb)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(okCb).toHaveBeenCalledWith(path.join(WORKSPACE, 'selected'))
        expect(securityMocks.registerTrustedDirectory).toHaveBeenCalledWith(
            path.join(WORKSPACE, 'selected')
        )

        electronMocks.showOpenDialog.mockRejectedValueOnce(new Error('dialog broken'))
        const failCb = vi.fn()
        GetSelectDir(mainWindow as unknown as Electron.BrowserWindow, failCb)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(failCb).toHaveBeenCalledWith(null)
        expect(dialogMessages().some((text) => text.includes('dialog broken'))).toBe(true)
    })
})

describe('Rename / Delete 守卫与失败提示', () => {
    it('重命名：源越界 / 新名非法 / 目标越界分别拒绝', async () => {
        securityMocks.isPathAllowed.mockReturnValueOnce(false)
        await Rename(path.join(WORKSPACE, 'a.md'), 'b', true)
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(1)

        securityMocks.isPathAllowed.mockReturnValue(true)
        securityMocks.isSafeFileName.mockReturnValueOnce(false)
        await Rename(path.join(WORKSPACE, 'a.md'), '..', true)
        expect(sharedMocks.notifyInvalidFileName).toHaveBeenCalledWith('..')

        securityMocks.isSafeFileName.mockReturnValue(true)
        securityMocks.isPathAllowed.mockReturnValueOnce(true).mockReturnValueOnce(false)
        await Rename(path.join(WORKSPACE, 'a.md'), 'b', true)
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(2)
        expect(directoryTreeMocks.ScheduleReloadFromDisk).not.toHaveBeenCalled()
    })

    it('重命名文件成功：rename + 目录刷新 + 重新打开', async () => {
        fsOverrides.rename = async () => undefined
        await Rename(path.join(WORKSPACE, 'a.md'), 'b', true)
        expect(directoryTreeMocks.ScheduleReloadFromDisk).toHaveBeenCalled()
        expect(appState.currentActiveFile?.path).toContain('b.md')
        expect(sharedMocks.endSelfWrite).toHaveBeenCalled()
    })

    it('重命名文件夹成功：不触发打开文件流程', async () => {
        fsOverrides.rename = async () => undefined
        await Rename(path.join(WORKSPACE, 'old-dir'), 'new-dir', false)
        expect(directoryTreeMocks.ScheduleReloadFromDisk).toHaveBeenCalled()
        expect(appState.currentActiveFile).toBeNull()
    })

    it('删除：越界拒绝；rm 失败弹删除失败提示（中文原因）', async () => {
        securityMocks.isPathAllowed.mockReturnValueOnce(false)
        await Delete(path.join(WORKSPACE, 'dir'), false)
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(1)

        securityMocks.isPathAllowed.mockReturnValue(true)
        fsOverrides.rm = async () => {
            throw new Error('EBUSY')
        }
        await Delete(path.join(WORKSPACE, 'dir'), false)
        expect(dialogMessages().some((text) => text.includes('中文原因'))).toBe(true)
        expect(sharedMocks.endSelfWrite).toHaveBeenCalled()
    })

    it('删除文件：unlink 失败提示；成功删除调度目录刷新', async () => {
        fsOverrides.unlink = async () => {
            throw new Error('EPERM')
        }
        await Delete(path.join(WORKSPACE, 'a.md'), true)
        expect(dialogMessages().some((text) => text.includes('中文原因'))).toBe(true)

        fsOverrides.unlink = null
        await Delete(path.join(WORKSPACE, 'a.md'), true)
        expect(directoryTreeMocks.ScheduleReloadFromDisk).toHaveBeenCalled()
    })
})
