// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki L1 —— 设置页「工作区模式」下拉 + 模式切换确认对话框单测
 *
 * 覆盖点（T1.4 / T1.5 渲染层验收）：
 * 1. 下拉渲染：默认 traditional，两个选项值/文案走 i18n（工作区模式标签 + 说明收进 ⓘ 由
 *    `system-setting-panels.test.ts` 覆盖）；
 * 2. traditional → llm-wiki：先弹确认对话框（标题/正文/按钮中英词典），**不立即写草稿、
 *    不调用主进程**，下拉回退为当前草稿值；
 * 3. 取消：关闭确认框、不写草稿、不调通道；
 * 4. 确认成功：调用白名单通道 `IPC.FILE.INITIALIZE_LLM_WIKI`，成功才写入工作区模式草稿
 *    （保存沿用设置页既有 config:write('system') 通道），并展示成功提示；
 * 5. 确认失败/异常：保持 traditional 不写草稿，展示含错误详情的失败提示；
 * 6. llm-wiki → traditional：直接写草稿（不弹确认、不调通道、不删除已创建目录）；
 * 7. 初始化进行中：下拉与确认/取消按钮禁用，防重复提交。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { h, ref } from 'vue'

import FeaturesPanel from '@renderer/components/dialogs/complex/system-setting/FeaturesPanel.vue'
import {
    createDefaultSystemDialogSettings,
    type SystemDialogSettings
} from '@renderer/components/dialogs/complex/system-setting/model'
import { getConfigStore } from '@renderer/common/useConfigStore'
import { t } from '@renderer/common/i18n'
import { IPC } from '../../../src/shared/ipc-channels'

/** 全局配置 store 单例（断言成功/失败提示） */
const store = getConfigStore()

/** 构造草稿：默认值 + 局部覆盖（与组件默认值真源一致） */
function draft(overrides: Partial<SystemDialogSettings> = {}): SystemDialogSettings {
    return { ...createDefaultSystemDialogSettings(), ...overrides }
}

let wrappers: VueWrapper[] = []

/** 记录挂载实例，afterEach 统一卸载（BaseDialog 会注册 document 级监听/滚动锁） */
function track(wrapper: VueWrapper): VueWrapper {
    wrappers.push(wrapper)
    return wrapper
}

/**
 * 像壳层（SystemSettingDialog）一样把 FeaturesPanel 的 update 补丁合并回 props，
 * 这样才能断言「确认成功后才写入工作区模式草稿」以及下拉的最终展示值。
 */
function mountPanel(initial: SystemDialogSettings = draft()) {
    const settings = ref<SystemDialogSettings>({ ...initial })
    const patches: Partial<SystemDialogSettings>[] = []
    const wrapper = track(
        mount(
            {
                setup() {
                    return () =>
                        h(FeaturesPanel, {
                            settings: settings.value,
                            onUpdate: (patch: Partial<SystemDialogSettings>) => {
                                patches.push(patch)
                                settings.value = { ...settings.value, ...patch }
                            }
                        })
                }
            },
            { global: { stubs: { teleport: true } }, attachTo: document.body }
        ) as VueWrapper
    )
    return { wrapper, settings, patches }
}

/** 工作区模式下拉 */
function workspaceModeSelect(wrapper: VueWrapper) {
    return wrapper.find('#workspace-mode-select')
}

/** 下拉当前 DOM 展示值 */
function selectValue(wrapper: VueWrapper): string {
    return (workspaceModeSelect(wrapper).element as HTMLSelectElement).value
}

/** 模式切换确认对话框（FeaturesPanel 传入 container-class="workspace-mode-confirm-dialog"） */
function confirmDialog(wrapper: VueWrapper) {
    return wrapper.find('.workspace-mode-confirm-dialog')
}

/** 打开「traditional → llm-wiki」确认框（切下拉并等待渲染） */
async function openConfirm(wrapper: VueWrapper): Promise<void> {
    await workspaceModeSelect(wrapper).setValue('llm-wiki')
    await flushPromises()
}

let invoke: ReturnType<typeof vi.fn>

/**
 * 1.5.7 LLM Wiki L2：FeaturesPanel 挂载即调用 MCP.GET_STATUS 读取 MCP 服务状态，
 * 因此本文件的 invoke 桩按通道分流（MCP 状态返回「已停止」，其余返回初始化成功），
 * 涉及「是否调用过主进程」的断言统一只统计工作区初始化通道。
 */
const MCP_GET_STATUS_CHANNEL = IPC.MCP.GET_STATUS
const INITIALIZE_LLM_WIKI_CHANNEL = IPC.FILE.INITIALIZE_LLM_WIKI
const STOPPED_MCP_STATUS = {
    enabled: false,
    running: false,
    port: 0,
    token: '',
    url: '',
    toolCount: 7
}

/** 只取「工作区初始化」通道的 invoke 调用（排除 MCP 状态读取） */
function initializeInvokeCalls(): unknown[][] {
    return invoke.mock.calls.filter((call) => call[0] === INITIALIZE_LLM_WIKI_CHANNEL)
}

beforeEach(() => {
    invoke = vi
        .fn()
        .mockImplementation((channel: string) =>
            channel === MCP_GET_STATUS_CHANNEL
                ? Promise.resolve(STOPPED_MCP_STATUS)
                : Promise.resolve({ success: true })
        )
    vi.stubGlobal('electron', { ipcRenderer: { invoke } })
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
    // BaseDialog 打开期间锁定 body 滚动；卸载后清理残留，避免用例间串扰
    document.body.style.removeProperty('overflow')
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('FeaturesPanel 工作区模式：下拉渲染', () => {
    it('默认 traditional，两个选项值与文案走 i18n', () => {
        const { wrapper } = mountPanel()
        const select = workspaceModeSelect(wrapper)
        expect(select.exists()).toBe(true)

        const options = select.findAll('option')
        expect(options.map((option) => option.attributes('value'))).toEqual([
            'traditional',
            'llm-wiki'
        ])
        expect(options.map((option) => option.text())).toEqual([
            t('dialogRenderer.systemSetting.features.workspaceModeTraditional'),
            t('dialogRenderer.systemSetting.features.workspaceModeLlmWiki')
        ])
        expect(selectValue(wrapper)).toBe('traditional')
        // 面板可见文案包含「工作区」分组标题与工作区模式标签
        expect(wrapper.text()).toContain(t('dialogRenderer.systemSetting.groupWorkspace'))
        expect(wrapper.text()).toContain(t('dialogRenderer.systemSetting.features.workspaceMode'))
    })

    it('草稿已为 llm-wiki 时下拉展示 llm-wiki', () => {
        const { wrapper } = mountPanel(draft({ workspaceMode: 'llm-wiki' }))
        expect(selectValue(wrapper)).toBe('llm-wiki')
    })
})

describe('FeaturesPanel 工作区模式：traditional → llm-wiki 确认', () => {
    it('切换时不立即写草稿/不调主进程，先弹确认框，且下拉回退为当前值', async () => {
        const { wrapper, patches } = mountPanel()
        await openConfirm(wrapper)

        expect(confirmDialog(wrapper).exists()).toBe(true)
        expect(confirmDialog(wrapper).find('.title-text').text()).toBe(
            t('dialogRenderer.systemSetting.features.workspaceModeConfirmTitle')
        )
        expect(confirmDialog(wrapper).find('.workspace-mode-confirm-message').text()).toBe(
            t('dialogRenderer.systemSetting.features.workspaceModeConfirmMessage')
        )
        // 确认框两个按钮文案（取消复用 common.cancel；确认走独立词条）
        const footerButtons = confirmDialog(wrapper).findAll('.footer .dialog-btn')
        expect(footerButtons.map((button) => button.text())).toEqual([
            t('common.cancel'),
            t('dialogRenderer.systemSetting.features.workspaceModeConfirmOk')
        ])
        // 未确认前：草稿不变、不调用工作区初始化、下拉回退
        expect(patches).toEqual([])
        expect(initializeInvokeCalls()).toEqual([])
        expect(selectValue(wrapper)).toBe('traditional')
    })

    it('取消：关闭确认框，不写草稿、不调主进程，下拉保持原值', async () => {
        const { wrapper, patches, settings } = mountPanel()
        await openConfirm(wrapper)

        await confirmDialog(wrapper).find('.btn-cancel').trigger('click')
        await flushPromises()

        expect(confirmDialog(wrapper).exists()).toBe(false)
        expect(patches).toEqual([])
        expect(initializeInvokeCalls()).toEqual([])
        expect(settings.value.workspaceMode).toBe('traditional')
        expect(selectValue(wrapper)).toBe('traditional')
    })

    it('确认成功：调用白名单通道，成功后才写入草稿并展示成功提示', async () => {
        const { wrapper, patches, settings } = mountPanel()
        await openConfirm(wrapper)

        await confirmDialog(wrapper).find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(initializeInvokeCalls()).toHaveLength(1)
        expect(initializeInvokeCalls()[0][0]).toBe('baize:file:initialize-llm-wiki')
        expect(patches).toContainEqual({ workspaceMode: 'llm-wiki' })
        expect(settings.value.workspaceMode).toBe('llm-wiki')
        expect(selectValue(wrapper)).toBe('llm-wiki')
        expect(confirmDialog(wrapper).exists()).toBe(false)
        // 成功提示复用应用内消息对话框（标题为菜单动作名，正文为初始化成功文案）
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('success')
        expect(store.dialogs.messageDialog.title).toBe(t('menu.file.initializeLlmWiki'))
        expect(store.dialogs.messageDialog.message).toBe(
            t('dialogRenderer.systemSetting.features.workspaceModeInitSuccess')
        )
    })

    it('确认失败（success=false）：保持 traditional，不写草稿，展示含主进程原因的失败提示', async () => {
        const reason = '尚未打开工作区，无法初始化 LLM Wiki。'
        invoke.mockResolvedValue({ success: false, error: reason })
        const { wrapper, patches, settings } = mountPanel()
        await openConfirm(wrapper)

        await confirmDialog(wrapper).find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(initializeInvokeCalls()).toHaveLength(1)
        expect(initializeInvokeCalls()[0][0]).toBe('baize:file:initialize-llm-wiki')
        expect(patches).toEqual([])
        expect(settings.value.workspaceMode).toBe('traditional')
        expect(selectValue(wrapper)).toBe('traditional')
        expect(confirmDialog(wrapper).exists()).toBe(false)
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('error')
        expect(store.dialogs.messageDialog.message).toContain(reason)
        expect(store.dialogs.messageDialog.message).toContain(
            t('dialogRenderer.systemSetting.features.workspaceModeInitFailed', { error: reason })
        )
    })

    it('确认时 IPC 异常：归一化错误详情并展示失败提示，保持 traditional', async () => {
        invoke.mockRejectedValue(
            new Error(
                "Error invoking remote method 'baize:file:initialize-llm-wiki': Error: IPC 通道不可用"
            )
        )
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const { wrapper, patches } = mountPanel()
        await openConfirm(wrapper)

        await confirmDialog(wrapper).find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(patches).toEqual([])
        expect(selectValue(wrapper)).toBe('traditional')
        expect(errorSpy).toHaveBeenCalled()
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('error')
        // describeActionError 去掉 Electron invoke 包装前缀，只展示原始原因
        expect(store.dialogs.messageDialog.message).toContain('IPC 通道不可用')
        expect(store.dialogs.messageDialog.message).not.toContain('Error invoking remote method')
    })

    it('初始化进行中：下拉与确认/取消按钮禁用，防重复提交', async () => {
        let resolveInvoke: (value: unknown) => void = () => {}
        invoke.mockImplementation(
            () =>
                new Promise((resolve) => {
                    resolveInvoke = resolve
                })
        )
        const { wrapper } = mountPanel()
        await openConfirm(wrapper)

        await confirmDialog(wrapper).find('.btn-confirm').trigger('click')
        await flushPromises()

        expect(initializeInvokeCalls()).toHaveLength(1)
        expect((workspaceModeSelect(wrapper).element as HTMLSelectElement).disabled).toBe(true)
        expect(
            (confirmDialog(wrapper).find('.btn-confirm').element as HTMLButtonElement).disabled
        ).toBe(true)
        expect(
            (confirmDialog(wrapper).find('.btn-cancel').element as HTMLButtonElement).disabled
        ).toBe(true)

        resolveInvoke({ success: true })
        await flushPromises()
        expect((workspaceModeSelect(wrapper).element as HTMLSelectElement).disabled).toBe(false)
    })
})

describe('FeaturesPanel 工作区模式：llm-wiki → traditional', () => {
    it('直接写草稿：不弹确认、不调主进程（不删除已创建目录）', async () => {
        const { wrapper, patches, settings } = mountPanel(draft({ workspaceMode: 'llm-wiki' }))
        expect(selectValue(wrapper)).toBe('llm-wiki')

        await workspaceModeSelect(wrapper).setValue('traditional')
        await flushPromises()

        expect(confirmDialog(wrapper).exists()).toBe(false)
        expect(initializeInvokeCalls()).toEqual([])
        expect(patches).toEqual([{ workspaceMode: 'traditional' }])
        expect(settings.value.workspaceMode).toBe('traditional')
        expect(selectValue(wrapper)).toBe('traditional')
    })
})
