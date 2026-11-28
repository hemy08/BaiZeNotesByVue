/**
 * 1.5.7 LLM Wiki L1（T1.3）：写盘入口接入回归测试（file-utils 层）
 *
 * 覆盖：在 `llm-wiki` 工作区模式下，file-utils 的写盘入口（保存 / 另存为 / 新建 /
 * 重命名 / 删除 / 图片落盘）对 `raw/` 目标一律拒绝且不落盘；`wiki/` 与工作区根文件
 * 正常放行；`traditional` 模式对 `raw/` 零影响（行为与 1.5.6 一致）。
 *
 * 说明：本测试仅 mock 周边副作用模块（electron / logger / 目录刷新 / 导出 / wiki 链接），
 * Path Guard、raw 写入守卫与文件读写均使用真实实现。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('electron', () => {
    class MockBrowserWindow {
        static getAllWindows = (): unknown[] => []
        webContents = { send: vi.fn() }
    }
    return {
        BrowserWindow: MockBrowserWindow,
        dialog: {
            showSaveDialog: vi.fn(async () => ({ canceled: true, filePath: undefined })),
            showOpenDialog: vi.fn(async () => ({ canceled: true, filePaths: [] }))
        },
        shell: { showItemInFolder: vi.fn(), openExternal: vi.fn(), trashItem: vi.fn() },
        clipboard: { writeText: vi.fn() },
        app: { getPath: () => '', getVersion: () => '1.0.0-test', getAppPath: () => '' },
        ipcMain: { on: vi.fn(), handle: vi.fn() }
    }
})

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../src/main/utils/app-message-box', () => ({
    showAppMessageBox: vi.fn(async () => ({ choiceId: 'continue', canceled: false }))
}))

vi.mock('../../src/main/utils/file-state-store', () => ({
    saveLastOpenedFile: vi.fn(),
    saveLastOpenedDirectory: vi.fn(),
    getLastOpenedFile: vi.fn(() => null),
    getRecentFiles: vi.fn(() => []),
    getLastOpenedDirectory: vi.fn(() => null)
}))

// 目录刷新（fs.watch / 防抖计时器）与 wiki 链接计划在写盘守卫测试中不参与断言，替换为桩
vi.mock('../../src/main/utils/file-utils/directory-tree', () => ({
    ReloadDirFromDisk: vi.fn(async () => undefined),
    ScheduleReloadFromDisk: vi.fn(),
    stopDirectoryWatcher: vi.fn()
}))

vi.mock('../../src/main/utils/wiki-link-rename', () => ({
    buildWikiLinkRenamePlan: vi.fn(async () => ({
        rootPath: '',
        oldPath: '',
        newPath: '',
        updates: [],
        skipped: [],
        replacementCount: 0,
        truncated: false
    })),
    applyWikiLinkRenamePlan: vi.fn(async () => ({
        updatedFiles: 0,
        replacements: 0,
        failedFiles: [],
        truncated: false
    }))
}))

vi.mock('../../src/main/utils/file-utils/export', () => ({
    ToWord: vi.fn(async () => undefined),
    ToHtml: vi.fn(async () => undefined),
    ToJson: vi.fn(async () => undefined),
    ToPdf: vi.fn(async () => undefined)
}))

import { dialog } from 'electron'
import { appState } from '../../src/main/utils/app-state'
import { setSystemSettingProvider } from '../../src/main/utils/providers'
import { PathAccessDeniedError } from '../../src/main/utils/security'
import { SYSTEM_SETTING_FALLBACK } from '../../src/shared/constants/system-defaults'
import type { SystemSetting } from '../../src/shared/types/system'
import {
    ConvertActiveFileEncoding,
    CreateDirectory,
    CreateFile,
    CreateFileFolder,
    Delete,
    Rename,
    SaveActiveFile,
    SaveActiveFileAs,
    OpenSelectFile
} from '../../src/main/utils/file-utils/file-operations'
import { SaveImageDataToFile } from '../../src/main/utils/file-utils/image-operations'
import { ImportCreateNewFile } from '../../src/main/utils/file-utils/import'
import { FileManagerContextMenuPaste } from '../../src/main/utils/file-utils/clipboard-operations'

const dialogMocks = vi.mocked(dialog)

let workspaceRoot = ''
let rawDir = ''
let wikiDir = ''

/** 注入工作区模式（provider 是 utils 侧读取系统设置的唯一真源） */
function setWorkspaceMode(workspaceMode: 'traditional' | 'llm-wiki'): void {
    setSystemSettingProvider(
        () => ({ ...SYSTEM_SETTING_FALLBACK, workspaceMode }) as unknown as SystemSetting
    )
}

/** 写测试文件（自动建父目录），返回绝对路径 */
async function writeFixture(relativePath: string, content: string): Promise<string> {
    const fullPath = path.join(workspaceRoot, relativePath)
    await fs.mkdir(path.dirname(fullPath), { recursive: true })
    await fs.writeFile(fullPath, content, 'utf8')
    return fullPath
}

beforeEach(async () => {
    vi.clearAllMocks()
    appState._resetForTesting()
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-llm-wiki-fs-'))
    rawDir = path.join(workspaceRoot, 'raw')
    wikiDir = path.join(workspaceRoot, 'wiki')
    await fs.mkdir(rawDir, { recursive: true })
    await fs.mkdir(wikiDir, { recursive: true })
    appState.rootPath = workspaceRoot
    // 另存为/保存等入口会取活主窗口（弹系统保存框、发状态栏）；测试提供最小活窗口桩
    appState.mainWindow = {
        webContents: { id: 1, send: vi.fn(), isDestroyed: () => false },
        isDestroyed: () => false
    } as unknown as Electron.BrowserWindow
    setWorkspaceMode('llm-wiki')
})

afterEach(async () => {
    setSystemSettingProvider(null)
    appState._resetForTesting()
    await fs.rm(workspaceRoot, { recursive: true, force: true })
})

describe('保存（SaveActiveFile / SaveActiveFileAs）', () => {
    it('llm-wiki 模式：raw/ 内文件保存被拒绝（磁盘内容不变，返回 false）', async () => {
        const rawFile = await writeFixture('raw/source.md', '# original')
        appState.currentActiveFile = {
            name: 'source.md',
            path: rawFile,
            type: 'file',
            content: '# changed',
            encoding: 'utf-8'
        }

        await expect(SaveActiveFile()).resolves.toBe(false)
        await expect(fs.readFile(rawFile, 'utf8')).resolves.toBe('# original')
    })

    it('llm-wiki 模式：wiki/ 与工作区根文件正常保存', async () => {
        const wikiFile = await writeFixture('wiki/topic.md', '# old')
        appState.currentActiveFile = {
            name: 'topic.md',
            path: wikiFile,
            type: 'file',
            content: '# new',
            encoding: 'utf-8'
        }
        await expect(SaveActiveFile()).resolves.toBe(true)
        await expect(fs.readFile(wikiFile, 'utf8')).resolves.toBe('# new')

        const rootFile = await writeFixture('schema.md', 'old schema')
        appState.currentActiveFile = {
            name: 'schema.md',
            path: rootFile,
            type: 'file',
            content: 'new schema',
            encoding: 'utf-8'
        }
        await expect(SaveActiveFile()).resolves.toBe(true)
        await expect(fs.readFile(rootFile, 'utf8')).resolves.toBe('new schema')
    })

    it('traditional 模式：raw/ 内文件保存照常进行（行为与 1.5.6 一致）', async () => {
        setWorkspaceMode('traditional')
        const rawFile = await writeFixture('raw/source.md', '# original')
        appState.currentActiveFile = {
            name: 'source.md',
            path: rawFile,
            type: 'file',
            content: '# traditional-edit',
            encoding: 'utf-8'
        }
        await expect(SaveActiveFile()).resolves.toBe(true)
        await expect(fs.readFile(rawFile, 'utf8')).resolves.toBe('# traditional-edit')
    })

    it('另存为选择 raw/ 内目标时被拒绝（不写盘）', async () => {
        const sourceFile = await writeFixture('wiki/topic.md', '# topic')
        appState.currentActiveFile = {
            name: 'topic.md',
            path: sourceFile,
            type: 'file',
            content: '# topic content',
            encoding: 'utf-8'
        }
        const targetPath = path.join(rawDir, 'saved.md')
        dialogMocks.showSaveDialog.mockResolvedValueOnce({
            canceled: false,
            filePath: targetPath
        })

        await SaveActiveFileAs()
        await expect(fs.stat(targetPath)).rejects.toThrow()
    })
})

describe('新建（CreateFileFolder / CreateFile / CreateDirectory）', () => {
    it('llm-wiki 模式：禁止在 raw/ 内新建文件/目录', async () => {
        // 注意 CreateFileFolder 的参数顺序为 (name, dirPath, isFolder, extension)
        await CreateFileFolder('note', rawDir, false, '.md')
        await CreateFile(rawDir, 'note2', '.md')
        await CreateDirectory(rawDir, 'sub')

        await expect(fs.stat(path.join(rawDir, 'note.md'))).rejects.toThrow()
        await expect(fs.stat(path.join(rawDir, 'note2.md'))).rejects.toThrow()
        await expect(fs.stat(path.join(rawDir, 'sub'))).rejects.toThrow()
    })

    it('llm-wiki 模式：wiki/ 内新建文件/目录正常放行', async () => {
        await CreateFileFolder('topic', wikiDir, false, '.md')
        await CreateDirectory(wikiDir, 'sub')

        await expect(fs.stat(path.join(wikiDir, 'topic.md'))).resolves.toBeTruthy()
        await expect(
            fs.stat(path.join(wikiDir, 'sub')).then((stats) => stats.isDirectory())
        ).resolves.toBe(true)
    })
})

describe('重命名（Rename）', () => {
    it('llm-wiki 模式：raw/ 内文件不可重命名（文件保持原位）', async () => {
        const rawFile = await writeFixture('raw/source.md', '# source')
        await Rename(rawFile, 'renamed', true)
        await expect(fs.stat(rawFile)).resolves.toBeTruthy()
        await expect(fs.stat(path.join(rawDir, 'renamed.md'))).rejects.toThrow()
    })

    it('llm-wiki 模式：wiki/ 内文件可重命名', async () => {
        const wikiFile = await writeFixture('wiki/topic.md', '# topic')
        await Rename(wikiFile, 'renamed', true)
        await expect(fs.stat(wikiFile)).rejects.toThrow()
        await expect(fs.stat(path.join(wikiDir, 'renamed.md'))).resolves.toBeTruthy()
    })
})

describe('删除（Delete）', () => {
    it('llm-wiki 模式：raw/ 内文件不可删除', async () => {
        const rawFile = await writeFixture('raw/source.md', '# source')
        await Delete(rawFile, true)
        await expect(fs.stat(rawFile)).resolves.toBeTruthy()
    })

    it('llm-wiki 模式：raw 目录本身不可删除', async () => {
        await Delete(rawDir, false)
        await expect(fs.stat(rawDir).then((stats) => stats.isDirectory())).resolves.toBe(true)
    })

    it('llm-wiki 模式：wiki/ 内文件可删除', async () => {
        const wikiFile = await writeFixture('wiki/topic.md', '# topic')
        await Delete(wikiFile, true)
        await expect(fs.stat(wikiFile)).rejects.toThrow()
    })
})

describe('切换文件前的自动保存', () => {
    it('llm-wiki 模式：从 raw/ 内文件切换到其他文件时跳过自动保存（磁盘内容不变）', async () => {
        const rawFile = await writeFixture('raw/source.md', '# raw-original')
        const wikiFile = await writeFixture('wiki/other.md', '# other')
        appState.currentActiveFile = {
            name: 'source.md',
            path: rawFile,
            type: 'file',
            content: '# raw-edited',
            encoding: 'utf-8'
        }

        await OpenSelectFile({ name: 'other.md', path: wikiFile, type: 'file', content: '' })

        await expect(fs.readFile(rawFile, 'utf8')).resolves.toBe('# raw-original')
        expect(appState.currentActiveFile?.path).toBe(wikiFile)
    })
})

describe('转码保存与图片落盘', () => {
    it('llm-wiki 模式：raw/ 内文件转码保存抛受控路径拒绝异常', async () => {
        const rawFile = await writeFixture('raw/source.md', '# source')
        appState.currentActiveFile = {
            name: 'source.md',
            path: rawFile,
            type: 'file',
            content: '# source',
            encoding: 'utf-8'
        }
        await expect(ConvertActiveFileEncoding('gbk')).rejects.toBeInstanceOf(PathAccessDeniedError)
        await expect(fs.stat(rawFile)).resolves.toBeTruthy()
    })

    it('llm-wiki 模式：当前文件位于 raw/ 时禁止写入 images/ 图片', async () => {
        const rawFile = await writeFixture('raw/source.md', '# source')
        appState.currentActiveFile = {
            name: 'source.md',
            path: rawFile,
            type: 'file',
            content: '# source',
            encoding: 'utf-8'
        }
        const pngBase64 = 'data:image/png;base64,iVBORw0KGgo='
        await expect(SaveImageDataToFile('pic.png', pngBase64)).resolves.toBe(false)
        await expect(fs.stat(path.join(rawDir, 'images'))).rejects.toThrow()
    })
})

describe('导入另存（ImportCreateNewFile）', () => {
    it('llm-wiki 模式：导入另存选择 raw/ 内目标时被拒绝且不写盘', async () => {
        const targetPath = path.join(rawDir, 'imported.md')
        dialogMocks.showSaveDialog.mockResolvedValueOnce({
            canceled: false,
            filePath: targetPath
        })

        const result = await ImportCreateNewFile({} as never, '# imported content')

        expect(result).toEqual({ success: false })
        await expect(fs.stat(targetPath)).rejects.toThrow()
    })
})

describe('粘贴 / 剪切（FileManagerContextMenuPaste）', () => {
    it('llm-wiki 模式：粘贴目标位于 raw/ 时被拒绝（不复制目录）', async () => {
        const sourceDir = path.join(wikiDir, 'source-dir')
        await fs.mkdir(sourceDir, { recursive: true })
        appState.srcDirCopyCut = sourceDir
        appState.isCopyOrCut = 'copy'

        await FileManagerContextMenuPaste(rawDir, false)

        await expect(fs.stat(path.join(rawDir, 'source-dir'))).rejects.toThrow()
    })

    it('llm-wiki 模式：剪切源位于 raw/ 时被拒绝（源目录保留、不产生副本）', async () => {
        const rawSourceDir = path.join(rawDir, 'source-dir')
        await fs.mkdir(rawSourceDir, { recursive: true })
        appState.srcDirCopyCut = rawSourceDir
        appState.isCopyOrCut = 'cut'

        await FileManagerContextMenuPaste(wikiDir, false)

        await expect(fs.stat(rawSourceDir).then((stats) => stats.isDirectory())).resolves.toBe(true)
        await expect(fs.stat(path.join(wikiDir, 'source-dir'))).rejects.toThrow()
    })
})
