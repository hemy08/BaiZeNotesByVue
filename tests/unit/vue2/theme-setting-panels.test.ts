// @vitest-environment jsdom
/**
 * 设置对话框二期拆分 —— ThemeSettingDialog 子组件 + composable 契约单测
 *
 * 覆盖点：
 * 1. ThemePreviewCard：纯展示卡片（名称/描述 ⓘ/选中态/3 条预览线/色块 tooltip）与 select 事件；
 *   1.5.6 UI 简洁化：28 套主题 description 由常显段落改为名称旁 InfoTip（点击展开），卡片收紧；
 * 2. AppThemePanel / EditorThemePanel：按分组/视图项渲染，点选 emit 主题 type；
 * 3. FontSettingsPanel：字体下拉/字号经 emit('update', 补丁) 上报（v-model.number 语义）；
 * 4. useThemeSettingForm：
 *    - loadThemes：GET_ALL_THEMES 按 shared THEME_GROUPS 分组、GET_ALL_MONACO_THEMES 映射预览配色、
 *      config:read('theme') 回填当前主题并记录初始值；
 *    - resetSettings：取消时恢复主题选择（字体草稿不恢复，与拆分前一致），并在草稿偏离
 *      打开时初始值时返回回滚目标（P2 #17：取消回滚已即时应用的主题；未修改返回 null）；
 *    - 读取失败只记日志、保持默认值。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as fs from 'node:fs'
import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'

import ThemePreviewCard from '@renderer/components/dialogs/complex/theme-setting/ThemePreviewCard.vue'
import AppThemePanel from '@renderer/components/dialogs/complex/theme-setting/AppThemePanel.vue'
import EditorThemePanel from '@renderer/components/dialogs/complex/theme-setting/EditorThemePanel.vue'
import FontSettingsPanel from '@renderer/components/dialogs/complex/theme-setting/FontSettingsPanel.vue'
import InfoTip from '@renderer/components/common/InfoTip.vue'
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
    it('按 props 渲染名称/选中态/3 条预览线/3 个色块，描述改由 ⓘ 承载，点击只 emit select', async () => {
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
            },
            // InfoTip 浮层 Teleport 到 body；stub 后可在组件内断言展开内容
            global: { stubs: { teleport: true } }
        })

        expect(wrapper.classes()).toContain('theme-card')
        expect(wrapper.classes()).toContain('selected')
        expect(wrapper.find('.theme-name').text()).toBe('白泽')
        // 1.5.6 UI 简洁化：描述不再常显，改由名称旁 ⓘ 承载
        expect(wrapper.find('.theme-desc').exists()).toBe(false)
        const tipTrigger = wrapper.find('.theme-name-row .info-tip__trigger')
        expect(tipTrigger.exists()).toBe(true)
        expect(tipTrigger.attributes('aria-label')).toContain('白泽')
        expect(wrapper.findAll('.preview-line')).toHaveLength(3)
        const dots = wrapper.findAll('.color-dot')
        expect(dots).toHaveLength(3)
        expect(dots[0].attributes('title')).toBe(t('dialogRenderer.themeSetting.colorBackground'))
        expect(
            (wrapper.find('.theme-preview').element as HTMLElement).style.background
        ).toBeTruthy()

        // 点击 ⓘ 展开描述浮层，且不误触发卡片选中
        await tipTrigger.trigger('click')
        await nextTick()
        await nextTick()
        expect(wrapper.find('.info-tip__popover').text()).toBe('默认浅色主题')
        expect(wrapper.emitted('select')).toBeUndefined()
        expect(tipTrigger.attributes('aria-expanded')).toBe('true')

        await wrapper.trigger('click')
        expect(wrapper.emitted('select')).toHaveLength(1)
        wrapper.unmount()
    })
})

describe('ThemePreviewCard 紧凑布局（1.5.6 UI 简洁化）', () => {
    const source = fs.readFileSync(
        'src/renderer/src/components/dialogs/complex/theme-setting/ThemePreviewCard.vue',
        'utf8'
    )

    it('描述不再常显（无 .theme-desc 元素），改由 InfoTip 承载', () => {
        expect(source).not.toContain('class="theme-desc"')
        expect(source).toContain('<InfoTip')
        expect(source).toContain('class="theme-name-row"')
    })

    it('卡片内边距/间距与缩略预览高度收紧，单卡更矮', () => {
        const cardRule = source.match(/\.theme-card\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
        expect(cardRule).toContain('padding: 8px')
        expect(cardRule).toContain('gap: 6px')
        const previewRule = source.match(/\.theme-preview\s*\{[\s\S]*?\n\}/)?.[0] ?? ''
        expect(previewRule).toContain('height: 88px')
        expect(source).not.toContain('.theme-desc {')
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
        // 1.5.6 UI 简洁化：描述不再常显在卡片上，改由名称旁 ⓘ 承载
        expect(cards[0].find('.theme-desc').exists()).toBe(false)
        const tips = wrapper.findAllComponents(InfoTip)
        expect(tips).toHaveLength(1)
        expect(tips[0].props('text')).toBe('默认浅色主题')

        await cards[0].trigger('click')
        expect(wrapper.emitted('select')).toEqual([['baize']])
        wrapper.unmount()
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

    // 2026-11-28 用户反馈「编辑器主题设置不生效」修复：编辑器主题页签恢复「独立编辑器主题」
    // 开关（Vue 迁移时丢失的 JSDOM「是否单独配置编辑区主题」复选框）。开关状态只读展示
    // separateEditorTheme prop，切换只 emit('toggle-separate', checked)，不持有状态。
    // 1.5.6 UI 简洁化：两种语义说明由常显段落改为开关标签旁 ⓘ（文本随开关状态切换）。
    it('编辑器主题页签渲染「独立编辑器主题」开关：关闭时说明收进 ⓘ（跟随应用主题）', async () => {
        const wrapper = mount(EditorThemePanel, {
            props: { themes: SAMPLE_MONACO, currentMonacoTheme: 'vs' }
        })
        const checkbox = wrapper.find('.editor-theme-toggle-input')
        expect(checkbox.exists()).toBe(true)
        expect((checkbox.element as HTMLInputElement).checked).toBe(false)
        expect(wrapper.find('.editor-theme-toggle-label').text()).toBe(
            t('dialogRenderer.themeSetting.separateEditorThemeLabel')
        )
        // 原常显说明段落已移除，说明保留在 ⓘ 的 text 中
        expect(wrapper.find('.editor-theme-hint').exists()).toBe(false)
        const tip = wrapper.find('.editor-theme-toolbar').findComponent(InfoTip)
        expect(tip.exists()).toBe(true)
        expect(tip.props('text')).toBe(t('dialogRenderer.themeSetting.separateEditorThemeHintOff'))
        expect(tip.props('ariaLabel')).toContain(
            t('dialogRenderer.themeSetting.separateEditorThemeLabel')
        )

        await checkbox.setValue(true)
        expect(wrapper.emitted('toggle-separate')).toEqual([[true]])
        wrapper.unmount()
    })

    it('编辑器主题页签开关开启时选中态与 ⓘ 说明跟随 separateEditorTheme', async () => {
        const wrapper = mount(EditorThemePanel, {
            props: {
                themes: SAMPLE_MONACO,
                currentMonacoTheme: 'vs-dark',
                separateEditorTheme: true
            }
        })
        const checkbox = wrapper.find('.editor-theme-toggle-input')
        expect((checkbox.element as HTMLInputElement).checked).toBe(true)
        expect(wrapper.find('.editor-theme-hint').exists()).toBe(false)
        expect(wrapper.find('.editor-theme-toolbar').findComponent(InfoTip).props('text')).toBe(
            t('dialogRenderer.themeSetting.separateEditorThemeHintOn')
        )
        expect(wrapper.find('.monaco-theme-list .theme-card.selected').text()).toContain(
            'Dark (Visual Studio)'
        )
        wrapper.unmount()
    })

    it('编辑器主题页签在加载失败态下仍渲染开关（可切回跟随应用主题）', () => {
        const wrapper = mount(EditorThemePanel, {
            props: {
                themes: [],
                currentMonacoTheme: 'vs',
                errorMessage: '主题列表加载失败：IPC 异常'
            }
        })
        expect(wrapper.find('.editor-theme-toolbar').exists()).toBe(true)
        expect(wrapper.find('.panel-state-error').exists()).toBe(true)
        // 错误提示保留常显（不迁移为 ⓘ）
        expect(wrapper.find('[role="alert"]').text()).toContain('主题列表加载失败')
        wrapper.unmount()
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

    // 2026-11-28 用户反馈「编辑器主题设置不生效」回归：磁盘主题标识含空格（"All Hallows
    // Eve"）时，读取配置 / 回填草稿必须保持原始标识（Monaco 内部 id 映射在 useTheme 层做，
    // 对话框与配置值始终使用磁盘主题名，否则选中态与保存值会漂移）。
    it('loadThemes：含空格的磁盘编辑器主题标识原样回填（不做 Monaco id 映射）', async () => {
        invoke = vi.fn().mockImplementation((channel: string) => {
            if (channel === IPC.THEME.GET_ALL_THEMES) return Promise.resolve(ALL_THEMES)
            if (channel === IPC.THEME.GET_ALL_MONACO_THEMES) {
                return Promise.resolve([
                    ...ALL_MONACO,
                    makeMonacoTheme('All Hallows Eve', {
                        name: 'All Hallows Eve',
                        description: 'All Hallows Eve 主题',
                        isDark: true,
                        backgroundColor: '#000000',
                        foregroundColor: '#ffffff'
                    })
                ])
            }
            return Promise.resolve(null)
        })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
        configRead = vi.fn().mockResolvedValue({
            currentTheme: 'baize',
            separateEditorTheme: true,
            editorTheme: 'All Hallows Eve'
        })
        vi.stubGlobal('api', { config: { read: configRead } })

        const form = mountForm()
        await form.loadThemes()

        expect(form.separateEditorTheme.value).toBe(true)
        expect(form.currentMonacoTheme.value).toBe('All Hallows Eve')
        const diskTheme = form.allMonacoThemes.value.find((item) => item.type === 'All Hallows Eve')
        expect(diskTheme).toBeTruthy()
        expect(diskTheme?.name).toBe('All Hallows Eve')
        // 预览配色使用注册表返回的深色背景（#000000），而不是按名称猜测
        expect(diskTheme?.colors.bg).toBe('#000000')
    })

    it('重置设置：取消时恢复独立编辑器主题开关与含空格的主题草稿', async () => {
        invoke = vi.fn().mockImplementation((channel: string) => {
            if (channel === IPC.THEME.GET_ALL_THEMES) return Promise.resolve(ALL_THEMES)
            if (channel === IPC.THEME.GET_ALL_MONACO_THEMES) return Promise.resolve(ALL_MONACO)
            return Promise.resolve(null)
        })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
        configRead = vi.fn().mockResolvedValue({
            currentTheme: 'baize',
            separateEditorTheme: false,
            editorTheme: 'vs'
        })
        vi.stubGlobal('api', { config: { read: configRead } })

        const form = mountForm()
        await form.loadThemes()
        form.separateEditorTheme.value = true
        form.currentMonacoTheme.value = 'All Hallows Eve'

        expect(form.resetSettings()).toEqual({
            currentTheme: 'baize',
            separateEditorTheme: false,
            currentMonacoTheme: 'vs'
        })
        expect(form.separateEditorTheme.value).toBe(false)
        expect(form.currentMonacoTheme.value).toBe('vs')
    })

    it('resetSettings：取消时恢复打开时主题选择（字体草稿保持不动）并返回回滚目标', async () => {
        const form = mountForm()
        await form.loadThemes()

        form.currentTheme.value = 'eyecare-green'
        form.separateEditorTheme.value = false
        form.currentMonacoTheme.value = 'vs'
        form.fonts.editorFont = 'Fira Code'
        form.fonts.fontSize = 20

        const rollback = form.resetSettings()

        // P2 #17：返回打开时的初始选择（供壳层 emit change(initial...) 回滚已应用主题）
        expect(rollback).toEqual({
            currentTheme: 'dark',
            separateEditorTheme: true,
            currentMonacoTheme: 'vs-dark'
        })
        expect(form.currentTheme.value).toBe('dark')
        expect(form.separateEditorTheme.value).toBe(true)
        expect(form.currentMonacoTheme.value).toBe('vs-dark')
        // 字体草稿拆分前后均不参与取消恢复
        expect(form.fonts.editorFont).toBe('Fira Code')
        expect(form.fonts.fontSize).toBe(20)
    })

    // P2 #17：未修改主题时取消不额外 emit（resetSettings 返回 null）
    it('resetSettings：草稿未偏离初始值时返回 null（取消不额外 emit）', async () => {
        const form = mountForm()
        await form.loadThemes()

        expect(form.resetSettings()).toBeNull()
        // 返回值不影响草稿复位语义
        expect(form.currentTheme.value).toBe('dark')
    })

    // P2 #17：仅改编辑器主题草稿（尚未经应用/确定提交）也算草稿偏离，取消要回滚到初始主题
    it('resetSettings：仅改编辑器主题草稿时同样返回回滚目标', async () => {
        const form = mountForm()
        await form.loadThemes()

        form.currentMonacoTheme.value = 'vs'

        expect(form.resetSettings()).toEqual({
            currentTheme: 'dark',
            separateEditorTheme: true,
            currentMonacoTheme: 'vs-dark'
        })
    })

    // P2 #17：对话框打开过一次后保持挂载，二次打开重新 loadThemes 时须刷新回滚快照，
    // 不能仍回滚到上一次打开前的旧主题。
    it('再次 loadThemes（二次打开）时以本次配置刷新取消回滚快照', async () => {
        const form = mountForm()
        await form.loadThemes()
        expect(form.currentTheme.value).toBe('dark')

        // 模拟第一次打开时「确定」切换主题后父级写盘：再次打开读到新配置
        configRead.mockResolvedValue({
            currentTheme: 'baize',
            separateEditorTheme: false,
            editorTheme: 'vs'
        })
        form.currentTheme.value = 'baize'
        await form.loadThemes()
        expect(form.currentTheme.value).toBe('baize')

        form.currentTheme.value = 'eyecare-green'
        expect(form.resetSettings()).toEqual({
            currentTheme: 'baize',
            separateEditorTheme: false,
            currentMonacoTheme: 'vs'
        })
    })

    // P2 #17：二次打开时列表沿用上次加载结果、可立即点选，而配置读取可能尚未返回；
    // 此时取消应回滚到「本次打开时已应用主题」，而不是上一次打开前更旧的快照。
    it('二次打开配置读取未返回前取消：回滚到本次打开时的主题', async () => {
        const form = mountForm()
        await form.loadThemes()

        // 模拟第一次打开时已确认切换到 baize（此时已加载快照仍是 dark）
        form.currentTheme.value = 'baize'

        // 二次打开：配置读取挂起（模拟取消发生在加载完成前）
        let resolveConfig!: (value: unknown) => void
        configRead.mockReturnValueOnce(
            new Promise((resolve) => {
                resolveConfig = resolve
            })
        )
        const pending = form.loadThemes()
        await Promise.resolve()
        await Promise.resolve()

        form.currentTheme.value = 'eyecare-green'
        expect(form.resetSettings()).toEqual({
            currentTheme: 'baize',
            separateEditorTheme: true,
            currentMonacoTheme: 'vs-dark'
        })

        resolveConfig(null)
        await pending
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
