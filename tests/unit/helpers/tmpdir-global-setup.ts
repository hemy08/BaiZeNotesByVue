/**
 * ET-17：测试临时目录统一清理（vitest globalSetup）
 *
 * 背景：部分测试在 `%TEMP%` 下创建 `baize-*` 临时目录（`os.tmpdir()` + `mkdtemp`
 * 或固定目录名），历史运行累积了 20 多个残留目录，且 `tests/unit` 下也曾出现
 * `.window-security.test.ts.<pid>.<uuid>.tmpdir` 之类的未跟踪目录。
 *
 * 为什么用 globalSetup 而不是 setupFiles + afterAll：
 * - setupFiles 在每个 test worker / 每个测试文件里执行，`afterAll` 清理时其他 worker
 *   可能仍在并行使用各自的临时目录；统一删除 `%TEMP%/baize-*` 会误删正在使用的目录，
 *   属于跨文件竞态（项目 118+ 个测试文件默认并行）。
 * - globalSetup 的 `teardown()` 在全部测试结束、worker 退出后由主进程执行一次。
 *
 * 并发保护（重要）：清理前按目录 mtime 过滤，只删除「创建/修改于 30 分钟前」的旧目录。
 * 这样即使同一台机器上有另一个 vitest 实例正在运行（其临时目录 mtime 为当前时间），
 * 也不会被本实例的 teardown 误删，避免 ENOENT 假失败。本次运行新建的目录留在
 * `%TEMP%`，由后续运行（30 分钟后）或操作系统回收，无功能影响。
 */
import { readdirSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** 测试临时目录统一前缀（`baize-test-`、`baize-vitest-*`、`baize-plantuml-test-` 等均命中） */
const TEMP_PREFIX = 'baize-'

/** 只清理超过该年龄（毫秒）的目录，避免误删并发测试实例正在使用的目录 */
const MIN_AGE_MS = 30 * 60 * 1000

export function teardown(): void {
    let entries: string[]
    try {
        entries = readdirSync(tmpdir())
    } catch {
        // 极端环境下 TEMP 不可读时放弃清理，不影响测试结果
        return
    }
    const now = Date.now()
    for (const name of entries) {
        if (!name.startsWith(TEMP_PREFIX)) continue
        const fullPath = join(tmpdir(), name)
        try {
            const stat = statSync(fullPath)
            if (now - stat.mtimeMs < MIN_AGE_MS) continue // 新目录：可能是并发实例正在使用
            rmSync(fullPath, { recursive: true, force: true, maxRetries: 3 })
        } catch {
            // 目录可能已被删除或被其他进程占用：忽略，不影响测试结果
        }
    }
}
