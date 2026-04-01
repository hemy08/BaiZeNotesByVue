import { BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import * as digcom from './dialog_common'
import { getCurrentThemeStyles } from '../theme-config/theme-config'

let customMermaidEditDialog: Electron.BrowserWindow | null

export function ShowMermaidEditDialog(mainWindow: Electron.BrowserWindow) {
    if (customMermaidEditDialog) {
        digcom.ShowAlreadyExistDialog()
        return
    }
    createMermaidEditDialog(mainWindow)
}

// 创建一个自定义对话框的函数
function createMermaidEditDialog(mainWindow: Electron.BrowserWindow) {
    customMermaidEditDialog = new BrowserWindow({
        width: 1600,
        height: 960,
        minimizable: false,
        maximizable: false,
        resizable: true,
        title: 'Mermaid 图表编辑',
        autoHideMenuBar: true,
        frame: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            sandbox: false
        }
    })

    if (!customMermaidEditDialog) {
        return
    }

    customMermaidEditDialog.setMenu(null)

    customMermaidEditDialog.loadURL(
        join(__dirname, '../../src/renderer/src/dialogs/htmlDemo/MermaidEditRender.html')
    )

    // 发送主题样式
    customMermaidEditDialog.webContents.on('did-finish-load', () => {
        const theme = getCurrentThemeStyles()
        customMermaidEditDialog?.webContents.send('baize-notes:init-theme-styles', theme)
    })

    // 当窗口关闭时，清除引用
    customMermaidEditDialog.on('closed', () => {
        ipcMain.removeListener('dialog-mermaid-graph-insert', processMermaidRenderText)
        customMermaidEditDialog = null
    })

    // 显示窗口
    customMermaidEditDialog.show()

    function processMermaidRenderText(_, mermaidGraphData) {
        console.log(mermaidGraphData)
    }
    ipcMain.on('dialog-mermaid-graph-insert', processMermaidRenderText)

    const graphData =
        'classDiagram\n' +
        'direction LR\n' +
        'Animal ()-- Dog\n' +
        'Animal ()-- Cat\n' +
        'note for Cat "should have no members area"\n' +
        'Dog : bark()\n' +
        'Dog : species()'
    mainWindow.webContents.send('mermaid-graph-definition', graphData)
}
