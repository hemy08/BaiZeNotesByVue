import { app, ipcMain } from 'electron'
import * as fileUtils from '../utils/file-utils'
import * as dialogs from '../dialogs/dialogs'

export const ImportExport = [
  { type: 'import', label: '从 Word 导入', fileType: 'word' },
  { type: 'import', label: '从 HTML 导入', fileType: 'html' },
  { type: 'import', label: '从 JSON 导入', fileType: 'json' },
  { type: 'import', label: '从 YAML 导入', fileType: 'yaml' },
  { type: 'import', label: '从文本文件导入', fileType: 'text' },
  { type: 'separator', label: 'separator' },
  { type: 'export', label: '导出为Word', fileType: 'word' },
  { type: 'export', label: '导出为HTML', fileType: 'html' },
  { type: 'export', label: '导出为PDF', fileType: 'pdf' }
]

function GenImportExportSubMenuItems(mainWindow: Electron.BrowserWindow) {
  return ImportExport.map((item:{ type: string, label:string, fileType: string }) => {
    if (item.type === 'separator') {
      return { type: 'separator' }
    } else if (item.type === 'import') {
      return {
        label: item.label, // 根据类别设置标签
        click: () => {
          fileUtils.InsertImportFormFile(mainWindow, item.fileType, true)
        }
      }
    } else {
      return {
        label: item.label, // 根据类别设置标签
        click: () => {
          fileUtils.ExportToFile(mainWindow, item.fileType)
        }
      }
    }
  })
}

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
      label: '导入导出',
      submenu: GenImportExportSubMenuItems(mainWindow)
    },
    { type: 'separator' },
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
    { type: 'separator' },
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
      label: '从磁盘重新加载',
      accelerator: 'ctrl+r',
      click: () => {
        fileUtils.ReloadDirFromDisk()
      }
    },
    { type: 'separator' },
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
