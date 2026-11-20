/**
 * preload/index.ts 单元测试
 * 覆盖：contextBridge 暴露的 API 名称集合（electron/api）、
 * config 组 invoke 通道（read/write）、app.getVersion 通道、
 * 「文件」菜单最近文件/最近文件夹通道（file.recentList / file.openRecent）
 * （P2：CONFIG.DELETE / CONFIG.LIST 死通道及 config.delete/list 方法已删除）
 */
import { describe, it, expect, vi } from 'vitest'
import { reactive, isProxy } from 'vue'

const preloadMocks = vi.hoisted(() => ({
    exposeInMainWorld: vi.fn(),
    invoke: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    once: vi.fn(),
    removeListener: vi.fn(),
    removeAllListeners: vi.fn()
}))

vi.mock('electron', () => ({
    contextBridge: { exposeInMainWorld: preloadMocks.exposeInMainWorld },
    ipcRenderer: { invoke: preloadMocks.invoke, send: preloadMocks.send }
}))

// mock @electron-toolkit/preload 的 electronAPI（含 ipcRenderer，供受限包装使用）。
// P2-2：toolkit 的其余成员（process 含全量 env / webFrame / webUtils）必须不再被展开暴露，
// 这里显式提供这些「诱饵」字段，单测断言它们不会出现在 window.electron 上。
vi.mock('@electron-toolkit/preload', () => ({
    electronAPI: {
        toolkitApi: true,
        process: {
            env: { BAIZE_LEAKED_TOKEN: 'should-not-be-exposed' },
            platform: 'win32',
            versions: { electron: '43.0.0' }
        },
        webFrame: { insertCSS: vi.fn(), setZoomFactor: vi.fn() },
        webUtils: { getPathForFile: vi.fn() },
        ipcRenderer: {
            send: preloadMocks.send,
            invoke: preloadMocks.invoke,
            on: preloadMocks.on,
            once: preloadMocks.once,
            removeListener: preloadMocks.removeListener,
            removeAllListeners: preloadMocks.removeAllListeners
        }
    }
}))

import '../../src/preload/index'

// 从 exposeInMainWorld 调用记录中取出暴露的 api 对象
function getExposedApi(): {
    config: {
        read: (name: string) => Promise<unknown>
        write: (name: string, data: unknown) => Promise<boolean>
    }
    app: { getVersion: () => Promise<unknown>; notifyRendererReady: () => void }
    file: {
        recentList: () => Promise<unknown>
        openRecent: (payload: { kind: 'file' | 'folder'; path: string }) => Promise<unknown>
    }
} {
    const call = preloadMocks.exposeInMainWorld.mock.calls.find(([key]) => key === 'api')
    expect(call, '应存在 exposeInMainWorld("api", ...) 调用').toBeDefined()
    return call![1]
}

// 从 exposeInMainWorld 调用记录中取出暴露的 electron 对象（#4 起为受限包装；
// P2-2 起只允许 ipcRenderer 一个成员，故返回类型带索引签名以便断言「不存在」）
function getExposedElectron(): Record<string, unknown> & {
    ipcRenderer: {
        send: (channel: string, ...args: unknown[]) => void
        invoke: (channel: string, ...args: unknown[]) => Promise<unknown>
        on: (channel: string, listener: (...args: unknown[]) => void) => void
        once: (channel: string, listener: (...args: unknown[]) => void) => void
        removeListener: (channel: string, listener: (...args: unknown[]) => void) => void
        removeAllListeners: (channel?: string) => void
    }
} {
    const call = preloadMocks.exposeInMainWorld.mock.calls.find(([key]) => key === 'electron')
    expect(call, '应存在 exposeInMainWorld("electron", ...) 调用').toBeDefined()
    return call![1]
}

describe('preload/index', () => {
    it('should expose only the restricted ipcRenderer under the electron key (P2-2)', () => {
        const exposed = getExposedElectron()
        // P2-2：不再展开 toolkit electronAPI——electron 对象只应有 ipcRenderer 一个成员
        expect(Object.keys(exposed)).toEqual(['ipcRenderer'])
        // 2026-11-18（#4）：ipcRenderer 为白名单受限包装（send/invoke/on 均为函数）
        expect(typeof exposed.ipcRenderer.send).toBe('function')
        expect(typeof exposed.ipcRenderer.invoke).toBe('function')
        expect(typeof exposed.ipcRenderer.on).toBe('function')
    })

    it('should not expose process.env / webFrame / webUtils to the renderer (P2-2)', () => {
        const exposed = getExposedElectron()
        expect('process' in exposed).toBe(false)
        expect('webFrame' in exposed).toBe(false)
        expect('webUtils' in exposed).toBe(false)
        expect('toolkitApi' in exposed).toBe(false)
        expect(exposed.process).toBeUndefined()
        expect(exposed.webFrame).toBeUndefined()
        expect(exposed.webUtils).toBeUndefined()
        // 双重断言：即使通过可选链也拿不到任何环境变量
        const exposedProcess = exposed.process as { env?: Record<string, string> } | undefined
        expect(exposedProcess?.env).toBeUndefined()
    })

    it('should drop unregistered renderer send channels (C-09)', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const exposed = getExposedElectron()
        exposed.ipcRenderer.send('baize:not-registered:evil')
        expect(preloadMocks.send).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })

    it('should forward registered renderer send channels', () => {
        const exposed = getExposedElectron()
        exposed.ipcRenderer.send('baize:window:minimize')
        expect(preloadMocks.send).toHaveBeenCalledWith('baize:window:minimize')
    })

    it('should reject unregistered invoke channels', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const exposed = getExposedElectron()
        await expect(exposed.ipcRenderer.invoke('baize:not-registered:evil')).rejects.toThrow(
            /未登记的 IPC 通道/
        )
        expect(preloadMocks.invoke).not.toHaveBeenCalled()
        warnSpy.mockRestore()
    })

    it('should forward registered invoke channels (e.g. open-in-browser)', async () => {
        const exposed = getExposedElectron()
        preloadMocks.invoke.mockResolvedValueOnce(true)
        await exposed.ipcRenderer.invoke('baize:file:open-in-browser', 'C:\\a.html')
        expect(preloadMocks.invoke).toHaveBeenCalledWith('baize:file:open-in-browser', 'C:\\a.html')
    })

    it('should only register listeners for registered receive channels', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const exposed = getExposedElectron()
        const listener = (): void => {}
        exposed.ipcRenderer.on('baize:not-registered:evil', listener)
        expect(preloadMocks.on).not.toHaveBeenCalled()
        exposed.ipcRenderer.on('baize:theme:updated', listener)
        expect(preloadMocks.on).toHaveBeenCalledWith('baize:theme:updated', listener)
        exposed.ipcRenderer.once('baize:file:saved', listener)
        expect(preloadMocks.once).toHaveBeenCalledWith('baize:file:saved', listener)
        warnSpy.mockRestore()
    })

    it('should expose api with config, app and file groups only', () => {
        const api = getExposedApi()
        expect(Object.keys(api).sort()).toEqual(['app', 'config', 'file'])
    })

    it('should invoke file:recent-list for the recent files/folders menu', async () => {
        const recentList = { files: ['C:\\a.md'], folders: ['C:\\docs'] }
        preloadMocks.invoke.mockResolvedValueOnce(recentList)
        await expect(getExposedApi().file.recentList()).resolves.toEqual(recentList)
        expect(preloadMocks.invoke).toHaveBeenCalledWith('baize:file:recent-list')
    })

    it('should invoke file:open-recent with the kind/path payload', async () => {
        preloadMocks.invoke.mockResolvedValueOnce({ ok: true })
        await expect(
            getExposedApi().file.openRecent({ kind: 'folder', path: 'C:\\docs' })
        ).resolves.toEqual({ ok: true })
        expect(preloadMocks.invoke).toHaveBeenCalledWith('baize:file:open-recent', {
            kind: 'folder',
            path: 'C:\\docs'
        })
    })

    it('should invoke config:read with the config name', async () => {
        preloadMocks.invoke.mockResolvedValueOnce({ key: 'value' })
        await expect(getExposedApi().config.read('theme')).resolves.toEqual({ key: 'value' })
        expect(preloadMocks.invoke).toHaveBeenCalledWith('baize:config:read', 'theme')
    })

    it('should invoke config:write with name and data', async () => {
        preloadMocks.invoke.mockResolvedValueOnce(true)
        await expect(getExposedApi().config.write('theme', { dark: true })).resolves.toBe(true)
        expect(preloadMocks.invoke).toHaveBeenCalledWith('baize:config:write', 'theme', {
            dark: true
        })
    })

    it('should normalize reactive (Vue Proxy) config data into a cloneable plain object', async () => {
        // 2026-11-15 实机问题：useConfigStore 的 themeConfig.value 是 reactive Proxy，
        // Electron 结构化克隆不支持 Proxy（An object could not be cloned），
        // preload 必须先归一化为纯 JSON 再 invoke。
        const raw = reactive({
            currentTheme: 'baize',
            separateEditorTheme: false,
            nested: { list: [1, 2] }
        })
        preloadMocks.invoke.mockResolvedValueOnce(true)
        await getExposedApi().config.write('theme', raw)

        const lastCall = preloadMocks.invoke.mock.calls.at(-1)!
        const payload = lastCall[2] as Record<string, unknown>
        expect(isProxy(payload)).toBe(false)
        expect(Object.getPrototypeOf(payload)).toBe(Object.prototype)
        expect(payload).toEqual({
            currentTheme: 'baize',
            separateEditorTheme: false,
            nested: { list: [1, 2] }
        })
        // 原始响应式对象不受影响
        expect(isProxy(raw)).toBe(true)
        expect(raw.currentTheme).toBe('baize')
    })

    it('should not expose the retired config delete/list methods (P2 死通道清理)', () => {
        const api = getExposedApi() as unknown as { config: Record<string, unknown> }
        expect('delete' in api.config).toBe(false)
        expect('list' in api.config).toBe(false)
    })

    it('should invoke app:get-version for the version info', async () => {
        const version = { appVersion: '1.0.0' }
        preloadMocks.invoke.mockResolvedValueOnce(version)
        await expect(getExposedApi().app.getVersion()).resolves.toEqual(version)
        expect(preloadMocks.invoke).toHaveBeenCalledWith('baize:system:app-version')
    })

    it('should send the renderer-ready handshake via the ready channel (P2-5)', () => {
        getExposedApi().app.notifyRendererReady()
        expect(preloadMocks.send).toHaveBeenCalledWith('baize:render:ready')
    })

    it('should expose exactly two entries via contextBridge', () => {
        expect(preloadMocks.exposeInMainWorld).toHaveBeenCalledTimes(2)
    })
})
