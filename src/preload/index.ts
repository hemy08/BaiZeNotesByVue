import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { IPC } from '../shared/ipc-channels'
import type { OpenRecentPayload, OpenRecentResult, RecentListResult } from '../shared/types'

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
        // P2-5：渲染层就绪握手——App.vue onMounted 注册完监听器后调用，
        // 主进程（main/index.ts）收到后才执行启动恢复（autoOpenLastFile/Folder）
        notifyRendererReady: (): void => {
            ipcRenderer.send(IPC.RENDER.READY)
        },
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
            return ipcRenderer.invoke(IPC.SYSTEM.APP_VERSION)
        }
    },

    // ========== 文件 API（「文件」菜单 → 最近文件/最近文件夹） ==========
    file: {
        /** 拉取最近文件与最近文件夹列表（各最多 20 项，最近的在前） */
        recentList: (): Promise<RecentListResult> => {
            return ipcRenderer.invoke(IPC.FILE.RECENT_LIST)
        },
        /** 打开最近文件/最近文件夹（主进程按当前最近列表做白名单校验后执行打开链路） */
        openRecent: (payload: OpenRecentPayload): Promise<OpenRecentResult> => {
            return ipcRenderer.invoke(IPC.FILE.OPEN_RECENT, payload)
        }
    }
}

// ============================================================
// 渲染层 IPC 通道白名单（2026-11-18，遗留清单 #4 / C-09）
//
// 背景：主窗口 preload 此前直接暴露 @electron-toolkit/preload 的全量 electronAPI，
// 渲染层可调用任意通道——若渲染层出现 XSS，将直达全量 IPC 能力（纵深防御缺口）。
// 本白名单按「渲染层实际调用」收集（src/renderer 全量扫描：send/invoke 与 on/once
// 两类方向），未知通道的 send/invoke/on 一律丢弃并告警。
//
// 维护约定：渲染层新增 IPC 调用时，必须同步登记到对应白名单，否则调用被丢弃；
// 白名单变更后运行 `npx vitest run tests/unit/preload-index.test.ts` 校验。
// ============================================================

/** 渲染层 → 主进程（send / invoke）允许通道：57 个 */
const ALLOWED_RENDERER_SEND_CHANNELS = new Set<string>([
    IPC.SETTING.AUTO_SAVE_CHANGED,
    IPC.EDITOR.FLUSH_CONTENT_DONE,
    IPC.EDITOR.GET_SETTING,
    IPC.FILE.CHECK_EXISTS,
    IPC.FILE.CREATE_FILE_FOLDER,
    IPC.FILE.GET_CURRENT_FILE_PATH,
    IPC.FILE.IMPORT_NEW_FILE,
    IPC.FILE.OPEN_IN_BROWSER,
    IPC.FILE.OPEN_SELECT_FILE,
    IPC.FILE.OPEN_SPECIFIC_FOLDER,
    IPC.FILE.READ_HTML,
    // 2026-11-18（遗留清单 #9）：PDF 预览经 pdf.js 需要读取原始二进制
    IPC.FILE.READ_BINARY,
    IPC.FILE.SAVE_TO_DISK,
    IPC.FILE.SELECT_DIRECTORY,
    IPC.FILE.SELECT_IMAGE,
    IPC.SYSTEM.SYSTEM_INFO,
    IPC.FILE.UPDATE_SELECT_FILE_CONTENT,
    IPC.FILE.WELCOME_OPEN_DIRECTORY,
    IPC.FILE.WELCOME_OPEN_FILE,
    IPC.FILE_MANAGER.COPY_FILE,
    IPC.FILE_MANAGER.COPY_FILELINK,
    IPC.FILE_MANAGER.COPY_IMAGELINK,
    IPC.FILE_MANAGER.COPY_RELATIVE_PATH,
    IPC.FILE_MANAGER.CREATE_FILE,
    IPC.FILE_MANAGER.CUT,
    IPC.FILE_MANAGER.DELETE,
    IPC.FILE_MANAGER.FIND_IN,
    IPC.FILE_MANAGER.IMPORT_FROM,
    IPC.FILE_MANAGER.OPEN_IN_EXPLORER,
    IPC.FILE_MANAGER.PASTE,
    IPC.FILE_MANAGER.RELOAD_FROM_DISK,
    IPC.FILE_MANAGER.RENAME,
    IPC.MENU.ACTION,
    IPC.NAVIGATION.OPEN_EXE,
    IPC.FILE.CONVERT_SAVE_ENCODING,
    IPC.FILE.REOPEN_WITH_ENCODING,
    IPC.PLUGIN.CRYPTO_DECRYPT,
    IPC.PLUGIN.CRYPTO_ENCRYPT,
    IPC.PLUGIN.HASH_TEXT,
    IPC.PLUGIN.HMAC_TEXT,
    IPC.PLUGIN.RSA_GENERATE,
    IPC.QUICK_LINKS.GET,
    IPC.QUICK_LINKS.SAVE,
    IPC.RENDER.INSERT_IMAGE,
    IPC.RENDER.PLANTUML_LOCAL,
    IPC.THEME.GET_ALL_MONACO_THEMES,
    IPC.THEME.GET_ALL_THEMES,
    IPC.THEME.GET_CURRENT_THEME_STYLES,
    IPC.THEME.LOAD_MONACO_THEME,
    IPC.THEME.UPDATE_THEME,
    IPC.WINDOW.CLOSE,
    IPC.WINDOW.GET_BOUNDS,
    IPC.WINDOW.IS_MAXIMIZED,
    IPC.WINDOW.MAXIMIZE,
    IPC.WINDOW.MINIMIZE,
    IPC.WINDOW.MOVE,
    IPC.WINDOW.SET_SIZE,
    IPC.WINDOW.TOGGLE_MAXIMIZE
])

/** 主进程 → 渲染层（on / once）允许通道：26 个 */
const ALLOWED_RENDERER_RECEIVE_CHANNELS = new Set<string>([
    IPC.DIALOG.OPEN_VUE_DIALOG,
    IPC.EDITOR.FLUSH_CONTENT,
    IPC.EDITOR.INIT_SETTING,
    IPC.SETTING.SYSTEM_SETTING_UPDATE,
    IPC.EDITOR.UPDATE_OPTIONS,
    IPC.EVENTS.FILE_CONTENT_RELOADED,
    IPC.EVENTS.FILE_SAVED_SUCCESS,
    IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT,
    IPC.EVENTS.STATUS_BAR_UPDATE,
    IPC.FILE.CLEAR_EDITOR_PREVIEW,
    IPC.FILE.USER_SELECT_FILE,
    IPC.FILE.WELCOME_ENTER_MAIN,
    IPC.FILE_MANAGER.FILE_SYSTEM_DATA,
    IPC.MONACO.AFTER_CURSOR,
    IPC.MONACO.TEXT_BLOCK_TEMPLATES,
    IPC.FILE.CONVERT_TO_ENCODING,
    IPC.FILE.OPEN_WITH_ENCODING,
    IPC.PLUGIN.RSA_RESULT,
    IPC.QUICK_LINKS.UPDATED,
    IPC.THEME.THEME_UPDATED,
    IPC.VIEW.EDIT_MODE,
    IPC.VIEW.EDIT_PREVIEW_MODE,
    IPC.VIEW.PREVIEW_MODE,
    IPC.VIEW.TOGGLE_RES_MANAGER,
    IPC.MONACO.UNDO_REDO
])

/** 渲染层可用的受限 ipcRenderer（send/invoke/on/once 校验白名单，退订不做限制） */
function createRestrictedIpcRenderer(): typeof electronAPI.ipcRenderer {
    const raw = electronAPI.ipcRenderer
    const restricted = {
        send: (channel: string, ...args: unknown[]): void => {
            if (!ALLOWED_RENDERER_SEND_CHANNELS.has(channel)) {
                console.warn(`[Preload] 已丢弃未登记的 IPC send 调用: ${channel}`)
                return
            }
            raw.send(channel, ...args)
        },
        invoke: (channel: string, ...args: unknown[]): Promise<unknown> => {
            if (!ALLOWED_RENDERER_SEND_CHANNELS.has(channel)) {
                console.warn(`[Preload] 已拒绝未登记的 IPC invoke 调用: ${channel}`)
                return Promise.reject(new Error(`[Preload] 未登记的 IPC 通道: ${channel}`))
            }
            return raw.invoke(channel, ...args)
        },
        on: (channel: string, listener: (...args: unknown[]) => void): void => {
            if (!ALLOWED_RENDERER_RECEIVE_CHANNELS.has(channel)) {
                console.warn(`[Preload] 已拒绝监听未登记的 IPC 通道: ${channel}`)
                return
            }
            raw.on(channel, listener)
        },
        once: (channel: string, listener: (...args: unknown[]) => void): void => {
            if (!ALLOWED_RENDERER_RECEIVE_CHANNELS.has(channel)) {
                console.warn(`[Preload] 已拒绝监听未登记的 IPC 通道: ${channel}`)
                return
            }
            raw.once(channel, listener)
        },
        removeListener: (channel: string, listener: (...args: unknown[]) => void): void => {
            raw.removeListener(channel, listener)
        },
        removeAllListeners: (channel: string): void => {
            raw.removeAllListeners(channel)
        }
    }
    // 受限对象只覆盖渲染层实际需要的同步/异步方法；sendTo/sendSync/postMessage 等不暴露
    return restricted as unknown as typeof electronAPI.ipcRenderer
}

// S-4：使用 contextBridge 暴露 Electron API 到渲染进程。
// 本项目所有窗口均启用 contextIsolation（src/main/index.ts 与 dialog-defaults.ts），
// 原“非 contextIsolated 直接挂 window”分支为死代码，已删除（原含 2 处 @ts-ignore）。
try {
    // 2026-11-18（#4）：暴露受限 ipcRenderer（其余 toolkit 成员 webFrame/webUtils/process 原样保留）
    const exposedElectronAPI = {
        ...electronAPI,
        ipcRenderer: createRestrictedIpcRenderer()
    }
    contextBridge.exposeInMainWorld('electron', exposedElectronAPI)
    contextBridge.exposeInMainWorld('api', api)
} catch (error) {
    console.error(error)
}
