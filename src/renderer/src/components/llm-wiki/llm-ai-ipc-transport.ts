/**
 * L5 AI 面板 ↔ L3 AI Provider 联调 transport（1.5.7 LLM Wiki）。
 *
 * 把 `LlmAiSendPayload` 转为稳定的 `AI.CHAT` 契约（`src/shared/types/ai.ts`）：
 * - `history`（含刚追加的用户消息）→ `AiChatMessage[]`；
 * - 上下文（文档名/选中文本）→ `AiChatContext { title?, selection? }`；
 * - 多模型选择：`payload.modelId`（AI.GET_CONFIG 返回的真实模型 id）→ `AiChatRequest.modelId`；
 *   缺省时不传该字段（主进程使用配置中的 `defaultModelId`）；
 * - 返回成功 `content`；`AI_NOT_CONFIGURED` 等结构化失败 → 可读中文错误（经 t() 动态解析）。
 *
 * 默认调用 `window.electron.ipcRenderer.invoke`（受限 ipcRenderer + 主进程白名单）；
 * 测试可注入 `invokeOverride` 或直接注入 transport。
 */
import type { AiChatMessage, AiChatRequest } from '../../../../shared/types/ai'
import { IPC } from '../../../../shared/ipc-channels'
import { t } from '../../common/i18n'
import type { LlmAiSendPayload, LlmAiTransport } from './llm-ai-transport'

/** 可注入的 IPC 调用签名（默认取 preload 暴露的受限 invoke） */
export type LlmAiInvoke = (channel: string, ...args: unknown[]) => Promise<unknown>

interface ElectronBridgeLike {
    ipcRenderer?: {
        invoke?: (channel: string, ...args: unknown[]) => Promise<unknown>
    }
}

function resolveDefaultInvoke(): LlmAiInvoke | null {
    const bridge = (window as unknown as { electron?: ElectronBridgeLike }).electron
    const invoke = bridge?.ipcRenderer?.invoke
    return typeof invoke === 'function' ? invoke.bind(bridge?.ipcRenderer) : null
}

interface AiFailureShape {
    ok: false
    code?: string
    message?: string
}

function isAiFailureShape(value: unknown): value is AiFailureShape {
    return !!value && typeof value === 'object' && (value as { ok?: unknown }).ok === false
}

function extractChatContent(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null
    const result = value as { ok?: unknown; content?: unknown }
    if (result.ok === true && typeof result.content === 'string' && result.content.trim() !== '') {
        return result.content
    }
    return null
}

/** 创建 AI 面板 transport：payload → AI.CHAT → 回复文本 */
export function createLlmAiIpcTransport(invokeOverride?: LlmAiInvoke): LlmAiTransport {
    return async (payload: LlmAiSendPayload): Promise<string> => {
        const invoke = invokeOverride ?? resolveDefaultInvoke()
        if (!invoke) throw new Error(t('editorUi.llmWikiPanel.aiUnavailable'))

        const messages: AiChatMessage[] = payload.history.map((message) => ({
            role: message.role,
            content: message.content
        }))
        const request: AiChatRequest = {
            messages,
            context: {
                title: payload.context.documentName || undefined,
                selection: payload.context.selectionText || undefined
            }
        }
        // 多模型：仅在选择器给出真实模型 id 时下发；缺省（配置读取失败降级）交给主进程
        // 使用 defaultModelId，不在渲染层猜测模型。
        const modelId = typeof payload.modelId === 'string' ? payload.modelId.trim() : ''
        if (modelId.length > 0) {
            request.modelId = modelId
        }

        let result: unknown
        try {
            result = await invoke(IPC.AI.CHAT, request)
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error)
            throw new Error(message || t('editorUi.llmWikiPanel.aiError'), { cause: error })
        }

        const content = extractChatContent(result)
        if (content !== null) return content

        if (isAiFailureShape(result)) {
            if (result.code === 'AI_NOT_CONFIGURED') {
                throw new Error(t('editorUi.llmWikiPanel.aiNotConfigured'))
            }
            throw new Error(result.message || t('editorUi.llmWikiPanel.aiError'))
        }

        throw new Error(t('editorUi.llmWikiPanel.aiError'))
    }
}
