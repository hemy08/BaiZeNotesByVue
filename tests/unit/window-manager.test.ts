/**
 * src/main/window/window-manager.ts 单元测试
 *
 * 覆盖窗口管理器（WindowManager 单例）的完整生命周期契约：
 * 1. 单例与私有构造语义；
 * 2. createWindow：创建/单例复用（focus 已有窗口）/singleton=false 多开/
 *    已销毁窗口重建/自定义 componentId/类型计数登记；
 * 3. 查询：getWindowByType / getWindowsByType 过滤已销毁窗口与未知类型；
 * 4. 关闭：closeWindowsByType 只关闭匹配类型、跳过已销毁实例；
 * 5. 销毁清理：'closed' 事件触发 cleanupWindow（ipcListenerManager 清理 +
 *    从登记表移除 + 类型计数递减）、重复触发幂等；
 * 6. closeAll：关闭并清空全部登记，已销毁窗口不重复 close，二次调用安全。
 *
 * 说明：本测试通过 electron mock 的 FakeBrowserWindow 精确控制 isDestroyed/close
 * 时序（cleanupWindow 依赖 Electron 的 'closed' 事件），不依赖真实 BrowserWindow。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

// ipcListenerManager 是窗口销毁时的清理出口，mock 后可直接断言 componentId 传递。
const listenerMocks = vi.hoisted(() => ({ cleanupComponent: vi.fn() }))

vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: listenerMocks
}))

// ============ electron mock：FakeBrowserWindow ============
const bwState = vi.hoisted(() => ({ instances: [] as FakeBrowserWindow[] }))

interface GenericListener {
    (...args: unknown[]): void
}

interface FakeBrowserWindow {
    options: Record<string, unknown>
    listeners: Map<string, GenericListener[]>
    destroyed: boolean
    focus: ReturnType<typeof vi.fn>
    // 既可直接调用（模拟 Electron close），又可作为 mock 断言调用次数
    close: ReturnType<typeof vi.fn> & (() => void)
    isDestroyed(): boolean
    on(event: string, cb: GenericListener): void
    emit(event: string, ...args: unknown[]): void
}

vi.mock('electron', () => {
    class MockBrowserWindow implements FakeBrowserWindow {
        options: Record<string, unknown>
        listeners = new Map<string, GenericListener[]>()
        destroyed = false
        focus = vi.fn()
        close = vi.fn(() => {
            if (this.destroyed) return
            this.destroyed = true
            this.emit('closed')
        })

        constructor(options: Record<string, unknown>) {
            this.options = options
            bwState.instances.push(this)
        }

        isDestroyed(): boolean {
            return this.destroyed
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
    }

    // WindowManager 只消费 BrowserWindow（以及构造参数类型）；其余 electron 出口
    // 本模块不触达，但保留 ipcMain 空壳以兼容 ipc-listener-manager 的模块级 import。
    return {
        BrowserWindow: MockBrowserWindow,
        ipcMain: {
            on: vi.fn(),
            removeListener: vi.fn(),
            removeHandler: vi.fn(),
            handle: vi.fn()
        }
    }
})

// vi.mock 由 vitest 提升到模块顶部，静态 import 即可拿到被 mock 的依赖图。
import { WindowManager, windowManager } from '../../src/main/window/window-manager'

/** 取出当前最后一次创建的 FakeBrowserWindow（mock 实例） */
function lastWindow(): FakeBrowserWindow {
    return bwState.instances[bwState.instances.length - 1]
}

beforeEach(() => {
    // windowManager 是模块级单例：每个用例前重置内部登记表，保证用例独立。
    windowManager.closeAll()
    bwState.instances.length = 0
    listenerMocks.cleanupComponent.mockClear()
})

function createWindow(...args: Parameters<typeof windowManager.createWindow>): FakeBrowserWindow {
    // createWindow 的静态返回类型是 Electron BrowserWindow；mock 环境下实际实例是
    // FakeBrowserWindow（可手动控制 isDestroyed/closed 时序），此处统一收窄。
    return windowManager.createWindow(...args) as unknown as FakeBrowserWindow
}

describe('WindowManager 单例', () => {
    it('getInstance 返回同一实例（单例语义）', () => {
        expect(WindowManager.getInstance()).toBe(windowManager)
        expect(WindowManager.getInstance()).toBe(WindowManager.getInstance())
    })
})

describe('WindowManager.createWindow', () => {
    it('按 options 创建窗口并登记到类型查询', () => {
        const options = { width: 800, height: 600, title: '测试窗口' }
        const created = createWindow('test-type', options)

        expect(bwState.instances).toHaveLength(1)
        expect(created).toBe(lastWindow())
        expect(lastWindow().options).toEqual(options)
        expect(windowManager.getWindowByType('test-type')).toBe(created)
    })

    it('singleton 默认复用同类型已有窗口并 focus', () => {
        const first = createWindow('singleton-type', { width: 100 })

        const second = createWindow('singleton-type', { width: 200 })

        expect(second).toBe(first)
        expect(bwState.instances).toHaveLength(1)
        expect(lastWindow().focus).toHaveBeenCalledTimes(1)
    })

    it('singleton=false 允许同类型多开且互不干扰', () => {
        const first = createWindow('multi-type', { width: 100 }, undefined, false)
        const second = createWindow('multi-type', { width: 200 }, undefined, false)

        expect(second).not.toBe(first)
        expect(bwState.instances).toHaveLength(2)
        expect(windowManager.getWindowsByType('multi-type')).toEqual([first, second])
        // 单例查询只返回第一个存活的同类型窗口
        expect(windowManager.getWindowByType('multi-type')).toBe(first)
    })

    it('同类型窗口已销毁时 singleton 会重建新窗口', () => {
        const first = createWindow('recreate-type', { width: 100 })
        first.destroyed = true

        const second = createWindow('recreate-type', { width: 100 })

        expect(second).not.toBe(first)
        expect(bwState.instances).toHaveLength(2)
        expect(windowManager.getWindowByType('recreate-type')).toBe(second)
    })

    it('自定义 componentId 用于销毁时的监听器清理', () => {
        const created = createWindow('component-type', {}, 'component-abc')

        created.destroyed = true
        lastWindow().emit('closed')

        expect(listenerMocks.cleanupComponent).toHaveBeenCalledTimes(1)
        expect(listenerMocks.cleanupComponent).toHaveBeenCalledWith('component-abc')
    })

    it('未传 componentId 时以生成的 windowId（类型前缀）作为清理标识', () => {
        const created = createWindow('generated-id-type', {})

        created.destroyed = true
        lastWindow().emit('closed')

        const componentId = listenerMocks.cleanupComponent.mock.calls[0][0] as string
        expect(componentId).toMatch(/^generated-id-type:\d+:/)
    })

    it('不同类型窗口分别独立登记', () => {
        const a = createWindow('type-a', {})
        const b = createWindow('type-b', {})

        expect(windowManager.getWindowByType('type-a')).toBe(a)
        expect(windowManager.getWindowByType('type-b')).toBe(b)
        expect(bwState.instances).toHaveLength(2)
    })
})

describe('WindowManager 查询', () => {
    it('未知类型返回 null / 空数组', () => {
        expect(windowManager.getWindowByType('not-exist')).toBeNull()
        expect(windowManager.getWindowsByType('not-exist')).toEqual([])
    })

    it('getWindowByType 跳过已销毁但尚未清理的窗口', () => {
        const created = createWindow('query-destroyed', {})
        created.destroyed = true

        expect(windowManager.getWindowByType('query-destroyed')).toBeNull()
    })

    it('getWindowsByType 只返回存活窗口', () => {
        const first = createWindow('query-multi', {}, undefined, false)
        const second = createWindow('query-multi', {}, undefined, false)
        first.destroyed = true

        expect(windowManager.getWindowsByType('query-multi')).toEqual([second])
    })

    it('窗口关闭后从类型查询与登记表移除（closed → cleanupWindow）', () => {
        const created = createWindow('closed-type', {}, 'cmp-1')
        created.close()

        expect(windowManager.getWindowByType('closed-type')).toBeNull()
        expect(windowManager.getWindowsByType('closed-type')).toEqual([])
        // close() 内 FakeBrowserWindow 会触发 'closed' → cleanupWindow 清理监听器
        expect(listenerMocks.cleanupComponent).toHaveBeenCalledWith('cmp-1')
    })

    it('重复触发 closed 事件幂等（第二次 cleanupWindow 直接返回）', () => {
        const created = createWindow('idempotent-type', {}, 'cmp-2')
        created.destroyed = true

        lastWindow().emit('closed')
        lastWindow().emit('closed')

        expect(listenerMocks.cleanupComponent).toHaveBeenCalledTimes(1)
    })
})

describe('WindowManager.closeWindowsByType', () => {
    it('只关闭指定类型的存活窗口', () => {
        const a1 = createWindow('close-a', {}, undefined, false)
        const a2 = createWindow('close-a', {}, undefined, false)
        const b = createWindow('close-b', {})

        windowManager.closeWindowsByType('close-a')

        expect(a1.destroyed).toBe(true)
        expect(a2.destroyed).toBe(true)
        expect(b.destroyed).toBe(false)
        expect(windowManager.getWindowsByType('close-a')).toEqual([])
        expect(windowManager.getWindowByType('close-b')).toBe(b)
    })

    it('跳过已销毁窗口，不重复调用 close', () => {
        const created = createWindow('close-destroyed', {})
        created.destroyed = true
        const closeSpy = created.close

        windowManager.closeWindowsByType('close-destroyed')

        expect(closeSpy).not.toHaveBeenCalled()
    })

    it('未知类型无副作用', () => {
        const created = createWindow('unrelated-type', {})

        windowManager.closeWindowsByType('not-exist')

        expect(created.destroyed).toBe(false)
    })
})

describe('WindowManager.closeAll', () => {
    it('关闭全部存活窗口并清空登记', () => {
        const first = createWindow('all-a', {}, undefined, false)
        const second = createWindow('all-b', {})
        // 已销毁实例不应被重复 close
        const third = createWindow('all-c', {}, undefined, false)
        third.destroyed = true

        windowManager.closeAll()

        expect(first.destroyed).toBe(true)
        expect(second.destroyed).toBe(true)
        expect(windowManager.getWindowByType('all-a')).toBeNull()
        expect(windowManager.getWindowByType('all-b')).toBeNull()
        expect(windowManager.getWindowsByType('all-c')).toEqual([])
    })

    it('closeAll 后再次调用安全（幂等空操作）', () => {
        windowManager.createWindow('idempotent-close', {})
        windowManager.closeAll()

        expect(() => windowManager.closeAll()).not.toThrow()
        expect(bwState.instances).toHaveLength(1)
        expect(windowManager.getWindowByType('idempotent-close')).toBeNull()
    })
})
