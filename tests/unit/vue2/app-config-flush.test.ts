// @vitest-environment jsdom
/**
 * FE-35 回归测试：配置写盘去抖 200ms + 关窗/卸载前主动 flush。
 *
 * 背景：useConfigStore 的配置写盘原为 500ms 去抖且无 flush 钩子，主窗口关闭流程
 * 只 flush 编辑器内容（main/index.ts），关闭前最后 500ms 内的设置修改可能丢失。
 *
 * 修复：
 *   ① 去抖窗口 500ms → 200ms（useConfigStore.CONFIG_SAVE_DEBOUNCE_MS）；
 *   ② 新增 flushConfigWrites()，由 App.vue 在以下时机调用：
 *      - 主进程关闭前 flush 事件 IPC.EDITOR.FLUSH_CONTENT（主进程会等回执 2s，渲染层仍存活）；
 *      - window beforeunload（刷新/关闭兜底）；
 *      - onBeforeUnmount（卸载兜底）。
 *
 * 本测试覆盖 App.vue 的三个触发点均能立即落盘待写配置，且不会重复写盘。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'

// 壳层子组件仅用于挂载 App，避免加载 monaco 等重型依赖
vi.mock('../../../src/renderer/src/components/WelcomeScreen.vue', () => ({
    default: { name: 'WelcomeScreenStub', template: '<div class="welcome-stub" />' }
}))
vi.mock('../../../src/renderer/src/components/BaiZeNotes.vue', () => ({
    default: { name: 'BaiZeNotesStub', template: '<div class="main-stub" />' }
}))

import App from '../../../src/renderer/src/App.vue'
import { IPC } from '../../../src/shared/ipc-channels'
import { getConfigStore } from '../../../src/renderer/src/common/useConfigStore'

type IpcListener = (event: unknown, payload?: unknown) => void

interface IpcHarness {
    trigger: (channel: string, payload?: unknown) => void
}

const configWrite = vi.fn()

function installIpcHarness(): IpcHarness {
    const listeners = new Map<string, IpcListener[]>()
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
        ipcRenderer: {
            on,
            removeListener,
            send: vi.fn(),
            invoke: vi.fn().mockResolvedValue(undefined)
        }
    })
    configWrite.mockReset().mockResolvedValue(true)
    vi.stubGlobal('api', {
        config: {
            read: vi.fn().mockResolvedValue(undefined),
            write: configWrite
        },
        // P2-5：渲染层就绪握手（App.vue onMounted 末尾调用，本测试不关心其去向）
        app: { notifyRendererReady: vi.fn() }
    })
    return {
        trigger(channel: string, payload?: unknown) {
            for (const listener of listeners.get(channel) ?? []) {
                listener({}, payload)
            }
        }
    }
}

let wrapper: VueWrapper | null = null
let ipc: IpcHarness

/** 等待微任务队列（onMounted 中的 config.read / flush 的 await 链） */
async function settle(): Promise<void> {
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()
    await wrapper?.vm.$nextTick()
}

async function mountApp(): Promise<VueWrapper> {
    ipc = installIpcHarness()
    wrapper = mount(App)
    await settle()
    return wrapper
}

beforeEach(() => {
    vi.useFakeTimers()
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('App.vue 配置 flush（FE-35）', () => {
    it('主进程关窗 flush 事件（IPC.EDITOR.FLUSH_CONTENT）到达时立即落盘待写配置', async () => {
        await mountApp()
        const store = getConfigStore()
        store.updateEditorConfig({ fontSize: 20 })

        // 去抖窗口内尚未写盘
        expect(configWrite).not.toHaveBeenCalled()

        ipc.trigger(IPC.EDITOR.FLUSH_CONTENT)
        await settle()

        expect(configWrite).toHaveBeenCalledTimes(1)
        expect(configWrite).toHaveBeenCalledWith(
            'editor',
            expect.objectContaining({ fontSize: 20 })
        )

        // 去抖计时器已被取消：推进时间不再重复写盘
        await vi.advanceTimersByTimeAsync(500)
        expect(configWrite).toHaveBeenCalledTimes(1)
    })

    it('window beforeunload 事件兜底 flush 待写配置', async () => {
        await mountApp()
        getConfigStore().updateThemeConfig({ currentTheme: 'beforeunload-dark' })
        expect(configWrite).not.toHaveBeenCalled()

        window.dispatchEvent(new Event('beforeunload'))
        await settle()

        expect(configWrite).toHaveBeenCalledWith(
            'theme',
            expect.objectContaining({ currentTheme: 'beforeunload-dark' })
        )
    })

    it('App 卸载（onBeforeUnmount）时兜底 flush 待写配置', async () => {
        const app = await mountApp()
        getConfigStore().updateSystemConfig({ language: 'en-US' })
        expect(configWrite).not.toHaveBeenCalled()

        app.unmount()
        wrapper = null
        await Promise.resolve()
        await Promise.resolve()

        expect(configWrite).toHaveBeenCalledWith(
            'system',
            expect.objectContaining({ language: 'en-US' })
        )
    })

    it('卸载后移除配置 flush 的 IPC 监听，避免组件销毁后重复写盘', async () => {
        const app = await mountApp()
        const electron = (
            globalThis as unknown as {
                electron: { ipcRenderer: { removeListener: ReturnType<typeof vi.fn> } }
            }
        ).electron

        app.unmount()
        wrapper = null

        expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
            IPC.EDITOR.FLUSH_CONTENT,
            expect.any(Function)
        )
    })
})
