/**
 * A2 工作区搜索/替换 IPC 注册单测（主进程，2026-11-21）
 *
 * 覆盖点：
 * 1. 两个通道（SEARCH_WORKSPACE / REPLACE_WORKSPACE）以 registerHandleOnce（invoke）注册；
 * 2. 受信主窗口调用时透传渲染层选项到服务层并原样返回结构化结果；
 * 3. 非受信发送方被 withSenderCheck 拒绝（不执行服务）；
 * 4. 服务层未预期异常被兜底为 INTERNAL_ERROR（不向渲染层抛栈）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

const serviceMocks = vi.hoisted(() => ({
    searchWorkspace: vi.fn(),
    replaceWorkspace: vi.fn()
}))

vi.mock('../../../src/main/utils/workspace-search', () => ({
    searchWorkspace: serviceMocks.searchWorkspace,
    replaceWorkspace: serviceMocks.replaceWorkspace
}))

interface CapturedListener {
    channel: string
    listener: (...args: unknown[]) => unknown
    kind: 'on' | 'handle'
    componentId: string
}

const captured = vi.hoisted(() => ({
    listeners: new Map<string, CapturedListener>()
}))

vi.mock('../../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: {
        registerHandleOnce: (
            channel: string,
            listener: (...args: unknown[]) => unknown,
            componentId: string
        ): string => {
            captured.listeners.set(channel, { channel, listener, kind: 'handle', componentId })
            return `${channel}:handle`
        },
        registerOnce: (channel: string, listener: (...args: unknown[]) => unknown): string => {
            captured.listeners.set(channel, { channel, listener, kind: 'on', componentId: '' })
            return `${channel}:once`
        }
    }
}))

import { IPC } from '../../../src/shared/ipc-channels'
import { registerWorkspaceSearchIpc } from '../../../src/main/ipc/workspace-search-ipc'
import {
    isUntrustedSenderResult,
    resetTrustedSenderRegistry,
    setTrustedMainWindow
} from '../../../src/main/utils/ipc-security'

const mainWindow = {
    webContents: { id: 42, send: vi.fn(), isDestroyed: () => false },
    isDestroyed: () => false
}
const trustedEvent = { sender: mainWindow.webContents }
const COMPONENT_ID = 'global-workspace-search-ipc'

/** 取注册的 handle 监听器（找不到直接失败，避免空断言假绿） */
function listenerOf(channel: string): CapturedListener {
    const entry = captured.listeners.get(channel)
    expect(entry, `应注册通道 ${channel}`).toBeDefined()
    return entry as CapturedListener
}

beforeEach(() => {
    vi.clearAllMocks()
    captured.listeners.clear()
    resetTrustedSenderRegistry()
    setTrustedMainWindow(mainWindow as never)
    registerWorkspaceSearchIpc(mainWindow as never, COMPONENT_ID)
})

describe('registerWorkspaceSearchIpc：注册契约', () => {
    it('以 handle（invoke）方式注册搜索与替换两个通道', () => {
        expect([...captured.listeners.keys()].sort()).toEqual(
            [IPC.FILE.SEARCH_WORKSPACE, IPC.FILE.REPLACE_WORKSPACE].sort()
        )
        for (const entry of captured.listeners.values()) {
            expect(entry.kind).toBe('handle')
            expect(entry.componentId).toBe(COMPONENT_ID)
        }
    })
})

describe('FILE.SEARCH_WORKSPACE handler', () => {
    it('受信发送方：透传选项并返回服务结果', async () => {
        const serviceResult = {
            ok: true,
            files: [],
            truncated: false,
            matchCount: 0,
            scannedFiles: 3
        }
        serviceMocks.searchWorkspace.mockResolvedValue(serviceResult)

        const options = { query: 'hello', caseSensitive: true, listFilesOnly: false }
        const result = await listenerOf(IPC.FILE.SEARCH_WORKSPACE).listener(trustedEvent, options)

        expect(serviceMocks.searchWorkspace).toHaveBeenCalledWith(options)
        expect(result).toEqual(serviceResult)
    })

    it('非受信发送方：返回拒绝对象且不执行服务', async () => {
        const result = await listenerOf(IPC.FILE.SEARCH_WORKSPACE).listener(
            { sender: { id: 999 } },
            { query: 'hello' }
        )
        expect(isUntrustedSenderResult(result)).toBe(true)
        expect(serviceMocks.searchWorkspace).not.toHaveBeenCalled()
    })

    it('服务层异常：兜底为 INTERNAL_ERROR 结构化结果', async () => {
        serviceMocks.searchWorkspace.mockRejectedValue(new Error('boom'))
        const result = (await listenerOf(IPC.FILE.SEARCH_WORKSPACE).listener(trustedEvent, {
            query: 'hello'
        })) as { ok: boolean; code: string; files: unknown[] }
        expect(result).toMatchObject({ ok: false, code: 'INTERNAL_ERROR', files: [] })
    })
})

describe('FILE.REPLACE_WORKSPACE handler', () => {
    it('受信发送方：透传选项并返回服务结果', async () => {
        const serviceResult = {
            ok: true,
            files: [{ filePath: 'C:/w/a.md', relativePath: 'a.md', replacements: 2 }],
            totalReplacements: 2
        }
        serviceMocks.replaceWorkspace.mockResolvedValue(serviceResult)

        const options = { query: 'hello', replacement: 'HI', filePaths: ['C:/w/a.md'] }
        const result = await listenerOf(IPC.FILE.REPLACE_WORKSPACE).listener(trustedEvent, options)

        expect(serviceMocks.replaceWorkspace).toHaveBeenCalledWith(options)
        expect(result).toEqual(serviceResult)
    })

    it('非受信发送方：返回拒绝对象且不执行服务', async () => {
        const result = await listenerOf(IPC.FILE.REPLACE_WORKSPACE).listener(
            { sender: { id: 999 } },
            { query: 'hello', replacement: 'HI', filePaths: [] }
        )
        expect(isUntrustedSenderResult(result)).toBe(true)
        expect(serviceMocks.replaceWorkspace).not.toHaveBeenCalled()
    })

    it('服务层异常：兜底为 INTERNAL_ERROR 结构化结果', async () => {
        serviceMocks.replaceWorkspace.mockRejectedValue(new Error('boom'))
        const result = (await listenerOf(IPC.FILE.REPLACE_WORKSPACE).listener(trustedEvent, {
            query: 'hello',
            replacement: 'HI',
            filePaths: []
        })) as { ok: boolean; code: string; totalReplacements: number }
        expect(result).toMatchObject({
            ok: false,
            code: 'INTERNAL_ERROR',
            files: [],
            totalReplacements: 0
        })
    })
})
