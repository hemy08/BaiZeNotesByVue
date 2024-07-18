import * as monaco from 'monaco-editor'
import * as fileUtils from './utils/file-utils'
import * as dialogs from '../dialogs/dialogs'

// global-types.d.ts
declare global {
  interface MenuContext {
    label: string
    context: string
  }
  interface FileProperties {
    name: string
    path: string
    type: 'file' | 'folder'
    content: string
    children?: []
  }

  interface FileSysItem {
    id: never
    name: string
    path: string
    type: 'file' | 'folder'
    fileExtension: string
    isDirectory?: boolean
    isIndented?: boolean
    isExpanded?: boolean
    children?: {
      id: never
      name: string
      path: string
      fileExtension: string
      type: 'folder' | 'file'
      isDirectory: boolean
      isIndented: boolean
      isExpanded: boolean
      children?: never[]
    }[]
  }

  interface GlobalEmoji {
    file_icon: string
    folder_open: string
    folder_close: string
  }

  interface GlobalSvg {
    file_icon: string
    folder_collapse_close: string
    folder_collapse_open: string
    folder_open: string
    folder_close: string
    md_file_svg: string
    png_file_svg: string
    jpg_file_svg: string
  }

  interface GlobalEditToolBar {
    Font: string
  }

  interface Hemy {
    file: fileUtils
    dialog: dialogs
  }

  interface CryptoData {
    context: string
    secretKey: string
    secretKeyEncoding: BufferEncoding
    algorithm: string
    inputEncoding?: BufferEncoding
    outputEncoding?: BufferEncoding
    iv?: string
  }

  interface CryptoResult {
    context: string
    secretKey: string
    secretKeyEncoding: BufferEncoding
    iv: string
  }

  interface Global extends NodeJS.Global {
    current_active_file?: FileProperties // 使用 ? 表示它可能是 undefined
    ImagePath: string
    hemy: Hemy
    MainWindow: Electron.BrowserWindow
    MainShowWarn: string
    RootPath: string
    SavingFile: boolean
    SaveFileInterval: string
    srcDirCopyCut: string
    isCopyOrCut: 'copy' | 'cut'
    isCopyCutFile: boolean
    Emoji: GlobalEmoji
    FileMgrSvgs: GlobalSvg
    EditorToolBar: GlobalEditToolBar
    mdFileTree: ''
    MonacoEditorConfig: monaco.editor.IStandaloneEditorConstructionOptions
    KatexConfig: NonNullable<unknown>
    SupportLanguage: []
  }
}

export interface FileItem {
  name: string
  path: string
  type: 'file' | 'folder'
  isDirectory: boolean
  fileExtension: string
  children: FileItem[]
}
