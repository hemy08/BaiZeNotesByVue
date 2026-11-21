/**
 * 写作模式（P0）——渲染层单例状态
 *
 * 目标：把已有的编辑器/主题/功能开关组合成一套「沉浸写作」预设，而不是新增
 * 一套编辑器实现。写作模式只影响呈现与编辑行为，不改文档模型、不写主进程配置。
 *
 * 持久化：本机 localStorage（仅 UI 偏好；失败静默降级，不阻塞写作）。
 * 与其他配置的关系：
 * - 写作模式是「临时预设」，不会修改系统设置中的能力开关；
 * - 关闭写作模式后恢复进入前的编辑器选项/布局。
 */
import { reactive } from 'vue'

/** 写作模式偏好（全部为 UI 层偏好，可安全重建） */
export interface WritingModeState {
    enabled: boolean
    /** 打字机模式：光标保持屏幕垂直中部附近 */
    typewriter: boolean
    /** 当前段落高亮（Focus） */
    focusParagraph: boolean
    /** 正文最大宽度（px，用于编辑器/预览容器限宽） */
    contentWidth: number
    /** 编辑器字号（px） */
    fontSize: number
    /** 编辑器行高（px，Monaco lineHeight） */
    lineHeight: number
    /** 每日写作目标（字符数） */
    dailyGoal: number
    /** 写作模式内是否显示格式工具栏（默认隐藏，保持沉浸） */
    showToolbar: boolean
    /** 写作模式内是否显示预览（默认关闭，可按需分屏预览） */
    showPreview: boolean
}

const STORAGE_KEY = 'baize:writing-mode:v1'

export const WRITING_MODE_DEFAULTS: Readonly<WritingModeState> = {
    enabled: false,
    typewriter: true,
    focusParagraph: true,
    contentWidth: 760,
    fontSize: 16,
    lineHeight: 30,
    dailyGoal: 1000,
    showToolbar: false,
    showPreview: false
}

/** 数值范围（防 localStorage 被写入异常值） */
const RANGES = {
    contentWidth: { min: 480, max: 1400 },
    fontSize: { min: 12, max: 28 },
    lineHeight: { min: 18, max: 56 },
    dailyGoal: { min: 100, max: 100000 }
}

function clampNumber(value: unknown, fallback: number, min: number, max: number): number {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
    return Math.min(max, Math.max(min, Math.round(value)))
}

/** 把任意存储值归一化为合法偏好 */
export function normalizeWritingModeState(raw: unknown): WritingModeState {
    if (!raw || typeof raw !== 'object') {
        return { ...WRITING_MODE_DEFAULTS }
    }
    const source = raw as Record<string, unknown>
    return {
        enabled: source.enabled === true,
        typewriter: source.typewriter !== false,
        focusParagraph: source.focusParagraph !== false,
        contentWidth: clampNumber(
            source.contentWidth,
            WRITING_MODE_DEFAULTS.contentWidth,
            RANGES.contentWidth.min,
            RANGES.contentWidth.max
        ),
        fontSize: clampNumber(
            source.fontSize,
            WRITING_MODE_DEFAULTS.fontSize,
            RANGES.fontSize.min,
            RANGES.fontSize.max
        ),
        lineHeight: clampNumber(
            source.lineHeight,
            WRITING_MODE_DEFAULTS.lineHeight,
            RANGES.lineHeight.min,
            RANGES.lineHeight.max
        ),
        dailyGoal: clampNumber(
            source.dailyGoal,
            WRITING_MODE_DEFAULTS.dailyGoal,
            RANGES.dailyGoal.min,
            RANGES.dailyGoal.max
        ),
        showToolbar: source.showToolbar === true,
        showPreview: source.showPreview === true
    }
}

function resolveStorage(): Storage | null {
    try {
        return typeof window !== 'undefined' ? window.localStorage : null
    } catch {
        return null
    }
}

function loadState(): WritingModeState {
    const storage = resolveStorage()
    if (!storage) return { ...WRITING_MODE_DEFAULTS }
    try {
        const raw = storage.getItem(STORAGE_KEY)
        if (!raw) return { ...WRITING_MODE_DEFAULTS }
        return normalizeWritingModeState(JSON.parse(raw))
    } catch {
        return { ...WRITING_MODE_DEFAULTS }
    }
}

/** 单例状态（组件直接消费；避免事件总线/多份副本漂移） */
export const writingModeState = reactive<WritingModeState>(loadState())

let persistTimer: ReturnType<typeof setTimeout> | null = null

/** 持久化（短暂防抖；localStorage 不可用时静默降级） */
export function persistWritingMode(): void {
    if (persistTimer !== null) {
        clearTimeout(persistTimer)
    }
    persistTimer = setTimeout(() => {
        persistTimer = null
        const storage = resolveStorage()
        if (!storage) return
        try {
            storage.setItem(STORAGE_KEY, JSON.stringify(writingModeState))
        } catch {
            // 隐私模式/配额不足：偏好丢失可接受，不影响写作本身
        }
    }, 200)
}

/** 更新偏好并持久化（局部补丁） */
export function updateWritingMode(patch: Partial<WritingModeState>): void {
    const normalized = normalizeWritingModeState({ ...writingModeState, ...patch })
    Object.assign(writingModeState, normalized)
    persistWritingMode()
}

/** 开启写作模式（保留上次偏好） */
export function enterWritingMode(): void {
    updateWritingMode({ enabled: true })
}

/** 退出写作模式 */
export function exitWritingMode(): void {
    updateWritingMode({ enabled: false })
}

/** 切换写作模式 */
export function toggleWritingMode(): void {
    updateWritingMode({ enabled: !writingModeState.enabled })
}

/** 恢复默认写作偏好（仍保持当前开关状态） */
export function resetWritingModePreferences(): void {
    const enabled = writingModeState.enabled
    Object.assign(writingModeState, { ...WRITING_MODE_DEFAULTS, enabled })
    persistWritingMode()
}

/** 供非组件模块判断当前是否处于写作模式 */
export function isWritingModeActive(): boolean {
    return writingModeState.enabled
}

/** 组件消费入口：返回单例状态与操作函数 */
export function useWritingMode(): {
    state: WritingModeState
    enterWritingMode: typeof enterWritingMode
    exitWritingMode: typeof exitWritingMode
    toggleWritingMode: typeof toggleWritingMode
    updateWritingMode: typeof updateWritingMode
} {
    return {
        state: writingModeState,
        enterWritingMode,
        exitWritingMode,
        toggleWritingMode,
        updateWritingMode
    }
}
