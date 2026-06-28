import { appState } from './app-state'

export function globalInitialize(mainWindow: Electron.BrowserWindow) {
    appState.mainWindow = mainWindow
    appState.rootPath = ''
    appState.savingFile = false
    appState.saveFileInterval = '5000'
    appState.currentActiveFile = null
    appState.srcDirCopyCut = ''
    appState.isCopyOrCut = ''
}
