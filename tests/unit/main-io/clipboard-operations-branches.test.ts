/**
 * 覆盖率补测第五批：clipboard-operations.ts 失败与定时器分支。
 *
 * 覆盖点（此前未覆盖的语句/分支）：
 * - 粘贴源/目标/最终目标路径越界、源文件名为空/非法、源与目标相同；
 * - 复制失败（源已被删除）与剪切删除源失败的中文提示；
 * - 粘贴成功后 100ms 两次状态清理定时器：目录刷新成功/失败、剪切状态清理。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const electronMocks = vi.hoisted(() => ({
    mainSend: vi.fn(),
    getAllWindows: vi.fn(() => [])
}))

vi.mock('electron', () => {
    class MockBrowserWindow {
        static getAllWindows = electronMocks.getAllWindows
        webContents = { send: electronMocks.mainSend }
    }
    return {
        BrowserWindow: MockBrowserWindow,
        dialog: {
            showSaveDialog: vi.fn(),
            showOpenDialog: vi.fn(),
            showMessageBoxSync: vi.fn()
        },
        shell: { showItemInFolder: vi.fn() },
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

const dialogMocks = vi.hoisted(() => ({ showErrorMessageBox: vi.fn() }))
vi.mock('../../../src/main/utils/file-utils/dialog-helpers', () => dialogMocks)

const fileOpsMocks = vi.hoisted(() => ({
    notifyPathAccessDenied: vi.fn(),
    ReloadDirFromDisk: vi.fn(async () => undefined),
    DescribeFileSystemError: vi.fn((error: unknown) => {
        const code = (error as NodeJS.ErrnoException)?.code ?? 'UNKNOWN'
        const mapped: Record<string, string> = {
            ENOENT: '文件不存在或已被移动',
            EACCES: '没有权限访问该文件'
        }
        return `${mapped[code] ?? '未知错误'}（${code}）`
    })
}))
vi.mock('../../../src/main/utils/file-utils/file-operations', () => fileOpsMocks)

const securityMocks = vi.hoisted(() => ({
    isPathAllowed: vi.fn((target: unknown) => {
        void target
        return true
    }),
    isSafeFileName: vi.fn((name: unknown) => {
        void name
        return true
    })
}))
// 1.5.7 LLM Wiki L1（T1.3）：粘贴/剪切新增 raw/ 只读写入守卫（file-utils/shared →
// security.assertWorkspaceWritable / PathAccessDeniedError），mock 保留真实其余实现
vi.mock('../../../src/main/utils/security', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/main/utils/security')>()
    return { ...actual, ...securityMocks }
})

const fsExtraOverrides = vi.hoisted(() => ({
    removeError: null as null | Error
}))

vi.mock('fs-extra', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs-extra')>()
    const moduleRecord = actual as unknown as { default?: Record<string, unknown> }
    const base: Record<string, unknown> =
        moduleRecord.default ?? (actual as unknown as Record<string, unknown>)
    return {
        ...base,
        default: base,
        remove: async (target: string): Promise<void> => {
            if (fsExtraOverrides.removeError) throw fsExtraOverrides.removeError
            await (base.remove as (target: string) => Promise<void>)(target)
        }
    }
})

import {
    FileManagerContextMenuCopy,
    FileManagerContextMenuCut,
    FileManagerContextMenuPaste
} from '../../../src/main/utils/file-utils/clipboard-operations'
import { appState } from '../../../src/main/utils/app-state'
import { logger } from '../../../src/main/utils/logger'

let tmpDir = ''

const makeWindow = (): Electron.BrowserWindow =>
    ({ webContents: { send: electronMocks.mainSend } }) as unknown as Electron.BrowserWindow

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-clipboard5-'))
    vi.clearAllMocks()
    vi.useFakeTimers()
    appState._resetForTesting()
    appState.mainWindow = makeWindow()
    securityMocks.isPathAllowed.mockReturnValue(true)
    securityMocks.isSafeFileName.mockReturnValue(true)
    fileOpsMocks.ReloadDirFromDisk.mockResolvedValue(undefined)
    fsExtraOverrides.removeError = null
})

afterEach(() => {
    vi.useRealTimers()
    delete (globalThis as { isCopyCutFile?: boolean }).isCopyCutFile
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('复制/剪切来源守卫', () => {
    it('越界来源只提示、不记录剪贴板状态', () => {
        securityMocks.isPathAllowed.mockReturnValue(false)
        FileManagerContextMenuCopy(path.join(tmpDir, 'a.md'), true)
        FileManagerContextMenuCut(path.join(tmpDir, 'b.md'), true)
        expect(appState.srcDirCopyCut).toBe('')
        expect(appState.isCopyOrCut).toBe('')
        expect(fileOpsMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(2)
    })

    it('合法来源记录路径与模式', () => {
        FileManagerContextMenuCopy(path.join(tmpDir, 'a.md'), true)
        expect(appState.srcDirCopyCut).toBe(path.join(tmpDir, 'a.md'))
        expect(appState.isCopyOrCut).toBe('copy')
    })
})

describe('粘贴守卫分支', () => {
    it('目标不是目录（isFile=true）时提示', async () => {
        await FileManagerContextMenuPaste(path.join(tmpDir, 'a.md'), true)
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledTimes(1)
    })

    it('无复制/剪切来源时提示', async () => {
        const target = path.join(tmpDir, 'target')
        fs.mkdirSync(target)
        await FileManagerContextMenuPaste(target, false)
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledTimes(1)
    })

    it('来源越界 / 目标越界 / 目标最终路径越界均提示并中止', async () => {
        const target = path.join(tmpDir, 'target')
        fs.mkdirSync(target)
        const source = path.join(tmpDir, 'src.md')
        fs.writeFileSync(source, 'SRC')
        appState.srcDirCopyCut = source
        appState.isCopyOrCut = 'copy'

        securityMocks.isPathAllowed.mockReturnValueOnce(false) // src
        await FileManagerContextMenuPaste(target, false)
        expect(fileOpsMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(1)

        const destPath = path.join(target, 'src.md')
        securityMocks.isPathAllowed.mockImplementation(
            (candidate: unknown) => candidate !== destPath
        )
        await FileManagerContextMenuPaste(target, false)
        expect(fileOpsMocks.notifyPathAccessDenied).toHaveBeenCalledTimes(2)
        expect(fs.existsSync(destPath)).toBe(false)
    })

    it('源与目标相同 / 源文件名为空（非法）时提示', async () => {
        const target = path.join(tmpDir, 'target')
        fs.mkdirSync(target)
        appState.srcDirCopyCut = target
        appState.isCopyOrCut = 'copy'
        await FileManagerContextMenuPaste(target, false)
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledTimes(1)

        const source = path.join(tmpDir, 'src.md')
        fs.writeFileSync(source, 'SRC')
        appState.srcDirCopyCut = source
        securityMocks.isSafeFileName.mockReturnValueOnce(false)
        await FileManagerContextMenuPaste(target, false)
        expect(fileOpsMocks.notifyPathAccessDenied).toHaveBeenCalled()
    })

    it('目标已存在时提示并不覆盖', async () => {
        const target = path.join(tmpDir, 'target')
        fs.mkdirSync(target)
        const source = path.join(tmpDir, 'src.md')
        fs.writeFileSync(source, 'SRC')
        fs.writeFileSync(path.join(target, 'src.md'), 'OTHER')
        appState.srcDirCopyCut = source
        appState.isCopyOrCut = 'copy'
        await FileManagerContextMenuPaste(target, false)
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledWith(
            expect.stringContaining('已经存在')
        )
        expect(fs.readFileSync(path.join(target, 'src.md'), 'utf-8')).toBe('OTHER')
    })
})

describe('粘贴失败与定时器分支', () => {
    it('复制失败（源已被删除）提示中文原因', async () => {
        const target = path.join(tmpDir, 'target')
        fs.mkdirSync(target)
        const source = path.join(tmpDir, 'gone.md')
        fs.writeFileSync(source, 'SRC')
        appState.srcDirCopyCut = source
        appState.isCopyOrCut = 'copy'
        fs.rmSync(source)

        await FileManagerContextMenuPaste(target, false)
        const message = String(dialogMocks.showErrorMessageBox.mock.calls[0][0])
        expect(message).toContain('复制失败')
        expect(message).toContain('文件不存在或已被移动')
        expect(message).toContain('ENOENT')
    })

    it('剪切模式下删除源失败时提示并中止', async () => {
        const target = path.join(tmpDir, 'target')
        fs.mkdirSync(target)
        const source = path.join(tmpDir, 'cut.md')
        fs.writeFileSync(source, 'SRC')
        appState.srcDirCopyCut = source
        appState.isCopyOrCut = 'cut'
        // 复制成功，但删除源失败
        fsExtraOverrides.removeError = Object.assign(new Error('EBUSY'), { code: 'EBUSY' })

        await FileManagerContextMenuPaste(target, false)
        const message = String(dialogMocks.showErrorMessageBox.mock.calls[0][0])
        expect(message).toContain('删除失败')
        expect(fs.existsSync(path.join(target, 'cut.md'))).toBe(true)
    })

    it('粘贴成功后 100ms 内两次清理：目录刷新成功/失败均不影响主流程', async () => {
        const target = path.join(tmpDir, 'target')
        fs.mkdirSync(target)
        const source = path.join(tmpDir, 'copy.md')
        fs.writeFileSync(source, 'COPY')
        appState.srcDirCopyCut = source
        appState.isCopyOrCut = 'copy'

        await FileManagerContextMenuPaste(target, false)
        expect(appState.srcDirCopyCut).toBe(source)

        // 第二次目录刷新失败：仅记录日志
        fileOpsMocks.ReloadDirFromDisk.mockResolvedValueOnce(undefined).mockRejectedValueOnce(
            new Error('reload failed')
        )
        await vi.advanceTimersByTimeAsync(150)

        expect(appState.srcDirCopyCut).toBe('')
        expect(appState.isCopyOrCut).toBe('')
        expect(fileOpsMocks.ReloadDirFromDisk).toHaveBeenCalledTimes(2)
        expect(logger.error).toHaveBeenCalledWith('Failed to reload from disk:', expect.any(Error))
    })

    it('剪切成功后源文件被删除，定时器清理剪贴板状态', async () => {
        const target = path.join(tmpDir, 'target')
        fs.mkdirSync(target)
        const source = path.join(tmpDir, 'move.md')
        fs.writeFileSync(source, 'MOVE')
        appState.srcDirCopyCut = source
        appState.isCopyOrCut = 'cut'

        await FileManagerContextMenuPaste(target, false)
        expect(fs.existsSync(path.join(target, 'move.md'))).toBe(true)
        expect(fs.existsSync(source)).toBe(false)

        await vi.advanceTimersByTimeAsync(150)
        expect(appState.srcDirCopyCut).toBe('')
        expect(appState.isCopyOrCut).toBe('')
    })
})
