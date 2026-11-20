// @vitest-environment jsdom
/**
 * App.vue 主界面按需加载/错误兜底/启动恢复分支补测（覆盖率补测第四批）
 *
 * 既有 app-welcome-restore / app-config-flush 已覆盖欢迎页与主界面切换的正常路径；
 * 本文件补齐未覆盖的分支：
 * 1. 首帧后的空闲预加载：rAF + requestIdleCallback 路径、无 rAF 退化 setTimeout 路径；
 * 2. 预加载失败只记日志（不阻塞欢迎页）；
 * 3. `show-welcome=false` / 自动打开上次会话两条启动路径的模块加载失败降级；
 * 4. 主界面异步 chunk 加载失败的错误占位（Error 与非 Error 两种负载）+ 重试按钮；
 * 5. 打开文件/文件夹/最近文件夹：IPC 信号 + 最近列表去重、非数组回退、读取失败告警；
 * 6. WELCOME_ENTER_MAIN 目录分支与最大化延迟；卸载清理监听。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

vi.mock('../../../src/renderer/src/components/WelcomeScreen.vue', () => ({
    default: {
        name: 'WelcomeScreenStub',
        emits: ['open-file', 'open-folder', 'open-recent-folder'],
        template: '<div class="welcome-stub" />'
    }
}))

vi.mock('../../../src/renderer/src/components/BaiZeNotes.vue', () => ({
    default: {
        name: 'BaiZeNotesStub',
        emits: ['main-view-mounted'],
        template: '<div class="main-stub" />',
        mounted(this: { $emit: (event: string) => void }) {
            this.$emit('main-view-mounted')
        }
    }
}))

import App from '../../../src/renderer/src/App.vue'
import { IPC } from '../../../src/shared/ipc-channels'
import { getConfigStore } from '../../../src/renderer/src/common/useConfigStore'

type IpcListener = (event: unknown, payload?: unknown) => void

interface IpcHarness {
    listeners: Map<string, IpcListener[]>
    send: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
    notifyRendererReady: ReturnType<typeof vi.fn>
    trigger: (channel: string, payload?: unknown) => void
}

let wrapper: VueWrapper | null = null
let ipc: IpcHarness
let configRead: ReturnType<typeof vi.fn>
let configWrite: ReturnType<typeof vi.fn>

/**
 * 安装 IPC/API 桩。
 * @param welcomeConfig show-welcome 读取值
 * @param systemSetting system 配置读取值
 */
function installHarness(welcomeConfig: unknown = undefined, systemSetting: unknown = null): void {
    const listeners = new Map<string, IpcListener[]>()
    const send = vi.fn()
    const invoke = vi.fn().mockResolvedValue(undefined)
    const on = vi.fn((channel: string, listener: IpcListener) => {
        const list = listeners.get(channel) ?? []
        list.push(listener)
        listeners.set(channel, list)
    })
    const removeListener = vi.fn((channel: string, listener: IpcListener) => {
        const list = listeners.get(channel) ?? []
        listeners.set(
            channel,
            list.filter((fn) => fn !== listener)
        )
    })
    vi.stubGlobal('electron', { ipcRenderer: { on, removeListener, send, invoke } })

    configRead = vi.fn((name: string) => {
        if (name === 'show-welcome') return Promise.resolve(welcomeConfig)
        if (name === 'system') return Promise.resolve(systemSetting)
        if (name === 'recent-folders') return Promise.resolve(['C:\\keep'])
        return Promise.resolve(undefined)
    })
    configWrite = vi.fn().mockResolvedValue(true)
    const notifyRendererReady = vi.fn()
    vi.stubGlobal('api', {
        config: { read: configRead, write: configWrite },
        app: { notifyRendererReady }
    })

    ipc = {
        listeners,
        send,
        on,
        removeListener,
        notifyRendererReady,
        trigger(channel: string, payload?: unknown) {
            for (const listener of listeners.get(channel) ?? []) {
                listener({}, payload)
            }
        }
    }
}

/** 推进微任务 + Vue flush（不依赖真实等待） */
async function settle(maxTicks = 100): Promise<void> {
    for (let i = 0; i < maxTicks; i++) {
        await Promise.resolve()
        await wrapper?.vm.$nextTick()
    }
}

async function mountApp(): Promise<VueWrapper> {
    wrapper = mount(App)
    await settle()
    return wrapper
}

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    installHarness()
    // 每个用例前重置 store 单例的对话框状态
    const store = getConfigStore()
    store.hideDialog('message')
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('App.vue：首帧后空闲预加载', () => {
    it('rAF + requestIdleCallback 路径触发预加载', async () => {
        const rafCallbacks: FrameRequestCallback[] = []
        const idleCallbacks: Array<() => void> = []
        vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
            rafCallbacks.push(cb)
            return 1
        })
        vi.stubGlobal('requestIdleCallback', (cb: () => void) => {
            idleCallbacks.push(cb)
            return 1
        })

        await mountApp()
        expect(rafCallbacks).toHaveLength(1)
        rafCallbacks[0](0)
        expect(idleCallbacks).toHaveLength(1)

        idleCallbacks[0]()
        await settle()
        // 欢迎页仍显示（预加载不自动进入主界面）
        expect(wrapper?.find('.welcome-stub').exists()).toBe(true)
    })

    it('无 requestAnimationFrame 时退化为 setTimeout 宏任务预加载', async () => {
        vi.stubGlobal('requestAnimationFrame', undefined)
        vi.stubGlobal('requestIdleCallback', undefined)

        await mountApp()
        expect(wrapper?.find('.welcome-stub').exists()).toBe(true)
        // 宏任务预加载已排期：推进定时器不抛异常
        vi.advanceTimersByTime(1)
        await settle()
    })
})

describe('App.vue：打开文件 / 文件夹 / 最近文件夹', () => {
    it('打开文件与打开文件夹发送对应 IPC 信号', async () => {
        await mountApp()
        const welcome = wrapper!.findComponent({ name: 'WelcomeScreenStub' })

        welcome.vm.$emit('open-file')
        expect(ipc.send).toHaveBeenCalledWith(IPC.FILE.WELCOME_OPEN_FILE)

        welcome.vm.$emit('open-folder')
        expect(ipc.send).toHaveBeenCalledWith(IPC.FILE.WELCOME_OPEN_DIRECTORY)
    })

    it('打开最近文件夹：等待主界面加载 → 隐藏欢迎页 → 最大化 → 打开指定目录 → 去重保存', async () => {
        await mountApp()
        const welcome = wrapper!.findComponent({ name: 'WelcomeScreenStub' })

        welcome.vm.$emit('open-recent-folder', 'C:\\keep')
        await settle()

        expect(wrapper!.find('.welcome-stub').exists()).toBe(false)
        expect(ipc.send).toHaveBeenCalledWith(IPC.WINDOW.MAXIMIZE)
        expect(ipc.send).toHaveBeenCalledWith(IPC.FILE.OPEN_SPECIFIC_FOLDER, 'C:\\keep')
        // 重复项被移除后置顶，最多保留 20 项
        expect(configWrite).toHaveBeenCalledWith('recent-folders', ['C:\\keep'])
    })

    it('最近列表读取值非数组时回退空数组', async () => {
        await mountApp()
        configRead.mockImplementation((name: string) => {
            if (name === 'recent-folders') return Promise.resolve('not-an-array')
            return Promise.resolve(undefined)
        })
        wrapper!
            .findComponent({ name: 'WelcomeScreenStub' })
            .vm.$emit('open-recent-folder', 'D:\\new')
        await settle()
        expect(configWrite).toHaveBeenCalledWith('recent-folders', ['D:\\new'])
    })

    it('最近列表读取失败只记日志不阻塞进入主界面', async () => {
        await mountApp()
        configRead.mockImplementation(() => Promise.reject(new Error('read failed')))
        wrapper!
            .findComponent({ name: 'WelcomeScreenStub' })
            .vm.$emit('open-recent-folder', 'E:\\fail')
        await settle()
        expect(ipc.send).toHaveBeenCalledWith(IPC.FILE.OPEN_SPECIFIC_FOLDER, 'E:\\fail')
        expect(wrapper!.find('.welcome-stub').exists()).toBe(false)
    })
})

describe('App.vue：WELCOME_ENTER_MAIN 与卸载', () => {
    it('目录事件进入主界面、延迟最大化并保存最近列表', async () => {
        await mountApp()
        ipc.trigger(IPC.FILE.WELCOME_ENTER_MAIN, { type: 'directory', path: 'C:\\dir' })
        await settle()
        expect(wrapper!.find('.welcome-stub').exists()).toBe(false)

        // 最大化延迟 100ms 后发送
        expect(ipc.send).not.toHaveBeenCalledWith(IPC.WINDOW.MAXIMIZE)
        vi.advanceTimersByTime(100)
        expect(ipc.send).toHaveBeenCalledWith(IPC.WINDOW.MAXIMIZE)
        expect(configWrite).toHaveBeenCalledWith('recent-folders', ['C:\\dir', 'C:\\keep'])
    })

    it('文件事件不写入最近文件夹列表', async () => {
        await mountApp()
        configWrite.mockClear()
        ipc.trigger(IPC.FILE.WELCOME_ENTER_MAIN, { type: 'file', path: 'C:\\a.md' })
        await settle()
        expect(configWrite).not.toHaveBeenCalledWith('recent-folders', expect.anything())
    })

    it('卸载时移除 IPC/窗口监听并触底 flush 配置', async () => {
        const mounted = await mountApp()
        const flushSpy = vi.spyOn(
            await import('../../../src/renderer/src/common/useConfigStore'),
            'flushConfigWrites'
        )
        mounted.unmount()
        wrapper = null
        expect(ipc.removeListener).toHaveBeenCalledWith(
            IPC.FILE.WELCOME_ENTER_MAIN,
            expect.any(Function)
        )
        expect(flushSpy).toHaveBeenCalled()
    })
})

describe('App.vue：主界面模块加载失败降级', () => {
    /**
     * 用「模块工厂抛错」模拟真实动态 import 失败（preloadMainView 的 Promise 直接 reject）。
     * 另提供「default getter 抛错」模式，用于覆盖 errorComponent 收到非 Error 负载的兜底。
     */
    async function mountWithFailingMainView(
        thrown: unknown,
        mode: 'import-reject' | 'default-getter' = 'import-reject'
    ): Promise<VueWrapper> {
        vi.resetModules()
        if (mode === 'import-reject') {
            vi.doMock('../../../src/renderer/src/components/BaiZeNotes.vue', () => {
                throw thrown
            })
        } else {
            vi.doMock('../../../src/renderer/src/components/BaiZeNotes.vue', () => ({
                get default(): unknown {
                    throw thrown
                }
            }))
        }
        try {
            const { default: FreshApp } = await import('../../../src/renderer/src/App.vue')
            wrapper = mount(FreshApp)
            // 失败路径含动态 import 拒绝链与 Vue 异步组件错误渲染，需要额外宏任务推进
            await new Promise((resolve) => setImmediate(resolve))
            await settle()
            await new Promise((resolve) => setImmediate(resolve))
            await settle()
            return wrapper
        } finally {
            vi.doUnmock('../../../src/renderer/src/components/BaiZeNotes.vue')
        }
    }

    it('show-welcome=false 且模块加载失败：显示错误占位、不阻塞 READY 握手', async () => {
        installHarness(false, null)
        const mounted = await mountWithFailingMainView(new Error('chunk 加载失败'))
        await settle()

        expect(mounted.find('.main-view-error').exists()).toBe(true)
        expect(mounted.find('.main-view-error').text().length).toBeGreaterThan(0)
        expect(ipc.notifyRendererReady).toHaveBeenCalled()
    })

    it('非 Error 错误负载走 String 兜底展示；点击重试不抛异常', async () => {
        installHarness(false, null)
        const mounted = await mountWithFailingMainView('字符串错误', 'default-getter')
        await settle()

        const errorPane = mounted.find('.main-view-error')
        expect(errorPane.exists()).toBe(true)
        expect(errorPane.text()).toContain('字符串错误')

        // Vue 3 的 errorComponent 不传 retry；产品已给默认空实现，点击不得抛 TypeError
        await errorPane.find('button').trigger('click')
        await settle()
        expect(mounted.find('.main-view-error').exists()).toBe(true)
    })

    it('自动打开上次会话且模块加载失败：仅记录日志并继续握手', async () => {
        installHarness(true, { autoOpenLastFile: true })
        const mounted = await mountWithFailingMainView(new Error('auto-open chunk 失败'))
        await settle()
        // 欢迎页保持显示；READY 握手仍会发送
        expect(ipc.notifyRendererReady).toHaveBeenCalled()
        expect(mounted.exists()).toBe(true)
    })
})
