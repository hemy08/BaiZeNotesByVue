import { app } from 'electron'

// eslint-disable-next-line no-unused-vars
export function getAppFileMenuItem(mainWindow: Electron.BrowserWindow) {
  const fileMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '新建文件(N)',
      accelerator: 'ctrl+n',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '新建文件夹(D)',
      accelerator: 'ctrl+d',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '从文件导入',
      submenu: [
        {
          label: 'World',
          click: () => {
            mainWindow.webContents.send('OpenFile', null)
          }
        },
        {
          label: 'Html',
          click: () => {
            mainWindow.webContents.send('OpenFile', null)
          }
        },
        {
          label: 'Json',
          click: () => {
            mainWindow.webContents.send('OpenFile', null)
          }
        },
        {
          label: 'Yaml',
          click: () => {
            mainWindow.webContents.send('OpenFile', null)
          }
        }
      ]
    },
    {
      type: 'separator'
    },
    {
      label: '打开文件',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '打开文件夹',
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
      label: '导出',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '另存为',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '保存',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '保存所有',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '历史记录',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '从磁盘重新读取',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '退出',
      role: 'quit',
      accelerator: 'f4',
      click: () => app.quit()
    }
  ]
  return {
    label: '文件(F)',
    enable: true,
    accelerator: 'alt+f',
    submenu: fileMenuItems
  }
}
