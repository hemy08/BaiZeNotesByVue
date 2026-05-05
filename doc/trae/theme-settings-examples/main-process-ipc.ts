/**
 * 主题系统主进程 IPC 监听器
 * 在 src/main/themes 或 src/main/dialogs 中添加
 * 保持与现有 baize-notes:theme-update 协议的兼容性！
 */
import { ipcMain, BrowserWindow } from 'electron'
import {
  getCurrentTheme,
  setTheme,
  getAllThemes,
  getAllMonacoThemes,
  getSeparateEditorTheme,
  setSeparateEditorTheme,
  getMonacoTheme,
  setMonacoTheme,
  getCurrentThemeStyles,
  getThemeConfig,
  ThemeConfig
} from '../../src/main/themes/theme-config'
import { ipcListenerManager } from '../../src/main/settings/ipc-listener-manager'

const COMPONENT_ID = 'theme-system-ipc'

/**
 * 广播主题更新到所有窗口（保持现有协议）
 */
function broadcastThemeUpdate(
  themeType?: string,
  separateEditorTheme?: boolean,
  monacoTheme?: string,
  themeStyles?: any
) {
  const data: any = {}
  
  if (themeType !== undefined) data.themeType = themeType
  if (separateEditorTheme !== undefined) data.separateEditorTheme = separateEditorTheme
  if (monacoTheme !== undefined) data.monacoTheme = monacoTheme
  if (themeStyles !== undefined) data.themeStyles = themeStyles
  
  // 广播到所有窗口
  BrowserWindow.getAllWindows().forEach(window => {
    if (!window.isDestroyed()) {
      window.webContents.send('baize-notes:theme-updated', data)
    }
  })
}

/**
 * 注册主题系统的 IPC 监听器
 * 既支持新的 invoke API，也兼容现有的 send！
 */
export function registerThemeSystemIpc() {
  // 1. 兼容现有的 baize-notes:theme-update（保持不变！）
  ipcListenerManager.register(
    'baize-notes:theme-update',
    (_, payload: {
      themeType?: string
      separateEditorTheme?: boolean
      monacoTheme?: string
    }) => {
      console.log('收到主题更新（兼容协议）', payload)
      
      if (payload.themeType !== undefined) {
        setTheme(payload.themeType as any)
      }
      
      if (payload.separateEditorTheme !== undefined) {
        setSeparateEditorTheme(payload.separateEditorTheme)
      }
      
      if (payload.monacoTheme !== undefined) {
        setMonacoTheme(payload.monacoTheme as any)
      }
      
      // 获取最新状态并广播
      const config = getThemeConfig()
      const themeStyles = getCurrentThemeStyles()
      broadcastThemeUpdate(
        config.currentTheme,
        config.separateEditorTheme,
        config.editorTheme,
        themeStyles
      )
    },
    COMPONENT_ID
  )
  
  // 2. 新增：Promise 风格的 invoke API
  // 获取配置
  ipcMain.handle('theme:get-config', () => {
    const config = getThemeConfig()
    return {
      currentTheme: config.currentTheme,
      separateEditorTheme: config.separateEditorTheme,
      editorTheme: config.editorTheme
    }
  })
  
  // 获取所有主题
  ipcMain.handle('theme:get-all-themes', () => {
    return getAllThemes()
  })
  
  // 获取所有 Monaco 主题
  ipcMain.handle('theme:get-all-monaco-themes', () => {
    return getAllMonacoThemes()
  })
  
  // 设置应用主题
  ipcMain.handle('theme:set-theme', (_, themeType: string) => {
    setTheme(themeType as any)
    const config = getThemeConfig()
    const themeStyles = getCurrentThemeStyles()
    broadcastThemeUpdate(config.currentTheme, config.separateEditorTheme, config.editorTheme, themeStyles)
  })
  
  // 设置单独编辑器主题
  ipcMain.handle('theme:set-separate', (_, separate: boolean) => {
    setSeparateEditorTheme(separate)
    const config = getThemeConfig()
    const themeStyles = getCurrentThemeStyles()
    broadcastThemeUpdate(config.currentTheme, config.separateEditorTheme, config.editorTheme, themeStyles)
  })
  
  // 设置编辑器主题
  ipcMain.handle('theme:set-monaco-theme', (_, themeType: string) => {
    setMonacoTheme(themeType as any)
    const config = getThemeConfig()
    const themeStyles = getCurrentThemeStyles()
    broadcastThemeUpdate(config.currentTheme, config.separateEditorTheme, config.editorTheme, themeStyles)
  })
  
  // 完整配置更新
  ipcMain.handle('theme:set-config', (_, payload: any) => {
    if (payload.themeType !== undefined) {
      setTheme(payload.themeType as any)
    }
    if (payload.separateEditorTheme !== undefined) {
      setSeparateEditorTheme(payload.separateEditorTheme)
    }
    if (payload.monacoTheme !== undefined) {
      setMonacoTheme(payload.monacoTheme as any)
    }
    const config = getThemeConfig()
    const themeStyles = getCurrentThemeStyles()
    broadcastThemeUpdate(config.currentTheme, config.separateEditorTheme, config.editorTheme, themeStyles)
  })
}

/**
 * 清理主题系统的 IPC 监听器
 */
export function cleanupThemeSystemIpc() {
  ipcListenerManager.cleanupComponent(COMPONENT_ID)
  // 清理 handle 需要额外处理...
  // ipcMain.removeHandler('theme:get-config')
  // ...
}
