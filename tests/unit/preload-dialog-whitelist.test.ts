/**
 * src/preload/dialog.ts 正向白名单 / 监听器退订 / 异常分支单元测试
 *
 * 现有 tests/unit/preload-dialog.test.ts 覆盖的是「生成白名单为空」的安全空壳
 * 默认态（任何通道均丢弃）。本文件通过 mock 生成器模块注入非空白名单，补齐
 * 白名单放行路径与包装器生命周期，覆盖：
 * 1. send 白名单放行（透传通道与全部参数，不告警）；
 * 2. on 白名单放行：callback 包装（剥离 IpcRendererEvent 首参）、同一 callback
 *    重复订阅去重、不同通道各自登记；
 * 3. removeListener：on 注册后按包装器实例精确退订（同一 callback 可再次订阅）、
 *    部分退订时保留通道条目、未知 callback/未知通道回退原样委托；
 * 4. contextBridge.exposeInMainWorld 抛错时仅 console.error 不中断；
 * 5. shell.openExternal 协议白名单的 URL 规范化细节（trim/编码/大小写协议）
 *    与非 http(s)/非法 URL/非字符串输入的拒绝分支及下游异常透传。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

interface IpcRendererEventLike {
    senderId?: number
}

type DialogCallback = (...args: unknown[]) => void

interface ExposedDialogApi {
    ipcRenderer: {
        send: (channel: string, ...args: unknown[]) => void
        on: (channel: string, callback: DialogCallback) => void
        removeListener: (channel: string, callback: DialogCallback) => void
    }
    shell: { openExternal: (url: string) => Promise<void> }
}

const mocks = vi.hoisted(() => ({
    exposeInMainWorld: vi.fn(),
    send: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
    openExternal: vi.fn()
}))

vi.mock('electron', () => ({
    contextBridge: { exposeInMainWorld: mocks.exposeInMainWorld },
    ipcRenderer: {
        send: mocks.send,
        on: mocks.on,
        removeListener: mocks.removeListener
    },
    shell: { openExternal: mocks.openExternal }
}))

// 注入非空白名单：验证生成器产物非空时的放行逻辑（生产环境当前为空数组，
// 但白名单机制是可复用的安全边界，必须防止未来启用时回归为「只丢弃不放行」）。
vi.mock('../../src/preload/allowed-channels.generated', () => ({
    DIALOG_SEND_CHANNELS: ['baize:dialog:allowed-send', 'baize:dialog:allowed-send-2'],
    DIALOG_RECEIVE_CHANNELS: ['baize:dialog:allowed-receive', 'baize:dialog:allowed-receive-2']
}))

const SEND_CHANNEL = 'baize:dialog:allowed-send'
const RECEIVE_CHANNEL = 'baize:dialog:allowed-receive'
const RECEIVE_CHANNEL_2 = 'baize:dialog:allowed-receive-2'

let warnSpy: ReturnType<typeof vi.spyOn>
let errorSpy: ReturnType<typeof vi.spyOn>

/** 加载一份全新的 dialog preload 模块并取出 contextBridge 暴露的 electronAPI */
async function loadDialogApi(): Promise<ExposedDialogApi> {
    await import('../../src/preload/dialog')
    const call = mocks.exposeInMainWorld.mock.calls.find(([key]) => key === 'electronAPI')
    expect(call, '应存在 exposeInMainWorld("electronAPI", ...) 调用').toBeDefined()
    return call![1] as ExposedDialogApi
}

/** 取出 ipcRenderer.on 最近注册的包装函数 */
function lastRegisteredWrapper(): DialogCallback {
    expect(mocks.on).toHaveBeenCalled()
    const calls = mocks.on.mock.calls
    return calls[calls.length - 1][1] as DialogCallback
}

beforeEach(() => {
    vi.resetModules()
    mocks.exposeInMainWorld.mockClear()
    mocks.send.mockClear()
    mocks.on.mockClear()
    mocks.removeListener.mockClear()
    mocks.openExternal.mockClear()
    ;(process as unknown as { contextIsolated?: boolean }).contextIsolated = true
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
    warnSpy.mockRestore()
    errorSpy.mockRestore()
})

describe('preload/dialog 白名单放行：send', () => {
    it('白名单内通道原样透传通道名与全部参数', async () => {
        const api = await loadDialogApi()

        api.ipcRenderer.send(SEND_CHANNEL, 'payload', 42, { key: 'value' })

        expect(mocks.send).toHaveBeenCalledTimes(1)
        expect(mocks.send).toHaveBeenCalledWith(SEND_CHANNEL, 'payload', 42, { key: 'value' })
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('白名单外通道丢弃且不调用底层 send', async () => {
        const api = await loadDialogApi()

        api.ipcRenderer.send('baize:evil:channel', 'payload')

        expect(mocks.send).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('baize:evil:channel'))
    })
})

describe('preload/dialog 白名单放行：on 包装', () => {
    it('白名单内通道注册包装器，回调接收时剥离 IpcRendererEvent 首参', async () => {
        const api = await loadDialogApi()
        const callback = vi.fn()

        api.ipcRenderer.on(RECEIVE_CHANNEL, callback)

        expect(mocks.on).toHaveBeenCalledTimes(1)
        expect(mocks.on.mock.calls[0][0]).toBe(RECEIVE_CHANNEL)
        const wrapper = lastRegisteredWrapper()
        const event: IpcRendererEventLike = { senderId: 7 }
        wrapper(event, 'first', 'second')

        expect(callback).toHaveBeenCalledTimes(1)
        expect(callback).toHaveBeenCalledWith('first', 'second')
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('白名单外通道不注册且告警', async () => {
        const api = await loadDialogApi()

        api.ipcRenderer.on('baize:evil:channel', vi.fn())

        expect(mocks.on).not.toHaveBeenCalled()
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('baize:evil:channel'))
    })

    it('同一 callback 重复订阅同一通道只注册一次（复用既有包装器）', async () => {
        const api = await loadDialogApi()
        const callback = vi.fn()

        api.ipcRenderer.on(RECEIVE_CHANNEL, callback)
        api.ipcRenderer.on(RECEIVE_CHANNEL, callback)

        expect(mocks.on).toHaveBeenCalledTimes(1)
        lastRegisteredWrapper()({}, 'x')
        expect(callback).toHaveBeenCalledTimes(1)
    })

    it('同一 callback 订阅两个白名单通道时分别注册独立包装器', async () => {
        const api = await loadDialogApi()
        const callback = vi.fn()

        api.ipcRenderer.on(RECEIVE_CHANNEL, callback)
        api.ipcRenderer.on(RECEIVE_CHANNEL_2, callback)

        expect(mocks.on).toHaveBeenCalledTimes(2)
        expect(mocks.on.mock.calls[0][0]).toBe(RECEIVE_CHANNEL)
        expect(mocks.on.mock.calls[1][0]).toBe(RECEIVE_CHANNEL_2)
        const firstWrapper = mocks.on.mock.calls[0][1] as DialogCallback
        const secondWrapper = mocks.on.mock.calls[1][1] as DialogCallback
        expect(firstWrapper).not.toBe(secondWrapper)
        expect(warnSpy).not.toHaveBeenCalled()
    })
})

describe('preload/dialog 退订：removeListener', () => {
    it('on 注册后按包装器实例精确退订，且退订后可重新订阅', async () => {
        const api = await loadDialogApi()
        const callback = vi.fn()

        api.ipcRenderer.on(RECEIVE_CHANNEL, callback)
        const wrapper = lastRegisteredWrapper()
        api.ipcRenderer.removeListener(RECEIVE_CHANNEL, callback)

        expect(mocks.removeListener).toHaveBeenCalledTimes(1)
        expect(mocks.removeListener).toHaveBeenCalledWith(RECEIVE_CHANNEL, wrapper)

        // 通道条目已清空 → 再次 on 重新生成包装器并注册
        api.ipcRenderer.on(RECEIVE_CHANNEL, callback)
        expect(mocks.on).toHaveBeenCalledTimes(2)
        const newWrapper = lastRegisteredWrapper()
        expect(newWrapper).not.toBe(wrapper)
        newWrapper({}, 'after-reon')
        expect(callback).toHaveBeenCalledTimes(1)
    })

    it('同通道多个 callback 只退订指定项，通道条目保留', async () => {
        const api = await loadDialogApi()
        const first = vi.fn()
        const second = vi.fn()

        api.ipcRenderer.on(RECEIVE_CHANNEL, first)
        api.ipcRenderer.on(RECEIVE_CHANNEL, second)
        const firstWrapper = mocks.on.mock.calls[0][1] as DialogCallback

        api.ipcRenderer.removeListener(RECEIVE_CHANNEL, first)

        expect(mocks.removeListener).toHaveBeenCalledWith(RECEIVE_CHANNEL, firstWrapper)
        // 第二个 callback 仍可正常接收
        const secondWrapper = mocks.on.mock.calls[1][1] as DialogCallback
        secondWrapper({}, 'still-alive')
        expect(second).toHaveBeenCalledWith('still-alive')
        expect(first).not.toHaveBeenCalled()
    })

    it('未经过 on 包装的 callback 按原样委托给 ipcRenderer.removeListener', async () => {
        const api = await loadDialogApi()
        const rawCallback = vi.fn()

        api.ipcRenderer.removeListener(SEND_CHANNEL, rawCallback)

        expect(mocks.removeListener).toHaveBeenCalledWith(SEND_CHANNEL, rawCallback)
    })

    it('未知通道的退订同样原样委托（不因无包装器报错）', async () => {
        const api = await loadDialogApi()
        const rawCallback = vi.fn()

        api.ipcRenderer.removeListener('baize:never-registered', rawCallback)

        expect(mocks.removeListener).toHaveBeenCalledWith('baize:never-registered', rawCallback)
    })

    it('同一 callback 在不同通道各自持有一份包装器，互不影响', async () => {
        const api = await loadDialogApi()
        const callback = vi.fn()

        api.ipcRenderer.on(RECEIVE_CHANNEL, callback)
        const wrapper = lastRegisteredWrapper()
        api.ipcRenderer.removeListener(RECEIVE_CHANNEL, callback)
        api.ipcRenderer.removeListener(RECEIVE_CHANNEL, callback) // 重复退订幂等

        expect(mocks.removeListener).toHaveBeenNthCalledWith(1, RECEIVE_CHANNEL, wrapper)
        expect(mocks.removeListener).toHaveBeenNthCalledWith(2, RECEIVE_CHANNEL, callback)
    })
})

describe('preload/dialog 暴露异常分支', () => {
    it('exposeInMainWorld 抛错时只记录 console.error，不向上抛出', async () => {
        const failure = new Error('contextBridge failed')
        mocks.exposeInMainWorld.mockImplementationOnce(() => {
            throw failure
        })

        await expect(import('../../src/preload/dialog')).resolves.toBeDefined()
        expect(errorSpy).toHaveBeenCalledWith(failure)
    })

    it('contextIsolated=false 时不做任何暴露', async () => {
        ;(process as unknown as { contextIsolated?: boolean }).contextIsolated = false

        await import('../../src/preload/dialog')

        expect(mocks.exposeInMainWorld).not.toHaveBeenCalled()
    })
})

describe('preload/dialog shell.openExternal 协议白名单', () => {
    it('http/https 链接规范化后委托系统打开', async () => {
        const api = await loadDialogApi()

        await api.shell.openExternal('https://example.com')
        await api.shell.openExternal('http://example.com/path?q=1')
        await api.shell.openExternal('  https://example.com/space path  ')

        expect(mocks.openExternal).toHaveBeenNthCalledWith(1, 'https://example.com/')
        expect(mocks.openExternal).toHaveBeenNthCalledWith(2, 'http://example.com/path?q=1')
        expect(mocks.openExternal).toHaveBeenNthCalledWith(3, 'https://example.com/space%20path')
        expect(warnSpy).not.toHaveBeenCalled()
    })

    it('非 http/https 协议、非法 URL、空串与非字符串输入全部拒绝并告警', async () => {
        const api = await loadDialogApi()

        const rejected: unknown[] = [
            'javascript:alert(1)',
            'file:///C:/Windows/System32/calc.exe',
            'data:text/html,<h1>x</h1>',
            'ftp://example.com/file',
            'not a valid url',
            '',
            '   ',
            null,
            undefined,
            123
        ]
        for (const url of rejected) {
            await expect(api.shell.openExternal(url as unknown as string)).resolves.toBeUndefined()
        }

        expect(mocks.openExternal).not.toHaveBeenCalled()
        // 每次拒绝都应留下告警（含 URL 原文或 String(url) 形式）
        expect(warnSpy).toHaveBeenCalledTimes(rejected.length)
        expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('已拒绝打开非 http/https'))
    })

    it('下游 shell 异常会透传给渲染层调用方', async () => {
        const api = await loadDialogApi()
        mocks.openExternal.mockRejectedValueOnce(new Error('no default browser'))

        await expect(api.shell.openExternal('https://example.com')).rejects.toThrow(
            'no default browser'
        )
    })
})
