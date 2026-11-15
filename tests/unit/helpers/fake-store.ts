/**
 * electron-store 的内存版替身（供单元测试使用）
 * 通过 vi.mock('electron-store', async () => ({ default: FakeStore })) 挂载，
 * 支持：
 * - 按 name 隔离的内存数据（Map<name, Map<key, value>>）
 * - 构造时合并 defaults（模拟 electron-store 的默认值落地）
 * - failOnceFor：指定 name 的实例首次构造抛异常（模拟配置文件损坏）
 * - resetAll：清空全部数据与实例，供 beforeEach 恢复初始状态
 */
export type FakeStoreOptions<T extends Record<string, unknown>> = {
    name?: string
    cwd?: string
    defaults?: T
}

export class FakeStore<T extends Record<string, unknown> = Record<string, unknown>> {
    static data = new Map<string, Map<string, unknown>>()
    static instances: FakeStore<Record<string, unknown>>[] = []
    static failOnceFor: string | null = null

    name: string
    cwd?: string
    defaults: T

    constructor(options: FakeStoreOptions<T> = {}) {
        this.name = options.name ?? 'config'
        this.cwd = options.cwd
        this.defaults = (options.defaults ?? {}) as T

        // 模拟损坏配置：首次创建即抛异常
        if (FakeStore.failOnceFor === this.name) {
            FakeStore.failOnceFor = null
            throw new Error(`[FakeStore] simulated corrupted config: ${this.name}`)
        }

        // 已有同名数据时补齐缺失的默认键；否则以默认值初始化
        if (!FakeStore.data.has(this.name)) {
            FakeStore.data.set(this.name, new Map<string, unknown>(Object.entries(this.defaults)))
        } else {
            const map = FakeStore.data.get(this.name)!
            for (const [key, value] of Object.entries(this.defaults)) {
                if (!map.has(key)) map.set(key, value)
            }
        }
        FakeStore.instances.push(this as FakeStore<Record<string, unknown>>)
    }

    get<K extends string>(key: K, fallback?: unknown): unknown {
        const map = FakeStore.data.get(this.name)
        if (map?.has(key)) {
            return map.get(key)
        }
        if (Object.prototype.hasOwnProperty.call(this.defaults, key)) {
            return (this.defaults as Record<string, unknown>)[key]
        }
        return fallback
    }

    has(key: string): boolean {
        const map = FakeStore.data.get(this.name)
        return (map?.has(key) ?? false) || Object.prototype.hasOwnProperty.call(this.defaults, key)
    }

    set(key: string, value: unknown): void {
        let map = FakeStore.data.get(this.name)
        if (!map) {
            map = new Map<string, unknown>()
            FakeStore.data.set(this.name, map)
        }
        map.set(key, value)
    }

    delete(key: string): void {
        FakeStore.data.get(this.name)?.delete(key)
    }

    clear(): void {
        FakeStore.data.get(this.name)?.clear()
    }

    /** 重置所有共享状态（数据、实例列表、一次性失败标记） */
    static resetAll(): void {
        FakeStore.data.clear()
        FakeStore.instances.length = 0
        FakeStore.failOnceFor = null
    }
}
