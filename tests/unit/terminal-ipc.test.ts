/**
 * 1.5.7 终端工具（阶段 A）：终端 IPC 单测（src/main/ipc/terminal-ipc.ts）
 *
 * 覆盖：
 * 1. 注册形状：4 个 invoke 通道经 `ipcListenerManager.registerHandleOnce` 注册
 *    （withSenderCheck 包装），componentId 透传（缺省 `global-terminal-ipc`）；
 * 2. payload 校验：CREATE（对象/尺寸 1..500/shell 白名单）、WRITE（id/data/≤64 KiB）、
 *    RESIZE（尺寸）、CLOSE（id）——非法一律 `TERMINAL_INVALID_PAYLOAD`；
 * 3. 业务链路：合法 payload 委托 pty-manager（spawn/write/resize/kill 被调用）；
 *    无工作区 → `TERMINAL_NO_WORKSPACE`；会话不存在 → `TERMINAL_NOT_FOUND`；
 * 4. sender 校验：受信主窗口调用成功；不受信发送方返回统一拒绝对象且不执行 pty 操作。
 *
 * 说明：node-pty / app-state / logger / 监听台账均为替身，测试不加载原生模块，
 * 也不启动真实子进程。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { Mock } from 'vitest'

/** node-pty 原生模块替身（spawn 返回轻量 pty 桩） */
const nodePtyMock = vi.hoisted(() => ({ spawn: vi.fn() }))

/** app-state / logger 替身 */
const stateMock = vi.hoisted(() => ({
    rootPath: '',
    sendToMainWindow: vi.fn(() => true),
    loggerInfo: vi.fn(),
    loggerWarn: vi.fn(),
    loggerError: vi.fn()
}))

vi.mock('node-pty', () => ({ spawn: nodePtyMock.spawn }))

vi.mock('../../src/main/utils/app-state', () => ({
    appState: {
        get rootPath(): string {
            return stateMock.rootPath
        },
        set rootPath(value: string) {
            stateMock.rootPath = value
        }
    },
    sendToMainWindow: stateMock.sendToMainWindow
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: {
        info: stateMock.loggerInfo,
        warn: stateMock.loggerWarn,
        error: stateMock.loggerError,
        debug: vi.fn()
    }
}))

/** 监听台账替身：记录 registerHandleOnce 的通道/监听器/组件 ID，供模拟 IPC 消息触发 */
const registers = vi.hoisted(() => ({
    calls: [] as Array<{ channel: string; listener: (...args: unknown[]) => unknown; id?: string }>
}))

vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: {
        registerHandleOnce: (
            channel: string,
            listener: (...args: unknown[]) => unknown,
            id?: string
        ): string => {
            registers.calls.push({ channel, listener, id })
            return `${channel}:handle`
        }
    }
}))

import { IPC } from '../../src/shared/ipc-channels'
import {
    MAX_TERMINAL_WRITE_CHARS,
    disposeAllTerminalSessions,
    getTerminalSessionCount
} from '../../src/main/terminal/pty-manager'
import {
    parseTerminalClosePayload,
    parseTerminalCreatePayload,
    parseTerminalResizePayload,
    parseTerminalWritePayload,
    registerTerminalIpc,
    TERMINAL_IPC_COMPONENT_ID,
    TERMINAL_SHELL_WHITELIST,
    terminalClose,
    terminalCreate,
    terminalResize,
    terminalWrite
} from '../../src/main/ipc/terminal-ipc'
import {
    isUntrustedSenderResult,
    resetTrustedSenderRegistry,
    setTrustedMainWindow
} from '../../src/main/utils/ipc-security'

/** 轻量 pty 桩（仅暴露 pty-manager 使用的成员） */
interface FakePty {
    onData: (listener: (data: string) => void) => { dispose: () => void }
    onExit: (listener: (event: { exitCode: number; signal?: number }) => void) => {
        dispose: () => void
    }
    write: Mock<(data: string) => void>
    resize: Mock<(cols: number, rows: number) => void>
    kill: Mock<() => void>
}

function createFakePty(): FakePty {
    return {
        onData: () => ({ dispose: () => {} }),
        onExit: () => ({ dispose: () => {} }),
        write: vi.fn<(data: string) => void>(),
        resize: vi.fn<(cols: number, rows: number) => void>(),
        kill: vi.fn<() => void>()
    }
}

const mainWindow = {
    webContents: { id: 1, send: vi.fn(), isDestroyed: () => false },
    isDestroyed: () => false
}
const trustedEvent = { sender: mainWindow.webContents }
const untrustedEvent = { sender: { id: 999 } }

let fakePty: FakePty

/** 取注册的 handler（注册形状断言失败时直接报错，避免空断言） */
function registeredListener(channel: string): (...args: unknown[]) => Promise<unknown> {
    const call = registers.calls.find((item) => item.channel === channel)
    expect(call, `应注册 ${channel} handle`).toBeDefined()
    return call!.listener as (...args: unknown[]) => Promise<unknown>
}

beforeEach(() => {
    vi.clearAllMocks()
    registers.calls.length = 0
    resetTrustedSenderRegistry()
    setTrustedMainWindow(mainWindow as never)
    stateMock.rootPath = 'E:\\workspace'
    fakePty = createFakePty()
    nodePtyMock.spawn.mockReturnValue(fakePty)
})

afterEach(() => {
    disposeAllTerminalSessions()
    resetTrustedSenderRegistry()
    vi.clearAllMocks()
    stateMock.rootPath = ''
})

describe('registerTerminalIpc：注册形状', () => {
    it('缺省 componentId 时注册 4 个 invoke 通道', () => {
        registerTerminalIpc()

        expect(registers.calls.map((item) => item.channel)).toEqual([
            IPC.TERMINAL.CREATE,
            IPC.TERMINAL.WRITE,
            IPC.TERMINAL.RESIZE,
            IPC.TERMINAL.CLOSE
        ])
        for (const call of registers.calls) {
            expect(call.id).toBe('global-terminal-ipc')
        }
        expect(TERMINAL_IPC_COMPONENT_ID).toBe('global-terminal-ipc')
    })

    it('显式传入 componentId 时透传（registry 编排口径）', () => {
        registerTerminalIpc('global-test-terminal')
        expect(registers.calls[0].id).toBe('global-test-terminal')
    })
})

describe('payload 校验：CREATE', () => {
    it('应接受合法载荷（含可选 shell）', () => {
        expect(parseTerminalCreatePayload({ cols: 120, rows: 30 })).toEqual({
            ok: true,
            value: { cols: 120, rows: 30, shell: undefined }
        })
        expect(TERMINAL_SHELL_WHITELIST).toEqual(['cmd', 'powershell', 'bash'])
        expect(parseTerminalCreatePayload({ cols: 1, rows: 500, shell: 'powershell' })).toEqual({
            ok: true,
            value: { cols: 1, rows: 500, shell: 'powershell' }
        })
    })

    it('应拒绝非对象 / 缺失 / 非整数 / 越界尺寸', () => {
        const invalidPayloads: unknown[] = [
            null,
            undefined,
            'x',
            [],
            {},
            { cols: 120 },
            { rows: 30 },
            { cols: 0, rows: 30 },
            { cols: 120, rows: 501 },
            { cols: 1.5, rows: 30 },
            { cols: '120', rows: 30 }
        ]
        for (const payload of invalidPayloads) {
            const parsed = parseTerminalCreatePayload(payload)
            expect(parsed.ok, `payload 应被拒绝: ${JSON.stringify(payload)}`).toBe(false)
        }
    })

    it('应拒绝白名单外的 shell', () => {
        for (const shell of ['bash2', 'pwsh', '', 123, null]) {
            const parsed = parseTerminalCreatePayload({ cols: 80, rows: 24, shell })
            expect(parsed.ok).toBe(false)
        }
    })

    it('terminalCreate 对非法载荷返回 TERMINAL_INVALID_PAYLOAD 且不 spawn', () => {
        const result = terminalCreate({ cols: 0, rows: 0 })

        expect(result).toMatchObject({ ok: false, code: 'TERMINAL_INVALID_PAYLOAD' })
        expect(nodePtyMock.spawn).not.toHaveBeenCalled()
    })

    it('terminalCreate 无工作区时返回 TERMINAL_NO_WORKSPACE', () => {
        stateMock.rootPath = ''

        const result = terminalCreate({ cols: 80, rows: 24 })

        expect(result).toMatchObject({ ok: false, code: 'TERMINAL_NO_WORKSPACE' })
        expect(nodePtyMock.spawn).not.toHaveBeenCalled()
    })

    it('terminalCreate 合法载荷时创建 pty 会话', () => {
        const result = terminalCreate({ cols: 80, rows: 24 })

        expect(result.ok).toBe(true)
        expect(result.ok && result.cwd).toBe('E:\\workspace')
        expect(nodePtyMock.spawn).toHaveBeenCalledTimes(1)
        expect(getTerminalSessionCount()).toBe(1)
    })
})

describe('payload 校验：WRITE', () => {
    it('应接受合法载荷并写入 pty stdin', () => {
        const created = terminalCreate({ cols: 80, rows: 24 })
        expect(created.ok).toBe(true)
        const id = created.ok ? created.id : ''

        expect(parseTerminalWritePayload({ id, data: 'dir\r' })).toEqual({
            ok: true,
            value: { id, data: 'dir\r' }
        })
        expect(terminalWrite({ id, data: 'dir\r' })).toEqual({ ok: true })
        expect(fakePty.write).toHaveBeenCalledWith('dir\r')
    })

    it('应拒绝非法载荷（非对象/坏 id/非字符串/超长）', () => {
        const invalidPayloads: unknown[] = [
            null,
            'x',
            [],
            {},
            { data: 'a' },
            { id: '', data: 'a' },
            { id: 123, data: 'a' },
            { id: 'term-x', data: 123 },
            { id: 'term-x', data: 'a'.repeat(MAX_TERMINAL_WRITE_CHARS + 1) }
        ]
        for (const payload of invalidPayloads) {
            const parsed = parseTerminalWritePayload(payload)
            expect(
                parsed.ok,
                `payload 应被拒绝: ${String(JSON.stringify(payload)).slice(0, 40)}`
            ).toBe(false)
        }
        expect(terminalWrite({ id: 'term-x' })).toMatchObject({
            ok: false,
            code: 'TERMINAL_INVALID_PAYLOAD'
        })
    })

    it('会话不存在时返回 TERMINAL_NOT_FOUND', () => {
        expect(terminalWrite({ id: 'missing', data: 'a' })).toMatchObject({
            ok: false,
            code: 'TERMINAL_NOT_FOUND'
        })
    })
})

describe('payload 校验：RESIZE', () => {
    it('应接受合法载荷并透传尺寸', () => {
        const created = terminalCreate({ cols: 80, rows: 24 })
        const id = created.ok ? created.id : ''

        expect(parseTerminalResizePayload({ id, cols: 120, rows: 30 })).toEqual({
            ok: true,
            value: { id, cols: 120, rows: 30 }
        })
        expect(terminalResize({ id, cols: 120, rows: 30 })).toEqual({ ok: true })
        expect(fakePty.resize).toHaveBeenCalledWith(120, 30)
    })

    it('应拒绝非法载荷并返回结构化错误', () => {
        const invalidPayloads: unknown[] = [
            null,
            [],
            {},
            { id: 'term-x' },
            { id: '', cols: 80, rows: 24 },
            { id: 'term-x', cols: 0, rows: 24 },
            { id: 'term-x', cols: 80, rows: 501 },
            { id: 'term-x', cols: 80.5, rows: 24 }
        ]
        for (const payload of invalidPayloads) {
            expect(parseTerminalResizePayload(payload).ok).toBe(false)
        }
        expect(terminalResize({ id: 'term-x', cols: 0, rows: 0 })).toMatchObject({
            ok: false,
            code: 'TERMINAL_INVALID_PAYLOAD'
        })
    })

    it('会话不存在时返回 TERMINAL_NOT_FOUND', () => {
        expect(terminalResize({ id: 'missing', cols: 80, rows: 24 })).toMatchObject({
            ok: false,
            code: 'TERMINAL_NOT_FOUND'
        })
    })
})

describe('payload 校验：CLOSE', () => {
    it('应接受合法载荷并 kill pty', () => {
        const created = terminalCreate({ cols: 80, rows: 24 })
        const id = created.ok ? created.id : ''

        expect(parseTerminalClosePayload({ id })).toEqual({ ok: true, value: { id } })
        expect(terminalClose({ id })).toEqual({ ok: true })
        expect(fakePty.kill).toHaveBeenCalledTimes(1)
        expect(getTerminalSessionCount()).toBe(0)
    })

    it('应拒绝非法载荷（非对象 / 空 id / 非字符串 id）', () => {
        for (const payload of [null, [], {}, { id: '' }, { id: 42 }]) {
            expect(parseTerminalClosePayload(payload).ok).toBe(false)
        }
        expect(terminalClose(undefined)).toMatchObject({
            ok: false,
            code: 'TERMINAL_INVALID_PAYLOAD'
        })
    })
})

describe('注册 handler：sender 校验与业务链路', () => {
    it('受信主窗口可创建/写入/调整/关闭终端', async () => {
        registerTerminalIpc()
        const createListener = registeredListener(IPC.TERMINAL.CREATE)

        const created = (await createListener(trustedEvent, { cols: 80, rows: 24 })) as {
            ok: boolean
            id?: string
        }
        expect(created.ok).toBe(true)
        const id = created.id as string

        await expect(
            registeredListener(IPC.TERMINAL.WRITE)(trustedEvent, { id, data: 'echo hi\r' })
        ).resolves.toEqual({ ok: true })
        await expect(
            registeredListener(IPC.TERMINAL.RESIZE)(trustedEvent, { id, cols: 120, rows: 30 })
        ).resolves.toEqual({ ok: true })
        await expect(registeredListener(IPC.TERMINAL.CLOSE)(trustedEvent, { id })).resolves.toEqual(
            { ok: true }
        )
        expect(fakePty.write).toHaveBeenCalledWith('echo hi\r')
        expect(fakePty.resize).toHaveBeenCalledWith(120, 30)
        expect(fakePty.kill).toHaveBeenCalledTimes(1)
    })

    it('不受信发送方被拒绝且不执行任何 pty 操作', async () => {
        registerTerminalIpc()

        const createResult = await registeredListener(IPC.TERMINAL.CREATE)(untrustedEvent, {
            cols: 80,
            rows: 24
        })
        expect(isUntrustedSenderResult(createResult)).toBe(true)
        expect(nodePtyMock.spawn).not.toHaveBeenCalled()

        const writeResult = await registeredListener(IPC.TERMINAL.WRITE)(untrustedEvent, {
            id: 'term-x',
            data: 'a'
        })
        expect(isUntrustedSenderResult(writeResult)).toBe(true)
        expect(fakePty.write).not.toHaveBeenCalled()

        const resizeResult = await registeredListener(IPC.TERMINAL.RESIZE)(untrustedEvent, {
            id: 'term-x',
            cols: 80,
            rows: 24
        })
        expect(isUntrustedSenderResult(resizeResult)).toBe(true)
        expect(fakePty.resize).not.toHaveBeenCalled()

        const closeResult = await registeredListener(IPC.TERMINAL.CLOSE)(untrustedEvent, {
            id: 'term-x'
        })
        expect(isUntrustedSenderResult(closeResult)).toBe(true)
        expect(fakePty.kill).not.toHaveBeenCalled()
    })

    it('handler 对非法 payload 返回结构化错误（不抛异常）', async () => {
        registerTerminalIpc()

        await expect(
            registeredListener(IPC.TERMINAL.CREATE)(trustedEvent, { cols: 'wide' })
        ).resolves.toMatchObject({ ok: false, code: 'TERMINAL_INVALID_PAYLOAD' })
        await expect(
            registeredListener(IPC.TERMINAL.WRITE)(trustedEvent, null)
        ).resolves.toMatchObject({ ok: false, code: 'TERMINAL_INVALID_PAYLOAD' })
        await expect(
            registeredListener(IPC.TERMINAL.RESIZE)(trustedEvent, { id: 'term-x' })
        ).resolves.toMatchObject({ ok: false, code: 'TERMINAL_INVALID_PAYLOAD' })
        await expect(
            registeredListener(IPC.TERMINAL.CLOSE)(trustedEvent, {})
        ).resolves.toMatchObject({ ok: false, code: 'TERMINAL_INVALID_PAYLOAD' })
    })
})
