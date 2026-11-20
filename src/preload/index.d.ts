import { ElectronAPI } from '@electron-toolkit/preload'
import type {
    AppVersionInfo,
    ConfigName,
    ConfigReadMap,
    ConfigWriteMap,
    OpenRecentPayload,
    OpenRecentResult,
    RecentListResult
} from '../shared/types'

/**
 * 渲染进程暴露的配置 API。
 *
 * 两个签名并存（第 2 批契约重构，灰度过渡）：
 * 1. 新签名：按 `ConfigName` 字面量自动推断主进程**实际读取/写入形状**，
 *    新代码直接 `read('editor')` 即可拿到 `RendererEditorConfig`，无需手写泛型断言；
 * 2. 兼容签名：保留历史 `<T = unknown>(configName: string)` 泛型写法（当前渲染层
 *    75 处调用点尚未批量替换，且部分调用方只关心局部字段，如 `Pick<SystemSetting, ...>`）；
 *    显式传入非 ConfigName 的类型实参时自动回退到该签名。
 *
 * 形状真源：`src/shared/types/config.ts`（ConfigReadMap / ConfigWriteMap）。
 */
interface ApiConfig {
    /** 读取配置：按配置名推断主进程实际返回形状（不存在/读取失败返回 null） */
    read<K extends ConfigName>(configName: K): Promise<ConfigReadMap[K] | null>
    /** 兼容旧签名：泛型指定期望结构（历史调用点过渡用，不做形状校验） */
    read<T = unknown>(configName: string): Promise<T | null>
    /** 写入配置：按配置名约束载荷形状（主进程失败返回 false，不抛异常） */
    write<K extends ConfigName>(configName: K, data: ConfigWriteMap[K]): Promise<boolean>
    /** 兼容旧签名：泛型指定载荷结构（历史调用点过渡用） */
    write<T = unknown>(configName: string, data: T): Promise<boolean>
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
    /** 读取应用/运行时版本信息（SYSTEM.APP_VERSION 通道，形状见 shared AppVersionInfo） */
    getVersion: () => Promise<AppVersionInfo>
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
 * 主窗口暴露的 electron 对象（2026-11-19 类型收口 + P2-2 2026-11-20 最小暴露面）：
 * 运行时只暴露受限 ipcRenderer（send/invoke/on/once/removeListener/removeAllListeners），
 * `process`/`webFrame`/`webUtils` 等 toolkit 成员已不再暴露（渲染层零使用）。
 * 类型层同步去掉未暴露的成员，避免渲染层在类型检查通过的情况下调用运行时不存在的 API。
 */
type MainWindowElectronAPI = {
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
