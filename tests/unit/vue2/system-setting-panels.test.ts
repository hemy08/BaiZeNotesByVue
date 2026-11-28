// @vitest-environment jsdom
/**
 * 设置页拆分 P0 —— 6 个页签 panel 的 props/emit 契约 + useSystemSettingForm composable 单测
 *
 * 覆盖点：
 * 1. GeneralPanel / FilePanel / AppearancePanel / FeaturesPanel / WritingPanel / BackupPanel：
 *    - props.settings 只读渲染（字段值与显隐）；
 *    - 字段修改 emit('update', 补丁)，不在子组件内部改 props；
 *    - 面板级副作用：文件页签的目录选择 / 自动保存 IPC，外观页签的 open-theme-setting，
 *      备份页签的备份/恢复配置通道与 reload 事件；
 *    - 1.5.6 UI 简洁化：解释「为什么/是什么」的文案收进 ⓘ（InfoTip），不在界面常显；
 *      面板顶部用途描述与错误/状态提示按用户补充要求保留常显；
 * 2. useSystemSettingForm：
 *    - loadSettings：读取 system → 合并/语言归一化 → 记录初始值 + 主题显示名；
 *    - isDirty / resetSettings：脏标记与取消恢复；
 *    - saveSettings：写 system、返回快照、fire-and-forget；界面范围外值只 warn 不阻断不改值。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent, h, ref } from 'vue'

import GeneralPanel from '@renderer/components/dialogs/complex/system-setting/GeneralPanel.vue'
import FilePanel from '@renderer/components/dialogs/complex/system-setting/FilePanel.vue'
import AppearancePanel from '@renderer/components/dialogs/complex/system-setting/AppearancePanel.vue'
import FeaturesPanel from '@renderer/components/dialogs/complex/system-setting/FeaturesPanel.vue'
import WritingPanel from '@renderer/components/dialogs/complex/system-setting/WritingPanel.vue'
import BackupPanel from '@renderer/components/dialogs/complex/system-setting/BackupPanel.vue'
import InfoTip from '@renderer/components/common/InfoTip.vue'
import {
    OPTIONAL_FEATURE_FLAGS,
    OPTIONAL_FEATURE_FLAG_IDS,
    WRITING_EXPERIENCE_FLAGS,
    WRITING_EXPERIENCE_FLAG_IDS
} from '../../../src/shared/constants/feature-flags'
import {
    createDefaultSystemDialogSettings,
    type SystemDialogSettings
} from '@renderer/components/dialogs/complex/system-setting/model'
import { useSystemSettingForm } from '@renderer/components/dialogs/complex/system-setting/useSystemSettingForm'
// P2 功能错误处理修复：保存失败断言（全局消息对话框 + 错误文案走 i18n）
import { getConfigStore } from '@renderer/common/useConfigStore'
import { t } from '@renderer/common/i18n'
// P2 剩余静默失败提示（本批）：失败提示节流复位（自动保存开关同步防刷屏）
import { resetActionFailureThrottleForTesting } from '@renderer/common/action-feedback'

/** 全局配置 store 单例（断言保存失败的可见提示） */
const store = getConfigStore()

/** 构造草稿：默认值 + 局部覆盖（与组件默认值真源一致） */
function draft(overrides: Partial<SystemDialogSettings> = {}): SystemDialogSettings {
    return { ...createDefaultSystemDialogSettings(), ...overrides }
}

/**
 * 以最小宿主挂载 FilePanel 并像壳层一样把 update 补丁合并回 props。
 *
 * 失败回滚（P2 剩余静默失败提示）需要 props 真实更新才能断言 DOM 状态，直接 mount
 * 子组件时 props 是静态的，因此新增用例统一用本宿主挂载。
 */
function mountFilePanel(initial: SystemDialogSettings = draft()) {
    const settings = ref<SystemDialogSettings>({ ...initial })
    // 最小宿主组件（普通组件选项对象，避免新增 defineComponent 触发
    // vue/one-component-per-file 警告）：模拟壳层把 update 补丁合并回 props
    const wrapper = mount({
        setup() {
            return () =>
                h(FilePanel, {
                    settings: settings.value,
                    onUpdate: (patch: Partial<SystemDialogSettings>) => {
                        settings.value = { ...settings.value, ...patch }
                    }
                })
        }
    })
    return { wrapper, settings }
}

describe('GeneralPanel（通用设置页签）', () => {
    it('按 props.settings 渲染，修改字段时 emit update 补丁（不改 props）', async () => {
        const panelSettings = draft({ language: 'en-US', autoOpenLastFile: true })
        const wrapper = mount(GeneralPanel, { props: { settings: panelSettings } })

        const checkboxes = wrapper.findAll('.setting-checkbox')
        expect(checkboxes).toHaveLength(6)
        expect((checkboxes[0].element as HTMLInputElement).checked).toBe(true)
        expect((wrapper.find('select.setting-select').element as HTMLSelectElement).value).toBe(
            'en-US'
        )

        await checkboxes[1].setValue(true)
        expect(wrapper.emitted('update')).toEqual([[{ autoOpenLastFolder: true }]])

        await wrapper.find('select.setting-select').setValue('zh-CN')
        expect(wrapper.emitted('update')![1]).toEqual([{ language: 'zh-CN' }])

        // 子组件不直接修改 props（草稿仍为壳层传入的原对象）
        expect(panelSettings.autoOpenLastFolder).toBe(false)
        expect(panelSettings.language).toBe('en-US')
    })

    // 1.5.6 UI 简洁化：解释「为什么/是什么」的文案改为标签旁 ⓘ（InfoTip），不再常显。
    it('开机自启 / 远程图片的解释文案收进 ⓘ，界面不再直接渲染', () => {
        const wrapper = mount(GeneralPanel, { props: { settings: draft() } })

        const tipTexts = wrapper.findAllComponents(InfoTip).map((tip) => tip.props('text'))
        expect(tipTexts).toEqual([
            t('dialogRenderer.systemSetting.hintAutoStart'),
            t('dialogRenderer.systemSetting.hintAllowRemoteImages')
        ])
        // 原常显说明容器与原 title 提示均不再存在，文案不出现在可见文本中
        expect(wrapper.find('.group-hint').exists()).toBe(false)
        expect(wrapper.find('[title]').exists()).toBe(false)
        expect(wrapper.text()).not.toContain(t('dialogRenderer.systemSetting.hintAutoStart'))
        expect(wrapper.text()).not.toContain(
            t('dialogRenderer.systemSetting.hintAllowRemoteImages')
        )
        // 面板顶部用途描述按用户补充要求保留常显
        expect(wrapper.text()).toContain(t('dialogRenderer.systemSetting.panelGeneralDesc'))
    })
})

describe('FilePanel（文件设置页签）', () => {
    let invoke: ReturnType<typeof vi.fn>

    beforeEach(() => {
        // P2 防刷屏：失败提示节流状态按用例复位，避免跨用例相互抑制弹框
        resetActionFailureThrottleForTesting()
        store.hideDialog('message')
        store.clearMessageDialogRetry()
        invoke = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
    })

    afterEach(() => {
        store.hideDialog('message')
        store.clearMessageDialogRetry()
        resetActionFailureThrottleForTesting()
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('自动保存开关：emit 补丁并 invoke 主进程通道（含当前间隔）', async () => {
        const wrapper = mount(FilePanel, { props: { settings: draft() } })
        const autoSave = wrapper.findAll('.setting-checkbox')[0]
        // 2026-11-20：自动保存默认关闭（opt-in），此处操作改为开启
        expect((autoSave.element as HTMLInputElement).checked).toBe(false)

        await autoSave.setValue(true)
        await flushPromises()

        expect(wrapper.emitted('update')![0]).toEqual([{ autoSaveEnabled: true }])
        expect(invoke).toHaveBeenCalledWith('baize:setting:auto-save-changed', {
            autoSaveEnabled: true,
            autoSaveInterval: 60
        })
        // 成功路径不弹错误提示
        expect(store.dialogs.messageDialog.visible).toBe(false)
    })

    it('自动保存关闭时隐藏间隔输入行', () => {
        const wrapper = mount(FilePanel, { props: { settings: draft({ autoSaveEnabled: false }) } })
        expect(wrapper.find('input[min="10"]').exists()).toBe(false)
        expect(wrapper.find('input[min="5"]').exists()).toBe(true)
    })

    // 1.5.6 UI 简洁化：字段长解释改为标签旁 ⓘ，原分组说明段落与原生 title 不再常显。
    it('默认路径 / 最近文件数量的字段解释收进 ⓘ，不再常显', () => {
        const wrapper = mount(FilePanel, { props: { settings: draft() } })

        const tipTexts = wrapper.findAllComponents(InfoTip).map((tip) => tip.props('text'))
        expect(tipTexts).toEqual([
            t('dialogRenderer.systemSetting.hintDefaultFilePath'),
            t('dialogRenderer.systemSetting.hintRecentFilesCount')
        ])
        expect(wrapper.find('.group-hint').exists()).toBe(false)
        expect(wrapper.text()).not.toContain(t('dialogRenderer.systemSetting.hintDefaultFilePath'))
        expect(wrapper.text()).not.toContain(t('dialogRenderer.systemSetting.hintRecentFilesCount'))
        // 文件页签保留面板顶部用途描述常显
        expect(wrapper.text()).toContain(t('dialogRenderer.systemSetting.panelFileDesc'))
    })

    it('浏览默认路径：invoke 目录选择器并把路径 emit 给壳层', async () => {
        invoke.mockResolvedValueOnce('D:\\notes')
        const wrapper = mount(FilePanel, { props: { settings: draft() } })

        await wrapper.find('.browse-btn').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith('baize:file:select-directory')
        expect(wrapper.emitted('update')).toEqual([[{ defaultFilePath: 'D:\\notes' }]])
    })

    // P2 剩余静默失败提示（本批）：浏览默认路径失败此前只写日志，按钮无任何反馈。
    it('浏览默认路径失败：弹错误提示 + 重试，重试成功后写入路径', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockRejectedValueOnce(new Error('目录选择器不可用'))
        const wrapper = mount(FilePanel, { props: { settings: draft() } })

        await wrapper.find('.browse-btn').trigger('click')
        await flushPromises()

        expect(errorSpy).toHaveBeenCalledWith(
            '选择默认路径失败:',
            expect.objectContaining({ message: '目录选择器不可用' })
        )
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('error')
        expect(store.dialogs.messageDialog.title).toBe(
            t('dialogRenderer.systemSetting.browseFailedTitle')
        )
        expect(store.dialogs.messageDialog.message).toContain('目录选择器不可用')
        // 失败时不写入路径
        expect(wrapper.emitted('update')).toBeUndefined()
        // 重试按钮已挂载：主进程恢复后重试 → 重新拉起选择器并写入路径
        expect(store.messageDialogRetry.value).not.toBeNull()
        invoke.mockResolvedValueOnce('D:\\notes')
        store.runMessageDialogRetry()
        await flushPromises()
        expect(wrapper.emitted('update')).toEqual([[{ defaultFilePath: 'D:\\notes' }]])
    })

    // P2 剩余静默失败提示（本批）：自动保存开关同步失败此前只记日志，开关 UI 已即时变更
    // 但主进程定时器未同步。现在弹错误提示 + 回滚开关 + 重试（宿主模拟壳层合并补丁）。
    it('自动保存同步返回 ok:false：弹错误提示、回滚开关，重试成功后重新开启', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockResolvedValueOnce({ ok: false, reason: 'invalid-payload' })
        const { wrapper, settings } = mountFilePanel()

        await wrapper.findAll('.setting-checkbox')[0].setValue(true)
        await flushPromises()

        expect(errorSpy).toHaveBeenCalledWith(
            '同步自动保存设置失败:',
            expect.objectContaining({ message: 'invalid-payload' })
        )
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.title).toBe(
            t('dialogRenderer.systemSetting.autoSaveSyncFailedTitle')
        )
        expect(store.dialogs.messageDialog.message).toContain('invalid-payload')
        // 开关回滚到操作前状态（默认关闭）：DOM 与草稿一致
        expect(settings.value.autoSaveEnabled).toBe(false)
        expect((wrapper.findAll('.setting-checkbox')[0].element as HTMLInputElement).checked).toBe(
            false
        )
        // 重试：主进程恢复后按用户目标状态重新同步并重新开启
        expect(store.messageDialogRetry.value).not.toBeNull()
        invoke.mockResolvedValueOnce({ ok: true, autoSaveEnabled: true, autoSaveInterval: 60 })
        store.runMessageDialogRetry()
        await flushPromises()
        expect(settings.value.autoSaveEnabled).toBe(true)
        expect((wrapper.findAll('.setting-checkbox')[0].element as HTMLInputElement).checked).toBe(
            true
        )
    })

    it('自动保存同步 invoke 异常：弹错误提示并回滚开关', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockRejectedValueOnce(new Error('主进程不可用'))
        const { wrapper, settings } = mountFilePanel()

        await wrapper.findAll('.setting-checkbox')[0].setValue(true)
        await flushPromises()

        expect(errorSpy).toHaveBeenCalledWith('同步自动保存设置失败:', expect.any(Error))
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.message).toContain('主进程不可用')
        expect(settings.value.autoSaveEnabled).toBe(false)
        expect((wrapper.findAll('.setting-checkbox')[0].element as HTMLInputElement).checked).toBe(
            false
        )
    })

    // P2 防刷屏：同一目标状态 10s 内重复失败只提示一次（后续只记日志）
    it('自动保存同步：同一目标状态重复失败时提示节流（只弹一次）', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockResolvedValue({ ok: false, reason: 'busy' })
        const { wrapper } = mountFilePanel()

        await wrapper.findAll('.setting-checkbox')[0].setValue(true)
        await flushPromises()
        expect(store.dialogs.messageDialog.visible).toBe(true)
        store.hideDialog('message')

        // 回滚后再开启（同一目标状态）→ 节流期内只记日志
        await wrapper.findAll('.setting-checkbox')[0].setValue(true)
        await flushPromises()
        expect(store.dialogs.messageDialog.visible).toBe(false)
        expect(errorSpy).toHaveBeenCalledWith(
            '[ActionFeedback][throttled] ' +
                t('dialogRenderer.systemSetting.autoSaveSyncFailedTitle') +
                ': ' +
                t('dialogRenderer.systemSetting.autoSaveSyncFailedMessage', {
                    error: 'busy'
                })
        )
    })
})

describe('AppearancePanel（外观设置页签）', () => {
    it('只读展示主题名，emit 字段补丁与 open-theme-setting 事件', async () => {
        const wrapper = mount(AppearancePanel, {
            props: { settings: draft({ fontFamily: 'Arial' }), themeDisplay: '深邃夜空' }
        })

        expect(wrapper.find('.theme-current-name').text()).toBe('深邃夜空')
        expect((wrapper.find('select.setting-select').element as HTMLSelectElement).value).toBe(
            'Arial'
        )

        await wrapper.find('.setting-checkbox').setValue(true)
        expect(wrapper.emitted('update')).toEqual([[{ useSystemTheme: true }]])

        await wrapper.find('input[type="number"]').setValue('16')
        expect(wrapper.emitted('update')![1]).toEqual([{ fontSize: 16 }])

        await wrapper.find('select.setting-select').setValue('Microsoft YaHei')
        expect(wrapper.emitted('update')![2]).toEqual([{ fontFamily: 'Microsoft YaHei' }])

        await wrapper.find('.browse-btn').trigger('click')
        expect(wrapper.emitted('open-theme-setting')).toHaveLength(1)
    })

    // 视觉升级（P0）：界面风格风格/密度/减少透明三项控件（数据真源默认 workbench + default）
    it('界面风格/密度下拉与减少透明开关：渲染当前值并 emit 字段补丁', async () => {
        const wrapper = mount(AppearancePanel, {
            props: {
                settings: draft({
                    uiStyle: 'workbench',
                    uiDensity: 'default',
                    uiReduceTransparency: false
                }),
                themeDisplay: '白泽紫韵'
            }
        })

        const styleSelect = wrapper.find('[data-testid="ui-style-select"]')
        const densitySelect = wrapper.find('[data-testid="ui-density-select"]')
        const reduceCheckbox = wrapper.find('[data-testid="ui-reduce-transparency"]')

        // 4 风格 / 3 密度选项齐全（互斥单选）
        expect(styleSelect.findAll('option').map((option) => option.attributes('value'))).toEqual([
            'paper',
            'glass',
            'workbench',
            'hybrid'
        ])
        expect(densitySelect.findAll('option').map((option) => option.attributes('value'))).toEqual(
            ['compact', 'default', 'spacious']
        )
        expect((styleSelect.element as HTMLSelectElement).value).toBe('workbench')
        expect((densitySelect.element as HTMLSelectElement).value).toBe('default')
        expect((reduceCheckbox.element as HTMLInputElement).checked).toBe(false)

        await styleSelect.setValue('glass')
        expect(wrapper.emitted('update')![0]).toEqual([{ uiStyle: 'glass' }])

        await densitySelect.setValue('compact')
        expect(wrapper.emitted('update')![1]).toEqual([{ uiDensity: 'compact' }])

        await reduceCheckbox.setValue(true)
        expect(wrapper.emitted('update')![2]).toEqual([{ uiReduceTransparency: true }])
    })

    // 1.5.6 UI 简洁化：主题托管/跟随系统/界面风格与密度/减少透明的长解释改为 ⓘ 悬停提示。
    it('外观解释文案收进 ⓘ，原分组说明段落不再常显', () => {
        const wrapper = mount(AppearancePanel, {
            props: { settings: draft(), themeDisplay: 'baize' }
        })

        const tipTexts = wrapper.findAllComponents(InfoTip).map((tip) => tip.props('text'))
        expect(tipTexts).toEqual([
            t('dialogRenderer.systemSetting.hintThemeManaged'),
            t('dialogRenderer.systemSetting.hintUseSystemTheme'),
            t('dialogRenderer.systemSetting.hintUiAppearance'),
            t('dialogRenderer.systemSetting.hintReduceTransparency')
        ])
        expect(wrapper.find('.ui-style-hint').exists()).toBe(false)
        expect(wrapper.text()).not.toContain(t('dialogRenderer.systemSetting.hintUiAppearance'))
        expect(wrapper.text()).not.toContain(
            t('dialogRenderer.systemSetting.hintReduceTransparency')
        )
        expect(wrapper.text()).not.toContain(t('dialogRenderer.systemSetting.hintUseSystemTheme'))
        // 面板顶部用途描述与降级状态提示按用户补充要求保留常显
        expect(wrapper.text()).toContain(t('dialogRenderer.systemSetting.panelAppearanceDesc'))
    })

    // P2 剩余静默失败提示（本批）：主题显示名读取失败时显示内联降级提示（非阻断）
    it('themeDisplayFallback 为 true 时显示内联降级提示，默认不显示', () => {
        const normal = mount(AppearancePanel, {
            props: { settings: draft(), themeDisplay: 'baize' }
        })
        expect(normal.find('.theme-display-fallback-hint').exists()).toBe(false)

        const fallback = mount(AppearancePanel, {
            props: { settings: draft(), themeDisplay: '未知', themeDisplayFallback: true }
        })
        const hint = fallback.find('.theme-display-fallback-hint')
        expect(hint.exists()).toBe(true)
        expect(hint.text()).toBe(t('dialogRenderer.systemSetting.themeDisplayFallbackHint'))
        expect(fallback.find('.theme-current-name').text()).toBe('未知')
    })
})

describe('FeaturesPanel（功能页签）', () => {
    // 1.5.6 UI 简洁化：11 项可选能力的多行 Desc 全部收进标签旁 ⓘ，开关行恢复单行高度。
    // 1.5.7 LLM Wiki L1：新增「工作区」分组的工作区模式下拉，其说明同样收进 ⓘ。
    // 1.5.7 LLM Wiki L2：新增「MCP 服务」分组，其安全说明收进 ⓘ（分组位于可选能力之后）。
    // 1.5.7 LLM Wiki L3：新增「AI 助手」分组（分组说明 + 基址/模型提示均收进 ⓘ）。
    it('分组说明与各能力 Desc 收进 ⓘ，不再常显', () => {
        const wrapper = mount(FeaturesPanel, { props: { settings: draft() } })

        const tipTexts = wrapper.findAllComponents(InfoTip).map((tip) => tip.props('text'))
        // 可选能力 Desc + 4 个既有分组提示（workspaceMode / 默认能力 / 可选能力 / MCP）
        // + 3 个 AI 助手分组提示（分组说明 / 接口基址 / 模型）
        expect(tipTexts).toHaveLength(OPTIONAL_FEATURE_FLAG_IDS.length + 7)
        // DOM 顺序：工作区模式说明 → 默认能力分组说明 → 可选能力分组说明 → 各能力 Desc →
        // MCP 服务分组说明 → AI 助手分组说明/基址提示/模型提示
        expect(tipTexts[0]).toBe(t('dialogRenderer.systemSetting.features.workspaceModeHint'))
        expect(tipTexts[1]).toBe(t('dialogRenderer.systemSetting.hintDefaultFeatures'))
        expect(tipTexts[2]).toBe(t('dialogRenderer.systemSetting.hintOptionalFeatures'))
        expect(tipTexts.slice(3, 3 + OPTIONAL_FEATURE_FLAG_IDS.length)).toEqual(
            OPTIONAL_FEATURE_FLAG_IDS.map((id) => t(OPTIONAL_FEATURE_FLAGS[id].descKey))
        )
        const tail = tipTexts.slice(3 + OPTIONAL_FEATURE_FLAG_IDS.length)
        expect(tail).toEqual([
            t('dialogRenderer.systemSetting.features.mcpServerHint'),
            t('dialogRenderer.systemSetting.features.aiGroupHint'),
            t('dialogRenderer.systemSetting.features.aiBaseUrlHint'),
            t('dialogRenderer.systemSetting.features.aiModelHint')
        ])
        // 原常显 Desc 容器与分组说明段落均已移除
        expect(wrapper.find('.feature-desc').exists()).toBe(false)
        expect(wrapper.find('.group-hint').exists()).toBe(false)
        expect(wrapper.text()).not.toContain(t(OPTIONAL_FEATURE_FLAGS.tabs.descKey))
        // 面板顶部用途描述保留常显；默认能力只读清单保留
        expect(wrapper.text()).toContain(t('dialogRenderer.systemSetting.panelFeaturesDesc'))
        expect(wrapper.findAll('.feature-fixed-item')).toHaveLength(3)
    })
})

describe('WritingPanel（编写体验页签）', () => {
    // 1.5.6 UI 简洁化：9 项写作能力的多行 Desc 全部收进标签旁 ⓘ，开关行恢复单行高度。
    it('分组说明与各写作能力 Desc 收进 ⓘ，不再常显', () => {
        const wrapper = mount(WritingPanel, { props: { settings: draft() } })

        const tipTexts = wrapper.findAllComponents(InfoTip).map((tip) => tip.props('text'))
        expect(tipTexts).toHaveLength(WRITING_EXPERIENCE_FLAG_IDS.length + 1)
        expect(tipTexts[0]).toBe(t('dialogRenderer.systemSetting.hintWritingFeatures'))
        expect(tipTexts.slice(1)).toEqual(
            WRITING_EXPERIENCE_FLAG_IDS.map((id) => t(WRITING_EXPERIENCE_FLAGS[id].descKey))
        )
        expect(wrapper.find('.writing-desc').exists()).toBe(false)
        expect(wrapper.find('.group-hint').exists()).toBe(false)
        expect(wrapper.text()).not.toContain(t(WRITING_EXPERIENCE_FLAGS.writingMode.descKey))
        // 面板顶部用途描述保留常显
        expect(wrapper.text()).toContain(t('dialogRenderer.systemSetting.panelWritingDesc'))
    })
})

describe('BackupPanel（备份与恢复页签）', () => {
    let configWrite: ReturnType<typeof vi.fn>
    let configRead: ReturnType<typeof vi.fn>

    beforeEach(() => {
        configWrite = vi.fn().mockResolvedValue(true)
        configRead = vi.fn().mockResolvedValue({ backups: [], latest: null })
        vi.stubGlobal('api', { config: { write: configWrite, read: configRead } })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    it('按 props.settings 渲染并 emit 字段补丁', async () => {
        const wrapper = mount(BackupPanel, {
            props: {
                settings: draft({ enableAutoBackup: true, backupInterval: 12, backupCount: 3 })
            }
        })

        expect(wrapper.findAll('.setting-checkbox')).toHaveLength(1)
        expect((wrapper.findAll('.setting-checkbox')[0].element as HTMLInputElement).checked).toBe(
            true
        )
        expect((wrapper.find('input[max="72"]').element as HTMLInputElement).value).toBe('12')
        expect((wrapper.find('input[max="10"]').element as HTMLInputElement).value).toBe('3')

        await wrapper.find('input[max="10"]').setValue('7')
        expect(wrapper.emitted('update')).toEqual([[{ backupCount: 7 }]])
    })

    // 1.5.6 UI 简洁化：自动备份行为说明 + 间隔/保留数量字段提示改为 ⓘ 悬停提示。
    it('自动备份说明与字段提示收进 ⓘ，不再常显或依赖原生 title', () => {
        const wrapper = mount(BackupPanel, { props: { settings: draft() } })

        const tipTexts = wrapper.findAllComponents(InfoTip).map((tip) => tip.props('text'))
        expect(tipTexts).toEqual([
            t('dialogRenderer.systemSetting.hintAutoBackupGroup'),
            t('dialogRenderer.systemSetting.hintBackupInterval'),
            t('dialogRenderer.systemSetting.hintBackupRetention')
        ])
        expect(wrapper.find('.group-hint').exists()).toBe(false)
        expect(wrapper.find('input[min="1"][max="72"]').attributes('title')).toBeUndefined()
        expect(wrapper.find('input[max="10"]').attributes('title')).toBeUndefined()
        expect(wrapper.text()).not.toContain(t('dialogRenderer.systemSetting.hintAutoBackupGroup'))
        // 面板顶部用途描述保留常显
        expect(wrapper.text()).toContain(t('dialogRenderer.systemSetting.panelBackupDesc'))
    })

    it('立即备份：写 backup 通道（keep 取草稿 backupCount）并展示结果', async () => {
        configRead.mockResolvedValue({
            backups: [{ name: 'config-backup-20260101-120000', fileCount: 3 }],
            latest: 'config-backup-20260101-120000'
        })
        const wrapper = mount(BackupPanel, { props: { settings: draft({ backupCount: 3 }) } })

        await wrapper.findAll('.action-btn')[0].trigger('click')
        await flushPromises()

        expect(configWrite).toHaveBeenCalledWith('backup', { action: 'create', keep: 3 })
        const status = wrapper.find('.backup-status').text()
        expect(status).toContain('config-backup-20260101-120000')
        expect(status).toContain('3')
    })

    it('从备份恢复：无备份时明确提示且不写配置', async () => {
        const wrapper = mount(BackupPanel, { props: { settings: draft() } })

        await wrapper.findAll('.action-btn')[1].trigger('click')
        await flushPromises()

        expect(wrapper.find('.backup-status').text()).toContain('暂无可恢复的备份')
        expect(configWrite).not.toHaveBeenCalled()
    })

    it('从备份恢复成功：写 restore 命令并 emit reload（壳层负责重新加载）', async () => {
        configRead.mockResolvedValue({
            backups: [{ name: 'config-backup-20260101-120000', fileCount: 3 }],
            latest: 'config-backup-20260101-120000'
        })
        const wrapper = mount(BackupPanel, { props: { settings: draft() } })

        await wrapper.findAll('.action-btn')[1].trigger('click')
        await flushPromises()

        expect(configWrite).toHaveBeenCalledWith('backup', {
            action: 'restore',
            name: 'config-backup-20260101-120000'
        })
        expect(wrapper.find('.backup-status').text()).toContain('已从备份')
        expect(wrapper.emitted('reload')).toHaveLength(1)
    })
})

describe('useSystemSettingForm（共享表单 composable）', () => {
    let configWrite: ReturnType<typeof vi.fn>
    let configRead: ReturnType<typeof vi.fn>
    let invoke: ReturnType<typeof vi.fn>

    beforeEach(() => {
        configWrite = vi.fn().mockResolvedValue(true)
        configRead = vi.fn().mockImplementation((name: string) => {
            if (name === 'theme') return Promise.resolve({ currentTheme: 'dark' })
            if (name === 'backup') return Promise.resolve({ backups: [], latest: null })
            return Promise.resolve({ language: 'en-us', fontSize: 16 })
        })
        invoke = vi
            .fn()
            .mockImplementation((channel: string) =>
                Promise.resolve(
                    channel === 'baize:theme:get-all'
                        ? [{ type: 'dark', styles: { name: '深邃夜空' } }]
                        : { ok: true }
                )
            )
        vi.stubGlobal('api', { config: { write: configWrite, read: configRead } })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    /** 在最小宿主组件中执行 composable（setup 同步完成，可直接持有返回值） */
    function mountForm(): ReturnType<typeof useSystemSettingForm> {
        let form!: ReturnType<typeof useSystemSettingForm>
        const Host = defineComponent({
            setup() {
                form = useSystemSettingForm()
                return () => null
            }
        })
        const wrapper = mount(Host)
        wrapper.unmount()
        return form
    }

    it('loadSettings：合并主进程值 + 语言归一化 + 刷新主题显示名，加载后不脏', async () => {
        const form = mountForm()
        expect(form.settings.value.language).toBe('zh-CN')
        expect(form.isDirty.value).toBe(false)

        await form.loadSettings()

        expect(form.settings.value.language).toBe('en-US')
        expect(form.settings.value.fontSize).toBe(16)
        expect(form.appThemeDisplay.value).toBe('深邃夜空')
        // 加载后的值即初始值：未修改时不脏
        expect(form.isDirty.value).toBe(false)

        form.settings.value = { ...form.settings.value, fontSize: 18 }
        expect(form.isDirty.value).toBe(true)
    })

    it('resetSettings：恢复打开时加载值并清除脏标记', async () => {
        const form = mountForm()
        await form.loadSettings()
        form.settings.value = { ...form.settings.value, language: 'zh-CN' }
        expect(form.isDirty.value).toBe(true)

        form.resetSettings()
        expect(form.settings.value.language).toBe('en-US')
        expect(form.settings.value.fontSize).toBe(16)
        expect(form.isDirty.value).toBe(false)
    })

    // P2 剩余静默失败提示（本批）：主题显示名读取失败此前只写日志、界面停留在初始值，
    // 用户可能把「baize」误读为真实主题名。现在回退为「未知」并置 fallback 标记（外观页签
    // 渲染内联提示），且不影响系统设置本身的加载。
    it('loadSettings：主题显示名读取失败时回退「未知」并置降级标记（设置加载不受影响）', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        configRead.mockImplementation((name: string) => {
            if (name === 'theme') return Promise.reject(new Error('主题配置不可读'))
            if (name === 'backup') return Promise.resolve({ backups: [], latest: null })
            return Promise.resolve({ language: 'en-us', fontSize: 16 })
        })
        const form = mountForm()
        await form.loadSettings()

        // 系统设置正常加载
        expect(form.settings.value.language).toBe('en-US')
        expect(form.settings.value.fontSize).toBe(16)
        // 主题显示名降级 + 标记
        expect(errorSpy).toHaveBeenCalledWith('读取当前主题显示名失败:', expect.any(Error))
        expect(form.appThemeDisplay.value).toBe(t('common.unknown'))
        expect(form.appThemeDisplayFallback.value).toBe(true)

        // 重新打开（再次 loadSettings）成功时清除降级标记
        configRead.mockImplementation((name: string) => {
            if (name === 'theme') return Promise.resolve({ currentTheme: 'dark' })
            if (name === 'backup') return Promise.resolve({ backups: [], latest: null })
            return Promise.resolve({ language: 'zh-CN' })
        })
        await form.loadSettings()
        expect(form.appThemeDisplay.value).toBe('深邃夜空')
        expect(form.appThemeDisplayFallback.value).toBe(false)
    })

    it('saveSettings：await 写入 system 配置并返回快照；界面范围外值只 warn、不阻断、不改值', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const form = mountForm()
        form.settings.value = { ...form.settings.value, fontSize: 99 }
        expect(form.isDirty.value).toBe(true)

        const snapshot = await form.saveSettings()
        await flushPromises()

        expect(configWrite).toHaveBeenCalledTimes(1)
        // P2 功能错误处理修复：saveSettings 改为 await 后返回提交快照（原同步返回）
        expect(snapshot).not.toBeNull()
        expect(configWrite).toHaveBeenCalledWith('system', snapshot)
        expect(snapshot?.fontSize).toBe(99)
        // 诊断校验只记录日志：不阻断写入、不修改草稿
        expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('系统设置保存前校验'),
            expect.arrayContaining([expect.objectContaining({ field: 'fontSize' })])
        )
        expect(form.settings.value.fontSize).toBe(99)
    })

    // P2 功能错误处理修复：保存失败（返回 false / invoke 异常）必须弹错误提示并返回 null，
    // 壳层据此保持对话框打开、不 emit apply（修复前 fire-and-forget，失败完全静默）。
    it('saveSettings：主进程返回 false 时弹错误提示并返回 null（不再静默）', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        configWrite.mockResolvedValue(false)
        const form = mountForm()

        const snapshot = await form.saveSettings()
        await flushPromises()

        expect(snapshot).toBeNull()
        expect(errorSpy).toHaveBeenCalled()
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('error')
        expect(store.dialogs.messageDialog.title).toBe(
            t('dialogRenderer.systemSetting.saveFailedTitle')
        )
        expect(store.dialogs.messageDialog.message).toContain(
            t('workspace.config.writeReturnedFalse')
        )
        store.hideDialog('message')
    })

    it('saveSettings：invoke 抛异常时弹错误提示（含错误详情）并返回 null', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        configWrite.mockRejectedValue(new Error('IPC 通道不可用'))
        const form = mountForm()

        const snapshot = await form.saveSettings()
        await flushPromises()

        expect(snapshot).toBeNull()
        expect(errorSpy).toHaveBeenCalled()
        expect(store.dialogs.messageDialog.message).toContain('IPC 通道不可用')
        store.hideDialog('message')
    })
})
