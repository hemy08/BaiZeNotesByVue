/**
 * utils.ts（MainWindowListenUtilsEvent）单元测试
 * 覆盖：IPC 通道注册、hash/hmac/crypto 工具通道、主题与快速链接查询通道、
 * navi-tab-open-exe 安全三重校验（发送方/路径/受信目录）、
 * 文件内容更新、版本信息读取、文件检查与外部链接
 * （P2：THEME.GET_CURRENT_THEME / GET_SEPARATE_EDITOR_THEME / GET_MONACO_THEME /
 * NAVIGATION.KEYDOWN 四个死通道已删除，对应用例同步移除）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { pathToFileURL } from 'url'
import { appState } from '../../src/main/utils/app-state'

// CMP-30：安全确认框与状态栏提示经 tMain 读取词典（语言来自系统设置）。
// 测试固定中文词条并 mock 掉 config/system-setting，隔离 electron-store 等主进程存储依赖链。
vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

const electronState = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        paths: {
            home: `${base}/baize-vitest-utils/home`,
            exe: `${base}/baize-vitest-utils/app.exe`
        } as Record<string, string>,
        packaged: false,
        appPath: `${base}/baize-vitest-utils/app`
    }
})

const ipcMocks = vi.hoisted(() => ({
    // 测试侧以 unknown 参数调用真实 handler（生产端 listener 形参为 never[]，
    // 存入 Map 时在下方 mock 实现里做一次断言收口），否则所有调用点都会报 never 参数错误。
    on: new Map<string, (...args: unknown[]) => unknown>(),
    handle: new Map<string, (...args: unknown[]) => unknown>(),
    shellOpenPath: vi.fn(),
    shellOpenExternal: vi.fn(),
    dialogShowMessageBox: vi.fn()
}))

vi.mock('electron', () => ({
    ipcMain: {
        on: vi.fn((channel: string, fn: (...args: never[]) => unknown) => {
            ipcMocks.on.set(channel, fn as unknown as (...args: unknown[]) => unknown)
        }),
        handle: vi.fn((channel: string, fn: (...args: never[]) => unknown) => {
            ipcMocks.handle.set(channel, fn as unknown as (...args: unknown[]) => unknown)
        })
    },
    shell: {
        openPath: ipcMocks.shellOpenPath,
        openExternal: ipcMocks.shellOpenExternal
    },
    dialog: {
        showMessageBox: ipcMocks.dialogShowMessageBox
    },
    app: {
        getPath: vi.fn((name: string) => electronState.paths[name]),
        getAppPath: vi.fn(() => electronState.appPath),
        get isPackaged() {
            return electronState.packaged
        }
    },
    BrowserWindow: class {}
}))

const fileUtilsMocks = vi.hoisted(() => ({
    OpenSelectFile: vi.fn(async () => {}),
    SaveActiveFile: vi.fn(async () => {}),
    SaveActiveFileAs: vi.fn(async () => {}),
    ReloadDirFromDisk: vi.fn(async () => {}),
    InsertImagesToFile: vi.fn(async () => 'img-1.png'),
    CopyRelativePath: vi.fn(),
    CopyImageLink: vi.fn(),
    CopyFileLink: vi.fn(),
    FileManagerContextMenuCopy: vi.fn(),
    FileManagerContextMenuCut: vi.fn(),
    FileManagerContextMenuPaste: vi.fn(),
    OpenFolderExplorer: vi.fn()
}))

vi.mock('../../src/main/utils/file-utils/index', () => fileUtilsMocks)

const configMocks = vi.hoisted(() => ({
    getQuickLinks: vi.fn(),
    getCurrentThemeStyles: vi.fn(),
    getAllThemes: vi.fn(),
    getAllMonacoThemes: vi.fn(),
    getThemeStylesByType: vi.fn()
}))

vi.mock('../../src/main/config/quick-link-config', () => ({
    getQuickLinks: configMocks.getQuickLinks
}))

vi.mock('../../src/main/config', () => ({
    getCurrentThemeStyles: configMocks.getCurrentThemeStyles,
    getAllThemes: configMocks.getAllThemes,
    getAllMonacoThemes: configMocks.getAllMonacoThemes,
    getThemeStylesByType: configMocks.getThemeStylesByType
}))

import {
    MainWindowListenUtilsEvent,
    sanitizeRsaBits,
    getExecutableExtensionDecision
} from '../../src/main/utils/utils'

// 受信目录（安全用例）与普通目录（非受信用例）
const TRUSTED_DIR = path.join(os.tmpdir(), 'baize-vitest-utils-trusted')
const UNTRUSTED_DIR = path.join(os.tmpdir(), 'baize-vitest-utils-untrusted')
const ENV_KEYS = ['ProgramFiles', 'ProgramFiles(x86)', 'ProgramW6432', 'SystemRoot', 'LOCALAPPDATA']

const originalEnv: Record<string, string | undefined> = {}

function makeMainWindow() {
    return {
        webContents: { send: vi.fn() },
        // CQ-05：异常兜底会先判断窗口是否销毁，mock 需提供 isDestroyed
        isDestroyed: vi.fn(() => false)
    }
}

function makeEvent(sender: unknown) {
    return { sender, returnValue: undefined }
}

describe('MainWindowListenUtilsEvent', () => {
    let mainWindow: ReturnType<typeof makeMainWindow>

    beforeEach(() => {
        ipcMocks.on.clear()
        ipcMocks.handle.clear()
        ipcMocks.shellOpenPath.mockReset()
        ipcMocks.shellOpenExternal.mockReset()
        ipcMocks.dialogShowMessageBox.mockReset()
        ipcMocks.dialogShowMessageBox.mockResolvedValue({ response: 1 })
        for (const fn of Object.values(fileUtilsMocks)) fn.mockClear()
        for (const fn of Object.values(configMocks)) fn.mockClear()
        appState._resetForTesting()

        // 环境变量：全部指向受信目录
        for (const key of ENV_KEYS) {
            originalEnv[key] = process.env[key]
            process.env[key] = TRUSTED_DIR
        }

        fs.rmSync(TRUSTED_DIR, { recursive: true, force: true })
        fs.rmSync(UNTRUSTED_DIR, { recursive: true, force: true })
        fs.rmSync(electronState.appPath, { recursive: true, force: true })
        fs.mkdirSync(TRUSTED_DIR, { recursive: true })
        fs.mkdirSync(UNTRUSTED_DIR, { recursive: true })

        mainWindow = makeMainWindow()
        MainWindowListenUtilsEvent(mainWindow as never)
    })

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (originalEnv[key] === undefined) delete process.env[key]
            else process.env[key] = originalEnv[key]
        }
        appState._resetForTesting()
    })

    describe('channel registration', () => {
        it('should register the expected ipcMain.on channels', () => {
            for (const channel of [
                'baize:file:open-select-file',
                // PF-02：pre-render/post-render 主进程渲染通道已移除（预览改为渲染层单跳链路）
                'baize:fs:copy-relative-path',
                'baize:fs:copy-image-link',
                'baize:fs:copy-file-link',
                'baize:fs:copy-file',
                'baize:fs:cut',
                'baize:fs:paste',
                'baize:fs:open-in-explorer',
                'baize:fs:reload-from-disk',
                'baize:render:insert-image',
                'baize:plugin:rsa-generate',
                // CQ-10/PF-11/ARC-21：hash/hmac/crypto 四通道已由 sendSync 改 handle，不在此列表
                'baize:navigation:open-exe',
                'baize:file:update-content',
                'baize:file:save-content-to-disk',
                'baize:system:open-external-link'
            ]) {
                expect(ipcMocks.on.has(channel), channel).toBe(true)
            }
        })

        it('should register the expected ipcMain.handle channels', () => {
            for (const channel of [
                'baize:quick-links:get',
                'baize:theme:get-current-styles',
                'baize:theme:get-all',
                'baize:theme:get-all-monaco',
                // CQ-10/PF-11/ARC-21：加密工具四通道由 on + event.returnValue 改为 handle
                'baize:plugin:hash-text',
                'baize:plugin:hmac-text',
                'baize:plugin:crypto-encrypt',
                'baize:plugin:crypto-decrypt',
                'baize:file:read-html',
                'baize:file:check-exists',
                'baize:system:app-version',
                // FUN-02：编码菜单 handler（重新打开 / 转码保存）
                'baize:file:reopen-with-encoding',
                'baize:file:convert-encoding'
            ]) {
                expect(ipcMocks.handle.has(channel), channel).toBe(true)
            }
        })
    })

    describe('plugin tool channels', () => {
        // CQ-10/PF-11/ARC-21：四个加密工具通道改为 invoke/handle 异步应答
        // AS-6：通道补发送方校验，事件桩需携带受信主窗口 webContents
        function trustedEvent() {
            return makeEvent(mainWindow.webContents)
        }

        it('should compute hashes through the hash handle channel', async () => {
            const result = (await ipcMocks.handle.get('baize:plugin:hash-text')!(
                trustedEvent(),
                'hello',
                'hex'
            )) as Record<string, string>
            expect(result.MD5).toBe('5d41402abc4b2a76b9719d911017c592')
        })

        it('should compute HMAC through the hmac handle channel', async () => {
            const result = (await ipcMocks.handle.get('baize:plugin:hmac-text')!(
                trustedEvent(),
                'The quick brown fox jumps over the lazy dog',
                'key',
                'hex'
            )) as Record<string, string>
            expect(result.SHA256).toBe(
                'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'
            )
        })

        it('should roundtrip encryption through the encrypt/decrypt handle channels', async () => {
            const encrypted = (await ipcMocks.handle.get('baize:plugin:crypto-encrypt')!(
                trustedEvent(),
                {
                    context: 'ipc secret',
                    algorithm: 'aes-256-cbc',
                    secretKey: '00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff',
                    secretKeyEncoding: 'hex'
                }
            )) as { context: string; secretKey: string; secretKeyEncoding: string; iv: string }

            const decrypted = await ipcMocks.handle.get('baize:plugin:crypto-decrypt')!(
                trustedEvent(),
                {
                    context: encrypted.context,
                    algorithm: 'aes-256-cbc',
                    secretKey: encrypted.secretKey,
                    secretKeyEncoding: encrypted.secretKeyEncoding,
                    iv: encrypted.iv
                }
            )
            expect(decrypted).toBe('ipc secret')
        })

        it('should reject and log when the decrypt handler throws (CQ-05)', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
            await expect(
                ipcMocks.handle.get('baize:plugin:crypto-decrypt')!(trustedEvent(), {
                    context: 'not-a-cipher-text',
                    algorithm: 'aes-256-cbc',
                    secretKey: '00'.repeat(32),
                    secretKeyEncoding: 'hex',
                    iv: '00'.repeat(16)
                })
            ).rejects.toThrow()
            expect(consoleError).toHaveBeenCalled()
            consoleError.mockRestore()
        })

        // AS-6：插件/加密通道的 sender 校验与入参类型校验
        it('should reject untrusted senders on plugin/encryption channels (AS-6)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const foreign = makeEvent({ id: 999 })
            const hashResult = await ipcMocks.handle.get('baize:plugin:hash-text')!(
                foreign,
                'hello',
                'hex'
            )
            const cryptoResult = await ipcMocks.handle.get('baize:plugin:crypto-encrypt')!(
                foreign,
                { context: 'x', algorithm: 'aes-256-cbc' }
            )
            expect(hashResult).toEqual(
                expect.objectContaining({ ok: false, code: 'untrusted-sender' })
            )
            expect(cryptoResult).toEqual(
                expect.objectContaining({ ok: false, code: 'untrusted-sender' })
            )
            // send 通道：拒绝后不产生 RSA_RESULT
            await ipcMocks.on.get('baize:plugin:rsa-generate')!(foreign, 2048)
            expect(mainWindow.webContents.send).not.toHaveBeenCalledWith(
                'baize:plugin:rsa-result',
                expect.anything(),
                expect.anything()
            )
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should reject non-string payloads on hash/hmac channels (AS-6)', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
            await expect(
                ipcMocks.handle.get('baize:plugin:hash-text')!(
                    makeEvent(mainWindow.webContents),
                    { evil: true },
                    'hex'
                )
            ).rejects.toThrow(TypeError)
            await expect(
                ipcMocks.handle.get('baize:plugin:hmac-text')!(
                    makeEvent(mainWindow.webContents),
                    'hello',
                    { evil: true },
                    'hex'
                )
            ).rejects.toThrow(TypeError)
            consoleError.mockRestore()
        })

        it('should normalize RSA bits into the whitelist (AS-6)', () => {
            // 合法档位原样返回
            for (const bits of [1024, 2048, 3072, 4096]) {
                expect(sanitizeRsaBits(bits)).toBe(bits)
            }
            // 缺失/非整数/白名单外/超大值一律回退 2048（防 CPU/内存耗尽）
            for (const bits of [
                undefined,
                null,
                '2048',
                512,
                2049,
                1e6,
                1e9,
                Number.NaN,
                Number.POSITIVE_INFINITY,
                2048.5
            ]) {
                expect(sanitizeRsaBits(bits)).toBe(2048)
            }
        })
    })

    describe('async IPC error fallback (CQ-05)', () => {
        it('should log and notify the status bar when reload-from-disk fails', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
            fileUtilsMocks.ReloadDirFromDisk.mockRejectedValueOnce(new Error('reload failed'))
            await ipcMocks.on.get('baize:fs:reload-from-disk')!(makeEvent(mainWindow.webContents))
            expect(consoleError).toHaveBeenCalled()
            expect(mainWindow.webContents.send).toHaveBeenCalledWith('baize:status-bar:update', {
                message: expect.stringContaining('reload failed'),
                type: 'error'
            })
            consoleError.mockRestore()
        })

        it('should log and notify the status bar when open-external-link fails', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            ipcMocks.shellOpenExternal.mockRejectedValueOnce(new Error('no browser'))
            await ipcMocks.on.get('baize:system:open-external-link')!(
                makeEvent(mainWindow.webContents),
                'https://example.com/'
            )
            // P0 安全：协议白名单封装内部已 console.warn 记录具体失败原因
            expect(consoleWarn).toHaveBeenCalled()
            expect(consoleError).toHaveBeenCalled()
            // 状态栏提示沿用 CQ-05：openExternalSafely 返回 false 后按失败处理
            expect(mainWindow.webContents.send).toHaveBeenCalledWith('baize:status-bar:update', {
                message: expect.stringContaining('https://example.com/'),
                type: 'error'
            })
            consoleError.mockRestore()
            consoleWarn.mockRestore()
        })

        it('should log and notify the status bar when save-file-content-to-disk fails', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
            appState.currentActiveFile = {
                name: 'a.md',
                path: '/tmp/a.md',
                type: 'file',
                content: 'old'
            } as never
            fileUtilsMocks.SaveActiveFile.mockRejectedValueOnce(new Error('disk full'))
            await ipcMocks.on.get('baize:file:save-content-to-disk')!(
                makeEvent(mainWindow.webContents),
                'content'
            )
            expect(consoleError).toHaveBeenCalled()
            expect(mainWindow.webContents.send).toHaveBeenCalledWith('baize:status-bar:update', {
                message: expect.stringContaining('disk full'),
                type: 'error'
            })
            consoleError.mockRestore()
        })
    })

    describe('open local html in browser (遗留清单 #1)', () => {
        function trustedEvent() {
            return makeEvent(mainWindow.webContents)
        }

        function inTempDir(fileName: string, content = '<html></html>'): string {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-open-browser-'))
            const file = path.join(dir, fileName)
            fs.writeFileSync(file, content)
            return file
        }

        it('should open a trusted local html file through shell.openExternal', async () => {
            const htmlFile = inTempDir('report.html')
            try {
                ipcMocks.shellOpenExternal.mockResolvedValueOnce(undefined)
                const handler = ipcMocks.on.get('baize:file:open-in-browser')!
                await handler(trustedEvent(), htmlFile)
                expect(ipcMocks.shellOpenExternal).toHaveBeenCalledTimes(1)
                expect(ipcMocks.shellOpenExternal).toHaveBeenCalledWith(
                    pathToFileURL(htmlFile).href
                )
            } finally {
                fs.rmSync(path.dirname(htmlFile), { recursive: true, force: true })
            }
        })

        it('should reject non-html files', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const txtFile = inTempDir('notes.txt', 'plain')
            try {
                const handler = ipcMocks.on.get('baize:file:open-in-browser')!
                await handler(trustedEvent(), txtFile)
                expect(ipcMocks.shellOpenExternal).not.toHaveBeenCalled()
                expect(consoleWarn).toHaveBeenCalled()
            } finally {
                consoleWarn.mockRestore()
                fs.rmSync(path.dirname(txtFile), { recursive: true, force: true })
            }
        })

        it('should reject paths outside trusted roots (path guard)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            // 规范化后逃逸出受信根（os.tmpdir 的父目录）的路径
            const escaped = path.join(os.tmpdir(), '..', 'baize-escape.html')
            try {
                const handler = ipcMocks.on.get('baize:file:open-in-browser')!
                await handler(trustedEvent(), escaped)
                expect(ipcMocks.shellOpenExternal).not.toHaveBeenCalled()
            } finally {
                consoleWarn.mockRestore()
            }
        })

        it('should ignore empty payloads', async () => {
            const handler = ipcMocks.on.get('baize:file:open-in-browser')!
            await handler(trustedEvent(), '')
            await handler(trustedEvent(), undefined)
            expect(ipcMocks.shellOpenExternal).not.toHaveBeenCalled()
        })
    })

    describe('read binary file (遗留清单 #9: PDF 预览)', () => {
        function trustedEvent() {
            return makeEvent(mainWindow.webContents)
        }

        function inTempDir(
            fileName: string,
            content: string | Buffer = ''
        ): {
            dir: string
            file: string
        } {
            const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-read-binary-'))
            const file = path.join(dir, fileName)
            fs.writeFileSync(file, content)
            return { dir, file }
        }

        it('should read a trusted pdf file as Uint8Array (Buffer is a Uint8Array subclass)', async () => {
            // %PDF 魔数
            const { dir, file: pdfFile } = inTempDir(
                'sample.pdf',
                Buffer.from([0x25, 0x50, 0x44, 0x46])
            )
            try {
                const handler = ipcMocks.handle.get('baize:file:read-binary')!
                const result = (await handler(trustedEvent(), pdfFile)) as Uint8Array
                expect(result).toBeInstanceOf(Uint8Array)
                // 不再做 new Uint8Array(buffer) 拷贝：主进程直接返回 Buffer
                expect(Buffer.isBuffer(result)).toBe(true)
                expect(Array.from(result)).toEqual([0x25, 0x50, 0x44, 0x46])
            } finally {
                fs.rmSync(dir, { recursive: true, force: true })
            }
        })

        it('should reject paths outside trusted roots (path guard)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            try {
                const handler = ipcMocks.handle.get('baize:file:read-binary')!
                await expect(
                    handler(trustedEvent(), path.join(os.tmpdir(), '..', 'baize-escape.pdf'))
                ).rejects.toThrow()
            } finally {
                consoleWarn.mockRestore()
            }
        })

        it('should reject empty path payloads', async () => {
            const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
            try {
                const handler = ipcMocks.handle.get('baize:file:read-binary')!
                await expect(handler(trustedEvent(), '')).rejects.toThrow()
            } finally {
                consoleError.mockRestore()
            }
        })

        it('should reject non-pdf files (extension guard)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const { dir, file: txtFile } = inTempDir('notes.txt', 'plain text')
            try {
                const handler = ipcMocks.handle.get('baize:file:read-binary')!
                await expect(handler(trustedEvent(), txtFile)).rejects.toThrow()
                // 非 PDF 扩展名在读取前即被拒绝，并有安全告警日志
                expect(consoleWarn).toHaveBeenCalled()
                expect(fs.readFileSync(txtFile, 'utf-8')).toBe('plain text')
            } finally {
                consoleWarn.mockRestore()
                fs.rmSync(dir, { recursive: true, force: true })
            }
        })

        it('should reject pdf files larger than the 128MB limit', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const { dir, file: bigPdfFile } = inTempDir('big.pdf', '%PDF')
            // 不实际写入 128MB：按现有临时目录模式造文件，仅 mock stat 返回超限大小
            const statSpy = vi.spyOn(fs.promises, 'stat').mockResolvedValue({
                size: 129 * 1024 * 1024
            } as unknown as fs.Stats)
            try {
                const handler = ipcMocks.handle.get('baize:file:read-binary')!
                await expect(handler(trustedEvent(), bigPdfFile)).rejects.toThrow(/文件过大/)
                expect(consoleWarn).toHaveBeenCalled()
            } finally {
                statSpy.mockRestore()
                consoleWarn.mockRestore()
                fs.rmSync(dir, { recursive: true, force: true })
            }
        })
    })

    describe('theme and quick-link query channels', () => {
        function trustedEvent() {
            return makeEvent(mainWindow.webContents)
        }

        it('should return styles for a requested theme type', () => {
            configMocks.getThemeStylesByType.mockReturnValue({ name: 'x-theme' })
            const handler = ipcMocks.handle.get('baize:theme:get-current-styles')!
            expect(handler(trustedEvent(), 'warm')).toEqual({ name: 'x-theme' })
            expect(configMocks.getThemeStylesByType).toHaveBeenCalledWith('warm')
        })

        it('should return current theme styles without a type', () => {
            configMocks.getCurrentThemeStyles.mockReturnValue({ name: 'cur-theme' })
            const handler = ipcMocks.handle.get('baize:theme:get-current-styles')!
            expect(handler(trustedEvent(), undefined)).toEqual({ name: 'cur-theme' })
        })

        it('should return all themes', () => {
            configMocks.getAllThemes.mockReturnValue([{ type: 'baize', styles: {} }])
            expect(ipcMocks.handle.get('baize:theme:get-all')!(trustedEvent())).toEqual([
                { type: 'baize', styles: {} }
            ])
        })

        it('should return all monaco themes', () => {
            configMocks.getAllMonacoThemes.mockReturnValue([{ type: 'vs', config: {} }])
            expect(ipcMocks.handle.get('baize:theme:get-all-monaco')!(trustedEvent())).toEqual([
                { type: 'vs', config: {} }
            ])
        })

        it('should return quick links', () => {
            const links = [{ id: 'a' }]
            configMocks.getQuickLinks.mockReturnValue(links)
            expect(ipcMocks.handle.get('baize:quick-links:get')!(trustedEvent())).toBe(links)
        })

        // AS-6：主题/快速链接查询通道补 sender 校验
        it('should reject untrusted senders on theme/quick-link query channels (AS-6)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const foreign = makeEvent({ id: 999 })
            const themeResult = await ipcMocks.handle.get('baize:theme:get-all')!(foreign)
            const allThemesResult = await ipcMocks.handle.get('baize:theme:get-all-monaco')!(
                foreign
            )
            const linksResult = await ipcMocks.handle.get('baize:quick-links:get')!(foreign)
            for (const result of [themeResult, allThemesResult, linksResult]) {
                expect(result).toEqual(
                    expect.objectContaining({ ok: false, code: 'untrusted-sender' })
                )
            }
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })
    })

    describe('navi-tab-open-exe security checks', () => {
        function trustedExe() {
            const exe = path.join(TRUSTED_DIR, 'prog.exe')
            fs.writeFileSync(exe, 'fake-exe', 'utf-8')
            return exe
        }

        function untrustedExe() {
            const exe = path.join(UNTRUSTED_DIR, 'prog.exe')
            fs.writeFileSync(exe, 'fake-exe', 'utf-8')
            return exe
        }

        it('should reject senders that are not the main window', async () => {
            const handler = ipcMocks.on.get('baize:navigation:open-exe')!
            await handler(makeEvent({ notMainWindow: true }), trustedExe())
            expect(ipcMocks.shellOpenPath).not.toHaveBeenCalled()
            expect(ipcMocks.dialogShowMessageBox).not.toHaveBeenCalled()
        })

        it('should reject non-string paths', async () => {
            const handler = ipcMocks.on.get('baize:navigation:open-exe')!
            await handler(makeEvent(mainWindow.webContents), 12345)
            expect(ipcMocks.shellOpenPath).not.toHaveBeenCalled()
        })

        it('should reject relative paths', async () => {
            const handler = ipcMocks.on.get('baize:navigation:open-exe')!
            await handler(makeEvent(mainWindow.webContents), 'relative/prog.exe')
            expect(ipcMocks.shellOpenPath).not.toHaveBeenCalled()
            expect(ipcMocks.dialogShowMessageBox).not.toHaveBeenCalled()
        })

        it('should reject non-existent absolute paths', async () => {
            const handler = ipcMocks.on.get('baize:navigation:open-exe')!
            const missing = path.join(TRUSTED_DIR, 'missing.exe')
            await handler(makeEvent(mainWindow.webContents), missing)
            expect(ipcMocks.shellOpenPath).not.toHaveBeenCalled()
            expect(ipcMocks.dialogShowMessageBox).not.toHaveBeenCalled()
        })

        it('should open trusted executables without confirmation', async () => {
            const handler = ipcMocks.on.get('baize:navigation:open-exe')!
            const exe = trustedExe()
            await handler(makeEvent(mainWindow.webContents), exe)
            expect(ipcMocks.shellOpenPath).toHaveBeenCalledWith(exe)
            expect(ipcMocks.dialogShowMessageBox).not.toHaveBeenCalled()
        })

        it('should ask for confirmation for untrusted executables and open on confirm', async () => {
            const handler = ipcMocks.on.get('baize:navigation:open-exe')!
            const exe = untrustedExe()
            ipcMocks.dialogShowMessageBox.mockResolvedValue({ response: 1 })
            await handler(makeEvent(mainWindow.webContents), exe)
            expect(ipcMocks.dialogShowMessageBox).toHaveBeenCalledTimes(1)
            expect(ipcMocks.dialogShowMessageBox.mock.calls[0][0]).toBe(mainWindow)
            expect(ipcMocks.dialogShowMessageBox.mock.calls[0][1].buttons).toEqual([
                '取消',
                '确认打开'
            ])
            expect(ipcMocks.shellOpenPath).toHaveBeenCalledWith(exe)
        })

        it('should not open untrusted executables when the user cancels', async () => {
            const handler = ipcMocks.on.get('baize:navigation:open-exe')!
            const exe = untrustedExe()
            ipcMocks.dialogShowMessageBox.mockResolvedValue({ response: 0 })
            await handler(makeEvent(mainWindow.webContents), exe)
            expect(ipcMocks.dialogShowMessageBox).toHaveBeenCalledTimes(1)
            expect(ipcMocks.shellOpenPath).not.toHaveBeenCalled()
        })

        // ============ AS-7：受信目录收紧 + 扩展名白名单 ============

        it('should require confirmation for executables in the user-writable LOCALAPPDATA\\Programs (AS-7)', async () => {
            const userPrograms = path.join(TRUSTED_DIR, 'Programs')
            fs.mkdirSync(userPrograms, { recursive: true })
            const exe = path.join(userPrograms, 'prog.exe')
            fs.writeFileSync(exe, 'fake-exe', 'utf-8')
            ipcMocks.dialogShowMessageBox.mockResolvedValue({ response: 1 })

            await ipcMocks.on.get('baize:navigation:open-exe')!(
                makeEvent(mainWindow.webContents),
                exe
            )

            // 用户可写目录不再免确认，但用户确认后仍可打开（保留快速链接功能）
            expect(ipcMocks.dialogShowMessageBox).toHaveBeenCalledTimes(1)
            expect(ipcMocks.shellOpenPath).toHaveBeenCalledWith(exe)
        })

        it('should require confirmation for script/shortcut extensions even in trusted dirs (AS-7)', async () => {
            for (const extension of ['.bat', '.cmd', '.lnk', '.ps1', '.vbs', '.msi']) {
                ipcMocks.dialogShowMessageBox.mockClear()
                ipcMocks.shellOpenPath.mockClear()
                ipcMocks.dialogShowMessageBox.mockResolvedValue({ response: 1 })
                const scriptPath = path.join(TRUSTED_DIR, `tool${extension}`)
                fs.writeFileSync(scriptPath, 'fake-script', 'utf-8')

                await ipcMocks.on.get('baize:navigation:open-exe')!(
                    makeEvent(mainWindow.webContents),
                    scriptPath
                )

                expect(ipcMocks.dialogShowMessageBox, extension).toHaveBeenCalledTimes(1)
                expect(ipcMocks.shellOpenPath, extension).toHaveBeenCalledWith(scriptPath)
            }
        })

        it('should reject extensions outside the executable whitelist (AS-7)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            for (const fileName of ['readme.txt', 'script.py', 'data.json', 'page.html']) {
                const target = path.join(TRUSTED_DIR, fileName)
                fs.writeFileSync(target, 'x', 'utf-8')
                await ipcMocks.on.get('baize:navigation:open-exe')!(
                    makeEvent(mainWindow.webContents),
                    target
                )
            }
            expect(ipcMocks.dialogShowMessageBox).not.toHaveBeenCalled()
            expect(ipcMocks.shellOpenPath).not.toHaveBeenCalled()
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should reject directories and non-files even with a whitelisted extension (AS-7)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const directory = path.join(TRUSTED_DIR, 'folder.exe')
            fs.mkdirSync(directory, { recursive: true })

            await ipcMocks.on.get('baize:navigation:open-exe')!(
                makeEvent(mainWindow.webContents),
                directory
            )

            expect(ipcMocks.dialogShowMessageBox).not.toHaveBeenCalled()
            expect(ipcMocks.shellOpenPath).not.toHaveBeenCalled()
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })
    })

    // AS-7：扩展名白名单纯函数矩阵
    describe('getExecutableExtensionDecision (AS-7)', () => {
        it('should allow .exe/.com for direct execution', () => {
            for (const file of ['a.exe', 'A.EXE', 'b.com', 'C:\\Program Files\\x\\run.exe']) {
                expect(getExecutableExtensionDecision(file), file).toBe('direct')
            }
        })

        it('should require confirmation for script/shortcut/installer extensions', () => {
            for (const extension of [
                '.bat',
                '.cmd',
                '.lnk',
                '.msi',
                '.ps1',
                '.vbs',
                '.js',
                '.jse',
                '.wsf',
                '.wsh',
                '.hta'
            ]) {
                expect(getExecutableExtensionDecision(`a${extension}`), extension).toBe('confirm')
            }
        })

        it('should reject non-executable / unknown / invalid inputs', () => {
            for (const input of ['a.txt', 'a.py', 'a.md', 'a', '', '   ', null, 42, {}]) {
                expect(getExecutableExtensionDecision(input), String(input)).toBe('reject')
            }
        })
    })

    describe('file and editor channels', () => {
        it('should call OpenSelectFile for the open-select-file channel', async () => {
            const message = { name: 'a.md', path: '/tmp/a.md', type: 'file', content: '' }
            await ipcMocks.on.get('baize:file:open-select-file')!(
                makeEvent(mainWindow.webContents),
                message
            )
            expect(fileUtilsMocks.OpenSelectFile).toHaveBeenCalledWith(message)
        })

        it('should insert an image and send the markdown template', async () => {
            const event = makeEvent(mainWindow.webContents)
            await ipcMocks.on.get('baize:render:insert-image')!(event, 'ctx')
            expect(fileUtilsMocks.InsertImagesToFile).toHaveBeenCalledWith('ctx')
            expect(mainWindow.webContents.send).toHaveBeenCalledWith(
                'baize:monaco:insert-text-block',
                '\r\n\r\n![](./images/img-1.png)\r\n\r\n'
            )
        })

        it('should ignore saves without an active file and hint once via the status bar', async () => {
            const handler = ipcMocks.on.get('baize:file:update-content')!
            await handler(makeEvent(mainWindow.webContents), 'new content')
            expect(fileUtilsMocks.SaveActiveFileAs).not.toHaveBeenCalled()
            expect(mainWindow.webContents.send).toHaveBeenCalledWith('baize:status-bar:update', {
                message: '当前没有活动文件，内容暂未保存',
                type: 'warning'
            })

            // 再次输入：仅提示一次，不重复向状态栏发送
            await handler(makeEvent(mainWindow.webContents), 'more content')
            expect(mainWindow.webContents.send).toHaveBeenCalledTimes(1)
        })

        it('should update the active file content directly', async () => {
            appState.currentActiveFile = {
                name: 'a.md',
                path: '/tmp/a.md',
                type: 'file',
                content: 'old'
            } as never
            await ipcMocks.on.get('baize:file:update-content')!(
                makeEvent(mainWindow.webContents),
                'new content'
            )
            expect((appState.currentActiveFile as { content: string }).content).toBe('new content')
            expect(fileUtilsMocks.SaveActiveFileAs).not.toHaveBeenCalled()
        })

        it('should update content and save through the save-file-content channel', async () => {
            appState.currentActiveFile = {
                name: 'a.md',
                path: '/tmp/a.md',
                type: 'file',
                content: 'old'
            } as never
            await ipcMocks.on.get('baize:file:save-content-to-disk')!(
                makeEvent(mainWindow.webContents),
                'saved content'
            )
            expect((appState.currentActiveFile as { content: string }).content).toBe(
                'saved content'
            )
            expect(fileUtilsMocks.SaveActiveFile).toHaveBeenCalledTimes(1)
        })

        it('should do nothing on save-file-content without an active file', async () => {
            await ipcMocks.on.get('baize:file:save-content-to-disk')!(
                makeEvent(mainWindow.webContents),
                'x'
            )
            expect(fileUtilsMocks.SaveActiveFile).not.toHaveBeenCalled()
        })

        // P1/N-05：非主窗口 sender 的文件系统类 send 通道直接拒绝（不执行业务）
        it('should reject untrusted senders on file-system send channels', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const foreignEvent = makeEvent({ id: 999 })
            await ipcMocks.on.get('baize:file:save-content-to-disk')!(foreignEvent, 'hacked')
            await ipcMocks.on.get('baize:fs:paste')!(foreignEvent, '/tmp/a.md', true)
            await ipcMocks.on.get('baize:render:insert-image')!(foreignEvent, 'ctx')
            await ipcMocks.on.get('baize:file:open-select-file')!(foreignEvent, {
                name: 'a.md',
                path: '/tmp/a.md',
                type: 'file',
                content: ''
            } as never)
            expect(fileUtilsMocks.SaveActiveFile).not.toHaveBeenCalled()
            expect(fileUtilsMocks.FileManagerContextMenuPaste).not.toHaveBeenCalled()
            expect(fileUtilsMocks.InsertImagesToFile).not.toHaveBeenCalled()
            expect(fileUtilsMocks.OpenSelectFile).not.toHaveBeenCalled()
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should reject untrusted senders on external link channel', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            await ipcMocks.on.get('baize:system:open-external-link')!(
                makeEvent({ id: 999 }),
                'https://example.com/'
            )
            expect(ipcMocks.shellOpenExternal).not.toHaveBeenCalled()
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })
    })

    describe('fs and external channels', () => {
        it('should read an html file and return its content', async () => {
            const htmlFile = path.join(UNTRUSTED_DIR, 'page.html')
            fs.writeFileSync(htmlFile, '<html>白泽</html>', 'utf-8')
            const content = await ipcMocks.handle.get('baize:file:read-html')!(
                makeEvent(mainWindow.webContents),
                htmlFile
            )
            expect(content).toBe('<html>白泽</html>')
        })

        it('should report whether a file exists', async () => {
            const file = path.join(UNTRUSTED_DIR, 'exists.txt')
            fs.writeFileSync(file, 'x', 'utf-8')
            expect(
                await ipcMocks.handle.get('baize:file:check-exists')!(
                    makeEvent(mainWindow.webContents),
                    file
                )
            ).toBe(true)
            expect(
                await ipcMocks.handle.get('baize:file:check-exists')!(
                    makeEvent(mainWindow.webContents),
                    path.join(UNTRUSTED_DIR, 'ghost.txt')
                )
            ).toBe(false)
        })

        // P1-AS-1：文件读取/存在性探测只允许受信范围（工作区/临时目录/用户选择过的路径）
        it('should reject reading an out-of-scope html path (P1-AS-1)', async () => {
            const outsidePath =
                process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd'

            await expect(
                ipcMocks.handle.get('baize:file:read-html')!(
                    makeEvent(mainWindow.webContents),
                    outsidePath
                )
            ).rejects.toThrow('没有读取权限')
            expect(mainWindow.webContents.send).toHaveBeenCalledWith(
                'baize:status-bar:update',
                expect.objectContaining({ type: 'error' })
            )
        })

        it('should not probe existence for an out-of-scope path (P1-AS-1)', async () => {
            const outsidePath =
                process.platform === 'win32' ? 'C:\\Windows\\win.ini' : '/etc/passwd'

            const exists = await ipcMocks.handle.get('baize:file:check-exists')!(
                makeEvent(mainWindow.webContents),
                outsidePath
            )

            expect(exists).toBe(false)
        })

        // P1/N-05：handle 通道非法 sender 返回统一错误对象，且不执行文件读取/探测
        it('should reject untrusted senders on file-system handle channels', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const foreignEvent = makeEvent({ id: 999 })
            const readResult = await ipcMocks.handle.get('baize:file:read-html')!(
                foreignEvent,
                path.join(UNTRUSTED_DIR, 'page.html')
            )
            const existsResult = await ipcMocks.handle.get('baize:file:check-exists')!(
                foreignEvent,
                path.join(UNTRUSTED_DIR, 'exists.txt')
            )
            expect(readResult).toEqual(
                expect.objectContaining({ ok: false, code: 'untrusted-sender' })
            )
            expect(existsResult).toEqual(
                expect.objectContaining({ ok: false, code: 'untrusted-sender' })
            )
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should open external links', async () => {
            await ipcMocks.on.get('baize:system:open-external-link')!(
                makeEvent(mainWindow.webContents),
                'https://example.com/'
            )
            expect(ipcMocks.shellOpenExternal).toHaveBeenCalledWith('https://example.com/')
        })

        it('should reject non http/https external links without calling shell', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            for (const url of [
                'javascript:alert(1)',
                'file:///C:/Windows/System32/calc.exe',
                'data:text/html,<h1>x</h1>',
                'baize-evil://payload'
            ]) {
                await ipcMocks.on.get('baize:system:open-external-link')!(
                    makeEvent(mainWindow.webContents),
                    url
                )
            }
            expect(ipcMocks.shellOpenExternal).not.toHaveBeenCalled()
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })

        it('should read and complete the version config file', async () => {
            const versionFile = path.join(
                electronState.appPath,
                'resources',
                'config',
                'version.json'
            )
            fs.mkdirSync(path.dirname(versionFile), { recursive: true })
            fs.writeFileSync(
                versionFile,
                JSON.stringify({ appVersion: '9.9.9', nodeVersion: 'fixed-node' }),
                'utf-8'
            )
            const info = (await ipcMocks.handle.get('baize:system:app-version')!(
                makeEvent(mainWindow.webContents)
            )) as Record<string, string | undefined>
            expect(info.appVersion).toBe('9.9.9')
            expect(info.nodeVersion).toBe('fixed-node')
            // 缺失字段用运行时版本补全（非 electron 环境为空字符串）
            expect(info.electronVersion).toBe(
                (process.versions as { electron?: string }).electron ?? ''
            )
            // version.json 中没有的字段不会被补全
            expect(info.vueVersion).toBeUndefined()
        })

        it('should return default version info without a version file', async () => {
            const info = (await ipcMocks.handle.get('baize:system:app-version')!(
                makeEvent(mainWindow.webContents)
            )) as Record<string, string | undefined>
            expect(info.appVersion).toBe('')
            expect(info.nodeVersion).toBe(process.versions.node)
        })

        // AS-6：版本信息查询补 sender 校验
        it('should reject untrusted senders on the app-version channel (AS-6)', async () => {
            const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {})
            const result = await ipcMocks.handle.get('baize:system:app-version')!(
                makeEvent({ id: 999 })
            )
            expect(result).toEqual(expect.objectContaining({ ok: false, code: 'untrusted-sender' }))
            expect(consoleWarn).toHaveBeenCalled()
            consoleWarn.mockRestore()
        })
    })
})
