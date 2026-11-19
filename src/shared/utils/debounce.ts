/**
 * 跨进程共享的防抖纯函数（第 1 批公共接口归位：src/shared/utils/debounce.ts）。
 *
 * 背景：项目内 12+ 处手写 `setTimeout/clearTimeout` 防抖，语义分散；本模块提供带
 * `cancel` / `flush` 的标准防抖实现，供后续按需替换（第 1 批只新建，不改调用点）。
 *
 * 泛型约束说明：`T extends (...args: never[]) => void` 是 TypeScript 中「接受任意函数
 * 且保留其参数类型」的惯用写法——任意参数列表的函数都能满足该约束，同时返回值保持
 * 调用方原函数类型（含参数签名）。
 */

/**
 * 防抖后的函数类型：保留原函数签名，并附加 `cancel` / `flush`。
 *
 * @typeParam T 原函数类型
 */
export type Debounced<T extends (...args: never[]) => void> = T & {
    /** 取消尚未执行的调用（同时丢弃已暂存的最新参数） */
    cancel(): void
    /** 立即执行尚未执行的调用（若有），并清空待执行状态 */
    flush(): void
}

/**
 * 创建防抖函数：连续调用时只在停止调用 `ms` 毫秒后执行一次，参数取**最后一次**调用。
 *
 * 语义（对齐项目内手写防抖的通用行为）：
 * - 每次调用重置计时器（clearTimeout + setTimeout）；
 * - 只使用最后一次调用的参数执行；
 * - `cancel()` 取消待执行调用并丢弃暂存参数；`flush()` 立即执行待执行调用
 *   （无待执行时不执行，也不会触发原函数）；
 * - 不绑定 `this`（需要绑定时调用方先用 `fn.bind(target)` 得到新函数）。
 *
 * @param fn 原函数
 * @param ms 防抖等待毫秒数（与原生 setTimeout 一致：负数/0 视为立即到期）
 * @returns 带 cancel/flush 的防抖函数
 */
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number): Debounced<T> {
    let timer: ReturnType<typeof setTimeout> | null = null
    let pendingArgs: Parameters<T> | null = null

    /** 执行并清空待执行调用（无待执行时为空操作） */
    const invoke = (): void => {
        if (timer === null || pendingArgs === null) {
            return
        }
        clearTimeout(timer)
        timer = null
        const args = pendingArgs
        pendingArgs = null
        const callable = fn as unknown as (...callArgs: Parameters<T>) => void
        callable(...args)
    }

    const debounced = ((...args: Parameters<T>): void => {
        pendingArgs = args
        if (timer !== null) {
            clearTimeout(timer)
        }
        timer = setTimeout(invoke, ms)
    }) as unknown as Debounced<T>

    debounced.cancel = (): void => {
        if (timer !== null) {
            clearTimeout(timer)
            timer = null
        }
        pendingArgs = null
    }

    debounced.flush = (): void => {
        invoke()
    }

    return debounced
}
