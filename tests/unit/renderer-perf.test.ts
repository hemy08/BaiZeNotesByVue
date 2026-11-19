// @vitest-environment jsdom
/**
 * 渲染层启动性能标记工具测试（P1 性能基线化）。
 *
 * 覆盖：
 * 1. 默认关闭（无 query、无覆盖）：mark/measure/report 全为空操作，且不输出控制台；
 * 2. 开关来源：URL `?baizePerf=1`、测试/诊断覆盖、全局强制开关；
 * 3. mark 同名去重 / measure 同名覆盖 / 报告 JSON 结构；
 * 4. 主进程哨兵行格式（`[BaizePerf] {json}`，含 mark/measure 载荷）；
 * 5. 全局诊断入口 `window.__BAIZE_PERF__`（getReport / getReportJson）与状态重置。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
    getPerfReport,
    getPerfReportJson,
    isPerfDiagnosticsEnabled,
    perfMark,
    perfMeasure,
    resetPerfDiagnosticsForTests,
    setPerfDiagnosticsEnabled
} from '../../src/renderer/src/common/perf'
import { PERF_CONSOLE_PREFIX, PERF_MARK } from '../../src/shared/constants/perf'

/** 重置 URL query（jsdom 环境） */
function resetLocation(): void {
    window.history.replaceState({}, '', '/')
}

/** 清掉全局强制开关（模块内 reset 只清 __BAIZE_PERF__） */
function resetGlobalForceFlag(): void {
    delete (globalThis as { __BAIZE_PERF_ENABLED__?: unknown }).__BAIZE_PERF_ENABLED__
}

beforeEach(() => {
    resetPerfDiagnosticsForTests()
    resetGlobalForceFlag()
    resetLocation()
})

afterEach(() => {
    resetPerfDiagnosticsForTests()
    resetGlobalForceFlag()
    resetLocation()
    vi.restoreAllMocks()
})

describe('渲染层诊断开关', () => {
    it('默认关闭：所有 API 空操作且不输出控制台', () => {
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)
        expect(isPerfDiagnosticsEnabled()).toBe(false)

        perfMark(PERF_MARK.MAIN_VIEW_MOUNTED)
        perfMeasure(PERF_MARK.MAIN_VIEW_MOUNTED)

        expect(getPerfReport()).toBeNull()
        expect(getPerfReportJson()).toBeNull()
        expect(infoSpy).not.toHaveBeenCalled()
    })

    it('URL ?baizePerf=1 时开启（主进程诊断模式下追加的 query）', () => {
        window.history.replaceState({}, '', '/?baizePerf=1')
        expect(isPerfDiagnosticsEnabled()).toBe(true)
        perfMark(PERF_MARK.RENDERER_READY)
        expect(getPerfReport()?.marks.map((mark) => mark.name)).toContain(PERF_MARK.RENDERER_READY)
    })

    it('测试/诊断覆盖与全局强制开关均可开启', () => {
        setPerfDiagnosticsEnabled(true)
        expect(isPerfDiagnosticsEnabled()).toBe(true)
        setPerfDiagnosticsEnabled(null)
        expect(isPerfDiagnosticsEnabled()).toBe(false)

        ;(globalThis as { __BAIZE_PERF_ENABLED__?: unknown }).__BAIZE_PERF_ENABLED__ = true
        expect(isPerfDiagnosticsEnabled()).toBe(true)
    })
})

describe('mark / measure 采集与上报格式', () => {
    it('mark 同名去重、measure 同名覆盖，报告 JSON 可解析', () => {
        setPerfDiagnosticsEnabled(true)
        const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined)

        perfMark(PERF_MARK.MAIN_VIEW_MOUNTED)
        perfMark(PERF_MARK.MAIN_VIEW_MOUNTED)
        perfMark(PERF_MARK.EDITOR_READY)
        perfMeasure(PERF_MARK.EDITOR_READY, PERF_MARK.MAIN_VIEW_MOUNTED)
        perfMeasure(PERF_MARK.EDITOR_READY, PERF_MARK.MAIN_VIEW_MOUNTED)

        const report = getPerfReport()
        expect(report).not.toBeNull()
        expect(report?.process).toBe('renderer')
        expect(report?.enabled).toBe(true)
        expect(report?.marks.map((mark) => mark.name)).toEqual([
            PERF_MARK.MAIN_VIEW_MOUNTED,
            PERF_MARK.EDITOR_READY
        ])
        expect(report?.measures.map((measure) => measure.name)).toEqual([PERF_MARK.EDITOR_READY])

        const json = getPerfReportJson()
        expect(json).not.toBeNull()
        const parsed = JSON.parse(json as string) as {
            process: string
            marks: Array<{ name: string }>
        }
        expect(parsed.process).toBe('renderer')
        expect(parsed.marks).toHaveLength(2)

        // 控制台上报：每行均为哨兵前缀 + 合法 JSON（主进程按此回收）
        expect(infoSpy.mock.calls.length).toBeGreaterThanOrEqual(3)
        for (const call of infoSpy.mock.calls) {
            const line = String(call[0])
            expect(line.startsWith(`${PERF_CONSOLE_PREFIX} `)).toBe(true)
            const payload = JSON.parse(line.slice(PERF_CONSOLE_PREFIX.length).trim()) as {
                type: string
                timeOrigin: number
            }
            expect(['mark', 'measure']).toContain(payload.type)
            expect(typeof payload.timeOrigin).toBe('number')
        }
    })

    it('measure 起始标记缺失时从时间轴起点计算（不抛错、duration 非负）', () => {
        setPerfDiagnosticsEnabled(true)
        vi.spyOn(console, 'info').mockImplementation(() => undefined)
        perfMeasure('startup:orphan-measure', 'startup:not-exists')
        const measure = getPerfReport()?.measures.find(
            (item) => item.name === 'startup:orphan-measure'
        )
        expect(measure).toBeDefined()
        expect(Number.isFinite(measure?.duration)).toBe(true)
        expect(measure?.duration ?? -1).toBeGreaterThanOrEqual(0)
    })
})

describe('诊断全局入口（获取 JSON 的入口）', () => {
    it('开启后挂载 window.__BAIZE_PERF__，可取得报告 JSON', () => {
        setPerfDiagnosticsEnabled(true)
        vi.spyOn(console, 'info').mockImplementation(() => undefined)
        perfMark(PERF_MARK.PREVIEW_READY)

        const globalEntry = (
            window as unknown as {
                __BAIZE_PERF__?: {
                    enabled: boolean
                    getReportJson: (space?: number) => string | null
                    getReport: () => { marks: Array<{ name: string }> } | null
                }
            }
        ).__BAIZE_PERF__
        expect(globalEntry).toBeDefined()
        expect(globalEntry?.enabled).toBe(true)
        const json = globalEntry?.getReportJson()
        expect(json).toBeTruthy()
        expect(JSON.parse(json as string).marks[0].name).toBe(PERF_MARK.PREVIEW_READY)
        expect(globalEntry?.getReport()?.marks[0]?.name).toBe(PERF_MARK.PREVIEW_READY)
    })

    it('重置后状态清空（用例间不串味）', () => {
        setPerfDiagnosticsEnabled(true)
        vi.spyOn(console, 'info').mockImplementation(() => undefined)
        perfMark(PERF_MARK.MAIN_VIEW_MOUNTED)
        expect(getPerfReport()?.marks).toHaveLength(1)

        resetPerfDiagnosticsForTests()
        expect((window as unknown as { __BAIZE_PERF__?: unknown }).__BAIZE_PERF__).toBeUndefined()
        expect(getPerfReport()).toBeNull()
    })
})
