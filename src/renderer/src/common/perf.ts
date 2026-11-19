/**
 * 渲染层启动性能标记工具（P1 性能基线化）。
 *
 * 目标：在欢迎页/主界面/编辑器/预览的关键渲染节点打轻量 `performance.mark/measure`，
 * 并把记录以控制台哨兵行上报给主进程（主进程据此拼装跨进程冷启动报告）。
 * 默认关闭，避免生产环境控制台噪音与任何可感知开销。
 *
 * 开关（满足「仅在开发/诊断开关下输出，避免生产噪音」）：
 * - 主进程诊断模式下会给渲染层 URL 追加 `?baizePerf=1`（本模块据此开启）；
 * - 测试/调试可直接调用 `setPerfDiagnosticsEnabled(true)` 或设置全局
 *   `globalThis.__BAIZE_PERF_ENABLED__ = true`；
 * - 未开启时全部 API 为空操作，不注册全局对象、不输出任何日志。
 *
 * 获取 JSON 的入口（开启后）：
 * - DevTools 中执行 `window.__BAIZE_PERF__.getReportJson()`；
 * - 源码内 `import { getPerfReportJson } from '@renderer/common/perf'`；
 * - 或由 `build/perf-baseline.js` 经主进程汇总输出 `out/analysis/perf-baseline.json`。
 */
import { PERF_CONSOLE_PREFIX, PERF_QUERY_PARAM } from '../../../shared/constants/perf'
import type { PerfMarkName } from '../../../shared/constants/perf'

export { PERF_MARK } from '../../../shared/constants/perf'

/** 单条 mark（at = 相对渲染层 timeOrigin 的毫秒数） */
export interface RendererPerfMarkRecord {
    name: string
    at: number
}

/** 单条 measure（start/duration 均为相对 timeOrigin 的毫秒数） */
export interface RendererPerfMeasureRecord {
    name: string
    start: number
    duration: number
}

/** 渲染层性能报告快照 */
export interface RendererPerfReport {
    process: 'renderer'
    enabled: boolean
    timeOrigin: number
    marks: RendererPerfMarkRecord[]
    measures: RendererPerfMeasureRecord[]
}

/** 上报给主进程的控制台哨兵载荷 */
type PerfConsolePayload =
    | { type: 'mark'; name: string; at: number; timeOrigin: number }
    | { type: 'measure'; name: string; start: number; duration: number; timeOrigin: number }

/** 测试/诊断开关覆盖（null 表示自动判定） */
let enabledOverride: boolean | null = null

/** 渲染层阶段标记（按名称去重） */
const marks: RendererPerfMarkRecord[] = []

/** 渲染层 measure（同名覆盖） */
const measures: RendererPerfMeasureRecord[] = []

/** 无 performance 的极端环境退化计时起点（首次调用时刻） */
let fallbackStart: number | null = null

/** 运行环境是否存在可用的 User Timing API */
function hasUserTiming(): boolean {
    return typeof performance !== 'undefined' && typeof performance.now === 'function'
}

/** 当前 timeOrigin（无 performance 时为 0） */
function currentTimeOrigin(): number {
    if (typeof performance !== 'undefined' && typeof performance.timeOrigin === 'number') {
        return performance.timeOrigin
    }
    return 0
}

/** 高精度时钟（相对 timeOrigin；退化环境用 Date.now 相对首调时刻） */
function now(): number {
    if (hasUserTiming()) {
        return performance.now()
    }
    if (fallbackStart === null) {
        fallbackStart = Date.now()
    }
    return Date.now() - fallbackStart
}

/** 四舍五入到 0.1ms */
function roundMs(value: number): number {
    return Math.round(value * 10) / 10
}

/** 读取渲染层 URL 上的诊断 query（file:/dev server 均适用） */
function hasPerfQuery(): boolean {
    try {
        if (typeof location === 'undefined' || typeof location.search !== 'string') {
            return false
        }
        return new URLSearchParams(location.search).get(PERF_QUERY_PARAM) === '1'
    } catch {
        return false
    }
}

/** 读取全局强制开关（单测/DevTools 调试用） */
function hasGlobalForceFlag(): boolean {
    try {
        const flag = (globalThis as { __BAIZE_PERF_ENABLED__?: unknown }).__BAIZE_PERF_ENABLED__
        return flag === true
    } catch {
        return false
    }
}

/**
 * 诊断模式是否开启。
 *
 * 判定顺序：显式覆盖 → 全局强制开关 → URL query 参数。每次实时判定（无缓存）。
 */
export function isPerfDiagnosticsEnabled(): boolean {
    if (enabledOverride !== null) {
        return enabledOverride
    }
    if (hasGlobalForceFlag()) {
        return true
    }
    return hasPerfQuery()
}

/** 向控制台输出一行哨兵载荷（仅在诊断开启时由采集函数调用） */
function emitConsoleLine(payload: PerfConsolePayload): void {
    try {
        console.info(`${PERF_CONSOLE_PREFIX} ${JSON.stringify(payload)}`)
    } catch {
        // 控制台不可用（极端环境）时静默，不影响标记采集本身
    }
}

/** 挂载诊断全局入口（幂等；仅诊断开启时） */
function installPerfGlobal(): void {
    const target = globalThis as { __BAIZE_PERF__?: unknown }
    if (target.__BAIZE_PERF__ !== undefined) {
        return
    }
    try {
        target.__BAIZE_PERF__ = Object.freeze({
            enabled: true,
            mark: perfMark,
            measure: perfMeasure,
            getReport: getPerfReport,
            getReportJson: (space = 2): string | null => getPerfReportJson(space)
        })
    } catch {
        // 某些隔离环境禁止写 globalThis：仍保留模块级 API
    }
}

/**
 * 记录一个阶段点：`performance.mark` + 进程内列表 + 控制台哨兵上报（同名只记首次）。
 *
 * @param name 阶段名（建议使用 PERF_MARK 中的常量）
 * @returns 本次是否真正新增了标记（诊断关闭或同名已存在时返回 false，调用方可据此只测一次）
 */
export function perfMark(name: PerfMarkName | string): boolean {
    if (!isPerfDiagnosticsEnabled()) {
        return false
    }
    if (marks.some((mark) => mark.name === name)) {
        return false
    }
    const at = roundMs(now())
    try {
        performance.mark(name)
    } catch {
        // 不支持 User Timing 的环境：仅保留数值记录
    }
    marks.push({ name, at })
    emitConsoleLine({ type: 'mark', name, at, timeOrigin: currentTimeOrigin() })
    installPerfGlobal()
    return true
}

/**
 * 记录一段耗时：`performance.measure` + 进程内列表 + 控制台哨兵上报（同名覆盖）。
 *
 * @param name measure 名
 * @param startMarkName 起始标记名；缺省表示从渲染层 timeOrigin（导航起点）开始
 */
export function perfMeasure(name: string, startMarkName?: PerfMarkName | string): void {
    if (!isPerfDiagnosticsEnabled()) {
        return
    }
    const end = now()
    const startRecord =
        startMarkName === undefined ? undefined : marks.find((mark) => mark.name === startMarkName)
    const start = startRecord === undefined ? 0 : startRecord.at
    const duration = Math.max(0, end - start)
    try {
        performance.measure(name, { start, end })
    } catch {
        // 部分环境不支持 measure(start/end)：仍记录数值
    }
    const record: RendererPerfMeasureRecord = {
        name,
        start: roundMs(start),
        duration: roundMs(duration)
    }
    const existingIndex = measures.findIndex((measure) => measure.name === name)
    if (existingIndex >= 0) {
        measures[existingIndex] = record
    } else {
        measures.push(record)
    }
    emitConsoleLine({
        type: 'measure',
        name,
        start: record.start,
        duration: record.duration,
        timeOrigin: currentTimeOrigin()
    })
    installPerfGlobal()
}

/** 渲染层性能报告快照（诊断未开启时返回 null） */
export function getPerfReport(): RendererPerfReport | null {
    if (!isPerfDiagnosticsEnabled()) {
        return null
    }
    return {
        process: 'renderer',
        enabled: true,
        timeOrigin: currentTimeOrigin(),
        marks: marks.map((mark) => ({ ...mark })),
        measures: measures.map((measure) => ({ ...measure }))
    }
}

/** 渲染层性能报告 JSON（「获取 JSON 的入口」；诊断未开启时返回 null） */
export function getPerfReportJson(space = 2): string | null {
    const report = getPerfReport()
    return report === null ? null : JSON.stringify(report, null, space)
}

/** 测试/诊断开关覆盖（传 null 恢复自动判定） */
export function setPerfDiagnosticsEnabled(value: boolean | null): void {
    enabledOverride = value
}

/** 重置全部采集状态（仅测试使用：避免用例间串味） */
export function resetPerfDiagnosticsForTests(): void {
    enabledOverride = null
    marks.length = 0
    measures.length = 0
    fallbackStart = null
    try {
        delete (globalThis as { __BAIZE_PERF__?: unknown }).__BAIZE_PERF__
    } catch {
        // 忽略不可删除的全局
    }
}
