/**
 * 覆盖率补测第五批：export.ts 导出格式名 getter / 版本号兜底 / Word worker 分支。
 *
 * 独立于既有 export.test.ts（并行安全域代理拥有该文件），只新增用例：
 * - word/json/xml/yaml/html/pdf 六个格式名 getter（内置格式名按当前语言实时翻译）；
 * - package.json 读取失败且 app.getVersion 不可用时版本号回落 'unknown'；
 * - Word 导出：worker 成功记录日志；worker 基础设施不可用降级进程内；转换错误上抛。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const hoisted = vi.hoisted(() => ({
    appPath: `${process.env.TEMP || process.env.TMP || '/tmp'}/baize-export5/app`,
    showSaveDialog: vi.fn()
}))

vi.mock('electron', () => ({
    app: {
        getAppPath: () => hoisted.appPath,
        getVersion: () => {
            throw new Error('app 未就绪')
        }
    },
    dialog: { showSaveDialog: hoisted.showSaveDialog },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() },
    ipcMain: { on: () => {} }
}))

vi.mock('../../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const dialogMocks = vi.hoisted(() => ({
    showErrorMessageBox: vi.fn(),
    showInfoMessageBox: vi.fn()
}))
vi.mock('../../../src/main/utils/file-utils/dialog-helpers', () => dialogMocks)

vi.mock('../../../src/main/utils/security', () => ({
    registerTrustedPath: vi.fn()
}))

const workerMocks = vi.hoisted(() => ({
    exportMarkdownToWordWithWorker: vi.fn(async () => undefined),
    isWordWorkerInfrastructureError: vi.fn((error: unknown) => {
        void error
        return false
    }),
    exportMarkdownToWordInProcess: vi.fn(async () => undefined)
}))
vi.mock('../../../src/main/utils/file-utils/word-worker-client', () => ({
    exportMarkdownToWordWithWorker: workerMocks.exportMarkdownToWordWithWorker,
    isWordWorkerInfrastructureError: workerMocks.isWordWorkerInfrastructureError
}))
vi.mock('../../../src/main/utils/file-utils/word-worker-tasks', () => ({
    exportMarkdownToWordInProcess: workerMocks.exportMarkdownToWordInProcess
}))

import {
    ExportToFile,
    getAppVersionForExport,
    ToWord
} from '../../../src/main/utils/file-utils/export'
import { appState } from '../../../src/main/utils/app-state'
import { logger } from '../../../src/main/utils/logger'

const mainWindow = {
    webContents: { id: 1, send: vi.fn(), isDestroyed: () => false },
    isDestroyed: () => false
} as unknown as Electron.BrowserWindow

beforeEach(() => {
    vi.clearAllMocks()
    fs.rmSync(hoisted.appPath, { recursive: true, force: true })
    appState._resetForTesting()
    hoisted.showSaveDialog.mockResolvedValue({ canceled: true, filePath: '' })
    workerMocks.exportMarkdownToWordWithWorker.mockResolvedValue(undefined)
    workerMocks.isWordWorkerInfrastructureError.mockReturnValue(false)
    workerMocks.exportMarkdownToWordInProcess.mockResolvedValue(undefined)
})

describe('导出格式名 getter', () => {
    it('word/json/xml/yaml/html/pdf 六个格式对话框分别使用本地化格式名', async () => {
        appState.currentActiveFile = {
            name: 'note.md',
            path: 'E:/notes/note.md',
            type: 'file',
            content: 'body',
            encoding: 'utf-8'
        }
        for (const format of ['word', 'json', 'xml', 'yaml', 'html', 'pdf']) {
            hoisted.showSaveDialog.mockClear()
            await ExportToFile(mainWindow, format)
            const options = hoisted.showSaveDialog.mock.calls[0]?.[1] as {
                title: string
                filters: Array<{ name: string }>
            }
            expect(options.title).toContain(options.filters[0].name)
            expect(options.filters[0].name.length).toBeGreaterThan(0)
        }
    })
})

describe('版本号兜底', () => {
    it('package.json 读取失败且 app.getVersion 抛错时版本号为 unknown', async () => {
        await expect(getAppVersionForExport()).resolves.toBe('unknown')
    })
})

describe('Word 导出 worker 分支', () => {
    it('worker 成功时记录完成日志', async () => {
        await ToWord('# md', 'E:/out.docx')
        expect(workerMocks.exportMarkdownToWordWithWorker).toHaveBeenCalledWith(
            '# md',
            'E:/out.docx'
        )
        expect(logger.info).toHaveBeenCalledWith(expect.stringContaining('worker 线程完成'))
    })

    it('worker 基础设施不可用时降级为进程内导出', async () => {
        const infraError = new Error('worker crashed')
        workerMocks.exportMarkdownToWordWithWorker.mockRejectedValueOnce(infraError)
        workerMocks.isWordWorkerInfrastructureError.mockReturnValueOnce(true)

        await ToWord('# md', 'E:/out.docx')
        expect(logger.warn).toHaveBeenCalled()
        expect(workerMocks.exportMarkdownToWordInProcess).toHaveBeenCalledWith(
            '# md',
            'E:/out.docx'
        )
    })

    it('转换本身的错误直接上抛（不掩盖失败原因）', async () => {
        const convertError = new Error('bad docx')
        workerMocks.exportMarkdownToWordWithWorker.mockRejectedValueOnce(convertError)
        workerMocks.isWordWorkerInfrastructureError.mockReturnValueOnce(false)
        await expect(ToWord('# md', 'E:/out.docx')).rejects.toBe(convertError)
        expect(workerMocks.exportMarkdownToWordInProcess).not.toHaveBeenCalled()
    })
})

describe('导出成功/失败提示', () => {
    function prepareExport(filePath: string): void {
        appState.currentActiveFile = {
            name: 'note.md',
            path: 'E:/notes/note.md',
            type: 'file',
            content: 'body',
            encoding: 'utf-8'
        }
        hoisted.showSaveDialog.mockResolvedValue({ canceled: false, filePath })
    }

    it('导出成功后弹成功提示', async () => {
        const outFile = path.join(os.tmpdir(), 'baize-export5-out.json')
        prepareExport(outFile)
        await ExportToFile(mainWindow, 'json')
        expect(dialogMocks.showInfoMessageBox).toHaveBeenCalledTimes(1)
        fs.rmSync(outFile, { force: true })
    })

    it('导出抛错时弹失败提示', async () => {
        workerMocks.exportMarkdownToWordWithWorker.mockRejectedValueOnce(new Error('export boom'))
        prepareExport(path.join(os.tmpdir(), 'baize-export5-out.docx'))
        await ExportToFile(mainWindow, 'word')
        expect(dialogMocks.showErrorMessageBox).toHaveBeenCalledTimes(1)
    })
})
