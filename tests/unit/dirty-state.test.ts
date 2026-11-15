import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
    BrowserWindow: class MockBrowserWindow {}
}))

import { AppState, appState } from '../../src/main/utils/app-state'

// D-1/FUN-05、PF-06：统一 dirty 标记测试
describe('AppState dirty 标记', () => {
    beforeEach(() => {
        appState._resetForTesting()
        appState.currentActiveFile = {
            name: 'test.md',
            path: 'C:\\test\\test.md',
            type: 'file',
            content: 'hello'
        }
        appState.markFileLoaded('hello')
    })

    it('打开/加载文件后不脏', () => {
        expect(appState.isDirty()).toBe(false)
    })

    it('内容与上次保存快照不同则脏', () => {
        appState.currentActiveFile!.content = 'hello world'
        expect(appState.isDirty()).toBe(true)
    })

    it('内容恢复为快照值则不脏', () => {
        appState.currentActiveFile!.content = 'hello world'
        expect(appState.isDirty()).toBe(true)
        appState.currentActiveFile!.content = 'hello'
        expect(appState.isDirty()).toBe(false)
    })

    it('syncFileContent：与快照不同置脏，相同不脏', () => {
        appState.syncFileContent('world')
        expect(appState.isDirty()).toBe(true)
        expect(appState.currentActiveFile!.content).toBe('world')
        appState.syncFileContent('hello')
        expect(appState.isDirty()).toBe(false)
    })

    it('markSaved 清除脏标记并更新保存快照', () => {
        appState.currentActiveFile!.content = 'changed'
        expect(appState.isDirty()).toBe(true)
        appState.markSaved()
        expect(appState.isDirty()).toBe(false)
        // 快照已更新为保存时内容，再次变化仍能识别
        appState.currentActiveFile!.content = 'changed again'
        expect(appState.isDirty()).toBe(true)
    })

    it('空内容变化同样置脏（清空文件也要保存）', () => {
        appState.currentActiveFile!.content = ''
        expect(appState.isDirty()).toBe(true)
    })

    it('无活动文件时不脏', () => {
        appState.currentActiveFile = null
        expect(appState.isDirty()).toBe(false)
    })

    it('markFileLoaded 以新内容为基准重置脏标记', () => {
        appState.currentActiveFile!.content = 'edited'
        expect(appState.isDirty()).toBe(true)
        appState.markFileLoaded('edited')
        expect(appState.isDirty()).toBe(false)
    })

    it('_resetForTesting 重置脏状态与快照', () => {
        appState.currentActiveFile!.content = 'edited'
        expect(appState.isDirty()).toBe(true)
        appState._resetForTesting()
        expect(appState.currentActiveFile).toBeNull()
        expect(appState.isDirty()).toBe(false)
    })

    it('独立实例互不干扰', () => {
        const instance = new AppState()
        expect(instance.isDirty()).toBe(false)
        expect(appState.isDirty()).toBe(false)
    })
})
