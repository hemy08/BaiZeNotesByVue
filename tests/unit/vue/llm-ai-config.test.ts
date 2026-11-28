// @vitest-environment jsdom
/**
 * 1.5.7 体验升级批次 A：AI 面板模型配置读取（`llm-ai-config.ts`）。
 *
 * 覆盖：
 * 1. `AI.GET_CONFIG` 返回值归一化：模型顺序、id 去重、name 缺省回落 id、
 *    defaultModelId 缺失/不在列表时回落到首个模型、非数组 models 视为空列表；
 * 2. 读取：调用 `AI.GET_CONFIG`；invoke 缺失/抛错/结构非法 → `{ status: 'error' }`；
 * 3. 注入 invoke（测试/联调）优先于默认 preload 桥。
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    normalizeLlmAiConfigSnapshot,
    readLlmAiModelCatalog,
    type LlmAiConfigInvoke
} from '../../../src/renderer/src/components/llm-wiki/llm-ai-config'
import { IPC } from '../../../src/shared/ipc-channels'

/** 最小合法模型项（其余字段由主进程契约提供，归一化只消费 id/name） */
function model(id: string, name: string): Record<string, unknown> {
    return {
        id,
        name,
        provider: 'local',
        localProvider: 'ollama',
        baseUrl: '',
        model: name
    }
}

afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
})

describe('normalizeLlmAiConfigSnapshot', () => {
    it('保留 models 顺序；enabled 只在 true 时为 true；默认模型取 defaultModelId', () => {
        const catalog = normalizeLlmAiConfigSnapshot({
            enabled: true,
            models: [model('b', '模型B'), model('a', '模型A')],
            defaultModelId: 'a',
            apiKeyStorage: 'safe'
        })
        expect(catalog).toEqual({
            enabled: true,
            models: [
                { id: 'b', name: '模型B' },
                { id: 'a', name: '模型A' }
            ],
            defaultModelId: 'a'
        })
    })

    it('非法模型项被过滤、重复 id 去重、name 为空时回落 id', () => {
        const catalog = normalizeLlmAiConfigSnapshot({
            enabled: true,
            models: [
                model('a', '模型A'),
                { id: 'a', name: '重复A' },
                { id: '', name: '空 id' },
                { name: '无 id' },
                { id: 'b', name: '   ' },
                null,
                'not-an-object',
                model('c', '模型C')
            ],
            defaultModelId: 'a'
        })
        expect(catalog?.models).toEqual([
            { id: 'a', name: '模型A' },
            { id: 'b', name: 'b' },
            { id: 'c', name: '模型C' }
        ])
    })

    it('defaultModelId 缺失或不在列表内时回落到首个模型；无模型时为 null', () => {
        expect(
            normalizeLlmAiConfigSnapshot({
                enabled: true,
                models: [model('a', '模型A'), model('b', '模型B')],
                defaultModelId: 'missing'
            })?.defaultModelId
        ).toBe('a')

        expect(
            normalizeLlmAiConfigSnapshot({
                enabled: true,
                models: [model('a', '模型A')]
            })?.defaultModelId
        ).toBe('a')

        expect(
            normalizeLlmAiConfigSnapshot({
                enabled: true,
                models: [],
                defaultModelId: null
            })?.defaultModelId
        ).toBeNull()
    })

    it('缺字段 / 旧契约（无 models）：enabled 回落 false、models 为空数组', () => {
        expect(normalizeLlmAiConfigSnapshot({})).toEqual({
            enabled: false,
            models: [],
            defaultModelId: null
        })
        // 1.5.7 多模型契约升级前的旧快照（含 provider/model 字段但没有 models）
        expect(
            normalizeLlmAiConfigSnapshot({
                enabled: true,
                provider: 'local',
                localProvider: 'ollama',
                baseUrl: '',
                model: 'qwen2.5'
            })
        ).toEqual({ enabled: true, models: [], defaultModelId: null })
    })

    it('非对象返回值视为结构非法（返回 null）', () => {
        expect(normalizeLlmAiConfigSnapshot(null)).toBeNull()
        expect(normalizeLlmAiConfigSnapshot(undefined)).toBeNull()
        expect(normalizeLlmAiConfigSnapshot('ok')).toBeNull()
        expect(normalizeLlmAiConfigSnapshot(42)).toBeNull()
    })
})

describe('readLlmAiModelCatalog', () => {
    it('成功：调用 IPC.AI.GET_CONFIG 并返回归一化目录', async () => {
        const invoke = vi.fn<LlmAiConfigInvoke>().mockResolvedValue({
            enabled: true,
            models: [model('a', '模型A')],
            defaultModelId: 'a'
        })
        const result = await readLlmAiModelCatalog(invoke)

        expect(invoke).toHaveBeenCalledWith(IPC.AI.GET_CONFIG)
        expect(result).toEqual({
            status: 'ready',
            catalog: {
                enabled: true,
                models: [{ id: 'a', name: '模型A' }],
                defaultModelId: 'a'
            }
        })
    })

    it('invoke 抛错：降级为 error（面板可回落默认模型继续发送）', async () => {
        const invoke = vi.fn<LlmAiConfigInvoke>().mockRejectedValue(new Error('ipc down'))
        await expect(readLlmAiModelCatalog(invoke)).resolves.toEqual({ status: 'error' })
    })

    it('返回结构非法：降级为 error', async () => {
        const invoke = vi.fn<LlmAiConfigInvoke>().mockResolvedValue('not-a-snapshot')
        await expect(readLlmAiModelCatalog(invoke)).resolves.toEqual({ status: 'error' })
    })

    it('默认桥缺失（window.electron 不存在）：降级为 error，不抛错', async () => {
        vi.stubGlobal('electron', undefined)
        await expect(readLlmAiModelCatalog()).resolves.toEqual({ status: 'error' })
    })

    it('默认桥可用（window.electron.ipcRenderer.invoke）：使用 preload 受限 invoke', async () => {
        const invoke = vi.fn().mockResolvedValue({
            enabled: true,
            models: [model('a', '模型A')],
            defaultModelId: 'a'
        })
        vi.stubGlobal('electron', { ipcRenderer: { invoke } })
        const result = await readLlmAiModelCatalog()

        expect(invoke).toHaveBeenCalledWith(IPC.AI.GET_CONFIG)
        expect(result.status).toBe('ready')
    })
})
