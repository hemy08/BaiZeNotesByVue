// @vitest-environment jsdom
/**
 * 1.5.7 体验微调（用户反馈 2026-11-28）：AI 助手配置已从「系统设置」对话框迁出
 * （原第 7 页签 → 菜单「设置 → AI 助手」独立对话框）后的回归护栏。
 *
 * 覆盖点：
 * 1. SystemSettingDialog 侧边栏恢复 6 项（无「AI 助手」页签、无 🤖 图标项）；
 * 2. 系统设置打开/切换全部 6 个页签均不挂载 AiAssistantPanel、不调用 AI/MCP IPC
 *    （AI 配置读取只属于独立对话框，设置页不再为它付出首屏/交互成本）；
 * 3. FeaturesPanel 迁移后仍只含纯功能开关（AI/MCP 分组不存在、挂载不调 MCP/AI IPC）；
 * 4. 独立对话框入口的契约（菜单动作拦截 → 打开状态、组件复用同一面板）由
 *    `ai-assistant-dialog.test.ts` / `menu_config.test.ts` / `menu_actions.test.ts` 覆盖。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'

import SystemSettingDialog from '@renderer/components/dialogs/complex/SystemSettingDialog.vue'
import FeaturesPanel from '@renderer/components/dialogs/complex/system-setting/FeaturesPanel.vue'
import {
    createDefaultSystemDialogSettings,
    SYSTEM_SETTING_SIDEBAR_ITEMS,
    type SystemDialogSettings
} from '@renderer/components/dialogs/complex/system-setting/model'
import { IPC } from '../../../src/shared/ipc-channels'

const dialogMountOptions = { global: { stubs: { teleport: true } } }

/** 构造设置草稿（与组件默认值真源一致） */
function draft(overrides: Partial<SystemDialogSettings> = {}): SystemDialogSettings {
    return { ...createDefaultSystemDialogSettings(), ...overrides }
}

let wrappers: VueWrapper[] = []
let invoke: ReturnType<typeof vi.fn>

/** 记录挂载实例，afterEach 统一卸载 */
function track<T extends VueWrapper>(wrapper: T): T {
    wrappers.push(wrapper)
    return wrapper
}

/** 挂载系统设置对话框 */
function mountDialog(): VueWrapper {
    return track(
        mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        }) as VueWrapper
    )
}

/** 点击第 index 个侧边栏项并等待面板切换 */
async function switchTab(wrapper: VueWrapper, index: number): Promise<void> {
    await wrapper.findAll('.sidebar-item')[index].trigger('click')
    await vi.dynamicImportSettled()
    await flushPromises()
}

/** 取某通道的 invoke 调用次数 */
function callCountOf(channel: string): number {
    return invoke.mock.calls.filter((call) => call[0] === channel).length
}

beforeEach(() => {
    invoke = vi.fn(async () => undefined)
    vi.stubGlobal('api', {
        config: {
            write: vi.fn().mockResolvedValue(true),
            read: vi
                .fn()
                .mockImplementation((name: string) =>
                    Promise.resolve(name === 'backup' ? { backups: [], latest: null } : {})
                )
        }
    })
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

describe('SystemSettingDialog：AI 助手页签已迁出（恢复 6 页签）', () => {
    it('侧边栏恢复 6 项，第 7 项「AI 助手」不再存在', () => {
        const wrapper = mountDialog()
        const items = wrapper.findAll('.sidebar-item')
        expect(items).toHaveLength(6)
        expect(items.map((item) => item.text())).toEqual([
            '⚙️通用设置',
            '📁文件设置',
            '🎨外观设置',
            '🧩功能',
            '✍️编写体验',
            '💾备份与恢复'
        ])
        // 侧边栏数据真源同步收缩为 6 项（类型 SystemSettingPanelId 由它派生）
        expect(SYSTEM_SETTING_SIDEBAR_ITEMS).toHaveLength(6)
        expect(SYSTEM_SETTING_SIDEBAR_ITEMS.map((item) => item.id)).not.toContain('aiAssistant')
    })

    it('切换全部 6 个页签均不挂载 AI 助手面板、不读取 AI/MCP 配置', async () => {
        const wrapper = mountDialog()
        await flushPromises()

        // 面板节点数与侧边栏 1:1（不再有懒加载的第 7 面板）
        expect(wrapper.findAll('.setting-panel')).toHaveLength(6)

        for (let index = 0; index < 6; index += 1) {
            await switchTab(wrapper, index)
            expect(wrapper.findAll('.setting-panel')).toHaveLength(6)
            // AI 助手面板的根节点/关键控件不得出现在系统设置中
            expect(wrapper.find('.ai-assistant-panel').exists()).toBe(false)
            expect(wrapper.find('#ai-assistant-enabled').exists()).toBe(false)
            expect(wrapper.find('#mcp-server-enabled').exists()).toBe(false)
        }

        // 整个浏览过程不触发 AI 配置 / MCP 状态读取（只属于独立对话框）
        expect(callCountOf(IPC.AI.GET_CONFIG)).toBe(0)
        expect(callCountOf(IPC.MCP.GET_STATUS)).toBe(0)
    })

    it('功能页签仍为纯功能开关（AI/MCP 分组已迁出）', async () => {
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
