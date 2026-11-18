import { ElectronAPI } from '@electron-toolkit/preload'
import type { OpenRecentPayload, OpenRecentResult, RecentListResult } from '../shared/types'

/** 渲染进程暴露的配置 API（泛型指定期望的配置结构） */
interface ApiConfig {
    read: <T = unknown>(configName: string) => Promise<T | null>
    write: <T = unknown>(configName: string, data: T) => Promise<boolean>
}

/** 渲染进程暴露的文件 API（「文件」菜单 → 最近文件/最近文件夹） */
interface ApiFile {
    /** 拉取最近文件与最近文件夹列表（各最多 20 项，最近的在前） */
    recentList: () => Promise<RecentListResult>
    /** 打开最近文件/最近文件夹（主进程按当前最近列表做白名单校验后执行打开链路） */
    openRecent: (payload: OpenRecentPayload) => Promise<OpenRecentResult>
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
    file: ApiFile
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
