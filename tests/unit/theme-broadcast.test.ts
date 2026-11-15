/**
 * P1/C-03：主进程主题广播（ipc/theme-broadcast.ts）单元测试
 *
 * 背景：原主题广播有两处实现，其一在已删除的 JSDOM 主题设置对话框里误用
 * 渲染层全局 `window.electronAPI.broadcastTheme(...)`（主进程无 window 全局，
 * 回调执行到广播处抛 ReferenceError）。本模块提供主进程唯一广播实现并覆盖：
 * - 向所有存活窗口发送 THEME.THEME_UPDATED（载荷形态与渲染层 handleThemeUpdate 对齐）；
 * - 跳过 isDestroyed() 的窗口；单窗口 send 抛错不影响其余窗口；
 * - 返回成功广播的窗口数量。
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

import { broadcastThemeToAllWindows } from '../../src/main/ipc/theme-broadcast'

const payload = {
    themeStyles: { name: '白泽紫韵', backgroundColor: '#f5f0ff' },
    monacoTheme: 'vs-dark',
    separateEditorTheme: false
}

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
