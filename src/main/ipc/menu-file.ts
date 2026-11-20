import { app } from 'electron'
import {
    OpenFile,
    OpenDirectory,
    SaveActiveFile,
    SaveActiveFileAs,
    ReloadDirFromDisk
} from '../utils/file-utils/file-operations'
import { InsertImportFormFile } from '../utils/file-utils/import'
import { ExportToFile } from '../utils/file-utils/export'
import { requestRelaunch } from '../utils/app-relaunch'
import { IPC } from '../../shared/ipc-channels'

function FileEncoding(mainWindow: Electron.CrossProcessExports.BrowserWindow, encoding: string) {
    mainWindow.webContents.send(IPC.FILE.OPEN_WITH_ENCODING, encoding)
}

function FileConvertCoding(
    mainWindow: Electron.CrossProcessExports.BrowserWindow,
    encoding: string
) {
    mainWindow.webContents.send(IPC.FILE.CONVERT_TO_ENCODING, encoding)
}

export const fileMenuHandlers = {
    'new-file': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        // 2026-11-19（第 2 批契约重构）：原载荷 `{ isFolder: true }` 已删除——
        // 渲染层 CreateFileFolderDialog 的 props 只有 title / dirPath，文件/文件夹
        // 类型由对话框内部选择，全仓无任何消费方；实际携带 dirPath 的发送点是
        // 快捷键 Ctrl+N（config/short-key-register.ts）。对话框 data 契约见
        // src/shared/types/dialog.ts 的 CreateFileFolderDialogData。
        mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'createFileFolder')
    },
    'new-folder': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        // 同上：原 `{ isFolder: false }` 为无消费方死字段，已随第 2 批契约重构删除。
        mainWindow.webContents.send(IPC.DIALOG.OPEN_VUE_DIALOG, 'createFileFolder')
    },
    'open-file': async (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
        await OpenFile(mainWindow),
    'open-folder': async (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
        await OpenDirectory(mainWindow),
    save: async () => await SaveActiveFile(),
    'save-as': async () => await SaveActiveFileAs(),
    'close-file': async () => await SaveActiveFile(),
    reload: async () => await ReloadDirFromDisk(),
    relaunch: () => {
        // P2 F-07：只登记重启意图并请求退出；真正 app.relaunch() 由 before-quit 在
        // 未保存确认放行后执行（用户取消退出时不会遗留 relaunch 请求）
        requestRelaunch()
    },
    exit: () => app.quit(),

    import: {
        word: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'word', true),
        html: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'html', true),
        json: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'json', true),
        yaml: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'yaml', true),
        xml: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'xml', true),
        text: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            InsertImportFormFile(mainWindow, 'text', true)
    },

    export: {
        word: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            ExportToFile(mainWindow, 'word'),
        json: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            ExportToFile(mainWindow, 'json'),
        xml: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            ExportToFile(mainWindow, 'xml'),
        yaml: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            ExportToFile(mainWindow, 'yaml'),
        html: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            ExportToFile(mainWindow, 'html'),
        pdf: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            ExportToFile(mainWindow, 'pdf')
    }
}

export const codingMenuHandlers = {
    encoding: {
        utf8: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileEncoding(mainWindow, 'utf8'),
        'utf16-le': (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileEncoding(mainWindow, 'utf16-le'),
        'utf16-be': (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileEncoding(mainWindow, 'utf16-be'),
        gbk: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileEncoding(mainWindow, 'gbk'),
        gb2312: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileEncoding(mainWindow, 'gb2312'),
        gb18030: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileEncoding(mainWindow, 'gb18030'),
        big5: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileEncoding(mainWindow, 'big5'),
        'big5-hkscs': (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileEncoding(mainWindow, 'big5-hkscs'),
        hex: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileEncoding(mainWindow, 'hex')
    },
    switch: {
        utf8: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileConvertCoding(mainWindow, 'utf8'),
        'utf16-le': (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileConvertCoding(mainWindow, 'utf16-le'),
        'utf16-be': (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileConvertCoding(mainWindow, 'utf16-be'),
        gbk: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileConvertCoding(mainWindow, 'gbk'),
        gb2312: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileConvertCoding(mainWindow, 'gb2312'),
        gb18030: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileConvertCoding(mainWindow, 'gb18030'),
        big5: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileConvertCoding(mainWindow, 'big5'),
        'big5-hkscs': (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileConvertCoding(mainWindow, 'big5-hkscs'),
        hex: (mainWindow: Electron.CrossProcessExports.BrowserWindow) =>
            FileConvertCoding(mainWindow, 'hex')
    }
}
