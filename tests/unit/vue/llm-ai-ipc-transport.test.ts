// @vitest-environment jsdom
/**
 * L3↔L5 联调：AI 面板 transport → AI.CHAT 契约（1.5.7 LLM Wiki）。
 * 覆盖：成功内容、AI_NOT_CONFIGURED 提示、其他结构化失败、异常、无 invoke、
 * 历史消息与上下文映射、多模型 modelId 映射/缺省、非法返回结构。
 */
import { describe, expect, it, vi } from 'vitest'
import { t } from '../../../src/renderer/src/common/i18n'
import {
    createLlmAiIpcTransport,
    type LlmAiInvoke
} from '../../../src/renderer/src/components/llm-wiki/llm-ai-ipc-transport'
import type { LlmAiSendPayload } from '../../../src/renderer/src/components/llm-wiki/llm-ai-transport'
import { IPC } from '../../../src/shared/ipc-channels'

function buildPayload(overrides: Partial<LlmAiSendPayload> = {}): LlmAiSendPayload {
    return {
        message: '你好',
        modelId: 'model-remote',
        history: [
            { id: '1', role: 'user', content: '你好' },
            { id: '2', role: 'assistant', content: '你好，有什么可以帮你？' }
        ],
        context: { documentName: 'wiki/示例.md', selectionText: '片段' },
        ...overrides
    }
}

describe('llm-ai-ipc-transport', () => {
    it('成功：调用 AI.CHAT 并返回 content', async () => {
        const invoke = vi.fn<LlmAiInvoke>().mockResolvedValue({ ok: true, content: 'AI 回复' })
        const transport = createLlmAiIpcTransport(invoke)
        await expect(transport(buildPayload())).resolves.toBe('AI 回复')
        expect(invoke).toHaveBeenCalledTimes(1)
        expect(invoke.mock.calls[0][0]).toBe(IPC.AI.CHAT)
    })

    it('请求载荷：历史消息映射为 role/content，上下文转换为 title/selection', async () => {
        const invoke = vi.fn<LlmAiInvoke>().mockResolvedValue({ ok: true, content: 'ok' })
        await createLlmAiIpcTransport(invoke)(buildPayload())
        const request = invoke.mock.calls[0][1] as {
            messages: { role: string; content: string }[]
            context?: { title?: string; selection?: string }
        }
        expect(request.messages).toEqual([
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '你好，有什么可以帮你？' }
        ])
        expect(request.context).toEqual({ title: 'wiki/示例.md', selection: '片段' })
    })

    it('多模型：payload.modelId 映射为 AiChatRequest.modelId', async () => {
        const invoke = vi.fn<LlmAiInvoke>().mockResolvedValue({ ok: true, content: 'ok' })
        await createLlmAiIpcTransport(invoke)(buildPayload({ modelId: 'model-local' }))
        const request = invoke.mock.calls[0][1] as { modelId?: string }
        expect(request.modelId).toBe('model-local')
    })

    it('缺省 modelId（配置读取失败降级）：请求不带 modelId 字段，由主进程用 defaultModelId', async () => {
        const invoke = vi.fn<LlmAiInvoke>().mockResolvedValue({ ok: true, content: 'ok' })
        const payload = buildPayload()
        delete payload.modelId
        await createLlmAiIpcTransport(invoke)(payload)
        const request = invoke.mock.calls[0][1] as { modelId?: string }
        expect('modelId' in request).toBe(false)
    })

    it('空串 / 纯空白 modelId 视为缺省（不发送空 modelId）', async () => {
        const invoke = vi.fn<LlmAiInvoke>().mockResolvedValue({ ok: true, content: 'ok' })
        await createLlmAiIpcTransport(invoke)(buildPayload({ modelId: '   ' }))
        const request = invoke.mock.calls[0][1] as { modelId?: string }
        expect('modelId' in request).toBe(false)
    })

    it('空上下文：title/selection 缺省为 undefined（不发送空串）', async () => {
        const invoke = vi.fn<LlmAiInvoke>().mockResolvedValue({ ok: true, content: 'ok' })
        await createLlmAiIpcTransport(invoke)(
            buildPayload({ context: { documentName: '', selectionText: '' } })
        )
        const request = invoke.mock.calls[0][1] as {
            context?: { title?: string; selection?: string }
        }
        expect(request.context).toEqual({ title: undefined, selection: undefined })
    })

    it('AI_NOT_CONFIGURED：映射为「未启用」提示', async () => {
        const invoke = vi
            .fn<LlmAiInvoke>()
            .mockResolvedValue({ ok: false, code: 'AI_NOT_CONFIGURED', message: 'AI 未启用' })
        await expect(createLlmAiIpcTransport(invoke)(buildPayload())).rejects.toThrow(
            t('editorUi.llmWikiPanel.aiNotConfigured')
        )
    })

    it('其他结构化失败：使用主进程 error message', async () => {
        const invoke = vi
            .fn<LlmAiInvoke>()
            .mockResolvedValue({ ok: false, code: 'AI_PROVIDER_ERROR', message: '模型不可用' })
        await expect(createLlmAiIpcTransport(invoke)(buildPayload())).rejects.toThrow('模型不可用')
    })

    it('结构化失败无 message：回退通用错误提示', async () => {
        const invoke = vi.fn<LlmAiInvoke>().mockResolvedValue({ ok: false, code: 'AI_UNKNOWN' })
        await expect(createLlmAiIpcTransport(invoke)(buildPayload())).rejects.toThrow(
            t('editorUi.llmWikiPanel.aiError')
        )
    })

    it('invoke 抛异常：透传错误信息', async () => {
        const invoke = vi.fn<LlmAiInvoke>().mockRejectedValue(new Error('网络不可达'))
        await expect(createLlmAiIpcTransport(invoke)(buildPayload())).rejects.toThrow('网络不可达')
    })

    it('非法返回结构：回退通用错误提示', async () => {
        const invoke = vi.fn<LlmAiInvoke>().mockResolvedValue({ content: '缺少 ok 字段' })
        await expect(createLlmAiIpcTransport(invoke)(buildPayload())).rejects.toThrow(
            t('editorUi.llmWikiPanel.aiError')
        )
    })

    it('空内容：回退通用错误提示', async () => {
        const invoke = vi.fn<LlmAiInvoke>().mockResolvedValue({ ok: true, content: '   ' })
        await expect(createLlmAiIpcTransport(invoke)(buildPayload())).rejects.toThrow(
            t('editorUi.llmWikiPanel.aiError')
        )
    })

    it('无可用 invoke（window.electron 缺失）：抛出环境不可用提示', async () => {
        const transport = createLlmAiIpcTransport()
        await expect(transport(buildPayload())).rejects.toThrow(
            t('editorUi.llmWikiPanel.aiUnavailable')
        )
    })
})
