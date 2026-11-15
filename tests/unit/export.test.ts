import { describe, it, expect, beforeEach, beforeAll, afterAll, vi } from 'vitest'
import path from 'path'
import os from 'os'
import { promises as fs } from 'fs'

// CMP-30：导出提示经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

// ============ electron mock ============
// export.ts 使用 dialog.showSaveDialog、BrowserWindow（ToPdf 新建隐藏窗口）与
// app.getAppPath/getVersion（FUN-15：导出元数据版本号从 package.json 读取）
const electronMocks = vi.hoisted(() => ({
    showSaveDialog: vi.fn(),
    mainSend: vi.fn(),
    printToPDF: vi.fn(),
    loadURL: vi.fn(),
    close: vi.fn(),
    isDestroyed: vi.fn()
}))

vi.mock('electron', () => {
    class MockBrowserWindow {
        webContents = { send: electronMocks.mainSend, printToPDF: electronMocks.printToPDF }
        loadURL = electronMocks.loadURL
        close = electronMocks.close
        isDestroyed = electronMocks.isDestroyed
    }
    return {
        BrowserWindow: MockBrowserWindow,
        dialog: {
            showSaveDialog: electronMocks.showSaveDialog,
            showOpenDialog: vi.fn(),
            showMessageBoxSync: vi.fn()
        },
        shell: { showItemInFolder: vi.fn() },
        clipboard: { writeText: vi.fn() },
        // FUN-15：getAppPath 指向项目根目录（package.json 版本 1.3.0）
        app: { getAppPath: () => process.cwd(), getVersion: () => '1.3.0' }
    }
})

import { appState } from '../../src/main/utils/app-state'
import {
    ToJson,
    ToXml,
    ToYaml,
    ToHtml,
    ToWord,
    ToPdf,
    ExportToFile,
    getSupportedExportFormats,
    registerExportFormat
} from '../../src/main/utils/file-utils/export'

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
    appState.mainWindow = {
        webContents: { send: electronMocks.mainSend }
    } as unknown as Electron.BrowserWindow
    electronMocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })
    // FUN-15：ToPdf finally 中检查 isDestroyed，默认窗口存活
    electronMocks.isDestroyed.mockReturnValue(false)
})

describe('format registry', () => {
    it('should list default supported export formats', () => {
        // 必须放在注册自定义格式之前执行（文件内用例顺序执行）
        expect(getSupportedExportFormats()).toEqual(['word', 'json', 'xml', 'yaml', 'html', 'pdf'])
    })
})

describe('ToJson', () => {
    it('should write a real JSON file with content and metadata', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'out.json')
        await ToJson('# 导出内容', filePath)

        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
        expect(parsed.content).toBe('# 导出内容')
        // FUN-15：版本号从 package.json 读取（当前 1.3.0），不再硬编码 1.1.5-beta
        expect(parsed.metadata.version).toBe('1.3.0')
        expect(parsed.metadata.type).toBe('markdown')
        expect(parsed.metadata.app).toBe('BaiZeNotes')
        expect(typeof parsed.metadata.exportedAt).toBe('string')
    })
})

describe('ToXml', () => {
    it('should write an XML file with CDATA content and metadata', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'out.xml')
        await ToXml('# 导出内容', filePath)

        const xml = await fs.readFile(filePath, 'utf8')
        expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
        expect(xml).toContain('<![CDATA[# 导出内容]]>')
        expect(xml).toContain('<app>BaiZeNotes</app>')
        expect(xml).toContain('<type>markdown</type>')
    })

    it('should escape ]]> inside CDATA content (FUN-15)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'out-cdata.xml')
        // 正文包含 ]]> 时，CDATA 必须拆开，否则生成非法 XML
        await ToXml('a ]]> b', filePath)

        const xml = await fs.readFile(filePath, 'utf8')
        expect(xml).toContain('<![CDATA[a ]]]]><![CDATA[> b]]>')
    })
})

describe('ToYaml', () => {
    it('should write a YAML file with indented content block and metadata', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'out.yaml')
        await ToYaml('# 标题\n正文行', filePath)

        const yaml = await fs.readFile(filePath, 'utf8')
        expect(yaml).toContain('content: |')
        expect(yaml).toContain('  # 标题')
        expect(yaml).toContain('  正文行')
        expect(yaml).toContain('metadata:')
        expect(yaml).toContain('  app: BaiZeNotes')
    })
})

describe('ToHtml', () => {
    it('should render markdown to a complete HTML document', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'out.html')
        await ToHtml('# 标题\n\n正文段落', filePath)

        const html = await fs.readFile(filePath, 'utf8')
        expect(html).toContain('<!DOCTYPE html>')
        expect(html).toContain('<html lang="zh-CN">')
        expect(html).toContain('<h1>标题</h1>')
        expect(html).toContain('<p>正文段落</p>')
    })
})

describe('ToWord', () => {
    it('should generate a real docx (zip) file via officegen', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'out.docx')
        await ToWord('# 大标题\n普通段落', filePath)

        const buf = await fs.readFile(filePath)
        expect(buf.length).toBeGreaterThan(100)
        // docx 本质是 zip 压缩包，以 PK 魔数开头
        expect(buf.subarray(0, 2).toString()).toBe('PK')
    })
})

describe('ToPdf', () => {
    it('should write the printToPDF output to the target file', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'out.pdf')
        electronMocks.printToPDF.mockResolvedValue(Buffer.from('FAKE-PDF-DATA'))
        electronMocks.loadURL.mockResolvedValue(undefined)

        await ToPdf('# 标题', filePath)

        expect(await fs.readFile(filePath, 'utf8')).toBe('FAKE-PDF-DATA')
        expect(electronMocks.loadURL).toHaveBeenCalledWith(
            expect.stringMatching(/^data:text\/html;charset=utf-8,/)
        )
        expect(electronMocks.close).toHaveBeenCalled()
    })

    it('should close the hidden window when PDF export fails (FUN-15/MEM-07)', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'out-fail.pdf')
        // loadURL 抛错：无 try/finally 时隐藏窗口会泄漏
        electronMocks.loadURL.mockRejectedValue(new Error('load failed'))

        await expect(ToPdf('# 标题', filePath)).rejects.toThrow('load failed')
        expect(electronMocks.close).toHaveBeenCalled()
        expect(electronMocks.printToPDF).not.toHaveBeenCalled()
    })
})

describe('ExportToFile', () => {
    it('should show error dialog when there is no content to export', async () => {
        await ExportToFile({} as Electron.BrowserWindow, 'json')
        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            // FUN-27：用户可见提示统一中文
            expect.objectContaining({ message: '当前没有可导出的内容' })
        )
        expect(electronMocks.showSaveDialog).not.toHaveBeenCalled()
    })

    it('should show error dialog for unsupported format', async () => {
        appState.currentActiveFile = { name: 'a.md', path: 'a.md', type: 'file', content: '# x' }
        await ExportToFile({} as Electron.BrowserWindow, 'pptx')
        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: '暂不支持导出为 pptx 格式' })
        )
    })

    it('should do nothing when the save dialog is canceled', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        appState.currentActiveFile = { name: 'a.md', path: 'a.md', type: 'file', content: '# x' }
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: true, filePath: undefined })

        await ExportToFile({} as Electron.BrowserWindow, 'json')

        expect(await fs.readdir(caseDir)).toEqual([])
        expect(electronMocks.mainSend).not.toHaveBeenCalled()
    })

    it('should export JSON successfully and show info dialog', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'out.json')
        appState.currentActiveFile = { name: 'a.md', path: 'a.md', type: 'file', content: '# 导出' }
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath })

        await ExportToFile({} as Electron.BrowserWindow, 'json')

        const parsed = JSON.parse(await fs.readFile(filePath, 'utf8'))
        expect(parsed.content).toBe('# 导出')
        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ type: 'info', message: expect.stringContaining('导出成功') })
        )
    })

    it('should show error dialog when the exporter throws', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        appState.currentActiveFile = { name: 'a.md', path: 'a.md', type: 'file', content: '# x' }
        electronMocks.showSaveDialog.mockResolvedValue({
            canceled: false,
            filePath: path.join(caseDir, 'out.boom')
        })
        // 注册一个必然失败的导出器（registerExportFormat 为真实入口）
        registerExportFormat('boom', {
            name: 'Boom',
            extensions: ['boom'],
            defaultName: 'untitled.boom',
            exporter: async () => {
                throw new Error('boom failed')
            }
        })

        await ExportToFile({} as Electron.BrowserWindow, 'boom')

        expect(electronMocks.mainSend).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'message',
            expect.objectContaining({ message: expect.stringContaining('导出文件失败') })
        )
    })
})

describe('custom format registration', () => {
    it('should allow registering a custom format and exporting through it', async () => {
        const caseDir = await fs.mkdtemp(path.join(tmpDir, 'case-'))
        const filePath = path.join(caseDir, 'out.custom')
        appState.currentActiveFile = {
            name: 'a.md',
            path: 'a.md',
            type: 'file',
            content: '# 自定义'
        }
        electronMocks.showSaveDialog.mockResolvedValue({ canceled: false, filePath })
        registerExportFormat('custom', {
            name: 'Custom',
            extensions: ['custom'],
            defaultName: 'untitled.custom',
            exporter: async (content, target) => {
                await fs.writeFile(target, `CUSTOM:${content}`, 'utf8')
            }
        })

        await ExportToFile({} as Electron.BrowserWindow, 'custom')

        expect(await fs.readFile(filePath, 'utf8')).toBe('CUSTOM:# 自定义')
    })
})
