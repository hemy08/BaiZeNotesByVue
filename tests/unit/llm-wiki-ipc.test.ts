/**
 * 1.5.7 LLM Wiki L1：工作区初始化 IPC handler 单测（`src/main/ipc/llm-wiki-ipc.ts`）
 *
 * 覆盖：
 * 1. 注册：`IPC.FILE.INITIALIZE_LLM_WIKI` 经 `ipcListenerManager.registerHandleOnce`
 *    注册（withSenderCheck 包装），componentId 透传（缺省 `global-llm-wiki-ipc`）；
 * 2. 业务入口 `initializeLlmWiki`：无工作区返回 NO_WORKSPACE，有工作区委托初始化服务；
 * 3. sender 校验：受信主窗口调用成功创建目录；不受信发送方返回统一拒绝对象且不写盘。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('electron', () => ({
    BrowserWindow: class {},
    shell: {},
    ipcMain: { handle: vi.fn(), removeHandler: vi.fn() }
}))

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

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
    initializeLlmWiki,
    LLM_WIKI_IPC_COMPONENT_ID,
    registerLlmWikiIpc
} from '../../src/main/ipc/llm-wiki-ipc'
import { LLM_WIKI_ERROR_NO_WORKSPACE } from '../../src/main/utils/llm-wiki-workspace'
import { appState } from '../../src/main/utils/app-state'
import {
    isUntrustedSenderResult,
    resetTrustedSenderRegistry,
    setTrustedMainWindow
} from '../../src/main/utils/ipc-security'

const mainSend = vi.fn()
const mainWindow = {
    webContents: { id: 1, send: mainSend, isDestroyed: () => false },
    isDestroyed: () => false
}
const trustedEvent = { sender: mainWindow.webContents }

let workspaceRoot = ''

beforeEach(async () => {
    vi.clearAllMocks()
    registers.calls.length = 0
    appState._resetForTesting()
    resetTrustedSenderRegistry()
    setTrustedMainWindow(mainWindow as never)
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-llm-wiki-ipc-'))
})

afterEach(async () => {
    appState._resetForTesting()
    resetTrustedSenderRegistry()
    await fs.rm(workspaceRoot, { recursive: true, force: true })
})

/** 取本次注册的 handler（注册形状断言失败时直接报错，避免空断言） */
function registeredListener(): (...args: unknown[]) => unknown {
    const call = registers.calls.find((item) => item.channel === IPC.FILE.INITIALIZE_LLM_WIKI)
    expect(call, '应注册 INITIALIZE_LLM_WIKI handle').toBeDefined()
    return call!.listener
}

describe('registerLlmWikiIpc：注册形状', () => {
    it('缺省 componentId 时使用本域台账 ID 注册 invoke 通道', () => {
        registerLlmWikiIpc()
        expect(registers.calls).toHaveLength(1)
        expect(registers.calls[0].channel).toBe(IPC.FILE.INITIALIZE_LLM_WIKI)
        expect(registers.calls[0].id).toBe(LLM_WIKI_IPC_COMPONENT_ID)
        expect(LLM_WIKI_IPC_COMPONENT_ID).toBe('global-llm-wiki-ipc')
    })

    it('显式传入 componentId 时透传（registry 编排口径）', () => {
        registerLlmWikiIpc('global-test-llm-wiki')
        expect(registers.calls[0].id).toBe('global-test-llm-wiki')
    })
})

describe('initializeLlmWiki：业务入口', () => {
    it('未打开工作区时返回结构化失败', async () => {
        appState.rootPath = ''
        await expect(initializeLlmWiki()).resolves.toEqual({
            success: false,
            error: LLM_WIKI_ERROR_NO_WORKSPACE
        })
    })

    it('缺省读取 appState.rootPath 并委托初始化服务', async () => {
        appState.rootPath = workspaceRoot
        await expect(initializeLlmWiki()).resolves.toEqual({ success: true })
        await expect(
            fs.stat(path.join(workspaceRoot, 'raw')).then((stats) => stats.isDirectory())
        ).resolves.toBe(true)
    })

    it('显式传入非法根时返回初始化服务的结构化失败', async () => {
        const result = await initializeLlmWiki(path.join(workspaceRoot, 'not-exists'))
        expect(result.success).toBe(false)
        expect(result.error).toBeTruthy()
    })
})

describe('handler：sender 校验与端到端初始化', () => {
    it('受信主窗口调用成功创建工作区目录结构', async () => {
        appState.rootPath = workspaceRoot
        registerLlmWikiIpc()
        const result = await registeredListener()(trustedEvent)
        expect(result).toEqual({ success: true })
        await expect(fs.stat(path.join(workspaceRoot, 'wiki'))).resolves.toBeTruthy()
        await expect(fs.readFile(path.join(workspaceRoot, 'schema.md'), 'utf8')).resolves.toContain(
            'LLM Wiki'
        )
    })

    it('不受信发送方返回统一拒绝对象且不写盘', async () => {
        appState.rootPath = workspaceRoot
        registerLlmWikiIpc()
        const result = await registeredListener()({ sender: { id: 999 } })
        expect(isUntrustedSenderResult(result)).toBe(true)
        await expect(fs.stat(path.join(workspaceRoot, 'raw'))).rejects.toThrow()
    })

    it('受信但无工作区时返回 NO_WORKSPACE（不写盘、不抛异常）', async () => {
        appState.rootPath = ''
        registerLlmWikiIpc()
        await expect(registeredListener()(trustedEvent)).resolves.toEqual({
            success: false,
            error: LLM_WIKI_ERROR_NO_WORKSPACE
        })
    })
})
