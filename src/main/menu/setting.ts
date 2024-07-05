// import { app } from 'electron'

// eslint-disable-next-line no-unused-vars
export function getAppSettingMenuItem(mainWindow: Electron.BrowserWindow) {
  const settingMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '系统设置 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '主题 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '字体 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '编辑器 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'Markdown解析器 ...待开发',
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
    label: '设置(S)',
    enable: true,
    accelerator: 'alt+s',
    submenu: settingMenuItems
  }
}
