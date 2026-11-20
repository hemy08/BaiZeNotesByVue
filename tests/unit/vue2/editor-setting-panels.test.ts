// @vitest-environment jsdom
/**
 * 设置对话框二期拆分 —— EditorSettingDialog 4 个页签 panel + composable 契约单测
 *
 * 覆盖点：
 * 1. BasicPanel / AppearancePanel：props.settings 只读渲染，字段修改 emit('update', 补丁)，
 *    不在子组件内部改 props（含 v-model.number 语义）；
 * 2. MarkdownPanel / AdvancedPanel：无消费方字段保持 disabled + 「暂未实现」提示（防假开关回归）；
 * 3. useEditorSettingForm：
 *    - loadSettings：config:read('editor') 逐字段类型守卫合并 + config:read('system') 自动保存字段，
 *      加载后记录初始值供取消恢复；
 *    - saveSettings：await 写 editor 配置并返回提交快照；失败弹错误提示并返回 null
 *      （P2 功能错误处理修复：原 fire-and-forget 失败仅记日志）；
 *    - resetSettings：恢复打开时加载值。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

import BasicPanel from '@renderer/components/dialogs/complex/editor-setting/BasicPanel.vue'
import AppearancePanel from '@renderer/components/dialogs/complex/editor-setting/AppearancePanel.vue'
import MarkdownPanel from '@renderer/components/dialogs/complex/editor-setting/MarkdownPanel.vue'
import AdvancedPanel from '@renderer/components/dialogs/complex/editor-setting/AdvancedPanel.vue'
import {
    createDefaultEditorDialogSettings,
    type EditorDialogSettings
} from '@renderer/components/dialogs/complex/editor-setting/model'
import { useEditorSettingForm } from '@renderer/components/dialogs/complex/editor-setting/useEditorSettingForm'
// P2 功能错误处理修复：保存失败断言（全局消息对话框 + 错误文案走 i18n）
import { getConfigStore } from '@renderer/common/useConfigStore'
import { t } from '@renderer/common/i18n'

/** 全局配置 store 单例（断言保存失败的可见提示） */
const store = getConfigStore()

/** 构造草稿：默认值 + 局部覆盖（与组件默认值真源一致） */
function draft(overrides: Partial<EditorDialogSettings> = {}): EditorDialogSettings {
    return { ...createDefaultEditorDialogSettings(), ...overrides }
}

describe('BasicPanel（基础设置页签）', () => {
    it('按 props.settings 渲染，修改字段时 emit update 补丁（不改 props）', async () => {
        const panelSettings = draft({ autoSave: false, showLineNumbers: false })
        const wrapper = mount(BasicPanel, { props: { settings: panelSettings } })

        const checkboxes = wrapper.findAll('.setting-checkbox')
        expect(checkboxes).toHaveLength(4)
        expect((checkboxes[0].element as HTMLInputElement).checked).toBe(false)
        expect((checkboxes[2].element as HTMLInputElement).checked).toBe(false)
        expect((wrapper.find('input[min="10"]').element as HTMLInputElement).value).toBe('30')

        await checkboxes[1].setValue(false)
        expect(wrapper.emitted('update')).toEqual([[{ enableFolding: false }]])

        await wrapper.find('input[min="10"]').setValue('60')
        expect(wrapper.emitted('update')![1]).toEqual([{ autoSaveInterval: 60 }])

        // 子组件不直接修改 props（草稿仍为壳层传入的原对象）
        expect(panelSettings.enableFolding).toBe(true)
        expect(panelSettings.autoSaveInterval).toBe(30)
    })
})

describe('AppearancePanel（外观设置页签）', () => {
    it('光标样式下拉/宽度滑块/字号/行高均经 emit update 上报', async () => {
        const wrapper = mount(AppearancePanel, {
            props: { settings: draft({ cursorStyle: 'block', fontSize: 18, lineHeight: 1.5 }) }
        })

        const select = wrapper.find('select.setting-select')
        expect(select.findAll('option').map((option) => option.attributes('value'))).toEqual([
            'line',
            'block',
            'underline',
            'blink'
        ])
        expect((select.element as HTMLSelectElement).value).toBe('block')
        expect(
            (wrapper.find('input[type="number"][max="24"]').element as HTMLInputElement).value
        ).toBe('18')

        await select.setValue('underline')
        expect(wrapper.emitted('update')).toEqual([[{ cursorStyle: 'underline' }]])

        await wrapper.find('input[type="range"]').setValue('4')
        expect(wrapper.emitted('update')![1]).toEqual([{ cursorWidth: 4 }])

        await wrapper.find('input[type="number"][max="24"]').setValue('20')
        expect(wrapper.emitted('update')![2]).toEqual([{ fontSize: 20 }])

        await wrapper.find('input[type="number"][max="3"]').setValue('2')
        expect(wrapper.emitted('update')![3]).toEqual([{ lineHeight: 2 }])
    })
})

describe('MarkdownPanel / AdvancedPanel（无消费方字段保持禁用）', () => {
    it('Markdown 页签：3 个禁用复选框 + 1 个禁用数字输入 + 暂未实现提示', () => {
        const wrapper = mount(MarkdownPanel, { props: { settings: draft() } })
        expect(wrapper.findAll('.setting-checkbox:disabled')).toHaveLength(3)
        const numberInput = wrapper.find('input[type="number"]')
        expect(numberInput.attributes('disabled')).toBeDefined()
        expect(numberInput.attributes('title')).toContain('暂未')
        expect(wrapper.find('.panel-hint-warning').exists()).toBe(true)
        expect(wrapper.text()).toContain('暂未接入')
    })

    it('高级页签：3 个禁用输入 + 暂未实现提示', () => {
        const wrapper = mount(AdvancedPanel, { props: { settings: draft() } })
        expect(wrapper.findAll('input:disabled')).toHaveLength(3)
        expect(wrapper.find('.panel-hint-warning').exists()).toBe(true)
        expect(wrapper.text()).toContain('性能')
        expect(wrapper.text()).toContain('实验')
    })
})

describe('useEditorSettingForm（共享草稿 composable）', () => {
    let configRead: ReturnType<typeof vi.fn>
    let configWrite: ReturnType<typeof vi.fn>

    beforeEach(() => {
        configRead = vi
            .fn()
            .mockImplementation((name: string) => Promise.resolve(name === 'editor' ? null : {}))
        configWrite = vi.fn().mockResolvedValue(true)
        vi.stubGlobal('api', { config: { read: configRead, write: configWrite } })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    /** 在最小宿主组件中执行 composable（setup 同步完成，可直接持有返回值） */
    function mountForm(): ReturnType<typeof useEditorSettingForm> {
        let form!: ReturnType<typeof useEditorSettingForm>
        const Host = defineComponent({
            setup() {
                form = useEditorSettingForm()
                return () => null
            }
        })
        const wrapper = mount(Host)
        wrapper.unmount()
        return form
    }

    it('loadSettings：按字段类型守卫合并 editor 反算字段 + system 自动保存字段', async () => {
        configRead.mockImplementation((name: string) =>
            Promise.resolve(
                name === 'editor'
                    ? {
                          fontSize: 18,
                          lineHeight: 1.5,
                          showLineNumbers: false,
                          enableFolding: false,
                          enableAutoComplete: false,
                          cursorStyle: 'block',
                          cursorWidth: 3,
                          // 非 RendererEditorConfig 字段（主进程实际不会返回，防御异常数据）
                          unknownField: 'ignored'
                      }
                    : { autoSaveEnabled: false, autoSaveInterval: 120 }
            )
        )
        const form = mountForm()
        expect(form.settings.fontSize).toBe(14)

        await form.loadSettings()

        expect(configRead).toHaveBeenCalledWith('editor')
        expect(configRead).toHaveBeenCalledWith('system')
        expect(form.settings.fontSize).toBe(18)
        expect(form.settings.lineHeight).toBe(1.5)
        expect(form.settings.showLineNumbers).toBe(false)
        expect(form.settings.cursorStyle).toBe('block')
        expect(form.settings.cursorWidth).toBe(3)
        expect(form.settings.autoSave).toBe(false)
        expect(form.settings.autoSaveInterval).toBe(120)
        // 未返回字段保持默认值
        expect(form.settings.maxFileSize).toBe(10)
    })

    it('resetSettings：取消时恢复打开时加载值', async () => {
        configRead.mockImplementation((name: string) =>
            Promise.resolve(name === 'editor' ? { fontSize: 16 } : {})
        )
        const form = mountForm()
        await form.loadSettings()
        expect(form.settings.fontSize).toBe(16)

        form.settings.fontSize = 22
        form.settings.autoSave = false
        form.resetSettings()

        expect(form.settings.fontSize).toBe(16)
        expect(form.settings.autoSave).toBe(true)
    })

    it('读取失败时保持默认值并记录错误，不阻塞对话框', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        configRead.mockRejectedValue(new Error('主进程不可用'))
        const form = mountForm()

        await expect(form.loadSettings()).resolves.toBeUndefined()
        expect(errorSpy).toHaveBeenCalledWith('加载编辑器设置失败:', expect.any(Error))
        expect(form.settings.fontSize).toBe(14)
        expect(form.settings.autoSave).toBe(true)
    })

    it('saveSettings：await 写 editor 配置并返回提交快照（P2 后不再 fire-and-forget）', async () => {
        const form = mountForm()
        form.settings.fontSize = 20

        const snapshot = await form.saveSettings()

        expect(configWrite).toHaveBeenCalledTimes(1)
        expect(configWrite).toHaveBeenCalledWith('editor', snapshot)
        expect(snapshot?.fontSize).toBe(20)
        // 快照与草稿解耦：修改快照不影响草稿
        expect(snapshot).not.toBeNull()
        ;(snapshot as EditorDialogSettings).fontSize = 12
        expect(form.settings.fontSize).toBe(20)
    })

    // P2 功能错误处理修复：保存失败（主进程返回 false / invoke 异常）弹错误提示并返回 null，
    // 壳层据此保持对话框打开（修复前 fire-and-forget，失败仅写日志、用户无感知）。
    it('saveSettings：写入失败时弹错误提示并返回 null（返回 false 与异常两种形态）', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const form = mountForm()

        // 形态 1：主进程返回 false（AS-4 校验拒绝/磁盘失败，不抛异常）
        configWrite.mockResolvedValueOnce(false)
        const failedSnapshot = await form.saveSettings()
        expect(failedSnapshot).toBeNull()
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('error')
        expect(store.dialogs.messageDialog.title).toBe(
            t('dialogRenderer.editorSetting.saveFailedTitle')
        )
        expect(store.dialogs.messageDialog.message).toContain(
            t('workspace.config.writeReturnedFalse')
        )
        store.hideDialog('message')

        // 形态 2：invoke 异常（IPC 不可用）
        configWrite.mockRejectedValueOnce(new Error('写入失败'))
        const thrownSnapshot = await form.saveSettings()
        expect(thrownSnapshot).toBeNull()
        expect(errorSpy).toHaveBeenCalledWith('保存编辑器设置失败:', expect.any(Error))
        expect(store.dialogs.messageDialog.message).toContain('写入失败')
        store.hideDialog('message')
    })
})
