import { appState } from './app-state'

/**
 * 应用全局初始化：把主窗口与运行时状态重置为启动默认值。
 *
 * ARC-22：已删除 `appState.saveFileInterval = '5000'` 的魔法值字符串遗留——
 * 该字段的默认值由 AppState 构造器统一提供，自动保存启动时由
 * auto-save.ts 按真实间隔覆盖写入，此处重复硬编码 '5000' 只会造成两份真源。
 */
export function globalInitialize(mainWindow: Electron.BrowserWindow) {
    appState.mainWindow = mainWindow
    appState.rootPath = ''
    appState.savingFile = false
    appState.currentActiveFile = null
    appState.srcDirCopyCut = ''
    appState.isCopyOrCut = ''
}
