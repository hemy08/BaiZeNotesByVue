import { app } from 'electron'
import { OpenFile, OpenDirectory, SaveActiveFile, SaveActiveFileAs, ReloadDirFromDisk } from '../utils/file-utils/file-operations'
import { InsertImportFormFile } from '../utils/file-utils/import'
import { ExportToFile } from '../utils/file-utils/export'

function FileEncoding(mainWindow: Electron.CrossProcessExports.BrowserWindow, encoding: string) {
    mainWindow.webContents.send('open-with-encoding', encoding)
}

function FileConvertCoding(mainWindow: Electron.CrossProcessExports.BrowserWindow, encoding: string) {
    mainWindow.webContents.send('convert-to-encoding', encoding)
}

export const fileMenuHandlers = {
    'new-file': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'createFileFolder', { isFolder: true })
    },
    'new-folder': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('open-vue-dialog', 'createFileFolder', { isFolder: false })
    },
    'open-file': async (mainWindow: Electron.CrossProcessExports.BrowserWindow) => await OpenFile(mainWindow),
    'open-folder': async (mainWindow: Electron.CrossProcessExports.BrowserWindow) => await OpenDirectory(mainWindow),
    'save': async () => await SaveActiveFile(),
    'save-as': async () => await SaveActiveFileAs(),
    'close-file': async () => await SaveActiveFile(),
    'reload': async () => await ReloadDirFromDisk(),
    'relaunch': () => {
        app.relaunch()
        app.quit()
    },
    'exit': () => app.quit(),

    import: {
        'word': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'word', true),
        'html': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'html', true),
        'json': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'json', true),
        'yaml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'yaml', true),
        'xml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'xml', true),
        'text': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => InsertImportFormFile(mainWindow, 'text', true),
    },

    export: {
        'word': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'word'),
        'json': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'json'),
        'xml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'xml'),
        'yaml': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'yaml'),
        'html': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'html'),
        'pdf': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => ExportToFile(mainWindow, 'pdf'),
    }
}

export const codingMenuHandlers = {
    encoding: {
        'utf8': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileEncoding(mainWindow, 'utf8'),
        'utf16-le': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileEncoding(mainWindow, 'utf16-le'),
        'utf16-be': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileEncoding(mainWindow, 'utf16-be'),
        'gbk': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileEncoding(mainWindow, 'gbk'),
        'gb2312': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileEncoding(mainWindow, 'gb2312'),
        'gb18030': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileEncoding(mainWindow, 'gb18030'),
        'big5': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileEncoding(mainWindow, 'big5'),
        'big5-hkscs': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileEncoding(mainWindow, 'big5-hkscs'),
        'hex': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileEncoding(mainWindow, 'hex'),
    },
    switch: {
        'utf8': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileConvertCoding(mainWindow, 'utf8'),
        'utf16-le': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileConvertCoding(mainWindow, 'utf16-le'),
        'utf16-be': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileConvertCoding(mainWindow, 'utf16-be'),
        'gbk': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileConvertCoding(mainWindow, 'gbk'),
        'gb2312': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileConvertCoding(mainWindow, 'gb2312'),
        'gb18030': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileConvertCoding(mainWindow, 'gb18030'),
        'big5': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileConvertCoding(mainWindow, 'big5'),
        'big5-hkscs': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileConvertCoding(mainWindow, 'big5-hkscs'),
        'hex': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => FileConvertCoding(mainWindow, 'hex'),
    }
}
