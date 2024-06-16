import { app, shell, BrowserWindow, ipcMain, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { getApplicationMenu } from './menu/menu'
import './plugins/plugin'
import { openAndSendSelectFileContent } from './menu/file'
import { HemyRenderPre, HemyRenderPost } from './utils/HemyRender'
import { createMermaidRenderFrame } from './dialogs/OpenMermaidRenderFrame'

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
      contextIsolation: false
    }
  })

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@electron/remote/main').initialize()
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require('@electron/remote/main').enable(mainWindow.webContents)

  mainWindow.on('ready-to-show', () => {
    mainWindow.maximize()
    mainWindow.show()
    // 加载一个子窗口，不对外显示
    createMermaidRenderFrame('')
  })

  initialize()

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

  ipcMain.on('open-select-file', (_, message) => {
    openAndSendSelectFileContent(mainWindow, message)
  })

  ipcMain.on('pre-render-monaco-editor-content', (_, message) => {
    HemyRenderPre(mainWindow, message)
  })

  ipcMain.on('post-render-monaco-editor-content', (_, message) => {
    HemyRenderPost(mainWindow, message)
  })

  ipcMain.on('mermaid-graph-svg-data-to-main', (_, svgData) => {
    console.log('svgData', svgData)
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

// In this file you can include the rest of your app"s specific main process
// code. You can also put them in separate files and require them here.
function initialize() {
  global.MainShowWarn = false
  global.SavingFile = false
  global.SaveFileInterval = 5000
  // 假设你想在主进程中存储一些全局数据
  global.icons = {
    file_icon: '📝',
    folder_open: '📂',
    folder_close: '📁'
  }

  global.FileMgrSvgs = {
    file_icon: 'm10 17 5-5-5-5v10Z',
    folder_collapse_close: '<path d="m10 17 5-5-5-5v10Z"/>',
    folder_collapse_open: '<path d="m7 10 5 5 5-5H7Z"/>',
    folder_close:
      '<path d="M10 4H4c-1.11 0-2 .89-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-8l-2-2Z"/>',
    folder_open:
      '<path d="M19 20H4a2 2 0 0 1-2-2V6c0-1.11.89-2 2-2h6l2 2h7a2 2 0 0 1 2 2H4v10l2.14-8h17.07l-2.28 8.5c-.23.87-1.01 1.5-1.93 1.5Z"/>',
    md_file_svg:
      '<path d="M14.85 3c.63 0 1.15.52 1.14 1.15v7.7c0 .63-.51 1.15-1.15 1.15H1.15C.52 13 0 12.48 0 11.84V4.15C0 3.52.52 3 1.15 3ZM9 11V5H7L5.5 7 4 5H2v6h2V8l1.5 1.92L7 8v3Zm2.99.5L14.5 8H13V5h-2v3H9.5Z"/>',
    png_file_svg:
      '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9 11.5c0 .8-.7 1.5-1.5 1.5h-1v2H5V9h2.5c.8 0 1.5.7 1.5 1.5v1m5 3.5h-1.5l-1-2.5V15H10V9h1.5l1 2.5V9H14v6m5-4.5h-2.5v3h1V12H19v1.7c0 .7-.5 1.3-1.3 1.3h-1.3c-.8 0-1.3-.7-1.3-1.3v-3.3c-.1-.7.4-1.4 1.2-1.4h1.3c.8 0 1.3.7 1.3 1.3v.2h.1m-12.5 0h1v1h-1v-1Z"/>',
    jpg_file_svg:
      '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2M9 13.5c0 1.1-.9 1.5-2 1.5s-2-.4-2-1.5V12h1.5v1.5h1V9H9v4.5m5-2c0 .8-.7 1.5-1.5 1.5h-1v2H10V9h2.5c.8 0 1.5.7 1.5 1.5v1m5-1h-2.5v3h1V12H19v1.7c0 .7-.5 1.3-1.3 1.3h-1.3c-.8 0-1.3-.7-1.3-1.3v-3.3c-.1-.7.4-1.4 1.2-1.4h1.3c.8 0 1.3.7 1.3 1.3v.2m-7.4 0h1v1h-1v-1Z"/>'
  }

  global.MonacoEditorConfig = {
    value: '',
    language: 'markdown',
    automaticLayout: true,
    wordWrap: true,
    theme: 'default',
    fontFamily: 'Hack',
    smoothScrolling: true,
    cursorSmoothCaretAnimation: false,
    disableMonospaceOptimizations: true,
    accessibilitySupport: false,
    autoDetectHighContrast: false,
    autoClosingQuotes: 'never',
    colorDecorators: true,
    scrollBeyondLastLine: true,
    scrollBeyondLastColumn: 0,
    snippetSuggestions: 'none',
    semanticHighlighting: {
      enabled: true
    },
    alwaysOnTop: false,
    quickSuggestions: false,
    minimap: {
      enabled: false
    },
    unicodeHighlight: {
      ambiguousCharacters: false,
      nonBasicASCII: false,
      includeStrings: true
    },
    scrollbar: {
      verticalScrollbarSize: 12
    },
    renderLineHighlight: 'none',
    inlineSuggest: {
      enabled: false
    },
    enableDropIntoEditor: false,
    dragAndDrop: false,
    renderValidationDecorations: false
  }

  global.KatexConfig = {
    displayMode: true,
    throwOnError: true
  }

  /**
   * 代码块语言列表
   * @type {(string|string[2])[]}
   */
  global.SupportLanguage = [
    'abap',
    'apex',
    'azcli',
    'bat',
    'bicep',
    'c',
    'cameligo',
    'clojure',
    'coffee',
    ['cpp', 'C++'],
    ['csharp', 'C#'],
    'csp',
    'css',
    'dart',
    'dockerfile',
    'ecl',
    'elixir',
    'fsharp',
    'go',
    'graphql',
    'handlebars',
    'hcl',
    'html',
    'ini',
    'java',
    'javascript',
    'json',
    'julia',
    ['katex', '数学公式'],
    'kotlin',
    ['latex', '数学公式'],
    'less',
    'lexon',
    'liquid',
    'lua',
    'm3',
    'markdown',
    ['math', '数学公式'],
    ['mermaid', 'Mermaid绘图'],
    'mips',
    'msdax',
    'mysql',
    'objective-c',
    'pascal',
    'pascaligo',
    'perl',
    'pgsql',
    'php',
    'pla',
    ['plantuml', 'PlantUML绘图'],
    'postiats',
    'powerquery',
    'powershell',
    'protobuf',
    'pug',
    'python',
    'qsharp',
    'r',
    'razor',
    'redis',
    'redshift',
    'restructuredtext',
    'ruby',
    'rust',
    'sb',
    'scala',
    'scheme',
    'scss',
    'shell',
    'solidity',
    'sophia',
    'sparql',
    'sql',
    'st',
    'swift',
    'systemverilog',
    'tcl',
    'twig',
    'typescript',
    'vb',
    'xml',
    'yaml'
  ]
}

// 监听来自渲染进程的 IPC 消息，并返回全局数据
ipcMain.on('get-global-file-manager-svg-data', async (event) => {
  event.returnValue = global.FileMgrSvgs
})
