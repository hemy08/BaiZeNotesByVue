/**
 * preload/index.ts 单元测试
 * 覆盖：contextBridge 暴露的 API 名称集合（electron/api）、
 * config 组 invoke 通道（read/write）、app.getVersion 通道
 * （P2：CONFIG.DELETE / CONFIG.LIST 死通道及 config.delete/list 方法已删除）
 */
import { describe, it, expect, vi } from 'vitest'
import { reactive, isProxy } from 'vue'

const preloadMocks = vi.hoisted(() => ({
    exposeInMainWorld: vi.fn(),
    invoke: vi.fn()
}))

vi.mock('electron', () => ({
    contextBridge: { exposeInMainWorld: preloadMocks.exposeInMainWorld },
    ipcRenderer: { invoke: preloadMocks.invoke }
}))

// mock @electron-toolkit/preload 的 electronAPI
vi.mock('@electron-toolkit/preload', () => ({
    electronAPI: { toolkitApi: true }
}))

import '../../src/preload/index'

// 从 exposeInMainWorld 调用记录中取出暴露的 api 对象
function getExposedApi(): {
    config: {
        read: (name: string) => Promise<unknown>
        write: (name: string, data: unknown) => Promise<boolean>
    }
    app: { getVersion: () => Promise<unknown> }
} {
    const call = preloadMocks.exposeInMainWorld.mock.calls.find(([key]) => key === 'api')
    expect(call, '应存在 exposeInMainWorld("api", ...) 调用').toBeDefined()
    return call![1]
}

describe('preload/index', () => {
    it('should expose the toolkit electronAPI under the electron key', () => {
        expect(preloadMocks.exposeInMainWorld).toHaveBeenCalledWith('electron', {
            toolkitApi: true
        })
    })

    it('should expose api with config and app groups only', () => {
        const api = getExposedApi()
        expect(Object.keys(api).sort()).toEqual(['app', 'config'])
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

    it('should expose exactly two entries via contextBridge', () => {
        expect(preloadMocks.exposeInMainWorld).toHaveBeenCalledTimes(2)
    })
})
