/**
 * 对话框窗口测试环境（FakeBrowserWindow / ipcMain / dialog / shell / app 通用 mock）
 *
 * 供 tests/unit 下各 Show*Dialog / Open* 测试共用，替代原先逐文件复制的
 * electron mock 样板（CQ-06 去重 + no-explicit-any 清零）：
 * - FakeBrowserWindow：捕获构造 options、注册 loadURL/loadFile/show 等调用，
 *   并记录 window.on / webContents.on 的监听器供测试手动触发；
 * - ipcMain：按 channel 记录监听器，removeListener/removeAllListeners 真实生效；
 * - getLoadedHtml / triggerIpc / makeMainWindow：各测试共用的断言辅助函数。
 *
 * 类型纪律：全部签名使用 unknown[]/具体结构，不出现 any。
 */
import { vi } from 'vitest'

/** Electron 风格通用监听器：参数随通道/事件语义各异，统一用 unknown[] 承载 */
export type GenericListener = (...args: unknown[]) => void

export interface FakeWebContents {
    send: ReturnType<typeof vi.fn>
    executeJavaScript: ReturnType<typeof vi.fn>
    insertCSS: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
}

export interface FakeBrowserWindow {
    options: Record<string, unknown>
    listeners: Map<string, GenericListener[]>
    webListeners: Map<string, GenericListener[]>
    destroyed: boolean
    setMenu: ReturnType<typeof vi.fn>
    loadURL: ReturnType<typeof vi.fn>
    loadFile: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
    webContents: FakeWebContents
    isDestroyed(): boolean
    close(): void
    on(event: string, cb: GenericListener): void
    emit(event: string, ...args: unknown[]): void
    emitWeb(event: string, ...args: unknown[]): void
}

export interface FakeMainWindow {
    destroyed: boolean
    webContents: {
        send: ReturnType<typeof vi.fn>
        insertCSS: ReturnType<typeof vi.fn>
    }
    isDestroyed(): boolean
}

/**
 * 创建一份独立的对话框测试环境（在 vi.hoisted 内调用，
 * 再经 vi.mock('electron', ...) 挂载）。
 */
export function createDialogEnv() {
    const windows: FakeBrowserWindow[] = []
    const ipcListeners = new Map<string, GenericListener[]>()
    const showMessageBox = vi.fn()
    const showSaveDialog = vi.fn()
    const openExternal = vi.fn()

    class MockBrowserWindow implements FakeBrowserWindow {
        options: Record<string, unknown>
        listeners = new Map<string, GenericListener[]>()
        webListeners = new Map<string, GenericListener[]>()
        destroyed = false
        setMenu = vi.fn()
        loadURL = vi.fn()
        loadFile = vi.fn()
        show = vi.fn()
        focus = vi.fn()
        webContents: FakeWebContents

        constructor(options: Record<string, unknown>) {
            this.options = options
            this.webContents = {
                send: vi.fn(),
                executeJavaScript: vi.fn(),
                insertCSS: vi.fn(),
                on: vi.fn((event: string, cb: GenericListener) => {
                    const list = this.webListeners.get(event) || []
                    list.push(cb)
                    this.webListeners.set(event, list)
                })
            }
            windows.push(this)
        }

        static getAllWindows(): FakeBrowserWindow[] {
            return windows
        }

        isDestroyed(): boolean {
            return this.destroyed
        }

        close(): void {
            if (this.destroyed) return
            this.destroyed = true
            for (const cb of this.listeners.get('closed') || []) {
                cb()
            }
        }

        on(event: string, cb: GenericListener): void {
            const list = this.listeners.get(event) || []
            list.push(cb)
            this.listeners.set(event, list)
        }

        emit(event: string, ...args: unknown[]): void {
            for (const cb of this.listeners.get(event) || []) {
                cb(...args)
            }
        }

        emitWeb(event: string, ...args: unknown[]): void {
            for (const cb of this.webListeners.get(event) || []) {
                cb(...args)
            }
        }
    }

    const ipcMain = {
        on: vi.fn((channel: string, cb: GenericListener) => {
            const list = ipcListeners.get(channel) || []
            list.push(cb)
            ipcListeners.set(channel, list)
        }),
        removeListener: vi.fn((channel: string, cb: GenericListener) => {
            const list = ipcListeners.get(channel) || []
            const idx = list.indexOf(cb)
            if (idx !== -1) list.splice(idx, 1)
        }),
        removeAllListeners: vi.fn((channel?: string) => {
            if (channel) ipcListeners.delete(channel)
            else ipcListeners.clear()
        }),
        once: vi.fn(),
        handle: vi.fn()
    }

    const appMock = {
        getPath: vi.fn(() => ''),
        getVersion: vi.fn(() => '1.0.0'),
        getName: vi.fn(() => 'baize')
    }

    return {
        windows,
        ipcListeners,
        showMessageBox,
        showSaveDialog,
        openExternal,
        ipcMain,
        app: appMock,
        MockBrowserWindow
    }
}

export type DialogTestEnv = ReturnType<typeof createDialogEnv>

/** 取出窗口 loadURL 的 data: URL 并解码 HTML 内容 */
export function getLoadedHtml(win: FakeBrowserWindow): string {
    const url = win.loadURL.mock.calls[0][0] as string
    return decodeURIComponent(url.substring(url.indexOf(',') + 1))
}

/** 触发主进程 ipcMain.on 注册的监听器（首参为伪造的 IpcMainEvent） */
export function triggerIpc(env: DialogTestEnv, channel: string, ...args: unknown[]): void {
    const listeners = env.ipcListeners.get(channel) || []
    for (const cb of listeners) {
        cb({ sender: {} }, ...args)
    }
}

/** 构造最小主窗口 mock（供"通知主窗口渲染层"断言使用） */
export function makeMainWindow(): FakeMainWindow {
    return {
        destroyed: false,
        webContents: { send: vi.fn(), insertCSS: vi.fn() },
        isDestroyed() {
            return this.destroyed
        }
    }
}
