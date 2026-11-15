/**
 * ipc-listener-manager.ts 单元测试
 * 覆盖：register（注册/防重复/默认组件）、registerOnce（listenerCount 判重）、
 * registerHandleOnce（handle 注册/重复抛错跳过）、unregister（成功/未知通道无害）、
 * cleanupComponent/cleanupChannel/cleanupAll（persistent 保留）、getStats、
 * getInventory/inventory 库存快照、单例与导出实例
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const ipcMocks = vi.hoisted(() => ({
    on: vi.fn(),
    handle: vi.fn(),
    removeListener: vi.fn(),
    removeHandler: vi.fn(),
    listenerCount: vi.fn(() => 0)
}))

vi.mock('electron', () => ({
    ipcMain: {
        on: ipcMocks.on,
        handle: ipcMocks.handle,
        removeListener: ipcMocks.removeListener,
        removeHandler: ipcMocks.removeHandler,
        listenerCount: ipcMocks.listenerCount
    }
}))

// 每次加载都得到全新的单例（模块注册表重置）
async function loadManager() {
    return await import('../../src/main/ipc/ipc-listener-manager')
}

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
    vi.resetModules()
    for (const key of ['on', 'handle', 'removeListener', 'removeHandler', 'listenerCount']) {
        const mock = ipcMocks[key as keyof typeof ipcMocks]
        // mockReset：连同上一个用例设置的 mockImplementation 一并清空
        mock.mockReset()
    }
    ipcMocks.listenerCount.mockReturnValue(0)
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
    warnSpy.mockRestore()
})

describe('IPCListenerManager.register', () => {
    it('should register a listener on ipcMain and return a channel-prefixed id', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        const listener = vi.fn()
        const id = manager.register('baize-notes:test', listener, 'comp-a')
        expect(ipcMocks.on).toHaveBeenCalledWith('baize-notes:test', listener)
        expect(id.startsWith('baize-notes:test:')).toBe(true)
        expect(manager.getStats().totalListeners).toBe(1)
    })

    it('should default componentId to global', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        manager.register('ch', vi.fn())
        const stats = manager.getStats()
        expect(stats.details).toEqual([{ channel: 'ch', count: 1, components: ['global'] }])
    })

    it('should skip duplicate registration of the same listener function (MEM-10)', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        const listener = vi.fn()
        const id1 = manager.register('ch1', listener, 'comp-a')
        const id2 = manager.register('ch1', listener, 'comp-a')
        // 同一函数引用重复注册：跳过 ipcMain.on 并告警，返回原 id
        expect(ipcMocks.on).toHaveBeenCalledTimes(1)
        expect(id2).toBe(id1)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('跳过重复注册'))
        expect(manager.getStats().totalListeners).toBe(1)
    })

    it('should allow the same listener function on different channels', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        const listener = vi.fn()
        manager.register('ch1', listener)
        manager.register('ch2', listener)
        expect(ipcMocks.on).toHaveBeenCalledTimes(2)
        expect(manager.getStats().totalChannels).toBe(2)
    })
})

describe('IPCListenerManager.registerOnce', () => {
    it('should register a persistent on-listener when the channel is free', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        ipcMocks.listenerCount.mockReturnValue(0)
        const listener = vi.fn()
        const id = manager.registerOnce('ch1', listener)
        expect(ipcMocks.on).toHaveBeenCalledWith('ch1', listener)
        expect(id).not.toBeNull()
    })

    it('should skip registration when listenerCount is already positive', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        ipcMocks.listenerCount.mockReturnValue(1)
        const listener = vi.fn()
        const id = manager.registerOnce('ch1', listener)
        expect(ipcMocks.on).not.toHaveBeenCalled()
        expect(id).toBeNull()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('跳过重复注册'))
    })
})

describe('IPCListenerManager.registerHandleOnce', () => {
    it('should register a persistent handle processor', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        const listener = vi.fn()
        const id = manager.registerHandleOnce('ch1', listener)
        expect(ipcMocks.handle).toHaveBeenCalledWith('ch1', listener)
        expect(id).not.toBeNull()
    })

    it('should return null when ipcMain.handle throws for a duplicate channel', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        ipcMocks.handle.mockImplementation(() => {
            throw new Error('duplicate handler')
        })
        expect(manager.registerHandleOnce('ch1', vi.fn())).toBeNull()
        expect(warnSpy).toHaveBeenCalledWith(
            '[IPCListenerManager] 通道 "ch1" 已存在 handle 处理器，跳过重复注册:',
            'duplicate handler'
        )
    })
})

describe('IPCListenerManager.getStats', () => {
    it('should report totals grouped by channel and component', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        manager.register('ch1', vi.fn(), 'comp-a')
        manager.register('ch1', vi.fn(), 'comp-b')
        manager.register('ch2', vi.fn())
        const stats = manager.getStats()
        expect(stats.totalChannels).toBe(2)
        expect(stats.totalListeners).toBe(3)
        expect(stats.totalComponents).toBe(3)
        expect(stats.details).toEqual(
            expect.arrayContaining([
                { channel: 'ch1', count: 2, components: ['comp-a', 'comp-b'] },
                { channel: 'ch2', count: 1, components: ['global'] }
            ])
        )
    })
})

describe('IPCListenerManager.unregister', () => {
    it('should remove the listener from ipcMain and update stats', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        const listenerA = vi.fn()
        const listenerB = vi.fn()
        manager.register('ch1', listenerA, 'comp-a')
        manager.register('ch1', listenerB, 'comp-b')
        manager.unregister('ch1', listenerA)
        expect(ipcMocks.removeListener).toHaveBeenCalledWith('ch1', listenerA)
        expect(manager.getStats().totalListeners).toBe(1)
        // 组件桶 comp-a 清空后仍保留（实现行为），通道统计只含剩余监听器
        expect(manager.getStats().totalComponents).toBe(2)
        expect(manager.getStats().details).toEqual([
            { channel: 'ch1', count: 1, components: ['comp-b'] }
        ])
    })

    it('should remove a handle-kind listener via removeHandler', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        const listener = vi.fn()
        manager.registerHandleOnce('ch1', listener)
        manager.unregister('ch1', listener as never)
        expect(ipcMocks.removeHandler).toHaveBeenCalledWith('ch1')
        expect(manager.getStats().totalListeners).toBe(0)
    })

    it('should be safe to unregister a listener that was never registered', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        const unknown = vi.fn()
        // 未知通道直接返回，不触碰 ipcMain
        expect(() => manager.unregister('ch1', unknown)).not.toThrow()
        expect(ipcMocks.removeListener).not.toHaveBeenCalled()
        expect(manager.getStats().totalListeners).toBe(0)
    })
})

describe('IPCListenerManager.cleanupComponent', () => {
    it('should remove only the listeners of the given component', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        const listenerA = vi.fn()
        const listenerB = vi.fn()
        manager.register('ch1', listenerA, 'comp-a')
        manager.register('ch1', listenerB, 'comp-b')
        manager.cleanupComponent('comp-a')
        expect(ipcMocks.removeListener).toHaveBeenCalledWith('ch1', listenerA)
        expect(ipcMocks.removeListener).not.toHaveBeenCalledWith('ch1', listenerB)
        const stats = manager.getStats()
        expect(stats.totalListeners).toBe(1)
        expect(stats.totalComponents).toBe(1)
        expect(stats.details).toEqual([{ channel: 'ch1', count: 1, components: ['comp-b'] }])
    })

    it('should do nothing for an unknown component', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        manager.register('ch1', vi.fn(), 'comp-a')
        expect(() => manager.cleanupComponent('nope')).not.toThrow()
        expect(ipcMocks.removeListener).not.toHaveBeenCalled()
        expect(manager.getStats().totalListeners).toBe(1)
    })
})

describe('IPCListenerManager.cleanupChannel', () => {
    it('should remove all listeners of a channel across components', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        const listenerA = vi.fn()
        const listenerB = vi.fn()
        manager.register('ch1', listenerA, 'comp-a')
        manager.register('ch1', listenerB, 'comp-b')
        manager.register('ch2', vi.fn(), 'comp-a')
        manager.cleanupChannel('ch1')
        expect(ipcMocks.removeListener).toHaveBeenCalledWith('ch1', listenerA)
        expect(ipcMocks.removeListener).toHaveBeenCalledWith('ch1', listenerB)
        const stats = manager.getStats()
        expect(stats.totalChannels).toBe(1)
        expect(stats.totalListeners).toBe(1)
    })
})

describe('IPCListenerManager.cleanupAll', () => {
    it('should clear all non-persistent channels and components', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        manager.register('ch1', vi.fn(), 'comp-a')
        manager.register('ch2', vi.fn(), 'comp-b')
        manager.cleanupAll()
        expect(ipcMocks.removeListener).toHaveBeenCalledTimes(2)
        const stats = manager.getStats()
        expect(stats.totalChannels).toBe(0)
        expect(stats.totalListeners).toBe(0)
        expect(stats.totalComponents).toBe(0)
    })

    it('should keep persistent registrations across cleanupAll (MEM-10)', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        const transient = vi.fn()
        const persistent = vi.fn()
        manager.register('ch1', transient, 'comp-a')
        manager.registerOnce('ch2', persistent)
        manager.cleanupAll()
        // 非 persistent 被移除；persistent 保留
        expect(ipcMocks.removeListener).toHaveBeenCalledWith('ch1', transient)
        expect(ipcMocks.removeListener).not.toHaveBeenCalledWith('ch2', persistent)
        const stats = manager.getStats()
        expect(stats.totalChannels).toBe(1)
        expect(stats.totalListeners).toBe(1)
        expect(stats.totalComponents).toBe(1)
    })
})

describe('IPCListenerManager.getInventory', () => {
    it('should export an inventory snapshot grouped by channel (MEM-10)', async () => {
        const { IPCListenerManager, inventory } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        manager.register('ch1', vi.fn(), 'comp-a')
        manager.registerOnce('ch2', vi.fn())
        manager.registerHandleOnce('ch3', vi.fn())
        const snap = manager.getInventory()
        expect(snap).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    channel: 'ch1',
                    kind: 'on',
                    persistent: false,
                    count: 1
                }),
                expect.objectContaining({ channel: 'ch2', kind: 'on', persistent: true, count: 1 }),
                expect.objectContaining({
                    channel: 'ch3',
                    kind: 'handle',
                    persistent: true,
                    count: 1
                })
            ])
        )
        // 全局 inventory() 与实例快照一致
        expect(inventory()).toEqual(snap)
    })

    // P1/C-04：台账收口——cleanupAll 后组件级（非 persistent）注册不得残留在台账中
    it('should leave no non-persistent residue in the inventory after cleanupAll', async () => {
        const { IPCListenerManager } = await loadManager()
        const manager = IPCListenerManager.getInstance()
        manager.register('ch-transient', vi.fn(), 'comp-a')
        manager.register('ch-transient-second', vi.fn(), 'comp-b')
        manager.registerOnce('ch-persistent', vi.fn())

        manager.cleanupAll()

        const snap = manager.getInventory()
        expect(snap.some((item) => item.channel === 'ch-transient')).toBe(false)
        expect(snap.some((item) => item.channel === 'ch-transient-second')).toBe(false)
        expect(snap.filter((item) => !item.persistent)).toEqual([])
        expect(manager.getStats().totalComponents).toBe(1)
        // persistent（进程级一次性注册）按 MEM-10 设计保留，台账仍可查
        expect(snap.find((item) => item.channel === 'ch-persistent')).toMatchObject({
            kind: 'on',
            persistent: true,
            components: ['global']
        })
    })
})

describe('IPCListenerManager singleton', () => {
    it('should return the same instance for repeated getInstance calls', async () => {
        const { IPCListenerManager } = await loadManager()
        expect(IPCListenerManager.getInstance()).toBe(IPCListenerManager.getInstance())
    })

    it('should export a ready-to-use singleton instance', async () => {
        const { IPCListenerManager, ipcListenerManager } = await loadManager()
        expect(ipcListenerManager).toBe(IPCListenerManager.getInstance())
    })
})
