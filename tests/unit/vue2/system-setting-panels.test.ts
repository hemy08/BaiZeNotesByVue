// @vitest-environment jsdom
/**
 * 设置页拆分 P0 —— 4 个页签 panel 的 props/emit 契约 + useSystemSettingForm composable 单测
 *
 * 覆盖点：
 * 1. GeneralPanel / FilePanel / AppearancePanel / BackupPanel：
 *    - props.settings 只读渲染（字段值与显隐）；
 *    - 字段修改 emit('update', 补丁)，不在子组件内部改 props；
 *    - 面板级副作用：文件页签的目录选择 / 自动保存 IPC，外观页签的 open-theme-setting，
 *      备份页签的备份/恢复配置通道与 reload 事件；
 * 2. useSystemSettingForm：
 *    - loadSettings：读取 system → 合并/语言归一化 → 记录初始值 + 主题显示名；
 *    - isDirty / resetSettings：脏标记与取消恢复；
 *    - saveSettings：写 system、返回快照、fire-and-forget；界面范围外值只 warn 不阻断不改值。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { defineComponent } from 'vue'

import GeneralPanel from '@renderer/components/dialogs/complex/system-setting/GeneralPanel.vue'
import FilePanel from '@renderer/components/dialogs/complex/system-setting/FilePanel.vue'
import AppearancePanel from '@renderer/components/dialogs/complex/system-setting/AppearancePanel.vue'
import BackupPanel from '@renderer/components/dialogs/complex/system-setting/BackupPanel.vue'
import {
    createDefaultSystemDialogSettings,
    type SystemDialogSettings
} from '@renderer/components/dialogs/complex/system-setting/model'
import { useSystemSettingForm } from '@renderer/components/dialogs/complex/system-setting/useSystemSettingForm'
// P2 功能错误处理修复：保存失败断言（全局消息对话框 + 错误文案走 i18n）
import { getConfigStore } from '@renderer/common/useConfigStore'
import { t } from '@renderer/common/i18n'

/** 全局配置 store 单例（断言保存失败的可见提示） */
const store = getConfigStore()

/** 构造草稿：默认值 + 局部覆盖（与组件默认值真源一致） */
function draft(overrides: Partial<SystemDialogSettings> = {}): SystemDialogSettings {
    return { ...createDefaultSystemDialogSettings(), ...overrides }
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
})

describe('FilePanel（文件设置页签）', () => {
    let invoke: ReturnType<typeof vi.fn>

    beforeEach(() => {
        invoke = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
    })

    afterEach(() => {
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
    })

    it('自动保存关闭时隐藏间隔输入行', () => {
        const wrapper = mount(FilePanel, { props: { settings: draft({ autoSaveEnabled: false }) } })
        expect(wrapper.find('input[min="10"]').exists()).toBe(false)
        expect(wrapper.find('input[min="5"]').exists()).toBe(true)
    })

    it('浏览默认路径：invoke 目录选择器并把路径 emit 给壳层', async () => {
        invoke.mockResolvedValueOnce('D:\\notes')
        const wrapper = mount(FilePanel, { props: { settings: draft() } })

        await wrapper.find('.browse-btn').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith('baize:file:select-directory')
        expect(wrapper.emitted('update')).toEqual([[{ defaultFilePath: 'D:\\notes' }]])
    })

    it('自动保存 IPC 返回 ok:false 时记录错误、不抛异常、不回滚开关', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockResolvedValueOnce({ ok: false })
        const wrapper = mount(FilePanel, { props: { settings: draft() } })

        await wrapper.findAll('.setting-checkbox')[0].setValue(true)
        await flushPromises()

        expect(errorSpy).toHaveBeenCalledWith(
            '同步自动保存设置失败: 主进程返回失败标志',
            expect.objectContaining({ ok: false })
        )
        expect(wrapper.emitted('update')![0]).toEqual([{ autoSaveEnabled: true }])
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
