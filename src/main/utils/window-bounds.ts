/**
 * 记住窗口位置和大小（系统设置补充实现批次 A：#5）
 *
 * 提供两组能力：
 * 1. resolveInitialWindowOptions —— 启动时根据 rememberWindowSize 与持久化的
 *    windowBounds 计算 BrowserWindow 初始参数：合法且与任一显示器工作区相交时
 *    恢复原位置/尺寸；越界或非法时回退默认 1280×800 居中；开关关闭时保持
 *    历史默认 900×650（不改变既有行为）。
 * 2. attachWindowBoundsPersistence —— 窗口 resize/move 事件 500ms 防抖写回
 *    bounds（经调用方注入的 isEnabled/save，避免本模块依赖 config store）；
 *    最大化/最小化/全屏状态跳过写回；close 时立即落盘一次（不再等待防抖窗口）；
 *    返回 dispose 函数用于窗口销毁/应用退出清理。
 *
 * 纯函数部分（校验/求交/决策）无 electron 依赖，可直接单测。
 */

import type { BrowserWindow } from 'electron'
import type { WindowBounds } from '../../shared/types'

/** 历史默认窗口尺寸（rememberWindowSize 未开启时保持既有行为） */
export const DEFAULT_WINDOW_WIDTH = 900
export const DEFAULT_WINDOW_HEIGHT = 650

/** rememberWindowSize 开启但持久化 bounds 缺失/非法/越界时的回退尺寸（居中） */
export const FALLBACK_WINDOW_WIDTH = 1280
export const FALLBACK_WINDOW_HEIGHT = 800

/** resize/move 写回防抖窗口（毫秒） */
export const WINDOW_BOUNDS_SAVE_DEBOUNCE_MS = 500

// 与 handlers.ts 的 AS-6 校验同范围（handlers 反向依赖 config 不可 import，常量就地复制）
/** 窗口坐标绝对值上限 */
const WINDOW_COORDINATE_LIMIT = 100000
/** 窗口尺寸上限（下限 1：真正的可用尺寸由系统窗口管理器决定） */
const WINDOW_MAX_SIZE = 32768

/** 显示器工作区（与 electron-screen 的 Display.workArea 形状一致的子集） */
export interface WorkArea {
    x: number
    y: number
    width: number
    height: number
}

/** 合法窗口边界：有限整数坐标/尺寸且绝对值在安全范围内 */
export function isValidWindowBounds(value: unknown): value is WindowBounds {
    if (typeof value !== 'object' || value === null) {
        return false
    }
    const bounds = value as Record<string, unknown>
    const numbers = [bounds.x, bounds.y, bounds.width, bounds.height]
    if (!numbers.every((n) => typeof n === 'number' && Number.isFinite(n) && Number.isInteger(n))) {
        return false
    }
    const { x, y, width, height } = bounds as unknown as WindowBounds
    return (
        Math.abs(x) <= WINDOW_COORDINATE_LIMIT &&
        Math.abs(y) <= WINDOW_COORDINATE_LIMIT &&
        width >= 1 &&
        width <= WINDOW_MAX_SIZE &&
        height >= 1 &&
        height <= WINDOW_MAX_SIZE
    )
}

/** 窗口边界与任一显示器工作区是否存在正面积相交（防拔掉外接显示器后窗口跑出屏幕） */
export function intersectsAnyWorkArea(
    bounds: WindowBounds,
    workAreas: readonly WorkArea[]
): boolean {
    for (const area of workAreas) {
        if (typeof area !== 'object' || area === null) {
            continue
        }
        const overlapWidth =
            Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x)
        const overlapHeight =
            Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y)
        if (overlapWidth > 0 && overlapHeight > 0) {
            return true
        }
    }
    return false
}

/** createWindow 用的初始窗口参数（x/y 省略表示由系统居中） */
export interface InitialWindowOptions {
    width: number
    height: number
    x?: number
    y?: number
}

/**
 * 计算主窗口初始参数：
 * - rememberWindowSize 开启且 windowBounds 合法并与任一显示器工作区相交 → 恢复原值；
 * - rememberWindowSize 开启但 bounds 缺失/非法/越界 → 回退 1280×800 居中；
 * - 开关关闭 → 保持历史默认 900×650。
 */
export function resolveInitialWindowOptions(
    rememberWindowSize: unknown,
    storedBounds: unknown,
    workAreas: readonly WorkArea[]
): InitialWindowOptions {
    if (rememberWindowSize !== true) {
        return { width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT }
    }
    if (isValidWindowBounds(storedBounds) && intersectsAnyWorkArea(storedBounds, workAreas)) {
        return {
            x: storedBounds.x,
            y: storedBounds.y,
            width: storedBounds.width,
            height: storedBounds.height
        }
    }
    return { width: FALLBACK_WINDOW_WIDTH, height: FALLBACK_WINDOW_HEIGHT }
}

/** attachWindowBoundsPersistence 的依赖注入参数 */
export interface WindowBoundsPersistenceOptions {
    /** 当前是否开启「记住窗口位置和大小」（读系统设置） */
    isEnabled: () => boolean
    /** 持久化回调（写 system store 的 windowBounds） */
    save: (bounds: WindowBounds) => void
    /** 防抖毫秒数（默认 500） */
    debounceMs?: number
}

/**
 * 挂接主窗口 resize/move 的 bounds 持久化：
 * - resize/move → debounceMs 防抖后写回（isEnabled 关闭、最大化/最小化/全屏时跳过）；
 * - close → 立即落盘一次（关窗前的最后一次位置/尺寸不丢失）；
 * - 返回 dispose：清除计时器并移除监听（挂入 index.ts 的 cleanupApp 体系）。
 */
export function attachWindowBoundsPersistence(
    win: BrowserWindow,
    options: WindowBoundsPersistenceOptions
): () => void {
    const debounceMs = options.debounceMs ?? WINDOW_BOUNDS_SAVE_DEBOUNCE_MS
    let timer: NodeJS.Timeout | null = null

    const clearTimer = (): void => {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
    }

    const persist = (): void => {
        clearTimer()
        try {
            if (!options.isEnabled()) {
                return
            }
            if (win.isDestroyed()) {
                return
            }
            // 最大化/最小化/全屏状态下 getBounds 是临时几何，不写入记忆
            if (win.isMaximized() || win.isMinimized() || win.isFullScreen()) {
                return
            }
            const bounds = win.getBounds()
            if (isValidWindowBounds(bounds)) {
                options.save(bounds)
            }
        } catch (error) {
            // 防抖写回失败不影响窗口流程（如销毁竞态），仅保留调试日志出口
            void error
        }
    }

    const schedule = (): void => {
        clearTimer()
        timer = setTimeout(persist, debounceMs)
    }

    win.on('resize', schedule)
    win.on('move', schedule)
    win.on('close', persist)

    return () => {
        clearTimer()
        win.removeListener('resize', schedule)
        win.removeListener('move', schedule)
        win.removeListener('close', persist)
    }
}
