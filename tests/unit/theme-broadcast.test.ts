/**
 * P1/C-03：主进程主题广播（utils/theme-broadcast.ts）单元测试
 *
 * 背景：原主题广播有两处实现，其一在已删除的 JSDOM 主题设置对话框里误用
 * 渲染层全局 `window.electronAPI.broadcastTheme(...)`（主进程无 window 全局，
 * 回调执行到广播处抛 ReferenceError）。本模块提供主进程唯一广播实现并覆盖：
 * - 载荷组装纯函数 buildThemeBroadcastPayload 产出 shared ThemeUpdateData 契约形态
 *   （主进程与渲染层共用同一契约，且不改变既有运行时 3 字段载荷）；
 * - 向所有存活窗口发送 THEME.THEME_UPDATED（载荷形态与渲染层 handleThemeUpdate 对齐）；
 * - 跳过 isDestroyed() 的窗口；单窗口 send 抛错不影响其余窗口；
 * - 返回成功广播的窗口数量。
 *
 * 2026-11-20（P1-1）：模块从 `src/main/ipc/theme-broadcast.ts` 迁到
 * `src/main/utils/theme-broadcast.ts`（中性层），实现与断言完全不变，仅导入路径更新。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const electronMocks = vi.hoisted(() => {
    const windows: Array<{
        isDestroyed: () => boolean
        webContents: { send: ReturnType<typeof vi.fn> }
    }> = []
    return {
        windows,
        getAllWindows: vi.fn(() => windows)
    }
})

vi.mock('electron', () => ({
    BrowserWindow: { getAllWindows: electronMocks.getAllWindows }
}))

import {
    broadcastThemeToAllWindows,
    buildThemeBroadcastPayload
} from '../../src/main/utils/theme-broadcast'
import type { ThemeStyles } from '../../src/shared/types'

/** 完整 ThemeStyles（与 theme-config.ts 的 baize 主题一致，满足 shared 契约类型） */
const themeStyles: ThemeStyles = {
    name: '白泽紫韵',
    nameKey: 'themeNames.app.baize.name',
    description: '优雅的紫色渐变主题',
    descKey: 'themeNames.app.baize.description',
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

const payload = buildThemeBroadcastPayload(themeStyles, 'vs-dark', false)

function makeWindow(options: { destroyed?: boolean; sendThrows?: boolean } = {}) {
    const send = vi.fn(() => {
        if (options.sendThrows) {
            throw new Error('window is gone')
        }
    })
    return {
        isDestroyed: () => options.destroyed === true,
        webContents: { send }
    }
}

beforeEach(() => {
    electronMocks.windows.length = 0
    electronMocks.getAllWindows.mockClear()
})

describe('buildThemeBroadcastPayload', () => {
    it('should assemble the payload with the given values (shared ThemeUpdateData contract)', () => {
        expect(payload).toEqual({
            themeStyles,
            monacoTheme: 'vs-dark',
            separateEditorTheme: false
        })
    })

    it('should keep the runtime payload shape at the existing 3 fields (no themeType)', () => {
        // 契约归位不改变运行时载荷：shared ThemeUpdateData 的 themeType 为历史可选字段，
        // 现行主进程广播只发送 3 个字段（渲染层 handleThemeUpdate 也未消费 themeType）
        expect(Object.keys(payload)).toEqual(['themeStyles', 'monacoTheme', 'separateEditorTheme'])
        expect(payload).not.toHaveProperty('themeType')
    })
})

describe('broadcastThemeToAllWindows', () => {
    it('should broadcast the theme payload to every alive window', () => {
        const winA = makeWindow()
        const winB = makeWindow()
        electronMocks.windows.push(winA, winB)

        const sent = broadcastThemeToAllWindows(payload)

        expect(sent).toBe(2)
        expect(electronMocks.getAllWindows).toHaveBeenCalledTimes(1)
        expect(winA.webContents.send).toHaveBeenCalledWith('baize:theme:updated', payload)
        expect(winB.webContents.send).toHaveBeenCalledWith('baize:theme:updated', payload)
    })

    it('should skip destroyed windows', () => {
        const alive = makeWindow()
        const destroyed = makeWindow({ destroyed: true })
        electronMocks.windows.push(destroyed, alive)

        expect(broadcastThemeToAllWindows(payload)).toBe(1)
        expect(destroyed.webContents.send).not.toHaveBeenCalled()
        expect(alive.webContents.send).toHaveBeenCalledTimes(1)
    })

    it('should tolerate a window whose send throws and continue with other windows', () => {
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
        const broken = makeWindow({ sendThrows: true })
        const alive = makeWindow()
        electronMocks.windows.push(broken, alive)

        expect(broadcastThemeToAllWindows(payload)).toBe(1)
        expect(alive.webContents.send).toHaveBeenCalledTimes(1)
        expect(warnSpy).toHaveBeenCalled()
        warnSpy.mockRestore()
    })

    it('should return 0 when there are no windows (e.g. macOS window-all-closed)', () => {
        expect(broadcastThemeToAllWindows(payload)).toBe(0)
    })

    it('should not reference renderer globals (C-03 regression guard)', () => {
        // 主进程不存在 window 全局：广播实现若回到 window.electronAPI.broadcastTheme
        // 会在此处抛 ReferenceError
        const win = makeWindow()
        electronMocks.windows.push(win)
        expect(() => broadcastThemeToAllWindows(payload)).not.toThrow()
        expect(win.webContents.send).toHaveBeenCalledWith('baize:theme:updated', payload)
    })
})
