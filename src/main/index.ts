import { app, shell, BrowserWindow, ipcMain, Menu, globalShortcut } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getApplicationMenu } from './menu/menu'
import './plugins/plugin'
import * as utils from './utils/utils'
import * as dialogs from './dialogs/dialogs'

let mainWindow: Electron.CrossProcessExports.BrowserWindow

function createWindow(): void {
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    title: 'Hemy Markdown Editor',
    autoHideMenuBar: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      nodeIntegration: true, // 允许在渲染进程中使用Node.js功能
      contextIsolation: false,
      webSecurity: false
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@electron/remote/main').initialize()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@electron/remote/main').enable(mainWindow.webContents)

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
    mainWindow.webContents.openDevTools()
    // 加载一个子窗口，不对外显示
    dialogs.CreateMermaidRenderFrame('')
  })

  globalShortcut.register('F12', () => {
    mainWindow.webContents.openDevTools()
  })

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

  mainWindow.on('close', () => {
    // mainWindow = null
  })
  const menu = Menu.buildFromTemplate(getApplicationMenu(mainWindow))
  Menu.setApplicationMenu(menu)
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('com.electron')

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

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
