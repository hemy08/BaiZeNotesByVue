import { InsertImportFormFile } from '../utils/file-utils/import'
import * as dialogs from '../dialogs/dialogs'

export const viewMenuHandlers = {
    'edit-mode': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('markdown-edit-model', null)
    },
    'preview-mode': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('markdown-preview-model', null)
    },
    'edit-preview-mode': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('markdown-edit-preview-model', null)
    },
    'dev-tools': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.toggleDevTools()
    },
    'toggle-resource-manager': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('menu-view-hide-display-res-manager', null)
    },
    'toggle-line-number': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('baize-notes:monaco-editor-update-options', 'lineNumbers')
    },
    'toggle-whitespace': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('baize-notes:monaco-editor-update-options', 'renderWhitespace')
    },
    'toggle-outline': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('menu-view-hide-display-res-manager', null)
    },

    fold: {
        'all-fold': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'all-expand': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level1': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level2': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level3': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level4': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level5': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
        'level6': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('OpenFile', null)
        },
    }
}

export const insertMenuHandlers = {
    material: {
        'admonition': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
            mainWindow.webContents.send('open-vue-dialog', 'admonition')
        },
    },
    'special-text': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        dialogs.ShowFontSelectDialog(mainWindow)
    },
    'math': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'mathText')
    },
    'md-table': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'mdSheet')
    },
    'web-link': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'insertLink')
    },
    'custom-template': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'template-manager': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'from-file': {
        'json': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'json', false),
        'text': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'text', false),
        'ini': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'ini', false),
        'yaml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'yaml', false),
        'xml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'xml', false),
        'html': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'html', false),
        'csv': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'csv', false),
        'excel': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'excel', false),
    }
}

export const settingMenuHandlers = {
    'theme': () => dialogs.ShowThemeSettingDialog(),
    'system': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => dialogs.ShowSystemSettingDialog(mainWindow),
    'quick-link': () => dialogs.ShowQuickLinkSettingDialog(),
    'monaco-editor': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        dialogs.ShowEditorSettingDialog(mainWindow)
    },
}
