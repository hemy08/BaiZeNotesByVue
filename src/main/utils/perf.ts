/**
 * 主进程启动性能标记工具（P1 性能基线化）。
 *
 * 目标：用**轻量、默认关闭**的方式记录启动关键阶段，供 `build/perf-baseline.js`
 * 读取并输出 `out/analysis/perf-baseline.json`；不参与 CI 阻断、不影响正常启动路径。
 *
 * 开关（满足「仅在开发/诊断开关下输出，避免生产噪音」）：
 * - `BAIZE_PERF=1`：显式诊断模式（基线脚本使用）；
 * - `--baize-perf` 命令行参数：同上；
 * - 开发服务器模式（`ELECTRON_RENDERER_URL` 存在，即 electron-vite dev）：自动开启。
 * 未开启时所有 mark/measure 均为空操作，控制台与磁盘零输出。
 *
 * 输出：
 * - 控制台：每个阶段一行 `[perf] ...`（默认关闭时无输出）；
 * - JSON：`BAIZE_PERF_OUT` 指定路径时增量落盘（主进程时钟为主时间轴，并合并渲染层上报）；
 * - 自动退出：`BAIZE_PERF_QUIT_ON_COMPLETE=1` 时在采集到 preview-ready 后自动退出，
 *   `BAIZE_PERF_QUIT_AFTER_MS` 提供兜底超时（均为基线脚本专用，正常使用不设置）。
 *
 * 跨进程：渲染层把 mark/measure 以 `[BaizePerf] {json}` 形式写入控制台，本模块通过
 * `webContents.on('console-message')` 回收，并用「主进程收到消息时的时钟」补记同名标记，
 * 从而在同一时间轴上得到 启动 → 主界面 → 编辑器/预览 的完整冷启动链路。
 */
import { mkdirSync, writeFileSync } from 'fs'
import { dirname, isAbsolute, resolve as resolvePath } from 'path'
import type { BrowserWindow } from 'electron'
import {
    PERF_ARG_FLAG,
    PERF_CONSOLE_PREFIX,
    PERF_ENV_FLAG,
    PERF_MARK,
    PERF_OUT_ENV,
    PERF_QUIT_AFTER_MS_ENV,
    PERF_QUIT_ON_COMPLETE_ENV,
    PERF_SCHEMA_VERSION,
    PERF_SEGMENT_MEASURE,
    PERF_QUERY_PARAM
} from '../../shared/constants/perf'
import type { PerfMarkName } from '../../shared/constants/perf'

/** 单条 mark 记录（at = 相对主进程 timeOrigin 的毫秒数） */
export interface PerfMarkRecord {
    name: string
    at: number
}

/** 单条 measure 记录（start/duration 均为相对 timeOrigin 的毫秒数） */
export interface PerfMeasureRecord {
    name: string
    start: number
    duration: number
}

/** 单进程性能报告 */
export interface PerfProcessReport {
    process: 'main' | 'renderer'
    enabled: boolean
    /** `performance.timeOrigin`（毫秒时间戳；用于跨报告区分时间轴） */
    timeOrigin: number
    marks: PerfMarkRecord[]
    measures: PerfMeasureRecord[]
}

/** 冷启动关键指标汇总（主进程时间轴，单位毫秒） */
export interface PerfSummary {
    appReadyMs: number | null
    windowCreateMs: number | null
    rendererReadyMs: number | null
    mainViewMountedMs: number | null
    editorReadyMs: number | null
    previewReadyMs: number | null
    windowToRendererReadyMs: number | null
    rendererReadyToPreviewReadyMs: number | null
}

/** 落盘报告 JSON 结构 */
export interface PerfReportFile {
    schemaVersion: number
    generatedAt: string
    enabled: boolean
    mode: {
        env: boolean
        argv: boolean
        devServer: boolean
    }
    outputPath: string | null
    main: PerfProcessReport | null
    renderer: PerfProcessReport | null
    summary: PerfSummary | null
}

/** 控制台哨兵行解析结果（渲染层 → 主进程） */
export type RendererPerfLine =
    | { type: 'mark'; name: string; at: number; timeOrigin: number }
    | { type: 'measure'; name: string; start: number; duration: number; timeOrigin: number }

/** 测试/诊断用开关覆盖（null 表示恢复自动判定） */
let enabledOverride: boolean | null = null

/** 主进程阶段标记（按名称去重，保留首次） */
const marks: PerfMarkRecord[] = []
/** 主进程 measure（同名覆盖，避免重复阶段多次追加） */
const measures: PerfMeasureRecord[] = []
/** 渲染层上报的完整报告（由控制台哨兵增量拼装） */
let rendererReport: PerfProcessReport | null = null

/** 诊断上报是否已挂接（避免重复挂接 console-message 监听） */
let diagnosticsAttached = false
/** JSON 输出路径（BAIZE_PERF_OUT；为空表示不落盘） */
let outputPath: string | null = null
/** 是否处于基线脚本的「采集齐后自动退出」模式 */
let quitOnComplete = false
/** 基线脚本请求的退出回调 */
let requestQuit: (() => void) | null = null
/** 自动退出是否已排期（防重入） */
let quitScheduled = false
/** 采集完成后延迟退出的定时器（留时间写完最后一份报告） */
let completeQuitTimer: ReturnType<typeof setTimeout> | null = null
/** 兜底退出定时器（防采集卡死） */
let fallbackQuitTimer: ReturnType<typeof setTimeout> | null = null
/** 落盘失败只告警一次，避免每个 mark 都刷屏 */
let writeErrorWarned = false

/** 是否处于开发服务器模式（electron-vite dev 会设置该环境变量） */
function hasDevRendererUrl(): boolean {
    const url = process.env['ELECTRON_RENDERER_URL']
    return typeof url === 'string' && url.length > 0
}

/**
 * 诊断模式是否开启。
 *
 * 依次判定：测试/显式覆盖 → `BAIZE_PERF=1` → `--baize-perf` → 开发服务器模式。
 * 每次调用实时判定（无缓存），便于测试与运行期开关；调用点均为启动阶段几次，
 * 开销可忽略。
 */
export function isPerfDiagnosticsEnabled(): boolean {
    if (enabledOverride !== null) {
        return enabledOverride
    }
    if (process.env[PERF_ENV_FLAG] === '1') {
        return true
    }
    if (process.argv.includes(PERF_ARG_FLAG)) {
        return true
    }
    return hasDevRendererUrl()
}

/** 高精度时钟（毫秒，相对 timeOrigin；无 performance 的极端环境退化为 Date.now） */
function now(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
        return performance.now()
    }
    return Date.now()
}

/** 当前 timeOrigin（无 performance 时为 0，指标仍可计算相对差值） */
function timeOrigin(): number {
    if (typeof performance !== 'undefined' && typeof performance.timeOrigin === 'number') {
        return performance.timeOrigin
    }
    return 0
}

/** 四舍五入到 0.1ms，避免报告出现无意义长小数 */
function roundMs(value: number): number {
    return Math.round(value * 10) / 10
}

/** 记录一个阶段点：`performance.mark` + 进程内列表（同名只记首次） */
export function perfMark(name: PerfMarkName | string): void {
    if (!isPerfDiagnosticsEnabled()) {
        return
    }
    if (marks.some((mark) => mark.name === name)) {
        return
    }
    const at = now()
    try {
        performance.mark(name)
    } catch {
        // 不支持 User Timing 的环境：仅保留数值记录，不影响启动
    }
    marks.push({ name, at })
    // 诊断模式下的轻量控制台输出（默认关闭；基线脚本会转发这些行便于观察进度）
    console.log(`[perf] ${name} +${at.toFixed(1)}ms`)
    onReportChanged()
}

/**
 * 记录一段耗时：`performance.measure` + 进程内列表（同名覆盖）。
 *
 * @param name measure 名
 * @param startMarkName 起始标记名；缺省表示从 timeOrigin（进程/导航起点）开始
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
    const record: PerfMeasureRecord = { name, start, duration: roundMs(duration) }
    const existingIndex = measures.findIndex((measure) => measure.name === name)
    if (existingIndex >= 0) {
        measures[existingIndex] = record
    } else {
        measures.push(record)
    }
    console.log(`[perf] measure ${name}: ${record.duration.toFixed(1)}ms`)
    onReportChanged()
}

/** 主进程性能报告快照（诊断未开启时返回 null） */
export function getPerfReport(): PerfProcessReport | null {
    if (!isPerfDiagnosticsEnabled()) {
        return null
    }
    return {
        process: 'main',
        enabled: true,
        timeOrigin: timeOrigin(),
        marks: marks.map((mark) => ({ ...mark })),
        measures: measures.map((measure) => ({ ...measure }))
    }
}

/** 主进程性能报告 JSON（「获取 JSON 的入口」；诊断未开启时返回 null） */
export function getPerfReportJson(space = 2): string | null {
    const report = getPerfReport()
    return report === null ? null : JSON.stringify(report, null, space)
}

/** 按标记名取主进程时间轴上的耗时（毫秒；缺失返回 null） */
function markTime(report: PerfProcessReport, name: string): number | null {
    const found = report.marks.find((mark) => mark.name === name)
    return found === undefined ? null : roundMs(found.at)
}

/** 由主进程报告计算冷启动关键指标（导出便于单测） */
export function buildPerfSummary(report: PerfProcessReport): PerfSummary {
    const rendererReadyMs = markTime(report, PERF_MARK.RENDERER_READY)
    const windowCreateMs = markTime(report, PERF_MARK.WINDOW_CREATE)
    const previewReadyMs = markTime(report, PERF_MARK.PREVIEW_READY)
    return {
        appReadyMs: markTime(report, PERF_MARK.APP_READY),
        windowCreateMs,
        rendererReadyMs,
        mainViewMountedMs: markTime(report, PERF_MARK.MAIN_VIEW_MOUNTED),
        editorReadyMs: markTime(report, PERF_MARK.EDITOR_READY),
        previewReadyMs,
        windowToRendererReadyMs:
            rendererReadyMs === null || windowCreateMs === null
                ? null
                : roundMs(rendererReadyMs - windowCreateMs),
        rendererReadyToPreviewReadyMs:
            rendererReadyMs === null || previewReadyMs === null
                ? null
                : roundMs(previewReadyMs - rendererReadyMs)
    }
}

/** 拼装完整落盘报告（导出便于单测） */
export function buildPerfReportFile(): PerfReportFile {
    const main = getPerfReport()
    return {
        schemaVersion: PERF_SCHEMA_VERSION,
        generatedAt: new Date().toISOString(),
        enabled: isPerfDiagnosticsEnabled(),
        mode: {
            env: process.env[PERF_ENV_FLAG] === '1',
            argv: process.argv.includes(PERF_ARG_FLAG),
            devServer: hasDevRendererUrl()
        },
        outputPath,
        main,
        renderer: rendererReport === null ? null : cloneRendererReport(rendererReport),
        summary: main === null ? null : buildPerfSummary(main)
    }
}

/** 深拷贝渲染层报告，避免调用方修改内部状态 */
function cloneRendererReport(report: PerfProcessReport): PerfProcessReport {
    return {
        process: 'renderer',
        enabled: report.enabled,
        timeOrigin: report.timeOrigin,
        marks: report.marks.map((mark) => ({ ...mark })),
        measures: report.measures.map((measure) => ({ ...measure }))
    }
}

/**
 * 解析渲染层经控制台哨兵上报的性能行。
 *
 * 格式：`[BaizePerf] {"type":"mark","name":"startup:xxx","at":12.3,"timeOrigin":1700000000}`
 * 非哨兵/非法 JSON/结构不符时返回 null（控制台其余输出一律忽略）。
 */
export function parseRendererPerfLine(message: unknown): RendererPerfLine | null {
    if (typeof message !== 'string' || !message.startsWith(PERF_CONSOLE_PREFIX)) {
        return null
    }
    const payload = message.slice(PERF_CONSOLE_PREFIX.length).trim()
    if (payload.length === 0) {
        return null
    }
    let parsed: unknown
    try {
        parsed = JSON.parse(payload)
    } catch {
        return null
    }
    if (typeof parsed !== 'object' || parsed === null) {
        return null
    }
    const record = parsed as Record<string, unknown>
    const name = record['name']
    if (typeof name !== 'string' || name.length === 0) {
        return null
    }
    const origin = record['timeOrigin']
    const timeOriginValue = typeof origin === 'number' && Number.isFinite(origin) ? origin : 0
    if (record['type'] === 'mark') {
        const at = record['at']
        if (typeof at !== 'number' || !Number.isFinite(at)) {
            return null
        }
        return { type: 'mark', name, at, timeOrigin: timeOriginValue }
    }
    if (record['type'] === 'measure') {
        const start = record['start']
        const duration = record['duration']
        if (
            typeof start !== 'number' ||
            !Number.isFinite(start) ||
            typeof duration !== 'number' ||
            !Number.isFinite(duration)
        ) {
            return null
        }
        return { type: 'measure', name, start, duration, timeOrigin: timeOriginValue }
    }
    return null
}

/** 确保渲染层报告容器存在（首条上报时创建） */
function ensureRendererReport(origin: number): PerfProcessReport {
    if (rendererReport === null) {
        rendererReport = {
            process: 'renderer',
            enabled: true,
            timeOrigin: origin,
            marks: [],
            measures: []
        }
    }
    return rendererReport
}

/** 主进程镜像段：窗口创建 → 渲染层阶段标记的跨阶段耗时 measure 名映射 */
function segmentMeasureFor(markName: string): string | null {
    switch (markName) {
        case PERF_MARK.RENDERER_READY:
            return PERF_SEGMENT_MEASURE.WINDOW_TO_RENDERER_READY
        case PERF_MARK.MAIN_VIEW_MOUNTED:
            return PERF_SEGMENT_MEASURE.WINDOW_TO_MAIN_VIEW_MOUNTED
        case PERF_MARK.EDITOR_READY:
            return PERF_SEGMENT_MEASURE.WINDOW_TO_EDITOR_READY
        case PERF_MARK.PREVIEW_READY:
            return PERF_SEGMENT_MEASURE.WINDOW_TO_PREVIEW_READY
        default:
            return null
    }
}

/** 合并一条渲染层 mark，并在主进程时间轴补记同名标记 + 段耗时 */
function mergeRendererMark(name: string, at: number, origin: number): void {
    const report = ensureRendererReport(origin)
    if (!report.marks.some((mark) => mark.name === name)) {
        report.marks.push({ name, at })
    }
    // 主进程时间轴补记（同名去重）：跨进程指标统一以「主进程收到消息的时刻」计
    perfMark(name)
    const segmentName = segmentMeasureFor(name)
    if (segmentName !== null) {
        perfMeasure(segmentName, PERF_MARK.WINDOW_CREATE)
    }
    if (name === PERF_MARK.PREVIEW_READY) {
        scheduleQuitWhenComplete()
    }
}

/** 合并一条渲染层 measure */
function mergeRendererMeasure(name: string, start: number, duration: number, origin: number): void {
    const report = ensureRendererReport(origin)
    const existingIndex = report.measures.findIndex((measure) => measure.name === name)
    const record: PerfMeasureRecord = { name, start, duration }
    if (existingIndex >= 0) {
        report.measures[existingIndex] = record
    } else {
        report.measures.push(record)
    }
}

/** 处理一条渲染层控制台消息（导出便于单测直接驱动） */
export function handleRendererConsoleMessage(message: unknown): void {
    if (!diagnosticsAttached || !isPerfDiagnosticsEnabled()) {
        return
    }
    const line = parseRendererPerfLine(message)
    if (line === null) {
        return
    }
    if (line.type === 'mark') {
        mergeRendererMark(line.name, line.at, line.timeOrigin)
    } else {
        mergeRendererMeasure(line.name, line.start, line.duration, line.timeOrigin)
    }
    flushPerfReportToFile()
}

/**
 * 采集齐关键阶段后自动退出（基线脚本专用）。
 *
 * 触发条件：`BAIZE_PERF_QUIT_ON_COMPLETE=1` 且收到渲染层 preview-ready。
 * 延迟 1s 再退出，确保最后一份报告已同步落盘、且渲染层日志已收全。
 */
function scheduleQuitWhenComplete(): void {
    if (!quitOnComplete || quitScheduled || requestQuit === null) {
        return
    }
    quitScheduled = true
    completeQuitTimer = setTimeout(() => {
        completeQuitTimer = null
        requestQuit?.()
    }, 1000)
}

/** 把当前报告同步写入 BAIZE_PERF_OUT（未配置路径时为空操作；失败只告警一次） */
function flushPerfReportToFile(): void {
    if (outputPath === null) {
        return
    }
    try {
        mkdirSync(dirname(outputPath), { recursive: true })
        writeFileSync(outputPath, `${JSON.stringify(buildPerfReportFile(), null, 2)}\n`, 'utf-8')
    } catch (error) {
        if (!writeErrorWarned) {
            writeErrorWarned = true
            console.warn('[perf] 写入性能基线报告失败（后续不再重复告警）:', error)
        }
    }
}

/** mark/measure 变化后触发落盘（仅在诊断上报已挂接且配置了输出路径时） */
function onReportChanged(): void {
    if (!diagnosticsAttached) {
        return
    }
    flushPerfReportToFile()
}

/**
 * 挂接诊断上报（主窗口创建后调用；幂等）。
 *
 * - 回收渲染层控制台哨兵行（mark/measure）；
 * - 读取 `BAIZE_PERF_OUT` 并增量落盘；
 * - 处理基线脚本的自动退出开关（quit-on-complete / quit-after-ms）。
 */
export function setupPerfDiagnostics(win: BrowserWindow, quit?: () => void): void {
    if (!isPerfDiagnosticsEnabled()) {
        return
    }
    requestQuit = quit ?? null
    outputPath = resolveOutputPath(process.env[PERF_OUT_ENV])
    quitOnComplete = process.env[PERF_QUIT_ON_COMPLETE_ENV] === '1'
    const fallbackMs = Number(process.env[PERF_QUIT_AFTER_MS_ENV] ?? '')
    if (requestQuit !== null && Number.isFinite(fallbackMs) && fallbackMs > 0) {
        fallbackQuitTimer = setTimeout(() => {
            fallbackQuitTimer = null
            requestQuit?.()
        }, fallbackMs)
    }
    if (diagnosticsAttached) {
        return
    }
    diagnosticsAttached = true
    // Electron 43 新签名：监听器只接收 Event<WebContentsConsoleMessageEventParams>（含 message 字段）；
    // 旧的位置参数形式已 deprecated（会打印弃用告警），这里只使用详情对象。
    win.webContents.on('console-message', (details) => {
        handleRendererConsoleMessage(details.message)
    })
    // 已发生的主进程标记立即写盘（避免窗口加载期间异常退出丢失数据）
    flushPerfReportToFile()
}

/** 解析输出路径：相对路径按 cwd 解析；空值返回 null */
function resolveOutputPath(raw: string | undefined): string | null {
    if (typeof raw !== 'string' || raw.trim().length === 0) {
        return null
    }
    const value = raw.trim()
    return isAbsolute(value) ? value : resolvePath(process.cwd(), value)
}

/** 给渲染层 URL 追加诊断 query 参数（用于打包产物 file: URL 与 dev server URL） */
export function withPerfQueryParam(url: string): string {
    try {
        const parsed = new URL(url)
        parsed.searchParams.set(PERF_QUERY_PARAM, '1')
        return parsed.toString()
    } catch {
        // file: URL 在部分平台可能不被 URL 解析；退化为字符串追加
        const separator = url.includes('?') ? '&' : '?'
        const path = url.split('?')[0]
        return `${path}${separator}${PERF_QUERY_PARAM}=1`
    }
}

/** 测试/诊断开关覆盖（传 null 恢复自动判定） */
export function setPerfDiagnosticsEnabled(value: boolean | null): void {
    enabledOverride = value
}

/** 重置全部采集状态（仅测试使用：避免用例间串味与定时器泄漏） */
export function resetPerfDiagnosticsForTests(): void {
    enabledOverride = null
    marks.length = 0
    measures.length = 0
    rendererReport = null
    diagnosticsAttached = false
    outputPath = null
    quitOnComplete = false
    requestQuit = null
    quitScheduled = false
    writeErrorWarned = false
    if (completeQuitTimer !== null) {
        clearTimeout(completeQuitTimer)
        completeQuitTimer = null
    }
    if (fallbackQuitTimer !== null) {
        clearTimeout(fallbackQuitTimer)
        fallbackQuitTimer = null
    }
}
