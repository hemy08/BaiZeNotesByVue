/**
 * B5 附件管理 IPC 层单测（`src/main/ipc/attachment-ipc.ts`，不启动 Electron）
 *
 * 覆盖口径：
 * - 工作区根只取 `appState.rootPath`（不接受渲染层指定根）；
 * - 三个业务入口的 NO_WORKSPACE / INVALID_PAYLOAD / 未预期异常兜底；
 * - 成功路径正确委托 `attachment-manager` 并透传主进程根路径；
 * - `registerAttachmentIpc` 按契约注册三个 handle 通道并透传 componentId；
 * - 写盘类操作串行队列（B5-R10）与测试 reset。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../src/shared/ipc-channels'
import type { BrowserWindow } from 'electron'

const mocks = vi.hoisted(() => ({
    appState: { rootPath: '' },
    auditAttachments: vi.fn(),
    trashAttachments: vi.fn(),
    renameAttachment: vi.fn(),
    registerHandleOnce: vi.fn(),
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}))

vi.mock('../../src/main/utils/app-state', () => ({ appState: mocks.appState }))
vi.mock('../../src/main/utils/attachment-manager', () => ({
    auditAttachments: mocks.auditAttachments,
    trashAttachments: mocks.trashAttachments,
    renameAttachment: mocks.renameAttachment
}))
// sender 校验在 ipc-security 单测覆盖；本文件只验证 handler 注册形状，直接放行
vi.mock('../../src/main/utils/ipc-security', () => ({
    withSenderCheck: (_channel: string, handler: unknown) => handler
}))
vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: { registerHandleOnce: mocks.registerHandleOnce }
}))
vi.mock('../../src/main/utils/logger', () => ({ logger: mocks.logger }))

import {
    queryAttachmentAudit,
    registerAttachmentIpc,
    renameAttachmentFromIpc,
    resetAttachmentIpcForTesting,
    trashAttachmentPaths
} from '../../src/main/ipc/attachment-ipc'

/** 注册函数只需要一个窗口占位；sender 校验已 mock */
const fakeMainWindow = {} as BrowserWindow

/** 取第 index 次注册的监听器（withSenderCheck 被 mock 为直接返回 handler） */
function getRegisteredListener(
    index: number
): (event: unknown, ...args: unknown[]) => Promise<unknown> {
    const call = mocks.registerHandleOnce.mock.calls[index]
    return call[1] as (event: unknown, ...args: unknown[]) => Promise<unknown>
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.appState.rootPath = ''
    resetAttachmentIpcForTesting()
})

describe('queryAttachmentAudit', () => {
    it('无工作区返回 NO_WORKSPACE 且不调用审计服务', async () => {
        const result = await queryAttachmentAudit()
        expect(result).toEqual({ ok: false, code: 'NO_WORKSPACE' })
        expect(mocks.auditAttachments).not.toHaveBeenCalled()
    })

    it('有工作区时用 appState.rootPath 委托审计服务', async () => {
        mocks.appState.rootPath = 'C:/workspace'
        mocks.auditAttachments.mockResolvedValue({
            ok: true,
            orphans: [],
            referencedCount: 0,
            totalCount: 0,
            truncated: false
        })
        const result = await queryAttachmentAudit()
        expect(result.ok).toBe(true)
        expect(mocks.auditAttachments).toHaveBeenCalledWith('C:/workspace')
    })

    it('审计服务抛异常时返回 AUDIT_ERROR 并记录日志', async () => {
        mocks.appState.rootPath = 'C:/workspace'
        mocks.auditAttachments.mockRejectedValueOnce(new Error('扫描异常'))
        const result = await queryAttachmentAudit()
        expect(result).toEqual({ ok: false, code: 'AUDIT_ERROR' })
        expect(mocks.logger.error).toHaveBeenCalledTimes(1)
    })
})

describe('trashAttachmentPaths', () => {
    it('无工作区返回 NO_WORKSPACE 且不调用服务', async () => {
        const result = await trashAttachmentPaths(['a.png'])
        expect(result).toEqual({ ok: false, code: 'NO_WORKSPACE' })
        expect(mocks.trashAttachments).not.toHaveBeenCalled()
    })

    it('载荷不是数组时返回 INVALID_PAYLOAD 且不调用服务', async () => {
        mocks.appState.rootPath = 'C:/workspace'
        const results = await Promise.all([
            trashAttachmentPaths('a.png'),
            trashAttachmentPaths({ paths: ['a.png'] }),
            trashAttachmentPaths(undefined)
        ])
        for (const result of results) {
            expect(result).toEqual({ ok: false, code: 'INVALID_PAYLOAD' })
        }
        expect(mocks.trashAttachments).not.toHaveBeenCalled()
    })

    it('合法数组用 appState.rootPath 委托回收站服务', async () => {
        mocks.appState.rootPath = 'C:/workspace'
        mocks.trashAttachments.mockResolvedValue({ ok: true, trashed: 1, failed: [] })
        const result = await trashAttachmentPaths(['C:/workspace/a.png'])
        expect(result).toEqual({ ok: true, trashed: 1, failed: [] })
        expect(mocks.trashAttachments).toHaveBeenCalledWith('C:/workspace', ['C:/workspace/a.png'])
    })

    it('回收站服务抛异常时返回 TRASH_ERROR 并记录日志', async () => {
        mocks.appState.rootPath = 'C:/workspace'
        mocks.trashAttachments.mockRejectedValueOnce(new Error('回收站异常'))
        const result = await trashAttachmentPaths(['C:/workspace/a.png'])
        expect(result).toEqual({ ok: false, code: 'TRASH_ERROR' })
        expect(mocks.logger.error).toHaveBeenCalledTimes(1)
    })
})

describe('renameAttachmentFromIpc', () => {
    it('无工作区返回 NO_WORKSPACE 且不调用服务', async () => {
        const result = await renameAttachmentFromIpc('C:/workspace/a.png', 'b.png')
        expect(result).toEqual({ ok: false, code: 'NO_WORKSPACE' })
        expect(mocks.renameAttachment).not.toHaveBeenCalled()
    })

    it('旧路径/新名为非字符串时返回 INVALID_PAYLOAD 且不调用服务', async () => {
        mocks.appState.rootPath = 'C:/workspace'
        const results = await Promise.all([
            renameAttachmentFromIpc(1, 'b.png'),
            renameAttachmentFromIpc('C:/workspace/a.png', ['b.png']),
            renameAttachmentFromIpc(null, null)
        ])
        for (const result of results) {
            expect(result).toEqual({ ok: false, code: 'INVALID_PAYLOAD' })
        }
        expect(mocks.renameAttachment).not.toHaveBeenCalled()
    })

    it('用 appState.rootPath 委托重命名服务', async () => {
        mocks.appState.rootPath = 'C:/workspace'
        mocks.renameAttachment.mockResolvedValue({
            ok: true,
            newPath: 'C:/workspace/b.png',
            updatedFiles: 1,
            replacements: 1,
            failedFiles: []
        })
        const result = await renameAttachmentFromIpc('C:/workspace/a.png', 'b.png')
        expect(result.ok).toBe(true)
        expect(mocks.renameAttachment).toHaveBeenCalledWith(
            'C:/workspace',
            'C:/workspace/a.png',
            'b.png'
        )
    })

    it('重命名服务抛异常时返回 RENAME_FAILED 并记录日志', async () => {
        mocks.appState.rootPath = 'C:/workspace'
        mocks.renameAttachment.mockRejectedValueOnce(new Error('改名异常'))
        const result = await renameAttachmentFromIpc('C:/workspace/a.png', 'b.png')
        expect(result).toEqual({ ok: false, code: 'RENAME_FAILED' })
        expect(mocks.logger.error).toHaveBeenCalledTimes(1)
    })
})

describe('registerAttachmentIpc', () => {
    it('按契约注册三个 handle 通道并透传 componentId', async () => {
        registerAttachmentIpc(fakeMainWindow, 'b5-attachment-ipc')
        expect(mocks.registerHandleOnce).toHaveBeenCalledTimes(3)
        const registered = mocks.registerHandleOnce.mock.calls.map((call) => ({
            channel: call[0],
            componentId: call[2]
        }))
        expect(registered).toEqual([
            { channel: IPC.FILE.GET_ATTACHMENT_AUDIT, componentId: 'b5-attachment-ipc' },
            { channel: IPC.FILE.TRASH_ATTACHMENTS, componentId: 'b5-attachment-ipc' },
            { channel: IPC.FILE.RENAME_ATTACHMENT, componentId: 'b5-attachment-ipc' }
        ])
    })

    it('注册的审计监听器透传业务结果', async () => {
        mocks.appState.rootPath = 'C:/workspace'
        mocks.auditAttachments.mockResolvedValue({
            ok: true,
            orphans: [],
            referencedCount: 0,
            totalCount: 0,
            truncated: false
        })
        registerAttachmentIpc(fakeMainWindow, 'b5-attachment-ipc')
        const result = await getRegisteredListener(0)({})
        expect(result).toEqual({
            ok: true,
            orphans: [],
            referencedCount: 0,
            totalCount: 0,
            truncated: false
        })
    })

    it('写盘类通道串行执行：前一个未完成时后一个不开始', async () => {
        mocks.appState.rootPath = 'C:/workspace'
        let resolveFirst: ((value: unknown) => void) | null = null
        mocks.trashAttachments.mockImplementationOnce(
            () =>
                new Promise((resolve) => {
                    resolveFirst = resolve
                })
        )
        mocks.trashAttachments.mockResolvedValueOnce({ ok: true, trashed: 1, failed: [] })
        registerAttachmentIpc(fakeMainWindow, 'b5-attachment-ipc')
        const trashListener = getRegisteredListener(1)
        const first = trashListener({}, ['C:/workspace/a.png'])
        const second = trashListener({}, ['C:/workspace/b.png'])
        // 队列通过 microtask 启动首个任务：先让出一次事件循环再断言
        await Promise.resolve()
        await Promise.resolve()
        expect(mocks.trashAttachments).toHaveBeenCalledTimes(1)
        expect(resolveFirst).not.toBeNull()
        // 解开第一个任务后队列继续执行第二个
        const finishFirst = resolveFirst as unknown as (value: unknown) => void
        finishFirst({ ok: true, trashed: 1, failed: [] })
        await first
        await second
        expect(mocks.trashAttachments).toHaveBeenCalledTimes(2)
    })

    it('队列任务异常时拒绝传播给调用方，且后续任务仍可执行', async () => {
        const descriptor = Object.getOwnPropertyDescriptor(mocks.appState, 'rootPath')
        let firstError: unknown = null
        try {
            // 让业务入口在进入 try/catch 之前抛错：任务 Promise 进入 rejected 状态
            Object.defineProperty(mocks.appState, 'rootPath', {
                configurable: true,
                get: () => {
                    throw new Error('读取工作区根失败')
                }
            })
            mocks.trashAttachments.mockResolvedValue({ ok: true, trashed: 1, failed: [] })
            registerAttachmentIpc(fakeMainWindow, 'b5-attachment-ipc')
            const trashListener = getRegisteredListener(1)
            try {
                await trashListener({}, ['C:/workspace/a.png'])
            } catch (error) {
                firstError = error
            }
        } finally {
            if (descriptor) {
                Object.defineProperty(mocks.appState, 'rootPath', descriptor)
            }
        }
        expect((firstError as Error).message).toBe('读取工作区根失败')
        // 队列自身已从 rejected 状态恢复：后续任务照常执行
        mocks.appState.rootPath = 'C:/workspace'
        const second = await getRegisteredListener(1)({}, ['C:/workspace/b.png'])
        expect(second).toEqual({ ok: true, trashed: 1, failed: [] })
    })

    it('重命名监听器透传旧路径与新名', async () => {
        mocks.appState.rootPath = 'C:/workspace'
        mocks.renameAttachment.mockResolvedValue({
            ok: true,
            newPath: 'C:/workspace/b.png',
            updatedFiles: 0,
            replacements: 0,
            failedFiles: []
        })
        registerAttachmentIpc(fakeMainWindow, 'b5-attachment-ipc')
        const renameListener = getRegisteredListener(2)
        const result = await renameListener({}, 'C:/workspace/a.png', 'b.png')
        expect(result).toEqual({
            ok: true,
            newPath: 'C:/workspace/b.png',
            updatedFiles: 0,
            replacements: 0,
            failedFiles: []
        })
        expect(mocks.renameAttachment).toHaveBeenCalledWith(
            'C:/workspace',
            'C:/workspace/a.png',
            'b.png'
        )
    })
})
