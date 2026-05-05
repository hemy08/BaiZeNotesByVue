import { OpenOnlineWebPage } from './OpenOnlineWebPages'
import { ShowFontSelectDialog } from './ShowFontSelectDialog'
import { HandleMermaidGetRenderResult, CreateMermaidRenderFrame, closeMermaidRenderWindow, cleanupMermaidRender } from './OpenMermaidRenderFrame'
import { ShowCreateFileFolderDialog } from './ShowCreateFileFolderDialog'
import { ShowFileFolderRenameDialog } from './ShowRemaneDialog'
import { ShowSystemSettingDialog } from './ShowSystemSettingDialog'
import { ShowThemeSettingDialog } from './ShowThemeSettingDialog'
import { ShowEditorSettingDialog } from './ShowEditorSettingDialog'
import { ShowQuickLinkSettingDialog } from './ShowQuickLinkSettingDialog'
import {ShowTechStackDialog} from './ShowTechStackDialog'
import {ShowHelpAboutDialog} from  './ShowHelpAboutDialog'
import { ipcListenerManager } from '../settings/ipc-listener-manager'
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
                fileUtils.DeleteFileFolder(path, isFile)
            } else {
                return
            }
        })
        .catch((err) => {
            console.error('显示对话框时出错:', err)
        })
}

export {
    closeMermaidRenderWindow,
    cleanupMermaidRender,
    OpenOnlineWebPage,
    ShowFontSelectDialog,
    ShowCreateFileFolderDialog,
    ShowFileFolderRenameDialog,
    ShowConfirmDeleteDialog,
    ShowSystemSettingDialog,
    ShowThemeSettingDialog,
    ShowEditorSettingDialog,
    ShowQuickLinkSettingDialog,
    ShowTechStackDialog,
    ShowHelpAboutDialog,
    ShowHelpContactUsDialog,
    CreateMermaidRenderFrame,
    HandleMermaidGetRenderResult
}

export function MainWindowListenDialogsEvent(mainWindow: Electron.BrowserWindow) {
    const componentId = 'main-window-dialogs'

    ipcListenerManager.register('file-manager-context-menu-create-file', (_, dirPath, isFolder, fileExtension) => {
        ShowCreateFileFolderDialog(dirPath, isFolder, fileExtension)
    }, componentId)

    ipcListenerManager.register('file-manager-context-menu-import-from', (_, value) => {
        console.log('file-manager-context-menu-import-from', value)
    }, componentId)

    ipcListenerManager.register('file-manager-context-menu-delete', (_, value, isFile) => {
        ShowConfirmDeleteDialog(value, isFile)
    }, componentId)

    ipcListenerManager.register('file-manager-context-menu-find-in', (_, value) => {
        console.log('file-manager-context-menu-find-in', value)
    }, componentId)

    ipcListenerManager.register('file-manager-context-menu-rename', (_, path, isFile) => {
        ShowFileFolderRenameDialog(path, isFile)
    }, componentId)
}

export function CleanupMainWindowDialogsEvent() {
    ipcListenerManager.cleanupComponent('main-window-dialogs')
}
