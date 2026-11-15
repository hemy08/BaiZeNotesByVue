/**
 * global.ts 单元测试
 * 覆盖：globalInitialize 对 appState 的初始化行为、重复调用、未重置字段
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { globalInitialize } from '../../src/main/utils/global'
import { appState } from '../../src/main/utils/app-state'

describe('globalInitialize', () => {
    beforeEach(() => {
        appState._resetForTesting()
    })

    it('should assign the main window and reset state to defaults', () => {
        // 预置非默认值
        appState.rootPath = '/tmp/notes'
        appState.savingFile = true
        appState.currentActiveFile = {
            name: 'a.md',
            path: '/tmp/a.md',
            type: 'file',
            content: 'x'
        } as never
        appState.srcDirCopyCut = '/tmp/copy'
        appState.isCopyOrCut = 'cut'

        const fakeWindow = { id: 1 }
        globalInitialize(fakeWindow as never)

        expect(appState.mainWindow).toBe(fakeWindow)
        expect(appState.rootPath).toBe('')
        expect(appState.savingFile).toBe(false)
        expect(appState.currentActiveFile).toBeNull()
        expect(appState.srcDirCopyCut).toBe('')
        expect(appState.isCopyOrCut).toBe('')
    })

    it('should leave saveFileInterval untouched (ARC-22: AppState 默认值为唯一真源)', () => {
        // globalInitialize 不再写死 '5000' 魔法值，间隔默认值由 AppState 提供
        appState.saveFileInterval = '999'
        globalInitialize({} as never)
        expect(appState.saveFileInterval).toBe('999')
    })

    it('should not reset mdFileTree (not covered by globalInitialize)', () => {
        const tree = [
            { name: 'n', path: 'p', type: 'folder', isDirectory: true, children: [] }
        ] as never
        appState.mdFileTree = tree
        globalInitialize({} as never)
        // 记录当前真实行为：mdFileTree 不受 globalInitialize 影响
        expect(appState.mdFileTree).toBe(tree)
    })

    it('should update the main window on repeated calls', () => {
        const win1 = { id: 1 }
        const win2 = { id: 2 }
        globalInitialize(win1 as never)
        globalInitialize(win2 as never)
        expect(appState.mainWindow).toBe(win2)
    })

    it('should be idempotent for already-default state', () => {
        globalInitialize({} as never)
        globalInitialize({} as never)
        expect(appState.rootPath).toBe('')
        expect(appState.savingFile).toBe(false)
    })
})
