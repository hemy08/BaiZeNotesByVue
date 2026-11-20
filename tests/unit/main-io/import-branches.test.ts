/**
 * 覆盖率补测第五批：import.ts（导入/插入文件、新建导入文件）边界分支。
 *
 * 覆盖点（此前未覆盖的语句/分支）：
 * - InsertImportFormFile：未知格式、取消、路径越界、导入/插入两条下发分支、reader 抛错；
 * - 各格式 reader：文本（编码探测）、JSON 美化（数组/对象/空数组/非法 JSON 原样）、
 *   Excel 明确拒绝、HTML（turndown）、CSV（真实 csv-parser：BOM/表头/空行/换行与竖线转义/
 *   空文件）、Word（worker 成功 / 基础设施不可用降级进程内 / 转换错误上抛）；
 * - ImportCreateNewFile：取消、路径越界、补 .md 后缀、写盘并打开、100ms 后目录刷新（含失败降级）。
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const electronMocks = vi.hoisted(() => ({
    showOpenDialog: vi.fn(),
    showSaveDialog: vi.fn(),
    webContentsSend: vi.fn()
}))

vi.mock('electron', () => ({
    dialog: {
        showOpenDialog: electronMocks.showOpenDialog,
        showSaveDialog: electronMocks.showSaveDialog
    },
    BrowserWindow: class {},
    app: { getPath: () => '', getVersion: () => '1.4.0-test' }
}))

vi.mock('../../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const dialogMocks = vi.hoisted(() => ({ showErrorMessageBox: vi.fn() }))
vi.mock('../../../src/main/utils/file-utils/dialog-helpers', () => dialogMocks)

const fileOpsMocks = vi.hoisted(() => ({
    decodeFileContent: vi.fn((buffer: Buffer) => ({
        content: buffer.toString('utf8'),
        encoding: 'utf-8'
    })),
    notifyPathAccessDenied: vi.fn(),
    OpenSelectFile: vi.fn(async () => undefined),
    ReloadDirFromDisk: vi.fn(async () => undefined)
}))
vi.mock('../../../src/main/utils/file-utils/file-operations', () => fileOpsMocks)

const securityMocks = vi.hoisted(() => ({
    isPathAllowed: vi.fn((target: unknown) => {
        void target
        return true
    }),
    registerTrustedPath: vi.fn()
}))
vi.mock('../../../src/main/utils/security', () => securityMocks)

const workerMocks = vi.hoisted(() => ({
    convertDocxToMarkdownWithWorker: vi.fn(async () => '# from worker'),
    isWordWorkerInfrastructureError: vi.fn((error: unknown) => {
        void error
        return false
    }),
    convertDocxToMarkdownInProcess: vi.fn(async () => '# from process')
}))
vi.mock('../../../src/main/utils/file-utils/word-worker-client', () => ({
    convertDocxToMarkdownWithWorker: workerMocks.convertDocxToMarkdownWithWorker,
    isWordWorkerInfrastructureError: workerMocks.isWordWorkerInfrastructureError
}))
vi.mock('../../../src/main/utils/file-utils/word-worker-tasks', () => ({
    convertDocxToMarkdownInProcess: workerMocks.convertDocxToMarkdownInProcess
}))

import {
    ImportCreateNewFile,
    InsertImportFormFile,
    InsertImportFrom
} from '../../../src/main/utils/file-utils/import'
import { appState } from '../../../src/main/utils/app-state'
import { IPC } from '../../../src/shared/ipc-channels'
import { logger } from '../../../src/main/utils/logger'

let tmpDir = ''
const mainWindow = { webContents: { send: electronMocks.webContentsSend } }

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-import5-'))
    vi.clearAllMocks()
    appState._resetForTesting()
    securityMocks.isPathAllowed.mockReturnValue(true)
    fileOpsMocks.OpenSelectFile.mockResolvedValue(undefined)
    fileOpsMocks.ReloadDirFromDisk.mockResolvedValue(undefined)
    workerMocks.convertDocxToMarkdownWithWorker.mockResolvedValue('# from worker')
    workerMocks.isWordWorkerInfrastructureError.mockReturnValue(false)
    workerMocks.convertDocxToMarkdownInProcess.mockResolvedValue('# from process')
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
})

afterEach(() => {
    vi.useRealTimers()
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('InsertImportFormFile 分支', () => {
    it('未知导入格式直接提示，不打开文件对话框', async () => {
        await InsertImportFormFile(mainWindow as never, 'unknown', true)
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledTimes(1)
        expect(electronMocks.showOpenDialog).not.toHaveBeenCalled()
    })

    it('用户取消选择时静默返回', async () => {
        await InsertImportFormFile(mainWindow as never, 'text', true)
        expect(electronMocks.showOpenDialog).toHaveBeenCalled()
        expect(electronMocks.webContentsSend).not.toHaveBeenCalled()
        expect(dialogMocks.showErrorMessageBox).not.toHaveBeenCalled()
    })

    it('选中路径越界时提示并中止', async () => {
        const outside = path.join(tmpDir, 'blocked.txt')
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [outside]
        })
        securityMocks.isPathAllowed.mockReturnValue(false)
        await InsertImportFormFile(mainWindow as never, 'text', true)
        expect(fileOpsMocks.notifyPathAccessDenied).toHaveBeenCalledWith(
            outside,
            'mainMsg.status.operationFailed'
        )
        expect(electronMocks.webContentsSend).not.toHaveBeenCalled()
    })

    it('导入模式：读取内容后经 open-vue 对话框下发（含格式前后缀）', async () => {
        const filePath = path.join(tmpDir, 'note.txt')
        fs.writeFileSync(filePath, 'hello', 'utf-8')
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [filePath]
        })
        await InsertImportFormFile(mainWindow as never, 'text', true)
        expect(securityMocks.registerTrustedPath).toHaveBeenCalledWith(filePath)
        expect(fileOpsMocks.decodeFileContent).toHaveBeenCalled()
        expect(electronMocks.webContentsSend).toHaveBeenCalledWith(
            IPC.DIALOG.OPEN_VUE_DIALOG,
            'importOption',
            { content: '```text\r\nhello\r\n```\r\n' }
        )
    })

    it('插入模式：内容下发到光标位置（AFTER_CURSOR）', async () => {
        const filePath = path.join(tmpDir, 'note.yaml')
        fs.writeFileSync(filePath, 'a: 1', 'utf-8')
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [filePath]
        })
        await InsertImportFormFile(mainWindow as never, 'yaml', false)
        expect(electronMocks.webContentsSend).toHaveBeenCalledWith(
            IPC.MONACO.AFTER_CURSOR,
            '```yaml\r\na: 1\r\n```\r\n'
        )
    })

    it('reader 抛错时统一提示导入失败', async () => {
        const filePath = path.join(tmpDir, 'note.txt')
        fs.writeFileSync(filePath, 'hello', 'utf-8')
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [filePath]
        })
        fileOpsMocks.decodeFileContent.mockImplementationOnce(() => {
            throw new Error('decode failed')
        })
        await InsertImportFormFile(mainWindow as never, 'text', true)
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledTimes(1)
    })
})

describe('格式 reader 分支', () => {
    it('JSON：数组 / 对象 / 空数组重新格式化，非法 JSON 原样返回', async () => {
        const arrayFile = path.join(tmpDir, 'array.json')
        fs.writeFileSync(arrayFile, '[1,{"a":2},[]]', 'utf-8')
        const arrayMarkdown = await InsertImportFrom.json.importReader(arrayFile)
        expect(arrayMarkdown).toContain('[\n  1,\n  {\n    "a": 2\n  },\n  []\n]')

        const emptyArrayFile = path.join(tmpDir, 'empty.json')
        fs.writeFileSync(emptyArrayFile, '[]', 'utf-8')
        expect(await InsertImportFrom.json.importReader(emptyArrayFile)).toBe('[]')

        const objectFile = path.join(tmpDir, 'object.json')
        fs.writeFileSync(objectFile, '{"a":1,"b":{"c":2}}', 'utf-8')
        const objectMarkdown = await InsertImportFrom.json.importReader(objectFile)
        expect(objectMarkdown).toContain('"a": 1')
        expect(objectMarkdown).toContain('"b": {')
        expect(objectMarkdown).toContain('"c": 2')

        const brokenFile = path.join(tmpDir, 'broken.json')
        fs.writeFileSync(brokenFile, '{broken', 'utf-8')
        expect(await InsertImportFrom.json.importReader(brokenFile)).toBe('{broken')
    })

    it('Excel 导入明确拒绝并给出引导', async () => {
        await expect(InsertImportFrom.excel.importReader('x.xlsx')).rejects.toThrow()
    })

    it('HTML：经 turndown 转 Markdown', async () => {
        const htmlFile = path.join(tmpDir, 'page.html')
        fs.writeFileSync(htmlFile, '<h1>Title</h1><p>Hello <strong>world</strong></p>', 'utf-8')
        const markdown = await InsertImportFrom.html.importReader(htmlFile)
        // turndown 对 h1 使用 setext 风格标题
        expect(markdown).toContain('Title')
        expect(markdown).toContain('=====')
        expect(markdown).toContain('**world**')
    })

    it('CSV：BOM 剥离、表头保序、空行忽略、换行/竖线转义、空文件无表格', async () => {
        const csvFile = path.join(tmpDir, 'table.csv')
        fs.writeFileSync(csvFile, '\uFEFFa,b\n1,2\n3,4\n', 'utf-8')
        const markdown = await InsertImportFrom.csv.importReader(csvFile)
        expect(markdown).toContain('| a | b |')
        expect(markdown).toContain('| --- | --- |')
        expect(markdown).toContain('| 1 | 2 |')

        const trickyFile = path.join(tmpDir, 'tricky.csv')
        fs.writeFileSync(trickyFile, 'a,b\n"line1\nline2",x|y\n', 'utf-8')
        const tricky = await InsertImportFrom.csv.importReader(trickyFile)
        expect(tricky).toContain('line1<br>line2')
        expect(tricky).toContain('x\\|y')

        const emptyFile = path.join(tmpDir, 'empty.csv')
        fs.writeFileSync(emptyFile, '', 'utf-8')
        expect(await InsertImportFrom.csv.importReader(emptyFile)).toBe('')
    })

    it('Word：worker 成功路径 / 基础设施不可用降级进程内 / 转换错误上抛', async () => {
        const docxFile = path.join(tmpDir, 'doc.docx')
        fs.writeFileSync(docxFile, 'fake', 'utf-8')
        expect(await InsertImportFrom.word.importReader(docxFile)).toBe('# from worker')

        const infraError = new Error('worker crashed')
        workerMocks.convertDocxToMarkdownWithWorker.mockRejectedValueOnce(infraError)
        workerMocks.isWordWorkerInfrastructureError.mockReturnValueOnce(true)
        expect(await InsertImportFrom.word.importReader(docxFile)).toBe('# from process')
        expect(logger.warn).toHaveBeenCalled()

        const convertError = new Error('bad docx')
        workerMocks.convertDocxToMarkdownWithWorker.mockRejectedValueOnce(convertError)
        workerMocks.isWordWorkerInfrastructureError.mockReturnValueOnce(false)
        await expect(InsertImportFrom.word.importReader(docxFile)).rejects.toBe(convertError)
    })
})

describe('ImportCreateNewFile 分支', () => {
    it('用户取消保存对话框时返回 success=false', async () => {
        await expect(ImportCreateNewFile(mainWindow as never, 'content')).resolves.toEqual({
            success: false
        })
    })

    it('保存路径越界时提示并返回 success=false', async () => {
        electronMocks.showSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: path.join(tmpDir, 'out.md')
        })
        securityMocks.isPathAllowed.mockReturnValue(false)
        await expect(ImportCreateNewFile(mainWindow as never, 'content')).resolves.toEqual({
            success: false
        })
        expect(fileOpsMocks.notifyPathAccessDenied).toHaveBeenCalled()
    })

    it('补 .md 后缀、写盘、打开文件，并在 100ms 后从磁盘刷新（失败只记日志）', async () => {
        vi.useFakeTimers()
        fs.mkdirSync(path.join(tmpDir, 'docs'), { recursive: true })
        appState.currentActiveFile = {
            name: 'note.md',
            path: path.join(tmpDir, 'docs', 'note.md'),
            type: 'file',
            content: '',
            encoding: 'utf-8'
        }
        electronMocks.showSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: path.join(tmpDir, 'docs', 'imported')
        })
        fileOpsMocks.ReloadDirFromDisk.mockRejectedValueOnce(new Error('reload failed'))

        const result = await ImportCreateNewFile(mainWindow as never, '# imported')
        expect(result.success).toBe(true)
        const expectedPath = path.join(tmpDir, 'docs', 'imported.md')
        expect(result.filePath).toBe(expectedPath)
        expect(fs.readFileSync(expectedPath, 'utf-8')).toBe('# imported')
        expect(fileOpsMocks.OpenSelectFile).toHaveBeenCalledWith({
            name: 'imported.md',
            path: expectedPath,
            type: 'file',
            content: '# imported'
        })
        // 保存默认目录取当前活动文件所在目录 + 默认导入文件名
        const saveOptions = electronMocks.showSaveDialog.mock.calls[0][1] as {
            defaultPath: string
        }
        expect(saveOptions.defaultPath).toContain(path.join(tmpDir, 'docs'))
        expect(saveOptions.defaultPath.length).toBeGreaterThan(path.join(tmpDir, 'docs').length)

        await vi.advanceTimersByTimeAsync(100)
        expect(fileOpsMocks.ReloadDirFromDisk).toHaveBeenCalled()
        expect(logger.error).toHaveBeenCalledWith('Failed to reload from disk:', expect.any(Error))
    })

    it('已有 .md 后缀不再重复追加', async () => {
        vi.useFakeTimers()
        const target = path.join(tmpDir, 'imported.md')
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: target })
        const result = await ImportCreateNewFile(mainWindow as never, 'body')
        expect(result.filePath).toBe(target)
        await vi.advanceTimersByTimeAsync(100)
        expect(fileOpsMocks.ReloadDirFromDisk).toHaveBeenCalled()
    })
})
