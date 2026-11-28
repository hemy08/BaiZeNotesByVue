/**
 * 覆盖率补测第五批：image-operations.ts 边界分支。
 *
 * 覆盖点（此前未覆盖的语句/分支）：
 * - 无活动文件 / 图片目录越界 / 创建 images 目录失败；
 * - 保存路径越界、不支持的图片格式、写盘失败；
 * - SaveImageDataToFile 目标已存在（FE-30 返回 false）、InsertImagesToFile 目标已存在或保存失败；
 * - ColorRelativePath / CopyFileLink / CopyImageLink 的无活动文件、跨目录 `../` 剥离与分隔符归一化。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const electronMocks = vi.hoisted(() => ({
    writeText: vi.fn()
}))

vi.mock('electron', () => ({
    clipboard: { writeText: electronMocks.writeText },
    BrowserWindow: class {},
    app: { getPath: () => '' }
}))

vi.mock('../../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const dialogMocks = vi.hoisted(() => ({ showErrorMessageBox: vi.fn() }))
vi.mock('../../../src/main/utils/file-utils/dialog-helpers', () => dialogMocks)

const sharedMocks = vi.hoisted(() => ({
    notifyInvalidFileName: vi.fn(),
    notifyPathAccessDenied: vi.fn(),
    // 1.5.7 LLM Wiki L1：图片写盘新增 raw/ 只读守卫提示（默认路径不触发）
    notifyWorkspaceRawReadOnly: vi.fn()
}))
vi.mock('../../../src/main/utils/file-utils/shared', () => sharedMocks)

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
// 1.5.7 LLM Wiki L1：图片写盘新增 assertWorkspaceWritable / PathAccessDeniedError 消费，
// mock 保留真实其余实现（traditional 模式下守卫零影响）
vi.mock('../../../src/main/utils/security', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../../src/main/utils/security')>()
    return { ...actual, ...securityMocks }
})

const randomMocks = vi.hoisted(() => ({ randomDigits: vi.fn(() => '0000000000000000') }))
vi.mock('../../../src/shared/utils/random', () => randomMocks)

import {
    CopyFileLink,
    CopyImageLink,
    CopyRelativePath,
    InsertImagesToFile,
    SaveImageDataToFile
} from '../../../src/main/utils/file-utils/image-operations'
import { appState } from '../../../src/main/utils/app-state'

const PNG_BASE64 = 'data:image/png;base64,iVBORw0KGgo='

let tmpDir = ''
let caseDir = ''

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-image5-'))
    caseDir = path.join(tmpDir, 'notes')
    fs.mkdirSync(caseDir, { recursive: true })
    vi.clearAllMocks()
    appState._resetForTesting()
    securityMocks.isPathAllowed.mockReturnValue(true)
    securityMocks.isSafeFileName.mockReturnValue(true)
})

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

function setActiveFile(fileName = 'note.md'): void {
    const filePath = path.join(caseDir, fileName)
    fs.writeFileSync(filePath, '# note')
    appState.currentActiveFile = {
        name: fileName,
        path: filePath,
        type: 'file',
        content: '',
        encoding: 'utf-8'
    }
}

describe('CreateImagesDir 分支', () => {
    it('无活动文件时提示并失败', async () => {
        expect(await SaveImageDataToFile('a.png', PNG_BASE64)).toBe(false)
        expect(await InsertImagesToFile(PNG_BASE64)).toBe('')
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledWith(
            expect.stringContaining('未打开')
        )
    })

    it('图片目录越界时提示并失败', async () => {
        setActiveFile()
        securityMocks.isPathAllowed.mockReturnValueOnce(false)
        expect(await SaveImageDataToFile('a.png', PNG_BASE64)).toBe(false)
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalled()
    })

    it('创建 images 目录失败时提示并失败', async () => {
        const blocker = path.join(tmpDir, 'blocker')
        fs.writeFileSync(blocker, 'file')
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(blocker, 'note.md'),
            type: 'file',
            content: '',
            encoding: 'utf-8'
        }
        expect(await InsertImagesToFile(PNG_BASE64)).toBe('')
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledWith(
            expect.stringContaining('创建目录失败')
        )
    })
})

describe('SaveImageDataToFile 分支', () => {
    it('非法文件名 / 文件名缺省时提示', async () => {
        setActiveFile()
        securityMocks.isSafeFileName.mockReturnValueOnce(false)
        expect(await SaveImageDataToFile('../escape.png', PNG_BASE64)).toBe(false)
        expect(sharedMocks.notifyInvalidFileName).toHaveBeenCalledWith('../escape.png')
    })

    it('不支持的图片格式提示失败', async () => {
        setActiveFile()
        expect(await SaveImageDataToFile('a.png', 'data:text/plain;base64,aGk=')).toBe(false)
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledWith(
            expect.stringContaining('解析文件格式失败')
        )
    })

    it('保存成功写入 images 目录并返回 true', async () => {
        setActiveFile()
        expect(await SaveImageDataToFile('a.png', PNG_BASE64)).toBe(true)
        const outFile = path.join(caseDir, 'images', 'a.png')
        expect(fs.existsSync(outFile)).toBe(true)
        expect(fs.statSync(outFile).size).toBeGreaterThan(0)
    })

    it('目标文件已存在时提示且返回 false（FE-30）', async () => {
        setActiveFile()
        fs.mkdirSync(path.join(caseDir, 'images'), { recursive: true })
        fs.writeFileSync(path.join(caseDir, 'images', 'a.png'), 'old')
        expect(await SaveImageDataToFile('a.png', PNG_BASE64)).toBe(false)
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledWith(
            expect.stringContaining('a.png')
        )
    })

    it('写盘目标越界时提示并返回 false', async () => {
        setActiveFile()
        securityMocks.isPathAllowed.mockImplementation(
            (target: unknown) => !String(target).endsWith('a.png')
        )
        expect(await SaveImageDataToFile('a.png', PNG_BASE64)).toBe(false)
        expect(sharedMocks.notifyPathAccessDenied).toHaveBeenCalled()
    })

    it('写盘失败时提示并返回 false', async () => {
        setActiveFile()
        // images 被同名普通文件占位：access 通过但写入失败（ENOTDIR）
        fs.writeFileSync(path.join(caseDir, 'images'), 'not-a-dir')
        expect(await SaveImageDataToFile('a.png', PNG_BASE64)).toBe(false)
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledWith(
            expect.stringContaining('保存图像时出错')
        )
    })
})

describe('InsertImagesToFile 分支', () => {
    it('随机文件名冲突时提示并返回空串', async () => {
        setActiveFile()
        fs.mkdirSync(path.join(caseDir, 'images'), { recursive: true })
        fs.writeFileSync(path.join(caseDir, 'images', '0000000000000000.png'), 'old')
        expect(await InsertImagesToFile(PNG_BASE64)).toBe('')
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledWith(
            expect.stringContaining('0000000000000000.png')
        )
    })

    it('保存失败（格式不支持）时返回空串', async () => {
        setActiveFile()
        expect(await InsertImagesToFile('data:image/tiff;base64,AAAA')).toBe('')
    })

    it('保存成功返回随机文件名', async () => {
        setActiveFile()
        expect(await InsertImagesToFile(PNG_BASE64)).toBe('0000000000000000.png')
        expect(fs.existsSync(path.join(caseDir, 'images', '0000000000000000.png'))).toBe(true)
    })
})

describe('复制链接类函数', () => {
    it('无活动文件时统一提示并返回', () => {
        CopyRelativePath('/w/a.md')
        CopyFileLink('/w/a.md')
        CopyImageLink('/w/a.png')
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledTimes(3)
        expect(electronMocks.writeText).not.toHaveBeenCalled()
    })

    it('复制相对路径：仅剥离一层 ../ 前缀（历史行为）+ 反斜杠归一化', () => {
        setActiveFile()
        const outside = path.join(tmpDir, 'other', 'sub', 'a.md')
        CopyRelativePath(outside)
        const written = String(electronMocks.writeText.mock.calls[0][0])
        // 活动文件按「目录」参与 path.relative：../../other/... 去掉一层 ../ 后仍保留 ../
        expect(written).toBe('../other/sub/a.md')
        expect(written).not.toContain('\\')

        // 同目录文件：直接相对路径
        CopyRelativePath(path.join(caseDir, 'sibling.md'))
        expect(electronMocks.writeText.mock.calls[1][0]).toBe('sibling.md')

        // 单层 ../：完整剥离
        CopyRelativePath(path.join(caseDir, 'sub', 'child.md'))
        expect(electronMocks.writeText.mock.calls[2][0]).toBe('sub/child.md')
    })

    it('复制文件链接：Markdown 链接前缀与相对路径', () => {
        setActiveFile()
        CopyFileLink(path.join(caseDir, 'sibling.md'))
        expect(electronMocks.writeText).toHaveBeenCalledWith('[sibling.md](sibling.md)')

        const outside = path.join(tmpDir, 'other', 'img.md')
        CopyFileLink(outside)
        expect(String(electronMocks.writeText.mock.calls[1][0])).toBe('[img.md](../other/img.md)')
    })

    it('复制图片链接：Markdown 图片语法', () => {
        setActiveFile()
        CopyImageLink(path.join(caseDir, 'images', 'a.png'))
        expect(electronMocks.writeText).toHaveBeenCalledWith('![a.png](images/a.png)')

        const outside = path.join(tmpDir, 'other', 'b.png')
        CopyImageLink(outside)
        expect(electronMocks.writeText.mock.calls[1][0]).toBe('![b.png](../other/b.png)')
    })
})
