import { contextBridge, ipcRenderer, shell } from 'electron'
import { IPC } from '../shared/ipc-channels'

// ARC-01：对话框窗口 send 通道白名单。
// 仅放行 src/main/dialogs 各对话框 HTML 实际使用的通道（grep 实测），
// 未知通道一律丢弃并告警——即使将来有远程/不可信 HTML 复用本 preload，
// 也无法通过 send 调用任意能力型 IPC 通道（如 navi-tab-open-exe）。
// C-08 起 OpenOnlineWebPages 的远程网页窗口已不再加载任何 preload（本白名单为纵深防御）。
// ARC-03：通道名一律引用共享常量（ipc-channels.ts），不再写字面量。
// P2 死代码清理：白名单只保留当前可达 JSDOM 对话框（新建文件/文件夹、重命名）
// 实际使用的通道；随 8 个不可达对话框删除的通道条目（编辑器设置/字体选择/
// 导入选项/快速链接/系统设置/主题设置/Mermaid 隐藏窗口/主题广播）已移除。
const ALLOWED_SEND_CHANNELS = new Set<string>([
    // 新建文件/文件夹对话框（ShowCreateFileFolderDialog）
    IPC.DIALOG.CREATE_FILE_FOLDER_ENTER,
    // 重命名对话框（ShowRenameDialog）
    IPC.DIALOG.RENAME_FILE_FOLDER_ENTER
])

// 2026-11-19（P3 纵深防御）：对话框接收（on/once）通道白名单。
// JSDOM 对话框目前只订阅主题切换广播（THEME_UPDATED，主题设置立即生效）；
// 未知通道一律丢弃并告警——即使不可信 HTML 复用本 preload 也无法嗅探任意广播。
const ALLOWED_RECEIVE_CHANNELS = new Set<string>([IPC.THEME.THEME_UPDATED])

// P0 安全（shell 协议白名单）：对话框窗口的 openExternal 只允许 http/https。
// 被加载的不可信 HTML（历史上 OpenOnlineWebPages 的远程页面就使用本 preload）即使能调用
// electronAPI.shell.openExternal，也无法触发 file:/javascript:/data:/自定义协议打开，
// 避免把本地文件或可执行内容交给系统默认程序。
const ALLOWED_EXTERNAL_PROTOCOLS = new Set<string>(['http:', 'https:'])

function normalizeAllowedExternalUrl(url: string): string | null {
    if (typeof url !== 'string' || url.trim().length === 0) {
        return null
    }
    try {
        const parsed = new URL(url)
        return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol) ? parsed.href : null
    } catch {
        return null
    }
}

/**
 * P2 修复（2026-11-18，遗留清单 #5/C-02）：on 的包装函数与 removeListener 必须引用同一实例。
 * 原实现 `on` 内部包装 callback、`removeListener` 却传原始 callback 给 ipcRenderer，
 * 导致退订永远无效（内存泄漏/重复回调）。这里按 (channel, callback) 缓存包装函数。
 */
const listenerWrappers = new Map<
    string,
    Map<(...args: unknown[]) => void, (event: unknown, ...args: unknown[]) => void>
>()

function addWrappedListener(channel: string, callback: (...args: unknown[]) => void): void {
    let perChannel = listenerWrappers.get(channel)
    if (!perChannel) {
        perChannel = new Map()
        listenerWrappers.set(channel, perChannel)
    }
    // 2026-11-19 修复：同一 callback 重复 on 时复用既有 wrapper——
    // 原实现直接覆盖 Map 值并再注册一个新 wrapper，首个 wrapper 永不退订（泄漏）。
    if (perChannel.has(callback)) {
        return
    }
    const wrapped = (_event: unknown, ...args: unknown[]): void => callback(...args)
    perChannel.set(callback, wrapped)
    ipcRenderer.on(channel, wrapped)
}

function removeWrappedListener(channel: string, callback: (...args: unknown[]) => void): void {
    const perChannel = listenerWrappers.get(channel)
    const wrapped = perChannel?.get(callback)
    if (wrapped) {
        ipcRenderer.removeListener(channel, wrapped)
        perChannel?.delete(callback)
        if (perChannel?.size === 0) {
            listenerWrappers.delete(channel)
        }
        return
    }
    // 兼容直接以原始函数退订的历史调用（未经过 on 包装时按原样委托）
    ipcRenderer.removeListener(channel, callback)
}

const dialogApi = {
    ipcRenderer: {
        send: (channel: string, ...args: unknown[]): void => {
            // ARC-01：send 通道白名单，未知通道丢弃并告警
            if (!ALLOWED_SEND_CHANNELS.has(channel)) {
                console.warn(`[DialogPreload] 已丢弃未知 IPC 通道的 send 调用: ${channel}`)
                return
            }
            ipcRenderer.send(channel, ...args)
        },
        on: (channel: string, callback: (...args: unknown[]) => void): void => {
            // 2026-11-19：接收通道白名单（未知通道丢弃，避免不可信页面嗅探广播）
            if (!ALLOWED_RECEIVE_CHANNELS.has(channel)) {
                console.warn(`[DialogPreload] 已丢弃未知 IPC 通道的 on 订阅: ${channel}`)
                return
            }
            addWrappedListener(channel, callback)
        },
        removeListener: (channel: string, callback: (...args: unknown[]) => void): void => {
            removeWrappedListener(channel, callback)
        }
    },
    shell: {
        openExternal: async (url: string): Promise<void> => {
            const normalized = normalizeAllowedExternalUrl(url)
            if (normalized === null) {
                console.warn(
                    `[DialogPreload] 已拒绝打开非 http/https 协议的外部链接: ${String(url)}`
                )
                return
            }
            await shell.openExternal(normalized)
        }
    }
}

if (process.contextIsolated) {
    try {
        contextBridge.exposeInMainWorld('electronAPI', dialogApi)
    } catch (error) {
        console.error(error)
    }
}
