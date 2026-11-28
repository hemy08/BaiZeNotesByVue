// @vitest-environment jsdom
/**
 * 1.5.7 LLM Wiki 迁移批次 M2：批量编译运行时适配器单测
 * （`components/llm-wiki/batch-compile-runtime.ts`）
 *
 * 覆盖：
 * 1. 目录树加载：既有 FILE_MANAGER 事件订阅/退订配对、成功解析、非法载荷、超时、
 *    IPC 不可用/发送异常；
 * 2. 文本读取：FILE.READ_HTML 归一化（成功/非字符串/异常/空路径/无 invoke）；
 * 3. AI 配置归一化：未启用/无模型/本地/远程默认模型/默认模型回落；
 * 4. AI.INGEST / AI.APPLY_INGEST 结果归一化与结构化失败文案；
 * 5. 默认依赖装配（localStorage 编译记录存储可用）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { IPC } from '../../../src/shared/ipc-channels'
import {
    BATCH_COMPILE_TREE_TIMEOUT_MS,
    applyBatchCompileDraft,
    createDefaultBatchCompileDeps,
    createEmptyBatchCompileAiConfig,
    getBatchCompileRendererIpc,
    ingestBatchCompileRawFile,
    loadBatchCompileWorkspaceTree,
    normalizeBatchCompileAiConfigSnapshot,
    normalizeBatchCompileIngestSuccess,
    readBatchCompileAiConfig,
    readBatchCompileTextFile,
    type BatchCompileRendererIpc
} from '../../../src/renderer/src/components/llm-wiki/batch-compile-runtime'

/** 目录树 JSON（根 + raw/ + wiki/） */
const TREE_PAYLOAD = JSON.stringify([
    {
        id: 'root',
        name: 'ws',
        path: 'E:/ws',
        type: 'folder',
        isDirectory: true,
        fileExtension: '',
        children: [
            {
                id: 'raw',
                name: 'raw',
                path: 'E:/ws/raw',
                type: 'folder',
                isDirectory: true,
                fileExtension: '',
                children: [
                    {
                        id: 'a',
                        name: 'a.md',
                        path: 'E:/ws/raw/a.md',
                        type: 'file',
                        isDirectory: false,
                        fileExtension: '.md',
                        children: []
                    }
                ]
            },
            {
                id: 'wiki',
                name: 'wiki',
                path: 'E:/ws/wiki',
                type: 'folder',
                isDirectory: true,
                fileExtension: '',
                children: []
            }
        ]
    }
])

/** 构造可观测的 ipcRenderer 替身（记录 on/removeListener/send） */
function createFakeIpc(): {
    ipc: BatchCompileRendererIpc
    listeners: Map<string, (...args: unknown[]) => void>
    removed: Array<{ channel: string; listener: (...args: unknown[]) => void }>
    sent: string[]
} {
    const listeners = new Map<string, (...args: unknown[]) => void>()
    const removed: Array<{ channel: string; listener: (...args: unknown[]) => void }> = []
    const sent: string[] = []
    const ipc: BatchCompileRendererIpc = {
        invoke: vi.fn(async () => undefined),
        on: (channel, listener) => {
            listeners.set(channel, listener)
        },
        removeListener: (channel, listener) => {
            removed.push({ channel, listener })
        },
        send: (channel) => {
            sent.push(channel)
        }
    }
    return { ipc, listeners, removed, sent }
}

beforeEach(() => {
    vi.stubGlobal('electron', { ipcRenderer: { invoke: vi.fn(async () => undefined) } })
})

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

/* ============================================================================
 * 一、目录树加载
 * ========================================================================== */

describe('loadBatchCompileWorkspaceTree：目录树事件订阅与解析', () => {
    it('发送 RELOAD_FROM_DISK 并等待 FILE_SYSTEM_DATA 事件；解析后移除监听', async () => {
        const fake = createFakeIpc()
        const promise = loadBatchCompileWorkspaceTree(fake.ipc)
        expect(fake.sent).toEqual([IPC.FILE_MANAGER.RELOAD_FROM_DISK])
        expect(fake.listeners.has(IPC.FILE_MANAGER.FILE_SYSTEM_DATA)).toBe(true)

        fake.listeners.get(IPC.FILE_MANAGER.FILE_SYSTEM_DATA)?.({}, TREE_PAYLOAD)
        const outcome = await promise
        expect(outcome.ok).toBe(true)
        if (outcome.ok) {
            expect(outcome.tree.rootPath).toBe('E:/ws')
            expect(outcome.tree.rawFiles.map((file) => file.relativePath)).toEqual(['raw/a.md'])
        }
        expect(fake.removed).toHaveLength(1)
        expect(fake.removed[0].channel).toBe(IPC.FILE_MANAGER.FILE_SYSTEM_DATA)
    })

    it('非法树载荷 → invalidTree；空工作区 → noWorkspace', async () => {
        const first = createFakeIpc()
        const firstPromise = loadBatchCompileWorkspaceTree(first.ipc)
        first.listeners.get(IPC.FILE_MANAGER.FILE_SYSTEM_DATA)?.({}, '{bad')
        const firstOutcome = await firstPromise
        expect(firstOutcome.ok).toBe(false)
        if (!firstOutcome.ok) {
            expect(firstOutcome.error).toContain('无效')
        }

        const second = createFakeIpc()
        const secondPromise = loadBatchCompileWorkspaceTree(second.ipc)
        second.listeners.get(IPC.FILE_MANAGER.FILE_SYSTEM_DATA)?.({}, '[]')
        const secondOutcome = await secondPromise
        expect(secondOutcome.ok).toBe(false)
        if (!secondOutcome.ok) {
            expect(secondOutcome.error).toContain('工作区')
        }
    })

    it('等待超时 → 可读超时错误并移除监听', async () => {
        const fake = createFakeIpc()
        const outcome = await loadBatchCompileWorkspaceTree(fake.ipc, 5)
        expect(outcome.ok).toBe(false)
        if (!outcome.ok) {
            expect(outcome.error).toContain('超时')
        }
        expect(fake.removed).toHaveLength(1)
    })

    it('IPC 不可用 / 缺少 on/send / send 抛异常 → 结构化错误', async () => {
        const missing = await loadBatchCompileWorkspaceTree(null)
        expect(missing.ok).toBe(false)

        const noHandler = await loadBatchCompileWorkspaceTree({})
        expect(noHandler.ok).toBe(false)

        const fake = createFakeIpc()
        fake.ipc.send = () => {
            throw new Error('send failed')
        }
        const outcome = await loadBatchCompileWorkspaceTree(fake.ipc)
        expect(outcome.ok).toBe(false)
        if (!outcome.ok) {
            expect(outcome.error).toContain('主进程')
        }
        expect(fake.removed).toHaveLength(1)
    })

    it('默认超时常量为正数（对话框超时提示口径）', () => {
        expect(BATCH_COMPILE_TREE_TIMEOUT_MS).toBeGreaterThan(0)
    })
})

describe('getBatchCompileRendererIpc：preload 桥解析', () => {
    it('无 window / 无 electron / 无 invoke → null；有 invoke → 返回桥', () => {
        vi.stubGlobal('electron', undefined)
        expect(getBatchCompileRendererIpc()).toBeNull()

        vi.stubGlobal('electron', {})
        expect(getBatchCompileRendererIpc()).toBeNull()

        const invoke = vi.fn()
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
        expect(getBatchCompileRendererIpc()?.invoke).toBe(invoke)
    })
})

/* ============================================================================
 * 二、文本读取
 * ========================================================================== */

describe('readBatchCompileTextFile：既有 READ_HTML 读取', () => {
    it('成功返回字符串；非字符串/空路径/无 invoke → null', async () => {
        const invoke = vi.fn(async () => '# 内容')
        expect(await readBatchCompileTextFile('E:/ws/wiki/a.md', invoke)).toBe('# 内容')
        expect(invoke).toHaveBeenCalledWith(IPC.FILE.READ_HTML, 'E:/ws/wiki/a.md')

        const nonString = vi.fn(async () => ({ ok: true }))
        expect(await readBatchCompileTextFile('E:/ws/wiki/a.md', nonString)).toBeNull()
        expect(await readBatchCompileTextFile('   ', invoke)).toBeNull()
        expect(await readBatchCompileTextFile('E:/ws/wiki/a.md', null)).toBeNull()
    })

    it('调用抛异常 → null（调用方按不可判定处理）', async () => {
        const invoke = vi.fn(async () => {
            throw new Error('read failed')
        })
        expect(await readBatchCompileTextFile('E:/ws/wiki/a.md', invoke)).toBeNull()
    })

    it('缺省 invoke 走 window.electron 桥', async () => {
        const invoke = vi.fn(async () => 'body')
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
        expect(await readBatchCompileTextFile('E:/ws/wiki/a.md')).toBe('body')
        expect(invoke).toHaveBeenCalled()
    })
})

/* ============================================================================
 * 三、AI 配置归一化
 * ========================================================================== */

describe('normalizeBatchCompileAiConfigSnapshot：AI 配置摘要', () => {
    it('非法/未启用/无模型 → 未配置', () => {
        expect(normalizeBatchCompileAiConfigSnapshot(null)).toEqual(
            createEmptyBatchCompileAiConfig()
        )
        expect(normalizeBatchCompileAiConfigSnapshot('bad')).toEqual(
            createEmptyBatchCompileAiConfig()
        )
        expect(normalizeBatchCompileAiConfigSnapshot({ enabled: false, models: [] })).toEqual(
            createEmptyBatchCompileAiConfig()
        )
        expect(normalizeBatchCompileAiConfigSnapshot({ enabled: true, models: [] })).toEqual(
            createEmptyBatchCompileAiConfig()
        )
    })

    it('本地默认模型 → configured、hasLocalModel、非远程', () => {
        const config = normalizeBatchCompileAiConfigSnapshot({
            enabled: true,
            defaultModelId: 'local-1',
            models: [
                {
                    id: 'local-1',
                    name: '本地 Qwen',
                    provider: 'local',
                    localProvider: 'ollama',
                    baseUrl: '',
                    model: 'qwen2.5'
                }
            ]
        })
        expect(config).toEqual({
            configured: true,
            readFailed: false,
            defaultModelId: 'local-1',
            defaultModelName: '本地 Qwen',
            defaultModelRemote: false,
            hasLocalModel: true
        })
    })

    it('远程默认模型 → defaultModelRemote=true；同时存在本地模型 → hasLocalModel=true', () => {
        const config = normalizeBatchCompileAiConfigSnapshot({
            enabled: true,
            defaultModelId: 'remote-1',
            models: [
                {
                    id: 'local-1',
                    name: '本地',
                    provider: 'local',
                    localProvider: 'lmstudio',
                    baseUrl: '',
                    model: 'qwen'
                },
                {
                    id: 'remote-1',
                    name: 'DeepSeek',
                    provider: 'remote',
                    localProvider: 'ollama',
                    baseUrl: 'https://api.example.com/v1',
                    model: 'deepseek-chat'
                }
            ]
        })
        expect(config.defaultModelRemote).toBe(true)
        expect(config.defaultModelName).toBe('DeepSeek')
        expect(config.hasLocalModel).toBe(true)
    })

    it('默认模型缺失/非法 → 回落首个模型（与主进程 resolveAiModel 口径一致）', () => {
        const config = normalizeBatchCompileAiConfigSnapshot({
            enabled: true,
            defaultModelId: 'missing',
            models: [
                {
                    id: 'model-1',
                    name: '',
                    provider: 'remote',
                    localProvider: 'ollama',
                    baseUrl: 'https://api.example.com/v1',
                    model: 'deepseek-chat'
                }
            ]
        })
        expect(config.configured).toBe(true)
        expect(config.defaultModelId).toBe('model-1')
        expect(config.defaultModelName).toBe('deepseek-chat')
        expect(config.defaultModelRemote).toBe(true)
    })
})

describe('readBatchCompileAiConfig：配置读取容错', () => {
    it('成功读取并归一化；invoke 抛异常/缺失 → readFailed', async () => {
        const invoke = vi.fn(async () => ({
            enabled: true,
            defaultModelId: 'm',
            models: [
                {
                    id: 'm',
                    name: '模型',
                    provider: 'local',
                    localProvider: 'ollama',
                    baseUrl: '',
                    model: 'qwen'
                }
            ]
        }))
        const config = await readBatchCompileAiConfig(invoke)
        expect(config.configured).toBe(true)
        expect(invoke).toHaveBeenCalledWith(IPC.AI.GET_CONFIG)

        const failed = await readBatchCompileAiConfig(
            vi.fn(async () => {
                throw new Error('config failed')
            })
        )
        expect(failed).toEqual(createEmptyBatchCompileAiConfig(true))
        expect(await readBatchCompileAiConfig(null)).toEqual(createEmptyBatchCompileAiConfig(true))
    })

    it('缺省 invoke 走 window.electron 桥', async () => {
        const invoke = vi.fn(async () => ({ enabled: false, models: [] }))
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
        const config = await readBatchCompileAiConfig()
        expect(config.configured).toBe(false)
        expect(config.readFailed).toBe(false)
    })
})

/* ============================================================================
 * 四、AI.INGEST / AI.APPLY_INGEST
 * ========================================================================== */

/** 构造成功 ingest 返回 */
function ingestSuccessPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        ok: true,
        draftPath: 'wiki/a.md',
        content: '# 内容',
        sourcePath: 'raw/a.md',
        isUpdate: true,
        diffTruncated: false,
        model: 'fake',
        diff: [{ type: 'add', content: 'x', newLine: 1 }],
        ...overrides
    }
}

describe('normalizeBatchCompileIngestSuccess：草案结构守卫', () => {
    it('非法结构返回 null；合法结构保留 diff/model', () => {
        expect(normalizeBatchCompileIngestSuccess(null)).toBeNull()
        expect(normalizeBatchCompileIngestSuccess({ ok: false })).toBeNull()
        expect(
            normalizeBatchCompileIngestSuccess({
                ok: true,
                draftPath: '',
                content: '',
                sourcePath: ''
            })
        ).toBeNull()
        const success = normalizeBatchCompileIngestSuccess(ingestSuccessPayload())
        expect(success).toMatchObject({
            ok: true,
            draftPath: 'wiki/a.md',
            sourcePath: 'raw/a.md',
            isUpdate: true,
            model: 'fake'
        })
        expect(success?.diff).toHaveLength(1)
    })

    it('diff 非法项被过滤；model 为空串不返回', () => {
        const success = normalizeBatchCompileIngestSuccess(
            ingestSuccessPayload({
                model: '   ',
                diff: [
                    { type: 'add', content: 'ok', newLine: 1 },
                    null,
                    { type: 'bad', content: 'x' },
                    { type: 'del' }
                ]
            })
        )
        expect(success?.diff).toHaveLength(1)
        expect(success?.model).toBeUndefined()
    })
})

describe('ingestBatchCompileRawFile：生成草案', () => {
    it('成功：带 rawPath 调用 AI.INGEST 并归一化', async () => {
        const invoke = vi.fn(async () => ingestSuccessPayload())
        const outcome = await ingestBatchCompileRawFile('raw/a.md', invoke)
        expect(invoke).toHaveBeenCalledWith(IPC.AI.INGEST, { rawPath: 'raw/a.md' })
        expect(outcome.ok).toBe(true)
    })

    it('结构化失败：message 优先、缺 message 回落 code；无 invoke/非法返回结构', async () => {
        const messageFailure = await ingestBatchCompileRawFile(
            'raw/a.md',
            vi.fn(async () => ({ ok: false, code: 'AI_TIMEOUT', message: '超时' }))
        )
        expect(messageFailure).toEqual({ ok: false, error: '超时' })

        const codeFailure = await ingestBatchCompileRawFile(
            'raw/a.md',
            vi.fn(async () => ({ ok: false, code: 'AI_EMPTY_RESPONSE' }))
        )
        expect(codeFailure).toEqual({ ok: false, error: 'AI_EMPTY_RESPONSE' })

        expect(await ingestBatchCompileRawFile('raw/a.md', null)).toEqual({
            ok: false,
            error: expect.stringContaining('主进程') as unknown as string
        })

        const invalid = await ingestBatchCompileRawFile(
            'raw/a.md',
            vi.fn(async () => ({ ok: true, draftPath: '' }))
        )
        expect(invalid.ok).toBe(false)
    })

    it('调用抛异常 → 可读错误（不崩溃）', async () => {
        const outcome = await ingestBatchCompileRawFile(
            'raw/a.md',
            vi.fn(async () => {
                throw new Error('IPC 断开')
            })
        )
        expect(outcome).toEqual({ ok: false, error: 'IPC 断开' })
    })
})

describe('applyBatchCompileDraft：审批写盘', () => {
    it('成功：approved=true 且回传 draftPath/content；返回实际写入路径', async () => {
        const invoke = vi.fn(async () => ({
            ok: true,
            draftPath: 'wiki/a.md',
            bytes: 10
        }))
        const outcome = await applyBatchCompileDraft(
            { draftPath: 'wiki/a.md', content: '# 内容' },
            invoke
        )
        expect(invoke).toHaveBeenCalledWith(IPC.AI.APPLY_INGEST, {
            draftPath: 'wiki/a.md',
            content: '# 内容',
            approved: true
        })
        expect(outcome).toEqual({ ok: true, path: 'wiki/a.md' })
    })

    it('成功但缺 draftPath → 回退请求路径；结构化失败/结构非法/无 invoke/抛异常', async () => {
        const fallback = await applyBatchCompileDraft(
            { draftPath: 'wiki/a.md', content: 'x' },
            vi.fn(async () => ({ ok: true }))
        )
        expect(fallback).toEqual({ ok: true, path: 'wiki/a.md' })

        const failure = await applyBatchCompileDraft(
            { draftPath: 'wiki/a.md', content: 'x' },
            vi.fn(async () => ({ ok: false, code: 'AI_APPLY_FAILED', message: '只读' }))
        )
        expect(failure).toEqual({ ok: false, error: '只读' })

        const invalid = await applyBatchCompileDraft(
            { draftPath: 'wiki/a.md', content: 'x' },
            vi.fn(async () => null)
        )
        expect(invalid.ok).toBe(false)

        const noInvoke = await applyBatchCompileDraft(
            { draftPath: 'wiki/a.md', content: 'x' },
            null
        )
        expect(noInvoke.ok).toBe(false)

        const thrown = await applyBatchCompileDraft(
            { draftPath: 'wiki/a.md', content: 'x' },
            vi.fn(async () => {
                throw new Error('写盘异常')
            })
        )
        expect(thrown).toEqual({ ok: false, error: '写盘异常' })
    })
})

/* ============================================================================
 * 五、默认依赖装配
 * ========================================================================== */

describe('createDefaultBatchCompileDeps：生产依赖装配', () => {
    it('装配队列所需全部依赖，并可用注入 storage 读写编译记录', () => {
        const memory = new Map<string, string>()
        const deps = createDefaultBatchCompileDeps({
            getItem: (key) => memory.get(key) ?? null,
            setItem: (key, value) => {
                memory.set(key, value)
            }
        })
        expect(typeof deps.loadWorkspaceTree).toBe('function')
        expect(typeof deps.readText).toBe('function')
        expect(typeof deps.readAiConfig).toBe('function')
        expect(typeof deps.ingest).toBe('function')
        expect(typeof deps.apply).toBe('function')
        expect(typeof deps.now).toBe('function')
        expect(deps.now?.()).toBeGreaterThan(0)
        deps.records.set('E:/ws', {
            targetPath: 'wiki/a.md',
            sourcePath: 'raw/a.md',
            contentHash: 'h',
            updatedAt: 1
        })
        expect(deps.records.get('E:/ws', 'wiki/a.md')?.contentHash).toBe('h')
    })

    it('未注入 storage 时使用窗口 localStorage（jsdom 提供）', () => {
        const deps = createDefaultBatchCompileDeps()
        deps.records.set('E:/ws', {
            targetPath: 'wiki/b.md',
            sourcePath: 'raw/b.md',
            contentHash: 'h2',
            updatedAt: 2
        })
        expect(deps.records.get('E:/ws', 'wiki/b.md')?.contentHash).toBe('h2')
    })
})
