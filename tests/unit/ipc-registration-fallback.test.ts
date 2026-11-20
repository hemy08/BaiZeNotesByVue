/**
 * utils 侧 IPC 注册能力提供者（`src/main/utils/ipc-registration.ts`）防御分支补测。
 *
 * 既有用例覆盖「注入后委托注册」链路；本文件覆盖未注入 / 非法注入时的安全回退：
 * 1. 未注入注册实现时：告警并返回 null（不抛错，启动顺序异常/单测缺 provider 的兜底）；
 * 2. 注入 null / undefined / 缺少 registerHandleOnce 的对象时同样视为未注入；
 * 3. 合法注入：注册参数（通道 / 监听器 / 组件 ID）原样透传，返回监听器 ID；
 * 4. 重置注入（null）后回到未注入语义。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { registerIpcHandleOnce, setIpcHandleRegistrar } from '../../src/main/utils/ipc-registration'
import type { IpcHandleRegistrar } from '../../src/main/utils/ipc-registration'

/** 轻量监听器替身（类型上要求 Electron 事件签名，单测不触发实际 IPC） */
const listener = (async () => undefined) as unknown as Parameters<typeof registerIpcHandleOnce>[1]

afterEach(() => {
    // 恢复未注入状态，避免跨用例污染（本文件模块实例独立于其他测试文件）
    setIpcHandleRegistrar(null)
    vi.restoreAllMocks()
})

describe('ipc-registration 未注入回退', () => {
    it('未注入时告警并返回 null，不抛错', () => {
        setIpcHandleRegistrar(null)
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        const result = registerIpcHandleOnce('baize:test:no-registrar', listener, 'test-component')

        expect(result).toBeNull()
        expect(warnSpy).toHaveBeenCalledTimes(1)
        expect(String(warnSpy.mock.calls[0][0])).toContain('baize:test:no-registrar')
    })

    it('注入 undefined 或缺少 registerHandleOnce 的对象视为未注入', () => {
        vi.spyOn(console, 'warn').mockImplementation(() => {})

        setIpcHandleRegistrar(undefined)
        expect(registerIpcHandleOnce('baize:test:undefined', listener)).toBeNull()

        setIpcHandleRegistrar({} as unknown as IpcHandleRegistrar)
        expect(registerIpcHandleOnce('baize:test:invalid', listener)).toBeNull()

        setIpcHandleRegistrar(null)
        expect(registerIpcHandleOnce('baize:test:null', listener)).toBeNull()
    })
})

describe('ipc-registration 委托注册', () => {
    it('注入后原样透传通道 / 监听器 / 组件 ID，并返回监听器 ID', () => {
        const registerHandleOnce = vi.fn().mockReturnValue('listener-id-1')
        setIpcHandleRegistrar({ registerHandleOnce })

        const result = registerIpcHandleOnce('baize:test:channel', listener, 'component-x')

        expect(result).toBe('listener-id-1')
        expect(registerHandleOnce).toHaveBeenCalledTimes(1)
        expect(registerHandleOnce).toHaveBeenCalledWith(
            'baize:test:channel',
            listener,
            'component-x'
        )
    })
})
