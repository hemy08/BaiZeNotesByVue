/**
 * 启动/渲染性能标记共享常量（P1 性能基线化）。
 *
 * 定位：主进程（`src/main/utils/perf.ts`）与渲染层（`src/renderer/src/common/perf.ts`）
 * 各自实现轻量 `performance.mark/measure` 采集，但**标记名、控制台哨兵前缀、诊断开关
 * 环境变量名**必须是同一份真源，否则基线脚本无法把两个进程的指标拼起来。
 *
 * 设计约束：
 * - 本文件只放纯字符串常量，不 import 任何运行时模块（shared 层边界要求）；
 * - 标记名统一前缀 `startup:`，便于基线脚本按前缀过滤与报告分组；
 * - 标记为「一次启动阶段点」，同名重复标记在采集侧按首次去重（见两个 perf util）。
 */

/** 渲染层把性能记录写入控制台时使用的哨兵前缀（主进程据此识别并回收渲染层报告） */
export const PERF_CONSOLE_PREFIX = '[BaizePerf]'

/** 诊断模式下主进程给渲染层 URL 追加的 query 参数名（渲染层据此开启采集） */
export const PERF_QUERY_PARAM = 'baizePerf'

/** 诊断开关环境变量：`BAIZE_PERF=1` 时主/渲染层同时开启采集与输出 */
export const PERF_ENV_FLAG = 'BAIZE_PERF'

/** 诊断开关命令行参数（替代环境变量的方式） */
export const PERF_ARG_FLAG = '--baize-perf'

/** 主进程报告 JSON 输出路径环境变量（未设置时只在控制台输出，不落盘） */
export const PERF_OUT_ENV = 'BAIZE_PERF_OUT'

/** 主进程「采集齐关键阶段后自动退出」开关环境变量（基线脚本专用，取值 `1`） */
export const PERF_QUIT_ON_COMPLETE_ENV = 'BAIZE_PERF_QUIT_ON_COMPLETE'

/** 主进程「启动后兜底自动退出」超时环境变量（毫秒；基线脚本专用，防采集卡死） */
export const PERF_QUIT_AFTER_MS_ENV = 'BAIZE_PERF_QUIT_AFTER_MS'

/** 报告 JSON 结构版本（结构变化时递增，基线脚本可据此做向后兼容） */
export const PERF_SCHEMA_VERSION = 1

/**
 * 启动阶段标记名（主进程与渲染层共用）。
 *
 * 主进程侧：app-ready / window-create / renderer-ready 由主进程自己打点；
 * main-view-mounted / editor-ready / preview-ready 由渲染层经控制台哨兵上报后，
 * 主进程以「收到消息时的主进程时钟」补记同名标记（跨进程同一时间轴，便于算冷启动总时长）。
 * 渲染层侧：main-view-mounted / editor-ready / preview-ready 在对应组件生命周期内打点。
 */
export const PERF_MARK = {
    /** 主进程 `app.whenReady()` 回调进入（进程启动 → 主进程就绪） */
    APP_READY: 'startup:app-ready',
    /** 主进程 BrowserWindow 构造完成（窗口对象创建） */
    WINDOW_CREATE: 'startup:window-create',
    /** 主进程收到渲染层 READY 握手（渲染层已挂载并注册完监听器） */
    RENDERER_READY: 'startup:renderer-ready',
    /** 渲染层主界面（BaiZeNotes.vue）挂载完成、IPC 监听器注册完毕 */
    MAIN_VIEW_MOUNTED: 'startup:main-view-mounted',
    /** Monaco 编辑器实例创建并完成首次 layout */
    EDITOR_READY: 'startup:editor-ready',
    /** 预览首帧内容写入 v-html 并完成 DOM 更新 */
    PREVIEW_READY: 'startup:preview-ready'
} as const

/** 启动阶段标记名联合类型 */
export type PerfMarkName = (typeof PERF_MARK)[keyof typeof PERF_MARK]

/** 主进程镜像渲染层阶段标记时生成的跨阶段耗时 measure 名（窗口创建 → 该阶段） */
export const PERF_SEGMENT_MEASURE = {
    WINDOW_TO_RENDERER_READY: 'startup:window-to-renderer-ready',
    WINDOW_TO_MAIN_VIEW_MOUNTED: 'startup:window-to-main-view-mounted',
    WINDOW_TO_EDITOR_READY: 'startup:window-to-editor-ready',
    WINDOW_TO_PREVIEW_READY: 'startup:window-to-preview-ready'
} as const

/** 跨阶段耗时 measure 名联合类型 */
export type PerfSegmentMeasureName =
    (typeof PERF_SEGMENT_MEASURE)[keyof typeof PERF_SEGMENT_MEASURE]
