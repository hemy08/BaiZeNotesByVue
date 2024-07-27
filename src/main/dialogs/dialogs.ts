import { OpenOnlineWebPage } from './OpenOnlineWebPages'
import { ShowFontSelectDialog } from './ShowFontSelectDialog'
import { ShowMarkdownSheetDialog } from './ShowMdSheetDialog'
import { ShowMathTextDialog } from './ShowMathTextDialog'
import { ShowMermaidEditDialog } from './ShowMermaidEditDialog'
import { HandleMermaidGetRenderResult, CreateMermaidRenderFrame } from './OpenMermaidRenderFrame'
import { ShowAdmonitionDialog } from './ShowAdmonitionsDialog'
import { ShowCreateFileFolderDialog } from './ShowCreateFileFolderDialog'
import { ShowFileFolderRenameDialog } from './ShowRemaneDialog'
import { ShowWebUrlDialog } from './ShowWebUrlDialog'
import { ShowInsertImageDialog } from './ShowInsertImageDialog'
import { ShowNewFileFolderDialog } from './ShowNewFileFolderDialog'
import { ShowSystemSettingDialog } from './ShowSystemSettingDialog'
import { ShowThemeSettingDialog } from  './ShowThemeSettingDialog'
import { dialog, ipcMain } from 'electron'
import * as fileUtils from '../utils/file-utils'

function ShowConfirmDeleteDialog(path: string, isFile: boolean) {
  dialog
    .showMessageBox({
      type: 'question',
      buttons: ['是', '否'],
      title: '确认',
      message: '确定要删除[' + path + ']吗？'
    })
    .then((result) => {
      if (result.response === 0) {
        // console.log('用户点击了“是”')
        // 在这里执行“是”的操作
        fileUtils.DeleteFileFolder(path, isFile)
      } else {
        // console.log('用户点击了“否”')
        return
      }
    })
    .catch((err) => {
      console.error('显示对话框时出错:', err)
    })
}

export {
  OpenOnlineWebPage,
  ShowFontSelectDialog,
  ShowMarkdownSheetDialog,
  ShowMathTextDialog,
  ShowMermaidEditDialog,
  HandleMermaidGetRenderResult,
  CreateMermaidRenderFrame,
  ShowAdmonitionDialog,
  ShowCreateFileFolderDialog,
  ShowFileFolderRenameDialog,
  ShowConfirmDeleteDialog,
  ShowWebUrlDialog,
  ShowInsertImageDialog,
  ShowNewFileFolderDialog,
  ShowSystemSettingDialog,
  ShowThemeSettingDialog
}


export function MainWindowListenDialogsEvent(mainWindow: Electron.BrowserWindow) {
  ipcMain.on('monaco-editor-tools-insert-table', () => {
    ShowMarkdownSheetDialog(mainWindow)
  })

  ipcMain.on('monaco-editor-tools-insert-web-links', () => {
    ShowWebUrlDialog(mainWindow)
  })

  ipcMain.on('monaco-editor-tools-insert-image', () => {
    ShowInsertImageDialog(mainWindow)
  })

  ipcMain.on('file-manager-context-menu-create-file', (_, dirPath, isFolder, fileExtension) => {
    ShowCreateFileFolderDialog(dirPath, isFolder, fileExtension)
  })

  ipcMain.on('file-manager-context-menu-import-from', (_, value) => {
    console.log('file-manager-context-menu-import-from', value)
  })

  ipcMain.on('file-manager-context-menu-delete', (_, value, isFile) => {
    // console.log('file-manager-context-menu-delete', value)
    ShowConfirmDeleteDialog(value, isFile)
  })

  ipcMain.on('file-manager-context-menu-find-in', (_, value) => {
    console.log('file-manager-context-menu-find-in', value)
  })

  ipcMain.on('file-manager-context-menu-rename', (_, path, isFile) => {
    // console.log('file-manager-context-menu-rename', path, name)
    ShowFileFolderRenameDialog(path, isFile)
  })
}
