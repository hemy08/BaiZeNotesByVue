/**
 * store-factory.ts 单元测试
 * 覆盖：createStore 的实例接线（name/cwd/defaults）、默认值读取、
 * 同名共享数据、异名隔离
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import * as path from 'path'

const electronState = vi.hoisted(() => {
    const base = process.env.TEMP || process.env.TMP || '/tmp'
    return {
        paths: { home: `${base}/baize-vitest-store-factory/home` } as Record<string, string>,
        packaged: false,
        appPath: `${base}/baize-vitest-store-factory/app`
    }
})

vi.mock('electron', () => ({
    app: {
        getPath: vi.fn((name: string) => electronState.paths[name]),
        getAppPath: vi.fn(() => electronState.appPath),
        get isPackaged() {
            return electronState.packaged
        }
    },
    BrowserWindow: class {}
}))

vi.mock('electron-store', async () => {
    const { FakeStore } = await import('./helpers/fake-store')
    return { default: FakeStore }
})

import { FakeStore } from './helpers/fake-store'
import { createStore } from '../../src/main/utils/store-factory'

const EXPECTED_CWD = path.join(electronState.paths.home, '.baizenotes', 'config')

describe('store-factory', () => {
    beforeEach(() => {
        FakeStore.resetAll()
    })

    it('should create a store with the given name and the config cwd', () => {
        const store = createStore('my-config', { a: 1 })
        const instance = FakeStore.instances.find((s) => s.name === 'my-config')
        expect(instance).toBeDefined()
        expect(instance!.cwd).toBe(EXPECTED_CWD)
        expect(store.get('a')).toBe(1)
    })

    it('should expose defaults for unset keys and honor fallbacks', () => {
        const store = createStore('defaults-test', { foo: 'bar', nested: { deep: 1 } })
        expect(store.get('foo')).toBe('bar')
        expect(store.get('nested')).toEqual({ deep: 1 })
        expect(store.get('missing', 'fallback')).toBe('fallback')
        expect(store.has('foo')).toBe(true)
    })

    it('should persist writes for the same name across instances', () => {
        const first = createStore('shared', { count: 0 })
        first.set('count', 42)
        const second = createStore('shared', { count: 0 })
        expect(second.get('count')).toBe(42)
    })

    it('should isolate data between different store names', () => {
        const storeA = createStore('name-a', { value: 'A' })
        const storeB = createStore('name-b', { value: 'B' })
        storeA.set('value', 'changed')
        expect(storeB.get('value')).toBe('B')
        expect(storeA.get('value')).toBe('changed')
    })
})
