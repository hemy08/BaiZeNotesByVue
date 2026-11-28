/**
 * 1.5.7 新功能：查询当前运行的模型（`src/main/ai/running-models.ts`）单测
 *
 * 覆盖：
 * 1. 配置级失败：AI 未启用 → AI_NOT_CONFIGURED；指定模型不存在 → AI_MODEL_NOT_FOUND；
 *    读取配置抛异常 → 结构化失败（不抛堆栈）；
 * 2. 用户命令（statusCommand）：
 *    - 未确认（confirmExecution !== true）→ 拒绝执行、exec 不调用（安全边界）；
 *    - 确认后执行：固定 timeout / maxBuffer / windowsHide 参数、stdout+stderr 合并、
 *      source=command + command 原文返回；成功无输出给可读提示；
 *    - 失败分支：退出码非 0 / 超时被终止 / 同步抛异常 → ok:false + 可读 error；
 *    - 输出截断：超过 64KB 截断并提示；
 *    - 日志不含命令原文（只记录模型 id 与命令长度）。
 * 3. 内置查询：
 *    - Ollama `GET /api/ps`：解析运行中模型（name/expires_at/size）、空列表 ok:true（不误报）、
 *      网络失败 / HTTP 失败 / 结构非法 → 结构化失败；
 *    - OpenAI 兼容 / LM Studio `GET /models`：正确 URL 与请求头（本地无密钥不带
 *      Authorization、远程带 Bearer）、可用模型语义标题、空列表、401 鉴权失败、
 *      远程缺密钥 → AI_NOT_CONFIGURED（不发起请求）；
 * 4. modelId 缺省使用 defaultModelId；配置空 statusCommand 等价于未配置（走内置查询）。
 */
import { beforeEach, describe, it, expect, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

vi.mock('../../src/main/utils/logger', () => ({ logger: mocks.logger }))

beforeEach(() => {
    vi.clearAllMocks()
})

import {
    runAiQueryRunningModels,
    type AiCommandExecError,
    type AiCommandExecLike,
    type AiCommandExecOptions,
    type AiRunningModelsDeps
} from '../../src/main/ai/running-models'
import type { AiConfigStore } from '../../src/main/ai/config-store'
import type { AiFetchLike, AiHttpResponseLike } from '../../src/main/ai/providers/types'
import type { AiConfigSnapshot, AiModelConfig } from '../../src/shared/types/ai'
import {
    AI_RUNNING_MODELS_EMPTY_OUTPUT,
    AI_STATUS_COMMAND_MAX_BUFFER_BYTES,
    AI_STATUS_COMMAND_TIMEOUT_MS
} from '../../src/shared/constants/ai'

/** 构造模型配置（默认本地 Ollama） */
function makeModel(overrides: Partial<AiModelConfig> = {}): AiModelConfig {
    return {
        id: 'model-a',
        name: '模型 A',
        provider: 'local',
        localProvider: 'ollama',
        baseUrl: '',
        model: 'qwen2.5',
        ...overrides
    }
}

/** 构造配置存储替身（可配置启用状态 / 多模型 / 每模型密钥） */
function makeStore(
    options: {
        enabled?: boolean
        models?: AiModelConfig[]
        defaultModelId?: string | null
        apiKeys?: Record<string, string>
        snapshotError?: Error
    } = {}
): AiConfigStore {
    const models = options.models ?? [makeModel()]
    const defaultModelId =
        options.defaultModelId !== undefined ? options.defaultModelId : (models[0]?.id ?? null)
    const apiKeys = options.apiKeys ?? {}
    const snapshot: AiConfigSnapshot = {
        enabled: options.enabled === true,
        models: models.map((model) => ({
            ...model,
            apiKeyConfigured: apiKeys[model.id] !== undefined
        })),
        defaultModelId,
        apiKeyStorage: 'memory'
    }
    return {
        getSnapshot: vi.fn(async () => {
            if (options.snapshotError) {
                throw options.snapshotError
            }
            return snapshot
        }),
        save: vi.fn(async () => snapshot),
        getRuntimeApiKey: vi.fn(async (modelId: string) => apiKeys[modelId] ?? null)
    }
}

/** 构造 fetch 响应替身 */
function response(status: number, body: unknown): AiHttpResponseLike {
    const text = typeof body === 'string' ? body : JSON.stringify(body)
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: '',
        text: async () => text
    }
}

/** 构造 fetch 替身：按 URL 返回预设响应并记录调用参数 */
function makeFetch(
    handler: (url: string, init: { headers: Record<string, string> }) => AiHttpResponseLike
): AiFetchLike & { mock: { calls: unknown[][] } } {
    return vi.fn(async (url: string, init: { headers: Record<string, string> }) =>
        handler(url, init)
    ) as unknown as AiFetchLike & { mock: { calls: unknown[][] } }
}

/** 构造命令执行替身（单测从不执行真实命令） */
function makeExec(
    outcome: {
        error?: AiCommandExecError | null
        stdout?: string
        stderr?: string
        throwSync?: Error
    } = {}
): AiCommandExecLike & {
    mock: { calls: unknown[][] }
} {
    const exec = vi.fn(
        (
            _command: string,
            _options: AiCommandExecOptions,
            callback: (error: AiCommandExecError | null, stdout: string, stderr: string) => void
        ) => {
            if (outcome.throwSync) {
                throw outcome.throwSync
            }
            callback(outcome.error ?? null, outcome.stdout ?? '', outcome.stderr ?? '')
        }
    )
    return exec as unknown as AiCommandExecLike & { mock: { calls: unknown[][] } }
}

/** 构造依赖（store 必填，fetch/exec 可选） */
function makeDeps(
    store: AiConfigStore,
    extra: Partial<Pick<AiRunningModelsDeps, 'fetchImpl' | 'execImpl'>> = {}
): AiRunningModelsDeps {
    return { store, ...extra }
}

describe('查询运行中模型：配置级失败', () => {
    it('AI 未启用 → ok:false + code=AI_NOT_CONFIGURED（不发起任何请求/命令）', async () => {
        const store = makeStore({ enabled: false })
        const fetchImpl = makeFetch(() => response(200, {}))
        const execImpl = makeExec({ stdout: 'should not run' })
        const result = await runAiQueryRunningModels({}, makeDeps(store, { fetchImpl, execImpl }))
        expect(result).toMatchObject({ ok: false, code: 'AI_NOT_CONFIGURED' })
        expect(fetchImpl).not.toHaveBeenCalled()
        expect(execImpl).not.toHaveBeenCalled()
    })

    it('显式 modelId 不存在 → ok:false + code=AI_MODEL_NOT_FOUND', async () => {
        const store = makeStore({ enabled: true })
        const result = await runAiQueryRunningModels(
            { modelId: 'not-exist' },
            makeDeps(makeStore({ enabled: true, models: [makeModel()] }))
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_MODEL_NOT_FOUND' })
        // 未配置默认模型（models 为空）→ AI_NOT_CONFIGURED
        const emptyStore = makeStore({ enabled: true, models: [], defaultModelId: null })
        const emptyResult = await runAiQueryRunningModels({}, makeDeps(emptyStore))
        expect(emptyResult).toMatchObject({ ok: false, code: 'AI_NOT_CONFIGURED' })
        expect(store.getSnapshot).toBeDefined()
    })

    it('读取配置抛异常 → 结构化失败（不抛堆栈）', async () => {
        const store = makeStore({ enabled: true, snapshotError: new Error('配置读取失败') })
        const result = await runAiQueryRunningModels({}, makeDeps(store))
        expect(result).toMatchObject({ ok: false })
        if (!result.ok) {
            expect(result.error).toContain('配置读取失败')
        }
    })
})

describe('查询运行中模型：用户命令（statusCommand）', () => {
    it('未确认执行 → 拒绝执行且不调用 exec（命令仅用户显式确认后执行）', async () => {
        const store = makeStore({
            enabled: true,
            models: [makeModel({ id: 'model-a', statusCommand: 'ollama ps' })]
        })
        const execImpl = makeExec({ stdout: 'NAME ID' })
        const result = await runAiQueryRunningModels({}, makeDeps(store, { execImpl }))
        expect(result).toMatchObject({
            ok: false,
            source: 'command',
            command: 'ollama ps'
        })
        expect(execImpl).not.toHaveBeenCalled()
        if (!result.ok) {
            expect(result.error).toContain('确认')
        }
    })

    it('确认后执行命令：固定 timeout/maxBuffer/windowsHide，stdout+stderr 合并返回', async () => {
        const store = makeStore({
            enabled: true,
            models: [makeModel({ id: 'model-a', statusCommand: 'ollama ps' })]
        })
        const execImpl = makeExec({ stdout: 'NAME  ID\nqwen2.5  abc\n', stderr: 'warning: x' })
        const result = await runAiQueryRunningModels(
            { confirmExecution: true },
            makeDeps(store, { execImpl })
        )
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.source).toBe('command')
        expect(result.command).toBe('ollama ps')
        expect(result.output).toContain('qwen2.5  abc')
        expect(result.output).toContain('warning: x')
        expect(execImpl.mock.calls).toHaveLength(1)
        const [command, options] = execImpl.mock.calls[0] as [string, AiCommandExecOptions]
        expect(command).toBe('ollama ps')
        expect(options).toEqual({
            timeout: AI_STATUS_COMMAND_TIMEOUT_MS,
            maxBuffer: AI_STATUS_COMMAND_MAX_BUFFER_BYTES,
            windowsHide: true
        })
    })

    it('命令成功但无输出 → 返回可读提示（ok:true）', async () => {
        const store = makeStore({
            enabled: true,
            models: [makeModel({ statusCommand: 'true' })]
        })
        const result = await runAiQueryRunningModels(
            { confirmExecution: true },
            makeDeps(store, { execImpl: makeExec({ stdout: '', stderr: '' }) })
        )
        expect(result).toMatchObject({ ok: true, source: 'command', command: 'true' })
        if (result.ok) {
            expect(result.output).toContain('命令执行成功')
        }
    })

    it('命令退出码非 0 → ok:false + 可读 error（含退出码与 stderr 摘要，但不回显命令原文）', async () => {
        const store = makeStore({
            enabled: true,
            models: [makeModel({ statusCommand: 'bad-cmd' })]
        })
        // Node exec 的 error.message 形如 `Command failed: <命令原文>\n<stderr>`：
        // 实现不得把它直接拼进错误消息/日志（防命令原文泄漏）
        const commandError = Object.assign(
            new Error('Command failed: bad-cmd\nsecret-stderr-from-message'),
            { code: 2 }
        )
        const result = await runAiQueryRunningModels(
            { confirmExecution: true },
            makeDeps(store, {
                execImpl: makeExec({
                    error: commandError as AiCommandExecError,
                    stderr: 'command not found'
                })
            })
        )
        expect(result).toMatchObject({ ok: false, source: 'command', command: 'bad-cmd' })
        if (!result.ok) {
            expect(result.error).toContain('退出码 2')
            expect(result.error).toContain('command not found')
            expect(result.error).not.toContain('bad-cmd')
            expect(result.output).toContain('command not found')
        }
        // 日志只记录模型 id/命令长度/退出码/输出长度，不含 stderr/命令原文
        const logged = JSON.stringify([
            ...mocks.logger.info.mock.calls,
            ...mocks.logger.warn.mock.calls
        ])
        expect(logged).not.toContain('command not found')
        expect(logged).not.toContain('bad-cmd')
        expect(logged).toContain('退出码=2')
    })

    it('命令超时（killed）→ ok:false + error 含超时提示', async () => {
        const store = makeStore({
            enabled: true,
            models: [makeModel({ statusCommand: 'sleep 999' })]
        })
        const timeoutError = Object.assign(new Error('Command failed: sleep 999'), {
            killed: true,
            signal: 'SIGTERM'
        })
        const result = await runAiQueryRunningModels(
            { confirmExecution: true },
            makeDeps(store, {
                execImpl: makeExec({ error: timeoutError as AiCommandExecError })
            })
        )
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.error).toContain('超时')
        }
    })

    it('命令执行实现同步抛异常 → ok:false（不崩主进程）', async () => {
        const store = makeStore({
            enabled: true,
            models: [makeModel({ statusCommand: 'boom' })]
        })
        const result = await runAiQueryRunningModels(
            { confirmExecution: true },
            makeDeps(store, { execImpl: makeExec({ throwSync: new Error('spawn failed') }) })
        )
        expect(result.ok).toBe(false)
        if (!result.ok) {
            expect(result.error).toContain('spawn failed')
        }
    })

    it('命令输出超过 64KB → 截断并附加提示', async () => {
        const store = makeStore({
            enabled: true,
            models: [makeModel({ statusCommand: 'big-output' })]
        })
        const result = await runAiQueryRunningModels(
            { confirmExecution: true },
            makeDeps(store, { execImpl: makeExec({ stdout: 'x'.repeat(70_000) }) })
        )
        expect(result.ok).toBe(true)
        if (result.ok) {
            expect(result.output.length).toBeLessThan(70_000)
            expect(result.output).toContain('已截断')
        }
    })

    it('命令日志不含命令原文（只记录模型 id 与命令长度）', async () => {
        const secretCommand = 'curl -H "Authorization: Bearer sk-secret-token" http://127.0.0.1'
        const store = makeStore({
            enabled: true,
            models: [makeModel({ statusCommand: secretCommand })]
        })
        await runAiQueryRunningModels(
            { confirmExecution: true },
            makeDeps(store, { execImpl: makeExec({ stdout: 'ok' }) })
        )
        const logged = JSON.stringify([
            ...mocks.logger.info.mock.calls,
            ...mocks.logger.warn.mock.calls
        ])
        expect(logged).not.toContain('sk-secret-token')
        expect(logged).not.toContain(secretCommand)
        expect(logged).toContain('命令长度=')
    })

    it('statusCommand 仅空白 → 视为未配置，走内置查询', async () => {
        const store = makeStore({
            enabled: true,
            models: [makeModel({ statusCommand: '   ' })]
        })
        const execImpl = makeExec({ stdout: 'should not run' })
        const fetchImpl = makeFetch(() => response(200, { models: [] }))
        const result = await runAiQueryRunningModels({}, makeDeps(store, { fetchImpl, execImpl }))
        expect(result).toMatchObject({ ok: true, source: 'builtin' })
        expect(execImpl).not.toHaveBeenCalled()
        expect(fetchImpl).toHaveBeenCalledTimes(1)
    })
})

describe('查询运行中模型：内置查询（Ollama /api/ps）', () => {
    it('解析运行中模型（name/expires_at/size），缺省 modelId 使用默认模型', async () => {
        const store = makeStore({
            enabled: true,
            models: [makeModel({ id: 'model-a', baseUrl: 'http://127.0.0.1:11434' })],
            defaultModelId: 'model-a'
        })
        const fetchImpl = makeFetch(() =>
            response(200, {
                models: [
                    {
                        name: 'qwen2.5:latest',
                        model: 'qwen2.5:latest',
                        size: 4_700_000_000,
                        expires_at: '2026-11-28T15:00:00Z'
                    }
                ]
            })
        )
        const result = await runAiQueryRunningModels({}, makeDeps(store, { fetchImpl }))
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.source).toBe('builtin')
        expect(result.models).toEqual([
            {
                name: 'qwen2.5:latest',
                detail: expect.stringContaining('到期：2026-11-28T15:00:00Z')
            }
        ])
        expect(result.models?.[0].detail).toContain('4.4 GB')
        expect(result.output).toContain('运行中的 Ollama 模型（1 个）')
        expect(result.output).toContain('qwen2.5:latest')
        const [url, init] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }]
        expect(url).toBe('http://127.0.0.1:11434/api/ps')
        expect(init.headers.Accept).toBe('application/json')
    })

    it('基址留空时使用 Ollama 默认基址', async () => {
        const store = makeStore({ enabled: true, models: [makeModel({ baseUrl: '' })] })
        const fetchImpl = makeFetch(() => response(200, { models: [] }))
        await runAiQueryRunningModels({}, makeDeps(store, { fetchImpl }))
        expect(fetchImpl.mock.calls[0][0]).toBe('http://127.0.0.1:11434/api/ps')
    })

    it('空模型列表 → ok:true + 「未检测到运行中的模型」（只读展示不误报）', async () => {
        const store = makeStore({ enabled: true })
        const result = await runAiQueryRunningModels(
            {},
            makeDeps(store, { fetchImpl: makeFetch(() => response(200, { models: [] })) })
        )
        expect(result).toMatchObject({
            ok: true,
            source: 'builtin',
            output: AI_RUNNING_MODELS_EMPTY_OUTPUT,
            models: []
        })
    })

    it('网络失败 → ok:false（内置来源）+ 可读错误', async () => {
        const store = makeStore({ enabled: true })
        const failingFetch: AiFetchLike = async () => {
            throw new Error('ECONNREFUSED')
        }
        const result = await runAiQueryRunningModels(
            {},
            makeDeps(store, { fetchImpl: failingFetch })
        )
        expect(result).toMatchObject({ ok: false, source: 'builtin' })
        if (!result.ok) {
            expect(result.error).toContain('网络不可达')
        }
    })

    it('HTTP 500 → ok:false + code=AI_HTTP_ERROR', async () => {
        const store = makeStore({ enabled: true })
        const result = await runAiQueryRunningModels(
            {},
            makeDeps(store, { fetchImpl: makeFetch(() => response(500, 'boom')) })
        )
        expect(result).toMatchObject({ ok: false, source: 'builtin', code: 'AI_HTTP_ERROR' })
    })

    it('响应结构非法（models 非数组）→ ok:false + code=AI_INVALID_RESPONSE', async () => {
        const store = makeStore({ enabled: true })
        const result = await runAiQueryRunningModels(
            {},
            makeDeps(store, { fetchImpl: makeFetch(() => response(200, { models: 'nope' })) })
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_INVALID_RESPONSE' })
    })
})

describe('查询运行中模型：内置查询（OpenAI 兼容 / LM Studio /models）', () => {
    it('本地 LM Studio：GET /models，无密钥不带 Authorization，标注可用模型语义', async () => {
        const store = makeStore({
            enabled: true,
            models: [
                makeModel({
                    localProvider: 'lmstudio',
                    baseUrl: 'http://127.0.0.1:1234/v1',
                    model: 'qwen2.5-7b'
                })
            ]
        })
        const fetchImpl = makeFetch(() =>
            response(200, {
                data: [
                    { id: 'qwen2.5-7b', owned_by: 'lmstudio' },
                    { id: 'deepseek-r1', owned_by: 'lmstudio' }
                ]
            })
        )
        const result = await runAiQueryRunningModels({}, makeDeps(store, { fetchImpl }))
        expect(result.ok).toBe(true)
        if (!result.ok) {
            return
        }
        expect(result.source).toBe('builtin')
        expect(result.models?.map((item) => item.name)).toEqual(['qwen2.5-7b', 'deepseek-r1'])
        expect(result.output).toContain('已加载/可用模型')
        const [url, init] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }]
        expect(url).toBe('http://127.0.0.1:1234/v1/models')
        expect(init.headers.Authorization).toBeUndefined()
    })

    it('远程模型：带 Bearer 密钥；空列表 ok:true', async () => {
        const store = makeStore({
            enabled: true,
            models: [
                makeModel({
                    id: 'remote-a',
                    provider: 'remote',
                    baseUrl: 'https://api.example.com/v1',
                    model: 'deepseek-chat'
                })
            ],
            apiKeys: { 'remote-a': 'sk-test-key' }
        })
        const fetchImpl = makeFetch(() => response(200, { data: [] }))
        const result = await runAiQueryRunningModels({}, makeDeps(store, { fetchImpl }))
        expect(result).toMatchObject({
            ok: true,
            source: 'builtin',
            output: AI_RUNNING_MODELS_EMPTY_OUTPUT
        })
        const [url, init] = fetchImpl.mock.calls[0] as [string, { headers: Record<string, string> }]
        expect(url).toBe('https://api.example.com/v1/models')
        expect(init.headers.Authorization).toBe('Bearer sk-test-key')
        // 错误消息/输出不含密钥
        expect(JSON.stringify(result)).not.toContain('sk-test-key')
    })

    it('远程模型未配置 API Key → AI_NOT_CONFIGURED（不发起请求）', async () => {
        const store = makeStore({
            enabled: true,
            models: [
                makeModel({
                    id: 'remote-a',
                    provider: 'remote',
                    baseUrl: 'https://api.example.com/v1',
                    model: 'deepseek-chat'
                })
            ]
        })
        const fetchImpl = makeFetch(() => response(200, { data: [] }))
        const result = await runAiQueryRunningModels({}, makeDeps(store, { fetchImpl }))
        expect(result).toMatchObject({ ok: false, code: 'AI_NOT_CONFIGURED' })
        expect(fetchImpl).not.toHaveBeenCalled()
    })

    it('远程模型 401 → ok:false + code=AI_AUTH_ERROR', async () => {
        const store = makeStore({
            enabled: true,
            models: [
                makeModel({
                    id: 'remote-a',
                    provider: 'remote',
                    baseUrl: 'https://api.example.com/v1',
                    model: 'deepseek-chat'
                })
            ],
            apiKeys: { 'remote-a': 'sk-bad' }
        })
        const result = await runAiQueryRunningModels(
            {},
            makeDeps(store, {
                fetchImpl: makeFetch(() => response(401, { error: 'unauthorized' }))
            })
        )
        expect(result).toMatchObject({ ok: false, code: 'AI_AUTH_ERROR', source: 'builtin' })
    })

    it('远程模型缺 baseUrl → AI_NOT_CONFIGURED（不发起请求）', async () => {
        const store = makeStore({
            enabled: true,
            models: [
                makeModel({
                    id: 'remote-a',
                    provider: 'remote',
                    baseUrl: '',
                    model: 'deepseek-chat'
                })
            ],
            apiKeys: { 'remote-a': 'sk-test' }
        })
        const fetchImpl = makeFetch(() => response(200, { data: [] }))
        const result = await runAiQueryRunningModels({}, makeDeps(store, { fetchImpl }))
        expect(result).toMatchObject({ ok: false, code: 'AI_NOT_CONFIGURED' })
        expect(fetchImpl).not.toHaveBeenCalled()
    })
})
