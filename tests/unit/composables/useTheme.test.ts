// @vitest-environment jsdom
/**
 * useTheme 主题单真源 composable 单元测试（结构优化第 4 批 4.2 / M4）
 *
 * 覆盖点：
 * 1. 单例：多次 useTheme() 返回同一 API 对象；
 * 2. CSS 变量映射：ThemeStyles 10 个配色字段 → 20 个变量（--theme-* 主变量 + 无前缀别名）；
 * 3. 幂等 apply：同一份主题重复应用不再写 DOM（第二次返回 false 且 setProperty 调用数不变），
 *    主题变化时重新写入；
 * 4. 初始化单例：initializeTheme 只读盘一次 + 只 invoke 一次主题样式，重复调用不产生额外 IPC；
 * 5. 主题切换：更新 config store → 拉取样式 → 应用 → 请求主进程广播（参数与旧实现一致）；
 * 6. 广播处理：非法载荷忽略；合法载荷应用 CSS + Monaco 主题；
 * 7. 广播订阅：单例订阅（重复订阅不重复注册）与清理函数；
 * 8. Monaco：无独立主题时 defineTheme('custom-theme')（深色名 → vs-dark 基色）；
 *    独立主题时加载磁盘主题并 setTheme；
 * 9. EventBus.THEME_UPDATED：主题应用成功后仍按历史契约发射（编辑器组件监听不变）；
 * 10. 明暗状态：isDarkTheme / currentThemeType 直接反映 config store（shared 清单口径）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Monaco 在 jsdom 下无需真实实例：useTheme 只调用 defineTheme/setTheme（与既有
// baize-notes-dialog-wiring.test.ts 的 mock 口径一致）。vi.hoisted 保证 mock 工厂可引用。
const monacoMock = vi.hoisted(() => ({
    editor: { defineTheme: vi.fn(), setTheme: vi.fn() }
}))
vi.mock('monaco-editor', () => monacoMock)

import {
    buildThemeCssVariables,
    resetThemeStateForTesting,
    THEME_CSS_VARIABLE_BINDINGS,
    useTheme
} from '../../../src/renderer/src/composables/useTheme'
import { defaultThemeConfig, getConfigStore } from '../../../src/renderer/src/common/useConfigStore'
import { t } from '../../../src/renderer/src/common/i18n'
import EventBus from '../../../src/renderer/src/common/event-bus/event-bus'
import { EVENT_BUS } from '../../../src/renderer/src/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'
import {
    buildSemanticCssVariables,
    SEMANTIC_STATUS_COLORS,
    SEMANTIC_TOKEN_CSS_BINDINGS
} from '../../../src/shared/theme-tokens'
import type { ThemeStyles, ThemeUpdateData } from '../../../src/shared/types'

const invokeMock = vi.fn()
const sendMock = vi.fn()
const onMock = vi.fn()
const removeListenerMock = vi.fn()
const configReadMock = vi.fn()
const configWriteMock = vi.fn()

const BAIZE_STYLES: ThemeStyles = {
    name: '白泽',
    description: '默认主题',
    titleBarGradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    backgroundColor: '#f5f0ff',
    cardBackground: '#ffffff',
    textColor: '#2d2d2d',
    secondaryTextColor: '#666666',
    borderColor: '#e0d4f0',
    accentColor: '#764ba2',
    buttonBackground: '#764ba2',
    buttonTextColor: '#ffffff',
    hoverBackground: '#f0e8ff'
}

const DARK_NAME_STYLES: ThemeStyles = {
    ...BAIZE_STYLES,
    name: '深邃夜空 dark',
    backgroundColor: '#1e1e1e',
    cardBackground: '#252526',
    textColor: '#d4d4d4',
    secondaryTextColor: '#a0a0a0',
    borderColor: '#3c3c3c',
    accentColor: '#007acc',
    buttonBackground: '#0e639c',
    hoverBackground: '#2a2d2e'
}

/** 当前测试使用的主题配置（config:read('theme') 返回值） */
function themeConfig(overrides: Partial<typeof defaultThemeConfig> = {}) {
    return { ...defaultThemeConfig, ...overrides }
}

/** 默认系统外观设置（config:read('system') 返回值；视觉升级 P0 三项配置） */
const DEFAULT_SYSTEM_APPEARANCE = {
    uiStyle: 'workbench',
    uiDensity: 'default',
    uiReduceTransparency: false
}

function installIpcStubs(): void {
    vi.stubGlobal('electron', {
        ipcRenderer: {
            on: onMock,
            removeListener: removeListenerMock,
            send: sendMock,
            invoke: (...args: unknown[]) => invokeMock(...args)
        }
    })
    vi.stubGlobal('api', {
        config: {
            read: (...args: unknown[]) => configReadMock(...args),
            write: (...args: unknown[]) => configWriteMock(...args)
        }
    })
}

/** 每次用例前重置单例状态、config store 与 IPC 桩 */
function resetAll(): void {
    resetThemeStateForTesting()
    const store = getConfigStore()
    store.themeConfig.value = { ...defaultThemeConfig }
    // P2 剩余静默失败提示：清理上一用例遗留的消息对话框/重试动作
    store.hideDialog('message')
    store.clearMessageDialogRetry()
    document.documentElement.removeAttribute('style')

    invokeMock.mockReset()
    sendMock.mockReset()
    onMock.mockReset()
    removeListenerMock.mockReset()
    configReadMock.mockReset()
    configWriteMock.mockReset()
    configWriteMock.mockResolvedValue(true)

    configReadMock.mockImplementation(async (name: string) => {
        if (name === 'theme') return themeConfig()
        if (name === 'system') return { ...DEFAULT_SYSTEM_APPEARANCE }
        return null
    })
    invokeMock.mockImplementation(async (channel: string) =>
        channel === IPC.THEME.GET_CURRENT_THEME_STYLES ? BAIZE_STYLES : null
    )
    installIpcStubs()
}

beforeEach(() => {
    vi.useFakeTimers()
    resetAll()
})

afterEach(() => {
    // 关闭窗口/卸载兜底逻辑不在本测试范围：丢弃未落盘的去抖写入，避免跨用例串扰
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    resetThemeStateForTesting()
    document.documentElement.removeAttribute('style')
})

describe('useTheme 单例与 CSS 变量映射', () => {
    it('多次 useTheme() 返回同一单例 API 对象', () => {
        const first = useTheme()
        const second = useTheme()
        expect(first).toBe(second)
    })

    it('THEME_CSS_VARIABLE_BINDINGS 覆盖 10 个配色字段且变量名不重复', () => {
        expect(THEME_CSS_VARIABLE_BINDINGS).toHaveLength(10)
        const fields = THEME_CSS_VARIABLE_BINDINGS.map((binding) => binding.field)
        expect(new Set(fields).size).toBe(fields.length)
        const variableNames = THEME_CSS_VARIABLE_BINDINGS.flatMap((binding) => [
            binding.prefixed,
            binding.alias
        ])
        expect(new Set(variableNames).size).toBe(variableNames.length)
    })

    it('buildThemeCssVariables 生成 20 个变量（10 主变量 + 10 历史别名，值一一对应）', () => {
        const variables = buildThemeCssVariables(BAIZE_STYLES)
        expect(Object.keys(variables)).toHaveLength(20)
        expect(variables['--theme-background-color']).toBe(BAIZE_STYLES.backgroundColor)
        expect(variables['--bg-color']).toBe(BAIZE_STYLES.backgroundColor)
        expect(variables['--theme-title-bar-gradient']).toBe(BAIZE_STYLES.titleBarGradient)
        expect(variables['--title-bar-gradient']).toBe(BAIZE_STYLES.titleBarGradient)
        expect(variables['--theme-accent-color']).toBe('#764ba2')
        expect(variables['--accent-color']).toBe('#764ba2')
    })

    it('语义令牌：buildSemanticCssVariables 生成 18 个 --ui-* 变量（视觉升级 P0 T1）', () => {
        const variables = buildSemanticCssVariables(BAIZE_STYLES, 'light')
        expect(Object.keys(variables)).toHaveLength(18)
        expect([...Object.keys(variables)].sort()).toEqual(
            SEMANTIC_TOKEN_CSS_BINDINGS.map((binding) => binding.cssVariable).sort()
        )
        expect(variables['--ui-bg']).toBe(BAIZE_STYLES.backgroundColor)
        expect(variables['--ui-accent-soft']).toBe('rgba(118, 75, 162, 0.12)')
        expect(variables['--ui-focus-ring']).toBe('rgba(118, 75, 162, 0.3)')
        // 旧 20 变量与 18 语义变量集合互不重叠（前缀正交，不破坏既有机制）
        const legacyNames = new Set(Object.keys(buildThemeCssVariables(BAIZE_STYLES)))
        for (const name of Object.keys(variables)) {
            expect(legacyNames.has(name), `${name} 与旧主题变量重复`).toBe(false)
        }
    })
})

describe('applyThemeStyles：DOM 应用与幂等', () => {
    it('把主题写入 documentElement 的 38 个 CSS 变量（旧 20 + 语义 18）', () => {
        const theme = useTheme()
        const applied = theme.applyThemeStyles(BAIZE_STYLES)
        expect(applied).toBe(true)
        expect(theme.currentThemeStyles.value).toEqual(BAIZE_STYLES)

        const root = document.documentElement
        expect(root.style.getPropertyValue('--theme-background-color')).toBe(
            BAIZE_STYLES.backgroundColor
        )
        expect(root.style.getPropertyValue('--theme-card-background')).toBe(
            BAIZE_STYLES.cardBackground
        )
        expect(root.style.getPropertyValue('--text-color')).toBe(BAIZE_STYLES.textColor)
        expect(root.style.getPropertyValue('--title-bar-gradient')).toBe(
            BAIZE_STYLES.titleBarGradient
        )
        // 视觉升级 P0：语义变量随主题应用一并写入（供 P1 组件消费）
        expect(root.style.getPropertyValue('--ui-bg')).toBe(BAIZE_STYLES.backgroundColor)
        expect(root.style.getPropertyValue('--ui-accent')).toBe(BAIZE_STYLES.accentColor)
        expect(root.style.getPropertyValue('--ui-accent-soft')).toBe('rgba(118, 75, 162, 0.12)')
        expect(root.style.getPropertyValue('--ui-success')).toBe(
            SEMANTIC_STATUS_COLORS.light.success
        )
    })

    it('同一份主题重复 apply 幂等：第二次返回 false 且不再调用 setProperty', () => {
        const theme = useTheme()
        const setPropertySpy = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty')

        expect(theme.applyThemeStyles(BAIZE_STYLES)).toBe(true)
        // 视觉升级 P0：20 个旧主题变量 + 18 个语义变量
        expect(setPropertySpy).toHaveBeenCalledTimes(38)

        // 新对象、同内容：仍应短路（按变量值签名比对，而不是对象引用）
        expect(theme.applyThemeStyles({ ...BAIZE_STYLES })).toBe(false)
        expect(setPropertySpy).toHaveBeenCalledTimes(38)
    })

    it('主题变化时重新写入 DOM（旧变量与语义变量同步更新）', () => {
        const theme = useTheme()
        theme.applyThemeStyles(BAIZE_STYLES)
        expect(theme.applyThemeStyles(DARK_NAME_STYLES, 'deepdark')).toBe(true)
        expect(document.documentElement.style.getPropertyValue('--theme-background-color')).toBe(
            DARK_NAME_STYLES.backgroundColor
        )
        expect(document.documentElement.style.getPropertyValue('--bg-color')).toBe(
            DARK_NAME_STYLES.backgroundColor
        )
        // 深色主题分组 → 语义状态色切换为深色一套
        expect(document.documentElement.style.getPropertyValue('--ui-success')).toBe(
            SEMANTIC_STATUS_COLORS.dark.success
        )
    })
})

describe('initializeTheme：启动初始化单例', () => {
    it('读取一次配置 + 拉取一次主题样式，并应用 CSS/Monaco/EventBus 事件', async () => {
        const emitSpy = vi.spyOn(EventBus, '$emit')
        const theme = useTheme()

        await theme.initializeTheme()

        // 配置读盘：沿用 config store 的 loadAllConfigs（'theme' 只读一次）
        expect(configReadMock).toHaveBeenCalledWith('theme')
        expect(configReadMock.mock.calls.filter(([name]) => name === 'theme')).toHaveLength(1)
        // 主题样式拉取：唯一入口 invoke 一次
        expect(invokeMock).toHaveBeenCalledWith(
            IPC.THEME.GET_CURRENT_THEME_STYLES,
            defaultThemeConfig.currentTheme
        )
        expect(
            invokeMock.mock.calls.filter(
                ([channel]) => channel === IPC.THEME.GET_CURRENT_THEME_STYLES
            )
        ).toHaveLength(1)

        expect(document.documentElement.style.getPropertyValue('--theme-background-color')).toBe(
            BAIZE_STYLES.backgroundColor
        )
        expect(theme.currentThemeStyles.value).toEqual(BAIZE_STYLES)
        expect(theme.separateEditorTheme.value).toBe(false)
        expect(theme.monacoEditorTheme.value).toBe('vs')
        expect(monacoMock.editor.defineTheme).toHaveBeenCalledTimes(1)
        expect(monacoMock.editor.defineTheme).toHaveBeenCalledWith(
            'custom-theme',
            expect.objectContaining({ base: 'vs' })
        )
        expect(monacoMock.editor.setTheme).toHaveBeenCalledWith('custom-theme')
        // 历史契约：主题应用成功后 EventBus 通知编辑器更新主题
        expect(emitSpy).toHaveBeenCalledWith(EVENT_BUS.THEME_UPDATED, expect.anything())
    })

    it('重复调用 initializeTheme 不产生额外读盘/样式 IPC（防重入）', async () => {
        const theme = useTheme()
        await theme.initializeTheme()
        const themeReads = configReadMock.mock.calls.filter(([name]) => name === 'theme').length
        const styleInvokes = invokeMock.mock.calls.filter(
            ([channel]) => channel === IPC.THEME.GET_CURRENT_THEME_STYLES
        ).length

        await theme.initializeTheme()

        expect(configReadMock.mock.calls.filter(([name]) => name === 'theme')).toHaveLength(
            themeReads
        )
        expect(
            invokeMock.mock.calls.filter(
                ([channel]) => channel === IPC.THEME.GET_CURRENT_THEME_STYLES
            )
        ).toHaveLength(styleInvokes)
    })

    it('独立编辑器主题：加载磁盘 Monaco 主题后 setTheme（不定义 custom-theme）', async () => {
        configReadMock.mockImplementation(async (name: string) =>
            name === 'theme'
                ? themeConfig({ separateEditorTheme: true, editorTheme: 'my-monaco-theme' })
                : null
        )
        const monacoThemeData = {
            name: 'My Theme',
            description: '',
            base: 'vs-dark',
            colors: { 'editor.background': '#101010' }
        }
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.THEME.GET_CURRENT_THEME_STYLES) return BAIZE_STYLES
            if (channel === IPC.THEME.LOAD_MONACO_THEME) return monacoThemeData
            return null
        })
        const theme = useTheme()

        await theme.initializeTheme()

        expect(invokeMock).toHaveBeenCalledWith(IPC.THEME.LOAD_MONACO_THEME, 'my-monaco-theme')
        expect(monacoMock.editor.defineTheme).toHaveBeenCalledWith(
            'my-monaco-theme',
            monacoThemeData
        )
        expect(monacoMock.editor.setTheme).toHaveBeenCalledWith('my-monaco-theme')
        expect(theme.separateEditorTheme.value).toBe(true)
        expect(theme.monacoEditorTheme.value).toBe('my-monaco-theme')
    })
})

describe('changeTheme：主题切换（配置 → 样式 → 应用 → 广播）', () => {
    it('更新配置、应用目标主题、按历史参数请求主进程广播', async () => {
        const store = getConfigStore()
        const theme = useTheme()

        await theme.changeTheme('dark', 'vs-dark', true)

        expect(store.themeConfig.value.currentTheme).toBe('dark')
        expect(store.themeConfig.value.separateEditorTheme).toBe(true)
        expect(store.themeConfig.value.editorTheme).toBe('vs-dark')
        expect(invokeMock).toHaveBeenCalledWith(IPC.THEME.GET_CURRENT_THEME_STYLES, 'dark')
        expect(monacoMock.editor.setTheme).toHaveBeenCalledWith('vs-dark')
        // A-3/FUN-20：主题应用成功后请求主进程向所有窗口广播
        expect(sendMock).toHaveBeenCalledWith(IPC.THEME.UPDATE_THEME, 'dark', 'vs-dark', true)
        // 成功路径不弹错误提示
        expect(getConfigStore().dialogs.messageDialog.visible).toBe(false)
        // 配置写盘仍走 config store 去抖（200ms），本模块不重复实现写盘
        await vi.advanceTimersByTimeAsync(300)
        expect(configWriteMock).toHaveBeenCalledWith(
            'theme',
            expect.objectContaining({ currentTheme: 'dark' })
        )
    })

    // P2 剩余静默失败提示（本批）：样式拉取失败此前静默 return，用户误以为主题已切换。
    // 现在弹错误对话框（含主题名/错误详情）+「重试」按钮，且不广播、不写 DOM。
    it('主题样式拉取失败：弹错误提示 + 可重试，不广播、不写 DOM', async () => {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        invokeMock.mockResolvedValue(null)
        const theme = useTheme()
        const store = getConfigStore()

        await theme.changeTheme('dark', 'vs', false)

        expect(sendMock).not.toHaveBeenCalled()
        expect(document.documentElement.style.getPropertyValue('--theme-background-color')).toBe('')
        expect(errorSpy).toHaveBeenCalled()
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.type).toBe('error')
        expect(store.dialogs.messageDialog.title).toBe(
            t('dialogRenderer.themeSetting.applyFailedTitle')
        )
        expect(store.dialogs.messageDialog.message).toContain('dark')
        expect(store.dialogs.messageDialog.message).toContain(
            t('dialogRenderer.themeSetting.applyFailedReasonNotFound')
        )
        // 重试按钮已挂载：主进程恢复后重试 → 应用主题并广播
        expect(store.messageDialogRetry.value).not.toBeNull()
        invokeMock.mockImplementation(async (channel: string) =>
            channel === IPC.THEME.GET_CURRENT_THEME_STYLES ? BAIZE_STYLES : null
        )
        store.runMessageDialogRetry()
        await vi.waitFor(() => {
            expect(
                document.documentElement.style.getPropertyValue('--theme-background-color')
            ).toBe(BAIZE_STYLES.backgroundColor)
        })
        expect(sendMock).toHaveBeenCalledWith(IPC.THEME.UPDATE_THEME, 'dark', 'vs', false)
        store.hideDialog('message')
        await vi.advanceTimersByTimeAsync(300)
    })

    it('主题样式 IPC 异常：弹错误提示（含错误详情）', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.THEME.GET_CURRENT_THEME_STYLES) {
                throw new Error('主题通道不可用')
            }
            return null
        })
        const theme = useTheme()
        const store = getConfigStore()

        await theme.changeTheme('dark', 'vs', false)

        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.title).toBe(
            t('dialogRenderer.themeSetting.applyFailedTitle')
        )
        expect(store.dialogs.messageDialog.message).toContain('主题通道不可用')
        expect(sendMock).not.toHaveBeenCalled()
        store.hideDialog('message')
        await vi.advanceTimersByTimeAsync(300)
    })

    // P2 剩余静默失败提示（本批）：编辑器主题（独立 Monaco 主题）加载失败此前静默回退 vs。
    // 现在界面主题仍正常应用并广播，但弹「编辑器主题加载失败」提示 + 重试。
    it('编辑器主题加载失败：回退 vs 并弹错误提示（界面主题与广播不受影响）', async () => {
        vi.spyOn(console, 'error').mockImplementation(() => {})
        invokeMock.mockImplementation(async (channel: string) => {
            if (channel === IPC.THEME.GET_CURRENT_THEME_STYLES) return BAIZE_STYLES
            if (channel === IPC.THEME.LOAD_MONACO_THEME) throw new Error('主题文件缺失')
            return null
        })
        const theme = useTheme()
        const store = getConfigStore()
        monacoMock.editor.setTheme.mockClear()

        await theme.changeTheme('dark', 'my-monaco-theme', true)

        expect(monacoMock.editor.setTheme).toHaveBeenCalledWith('vs')
        expect(store.dialogs.messageDialog.visible).toBe(true)
        expect(store.dialogs.messageDialog.title).toBe(
            t('dialogRenderer.themeSetting.editorThemeApplyFailedTitle')
        )
        expect(store.dialogs.messageDialog.message).toContain('my-monaco-theme')
        // 界面主题已应用并广播（编辑器主题失败不阻塞其他部分）
        expect(document.documentElement.style.getPropertyValue('--theme-background-color')).toBe(
            BAIZE_STYLES.backgroundColor
        )
        expect(sendMock).toHaveBeenCalledWith(
            IPC.THEME.UPDATE_THEME,
            'dark',
            'my-monaco-theme',
            true
        )
        store.hideDialog('message')
        await vi.advanceTimersByTimeAsync(300)
    })
})

describe('handleThemeBroadcast / subscribeThemeUpdates：多窗口广播', () => {
    it('非法广播载荷被忽略（不改 DOM、不抛异常）', async () => {
        const theme = useTheme()
        await theme.handleThemeBroadcast({}, { separateEditorTheme: false } as ThemeUpdateData)
        expect(document.documentElement.style.getPropertyValue('--theme-background-color')).toBe('')
    })

    it('合法广播载荷应用 CSS 变量与 Monaco 主题', async () => {
        const theme = useTheme()
        const data: ThemeUpdateData = {
            separateEditorTheme: false,
            monacoTheme: 'vs',
            themeStyles: DARK_NAME_STYLES
        }
        await theme.handleThemeBroadcast({}, data)

        expect(document.documentElement.style.getPropertyValue('--theme-background-color')).toBe(
            DARK_NAME_STYLES.backgroundColor
        )
        // 深色主题名 → custom-theme 基色 vs-dark（沿用旧启发式）
        expect(monacoMock.editor.defineTheme).toHaveBeenCalledWith(
            'custom-theme',
            expect.objectContaining({ base: 'vs-dark' })
        )
        expect(theme.currentThemeStyles.value).toEqual(DARK_NAME_STYLES)
    })

    it('广播订阅为单例：重复订阅只注册一次，清理函数相同且可移除监听', async () => {
        const theme = useTheme()
        const firstCleanup = theme.subscribeThemeUpdates()
        const secondCleanup = theme.subscribeThemeUpdates()

        expect(onMock).toHaveBeenCalledTimes(1)
        expect(onMock).toHaveBeenCalledWith(IPC.THEME.THEME_UPDATED, expect.any(Function))
        expect(secondCleanup).toBe(firstCleanup)

        // 模拟主进程广播：取出注册的回调直接调用
        const handler = onMock.mock.calls[0][1] as (event: unknown, data: unknown) => void
        handler(
            {},
            { separateEditorTheme: false, monacoTheme: 'vs', themeStyles: DARK_NAME_STYLES }
        )
        await vi.waitFor(() => {
            expect(
                document.documentElement.style.getPropertyValue('--theme-background-color')
            ).toBe(DARK_NAME_STYLES.backgroundColor)
        })

        firstCleanup()
        expect(removeListenerMock).toHaveBeenCalledWith(
            IPC.THEME.THEME_UPDATED,
            expect.any(Function)
        )
        // 清理后可重新订阅（新清理函数）
        const thirdCleanup = theme.subscribeThemeUpdates()
        expect(onMock).toHaveBeenCalledTimes(2)
        expect(thirdCleanup).not.toBe(firstCleanup)
    })
})

describe('主题状态派生（config store 单一状态源）', () => {
    it('currentThemeType / isDarkTheme 反映 config store（shared DARK_THEME_TYPES 口径）', () => {
        const store = getConfigStore()
        const theme = useTheme()

        store.themeConfig.value = { ...defaultThemeConfig, currentTheme: 'baize' }
        expect(theme.currentThemeType.value).toBe('baize')
        expect(theme.isDarkTheme.value).toBe(false)

        store.themeConfig.value = { ...defaultThemeConfig, currentTheme: 'deepdark' }
        expect(theme.currentThemeType.value).toBe('deepdark')
        expect(theme.isDarkTheme.value).toBe(true)
    })
})

// =============================================================================================
// 视觉升级 P0（T2/T3）：界面风格层 / 密度层 / 减少透明
//
// 覆盖：根元素 data-* 属性写入、默认 workbench+default、glass 深色 steady / 高饱和·护眼·
// 减少透明回退 paper、非法配置归一化、部分字段更新沿用上次值、主题切换后重新解析、
// 启动路径读取系统设置、系统设置读取失败回退、resolveEffectiveStyle 纯函数。
// =============================================================================================
describe('applyUiAppearance：界面风格/密度/减少透明（视觉升级 P0）', () => {
    /** jsdom 下读取根元素 data-* 属性 */
    function rootDataset(): DOMStringMap {
        return document.documentElement.dataset
    }

    /** 风格解析上下文的默认值（浅色普通主题、未开启减少透明） */
    function styleContext(overrides: Record<string, boolean> = {}) {
        return {
            isDark: false,
            isSaturated: false,
            isEyecare: false,
            reduceTransparency: false,
            preferReducedTransparency: false,
            ...overrides
        }
    }

    it('默认配置：data-style=workbench + data-density=default + 不减少透明（= 升级前观感）', () => {
        const theme = useTheme()
        theme.applyUiAppearance({}, BAIZE_STYLES, 'baize')

        expect(rootDataset().style).toBe('workbench')
        expect(rootDataset().density).toBe('default')
        expect(rootDataset().glassMode).toBe('normal')
        expect(rootDataset().transparency).toBe('normal')
        expect(theme.currentUiAppearance.value).toEqual({
            requestedStyle: 'workbench',
            effectiveStyle: 'workbench',
            density: 'default',
            reduceTransparency: false,
            preferReducedTransparency: false,
            glassMode: 'normal'
        })
    })

    it('glass + 浅色普通主题：保留 glass 常规模式', () => {
        const theme = useTheme()
        theme.applyUiAppearance(
            { uiStyle: 'glass', uiDensity: 'compact', uiReduceTransparency: false },
            BAIZE_STYLES,
            'baize'
        )
        expect(rootDataset().style).toBe('glass')
        expect(rootDataset().density).toBe('compact')
        expect(rootDataset().glassMode).toBe('normal')
        expect(rootDataset().transparency).toBe('normal')
    })

    it('glass + 深色主题：保留 glass 并进入 steady 稳健模式', () => {
        const theme = useTheme()
        theme.applyUiAppearance({ uiStyle: 'glass' }, DARK_NAME_STYLES, 'deepdark')
        expect(rootDataset().style).toBe('glass')
        expect(rootDataset().glassMode).toBe('steady')
    })

    it('glass + 护眼主题：回退 paper 材质（flat）', () => {
        const theme = useTheme()
        theme.applyUiAppearance({ uiStyle: 'glass' }, BAIZE_STYLES, 'eyecare-green')
        expect(rootDataset().style).toBe('paper')
        expect(rootDataset().glassMode).toBe('flat')
        expect(theme.currentUiAppearance.value.requestedStyle).toBe('glass')
        expect(theme.currentUiAppearance.value.effectiveStyle).toBe('paper')
    })

    it('glass + 高饱和主题：回退 paper 材质（flat）', () => {
        const theme = useTheme()
        theme.applyUiAppearance({ uiStyle: 'glass' }, BAIZE_STYLES, 'coral')
        expect(rootDataset().style).toBe('paper')
        expect(rootDataset().glassMode).toBe('flat')
    })

    it('glass + 减少透明开关：回退 paper 材质', () => {
        const theme = useTheme()
        theme.applyUiAppearance(
            { uiStyle: 'glass', uiReduceTransparency: true },
            BAIZE_STYLES,
            'baize'
        )
        expect(rootDataset().style).toBe('paper')
        expect(rootDataset().glassMode).toBe('flat')
        expect(rootDataset().transparency).toBe('reduced')
    })

    it('系统 prefers-reduced-transparency：glass 回退 paper 材质', () => {
        const matchMediaMock = vi.fn().mockReturnValue({ matches: true })
        vi.stubGlobal('matchMedia', matchMediaMock)
        const theme = useTheme()
        theme.applyUiAppearance({ uiStyle: 'glass' }, BAIZE_STYLES, 'baize')

        expect(matchMediaMock).toHaveBeenCalledWith('(prefers-reduced-transparency: reduce)')
        expect(rootDataset().style).toBe('paper')
        expect(rootDataset().glassMode).toBe('flat')
        expect(rootDataset().transparency).toBe('reduced')
        expect(theme.currentUiAppearance.value.preferReducedTransparency).toBe(true)
    })

    it('非法配置归一化为默认值（workbench / default / false）', () => {
        const theme = useTheme()
        theme.applyUiAppearance(
            {
                uiStyle: 'fancy',
                uiDensity: 'wide',
                uiReduceTransparency: 'yes'
            } as never,
            BAIZE_STYLES,
            'baize'
        )
        expect(rootDataset().style).toBe('workbench')
        expect(rootDataset().density).toBe('default')
        expect(rootDataset().transparency).toBe('normal')
    })

    it('部分字段更新沿用上一次请求值（系统设置广播只带变更项也不丢风格）', () => {
        const theme = useTheme()
        theme.applyUiAppearance(
            { uiStyle: 'glass', uiDensity: 'compact', uiReduceTransparency: false },
            BAIZE_STYLES,
            'baize'
        )
        theme.applyUiAppearance({ uiDensity: 'spacious' }, BAIZE_STYLES, 'baize')
        expect(theme.currentUiAppearance.value.requestedStyle).toBe('glass')
        expect(rootDataset().density).toBe('spacious')
    })

    it('主题切换后按新主题重新解析降级材质（浅色 glass → 深色 steady）', async () => {
        const theme = useTheme()
        theme.applyUiAppearance({ uiStyle: 'glass' }, BAIZE_STYLES, 'baize')
        expect(rootDataset().glassMode).toBe('normal')

        await theme.applyThemeUpdate(DARK_NAME_STYLES, false, 'vs', 'deepdark')
        expect(rootDataset().style).toBe('glass')
        expect(rootDataset().glassMode).toBe('steady')
    })

    it('initializeTheme 读取系统设置并应用风格/密度（启动路径）', async () => {
        configReadMock.mockImplementation(async (name: string) => {
            if (name === 'theme') return themeConfig()
            if (name === 'system') {
                return { uiStyle: 'glass', uiDensity: 'compact', uiReduceTransparency: false }
            }
            return null
        })
        const theme = useTheme()
        await theme.initializeTheme()

        expect(configReadMock).toHaveBeenCalledWith('system')
        expect(rootDataset().style).toBe('glass')
        expect(rootDataset().density).toBe('compact')
        expect(theme.currentUiAppearance.value.density).toBe('compact')
    })

    it('系统设置读取失败时回退默认外观并记 warn，不影响主题初始化', async () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        configReadMock.mockImplementation(async (name: string) => {
            if (name === 'theme') return themeConfig()
            if (name === 'system') throw new Error('系统配置不可读')
            return null
        })
        const theme = useTheme()
        await theme.initializeTheme()

        expect(warnSpy).toHaveBeenCalled()
        expect(rootDataset().style).toBe('workbench')
        expect(rootDataset().density).toBe('default')
        // 主题本身仍正常应用（系统设置读取失败不阻塞视觉主题）
        expect(document.documentElement.style.getPropertyValue('--theme-background-color')).toBe(
            BAIZE_STYLES.backgroundColor
        )
        expect(theme.currentThemeStyles.value).toEqual(BAIZE_STYLES)
    })

    it('resolveEffectiveStyle 纯函数：glass 降级规则与共享常量一致', () => {
        const theme = useTheme()
        expect(theme.resolveEffectiveStyle('paper', styleContext())).toBe('paper')
        expect(theme.resolveEffectiveStyle('hybrid', styleContext({ isDark: true }))).toBe('hybrid')
        expect(theme.resolveEffectiveStyle('glass', styleContext())).toBe('glass')
        expect(theme.resolveEffectiveStyle('glass', styleContext({ isDark: true }))).toBe('glass')
        expect(theme.resolveEffectiveStyle('glass', styleContext({ isSaturated: true }))).toBe(
            'paper'
        )
        expect(theme.resolveEffectiveStyle('glass', styleContext({ isEyecare: true }))).toBe(
            'paper'
        )
        expect(
            theme.resolveEffectiveStyle('glass', styleContext({ reduceTransparency: true }))
        ).toBe('paper')
    })
})
