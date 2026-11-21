/**
 * A2 工作区搜索控制器单测（渲染层 composable，2026-11-21）
 *
 * 覆盖点：
 * 1. search/listFiles/replaceOne/replaceAll 的 IPC 通道、请求载荷与返回值归一化；
 * 2. IPC 不可用 / invoke 异常 / 畸形响应 → 结构化失败（不抛异常）；
 * 3. 打开文件并跳行的链路：OPEN_SELECT_FILE → 等 USER_SELECT_FILE → 延迟跳行；
 *    路径不匹配超时 / 非法入参 / IPC 不可用的失败分支。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

import { IPC } from '../../../src/shared/ipc-channels'
import {
    createWorkspaceSearchController,
    getWorkspaceSearchIpc,
    openWorkspaceFileAtLine,
    OPEN_WORKSPACE_FILE_JUMP_DELAY_MS,
    OPEN_WORKSPACE_FILE_TIMEOUT_MS,
    type WorkspaceSearchIpcLike
} from '../../../src/renderer/src/composables/useWorkspaceSearch'
import type { WorkspaceSearchCriteria } from '../../../src/renderer/src/components/search/workspace-search-utils'

const criteria: WorkspaceSearchCriteria = {
    caseSensitive: false,
    wholeWord: false,
    useRegex: false
}

/** 构造受限 ipcRenderer 替身 */
function makeIpc(overrides: Partial<WorkspaceSearchIpcLike> = {}): WorkspaceSearchIpcLike {
    return {
        invoke: vi.fn().mockResolvedValue(undefined),
        send: vi.fn(),
        on: vi.fn(),
        removeListener: vi.fn(),
        ...overrides
    }
}

beforeEach(() => {
    vi.clearAllMocks()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('createWorkspaceSearchController：搜索', () => {
    it('成功时调用 SEARCH_WORKSPACE 并写入响应式状态', async () => {
        const ipc = makeIpc({
            invoke: vi.fn().mockResolvedValue({
                ok: true,
                files: [
                    {
                        filePath: 'C:/w/a.md',
                        relativePath: 'a.md',
                        matches: [
                            { line: 1, column: 2, preview: 'x hello' },
                            { line: 3, column: 5, preview: 'hello' }
                        ]
                    }
                ],
                truncated: true,
                matchCount: 2,
                scannedFiles: 7
            })
        })
        const controller = createWorkspaceSearchController({ ipc })
        const result = await controller.search('hello', criteria)

        expect(ipc.invoke).toHaveBeenCalledTimes(1)
        const [channel, payload] = vi.mocked(ipc.invoke).mock.calls[0]
        expect(channel).toBe(IPC.FILE.SEARCH_WORKSPACE)
        expect(payload).toMatchObject({
            query: 'hello',
            caseSensitive: false,
            wholeWord: false,
            useRegex: false
        })
        expect(result.ok).toBe(true)
        expect(controller.state.files).toHaveLength(1)
        expect(controller.state.matchCount).toBe(2)
        expect(controller.state.truncated).toBe(true)
        expect(controller.state.scannedFiles).toBe(7)
        expect(controller.state.errorCode).toBeNull()
        expect(controller.state.lastQuery).toBe('hello')
        expect(controller.state.loading).toBe(false)
    })

    it('主进程返回安全失败 code 时写入 errorCode', async () => {
        const ipc = makeIpc({
            invoke: vi.fn().mockResolvedValue({ ok: false, code: 'INVALID_REGEX' })
        })
        const controller = createWorkspaceSearchController({ ipc })
        const result = await controller.search('([', criteria)
        expect(result.ok).toBe(false)
        expect(result.code).toBe('INVALID_REGEX')
        expect(controller.state.errorCode).toBe('INVALID_REGEX')
    })

    it('畸形响应/IPC 异常 → SEARCH_FAILED（不抛异常）', async () => {
        const malformed = createWorkspaceSearchController({
            ipc: makeIpc({ invoke: vi.fn().mockResolvedValue('bad-response') })
        })
        const malformedResult = await malformed.search('hello', criteria)
        expect(malformedResult.ok).toBe(false)
        expect(malformed.state.errorCode).toBe('SEARCH_FAILED')

        const rejected = createWorkspaceSearchController({
            ipc: makeIpc({ invoke: vi.fn().mockRejectedValue(new Error('ipc down')) })
        })
        const rejectedResult = await rejected.search('hello', criteria)
        expect(rejectedResult.ok).toBe(false)
        expect(rejected.state.errorCode).toBe('SEARCH_FAILED')
        expect(rejected.state.loading).toBe(false)
    })

    it('IPC 不可用时返回 SEARCH_FAILED 并保持空状态', async () => {
        const controller = createWorkspaceSearchController({ ipc: null })
        const result = await controller.search('hello', criteria)
        expect(result.ok).toBe(false)
        expect(controller.state.files).toEqual([])
        expect(controller.state.errorCode).toBe('SEARCH_FAILED')
    })
})

describe('createWorkspaceSearchController：Quick Open 文件清单', () => {
    it('调用 SEARCH_WORKSPACE（listFilesOnly）并返回文件清单', async () => {
        const ipc = makeIpc({
            invoke: vi.fn().mockResolvedValue({
                ok: true,
                files: [],
                fileList: [{ filePath: 'C:/w/a.md', relativePath: 'a.md' }],
                truncated: false,
                matchCount: 0,
                scannedFiles: 1
            })
        })
        const controller = createWorkspaceSearchController({ ipc })
        const entries = await controller.listFiles()
        expect(entries).toEqual([{ filePath: 'C:/w/a.md', relativePath: 'a.md' }])
        const [channel, payload] = vi.mocked(ipc.invoke).mock.calls[0]
        expect(channel).toBe(IPC.FILE.SEARCH_WORKSPACE)
        expect(payload).toMatchObject({ listFilesOnly: true })
        expect(controller.state.loading).toBe(false)
    })

    it('失败/无文件清单时返回空数组', async () => {
        const failed = createWorkspaceSearchController({
            ipc: makeIpc({ invoke: vi.fn().mockResolvedValue({ ok: false, code: 'NO_WORKSPACE' }) })
        })
        expect(await failed.listFiles()).toEqual([])

        const thrown = createWorkspaceSearchController({
            ipc: makeIpc({ invoke: vi.fn().mockRejectedValue(new Error('ipc down')) })
        })
        expect(await thrown.listFiles()).toEqual([])

        const noIpc = createWorkspaceSearchController({ ipc: null })
        expect(await noIpc.listFiles()).toEqual([])
    })
})

describe('createWorkspaceSearchController：替换', () => {
    it('replaceOne 传递行/列并归一化结果', async () => {
        const ipc = makeIpc({
            invoke: vi.fn().mockResolvedValue({
                ok: true,
                files: [{ filePath: 'C:/w/a.md', relativePath: 'a.md', replacements: 1 }],
                totalReplacements: 1
            })
        })
        const controller = createWorkspaceSearchController({ ipc })
        const result = await controller.replaceOne({
            query: 'hello',
            criteria,
            replacement: 'HI',
            filePath: 'C:/w/a.md',
            line: 3,
            column: 5
        })
        expect(result.ok).toBe(true)
        expect(result.totalReplacements).toBe(1)
        const [channel, payload] = vi.mocked(ipc.invoke).mock.calls[0]
        expect(channel).toBe(IPC.FILE.REPLACE_WORKSPACE)
        expect(payload).toMatchObject({
            query: 'hello',
            replacement: 'HI',
            filePaths: ['C:/w/a.md'],
            line: 3,
            column: 5
        })
        expect(controller.state.replacing).toBe(false)
    })

    it('replaceAll 传递全部文件并归一化失败结果', async () => {
        const ipc = makeIpc({
            invoke: vi.fn().mockResolvedValue({
                ok: false,
                code: 'PATH_DENIED',
                files: [{ filePath: 'C:/w/a.md', relativePath: 'a.md', replacements: 0 }],
                totalReplacements: 0
            })
        })
        const controller = createWorkspaceSearchController({ ipc })
        const result = await controller.replaceAll({
            query: 'hello',
            criteria,
            replacement: 'HI',
            filePaths: ['C:/w/a.md', 'C:/w/b.md']
        })
        expect(result.ok).toBe(false)
        expect(result.code).toBe('PATH_DENIED')
        const [channel, payload] = vi.mocked(ipc.invoke).mock.calls[0]
        expect(channel).toBe(IPC.FILE.REPLACE_WORKSPACE)
        expect(payload).toMatchObject({ filePaths: ['C:/w/a.md', 'C:/w/b.md'] })
        expect((payload as { line?: number }).line).toBeUndefined()
    })

    it('IPC 不可用/异常 → INTERNAL_ERROR 结构化结果', async () => {
        const noIpc = createWorkspaceSearchController({ ipc: null })
        expect(
            (
                await noIpc.replaceAll({
                    query: 'q',
                    criteria,
                    replacement: 'r',
                    filePaths: ['x']
                })
            ).code
        ).toBe('INTERNAL_ERROR')

        const rejected = createWorkspaceSearchController({
            ipc: makeIpc({ invoke: vi.fn().mockRejectedValue(new Error('ipc down')) })
        })
        const result = await rejected.replaceOne({
            query: 'q',
            criteria,
            replacement: 'r',
            filePath: 'x',
            line: 1,
            column: 1
        })
        expect(result.code).toBe('INTERNAL_ERROR')
        expect(rejected.state.replacing).toBe(false)
    })
})

describe('getWorkspaceSearchIpc', () => {
    it('node 环境无 window 时返回 null', () => {
        expect(getWorkspaceSearchIpc()).toBeNull()
    })

    it('window.electron.ipcRenderer 完整时返回该对象', () => {
        const ipc = makeIpc()
        vi.stubGlobal('window', { electron: { ipcRenderer: ipc } })
        try {
            expect(getWorkspaceSearchIpc()).toBe(ipc)
        } finally {
            vi.unstubAllGlobals()
        }
    })

    it('ipcRenderer 结构不完整时返回 null', () => {
        vi.stubGlobal('window', { electron: { ipcRenderer: { invoke: vi.fn() } } })
        try {
            expect(getWorkspaceSearchIpc()).toBeNull()
        } finally {
            vi.unstubAllGlobals()
        }
    })
})

describe('openWorkspaceFileAtLine：打开文件并跳行', () => {
    it('发送 OPEN_SELECT_FILE，等待 USER_SELECT_FILE 后经 EventBus 跳行', async () => {
        vi.useFakeTimers()
        const ipc = makeIpc()
        const emitJump = vi.fn()
        const promise = openWorkspaceFileAtLine('C:\\w\\a.md', 12, {
            ipc,
            emitJump,
            timeoutMs: 1000,
            jumpDelayMs: OPEN_WORKSPACE_FILE_JUMP_DELAY_MS
        })

        expect(ipc.on).toHaveBeenCalledWith(IPC.FILE.USER_SELECT_FILE, expect.any(Function))
        expect(ipc.send).toHaveBeenCalledWith(IPC.FILE.OPEN_SELECT_FILE, {
            name: 'a.md',
            path: 'C:\\w\\a.md',
            type: 'file',
            content: ''
        })

        const listener = vi.mocked(ipc.on).mock.calls[0][1]
        // 路径大小写/分隔符差异也应匹配（主进程可能回发正斜杠路径）
        listener({}, 'c:/w/a.md')
        await vi.advanceTimersByTimeAsync(OPEN_WORKSPACE_FILE_JUMP_DELAY_MS)
        await expect(promise).resolves.toBe(true)
        expect(emitJump).toHaveBeenCalledWith(12)
        expect(ipc.removeListener).toHaveBeenCalledWith(IPC.FILE.USER_SELECT_FILE, listener)
    })

    it('非法行号按第 1 行处理', async () => {
        vi.useFakeTimers()
        const ipc = makeIpc()
        const emitJump = vi.fn()
        const promise = openWorkspaceFileAtLine('C:/w/a.md', Number.NaN, {
            ipc,
            emitJump,
            timeoutMs: 1000,
            jumpDelayMs: 10
        })
        const listener = vi.mocked(ipc.on).mock.calls[0][1]
        listener({}, 'C:/w/a.md')
        await vi.advanceTimersByTimeAsync(10)
        await expect(promise).resolves.toBe(true)
        expect(emitJump).toHaveBeenCalledWith(1)
    })

    it('路径不匹配时超时返回 false 且不跳行', async () => {
        vi.useFakeTimers()
        const ipc = makeIpc()
        const emitJump = vi.fn()
        const promise = openWorkspaceFileAtLine('C:/w/a.md', 2, {
            ipc,
            emitJump,
            timeoutMs: 500,
            jumpDelayMs: 10
        })
        const listener = vi.mocked(ipc.on).mock.calls[0][1]
        listener({}, 'C:/w/other.md')
        await vi.advanceTimersByTimeAsync(500)
        await expect(promise).resolves.toBe(false)
        expect(emitJump).not.toHaveBeenCalled()
    })

    it('非法入参/IPC 不可用/send 异常均返回 false', async () => {
        expect(await openWorkspaceFileAtLine('', 1, { ipc: makeIpc() })).toBe(false)
        expect(await openWorkspaceFileAtLine('C:/w/a.md', 1, { ipc: null })).toBe(false)

        const throwing = makeIpc({
            send: vi.fn(() => {
                throw new Error('send failed')
            })
        })
        await expect(
            openWorkspaceFileAtLine('C:/w/a.md', 1, { ipc: throwing, timeoutMs: 100 })
        ).resolves.toBe(false)
    })

    it('超时时间可用常量缺省（未显式传参时不立即失败）', async () => {
        vi.useFakeTimers()
        const ipc = makeIpc()
        const promise = openWorkspaceFileAtLine('C:/w/a.md', 1, { ipc, jumpDelayMs: 5 })
        // 推进到默认超时前但留出跳行延迟窗口（否则 4000ms 默认超时会先于跳行触发）
        await vi.advanceTimersByTimeAsync(OPEN_WORKSPACE_FILE_TIMEOUT_MS - 10)
        const listener = vi.mocked(ipc.on).mock.calls[0][1]
        listener({}, 'C:/w/a.md')
        await vi.advanceTimersByTimeAsync(5)
        await expect(promise).resolves.toBe(true)
    })
})
