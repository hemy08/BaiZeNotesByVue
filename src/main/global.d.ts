declare global {
  let mainWin: Electron.BrowserWindow
  let mermaidWin: Electron.BrowserWindow
  let CurrentActiveFile: FileProperties
}

declare const fileManagerDefaultFileIcon = '📝'
declare const fileManagerDefaultFolderOpen = '📂'
declare const fileManagerDefaultFolderClose = '📁'

declare interface FileProperties {
  name: string
  path: string
  type: 'file' | 'folder'
  content: string
  children?: []
}

declare let mainWin: Electron.BrowserWindow

declare let CurrentActiveFile: FileProperties
