/**
 * 主题系统相关的 Preload API 补充
 * 在 src/preload/index.ts 中添加
 */
import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// --- 主题相关的 API ---
const themeAPI = {
  // 获取当前配置
  getThemeConfig: async (): Promise<{
    currentTheme: string
    separateEditorTheme: boolean
    editorTheme: string
  }> => {
    return await ipcRenderer.invoke('theme:get-config')
  },
  
  // 获取所有应用主题
  getAllThemes: async (): Promise<Array<{
    type: string
    styles: {
      name: string
      backgroundColor: string
      cardBackground: string
      textColor: string
      // ... 其他字段
    }
  }>> => {
    return await ipcRenderer.invoke('theme:get-all-themes')
  },
  
  // 获取所有 Monaco 主题
  getAllMonacoThemes: async (): Promise<Array<{
    type: string
    name: string
    colors: any
  }>> => {
    return await ipcRenderer.invoke('theme:get-all-monaco-themes')
  },
  
  // 设置应用主题
  setTheme: (themeType: string): Promise<void> => {
    return ipcRenderer.invoke('theme:set-theme', themeType)
  },
  
  // 设置单独编辑器主题
  setSeparateEditorTheme: (separate: boolean): Promise<void> => {
    return ipcRenderer.invoke('theme:set-separate', separate)
  },
  
  // 设置编辑器主题
  setMonacoTheme: (themeType: string): Promise<void> => {
    return ipcRenderer.invoke('theme:set-monaco-theme', themeType)
  },
  
  // 完整设置（兼容现有协议）
  setThemeConfig: (config: {
    themeType?: string
    separateEditorTheme?: boolean
    monacoTheme?: string
  }): Promise<void> => {
    return ipcRenderer.invoke('theme:set-config', config)
  },
  
  // 监听主题更新（保持现有协议）
  onThemeUpdated: (callback: (data: any) => void) => {
    const handler = (_event: any, data: any) => callback(data)
    ipcRenderer.on('baize-notes:theme-updated', handler)
    return () => {
      ipcRenderer.removeListener('baize-notes:theme-updated', handler)
    }
  }
}

// 显示对话框的 API
const dialogAPI = {
  // 显示主题设置对话框（或者通过 Modal 实现）
  openThemeSettings: (): Promise<void> => {
    return ipcRenderer.invoke('dialog:open-theme-settings')
  },
  
  // 关闭主题设置对话框
  closeThemeSettings: (): Promise<void> => {
    return ipcRenderer.invoke('dialog:close-theme-settings')
  }
}

// 最终暴露的 API
const api = {
  // 保留现有空对象或者合并现有功能
  // ... 现有的
  
  // 新增主题系统 API
  theme: themeAPI,
  dialog: dialogAPI
}

// ContextBridge 暴露
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
