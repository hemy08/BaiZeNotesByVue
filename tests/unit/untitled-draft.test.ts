// @vitest-environment jsdom
/**
 * 未命名草稿缓存测试。
 * 重点：内存同步、localStorage 持久化、清空语义，以及损坏数据不阻塞编辑器。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
    UNTITLED_DRAFT_STORAGE_KEY,
    clearUntitledDraft,
    flushUntitledDraft,
    hasUntitledDraft,
    readUntitledDraft,
    resetUntitledDraftForTesting,
    writeUntitledDraft
} from '@renderer/components/Markdown/untitled-draft'

describe('未命名草稿缓存', () => {
    beforeEach(() => {
        resetUntitledDraftForTesting()
        vi.useFakeTimers()
    })

    afterEach(() => {
        resetUntitledDraftForTesting()
        vi.useRealTimers()
        vi.restoreAllMocks()
    })

    it('写内存后立即可读，防抖后落 localStorage', () => {
        writeUntitledDraft('第一行草稿')
        expect(readUntitledDraft()).toBe('第一行草稿')
        expect(hasUntitledDraft()).toBe(true)
        expect(window.localStorage.getItem(UNTITLED_DRAFT_STORAGE_KEY)).toBeNull()

        vi.advanceTimersByTime(250)
        const raw = window.localStorage.getItem(UNTITLED_DRAFT_STORAGE_KEY)
        expect(raw).not.toBeNull()
        expect(JSON.parse(raw!)).toMatchObject({ content: '第一行草稿' })
    })

    it('flush 立即落盘', () => {
        writeUntitledDraft('立即保存')
        flushUntitledDraft()
        expect(window.localStorage.getItem(UNTITLED_DRAFT_STORAGE_KEY)).toContain('立即保存')
    })

    it('清空后内存与 localStorage 都为 empty', () => {
        writeUntitledDraft('会被清空')
        flushUntitledDraft()
        clearUntitledDraft()

        expect(readUntitledDraft()).toBe('')
        expect(hasUntitledDraft()).toBe(false)
        expect(window.localStorage.getItem(UNTITLED_DRAFT_STORAGE_KEY)).toBeNull()
    })

    it('新实例可从 localStorage 恢复（页面重载场景）', () => {
        writeUntitledDraft('重载后恢复')
        flushUntitledDraft()

        // 模拟页面重载：清掉模块内存，但保留 localStorage
        resetUntitledDraftForTesting()
        window.localStorage.setItem(
            UNTITLED_DRAFT_STORAGE_KEY,
            JSON.stringify({ content: '重载后恢复', updatedAt: Date.now() })
        )
        expect(readUntitledDraft()).toBe('重载后恢复')
    })

    it('损坏的缓存数据不抛错并按无草稿处理', () => {
        window.localStorage.setItem(UNTITLED_DRAFT_STORAGE_KEY, '{broken json')
        expect(readUntitledDraft()).toBe('')
        expect(hasUntitledDraft()).toBe(false)
    })

    it('空白内容不算草稿', () => {
        writeUntitledDraft('   \n  ')
        expect(hasUntitledDraft()).toBe(false)
        expect(readUntitledDraft()).toBe('   \n  ')
    })

    it('localStorage 读取/写入异常时降级为内存缓存，不阻塞输入', () => {
        vi.spyOn(Storage.prototype, 'getItem').mockImplementationOnce(() => {
            throw new Error('storage disabled')
        })
        expect(readUntitledDraft()).toBe('')

        const setItemSpy = vi.spyOn(Storage.prototype, 'setItem').mockImplementationOnce(() => {
            throw new Error('quota exceeded')
        })
        expect(() => {
            writeUntitledDraft('内存草稿')
            flushUntitledDraft()
        }).not.toThrow()
        expect(setItemSpy).toHaveBeenCalled()
        expect(readUntitledDraft()).toBe('内存草稿')
    })
})
