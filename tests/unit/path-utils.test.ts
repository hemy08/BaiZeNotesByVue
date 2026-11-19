import { describe, it, expect, beforeEach, vi } from 'vitest'

// path-utils 仅使用 electron 的 dialog.showOpenDialog（app-state 中还有 BrowserWindow 类型引用）
const dialogMocks = vi.hoisted(() => ({
    showOpenDialog: vi.fn()
}))

vi.mock('electron', () => ({
    BrowserWindow: class {},
    app: {
        getPath: vi.fn(
            () => `${process.env.TEMP || process.env.TMP || '/tmp'}/baize-vitest-path-utils`
        ),
        getAppPath: vi.fn(
            () => `${process.env.TEMP || process.env.TMP || '/tmp'}/baize-vitest-path-utils/app`
        ),
        get isPackaged() {
            return false
        }
    },
    dialog: { showOpenDialog: dialogMocks.showOpenDialog }
}))

// P1-FE-06：SelectDirectory 读取系统设置（config/system-setting → theme-config →
// theme-registry 依赖 @electron-toolkit/utils / electron-store），单测用替身隔离
vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))
vi.mock('electron-store', async () => {
    const { FakeStore } = await import('./helpers/fake-store')
    return { default: FakeStore }
})
vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import { appState } from '../../src/main/utils/app-state'
import { FakeStore } from './helpers/fake-store'
import {
    GetCurrentFileDirectory,
    SelectDirectory,
    ParserFileName,
    ParseDirectoryPath,
    BuildFileTree
} from '../../src/main/utils/file-utils/path-utils'
import { setSystemSettingProvider } from '../../src/main/utils/providers'
import type { SystemSetting } from '../../src/shared/types'

// 结构优化 1.1（H1）：path-utils 的系统设置读取改经 utils/providers 注入；
// 用 FakeStore 中 systemSetting 的数据模拟 config/system-setting 的真实读取，
// 保持「defaultFilePath 作为目录选择对话框起始路径」用例的语义与数据准备方式不变。
setSystemSettingProvider(
    () =>
        ({
            defaultFilePath:
                (FakeStore.data.get('systemSetting')?.get('defaultFilePath') as
                    | string
                    | undefined) ?? ''
        }) as unknown as SystemSetting
)

describe('ParserFileName', () => {
    it('should extract file name from a Windows path', () => {
        expect(ParserFileName('C:\\notes\\sub\\note.md')).toBe('note.md')
    })

    it('should extract file name from a POSIX path', () => {
        expect(ParserFileName('/home/user/notes/a.txt')).toBe('a.txt')
    })

    it('should return the input unchanged when there is no separator', () => {
        expect(ParserFileName('note.md')).toBe('note.md')
    })
})

describe('ParseDirectoryPath', () => {
    it('should extract directory from a Windows file path', () => {
        expect(ParseDirectoryPath('C:\\notes\\sub\\note.md')).toBe('C:\\notes\\sub')
    })

    it('should extract directory from a POSIX file path', () => {
        expect(ParseDirectoryPath('/home/user/notes/a.txt')).toBe('/home/user/notes')
    })

    it('should return the input unchanged for a path without extension dot', () => {
        // 无 "." 的路径（目录路径）原样返回
        expect(ParseDirectoryPath('C:\\notes\\sub')).toBe('C:\\notes\\sub')
    })
})

describe('GetCurrentFileDirectory', () => {
    beforeEach(() => {
        appState._resetForTesting()
    })

    it('should return directory of the current active file', () => {
        appState.currentActiveFile = {
            name: 'note.md',
            path: 'C:\\notes\\sub\\note.md',
            type: 'file',
            content: ''
        }
        expect(GetCurrentFileDirectory()).toBe('C:\\notes\\sub')
    })

    it('should fall back to rootPath when there is no active file', () => {
        appState.rootPath = 'D:\\workspace'
        expect(GetCurrentFileDirectory()).toBe('D:\\workspace')
    })

    it('should return empty string when neither active file nor rootPath exists', () => {
        expect(GetCurrentFileDirectory()).toBe('')
    })
})

describe('BuildFileTree', () => {
    it('should wrap file items into a single folder node named after root', () => {
        const items = [
            {
                id: 'a-item',
                name: 'a.md',
                path: 'C:\\notes\\myroot\\a.md',
                type: 'file' as const,
                isDirectory: false,
                fileExtension: '.md',
                children: []
            },
            {
                id: 'b-item',
                name: 'b.txt',
                path: 'C:\\notes\\myroot\\b.txt',
                type: 'file' as const,
                isDirectory: false,
                fileExtension: '.txt',
                children: []
            }
        ]
        const tree = BuildFileTree('C:\\notes\\myroot', items, 'root-item')
        expect(tree).toHaveLength(1)
        expect(tree[0].id).toBe('root-item')
        expect(tree[0].name).toBe('myroot')
        expect(tree[0].path).toBe('C:\\notes\\myroot')
        expect(tree[0].type).toBe('folder')
        expect(tree[0].isDirectory).toBe(true)
        // 第 2 批契约：根节点 fileExtension 固定空串（与文件夹节点口径一致）
        expect(tree[0].fileExtension).toBe('')
        expect(tree[0].children).toHaveLength(2)
        expect(tree[0].children[0]).toBe(items[0])
    })

    it('should produce an empty directory name when rootPath ends with separator', () => {
        // 尾部分隔符导致目录名被解析为空字符串（真实行为）
        const tree = BuildFileTree('C:\\notes\\myroot\\', [], 'root-item-2')
        expect(tree).toHaveLength(1)
        expect(tree[0].name).toBe('')
    })
})

describe('SelectDirectory', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        FakeStore.resetAll()
    })

    it('should return empty string when dialog is canceled', async () => {
        dialogMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })
        const result = await SelectDirectory({} as Electron.BrowserWindow)
        expect(result).toBe('')
    })

    it('should return selected directory path', async () => {
        dialogMocks.showOpenDialog.mockResolvedValue({
            canceled: false,
            filePaths: ['C:\\selected']
        })
        const result = await SelectDirectory({} as Electron.BrowserWindow)
        expect(result).toBe('C:\\selected')
    })

    it('should return empty string when filePaths is empty', async () => {
        dialogMocks.showOpenDialog.mockResolvedValue({ canceled: false, filePaths: [] })
        const result = await SelectDirectory({} as Electron.BrowserWindow)
        expect(result).toBe('')
    })

    // P1-FE-06：系统设置中的默认文件路径作为目录选择对话框的起始位置（原无消费方）
    it('passes the configured defaultFilePath as the dialog defaultPath', async () => {
        const storeData = new Map<string, unknown>([['defaultFilePath', 'D:\\notes']])
        FakeStore.data.set('systemSetting', storeData)
        dialogMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

        await SelectDirectory({} as Electron.BrowserWindow)

        expect(dialogMocks.showOpenDialog).toHaveBeenCalledWith(
            expect.anything(),
            expect.objectContaining({ defaultPath: 'D:\\notes', properties: ['openDirectory'] })
        )
    })

    it('omits defaultPath when no default file path is configured', async () => {
        dialogMocks.showOpenDialog.mockResolvedValue({ canceled: true, filePaths: [] })

        await SelectDirectory({} as Electron.BrowserWindow)

        const options = dialogMocks.showOpenDialog.mock.calls[0][1] as Record<string, unknown>
        expect(options.defaultPath).toBeUndefined()
    })
})
