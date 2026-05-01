import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// @ts-ignore
import * as utils from './utils/utils'
import * as dialogs from './dialogs/dialogs'
import { restoreLastOpenedFile } from './utils/file-state'
import { getCurrentThemeStyles } from './themes/theme-config'
import { getMonacoThemeData } from './themes/themeRegistry'
import {HandleBaiZeMenuAction} from "./menu/menu_ipc";
import * as EditorSettingUtils from './settings/editor-setting'
import * as fs from "node:fs";
import { getSystemSetting } from './themes/system-setting'
import { StartAutoSaveFileTime } from './utils/file-utils'
import { RegisterShortKeys } from './settings/short-key-register'
import { logger } from './utils/logger'
import { ipcListenerManager } from './settings/ipc-listener-manager'
import { initUserDataDirectory, getAppPathsInfo } from './utils/app-paths'

const timers: NodeJS.Timeout[] = []
const watchers: fs.FSWatcher[] = []

let mainWindow: Electron.CrossProcessExports.BrowserWindow

function createWindow(): void {
    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        show: false,
        title: '白泽笔记 -- Markdown Editor Powered By Electron and Vue',
        frame: false,
        autoHideMenuBar: false,
        icon: join(__dirname, '../resources/icon/baize_clear_icon.ico'),
        webPreferences: {
            preload: join(__dirname, '../preload/index.js'),
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false,
            // 仅在开发环境禁用 webSecurity，生产环境启用以增强安全性
            webSecurity: !is.dev,
            allowRunningInsecureContent: is.dev ? true : false
        }
    })

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@electron/remote/main').initialize()
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    require('@electron/remote/main').enable(mainWindow.webContents)

    mainWindow.on('ready-to-show', () => {
        mainWindow.maximize()
        mainWindow.show()
        
    // 主窗口关闭时强制退出
    mainWindow.on('closed', () => {
        // 强制销毁所有其他窗口
        const windows = BrowserWindow.getAllWindows()
        windows.forEach(window => {
            if (!window.isDestroyed()) {
                window.destroy()
            }
        })
        // 强制退出
        app.quit()
    })

        // 初始化logger,设置主窗口引用
        logger.setMainWindow(mainWindow)
        logger.info('白泽笔记启动成功')

        // 打印应用路径信息（调试用）
        if (is.dev) {
            console.log('[Main] App Paths:', getAppPathsInfo())
        }

        // DevTools 默认不打开，通过 F12 切换
        // 加载一个子窗口，不对外显示
        dialogs.CreateMermaidRenderFrame('')
        // 发送初始主题样式到主窗口
        const theme = getCurrentThemeStyles()
        mainWindow.webContents.send('baize-notes:init-theme-styles', theme)

        // 注入系统字体设置到主窗口
        const systemSetting = getSystemSetting()
        const fontCss = `body, .title-bar, .menu-bar, .menu-label, .menu-item-label, .workspace-area, .status-bar, .navi-tab, .resource-manager, .md-edit-tools, .md-preview, .resizer-md, .resizer-main, #file-bar { font-family: ${systemSetting.fontFamily} !important; font-size: ${systemSetting.fontSize}px !important; }`
        mainWindow.webContents.insertCSS(fontCss)

        // 发送编辑器配置到主窗口
        const editorSetting = EditorSettingUtils.getEditorSetting()
        //console.log('[Main] Editor Setting:', editorSetting)
        mainWindow.webContents.send('baize-notes:init-editor-setting', editorSetting)

        // 恢复上次打开的文件
        restoreLastOpenedFile()
    })

    RegisterShortKeys(mainWindow)
    utils.globalInitialize(mainWindow)

    mainWindow.webContents.setWindowOpenHandler((details) => {
        shell.openExternal(details.url).then((r) => console.log(r))
        return { action: 'deny' }
    })

    // HMR for renderer base on electron-vite cli.
    // Load the remote URL for development or the local html file for production.
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
        mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
    } else {
        mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
    }

    dialogs.MainWindowListenDialogsEvent(mainWindow)
    utils.MainWindowListenUtilsEvent(mainWindow)

    // 从系统设置读取自动保存间隔并启动自动保存
    const systemSetting = getSystemSetting()
    const autoSaveInterval = (systemSetting.autoSaveInterval || 30) * 1000 // 转换为毫秒
    StartAutoSaveFileTime(autoSaveInterval)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
    // 初始化用户数据目录
    initUserDataDirectory()
    
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // Default open or close DevTools by F12 in development
    // and ignore the related keyboard events in production
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    // IPC 测试
    ipcMain.on('ping', () => console.log('pong'))

    // 窗口控制 IPC
    ipcMain.on('window-minimize', () => {
        if (mainWindow) mainWindow.minimize()
    })
    ipcMain.on('window-maximize', () => {
        if (mainWindow) mainWindow.maximize()
    })
    ipcMain.on('window-unmaximize', () => {
        if (mainWindow) mainWindow.unmaximize()
    })
    ipcMain.on('window-close', () => {
        if (mainWindow) mainWindow.close()
    })
    // 双击标题栏切换最大化
    ipcMain.on('window-toggle-maximize', () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize()
            } else {
                mainWindow.maximize()
            }
        }
    })
    ipcMain.on('baize-notes:update-theme', () => {
        const theme = getCurrentThemeStyles()
        console.log('[Main] Sending theme update:', theme)
        if (!theme) {
            console.error('[Main] Failed to get current theme styles')
            return
        }
        // 发送主题更新到所有窗口
        BrowserWindow.getAllWindows().forEach(window => {
            window.webContents.send('baize-notes:theme-updated', theme)
        })
    })

    ipcMain.on('baize-notes:menu-action', (_, action) => {
        HandleBaiZeMenuAction(action, mainWindow);
    })

    // 加载 Monaco 编辑器主题 JSON 文件
    // 通过 themeRegistry 从 resources/themes/monaco-themes/ 目录读取
    ipcMain.handle('baize-notes:load-monaco-theme', (_, themeName: string) => {
        return getMonacoThemeData(themeName)
    })

    // 获取编辑器配置（用于渲染进程主动请求）
    ipcMain.handle('baize-notes:get-editor-setting', () => {
        return EditorSettingUtils.getEditorSetting()
    })

    createWindow()

    app.on('activate', function () {
        // On macOS it's common to re-create a window in the app when the
        // dock icon is clicked and there are no other windows open.
        if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
    // 清理所有资源
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

// 应用关闭时清理
app.on('before-quit', () => {
    // 清理所有定时器
    timers.forEach(timer => clearInterval(timer))

    // 清理所有文件监听器
    watchers.forEach(watcher => watcher.close())

    // 清理主窗口对话框事件监听器
    dialogs.CleanupMainWindowDialogsEvent()

    // 清理 Mermaid 渲染窗口
    dialogs.closeMermaidRenderWindow()
    dialogs.cleanupMermaidRender()

    // 清理所有IPC监听器（使用管理器）
    ipcListenerManager.cleanupAll()

    // 打印监听器统计信息（调试用）
    if (is.dev) {
        ipcListenerManager.printStats()
    }
    
    // 强制销毁所有窗口
    const windows = BrowserWindow.getAllWindows()
    windows.forEach(window => {
        if (!window.isDestroyed()) {
            window.destroy()
        }
    })
})
