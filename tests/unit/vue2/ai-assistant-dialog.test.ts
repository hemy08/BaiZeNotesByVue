// @vitest-environment jsdom
/**
 * 1.5.7 体验微调（用户反馈 2026-11-28）：AI 助手独立对话框单测
 * （`dialogs/complex/AiAssistantDialog.vue`，配置入口从「系统设置」第 7 页签迁到
 * 菜单「设置 → AI 助手」）。
 *
 * 覆盖点（对应需求验收）：
 * 1. 打开：BaseDialog 外壳渲染、标题为「AI 助手」、正文复用 AiAssistantPanel
 *    （模型管理 + MCP 分组可见）、底栏「关闭」按钮；
 * 2. 打开即刷新：面板 onMounted 读取 AI 配置与 MCP 状态（AI.GET_CONFIG / MCP.GET_STATUS 各 1 次）；
 * 3. 关闭：底栏「关闭」按钮、右上角 ×、ESC 均只 emit close（显隐真源在宿主/菜单状态模块）；
 * 4. 重新打开：关闭后再次打开会重新挂载面板并重新读取配置（不展示过期状态）；
 * 5. 未打开（visible=false）时不渲染任何对话框节点（BaseDialog v-if 语义）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import AiAssistantDialog from '@renderer/components/dialogs/complex/AiAssistantDialog.vue'
import { t } from '@renderer/common/i18n'
import { IPC } from '../../../src/shared/ipc-channels'
import type { AiConfigSnapshot } from '../../../src/shared/types/ai'
import type { McpServerStatus } from '../../../src/shared/types/ipc'

/** 默认 AI 快照（关闭 + 无模型 + 安全存储） */
function aiSnapshot(): AiConfigSnapshot {
    return { enabled: false, models: [], defaultModelId: null, apiKeyStorage: 'safe' }
}

/** 已停止的 MCP 状态（含必填字段 preferredPort） */
function mcpStopped(): McpServerStatus {
    return {
        enabled: false,
        running: false,
        port: 0,
        token: '',
        url: '',
        toolCount: 7,
        preferredPort: null
    }
}

const dialogMountOptions = { global: { stubs: { teleport: true } } }

let wrappers: VueWrapper[] = []
let invoke: ReturnType<typeof vi.fn>

/** 挂载对话框（默认打开），记录实例供 afterEach 卸载 */
function mountDialog(visible = true): VueWrapper {
    const wrapper = mount(AiAssistantDialog, {
        ...dialogMountOptions,
        props: { visible },
        attachTo: document.body
    }) as VueWrapper
    wrappers.push(wrapper)
    return wrapper
}

/** 取某通道的 invoke 调用次数 */
function callCountOf(channel: string): number {
    return invoke.mock.calls.filter((call) => call[0] === channel).length
}

/** 点击底部「关闭」按钮 */
async function clickFooterClose(wrapper: VueWrapper): Promise<void> {
    await wrapper.find('.ai-assistant-close-btn').trigger('click')
    await flushPromises()
}

beforeEach(() => {
    invoke = vi.fn(async (channel: string) => {
        if (channel === IPC.AI.GET_CONFIG) {
            return aiSnapshot()
        }
        if (channel === IPC.MCP.GET_STATUS) {
            return mcpStopped()
        }
        return undefined
    })
    vi.stubGlobal('api', { config: { write: vi.fn(), read: vi.fn().mockResolvedValue({}) } })
    vi.stubGlobal('electron', { ipcRenderer: { send: vi.fn(), invoke } })
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

describe('AiAssistantDialog：打开与内容渲染', () => {
    it('未打开时不渲染任何对话框节点', async () => {
        const wrapper = mountDialog(false)
        await flushPromises()
        expect(wrapper.find('.dialog-container').exists()).toBe(false)
        expect(wrapper.find('.dialog-overlay').exists()).toBe(false)
        // 面板未挂载 → 不读取配置
        expect(invoke).not.toHaveBeenCalled()
    })

    it('打开后渲染 BaseDialog 外壳、标题「AI 助手」与复用的 AI 助手面板', async () => {
        const wrapper = mountDialog()
        await flushPromises()

        const container = wrapper.find('.dialog-container')
        expect(container.exists()).toBe(true)
        expect(container.attributes('role')).toBe('dialog')
        expect(wrapper.find('.title-text').text()).toBe(t('dialogRenderer.aiAssistant.title'))
        expect(t('dialogRenderer.aiAssistant.title')).toBe('AI 助手')

        // 正文复用 system-setting/AiAssistantPanel.vue：模型管理 + MCP 分组均在
        expect(wrapper.find('.ai-assistant-panel').exists()).toBe(true)
        expect(wrapper.find('.ai-models-group').exists()).toBe(true)
        expect(wrapper.find('#ai-assistant-enabled').exists()).toBe(true)
        expect(wrapper.find('#mcp-server-enabled').exists()).toBe(true)
        expect(wrapper.find('.mcp-server-group').exists()).toBe(true)

        // 底栏只有一个「关闭」按钮（配置即时保存，无需应用/确定）
        expect(wrapper.findAll('.footer button')).toHaveLength(1)
        expect(wrapper.find('.ai-assistant-close-btn').text()).toBe(t('common.close'))
    })

    it('打开时刷新：面板挂载即读取 AI 配置与 MCP 状态', async () => {
        const wrapper = mountDialog()
        await flushPromises()

        expect(callCountOf(IPC.AI.GET_CONFIG)).toBe(1)
        expect(callCountOf(IPC.MCP.GET_STATUS)).toBe(1)
        // AI 快照已应用（空态引导渲染）
        expect(wrapper.find('[data-testid="ai-models-empty"]').exists()).toBe(true)
    })
})

describe('AiAssistantDialog：关闭行为', () => {
    it('底栏「关闭」按钮只 emit close（不自行改显隐）', async () => {
        const wrapper = mountDialog()
        await flushPromises()

        await clickFooterClose(wrapper)

        expect(wrapper.emitted('close')).toHaveLength(1)
        // 受控组件语义：关闭只上报，显隐由宿主（ai-assistant-dialog-state）决定
        expect(wrapper.emitted('apply')).toBeUndefined()
    })

    it('右上角关闭按钮触发 close', async () => {
        const wrapper = mountDialog()
        await flushPromises()

        await wrapper.find('.title-bar .close-btn').trigger('click')
        await flushPromises()

        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('ESC 关闭对话框（BaseDialog 既有 a11y 行为）', async () => {
        const wrapper = mountDialog()
        await flushPromises()

        document.dispatchEvent(
            new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })
        )
        await flushPromises()

        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('AiAssistantDialog：重新打开刷新', () => {
    it('关闭后再次打开会重新挂载面板并重新读取 AI/MCP 配置', async () => {
        const wrapper = mountDialog()
        await flushPromises()
        expect(callCountOf(IPC.AI.GET_CONFIG)).toBe(1)
        expect(callCountOf(IPC.MCP.GET_STATUS)).toBe(1)

        // 关闭：BaseDialog 的 v-if 会卸载正文与面板
        await wrapper.setProps({ visible: false })
        await flushPromises()
        expect(wrapper.find('.ai-assistant-panel').exists()).toBe(false)
        expect(callCountOf(IPC.AI.GET_CONFIG)).toBe(1)

        // 重新打开：面板重新挂载 → 重新读取（不会展示上一次打开的过期状态）
        await wrapper.setProps({ visible: true })
        await flushPromises()
        expect(wrapper.find('.ai-assistant-panel').exists()).toBe(true)
        expect(callCountOf(IPC.AI.GET_CONFIG)).toBe(2)
        expect(callCountOf(IPC.MCP.GET_STATUS)).toBe(2)
    })
})
