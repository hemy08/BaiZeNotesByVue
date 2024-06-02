// import { app } from 'electron'

// eslint-disable-next-line no-unused-vars
export function getAppPluginsMenuItem(mainWindow: Electron.BrowserWindow) {
  const pluginsMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'PlantUML插件 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'Latex插件 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'JSON插件 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: 'Yaml插件 ...待开发',
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
    label: '插件(P)',
    submenu: pluginsMenuItems
  }
}
