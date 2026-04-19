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
import * as EditorSettingUtils from './utils/editor-setting'
import * as fs from "node:fs";
import { getSystemSetting } from './themes/system-setting'
import { StartAutoSaveFileTime } from './utils/file-utils'
import { RegisterShortKeys } from './utils/short-key-register'
const timers: NodeJS.Timeout[] = []
const watchers: fs.FSWatcher[] = []
//import { SystemSetting } from "./global-types";
//import { getApplicationMenu } from './menu/menu'
//import * as SystemSettingUtils from './utils/system-setting'

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
        icon: join(__dirname, '../icon/baize_clear_icon.ico'),
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
    console.log('[Main] Auto save started with interval:', autoSaveInterval, 'ms')

    mainWindow.on('close', () => {
        // mainWindow = null
        app.quit()
    })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
// 禁用 GPU 磁盘缓存以避免 Windows 权限错误
app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')

app.whenReady().then(() => {
    // Set app user model id for windows
    electronApp.setAppUserModelId('com.electron')

    // 初始化主题管理器 - 在应用启动时预加载所有主题

    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
        optimizer.watchWindowShortcuts(window)
    })

    // IPC test
    ipcMain.on('ping', () => console.log('pong'))

    // 监听主题更新请求

    // 窗口控制
    ipcMain.on('window-minimize', () => {
        if (mainWindow) {
            mainWindow.minimize()
        }
    })

    ipcMain.on('window-maximize', () => {
        if (mainWindow) {
            if (mainWindow.isMaximized()) {
                mainWindow.unmaximize()
            } else {
                mainWindow.maximize()
            }
        }
    })

    ipcMain.on('window-close', () => {
        if (mainWindow) {
            mainWindow.close()
        }
    })

    // 窗口拖动：开始拖动时取消最大化，返回窗口位置
    ipcMain.on('window-start-drag', (event) => {
        if (mainWindow && mainWindow.isMaximized()) {
            mainWindow.unmaximize()
            // 返回还原后的窗口位置，供渲染进程计算偏移
            const bounds = mainWindow.getBounds()
            event.reply('window-drag-unmaximized', bounds)
        }
    })

    // 窗口位置移动
    ipcMain.on('window-move', (_, x: number, y: number) => {
        if (mainWindow) {
            mainWindow.setPosition(Math.round(x), Math.round(y))
        }
    })

    // 获取窗口位置和大小
    ipcMain.on('window-get-bounds', (event) => {
        if (mainWindow) {
            event.returnValue = mainWindow.getBounds()
        } else {
            event.returnValue = null
        }
    })

    // 设置窗口大小
    ipcMain.on('window-set-size', (_, width: number, height: number) => {
        if (mainWindow) {
            mainWindow.setSize(Math.round(width), Math.round(height))
        }
    })

    // 获取窗口是否最大化
    ipcMain.on('window-is-maximized', (event) => {
        if (mainWindow) {
            event.returnValue = mainWindow.isMaximized()
        } else {
            event.returnValue = false
        }
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

    // 清理IPC监听器
    ipcMain.removeAllListeners()
})
