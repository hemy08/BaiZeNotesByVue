/**
 * 主进程启动性能标记工具测试（P1 性能基线化）。
 *
 * 覆盖：
 * 1. 诊断开关（默认关闭 / BAIZE_PERF 环境变量 / --baize-perf 参数 / 覆盖开关）；
 * 2. mark/measure 采集与报告 JSON 结构（mark 同名去重、measure 同名覆盖、段耗时计算）；
 * 3. 渲染层控制台哨兵行解析（合法 mark/measure、非哨兵、非法 JSON、字段类型不符）；
 * 4. setupPerfDiagnostics：控制台采集 → 主进程时间轴镜像标记 → 增量写 BAIZE_PERF_OUT；
 * 5. 基线脚本自动退出开关（quit-on-complete + 兜底超时）；
 * 6. withPerfQueryParam / buildPerfSummary / 状态重置。
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
    isPerfDiagnosticsEnabled,
    parseRendererPerfLine,
    perfMark,
    perfMeasure,
    resetPerfDiagnosticsForTests,
    setPerfDiagnosticsEnabled,
    setupPerfDiagnostics,
    withPerfQueryParam
} from '../../src/main/utils/perf'
import { PERF_CONSOLE_PREFIX, PERF_MARK } from '../../src/shared/constants/perf'

/** 段耗时 measure 名（与 src/shared/constants/perf.ts 中 PERF_SEGMENT_MEASURE 对齐） */
const PERF_SEGMENT_NAME = 'startup:window-to-renderer-ready'

/** 临时目录：报告落盘用例使用，本文件结束后整体清理 */
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'baize-perf-test-'))

/** 关闭全部自动开关（环境变量显式置空 + 清掉 dev server URL） */
function disableAutoSwitches(): void {
    vi.stubEnv('BAIZE_PERF', '')
    vi.stubEnv('ELECTRON_RENDERER_URL', '')
    vi.stubEnv('BAIZE_PERF_OUT', '')
    vi.stubEnv('BAIZE_PERF_QUIT_ON_COMPLETE', '')
    vi.stubEnv('BAIZE_PERF_QUIT_AFTER_MS', '')
}

/** 构造控制台消息监听收集器（模拟 BrowserWindow.webContents.on） */
interface FakeWindow {
    win: BrowserWindow
    listeners: Array<(details: unknown, level?: unknown, message?: unknown) => void>
}

function createFakeWindow(): FakeWindow {
    const listeners: FakeWindow['listeners'] = []
    const webContents = {
        on: vi.fn((event: string, listener: FakeWindow['listeners'][number]) => {
            if (event === 'console-message') {
                listeners.push(listener)
            }
        })
    }
    return { win: { webContents } as unknown as BrowserWindow, listeners }
}

/** 触发一次渲染层控制台上报（主进程 Electron 新版事件签名：详情对象携带 message） */
function emitRendererConsole(fake: FakeWindow, message: string): void {
    for (const listener of fake.listeners) {
        listener({ message })
    }
}

/** 构造渲染层 mark 哨兵行 */
function rendererMarkLine(name: string, at: number, timeOrigin = 1000): string {
    return `${PERF_CONSOLE_PREFIX} ${JSON.stringify({ type: 'mark', name, at, timeOrigin })}`
}

/** 读临时报告文件 */
function readReportFile(file: string): Record<string, unknown> | null {
    if (!fs.existsSync(file)) {
        return null
    }
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>
}

beforeEach(() => {
    resetPerfDiagnosticsForTests()
    disableAutoSwitches()
    // 采集会输出 [perf] 行；单测中静音，避免污染测试输出（断言走报告结构）
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
})

afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
    resetPerfDiagnosticsForTests()
})

afterAll(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true })
})

describe('诊断开关（默认关闭，避免生产噪音）', () => {
    it('默认全部关闭：isPerfDiagnosticsEnabled=false 且 mark/report 均为空操作', () => {
        expect(isPerfDiagnosticsEnabled()).toBe(false)

        perfMark(PERF_MARK.APP_READY)
        perfMeasure('startup:anything')

        expect(getPerfReport()).toBeNull()
        expect(getPerfReportJson()).toBeNull()
    })

    it('BAIZE_PERF=1 时开启', () => {
        vi.stubEnv('BAIZE_PERF', '1')
        expect(isPerfDiagnosticsEnabled()).toBe(true)
    })

    it('--baize-perf 命令行参数时开启', () => {
        process.argv.push('--baize-perf')
        try {
            expect(isPerfDiagnosticsEnabled()).toBe(true)
        } finally {
            process.argv.pop()
        }
    })

    it('ELECTRON_RENDERER_URL（dev server 模式）时开启', () => {
        vi.stubEnv('ELECTRON_RENDERER_URL', 'http://localhost:5173/')
        expect(isPerfDiagnosticsEnabled()).toBe(true)
    })

    it('setPerfDiagnosticsEnabled 覆盖优先于环境变量', () => {
        setPerfDiagnosticsEnabled(true)
        expect(isPerfDiagnosticsEnabled()).toBe(true)
        setPerfDiagnosticsEnabled(false)
        expect(isPerfDiagnosticsEnabled()).toBe(false)
    })
})

describe('mark / measure 采集与报告结构', () => {
    it('mark 按名称去重、measure 按名称覆盖，报告 JSON 可解析', () => {
        vi.stubEnv('BAIZE_PERF', '1')

        perfMark(PERF_MARK.APP_READY)
        perfMark(PERF_MARK.APP_READY)
        perfMark(PERF_MARK.WINDOW_CREATE)
        perfMeasure(PERF_MARK.APP_READY)
        perfMeasure(PERF_SEGMENT_NAME, PERF_MARK.APP_READY)

        const report = getPerfReport()
        expect(report).not.toBeNull()
        expect(report?.process).toBe('main')
        expect(report?.enabled).toBe(true)
        expect(report?.marks.map((mark) => mark.name)).toEqual([
            PERF_MARK.APP_READY,
            PERF_MARK.WINDOW_CREATE
        ])
        expect(report?.measures.map((measure) => measure.name)).toEqual([
            PERF_MARK.APP_READY,
            PERF_SEGMENT_NAME
        ])
        // 段耗时：以 app-ready 为起点，duration 必为有限非负数
        const segment = report?.measures.find((measure) => measure.name === PERF_SEGMENT_NAME)
        expect(Number.isFinite(segment?.duration)).toBe(true)
        expect(segment?.duration ?? -1).toBeGreaterThanOrEqual(0)

        const parsedJson = getPerfReportJson()
        expect(parsedJson).not.toBeNull()
        expect(JSON.parse(parsedJson as string).marks).toHaveLength(2)
    })

    it('buildPerfSummary 计算关键阶段耗时（缺失阶段为 null）', () => {
        vi.stubEnv('BAIZE_PERF', '1')
        // 直接构造报告，避免依赖真实时钟波动
        const summary = buildPerfSummary({
            process: 'main',
            enabled: true,
            timeOrigin: 1000,
            marks: [
                { name: PERF_MARK.APP_READY, at: 800 },
                { name: PERF_MARK.WINDOW_CREATE, at: 1200 },
                { name: PERF_MARK.RENDERER_READY, at: 2600 },
                { name: PERF_MARK.PREVIEW_READY, at: 5000 }
            ],
            measures: []
        })
        expect(summary.appReadyMs).toBe(800)
        expect(summary.windowCreateMs).toBe(1200)
        expect(summary.rendererReadyMs).toBe(2600)
        expect(summary.previewReadyMs).toBe(5000)
        expect(summary.mainViewMountedMs).toBeNull()
        expect(summary.editorReadyMs).toBeNull()
        expect(summary.windowToRendererReadyMs).toBe(1400)
        expect(summary.rendererReadyToPreviewReadyMs).toBe(2400)
    })

    it('buildPerfReportFile 包含 schema/模式/主进程报告', () => {
        vi.stubEnv('BAIZE_PERF', '1')
        perfMark(PERF_MARK.APP_READY)
        const file = buildPerfReportFile()
        expect(file.schemaVersion).toBe(1)
        expect(file.enabled).toBe(true)
        expect(file.mode.env).toBe(true)
        expect(file.main?.marks.map((mark) => mark.name)).toContain(PERF_MARK.APP_READY)
        expect(file.renderer).toBeNull()
    })
})

describe('渲染层控制台哨兵行解析', () => {
    it('解析合法 mark / measure 行', () => {
        const mark = parseRendererPerfLine(rendererMarkLine(PERF_MARK.EDITOR_READY, 123.4, 999))
        expect(mark).toEqual({
            type: 'mark',
            name: PERF_MARK.EDITOR_READY,
            at: 123.4,
            timeOrigin: 999
        })
        const measure = parseRendererPerfLine(
            `${PERF_CONSOLE_PREFIX} ${JSON.stringify({
                type: 'measure',
                name: 'startup:preview-ready',
                start: 1,
                duration: 2.5,
                timeOrigin: 999
            })}`
        )
        expect(measure).toEqual({
            type: 'measure',
            name: 'startup:preview-ready',
            start: 1,
            duration: 2.5,
            timeOrigin: 999
        })
    })

    it('非哨兵 / 非法 JSON / 字段类型不符一律返回 null', () => {
        expect(parseRendererPerfLine('普通控制台日志')).toBeNull()
        expect(parseRendererPerfLine(`${PERF_CONSOLE_PREFIX} not-json`)).toBeNull()
        expect(parseRendererPerfLine(`${PERF_CONSOLE_PREFIX} []`)).toBeNull()
        expect(parseRendererPerfLine(`${PERF_CONSOLE_PREFIX} {"type":"mark"}`)).toBeNull()
        expect(
            parseRendererPerfLine(`${PERF_CONSOLE_PREFIX} {"type":"mark","name":"x","at":"NaN"}`)
        ).toBeNull()
        expect(
            parseRendererPerfLine(`${PERF_CONSOLE_PREFIX} {"type":"measure","name":"x","start":1}`)
        ).toBeNull()
        expect(parseRendererPerfLine(undefined)).toBeNull()
        expect(parseRendererPerfLine(123)).toBeNull()
    })
})

describe('setupPerfDiagnostics：采集渲染层上报并落盘', () => {
    it('把渲染层 mark 合并进报告、在主进程时间轴补记同名标记并写出 JSON', () => {
        const outFile = path.join(tempRoot, 'perf-report-1.json')
        vi.stubEnv('BAIZE_PERF', '1')
        vi.stubEnv('BAIZE_PERF_OUT', outFile)
        const fake = createFakeWindow()
        setupPerfDiagnostics(fake.win)
        expect(fake.listeners).toHaveLength(1)

        perfMark(PERF_MARK.APP_READY)
        perfMark(PERF_MARK.WINDOW_CREATE)
        emitRendererConsole(fake, rendererMarkLine(PERF_MARK.MAIN_VIEW_MOUNTED, 50))
        emitRendererConsole(fake, rendererMarkLine(PERF_MARK.EDITOR_READY, 80))
        emitRendererConsole(
            fake,
            `${PERF_CONSOLE_PREFIX} ${JSON.stringify({
                type: 'measure',
                name: 'startup:window-to-main-view-mounted',
                start: 20,
                duration: 30,
                timeOrigin: 1000
            })}`
        )
        emitRendererConsole(fake, '与性能无关的控制台输出')

        const written = readReportFile(outFile)
        expect(written).not.toBeNull()
        const renderer = (
            written as {
                renderer: { marks: Array<{ name: string }>; measures: Array<{ name: string }> }
            }
        ).renderer
        expect(renderer.marks.map((mark) => mark.name)).toEqual([
            PERF_MARK.MAIN_VIEW_MOUNTED,
            PERF_MARK.EDITOR_READY
        ])
        expect(renderer.measures.map((measure) => measure.name)).toContain(
            'startup:window-to-main-view-mounted'
        )
        const main = (written as { main: { marks: Array<{ name: string }> } }).main
        const mainMarks = main.marks.map((mark) => mark.name)
        // 主进程时间轴镜像标记（主视图 / 编辑器）
        expect(mainMarks).toContain(PERF_MARK.MAIN_VIEW_MOUNTED)
        expect(mainMarks).toContain(PERF_MARK.EDITOR_READY)
        // 同名去重：重复上报不追加
        emitRendererConsole(fake, rendererMarkLine(PERF_MARK.EDITOR_READY, 90))
        const rewritten = readReportFile(outFile) as {
            renderer: { marks: Array<{ name: string }> }
        }
        expect(
            rewritten.renderer.marks.filter((mark) => mark.name === PERF_MARK.EDITOR_READY)
        ).toHaveLength(1)
    })

    it('quit-on-complete：收到 preview-ready 后延迟 1s 请求退出', () => {
        vi.useFakeTimers()
        vi.stubEnv('BAIZE_PERF', '1')
        vi.stubEnv('BAIZE_PERF_QUIT_ON_COMPLETE', '1')
        vi.stubEnv('BAIZE_PERF_OUT', path.join(tempRoot, 'perf-report-quit.json'))
        const fake = createFakeWindow()
        const quit = vi.fn()
        setupPerfDiagnostics(fake.win, quit)

        emitRendererConsole(fake, rendererMarkLine(PERF_MARK.PREVIEW_READY, 42))
        expect(quit).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1000)
        expect(quit).toHaveBeenCalledTimes(1)
        // 重复 preview-ready 不重复排期
        emitRendererConsole(fake, rendererMarkLine(PERF_MARK.PREVIEW_READY, 43))
        vi.advanceTimersByTime(1000)
        expect(quit).toHaveBeenCalledTimes(1)
    })

    it('quit-after-ms 兜底：即使未采集到任何标记也会超时退出', () => {
        vi.useFakeTimers()
        vi.stubEnv('BAIZE_PERF', '1')
        vi.stubEnv('BAIZE_PERF_QUIT_AFTER_MS', '5000')
        vi.stubEnv('BAIZE_PERF_OUT', path.join(tempRoot, 'perf-report-fallback.json'))
        const fake = createFakeWindow()
        const quit = vi.fn()
        setupPerfDiagnostics(fake.win, quit)

        vi.advanceTimersByTime(4999)
        expect(quit).not.toHaveBeenCalled()
        vi.advanceTimersByTime(1)
        expect(quit).toHaveBeenCalledTimes(1)
    })

    it('诊断关闭时 setup 为空操作（不挂监听、不写文件）', () => {
        const outFile = path.join(tempRoot, 'perf-report-disabled.json')
        vi.stubEnv('BAIZE_PERF_OUT', outFile)
        const fake = createFakeWindow()
        setupPerfDiagnostics(fake.win)
        expect(fake.listeners).toHaveLength(0)
        expect(fs.existsSync(outFile)).toBe(false)
    })
})

describe('withPerfQueryParam', () => {
    it('给 dev server URL 追加诊断参数（保留既有 query）', () => {
        expect(withPerfQueryParam('http://localhost:5173/')).toBe(
            'http://localhost:5173/?baizePerf=1'
        )
        expect(withPerfQueryParam('http://localhost:5173/index.html?a=1')).toBe(
            'http://localhost:5173/index.html?a=1&baizePerf=1'
        )
    })

    it('非法 URL 退化为字符串拼接（不抛错）', () => {
        expect(withPerfQueryParam('file:///C:/a b/index.html')).toContain('baizePerf=1')
    })
})
