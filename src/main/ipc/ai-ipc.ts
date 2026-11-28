/**
 * 1.5.7 LLM Wiki L3 / 体验升级批次 C：AI Provider / AI ingest / diff 审批 IPC（主进程侧）
 *
 * 链路（IPC-17 六步）：
 *   1. 常量：`IPC.AI.CHAT / INGEST / APPLY_INGEST / GET_CONFIG / SAVE_CONFIG /
 *      QUERY_RUNNING_MODELS`（6 个 invoke）；
 *   2. 契约：shared/types/ai.ts（请求/返回/错误码）+ shared/types/ipc.ts 三张契约表登记；
 *   3. 白名单：build/generate-preload-whitelist.js 生成（禁止手改）；
 *   4. 主进程：本模块注册 handler（withSenderCheck）→ main/ai/**（配置存储/Provider/ingest/apply/
 *      running-models 运行状态查询）；
 *   5. 渲染层：设置页「AI 助手」独立对话框（多模型配置/每模型密钥/连接测试/查询运行中模型）+
 *      命令面板「AI 编译」+ `Markdown/llm-ingest-diff.vue`（diff 审批 UI）；L5 AI 面板经 AI.CHAT
 *      传 `modelId`；
 *   6. 测试：ai-ipc（参数校验/未配置/多模型选择/写盘守卫/sender/运行模型查询）+ ai-provider /
 *      ai-ingest / ai-config-store / ai-running-models + 通道命名/契约/白名单/注册门禁。
 *
 * 多模型（批次 C）：
 * - `AI.GET_CONFIG` 返回多模型快照（每模型仅 `apiKeyConfigured` 状态位，密钥永不出主进程）；
 * - `AI.SAVE_CONFIG` 支持 `models` 全量替换 / `defaultModelId` / `modelApiKey` 单模型密钥操作；
 * - `AI.CHAT` 支持可选 `modelId`（缺省 defaultModelId，不存在 → AI_MODEL_NOT_FOUND）；
 * - `AI.INGEST` 无 modelId 字段，统一使用默认模型。
 *
 * 运行状态查询（1.5.7 新功能，`AI.QUERY_RUNNING_MODELS`）：
 * - 模型可配置 `statusCommand`（可选，单行 ≤500 字符）；配置后由主进程 shell 执行，
 *   每次执行前渲染层必须二次确认（载荷 `confirmExecution === true`，未确认不执行）；
 * - 未配置命令时走内置只读查询：Ollama `GET /api/ps` / OpenAI 兼容 `GET /models`；
 * - 空结果 ok=true + output「未检测到运行中的模型」（只读展示不误报）；
 * - 命令/输出不写日志（仅记录 model id、命令长度与结果摘要）。
 *
 * 安全边界：
 * - 仅主窗口可信调用（withSenderCheck，`kind: 'handle'` 拒绝返回统一错误对象）；
 * - 渲染层不持有工作区根/API Key：工作区根只取 `appState.rootPath`，密钥只存在主进程；
 * - 所有失败返回结构化失败结构（不向渲染层抛异常/堆栈）；
 * - 日志只记录 provider/模型/路径/耗时，不记录密钥与笔记正文（SEC-16）。
 */
import { IPC } from '../../shared/ipc-channels'
import type {
    AiApplyIngestResult,
    AiChatRequest,
    AiChatResult,
    AiGetConfigResult,
    AiIngestResult,
    AiQueryRunningModelsResult,
    AiSaveConfigResult
} from '../../shared/types/ai'
import { AI_CHAT_CONTEXT_MAX_CHARS } from '../../shared/constants/ai'
import { appState } from '../utils/app-state'
import { withSenderCheck } from '../utils/ipc-security'
import { logger } from '../utils/logger'
import { runAiApplyIngest } from '../ai/apply'
import {
    buildDefaultAiConfigSnapshot,
    getAiRuntime,
    loadConfiguredAiProviderWith,
    type AiRuntimeDeps
} from '../ai/runtime'
import { AiProviderError, aiFailure, sanitizeErrorMessage, toAiFailure } from '../ai/errors'
import { runAiIngest } from '../ai/ingest'
import type { AiConfigStore } from '../ai/config-store'
import type { AiFetchLike, AiProviderTestResult } from '../ai/providers/types'
import { runAiQueryRunningModels, type AiCommandExecLike } from '../ai/running-models'
import {
    normalizeAiApplyIngestRequest,
    normalizeAiChatRequest,
    normalizeAiIngestRequest,
    normalizeAiQueryRunningModelsRequest,
    normalizeAiSaveConfigRequest
} from '../ai/validation'
import { ipcListenerManager } from './ipc-listener-manager'

/** 监听台账组件 ID（与各独立域模块口径一致：global-<domain>-ipc） */
export const AI_IPC_COMPONENT_ID = 'global-ai-ipc'

/** AI IPC 业务入口的可注入依赖（生产缺省走 appState / 运行时单例；单测注入替身） */
export interface AiIpcDeps {
    /** 工作区根（缺省 `appState.rootPath`；只由主进程持有，渲染层不可传） */
    rootPath?: string
    /** 配置存储（缺省：运行时单例） */
    store?: AiConfigStore
    /** fetch 实现（缺省：运行时单例/globalThis.fetch；单测注入替身） */
    fetchImpl?: AiFetchLike
    /** 命令执行实现（缺省：child_process.exec；单测注入替身，不执行真实命令） */
    execImpl?: AiCommandExecLike
    /** 时间源（ingest front matter 日期；单测固定） */
    now?: () => Date
}

/** 取工作区根（生产只信任主进程 appState；单测可注入） */
function resolveRootPath(deps: AiIpcDeps): string {
    return deps.rootPath !== undefined ? deps.rootPath : appState.rootPath
}

/** 取配置存储（生产缺省为运行时单例） */
async function resolveStore(deps: AiIpcDeps): Promise<AiConfigStore> {
    if (deps.store) {
        return deps.store
    }
    return getAiRuntime().store
}

/** 取运行时依赖（store + fetch）；用于 Provider 装载 */
async function resolveRuntime(deps: AiIpcDeps): Promise<AiRuntimeDeps> {
    if (deps.store) {
        return { store: deps.store, fetchImpl: deps.fetchImpl }
    }
    const current = getAiRuntime()
    return { store: current.store, fetchImpl: deps.fetchImpl ?? current.fetchImpl }
}

/** 构造对话上下文系统提示（当前文档标题/选中文本；不含正文其它内容） */
function buildChatContextPrompt(context: AiChatRequest['context']): string | null {
    if (!context) {
        return null
    }
    const parts: string[] = []
    if (typeof context.title === 'string' && context.title.trim().length > 0) {
        parts.push(`当前文档标题：${context.title.trim()}`)
    }
    if (typeof context.selection === 'string' && context.selection.trim().length > 0) {
        const selection = context.selection.trim()
        parts.push(`当前选中文本（可能被截断）：\n${selection.slice(0, AI_CHAT_CONTEXT_MAX_CHARS)}`)
    }
    if (parts.length === 0) {
        return null
    }
    return `以下是用户当前编辑上下文，供你理解问题背景（不要复述本段说明）：\n${parts.join('\n\n')}`
}

/** 默认配置快照（配置读取失败/首次使用时的安全兜底，不返回失败结构） */
function buildDefaultConfigSnapshot(): ReturnType<typeof buildDefaultAiConfigSnapshot> {
    return buildDefaultAiConfigSnapshot()
}

/**
 * 构造「测试连接」成功文案（1.5.7 缺陷修复：明确「测的是什么连接」）。
 *
 * - 已校验模型（`modelChecked !== false`）：服务实现了模型列表接口，且配置模型在列表中；
 * - 未校验模型（`modelChecked === false`）：服务未实现模型列表接口（HTTP 404/405），
 *   本次只验证了服务可达，必须显式注明「未校验模型」，避免用户误读为模型可用；
 * - 两种情况都说明不会进行推理，实际可用性需在 AI 面板发送消息验证。
 */
function buildConnectionTestContent(result: AiProviderTestResult): string {
    if (result.modelChecked === false) {
        return (
            `连接成功：服务可达（该服务未提供模型列表接口，未校验模型「${result.model}」，` +
            `耗时 ${result.latencyMs}ms）—— 实际推理可用性请在 AI 面板发送消息验证`
        )
    }
    return (
        `连接成功：服务可达，模型「${result.model}」可用（${result.latencyMs}ms）` +
        '—— 实际推理可用性请在 AI 面板发送消息验证'
    )
}

/**
 * `AI.CHAT` 业务入口。
 *
 * - 非空 messages：调用 Provider 非流式对话，返回助手回复；
 * - `messages: []`：连接测试（设置页/AI 助手「测试连接」按钮），返回可读测试结果文本
 *   （明确「服务可达 + 模型是否已校验」，未校验时注明服务未提供模型列表接口）；
 * - `modelId` 缺省使用配置中的 `defaultModelId`；指定不存在的模型 → `AI_MODEL_NOT_FOUND`；
 * - AI 未启用/配置不完整：返回 `AI_NOT_CONFIGURED` 结构化失败（不发起请求）。
 */
export async function aiChat(payload: unknown, deps: AiIpcDeps = {}): Promise<AiChatResult> {
    let request: AiChatRequest
    try {
        request = normalizeAiChatRequest(payload)
    } catch (error) {
        return toAiFailure(error, 'AI_INVALID_PAYLOAD')
    }
    try {
        const runtime = await resolveRuntime(deps)
        const { provider, model } = await loadConfiguredAiProviderWith(runtime, {
            fetchImpl: deps.fetchImpl,
            modelId: request.modelId
        })
        if (request.messages.length === 0) {
            const startedAt = Date.now()
            const result = await provider.testConnection()
            logger.info(
                `[AI] 连接测试成功：provider=${model.provider}/${model.localProvider} ` +
                    `model=${result.model} ` +
                    `模型校验=${result.modelChecked === false ? '未校验（服务未实现模型列表接口）' : '通过'} ` +
                    `耗时=${Date.now() - startedAt}ms`
            )
            return {
                ok: true,
                content: buildConnectionTestContent(result),
                model: result.model
            }
        }
        const contextPrompt = buildChatContextPrompt(request.context)
        const messages = contextPrompt
            ? [{ role: 'system' as const, content: contextPrompt }, ...request.messages]
            : request.messages
        const startedAt = Date.now()
        const result = await provider.chat(messages)
        logger.info(
            `[AI] chat 完成：provider=${model.provider}/${model.localProvider} ` +
                `model=${result.model} messages=${request.messages.length} ` +
                `耗时=${Date.now() - startedAt}ms`
        )
        return { ok: true, content: result.content, model: result.model }
    } catch (error) {
        if (error instanceof AiProviderError) {
            logger.warn(`[AI] chat 失败（${error.code}）：${sanitizeErrorMessage(error.message)}`)
        } else {
            logger.warn('[AI] chat 失败：', error)
        }
        return toAiFailure(error, 'AI_HTTP_ERROR')
    }
}

/**
 * `AI.INGEST` 业务入口：扫描/读取 raw/ → 调 Provider → 生成 wiki 页面草案 + 行级 diff。
 * **不写盘**；失败返回结构化 code（未启用 → AI_NOT_CONFIGURED，无 raw/ → AI_WORKSPACE_UNAVAILABLE）。
 *
 * 模型选择：AI.INGEST 载荷不含 modelId，统一使用配置中的默认模型（defaultModelId）。
 */
export async function aiIngest(payload: unknown, deps: AiIpcDeps = {}): Promise<AiIngestResult> {
    let request
    try {
        request = normalizeAiIngestRequest(payload)
    } catch (error) {
        return toAiFailure(error, 'AI_INVALID_PAYLOAD')
    }
    const rootPath = resolveRootPath(deps)
    if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
        return aiFailure('AI_WORKSPACE_UNAVAILABLE', '尚未打开工作区，无法执行 AI 编译')
    }
    try {
        const runtime = await resolveRuntime(deps)
        return await runAiIngest(request, {
            rootPath,
            providerLoader: () =>
                loadConfiguredAiProviderWith(runtime, { fetchImpl: deps.fetchImpl }),
            now: deps.now
        })
    } catch (error) {
        if (error instanceof AiProviderError) {
            logger.warn(`[AI] ingest 失败（${error.code}）：${sanitizeErrorMessage(error.message)}`)
        } else {
            logger.warn('[AI] ingest 失败：', error)
        }
        return toAiFailure(error, 'AI_HTTP_ERROR')
    }
}

/**
 * `AI.APPLY_INGEST` 业务入口：用户显式审批后写入 wiki/（Path Guard + raw 只读守卫 + 原子写）。
 */
export async function aiApplyIngest(
    payload: unknown,
    deps: AiIpcDeps = {}
): Promise<AiApplyIngestResult> {
    let request
    try {
        request = normalizeAiApplyIngestRequest(payload)
    } catch (error) {
        return toAiFailure(error, 'AI_INVALID_PAYLOAD')
    }
    const rootPath = resolveRootPath(deps)
    if (typeof rootPath !== 'string' || rootPath.trim().length === 0) {
        return aiFailure('AI_WORKSPACE_UNAVAILABLE', '尚未打开工作区，无法写入 wiki 页面')
    }
    try {
        return await runAiApplyIngest(request, { rootPath })
    } catch (error) {
        if (error instanceof AiProviderError) {
            logger.warn(`[AI] apply 失败（${error.code}）：${sanitizeErrorMessage(error.message)}`)
        } else {
            logger.warn('[AI] apply 失败：', error)
        }
        return toAiFailure(error, 'AI_APPLY_FAILED')
    }
}

/** `AI.GET_CONFIG` 业务入口：读取配置快照（失败回退默认值，不返回失败结构） */
export async function getAiConfig(deps: AiIpcDeps = {}): Promise<AiGetConfigResult> {
    try {
        const store = await resolveStore(deps)
        return await store.getSnapshot()
    } catch (error) {
        logger.warn('[AI] 读取 AI 配置失败，按默认值返回：', error)
        return buildDefaultConfigSnapshot()
    }
}

/**
 * `AI.SAVE_CONFIG` 业务入口：保存 AI 非敏感配置 + API Key（safeStorage 加密落盘）。
 *
 * 非法载荷/写入失败返回结构化失败；成功返回最新快照（不含密钥明文）。
 */
export async function saveAiConfig(
    payload: unknown,
    deps: AiIpcDeps = {}
): Promise<AiSaveConfigResult> {
    let request
    try {
        request = normalizeAiSaveConfigRequest(payload)
    } catch (error) {
        return toAiFailure(error, 'AI_INVALID_PAYLOAD')
    }
    try {
        const store = await resolveStore(deps)
        const config = await store.save(request)
        return { ok: true, config }
    } catch (error) {
        if (error instanceof AiProviderError) {
            logger.warn(
                `[AI] 保存 AI 配置失败（${error.code}）：${sanitizeErrorMessage(error.message)}`
            )
        } else {
            logger.warn('[AI] 保存 AI 配置失败：', error)
        }
        return toAiFailure(error, 'AI_CONFIG_STORE_FAILED')
    }
}

/**
 * `AI.QUERY_RUNNING_MODELS` 业务入口（1.5.7「查询当前运行的模型」）。
 *
 * - 载荷：`{ modelId?, confirmExecution? }`；`modelId` 缺省 defaultModelId；
 * - 模型配置了 `statusCommand` → 主进程执行该用户命令（要求 `confirmExecution === true`，
 *   渲染层每次执行前弹确认框）；未配置 → 内置只读查询（Ollama /api/ps、OpenAI 兼容 /models）；
 * - AI 未启用 → 失败 code=AI_NOT_CONFIGURED；模型不存在 → code=AI_MODEL_NOT_FOUND；
 * - 命令/网络失败返回结构化 `{ ok:false, error }`，不向渲染层抛异常、不崩主进程。
 */
export async function aiQueryRunningModels(
    payload: unknown,
    deps: AiIpcDeps = {}
): Promise<AiQueryRunningModelsResult> {
    let request
    try {
        request = normalizeAiQueryRunningModelsRequest(payload)
    } catch (error) {
        const failure = toAiFailure(error, 'AI_INVALID_PAYLOAD')
        return { ok: false, output: '', error: failure.message, code: failure.code }
    }
    try {
        const runtime = await resolveRuntime(deps)
        return await runAiQueryRunningModels(request, {
            store: runtime.store,
            fetchImpl: runtime.fetchImpl,
            execImpl: deps.execImpl
        })
    } catch (error) {
        // 兜底：业务实现内部已捕获可预期失败；这里防御意外异常，仍返回结构化失败
        const failure = toAiFailure(error, 'AI_HTTP_ERROR')
        logger.warn(
            `[AI] 查询运行中模型异常（${failure.code}）：${sanitizeErrorMessage(failure.message)}`
        )
        return { ok: false, output: '', error: failure.message, code: failure.code }
    }
}

/**
 * 注册 AI IPC（6 个 invoke 通道）。
 *
 * @param componentId 监听台账组件 ID（来源 registry 编排；缺省用本域常量）
 */
export function registerAiIpc(componentId: string = AI_IPC_COMPONENT_ID): void {
    ipcListenerManager.registerHandleOnce(
        IPC.AI.CHAT,
        withSenderCheck(
            IPC.AI.CHAT,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => aiChat(payload),
            { kind: 'handle' }
        ),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.AI.INGEST,
        withSenderCheck(
            IPC.AI.INGEST,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => aiIngest(payload),
            { kind: 'handle' }
        ),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.AI.APPLY_INGEST,
        withSenderCheck(
            IPC.AI.APPLY_INGEST,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => aiApplyIngest(payload),
            { kind: 'handle' }
        ),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.AI.GET_CONFIG,
        withSenderCheck(IPC.AI.GET_CONFIG, async () => getAiConfig(), { kind: 'handle' }),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.AI.SAVE_CONFIG,
        withSenderCheck(
            IPC.AI.SAVE_CONFIG,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) => saveAiConfig(payload),
            { kind: 'handle' }
        ),
        componentId
    )
    ipcListenerManager.registerHandleOnce(
        IPC.AI.QUERY_RUNNING_MODELS,
        withSenderCheck(
            IPC.AI.QUERY_RUNNING_MODELS,
            async (_event: Electron.IpcMainInvokeEvent, payload: unknown) =>
                aiQueryRunningModels(payload),
            { kind: 'handle' }
        ),
        componentId
    )
}
