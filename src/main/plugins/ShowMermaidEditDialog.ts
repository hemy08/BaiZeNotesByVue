import { BrowserWindow, ipcMain } from 'electron'
import { katexRenderToString } from '../../utils/KatexRender'

let customMermaidEditDialog: Electron.BrowserWindow | null

export function showMermaidEditDialog(mainWindow: Electron.BrowserWindow) {
  createMermaidEditDialog(mainWindow)
}

// 创建一个自定义对话框的函数
function createMermaidEditDialog(mainWindow: Electron.BrowserWindow) {
  customMermaidEditDialog = new BrowserWindow({
    width: 1280,
    height: 550,
    minimizable: false,
    maximizable: false,
    title: '文字样式选择',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true, // 允许在渲染器进程中使用 Node.js 功能（注意：出于安全考虑，新版本 Electron 默认禁用）
      contextIsolation: false, // 禁用上下文隔离（同样出于安全考虑，新版本 Electron 默认启用）
      sandbox: false
    }
  })

  if (!customMermaidEditDialog) {
    return
  }

  customMermaidEditDialog.setMenu(null)

  // 加载一个 HTML 文件作为对话框的内容
  customMermaidEditDialog.loadURL(
    `data:text/html;charset=utf-8,${encodeURIComponent(mermaidEditDialogHtmlContext)}`
  )

  // 当窗口关闭时，清除引用
  customMermaidEditDialog.on('closed', () => {
    ipcMain.removeListener('user-insert-math-line-text', processMathLineTextInsert)
    ipcMain.removeListener('user-insert-math-block-text', processMathBlockTextInsert)
    ipcMain.removeListener('user-insert-math-text-cancel', () => {})
    customMermaidEditDialog = null
  })

  // 显示窗口
  customMermaidEditDialog.show()

  function exitCustomFontDialog() {
    if (customMermaidEditDialog) {
      ipcMain.removeListener('user-insert-math-line-text', processMathLineTextInsert)
      ipcMain.removeListener('user-insert-math-block-text', processMathBlockTextInsert)
      ipcMain.removeListener('user-insert-math-text-cancel', () => {})
      customMermaidEditDialog.close()
      customMermaidEditDialog = null
    }
  }

  function processMathLineTextInsert(_, MermaidEdit) {
    mainWindow.webContents.send('monaco-insert-text-block-templates', MermaidEdit + '\n')
    exitCustomFontDialog()
  }

  function processMathBlockTextInsert(_, MermaidEdit) {
    mainWindow.webContents.send('monaco-insert-text-block-templates', MermaidEdit + '\n')
    exitCustomFontDialog()
  }

  ipcMain.on('user-insert-math-line-text', processMathLineTextInsert)
  ipcMain.on('user-insert-math-block-text', processMathBlockTextInsert)
  ipcMain.on('user-insert-math-text-cancel', () => {
    exitCustomFontDialog()
  })

  ipcMain.on('sync-katex-render-message', (event, arg) => {
    if (arg == '') {
      event.returnValue = katexRenderToString(latexInit)
    } else {
      event.returnValue = katexRenderToString(arg)
    }
  })
}

const mermaidEditDialogHtmlContext =
