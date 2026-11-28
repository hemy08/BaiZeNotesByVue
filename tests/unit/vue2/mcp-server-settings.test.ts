// @vitest-environment jsdom
/**
 * 1.5.7 体验升级 B：AI 助手页签「MCP 服务」分组深度单测
 * （`system-setting/AiAssistantPanel.vue`，原 FeaturesPanel MCP 分组迁移 + 端口/重置令牌扩展）
 *
 * 与 `ai-assistant-panel.test.ts` 的分工：本文件聚焦 MCP 的失败/降级路径与边界值，
 * 正常路径与模型管理见 `ai-assistant-panel.test.ts`。
 *
 * 覆盖点：
 * 1. 挂载即读取状态；停止态不展示令牌行，安全说明/重启说明常显；
 * 2. 读取状态异常（invoke reject）与结构非法：不崩溃、可读降级提示、保持已停止；
 * 3. 端口边界：1~65535 合法（含边界 65535）、0 / 65536 / 小数 / 空值非法且不发起 IPC；
 * 4. 自动端口应用：运行中提交 `{ enabled:true, port:null }` 并清空首选端口；
 * 5. 固定端口模式下停用服务：不因端口输入缺失/非法而阻塞停用；
 * 6. 重置令牌失败（ok=false / invoke 异常）：展示原因且保留旧令牌；
 * 7. 剪贴板不可用：复制令牌失败给出可见提示（不静默）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import AiAssistantPanel from '@renderer/components/dialogs/complex/system-setting/AiAssistantPanel.vue'
import { t } from '@renderer/common/i18n'
import { IPC } from '../../../src/shared/ipc-channels'
import type { AiConfigSnapshot } from '../../../src/shared/types/ai'
import type { McpServerStatus } from '../../../src/shared/types/ipc'

/** 空 AI 配置（本文件只关心 MCP 分组，AI 侧给合法最小快照即可） */
const EMPTY_AI_SNAPSHOT: AiConfigSnapshot = {
    enabled: false,
    models: [],
    defaultModelId: null,
    apiKeyStorage: 'safe'
}

/** 已停止状态（主进程 GET_STATUS 的最小合法形状，含新增必填字段 preferredPort） */
const STOPPED_STATUS: McpServerStatus = {
    enabled: false,
    running: false,
    port: 0,
    token: '',
    url: '',
    toolCount: 7,
    preferredPort: null
}

/** 运行中状态（固定端口/令牌便于断言展示） */
const RUNNING_TOKEN = 'a'.repeat(64)
const RUNNING_STATUS: McpServerStatus = {
    enabled: true,
    running: true,
    port: 3847,
    token: RUNNING_TOKEN,
    url: 'http://127.0.0.1:3847/mcp',
    toolCount: 7,
    preferredPort: 3847
}

let wrappers: VueWrapper[] = []
let invoke: ReturnType<typeof vi.fn>

/** 记录挂载实例，afterEach 统一卸载 */
function mountPanel(): VueWrapper {
    const wrapper = mount(AiAssistantPanel, {
        global: { stubs: { teleport: true } },
        attachTo: document.body
    }) as VueWrapper
    wrappers.push(wrapper)
    return wrapper
}

/** 按通道分流的 invoke 桩：AI 通道返回合法空配置，MCP 通道可分别定制 */
function stubIpc(
    options: {
        status?: unknown
        setEnabled?: (payload: unknown) => unknown
        getStatusError?: Error
        setEnabledError?: Error
    } = {}
): void {
    invoke = vi.fn().mockImplementation((channel: string, payload?: unknown) => {
        if (channel === IPC.AI.GET_CONFIG) {
            return Promise.resolve(EMPTY_AI_SNAPSHOT)
        }
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
        return Promise.resolve(undefined)
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

/** 切换固定端口模式并填入端口 */
async function setFixedPort(wrapper: VueWrapper, value: string): Promise<void> {
    await wrapper.find('#mcp-port-auto').setValue(false)
    await wrapper.find('#mcp-port-input').setValue(value)
}

beforeEach(() => {
    stubIpc()
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    document.body.innerHTML = ''
    document.body.style.removeProperty('overflow')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('AiAssistantPanel MCP：状态与降级', () => {
    it('挂载即读取状态：已停止 + 只读工具数 + 安全说明/重启说明常显', async () => {
        stubIpc()
        const wrapper = mountPanel()
        await flushPromises()

        expect(callsOf(IPC.MCP.GET_STATUS)).toHaveLength(1)
        expect(wrapper.text()).toContain(t('dialogRenderer.aiAssistant.groupMcp'))
        expect(wrapper.text()).toContain(t('dialogRenderer.aiAssistant.mcpEnabled'))
        expect(statusText(wrapper)).toContain(t('dialogRenderer.aiAssistant.mcpStopped'))
        // 未运行时：不展示端口/URL/token，但安全说明与重启说明始终可见
        expect(statusText(wrapper)).not.toContain(t('dialogRenderer.aiAssistant.mcpPort'))
        expect(wrapper.find('.mcp-token-row').exists()).toBe(false)
        expect(wrapper.find('.mcp-security-note').text()).toBe(
            t('dialogRenderer.aiAssistant.mcpSecurityNote')
        )
        expect(wrapper.find('.mcp-restart-hint').text()).toBe(
            t('dialogRenderer.aiAssistant.mcpRestartHint')
        )
        // 首选端口 = null → 自动选择勾选
        expect((wrapper.find('#mcp-port-auto').element as HTMLInputElement).checked).toBe(true)
    })

    it('读取状态异常：不崩溃，展示失败提示且保持已停止', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        stubIpc({ getStatusError: new Error('preload 不可用') })
        const wrapper = mountPanel()
        await flushPromises()

        expect(wrapper.find('[data-testid="mcp-error"]').exists()).toBe(true)
        expect(statusText(wrapper)).toContain(t('dialogRenderer.aiAssistant.mcpStopped'))
        expect(errorSpy).toHaveBeenCalled()
    })

    it('状态结构非法：展示降级提示（不渲染脏数据）', async () => {
        stubIpc({ status: { ok: true } })
        const wrapper = mountPanel()
        await flushPromises()

        expect(wrapper.find('[data-testid="mcp-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.mcpUnavailable')
        )
        expect(wrapper.find('.mcp-token-value').exists()).toBe(false)
    })
})

describe('AiAssistantPanel MCP：端口配置边界', () => {
    it('运行态首选端口回填固定模式，应用自动端口提交 port:null', async () => {
        stubIpc({ status: RUNNING_STATUS })
        const wrapper = mountPanel()
        await flushPromises()

        // 首选端口 3847 → 固定模式并回填
        expect((wrapper.find('#mcp-port-auto').element as HTMLInputElement).checked).toBe(false)
        expect((wrapper.find('#mcp-port-input').element as HTMLInputElement).value).toBe('3847')

        // 勾回自动并应用：提交 null 清空端口偏好
        await wrapper.find('#mcp-port-auto').setValue(true)
        await wrapper.find('.mcp-apply-port-btn').trigger('click')
        await flushPromises()

        expect(callsOf(IPC.MCP.SET_ENABLED)).toEqual([
            [IPC.MCP.SET_ENABLED, { enabled: true, port: null }]
        ])
    })

    it('端口边界：65535 合法，0 / 65536 / 小数 / 空值非法且不发起 IPC', async () => {
        const wrapper = mountPanel()
        await flushPromises()

        // 合法边界：65535（停止态只记录本地配置，不发 IPC）
        await setFixedPort(wrapper, '65535')
        await wrapper.find('.mcp-apply-port-btn').trigger('click')
        await flushPromises()
        expect(wrapper.find('[data-testid="mcp-error"]').exists()).toBe(false)

        // 非法值逐项校验
        for (const invalid of ['0', '65536', '12.5', '']) {
            await setFixedPort(wrapper, invalid)
            await wrapper.find('.mcp-apply-port-btn').trigger('click')
            await flushPromises()
            expect(wrapper.find('[data-testid="mcp-error"]').text(), `非法端口：${invalid}`).toBe(
                t('dialogRenderer.aiAssistant.mcpPortInvalid')
            )
        }
        expect(callsOf(IPC.MCP.SET_ENABLED)).toHaveLength(0)
    })

    it('固定端口模式下停用服务：不因端口非法阻塞停用', async () => {
        stubIpc({
            status: RUNNING_STATUS,
            setEnabled: () => ({ ok: true, status: STOPPED_STATUS })
        })
        const wrapper = mountPanel()
        await flushPromises()

        await setFixedPort(wrapper, '')
        await enableCheckbox(wrapper).setValue(false)
        await flushPromises()

        expect(callsOf(IPC.MCP.SET_ENABLED)).toEqual([[IPC.MCP.SET_ENABLED, { enabled: false }]])
        expect(statusText(wrapper)).toContain(t('dialogRenderer.aiAssistant.mcpStopped'))
    })
})

describe('AiAssistantPanel MCP：令牌操作失败路径', () => {
    it('重置令牌失败（ok=false）：展示原因且保留旧令牌', async () => {
        stubIpc({
            status: RUNNING_STATUS,
            setEnabled: () => ({
                ok: false,
                error: '重启服务失败',
                status: { ...RUNNING_STATUS, token: 'old-token' }
            })
        })
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('.mcp-regenerate-token').trigger('click')
        await flushPromises()

        expect(wrapper.find('[data-testid="mcp-error"]').text()).toContain('重启服务失败')
        expect(wrapper.find('.mcp-token-value').text()).toBe('old-token')
    })

    it('重置令牌异常：归一化错误详情后展示（去掉 Electron 包装前缀）', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        stubIpc({
            status: RUNNING_STATUS,
            setEnabledError: new Error(
                "Error invoking remote method 'baize:mcp:set-enabled': Error: IPC 通道不可用"
            )
        })
        const wrapper = mountPanel()
        await flushPromises()

        await wrapper.find('.mcp-regenerate-token').trigger('click')
        await flushPromises()

        const errorText = wrapper.find('[data-testid="mcp-error"]').text()
        expect(errorText).toContain('IPC 通道不可用')
        expect(errorText).not.toContain('Error invoking remote method')
        expect(errorSpy).toHaveBeenCalled()
    })

    it('剪贴板不可用：复制令牌失败给出可见提示（不静默）', async () => {
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

        expect(wrapper.find('[data-testid="mcp-error"]').text()).toBe(
            t('dialogRenderer.aiAssistant.mcpCopyFailed')
        )
        expect(errorSpy).toHaveBeenCalled()
    })
})
