/**
 * 1.5.7 迁移批次：文件迁移 IPC handler 单测（`src/main/ipc/llm-wiki-migration-ipc.ts`）
 *
 * 覆盖：
 * 1. 注册形状：4 个 invoke 通道经 `ipcListenerManager.registerHandleOnce` 注册
 *    （withSenderCheck 包装），componentId 透传（缺省 `global-llm-wiki-migration-ipc`）；
 * 2. 业务入口：无工作区返回结构化失败/全 false 状态；有工作区委托迁移服务
 *    （状态检测/扫描/迁移/回滚）；
 * 3. sender 校验：受信主窗口调用成功；不受信发送方返回统一拒绝对象且不写盘。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('electron', () => ({
    app: { getPath: vi.fn(() => path.join(os.tmpdir(), 'baize-migration-ipc-userdata')) },
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
    LLM_WIKI_MIGRATION_IPC_COMPONENT_ID,
    llmWikiGetStatus,
    llmWikiMigrateFiles,
    llmWikiRollbackMigration,
    llmWikiScanFiles,
    registerLlmWikiMigrationIpc
} from '../../src/main/ipc/llm-wiki-migration-ipc'
import { appState } from '../../src/main/utils/app-state'
import {
    isUntrustedSenderResult,
    resetTrustedSenderRegistry,
    setTrustedMainWindow
} from '../../src/main/utils/ipc-security'

const mainWindow = {
    webContents: { id: 1, send: vi.fn(), isDestroyed: () => false },
    isDestroyed: () => false
}
const trustedEvent = { sender: mainWindow.webContents }

let workspaceRoot = ''
let logDir = ''

beforeEach(async () => {
    vi.clearAllMocks()
    registers.calls.length = 0
    appState._resetForTesting()
    resetTrustedSenderRegistry()
    setTrustedMainWindow(mainWindow as never)
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-migration-ipc-ws-'))
    logDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-migration-ipc-log-'))
})

afterEach(async () => {
    appState._resetForTesting()
    resetTrustedSenderRegistry()
    await fs.rm(workspaceRoot, { recursive: true, force: true })
    await fs.rm(logDir, { recursive: true, force: true })
})

/** 取注册的 handler（注册形状断言失败时直接报错，避免空断言） */
function registeredListener(channel: string): (...args: unknown[]) => unknown {
    const call = registers.calls.find((item) => item.channel === channel)
    expect(call, `应注册 ${channel} handle`).toBeDefined()
    return call!.listener
}

async function writeWorkspaceFile(relativePath: string, content = 'content'): Promise<void> {
    const filePath = path.join(workspaceRoot, ...relativePath.split('/'))
    await fs.mkdir(path.dirname(filePath), { recursive: true })
    await fs.writeFile(filePath, content, 'utf8')
}

describe('registerLlmWikiMigrationIpc：注册形状', () => {
    it('缺省 componentId 时注册 4 个 invoke 通道', () => {
        registerLlmWikiMigrationIpc()
        expect(registers.calls.map((item) => item.channel)).toEqual([
            IPC.LLM_WIKI.GET_STATUS,
            IPC.LLM_WIKI.SCAN_FILES,
            IPC.LLM_WIKI.MIGRATE,
            IPC.LLM_WIKI.ROLLBACK_MIGRATION
        ])
        for (const call of registers.calls) {
            expect(call.id).toBe('global-llm-wiki-migration-ipc')
        }
        expect(LLM_WIKI_MIGRATION_IPC_COMPONENT_ID).toBe('global-llm-wiki-migration-ipc')
    })

    it('显式传入 componentId 时透传（registry 编排口径）', () => {
        registerLlmWikiMigrationIpc('global-test-migration')
        expect(registers.calls[0].id).toBe('global-test-migration')
    })
})

describe('业务入口：无工作区与委托服务', () => {
    it('未打开工作区时状态检测全 false、扫描/迁移/回滚均返回结构化失败', async () => {
        appState.rootPath = ''
        const status = await llmWikiGetStatus({ logDir })
        expect(status).toEqual({
            initialized: false,
            hasRaw: false,
            hasWiki: false,
            hasSchema: false
        })

        const scan = await llmWikiScanFiles({ logDir })
        expect(scan.ok).toBe(false)
        expect(scan.error).toBeTruthy()

        const migrate = await llmWikiMigrateFiles(
            { mode: 'copy', formats: ['markdown'] },
            { logDir }
        )
        expect(migrate.ok).toBe(false)

        const rollback = await llmWikiRollbackMigration(undefined, { logDir })
        expect(rollback.ok).toBe(false)
        expect(rollback.restored).toBe(0)
    })

    it('工作区无 LLM Wiki 结构：初始化状态为 false（不读内容）', async () => {
        await writeWorkspaceFile('a.md', 'a')
        appState.rootPath = workspaceRoot

        await expect(llmWikiGetStatus({ logDir })).resolves.toEqual({
            initialized: false,
            hasRaw: false,
            hasWiki: false,
            hasSchema: false
        })
    })

    it('工作区已有 raw/ + wiki/ + schema.md：initialized=true 且逐项可见', async () => {
        await fs.mkdir(path.join(workspaceRoot, 'raw'), { recursive: true })
        await fs.mkdir(path.join(workspaceRoot, 'wiki'), { recursive: true })
        await writeWorkspaceFile('schema.md', '# 约定')
        appState.rootPath = workspaceRoot

        await expect(llmWikiGetStatus({ logDir })).resolves.toEqual({
            initialized: true,
            hasRaw: true,
            hasWiki: true,
            hasSchema: true
        })
    })

    it('仅 schema.md 存在也算已初始化；同名目录而非文件不算 hasSchema', async () => {
        await writeWorkspaceFile('schema.md', '# 约定')
        appState.rootPath = workspaceRoot
        await expect(llmWikiGetStatus({ logDir })).resolves.toMatchObject({
            initialized: true,
            hasRaw: false,
            hasWiki: false,
            hasSchema: true
        })

        // schema.md 位置换成目录：hasSchema 必须为 false（只认普通文件）
        await fs.rm(path.join(workspaceRoot, 'schema.md'))
        await fs.mkdir(path.join(workspaceRoot, 'schema.md'))
        await expect(llmWikiGetStatus({ logDir })).resolves.toMatchObject({
            initialized: false,
            hasSchema: false
        })
    })

    it('缺省读取 appState.rootPath：扫描可迁移文件并返回格式统计', async () => {
        await writeWorkspaceFile('a.md', 'a')
        appState.rootPath = workspaceRoot

        const result = await llmWikiScanFiles({ logDir })

        expect(result.ok).toBe(true)
        expect(result.total).toBe(1)
        expect(result.formats.find((item) => item.id === 'markdown')?.count).toBe(1)
    })

    it('缺省读取 appState.rootPath：迁移后可按日志回滚', async () => {
        await writeWorkspaceFile('a.md', 'a')
        appState.rootPath = workspaceRoot

        const migrate = await llmWikiMigrateFiles(
            { mode: 'copy', formats: ['markdown'] },
            { logDir }
        )
        expect(migrate.ok).toBe(true)
        expect(migrate.copied).toHaveLength(1)
        expect(migrate.logId).toBeTruthy()

        const rollback = await llmWikiRollbackMigration({ logId: migrate.logId }, { logDir })
        expect(rollback.ok).toBe(true)
        expect(rollback.restored).toBe(1)
    })
})

describe('handler：sender 校验', () => {
    it('受信主窗口调用状态检测成功；不受信发送方返回统一拒绝对象', async () => {
        await fs.mkdir(path.join(workspaceRoot, 'raw'), { recursive: true })
        appState.rootPath = workspaceRoot
        registerLlmWikiMigrationIpc()

        const trustedResult = (await registeredListener(IPC.LLM_WIKI.GET_STATUS)(trustedEvent)) as {
            initialized: boolean
            hasRaw: boolean
        }
        expect(trustedResult.initialized).toBe(true)
        expect(trustedResult.hasRaw).toBe(true)

        const untrusted = await registeredListener(IPC.LLM_WIKI.GET_STATUS)({
            sender: { id: 999 }
        })
        expect(isUntrustedSenderResult(untrusted)).toBe(true)
    })

    it('受信主窗口调用扫描成功；不受信发送方返回统一拒绝对象', async () => {
        await writeWorkspaceFile('a.md', 'a')
        appState.rootPath = workspaceRoot
        registerLlmWikiMigrationIpc()

        const trustedResult = (await registeredListener(IPC.LLM_WIKI.SCAN_FILES)(trustedEvent)) as {
            ok: boolean
        }
        expect(trustedResult.ok).toBe(true)

        const untrusted = await registeredListener(IPC.LLM_WIKI.SCAN_FILES)({ sender: { id: 999 } })
        expect(isUntrustedSenderResult(untrusted)).toBe(true)
    })

    it('不受信发送方调用迁移/回滚：返回统一拒绝对象且不写盘', async () => {
        await writeWorkspaceFile('a.md', 'a')
        appState.rootPath = workspaceRoot
        registerLlmWikiMigrationIpc()

        const migrateRaw = await registeredListener(IPC.LLM_WIKI.MIGRATE)(
            { sender: { id: 999 } },
            { mode: 'move', formats: ['markdown'] }
        )
        expect(isUntrustedSenderResult(migrateRaw)).toBe(true)
        await expect(fs.stat(path.join(workspaceRoot, 'raw'))).rejects.toThrow()

        const rollbackRaw = await registeredListener(IPC.LLM_WIKI.ROLLBACK_MIGRATION)(
            { sender: { id: 999 } },
            undefined
        )
        expect(isUntrustedSenderResult(rollbackRaw)).toBe(true)
    })

    it('受信主窗口迁移：payload 透传并按 mode 执行', async () => {
        await writeWorkspaceFile('a.md', 'a')
        appState.rootPath = workspaceRoot
        registerLlmWikiMigrationIpc()

        const result = (await registeredListener(IPC.LLM_WIKI.MIGRATE)(trustedEvent, {
            mode: 'move',
            formats: ['markdown']
        })) as { ok: boolean; mode: string; moved: unknown[] }
        expect(result.ok).toBe(true)
        expect(result.mode).toBe('move')
        expect(result.moved).toHaveLength(1)
    })
})
