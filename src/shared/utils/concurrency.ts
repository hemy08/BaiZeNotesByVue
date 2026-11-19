/**
 * 跨进程共享的并发控制纯函数（第 1 批公共接口归位：src/shared/utils/concurrency.ts）。
 *
 * 来源：
 * - `limitConcurrency`：`src/renderer/src/components/Markdown/hemy-editor-render.ts:159-190`
 *   （mermaid / PlantUML 批量渲染使用，限制并发数 3，避免图表库内部全局状态竞争）；
 * - `createSemaphore`：`src/main/utils/file-utils/directory-tree.ts:476-518` 的目录扫描
 *   并发闸门（activeScanSlots / scanSlotWaiters / acquireScanSlot / releaseScanSlot：
 *   释放名额时优先直接转交给等待者，没有等待者才减少活跃计数）。
 */

/**
 * 按并发上限批量执行任务，并保持结果顺序与任务数组下标一致。
 *
 * **逐字迁移**自 `src/renderer/src/components/Markdown/hemy-editor-render.ts:159-190`，
 * 行为语义（迁移时不得改变，调用方迁移阶段需要依赖）：
 * - 按任务数组顺序依次启动任务，已启动未完成数达到 `concurrency` 时 `await Promise.race`
 *   等待任一完成后再启动下一个；
 * - 结果写入 `results[i]`，**保持原始下标顺序**（完成顺序不影响结果位置）；
 * - 单个任务抛错/拒绝不会让整体 Promise 拒绝，错误对象会被当作该位置的结果返回
 *   （与原实现 `.catch((err) => { results[i] = err as T })` 一致）；
 * - `concurrency` 不做钳制（原实现也没有）：传 0/负数时等价串行执行，传 `NaN` 时
 *   退化为不等待的全并行；正常调用方应传正整数。
 *
 * @param tasks 任务函数数组（每个函数返回 Promise）
 * @param concurrency 并发上限
 * @returns 与 tasks 等长、顺序一致的结果数组（失败任务的位置为错误对象）
 */
export async function limitConcurrency<T>(
    tasks: (() => Promise<T>)[],
    concurrency: number
): Promise<T[]> {
    const results: T[] = []
    const executing: Promise<void>[] = []

    for (let i = 0; i < tasks.length; i++) {
        const task = tasks[i]
        const promise = task()
            .then((result) => {
                results[i] = result
                const index = executing.indexOf(promise)
                if (index > -1) {
                    executing.splice(index, 1)
                }
            })
            .catch((err) => {
                results[i] = err as T
                const index = executing.indexOf(promise)
                if (index > -1) {
                    executing.splice(index, 1)
                }
            })

        executing.push(promise)

        if (executing.length >= concurrency) {
            await Promise.race(executing)
        }
    }

    await Promise.all(executing)
    return results
}

/** 信号量接口：只有「获取」一个操作，释放函数由 acquire 的 Promise 返回 */
export interface Semaphore {
    /**
     * 获取一个并发名额。
     * @returns 释放函数：调用一次即归还名额（重复调用无副作用）
     */
    acquire(): Promise<() => void>
}

/**
 * 创建有界并发信号量。
 *
 * 对齐 `src/main/utils/file-utils/directory-tree.ts:476-518` 的名额闸门语义：
 * - 活跃数小于上限时立即获取；
 * - 已达上限时挂起等待，**释放时把名额直接转交给等待者**（活跃数不减），
 *   没有等待者才减少活跃数——避免「先减后加」窗口导致的并发超限；
 * - 与原实现的增强（行为等价，仅健壮性）：
 *   1. 容量做合法性归一（非有限值/小于 1 → 1），原实现依赖模块常量；
 *   2. 释放函数**幂等**（重复调用只生效一次），原实现要求调用方 `finally` 只调一次。
 *
 * @param max 并发上限
 * @returns 信号量实例
 */
export function createSemaphore(max: number): Semaphore {
    const limit = Number.isFinite(max) ? Math.max(1, Math.floor(max)) : 1
    /** 当前活跃名额数 */
    let activeCount = 0
    /** 等待中的 acquire 回调（拿到释放函数即视为获得名额） */
    const waiters: Array<(release: () => void) => void> = []

    /** 生成一个幂等的释放函数（每次获得名额时创建，保证「一次名额一次释放」） */
    const createRelease = (): (() => void) => {
        let released = false
        return (): void => {
            if (released) {
                return
            }
            released = true
            const next = waiters.shift()
            if (next) {
                // 名额直接转交：活跃数不变，等待者拿到属于它的新释放函数
                next(createRelease())
                return
            }
            activeCount = Math.max(0, activeCount - 1)
        }
    }

    return {
        acquire(): Promise<() => void> {
            return new Promise<() => void>((resolve) => {
                if (activeCount < limit) {
                    activeCount += 1
                    resolve(createRelease())
                    return
                }
                waiters.push(resolve)
            })
        }
    }
}
