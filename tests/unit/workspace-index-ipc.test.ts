/**
 * 工作区索引 IPC 查询层测试（不启动 Electron）：
 * - force=false 命中缓存，force=true 重建；
 * - 工作区根变化触发重建；
 * - 根为空/非法载荷/构建异常返回结构化错误；
 * - 缓存可显式失效。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { WorkspaceIndexSnapshot } from '../../src/shared/types/workspace-index'

const mocks = vi.hoisted(() => ({
    appState: { rootPath: '' },
    buildWorkspaceIndex: vi.fn(async (rootPath: string): Promise<WorkspaceIndexSnapshot> => {
        const snapshot = makeSnapshot(rootPath)
        return snapshot
    })
}))

function makeSnapshot(rootPath: string): WorkspaceIndexSnapshot {
    return {
        rootPath,
        generatedAt: 1,
        files: [],
        tags: [],
        missingLinks: [],
        stats: { fileCount: 0, linkCount: 0, missingCount: 0, ambiguousCount: 0 }
    }
}

vi.mock('../../src/main/utils/app-state', () => ({ appState: mocks.appState }))
vi.mock('../../src/main/utils/workspace-index', () => ({
    buildWorkspaceIndex: mocks.buildWorkspaceIndex
}))
vi.mock('../../src/main/utils/ipc-security', () => ({
    withSenderCheck: (_channel: string, handler: unknown) => handler
}))
vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: { registerHandleOnce: vi.fn() }
}))
vi.mock('../../src/main/utils/logger', () => ({
    logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() }
}))

import {
    invalidateWorkspaceIndexCache,
    queryWorkspaceIndex
} from '../../src/main/ipc/workspace-index-ipc'

describe('queryWorkspaceIndex', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.appState.rootPath = 'C:/workspace'
        invalidateWorkspaceIndexCache()
    })

    it('首次构建成功后缓存，第二次命中缓存', async () => {
        const first = await queryWorkspaceIndex(undefined)
        expect(first.ok).toBe(true)
        if (first.ok) {
            expect(first.cached).toBe(false)
            expect(first.snapshot.rootPath).toBe('C:/workspace')
        }
        expect(mocks.buildWorkspaceIndex).toHaveBeenCalledTimes(1)

        const second = await queryWorkspaceIndex({})
        expect(second.ok).toBe(true)
        if (second.ok) expect(second.cached).toBe(true)
        expect(mocks.buildWorkspaceIndex).toHaveBeenCalledTimes(1)
    })

    it('force=true 强制重建', async () => {
        await queryWorkspaceIndex(undefined)
        const forced = await queryWorkspaceIndex({ force: true })
        expect(forced.ok).toBe(true)
        if (forced.ok) expect(forced.cached).toBe(false)
        expect(mocks.buildWorkspaceIndex).toHaveBeenCalledTimes(2)
    })

    it('工作区根变化时自动重建', async () => {
        await queryWorkspaceIndex(undefined)
        mocks.appState.rootPath = 'C:/other'
        const result = await queryWorkspaceIndex(undefined)
        expect(result.ok).toBe(true)
        if (result.ok) expect(result.snapshot.rootPath).toBe('C:/other')
        expect(mocks.buildWorkspaceIndex).toHaveBeenCalledTimes(2)
    })

    it('无工作区返回 NO_WORKSPACE 且不调用构建', async () => {
        mocks.appState.rootPath = ''
        const result = await queryWorkspaceIndex(undefined)
        expect(result).toEqual({ ok: false, code: 'NO_WORKSPACE' })
        expect(mocks.buildWorkspaceIndex).not.toHaveBeenCalled()
    })

    it.each([['bad'], [1], [[1, 2]], [{ force: 'yes' }]])(
        '非法载荷 %j 返回 INVALID_PAYLOAD',
        async (payload) => {
            const result = await queryWorkspaceIndex(payload)
            expect(result).toEqual({ ok: false, code: 'INVALID_PAYLOAD' })
            expect(mocks.buildWorkspaceIndex).not.toHaveBeenCalled()
        }
    )

    it('构建异常返回 INDEX_ERROR 且不缓存失败', async () => {
        mocks.buildWorkspaceIndex.mockRejectedValueOnce(new Error('scan failed'))
        const result = await queryWorkspaceIndex(undefined)
        expect(result).toEqual({ ok: false, code: 'INDEX_ERROR' })

        mocks.buildWorkspaceIndex.mockResolvedValueOnce(makeSnapshot('C:/workspace'))
        const retry = await queryWorkspaceIndex(undefined)
        expect(retry.ok).toBe(true)
    })

    it('invalidateWorkspaceIndexCache 清空缓存', async () => {
        await queryWorkspaceIndex(undefined)
        invalidateWorkspaceIndexCache()
        const result = await queryWorkspaceIndex(undefined)
        expect(result.ok).toBe(true)
        expect(mocks.buildWorkspaceIndex).toHaveBeenCalledTimes(2)
    })
})
