// import { app } from 'electron'

// eslint-disable-next-line no-unused-vars
export function getAppEditMenuItem(mainWindow: Electron.BrowserWindow) {
  const editMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '撤销 ...待开发',
      role: 'undo',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '恢复 ...待开发',
      role: 'redo',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '拷贝 ...待开发',
      role: 'copy',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '剪切 ...待开发',
      role: 'cut',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '黏贴 ...待开发',
      role: 'paste',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '删除 ...待开发',
      role: 'delete',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '查找 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '在文件中查找 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '替换 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '在文件中替换 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    }
  ]
  return {
    label: '编辑(E)',
    submenu: editMenuItems
  }
}
