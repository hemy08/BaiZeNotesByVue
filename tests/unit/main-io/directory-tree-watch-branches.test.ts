/**
 * 覆盖率补测第五批：directory-tree-watch.ts（fs.watch 增量监听）边界分支。
 *
 * 覆盖点（此前未覆盖的语句/分支，watcher 为可控 mock，不依赖真实文件系统事件）：
 * - 事件回调：filename 为 null、自身写入抑制、被排除目录（node_modules 等）、
 *   回调内异常统一降级；
 * - 批次合并：窗口内多次事件只刷新一次；批次执行时根目录为空 / 目录已不存在 /
 *   处理器未注册 / 处理器成功 / 处理器失败；
 * - 监听创建：recursive 不支持时降级为根目录监听、两次 watch 均失败返回 null、
 *   watcher error 事件降级、注册监听抛错走外层 catch；
 * - 生命周期：目录未变不重建、切换目录解除降级、降级后同目录不重试、
 *   close 抛错仍完成降级、退出复位。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const fsMocks = vi.hoisted(() => ({
    watch: vi.fn(),
    access: vi.fn()
}))

vi.mock('fs', async (importOriginal) => {
    const actual = await importOriginal<typeof import('fs')>()
    return {
        ...actual,
        watch: fsMocks.watch,
        promises: { ...actual.promises, access: fsMocks.access }
    }
})

vi.mock('electron', () => ({
    BrowserWindow: class {},
    app: { getPath: () => '' }
}))

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const sharedMocks = vi.hoisted(() => ({
    isSelfWriteWindow: vi.fn(() => false)
}))

vi.mock('../../../src/main/utils/file-utils/shared', () => ({
    isSelfWriteWindow: sharedMocks.isSelfWriteWindow
}))

const scanMocks = vi.hoisted(() => ({
    isPathInSkippedDirectory: vi.fn(() => false)
}))

vi.mock('../../../src/main/utils/file-utils/directory-tree-scan', () => ({
    isPathInSkippedDirectory: scanMocks.isPathInSkippedDirectory
}))

import {
    DegradeDirectoryWatch,
    ensureDirectoryWatcher,
    GetDirectoryWatchStatus,
    registerDirectoryWatchBatchHandler,
    resetDirectoryWatchState,
    stopDirectoryWatcher
} from '../../../src/main/utils/file-utils/directory-tree-watch'
import { appState } from '../../../src/main/utils/app-state'
import { logger } from '../../../src/main/utils/logger'
import type { DirectoryWatchBatchHandler } from '../../../src/main/utils/file-utils/directory-tree-watch'

type WatchCallback = (eventType: 'rename' | 'change', filename: string | Buffer | null) => void

interface FakeWatcher {
    close: ReturnType<typeof vi.fn>
    on: ReturnType<typeof vi.fn>
    errorListener: ((error: unknown) => void) | null
    callback: WatchCallback | null
}

function makeFakeWatcher(): FakeWatcher {
    const fake: FakeWatcher = {
        close: vi.fn(),
        on: vi.fn((event: string, listener: (error: unknown) => void) => {
            if (event === 'error') fake.errorListener = listener
        }),
        errorListener: null,
        callback: null
    }
    return fake
}

/** 让下一次 fs.watch 返回可控 watcher（recursive 调用与降级调用分别返回） */
function queueWatchResults(...results: Array<FakeWatcher | Error>): FakeWatcher[] {
    const created: FakeWatcher[] = []
    fsMocks.watch.mockImplementation(((
        _root: string,
        optionsOrCallback: unknown,
        maybeCallback?: unknown
    ) => {
        const callback = (
            typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback
        ) as WatchCallback
        const result = results.shift()
        if (result === undefined) throw new Error('无更多预置 watch 结果')
        if (result instanceof Error) throw result
        result.callback = callback
        created.push(result)
        return result
    }) as never)
    return created
}

const ROOT = 'E:/baize-workspace'
/** 默认批次处理器：记录调用（模块初始化时未注册，需用例自行注入） */
const batchHandler = vi.fn(async () => undefined)

beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    appState._resetForTesting()
    appState.rootPath = ROOT
    sharedMocks.isSelfWriteWindow.mockReturnValue(false)
    scanMocks.isPathInSkippedDirectory.mockReturnValue(false)
    fsMocks.access.mockResolvedValue(undefined)
    stopDirectoryWatcher()
    resetDirectoryWatchState()
    batchHandler.mockResolvedValue(undefined)
})

afterEach(() => {
    stopDirectoryWatcher()
    resetDirectoryWatchState()
    vi.useRealTimers()
    // 清空模块级批次处理器（避免污染其它用例）
    registerDirectoryWatchBatchHandler(null as unknown as DirectoryWatchBatchHandler)
})

describe('fs.watch 事件回调', () => {
    it('普通变更累积进批次并合并为一次刷新（500ms 窗口内多次事件只刷一次）', async () => {
        const fake = queueWatchResults(makeFakeWatcher())
        ensureDirectoryWatcher()
        registerDirectoryWatchBatchHandler(batchHandler)
        expect(fake[0]?.callback).toBeTypeOf('function')

        fake[0]!.callback!('change', 'note.md')
        expect(GetDirectoryWatchStatus().batchPending).toBe(true)
        // 窗口内第二次事件：不新增计时器
        fake[0]!.callback!('rename', 'other.md')
        await vi.advanceTimersByTimeAsync(500)

        expect(batchHandler).toHaveBeenCalledTimes(1)
        expect(batchHandler).toHaveBeenCalledWith({
            fromWatcher: true,
            changedPaths: ['note.md', 'other.md']
        })
        expect(GetDirectoryWatchStatus().batchPending).toBe(false)
    })

    it('filename 为 null 时按空变更处理但仍排期批次', async () => {
        const fake = queueWatchResults(makeFakeWatcher())
        ensureDirectoryWatcher()
        registerDirectoryWatchBatchHandler(batchHandler)
        fake[0]!.callback!('rename', null)
        await vi.advanceTimersByTimeAsync(500)
        expect(batchHandler).toHaveBeenCalledWith({ fromWatcher: true, changedPaths: [] })
    })

    it('应用自身写入窗口内的回环事件被忽略（不排期刷新）', () => {
        const fake = queueWatchResults(makeFakeWatcher())
        ensureDirectoryWatcher()
        sharedMocks.isSelfWriteWindow.mockReturnValue(true)
        fake[0]!.callback!('change', 'note.md')
        expect(GetDirectoryWatchStatus().batchPending).toBe(false)
        expect(logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('忽略应用自身写入'),
            'change',
            'note.md'
        )
    })

    it('被排除目录（node_modules/.git 等）内的事件被忽略', () => {
        const fake = queueWatchResults(makeFakeWatcher())
        ensureDirectoryWatcher()
        scanMocks.isPathInSkippedDirectory.mockReturnValue(true)
        fake[0]!.callback!('change', 'node_modules/pkg/index.js')
        expect(GetDirectoryWatchStatus().batchPending).toBe(false)
        expect(logger.debug).toHaveBeenCalledWith(
            expect.stringContaining('忽略被排除目录'),
            'change',
            'node_modules/pkg/index.js'
        )
    })

    it('事件处理内部抛错时统一降级（不向上抛到 watcher 循环）', () => {
        const fake = queueWatchResults(makeFakeWatcher())
        ensureDirectoryWatcher()
        scanMocks.isPathInSkippedDirectory.mockImplementation(() => {
            throw new Error('broken path')
        })
        fake[0]!.callback!('change', 'note.md')
        expect(GetDirectoryWatchStatus().degraded).toBe(true)
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('已降级为原全量刷新模式'),
            expect.any(Error)
        )
    })

    it('filename 为 Buffer（多字节文件名的非 UTF-8 字节序列）时按字符串化处理', async () => {
        const fake = queueWatchResults(makeFakeWatcher())
        ensureDirectoryWatcher()
        registerDirectoryWatchBatchHandler(batchHandler)
        fake[0]!.callback!('rename', Buffer.from('a.md'))
        await vi.advanceTimersByTimeAsync(500)
        expect(batchHandler).toHaveBeenCalledWith({ fromWatcher: true, changedPaths: ['a.md'] })
    })
})

describe('批次执行分支', () => {
    async function triggerBatch(
        changes: Array<['rename' | 'change', string | null]> = [['change', 'a.md']]
    ): Promise<FakeWatcher> {
        const fake = queueWatchResults(makeFakeWatcher())
        ensureDirectoryWatcher()
        for (const [type, name] of changes) fake[0]!.callback!(type, name)
        await vi.advanceTimersByTimeAsync(500)
        return fake[0]!
    }

    it('批次执行时根目录已关闭：停止监听并结束', async () => {
        const fake = queueWatchResults(makeFakeWatcher())
        ensureDirectoryWatcher()
        registerDirectoryWatchBatchHandler(batchHandler)
        fake[0]!.callback!('change', 'a.md')
        appState.rootPath = ''
        await vi.advanceTimersByTimeAsync(500)
        expect(batchHandler).not.toHaveBeenCalled()
        expect(GetDirectoryWatchStatus().active).toBe(false)
    })

    it('监听目录已被删除：告警并降级', async () => {
        fsMocks.access.mockRejectedValueOnce(new Error('ENOENT'))
        await triggerBatch()
        expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('监听目录已不存在'), ROOT)
        expect(GetDirectoryWatchStatus().degraded).toBe(true)
    })

    it('批次处理器未注册：记录错误并保持监听（批次不静默丢失）', async () => {
        await triggerBatch()
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('目录监听批次处理器未注册')
        )
    })

    it('批次处理器抛错：记录错误但保持监听（不拖垮主进程）', async () => {
        registerDirectoryWatchBatchHandler(batchHandler)
        batchHandler.mockRejectedValueOnce(new Error('reload failed'))
        await triggerBatch()
        expect(logger.error).toHaveBeenCalledWith(
            expect.stringContaining('目录监听批次刷新失败'),
            expect.any(Error)
        )
        expect(GetDirectoryWatchStatus().active).toBe(true)
    })
})

describe('监听创建与降级', () => {
    it('recursive 监听不被支持时降级为仅监听根目录', () => {
        const fallbackWatcher = makeFakeWatcher()
        queueWatchResults(new Error('ERR_FEATURE_UNAVAILABLE_ON_PLATFORM'), fallbackWatcher)
        ensureDirectoryWatcher()
        const status = GetDirectoryWatchStatus()
        expect(status.active).toBe(true)
        expect(status.recursive).toBe(false)
        expect(status.rootPath).toBe(ROOT)
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('不支持 recursive'),
            ROOT,
            expect.any(Error)
        )
    })

    it('recursive 与普通监听均失败：标记降级且不激活', () => {
        queueWatchResults(new Error('recursive failed'), new Error('plain failed'))
        ensureDirectoryWatcher()
        const status = GetDirectoryWatchStatus()
        expect(status.active).toBe(false)
        expect(status.degraded).toBe(true)
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('目录监听启动失败'),
            ROOT,
            expect.any(Error)
        )
    })

    it('watcher error 事件触发降级；close 抛错仍完成降级', () => {
        const watcher = makeFakeWatcher()
        watcher.close.mockImplementation(() => {
            throw new Error('already closed')
        })
        queueWatchResults(watcher)
        ensureDirectoryWatcher()
        expect(watcher.errorListener).toBeTypeOf('function')

        watcher.errorListener!(new Error('ENOSPC'))
        expect(GetDirectoryWatchStatus().degraded).toBe(true)
        expect(GetDirectoryWatchStatus().active).toBe(false)
        expect(logger.warn).toHaveBeenCalledWith(
            expect.stringContaining('目录监听异常'),
            expect.any(Error)
        )
    })

    it('注册 error 监听抛错时走外层 catch 降级', () => {
        const watcher = makeFakeWatcher()
        watcher.on.mockImplementation(() => {
            throw new Error('on failed')
        })
        queueWatchResults(watcher)
        ensureDirectoryWatcher()
        expect(GetDirectoryWatchStatus().degraded).toBe(true)
    })

    it('目录未变化时重复 ensure 不重建监听；切换目录后解除降级重试', () => {
        const first = makeFakeWatcher()
        queueWatchResults(first)
        ensureDirectoryWatcher()
        const watchCallsAfterFirst = fsMocks.watch.mock.calls.length
        ensureDirectoryWatcher()
        expect(fsMocks.watch.mock.calls.length).toBe(watchCallsAfterFirst)

        // 第一个目录降级后，切换到新目录应解除降级并重新尝试监听
        DegradeDirectoryWatch(new Error('ENOSPC'))
        expect(GetDirectoryWatchStatus().degraded).toBe(true)
        appState.rootPath = 'E:/another-workspace'
        const second = makeFakeWatcher()
        queueWatchResults(second)
        ensureDirectoryWatcher()
        expect(GetDirectoryWatchStatus()).toMatchObject({
            active: true,
            degraded: false,
            rootPath: 'E:/another-workspace'
        })
    })

    it('无工作区根目录时 ensure 只关闭已有监听', () => {
        const watcher = makeFakeWatcher()
        queueWatchResults(watcher)
        ensureDirectoryWatcher()
        expect(GetDirectoryWatchStatus().active).toBe(true)

        appState.rootPath = ''
        ensureDirectoryWatcher()
        expect(GetDirectoryWatchStatus().active).toBe(false)
        expect(watcher.close).toHaveBeenCalled()
    })

    it('降级后同一目录不反复重试监听', () => {
        queueWatchResults(new Error('recursive failed'), new Error('plain failed'))
        ensureDirectoryWatcher()
        expect(fsMocks.watch.mock.calls.length).toBe(2)
        ensureDirectoryWatcher()
        // 同一目录降级标记生效：不再调用 fs.watch
        expect(fsMocks.watch.mock.calls.length).toBe(2)
    })
})

describe('状态查询与复位', () => {
    it('初始状态为空闲且未降级', () => {
        expect(GetDirectoryWatchStatus()).toEqual({
            active: false,
            rootPath: '',
            recursive: false,
            degraded: false,
            batchPending: false
        })
    })

    it('resetDirectoryWatchState 复位降级与递归标记', () => {
        queueWatchResults(new Error('recursive failed'), new Error('plain failed'))
        ensureDirectoryWatcher()
        expect(GetDirectoryWatchStatus().degraded).toBe(true)
        resetDirectoryWatchState()
        expect(GetDirectoryWatchStatus().degraded).toBe(false)
    })
})
