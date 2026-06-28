export const editMenuHandlers = {
    'undo': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('monaco-editor-trigger-undo-redo', 'undo')
    },
    'redo': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('monaco-editor-trigger-undo-redo', 'redo')
    },
    'cut': () => { console.warn('[Menu] Cut not implemented yet') },
    'copy': () => { console.warn('[Menu] Copy not implemented yet') },
    'paste': () => { console.warn('[Menu] Paste not implemented yet') },
    'go-line': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('editor-go-to-line')
    },
    'find-in-file': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('editor-find')
    },
    'replace-in-file': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('editor-replace')
    },
    'find-in-dir': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        console.warn('[Menu] Find in directory not implemented yet')
    },
    'replace-in-dir': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        console.warn('[Menu] Replace in directory not implemented yet')
    },
}
