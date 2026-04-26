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
import { ShowThemeSettingDialog } from './ShowThemeSettingDialog'
import { ShowEditorSettingDialog } from './ShowEditorSettingDialog'
import { ShowQuickLinkSettingDialog } from './ShowQuickLinkSettingDialog'
import {ShowTechStackDialog} from './ShowTechStackDialog'
import {ShowHelpAboutDialog} from  './ShowHelpAboutDialog'
import { ipcListenerManager } from '../utils/ipc-listener-manager'
import {ShowHelpContactUsDialog} from  './ShowHelpContactUsDialog'
import { dialog } from 'electron'
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
    ShowCreateFileFolderDialog,
    ShowFileFolderRenameDialog,
    ShowConfirmDeleteDialog,
    ShowWebUrlDialog,
    ShowInsertImageDialog,
    ShowNewFileFolderDialog,
    ShowSystemSettingDialog,
    ShowThemeSettingDialog,
    ShowEditorSettingDialog,
    ShowQuickLinkSettingDialog,
    ShowTechStackDialog,
    ShowHelpAboutDialog,
    ShowHelpContactUsDialog,
    ShowAdmonitionDialog
}

export function MainWindowListenDialogsEvent(mainWindow: Electron.BrowserWindow) {
    const componentId = 'main-window-dialogs'

    ipcListenerManager.register('monaco-editor-tools-insert-table', () => {
        ShowMarkdownSheetDialog(mainWindow)
    }, componentId)

    ipcListenerManager.register('monaco-editor-tools-insert-web-links', () => {
        ShowWebUrlDialog(mainWindow)
    }, componentId)

    ipcListenerManager.register('monaco-editor-tools-insert-image', () => {
        ShowInsertImageDialog(mainWindow)
    }, componentId)

    ipcListenerManager.register('file-manager-context-menu-create-file', (_, dirPath, isFolder, fileExtension) => {
        ShowCreateFileFolderDialog(dirPath, isFolder, fileExtension)
    }, componentId)

    ipcListenerManager.register('file-manager-context-menu-import-from', (_, value) => {
        console.log('file-manager-context-menu-import-from', value)
    }, componentId)

    ipcListenerManager.register('file-manager-context-menu-delete', (_, value, isFile) => {
        // console.log('file-manager-context-menu-delete', value)
        ShowConfirmDeleteDialog(value, isFile)
    }, componentId)

    ipcListenerManager.register('file-manager-context-menu-find-in', (_, value) => {
        console.log('file-manager-context-menu-find-in', value)
    }, componentId)

    ipcListenerManager.register('file-manager-context-menu-rename', (_, path, isFile) => {
        // console.log('file-manager-context-menu-rename', path, name)
        ShowFileFolderRenameDialog(path, isFile)
    }, componentId)
}

/**
 * 清理主窗口的对话框事件监听器
 */
export function CleanupMainWindowDialogsEvent() {
    ipcListenerManager.cleanupComponent('main-window-dialogs')
}
