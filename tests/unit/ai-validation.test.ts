/**
 * 1.5.7 新功能：AI 配置校验（`src/main/ai/validation.ts`）——运行状态查询相关单测
 *
 * 覆盖：
 * 1. `AI.SAVE_CONFIG` 模型列表的 `statusCommand` 校验：trim / 空串丢弃 / 长度上限 /
 *    非法类型 / 换行控制字符拒绝（该命令会经 shell 执行，必须单行）；
 * 2. `AI.QUERY_RUNNING_MODELS` 载荷校验：
 *    - 缺省 / null → `{}`（默认模型、未确认）；
 *    - modelId 可选且必须合法；confirmExecution 可选布尔；
 *    - 非对象 / 非法 modelId / 非布尔确认标记 → AI_INVALID_PAYLOAD；
 * 3. `AI.QUERY_RUNNING_MODELS` 载荷中的未知字段被忽略（只保留出现字段）。
 */
import { describe, it, expect } from 'vitest'

import {
    normalizeAiQueryRunningModelsRequest,
    normalizeAiSaveConfigRequest
} from '../../src/main/ai/validation'
import { AiProviderError } from '../../src/main/ai/errors'
import { AI_STATUS_COMMAND_MAX_CHARS } from '../../src/shared/constants/ai'
import type { AiModelConfig } from '../../src/shared/types/ai'

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

/** 断言抛 AI_INVALID_PAYLOAD */
function expectInvalid(action: () => unknown): void {
    try {
        action()
    } catch (error) {
        expect(error).toBeInstanceOf(AiProviderError)
        expect((error as AiProviderError).code).toBe('AI_INVALID_PAYLOAD')
        return
    }
    throw new Error('期望抛出 AI_INVALID_PAYLOAD，但调用成功')
}

describe('AI.SAVE_CONFIG：statusCommand 校验', () => {
    it('缺省时模型配置不含 statusCommand 字段（undefined 保持）', () => {
        const patch = normalizeAiSaveConfigRequest({ models: [makeModel()] })
        expect(patch.models?.[0]).not.toHaveProperty('statusCommand')
    })

    it('trim 后保留单行命令；空串/纯空白视为未配置（不产生字段）', () => {
        const patch = normalizeAiSaveConfigRequest({
            models: [
                makeModel({ id: 'model-a', statusCommand: '  ollama ps  ' }),
                makeModel({ id: 'model-b', statusCommand: '   ' }),
                makeModel({ id: 'model-c', statusCommand: '' })
            ]
        })
        expect(patch.models?.[0].statusCommand).toBe('ollama ps')
        expect(patch.models?.[1]).not.toHaveProperty('statusCommand')
        expect(patch.models?.[2]).not.toHaveProperty('statusCommand')
    })

    it('非字符串 statusCommand → AI_INVALID_PAYLOAD', () => {
        expectInvalid(() =>
            normalizeAiSaveConfigRequest({
                models: [makeModel({ statusCommand: 42 as unknown as string })]
            })
        )
    })

    it('超过长度上限 → AI_INVALID_PAYLOAD', () => {
        expectInvalid(() =>
            normalizeAiSaveConfigRequest({
                models: [makeModel({ statusCommand: 'x'.repeat(AI_STATUS_COMMAND_MAX_CHARS + 1) })]
            })
        )
    })

    it('包含换行/控制字符 → AI_INVALID_PAYLOAD（命令必须单行）', () => {
        expectInvalid(() =>
            normalizeAiSaveConfigRequest({
                models: [makeModel({ statusCommand: 'ollama ps\nrm -rf /' })]
            })
        )
        expectInvalid(() =>
            normalizeAiSaveConfigRequest({
                models: [makeModel({ statusCommand: 'ollama\tps' })]
            })
        )
    })

    it('长度恰为上界的命令允许保存', () => {
        const command = 'x'.repeat(AI_STATUS_COMMAND_MAX_CHARS)
        const patch = normalizeAiSaveConfigRequest({
            models: [makeModel({ statusCommand: command })]
        })
        expect(patch.models?.[0].statusCommand).toBe(command)
    })
})

describe('AI.QUERY_RUNNING_MODELS：载荷校验', () => {
    it('缺省 / null 载荷 → 空对象（默认模型、未确认）', () => {
        expect(normalizeAiQueryRunningModelsRequest(undefined)).toEqual({})
        expect(normalizeAiQueryRunningModelsRequest(null)).toEqual({})
        expect(normalizeAiQueryRunningModelsRequest({})).toEqual({})
    })

    it('合法载荷：modelId + confirmExecution=true 原样保留', () => {
        expect(
            normalizeAiQueryRunningModelsRequest({
                modelId: 'model-a',
                confirmExecution: true,
                ignoredField: 'x'
            })
        ).toEqual({ modelId: 'model-a', confirmExecution: true })
    })

    it('confirmExecution 缺省/false → 不产生字段（未确认）', () => {
        expect(normalizeAiQueryRunningModelsRequest({ confirmExecution: false })).toEqual({})
        expect(normalizeAiQueryRunningModelsRequest({ modelId: 'model-a' })).toEqual({
            modelId: 'model-a'
        })
    })

    it('非对象载荷 → AI_INVALID_PAYLOAD', () => {
        for (const payload of [1, 'x', [], true]) {
            expectInvalid(() => normalizeAiQueryRunningModelsRequest(payload))
        }
    })

    it('非法 modelId / 非布尔 confirmExecution → AI_INVALID_PAYLOAD', () => {
        expectInvalid(() => normalizeAiQueryRunningModelsRequest({ modelId: '含 空格' }))
        expectInvalid(() =>
            normalizeAiQueryRunningModelsRequest({ confirmExecution: 'yes' as unknown as boolean })
        )
    })
})
