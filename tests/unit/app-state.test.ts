import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
    BrowserWindow: class MockBrowserWindow {}
}))

import { AppState, appState } from '../../src/main/utils/app-state'

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