/**
 * 批次 B #7：src/main/config/system-theme.ts 单元测试（vitest node 环境）
 * 覆盖：useSystemTheme 开启时按 nativeTheme.shouldUseDarkColors 选择 dark/light 主题、
 * setThemeConfig 应用 + theme-broadcast 唯一广播、关闭时不动作、注册表缺失回退默认主题、
 * 监听注册单例与随退出清理（stopSystemThemeWatcher 移除监听）
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const nativeThemeMocks = vi.hoisted(() => {
    return {
        shouldUseDarkColors: true,
        listeners: new Set<() => void>(),
        on: vi.fn((event: string, listener: () => void) => {
            if (event === 'updated') {
                nativeThemeMocks.listeners.add(listener)
            }
        }),
        removeListener: vi.fn((event: string, listener: () => void) => {
            if (event === 'updated') {
                nativeThemeMocks.listeners.delete(listener)
            }
        })
    }
})

vi.mock('electron', () => ({
    nativeTheme: {
        get shouldUseDarkColors() {
            return nativeThemeMocks.shouldUseDarkColors
        },
        on: nativeThemeMocks.on,
        removeListener: nativeThemeMocks.removeListener
    },
    // theme-broadcast 模块静态导入 BrowserWindow（本文件经 importOriginal 保留其
    // 真实 buildThemeBroadcastPayload），mock 侧提供空实现避免缺失导出报错；
    // 实际广播发送端已被下方 mock 替换，不会触发窗口遍历。
    BrowserWindow: { getAllWindows: vi.fn(() => []) }
}))

const systemSettingMocks = vi.hoisted(() => ({
    setting: {} as Record<string, unknown>
}))

vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: () => systemSettingMocks.setting,
    saveSystemSetting: vi.fn()
}))

const themeConfigMocks = vi.hoisted(() => ({
    isKnown: true,
    setThemeConfig: vi.fn(),
    getCurrentTheme: vi.fn(() => 'baize'),
    getCurrentThemeStyles: vi.fn(() => ({ name: '当前样式' })),
    getMonacoTheme: vi.fn(() => 'vs-dark'),
    getSeparateEditorTheme: vi.fn(() => false)
}))

vi.mock('../../src/main/config/theme-config', () => ({
    DEFAULT_THEME_TYPE: 'baize',
    isKnownThemeType: (value: string) =>
        themeConfigMocks.isKnown && (value === 'dark' || value === 'light'),
    setThemeConfig: themeConfigMocks.setThemeConfig,
    getCurrentTheme: themeConfigMocks.getCurrentTheme,
    getCurrentThemeStyles: themeConfigMocks.getCurrentThemeStyles,
    getMonacoTheme: themeConfigMocks.getMonacoTheme,
    getSeparateEditorTheme: themeConfigMocks.getSeparateEditorTheme
}))

const broadcastMocks = vi.hoisted(() => ({
    broadcast: vi.fn(() => 1)
}))

// 只替换广播发送端（保持 theme-broadcast 模块其余导出为真实实现）：
// - buildThemeBroadcastPayload 是本次收敛新增的纯组装函数，保留真实实现才能让下方
//   "broadcast 收到完整 3 字段载荷" 断言覆盖 system-theme → 组装 → 统一广播整条链路；
// - broadcastThemeToAllWindows 用 mock 记录调用（避免真实 electron 窗口依赖）。
vi.mock('../../src/main/utils/theme-broadcast', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../src/main/utils/theme-broadcast')>()
    return { ...actual, broadcastThemeToAllWindows: broadcastMocks.broadcast }
})

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import {
    applySystemThemeNow,
    startSystemThemeWatcher,
    stopSystemThemeWatcher
} from '../../src/main/config/system-theme'

function triggerNativeThemeUpdate(): void {
    nativeThemeMocks.listeners.forEach((listener) => listener())
}

beforeEach(() => {
    // 清理上一用例可能残留的监听（模块级单例状态），保证各用例独立
    stopSystemThemeWatcher()
    nativeThemeMocks.listeners.clear()
    nativeThemeMocks.shouldUseDarkColors = true
    nativeThemeMocks.on.mockClear()
    nativeThemeMocks.removeListener.mockClear()
    systemSettingMocks.setting = { useSystemTheme: true }
    themeConfigMocks.isKnown = true
    themeConfigMocks.setThemeConfig.mockClear()
    themeConfigMocks.getCurrentTheme.mockClear()
    themeConfigMocks.getCurrentTheme.mockReturnValue('baize')
    themeConfigMocks.getCurrentThemeStyles.mockClear()
    themeConfigMocks.getMonacoTheme.mockClear()
    themeConfigMocks.getSeparateEditorTheme.mockClear()
    broadcastMocks.broadcast.mockClear()
})

describe('system-theme (批次 B #7)', () => {
    it('should apply the dark theme and broadcast when the system is dark', () => {
        nativeThemeMocks.shouldUseDarkColors = true
        applySystemThemeNow()

        expect(themeConfigMocks.setThemeConfig).toHaveBeenCalledWith({ currentTheme: 'dark' })
        expect(broadcastMocks.broadcast).toHaveBeenCalledWith({
            themeStyles: { name: '当前样式' },
            monacoTheme: 'vs-dark',
            separateEditorTheme: false
        })
    })

    it('should apply the light theme and broadcast when the system is light', () => {
        nativeThemeMocks.shouldUseDarkColors = false
        applySystemThemeNow()

        expect(themeConfigMocks.setThemeConfig).toHaveBeenCalledWith({ currentTheme: 'light' })
        expect(broadcastMocks.broadcast).toHaveBeenCalledTimes(1)
    })

    it('should do nothing when useSystemTheme is disabled', () => {
        systemSettingMocks.setting = { useSystemTheme: false }
        applySystemThemeNow()

        expect(themeConfigMocks.setThemeConfig).not.toHaveBeenCalled()
        expect(broadcastMocks.broadcast).not.toHaveBeenCalled()
    })

    it('should fall back to the default theme when dark/light are not in the registry', () => {
        themeConfigMocks.isKnown = false
        // 当前主题与兜底目标不同（P3 脏检查），才会写盘与广播
        themeConfigMocks.getCurrentTheme.mockReturnValue('light')
        applySystemThemeNow()

        expect(themeConfigMocks.setThemeConfig).toHaveBeenCalledWith({ currentTheme: 'baize' })
    })

    // P3（审查）：脏检查——系统主题事件在深浅色未变化时也重复触发（系统亮度微调等），
    // 目标主题与当前主题一致时跳过写盘与广播，避免无意义的 store 写入与渲染层换肤
    it('should skip writing and broadcasting when the target theme equals the current theme (P3)', () => {
        themeConfigMocks.getCurrentTheme.mockReturnValue('dark')
        applySystemThemeNow()

        expect(themeConfigMocks.setThemeConfig).not.toHaveBeenCalled()
        expect(broadcastMocks.broadcast).not.toHaveBeenCalled()
    })

    it('should skip a duplicate nativeTheme update when the resolved theme is unchanged', () => {
        startSystemThemeWatcher()
        themeConfigMocks.setThemeConfig.mockClear()
        broadcastMocks.broadcast.mockClear()
        // 启动对齐已应用 dark；重复的 updated 事件（深浅色未变）不再写盘广播
        themeConfigMocks.getCurrentTheme.mockReturnValue('dark')
        triggerNativeThemeUpdate()

        expect(themeConfigMocks.setThemeConfig).not.toHaveBeenCalled()
        expect(broadcastMocks.broadcast).not.toHaveBeenCalled()
    })

    it('should register the nativeTheme listener once and apply immediately at start', () => {
        startSystemThemeWatcher()
        startSystemThemeWatcher()

        expect(nativeThemeMocks.on).toHaveBeenCalledTimes(1)
        expect(nativeThemeMocks.on).toHaveBeenCalledWith('updated', expect.any(Function))
        expect(nativeThemeMocks.listeners.size).toBe(1)
        // 启动即对齐一次当前系统深浅色
        expect(themeConfigMocks.setThemeConfig).toHaveBeenCalledWith({ currentTheme: 'dark' })
    })

    it('should apply the theme again when nativeTheme fires updated', () => {
        startSystemThemeWatcher()
        themeConfigMocks.setThemeConfig.mockClear()
        broadcastMocks.broadcast.mockClear()

        nativeThemeMocks.shouldUseDarkColors = false
        triggerNativeThemeUpdate()

        expect(themeConfigMocks.setThemeConfig).toHaveBeenCalledWith({ currentTheme: 'light' })
        expect(broadcastMocks.broadcast).toHaveBeenCalledTimes(1)
    })

    it('should ignore the update event when useSystemTheme is disabled', () => {
        startSystemThemeWatcher()
        systemSettingMocks.setting = { useSystemTheme: false }
        themeConfigMocks.setThemeConfig.mockClear()

        triggerNativeThemeUpdate()

        expect(themeConfigMocks.setThemeConfig).not.toHaveBeenCalled()
    })

    it('should remove the listener on stop and allow restarting the watcher', () => {
        startSystemThemeWatcher()
        stopSystemThemeWatcher()

        expect(nativeThemeMocks.removeListener).toHaveBeenCalledWith(
            'updated',
            expect.any(Function)
        )
        expect(nativeThemeMocks.listeners.size).toBe(0)

        // 退出清理后重新启动：再次注册且立即应用
        themeConfigMocks.setThemeConfig.mockClear()
        startSystemThemeWatcher()
        expect(nativeThemeMocks.listeners.size).toBe(1)
        expect(themeConfigMocks.setThemeConfig).toHaveBeenCalledWith({ currentTheme: 'dark' })
    })

    it('should be a no-op when stopping without a started watcher', () => {
        stopSystemThemeWatcher()
        expect(nativeThemeMocks.removeListener).not.toHaveBeenCalled()
    })
})
