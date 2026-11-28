// @vitest-environment jsdom
/**
 * 1.5.7 迁移批次：设置页「工作区模式」入口统一到迁移弹窗。
 *
 * 覆盖点：
 * 1. 下拉渲染：默认 traditional，两个选项值/文案走 i18n；
 * 2. traditional → llm-wiki：**不再弹面板内联确认框**，而是打开统一迁移弹窗
 *    （`workspaceModeSwitchState.visible = true`），不立即写草稿、不调用主进程；
 * 3. 取消（关闭弹窗）：下拉回退为当前草稿值，不写草稿；
 * 4. 弹窗完成切换后：完成监听把工作区模式同步进设置页草稿（保存仍走设置页既有通道）；
 * 5. 弹窗切换进行中（busy）：下拉禁用，防重复切换；
 * 6. llm-wiki → traditional：直接写草稿（不弹窗、不调通道、不删除已创建目录）。
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
import {
    cancelWorkspaceModeSwitch,
    clearWorkspaceModeSwitchListenersForTesting,
    completeSwitchToLlmWiki,
    finishWorkspaceModeSwitch,
    resetWorkspaceModeSwitchForTesting,
    workspaceModeSwitchState
} from '../../../src/renderer/src/composables/useWorkspaceModeSwitch'

const { initializeLlmWikiMock } = vi.hoisted(() => ({
    initializeLlmWikiMock: vi.fn()
}))

vi.mock('@renderer/common/llm-wiki-actions', () => ({
    initializeLlmWiki: initializeLlmWikiMock
}))

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
 * 这样才能断言「弹窗完成切换后才写入工作区模式草稿」以及下拉的最终展示值。
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

let readMock: ReturnType<typeof vi.fn>
let writeMock: ReturnType<typeof vi.fn>

beforeEach(() => {
    resetWorkspaceModeSwitchForTesting()
    clearWorkspaceModeSwitchListenersForTesting()
    store.hideDialog('message')
    initializeLlmWikiMock.mockReset()
    initializeLlmWikiMock.mockResolvedValue(true)
    readMock = vi.fn().mockResolvedValue({ language: 'zh-CN', workspaceMode: 'traditional' })
    writeMock = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('api', { config: { read: readMock, write: writeMock } })
})

afterEach(() => {
    for (const wrapper of wrappers) {
        if (wrapper.exists()) {
            wrapper.unmount()
        }
    }
    wrappers = []
    resetWorkspaceModeSwitchForTesting()
    clearWorkspaceModeSwitchListenersForTesting()
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

describe('FeaturesPanel 工作区模式：traditional → llm-wiki 走统一迁移弹窗', () => {
    it('切换时打开迁移弹窗（不写草稿、不调通道），下拉回退为当前值', async () => {
        const { wrapper, patches } = mountPanel()

        await workspaceModeSelect(wrapper).setValue('llm-wiki')
        await flushPromises()

        expect(workspaceModeSwitchState.visible).toBe(true)
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(patches).toEqual([])
        expect(selectValue(wrapper)).toBe('traditional')
        // 面板内不再渲染自己的确认框（统一由 WorkSpace 挂载迁移弹窗）
        expect(wrapper.find('.workspace-mode-confirm-dialog').exists()).toBe(false)
    })

    it('取消（关闭迁移弹窗）：不写草稿、不调通道，下拉保持原值', async () => {
        const { wrapper, patches, settings } = mountPanel()
        await workspaceModeSelect(wrapper).setValue('llm-wiki')
        await flushPromises()

        cancelWorkspaceModeSwitch()
        await flushPromises()

        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(patches).toEqual([])
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(settings.value.workspaceMode).toBe('traditional')
        expect(selectValue(wrapper)).toBe('traditional')
    })

    it('弹窗完成切换后：完成监听把模式同步进草稿，下拉展示 llm-wiki', async () => {
        const { wrapper, patches, settings } = mountPanel()
        await workspaceModeSelect(wrapper).setValue('llm-wiki')
        await flushPromises()

        // 模拟迁移弹窗提交完成（初始化 + 写配置成功）
        const outcome = await completeSwitchToLlmWiki({ mode: 'none', formats: [] })
        await flushPromises()

        expect(outcome.switched).toBe(true)
        expect(initializeLlmWikiMock).toHaveBeenCalledTimes(1)
        expect(writeMock).toHaveBeenCalledWith(
            'system',
            expect.objectContaining({ workspaceMode: 'llm-wiki' })
        )
        expect(patches).toContainEqual({ workspaceMode: 'llm-wiki' })
        expect(settings.value.workspaceMode).toBe('llm-wiki')
        expect(selectValue(wrapper)).toBe('llm-wiki')
    })

    it('切换失败（初始化失败）时不同步草稿：下拉保持 traditional', async () => {
        initializeLlmWikiMock.mockResolvedValue(false)
        const { wrapper, patches } = mountPanel()
        await workspaceModeSelect(wrapper).setValue('llm-wiki')
        await flushPromises()

        const outcome = await completeSwitchToLlmWiki({ mode: 'none', formats: [] })
        await flushPromises()

        expect(outcome.switched).toBe(false)
        expect(patches).toEqual([])
        expect(selectValue(wrapper)).toBe('traditional')
        finishWorkspaceModeSwitch()
    })

    it('弹窗切换进行中（busy）：下拉禁用，防重复切换', async () => {
        const { wrapper } = mountPanel()
        workspaceModeSwitchState.busy = true
        await flushPromises()

        expect((workspaceModeSelect(wrapper).element as HTMLSelectElement).disabled).toBe(true)

        workspaceModeSwitchState.busy = false
        await flushPromises()
        expect((workspaceModeSelect(wrapper).element as HTMLSelectElement).disabled).toBe(false)
    })

    it('面板卸载后取消完成监听（不再写草稿/不抛异常）', async () => {
        const { wrapper, patches } = mountPanel()
        wrapper.unmount()
        wrappers = []
        workspaceModeSwitchState.visible = true

        await completeSwitchToLlmWiki({ mode: 'none', formats: [] })

        expect(patches).toEqual([])
    })
})

describe('FeaturesPanel 工作区模式：llm-wiki → traditional', () => {
    it('直接写草稿：不弹窗、不调主进程（不删除已创建目录）', async () => {
        const { wrapper, patches, settings } = mountPanel(draft({ workspaceMode: 'llm-wiki' }))
        expect(selectValue(wrapper)).toBe('llm-wiki')

        await workspaceModeSelect(wrapper).setValue('traditional')
        await flushPromises()

        expect(workspaceModeSwitchState.visible).toBe(false)
        expect(initializeLlmWikiMock).not.toHaveBeenCalled()
        expect(patches).toEqual([{ workspaceMode: 'traditional' }])
        expect(settings.value.workspaceMode).toBe('traditional')
        expect(selectValue(wrapper)).toBe('traditional')
    })
})
