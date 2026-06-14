export const editMenuHandlers = {
    'undo': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('monaco-editor-trigger-undo-redo', 'undo')
    },
    'redo': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('monaco-editor-trigger-undo-redo', 'redo')
    },
    'cut': () => {},
    'copy': () => {},
    'paste': () => {},
    'go-line': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'find-in-file': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'replace-in-file': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'find-in-dir': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
    'replace-in-dir': (mainWindow: Electron.CrossProcessExports.BrowserWindow) => {
        mainWindow.webContents.send('OpenFile', null)
    },
}
