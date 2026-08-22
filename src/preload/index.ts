import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // ========== 配置文件 API ==========
  config: {
    // 读取配置
    read: (configName: string): Promise<any> => {
      return ipcRenderer.invoke('config:read', configName)
    },
    // 写入配置
    write: (configName: string, data: any): Promise<boolean> => {
      return ipcRenderer.invoke('config:write', configName, data)
    },
    // 删除配置
    delete: (configName: string): Promise<boolean> => {
      return ipcRenderer.invoke('config:delete', configName)
    },
    // 列出所有配置
    list: (): Promise<string[]> => {
      return ipcRenderer.invoke('config:list')
    }
  },

  // ========== 应用信息 API ==========
  app: {
    // 获取应用版本信息
    getVersion: (): Promise<{
      appVersion: string
      electronVersion: string
      chromeVersion: string
      nodeVersion: string
      vueVersion: string
      viteVersion: string
      typescriptVersion: string
      monacoEditorVersion: string
      markdownItVersion: string
    }> => {
      return ipcRenderer.invoke('app:get-version')
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
