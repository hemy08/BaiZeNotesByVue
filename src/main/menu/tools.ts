import * as dialogs from '../dialogs/dialogs'

// eslint-disable-next-line no-unused-vars
export function getAppToolsMenuItem(mainWindow: Electron.BrowserWindow) {
  const toolsMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'Mermaid绘图',
      click: () => {
        dialogs.ShowMermaidEditDialog(mainWindow)
      }
    },
    {
      label: '电子表格 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '配图制作 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '绘图工具 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'xxxx ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  return {
    label: '工具(T)',
    enable: true,
    accelerator: 'alt+t',
    submenu: toolsMenuItems
  }
}
