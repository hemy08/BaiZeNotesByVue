import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc-channels'

/**
 * 将渲染层传入的值归一化为「可结构化克隆」的纯 JSON 值。
 *
 * 背景（2026-11-15 实机问题）：渲染层常用 Vue 的 reactive/ref（如
 * `useConfigStore` 的 `themeConfig.value`）直接调用 `window.api.config.write`，
 * 其底层是 Proxy；Electron 的 IPC 序列化（结构化克隆）不支持 Proxy，
 * 会抛 `An object could not be cloned`，表现为「配置写入磁盘失败」弹窗。
 * 配置本身以 JSON 落盘，因此用 JSON 往返做归一化（同时剥离函数/undefined 等
 * 不可克隆值）是安全且语义等价的；对无法序列化的值回退原值，让主进程侧报错。
 */
function toCloneablePlain<T>(value: T): T {
    try {
        return JSON.parse(JSON.stringify(value)) as T
    } catch {
        return value
    }
}

// Custom APIs for renderer
const api = {
    // ========== 配置文件 API ==========
    config: {
        // 读取配置（泛型指定期望的配置结构）
        read: <T = unknown>(configName: string): Promise<T | null> => {
            return ipcRenderer.invoke(IPC.CONFIG.READ, configName)
        },
        // 写入配置（先归一化为纯 JSON，避免 Vue Proxy 触发结构化克隆错误）
        write: <T = unknown>(configName: string, data: T): Promise<boolean> => {
            return ipcRenderer.invoke(IPC.CONFIG.WRITE, configName, toCloneablePlain(data))
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
            return ipcRenderer.invoke(IPC.FILE.APP_VERSION)
        }
    }
}

// S-4：使用 contextBridge 暴露 Electron API 到渲染进程。
// 本项目所有窗口均启用 contextIsolation（src/main/index.ts 与 dialog-defaults.ts），
// 原“非 contextIsolated 直接挂 window”分支为死代码，已删除（原含 2 处 @ts-ignore）。
try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
} catch (error) {
    console.error(error)
}
