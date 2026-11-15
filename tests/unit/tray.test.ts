/**
 * 批次 B #4：src/main/utils/tray.ts 单元测试（vitest node 环境，mock electron Tray/Menu）
 * 覆盖：图标路径、托盘创建与单例防护、菜单项与 i18n 键、托盘单击恢复主窗口、
 * 「退出」置退出标志并 app.quit、disposeTray 销毁后可重建
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { join } from 'path'

const electronMocks = vi.hoisted(() => {
    class MockTray {
        iconPath: string
        isDestroyed: ReturnType<typeof vi.fn>
        setToolTip: ReturnType<typeof vi.fn>
        setContextMenu: ReturnType<typeof vi.fn>
        on: ReturnType<typeof vi.fn>
        destroy: ReturnType<typeof vi.fn>

        constructor(iconPath: string) {
            this.iconPath = iconPath
            this.isDestroyed = vi.fn(() => false)
            this.setToolTip = vi.fn()
            this.setContextMenu = vi.fn()
            this.on = vi.fn()
            this.destroy = vi.fn()
        }
    }
    return {
        MockTray,
        trayInstances: [] as InstanceType<typeof MockTray>[],
        // 1.3.6：隐藏到托盘提示用的 Notification 替身
        notificationInstances: [] as Array<{ title: string; body: string; show: ReturnType<typeof vi.fn> }>,
        notificationSupported: { value: true },
        menuTemplates: [] as Array<Array<Record<string, unknown>>>,
        appQuit: vi.fn()
    }
})

vi.mock('electron', () => ({
    app: { quit: electronMocks.appQuit },
    Menu: {
        buildFromTemplate: vi.fn((template: Array<Record<string, unknown>>) => {
            electronMocks.menuTemplates.push(template)
            return { template }
        })
    },
    // Tray 构造记录在 electronMocks.trayInstances（app-state 仅以类型引用 BrowserWindow）
    Tray: class extends electronMocks.MockTray {
        constructor(iconPath: string) {
            super(iconPath)
            electronMocks.trayInstances.push(this)
        }
    },
    // 1.3.6：系统通知替身（notifyMinimizedToTray）
    Notification: Object.assign(
        class {
            title: string
            body: string
            show = vi.fn()

            constructor(options: { title: string; body: string }) {
                this.title = options.title
                this.body = options.body
                electronMocks.notificationInstances.push(this)
            }

            // 显式类型注解：isSupported 引用 vi.hoisted 的 electronMocks，
            // 不加注解会与 Object.assign 的结果形成循环类型推断（TS7022）
            static isSupported: () => boolean = () => electronMocks.notificationSupported.value
        },
        {}
    ),
    BrowserWindow: class {}
}))

vi.mock('../../src/main/utils/app-paths', () => ({
    getIconPath: vi.fn(() => 'C:\\app\\resources\\icon')
}))

vi.mock('../../src/main/utils/i18n', () => ({
    tMain: vi.fn((key: string) => key)
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

import { appState } from '../../src/main/utils/app-state'
import {
    disposeTray,
    ensureTrayCreated,
    getTrayIconPath,
    notifyMinimizedToTray,
    showMainWindow
} from '../../src/main/utils/tray'

function makeMainWindowStub(): {
    isDestroyed: () => boolean
    webContents: { isDestroyed: () => boolean }
    isMinimized: () => boolean
    restore: ReturnType<typeof vi.fn>
    show: ReturnType<typeof vi.fn>
    focus: ReturnType<typeof vi.fn>
} {
    return {
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false },
        isMinimized: () => false,
        restore: vi.fn(),
        show: vi.fn(),
        focus: vi.fn()
    }
}

beforeEach(() => {
    electronMocks.trayInstances.length = 0
    electronMocks.notificationInstances.length = 0
    electronMocks.notificationSupported.value = true
    electronMocks.menuTemplates.length = 0
    electronMocks.appQuit.mockClear()
    appState._resetForTesting()
    disposeTray()
})

describe('tray (批次 B #4)', () => {
    it('should resolve the tray icon inside the icon resources directory', () => {
        expect(getTrayIconPath()).toBe(
            join('C:\\app\\resources\\icon', 'baize_mirror_dark_256x256.ico')
        )
    })

    it('should create the tray once (singleton guard)', () => {
        const first = ensureTrayCreated()
        const second = ensureTrayCreated()
        expect(second).toBe(first)
        expect(electronMocks.trayInstances).toHaveLength(1)
        expect((first as unknown as { iconPath: string }).iconPath).toBe(
            join('C:\\app\\resources\\icon', 'baize_mirror_dark_256x256.ico')
        )
    })

    it('should build a context menu with localized show/quit entries', () => {
        const tray = ensureTrayCreated()
        expect(electronMocks.menuTemplates).toHaveLength(1)
        const template = electronMocks.menuTemplates[0]
        expect(template).toHaveLength(3)
        expect(template[0].label).toBe('mainMsg.tray.showMainWindow')
        expect(template[1].type).toBe('separator')
        expect(template[2].label).toBe('mainMsg.tray.quit')
        expect(tray.setToolTip).toHaveBeenCalledWith('mainMsg.tray.tooltip')
        expect(tray.setContextMenu).toHaveBeenCalledTimes(1)
    })

    it('should restore, show and focus the main window on tray click', () => {
        const win = makeMainWindowStub()
        win.isMinimized = () => true
        appState.mainWindow = win as never

        const tray = ensureTrayCreated()
        expect(tray.on).toHaveBeenCalledWith('click', expect.any(Function))
        const onMock = tray.on as unknown as {
            mock: { calls: Array<[string, () => void]> }
        }
        const clickHandler = onMock.mock.calls.find(([event]) => event === 'click')![1]
        clickHandler()

        expect(win.restore).toHaveBeenCalled()
        expect(win.show).toHaveBeenCalled()
        expect(win.focus).toHaveBeenCalled()
    })

    it('should show and focus the main window without restore when not minimized', () => {
        const win = makeMainWindowStub()
        appState.mainWindow = win as never
        showMainWindow()
        expect(win.restore).not.toHaveBeenCalled()
        expect(win.show).toHaveBeenCalled()
        expect(win.focus).toHaveBeenCalled()
    })

    it('should not throw when there is no main window to restore', () => {
        expect(() => showMainWindow()).not.toThrow()
    })

    it('should set the quitting flag and quit the app from the tray quit menu', () => {
        ensureTrayCreated()
        const quitItem = electronMocks.menuTemplates[0].find(
            (item) => item.label === 'mainMsg.tray.quit'
        )
        expect(quitItem).toBeDefined()
        ;(quitItem!.click as () => void)()

        expect(appState.isQuitting).toBe(true)
        expect(electronMocks.appQuit).toHaveBeenCalled()
    })

    it('should destroy the tray on dispose and allow re-creation afterwards', () => {
        const first = ensureTrayCreated()
        disposeTray()
        expect(first.destroy).toHaveBeenCalled()

        const second = ensureTrayCreated()
        expect(second).not.toBe(first)
        expect(electronMocks.trayInstances).toHaveLength(2)
    })

    // 1.3.6：「关闭后进程仍在」修复——首次隐藏到托盘时发系统通知，
    // 告知用户应用仍在后台运行、可从托盘退出；每进程仅提示一次。
    describe('notifyMinimizedToTray (1.3.6)', () => {
        it('should show a notification on first hide to tray', () => {
            notifyMinimizedToTray()
            expect(electronMocks.notificationInstances).toHaveLength(1)
            expect(electronMocks.notificationInstances[0].title).toBe(
                'mainMsg.tray.minimizedTitle'
            )
            expect(electronMocks.notificationInstances[0].body).toBe('mainMsg.tray.minimizedBody')
            expect(electronMocks.notificationInstances[0].show).toHaveBeenCalled()
        })

        it('should only notify once per process', () => {
            notifyMinimizedToTray()
            notifyMinimizedToTray()
            expect(electronMocks.notificationInstances).toHaveLength(1)
        })

        it('should silently skip when notifications are unsupported', () => {
            electronMocks.notificationSupported.value = false
            expect(() => notifyMinimizedToTray()).not.toThrow()
            expect(electronMocks.notificationInstances).toHaveLength(0)
        })

        it('should notify again after tray dispose (test-isolated state reset)', () => {
            notifyMinimizedToTray()
            disposeTray()
            notifyMinimizedToTray()
            expect(electronMocks.notificationInstances).toHaveLength(2)
        })
    })
})
