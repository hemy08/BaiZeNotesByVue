// @ts-ignore
import { globalInitialize } from './global'
import * as FileUtils from './file-utils'
// @ts-ignore
import { HemyRenderPost, HemyRenderPre } from '../renders/HemyRender'
// @ts-ignore
import { CreateHash, CreateHmac, CreateRsaKeyPair, CryptoDecrypt, CryptoEncrypt } from './encrypt_decrypt'
import { ipcMain, shell } from 'electron'
// @ts-ignore
import { getQuickLinks } from '../settings/quick-link-config'
import { getCurrentTheme, getCurrentThemeStyles, getMonacoTheme, getSeparateEditorTheme, getAllThemes, getAllMonacoThemes, getThemeStylesByType } from '../themes/theme-config'
import * as fileUtils from "./file-utils";

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
    ipcMain.on('open-select-file', (_, message) => {
        // console.log('open-select-file', message)
        FileUtils.OpenSelectFile(message)
    })

    ipcMain.on('pre-render-monaco-editor-content', (_, message) => {
        HemyRenderPre(mainWindow, message)
    })

    ipcMain.on('post-render-monaco-editor-content', (_, message) => {
        HemyRenderPost(mainWindow, message)
    })

    ipcMain.on('file-manager-context-menu-copy-relative-path', (_, path) => {
        FileUtils.CopyRelativePath(path)
    })

    ipcMain.on('file-manager-context-menu-copy-imagelink', (_, path) => {
        FileUtils.CopyImageLink(path)
    })

    ipcMain.on('file-manager-context-menu-copy-filelink', (_, path) => {
        FileUtils.CopyFileLink(path)
    })

    ipcMain.on('file-manager-context-menu-copy-file', (_, path, isFile) => {
        FileUtils.FileManagerContextMenuCopy(path, isFile)
    })

    ipcMain.on('file-manager-context-menu-cut', (_, path, isFile) => {
        FileUtils.FileManagerContextMenuCut(path, isFile)
    })

    ipcMain.on('file-manager-context-menu-paste', (_, value, isFile) => {
        FileUtils.FileManagerContextMenuPaste(value, isFile)
    })

    ipcMain.on('file-manager-context-menu-open-in-explorer', (_, path) => {
        // console.log('file-manager-context-menu-rename', path, name)
        FileUtils.OpenFolderExplorer(path)
    })

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ipcMain.on('file-manager-context-menu-reload-from-disk', (_) => {
        // console.log('file-manager-context-menu-reload-from-disk')
        FileUtils.ReloadDirFromDisk()
    })

    ipcMain.on('monaco-editor-container-insert-image', (_, context: string) => {
        const imageName = FileUtils.InsertImagesToFile(context)
        console.log('imageName', imageName)
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
    ipcMain.on('baize-notes:get-quick-links', (event) => {
        event.returnValue = getQuickLinks ()
    })

    // 主题配置相关IPC
    ipcMain.handle('get-current-theme', () => {
        //console.log('get-current-theme')
        return getCurrentTheme()
    })

    ipcMain.handle('get-current-theme-styles', (event, themeType?: string) => {
        //console.log('get-current-theme-styles')
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

    ipcMain.on('get-separate-editor-theme', (event) => {
        event.returnValue = getSeparateEditorTheme ()
    })

    ipcMain.on('get-monaco-theme', (event) => {
        event.returnValue = getMonacoTheme ()
    })

    ipcMain.on('update-select-file-content', (_, content) => {
        // console.log('[ipcMain] update-select-file-content   ', content.length)
        const curFile = global.current_active_file
        // 文件打开了
        if (curFile != undefined) {
            global.current_active_file.content = content
            //console.log('update file :', curFile.path, 'length:', content.length)
        } else {
            // 没有打开文件，提示用户
            console.warn('not file opened, show save as')
            fileUtils.SaveActiveFileAs()
        }
    })

    // 监听键盘事件
    function handleKeyDown(event) {
        if (event.ctrlKey && event.key === 's') {
            fileUtils.SaveActiveFile()
        }
    }

    ipcMain.on('keydown', handleKeyDown)

    ipcMain.on('save-file-content-to-disk', (_, content) => {
        const curFile = global.current_active_file
        if (curFile != undefined) {
            global.current_active_file.content = content
            fileUtils.SaveActiveFile()
        }
    })


    // 读取 HTML 文件内容
    ipcMain.handle('read-html-file', async (_, filePath: string) => {
        try {
            const fs = require('fs')
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
            const fs = require('fs')
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
            const { getAppResourcesPath } = require('./app-paths')
            const fs = require('fs')
            const path = require('path')
            const versionFilePath = path.join(getAppResourcesPath(), 'config', 'version.json')
            if (fs.existsSync(versionFilePath)) {
                const versionData = JSON.parse(fs.readFileSync(versionFilePath, 'utf-8'))
                return versionData
            }
        } catch (error) {
            console.error('读取版本配置文件失败:', error)
        }
        console.log('默认版本信息',  process.versions)
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
