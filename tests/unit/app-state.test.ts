import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
    BrowserWindow: class MockBrowserWindow {}
}))

import {
    AppState,
    appState,
    getLiveMainWindow,
    sendToMainWindow
} from '../../src/main/utils/app-state'

describe('AppState', () => {
    describe('singleton instance', () => {
        beforeEach(() => {
            appState._resetForTesting()
        })

        it('should have default values', () => {
            expect(appState.rootPath).toBe('')
            expect(appState.savingFile).toBe(false)
            expect(appState.saveFileInterval).toBe('5000')
            expect(appState.srcDirCopyCut).toBe('')
            expect(appState.isCopyOrCut).toBe('')
            expect(appState.currentActiveFile).toBeNull()
            expect(appState.mdFileTree).toBeNull()
            expect(appState.mainWindow).toBeNull()
        })

        it('should set and get rootPath', () => {
            appState.rootPath = '/test/path'
            expect(appState.rootPath).toBe('/test/path')
        })

        it('should set and get savingFile', () => {
            appState.savingFile = true
            expect(appState.savingFile).toBe(true)
        })

        it('should set and get saveFileInterval', () => {
            appState.saveFileInterval = '10000'
            expect(appState.saveFileInterval).toBe('10000')
        })

        it('should set and get isCopyOrCut', () => {
            appState.isCopyOrCut = 'copy'
            expect(appState.isCopyOrCut).toBe('copy')
        })

        it('should reset all state with _resetForTesting', () => {
            appState.rootPath = '/modified'
            appState.savingFile = true
            appState.saveFileInterval = '9999'
            appState.isCopyOrCut = 'cut'

            appState._resetForTesting()

            expect(appState.rootPath).toBe('')
            expect(appState.savingFile).toBe(false)
            expect(appState.saveFileInterval).toBe('5000')
            expect(appState.isCopyOrCut).toBe('')
        })
    })

    describe('independent instance', () => {
        it('should create isolated instances', () => {
            const instance1 = new AppState()
            const instance2 = new AppState()

            instance1.rootPath = '/path1'
            instance2.rootPath = '/path2'

            expect(instance1.rootPath).toBe('/path1')
            expect(instance2.rootPath).toBe('/path2')
            expect(instance1.rootPath).not.toBe(instance2.rootPath)
        })
    })
})

// P2 非空断言治理：主窗口安全访问辅助函数（getLiveMainWindow / sendToMainWindow）
describe('主窗口安全访问辅助（P2）', () => {
    const makeLiveWindow = () => ({
        isDestroyed: () => false,
        webContents: { isDestroyed: () => false, send: vi.fn() }
    })

    beforeEach(() => {
        appState._resetForTesting()
    })

    it('should return null when no main window exists', () => {
        expect(getLiveMainWindow()).toBeNull()
    })

    it('should return the live window', () => {
        const win = makeLiveWindow()
        appState.mainWindow = win as never
        expect(getLiveMainWindow()).toBe(win as never)
    })

    it('should return null when the window is destroyed', () => {
        const win = makeLiveWindow()
        win.isDestroyed = () => true
        appState.mainWindow = win as never
        expect(getLiveMainWindow()).toBeNull()
    })

    it('should return null when webContents is destroyed', () => {
        const win = makeLiveWindow()
        win.webContents.isDestroyed = () => true
        appState.mainWindow = win as never
        expect(getLiveMainWindow()).toBeNull()
    })

    it('should return null when webContents is missing', () => {
        appState.mainWindow = { isDestroyed: () => false } as never
        expect(getLiveMainWindow()).toBeNull()
    })

    it('should treat test doubles without isDestroyed as usable', () => {
        const win = { webContents: { send: vi.fn() } }
        appState.mainWindow = win as never
        expect(getLiveMainWindow()).toBe(win as never)
    })

    it('should send IPC with multiple args and return true', () => {
        const win = makeLiveWindow()
        appState.mainWindow = win as never
        expect(sendToMainWindow('baize:test', 'a', { b: 1 })).toBe(true)
        expect(win.webContents.send).toHaveBeenCalledWith('baize:test', 'a', { b: 1 })
    })

    it('should skip sending and return false when no window is available', () => {
        expect(sendToMainWindow('baize:test', 'a')).toBe(false)
    })

    it('should swallow send errors caused by destroy races', () => {
        const win = makeLiveWindow()
        win.webContents.send = vi.fn(() => {
            throw new TypeError('Object has been destroyed')
        })
        appState.mainWindow = win as never
        expect(() => sendToMainWindow('baize:test')).not.toThrow()
        expect(sendToMainWindow('baize:test')).toBe(false)
    })
})
