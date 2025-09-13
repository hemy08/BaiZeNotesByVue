import { app, ipcMain } from 'electron'
import * as fileUtils from '../utils/file-utils'
import * as dialogs from '../dialogs/dialogs'

export const importMenusDef = [
  { menuType: 'import', label: '从 Word 导入', fileType: 'word' },
  { menuType: 'import', label: '从 HTML 导入', fileType: 'html' },
  { menuType: 'import', label: '从 JSON 导入', fileType: 'json' },
  { menuType: 'import', label: '从 YAML 导入', fileType: 'yaml' },
  { menuType: 'import', label: '从 XML 导入', fileType: 'xml' },
  { menuType: 'import', label: '从文本文件导入', fileType: 'text' }
]

export const exportMenusDef = [
  { menuType: 'export', label: '导出为Word', fileType: 'word' },
  { menuType: 'export', label: '导出为JSON', fileType: 'json' },
  { menuType: 'export', label: '导出为XML', fileType: 'xml' },
  { menuType: 'export', label: '导出为YAML', fileType: 'yaml' },
  { menuType: 'export', label: '导出为HTML', fileType: 'html' },
  { menuType: 'export', label: '导出为PDF', fileType: 'pdf' }
]

function GenImportSubMenuItems(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions[] {
  return importMenusDef
    .map((item): Electron.MenuItemConstructorOptions => {
      const clickFn = () => fileUtils.InsertImportFormFile(mainWindow, item.fileType, true)
      return {
        type: 'normal',
        label: item.label, // 根据类别设置标签
        click: clickFn
      }
    })
    .filter((item) => item != null)
}

function GenExportSubMenuItems(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions[] {
  return exportMenusDef
    .map((item): Electron.MenuItemConstructorOptions => {
      const clickFn = () => fileUtils.ExportToFile(mainWindow, item.fileType)
      return {
        type: 'normal',
        label: item.label, // 根据类别设置标签
        click: clickFn
      }
    })
    .filter((item) => item != null)
}

// eslint-disable-next-line no-unused-vars
export function getAppFileMenuItem(
  mainWindow: Electron.BrowserWindow
): Electron.MenuItemConstructorOptions {
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
      label: '从文件导入',
      submenu: GenImportSubMenuItems(mainWindow)
    },
    {
      label: '导出到文件',
      submenu: GenExportSubMenuItems(mainWindow)
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
    enabled: true,
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
