/**
 * 渲染进程统一日志封装（CQ-10；第 4 批 P3 已完成渲染层裸 console.* 收敛）
 *
 * 背景与策略：
 * - 主进程已有 `src/main/utils/logger.ts`（文件 + 控制台 + 状态栏镜像）；
 *   渲染层无法直接写主进程日志文件，也没有可用的统一封装。
 * - 本模块作为渲染层唯一的 console 出口（2026-11-19 第 4 批 P3 核对：`src/renderer/src`
 *   下除本文件外已无裸 console.* 调用），按级别区分生产/开发行为：
 *   · debug/info/log —— 仅开发模式输出（生产构建静默，避免调试信息进入
 *     用户可见的 DevTools 控制台）；
 *   · warn/error —— 保留输出（调试价值高），参数**原样透传、不加前缀**，
 *     既便于 DevTools 检索，也保证既有单测对 console 的断言不受影响。
 * - 用户可见的错误反馈仍由调用方负责（对话框 / 状态栏），本模块不向 UI
 *   注入消息——避免把所有 warn 都变成 UI 噪声。
 *
 * 说明：单元测试环境（vitest）`import.meta.env.PROD` 为 false，行为等同开发模式；
 * 极端环境下 import.meta.env 不可用时按"非生产"降级，宁可多输出也不静默丢日志。
 */

type LoggerArgs = unknown[]

/** 生产构建判定（Vite 编译期注入 import.meta.env.PROD） */
function isProductionBuild(): boolean {
    try {
        return import.meta.env?.PROD === true
    } catch {
        return false
    }
}

export const logger = {
    /** 调试日志：生产构建静默 */
    debug(...args: LoggerArgs): void {
        if (!isProductionBuild()) {
            console.debug('[Renderer][DEBUG]', ...args)
        }
    },
    /** 信息日志：生产构建静默 */
    info(...args: LoggerArgs): void {
        if (!isProductionBuild()) {
            console.info('[Renderer][INFO]', ...args)
        }
    },
    /** 普通日志：生产构建静默 */
    log(...args: LoggerArgs): void {
        if (!isProductionBuild()) {
            console.log('[Renderer]', ...args)
        }
    },
    /** 警告：保留输出（参数原样透传） */
    warn(...args: LoggerArgs): void {
        console.warn(...args)
    },
    /** 错误：保留输出（参数原样透传） */
    error(...args: LoggerArgs): void {
        console.error(...args)
    }
} as const
