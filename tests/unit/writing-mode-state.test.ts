// @vitest-environment jsdom
/**
 * P0 写作体验基础：写作模式单例状态、光标/滚动会话恢复。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    WRITING_MODE_DEFAULTS,
    enterWritingMode,
    exitWritingMode,
    normalizeWritingModeState,
    toggleWritingMode,
    updateWritingMode,
    writingModeState
} from '../../src/renderer/src/components/Markdown/useWritingMode'
import {
    clearCursorSession,
    cursorSessionKey,
    hashSessionPath,
    loadCursorSession,
    normalizeCursorSession,
    saveCursorSession,
    type CursorSessionStorage
} from '../../src/renderer/src/components/Markdown/editor-cursor-session'

function memoryStorage(): CursorSessionStorage {
    const map = new Map<string, string>()
    return {
        getItem: (key) => map.get(key) ?? null,
        setItem: (key, value) => void map.set(key, value),
        removeItem: (key) => void map.delete(key)
    }
}

describe('writing mode state', () => {
    beforeEach(() => {
        Object.assign(writingModeState, WRITING_MODE_DEFAULTS)
        vi.useFakeTimers()
    })
    afterEach(() => {
        vi.useRealTimers()
        Object.assign(writingModeState, WRITING_MODE_DEFAULTS)
    })

    it('默认全部关闭且写作模式默认不启用', () => {
        expect(writingModeState.enabled).toBe(false)
        expect(writingModeState.typewriter).toBe(true)
        expect(writingModeState.focusParagraph).toBe(true)
        expect(WRITING_MODE_DEFAULTS.enabled).toBe(false)
    })

    it('进入/退出/切换写作模式', () => {
        enterWritingMode()
        expect(writingModeState.enabled).toBe(true)
        exitWritingMode()
        expect(writingModeState.enabled).toBe(false)
        toggleWritingMode()
        expect(writingModeState.enabled).toBe(true)
    })

    it('持久化时归一化非法数值（宽度/字号/行高/目标）', () => {
        updateWritingMode({
            contentWidth: 10,
            fontSize: 999,
            lineHeight: -1,
            dailyGoal: 0
        })
        expect(writingModeState.contentWidth).toBeGreaterThanOrEqual(480)
        expect(writingModeState.fontSize).toBeLessThanOrEqual(28)
        expect(writingModeState.lineHeight).toBeGreaterThanOrEqual(18)
        expect(writingModeState.dailyGoal).toBeGreaterThanOrEqual(100)
        vi.runAllTimers()
    })

    it('normalizeWritingModeState 对损坏数据回退默认值', () => {
        expect(normalizeWritingModeState(null)).toEqual(WRITING_MODE_DEFAULTS)
        expect(normalizeWritingModeState('bad')).toEqual(WRITING_MODE_DEFAULTS)
        expect(normalizeWritingModeState({ enabled: true }).enabled).toBe(true)
    })
})

describe('editor cursor session', () => {
    it('同一路径大小写/分隔符生成相同 key，不同路径不同 key', () => {
        expect(hashSessionPath('C:\\Notes\\A.md')).toBe(hashSessionPath('c:/notes/a.md'))
        expect(cursorSessionKey('C:\\a.md')).not.toBe(cursorSessionKey('C:\\b.md'))
    })

    it('保存/读取 roundtrip，并支持选区', () => {
        const storage = memoryStorage()
        saveCursorSession(storage, 'C:\\notes\\a.md', {
            lineNumber: 12,
            column: 4,
            scrollTop: 320,
            selection: {
                startLineNumber: 12,
                startColumn: 1,
                endLineNumber: 12,
                endColumn: 8
            }
        })
        expect(loadCursorSession(storage, 'C:\\notes\\a.md')).toEqual({
            lineNumber: 12,
            column: 4,
            scrollTop: 320,
            selection: {
                startLineNumber: 12,
                startColumn: 1,
                endLineNumber: 12,
                endColumn: 8
            }
        })
    })

    it('非法数据/损坏 JSON/清除后返回 null', () => {
        const storage = memoryStorage()
        storage.setItem(cursorSessionKey('C:\\a.md'), '{bad json')
        expect(loadCursorSession(storage, 'C:\\a.md')).toBeNull()
        expect(loadCursorSession(storage, '')).toBeNull()
        saveCursorSession(storage, 'C:\\a.md', { lineNumber: 1, column: 1, scrollTop: 0 })
        clearCursorSession(storage, 'C:\\a.md')
        expect(loadCursorSession(storage, 'C:\\a.md')).toBeNull()
    })

    it('normalizeCursorSession 拒绝缺少位置的数据', () => {
        expect(normalizeCursorSession({})).toBeNull()
        expect(normalizeCursorSession({ lineNumber: 1, column: 0 })).toBeNull()
        expect(normalizeCursorSession({ lineNumber: 1, column: 1 })).toMatchObject({
            lineNumber: 1,
            column: 1
        })
    })
})
