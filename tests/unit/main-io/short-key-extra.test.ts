/**
 * 覆盖率补测第五批：short-key-register.ts 存活窗口判定与热键回调分支。
 *
 * 独立于既有 short-key-register.test.ts（并行安全域代理拥有该文件），只新增用例：
 * - F10/F11 视图切换回调实际发送 PREVIEW_MODE / EDIT_PREVIEW_MODE；
 * - 目标窗口缺失 / isDestroyed 抛错 / 无 isDestroyed 方法三种存活判定分支；
 * - 窗口 webContents.send 抛错时告警降级；
 * - Ctrl+O / Ctrl+R 动作失败时记录错误；Ctrl+O 无存活窗口时跳过；
 * - F12（开发环境）DevTools 开关回调。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

const electronMocks = vi.hoisted(() => ({
    register: vi.fn((accelerator: string, callback: () => void) => {
        void accelerator
        void callback
        return true
    }),
    quit: vi.fn()
}))

vi.mock('electron', () => ({
    app: { quit: electronMocks.quit },
    globalShortcut: { register: electronMocks.register },
    BrowserWindow: class {},
    shell: { openExternal: vi.fn() },
    ipcMain: { on: () => {} }
}))

vi.mock('@electron-toolkit/utils', () => ({ is: { dev: true } }))

vi.mock('../../../src/main/config/system-setting', () => ({
    getSystemSetting: () => ({ language: 'zh-CN' })
}))

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const fileUtilsMocks = vi.hoisted(() => ({
    OpenDirectory: vi.fn(async () => undefined),
    ReloadDirFromDisk: vi.fn(async () => undefined),
    GetCurrentFileDirectory: vi.fn(() => 'E:/notes')
}))
vi.mock('../../../src/main/utils/file-utils', () => fileUtilsMocks)

const relaunchMocks = vi.hoisted(() => ({ requestRelaunch: vi.fn() }))
vi.mock('../../../src/main/utils/app-relaunch', () => relaunchMocks)

import {
    RegisterShortKeys,
    resetShortKeysForTesting
} from '../../../src/main/config/short-key-register'
import { getAppContext } from '../../../src/main/app-context'
import { logger } from '../../../src/main/utils/logger'
import { IPC } from '../../../src/shared/ipc-channels'

type Callback = () => void

function callbacks(): Map<string, Callback> {
    const map = new Map<string, Callback>()
    for (const [accelerator, callback] of electronMocks.register.mock.calls) {
        map.set(accelerator, callback)
    }
    return map
}

function makeWindow(
    options: {
        sendThrows?: boolean
        destroyedThrows?: boolean
        noIsDestroyed?: boolean
        devToolsOpened?: boolean
    } = {}
): {
    win: Electron.BrowserWindow
    send: ReturnType<typeof vi.fn>
    closeDevTools: ReturnType<typeof vi.fn>
    openDevTools: ReturnType<typeof vi.fn>
} {
    const send = vi.fn(() => {
        if (options.sendThrows) throw new Error('webContents destroyed')
    })
    const closeDevTools = vi.fn()
    const openDevTools = vi.fn()
    const webContents = {
        send,
        isDestroyed: () => false,
        isDevToolsOpened: () => options.devToolsOpened === true,
        closeDevTools,
        openDevTools
    }
    const win: Record<string, unknown> = { webContents }
    if (!options.noIsDestroyed) {
        win.isDestroyed = () => {
            if (options.destroyedThrows) throw new Error('Object has been destroyed')
            return false
        }
    }
    return { win: win as unknown as Electron.BrowserWindow, send, closeDevTools, openDevTools }
}

beforeEach(() => {
    vi.clearAllMocks()
    resetShortKeysForTesting()
    electronMocks.register.mockImplementation(() => true)
    fileUtilsMocks.OpenDirectory.mockResolvedValue(undefined)
    fileUtilsMocks.ReloadDirFromDisk.mockResolvedValue(undefined)
})

describe('视图切换热键回调', () => {
    it('F10 发送 PREVIEW_MODE、F11 发送 EDIT_PREVIEW_MODE', () => {
        const { win, send } = makeWindow()
        RegisterShortKeys(win)
        const map = callbacks()

        map.get('F10')?.()
        expect(send).toHaveBeenCalledWith(IPC.VIEW.PREVIEW_MODE, null)

        map.get('F11')?.()
        expect(send).toHaveBeenCalledWith(IPC.VIEW.EDIT_PREVIEW_MODE, null)
    })

    it('目标窗口缺失时跳过发送并告警', () => {
        const { win } = makeWindow()
        RegisterShortKeys(win)
        const map = callbacks()
        getAppContext().shortKeys.targetWindow = null

        map.get('F10')?.()
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('目标窗口不可用'))
    })

    it('isDestroyed 抛错时按窗口不可用处理', () => {
        const { win } = makeWindow({ destroyedThrows: true })
        RegisterShortKeys(win)
        callbacks().get('F10')?.()
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('目标窗口不可用'))
    })

    it('测试桩无 isDestroyed 方法时视为存活（兼容分支）', () => {
        const { win, send } = makeWindow({ noIsDestroyed: true })
        RegisterShortKeys(win)
        callbacks().get('F10')?.()
        expect(send).toHaveBeenCalledWith(IPC.VIEW.PREVIEW_MODE, null)
    })

    it('webContents.send 抛错时告警降级不抛出', () => {
        const { win } = makeWindow({ sendThrows: true })
        RegisterShortKeys(win)
        expect(() => callbacks().get('F10')?.()).not.toThrow()
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('快捷键消息发送失败'),
            expect.any(Error)
        )
    })
})

describe('文件菜单热键回调', () => {
    it('Ctrl+O 打开文件夹失败时记录错误；无存活窗口时跳过', async () => {
        const { win } = makeWindow()
        RegisterShortKeys(win)
        const map = callbacks()

        fileUtilsMocks.OpenDirectory.mockRejectedValueOnce(new Error('dialog broken'))
        map.get('Ctrl+O')?.()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('打开文件夹失败'),
            expect.any(Error)
        )

        getAppContext().shortKeys.targetWindow = null
        fileUtilsMocks.OpenDirectory.mockClear()
        map.get('Ctrl+O')?.()
        expect(fileUtilsMocks.OpenDirectory).not.toHaveBeenCalled()
    })

    it('Ctrl+R 从磁盘重载失败时记录错误', async () => {
        const { win } = makeWindow()
        RegisterShortKeys(win)
        fileUtilsMocks.ReloadDirFromDisk.mockRejectedValueOnce(new Error('reload broken'))
        callbacks().get('Ctrl+R')?.()
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('从磁盘重新加载失败'),
            expect.any(Error)
        )
    })

    it('Ctrl+Shift+R 请求重启意图、F4 退出应用', () => {
        const { win } = makeWindow()
        RegisterShortKeys(win)
        const map = callbacks()
        map.get('Ctrl+Shift+R')?.()
        expect(relaunchMocks.requestRelaunch).toHaveBeenCalled()
        map.get('F4')?.()
        expect(electronMocks.quit).toHaveBeenCalled()
    })
})

describe('F12 DevTools 热键（仅开发环境）', () => {
    it('窗口可用时按 DevTools 当前状态打开/关闭', () => {
        const closed = makeWindow({ devToolsOpened: false })
        RegisterShortKeys(closed.win)
        callbacks().get('F12')?.()
        expect(closed.openDevTools).toHaveBeenCalled()

        resetShortKeysForTesting()
        electronMocks.register.mockClear()
        const opened = makeWindow({ devToolsOpened: true })
        RegisterShortKeys(opened.win)
        callbacks().get('F12')?.()
        expect(opened.closeDevTools).toHaveBeenCalled()
    })

    it('无存活目标窗口时跳过 DevTools 动作（提前 return）', () => {
        const { win } = makeWindow()
        RegisterShortKeys(win)
        const map = callbacks()
        getAppContext().shortKeys.targetWindow = null
        expect(() => map.get('F12')?.()).not.toThrow()
    })
})
