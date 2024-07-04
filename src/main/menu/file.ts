import { app, ipcMain } from 'electron'
import * as fileUtils from '../utils/file-utils'
import * as dialogs from '../dialogs/dialogs'

// eslint-disable-next-line no-unused-vars
export function getAppFileMenuItem(mainWindow: Electron.BrowserWindow) {
  const fileMenuItems: Electron.MenuItemConstructorOptions[] = [
    {
      label: '新建文件(N)',
      accelerator: 'ctrl+n',
      click: () => {
        dialogs.ShowNewFileFolderDialog(true)
      }
    },
    {
      label: '新建文件夹(D)',
      accelerator: 'ctrl+d',
      click: () => {
        dialogs.ShowNewFileFolderDialog(false)
      }
    },
    {
      label: '从文件导入',
      submenu: [
        {
          label: '从 Word 导入',
          click: () => {
            fileUtils.InsertImportFormFile(mainWindow, 'word', true)
          }
        },
        {
          label: '从 HTML 导入',
          click: () => {
            fileUtils.InsertImportFormFile(mainWindow, 'html', true)
          }
        },
        {
          label: '从 JSON 导入',
          click: () => {
            fileUtils.InsertImportFormFile(mainWindow, 'json', true)
          }
        },
        {
          label: '从 YAML 导入',
          click: () => {
            fileUtils.InsertImportFormFile(mainWindow, 'yaml', true)
          }
        },
        {
          label: '从文本文件导入',
          click: () => {
            fileUtils.InsertImportFormFile(mainWindow, 'text', true)
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
        fileUtils.OpenFile(mainWindow)
      }
    },
    {
      label: '打开文件夹',
      accelerator: 'ctrl+o',
      click: () => {
        fileUtils.OpenDirectory(mainWindow)
      }
    },
    {
      type: 'separator'
    },
    {
      label: '导出为',
      submenu: [
        {
          label: '导出为Word',
          click: () => {
            fileUtils.ExportToFile('word')
          }
        },
        {
          label: '导出为Html',
          click: () => {
            fileUtils.ExportToFile('html')
          }
        },
        {
          label: '导出为PDF',
          click: () => {
            fileUtils.ExportToFile('pdf')
          }
        }
      ]
    },
    {
      label: '另存为',
      click: () => {
        fileUtils.SaveActiveFileAs()
      }
    },
    {
      label: '保存',
      accelerator: 'ctrl+s',
      click: () => {
        fileUtils.SaveActiveFile()
      }
    },
    {
      type: 'separator'
    },
    {
      label: '从磁盘重新加载',
      accelerator: 'ctrl+r',
      click: () => {
        fileUtils.ReloadDirFromDisk()
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
  const curFile = global.current_active_file
  // 文件打开了
  if (curFile != undefined) {
    global.current_active_file.content = content
  }
  // 没有打开文件，使用另存为动作
})

// 监听键盘事件
function handleKeyDown(event) {
  if (event.ctrlKey && event.key === 's') {
    fileUtils.SaveActiveFile()
  }
}

ipcMain.on('keydown', handleKeyDown)

ipcMain.on('save-file-content-to-disk', (_, content) => {
  const curFile = global.current_active_file
  if (curFile != undefined) {
    global.current_active_file.content = content
    fileUtils.SaveActiveFile()
  }
})
