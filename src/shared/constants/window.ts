/**
 * 窗口 bounds 共享常量（跨进程 / 跨模块唯一真源）。
 *
 * 背景（公共接口归位第 1 批 1.12）：窗口坐标 / 尺寸的安全范围此前在 3 处各写一份，
 * 其中后两处注释自认「就地复制」（handlers 反向依赖 config 不可 import）：
 * - `src/main/ipc/handlers.ts:114-119`：AS-6 校验，已导出 `WINDOW_COORDINATE_LIMIT` /
 *   `WINDOW_MIN_SIZE` / `WINDOW_MAX_SIZE`；
 * - `src/main/config/config-schema.ts:205-210`：`WINDOW_BOUNDS_COORDINATE_LIMIT = 100000`、
 *   `WINDOW_BOUNDS_SIZE_LIMIT = 32768`（尺寸下限 1 在 :316 内联）；
 * - `src/main/utils/window-bounds.ts:31-35`：`WINDOW_COORDINATE_LIMIT = 100000`、
 *   `WINDOW_MAX_SIZE = 32768`（尺寸下限 1 在 :59-60 内联）。
 *
 * 三处数值经逐行比对完全一致（100000 / 1 / 32768），本文件为后续统一引用的目标真源。
 * 本批次只新建常量、不改任何使用方（引用迁移由后续阶段负责）。
 */

/** 窗口坐标绝对值上限（覆盖多显示器 / 超宽屏，同时挡住 1e9 级异常值） */
export const WINDOW_COORDINATE_LIMIT = 100000

/** 窗口尺寸下限（下限取 1：真正的可用尺寸由渲染层拖拽约束与系统窗口管理器决定） */
export const WINDOW_MIN_SIZE = 1

/** 窗口尺寸上限（32768：远大于现有显示器分辨率，同时限制异常超大 bounds 落盘） */
export const WINDOW_MAX_SIZE = 32768
