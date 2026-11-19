// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

import { setLocale } from '@renderer/common/i18n'
import { getConfigStore } from '@renderer/common/useConfigStore'
import EditorSettingDialog from '@renderer/components/dialogs/complex/EditorSettingDialog.vue'
import ThemeSettingDialog from '@renderer/components/dialogs/complex/ThemeSettingDialog.vue'
import SystemSettingDialog from '@renderer/components/dialogs/complex/SystemSettingDialog.vue'
import FontSelectDialog from '@renderer/components/dialogs/complex/FontSelectDialog.vue'
import MermaidEditDialog from '@renderer/components/dialogs/complex/MermaidEditDialog.vue'

const dialogMountOptions = { global: { stubs: { teleport: true } } }

describe('EditorSettingDialog', () => {
    let configWrite: ReturnType<typeof vi.fn>
    let configRead: ReturnType<typeof vi.fn>

    beforeEach(() => {
        configWrite = vi.fn().mockResolvedValue(true)
        configRead = vi
            .fn()
            .mockImplementation((name: string) => Promise.resolve(name === 'editor' ? null : {}))
        vi.stubGlobal('api', { config: { write: configWrite, read: configRead } })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('does not render the overlay when visible is false', () => {
        const wrapper = mount(EditorSettingDialog, {
            ...dialogMountOptions,
            props: { visible: false }
        })
        expect(wrapper.find('.dialog-overlay').exists()).toBe(false)
    })

    it('renders four sidebar items with the basic panel visible by default', () => {
        const wrapper = mount(EditorSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const items = wrapper.findAll('.sidebar-item')
        expect(items).toHaveLength(4)
        expect(items.map((item) => item.text())).toEqual([
            '⚙️基础设置',
            '🎨外观设置',
            '📝Markdown',
            '🔧高级设置'
        ])
        expect(items[0].classes()).toContain('active')

        const panels = wrapper.findAll('.setting-panel')
        expect(panels[0].isVisible()).toBe(true)
        expect(panels[1].isVisible()).toBe(false)
    })

    it('switches the visible panel when clicking a sidebar item', async () => {
        const wrapper = mount(EditorSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.sidebar-item')[2].trigger('click')
        const panels = wrapper.findAll('.setting-panel')
        expect(panels[2].isVisible()).toBe(true)
        expect(panels[0].isVisible()).toBe(false)
        expect(panels[2].text()).toContain('实时预览')
    })

    it('toggles a checkbox and writes the changed settings on apply', async () => {
        const wrapper = mount(EditorSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        // 基础面板复选框依次为：自动保存/代码折叠/显示行号/自动补全
        const showLineNumbers = wrapper.findAll('.setting-checkbox')[2]
        expect((showLineNumbers.element as HTMLInputElement).checked).toBe(true)
        await showLineNumbers.setValue(false)

        await wrapper.find('.btn-apply').trigger('click')
        expect(configWrite).toHaveBeenCalledWith(
            'editor',
            expect.objectContaining({ showLineNumbers: false, autoSaveInterval: 30 })
        )
        expect(wrapper.emitted('apply')).toHaveLength(1)
        expect(wrapper.emitted('apply')![0][0]).toEqual(
            expect.objectContaining({ showLineNumbers: false })
        )
    })

    it('reverts settings when clicking cancel', async () => {
        const wrapper = mount(EditorSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.setting-checkbox')[0].setValue(false)
        expect((wrapper.findAll('.setting-checkbox')[0].element as HTMLInputElement).checked).toBe(
            false
        )

        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
        expect((wrapper.findAll('.setting-checkbox')[0].element as HTMLInputElement).checked).toBe(
            true
        )
    })

    it('applies and closes when clicking confirm', async () => {
        const wrapper = mount(EditorSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-confirm').trigger('click')
        expect(configWrite).toHaveBeenCalledWith(
            'editor',
            expect.objectContaining({ autoSave: true })
        )
        expect(wrapper.emitted('apply')).toHaveLength(1)
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('emits close when clicking the title bar close button', async () => {
        const wrapper = mount(EditorSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.close-btn').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    // P1-FE-05：打开时从主进程回填真实生效值（config:read('editor') 已路由到
    // Monaco 同源 editorSetting 的反算结果；自动保存字段来自 system 配置）
    it('loads persisted values from the main process when opened', async () => {
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
                          cursorWidth: 3
                      }
                    : { autoSaveEnabled: false, autoSaveInterval: 120 }
            )
        )
        const wrapper = mount(EditorSettingDialog, {
            ...dialogMountOptions,
            props: { visible: false }
        })
        await wrapper.setProps({ visible: true })
        await flushPromises()

        const checkboxes = wrapper.findAll('.setting-checkbox')
        expect((checkboxes[0].element as HTMLInputElement).checked).toBe(false) // autoSave
        expect((checkboxes[1].element as HTMLInputElement).checked).toBe(false) // enableFolding
        expect((checkboxes[2].element as HTMLInputElement).checked).toBe(false) // showLineNumbers
        expect((checkboxes[3].element as HTMLInputElement).checked).toBe(false) // enableAutoComplete
        // 外观面板的字体大小（首个 number 输入是基础面板的自动保存间隔）
        expect(
            (wrapper.find('input[type="number"][max="24"]').element as HTMLInputElement).value
        ).toBe('18')
        expect(configRead).toHaveBeenCalledWith('editor')
        expect(configRead).toHaveBeenCalledWith('system')
    })

    // P1-FE-05：无 Monaco 消费方的遗留字段在 UI 上禁用并标注「暂未实现」，避免假开关
    it('disables legacy options without main-process consumers', async () => {
        const wrapper = mount(EditorSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        // Markdown 面板：实时预览/预览延迟/代码高亮/链接高亮
        await wrapper.findAll('.sidebar-item')[2].trigger('click')
        const markdownPanel = wrapper.findAll('.setting-panel')[2]
        const markdownCheckboxes = markdownPanel.findAll('.setting-checkbox:disabled')
        expect(markdownCheckboxes).toHaveLength(3)
        expect(markdownCheckboxes[0].attributes('title')).toContain('暂未')
        expect(markdownPanel.find('input[type="number"]').attributes('disabled')).toBeDefined()
        expect(markdownPanel.find('.panel-hint-warning').exists()).toBe(true)

        // 高级面板：最大文件大小/渲染延迟/实验特性
        await wrapper.findAll('.sidebar-item')[3].trigger('click')
        const advancedPanel = wrapper.findAll('.setting-panel')[3]
        expect(advancedPanel.findAll('input:disabled')).toHaveLength(3)
        expect(advancedPanel.find('.panel-hint-warning').exists()).toBe(true)
    })
})

describe('ThemeSettingDialog', () => {
    let invoke: ReturnType<typeof vi.fn>
    let configRead: ReturnType<typeof vi.fn>

    beforeEach(() => {
        // 按类型返回主题列表（浅色/深色/护眼各一条）
        invoke = vi.fn().mockImplementation((channel: string) => {
            if (channel === 'baize:theme:get-all') {
                return Promise.resolve([
                    {
                        type: 'baize',
                        styles: {
                            name: '白泽',
                            description: '默认浅色主题',
                            backgroundColor: '#ffffff',
                            accentColor: '#00b0ff',
                            textColor: '#333333'
                        }
                    },
                    {
                        type: 'dark',
                        styles: {
                            name: '深色',
                            description: '深色主题',
                            backgroundColor: '#1e1e1e',
                            accentColor: '#007acc',
                            textColor: '#d4d4d4'
                        }
                    },
                    {
                        type: 'eyecare-green',
                        styles: {
                            name: '护眼绿',
                            description: '护眼主题',
                            backgroundColor: '#cce8cf',
                            accentColor: '#2e8b57',
                            textColor: '#333333'
                        }
                    }
                ])
            }
            if (channel === 'baize:theme:get-all-monaco') {
                return Promise.resolve([
                    {
                        type: 'vs',
                        config: {
                            name: 'Light (Visual Studio)',
                            backgroundColor: '#ffffff',
                            foregroundColor: '#333333',
                            isDark: false
                        }
                    },
                    {
                        type: 'vs-dark',
                        config: {
                            name: 'Dark (Visual Studio)',
                            backgroundColor: '#1e1e1e',
                            foregroundColor: '#d4d4d4',
                            isDark: true
                        }
                    }
                ])
            }
            return Promise.resolve(null)
        })
        configRead = vi.fn().mockResolvedValue({
            currentTheme: 'baize',
            separateEditorTheme: false,
            editorTheme: 'vs'
        })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
        vi.stubGlobal('api', { config: { read: configRead } })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    async function mountVisible() {
        const wrapper = mount(ThemeSettingDialog, {
            ...dialogMountOptions,
            props: { visible: false }
        })
        // 变为可见时 watch 触发 loadThemes
        await wrapper.setProps({ visible: true })
        await flushPromises()
        return wrapper
    }

    it('loads and groups themes into three categories', async () => {
        const wrapper = await mountVisible()
        const titles = wrapper.findAll('.category-title')
        expect(titles).toHaveLength(3)
        expect(titles.map((title) => title.text())).toEqual(['浅色主题', '深色主题', '护眼主题'])
        expect(wrapper.findAll('.theme-card')).toHaveLength(3)
        expect(invoke).toHaveBeenCalledWith('baize:theme:get-all')
        expect(invoke).toHaveBeenCalledWith('baize:theme:get-all-monaco')
    })

    it('marks the current app theme as selected', async () => {
        const wrapper = await mountVisible()
        const cards = wrapper.findAll('.theme-card')
        expect(cards[0].classes()).toContain('selected')
        expect(cards[0].text()).toContain('白泽')
    })

    it('emits change when selecting an app theme', async () => {
        const wrapper = await mountVisible()
        const darkCard = wrapper
            .findAll('.theme-card')
            .find((card) => card.text().includes('深色'))!
        await darkCard.trigger('click')
        expect(darkCard.classes()).toContain('selected')
        expect(wrapper.emitted('change')).toHaveLength(1)
        expect(wrapper.emitted('change')![0]).toEqual(['dark', 'vs', false])
    })

    it('renders monaco themes and selects one (P2：update-monaco 死通道发送点已删除)', async () => {
        const wrapper = await mountVisible()
        // 切换到编辑器主题面板
        await wrapper
            .findAll('.sidebar-item')
            .find((item) => item.text().includes('编辑器主题'))!
            .trigger('click')

        const cards = wrapper.findAll('.monaco-theme-list .theme-card')
        expect(cards).toHaveLength(2)
        expect(cards[0].classes()).toContain('selected')
        expect(cards[0].text()).toContain('Light (Visual Studio)')

        // 选中编辑器主题仅更新本地状态（实际应用走 apply/confirm → @change 链路）；
        // 原"立即应用"发送的 IPC.THEME.UPDATE_MONACO_THEME 主进程零监听，已删除。
        await cards[1].trigger('click')
        expect(cards[1].classes()).toContain('selected')
        expect(wrapper.find('.monaco-theme-list .theme-card.selected').text()).toContain('Dark')
    })

    it('shows font settings with editable selects', async () => {
        const wrapper = await mountVisible()
        await wrapper
            .findAll('.sidebar-item')
            .find((item) => item.text().includes('字体设置'))!
            .trigger('click')

        const selects = wrapper.findAll('.setting-select')
        expect(selects).toHaveLength(2)
        expect(selects[0].findAll('option')).toHaveLength(8)
        expect(selects[1].findAll('option')).toHaveLength(8)

        await selects[0].setValue('Fira Code')
        expect((selects[0].element as HTMLSelectElement).value).toBe('Fira Code')
    })

    it('emits change with the current values when applying', async () => {
        const wrapper = await mountVisible()
        await wrapper.find('.btn-apply').trigger('click')
        expect(wrapper.emitted('change')![0]).toEqual(['baize', 'vs', false])
    })

    it('restores the initial theme when cancelling', async () => {
        const wrapper = await mountVisible()
        const darkCard = wrapper
            .findAll('.theme-card')
            .find((card) => card.text().includes('深色'))!
        await darkCard.trigger('click')

        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
        // 取消后再次应用应回到初始主题
        await wrapper.find('.btn-apply').trigger('click')
        expect(wrapper.emitted('change')![1]).toEqual(['baize', 'vs', false])
    })

    it('renders eight resize handles', async () => {
        const wrapper = await mountVisible()
        expect(wrapper.findAll('.resize-handle')).toHaveLength(8)
    })
})

describe('SystemSettingDialog', () => {
    let configWrite: ReturnType<typeof vi.fn>
    let configRead: ReturnType<typeof vi.fn>
    let send: ReturnType<typeof vi.fn>
    let invoke: ReturnType<typeof vi.fn>

    beforeEach(() => {
        configWrite = vi.fn().mockResolvedValue(true)
        configRead = vi
            .fn()
            .mockImplementation((name: string) =>
                Promise.resolve(name === 'backup' ? { backups: [], latest: null } : {})
            )
        send = vi.fn()
        invoke = vi.fn().mockResolvedValue({ ok: true })
        vi.stubGlobal('api', { config: { write: configWrite, read: configRead } })
        vi.stubGlobal('electron', { ipcRenderer: { send, invoke } })
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('renders four sidebar items with the general panel visible', () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const items = wrapper.findAll('.sidebar-item')
        expect(items).toHaveLength(4)
        expect(items.map((item) => item.text())).toEqual([
            '⚙️通用设置',
            '📁文件设置',
            '🎨外观设置',
            '💾备份与恢复'
        ])
        expect(wrapper.findAll('.setting-panel')[0].isVisible()).toBe(true)
        expect(wrapper.findAll('.setting-panel')[1].isVisible()).toBe(false)
    })

    // P0-B 回归：主进程该通道用 ipcMain.handle 注册，渲染层必须 invoke；
    // 原实现 send 与 handle 模式不匹配导致自动保存开关静默失效。
    it('invokes the main process when the auto save checkbox changes', async () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        // 切到文件设置面板后，取其面板内第一个复选框（启用自动保存）
        await wrapper.findAll('.sidebar-item')[1].trigger('click')
        const filePanel = wrapper.findAll('.setting-panel')[1]
        const autoSave = filePanel.findAll('.setting-checkbox')[0]
        expect((autoSave.element as HTMLInputElement).checked).toBe(true)
        await autoSave.setValue(false)
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith('baize:setting:auto-save-changed', {
            autoSaveEnabled: false,
            // 2026-11-19：默认值统一到 SYSTEM_SETTING_FALLBACK（主进程真源 60 秒，
            // 此前对话框本地 fallback 为 30 与主进程矛盾）
            autoSaveInterval: 60
        })
        // 防回归：不得再退回单向 send（send 无法触达 ipcMain.handle）
        expect(send).not.toHaveBeenCalled()
    })

    it('logs an error instead of throwing when the auto save invoke fails', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockRejectedValueOnce(new Error('主进程不可用'))
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.sidebar-item')[1].trigger('click')
        const filePanel = wrapper.findAll('.setting-panel')[1]
        await filePanel.findAll('.setting-checkbox')[0].setValue(false)
        await flushPromises()

        expect(errorSpy).toHaveBeenCalledWith('同步自动保存设置失败:', expect.any(Error))
        // 失败后组件不抛出、不卸载，开关仍保持用户操作后的状态
        expect(
            (filePanel.findAll('.setting-checkbox')[0].element as HTMLInputElement).checked
        ).toBe(false)
    })

    it('hides the auto save interval row when auto save is disabled', async () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.sidebar-item')[1].trigger('click')
        const filePanel = wrapper.findAll('.setting-panel')[1]
        expect(filePanel.text()).toContain('自动保存间隔')

        await filePanel.findAll('.setting-checkbox')[0].setValue(false)
        // 间隔设置行使用 v-if，取消勾选后从 DOM 中移除
        expect(filePanel.text()).not.toContain('自动保存间隔（秒）')
        expect(filePanel.find('input[min="10"]').exists()).toBe(false)
    })

    // P1-FE-06：无消费方的启动/窗口项已禁用，仍随「应用」写入 system 配置（不再可被用户误改）
    it('writes the system config and emits apply', async () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        // 通用面板第 1 个复选框（启动时自动打开上次文件）已禁用，改用可用的语言下拉框验证写入
        await wrapper.findAll('.setting-panel')[0].find('select.setting-select').setValue('en-US')
        await wrapper.find('.btn-apply').trigger('click')

        expect(configWrite).toHaveBeenCalledWith(
            'system',
            expect.objectContaining({ language: 'en-US', autoStart: false })
        )
        expect(wrapper.emitted('apply')![0][0]).toEqual(
            expect.objectContaining({ language: 'en-US' })
        )
    })

    it('reverts settings and closes when clicking cancel', async () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const languageSelect = wrapper.findAll('.setting-panel')[0].find('select.setting-select')
        await languageSelect.setValue('en-US')
        await wrapper.find('.btn-cancel').trigger('click')

        expect(wrapper.emitted('close')).toHaveLength(1)
        expect((languageSelect.element as HTMLSelectElement).value).toBe('zh-CN')
    })

    it('applies and closes when clicking confirm', async () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-confirm').trigger('click')
        expect(configWrite).toHaveBeenCalledWith(
            'system',
            expect.objectContaining({ appTheme: 'baize' })
        )
        expect(wrapper.emitted('apply')).toHaveLength(1)
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('renders backup actions in the backup panel', async () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.sidebar-item')[3].trigger('click')
        expect(wrapper.findAll('.setting-panel')[3].isVisible()).toBe(true)
        const actions = wrapper.findAll('.action-btn')
        expect(actions).toHaveLength(2)
        expect(actions.map((btn) => btn.text())).toEqual(['立即备份', '从备份恢复'])
    })

    it('renders the language selector in the general panel with zh-CN selected', () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const generalPanel = wrapper.findAll('.setting-panel')[0]
        // 通用设置面板内仅语言选择一个下拉框
        const select = generalPanel.find('select.setting-select')
        expect(select.exists()).toBe(true)
        expect(select.findAll('option').map((option) => option.attributes('value'))).toEqual([
            'zh-CN',
            'en-US'
        ])
        expect((select.element as HTMLSelectElement).value).toBe('zh-CN')
        expect(generalPanel.text()).toContain('界面语言')
    })

    it('writes the selected language together with the system config', async () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const generalPanel = wrapper.findAll('.setting-panel')[0]
        await generalPanel.find('select.setting-select').setValue('en-US')
        await wrapper.find('.btn-apply').trigger('click')
        expect(configWrite).toHaveBeenCalledWith(
            'system',
            expect.objectContaining({ language: 'en-US' })
        )
    })

    // 批次 A/B/C：启动恢复/开机自启动/窗口记忆/最近列表数量/托盘/跟随系统主题/
    // 自动备份已全部实现；应用主题收口为只读显示 + 「打开主题设置」按钮，
    // 不再存在「暂未实现」禁用项
    it('enables every setting after batches A/B/C', async () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        // 通用面板复选框顺序：自动打开上次文件 / 自动打开上次目录 / 开机自启动 /
        // 最小化到托盘 / 记住窗口位置和大小 / 允许加载远程图片
        const generalCheckboxes = wrapper.findAll('.setting-panel')[0].findAll('.setting-checkbox')
        expect(generalCheckboxes).toHaveLength(6)

        // 批次 A + B 已实现：全部 5 项窗口/启动复选框可用（开机自启动带「安装后生效」提示）
        for (const index of [0, 1, 2, 3, 4]) {
            expect(generalCheckboxes[index].attributes('disabled')).toBeUndefined()
        }
        expect(generalCheckboxes[2].attributes('title')).toContain('安装应用后生效')
        expect(generalCheckboxes[0].attributes('title')).toBeUndefined()
        // 批次 B #4：最小化到托盘已实现，不再带「暂未实现」tooltip
        expect(generalCheckboxes[3].attributes('title')).toBeUndefined()
        expect(generalCheckboxes[4].attributes('title')).toBeUndefined()

        const remoteImageCheckbox = generalCheckboxes[5]
        expect(remoteImageCheckbox.attributes('disabled')).toBeUndefined()
        expect((remoteImageCheckbox.element as HTMLInputElement).checked).toBe(false)

        // 文件面板：最近文件数量已实现（不再禁用，带范围提示 tooltip）；自动保存仍可用
        await wrapper.findAll('.sidebar-item')[1].trigger('click')
        const filePanel = wrapper.findAll('.setting-panel')[1]
        expect(filePanel.findAll('.setting-checkbox')).toHaveLength(1)
        expect(filePanel.findAll('input[type="number"]:disabled')).toHaveLength(0)
        const recentCountInput = filePanel.find('input[min="5"]')
        expect(recentCountInput.exists()).toBe(true)
        expect(recentCountInput.attributes('disabled')).toBeUndefined()
        expect(recentCountInput.attributes('title')).toContain('最近')

        // 外观面板（批次 C #10）：应用主题下拉已替换为只读显示名 + 「打开主题设置」
        // 按钮（无禁用下拉）；「使用系统主题」已实现（批次 B #7，带互斥说明 tooltip）
        await wrapper.findAll('.sidebar-item')[2].trigger('click')
        const appearancePanel = wrapper.findAll('.setting-panel')[2]
        const selects = appearancePanel.findAll('select.setting-select')
        expect(selects).toHaveLength(1)
        expect(selects[0].attributes('disabled')).toBeUndefined()
        expect(appearancePanel.find('.theme-current-name').exists()).toBe(true)
        const themeButtons = appearancePanel.findAll('.browse-btn')
        expect(themeButtons).toHaveLength(1)
        expect(themeButtons[0].text()).toContain('打开主题设置')
        const useSystemThemeCheckbox = appearancePanel.find('.setting-checkbox')
        expect(useSystemThemeCheckbox.attributes('disabled')).toBeUndefined()
        expect(useSystemThemeCheckbox.attributes('title')).toContain('跟随系统')
        expect(appearancePanel.find('input[type="number"]').attributes('disabled')).toBeUndefined()

        // 备份面板（批次 C #8/#9）：自动备份/间隔已启用（不再禁用），保留数量仍可用
        await wrapper.findAll('.sidebar-item')[3].trigger('click')
        const backupPanel = wrapper.findAll('.setting-panel')[3]
        expect(backupPanel.findAll('.setting-checkbox:disabled')).toHaveLength(0)
        expect(backupPanel.findAll('input[type="number"]:disabled')).toHaveLength(0)
        expect(backupPanel.findAll('input[type="number"]')).toHaveLength(2)
        expect(backupPanel.find('input[min="1"]').attributes('title')).toContain('间隔')
    })

    // 批次 C #10：应用主题收口（方案 A）——只读显示当前主题名（config:read('theme')
    // + 既有 GET_ALL_THEMES 通道映射显示名），「打开主题设置」复用菜单动作同款调用链
    // （configStore.showDialog('themeSettings')）并先关闭本对话框，不新增 IPC
    it('renders the current theme name read-only and opens the theme settings dialog', async () => {
        configRead.mockImplementation((name: string) =>
            Promise.resolve(
                name === 'backup'
                    ? { backups: [], latest: null }
                    : name === 'theme'
                      ? { currentTheme: 'dark' }
                      : {}
            )
        )
        invoke.mockImplementation((channel: string) =>
            Promise.resolve(
                channel === 'baize:theme:get-all'
                    ? [{ type: 'dark', styles: { name: '深邃夜空' } }]
                    : { ok: true }
            )
        )
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: false }
        })
        await wrapper.setProps({ visible: true })
        await flushPromises()
        await wrapper.findAll('.sidebar-item')[2].trigger('click')

        const appearancePanel = wrapper.findAll('.setting-panel')[2]
        expect(appearancePanel.find('.theme-current-name').text()).toBe('深邃夜空')

        await appearancePanel.find('.browse-btn').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
        expect(getConfigStore().dialogs.themeSettings.visible).toBe(true)
        // 清理：重置主题设置对话框状态，避免污染后续用例
        getConfigStore().hideDialog('themeSettings')
    })

    // 批次 C #8/#9：自动备份组已实现——「暂未实现」提示替换为行为说明，
    // 启用开关与间隔输入可编辑（保留数量原有可编辑行为不变）；
    // P2-11：启用开关默认关闭（opt-in），配置未返回该字段时回退默认 false
    it('renders the auto backup group hint and editable inputs', async () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.sidebar-item')[3].trigger('click')
        const backupPanel = wrapper.findAll('.setting-panel')[3]
        expect(backupPanel.text()).toContain('按设定间隔')

        const enableCheckbox = backupPanel.find('.setting-checkbox')
        // P2-11：默认关闭（opt-in）
        expect((enableCheckbox.element as HTMLInputElement).checked).toBe(false)
        await enableCheckbox.setValue(true)
        expect((enableCheckbox.element as HTMLInputElement).checked).toBe(true)
        await enableCheckbox.setValue(false)
        expect((enableCheckbox.element as HTMLInputElement).checked).toBe(false)
        expect(backupPanel.text()).not.toContain('暂无对应功能实现')
    })

    // P1-FE-06：「浏览」默认路径经 IPC.FILE.SELECT_DIRECTORY 实现（原 void 0 空实现）
    it('browses the default path through the directory selector', async () => {
        invoke.mockResolvedValueOnce('D:\\notes')
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.sidebar-item')[1].trigger('click')
        await wrapper.find('.browse-btn').trigger('click')
        await flushPromises()

        expect(invoke).toHaveBeenCalledWith('baize:file:select-directory')
        expect((wrapper.find('.path-input-group input').element as HTMLInputElement).value).toBe(
            'D:\\notes'
        )
    })

    // P1-FE-06：「立即备份」经 config:write('backup') 触发主进程配置目录拷贝
    it('creates a config backup and reports the result', async () => {
        configRead.mockImplementation((name: string) =>
            Promise.resolve(
                name === 'backup'
                    ? {
                          backups: [{ name: 'config-backup-20260101-120000', fileCount: 3 }],
                          latest: 'config-backup-20260101-120000'
                      }
                    : {}
            )
        )
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.sidebar-item')[3].trigger('click')
        await wrapper.findAll('.action-btn')[0].trigger('click')
        await flushPromises()

        expect(configWrite).toHaveBeenCalledWith('backup', { action: 'create', keep: 5 })
        const status = wrapper.find('.backup-status').text()
        expect(status).toContain('config-backup-20260101-120000')
        expect(status).toContain('3')
    })

    // P1-FE-06：「从备份恢复」无备份时明确提示，不静默失败
    it('reports when there is no backup to restore', async () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.sidebar-item')[3].trigger('click')
        await wrapper.findAll('.action-btn')[1].trigger('click')
        await flushPromises()

        expect(wrapper.find('.backup-status').text()).toContain('暂无可恢复的备份')
        expect(configWrite).not.toHaveBeenCalledWith('backup', expect.anything())
    })

    // P1-FE-06：「从备份恢复」恢复最近一次备份并经 config:write('backup') 触发
    it('restores the latest config backup', async () => {
        configRead.mockImplementation((name: string) =>
            Promise.resolve(
                name === 'backup'
                    ? {
                          backups: [{ name: 'config-backup-20260101-120000', fileCount: 3 }],
                          latest: 'config-backup-20260101-120000'
                      }
                    : {}
            )
        )
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.sidebar-item')[3].trigger('click')
        await wrapper.findAll('.action-btn')[1].trigger('click')
        await flushPromises()

        expect(configWrite).toHaveBeenCalledWith('backup', {
            action: 'restore',
            name: 'config-backup-20260101-120000'
        })
        expect(wrapper.find('.backup-status').text()).toContain('已从备份')
    })

    // AS-9（P3 隐私）：远程图片隐私开关——通用面板可编辑、默认关闭、随「应用」写入 system 配置
    it('renders the remote image privacy switch off by default and writes it on apply (AS-9)', async () => {
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const generalPanel = wrapper.findAll('.setting-panel')[0]
        expect(generalPanel.text()).toContain('允许加载远程图片')
        expect(generalPanel.text()).toContain('隐私')

        const privacyCheckbox = generalPanel.findAll('.setting-checkbox')[5]
        expect((privacyCheckbox.element as HTMLInputElement).checked).toBe(false)

        await privacyCheckbox.setValue(true)
        await wrapper.find('.btn-apply').trigger('click')

        expect(configWrite).toHaveBeenCalledWith(
            'system',
            expect.objectContaining({ allowRemoteImages: true })
        )
        expect(wrapper.emitted('apply')![0][0]).toEqual(
            expect.objectContaining({ allowRemoteImages: true })
        )
    })

    it('loads the stored allowRemoteImages value when opening (AS-9)', async () => {
        configRead.mockImplementation((name: string) =>
            Promise.resolve(
                name === 'backup' ? { backups: [], latest: null } : { allowRemoteImages: true }
            )
        )
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: false }
        })
        await wrapper.setProps({ visible: true })
        await flushPromises()

        const generalPanel = wrapper.findAll('.setting-panel')[0]
        expect(
            (generalPanel.findAll('.setting-checkbox')[5].element as HTMLInputElement).checked
        ).toBe(true)
    })
})

describe('SystemSettingDialog i18n', () => {
    beforeEach(() => {
        vi.stubGlobal('api', { config: { write: vi.fn(), read: vi.fn().mockResolvedValue({}) } })
        vi.stubGlobal('electron', { ipcRenderer: { send: vi.fn() } })
    })

    afterEach(() => {
        // 恢复默认语言，避免影响后续用例
        setLocale('zh-CN')
        vi.restoreAllMocks()
    })

    it('renders English copy after switching the locale', async () => {
        setLocale('en-US')
        const wrapper = mount(SystemSettingDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await flushPromises()
        expect(wrapper.find('.title-text').text()).toBe('System settings')
        expect(wrapper.findAll('.sidebar-item').map((item) => item.text())).toEqual([
            '⚙️General',
            '📁Files',
            '🎨Appearance',
            '💾Backup & restore'
        ])
        expect(wrapper.findAll('.setting-panel')[0].text()).toContain('Interface language')
        // AS-9：隐私开关文案同步英文
        expect(wrapper.findAll('.setting-panel')[0].text()).toContain('Allow loading remote images')
        // 批次 C：主题按钮与自动备份组说明同步英文
        await wrapper.findAll('.sidebar-item')[2].trigger('click')
        expect(wrapper.findAll('.setting-panel')[2].text()).toContain('Open theme settings')
        await wrapper.findAll('.sidebar-item')[3].trigger('click')
        expect(wrapper.findAll('.setting-panel')[3].text()).toContain('Enable auto backup')
        expect(
            wrapper.findAll('.setting-panel')[3].find('input[min="1"]').attributes('title')
        ).toContain('1~72 hours')
        wrapper.unmount()
    })
})

describe('FontSelectDialog', () => {
    it('renders the font selects and style buttons', () => {
        const wrapper = mount(FontSelectDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const selects = wrapper.findAll('.select-style')
        expect(selects).toHaveLength(3)
        // 字体列表（含重复的 Courier New）共 18 项，字号 5pt-40pt 共 36 项
        expect(selects[0].findAll('option')).toHaveLength(18)
        expect(selects[1].findAll('option')).toHaveLength(36)
        expect(wrapper.findAll('.font-style-btn')).toHaveLength(4)
    })

    it('toggles the bold style button state', async () => {
        const wrapper = mount(FontSelectDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        const boldBtn = wrapper.findAll('.font-style-btn')[0]
        expect(boldBtn.classes()).not.toContain('active')
        await boldBtn.trigger('click')
        expect(boldBtn.classes()).toContain('active')
        await boldBtn.trigger('click')
        expect(boldBtn.classes()).not.toContain('active')
    })

    it('updates the preview style from the selected color', async () => {
        const wrapper = mount(FontSelectDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        // 第一个调色板是字体颜色，commonColors 第 3 项为 #FF0000
        await wrapper.findAll('.color-btn')[2].trigger('click')
        const style = wrapper.find('.preview-area').attributes('style')
        expect(style).toContain('color: rgb(255, 0, 0)')
    })

    it('emits html with the font settings when clicking insert (and stays open)', async () => {
        const wrapper = mount(FontSelectDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.text-input-area').setValue('你好世界')
        await wrapper.findAll('.font-style-btn')[0].trigger('click') // 加粗
        await wrapper.find('.btn-insert').trigger('click')

        const html = wrapper.emitted('apply')![0][0] as string
        expect(html).toContain('<b>')
        expect(html).toContain('你好世界')
        expect(html).toContain('font-size: 15pt;')
        expect(html).toContain("font-family: 'Arial';")
        expect(html).toContain('text-align: left;')
        // 「插入」只插入不关闭，便于继续调整/多次插入
        expect(wrapper.emitted('close')).toBeUndefined()
    })

    it('closes without inserting when clicking confirm', async () => {
        const wrapper = mount(FontSelectDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.text-input-area').setValue('确认文字')
        await wrapper.find('.btn-confirm').trigger('click')
        // 「确定」只关闭窗口，不触发插入（插入由「插入」按钮负责）
        expect(wrapper.emitted('apply')).toBeUndefined()
        expect(wrapper.emitted('close')).toHaveLength(1)
    })

    it('shows the placeholder text in the preview when the input is empty', () => {
        const wrapper = mount(FontSelectDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        expect(wrapper.find('.preview-area span').text()).toBe('这是一段预览文字。')
    })

    it('emits close when clicking cancel', async () => {
        const wrapper = mount(FontSelectDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})

describe('MermaidEditDialog', () => {
    it('renders the initial mermaid code and the placeholder preview', () => {
        const wrapper = mount(MermaidEditDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        expect(
            (wrapper.find('textarea.code-editor').element as HTMLTextAreaElement).value
        ).toContain('graph TD')
        expect(wrapper.find('.preview-area .placeholder').text()).toBe('预览区域')
    })

    it('updates the preview while typing', async () => {
        const wrapper = mount(MermaidEditDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('textarea.code-editor').setValue('graph TD;A-->B')
        expect(wrapper.find('.preview-area .mermaid').exists()).toBe(true)
        expect(wrapper.find('.preview-area .mermaid').text()).toBe('graph TD;A-->B')
    })

    it('formats the code into a mermaid code block', async () => {
        const wrapper = mount(MermaidEditDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.tool-btn').trigger('click')
        const value = (wrapper.find('textarea.code-editor').element as HTMLTextAreaElement).value
        expect(value.startsWith('```mermaid\n')).toBe(true)
        expect(value.endsWith('\n```\n')).toBe(true)
        expect(value).toContain('    graph TD')
    })

    it('clears the code and resets the preview', async () => {
        const wrapper = mount(MermaidEditDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.findAll('.tool-btn')[1].trigger('click')
        expect((wrapper.find('textarea.code-editor').element as HTMLTextAreaElement).value).toBe('')
        expect(wrapper.find('.preview-area .placeholder').text()).toBe('预览区域')
    })

    it('emits the current code when inserting', async () => {
        const wrapper = mount(MermaidEditDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('textarea.code-editor').setValue('sequenceDiagram')
        await wrapper.find('.btn-primary').trigger('click')
        expect(wrapper.emitted('insert')).toHaveLength(1)
        expect(wrapper.emitted('insert')![0][0]).toBe('sequenceDiagram')
    })

    it('emits close when clicking cancel', async () => {
        const wrapper = mount(MermaidEditDialog, {
            ...dialogMountOptions,
            props: { visible: true }
        })
        await wrapper.find('.btn-cancel').trigger('click')
        expect(wrapper.emitted('close')).toHaveLength(1)
    })
})
