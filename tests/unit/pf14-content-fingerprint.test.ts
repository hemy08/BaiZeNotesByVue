/**
 * PF-14：主进程「双份全文」修复的回归测试。
 *
 * 背景（out/full-scan/perf.md PF-14）：修复前主进程对打开文件持有两份全文——
 * `appState.currentActiveFile.content` 之外，`_lastSavedContent` 还保存了一份
 * 最近一次保存/加载的全文快照；大目录时另持有「对象树 + 整树 JSON 字符串」两份。
 *
 * 本文件守护：
 * 1. 全文快照已移除：基准只保存「长度 + sha256 指纹」（O(1) 内存），不再保留第二份全文；
 * 2. 脏标记语义不变：加载/保存/内容同步/内容还原/同长度替换的判定与修复前一致；
 * 3. 磁盘签名（PF-17）随活动文件切换失效。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('electron', () => ({
    BrowserWindow: class MockBrowserWindow {}
}))

import { AppState, appState, fingerprintText } from '../../src/main/utils/app-state'

describe('fingerprintText（PF-14 内容指纹）', () => {
    it('同一内容指纹稳定，不同内容指纹不同', () => {
        expect(fingerprintText('hello')).toBe(fingerprintText('hello'))
        expect(fingerprintText('hello')).not.toBe(fingerprintText('hello!'))
        // 空内容同样有稳定指纹
        expect(fingerprintText('')).toBe(fingerprintText(''))
    })

    it('指纹长度固定（sha256 hex 64 字符），与内容长度无关', () => {
        expect(fingerprintText('')).toHaveLength(64)
        expect(fingerprintText('x'.repeat(1024 * 1024))).toHaveLength(64)
    })
})

describe('AppState 全文快照替换为指纹（PF-14）', () => {
    beforeEach(() => {
        appState._resetForTesting()
        appState.currentActiveFile = {
            name: 'note.md',
            path: 'C:\\notes\\note.md',
            type: 'file',
            content: 'hello'
        }
        appState.markFileLoaded('hello')
    })

    it('不再持有第二份全文（_lastSavedContent 已移除，基准只有长度 + 指纹）', () => {
        // 旧实现把全文快照私有字段挂在实例上，这类字段若被重新引入即视为 PF-14 回归
        expect('_lastSavedContent' in appState).toBe(false)
        const state = appState as unknown as {
            _lastSavedContentLength: number
            _lastSavedContentHash: string | null
        }
        expect(state._lastSavedContentLength).toBe('hello'.length)
        expect(state._lastSavedContentHash).toHaveLength(64)
        // 基准字段是数字/64 字符指纹，不可能是原文，也不会随内容长度增长
        expect(state._lastSavedContentHash).not.toBe('hello')
    })

    it('1 MiB 文档：基准仍只占 64 字符指纹（不再按内容长度复制整篇）', () => {
        const bigContent = '大'.repeat(256 * 1024) // 约 0.75 MiB 的 UTF-16 字符串内容
        appState.currentActiveFile!.content = bigContent
        appState.markFileLoaded(bigContent)

        const state = appState as unknown as {
            _lastSavedContentLength: number
            _lastSavedContentHash: string | null
        }
        expect(state._lastSavedContentLength).toBe(bigContent.length)
        expect(state._lastSavedContentHash).toHaveLength(64)
        expect(appState.isDirty()).toBe(false)
    })

    it('内容变化（含同长度替换）判定为脏，还原后重新变干净', () => {
        expect(appState.isDirty()).toBe(false)
        // 同长度替换：长度快路径不命中，必须由指纹识别
        appState.currentActiveFile!.content = 'world'
        expect(appState.isDirty()).toBe(true)
        appState.currentActiveFile!.content = 'hello'
        expect(appState.isDirty()).toBe(false)
    })

    it('syncFileContent：与基准不同置脏，相同不脏（含同长度替换）', () => {
        appState.syncFileContent('world')
        expect(appState.isDirty()).toBe(true)
        expect(appState.currentActiveFile!.content).toBe('world')
        appState.syncFileContent('hello')
        expect(appState.isDirty()).toBe(false)

        appState.syncFileContent('')
        expect(appState.isDirty()).toBe(true)
        appState.syncFileContent('hello')
        expect(appState.isDirty()).toBe(false)
    })

    it('markSaved 更新基准：保存后不脏，再次同长度修改仍能识别', () => {
        appState.currentActiveFile!.content = 'world'
        expect(appState.isDirty()).toBe(true)
        appState.markSaved()
        expect(appState.isDirty()).toBe(false)

        appState.currentActiveFile!.content = 'HELLO'
        expect(appState.isDirty()).toBe(true)
    })

    it('markFileLoaded 以新内容为基准重置脏标记', () => {
        appState.currentActiveFile!.content = 'edited'
        expect(appState.isDirty()).toBe(true)
        appState.markFileLoaded('edited')
        expect(appState.isDirty()).toBe(false)
    })

    it('无活动文件时不脏；无基准时非空内容按脏处理（与原实现一致）', () => {
        appState.currentActiveFile = null
        expect(appState.isDirty()).toBe(false)

        // 直接构造活动文件而未 markFileLoaded：旧实现（快照 null）下非空内容判定为脏
        appState._resetForTesting()
        appState.currentActiveFile = {
            name: 'raw.md',
            path: 'C:\\notes\\raw.md',
            type: 'file',
            content: 'raw'
        }
        expect(appState.isDirty()).toBe(true)

        appState._resetForTesting()
        appState.currentActiveFile = {
            name: 'empty.md',
            path: 'C:\\notes\\empty.md',
            type: 'file',
            content: ''
        }
        // 旧实现：快照 null 时 '' === '' → 不脏
        expect(appState.isDirty()).toBe(false)
    })

    it('_resetForTesting 重置指纹基准与磁盘签名', () => {
        appState.currentActiveFile!.content = 'edited'
        appState.setActiveFileDiskStamp({ path: 'C:\\notes\\note.md', mtimeMs: 1, size: 2 })
        appState._resetForTesting()

        const state = appState as unknown as {
            _lastSavedContentLength: number
            _lastSavedContentHash: string | null
        }
        expect(state._lastSavedContentLength).toBe(0)
        expect(state._lastSavedContentHash).toBeNull()
        expect(appState.activeFileDiskStamp).toBeNull()
        expect(appState.isDirty()).toBe(false)
    })

    it('独立实例互不干扰', () => {
        const instance = new AppState()
        instance.currentActiveFile = {
            name: 'a.md',
            path: 'C:\\a.md',
            type: 'file',
            content: 'a'
        }
        instance.markFileLoaded('b')
        expect(instance.isDirty()).toBe(true)
        expect(appState.isDirty()).toBe(false)
    })
})

describe('AppState 活动文件磁盘签名（PF-17 配套）', () => {
    beforeEach(() => {
        appState._resetForTesting()
    })

    it('可读写磁盘签名', () => {
        appState.currentActiveFile = { name: 'n.md', path: 'C:\\n.md', type: 'file', content: 'x' }
        appState.setActiveFileDiskStamp({ path: 'C:\\n.md', mtimeMs: 1234.5, size: 7 })
        expect(appState.activeFileDiskStamp).toEqual({ path: 'C:\\n.md', mtimeMs: 1234.5, size: 7 })
    })

    it('切换活动文件（含换成新对象）会清空旧签名，避免用旧 mtime/size 误判', () => {
        appState.currentActiveFile = { name: 'a.md', path: 'C:\\a.md', type: 'file', content: 'a' }
        appState.setActiveFileDiskStamp({ path: 'C:\\a.md', mtimeMs: 1, size: 1 })
        expect(appState.activeFileDiskStamp).not.toBeNull()

        appState.currentActiveFile = { name: 'b.md', path: 'C:\\b.md', type: 'file', content: 'b' }
        expect(appState.activeFileDiskStamp).toBeNull()

        appState.setActiveFileDiskStamp({ path: 'C:\\b.md', mtimeMs: 2, size: 2 })
        appState.currentActiveFile = null
        expect(appState.activeFileDiskStamp).toBeNull()
    })
})
