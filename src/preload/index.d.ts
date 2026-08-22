import { ElectronAPI } from '@electron-toolkit/preload'

/** 渲染进程暴露的配置 API */
interface ApiConfig {
  read: (configName: string) => Promise<any>
  write: (configName: string, data: any) => Promise<boolean>
  delete: (configName: string) => Promise<boolean>
  list: () => Promise<string[]>
}

/** 渲染进程暴露的应用信息 API */
interface ApiApp {
  getVersion: () => Promise<{
    appVersion: string
    electronVersion: string
    chromeVersion: string
    nodeVersion: string
    vueVersion: string
    viteVersion: string
    typescriptVersion: string
    monacoEditorVersion: string
    markdownItVersion: string
  }>
}

/** 渲染进程暴露的全局 API */
interface Api {
  config: ApiConfig
  app: ApiApp
}

/** 对话框窗口暴露的 IPC API */
interface DialogIpcRenderer {
  send: (channel: string, ...args: unknown[]) => void
  on: (channel: string, callback: (...args: unknown[]) => void) => void
  removeListener: (channel: string, callback: (...args: unknown[]) => void) => void
}

/** 对话框窗口暴露的 electronAPI */
interface DialogApi {
  ipcRenderer: DialogIpcRenderer
  shell: {
    openExternal: (url: string) => Promise<void>
  }
  broadcastTheme: (themeData: unknown) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: Api
    electronAPI: DialogApi
  }
}
