import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'

// CMP-30：剪贴板操作提示经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

// ============ electron 与外围依赖 mock ============
// clipboard-operations 依赖 file-operations（ReloadDirFromDisk）→ logger、file-state
const electronMocks = vi.hoisted(() => ({
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
    showMessageBoxSync: vi.fn(),
    getAllWindows: vi.fn(),
    mainSend: vi.fn()
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
            showMessageBoxSync: electronMocks.showMessageBoxSync
        },
        shell: { showItemInFolder: vi.fn() },
        clipboard: { writeText: vi.fn() },
        app: { getPath: () => '', getVersion: () => '1.0.0-test' },
        ipcMain: { on: () => {} }
    }
})

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

// ARC-11：file-operations 直接依赖 file-state-store，桩替换其存储实现
vi.mock('../../src/main/utils/file-state-store', () => ({
    saveLastOpenedFile: vi.fn(),
    saveLastOpenedDirectory: vi.fn()
}))

import { appState } from '../../src/main/utils/app-state'
import {
    FileManagerContextMenuCopy,
    FileManagerContextMenuCut,
    FileManagerContextMenuPaste
} from '../../src/main/utils/file-utils/clipboard-operations'

const makeWindow = () => ({ webContents: { send: electronMocks.mainSend } })

let tmpDir = ''

beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-test-'))
})

afterAll(async () => {
    // 清理源码写入的全局标记
    delete (globalThis as unknown as { isCopyCutFile?: boolean }).isCopyCutFile
    await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
    vi.clearAllMocks()
    appState._resetForTesting()
    appState.mainWindow = makeWindow() as unknown as Electron.BrowserWindow
    electronMocks.getAllWindows.mockReturnValue([])
})

describe('FileManagerContextMenuCopy / Cut', () => {
    it('should record source path and copy mode', () => {
        // P1-AS-1：源路径必须在受信范围内（临时目录即合法根）
        const fromPath = path.join(tmpDir, 'src', 'a.md')
        FileManagerContextMenuCopy(fromPath, true)
        expect(appState.srcDirCopyCut).toBe(fromPath)
        expect(appState.isCopyOrCut).toBe('copy')
        expect((globalThis as { isCopyCutFile?: boolean }).isCopyCutFile).toBe(true)
    })

    it('should record source path and cut mode', () => {
        const fromPath = path.join(tmpDir, 'src', 'b.md')
        FileManagerContextMenuCut(fromPath, true)
        expect(appState.srcDirCopyCut).toBe(fromPath)
        expect(appState.isCopyOrCut).toBe('cut')
        expect((globalThis as { isCopyCutFile?: boolean }).isCopyCutFile).toBe(true)
    })

    it('should reject out-of-scope source path and keep clipboard state empty (P1-AS-1)', () => {
        const outsidePath = process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd'
        FileManagerContextMenuCopy(outsidePath, true)
        FileManagerContextMenuCut(outsidePath, true)
        expect(appState.srcDirCopyCut).toBe('')
        expect(appState.isCopyOrCut).toBe('')
        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })
})

describe('FileManagerContextMenuPaste guard branches', () => {
    it('should show error when the target is not a directory', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        await FileManagerContextMenuPaste(path.join(caseDir, 'file.md'), true)
        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: '目标不是一个目录！' })
        )
    })

    it('should show error when no source has been copied or cut', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        await FileManagerContextMenuPaste(caseDir, false)
        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: '未拷贝/剪切源文件！' })
        )
    })

    it('should show error when source equals target', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        appState.srcDirCopyCut = caseDir
        await FileManagerContextMenuPaste(caseDir, false)
        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: '源路径和目标路径相同！' })
        )
    })

    it('should reject an out-of-scope copy/cut source before touching the filesystem (P1-AS-1)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        appState.srcDirCopyCut =
            process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd'
        appState.isCopyOrCut = 'cut'

        await FileManagerContextMenuPaste(caseDir, false)

        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
        // 目标目录中不会出现任何拷贝产物
        expect(await fs.readdir(caseDir)).toEqual([])
    })

    it('should reject an out-of-scope paste target (P1-AS-1)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const srcFile = path.join(caseDir, 'src.md')
        await fs.writeFile(srcFile, 'SRC', 'utf8')
        appState.srcDirCopyCut = srcFile
        appState.isCopyOrCut = 'copy'
        const outsideTarget = process.platform === 'win32' ? 'C:\\Windows' : '/etc'

        await FileManagerContextMenuPaste(outsideTarget, false)

        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
        expect(await fs.readFile(srcFile, 'utf8')).toBe('SRC')
    })

    it('should show error and keep source when destination already exists', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const srcFile = path.join(caseDir, 'src.md')
        const dstDir = path.join(caseDir, 'dst')
        await fs.writeFile(srcFile, 'SRC', 'utf8')
        await fs.mkdir(dstDir)
        await fs.writeFile(path.join(dstDir, 'src.md'), 'OTHER', 'utf8')
        appState.srcDirCopyCut = srcFile
        appState.isCopyOrCut = 'copy'

        await FileManagerContextMenuPaste(dstDir, false)

        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('已经存在') })
        )
        expect(await fs.readFile(srcFile, 'utf8')).toBe('SRC')
        expect(await fs.readFile(path.join(dstDir, 'src.md'), 'utf8')).toBe('OTHER')
    })
})

describe('FileManagerContextMenuPaste copy / cut', () => {
    it('should copy a file into the target directory', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const srcFile = path.join(caseDir, 'src.md')
        const dstDir = path.join(caseDir, 'dst')
        await fs.writeFile(srcFile, 'hello', 'utf8')
        await fs.mkdir(dstDir)
        appState.srcDirCopyCut = srcFile
        appState.isCopyOrCut = 'copy'

        await FileManagerContextMenuPaste(dstDir, false)

        expect(await fs.readFile(path.join(dstDir, 'src.md'), 'utf8')).toBe('hello')
        // 复制保留源文件
        expect(await fs.readFile(srcFile, 'utf8')).toBe('hello')
    })

    it('should copy a folder recursively into the target directory', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const srcDir = path.join(caseDir, 'srcdir')
        const dstDir = path.join(caseDir, 'dst')
        await fs.mkdir(srcDir)
        await fs.writeFile(path.join(srcDir, 'nested.md'), 'nested', 'utf8')
        await fs.mkdir(dstDir)
        appState.srcDirCopyCut = srcDir
        appState.isCopyOrCut = 'copy'

        await FileManagerContextMenuPaste(dstDir, false)

        expect(await fs.readFile(path.join(dstDir, 'srcdir', 'nested.md'), 'utf8')).toBe('nested')
        expect(await fs.readFile(path.join(srcDir, 'nested.md'), 'utf8')).toBe('nested')
    })

    it('should move a file when cut mode is active', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const srcFile = path.join(caseDir, 'src.md')
        const dstDir = path.join(caseDir, 'dst')
        await fs.writeFile(srcFile, 'move me', 'utf8')
        await fs.mkdir(dstDir)
        appState.srcDirCopyCut = srcFile
        appState.isCopyOrCut = 'cut'

        await FileManagerContextMenuPaste(dstDir, false)

        expect(await fs.readFile(path.join(dstDir, 'src.md'), 'utf8')).toBe('move me')
        // 剪切后源文件被删除
        await expect(fs.access(srcFile)).rejects.toThrow()
    })
})

// FE-32：复制/剪切失败不再直出 Electron/Node 英文原始错误，而是「操作名 + 中文原因（原始 message）」。
describe('FE-32 剪贴板失败错误码中文化', () => {
    it('should map a copy ENOENT failure to a readable Chinese message', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const srcFile = path.join(caseDir, 'gone.md')
        const dstDir = path.join(caseDir, 'dst')
        await fs.writeFile(srcFile, 'SRC', 'utf8')
        await fs.mkdir(dstDir)
        // 复制前源被删除（TOCTOU 场景）→ fsExtra.copy 抛 ENOENT
        await fs.rm(srcFile)
        // 隔离说明：粘贴成功会调度 100ms 后清空 appState.srcDirCopyCut 的定时器，
        // 上一条用例的定时器可能在本用例运行中触发；因此把「记录剪贴板源」放到
        // 紧邻粘贴调用之前（中间不再 await），避免状态被上一条用例的遗留定时器清空。
        appState.srcDirCopyCut = srcFile
        appState.isCopyOrCut = 'copy'

        await FileManagerContextMenuPaste(dstDir, false)

        const dialogCall = electronMocks.mainSend.mock.calls.find(
            (call) => call[0] === 'baize:dialog:open-vue'
        )
        expect(dialogCall).toBeDefined()
        const message = String((dialogCall![2] as { message: string }).message)
        // 中文操作名 + 常见错误码的中文原因（原始 message 保留在详情里便于排查）
        expect(message).toContain('复制失败：')
        expect(message).toContain('文件不存在或已被移动')
        expect(message).toContain('ENOENT')
        // 目标目录不会出现任何残缺拷贝产物
        expect(await fs.readdir(dstDir)).toEqual([])
    })
})
