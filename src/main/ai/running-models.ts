/**
 * 1.5.7「查询当前运行的模型」：`AI.QUERY_RUNNING_MODELS` 主进程业务实现
 *
 * ## 两种查询来源（二选一，先看用户配置）
 * 1. **用户命令**：模型配置了 `statusCommand`（如 Ollama `ollama ps`、LM Studio `lms ps`）时，
 *    在**主进程**用 `child_process.exec` 执行（`timeout=15s`、`maxBuffer=1MB`、`windowsHide`、
 *    默认 shell），把 stdout+stderr 合并、清洗换行控制字符后截断到 64KB 返回；
 *    - **安全**：命令仅来自用户显式配置且长度受限（≤500、单行）；执行前必须由渲染层二次
 *      确认（载荷 `confirmExecution === true`），未确认时**不执行**并返回结构化失败；
 *    - 失败（退出码非 0 / 超时 / 启动异常）只返回可读 `error`，绝不向渲染层抛堆栈；
 *    - 日志只记录模型 id、命令长度与结果，**不记录命令原文/输出内容**（命令/输出可能含敏感信息）。
 * 2. **内置查询**（未配置命令）：不执行任何命令，按模型类型请求既有 Provider 的只读接口：
 *    - 本地 Ollama：`GET {baseUrl}/api/ps`（真正「运行中」的模型，含 `expires_at`）；
 *    - OpenAI 兼容 / 本地 LM Studio / 远程 BYOK：`GET {baseUrl}/models`。该接口语义是
 *      **服务端可用模型**（不保证已加载到内存），输出会明确标注「已加载/可用模型」语义差异；
 *    - 请求复用 `providers/types.ts` 的 `runAiRequestGuarded`（超时/取消/错误归一化）与
 *      连接测试同档超时（`AI_TEST_TIMEOUT_MS`）；失败返回结构化失败（网络/鉴权/HTTP 错误码）。
 *
 * ## 空结果口径（1.5.7 缺陷修复的延伸）
 * 连接测试把「HTTP 200 + 空模型列表」视为失败（模型未安装/未加载）；本功能是**只读展示**
 * 运行状态，空列表是合法结果：返回 `ok:true` + `output` 为「未检测到运行中的模型」，
 * 不把空结果误报为「有模型运行」。
 *
 * ## 依赖注入
 * `store` / `fetchImpl` / `execImpl` 全部显式传入（生产由 `ai-ipc.ts` 装配运行时单例），
 * 单测不执行真实命令、不发起真实网络请求（CFG-12 同款口径）。
 */
import { exec as nodeExec } from 'child_process'
import type {
    AiModelConfig,
    AiQueryRunningModelsFailure,
    AiQueryRunningModelsRequest,
    AiQueryRunningModelsResult,
    AiRunningModelEntry,
    AiStoredConfig
} from '../../shared/types/ai'
import {
    AI_RUNNING_MODELS_EMPTY_OUTPUT,
    AI_STATUS_COMMAND_MAX_BUFFER_BYTES,
    AI_STATUS_COMMAND_OUTPUT_MAX_CHARS,
    AI_STATUS_COMMAND_TIMEOUT_MS,
    AI_TEST_TIMEOUT_MS,
    resolveAiBaseUrl
} from '../../shared/constants/ai'
import { logger } from '../utils/logger'
import type { AiConfigStore } from './config-store'
import { AiProviderError, sanitizeErrorMessage, toAiFailure } from './errors'
import { resolveAiModel } from './providers/factory'
import {
    defaultAiFetch,
    joinAiEndpoint,
    mapAiHttpError,
    readAiJsonBody,
    readAiResponseText,
    runAiRequestGuarded,
    type AiFetchLike
} from './providers/types'

/** 命令执行错误的最小结构（child_process.exec 回调 error 的子集；单测替身友好） */
export interface AiCommandExecError extends Error {
    /** 退出码（数字）/ spawn 错误码（字符串，如 ENOENT / ERR_CHILD_PROCESS_STDIO_MAXBUFFER） */
    code?: number | string | null
    /** 超时被终止时为 true */
    killed?: boolean
    /** 终止信号（超时时通常为 SIGTERM） */
    signal?: string | null
}

/** 命令执行选项（固定安全默认值：超时 / 缓冲上限 / 隐藏窗口） */
export interface AiCommandExecOptions {
    timeout: number
    maxBuffer: number
    windowsHide: boolean
}

/** `child_process.exec` 的最小可注入签名（单测不执行真实命令） */
export type AiCommandExecLike = (
    command: string,
    options: AiCommandExecOptions,
    callback: (error: AiCommandExecError | null, stdout: string, stderr: string) => void
) => unknown

/** 运行状态查询的服务依赖（全部由 IPC 层注入，模块内无全局状态） */
export interface AiRunningModelsDeps {
    /** AI 配置存储（读取模型配置 + 远程模型运行时密钥） */
    store: AiConfigStore
    /** fetch 实现（缺省 globalThis.fetch；单测注入替身） */
    fetchImpl?: AiFetchLike
    /** 命令执行实现（缺省 child_process.exec；单测注入替身） */
    execImpl?: AiCommandExecLike
}

/** 纯对象判定（响应结构解析用） */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 构造查询失败结构（可读原因已清洗；不抛异常） */
function queryFailure(
    error: unknown,
    context: { source?: 'command' | 'builtin'; command?: string; output?: string } = {}
): AiQueryRunningModelsFailure {
    const failure = toAiFailure(error, 'AI_HTTP_ERROR')
    return {
        ok: false,
        ...(context.source !== undefined ? { source: context.source } : {}),
        ...(context.command !== undefined ? { command: context.command } : {}),
        output: context.output ?? '',
        error: failure.message,
        code: failure.code
    }
}

/** 构造内置查询失败（带来源标注） */
function builtinFailure(error: unknown): AiQueryRunningModelsFailure {
    return queryFailure(error, { source: 'builtin' })
}

/** 常量：允许的最大输出字符数（避免超长输出撑破 UI/内存） */
const MAX_OUTPUT_CHARS = AI_STATUS_COMMAND_OUTPUT_MAX_CHARS

/**
 * 截断输出文本（保留换行；超限时追加可读提示）。
 *
 * @param text 合并后的原始输出
 */
function truncateOutput(text: string): string {
    if (text.length <= MAX_OUTPUT_CHARS) {
        return text
    }
    return `${text.slice(0, MAX_OUTPUT_CHARS)}\n…（输出过长已截断）`
}

/** 合并 stdout / stderr（保留换行，去尾部空白；两者都空返回空串） */
function combineCommandOutput(stdout: string, stderr: string): string {
    const parts: string[] = []
    if (stdout.trim().length > 0) {
        parts.push(stdout.replace(/\s+$/, ''))
    }
    if (stderr.trim().length > 0) {
        parts.push(stderr.replace(/\s+$/, ''))
    }
    return parts.join('\n')
}

/** stderr 摘要最大长度（仅用于返回界面的可读失败原因，不写日志） */
const STDERR_SUMMARY_MAX_CHARS = 200

/**
 * 解析命令失败原因（退出码 / 超时 / 缓冲超限 / 启动异常）。
 *
 * 安全：**不直接使用 `error.message`**——Node exec 的错误消息形如
 * `Command failed: <命令原文>\n<stderr>`，会把命令原文带进日志/错误消息；
 * 这里只拼接退出码与 stderr 摘要（stderr 是用户命令自身的输出，可回传界面排错，
 * 但绝不写入日志）。
 *
 * @param error exec 回调错误
 * @param stderr 命令 stderr（可为空）
 */
function describeCommandError(error: AiCommandExecError, stderr: string): string {
    if (error.killed === true || error.signal === 'SIGTERM' || error.signal === 'SIGKILL') {
        return `命令执行超时（>${Math.round(AI_STATUS_COMMAND_TIMEOUT_MS / 1000)}s），已终止`
    }
    if (error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
        return '命令输出超过缓冲上限（1MB），已终止'
    }
    const stderrSummary = sanitizeErrorMessage(stderr)
    const detail =
        stderrSummary.length > 0 ? `：${stderrSummary.slice(0, STDERR_SUMMARY_MAX_CHARS)}` : ''
    if (typeof error.code === 'number') {
        return `命令执行失败（退出码 ${error.code}）${detail}`
    }
    if (typeof error.code === 'string' && error.code.length > 0) {
        return `命令执行失败（${error.code}）${detail}`
    }
    return `命令执行失败${detail}`
}

/** 默认命令执行实现（生产：Node child_process.exec；shell 默认启用） */
function defaultCommandExec(
    command: string,
    options: AiCommandExecOptions,
    callback: (error: AiCommandExecError | null, stdout: string, stderr: string) => void
): void {
    nodeExec(
        command,
        {
            timeout: options.timeout,
            maxBuffer: options.maxBuffer,
            windowsHide: options.windowsHide
        },
        (error, stdout, stderr) => {
            callback(
                error as AiCommandExecError | null,
                typeof stdout === 'string' ? stdout : String(stdout ?? ''),
                typeof stderr === 'string' ? stderr : String(stderr ?? '')
            )
        }
    )
}

/**
 * 执行用户配置的运行状态查询命令（主进程 shell）。
 *
 * 安全与健壮性：
 * - 只在主进程执行、每次执行前要求渲染层确认（由 `runAiQueryRunningModels` 校验）；
 * - 固定 timeout / maxBuffer / windowsHide；输出合并截断；
 * - 任何失败（退出码非 0 / 超时 / 同步抛出）都返回结构化失败，不污染主进程。
 *
 * @param model 模型配置（仅用于日志中的模型 id）
 * @param command 命令原文（已由保存链路校验为单行、长度受限）
 * @param execImpl 命令执行实现（生产默认 child_process.exec）
 */
function runStatusCommand(
    model: AiModelConfig,
    command: string,
    execImpl: AiCommandExecLike
): Promise<AiQueryRunningModelsResult> {
    return new Promise((resolve) => {
        let settled = false
        const finish = (result: AiQueryRunningModelsResult): void => {
            if (settled) {
                return
            }
            settled = true
            resolve(result)
        }
        try {
            execImpl(
                command,
                {
                    timeout: AI_STATUS_COMMAND_TIMEOUT_MS,
                    maxBuffer: AI_STATUS_COMMAND_MAX_BUFFER_BYTES,
                    windowsHide: true
                },
                (error, stdout, stderr) => {
                    const combined = truncateOutput(
                        combineCommandOutput(
                            typeof stdout === 'string' ? stdout : '',
                            typeof stderr === 'string' ? stderr : ''
                        )
                    )
                    if (error) {
                        const stderrText = typeof stderr === 'string' ? stderr : ''
                        const reason = describeCommandError(error, stderrText)
                        // 日志不含命令原文/output/stderr：只记录模型 id、命令长度、退出码与输出长度
                        const errorCode =
                            typeof error.code === 'number' || typeof error.code === 'string'
                                ? String(error.code)
                                : error.killed === true
                                  ? 'timeout'
                                  : 'unknown'
                        logger.warn(
                            `[AI] 运行状态查询命令执行失败（model=${model.id}，` +
                                `命令长度=${command.length}，退出码=${errorCode}，` +
                                `输出长度=${combined.length}）`
                        )
                        finish({
                            ok: false,
                            source: 'command',
                            command,
                            output: combined,
                            error: reason
                        })
                        return
                    }
                    logger.info(
                        `[AI] 运行状态查询命令执行成功（model=${model.id}，` +
                            `输出长度=${combined.length}）`
                    )
                    finish({
                        ok: true,
                        source: 'command',
                        command,
                        output: combined.length > 0 ? combined : '命令执行成功，但没有任何输出'
                    })
                }
            )
        } catch (error) {
            // exec 同步抛出（如参数非法）：结构化返回，不崩主进程；日志不含异常细节（防命令原文泄漏）
            const reason = `命令执行失败：${sanitizeErrorMessage(error)}`
            logger.warn(
                `[AI] 运行状态查询命令执行异常（model=${model.id}，` +
                    `命令长度=${command.length}）`
            )
            finish({ ok: false, source: 'command', command, output: '', error: reason })
        }
    })
}

/** 字节数 → 可读大小（仅用于 Ollama /api/ps 的 size 字段展示） */
function formatBytes(value: unknown): string {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        return ''
    }
    const units = ['B', 'KB', 'MB', 'GB', 'TB']
    let size = value
    let unitIndex = 0
    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024
        unitIndex += 1
    }
    return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

/**
 * 解析 Ollama `GET /api/ps` 响应（`{ models: [{ name?, model?, size?, expires_at? }] }`）。
 *
 * @throws AiProviderError AI_INVALID_RESPONSE：响应不是对象/缺少 models 数组
 */
function readOllamaRunningModels(payload: unknown, service: string): AiRunningModelEntry[] {
    if (!isRecord(payload)) {
        throw new AiProviderError(
            'AI_INVALID_RESPONSE',
            `${service} 响应结构非法（期望 JSON 对象）`
        )
    }
    const rawModels = payload.models
    if (!Array.isArray(rawModels)) {
        throw new AiProviderError('AI_INVALID_RESPONSE', `${service} 响应缺少 models 数组`)
    }
    const entries: AiRunningModelEntry[] = []
    for (const item of rawModels) {
        if (!isRecord(item)) {
            continue
        }
        const name =
            typeof item.name === 'string' && item.name.length > 0
                ? item.name
                : typeof item.model === 'string'
                  ? item.model
                  : ''
        if (name.length === 0) {
            continue
        }
        const details: string[] = []
        if (typeof item.expires_at === 'string' && item.expires_at.length > 0) {
            details.push(`到期：${item.expires_at}`)
        }
        const sizeText = formatBytes(item.size)
        if (sizeText.length > 0) {
            details.push(`大小：${sizeText}`)
        }
        entries.push({
            name,
            ...(details.length > 0 ? { detail: details.join('，') } : {})
        })
    }
    return entries
}

/**
 * 解析 OpenAI 兼容 `GET /models` 响应（`{ data: [{ id, owned_by? }] }`）。
 *
 * @throws AiProviderError AI_INVALID_RESPONSE：响应不是对象/缺少 data 数组
 */
function readOpenAiModelEntries(payload: unknown, service: string): AiRunningModelEntry[] {
    if (!isRecord(payload)) {
        throw new AiProviderError(
            'AI_INVALID_RESPONSE',
            `${service} 响应结构非法（期望 JSON 对象）`
        )
    }
    const data = payload.data
    if (!Array.isArray(data)) {
        throw new AiProviderError('AI_INVALID_RESPONSE', `${service} 响应缺少 data 数组`)
    }
    const entries: AiRunningModelEntry[] = []
    for (const item of data) {
        if (!isRecord(item) || typeof item.id !== 'string' || item.id.length === 0) {
            continue
        }
        const detail =
            typeof item.owned_by === 'string' && item.owned_by.length > 0
                ? `提供方：${item.owned_by}`
                : ''
        entries.push({ name: item.id, ...(detail.length > 0 ? { detail } : {}) })
    }
    return entries
}

/** 把模型条目渲染为可读输出（每行一个；detail 放括号内） */
function formatEntries(title: string, entries: AiRunningModelEntry[]): string {
    const lines = entries.map((entry) =>
        entry.detail !== undefined ? `- ${entry.name}（${entry.detail}）` : `- ${entry.name}`
    )
    return `${title}：\n${lines.join('\n')}`
}

/** 构造内置查询成功结果（空列表统一输出「未检测到运行中的模型」） */
function builtinSuccess(entries: AiRunningModelEntry[], title: string): AiQueryRunningModelsResult {
    if (entries.length === 0) {
        return {
            ok: true,
            source: 'builtin',
            output: AI_RUNNING_MODELS_EMPTY_OUTPUT,
            models: []
        }
    }
    return {
        ok: true,
        source: 'builtin',
        output: formatEntries(title, entries),
        models: entries
    }
}

/** 发送一次只读 GET 并解析 JSON（超时/错误归一化与 Provider 连接测试同口径） */
async function requestJson(
    service: string,
    url: string,
    headers: Record<string, string>,
    fetchImpl: AiFetchLike
): Promise<unknown> {
    const response = await runAiRequestGuarded(
        service,
        { timeoutMs: AI_TEST_TIMEOUT_MS },
        (signal) =>
            fetchImpl(url, {
                method: 'GET',
                headers,
                signal,
                redirect: 'error'
            })
    )
    if (!response.ok) {
        const bodyText = await readAiResponseText(response).catch(() => '')
        throw mapAiHttpError(service, response, bodyText)
    }
    return readAiJsonBody(response)
}

/**
 * 内置查询：本地 Ollama `GET /api/ps`（真正运行中的模型）。
 *
 * @throws AiProviderError（网络/HTTP/结构错误，由调用方统一转结构化失败）
 */
async function queryOllamaRunning(
    baseUrl: string,
    fetchImpl: AiFetchLike
): Promise<AiQueryRunningModelsResult> {
    const service = '本地 Ollama'
    const url = joinAiEndpoint(baseUrl, 'api/ps')
    const payload = await requestJson(service, url, { Accept: 'application/json' }, fetchImpl)
    const entries = readOllamaRunningModels(payload, service)
    return builtinSuccess(entries, `运行中的 Ollama 模型（${entries.length} 个）`)
}

/**
 * 内置查询：OpenAI 兼容 / LM Studio `GET /models`。
 *
 * 语义说明：该接口返回**服务端可用模型**（不保证已加载到显存/内存），
 * 因此输出标题明确标注「已加载/可用模型」，避免与 Ollama `/api/ps` 的「运行中」混淆。
 *
 * @throws AiProviderError（网络/HTTP/结构错误，由调用方统一转结构化失败）
 */
async function queryOpenAiCompatibleModels(
    model: AiModelConfig,
    baseUrl: string,
    apiKey: string | null,
    fetchImpl: AiFetchLike
): Promise<AiQueryRunningModelsResult> {
    const service = model.provider === 'remote' ? '远程 OpenAI 兼容接口' : '本地 LM Studio'
    const url = joinAiEndpoint(baseUrl, 'models')
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (apiKey !== null && apiKey.length > 0) {
        headers.Authorization = `Bearer ${apiKey}`
    }
    const payload = await requestJson(service, url, headers, fetchImpl)
    const entries = readOpenAiModelEntries(payload, service)
    return builtinSuccess(
        entries,
        `已加载/可用模型（${entries.length} 个，OpenAI 兼容接口 /models 返回服务端可用模型，可能包含未加载到内存的模型）`
    )
}

/**
 * 内置查询入口：按模型类型选择接口，失败统一转结构化失败（不抛异常）。
 *
 * @param model 已解析的模型配置
 * @param deps 存储 + fetch 依赖
 */
async function runBuiltinQuery(
    model: AiModelConfig,
    deps: AiRunningModelsDeps
): Promise<AiQueryRunningModelsResult> {
    try {
        const baseUrl = resolveAiBaseUrl(model)
        if (baseUrl.length === 0) {
            throw new AiProviderError(
                'AI_NOT_CONFIGURED',
                model.provider === 'remote'
                    ? 'AI 配置不完整：远程 BYOK 需先填写接口基址（baseUrl），可在「设置 → AI 助手」中配置'
                    : 'AI 配置不完整：未找到本地 Provider 的接口基址，可在「设置 → AI 助手」中配置'
            )
        }
        if (model.model.trim().length === 0) {
            throw new AiProviderError(
                'AI_NOT_CONFIGURED',
                'AI 配置不完整：请先在「设置 → AI 助手」中为该模型填写模型名（model）'
            )
        }
        const apiKey = await deps.store.getRuntimeApiKey(model.id)
        if (model.provider === 'remote' && (apiKey === null || apiKey.length === 0)) {
            throw new AiProviderError(
                'AI_NOT_CONFIGURED',
                'AI 配置不完整：远程 BYOK 需先配置 API Key（密钥经系统安全存储加密保存）'
            )
        }
        const fetchImpl = deps.fetchImpl ?? defaultAiFetch()
        if (model.provider === 'local' && model.localProvider === 'ollama') {
            return await queryOllamaRunning(baseUrl, fetchImpl)
        }
        return await queryOpenAiCompatibleModels(model, baseUrl, apiKey, fetchImpl)
    } catch (error) {
        return builtinFailure(error)
    }
}

/** 判定是否为「配置级错误」（日志用：区别于网络/命令失败） */
function isConfigLevelFailure(result: AiQueryRunningModelsFailure): boolean {
    return (
        result.code === 'AI_NOT_CONFIGURED' ||
        result.code === 'AI_MODEL_NOT_FOUND' ||
        result.code === 'AI_INVALID_PAYLOAD'
    )
}

/**
 * `AI.QUERY_RUNNING_MODELS` 业务入口：解析模型 → 执行用户命令 或 内置查询。
 *
 * 执行顺序：
 * 1. 读取配置快照（AI 未启用 → `AI_NOT_CONFIGURED`）；
 * 2. 解析模型（`modelId` 缺省 defaultModelId；不存在 → `AI_MODEL_NOT_FOUND`）；
 * 3. 模型配置了 `statusCommand` → 要求 `confirmExecution === true` 后执行命令；
 * 4. 否则走内置查询（Ollama `/api/ps` / OpenAI 兼容 `/models`）。
 *
 * 所有失败都返回结构化 `AiQueryRunningModelsFailure`，不向 IPC 层抛异常。
 *
 * @param request 已校验的查询载荷
 * @param deps 存储 / fetch / 命令执行依赖
 */
export async function runAiQueryRunningModels(
    request: AiQueryRunningModelsRequest,
    deps: AiRunningModelsDeps
): Promise<AiQueryRunningModelsResult> {
    let snapshot
    try {
        snapshot = await deps.store.getSnapshot()
    } catch (error) {
        const result = queryFailure(error)
        logger.warn(`[AI] 查询运行中模型失败（读取配置异常）：${result.error}`)
        return result
    }
    const config: AiStoredConfig = {
        enabled: snapshot.enabled,
        models: snapshot.models,
        defaultModelId: snapshot.defaultModelId
    }
    let model: AiModelConfig
    try {
        if (!snapshot.enabled) {
            throw new AiProviderError(
                'AI_NOT_CONFIGURED',
                'AI 助手未启用：请先在「设置 → AI 助手」中启用并完成配置'
            )
        }
        model = resolveAiModel(config, request.modelId)
    } catch (error) {
        const result = queryFailure(error)
        logger.warn(`[AI] 查询运行中模型失败（配置级）：${result.error}`)
        return result
    }
    const statusCommand = typeof model.statusCommand === 'string' ? model.statusCommand.trim() : ''
    if (statusCommand.length > 0) {
        if (request.confirmExecution !== true) {
            // 安全：未经渲染层用户确认，绝不执行用户配置的命令
            const error = '执行查询命令前需要在界面中确认（请重新点击查询并在确认框中确认执行）'
            logger.warn(`[AI] 拒绝执行未确认的运行状态查询命令（model=${model.id}）`)
            return {
                ok: false,
                source: 'command',
                command: statusCommand,
                output: '',
                error
            }
        }
        logger.info(
            `[AI] 查询运行中模型：执行用户配置命令（model=${model.id}，` +
                `命令长度=${statusCommand.length}）`
        )
        return runStatusCommand(model, statusCommand, deps.execImpl ?? defaultCommandExec)
    }
    logger.info(
        `[AI] 查询运行中模型：使用内置查询（model=${model.id}，` +
            `provider=${model.provider}/${model.localProvider}）`
    )
    const result = await runBuiltinQuery(model, deps)
    if (!result.ok && isConfigLevelFailure(result)) {
        logger.warn(`[AI] 查询运行中模型失败（配置级）：${result.error}`)
    }
    return result
}
