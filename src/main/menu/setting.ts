// import { app } from 'electron'

// eslint-disable-next-line no-unused-vars
export function getAppSettingMenuItem(mainWindow: Electron.BrowserWindow) {
  const settingMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '系统设置',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '主题',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '字体',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '编辑器',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'Markdown解析器',
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
    label: '设置(S)',
    submenu: settingMenuItems
  }
}
