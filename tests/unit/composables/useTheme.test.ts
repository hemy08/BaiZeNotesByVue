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
import EventBus from '../../../src/renderer/src/common/event-bus/event-bus'
import { EVENT_BUS } from '../../../src/renderer/src/common/event-bus/event-bus-events'
import { IPC } from '../../../src/shared/ipc-channels'
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
    document.documentElement.removeAttribute('style')

    invokeMock.mockReset()
    sendMock.mockReset()
    onMock.mockReset()
    removeListenerMock.mockReset()
    configReadMock.mockReset()
    configWriteMock.mockReset()
    configWriteMock.mockResolvedValue(true)

    configReadMock.mockImplementation(async (name: string) =>
        name === 'theme' ? themeConfig() : null
    )
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
})

describe('applyThemeStyles：DOM 应用与幂等', () => {
    it('把主题写入 documentElement 的 20 个 CSS 变量', () => {
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
    })

    it('同一份主题重复 apply 幂等：第二次返回 false 且不再调用 setProperty', () => {
        const theme = useTheme()
        const setPropertySpy = vi.spyOn(CSSStyleDeclaration.prototype, 'setProperty')

        expect(theme.applyThemeStyles(BAIZE_STYLES)).toBe(true)
        expect(setPropertySpy).toHaveBeenCalledTimes(20)

        // 新对象、同内容：仍应短路（按变量值签名比对，而不是对象引用）
        expect(theme.applyThemeStyles({ ...BAIZE_STYLES })).toBe(false)
        expect(setPropertySpy).toHaveBeenCalledTimes(20)
    })

    it('主题变化时重新写入 DOM（值随新主题更新）', () => {
        const theme = useTheme()
        theme.applyThemeStyles(BAIZE_STYLES)
        expect(theme.applyThemeStyles(DARK_NAME_STYLES)).toBe(true)
        expect(document.documentElement.style.getPropertyValue('--theme-background-color')).toBe(
            DARK_NAME_STYLES.backgroundColor
        )
        expect(document.documentElement.style.getPropertyValue('--bg-color')).toBe(
            DARK_NAME_STYLES.backgroundColor
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
        // 配置写盘仍走 config store 去抖（200ms），本模块不重复实现写盘
        await vi.advanceTimersByTimeAsync(300)
        expect(configWriteMock).toHaveBeenCalledWith(
            'theme',
            expect.objectContaining({ currentTheme: 'dark' })
        )
    })

    it('主题样式拉取失败时不广播、不写 DOM（保持当前界面）', async () => {
        invokeMock.mockResolvedValue(null)
        const theme = useTheme()

        await theme.changeTheme('dark', 'vs', false)

        expect(sendMock).not.toHaveBeenCalled()
        expect(document.documentElement.style.getPropertyValue('--theme-background-color')).toBe('')
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
