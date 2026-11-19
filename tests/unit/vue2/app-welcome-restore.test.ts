// @vitest-environment jsdom
/**
 * 欢迎页启动行为测试（产品决策 2026-11-15）
 *
 * 行为约定：
 * 1. 启动后**始终显示欢迎页**——即使主进程已在后台恢复上次打开的目录/文件
 *    （FILE_SYSTEM_DATA / SHOW_SELECTED_FILE_CONTEXT / USER_SELECT_FILE 等数据事件到达），
 *    渲染层也不自动进入主界面；
 * 2. 只有用户主动操作（欢迎页「打开文件 / 打开文件夹」→ 主进程 WELCOME_ENTER_MAIN，
 *    或「最近文件夹」→ 渲染层先隐藏欢迎页）才进入主界面；
 * 3. 欢迎页期间到达的恢复数据事件被忽略，不影响后续主动进入——主进程在用户进入时
 *    会重新下发目录树/文件内容（handlers.ts 的 WELCOME_* 与 OPEN_SPECIFIC_FOLDER 流程）；
 * 4. `show-welcome === false` 配置仍然允许启动时直接进入主界面。
 *
 * 背景：此前 FE-18 的实现为「欢迎页可见期间收到恢复数据事件即自动进入主界面」，
 * 2026-11-15 实机反馈确认该行为会让用户看不到欢迎页（启动直接进主窗口），
 * 经产品决策改为「启动总是显示欢迎页」。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

// 壳层子组件仅用于断言欢迎页/主界面切换，避免加载 monaco 等重型依赖
vi.mock('../../../src/renderer/src/components/WelcomeScreen.vue', () => ({
    default: { name: 'WelcomeScreenStub', template: '<div class="welcome-stub" />' }
}))
vi.mock('../../../src/renderer/src/components/BaiZeNotes.vue', () => ({
    default: {
        name: 'BaiZeNotesStub',
        // 与真实 BaiZeNotes.vue 保持同一契约：挂载完成后 emit('main-view-mounted')，
        // App.vue 以此作为「主界面监听器已就位」的信号（READY 握手时序）
        emits: ['main-view-mounted'],
        template: '<div class="main-stub" />',
        mounted(this: { $emit: (event: string) => void }) {
            this.$emit('main-view-mounted')
        }
    }
}))

import App from '../../../src/renderer/src/App.vue'
import { IPC } from '../../../src/shared/ipc-channels'

type IpcListener = (event: unknown, payload?: unknown) => void

interface IpcHarness {
    listeners: Map<string, IpcListener[]>
    send: ReturnType<typeof vi.fn>
    invoke: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    removeListener: ReturnType<typeof vi.fn>
    // P2-5：渲染层就绪握手（window.api.app.notifyRendererReady 的桩）
    notifyRendererReady: ReturnType<typeof vi.fn>
    trigger: (channel: string, payload?: unknown) => void
}

/** 安装 IPC 桩（show-welcome 与 system 两个配置名分开返回，便于覆盖启动恢复分支） */
function installIpcHarness(
    welcomeConfig?: unknown,
    options: { systemSetting?: unknown; onRendererReady?: () => void } = {}
): IpcHarness {
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
    vi.stubGlobal('electron', {
        ipcRenderer: { on, removeListener, send, invoke }
    })
    // P2-5：渲染层就绪握手（onMounted 末尾经 window.api.app.notifyRendererReady 发送）
    const notifyRendererReady = vi.fn(() => {
        options.onRendererReady?.()
    })
    vi.stubGlobal('api', {
        config: {
            read: vi.fn((name: string) =>
                Promise.resolve(name === 'system' ? options.systemSetting : welcomeConfig)
            ),
            write: vi.fn().mockResolvedValue(true)
        },
        app: { notifyRendererReady }
    })
    return {
        listeners,
        send,
        invoke,
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

let wrapper: VueWrapper | null = null
let ipc: IpcHarness

/**
 * 等待微任务队列（onMounted 中的 config.read / 主界面动态 import / Vue 渲染 flush）。
 *
 * 主界面改为 defineAsyncComponent 后，进入主界面需要额外经过「动态 import 解析 →
 * 异步组件 resolvedComp 赋值 → 挂载提交」若干轮微任务，固定次数的 Promise.resolve
 * 不足以覆盖；这里循环推进微任务 + nextTick，直到断言条件满足或达到上限。
 * 不使用真实定时器（本文件用 vi.useFakeTimers 控制 maximize 的 setTimeout）。
 */
async function settle(maxTicks = 200): Promise<void> {
    for (let i = 0; i < maxTicks; i++) {
        await Promise.resolve()
        await wrapper?.vm.$nextTick()
    }
}

/** 等待主界面异步组件挂载完成（动态 import + 异步组件解析），用于时序断言 */
async function waitForMainViewMounted(): Promise<void> {
    for (let i = 0; i < 200; i++) {
        if (wrapper?.find('.main-stub').exists()) return
        await Promise.resolve()
        await wrapper?.vm.$nextTick()
    }
}

async function mountApp(
    welcomeConfig?: unknown,
    options: { systemSetting?: unknown; onRendererReady?: () => void } = {}
): Promise<VueWrapper> {
    ipc = installIpcHarness(welcomeConfig, options)
    wrapper = mount(App)
    await settle()
    return wrapper
}

function hasSend(channel: string): boolean {
    return ipc.send.mock.calls.some((call) => call[0] === channel)
}

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('App.vue 欢迎页启动行为', () => {
    it('无任何事件时停留在欢迎页，不发送窗口/文件 IPC', async () => {
        const app = await mountApp()

        expect(app.find('.welcome-stub').exists()).toBe(true)
        expect(app.find('.main-stub').exists()).toBe(false)

        // P2-5：onMounted 完成后发出渲染层就绪握手（经 window.api，不走 electron.ipcRenderer.send）
        expect(ipc.notifyRendererReady).toHaveBeenCalledTimes(1)

        vi.advanceTimersByTime(500)
        expect(ipc.send).not.toHaveBeenCalled()
    })

    it('启动恢复的目录数据（FILE_SYSTEM_DATA）到达时仍停留在欢迎页', async () => {
        const app = await mountApp()
        const treeJson = JSON.stringify([{ id: 'root', name: 'docs', type: 'dir' }])

        ipc.trigger(IPC.FILE_MANAGER.FILE_SYSTEM_DATA, treeJson)
        await settle()

        // 不自动进入主界面
        expect(app.find('.welcome-stub').exists()).toBe(true)
        expect(app.find('.main-stub').exists()).toBe(false)

        // 也不应触发最大化 / 目录重同步等副作用
        vi.advanceTimersByTime(500)
        expect(hasSend(IPC.WINDOW.MAXIMIZE)).toBe(false)
        expect(hasSend(IPC.FILE_MANAGER.RELOAD_FROM_DISK)).toBe(false)
        expect(hasSend(IPC.FILE.OPEN_SELECT_FILE)).toBe(false)
    })

    it('启动恢复的文件数据（SHOW_SELECTED_FILE_CONTEXT + USER_SELECT_FILE）到达时仍停留在欢迎页', async () => {
        const app = await mountApp()

        ipc.trigger(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT, '# 标题\n正文')
        ipc.trigger(IPC.FILE.USER_SELECT_FILE, 'C:\\docs\\note.md')
        await settle()

        expect(app.find('.welcome-stub').exists()).toBe(true)
        expect(app.find('.main-stub').exists()).toBe(false)

        vi.advanceTimersByTime(500)
        expect(hasSend(IPC.WINDOW.MAXIMIZE)).toBe(false)
        expect(hasSend(IPC.FILE.OPEN_SELECT_FILE)).toBe(false)
    })

    it('用户主动打开文件/文件夹（WELCOME_ENTER_MAIN）时进入主界面并最大化', async () => {
        const app = await mountApp()

        ipc.trigger(IPC.FILE.WELCOME_ENTER_MAIN, { type: 'directory', path: 'C:\\docs' })
        await waitForMainViewMounted()
        await settle()

        expect(app.find('.welcome-stub').exists()).toBe(false)
        expect(app.find('.main-stub').exists()).toBe(true)

        vi.advanceTimersByTime(500)
        expect(hasSend(IPC.WINDOW.MAXIMIZE)).toBe(true)
    })

    it('show-welcome=false 配置允许启动时直接进入主界面，且 READY 在主界面挂载之后才发送', async () => {
        // 主界面改为 defineAsyncComponent 分块加载后，READY 握手必须在「主界面组件挂载 +
        // 子组件监听器注册」完成后才发出，否则主进程随后投递的启动恢复数据事件会被丢弃
        // （FE-01 时序回归）。这里在握手回调发生的那一刻断言主界面已渲染。
        let mainViewMountedAtReady = false
        const app = await mountApp(false, {
            onRendererReady: () => {
                mainViewMountedAtReady = wrapper?.find('.main-stub').exists() ?? false
            }
        })
        await waitForMainViewMounted()
        await settle()

        expect(app.find('.main-stub').exists()).toBe(true)
        expect(app.find('.welcome-stub').exists()).toBe(false)
        expect(ipc.notifyRendererReady).toHaveBeenCalledTimes(1)
        expect(mainViewMountedAtReady).toBe(true)
    })

    it('自动打开上次会话（autoOpenLastFile）时在 READY 前预加载主界面模块，但仍停留在欢迎页', async () => {
        // 主进程收到 READY 后会先 send WELCOME_ENTER_MAIN、再于下一 tick 投递数据事件；
        // 该分支要求 READY 前已完成主界面模块加载（WELCOME_ENTER_MAIN 到达时异步组件可立即解析）。
        const app = await mountApp(undefined, { systemSetting: { autoOpenLastFile: true } })
        await settle()

        // 启动恢复的 WELCOME_ENTER_MAIN 尚未到达时仍显示欢迎页（产品决策：不自动跳转）
        expect(app.find('.welcome-stub').exists()).toBe(true)
        expect(app.find('.main-stub').exists()).toBe(false)
        expect(ipc.notifyRendererReady).toHaveBeenCalledTimes(1)

        // 模拟主进程收到握手后立即下发 WELCOME_ENTER_MAIN：主界面分块已预加载，应能挂载
        ipc.trigger(IPC.FILE.WELCOME_ENTER_MAIN, { type: 'file', path: 'C:\\docs\\a.md' })
        await waitForMainViewMounted()

        expect(app.find('.main-stub').exists()).toBe(true)
        expect(app.find('.welcome-stub').exists()).toBe(false)
    })

    it('自动打开上次会话（autoOpenLastFolder）时同样在 READY 前预加载主界面模块', async () => {
        const app = await mountApp(undefined, { systemSetting: { autoOpenLastFolder: true } })
        await settle()

        expect(app.find('.welcome-stub').exists()).toBe(true)
        expect(ipc.notifyRendererReady).toHaveBeenCalledTimes(1)

        ipc.trigger(IPC.FILE.WELCOME_ENTER_MAIN, { type: 'directory', path: 'C:\\docs' })
        await waitForMainViewMounted()

        expect(app.find('.main-stub').exists()).toBe(true)
    })

    it('只注册必要的 IPC 监听：WELCOME_ENTER_MAIN 与配置 flush', async () => {
        await mountApp()

        const channels = ipc.on.mock.calls.map((call) => call[0])
        expect(channels).toContain(IPC.FILE.WELCOME_ENTER_MAIN)
        expect(channels).toContain(IPC.EDITOR.FLUSH_CONTENT)
        // 恢复数据事件不再注册（产品决策：不自动进入主界面）
        expect(channels).not.toContain(IPC.FILE_MANAGER.FILE_SYSTEM_DATA)
        expect(channels).not.toContain(IPC.EVENTS.SHOW_SELECTED_FILE_CONTEXT)
        expect(channels).not.toContain(IPC.FILE.USER_SELECT_FILE)
    })

    it('卸载时移除已注册的监听器', async () => {
        const app = await mountApp()

        app.unmount()
        wrapper = null

        expect(ipc.removeListener).toHaveBeenCalledWith(
            IPC.FILE.WELCOME_ENTER_MAIN,
            expect.any(Function)
        )
        expect(ipc.removeListener).toHaveBeenCalledWith(
            IPC.EDITOR.FLUSH_CONTENT,
            expect.any(Function)
        )

        // 卸载后推进定时器不应再发送 IPC
        ipc.send.mockClear()
        vi.advanceTimersByTime(500)
        expect(ipc.send).not.toHaveBeenCalled()
    })
})
