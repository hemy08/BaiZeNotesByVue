// @vitest-environment jsdom
/**
 * P0 写作统计会话：内容/选区统计、每日目标增量、切换文件基线。
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
    recordSelectionStats,
    recordWritingStats,
    resetWritingStatsBaselineForFile,
    saveDailyGoal,
    writingSessionState
} from '../../src/renderer/src/components/Markdown/useWritingSession'

describe('writing session state', () => {
    beforeEach(() => {
        localStorage.clear()
        writingSessionState.stats = {
            totalChars: 0,
            charsNoSpaces: 0,
            cjkChars: 0,
            latinWords: 0,
            paragraphs: 0,
            sentences: 0,
            readingMinutes: 0
        }
        writingSessionState.selection = { ...writingSessionState.stats }
        writingSessionState.filePath = ''
        writingSessionState.ready = false
    })

    it('记录全文统计并更新今日增量', () => {
        recordWritingStats('你好 world', 'C:\\a.md')
        expect(writingSessionState.stats.totalChars).toBeGreaterThan(0)
        expect(writingSessionState.stats.cjkChars).toBe(2)
        expect(writingSessionState.stats.latinWords).toBe(1)
        expect(writingSessionState.ready).toBe(true)
        const firstGoal = writingSessionState.goal.written
        recordWritingStats('你好 world 增加了内容', 'C:\\a.md')
        expect(writingSessionState.goal.written).toBeGreaterThan(firstGoal)
    })

    it('切换文件重置增量基线，不把另一篇文档计入今日', () => {
        recordWritingStats('第一篇文章', 'C:\\a.md')
        const before = writingSessionState.goal.written
        resetWritingStatsBaselineForFile('C:\\b.md')
        recordWritingStats('第二篇文章内容很长', 'C:\\b.md')
        expect(writingSessionState.goal.written).toBe(before)
    })

    it('选区统计与清空', () => {
        recordSelectionStats('选中的文字')
        expect(writingSessionState.selection.totalChars).toBeGreaterThan(0)
        recordSelectionStats('')
        expect(writingSessionState.selection.totalChars).toBe(0)
    })

    it('保存每日目标并更新进度', () => {
        saveDailyGoal(2000)
        expect(writingSessionState.goal.dailyGoal).toBe(2000)
        expect(writingSessionState.goal.percent).toBeGreaterThanOrEqual(0)
    })
})
