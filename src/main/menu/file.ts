import { app, dialog, ipcMain } from 'electron'
import {
  openSelectFile,
  reloadDirectoryFromDisk,
  saveActiveFile,
  saveActiveFileAs
} from '../utils/file-utils'

// eslint-disable-next-line no-unused-vars
export function getAppFileMenuItem(mainWindow: Electron.BrowserWindow) {
  const fileMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '新建文件(N)  ...待开发',
      accelerator: 'ctrl+n',
      click: () => {
        showOpenDirectoryDialog(mainWindow)
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
      label: '从文件导入 ...待开发',
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
        showOpenSelectFileDialog(mainWindow)
      }
    },
    {
      label: '打开文件夹',
      click: () => {
        showOpenDirectoryDialog(mainWindow)
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

function showOpenDirectoryDialog(mainWindow: Electron.BrowserWindow) {
  dialog
    .showOpenDialog(mainWindow, {
      properties: ['openDirectory']
    })
    .then((result) => {
      if (result.canceled) return
      global.RootPath = result.filePaths[0]
      reloadDirectoryFromDisk()
    })
    .catch((err) => {
      console.error('Error opening directory dialog:', err)
    })
}

function getFileNameFromPath(filePath: string): string {
  const lastIndex = filePath.lastIndexOf('/') || filePath.lastIndexOf('\\')
  if (lastIndex === -1) {
    // 如果没有找到'/'或'\\'，则整个字符串就是文件名（或路径错误）
    return filePath
  }
  return filePath.slice(lastIndex + 1)
}

function showOpenSelectFileDialog(mainWindow: Electron.BrowserWindow) {
  dialog
    .showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [{ name: 'Markdown Files', extensions: ['md'] }]
    })
    .then((result) => {
      if (result.canceled) return
      const fileProperties: FileProperties = {
        name: getFileNameFromPath(result.filePaths[0]),
        path: result.filePaths[0],
        type: 'file',
        content: ''
      }
      openSelectFile(mainWindow, fileProperties)
    })
    .catch((err) => {
      console.error('Error reading file:', err)
      // event.reply('selected-file-content-error', err.message)
    })
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
