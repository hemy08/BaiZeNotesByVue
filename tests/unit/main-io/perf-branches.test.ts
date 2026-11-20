/**
 * 覆盖率补测第五批：perf.ts（主进程启动性能标记）边界分支。
 *
 * 覆盖点（此前未覆盖的语句/分支）：
 * - 无 performance 环境：now() 回退 Date.now、timeOrigin() 回退 0；
 * - parseRendererPerfLine 全部非法形态（空 payload / 非对象 / 缺 name / 非法 mark、measure、
 *   未知 type）；
 * - handleRendererConsoleMessage 未挂接时短路；
 * - setupPerfDiagnostics：未开启时短路、重复挂接短路、相对 BAISE_PERF_OUT 路径解析、
 *   写入失败只告警一次、quit-on-complete 与 quit-after-ms 兜底退出；
 * - 渲染层 measure 合并（同名覆盖 / 新增）与段耗时 measure 的四个映射分支 + 默认分支；
 * - buildPerfSummary 缺失标记时的 null 计算、buildPerfReportFile 未开启时 summary 为 null；
 * - withPerfQueryParam 非法 URL 的字符串兜底（含 / 不含 ? 两种分隔符）；
 * - resetPerfDiagnosticsForTests 清理已排期的两个退出计时器。
 */
import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import type { BrowserWindow } from 'electron'
import {
    buildPerfReportFile,
    buildPerfSummary,
    getPerfReport,
    getPerfReportJson,
    handleRendererConsoleMessage,
    parseRendererPerfLine,
    perfMark,
    perfMeasure,
    resetPerfDiagnosticsForTests,
    setPerfDiagnosticsEnabled,
    setupPerfDiagnostics,
    withPerfQueryParam
} from '../../../src/main/utils/perf'
import {
    PERF_CONSOLE_PREFIX,
    PERF_MARK,
    PERF_SEGMENT_MEASURE
} from '../../../src/shared/constants/perf'
import type { PerfProcessReport } from '../../../src/main/utils/perf'

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-perf5-test-'))

interface FakeWindow {
    win: BrowserWindow
    listeners: Array<(details: { message?: string }) => void>
}

function createFakeWindow(): FakeWindow {
    const listeners: FakeWindow['listeners'] = []
    const webContents = {
        on: vi.fn((event: string, listener: FakeWindow['listeners'][number]) => {
            if (event === 'console-message') listeners.push(listener)
        })
    }
    return { win: { webContents } as unknown as BrowserWindow, listeners }
}

function emit(fake: FakeWindow, message: unknown): void {
    for (const listener of fake.listeners) listener({ message: message as string })
}

function markLine(name: string, at = 12.5, timeOrigin: unknown = 1000): string {
    return `${PERF_CONSOLE_PREFIX} ${JSON.stringify({ type: 'mark', name, at, timeOrigin })}`
}

function measureLine(name: string, start = 1, duration = 2): string {
    return `${PERF_CONSOLE_PREFIX} ${JSON.stringify({ type: 'measure', name, start, duration })}`
}

function disableAllSwitches(): void {
    vi.stubEnv('BAIZE_PERF', '')
    vi.stubEnv('ELECTRON_RENDERER_URL', '')
    vi.stubEnv('BAIZE_PERF_OUT', '')
    vi.stubEnv('BAIZE_PERF_QUIT_ON_COMPLETE', '')
    vi.stubEnv('BAIZE_PERF_QUIT_AFTER_MS', '')
}

beforeEach(() => {
    resetPerfDiagnosticsForTests()
    disableAllSwitches()
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    resetPerfDiagnosticsForTests()
})

afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('无 performance 环境回退', () => {
    it('now() 回退 Date.now、timeOrigin() 回退 0，采集仍可用', () => {
        vi.stubGlobal('performance', undefined)
        setPerfDiagnosticsEnabled(true)
        perfMark(PERF_MARK.APP_READY)
        perfMeasure('startup:no-performance')
        const report = getPerfReport()
        expect(report).not.toBeNull()
        expect(report?.timeOrigin).toBe(0)
        expect(report?.marks[0]?.at).toBeGreaterThan(0)
    })
})

describe('parseRendererPerfLine 非法形态', () => {
    it('非字符串 / 非哨兵前缀 / 空 payload 均返回 null', () => {
        expect(parseRendererPerfLine(undefined)).toBeNull()
        expect(parseRendererPerfLine(123)).toBeNull()
        expect(parseRendererPerfLine('plain console output')).toBeNull()
        expect(parseRendererPerfLine(`${PERF_CONSOLE_PREFIX}   `)).toBeNull()
    })

    it('非法 JSON / JSON 标量 / 缺少 name 均返回 null', () => {
        expect(parseRendererPerfLine(`${PERF_CONSOLE_PREFIX} {not-json`)).toBeNull()
        expect(parseRendererPerfLine(`${PERF_CONSOLE_PREFIX} null`)).toBeNull()
        expect(parseRendererPerfLine(`${PERF_CONSOLE_PREFIX} "text"`)).toBeNull()
        expect(parseRendererPerfLine(`${PERF_CONSOLE_PREFIX} 42`)).toBeNull()
        expect(
            parseRendererPerfLine(`${PERF_CONSOLE_PREFIX} ${JSON.stringify({ type: 'mark' })}`)
        ).toBeNull()
        expect(
            parseRendererPerfLine(
                `${PERF_CONSOLE_PREFIX} ${JSON.stringify({ type: 'mark', name: '' })}`
            )
        ).toBeNull()
    })

    it('mark 记录 at 非有限数字返回 null，timeOrigin 非法时回退 0', () => {
        const badMark = `${PERF_CONSOLE_PREFIX} ${JSON.stringify({
            type: 'mark',
            name: PERF_MARK.RENDERER_READY,
            at: 'NaN'
        })}`
        expect(parseRendererPerfLine(badMark)).toBeNull()
        const okMark = parseRendererPerfLine(markLine(PERF_MARK.RENDERER_READY, 3, 'bad-origin'))
        expect(okMark).toEqual({
            type: 'mark',
            name: PERF_MARK.RENDERER_READY,
            at: 3,
            timeOrigin: 0
        })
    })

    it('measure 记录 start/duration 非有限数字返回 null，合法时透传', () => {
        expect(
            parseRendererPerfLine(
                `${PERF_CONSOLE_PREFIX} ${JSON.stringify({
                    type: 'measure',
                    name: 'x',
                    start: 'bad',
                    duration: 1
                })}`
            )
        ).toBeNull()
        expect(
            parseRendererPerfLine(
                `${PERF_CONSOLE_PREFIX} ${JSON.stringify({
                    type: 'measure',
                    name: 'x',
                    start: 1,
                    duration: Number.POSITIVE_INFINITY
                })}`
            )
        ).toBeNull()
        expect(parseRendererPerfLine(measureLine('startup:custom', 5, 6))).toEqual({
            type: 'measure',
            name: 'startup:custom',
            start: 5,
            duration: 6,
            timeOrigin: 0
        })
    })

    it('未知 type 返回 null', () => {
        expect(
            parseRendererPerfLine(
                `${PERF_CONSOLE_PREFIX} ${JSON.stringify({ type: 'unknown', name: 'x' })}`
            )
        ).toBeNull()
    })
})

describe('handleRendererConsoleMessage 短路', () => {
    it('未挂接诊断时忽略所有消息', () => {
        setPerfDiagnosticsEnabled(true)
        handleRendererConsoleMessage(markLine(PERF_MARK.RENDERER_READY))
        expect(getPerfReport()?.marks).toEqual([])
    })
})

describe('setupPerfDiagnostics 边界', () => {
    it('诊断未开启时直接返回、不挂接监听', () => {
        const fake = createFakeWindow()
        setupPerfDiagnostics(fake.win)
        expect(fake.listeners).toHaveLength(0)
    })

    it('重复挂接幂等（第二次不重复注册监听且保留首次静默）', () => {
        setPerfDiagnosticsEnabled(true)
        const fake = createFakeWindow()
        setupPerfDiagnostics(fake.win)
        setupPerfDiagnostics(fake.win)
        expect(fake.listeners).toHaveLength(1)
    })

    it('相对 BAIZE_PERF_OUT 按 cwd 解析并同步落盘', () => {
        setPerfDiagnosticsEnabled(true)
        // vitest worker 内 process.chdir 不可用：用仓库内 gitignore 的 out/ 相对路径
        const relativeOut = path.join('out', 'tool-results', 'cov5-perf-out', 'perf.json')
        const absoluteOut = path.resolve(process.cwd(), relativeOut)
        fs.rmSync(path.dirname(absoluteOut), { recursive: true, force: true })
        try {
            vi.stubEnv('BAIZE_PERF_OUT', relativeOut)
            const fake = createFakeWindow()
            setupPerfDiagnostics(fake.win)
            expect(fs.existsSync(absoluteOut)).toBe(true)
            const written = JSON.parse(fs.readFileSync(absoluteOut, 'utf-8')) as {
                outputPath: string
            }
            expect(written.outputPath).toBe(absoluteOut)
        } finally {
            fs.rmSync(path.dirname(absoluteOut), { recursive: true, force: true })
        }
    })

    it('落盘失败只告警一次', () => {
        setPerfDiagnosticsEnabled(true)
        const blocker = path.join(tempRoot, 'blocker-file')
        fs.writeFileSync(blocker, 'x')
        vi.stubEnv('BAIZE_PERF_OUT', path.join(blocker, 'perf.json'))
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
        const fake = createFakeWindow()
        setupPerfDiagnostics(fake.win)
        perfMark(PERF_MARK.APP_READY)
        perfMark(PERF_MARK.WINDOW_CREATE)
        const writeWarnings = warn.mock.calls.filter((call) =>
            String(call[0]).includes('写入性能基线报告失败')
        )
        expect(writeWarnings).toHaveLength(1)
    })

    it('渲染层 measure 合并：新增与同名覆盖', () => {
        setPerfDiagnosticsEnabled(true)
        vi.stubEnv('BAIZE_PERF_OUT', path.join(tempRoot, 'measure-merge', 'perf.json'))
        const fake = createFakeWindow()
        setupPerfDiagnostics(fake.win)
        emit(fake, measureLine('startup:custom', 1, 2))
        emit(fake, measureLine('startup:custom', 3, 4))
        emit(fake, measureLine('startup:second', 5, 6))
        const report = buildPerfReportFile().renderer
        expect(report?.measures).toEqual([
            { name: 'startup:custom', start: 3, duration: 4 },
            { name: 'startup:second', start: 5, duration: 6 }
        ])
    })

    it('四个跨阶段 measure 映射分支 + 未映射标记的默认分支', () => {
        setPerfDiagnosticsEnabled(true)
        const fake = createFakeWindow()
        setupPerfDiagnostics(fake.win)
        emit(fake, markLine(PERF_MARK.WINDOW_CREATE, 1))
        emit(fake, markLine(PERF_MARK.RENDERER_READY, 2))
        emit(fake, markLine(PERF_MARK.MAIN_VIEW_MOUNTED, 3))
        emit(fake, markLine(PERF_MARK.EDITOR_READY, 4))
        emit(fake, markLine(PERF_MARK.PREVIEW_READY, 5))
        emit(fake, markLine('startup:uncategorized', 6))
        const measureNames = (getPerfReport()?.measures ?? []).map((measure) => measure.name)
        expect(measureNames).toEqual(
            expect.arrayContaining([
                PERF_SEGMENT_MEASURE.WINDOW_TO_RENDERER_READY,
                PERF_SEGMENT_MEASURE.WINDOW_TO_MAIN_VIEW_MOUNTED,
                PERF_SEGMENT_MEASURE.WINDOW_TO_EDITOR_READY,
                PERF_SEGMENT_MEASURE.WINDOW_TO_PREVIEW_READY
            ])
        )
        expect(measureNames).toHaveLength(4)
    })

    it('同一渲染层 mark 重复上报时仅保留首条', () => {
        setPerfDiagnosticsEnabled(true)
        const fake = createFakeWindow()
        setupPerfDiagnostics(fake.win)
        emit(fake, markLine(PERF_MARK.RENDERER_READY, 2))
        emit(fake, markLine(PERF_MARK.RENDERER_READY, 99))
        const renderer = buildPerfReportFile().renderer
        const rendererReady = renderer?.marks.filter(
            (mark) => mark.name === PERF_MARK.RENDERER_READY
        )
        expect(rendererReady).toHaveLength(1)
        expect(rendererReady?.[0]?.at).toBe(2)
    })

    it('quit-on-complete：preview-ready 后延迟 1s 退出；兜底超时先到也会退出', () => {
        vi.useFakeTimers()
        setPerfDiagnosticsEnabled(true)
        vi.stubEnv('BAIZE_PERF_QUIT_ON_COMPLETE', '1')
        vi.stubEnv('BAIZE_PERF_QUIT_AFTER_MS', '50')
        const quit = vi.fn()
        const fake = createFakeWindow()
        setupPerfDiagnostics(fake.win, quit)
        emit(fake, markLine(PERF_MARK.PREVIEW_READY, 1))
        // 兜底计时器先到（50ms < 1000ms）
        vi.advanceTimersByTime(60)
        expect(quit).toHaveBeenCalledTimes(1)
        // 完成计时器随后到（再次退出）
        vi.advanceTimersByTime(1000)
        expect(quit).toHaveBeenCalledTimes(2)
    })

    it('不存在 quit 回调时 preview-ready 不排期退出', () => {
        vi.useFakeTimers()
        setPerfDiagnosticsEnabled(true)
        vi.stubEnv('BAIZE_PERF_QUIT_ON_COMPLETE', '1')
        const fake = createFakeWindow()
        setupPerfDiagnostics(fake.win)
        emit(fake, markLine(PERF_MARK.PREVIEW_READY, 1))
        expect(vi.getTimerCount()).toBe(0)
    })
})

describe('报告结构与 summary 兜底', () => {
    it('诊断未开启时 buildPerfReportFile 的 main/renderer/summary 均为 null', () => {
        const file = buildPerfReportFile()
        expect(file.main).toBeNull()
        expect(file.renderer).toBeNull()
        expect(file.summary).toBeNull()
        expect(file.mode).toEqual({ env: false, argv: false, devServer: false })
        expect(file.outputPath).toBeNull()
    })

    it('标记缺失时 summary 的派生耗时为 null', () => {
        const report: PerfProcessReport = {
            process: 'main',
            enabled: true,
            timeOrigin: 1000,
            marks: [{ name: PERF_MARK.APP_READY, at: 5 }],
            measures: []
        }
        const summary = buildPerfSummary(report)
        expect(summary.appReadyMs).toBe(5)
        expect(summary.windowToRendererReadyMs).toBeNull()
        expect(summary.rendererReadyToPreviewReadyMs).toBeNull()
    })

    it('getPerfReportJson 支持缩进参数', () => {
        setPerfDiagnosticsEnabled(true)
        perfMark(PERF_MARK.APP_READY)
        expect(getPerfReportJson(0)).not.toContain('\n')
        expect(getPerfReportJson(2)).toContain('\n')
    })
})

describe('withPerfQueryParam 兜底', () => {
    it('合法 URL 追加 query 参数', () => {
        expect(withPerfQueryParam('http://127.0.0.1:5173/index.html?a=1')).toBe(
            'http://127.0.0.1:5173/index.html?a=1&baizePerf=1'
        )
        expect(withPerfQueryParam('http://127.0.0.1:5173/index.html')).toBe(
            'http://127.0.0.1:5173/index.html?baizePerf=1'
        )
    })

    it('非法 URL 走字符串兜底（含 ? 与不含 ? 两种分隔符）', () => {
        expect(withPerfQueryParam('not-a-valid-url')).toBe('not-a-valid-url?baizePerf=1')
        // 兜底分支按 split('?')[0] 取路径（'?broken' 路径段为空）
        expect(withPerfQueryParam('?broken')).toBe('&baizePerf=1')
    })
})

describe('resetPerfDiagnosticsForTests 清理排期计时器', () => {
    it('清理 quit-on-complete 完成计时器与兜底计时器', () => {
        vi.useFakeTimers()
        setPerfDiagnosticsEnabled(true)
        vi.stubEnv('BAIZE_PERF_QUIT_ON_COMPLETE', '1')
        vi.stubEnv('BAIZE_PERF_QUIT_AFTER_MS', '5000')
        const fake = createFakeWindow()
        setupPerfDiagnostics(fake.win, vi.fn())
        emit(fake, markLine(PERF_MARK.PREVIEW_READY, 1))
        expect(vi.getTimerCount()).toBe(2)
        resetPerfDiagnosticsForTests()
        expect(vi.getTimerCount()).toBe(0)
    })
})
