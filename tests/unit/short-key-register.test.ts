/**
 * AS-12：全局快捷键安全加固（src/main/config/short-key-register.ts）单元测试
 *
 * 覆盖：
 * - 开发环境注册 F12（DevTools 切换）；
 * - 生产环境不注册 F12（不能通过全局热键打开开发者工具）；
 * - 注册一次幂等：macOS activate 重建窗口时再次调用不重复注册，只更新目标窗口；
 * - 目标窗口销毁后回调安全跳过（不向已销毁 webContents 发送）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const electronState = vi.hoisted(() => ({
    registered: new Map<string, () => void>(),
    unregistered: [] as string[],
    app: {
        relaunch: vi.fn(),
        quit: vi.fn()
    }
}))

vi.mock('electron', () => ({
    globalShortcut: {
        register: vi.fn((accelerator: string, callback: () => void) => {
            electronState.registered.set(accelerator, callback)
            return true
        }),
        unregisterAll: vi.fn()
    },
    app: electronState.app
}))

const toolkitState = vi.hoisted(() => ({ is: { dev: true } }))
vi.mock('@electron-toolkit/utils', () => ({ is: toolkitState.is }))

const fileUtilsMocks = vi.hoisted(() => ({
    OpenDirectory: vi.fn(async () => {}),
    ReloadDirFromDisk: vi.fn(async () => {}),
    GetCurrentFileDirectory: vi.fn(() => 'D:\\notes')
}))
vi.mock('../../src/main/utils/file-utils', () => fileUtilsMocks)

const loggerMock = vi.hoisted(() => ({
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
}))
vi.mock('../../src/main/utils/logger', () => ({ logger: loggerMock }))

import { globalShortcut } from 'electron'
import {
    RegisterShortKeys,
    resetShortKeysForTesting
} from '../../src/main/config/short-key-register'

/** 构造最小主窗口桩 */
function makeWindow(options: { destroyed?: boolean; devToolsOpened?: boolean } = {}) {
    let destroyed = options.destroyed === true
    return {
        webContents: {
            send: vi.fn(),
            isDevToolsOpened: vi.fn(() => options.devToolsOpened === true),
            openDevTools: vi.fn(),
            closeDevTools: vi.fn()
        },
        isDestroyed: vi.fn(() => destroyed),
        destroy: (): void => {
            destroyed = true
        }
    }
}

function registeredAccelerators(): string[] {
    return Array.from(electronState.registered.keys()).sort()
}

describe('AS-12 RegisterShortKeys', () => {
    beforeEach(() => {
        electronState.registered.clear()
        electronState.unregistered.length = 0
        toolkitState.is.dev = true
        vi.mocked(globalShortcut.register).mockClear()
        loggerMock.warn.mockClear()
        loggerMock.error.mockClear()
        fileUtilsMocks.OpenDirectory.mockClear()
        fileUtilsMocks.ReloadDirFromDisk.mockClear()
        fileUtilsMocks.GetCurrentFileDirectory.mockClear()
        electronState.app.relaunch.mockClear()
        electronState.app.quit.mockClear()
        resetShortKeysForTesting()
    })

    afterEach(() => {
        resetShortKeysForTesting()
    })

    it('should register the view/file shortcuts and F12 in dev mode', () => {
        RegisterShortKeys(makeWindow() as never)

        expect(registeredAccelerators()).toEqual(
            ['F4', 'F9', 'F10', 'F11', 'F12', 'Ctrl+N', 'Ctrl+O', 'Ctrl+R', 'Ctrl+Shift+R'].sort()
        )
        // AS-12：开发环境 F12 打开/关闭 DevTools
        const window = makeWindow()
        electronState.registered.get('F12')?.()
        expect(globalShortcut.register).toHaveBeenCalledTimes(9)
        expect(window.webContents.openDevTools).not.toHaveBeenCalled()
    })

    it('should NOT register F12 (DevTools) in production mode (AS-12)', () => {
        toolkitState.is.dev = false
        RegisterShortKeys(makeWindow() as never)

        const accelerators = registeredAccelerators()
        expect(accelerators).not.toContain('F12')
        expect(accelerators).toEqual(
            ['F4', 'F9', 'F10', 'F11', 'Ctrl+N', 'Ctrl+O', 'Ctrl+R', 'Ctrl+Shift+R'].sort()
        )
    })

    it('should toggle DevTools through F12 in dev mode only (AS-12)', () => {
        RegisterShortKeys(makeWindow() as never)
        const closedWindow = makeWindow({ devToolsOpened: false })
        resetShortKeysForTesting()
        RegisterShortKeys(closedWindow as never)

        electronState.registered.get('F12')?.()
        expect(closedWindow.webContents.openDevTools).toHaveBeenCalledTimes(1)

        const openWindow = makeWindow({ devToolsOpened: true })
        resetShortKeysForTesting()
        electronState.registered.clear()
        RegisterShortKeys(openWindow as never)
        electronState.registered.get('F12')?.()
        expect(openWindow.webContents.closeDevTools).toHaveBeenCalledTimes(1)
    })

    it('should register only once and retarget the window on re-creation (AS-12)', () => {
        const firstWindow = makeWindow()
        RegisterShortKeys(firstWindow as never)
        const callsAfterFirst = vi.mocked(globalShortcut.register).mock.calls.length

        // 模拟 macOS activate 重建窗口：再次调用只更新目标窗口，不重复注册
        const secondWindow = makeWindow()
        RegisterShortKeys(secondWindow as never)
        expect(vi.mocked(globalShortcut.register).mock.calls.length).toBe(callsAfterFirst)

        electronState.registered.get('F9')?.()
        expect(secondWindow.webContents.send).toHaveBeenCalled()
        expect(firstWindow.webContents.send).not.toHaveBeenCalled()
    })

    it('should skip sending when the target window has been destroyed (AS-12)', () => {
        const window = makeWindow()
        RegisterShortKeys(window as never)
        window.destroy()

        expect(() => electronState.registered.get('F9')?.()).not.toThrow()
        expect(window.webContents.send).not.toHaveBeenCalled()
        expect(loggerMock.warn).toHaveBeenCalled()
    })

    it('should dispatch Ctrl+N / Ctrl+O / Ctrl+R / Ctrl+Shift+R / F4 actions', () => {
        const window = makeWindow()
        RegisterShortKeys(window as never)

        electronState.registered.get('Ctrl+N')?.()
        expect(window.webContents.send).toHaveBeenCalledWith(
            'baize:dialog:open-vue',
            'createFileFolder',
            {
                dirPath: 'D:\\notes'
            }
        )

        electronState.registered.get('Ctrl+O')?.()
        expect(fileUtilsMocks.OpenDirectory).toHaveBeenCalledWith(window)

        electronState.registered.get('Ctrl+R')?.()
        expect(fileUtilsMocks.ReloadDirFromDisk).toHaveBeenCalled()

        electronState.registered.get('Ctrl+Shift+R')?.()
        expect(electronState.app.relaunch).toHaveBeenCalled()

        electronState.registered.get('F4')?.()
        expect(electronState.app.quit).toHaveBeenCalled()
    })
})
