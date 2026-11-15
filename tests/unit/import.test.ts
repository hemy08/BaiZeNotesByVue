import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import path from 'path'
import os from 'os'
import { promises as fs, createWriteStream } from 'fs'
import officeGen from 'officegen'

// CMP-30：导入提示经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

// ============ electron 与外围依赖 mock ============
// import.ts 依赖 dialog.showOpenDialog/showSaveDialog；
// 经 file-operations → logger、file-state
const electronMocks = vi.hoisted(() => ({
    showSaveDialog: vi.fn(),
    showOpenDialog: vi.fn(),
    showMessageBoxSync: vi.fn(),
    getAllWindows: vi.fn()
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
import { saveLastOpenedFile } from '../../src/main/utils/file-state-store'
import {
    InsertImportFrom,
    InsertImportFormFile,
    ImportCreateNewFile
} from '../../src/main/utils/file-utils/import'

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
    appState.mainWindow = { webContents: { send: vi.fn() } } as unknown as Electron.BrowserWindow
    electronMocks.getAllWindows.mockReturnValue([])
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
})

describe('InsertImportFrom registry', () => {
    it('should register all supported import formats with extensions and readers', () => {
        // FUN-14：新增 ini 键（菜单"插入 → 来自文件 → *.ini"入口）
        expect(Object.keys(InsertImportFrom).sort()).toEqual([
            'csv',
            'excel',
            'html',
            'ini',
            'json',
            'text',
            'word',
            'xml',
            'yaml'
        ])
        expect(InsertImportFrom.word.extensions).toEqual(['doc', 'docx'])
        expect(InsertImportFrom.html.extensions).toEqual(['html', 'htm', 'mhtml'])
        expect(InsertImportFrom.csv.extensions).toEqual(['csv'])
        expect(InsertImportFrom.json.extensions).toEqual(['json'])
        expect(InsertImportFrom.yaml.extensions).toEqual(['yaml', 'yml'])
        expect(InsertImportFrom.xml.extensions).toEqual(['xml'])
        expect(InsertImportFrom.ini.extensions).toEqual(['ini'])
        expect(InsertImportFrom.text.extensions).toEqual(['txt', 'log', 'ini'])
        for (const model of Object.values(InsertImportFrom)) {
            expect(typeof model.importReader).toBe('function')
            expect(typeof model.insertReader).toBe('function')
        }
    })

    it('should reject xls/xlsx import with a clear guidance message (FUN-14)', async () => {
        // 不再按 UTF-8 读二进制出乱码，而是抛出清晰提示引导导出为 CSV
        await expect(InsertImportFrom.excel.importReader('a.xlsx')).rejects.toThrow('暂不支持')
        await expect(InsertImportFrom.excel.importReader('a.xls')).rejects.toThrow('CSV')
    })

    it('should decode GBK text files via the shared encoding detection (FUN-14)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const txtPath = path.join(caseDir, 'gbk.txt')
        const iconv = await import('iconv-lite')
        const text =
            '这是一个足够长的中文文本，用于让 jschardet 可靠地识别出 GBK 编码。' +
            '包含标点符号，以及更多的汉字字符来增加样本长度，确保编码检测结果稳定。'
        await fs.writeFile(txtPath, iconv.default.encode(text, 'gbk'))

        expect(await InsertImportFrom.text.importReader(txtPath)).toBe(text)
    })
})

/** 写一份临时 CSV 并返回路径（task-47：CSV 边界用例复用，隔离各用例目录） */
async function writeTempCsv(content: string, fileName = 'data.csv'): Promise<string> {
    const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
    const csvPath = path.join(caseDir, fileName)
    await fs.writeFile(csvPath, content, 'utf8')
    return csvPath
}

describe('InsertImportFrom readers', () => {
    // task-47：CSV 导入表头/数据行缺陷修复后的行为契约。
    // 修复前测试固化的错误输出（真实表头被 Object.keys(数组) 变成列索引，
    // 数据行因模板双重前导竖线多出空单元格）：
    // '| 0| 1| 2 |\n| ---| ---| --- |\n| | 1 | 2 | 3  |\n'
    describe('CSV import to markdown table (task-47)', () => {
        it('should use the real headers, keep order and align every data row', async () => {
            const csvPath = await writeTempCsv('a,b,c\n1,2,3\n4,5,6\n')

            const result = await InsertImportFrom.csv.importReader(csvPath)

            expect(result).toBe(
                '| a | b | c |\n| --- | --- | --- |\n| 1 | 2 | 3 |\n| 4 | 5 | 6 |\n'
            )
            // 表头必须是真实列名而非列索引 "0|1|2"
            expect(result.startsWith('| a | b | c |\n')).toBe(true)
            expect(result).not.toContain('| 0| 1| 2 |')
            // 每行竖线数 == 列数 + 1（3 列 → 4 条），无前导/尾部多余空列
            for (const line of result.trimEnd().split('\n')) {
                expect(line.match(/\|/g)).toHaveLength(4)
            }
        })

        it('should keep Chinese headers, empty cells and pad short rows', async () => {
            const csvPath = await writeTempCsv('姓名,性别,年龄\n张三,,18\n李四,女\n')

            expect(await InsertImportFrom.csv.importReader(csvPath)).toBe(
                '| 姓名 | 性别 | 年龄 |\n' +
                    '| --- | --- | --- |\n' +
                    '| 张三 |  | 18 |\n' +
                    '| 李四 | 女 |  |\n'
            )
        })

        it('should handle quoted commas and in-cell newlines without breaking the table', async () => {
            const csvPath = await writeTempCsv('name,note\n"张三, 别名阿三","第一行\n第二行"\n')

            expect(await InsertImportFrom.csv.importReader(csvPath)).toBe(
                '| name | note |\n' + '| --- | --- |\n' + '| 张三, 别名阿三 | 第一行<br>第二行 |\n'
            )
        })

        it('should strip the UTF-8 BOM from the first header cell', async () => {
            const csvPath = await writeTempCsv('\uFEFF姓名,城市\n王五,北京\n')

            expect(await InsertImportFrom.csv.importReader(csvPath)).toBe(
                '| 姓名 | 城市 |\n| --- | --- |\n| 王五 | 北京 |\n'
            )
        })

        it('should escape pipes so a cell cannot break the markdown table', async () => {
            const csvPath = await writeTempCsv('公式,说明\nA|B,竖线\n')

            expect(await InsertImportFrom.csv.importReader(csvPath)).toBe(
                '| 公式 | 说明 |\n| --- | --- |\n| A\\|B | 竖线 |\n'
            )
        })

        it('should skip blank lines between data rows', async () => {
            const csvPath = await writeTempCsv('name,age\n张三,18\n\n李四,20\n')

            expect(await InsertImportFrom.csv.importReader(csvPath)).toBe(
                '| name | age |\n| --- | --- |\n| 张三 | 18 |\n| 李四 | 20 |\n'
            )
        })

        it('should return an empty string for an empty CSV file', async () => {
            const csvPath = await writeTempCsv('')

            expect(await InsertImportFrom.csv.importReader(csvPath)).toBe('')
        })

        it('should output only header and separator for a header-only CSV', async () => {
            const csvPath = await writeTempCsv('a,b\n')

            expect(await InsertImportFrom.csv.importReader(csvPath)).toBe(
                '| a | b |\n| --- | --- |\n'
            )
        })

        it('should handle CRLF line endings', async () => {
            const csvPath = await writeTempCsv('a,b\r\n1,2\r\n')

            expect(await InsertImportFrom.csv.importReader(csvPath)).toBe(
                '| a | b |\n| --- | --- |\n| 1 | 2 |\n'
            )
        })
    })

    it('should read a text file as-is', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const txtPath = path.join(caseDir, 'data.txt')
        await fs.writeFile(txtPath, 'hello world', 'utf8')

        expect(await InsertImportFrom.text.importReader(txtPath)).toBe('hello world')
    })

    it('should format a valid JSON file with indentation', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const jsonPath = path.join(caseDir, 'data.json')
        await fs.writeFile(jsonPath, '{"a":1}', 'utf8')

        expect(await InsertImportFrom.json.importReader(jsonPath)).toBe('{\n"a": 1\n}')
    })

    it('should return the original text for invalid JSON', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const jsonPath = path.join(caseDir, 'data.json')
        await fs.writeFile(jsonPath, 'not-json{', 'utf8')

        expect(await InsertImportFrom.json.importReader(jsonPath)).toBe('not-json{')
    })

    it('should convert HTML to markdown via turndown', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const htmlPath = path.join(caseDir, 'data.html')
        await fs.writeFile(htmlPath, '<h1>Title</h1>\n<p>Hello</p>', 'utf8')

        const result = await InsertImportFrom.html.importReader(htmlPath)

        expect(result).toContain('Title')
        expect(result).toContain('Hello')
        expect(result).not.toContain('<h1>')
    })

    it('should convert a real docx to markdown via mammoth', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const docxPath = path.join(caseDir, 'sample.docx')
        // 用 officegen 生成真实 docx 文件
        const docx = officeGen('docx')
        docx.createP().addText('Hello World 你好')
        const stream = createWriteStream(docxPath)
        docx.generate(stream)
        await new Promise<void>((resolve, reject) => {
            stream.on('close', () => resolve())
            stream.on('error', reject)
        })

        const result = await InsertImportFrom.word.importReader(docxPath)

        expect(result).toContain('Hello World 你好')
    })
})

describe('InsertImportFormFile', () => {
    it('should show error dialog for unsupported file type', async () => {
        const win = { webContents: { send: vi.fn() } }
        await InsertImportFormFile(win as never, 'ppt', true)
        expect(electronMocks.showOpenDialog).not.toHaveBeenCalled()
    })

    it('should do nothing when the open dialog is canceled', async () => {
        const winSend = vi.fn()
        const win = { webContents: { send: winSend } }
        electronMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

        await InsertImportFormFile(win as never, 'text', true)

        expect(winSend).not.toHaveBeenCalled()
    })

    it('should send importOption content for import mode', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const txtPath = path.join(caseDir, 'data.txt')
        await fs.writeFile(txtPath, 'hello', 'utf8')
        const winSend = vi.fn()
        const win = { webContents: { send: winSend } }
        electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [txtPath] })

        await InsertImportFormFile(win as never, 'text', true)

        expect(electronMocks.showOpenDialog).toHaveBeenCalledWith(
            win,
            expect.objectContaining({
                properties: ['openFile'],
                filters: [{ name: 'Text Files', extensions: ['txt', 'log', 'ini'] }]
            })
        )
        expect(winSend).toHaveBeenCalledWith('baize:dialog:open-vue', 'importOption', {
            content: '```text\r\nhello\r\n```\r\n'
        })
    })

    it('should insert content after cursor for insert mode', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const txtPath = path.join(caseDir, 'data.txt')
        await fs.writeFile(txtPath, 'hello', 'utf8')
        const winSend = vi.fn()
        const win = { webContents: { send: winSend } }
        electronMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [txtPath] })

        await InsertImportFormFile(win as never, 'text', false)

        expect(winSend).toHaveBeenCalledWith(
            'baize:monaco:insert-after-cursor',
            '```text\r\nhello\r\n```\r\n'
        )
    })

    it('should show exactly one error dialog when HTML conversion fails (FE-19)', async () => {
        const mainSend = vi.fn()
        appState.mainWindow = {
            webContents: { send: mainSend }
        } as unknown as Electron.BrowserWindow
        const win = { webContents: { send: vi.fn() } }
        electronMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: [path.join(tmpDir, 'no-such-file.html')]
        })

        await InsertImportFormFile(win as never, 'html', false)

        // FE-19：内层 convertHtmlToMarkdown 不再自行弹框，只由外层统一提示一次
        const messageDialogs = mainSend.mock.calls.filter(
            ([channel, dialogName]) =>
                channel === 'baize:dialog:open-vue' && dialogName === 'message'
        )
        expect(messageDialogs).toHaveLength(1)
        expect(messageDialogs[0][2]).toEqual(
            expect.objectContaining({ message: expect.stringContaining('导入文件失败') })
        )
    })
})

describe('ImportCreateNewFile', () => {
    it('should return success false when the save dialog is canceled', async () => {
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
        const result = await ImportCreateNewFile({} as never, 'content')
        expect(result).toEqual({ success: false })
    })

    it('should append .md extension, write content and open the new file', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const rawPath = path.join(caseDir, 'imported')
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: rawPath })

        const result = await ImportCreateNewFile({} as never, '# 导入内容')

        const expectedPath = rawPath + '.md'
        expect(result).toEqual({ success: true, filePath: expectedPath })
        expect(await fs.readFile(expectedPath, 'utf8')).toBe('# 导入内容')
        expect(appState.currentActiveFile?.path).toBe(expectedPath)
        expect(saveLastOpenedFile).toHaveBeenCalledWith(expectedPath)
        // 无活动文件时默认文件名
        expect(electronMocks.showSaveDialog).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ defaultPath: '导入文件.md' })
        )
    })

    it('should keep an existing .md extension and derive defaultPath from active file', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const curPath = path.join(caseDir, 'cur.md')
        appState.currentActiveFile = { name: 'cur.md', path: curPath, type: 'file', content: 'x' }
        const mdPath = path.join(caseDir, 'out.md')
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath: mdPath })

        const result = await ImportCreateNewFile({} as never, 'content')

        expect(result).toEqual({ success: true, filePath: mdPath })
        expect(electronMocks.showSaveDialog).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ defaultPath: expect.stringContaining('导入文件.md') })
        )
    })
})
