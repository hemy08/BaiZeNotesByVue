import { ElectronAPI } from '@electron-toolkit/preload'

/** 渲染进程暴露的配置 API（泛型指定期望的配置结构） */
interface ApiConfig {
    read: <T = unknown>(configName: string) => Promise<T | null>
    write: <T = unknown>(configName: string, data: T) => Promise<boolean>
}

/** 渲染进程暴露的应用信息 API */
interface ApiApp {
    /** P2-5：渲染层就绪握手（App.vue onMounted 完成后调用，通知主进程执行启动恢复） */
    notifyRendererReady: () => void
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
}

declare global {
    interface Window {
        electron: ElectronAPI
        api: Api
        electronAPI: DialogApi
    }
}
