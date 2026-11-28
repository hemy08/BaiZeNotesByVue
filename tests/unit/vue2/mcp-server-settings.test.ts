// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki L2：设置页「MCP 服务」分组单测（FeaturesPanel.vue）
 *
 * 覆盖：
 * 1. 挂载即读取状态：IPC.MCP.GET_STATUS 调用、已停止徽标、只读工具数、安全说明/重启说明常显；
 * 2. 启用：开关 change 立即 invoke IPC.MCP.SET_ENABLED({ enabled:true })，成功后展示运行中/
 *    端口/URL/token/复制按钮；
 * 3. 停用：运行态挂载 → 开关已勾选，点掉后 invoke({ enabled:false })，成功回已停止并隐藏 token；
 * 4. 失败可见提示（LOG-08）：主进程 ok=false 与 invoke 异常都回退开关并展示原因；
 * 5. 复制令牌：写系统剪贴板并显示「已复制」；
 * 6. 受限 ipcRenderer 不可用 / 状态结构非法时：开关禁用 + 可见降级提示，不崩溃。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import FeaturesPanel from '@renderer/components/dialogs/complex/system-setting/FeaturesPanel.vue'
import {
    createDefaultSystemDialogSettings,
    type SystemDialogSettings
} from '@renderer/components/dialogs/complex/system-setting/model'
import { getConfigStore } from '@renderer/common/useConfigStore'
import { t } from '@renderer/common/i18n'
import { IPC } from '../../../src/shared/ipc-channels'
import type { McpServerStatus } from '../../../src/shared/types/ipc'

/** 全局配置 store 单例（消息对话框状态复位用） */
const store = getConfigStore()

/** 已停止状态（主进程 GET_STATUS 的最小合法形状） */
const STOPPED_STATUS: McpServerStatus = {
    enabled: false,
    running: false,
    port: 0,
    token: '',
    url: '',
    toolCount: 7
}

/** 运行中状态（固定端口/令牌便于断言展示） */
const RUNNING_TOKEN = 'a'.repeat(64)
const RUNNING_STATUS: McpServerStatus = {
    enabled: true,
    running: true,
    port: 3847,
    token: RUNNING_TOKEN,
    url: 'http://127.0.0.1:3847/mcp',
    toolCount: 7
}

/** 构造设置草稿（MCP 分组不读草稿字段，仅复用面板默认 props） */
function draft(overrides: Partial<SystemDialogSettings> = {}): SystemDialogSettings {
    return { ...createDefaultSystemDialogSettings(), ...overrides }
}

let wrappers: VueWrapper[] = []
let invoke: ReturnType<typeof vi.fn>

/** 记录挂载实例，afterEach 统一卸载（BaseDialog 会注册 document 级监听） */
function mountPanel(): VueWrapper {
    const wrapper = mount(FeaturesPanel, {
        props: { settings: draft() },
        global: { stubs: { teleport: true } },
        attachTo: document.body
    }) as VueWrapper
    wrappers.push(wrapper)
    return wrapper
}

/** 按通道分流的 invoke 桩：GET_STATUS / SET_ENABLED 可分别定制 */
function stubIpc(
    options: {
        status?: unknown
        setEnabled?: (payload: unknown) => unknown
        getStatusError?: Error
        setEnabledError?: Error
    } = {}
): void {
    invoke = vi.fn().mockImplementation((channel: string, payload?: unknown) => {
        if (channel === IPC.MCP.GET_STATUS) {
            if (options.getStatusError) {
                return Promise.reject(options.getStatusError)
            }
            return Promise.resolve(options.status ?? STOPPED_STATUS)
        }
        if (channel === IPC.MCP.SET_ENABLED) {
            if (options.setEnabledError) {
                return Promise.reject(options.setEnabledError)
            }
            return Promise.resolve(
                options.setEnabled?.(payload) ?? { ok: true, status: RUNNING_STATUS }
            )
        }
        return Promise.resolve(null)
    })
    vi.stubGlobal('electron', { ipcRenderer: { invoke } })
}

/** 只取某个通道的 invoke 调用 */
function callsOf(channel: string): unknown[][] {
    return invoke.mock.calls.filter((call) => call[0] === channel)
}

/** MCP 开关元素 */
function enableCheckbox(wrapper: VueWrapper) {
    return wrapper.find('#mcp-server-enabled')
}

/** MCP 状态徽标文本 */
function statusText(wrapper: VueWrapper): string {
    return wrapper.find('[data-testid="mcp-server-status"]').text()
}

beforeEach(() => {
    store.hideDialog('message')
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    store.hideDialog('message')
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('FeaturesPanel MCP 服务：状态展示', () => {
    it('挂载即读取状态：已停止 + 只读工具数 + 安全说明/重启说明常显', async () => {
        stubIpc()
        const wrapper = mountPanel()
        await flushPromises()

        expect(callsOf(IPC.MCP.GET_STATUS)).toHaveLength(1)
        expect(wrapper.text()).toContain(
            t('dialogRenderer.systemSetting.features.mcpServerGroupTitle')
        )
        expect(wrapper.text()).toContain(
            t('dialogRenderer.systemSetting.features.mcpServerEnabled')
        )
        expect(statusText(wrapper)).toContain(
            t('dialogRenderer.systemSetting.features.mcpServerStopped')
        )
        expect(statusText(wrapper)).toContain(
            t('dialogRenderer.systemSetting.features.mcpServerToolCount', { count: 7 })
        )
        // 未运行时：不展示端口/URL/token，但安全说明与重启说明始终可见
        expect(statusText(wrapper)).not.toContain(
            t('dialogRenderer.systemSetting.features.mcpServerPort')
        )
        expect(wrapper.find('.mcp-token-row').exists()).toBe(false)
        expect(wrapper.find('.mcp-security-note').text()).toBe(
            t('dialogRenderer.systemSetting.features.mcpServerSecurityNote')
        )
        expect(wrapper.find('.mcp-restart-hint').text()).toBe(
            t('dialogRenderer.systemSetting.features.mcpServerRestartHint')
        )
        expect((enableCheckbox(wrapper).element as HTMLInputElement).checked).toBe(false)
        expect((enableCheckbox(wrapper).element as HTMLInputElement).disabled).toBe(false)
    })

    it('运行态挂载：展示端口/URL/token/工具数与复制按钮', async () => {
        stubIpc({ status: RUNNING_STATUS })
        const wrapper = mountPanel()
        await flushPromises()

        expect(statusText(wrapper)).toContain(
            t('dialogRenderer.systemSetting.features.mcpServerRunning')
        )
        expect(statusText(wrapper)).toContain('3847')
        expect(statusText(wrapper)).toContain('http://127.0.0.1:3847/mcp')
        expect(wrapper.find('.mcp-token-value').text()).toBe(RUNNING_TOKEN)
        expect(wrapper.find('.mcp-copy-token').text()).toBe(
            t('dialogRenderer.systemSetting.features.mcpServerCopyToken')
        )
        expect((enableCheckbox(wrapper).element as HTMLInputElement).checked).toBe(true)
    })
})

describe('FeaturesPanel MCP 服务：启用/停用', () => {
    it('启用：立即调用 SET_ENABLED({enabled:true})，成功展示运行态', async () => {
        stubIpc({ status: STOPPED_STATUS })
        const wrapper = mountPanel()
        await flushPromises()

        await enableCheckbox(wrapper).setValue(true)
        await flushPromises()

        expect(callsOf(IPC.MCP.SET_ENABLED)).toEqual([[IPC.MCP.SET_ENABLED, { enabled: true }]])
        expect(statusText(wrapper)).toContain(
            t('dialogRenderer.systemSetting.features.mcpServerRunning')
        )
        expect(wrapper.find('.mcp-token-value').text()).toBe(RUNNING_TOKEN)
        expect((enableCheckbox(wrapper).element as HTMLInputElement).checked).toBe(true)
    })

    it('停用：调用 SET_ENABLED({enabled:false})，成功回已停止并隐藏 token', async () => {
        stubIpc({
            status: RUNNING_STATUS,
            setEnabled: () => ({ ok: true, status: STOPPED_STATUS })
        })
        const wrapper = mountPanel()
        await flushPromises()

        await enableCheckbox(wrapper).setValue(false)
        await flushPromises()

        expect(callsOf(IPC.MCP.SET_ENABLED)).toEqual([[IPC.MCP.SET_ENABLED, { enabled: false }]])
        expect(statusText(wrapper)).toContain(
            t('dialogRenderer.systemSetting.features.mcpServerStopped')
        )
        expect(wrapper.find('.mcp-token-row').exists()).toBe(false)
        expect((enableCheckbox(wrapper).element as HTMLInputElement).checked).toBe(false)
    })

    it('主进程返回 ok=false：开关回退 + 可见错误提示（含原因）', async () => {
        const reason = '端口 3847 被占用'
        stubIpc({
            status: STOPPED_STATUS,
            setEnabled: () => ({ ok: false, error: reason, status: STOPPED_STATUS })
        })
        const wrapper = mountPanel()
        await flushPromises()

        await enableCheckbox(wrapper).setValue(true)
        await flushPromises()

        expect((enableCheckbox(wrapper).element as HTMLInputElement).checked).toBe(false)
        const errorText = wrapper.find('.mcp-error').text()
        expect(errorText).toContain(reason)
        expect(errorText).toContain(
            t('dialogRenderer.systemSetting.features.mcpServerToggleFailed', { error: reason })
        )
        expect(statusText(wrapper)).toContain(
            t('dialogRenderer.systemSetting.features.mcpServerStopped')
        )
    })

    it('invoke 异常：归一化错误详情后展示失败提示（去掉 Electron 包装前缀）', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        stubIpc({
            status: STOPPED_STATUS,
            setEnabledError: new Error(
                "Error invoking remote method 'baize:mcp:set-enabled': Error: IPC 通道不可用"
            )
        })
        const wrapper = mountPanel()
        await flushPromises()

        await enableCheckbox(wrapper).setValue(true)
        await flushPromises()

        expect((enableCheckbox(wrapper).element as HTMLInputElement).checked).toBe(false)
        const errorText = wrapper.find('.mcp-error').text()
        expect(errorText).toContain('IPC 通道不可用')
        expect(errorText).not.toContain('Error invoking remote method')
        expect(errorSpy).toHaveBeenCalled()
    })
})

describe('FeaturesPanel MCP 服务：复制令牌', () => {
    it('复制按钮把令牌写入剪贴板并显示「已复制」', async () => {
        const writeText = vi.fn().mockResolvedValue(undefined)
        Object.defineProperty(navigator, 'clipboard', {
            value: { writeText },
            configurable: true
        })
        stubIpc({ status: RUNNING_STATUS })
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('.mcp-copy-token').trigger('click')
        await flushPromises()

        expect(writeText).toHaveBeenCalledWith(RUNNING_TOKEN)
        expect(wrapper.find('.mcp-copy-token').text()).toBe(
            t('dialogRenderer.systemSetting.features.mcpServerTokenCopied')
        )
    })

    it('剪贴板不可用时展示可见失败提示（不静默）', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        Object.defineProperty(navigator, 'clipboard', {
            value: undefined,
            configurable: true
        })
        stubIpc({ status: RUNNING_STATUS })
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('.mcp-copy-token').trigger('click')
        await flushPromises()

        expect(wrapper.find('.mcp-error').text()).toBe(
            t('dialogRenderer.systemSetting.features.mcpServerCopyFailed')
        )
        expect(errorSpy).toHaveBeenCalled()
    })
})

describe('FeaturesPanel MCP 服务：降级与异常', () => {
    it('读取状态异常：不崩溃，展示失败提示且保持已停止', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        stubIpc({ getStatusError: new Error('preload 不可用') })
        const wrapper = mountPanel()
        await flushPromises()

        expect(wrapper.find('.mcp-error').exists()).toBe(true)
        expect(statusText(wrapper)).toContain(
            t('dialogRenderer.systemSetting.features.mcpServerStopped')
        )
        expect(errorSpy).toHaveBeenCalled()
    })

    it('状态结构非法：展示降级提示（不渲染脏数据）', async () => {
        stubIpc({ status: { ok: true } })
        const wrapper = mountPanel()
        await flushPromises()

        expect(wrapper.find('.mcp-error').text()).toBe(
            t('dialogRenderer.systemSetting.features.mcpServerUnavailable')
        )
        expect(wrapper.find('.mcp-token-value').exists()).toBe(false)
    })

    it('受限 ipcRenderer 不可用：开关禁用 + 降级提示', async () => {
        const wrapper = mountPanel()
        await flushPromises()

        expect((enableCheckbox(wrapper).element as HTMLInputElement).disabled).toBe(true)
        expect(wrapper.find('.mcp-error').text()).toBe(
            t('dialogRenderer.systemSetting.features.mcpServerUnavailable')
        )
        expect(statusText(wrapper)).toContain(
            t('dialogRenderer.systemSetting.features.mcpServerStopped')
        )
    })
})
