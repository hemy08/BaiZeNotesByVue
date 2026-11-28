// @vitest-environment jsdom
/**
 * 1.5.7 终端工具（阶段 B）：TerminalPanel 组件（xterm + addon-fit + IPC 数据流）。
 *
 * 覆盖（xterm / FitAddon / IPC 全部按契约 mock，真实执行组件生命周期与状态机）：
 * 1. 挂载：创建 xterm（主题从 CSS 变量派生）、按容器尺寸调 TERMINAL.CREATE、展示 cwd/shell；
 * 2. 输出：TERMINAL.DATA 按会话 id 过滤 → 16ms 批量 term.write；创建完成前的输出先缓存补写；
 * 3. 输入：term.onData → 16ms 聚合 + 单条 TERMINAL.WRITE ≤4 KiB 分片、超阈值立即冲刷；
 * 4. 尺寸：ResizeObserver → FitAddon.fit → 尺寸变化才 TERMINAL.RESIZE；
 * 5. 生命周期：卸载 → 清定时器/摘 DATA+EXIT 监听/TERMINAL.CLOSE/term.dispose；
 * 6. 退出：TERMINAL.EXIT → 退出提示（含 code）+ 重启按钮 → 关旧会话 + reset + 重建；
 * 7. 失败：CREATE 结构化失败/IPC 不可用 → 可读原因 + 重试；创建期间卸载 → 立刻回收会话；
 * 8. 工具栏：重启/清屏/复制/粘贴/收起（i18n aria-label、剪贴板、粘贴失败反馈、收起事件）；
 * 9. 主题热更新：useTheme 主题状态更新 → term.options.theme 重新派生。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { IPC } from '../../../src/shared/ipc-channels'
import type { ThemeStyles } from '../../../src/shared/types'
import { t } from '../../../src/renderer/src/common/i18n'
import { resetThemeStateForTesting, useTheme } from '../../../src/renderer/src/composables/useTheme'

/** xterm mock 共享状态（vi.mock 工厂只能引用 hoisted 变量） */
const xtermMockState = vi.hoisted(() => ({
    terminals: [] as Array<Record<string, unknown>>,
    selection: ''
}))

/** ResizeObserver mock 共享状态 */
const resizeObserverMockState = vi.hoisted(() => ({
    observers: [] as Array<{ callback: () => void; observe: unknown; disconnect: unknown }>
}))

vi.mock('@xterm/xterm', () => {
    class TerminalMock {
        cols = 80
        rows = 24
        options: Record<string, unknown>
        written: string[] = []
        dataHandlers: Array<(data: string) => void> = []
        open = vi.fn()
        focus = vi.fn()
        clear = vi.fn()
        reset = vi.fn()
        dispose = vi.fn()
        loadAddon = vi.fn()
        write = vi.fn((data: string) => {
            this.written.push(data)
        })
        onData = vi.fn((handler: (data: string) => void) => {
            this.dataHandlers.push(handler)
            return { dispose: vi.fn() }
        })
        onSelectionChange = vi.fn(() => ({ dispose: vi.fn() }))
        getSelection = vi.fn(() => xtermMockState.selection)
        hasSelection = vi.fn(() => xtermMockState.selection.length > 0)

        constructor(options: Record<string, unknown>) {
            this.options = { ...options }
            xtermMockState.terminals.push(this as unknown as Record<string, unknown>)
        }

        /** 测试辅助：模拟用户键盘输入 */
        emitData(data: string): void {
            for (const handler of this.dataHandlers) {
                handler(data)
            }
        }
    }
    return { Terminal: TerminalMock }
})

vi.mock('@xterm/addon-fit', () => {
    class FitAddonMock {
        fit = vi.fn()
    }
    return { FitAddon: FitAddonMock }
})

// 剪贴板 helper 单独 mock（复制成功/失败路径由本用例控制）
const copyTextToClipboardMock = vi.hoisted(() => vi.fn(async () => true))
vi.mock('@renderer/common/clipboard', () => ({
    copyTextToClipboard: copyTextToClipboardMock
}))

vi.mock('@renderer/common/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import TerminalPanel from '@renderer/components/terminal/TerminalPanel.vue'

let wrapper: VueWrapper | null = null
let invokeMock: ReturnType<typeof vi.fn>
let onMock: ReturnType<typeof vi.fn>
let removeListenerMock: ReturnType<typeof vi.fn>
let ipcHandlers: Map<string, (...args: unknown[]) => void>

/** 取当前 xterm mock 实例（组件内 new Terminal 的唯一实例） */
function currentTerminal(): {
    cols: number
    rows: number
    options: Record<string, unknown>
    written: string[]
    emitData: (data: string) => void
    focus: ReturnType<typeof vi.fn>
    clear: ReturnType<typeof vi.fn>
    reset: ReturnType<typeof vi.fn>
    dispose: ReturnType<typeof vi.fn>
    open: ReturnType<typeof vi.fn>
} {
    const terminal = xtermMockState.terminals[xtermMockState.terminals.length - 1]
    return terminal as unknown as ReturnType<typeof currentTerminal>
}

/** 触发最近一次创建的 ResizeObserver 回调（模拟容器尺寸变化） */
function triggerResizeObserver(): void {
    const observer = resizeObserverMockState.observers[resizeObserverMockState.observers.length - 1]
    observer.callback()
}

/** 统计某 IPC 通道的 invoke 调用参数（按调用顺序） */
function callsOf(channel: string): unknown[][] {
    return invokeMock.mock.calls.filter((call) => call[0] === channel).map((call) => call.slice(1))
}

/** 模拟主进程事件下发 */
function emitIpcEvent(channel: string, payload: unknown): void {
    const handler = ipcHandlers.get(channel)
    expect(handler, `组件应已注册 ${channel} 监听`).toBeDefined()
    handler!({}, payload)
}

/** 等待输出/输入 16ms 聚合定时器落盘 */
async function waitForBatchFlush(): Promise<void> {
    await vi.waitFor(() => {
        expect(true).toBe(true)
    })
    await new Promise<void>((resolve) => {
        setTimeout(resolve, 30)
    })
}

beforeEach(() => {
    xtermMockState.terminals.length = 0
    xtermMockState.selection = ''
    resizeObserverMockState.observers.length = 0
    ipcHandlers = new Map()
    invokeMock = vi.fn(async (channel: string): Promise<unknown> => {
        if (channel === IPC.TERMINAL.CREATE) {
            return { ok: true, id: 'session-1', cwd: 'C:\\notes', shell: 'cmd.exe' }
        }
        return { ok: true }
    })
    onMock = vi.fn((channel: string, callback: (...args: unknown[]) => void) => {
        ipcHandlers.set(channel, callback)
    })
    removeListenerMock = vi.fn((channel: string) => {
        ipcHandlers.delete(channel)
    })
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: onMock,
            invoke: invokeMock,
            removeListener: removeListenerMock
        }
    })
    vi.stubGlobal(
        'ResizeObserver',
        class ResizeObserverMock {
            observe = vi.fn()
            disconnect = vi.fn()
            constructor(public callback: () => void) {
                resizeObserverMockState.observers.push(this)
            }
        }
    )
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { readText: vi.fn(async () => '') }
    })
    copyTextToClipboardMock.mockClear()
    copyTextToClipboardMock.mockResolvedValue(true)
})

afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    resetThemeStateForTesting()
    // 主题测试会经 applyThemeStyles 写根元素内联 CSS 变量：清理，避免跨用例污染
    document.documentElement.style.cssText = ''
    document.body.innerHTML = ''
})

/** 挂载终端面板并等待首次 CREATE 完成 */
async function mountPanel(): Promise<VueWrapper> {
    const mounted = mount(TerminalPanel, { attachTo: document.body })
    await flushPromises()
    await flushPromises()
    return mounted
}

describe('TerminalPanel 挂载：xterm 创建与 TERMINAL.CREATE', () => {
    it('挂载后创建 xterm（主题从 CSS 变量派生）并按 fit 尺寸调 CREATE', async () => {
        const getComputedStyleSpy = vi.spyOn(window, 'getComputedStyle').mockReturnValue({
            getPropertyValue: (name: string) =>
                ({
                    '--ui-bg-sunken': '#111111',
                    '--ui-text': '#eeeeee',
                    '--ui-accent': '#764ba2'
                })[name] ?? ''
        } as unknown as CSSStyleDeclaration)

        wrapper = await mountPanel()

        const terminal = currentTerminal()
        expect(terminal.open).toHaveBeenCalledTimes(1)
        // 主题在创建 xterm 时即注入（从 --ui-* 派生，而不是写死配色）
        expect(terminal.options.theme).toEqual(
            expect.objectContaining({ background: '#111111', foreground: '#eeeeee' })
        )
        expect(getComputedStyleSpy).toHaveBeenCalled()
        // CREATE 参数：当前 fit 后的 cols/rows（80×24 为 xterm 初始值，契约 1..500）
        const createCalls = callsOf(IPC.TERMINAL.CREATE)
        expect(createCalls).toHaveLength(1)
        expect(createCalls[0][0]).toMatchObject({ cols: 80, rows: 24 })
        expect(createCalls[0][0]).not.toHaveProperty('shell')
        // 会话创建成功 → 就绪态 + cwd/shell 展示
        expect(wrapper.find('[data-terminal-panel]').attributes('data-terminal-state')).toBe(
            'ready'
        )
        expect(wrapper.text()).toContain('C:\\notes')
        expect(wrapper.text()).toContain('cmd.exe')
        // 就绪后自动聚焦 xterm（键盘输入可用）
        expect(currentTerminal().focus).toHaveBeenCalled()
    })

    it('无障碍契约：角色/标签/工具栏按钮 i18n aria-label', async () => {
        wrapper = await mountPanel()

        const root = wrapper.find('[data-terminal-panel]')
        expect(root.attributes('role')).toBe('application')
        expect(root.attributes('aria-label')).toBe(t('editorUi.terminalPanel.ariaLabel'))
        for (const selector of [
            '.terminal-panel-restart',
            '.terminal-panel-clear',
            '.terminal-panel-copy',
            '.terminal-panel-paste',
            '.terminal-panel-collapse'
        ]) {
            const button = wrapper.find(selector)
            expect(button.exists(), selector).toBe(true)
            expect(button.attributes('aria-label'), selector).toBeTruthy()
        }
        // 点击面板把焦点交给终端
        await root.trigger('click')
        expect(currentTerminal().focus).toHaveBeenCalled()
    })
})

describe('TerminalPanel 数据流：DATA 批量写入 / 会话过滤 / 创世前缓存', () => {
    it('TERMINAL.DATA 按 16ms 批量写入 xterm，非当前会话数据被忽略', async () => {
        wrapper = await mountPanel()
        const terminal = currentTerminal()

        emitIpcEvent(IPC.TERMINAL.DATA, { id: 'session-1', data: 'a' })
        emitIpcEvent(IPC.TERMINAL.DATA, { id: 'session-1', data: 'b' })
        emitIpcEvent(IPC.TERMINAL.DATA, { id: 'other-session', data: 'IGNORED' })
        expect(terminal.written).toEqual([])

        await waitForBatchFlush()
        expect(terminal.written).toEqual(['ab'])
    })

    it('创建响应返回前到达的输出先缓存、建好会话后补写', async () => {
        let resolveCreate: (value: unknown) => void = () => undefined
        invokeMock.mockImplementation(
            (channel: string) =>
                new Promise<unknown>((resolve) => {
                    if (channel === IPC.TERMINAL.CREATE) {
                        resolveCreate = resolve
                        return
                    }
                    resolve({ ok: true })
                })
        )
        wrapper = mount(TerminalPanel, { attachTo: document.body })
        await flushPromises()
        // 创建挂起期间下发输出（会话 id 尚不可比对）
        emitIpcEvent(IPC.TERMINAL.DATA, { id: 'session-1', data: 'banner> ' })
        resolveCreate({ ok: true, id: 'session-1', cwd: 'C:\\notes', shell: 'cmd.exe' })
        await flushPromises()
        await waitForBatchFlush()
        expect(currentTerminal().written).toEqual(['banner> '])
        expect(wrapper.find('[data-terminal-panel]').attributes('data-terminal-state')).toBe(
            'ready'
        )
    })

    it('数据负载非法（缺 data / 非字符串）时安全忽略', async () => {
        wrapper = await mountPanel()
        emitIpcEvent(IPC.TERMINAL.DATA, { id: 'session-1' })
        emitIpcEvent(IPC.TERMINAL.DATA, { id: 'session-1', data: 42 })
        await waitForBatchFlush()
        expect(currentTerminal().written).toEqual([])
    })
})

describe('TerminalPanel 输入：WRITE 聚合与 4 KiB 分片', () => {
    it('连续键盘输入按 16ms 聚合成一次 WRITE', async () => {
        wrapper = await mountPanel()
        const terminal = currentTerminal()

        terminal.emitData('l')
        terminal.emitData('s')
        terminal.emitData('\r')
        expect(callsOf(IPC.TERMINAL.WRITE)).toHaveLength(0)

        await waitForBatchFlush()
        const writeCalls = callsOf(IPC.TERMINAL.WRITE)
        expect(writeCalls).toHaveLength(1)
        expect(writeCalls[0][0]).toEqual({ id: 'session-1', data: 'ls\r' })
    })

    it('大段输入按 4 KiB 分片（单条 invoke 不超过契约体积），超过 8 KiB 阈值立即冲刷', async () => {
        wrapper = await mountPanel()
        const terminal = currentTerminal()

        terminal.emitData('x'.repeat(9000))
        // 达到 8 KiB 阈值 → 同步冲刷，不等 16ms
        const writeCalls = callsOf(IPC.TERMINAL.WRITE)
        expect(writeCalls).toHaveLength(3)
        expect((writeCalls[0][0] as { data: string }).data).toHaveLength(4096)
        expect((writeCalls[1][0] as { data: string }).data).toHaveLength(4096)
        expect((writeCalls[2][0] as { data: string }).data).toHaveLength(808)
    })

    it('会话未就绪/已关闭时不发送输入（避免向不存在的 pty 写入）', async () => {
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.TERMINAL.CREATE) {
                return { ok: false, error: '未打开工作区，无法确定终端运行目录' }
            }
            return { ok: true }
        })
        wrapper = await mountPanel()
        currentTerminal().emitData('echo hi')
        await waitForBatchFlush()
        expect(callsOf(IPC.TERMINAL.WRITE)).toHaveLength(0)
    })
})

describe('TerminalPanel 尺寸同步', () => {
    it('ResizeObserver 触发 fit，尺寸变化才发送 TERMINAL.RESIZE', async () => {
        wrapper = await mountPanel()
        const terminal = currentTerminal()
        expect(callsOf(IPC.TERMINAL.RESIZE)).toHaveLength(0)

        terminal.cols = 120
        terminal.rows = 40
        triggerResizeObserver()
        await flushPromises()
        expect(callsOf(IPC.TERMINAL.RESIZE)).toHaveLength(1)
        expect(callsOf(IPC.TERMINAL.RESIZE)[0][0]).toEqual({
            id: 'session-1',
            cols: 120,
            rows: 40
        })

        // 尺寸未变化：不重复发送
        triggerResizeObserver()
        await flushPromises()
        expect(callsOf(IPC.TERMINAL.RESIZE)).toHaveLength(1)
    })
})

describe('TerminalPanel 生命周期：卸载清理与创建期间卸载回收', () => {
    it('卸载：摘 DATA/EXIT 监听、TERMINAL.CLOSE 回收会话、dispose xterm 与 ResizeObserver', async () => {
        wrapper = await mountPanel()
        const terminal = currentTerminal()
        const observer = resizeObserverMockState.observers[0]
        const dataHandler = ipcHandlers.get(IPC.TERMINAL.DATA)
        const exitHandler = ipcHandlers.get(IPC.TERMINAL.EXIT)

        wrapper.unmount()
        wrapper = null
        await flushPromises()

        expect(removeListenerMock).toHaveBeenCalledWith(IPC.TERMINAL.DATA, dataHandler)
        expect(removeListenerMock).toHaveBeenCalledWith(IPC.TERMINAL.EXIT, exitHandler)
        expect(callsOf(IPC.TERMINAL.CLOSE)).toEqual([[{ id: 'session-1' }]])
        expect(terminal.dispose).toHaveBeenCalledTimes(1)
        expect(observer.disconnect).toHaveBeenCalledTimes(1)
    })

    it('创建会话响应返回前卸载组件：立即回收刚创建的会话（不泄漏 pty）', async () => {
        let resolveCreate: (value: unknown) => void = () => undefined
        invokeMock.mockImplementation(
            (channel: string) =>
                new Promise<unknown>((resolve) => {
                    if (channel === IPC.TERMINAL.CREATE) {
                        resolveCreate = resolve
                        return
                    }
                    resolve({ ok: true })
                })
        )
        wrapper = mount(TerminalPanel, { attachTo: document.body })
        await flushPromises()

        wrapper.unmount()
        wrapper = null
        resolveCreate({ ok: true, id: 'session-late', cwd: 'C:\\notes', shell: 'cmd.exe' })
        await flushPromises()

        expect(callsOf(IPC.TERMINAL.CLOSE)).toEqual([[{ id: 'session-late' }]])
    })
})

describe('TerminalPanel 退出与重启', () => {
    it('TERMINAL.EXIT → 展示退出码与重启按钮；重启 = reset + 新建会话（pty 已退出无需再 CLOSE）', async () => {
        wrapper = await mountPanel()
        const terminal = currentTerminal()

        emitIpcEvent(IPC.TERMINAL.EXIT, { id: 'session-1', exitCode: 3 })
        await flushPromises()

        expect(wrapper.find('[data-terminal-panel]').attributes('data-terminal-state')).toBe(
            'exited'
        )
        expect(wrapper.find('[data-terminal-exit]').exists()).toBe(true)
        expect(wrapper.text()).toContain(t('editorUi.terminalPanel.exited', { code: 3 }))

        // 第二次创建使用新会话 id
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.TERMINAL.CREATE) {
                return { ok: true, id: 'session-2', cwd: 'C:\\notes', shell: 'cmd.exe' }
            }
            return { ok: true }
        })
        await wrapper.find('.terminal-panel-exit-restart').trigger('click')
        await flushPromises()
        await flushPromises()

        // 会话已由主进程退出清理：重启不再对旧 id 发 CLOSE（避免「会话不存在」告警）
        expect(callsOf(IPC.TERMINAL.CLOSE)).toEqual([])
        expect(callsOf(IPC.TERMINAL.CREATE)).toHaveLength(2)
        expect(terminal.reset).toHaveBeenCalledTimes(1)
        expect(wrapper.find('[data-terminal-panel]').attributes('data-terminal-state')).toBe(
            'ready'
        )
    })

    it('运行中点击重启：先 CLOSE 旧会话再 reset + 新建会话（同一 xterm 实例复用）', async () => {
        wrapper = await mountPanel()
        const terminal = currentTerminal()

        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.TERMINAL.CREATE) {
                return { ok: true, id: 'session-2', cwd: 'C:\\notes', shell: 'cmd.exe' }
            }
            return { ok: true }
        })
        await wrapper.find('.terminal-panel-restart').trigger('click')
        await flushPromises()
        await flushPromises()

        expect(callsOf(IPC.TERMINAL.CLOSE)).toEqual([[{ id: 'session-1' }]])
        expect(callsOf(IPC.TERMINAL.CREATE)).toHaveLength(2)
        expect(terminal.reset).toHaveBeenCalledTimes(1)
        expect(wrapper.find('[data-terminal-panel]').attributes('data-terminal-state')).toBe(
            'ready'
        )
    })

    it('退出码未知（exitCode=null）时展示「退出码未知」文案', async () => {
        wrapper = await mountPanel()
        emitIpcEvent(IPC.TERMINAL.EXIT, { id: 'session-1', exitCode: null })
        await flushPromises()
        expect(wrapper.text()).toContain(t('editorUi.terminalPanel.exitedUnknown'))
    })

    it('非当前会话的 EXIT 被忽略', async () => {
        wrapper = await mountPanel()
        emitIpcEvent(IPC.TERMINAL.EXIT, { id: 'other-session', exitCode: 1 })
        await flushPromises()
        expect(wrapper.find('[data-terminal-panel]').attributes('data-terminal-state')).toBe(
            'ready'
        )
    })
})

describe('TerminalPanel 创建失败与重试', () => {
    it('CREATE 结构化失败：展示可读原因 + 重试按钮；重试成功后进入就绪态', async () => {
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.TERMINAL.CREATE) {
                return {
                    ok: false,
                    code: 'TERMINAL_NO_WORKSPACE',
                    error: '未打开工作区，无法确定终端运行目录'
                }
            }
            return { ok: true }
        })
        wrapper = await mountPanel()

        expect(wrapper.find('[data-terminal-panel]').attributes('data-terminal-state')).toBe(
            'error'
        )
        expect(wrapper.find('[data-terminal-error]').text()).toContain(
            '未打开工作区，无法确定终端运行目录'
        )
        expect(wrapper.find('.terminal-panel-retry').exists()).toBe(true)

        // 重试：第二次 CREATE 成功
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.TERMINAL.CREATE) {
                return { ok: true, id: 'session-retry', cwd: 'C:\\work', shell: 'cmd.exe' }
            }
            return { ok: true }
        })
        await wrapper.find('.terminal-panel-retry').trigger('click')
        await flushPromises()
        await flushPromises()
        expect(wrapper.find('[data-terminal-panel]').attributes('data-terminal-state')).toBe(
            'ready'
        )
        expect(wrapper.text()).toContain('C:\\work')
    })

    it('CREATE invoke 抛异常：进入错误态并给出通用可读原因', async () => {
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.TERMINAL.CREATE) {
                throw new Error('ipc broken')
            }
            return { ok: true }
        })
        wrapper = await mountPanel()
        expect(wrapper.find('[data-terminal-panel]').attributes('data-terminal-state')).toBe(
            'error'
        )
        expect(wrapper.find('[data-terminal-error]').text()).toContain(
            t('editorUi.terminalPanel.createFailedUnknown')
        )
    })

    it('IPC 通道不可用（非 Electron 环境）：展示 ipcUnavailable 可读原因', async () => {
        vi.stubGlobal('electron', undefined)
        wrapper = await mountPanel()
        expect(wrapper.find('[data-terminal-panel]').attributes('data-terminal-state')).toBe(
            'error'
        )
        expect(wrapper.find('[data-terminal-error]').text()).toContain(
            t('editorUi.terminalPanel.ipcUnavailable')
        )
    })
})

describe('TerminalPanel 工具栏：清屏 / 复制 / 粘贴 / 收起', () => {
    it('清屏按钮调用 term.clear 并重新聚焦终端', async () => {
        wrapper = await mountPanel()
        const terminal = currentTerminal()
        terminal.focus.mockClear()

        await wrapper.find('.terminal-panel-clear').trigger('click')
        expect(terminal.clear).toHaveBeenCalledTimes(1)
        expect(terminal.focus).toHaveBeenCalled()
    })

    it('复制：有选中内容时写入剪贴板并播报「已复制」', async () => {
        wrapper = await mountPanel()
        xtermMockState.selection = 'echo hello'

        await wrapper.find('.terminal-panel-copy').trigger('click')
        await flushPromises()

        expect(copyTextToClipboardMock).toHaveBeenCalledWith('echo hello')
        expect(wrapper.find('[data-terminal-notice]').text()).toBe(
            t('editorUi.terminalPanel.copied')
        )
    })

    it('复制：无选中内容时不写剪贴板，播报可读提示；写入失败播报复制失败', async () => {
        wrapper = await mountPanel()

        xtermMockState.selection = ''
        await wrapper.find('.terminal-panel-copy').trigger('click')
        await flushPromises()
        expect(copyTextToClipboardMock).not.toHaveBeenCalled()
        expect(wrapper.find('[data-terminal-notice]').text()).toBe(
            t('editorUi.terminalPanel.copyEmpty')
        )

        xtermMockState.selection = 'selected'
        copyTextToClipboardMock.mockResolvedValue(false)
        await wrapper.find('.terminal-panel-copy').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-terminal-notice]').text()).toBe(
            t('editorUi.terminalPanel.copyFailed')
        )
    })

    it('粘贴：读取剪贴板经输入链路发送 WRITE（保持与键盘输入同一有序链路）', async () => {
        wrapper = await mountPanel()
        const readText = vi.fn(async () => 'echo pasted\r')
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: { readText }
        })

        await wrapper.find('.terminal-panel-paste').trigger('click')
        await flushPromises()

        expect(readText).toHaveBeenCalledTimes(1)
        expect(callsOf(IPC.TERMINAL.WRITE)).toEqual([[{ id: 'session-1', data: 'echo pasted\r' }]])
    })

    it('粘贴：剪贴板不可读时播报粘贴失败（不抛异常）', async () => {
        wrapper = await mountPanel()
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                readText: vi.fn(async () => {
                    throw new Error('clipboard denied')
                })
            }
        })

        await wrapper.find('.terminal-panel-paste').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-terminal-notice]').text()).toBe(
            t('editorUi.terminalPanel.pasteFailed')
        )
    })

    it('收起按钮向父组件抛 toggle-collapse（由 WorkSpace 切收起态 + 边栏入口）', async () => {
        wrapper = await mountPanel()
        await wrapper.find('.terminal-panel-collapse').trigger('click')
        expect(wrapper.emitted('toggle-collapse')).toHaveLength(1)
    })

    it('重启按钮在创建中禁用（防止重复创建会话）', async () => {
        let resolveCreate: (value: unknown) => void = () => undefined
        invokeMock.mockImplementation(
            (channel: string) =>
                new Promise<unknown>((resolve) => {
                    if (channel === IPC.TERMINAL.CREATE) {
                        resolveCreate = resolve
                        return
                    }
                    resolve({ ok: true })
                })
        )
        wrapper = mount(TerminalPanel, { attachTo: document.body })
        await flushPromises()
        expect(wrapper.find('.terminal-panel-restart').attributes('disabled')).toBeDefined()
        resolveCreate({ ok: true, id: 'session-1', cwd: 'C:\\notes', shell: 'cmd.exe' })
        await flushPromises()
        expect(wrapper.find('.terminal-panel-restart').attributes('disabled')).toBeUndefined()
    })
})

describe('TerminalPanel 主题热更新', () => {
    it('useTheme 主题状态更新：重新从 CSS 变量派生主题并写回 term.options.theme', async () => {
        wrapper = await mountPanel()
        const terminal = currentTerminal()
        expect(terminal.options.theme).toEqual({})

        vi.spyOn(window, 'getComputedStyle').mockReturnValue({
            getPropertyValue: (name: string) =>
                ({
                    '--ui-bg-sunken': '#202020',
                    '--ui-text': '#f0f0f0',
                    '--ui-danger': '#ff5555'
                })[name] ?? ''
        } as unknown as CSSStyleDeclaration)

        // 主题切换链路：useTheme.applyThemeStyles 先写 CSS 变量再更新 currentThemeStyles
        useTheme().applyThemeStyles(
            {
                name: 'test-theme',
                description: 'test',
                titleBarGradient: 'linear-gradient(#202020, #202020)',
                backgroundColor: '#202020',
                cardBackground: '#202020',
                textColor: '#f0f0f0',
                secondaryTextColor: '#9aa0a6',
                borderColor: '#333333',
                accentColor: '#764ba2',
                buttonBackground: '#333333',
                buttonTextColor: '#f0f0f0',
                hoverBackground: '#2a2a2a'
            } satisfies ThemeStyles,
            'test-theme'
        )
        await flushPromises()

        expect(terminal.options.theme).toEqual(
            expect.objectContaining({
                background: '#202020',
                foreground: '#f0f0f0',
                red: '#ff5555'
            })
        )
    })
})
