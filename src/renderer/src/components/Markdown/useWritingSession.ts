/**
 * 写作统计会话（P0-3）——编辑器 ↔ 状态栏/写作模式共享状态。
 *
 * - 仅当系统设置「编写体验 → 写作统计」开启时由编辑器更新；
 * - 统计按内容变化防抖计算（在编辑器侧调度，本模块只做同步计算/状态合并）；
 * - 每日目标进度采用「本次会话内当前文件字数增量」累计：同一文件内正向新增才计入，
 *   切换文件不把另一篇文档的字数误算为今日新增；删除内容不扣减（目标用于鼓励写作）；
 * - localStorage 不可用时进度仍在内存中更新，只是不持久化。
 */
import { reactive } from 'vue'
import {
    computeSelectionStats,
    computeWritingStats,
    createEmptyWritingStats,
    type WritingStats
} from './writing-stats'
import {
    addWritingProgress,
    computeWritingGoalProgress,
    getWritingGoalProgress,
    getLocalDateString,
    loadWritingGoal,
    saveWritingGoal,
    type WritingGoalProgress,
    type WritingGoalStorage
} from './writing-goal'

export interface WritingSessionState {
    stats: WritingStats
    selection: WritingStats
    goal: WritingGoalProgress
    /** 当前统计对应的文件路径（切换文件时重置增量基线） */
    filePath: string
    /** 是否已有有效统计（用于状态栏空态） */
    ready: boolean
}

function resolveStorage(): WritingGoalStorage | null {
    try {
        if (typeof window === 'undefined') return null
        const storage = window.localStorage
        if (!storage) return null
        return {
            getItem: (key) => storage.getItem(key),
            setItem: (key, value) => storage.setItem(key, value)
        }
    } catch {
        return null
    }
}

const storage = resolveStorage()

function initialGoal(): WritingGoalProgress {
    return getWritingGoalProgress(storage)
}

export const writingSessionState = reactive<WritingSessionState>({
    stats: createEmptyWritingStats(),
    selection: createEmptyWritingStats(),
    goal: initialGoal(),
    filePath: '',
    ready: false
})

/** 同一文件内上次统计的字数（用于计算今日新增；切换文件重置） */
let lastTotalChars = 0

/** 记录全文统计；filePath 变化时只重置基线，不累加 */
export function recordWritingStats(text: string, filePath: string): void {
    const previousPath = writingSessionState.filePath
    if (previousPath && previousPath !== filePath) {
        lastTotalChars = 0
    }
    const next = computeWritingStats(text)
    writingSessionState.stats = next
    writingSessionState.filePath = filePath
    writingSessionState.ready = true

    if (lastTotalChars === 0) {
        lastTotalChars = next.totalChars
        return
    }
    const delta = next.totalChars - lastTotalChars
    lastTotalChars = next.totalChars
    if (delta <= 0) {
        writingSessionState.goal = computeWritingGoalProgress(loadWritingGoal(storage))
        return
    }
    addWritingProgress(storage, delta)
    writingSessionState.goal = computeWritingGoalProgress(loadWritingGoal(storage))
}

/** 切换文件：重置增量基线（不累加另一篇文档字数） */
export function resetWritingStatsBaselineForFile(filePath: string): void {
    if (writingSessionState.filePath === filePath) return
    writingSessionState.filePath = filePath
    writingSessionState.stats = createEmptyWritingStats()
    writingSessionState.selection = createEmptyWritingStats()
    writingSessionState.ready = false
    lastTotalChars = 0
    writingSessionState.goal = computeWritingGoalProgress(loadWritingGoal(storage))
}

/** 记录选区统计（无选区时归零） */
export function recordSelectionStats(text: string): void {
    writingSessionState.selection = text ? computeSelectionStats(text) : createEmptyWritingStats()
}

/** 保存每日目标（同时同步写作模式偏好中的目标值由调用方处理） */
export function saveDailyGoal(dailyGoal: number): void {
    const today = getLocalDateString()
    const current = loadWritingGoal(storage, today)
    saveWritingGoal(storage, { ...current, dailyGoal, date: today })
    writingSessionState.goal = computeWritingGoalProgress(loadWritingGoal(storage, today))
}

/** 刷新目标（跨天/外部存储变化时调用） */
export function refreshWritingGoal(): void {
    writingSessionState.goal = getWritingGoalProgress(storage)
}

/** 空统计的只读常量（状态栏未启用统计时使用） */
export const EMPTY_WRITING_STATS = createEmptyWritingStats()
