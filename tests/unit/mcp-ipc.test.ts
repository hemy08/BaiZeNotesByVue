/**
 * 1.5.7 LLM Wiki L2：MCP IPC 单测（`src/main/ipc/mcp-ipc.ts`）
 *
 * 覆盖：
 * 1. 注册：两个 invoke 通道经 `ipcListenerManager.registerHandleOnce` 注册
 *    （withSenderCheck 包装），componentId 透传（缺省 `global-mcp-ipc`）；
 * 2. 启动回落：`reconcilePersistedMcpState()` 将上次会话的 mcpEnabled=true 回落 false
 *    并记日志（token 不落盘、不跨重启自动启动）；
 * 3. 状态：`getMcpStatus()` 委托 MCP server 实时状态；
 * 4. 开关：非法载荷结构化拒绝；启用成功才持久化 true；停用持久化 false；
 *    启动失败时清理停止 + 回落偏好 + 返回含原因的失败；
 * 5. sender 校验：受信主窗口可调用两个通道，非受信发送方返回统一拒绝对象且不执行。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

const mocks = vi.hoisted(() => {
    const stoppedStatus = {
        enabled: false,
        running: false,
        port: 0,
        token: '',
        url: '',
        toolCount: 7
    }
    const runningStatus = {
        enabled: true,
        running: true,
        port: 3847,
        token: 'a'.repeat(64),
        url: 'http://127.0.0.1:3847/mcp',
        toolCount: 7
    }
    return {
        stoppedStatus,
        runningStatus,
        getMcpServerStatus: vi.fn(),
        startMcpServer: vi.fn(),
        stopMcpServer: vi.fn(),
        getSystemSetting: vi.fn(),
        saveSystemSetting: vi.fn(),
        registerHandleOnce: vi.fn(),
        logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
    }
})

vi.mock('electron', () => ({
    app: { getVersion: () => '1.5.7-test' },
    BrowserWindow: class {},
    shell: {}
}))

vi.mock('../../src/main/config/system-setting', () => ({
    getSystemSetting: mocks.getSystemSetting,
    saveSystemSetting: mocks.saveSystemSetting
}))

vi.mock('../../src/main/mcp/server', () => ({
    getMcpServerStatus: mocks.getMcpServerStatus,
    startMcpServer: mocks.startMcpServer,
    stopMcpServer: mocks.stopMcpServer
}))

vi.mock('../../src/main/ipc/ipc-listener-manager', () => ({
    ipcListenerManager: { registerHandleOnce: mocks.registerHandleOnce }
}))

vi.mock('../../src/main/utils/logger', () => ({ logger: mocks.logger }))

import { IPC } from '../../src/shared/ipc-channels'
import {
    getMcpStatus,
    MCP_IPC_COMPONENT_ID,
    reconcilePersistedMcpState,
    registerMcpIpc,
    setMcpEnabled
} from '../../src/main/ipc/mcp-ipc'
import { appState } from '../../src/main/utils/app-state'
import {
    isUntrustedSenderResult,
    resetTrustedSenderRegistry,
    setTrustedMainWindow
} from '../../src/main/utils/ipc-security'

/** 已注册 handler 记录 */
interface RegisteredHandler {
    channel: string
    listener: (...args: unknown[]) => unknown
    componentId?: string
}

let registered: RegisteredHandler[] = []

/** 受信主窗口桩（sender 校验只用到 webContents 引用与 isDestroyed） */
const mainWindow = {
    webContents: { id: 1, send: vi.fn(), isDestroyed: () => false },
    isDestroyed: () => false
}
const trustedEvent = { sender: mainWindow.webContents }

beforeEach(() => {
    vi.clearAllMocks()
    registered = []
    appState._resetForTesting()
    resetTrustedSenderRegistry()
    setTrustedMainWindow(mainWindow as never)
    mocks.getMcpServerStatus.mockReturnValue(mocks.stoppedStatus)
    mocks.startMcpServer.mockResolvedValue(mocks.runningStatus)
    mocks.stopMcpServer.mockResolvedValue(mocks.stoppedStatus)
    mocks.getSystemSetting.mockReturnValue({ mcpEnabled: false })
    mocks.registerHandleOnce.mockImplementation(
        (
            channel: string,
            listener: (...args: unknown[]) => unknown,
            componentId?: string
        ): string => {
            registered.push({ channel, listener, componentId })
            return `${channel}:handle`
        }
    )
})

afterEach(() => {
    resetTrustedSenderRegistry()
    appState._resetForTesting()
})

/** 取已注册的某通道 handler（缺失直接失败，避免空断言） */
function getRegisteredHandler(channel: string): (...args: unknown[]) => unknown {
    const handler = registered.find((item) => item.channel === channel)
    expect(handler, `应注册 ${channel}`).toBeDefined()
    return handler!.listener
}

describe('registerMcpIpc：注册形状', () => {
    it('注册两个 invoke 通道，缺省 componentId 为 global-mcp-ipc', () => {
        registerMcpIpc()
        expect(registered).toHaveLength(2)
        expect(registered.map((item) => item.channel)).toEqual([
            IPC.MCP.GET_STATUS,
            IPC.MCP.SET_ENABLED
        ])
        expect(registered.map((item) => item.componentId)).toEqual([
            MCP_IPC_COMPONENT_ID,
            MCP_IPC_COMPONENT_ID
        ])
        expect(MCP_IPC_COMPONENT_ID).toBe('global-mcp-ipc')
    })

    it('显式 componentId 透传（registry 编排口径）', () => {
        registerMcpIpc('global-test-mcp')
        expect(registered.map((item) => item.componentId)).toEqual([
            'global-test-mcp',
            'global-test-mcp'
        ])
    })

    it('注册时回落上次会话的启用偏好（mcpEnabled=true → false）', () => {
        mocks.getSystemSetting.mockReturnValue({ mcpEnabled: true })
        registerMcpIpc()
        expect(mocks.saveSystemSetting).toHaveBeenCalledWith({ mcpEnabled: false })
        expect(mocks.logger.info).toHaveBeenCalledWith(expect.stringContaining('MCP 服务'))
    })

    it('上次未启用时不写系统设置', () => {
        registerMcpIpc()
        expect(mocks.saveSystemSetting).not.toHaveBeenCalled()
    })
})

describe('reconcilePersistedMcpState', () => {
    it('读取/回落失败不抛异常，只记 warn', () => {
        mocks.getSystemSetting.mockImplementation(() => {
            throw new Error('store corrupted')
        })
        expect(reconcilePersistedMcpState()).toBe(false)
        expect(mocks.logger.warn).toHaveBeenCalled()
    })

    it('已回落为 false 时返回 false（幂等）', () => {
        expect(reconcilePersistedMcpState()).toBe(false)
    })
})

describe('getMcpStatus', () => {
    it('委托 MCP server 实时状态', () => {
        expect(getMcpStatus()).toEqual(mocks.stoppedStatus)
        mocks.getMcpServerStatus.mockReturnValue(mocks.runningStatus)
        expect(getMcpStatus()).toEqual(mocks.runningStatus)
    })
})

describe('setMcpEnabled：载荷校验', () => {
    it('非法载荷返回结构化失败（不启动服务、不持久化）', async () => {
        for (const payload of [
            undefined,
            null,
            'x',
            42,
            [],
            {},
            { enabled: 'yes' },
            { enabled: 1 }
        ]) {
            const result = await setMcpEnabled(payload)
            expect(result.ok, JSON.stringify(payload)).toBe(false)
            expect(result.error).toContain('enabled')
            expect(result.status).toEqual(mocks.stoppedStatus)
        }
        expect(mocks.startMcpServer).not.toHaveBeenCalled()
        expect(mocks.saveSystemSetting).not.toHaveBeenCalled()
    })
})

describe('setMcpEnabled：启用/停用', () => {
    it('启用：启动服务成功后持久化 true，返回运行状态', async () => {
        const result = await setMcpEnabled({ enabled: true })
        expect(mocks.startMcpServer).toHaveBeenCalledWith({ version: '1.5.7-test' })
        expect(mocks.saveSystemSetting).toHaveBeenCalledWith({ mcpEnabled: true })
        expect(result).toEqual({ ok: true, status: mocks.runningStatus })
    })

    it('停用：停止服务并持久化 false，返回停止状态', async () => {
        const result = await setMcpEnabled({ enabled: false })
        expect(mocks.stopMcpServer).toHaveBeenCalledTimes(1)
        expect(mocks.saveSystemSetting).toHaveBeenCalledWith({ mcpEnabled: false })
        expect(result).toEqual({ ok: true, status: mocks.stoppedStatus })
    })

    it('启动失败：清理停止 + 回落偏好 false + 返回含原因的失败', async () => {
        mocks.startMcpServer.mockRejectedValue(new Error('端口不可用'))
        const result = await setMcpEnabled({ enabled: true })
        expect(result.ok).toBe(false)
        expect(result.error).toContain('端口不可用')
        expect(result.status).toEqual(mocks.stoppedStatus)
        expect(mocks.stopMcpServer).toHaveBeenCalledTimes(1)
        expect(mocks.saveSystemSetting).toHaveBeenCalledWith({ mcpEnabled: false })
        expect(mocks.logger.error).toHaveBeenCalled()
    })
})

describe('handler：sender 校验与端到端', () => {
    it('受信主窗口：GET_STATUS 返回实时状态', async () => {
        registerMcpIpc()
        const handler = getRegisteredHandler(IPC.MCP.GET_STATUS)
        await expect(handler(trustedEvent)).resolves.toEqual(mocks.stoppedStatus)
    })

    it('非受信发送方：两个通道均返回统一拒绝对象且不执行副作用', async () => {
        registerMcpIpc()
        const getStatusHandler = getRegisteredHandler(IPC.MCP.GET_STATUS)
        const setEnabledHandler = getRegisteredHandler(IPC.MCP.SET_ENABLED)

        const untrustedEvent = { sender: { id: 999 } }
        expect(isUntrustedSenderResult(await getStatusHandler(untrustedEvent))).toBe(true)
        expect(
            isUntrustedSenderResult(await setEnabledHandler(untrustedEvent, { enabled: true }))
        ).toBe(true)
        expect(mocks.startMcpServer).not.toHaveBeenCalled()
        expect(mocks.saveSystemSetting).not.toHaveBeenCalled()
    })

    it('受信主窗口：SET_ENABLED 启用成功并可传非法载荷拒绝', async () => {
        registerMcpIpc()
        const setEnabledHandler = getRegisteredHandler(IPC.MCP.SET_ENABLED)

        await expect(setEnabledHandler(trustedEvent, { enabled: true })).resolves.toEqual({
            ok: true,
            status: mocks.runningStatus
        })
        const invalid = await setEnabledHandler(trustedEvent, { enabled: 'yes' })
        expect((invalid as { ok: boolean }).ok).toBe(false)
    })
})
