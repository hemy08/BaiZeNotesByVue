import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import * as utils from './utils/utils'
import * as dialogs from './dialogs/dialogs'
import { restoreLastOpenedFile } from './utils/file-state'
import { getCurrentThemeStyles, getMonacoThemeData, getSystemSetting, registerConfigIpcHandlers, getEditorSetting } from './config'
import { StartAutoSaveFileTime } from './utils/file-utils'
import { RegisterShortKeys } from './config'
import { logger } from './utils/logger'
import { ipcListenerManager } from './ipc/ipc-listener-manager'
import { initUserDataDirectory, getAppPathsInfo } from './utils/app-paths'
import { registerIpcHandlers, setMainWindow } from './ipc'

const timers: NodeJS.Timeout[] = []
const watchers: fs.FSWatcher[] = []

let mainWindow: Electron.CrossProcessExports.BrowserWindow

function createWindow(): void {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        title: '白泽笔记 -- Markdown Editor Powered By Electron and Vue',
        frame: false,
        autoHideMenuBar: false,
        icon: join(__dirname, '../resources/icon/baize_data.ico'),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false,
            webSecurity: !is.dev,
            allowRunningInsecureContent: is.dev ? true : false
        }
    })

    require('@electron/remote/main').initialize()
    require('@electron/remote/main').enable(mainWindow.webContents)

    setMainWindow(mainWindow)

    mainWindow.on('ready-to-show', () => {
        mainWindow.maximize()
        mainWindow.show()

        mainWindow.on('closed', () => {
            const windows = BrowserWindow.getAllWindows()
            windows.forEach(window => {
                if (!window.isDestroyed()) {
                    window.destroy()
                }
            })
            app.quit()
        })

        logger.setMainWindow(mainWindow)
        logger.info('白泽笔记启动成功')

        if (is.dev) {
            console.log('[Main] App Paths:', getAppPathsInfo())
        }

        dialogs.CreateMermaidRenderFrame('')
        const theme = getCurrentThemeStyles()
        mainWindow.webContents.send('baize-notes:init-theme-styles', theme)

        const systemSetting = getSystemSetting()
        const fontCss = `body, .title-bar, .menu-bar, .menu-label, .menu-item-label, .workspace-area, .status-bar, .navi-tab, .resource-manager, .md-edit-tools, .md-preview, .resizer-md, .resizer-main, #file-bar { font-family: ${systemSetting.fontFamily} !important; font-size: ${systemSetting.fontSize}px !important; }`
        mainWindow.webContents.insertCSS(fontCss)

        const editorSetting = getEditorSetting()
        mainWindow.webContents.send('baize-notes:init-editor-setting', editorSetting)

        restoreLastOpenedFile()
    })

    RegisterShortKeys(mainWindow)
    utils.globalInitialize(mainWindow)

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url).then((r) => console.log(r))
        return { action: 'deny' }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    dialogs.MainWindowListenDialogsEvent(mainWindow)
    utils.MainWindowListenUtilsEvent(mainWindow)

    registerIpcHandlers(mainWindow)

    const systemSetting = getSystemSetting()
    const autoSaveInterval = (systemSetting.autoSaveInterval || 30) * 1000
    StartAutoSaveFileTime(autoSaveInterval)
}

app.whenReady().then(() => {
    initUserDataDirectory()

    // 注册配置 IPC 处理器
    registerConfigIpcHandlers()

    electronApp.setAppUserModelId('com.electron')

    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    ipcMain.on('ping', () => console.log('pong'))

    ipcMain.on('baize-notes:update-theme', () => {
        const theme = getCurrentThemeStyles()
        console.log('[Main] Sending theme update:', theme)
        if (!theme) {
            console.error('[Main] Failed to get current theme styles')
            return
        }
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('baize-notes:theme-updated', theme)
        })
    })

    createWindow()

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

app.on('window-all-closed', () => {
    timers.forEach(timer => clearInterval(timer))
    watchers.forEach(watcher => watcher.close())
    dialogs.CleanupMainWindowDialogsEvent()
    dialogs.closeMermaidRenderWindow()
    dialogs.cleanupMermaidRender()
    ipcListenerManager.cleanupAll()

    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('before-quit', () => {
    timers.forEach(timer => clearInterval(timer))
    watchers.forEach(watcher => watcher.close())
    dialogs.CleanupMainWindowDialogsEvent()
    dialogs.closeMermaidRenderWindow()
    dialogs.cleanupMermaidRender()
    ipcListenerManager.cleanupAll()

    if (is.dev) {
        ipcListenerManager.printStats()
    }

    const windows = BrowserWindow.getAllWindows()
    windows.forEach(window => {
        if (!window.isDestroyed()) {
            window.destroy()
        }
    })
})
