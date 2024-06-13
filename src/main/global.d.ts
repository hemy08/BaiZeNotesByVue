declare global {
  let mainWin: Electron.BrowserWindow
  let mermaidWin: Electron.BrowserWindow
  interface window {
    mainWin: Electron.BrowserWindow
  }
}

declare const fileManagerDefaultFileIcon = '📝'
declare const fileManagerDefaultFolderOpen = '📂'
declare const fileManagerDefaultFolderClose = '📁'
