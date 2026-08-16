import { globalInitialize } from './global'
import * as FileUtils from './file-utils/index'
import { HemyRenderPre, HemyRenderPost } from '../renders/HemyRender'
import { CreateHash, CreateHmac, CreateRsaKeyPair, CryptoDecrypt, CryptoEncrypt } from './encrypt_decrypt'
import { ipcMain, shell } from 'electron'
import { getQuickLinks } from '../config/quick-link-config'
import { getCurrentTheme, getCurrentThemeStyles, getMonacoTheme, getSeparateEditorTheme, getAllThemes, getAllMonacoThemes, getThemeStylesByType } from '../config'
import { appState } from './app-state'
import { getAppResourcesPath } from './app-paths'
import * as fs from 'fs'
import * as path from 'path'

export {
    globalInitialize,
    FileUtils,
    HemyRenderPre,
    HemyRenderPost,
    CreateRsaKeyPair,
    CreateHash,
    CreateHmac,
    CryptoEncrypt,
    CryptoDecrypt
}

export function MainWindowListenUtilsEvent(mainWindow: Electron.BrowserWindow) {
    ipcMain.on('baize:notes:open-select-file', async (_: Electron.IpcMainEvent, message: FileProperties) => {
        await FileUtils.OpenSelectFile(message)
    })

    ipcMain.on('pre-render-monaco-editor-content', (_: Electron.IpcMainEvent, message: string) => {
        HemyRenderPre(mainWindow, message)
    })

    ipcMain.on('post-render-monaco-editor-content', (_: Electron.IpcMainEvent, message: string) => {
        HemyRenderPost(mainWindow, message)
    })

    ipcMain.on('file-manager-context-menu-copy-relative-path', (_: Electron.IpcMainEvent, path: string) => {
        FileUtils.CopyRelativePath(path)
    })

    ipcMain.on('file-manager-context-menu-copy-imagelink', (_: Electron.IpcMainEvent, path: string) => {
        FileUtils.CopyImageLink(path)
    })

    ipcMain.on('file-manager-context-menu-copy-filelink', (_: Electron.IpcMainEvent, path: string) => {
        FileUtils.CopyFileLink(path)
    })

    ipcMain.on('file-manager-context-menu-copy-file', (_: Electron.IpcMainEvent, path: string, isFile: boolean) => {
        FileUtils.FileManagerContextMenuCopy(path, isFile)
    })

    ipcMain.on('file-manager-context-menu-cut', (_: Electron.IpcMainEvent, path: string, isFile: boolean) => {
        FileUtils.FileManagerContextMenuCut(path, isFile)
    })

    ipcMain.on('file-manager-context-menu-paste', (_: Electron.IpcMainEvent, value: string, isFile: boolean) => {
        FileUtils.FileManagerContextMenuPaste(value, isFile)
    })

    ipcMain.on('file-manager-context-menu-open-in-explorer', (_: Electron.IpcMainEvent, path: string) => {
        FileUtils.OpenFolderExplorer(path)
    })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ipcMain.on('file-manager-context-menu-reload-from-disk', async (_: Electron.IpcMainEvent) => {
        await FileUtils.ReloadDirFromDisk()
    })

    ipcMain.on('monaco-editor-container-insert-image', async (_, context: string) => {
        const imageName = await FileUtils.InsertImagesToFile(context)
        if (imageName.length !== 0) {
            mainWindow.webContents.send(
                'monaco-insert-text-block-templates',
                '\r\n\r\n![](./images/' + imageName + ')\r\n\r\n'
            )
        }
    })

    ipcMain.on('plugin-tools-generator-rsa-key-pairs', (_, bits: number) => {
        CreateRsaKeyPair(bits)
    })

    ipcMain.on('plugin-tools-generator-hash-text', (event, context: string, encType: string) => {
        event.returnValue = CreateHash(context, encType)
    })

    ipcMain.on(
        'plugin-tools-generator-hmac-text',
        (event, context: string, secKey: string, encType: string) => {
            event.returnValue = CreateHmac(context, secKey, encType)
        }
    )

    ipcMain.on('plugin-tools-crypto-encrypt', (event, data: CryptoData) => {
        event.returnValue = CryptoEncrypt(data)
    })

    ipcMain.on('plugin-tools-crypto-decrypt', (event, data: CryptoData) => {
        event.returnValue = CryptoDecrypt(data)
    })

    ipcMain.on('navi-tab-open-exe', async (_, exePath: string) => {
        await shell.openPath(exePath)
    })

    // 快速链接配置相关IPC
    ipcMain.handle('baize-notes:get-quick-links', () => {
        return getQuickLinks()
    })

    // 主题配置相关IPC
    ipcMain.handle('get-current-theme', () => {
        return getCurrentTheme()
    })

    ipcMain.handle('get-current-theme-styles', (_event: Electron.IpcMainInvokeEvent, themeType?: string) => {
        if (themeType) {
            return getThemeStylesByType(themeType as any)
        }
        return getCurrentThemeStyles()
    })

    ipcMain.handle('get-all-themes', () => {
        return getAllThemes()
    })

    ipcMain.handle('get-all-monaco-themes', () => {
        return getAllMonacoThemes()
    })

    ipcMain.on('get-separate-editor-theme', (event: Electron.IpcMainEvent) => {
        event.returnValue = getSeparateEditorTheme ()
    })

    ipcMain.on('get-monaco-theme', (event: Electron.IpcMainEvent) => {
        event.returnValue = getMonacoTheme ()
    })

    ipcMain.on('update-select-file-content', async (_: Electron.IpcMainEvent, content: string) => {
        if (appState.currentActiveFile != null) {
            appState.currentActiveFile.content = content
        } else {
            await FileUtils.SaveActiveFileAs()
        }
    })

    // 监听键盘事件
    ipcMain.on('keydown', (_event: Electron.IpcMainEvent, keyboardEvent: { ctrlKey: boolean; key: string }) => {
        if (keyboardEvent.ctrlKey && keyboardEvent.key === 's') {
            FileUtils.SaveActiveFile()
        }
    })

    ipcMain.on('save-file-content-to-disk', async (_: Electron.IpcMainEvent, content: string) => {
        if (appState.currentActiveFile != null) {
            appState.currentActiveFile.content = content
            await FileUtils.SaveActiveFile()
        }
    })


    // 读取 HTML 文件内容
    ipcMain.handle('read-html-file', async (_, filePath: string) => {
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8')
            return content
        } catch (error) {
            console.error('读取 HTML 文件失败:', error)
            throw error
        }
    })

    // 在外部浏览器中打开链接
    ipcMain.on('open-external-link', async (_, url: string) => {
        try {
            await shell.openExternal(url)
        } catch (error) {
            console.error('打开外部链接失败:', error)
        }
    })

    // 检查文件是否存在
    ipcMain.handle('check-file-exists', async (_, filePath: string) => {
        try {
            const exists = fs.existsSync(filePath)
            return exists
        } catch (error) {
            console.error('检查文件存在失败:', error)
            return false
        }
    })

    // 获取应用版本信息
    ipcMain.handle('app:get-version', async () => {
        try {
            const versionFilePath = path.join(getAppResourcesPath(), 'config', 'version.json')
            if (fs.existsSync(versionFilePath)) {
                const versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'))
                return versionData
            }
        } catch (error) {
            console.error('读取版本配置文件失败:', error)
        }
        return {
            appVersion: '',
            electronVersion: process.versions.electron || '',
            chromeVersion: process.versions.chrome || '',
            nodeVersion: process.versions.node || '',
            vueVersion: '',
            viteVersion: '',
            typescriptVersion: ''
        }
    })
}
