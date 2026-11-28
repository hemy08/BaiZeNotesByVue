// @vitest-environment jsdom
/**
 * 1.5.7 体验升级 B：系统设置第 7 页签「AI 助手」集成单测
 *
 * 覆盖点：
 * 1. SystemSettingDialog 侧边栏 6 → 7 项，第 7 项为「AI 助手」（图标 + 中英 i18n 标签）；
 * 2. 懒加载：打开设置页不加载 AI 面板；首次点击「AI 助手」页签才加载并读取 AI/MCP 配置，
 *    之后切页保持挂载（v-show 保活，页内状态不丢）；
 * 3. 迁移：原「功能」页签不再包含 AI/MCP 分组与开关（配置入口只在 AI 助手页签）；
 * 4. FeaturesPanel 挂载不再调用 MCP/AI IPC（迁移后功能页只做纯功能开关）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import SystemSettingDialog from '@renderer/components/dialogs/complex/SystemSettingDialog.vue'
import FeaturesPanel from '@renderer/components/dialogs/complex/system-setting/FeaturesPanel.vue'
import {
    createDefaultSystemDialogSettings,
    type SystemDialogSettings
} from '@renderer/components/dialogs/complex/system-setting/model'
import { IPC } from '../../../src/shared/ipc-channels'
import type { AiConfigSnapshot } from '../../../src/shared/types/ai'
import type { McpServerStatus } from '../../../src/shared/types/ipc'

const dialogMountOptions = { global: { stubs: { teleport: true } } }

/** 默认 AI 快照（关闭 + 无模型） */
function aiSnapshot(): AiConfigSnapshot {
    return { enabled: false, models: [], defaultModelId: null, apiKeyStorage: 'safe' }
}

/** 已停止的 MCP 状态（含新增必填字段 preferredPort） */
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

/** 构造设置草稿（与组件默认值真源一致） */
function draft(overrides: Partial<SystemDialogSettings> = {}): SystemDialogSettings {
    return { ...createDefaultSystemDialogSettings(), ...overrides }
}

let wrappers: VueWrapper[] = []
let invoke: ReturnType<typeof vi.fn>
let configRead: ReturnType<typeof vi.fn>

/** 记录挂载实例，afterEach 统一卸载 */
function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

/** 挂载系统设置对话框（async panel 首次点击页签后加载） */
function mountDialog(): VueWrapper {
    return track(
        mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        }) as VueWrapper
    )
}

/** 点击第 index 个侧边栏项并等待面板切换 / 异步 chunk 加载 */
async function switchTab(wrapper: VueWrapper, index: number): Promise<void> {
    await wrapper.findAll('.sidebar-item')[index].trigger('click')
    // AI 助手面板为 defineAsyncComponent：等待动态 import 完成后组件才真正渲染
    await vi.dynamicImportSettled()
    await flushPromises()
}

/** 取某通道的 invoke 调用次数 */
function callCountOf(channel: string): number {
    return invoke.mock.calls.filter((call) => call[0] === channel).length
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
    configRead = vi
        .fn()
        .mockImplementation((name: string) =>
            Promise.resolve(name === 'backup' ? { backups: [], latest: null } : {})
        )
    vi.stubGlobal('api', { config: { write: vi.fn().mockResolvedValue(true), read: configRead } })
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

describe('SystemSettingDialog：AI 助手页签（第 7 项）', () => {
    it('渲染 7 个侧边栏项，第 7 项为 AI 助手（i18n 标签）', () => {
        const wrapper = mountDialog()
        const items = wrapper.findAll('.sidebar-item')
        expect(items).toHaveLength(7)
        expect(items.map((item) => item.text())).toEqual([
            '⚙️通用设置',
            '📁文件设置',
            '🎨外观设置',
            '🧩功能',
            '✍️编写体验',
            '💾备份与恢复',
            '🤖AI 助手'
        ])
    })

    it('懒加载：首次点击 AI 助手页签才加载面板并读取 AI/MCP 配置，切页后保持挂载', async () => {
        const wrapper = mountDialog()
        await flushPromises()

        // 打开设置页时：AI 面板未加载、也不读取 AI/MCP 配置
        expect(wrapper.find('#ai-assistant-enabled').exists()).toBe(false)
        expect(callCountOf(IPC.AI.GET_CONFIG)).toBe(0)
        expect(callCountOf(IPC.MCP.GET_STATUS)).toBe(0)

        // 首次切到 AI 助手页签：异步面板加载完成并读取两份配置
        await switchTab(wrapper, 6)
        expect(wrapper.find('#ai-assistant-enabled').exists()).toBe(true)
        expect(wrapper.find('.ai-models-group').exists()).toBe(true)
        expect(callCountOf(IPC.AI.GET_CONFIG)).toBe(1)
        expect(callCountOf(IPC.MCP.GET_STATUS)).toBe(1)

        // 切回通用页签：AI 面板保持挂载（v-show 隐藏，状态不丢），不重复读取配置
        await switchTab(wrapper, 0)
        expect(wrapper.find('.ai-models-group').exists()).toBe(true)
        expect(callCountOf(IPC.AI.GET_CONFIG)).toBe(1)
        expect(callCountOf(IPC.MCP.GET_STATUS)).toBe(1)
    })

    it('功能页签已移除 AI 助手 / MCP 服务分组与开关（配置入口已迁移）', async () => {
        const wrapper = mountDialog()
        await switchTab(wrapper, 3)

        const featuresPanel = wrapper.findAll('.setting-panel')[3]
        expect(featuresPanel.find('#ai-assistant-enabled').exists()).toBe(false)
        expect(featuresPanel.find('#mcp-server-enabled').exists()).toBe(false)
        expect(featuresPanel.find('.ai-models-group').exists()).toBe(false)
        expect(featuresPanel.find('.mcp-server-group').exists()).toBe(false)
        // 可选功能开关仍为 11 项（“纯功能开关”页语义不变）
        expect(
            featuresPanel
                .findAll('.setting-checkbox')
                .filter((checkbox) => (checkbox.attributes('id') ?? '').startsWith('feature-'))
        ).toHaveLength(11)
        // 面板顶部用途描述保留
        expect(featuresPanel.text()).toContain(
            '默认能力始终开启；可选能力按需开启，关闭时不注册界面与编辑行为，不增加启动负担。'
        )
        // 迁移后操作入口只存在于 AI 助手页签
        await switchTab(wrapper, 6)
        expect(wrapper.find('#ai-assistant-enabled').exists()).toBe(true)
        expect(wrapper.find('#mcp-server-enabled').exists()).toBe(true)
    })
})

describe('FeaturesPanel：迁移后不再读取 AI / MCP 配置', () => {
    it('挂载只渲染功能开关，不调用 MCP/AI IPC', async () => {
        const wrapper = track(
            mount(FeaturesPanel, {
                props: { settings: draft() },
                global: { stubs: { teleport: true } }
            }) as VueWrapper
        )
        await flushPromises()

        expect(invoke).not.toHaveBeenCalled()
        expect(wrapper.find('.mcp-server-group').exists()).toBe(false)
        expect(wrapper.find('.ai-models-group').exists()).toBe(false)
    })
})
