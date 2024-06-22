import { app, ipcMain } from 'electron'
import { reloadDirectoryFromDisk, saveActiveFile, saveActiveFileAs } from '../utils/file-utils'

// eslint-disable-next-line no-unused-vars
export function getAppFileMenuItem(mainWindow: Electron.BrowserWindow) {
  const fileMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '新建文件(N)  ...待开发',
      accelerator: 'ctrl+n',
      click: () => {
        global.hemy.file.openDirectory()
      }
    },
    {
      label: '新建文件夹(D) ...待开发',
      accelerator: 'ctrl+d',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '从文件导入',
      submenu: [
        {
          label: 'World ...待开发',
          click: () => {
            mainWindow.webContents.send('OpenFile', null)
          }
        },
        {
          label: 'Html ...待开发',
          click: () => {
            mainWindow.webContents.send('OpenFile', null)
          }
        },
        {
          label: 'Json ...待开发',
          click: () => {
            mainWindow.webContents.send('OpenFile', null)
          }
        },
        {
          label: 'Yaml ...待开发',
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
        global.hemy.file.openFile()
      }
    },
    {
      label: '打开文件夹',
      accelerator: 'ctrl+o',
      click: () => {
        global.hemy.file.openDirectory()
      }
    },
    {
      type: 'separator'
    },
    {
      label: '导出 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '另存为',
      click: () => {
        saveActiveFileAs()
      }
    },
    {
      label: '保存',
      accelerator: 'ctrl+s',
      click: () => {
        saveActiveFile()
      }
    },
    {
      label: '保存所有 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '历史记录 ...待开发',
      click: () => {
        mainWindow.webContents.send('OpenFile', null)
      }
    },
    {
      label: '从磁盘重新加载',
      accelerator: 'ctrl+r',
      click: () => {
        reloadDirectoryFromDisk()
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

ipcMain.on('update-select-file-content', (_, content) => {
  const curFile = global.__current_active_file
  // 文件打开了
  if (curFile != undefined) {
    global.__current_active_file.content = content
  }
  // 没有打开文件，使用另存为动作
})

// 监听键盘事件
function handleKeyDown(event) {
  if (event.ctrlKey && event.key === 's') {
    saveActiveFile()
  }
}

ipcMain.on('keydown', handleKeyDown)

ipcMain.on('save-file-content-to-disk', (_, content) => {
  const curFile = global.__current_active_file
  if (curFile != undefined) {
    global.__current_active_file.content = content
    saveActiveFile()
  }
})
