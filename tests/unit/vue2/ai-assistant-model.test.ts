/**
 * AI 助手设置页签纯函数单测（`system-setting/ai-assistant-model.ts`）
 *
 * 覆盖：表单草稿（添加/编辑）、输入校验（必填/远程基址/首次添加密钥）、模型 id 生成、
 * 主进程快照运行时归一化（结构非法返回 null / 默认模型悬空回落 / 非法模型条目丢弃）、
 * 保存载荷模型列表（剔除仅快照字段 apiKeyConfigured）。
 */
import { describe, expect, it } from 'vitest'

import {
    createAddModelFormDraft,
    createAiModelId,
    createEditModelFormDraft,
    normalizeAiConfigSnapshot,
    normalizeAiModelConfig,
    toAiModelsPayload,
    validateAiModelForm,
    type AiModelFormDraft
} from '@renderer/components/dialogs/complex/system-setting/ai-assistant-model'
import type { AiModelConfig } from '../../../src/shared/types/ai'

/** 构造表单草稿（默认本地 Ollama + 名称/模型名齐全） */
function draft(overrides: Partial<AiModelFormDraft> = {}): AiModelFormDraft {
    return {
        ...createAddModelFormDraft(),
        name: '本地 Qwen',
        model: 'qwen2.5',
        ...overrides
    }
}

/** 构造合法模型配置（默认本地 Ollama） */
function model(overrides: Partial<AiModelConfig> = {}): AiModelConfig {
    return {
        id: 'model-1',
        name: '本地 Qwen',
        provider: 'local',
        localProvider: 'ollama',
        baseUrl: '',
        model: 'qwen2.5',
        ...overrides
    }
}

describe('createAiModelId', () => {
    it('生成 ai-model- 前缀的唯一 id（符合主进程 id 白名单形态，≤64 字符）', () => {
        const first = createAiModelId()
        const second = createAiModelId()
        expect(first).toMatch(/^ai-model-[A-Za-z0-9_.:-]+$/)
        expect(first.length).toBeLessThanOrEqual(64)
        expect(first).not.toBe(second)
    })
})

describe('表单草稿', () => {
    it('添加模型默认本地 Ollama、空名称/模型名、apiKey 不回显', () => {
        const form = createAddModelFormDraft()
        expect(form.mode).toBe('add')
        expect(form.id).toBe('')
        expect(form.provider).toBe('local')
        expect(form.localProvider).toBe('ollama')
        expect(form.baseUrl).toBe('')
        expect(form.apiKey).toBe('')
        expect(form.apiKeyConfigured).toBe(false)
    })

    it('编辑模型复制既有字段，密钥置空并记录已配置状态', () => {
        const form = createEditModelFormDraft(
            model({
                id: 'model-remote',
                provider: 'remote',
                baseUrl: 'https://api.example.com/v1',
                model: 'deepseek-chat',
                apiKeyConfigured: true
            })
        )
        expect(form.mode).toBe('edit')
        expect(form.id).toBe('model-remote')
        expect(form.provider).toBe('remote')
        expect(form.baseUrl).toBe('https://api.example.com/v1')
        expect(form.apiKey).toBe('')
        expect(form.apiKeyConfigured).toBe(true)
    })
})

describe('validateAiModelForm', () => {
    it('本地模型：名称与模型名必填，通过后不再要求基址/密钥', () => {
        expect(validateAiModelForm(draft({ name: '   ' }))).toBe('name')
        expect(validateAiModelForm(draft({ model: '' }))).toBe('model')
        expect(validateAiModelForm(draft())).toBeNull()
    })

    it('远程模型：基址必填；首次添加（未配置密钥）必须填密钥；编辑已配置可留空', () => {
        expect(validateAiModelForm(draft({ provider: 'remote' }))).toBe('baseUrl')
        expect(
            validateAiModelForm(
                draft({ provider: 'remote', baseUrl: 'https://api.example.com/v1' })
            )
        ).toBe('apiKey')
        expect(
            validateAiModelForm(
                draft({ mode: 'edit', provider: 'remote', baseUrl: 'https://api.example.com/v1' })
            )
        ).toBe('apiKey')
        expect(
            validateAiModelForm(
                draft({
                    mode: 'edit',
                    provider: 'remote',
                    baseUrl: 'https://api.example.com/v1',
                    apiKeyConfigured: true
                })
            )
        ).toBeNull()
        expect(
            validateAiModelForm(
                draft({
                    provider: 'remote',
                    baseUrl: 'https://api.example.com/v1',
                    apiKey: 'sk-test'
                })
            )
        ).toBeNull()
    })
})

describe('normalizeAiModelConfig', () => {
    it('合法结构归一化；缺 id/非法 provider/本地 Provider 返回 null', () => {
        // 归一化后始终带布尔 apiKeyConfigured（缺省 false），供列表展示密钥标记
        expect(normalizeAiModelConfig(model())).toEqual({ ...model(), apiKeyConfigured: false })
        expect(normalizeAiModelConfig({ ...model(), apiKeyConfigured: true })).toMatchObject({
            id: 'model-1',
            apiKeyConfigured: true
        })
        expect(normalizeAiModelConfig(null)).toBeNull()
        expect(normalizeAiModelConfig({ ...model(), id: '' })).toBeNull()
        expect(normalizeAiModelConfig({ ...model(), provider: 'cloud' })).toBeNull()
        expect(normalizeAiModelConfig({ ...model(), localProvider: 'vllm' })).toBeNull()
    })
})

describe('normalizeAiConfigSnapshot', () => {
    it('合法快照归一化；默认模型悬空回落 null、非法模型条目被丢弃', () => {
        const snapshot = normalizeAiConfigSnapshot({
            enabled: true,
            models: [model(), model({ id: 'model-2' }), { id: 'broken' }],
            defaultModelId: 'model-missing',
            apiKeyStorage: 'safe'
        })
        expect(snapshot).not.toBeNull()
        expect(snapshot?.models.map((item) => item.id)).toEqual(['model-1', 'model-2'])
        expect(snapshot?.defaultModelId).toBeNull()

        expect(
            normalizeAiConfigSnapshot({
                enabled: false,
                models: [],
                defaultModelId: 'model-1',
                apiKeyStorage: 'safe'
            })?.defaultModelId
        ).toBeNull()
        expect(
            normalizeAiConfigSnapshot({
                enabled: false,
                models: [model()],
                defaultModelId: 'model-1',
                apiKeyStorage: 'memory'
            })?.defaultModelId
        ).toBe('model-1')
    })

    it('结构非法/旧单模型结构返回 null（组件展示读取失败提示，不渲染脏数据）', () => {
        expect(normalizeAiConfigSnapshot(null)).toBeNull()
        expect(
            normalizeAiConfigSnapshot({ enabled: 'yes', models: [], apiKeyStorage: 'safe' })
        ).toBeNull()
        expect(
            normalizeAiConfigSnapshot({ enabled: true, models: [], apiKeyStorage: 'disk' })
        ).toBeNull()
        // 旧版单模型结构（无 models 数组）
        expect(
            normalizeAiConfigSnapshot({
                enabled: true,
                provider: 'local',
                localProvider: 'ollama',
                baseUrl: '',
                model: 'qwen2.5',
                apiKeyConfigured: false,
                apiKeyStorage: 'safe'
            })
        ).toBeNull()
    })
})

describe('toAiModelsPayload', () => {
    it('剔除仅快照字段 apiKeyConfigured，保留 6 个保存字段', () => {
        const payload = toAiModelsPayload([
            model({ apiKeyConfigured: true }),
            model({ id: 'model-remote', provider: 'remote', baseUrl: 'https://x/v1' })
        ])
        expect(payload).toEqual([
            {
                id: 'model-1',
                name: '本地 Qwen',
                provider: 'local',
                localProvider: 'ollama',
                baseUrl: '',
                model: 'qwen2.5'
            },
            {
                id: 'model-remote',
                name: '本地 Qwen',
                provider: 'remote',
                localProvider: 'ollama',
                baseUrl: 'https://x/v1',
                model: 'qwen2.5'
            }
        ])
        expect(Object.keys(payload[0])).not.toContain('apiKeyConfigured')
    })
})
