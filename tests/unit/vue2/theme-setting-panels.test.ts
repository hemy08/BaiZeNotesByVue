// @vitest-environment jsdom
/**
 * 设置对话框二期拆分 —— ThemeSettingDialog 子组件 + composable 契约单测
 *
 * 覆盖点：
 * 1. ThemePreviewCard：纯展示卡片（名称/描述/选中态/3 条预览线/色块 tooltip）与 select 事件；
 * 2. AppThemePanel / EditorThemePanel：按分组/视图项渲染，点选 emit 主题 type；
 * 3. FontSettingsPanel：字体下拉/字号经 emit('update', 补丁) 上报（v-model.number 语义）；
 * 4. useThemeSettingForm：
 *    - loadThemes：GET_ALL_THEMES 按 shared THEME_GROUPS 分组、GET_ALL_MONACO_THEMES 映射预览配色、
 *      config:read('theme') 回填当前主题并记录初始值；
 *    - resetSettings：取消时恢复主题选择（字体草稿不恢复，与拆分前一致）；
 *    - 读取失败只记日志、保持默认值。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { defineComponent } from 'vue'

import ThemePreviewCard from '@renderer/components/dialogs/complex/theme-setting/ThemePreviewCard.vue'
import AppThemePanel from '@renderer/components/dialogs/complex/theme-setting/AppThemePanel.vue'
import EditorThemePanel from '@renderer/components/dialogs/complex/theme-setting/EditorThemePanel.vue'
import FontSettingsPanel from '@renderer/components/dialogs/complex/theme-setting/FontSettingsPanel.vue'
import { useThemeSettingForm } from '@renderer/components/dialogs/complex/theme-setting/useThemeSettingForm'
import {
    createDefaultThemeFontSettings,
    type MonacoThemeViewItem,
    type ThemeCategory
} from '@renderer/components/dialogs/complex/theme-setting/model'
import { THEME_GROUPS } from '../../../src/shared/constants/theme'
import { IPC } from '../../../src/shared/ipc-channels'
import type {
    MonacoThemeListItem,
    ThemeListItem,
    ThemeStyles,
    ThemeType
} from '../../../src/shared/types'
import { t } from '@renderer/common/i18n'

/** 构造完整的 shared ThemeStyles（ThemeListItem.styles 为必填全字段，不允许 partial） */
function makeThemeStyles(overrides: Partial<ThemeStyles> = {}): ThemeStyles {
    return {
        name: '测试主题',
        description: '测试主题描述',
        titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        backgroundColor: '#ffffff',
        cardBackground: '#f5f5f5',
        textColor: '#333333',
        secondaryTextColor: '#666666',
        borderColor: '#dddddd',
        accentColor: '#00b0ff',
        buttonBackground: '#00b0ff',
        buttonTextColor: '#ffffff',
        hoverBackground: '#f0f0f0',
        ...overrides
    }
}

/** 构造应用主题列表项（主进程 IPC 返回形状） */
function makeTheme(type: ThemeType, overrides: Partial<ThemeStyles> = {}): ThemeListItem {
    return { type, styles: makeThemeStyles({ name: type, ...overrides }) }
}

/** 构造 Monaco 主题列表项（主进程 IPC 返回形状） */
function makeMonacoTheme(type: string, config: MonacoThemeListItem['config']): MonacoThemeListItem {
    return { type, config }
}

const SAMPLE_CATEGORY: ThemeCategory[] = [
    {
        nameKey: 'dialogRenderer.themeSetting.categoryLight',
        themes: [
            makeTheme('baize', {
                name: '白泽',
                description: '默认浅色主题',
                backgroundColor: '#ffffff',
                accentColor: '#00b0ff',
                textColor: '#333333'
            })
        ]
    }
]

const SAMPLE_MONACO: MonacoThemeViewItem[] = [
    {
        type: 'vs-dark',
        name: 'Dark (Visual Studio)',
        config: makeMonacoTheme('vs-dark', {
            name: 'Dark (Visual Studio)',
            description: '深色编辑器主题',
            isDark: true
        }).config,
        colors: { bg: '#1e1e1e', text: '#d4d4d4', accent: '#007acc' }
    }
]

describe('ThemePreviewCard（主题预览卡片）', () => {
    it('按 props 渲染名称/描述/选中态/3 条预览线/3 个色块，点击只 emit select', async () => {
        const wrapper = mount(ThemePreviewCard, {
            props: {
                selected: true,
                previewStyle: { background: '#fff' },
                titleBarStyle: { background: 'linear-gradient(90deg, #000, #fff)' },
                sidebarStyle: { background: '#f5f5f5' },
                lines: [
                    { background: '#333', opacity: 0.8 },
                    { background: '#333', opacity: 0.5, width: '70%' },
                    { background: '#00b0ff', opacity: 0.6, width: '50%' }
                ],
                name: '白泽',
                description: '默认浅色主题',
                colorDots: [
                    {
                        style: { background: '#fff' },
                        title: t('dialogRenderer.themeSetting.colorBackground')
                    },
                    {
                        style: { background: '#00b0ff' },
                        title: t('dialogRenderer.themeSetting.colorAccent')
                    },
                    {
                        style: { background: '#333' },
                        title: t('dialogRenderer.themeSetting.colorText')
                    }
                ]
            }
        })

        expect(wrapper.classes()).toContain('theme-card')
        expect(wrapper.classes()).toContain('selected')
        expect(wrapper.find('.theme-name').text()).toBe('白泽')
        expect(wrapper.find('.theme-desc').text()).toBe('默认浅色主题')
        expect(wrapper.findAll('.preview-line')).toHaveLength(3)
        const dots = wrapper.findAll('.color-dot')
        expect(dots).toHaveLength(3)
        expect(dots[0].attributes('title')).toBe(t('dialogRenderer.themeSetting.colorBackground'))
        expect(
            (wrapper.find('.theme-preview').element as HTMLElement).style.background
        ).toBeTruthy()

        await wrapper.trigger('click')
        expect(wrapper.emitted('select')).toHaveLength(1)
    })
})

describe('AppThemePanel / EditorThemePanel（主题页签）', () => {
    it('应用主题页签按分组渲染，点选 emit 主题 type', async () => {
        const wrapper = mount(AppThemePanel, {
            props: { categories: SAMPLE_CATEGORY, currentTheme: 'baize' }
        })
        expect(wrapper.findAll('.category-title').map((item) => item.text())).toEqual([
            t('dialogRenderer.themeSetting.categoryLight')
        ])
        const cards = wrapper.findAll('.theme-card')
        expect(cards).toHaveLength(1)
        expect(cards[0].classes()).toContain('selected')
        expect(cards[0].text()).toContain('白泽')

        await cards[0].trigger('click')
        expect(wrapper.emitted('select')).toEqual([['baize']])
    })

    it('编辑器主题页签按视图项渲染并 emit Monaco 主题 type', async () => {
        const wrapper = mount(EditorThemePanel, {
            props: { themes: SAMPLE_MONACO, currentMonacoTheme: 'vs' }
        })
        const cards = wrapper.findAll('.monaco-theme-list .theme-card')
        expect(cards).toHaveLength(1)
        expect(cards[0].classes()).not.toContain('selected')
        expect(cards[0].text()).toContain('Dark (Visual Studio)')
        expect((cards[0].find('.theme-preview').element as HTMLElement).style.background).toBe(
            'rgb(30, 30, 30)'
        )

        await cards[0].trigger('click')
        expect(wrapper.emitted('select')).toEqual([['vs-dark']])
    })

    // P2 功能错误处理修复（F-04）：加载失败不再空白面板——错误文案 + 重试按钮
    it('应用主题页签加载失败时显示错误文案与「重试」按钮', async () => {
        const wrapper = mount(AppThemePanel, {
            props: {
                categories: [],
                currentTheme: 'baize',
                errorMessage: '主题列表加载失败：主进程不可用'
            }
        })
        expect(wrapper.find('.panel-state-error').exists()).toBe(true)
        expect(wrapper.find('[role="alert"]').text()).toContain('主进程不可用')
        // 失败态不渲染空的分组/卡片（避免误判「没有主题」）
        expect(wrapper.findAll('.theme-card')).toHaveLength(0)
        expect(wrapper.findAll('.category-title')).toHaveLength(0)

        await wrapper.find('.panel-retry-btn').trigger('click')
        expect(wrapper.emitted('retry')).toHaveLength(1)
    })

    // P2 功能错误处理修复（F-04）：加载中显示加载态；加载成功但为空显示可重试空态
    it('应用主题页签加载中显示加载态，加载成功但为空显示空态 + 重试', async () => {
        const loadingWrapper = mount(AppThemePanel, {
            props: { categories: [], currentTheme: 'baize', loading: true }
        })
        expect(loadingWrapper.find('.panel-state-loading').exists()).toBe(true)
        expect(loadingWrapper.findAll('.theme-card')).toHaveLength(0)
        loadingWrapper.unmount()

        const emptyWrapper = mount(AppThemePanel, {
            props: {
                categories: THEME_GROUPS.map((group) => ({ nameKey: group.labelKey, themes: [] })),
                currentTheme: 'baize'
            }
        })
        expect(emptyWrapper.find('.panel-state-empty').exists()).toBe(true)
        await emptyWrapper.find('.panel-retry-btn').trigger('click')
        expect(emptyWrapper.emitted('retry')).toHaveLength(1)
    })

    // P2 功能错误处理修复（F-04）：编辑器主题页签同样支持错误态 / 空态 / 重试
    it('编辑器主题页签加载失败或为空时显示降级提示与「重试」按钮', async () => {
        const errorWrapper = mount(EditorThemePanel, {
            props: {
                themes: [],
                currentMonacoTheme: 'vs',
                errorMessage: '主题列表加载失败：IPC 异常'
            }
        })
        expect(errorWrapper.find('.panel-state-error').exists()).toBe(true)
        expect(errorWrapper.findAll('.theme-card')).toHaveLength(0)
        await errorWrapper.find('.panel-retry-btn').trigger('click')
        expect(errorWrapper.emitted('retry')).toHaveLength(1)
        errorWrapper.unmount()

        const emptyWrapper = mount(EditorThemePanel, {
            props: { themes: [], currentMonacoTheme: 'vs' }
        })
        expect(emptyWrapper.find('.panel-state-empty').exists()).toBe(true)
        await emptyWrapper.find('.panel-retry-btn').trigger('click')
        expect(emptyWrapper.emitted('retry')).toHaveLength(1)
    })
})

describe('FontSettingsPanel（字体设置页签）', () => {
    it('两个字体下拉各 8 个选项，修改时 emit update 补丁（含 v-model.number 字号）', async () => {
        const fonts = createDefaultThemeFontSettings()
        const wrapper = mount(FontSettingsPanel, { props: { fonts } })

        const selects = wrapper.findAll('.setting-select')
        expect(selects).toHaveLength(2)
        expect(selects[0].findAll('option')).toHaveLength(8)
        expect(selects[1].findAll('option')).toHaveLength(8)
        expect((wrapper.find('input[type="number"]').element as HTMLInputElement).value).toBe('14')

        await selects[0].setValue('Fira Code')
        expect(wrapper.emitted('update')).toEqual([[{ editorFont: 'Fira Code' }]])

        await selects[1].setValue('SimSun')
        expect(wrapper.emitted('update')![1]).toEqual([{ previewFont: 'SimSun' }])

        await wrapper.find('input[type="number"]').setValue('18')
        expect(wrapper.emitted('update')![2]).toEqual([{ fontSize: 18 }])
        // 子组件不直接修改 props
        expect(fonts.fontSize).toBe(14)
    })
})

describe('useThemeSettingForm（共享草稿 composable）', () => {
    let invoke: ReturnType<typeof vi.fn>
    let configRead: ReturnType<typeof vi.fn>

    const ALL_THEMES: ThemeListItem[] = [
        makeTheme('baize', { name: '白泽' }),
        makeTheme('dark', { name: '深色主题' }),
        makeTheme('eyecare-green', { name: '护眼主题' })
    ]
    const ALL_MONACO: MonacoThemeListItem[] = [
        makeMonacoTheme('vs', {
            name: 'Light (Visual Studio)',
            description: '浅色编辑器主题',
            isDark: false
        }),
        makeMonacoTheme('vs-dark', {
            name: 'Dark (Visual Studio)',
            description: '深色编辑器主题',
            isDark: true
        })
    ]

    beforeEach(() => {
        invoke = vi.fn().mockImplementation((channel: string) => {
            if (channel === IPC.THEME.GET_ALL_THEMES) {
                return Promise.resolve(ALL_THEMES)
            }
            if (channel === IPC.THEME.GET_ALL_MONACO_THEMES) {
                return Promise.resolve(ALL_MONACO)
            }
            return Promise.resolve(null)
        })
        configRead = vi.fn().mockResolvedValue({
            currentTheme: 'dark',
            separateEditorTheme: true,
            editorTheme: 'vs-dark'
        })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
        vi.stubGlobal('api', { config: { read: configRead } })
    })

    afterEach(() => {
        vi.unstubAllGlobals()
        vi.restoreAllMocks()
    })

    /** 在最小宿主组件中执行 composable（setup 同步完成，可直接持有返回值） */
    function mountForm(): ReturnType<typeof useThemeSettingForm> {
        let form!: ReturnType<typeof useThemeSettingForm>
        const Host = defineComponent({
            setup() {
                form = useThemeSettingForm()
                return () => null
            }
        })
        const wrapper = mount(Host)
        wrapper.unmount()
        return form
    }

    it('loadThemes：按 shared THEME_GROUPS 分组 + 映射 Monaco 预览配色 + 回填当前主题', async () => {
        const form = mountForm()
        expect(form.themeCategories.value).toHaveLength(0)

        await form.loadThemes()

        expect(invoke).toHaveBeenCalledWith(IPC.THEME.GET_ALL_THEMES)
        expect(invoke).toHaveBeenCalledWith(IPC.THEME.GET_ALL_MONACO_THEMES)
        expect(configRead).toHaveBeenCalledWith('theme')
        // 3 组顺序与 THEME_GROUPS 一致，每组各 1 条（其余组内 type 主进程未返回）
        expect(form.themeCategories.value.map((category) => category.nameKey)).toEqual(
            THEME_GROUPS.map((group) => group.labelKey)
        )
        expect(form.themeCategories.value.map((category) => category.themes.length)).toEqual([
            1, 1, 1
        ])

        // Monaco 视图项：isDark 兜底配色 + name 取 config.name
        expect(form.allMonacoThemes.value).toHaveLength(2)
        expect(form.allMonacoThemes.value[0].colors).toEqual({
            bg: '#ffffff',
            text: '#333333',
            accent: '#007acc'
        })
        expect(form.allMonacoThemes.value[1].colors).toEqual({
            bg: '#1e1e1e',
            text: '#d4d4d4',
            accent: '#007acc'
        })

        // 主题配置回填 + 记录初始值
        expect(form.currentTheme.value).toBe('dark')
        expect(form.separateEditorTheme.value).toBe(true)
        expect(form.currentMonacoTheme.value).toBe('vs-dark')
    })

    it('resetSettings：取消时恢复打开时主题选择（字体草稿保持不动）', async () => {
        const form = mountForm()
        await form.loadThemes()

        form.currentTheme.value = 'eyecare-green'
        form.separateEditorTheme.value = false
        form.currentMonacoTheme.value = 'vs'
        form.fonts.editorFont = 'Fira Code'
        form.fonts.fontSize = 20

        form.resetSettings()

        expect(form.currentTheme.value).toBe('dark')
        expect(form.separateEditorTheme.value).toBe(true)
        expect(form.currentMonacoTheme.value).toBe('vs-dark')
        // 字体草稿拆分前后均不参与取消恢复
        expect(form.fonts.editorFont).toBe('Fira Code')
        expect(form.fonts.fontSize).toBe(20)
    })

    it('读取失败时保持默认值并记录错误，不阻塞对话框', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockRejectedValue(new Error('主进程不可用'))
        const form = mountForm()

        await form.loadThemes()

        expect(errorSpy).toHaveBeenCalledWith('加载主题失败:', expect.any(Error))
        expect(form.currentTheme.value).toBe('baize')
        expect(form.currentMonacoTheme.value).toBe('vs')
        expect(form.themeCategories.value).toHaveLength(0)
        // P2 功能错误处理修复：失败写入可重试错误态（面板显示错误文案 + 重试按钮）
        expect(form.isLoading.value).toBe(false)
        expect(form.loadError.value).not.toBe('')
        expect(form.loadError.value).toContain('主进程不可用')
        // 读取失败不覆盖初始快照：取消仍回默认值
        form.currentTheme.value = 'dark'
        form.resetSettings()
        expect(form.currentTheme.value).toBe('baize')
    })

    // P2 功能错误处理修复（F-04）：加载失败 → 错误态；重试成功 → 清除错误并正常渲染。
    it('加载失败后可重试：重试成功清除错误态并渲染主题列表', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invoke.mockRejectedValueOnce(new Error('主题 IPC 失败'))
        const form = mountForm()

        await form.loadThemes()
        expect(form.loadError.value).toContain('主题 IPC 失败')
        expect(form.themeCategories.value).toHaveLength(0)
        expect(form.allMonacoThemes.value).toHaveLength(0)

        // 恢复后重试（loadThemes 兼作重试入口）
        await form.loadThemes()

        expect(form.loadError.value).toBe('')
        expect(form.isLoading.value).toBe(false)
        expect(form.themeCategories.value.map((category) => category.themes.length)).toEqual([
            1, 1, 1
        ])
        expect(form.allMonacoThemes.value).toHaveLength(2)
        expect(errorSpy).toHaveBeenCalledTimes(1)
    })

    it('加载中标记 isLoading（用于面板加载态；结束后复位）', async () => {
        const form = mountForm()
        const pending = form.loadThemes()
        expect(form.isLoading.value).toBe(true)
        await pending
        expect(form.isLoading.value).toBe(false)
        expect(form.loadError.value).toBe('')
    })
})
