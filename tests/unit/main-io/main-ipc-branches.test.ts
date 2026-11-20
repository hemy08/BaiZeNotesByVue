/**
 * 覆盖率补测第五批：主进程 IPC 注册域边界（file-manager / file-editor / crypto / system）。
 *
 * 覆盖点（IPC 注册收口后按域拆分的新模块，此前语句覆盖偏低）：
 * - file-manager-ipc：右键动作 7 个 send 通道的转发、OPEN_SELECT_FILE / RELOAD_FROM_DISK /
 *   INSERT_IMAGE 的成功与异常兜底（notifyIpcAsyncError）；
 * - file-editor-ipc：内容同步（无活动文件只提示一次）、编码重开/转码、落盘、
 *   READ_HTML / READ_BINARY / OPEN_IN_BROWSER / CHECK_EXISTS 的守卫与失败分支；
 * - crypto-ipc：RSA bits 白名单、Hash/HMAC/加解密入参运行时校验（TypeError 拒绝）；
 * - system-ipc：version.json 缺字段补齐、损坏 JSON 兜底为空版本结构。
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

// ============ 外围依赖 mock ============
const electronMocks = vi.hoisted(() => ({
    openExternal: vi.fn()
}))

vi.mock('electron', () => ({
    shell: { openExternal: electronMocks.openExternal },
    BrowserWindow: class {},
    app: { getPath: () => '', getVersion: () => '1.0.0-test' }
}))

const fsOverrides = vi.hoisted(() => ({
    existsSync: null as null | ((filePath: string) => boolean),
    stat: null as null | ((filePath: string) => Promise<{ size: number }>)
}))

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>()
    return {
        ...actual,
        existsSync: (filePath: string): boolean =>
            fsOverrides.existsSync ? fsOverrides.existsSync(filePath) : actual.existsSync(filePath),
        promises: {
            ...actual.promises,
            stat: (filePath: string): Promise<{ size: number }> =>
                fsOverrides.stat
                    ? fsOverrides.stat(filePath)
                    : (actual.promises.stat(filePath) as unknown as Promise<{ size: number }>)
        }
    }
})

// CMP-30：tMain 固定中文词条，隔离 electron-store 依赖链
vi.mock('../../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const fileUtilsMocks = vi.hoisted(() => ({
    OpenSelectFile: vi.fn(),
    ReloadDirFromDisk: vi.fn(),
    CopyRelativePath: vi.fn(),
    CopyImageLink: vi.fn(),
    CopyFileLink: vi.fn(),
    FileManagerContextMenuCopy: vi.fn(),
    FileManagerContextMenuCut: vi.fn(),
    FileManagerContextMenuPaste: vi.fn(),
    OpenFolderExplorer: vi.fn(),
    InsertImagesToFile: vi.fn(),
    ReopenActiveFileWithEncoding: vi.fn(),
    ConvertActiveFileEncoding: vi.fn(),
    SaveActiveFile: vi.fn()
}))

vi.mock('../../../src/main/utils/file-utils/index', () => fileUtilsMocks)

vi.mock('../../../src/main/utils/error-report', () => ({
    notifyIpcAsyncError: vi.fn()
}))

vi.mock('../../../src/main/utils/status-notify', () => ({
    notifyStatus: vi.fn(),
    toUserError: (error: unknown) => String(error)
}))

vi.mock('../../../src/main/utils/security', () => ({
    isPathAllowed: vi.fn(() => true),
    isAllowedReadHtmlExtension: vi.fn(() => true)
}))

vi.mock('../../../src/main/utils/app-paths', () => ({
    getAppResourcesPath: () => appPaths.resources
}))

const appPaths = vi.hoisted(() => ({ resources: '' }))

vi.mock('../../../src/main/utils/encrypt-decrypt', () => ({
    CreateHash: vi.fn((context: string, encType: string) => `hash:${context}:${encType}`),
    CreateHmac: vi.fn(
        (context: string, key: string, encType: string) => `hmac:${context}:${key}:${encType}`
    ),
    CreateRsaKeyPair: vi.fn(),
    CryptoDecrypt: vi.fn(() => ({ result: 'decrypted' })),
    CryptoEncrypt: vi.fn(() => ({ result: 'encrypted' }))
}))

vi.mock('../../../src/main/utils/utils', () => ({
    sanitizeRsaBits: vi.fn((bits: unknown) => (bits === 4096 ? 4096 : 2048))
}))

interface CapturedListener {
    channel: string
    listener: (...args: unknown[]) => unknown
    kind: 'on' | 'handle'
}

const captured = vi.hoisted(() => ({
    listeners: new Map<string, CapturedListener>()
}))

vi.mock('../../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: {
        registerOnce: (channel: string, listener: (...args: unknown[]) => unknown): string => {
            captured.listeners.set(channel, { channel, listener, kind: 'on' })
            return `${channel}:once`
        },
        registerHandleOnce: (
            channel: string,
            listener: (...args: unknown[]) => unknown
        ): string => {
            captured.listeners.set(channel, { channel, listener, kind: 'handle' })
            return `${channel}:handle`
        }
    }
}))

// ============ 被测模块与断言目标 ============
import { registerFileManagerIpc } from '../../../src/main/ipc/file-manager-ipc'
import { registerFileEditorIpc } from '../../../src/main/ipc/file-editor-ipc'
import { registerCryptoIpc } from '../../../src/main/ipc/crypto-ipc'
import { registerSystemIpc } from '../../../src/main/ipc/system-ipc'
import {
    resetTrustedSenderRegistry,
    setTrustedMainWindow
} from '../../../src/main/utils/ipc-security'
import { appState } from '../../../src/main/utils/app-state'
import { notifyIpcAsyncError } from '../../../src/main/utils/error-report'
import { notifyStatus } from '../../../src/main/utils/status-notify'
import { logger } from '../../../src/main/utils/logger'
import { isAllowedReadHtmlExtension, isPathAllowed } from '../../../src/main/utils/security'
import {
    CreateHash,
    CreateHmac,
    CreateRsaKeyPair,
    CryptoEncrypt
} from '../../../src/main/utils/encrypt-decrypt'
import { sanitizeRsaBits } from '../../../src/main/utils/utils'
import { IPC } from '../../../src/shared/ipc-channels'

const mainSend = vi.fn()
const mainWindow = {
    webContents: { id: 1, send: mainSend, isDestroyed: () => false },
    isDestroyed: () => false
}
const trustedEvent = { sender: mainWindow.webContents }

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-ipc5-'))

function listenerOf(channel: string): CapturedListener {
    const entry = captured.listeners.get(channel)
    if (!entry) throw new Error(`通道未注册: ${channel}`)
    return entry
}

beforeEach(() => {
    vi.clearAllMocks()
    captured.listeners.clear()
    appState._resetForTesting()
    resetTrustedSenderRegistry()
    setTrustedMainWindow(mainWindow as never)
    fsOverrides.existsSync = null
    fsOverrides.stat = null
    vi.mocked(isPathAllowed).mockReturnValue(true)
    vi.mocked(isAllowedReadHtmlExtension).mockReturnValue(true)
    fileUtilsMocks.OpenSelectFile.mockResolvedValue(undefined)
    fileUtilsMocks.ReloadDirFromDisk.mockResolvedValue(undefined)
    fileUtilsMocks.InsertImagesToFile.mockResolvedValue('image.png')
    fileUtilsMocks.ReopenActiveFileWithEncoding.mockResolvedValue(undefined)
    fileUtilsMocks.ConvertActiveFileEncoding.mockResolvedValue(undefined)
    fileUtilsMocks.SaveActiveFile.mockResolvedValue(true)
    appPaths.resources = path.join(tempRoot, 'resources')
})

afterEach(() => {
    fsOverrides.existsSync = null
    fsOverrides.stat = null
})

afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('file-manager-ipc：右键动作转发', () => {
    beforeEach(() => {
        registerFileManagerIpc(mainWindow as never, 'global-utils-ipc')
    })

    it('7 个 send 通道分别转发到 file-utils 对应实现', async () => {
        await listenerOf(IPC.FILE_MANAGER.COPY_RELATIVE_PATH).listener(trustedEvent, '/w/a.md')
        await listenerOf(IPC.FILE_MANAGER.COPY_IMAGELINK).listener(trustedEvent, '/w/a.png')
        await listenerOf(IPC.FILE_MANAGER.COPY_FILELINK).listener(trustedEvent, '/w/a.md')
        await listenerOf(IPC.FILE_MANAGER.COPY_FILE).listener(trustedEvent, '/w/a.md', true)
        await listenerOf(IPC.FILE_MANAGER.CUT).listener(trustedEvent, '/w/b.md', true)
        await listenerOf(IPC.FILE_MANAGER.PASTE).listener(trustedEvent, '/w/dst', false)
        listenerOf(IPC.FILE_MANAGER.OPEN_IN_EXPLORER).listener(trustedEvent, '/w/a.md')

        expect(fileUtilsMocks.CopyRelativePath).toHaveBeenCalledWith('/w/a.md')
        expect(fileUtilsMocks.CopyImageLink).toHaveBeenCalledWith('/w/a.png')
        expect(fileUtilsMocks.CopyFileLink).toHaveBeenCalledWith('/w/a.md')
        expect(fileUtilsMocks.FileManagerContextMenuCopy).toHaveBeenCalledWith('/w/a.md', true)
        expect(fileUtilsMocks.FileManagerContextMenuCut).toHaveBeenCalledWith('/w/b.md', true)
        expect(fileUtilsMocks.FileManagerContextMenuPaste).toHaveBeenCalledWith('/w/dst', false)
        expect(fileUtilsMocks.OpenFolderExplorer).toHaveBeenCalledWith('/w/a.md')
    })

    it('OPEN_SELECT_FILE 成功时调用 OpenSelectFile，不触发错误兜底', async () => {
        await listenerOf(IPC.FILE.OPEN_SELECT_FILE).listener(trustedEvent, {
            path: '/w/a.md'
        })
        expect(fileUtilsMocks.OpenSelectFile).toHaveBeenCalled()
        expect(notifyIpcAsyncError).not.toHaveBeenCalled()
    })

    it('OPEN_SELECT_FILE 抛错时经 notifyIpcAsyncError 兜底', async () => {
        const error = new Error('open failed')
        fileUtilsMocks.OpenSelectFile.mockRejectedValueOnce(error)
        await listenerOf(IPC.FILE.OPEN_SELECT_FILE).listener(trustedEvent, { path: '/w/a.md' })
        expect(notifyIpcAsyncError).toHaveBeenCalledWith(
            mainWindow,
            IPC.FILE.OPEN_SELECT_FILE,
            error
        )
    })

    it('RELOAD_FROM_DISK 抛错时经 notifyIpcAsyncError 兜底', async () => {
        const error = new Error('reload failed')
        fileUtilsMocks.ReloadDirFromDisk.mockRejectedValueOnce(error)
        await listenerOf(IPC.FILE_MANAGER.RELOAD_FROM_DISK).listener(trustedEvent)
        expect(notifyIpcAsyncError).toHaveBeenCalledWith(
            mainWindow,
            IPC.FILE_MANAGER.RELOAD_FROM_DISK,
            error
        )
    })

    it('INSERT_IMAGE 成功时回推 Markdown 图片模板', async () => {
        await listenerOf(IPC.RENDER.INSERT_IMAGE).listener(trustedEvent, 'base64')
        expect(fileUtilsMocks.InsertImagesToFile).toHaveBeenCalledWith('base64')
        expect(mainSend).toHaveBeenCalledWith(
            IPC.MONACO.TEXT_BLOCK_TEMPLATES,
            '\r\n\r\n![](./images/image.png)\r\n\r\n'
        )
    })

    it('INSERT_IMAGE 保存为空串时不回推模板（失败分支）', async () => {
        fileUtilsMocks.InsertImagesToFile.mockResolvedValueOnce('')
        await listenerOf(IPC.RENDER.INSERT_IMAGE).listener(trustedEvent, 'bad-base64')
        expect(mainSend).not.toHaveBeenCalled()
    })

    it('INSERT_IMAGE 抛错时经 notifyIpcAsyncError 兜底', async () => {
        const error = new Error('insert failed')
        fileUtilsMocks.InsertImagesToFile.mockRejectedValueOnce(error)
        await listenerOf(IPC.RENDER.INSERT_IMAGE).listener(trustedEvent, 'base64')
        expect(notifyIpcAsyncError).toHaveBeenCalledWith(mainWindow, IPC.RENDER.INSERT_IMAGE, error)
    })
})

describe('file-editor-ipc：内容同步与保存', () => {
    beforeEach(() => {
        registerFileEditorIpc(mainWindow as never, 'global-utils-ipc')
    })

    it('有活动文件时同步内容并重置「无活动文件」提示状态', async () => {
        appState.currentActiveFile = {
            name: 'a.md',
            path: path.join(tempRoot, 'a.md'),
            type: 'file',
            content: 'old',
            encoding: 'utf-8'
        }
        await listenerOf(IPC.FILE.UPDATE_SELECT_FILE_CONTENT).listener(trustedEvent, 'new')
        expect(appState.currentActiveFile.content).toBe('new')
        expect(mainSend).not.toHaveBeenCalled()
    })

    it('无活动文件时只提示一次（FUN-18）', async () => {
        await listenerOf(IPC.FILE.UPDATE_SELECT_FILE_CONTENT).listener(trustedEvent, 'x')
        await listenerOf(IPC.FILE.UPDATE_SELECT_FILE_CONTENT).listener(trustedEvent, 'y')
        expect(mainSend).toHaveBeenCalledTimes(1)
        expect(mainSend).toHaveBeenCalledWith(
            IPC.EVENTS.STATUS_BAR_UPDATE,
            expect.objectContaining({ type: 'warning' })
        )
    })

    it('内容同步异常时经 notifyIpcAsyncError 兜底', async () => {
        const file = {
            name: 'a.md',
            path: path.join(tempRoot, 'a.md'),
            type: 'file',
            content: 'old',
            encoding: 'utf-8'
        }
        Object.defineProperty(file, 'content', {
            set() {
                throw new Error('content locked')
            },
            get: () => 'old'
        })
        appState.currentActiveFile = file as never
        await listenerOf(IPC.FILE.UPDATE_SELECT_FILE_CONTENT).listener(trustedEvent, 'x')
        expect(notifyIpcAsyncError).toHaveBeenCalledWith(
            mainWindow,
            IPC.FILE.UPDATE_SELECT_FILE_CONTENT,
            expect.any(Error)
        )
    })

    it('REOPEN_WITH_ENCODING / CONVERT_SAVE_ENCODING 转发到 file-utils', async () => {
        await listenerOf(IPC.FILE.REOPEN_WITH_ENCODING).listener(trustedEvent, 'gbk')
        await listenerOf(IPC.FILE.CONVERT_SAVE_ENCODING).listener(trustedEvent, 'utf-8')
        expect(fileUtilsMocks.ReopenActiveFileWithEncoding).toHaveBeenCalledWith('gbk')
        expect(fileUtilsMocks.ConvertActiveFileEncoding).toHaveBeenCalledWith('utf-8')
    })

    it('编码通道失败时异常向上抛（handle 语义）且补日志', async () => {
        const error = new Error('reopen failed')
        fileUtilsMocks.ReopenActiveFileWithEncoding.mockRejectedValueOnce(error)
        await expect(
            listenerOf(IPC.FILE.REOPEN_WITH_ENCODING).listener(trustedEvent, 'gbk')
        ).rejects.toBe(error)
        expect(logger.error).toHaveBeenCalled()
    })

    it('SAVE_TO_DISK：有活动文件时先同步内容再保存', async () => {
        appState.currentActiveFile = {
            name: 'a.md',
            path: path.join(tempRoot, 'a.md'),
            type: 'file',
            content: 'old',
            encoding: 'utf-8'
        }
        await listenerOf(IPC.FILE.SAVE_TO_DISK).listener(trustedEvent, 'dirty content')
        expect(appState.currentActiveFile.content).toBe('dirty content')
        expect(fileUtilsMocks.SaveActiveFile).toHaveBeenCalled()
    })

    it('SAVE_TO_DISK：无活动文件时静默跳过', async () => {
        await listenerOf(IPC.FILE.SAVE_TO_DISK).listener(trustedEvent, 'dirty content')
        expect(fileUtilsMocks.SaveActiveFile).not.toHaveBeenCalled()
    })

    it('SAVE_TO_DISK 抛错时经 notifyIpcAsyncError 兜底', async () => {
        appState.currentActiveFile = {
            name: 'a.md',
            path: path.join(tempRoot, 'a.md'),
            type: 'file',
            content: 'old',
            encoding: 'utf-8'
        }
        const error = new Error('save failed')
        fileUtilsMocks.SaveActiveFile.mockRejectedValueOnce(error)
        await listenerOf(IPC.FILE.SAVE_TO_DISK).listener(trustedEvent, 'x')
        expect(notifyIpcAsyncError).toHaveBeenCalledWith(mainWindow, IPC.FILE.SAVE_TO_DISK, error)
    })
})

describe('file-editor-ipc：READ_HTML 守卫与读取', () => {
    beforeEach(() => {
        registerFileEditorIpc(mainWindow as never, 'global-utils-ipc')
    })

    it('路径越界时提示并抛受控错误', async () => {
        vi.mocked(isPathAllowed).mockReturnValue(false)
        await expect(
            listenerOf(IPC.FILE.READ_HTML).listener(trustedEvent, '/etc/passwd')
        ).rejects.toThrow()
        expect(notifyStatus).toHaveBeenCalled()
    })

    it('非文本扩展名被拒绝', async () => {
        vi.mocked(isAllowedReadHtmlExtension).mockReturnValue(false)
        await expect(
            listenerOf(IPC.FILE.READ_HTML).listener(trustedEvent, '/w/a.exe')
        ).rejects.toThrow()
        expect(logger.warn).toHaveBeenCalled()
    })

    it('读取成功返回文件内容；读取失败（目录）抛错并记日志', async () => {
        const htmlFile = path.join(tempRoot, 'view.html')
        fs.writeFileSync(htmlFile, '<h1>hi</h1>', 'utf-8')
        await expect(listenerOf(IPC.FILE.READ_HTML).listener(trustedEvent, htmlFile)).resolves.toBe(
            '<h1>hi</h1>'
        )

        const dirAsHtml = path.join(tempRoot, 'dir.html')
        fs.mkdirSync(dirAsHtml, { recursive: true })
        await expect(
            listenerOf(IPC.FILE.READ_HTML).listener(trustedEvent, dirAsHtml)
        ).rejects.toThrow()
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('读取 HTML 文件失败'),
            expect.any(Error)
        )
    })
})

describe('file-editor-ipc：READ_BINARY 守卫与读取', () => {
    beforeEach(() => {
        registerFileEditorIpc(mainWindow as never, 'global-utils-ipc')
    })

    it('空路径 / 越界 / 非 PDF 均拒绝', async () => {
        await expect(
            listenerOf(IPC.FILE.READ_BINARY).listener(trustedEvent, '  ')
        ).rejects.toThrow()
        vi.mocked(isPathAllowed).mockReturnValueOnce(false)
        await expect(
            listenerOf(IPC.FILE.READ_BINARY).listener(trustedEvent, '/w/a.pdf')
        ).rejects.toThrow()
        await expect(
            listenerOf(IPC.FILE.READ_BINARY).listener(trustedEvent, '/w/a.bin')
        ).rejects.toThrow()
    })

    it('stat 失败时记日志并抛错', async () => {
        const missing = path.join(tempRoot, 'missing.pdf')
        await expect(
            listenerOf(IPC.FILE.READ_BINARY).listener(trustedEvent, missing)
        ).rejects.toThrow()
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('无法获取文件大小'),
            expect.any(Error)
        )
    })

    it('超过 128MB 上限时拒绝并说明大小', async () => {
        fsOverrides.stat = async () => ({ size: 128 * 1024 * 1024 + 1 })
        await expect(
            listenerOf(IPC.FILE.READ_BINARY).listener(trustedEvent, '/w/huge.pdf')
        ).rejects.toThrow(/文件过大/)
        expect(logger.warn).toHaveBeenCalled()
    })

    it('读取成功返回 Buffer', async () => {
        const pdfFile = path.join(tempRoot, 'small.pdf')
        fs.writeFileSync(pdfFile, Buffer.from('%PDF-1.4'))
        const result = (await listenerOf(IPC.FILE.READ_BINARY).listener(
            trustedEvent,
            pdfFile
        )) as Buffer
        expect(Buffer.isBuffer(result)).toBe(true)
        expect(result.subarray(0, 4).toString()).toBe('%PDF')
    })

    it('读取失败时记日志并抛错', async () => {
        fsOverrides.stat = async () => ({ size: 10 })
        const dirAsPdf = path.join(tempRoot, 'dir.pdf')
        fs.mkdirSync(dirAsPdf, { recursive: true })
        await expect(
            listenerOf(IPC.FILE.READ_BINARY).listener(trustedEvent, dirAsPdf)
        ).rejects.toThrow()
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('读取二进制文件失败'),
            expect.any(Error)
        )
    })
})

describe('file-editor-ipc：OPEN_IN_BROWSER 与 CHECK_EXISTS', () => {
    beforeEach(() => {
        registerFileEditorIpc(mainWindow as never, 'global-utils-ipc')
    })

    it('空路径 / 非 HTML 路径直接返回', async () => {
        await listenerOf(IPC.FILE.OPEN_IN_BROWSER).listener(trustedEvent, '')
        await listenerOf(IPC.FILE.OPEN_IN_BROWSER).listener(trustedEvent, '/w/a.txt')
        expect(electronMocks.openExternal).not.toHaveBeenCalled()
    })

    it('越界路径提示后返回', async () => {
        vi.mocked(isPathAllowed).mockReturnValueOnce(false)
        await listenerOf(IPC.FILE.OPEN_IN_BROWSER).listener(trustedEvent, '/w/a.html')
        expect(notifyStatus).toHaveBeenCalled()
        expect(electronMocks.openExternal).not.toHaveBeenCalled()
    })

    it('合法 HTML 交系统浏览器打开，openExternal 抛错时兜底', async () => {
        electronMocks.openExternal.mockResolvedValue(undefined)
        await listenerOf(IPC.FILE.OPEN_IN_BROWSER).listener(trustedEvent, '/w/view.html')
        expect(electronMocks.openExternal).toHaveBeenCalledWith(expect.stringContaining('file:///'))

        const error = new Error('no browser')
        electronMocks.openExternal.mockRejectedValueOnce(error)
        await listenerOf(IPC.FILE.OPEN_IN_BROWSER).listener(trustedEvent, '/w/view2.html')
        expect(notifyIpcAsyncError).toHaveBeenCalledWith(
            mainWindow,
            IPC.FILE.OPEN_IN_BROWSER,
            error
        )
    })

    it('CHECK_EXISTS：越界返回 false；存在性读取异常返回 false 并记日志', async () => {
        vi.mocked(isPathAllowed).mockReturnValueOnce(false)
        await expect(
            listenerOf(IPC.FILE.CHECK_EXISTS).listener(trustedEvent, '/etc/passwd')
        ).resolves.toBe(false)

        fsOverrides.existsSync = () => {
            throw new Error('EPERM')
        }
        await expect(
            listenerOf(IPC.FILE.CHECK_EXISTS).listener(trustedEvent, '/w/a.md')
        ).resolves.toBe(false)
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('检查文件存在失败'),
            expect.any(Error)
        )
    })

    it('CHECK_EXISTS：存在返回 true', async () => {
        const existing = path.join(tempRoot, 'exists.md')
        fs.writeFileSync(existing, 'x')
        await expect(
            listenerOf(IPC.FILE.CHECK_EXISTS).listener(trustedEvent, existing)
        ).resolves.toBe(true)
        await expect(
            listenerOf(IPC.FILE.CHECK_EXISTS).listener(trustedEvent, path.join(tempRoot, 'no.md'))
        ).resolves.toBe(false)
    })
})

describe('crypto-ipc：入参校验与 RSA 白名单', () => {
    beforeEach(() => {
        registerCryptoIpc('global-utils-ipc')
    })

    it('RSA 生成按白名单归一化 bits', async () => {
        listenerOf(IPC.PLUGIN.RSA_GENERATE).listener(trustedEvent, 4096)
        expect(sanitizeRsaBits).toHaveBeenCalledWith(4096)
        expect(CreateRsaKeyPair).toHaveBeenCalledWith(4096)
    })

    it('Hash/HMAC 非字符串入参抛 TypeError', async () => {
        await expect(
            listenerOf(IPC.PLUGIN.HASH_TEXT).listener(trustedEvent, 123, 'hex')
        ).rejects.toThrow(/context 必须是字符串/)
        await expect(
            listenerOf(IPC.PLUGIN.HMAC_TEXT).listener(trustedEvent, 'ctx', null, 'hex')
        ).rejects.toThrow(/secKey 必须是字符串/)
        expect(CreateHash).not.toHaveBeenCalled()
        expect(CreateHmac).not.toHaveBeenCalled()
    })

    it('Hash/HMAC 合法入参透传', async () => {
        await expect(
            listenerOf(IPC.PLUGIN.HASH_TEXT).listener(trustedEvent, 'ctx', 'hex')
        ).resolves.toBe('hash:ctx:hex')
        await expect(
            listenerOf(IPC.PLUGIN.HMAC_TEXT).listener(trustedEvent, 'ctx', 'key', 'base64')
        ).resolves.toBe('hmac:ctx:key:base64')
    })

    it('加密数据非法结构逐个分支抛 TypeError', async () => {
        await expect(
            listenerOf(IPC.PLUGIN.CRYPTO_ENCRYPT).listener(trustedEvent, null)
        ).rejects.toThrow(/必须是对象/)
        await expect(
            listenerOf(IPC.PLUGIN.CRYPTO_ENCRYPT).listener(trustedEvent, [])
        ).rejects.toThrow(/必须是对象/)
        await expect(
            listenerOf(IPC.PLUGIN.CRYPTO_ENCRYPT).listener(trustedEvent, { context: 'c' })
        ).rejects.toThrow(/algorithm/)
        await expect(
            listenerOf(IPC.PLUGIN.CRYPTO_ENCRYPT).listener(trustedEvent, {
                algorithm: 'aes-256-cbc'
            })
        ).rejects.toThrow(/context/)
        await expect(
            listenerOf(IPC.PLUGIN.CRYPTO_ENCRYPT).listener(trustedEvent, {
                algorithm: 'aes-256-cbc',
                context: 'c',
                iv: 42
            })
        ).rejects.toThrow(/iv 必须是字符串/)
        expect(CryptoEncrypt).not.toHaveBeenCalled()
    })

    it('加密数据合法时透传（含可选字段）', async () => {
        const payload = {
            algorithm: 'aes-256-cbc',
            context: 'hello',
            secretKey: 'k',
            iv: 'v'
        }
        await expect(
            listenerOf(IPC.PLUGIN.CRYPTO_ENCRYPT).listener(trustedEvent, payload)
        ).resolves.toEqual({ result: 'encrypted' })
        expect(CryptoEncrypt).toHaveBeenCalledWith(payload)
    })
})

describe('system-ipc：版本信息读取', () => {
    beforeEach(() => {
        registerSystemIpc('global-utils-ipc')
    })

    it('version.json 缺 electron/chrome/node 字段时用 process.versions 补齐', async () => {
        const configDir = path.join(appPaths.resources, 'config')
        fs.mkdirSync(configDir, { recursive: true })
        fs.writeFileSync(
            path.join(configDir, 'version.json'),
            JSON.stringify({ appVersion: '1.4.0', vueVersion: '3' }),
            'utf-8'
        )
        const info = (await listenerOf(IPC.SYSTEM.APP_VERSION).listener(trustedEvent)) as {
            appVersion: string
            electronVersion: string
            chromeVersion: string
            nodeVersion: string
        }
        expect(info.appVersion).toBe('1.4.0')
        expect(info.electronVersion).toBe(process.versions.electron || '')
        expect(info.chromeVersion).toBe(process.versions.chrome || '')
        expect(info.nodeVersion).toBe(process.versions.node || '')
    })

    it('version.json 损坏时回退空版本结构并记日志', async () => {
        const configDir = path.join(appPaths.resources, 'config')
        fs.mkdirSync(configDir, { recursive: true })
        fs.writeFileSync(path.join(configDir, 'version.json'), '{broken', 'utf-8')
        const info = (await listenerOf(IPC.SYSTEM.APP_VERSION).listener(trustedEvent)) as {
            appVersion: string
            nodeVersion: string
        }
        expect(info.appVersion).toBe('')
        expect(info.nodeVersion).toBe(process.versions.node || '')
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('读取版本配置文件失败'),
            expect.any(Error)
        )
    })
})
