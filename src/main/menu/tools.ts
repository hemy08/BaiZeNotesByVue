// import { app } from 'electron'

// eslint-disable-next-line no-unused-vars
export function getAppToolsMenuItem(mainWindow: Electron.BrowserWindow) {
  const toolsMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '电子表格',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '配图制作',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '绘图工具',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'xxxx',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  return {
    label: '工具(T)',
    submenu: toolsMenuItems
  }
}
