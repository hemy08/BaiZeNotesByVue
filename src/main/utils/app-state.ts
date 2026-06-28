import { BrowserWindow } from 'electron'

interface StoreFileProperties {
  name: string
  path: string
  type: string
  content?: string
  children?: []
  [key: string]: any
}

class AppState {
  private _mainWindow: BrowserWindow | null = null
  private _rootPath = ''
  private _currentActiveFile: StoreFileProperties | null = null
  private _savingFile = false
  private _saveFileInterval = '5000'
  private _srcDirCopyCut = ''
  private _isCopyOrCut = ''
  private _mdFileTree: any = null

  get mainWindow(): BrowserWindow | null {
    return this._mainWindow
  }

  set mainWindow(win: BrowserWindow | null) {
    this._mainWindow = win
  }

  get rootPath(): string {
    return this._rootPath
  }

  set rootPath(path: string) {
    this._rootPath = path
  }

  get currentActiveFile(): StoreFileProperties | null {
    return this._currentActiveFile
  }

  set currentActiveFile(file: StoreFileProperties | null) {
    this._currentActiveFile = file
  }

  get savingFile(): boolean {
    return this._savingFile
  }

  set savingFile(val: boolean) {
    this._savingFile = val
  }

  get saveFileInterval(): string {
    return this._saveFileInterval
  }

  set saveFileInterval(val: string) {
    this._saveFileInterval = val
  }

  get srcDirCopyCut(): string {
    return this._srcDirCopyCut
  }

  set srcDirCopyCut(val: string) {
    this._srcDirCopyCut = val
  }

  get isCopyOrCut(): string {
    return this._isCopyOrCut
  }

  set isCopyOrCut(val: string) {
    this._isCopyOrCut = val
  }

  get mdFileTree(): any {
    return this._mdFileTree
  }

  set mdFileTree(val: any) {
    this._mdFileTree = val
  }
}

export const appState = new AppState()
