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

/**
 * 主窗口暴露的 electron 对象（2026-11-19 类型收口）：toolkit ElectronAPI 运行时
 * 已由 preload 白名单限制为 send/invoke/on/once/removeListener/removeAllListeners，
 * 类型层同步去掉未暴露的 sendTo / sendSync / sendToHost / postMessage，避免渲染层
 * 在类型检查通过的情况下调用运行时不存在的 API。
 */
type MainWindowElectronAPI = Omit<ElectronAPI, 'ipcRenderer'> & {
    ipcRenderer: Omit<
        ElectronAPI['ipcRenderer'],
        'sendTo' | 'sendSync' | 'sendToHost' | 'postMessage'
    >
}

declare global {
    interface Window {
        electron: MainWindowElectronAPI
        api: Api
        electronAPI: DialogApi
    }
}
