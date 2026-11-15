/**
 * src/main/utils/window-bounds.ts 单元测试（系统设置补充实现批次 A：#5 记住窗口位置和大小）
 *
 * 覆盖：bounds 合法性校验、与显示器工作区求交、启动初始参数决策
 * （关闭 → 历史默认 900×650；开启+合法+相交 → 恢复原值；开启+越界/非法 → 回退 1280×800 居中）、
 * resize/move 500ms 防抖写回（合并多次事件只写一次）、开关关闭/最大化跳过写回、
 * close 立即落盘、dispose 清理监听与计时器。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { WindowBounds } from '../../src/shared/types/system'
import {
    isValidWindowBounds,
    intersectsAnyWorkArea,
    resolveInitialWindowOptions,
    attachWindowBoundsPersistence,
    DEFAULT_WINDOW_WIDTH,
    DEFAULT_WINDOW_HEIGHT,
    FALLBACK_WINDOW_WIDTH,
    FALLBACK_WINDOW_HEIGHT
} from '../../src/main/utils/window-bounds'

const WORK_AREAS = [
    { x: 0, y: 0, width: 1920, height: 1080 },
    { x: 1920, y: 0, width: 1280, height: 1024 }
]

describe('isValidWindowBounds', () => {
    it('should accept finite integer bounds in range', () => {
        expect(isValidWindowBounds({ x: 10, y: 20, width: 1280, height: 800 })).toBe(true)
        expect(isValidWindowBounds({ x: -100, y: -50, width: 1, height: 1 })).toBe(true)
    })

    it('should reject null / non-object / missing fields / non-integer values', () => {
        expect(isValidWindowBounds(null)).toBe(false)
        expect(isValidWindowBounds(undefined)).toBe(false)
        expect(isValidWindowBounds('x')).toBe(false)
        expect(isValidWindowBounds({ x: 1, y: 2, width: 100 })).toBe(false)
        expect(isValidWindowBounds({ x: 1.5, y: 2, width: 100, height: 100 })).toBe(false)
        expect(isValidWindowBounds({ x: 1, y: 2, width: NaN, height: 100 })).toBe(false)
    })

    it('should reject out-of-range coordinates and sizes', () => {
        expect(isValidWindowBounds({ x: 1e9, y: 2, width: 100, height: 100 })).toBe(false)
        expect(isValidWindowBounds({ x: 1, y: 2, width: 0, height: 100 })).toBe(false)
        expect(isValidWindowBounds({ x: 1, y: 2, width: 40000, height: 100 })).toBe(false)
    })
})

describe('intersectsAnyWorkArea', () => {
    it('should return true when overlapping any work area', () => {
        expect(intersectsAnyWorkArea({ x: 100, y: 100, width: 800, height: 600 }, WORK_AREAS)).toBe(
            true
        )
        // 完全落在第二个显示器上
        expect(
            intersectsAnyWorkArea({ x: 2000, y: 100, width: 800, height: 600 }, WORK_AREAS)
        ).toBe(true)
    })

    it('should return false when the window is fully outside every work area', () => {
        expect(
            intersectsAnyWorkArea({ x: 5000, y: 5000, width: 800, height: 600 }, WORK_AREAS)
        ).toBe(false)
        // 拔掉外接显示器后：窗口坐标留在旧显示器区域之外
        expect(
            intersectsAnyWorkArea({ x: 2500, y: 100, width: 800, height: 600 }, [
                { x: 0, y: 0, width: 1920, height: 1080 }
            ])
        ).toBe(false)
    })

    it('should return false for an empty work area list', () => {
        expect(intersectsAnyWorkArea({ x: 0, y: 0, width: 800, height: 600 }, [])).toBe(false)
    })
})

describe('resolveInitialWindowOptions', () => {
    it('should keep the historical 900x650 default when rememberWindowSize is off', () => {
        const result = resolveInitialWindowOptions(false, { x: 10, y: 10, width: 1, height: 1 }, [
            { x: 0, y: 0, width: 1920, height: 1080 }
        ])
        expect(result).toEqual({ width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT })
        expect(result.x).toBeUndefined()
    })

    it('should restore valid bounds that intersect a display', () => {
        const stored = { x: 120, y: 80, width: 1366, height: 768 }
        expect(resolveInitialWindowOptions(true, stored, WORK_AREAS)).toEqual(stored)
    })

    it('should fall back to centered 1280x800 when stored bounds are offscreen', () => {
        const stored = { x: 9000, y: 9000, width: 1366, height: 768 }
        const result = resolveInitialWindowOptions(true, stored, WORK_AREAS)
        expect(result.width).toBe(FALLBACK_WINDOW_WIDTH)
        expect(result.height).toBe(FALLBACK_WINDOW_HEIGHT)
        expect(result.x).toBeUndefined()
        expect(result.y).toBeUndefined()
    })

    it('should fall back to centered 1280x800 when stored bounds are invalid or missing', () => {
        expect(resolveInitialWindowOptions(true, null, WORK_AREAS)).toEqual({
            width: FALLBACK_WINDOW_WIDTH,
            height: FALLBACK_WINDOW_HEIGHT
        })
        expect(
            resolveInitialWindowOptions(true, { x: 1, y: 2, width: 0, height: 100 }, WORK_AREAS)
        ).toEqual({ width: FALLBACK_WINDOW_WIDTH, height: FALLBACK_WINDOW_HEIGHT })
    })
})

describe('attachWindowBoundsPersistence', () => {
    /** 最小窗口桩：记录监听器并可控返回几何状态 */
    function createFakeWin(
        overrides: {
            bounds?: { x: number; y: number; width: number; height: number }
            maximized?: boolean
        } = {}
    ) {
        const listeners = new Map<string, Array<() => void>>()
        const win = {
            bounds: overrides.bounds ?? { x: 40, y: 30, width: 1024, height: 768 },
            maximized: overrides.maximized ?? false,
            destroyed: false,
            on: vi.fn((event: string, handler: () => void) => {
                const list = listeners.get(event) ?? []
                list.push(handler)
                listeners.set(event, list)
            }),
            removeListener: vi.fn((event: string, handler: () => void) => {
                const list = listeners.get(event) ?? []
                listeners.set(
                    event,
                    list.filter((fn) => fn !== handler)
                )
            }),
            isDestroyed: vi.fn(() => false),
            isMaximized: vi.fn(() => win.maximized),
            isMinimized: vi.fn(() => false),
            isFullScreen: vi.fn(() => false),
            getBounds: vi.fn(() => win.bounds)
        }
        return {
            win,
            listeners,
            trigger(event: string) {
                for (const handler of listeners.get(event) ?? []) {
                    handler()
                }
            }
        }
    }

    let save: ReturnType<typeof vi.fn<(bounds: WindowBounds) => void>>

    beforeEach(() => {
        vi.useFakeTimers()
        save = vi.fn<(bounds: WindowBounds) => void>()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('should debounce resize/move bursts into a single save after 500ms', () => {
        const { win, trigger } = createFakeWin()
        attachWindowBoundsPersistence(win as never, {
            isEnabled: () => true,
            save
        })

        trigger('resize')
        trigger('move')
        trigger('resize')
        vi.advanceTimersByTime(499)
        expect(save).not.toHaveBeenCalled()

        vi.advanceTimersByTime(1)
        expect(save).toHaveBeenCalledTimes(1)
        expect(save).toHaveBeenCalledWith({ x: 40, y: 30, width: 1024, height: 768 })
    })

    it('should not save when the setting is disabled', () => {
        const { win, trigger } = createFakeWin()
        attachWindowBoundsPersistence(win as never, {
            isEnabled: () => false,
            save
        })
        trigger('resize')
        vi.advanceTimersByTime(600)
        expect(save).not.toHaveBeenCalled()
    })

    it('should skip saving while the window is maximized', () => {
        const { win, trigger } = createFakeWin({ maximized: true })
        attachWindowBoundsPersistence(win as never, {
            isEnabled: () => true,
            save
        })
        trigger('resize')
        vi.advanceTimersByTime(600)
        expect(save).not.toHaveBeenCalled()
    })

    it('should flush pending bounds immediately on close', () => {
        const { win, trigger } = createFakeWin()
        attachWindowBoundsPersistence(win as never, {
            isEnabled: () => true,
            save
        })
        trigger('move')
        // 未到防抖窗口即关窗：立即写回，不丢失最后的位置
        trigger('close')
        expect(save).toHaveBeenCalledTimes(1)
        // 防抖计时器已清除，后续推进不再重复写回
        vi.advanceTimersByTime(600)
        expect(save).toHaveBeenCalledTimes(1)
    })

    it('should remove listeners and cancel the timer on dispose', () => {
        const { win, trigger, listeners } = createFakeWin()
        const dispose = attachWindowBoundsPersistence(win as never, {
            isEnabled: () => true,
            save
        })
        dispose()

        expect(win.removeListener).toHaveBeenCalledWith('resize', expect.any(Function))
        expect(win.removeListener).toHaveBeenCalledWith('move', expect.any(Function))
        expect(win.removeListener).toHaveBeenCalledWith('close', expect.any(Function))
        expect(listeners.get('resize') ?? []).toHaveLength(0)

        // dispose 后再触发事件不写回（监听已移除）；直接触发残留计时器也不写回
        trigger('resize')
        vi.advanceTimersByTime(600)
        expect(save).not.toHaveBeenCalled()
    })
})
