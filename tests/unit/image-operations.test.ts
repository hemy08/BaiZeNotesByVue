import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'

// CMP-30：图片操作提示经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

// ============ electron mock ============
// image-operations 使用 clipboard.writeText；path-utils 使用 dialog（仅类型级导入链路）
const clipboardMocks = vi.hoisted(() => ({
    writeText: vi.fn(),
    showOpenDialog: vi.fn()
}))

vi.mock('electron', () => ({
    BrowserWindow: class {},
    dialog: {
        showOpenDialog: clipboardMocks.showOpenDialog,
        showSaveDialog: vi.fn(),
        showMessageBoxSync: vi.fn()
    },
    clipboard: { writeText: clipboardMocks.writeText }
}))

import { appState } from '../../src/main/utils/app-state'
import {
    SaveImageDataToFile,
    InsertImagesToFile,
    CopyRelativePath,
    CopyFileLink,
    CopyImageLink
} from '../../src/main/utils/file-utils/image-operations'

const mainSend = vi.fn()
const makeWindow = () => ({ webContents: { send: mainSend } })

// 1x1 透明 PNG
const PNG_BASE64 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
const PNG_BYTES = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64'
)

let tmpDir = ''

beforeAll(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-test-'))
})

afterAll(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
})

beforeEach(() => {
    vi.clearAllMocks()
    appState._resetForTesting()
    appState.mainWindow = makeWindow() as unknown as Electron.BrowserWindow
})

describe('SaveImageDataToFile', () => {
    it('should save a PNG data URL next to the active file in images dir', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(caseDir, 'note.md'),
            type: 'file',
            content: '# x'
        }

        const ok = await SaveImageDataToFile('img.png', PNG_BASE64)

        expect(ok).toBe(true)
        const outPath = path.join(caseDir, 'images', 'img.png')
        expect((await fs.readFile(outPath)).equals(PNG_BYTES)).toBe(true)
    })

    it('should reject unsupported image data URLs', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(caseDir, 'note.md'),
            type: 'file',
            content: '# x'
        }

        const ok = await SaveImageDataToFile('img.webp', 'data:image/webp;base64,UklGRg==')

        expect(ok).toBe(false)
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('解析文件格式失败') })
        )
    })

    it('should fail when no file is open', async () => {
        const ok = await SaveImageDataToFile('img.png', PNG_BASE64)
        expect(ok).toBe(false)
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('未打开任何文件') })
        )
    })

    it('should report existence and keep the original file when duplicated', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(caseDir, 'note.md'),
            type: 'file',
            content: '# x'
        }
        await SaveImageDataToFile('img.png', PNG_BASE64)
        vi.clearAllMocks()

        // FE-30：文件已存在时提示错误且返回 false（原实现误返回 true，调用方会误判保存成功），
        // 同时不覆盖原文件。
        const ok = await SaveImageDataToFile('img.png', PNG_BASE64)

        expect(ok).toBe(false)
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('文件已经存在') })
        )
        const outPath = path.join(caseDir, 'images', 'img.png')
        expect((await fs.readFile(outPath)).equals(PNG_BYTES)).toBe(true)
    })
    it('should reject traversal image file names (P1-AS-1)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(caseDir, 'note.md'),
            type: 'file',
            content: '# x'
        }

        const ok = await SaveImageDataToFile('..\\evil.png', PNG_BASE64)

        expect(ok).toBe(false)
        await expect(fs.access(path.join(caseDir, 'evil.png'))).rejects.toThrow()
        expect(mainSend).toHaveBeenCalledWith(
            'baize:status-bar:update',
            expect.objectContaining({ type: 'error' })
        )
    })
})

describe('InsertImagesToFile', () => {
    it('should save the image under a random 16-digit name and return it', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(caseDir, 'note.md'),
            type: 'file',
            content: '# x'
        }

        const fileName = await InsertImagesToFile(PNG_BASE64)

        expect(fileName).toMatch(/^\d{16}\.png$/)
        const outPath = path.join(caseDir, 'images', fileName)
        expect((await fs.readFile(outPath)).equals(PNG_BYTES)).toBe(true)
    })

    it('should return empty string when no file is open', async () => {
        const result = await InsertImagesToFile(PNG_BASE64)
        expect(result).toBe('')
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('未打开任何文件') })
        )
    })
})

describe('CopyRelativePath / CopyFileLink / CopyImageLink', () => {
    it('should copy the relative path of an image to clipboard', () => {
        const caseDir = path.join(tmpDir, 'link-case')
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(caseDir, 'note.md'),
            type: 'file',
            content: '# x'
        }

        CopyRelativePath(path.join(caseDir, 'images', 'a.png'))

        expect(clipboardMocks.writeText).toHaveBeenCalledWith('images/a.png')
    })

    it('should copy a markdown file link to clipboard', () => {
        const caseDir = path.join(tmpDir, 'link-case')
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(caseDir, 'note.md'),
            type: 'file',
            content: '# x'
        }

        CopyFileLink(path.join(caseDir, 'images', 'a.png'))

        expect(clipboardMocks.writeText).toHaveBeenCalledWith('[a.png](images/a.png)')
    })

    it('should copy a markdown image link to clipboard', () => {
        const caseDir = path.join(tmpDir, 'link-case')
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(caseDir, 'note.md'),
            type: 'file',
            content: '# x'
        }

        CopyImageLink(path.join(caseDir, 'images', 'a.png'))

        expect(clipboardMocks.writeText).toHaveBeenCalledWith('![a.png](images/a.png)')
    })

    it('should show error dialog and skip clipboard when no file is open', () => {
        CopyRelativePath('C:\\any\\a.png')
        expect(clipboardMocks.writeText).not.toHaveBeenCalled()
        expect(mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('请先打开一个文件') })
        )
    })

    // FE-14：原始实现 `replace('\\', '/')` 只替换第一个反斜杠，
    // 嵌套目录会生成 images\\sub\\a.png 这类反斜杠链接。现改为全局替换。
    it('should convert every path separator to forward slashes for nested directories (FE-14)', () => {
        const caseDir = path.join(tmpDir, 'nested-link-case')
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(caseDir, 'note.md'),
            type: 'file',
            content: '# x'
        }
        const target = path.join(caseDir, 'images', 'sub', 'deep', 'a.png')

        CopyImageLink(target)
        expect(clipboardMocks.writeText).toHaveBeenLastCalledWith('![a.png](images/sub/deep/a.png)')

        CopyFileLink(target)
        expect(clipboardMocks.writeText).toHaveBeenLastCalledWith('[a.png](images/sub/deep/a.png)')

        CopyRelativePath(target)
        expect(clipboardMocks.writeText).toHaveBeenLastCalledWith('images/sub/deep/a.png')
        // 结果中不允许残留反斜杠（Markdown 链接约定）
        expect(
            clipboardMocks.writeText.mock.calls.some((call) => String(call[0]).includes('\\'))
        ).toBe(false)
    })

    it('should keep relative paths outside the active file directory in markdown form (FE-14)', () => {
        const caseDir = path.join(tmpDir, 'sibling-case')
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(caseDir, 'docs', 'note.md'),
            type: 'file',
            content: '# x'
        }
        const target = path.join(caseDir, 'images', 'sub', 'b.png')

        CopyImageLink(target)
        expect(clipboardMocks.writeText).toHaveBeenLastCalledWith('![b.png](../images/sub/b.png)')
    })
})
