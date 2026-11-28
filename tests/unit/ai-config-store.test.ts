/**
 * 1.5.7 LLM Wiki L3 / 体验升级批次 C：AI 配置与 API Key 安全存储单测
 * （`src/main/ai/config-store.ts`，多模型结构）
 *
 * 覆盖：
 * 1. 默认值：文件缺失时返回「关闭 + 空模型列表」，不创建文件；
 * 2. 保存：多模型列表 / 默认模型 / enabled 落盘（版本/结构正确），未启用时仍允许保存；
 * 3. 每模型密钥：safeStorage 可用时按模型 id 分别加密落盘（**文件内不出现明文**），
 *    运行时按模型 id 解密；清除单模型密钥 / 删除模型时密钥同步清理；
 * 4. 内存退化：safeStorage 不可用时密钥**绝不落盘**，仅会话内存可用，快照 storage=memory；
 * 5. 旧配置迁移：版本 1 单模型结构 → 多模型结构（稳定 id + 默认模型 + 密钥迁移），
 *    迁移只发生一次并写回新版本（幂等）；
 * 6. 健壮性：损坏 JSON 改名备份为 `.corrupt-<ts>` 并按默认值重建；未知版本忽略密钥。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import { createAiConfigStore, type AiSafeStorageLike } from '../../src/main/ai/config-store'
import {
    AI_CONFIG_VERSION,
    AI_LEGACY_MODEL_ID,
    AI_LEGACY_MODEL_NAME
} from '../../src/shared/constants/ai'
import type { AiModelConfig } from '../../src/shared/types/ai'

/** safeStorage 替身：可用时用 `enc:` 前缀模拟系统加密（便于断言「密文不含明文」） */
function makeSafeStorage(available = true): AiSafeStorageLike & {
    encryptString: ReturnType<typeof vi.fn>
} {
    return {
        isEncryptionAvailable: () => available,
        encryptString: vi.fn((plainText: string) => Buffer.from(`enc:${plainText}`, 'utf-8')),
        decryptString: (encrypted: Buffer) => {
            const text = encrypted.toString('utf-8')
            if (!text.startsWith('enc:')) {
                throw new Error('bad cipher')
            }
            return text.slice(4)
        }
    }
}

/** 构造模型配置（默认远程模型，便于测试密钥） */
function makeModel(overrides: Partial<AiModelConfig> = {}): AiModelConfig {
    return {
        id: 'model-a',
        name: '模型 A',
        provider: 'remote',
        localProvider: 'ollama',
        baseUrl: 'https://api.example.com/v1',
        model: 'deepseek-chat',
        ...overrides
    }
}

let tempDir = ''
let configPath = ''

beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'baize-ai-config-'))
    configPath = path.join(tempDir, 'ai-config.json')
})

afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true })
})

/** 读取落盘文件（不存在返回 null） */
async function readConfigFileRaw(): Promise<string | null> {
    try {
        return await fs.readFile(configPath, 'utf-8')
    } catch {
        return null
    }
}

/** 读取落盘 JSON（不存在返回 null） */
async function readConfigFileJson(): Promise<Record<string, unknown> | null> {
    const raw = await readConfigFileRaw()
    return raw === null ? null : (JSON.parse(raw) as Record<string, unknown>)
}

describe('AI 配置存储：默认值与保存', () => {
    it('文件缺失时返回「关闭 + 空模型列表」默认值，且不创建文件', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.getSnapshot()
        expect(snapshot).toEqual({
            enabled: false,
            models: [],
            defaultModelId: null,
            apiKeyStorage: 'safe'
        })
        expect(await readConfigFileRaw()).toBeNull()
    })

    it('保存多模型配置：写入独立 ai-config.json（版本 + 模型列表 + 默认模型）', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.save({
            enabled: true,
            models: [
                makeModel({ id: 'local', name: '本地 Qwen', provider: 'local', baseUrl: '' }),
                makeModel({ id: 'remote', name: 'DeepSeek' })
            ],
            defaultModelId: 'remote'
        })
        expect(snapshot.enabled).toBe(true)
        expect(snapshot.models.map((model) => model.id)).toEqual(['local', 'remote'])
        expect(snapshot.defaultModelId).toBe('remote')
        expect(snapshot.models.every((model) => model.apiKeyConfigured === false)).toBe(true)

        const parsed = (await readConfigFileJson()) as {
            version: number
            config: Record<string, unknown>
            apiKeys: { version: number; keys: Record<string, string> }
        }
        expect(parsed.version).toBe(AI_CONFIG_VERSION)
        expect(parsed.config).toMatchObject({
            enabled: true,
            defaultModelId: 'remote'
        })
        expect(parsed.apiKeys).toEqual({ version: 1, keys: {} })
    })

    it('未启用时仍允许保存配置（先配置后启用）', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.save({
            enabled: false,
            models: [makeModel()],
            defaultModelId: 'model-a'
        })
        expect(snapshot.enabled).toBe(false)
        expect(snapshot.models).toHaveLength(1)
        expect(snapshot.defaultModelId).toBe('model-a')
    })

    it('默认模型指向不存在模型 → 回落首个模型；null → 清空', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        await store.save({ models: [makeModel({ id: 'aa' }), makeModel({ id: 'bb' })] })
        const fallback = await store.save({ defaultModelId: 'not-exist' })
        expect(fallback.defaultModelId).toBe('aa')
        const cleared = await store.save({ defaultModelId: null })
        expect(cleared.defaultModelId).toBeNull()
    })

    it('模型列表全量替换：被删除的模型从快照消失', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        await store.save({ models: [makeModel({ id: 'aa' }), makeModel({ id: 'bb' })] })
        const replaced = await store.save({ models: [makeModel({ id: 'bb' })] })
        expect(replaced.models.map((model) => model.id)).toEqual(['bb'])
    })

    it('非法密钥操作（模型不在列表内）→ AI_INVALID_PAYLOAD', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        await expect(
            store.save({ models: [makeModel()], modelApiKey: { modelId: 'ghost', apiKey: 'sk-x' } })
        ).rejects.toMatchObject({ code: 'AI_INVALID_PAYLOAD' })
    })
})

describe('AI 配置存储：每模型 API Key 安全（safeStorage 可用）', () => {
    it('多个模型密钥分别加密落盘，文件内不出现明文；运行时按模型 id 解密', async () => {
        const safeStorage = makeSafeStorage()
        const store = createAiConfigStore({ filePath: configPath, safeStorage })
        const keyA = 'sk-model-a-secret-111111'
        const keyB = 'sk-model-b-secret-222222'
        const snapshot = await store.save({
            enabled: true,
            models: [
                makeModel({ id: 'model-a' }),
                makeModel({ id: 'model-b', baseUrl: 'https://b.example.com/v1' })
            ],
            defaultModelId: 'model-a',
            modelApiKey: { modelId: 'model-a', apiKey: keyA }
        })
        expect(snapshot.models.find((model) => model.id === 'model-a')?.apiKeyConfigured).toBe(true)
        expect(snapshot.models.find((model) => model.id === 'model-b')?.apiKeyConfigured).toBe(
            false
        )

        const afterB = await store.save({ modelApiKey: { modelId: 'model-b', apiKey: keyB } })
        expect(afterB.models.every((model) => model.apiKeyConfigured === true)).toBe(true)
        expect(afterB.apiKeyStorage).toBe('safe')

        const raw = (await readConfigFileRaw()) as string
        expect(raw).not.toContain(keyA)
        expect(raw).not.toContain(keyB)
        const parsed = JSON.parse(raw) as {
            apiKeys: { version: number; keys: Record<string, string> }
        }
        expect(parsed.apiKeys.version).toBe(1)
        expect(Object.keys(parsed.apiKeys.keys).sort()).toEqual(['model-a', 'model-b'])
        expect(typeof parsed.apiKeys.keys['model-a']).toBe('string')
        expect(safeStorage.encryptString).toHaveBeenCalledWith(keyA)

        expect(await store.getRuntimeApiKey('model-a')).toBe(keyA)
        expect(await store.getRuntimeApiKey('model-b')).toBe(keyB)
        expect(await store.getRuntimeApiKey('ghost')).toBeNull()
    })

    it('清除单模型密钥：只清除指定模型，其余模型密钥保留', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        await store.save({
            models: [makeModel({ id: 'aa' }), makeModel({ id: 'bb' })],
            modelApiKey: { modelId: 'aa', apiKey: 'sk-aa' }
        })
        await store.save({ modelApiKey: { modelId: 'bb', apiKey: 'sk-bb' } })
        const snapshot = await store.save({ modelApiKey: { modelId: 'aa', clearApiKey: true } })
        expect(snapshot.models.find((model) => model.id === 'aa')?.apiKeyConfigured).toBe(false)
        expect(snapshot.models.find((model) => model.id === 'bb')?.apiKeyConfigured).toBe(true)
        expect(await store.getRuntimeApiKey('aa')).toBeNull()
        expect(await store.getRuntimeApiKey('bb')).toBe('sk-bb')
    })

    it('删除模型时其密钥同步清理（落盘结构不残留）', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        await store.save({
            models: [makeModel({ id: 'aa' }), makeModel({ id: 'bb' })],
            modelApiKey: { modelId: 'aa', apiKey: 'sk-aa' }
        })
        await store.save({ models: [makeModel({ id: 'bb' })] })
        const parsed = (await readConfigFileJson()) as { apiKeys: { keys: Record<string, string> } }
        expect(parsed.apiKeys.keys).toEqual({})
        expect(await store.getRuntimeApiKey('aa')).toBeNull()
    })

    it('解密失败时按未配置密钥处理（不崩溃、不清空文件）', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        await store.save({
            models: [makeModel({ id: 'aa' })],
            modelApiKey: { modelId: 'aa', apiKey: 'sk-abc' }
        })
        // 模拟系统凭据变化：把密文改为非法内容（保持合法 base64 但无法解密）
        const parsed = (await readConfigFileJson()) as {
            apiKeys: { keys: Record<string, string> }
        }
        parsed.apiKeys.keys['aa'] = Buffer.from('garbage', 'utf-8').toString('base64')
        await fs.writeFile(configPath, JSON.stringify(parsed), 'utf-8')
        const reloaded = createAiConfigStore({
            filePath: configPath,
            safeStorage: makeSafeStorage()
        })
        expect(await reloaded.getRuntimeApiKey('aa')).toBeNull()
        // 快照不显示「已配置」——避免设置页误导用户（实际请求会因缺密钥失败）
        const snapshot = await reloaded.getSnapshot()
        expect(snapshot.models[0].apiKeyConfigured).toBe(false)
    })
})

describe('AI 配置存储：safeStorage 不可用时的内存退化', () => {
    it('密钥仅保存在内存（不落盘），快照 storage=memory', async () => {
        const store = createAiConfigStore({
            filePath: configPath,
            safeStorage: makeSafeStorage(false)
        })
        const plainKey = 'sk-memory-only-key'
        const snapshot = await store.save({
            enabled: true,
            models: [makeModel({ id: 'aa' })],
            modelApiKey: { modelId: 'aa', apiKey: plainKey }
        })
        expect(snapshot.models[0].apiKeyConfigured).toBe(true)
        expect(snapshot.apiKeyStorage).toBe('memory')
        expect(await store.getRuntimeApiKey('aa')).toBe(plainKey)

        const raw = (await readConfigFileRaw()) as string
        expect(raw).not.toContain(plainKey)
        const parsed = JSON.parse(raw) as { apiKeys: { keys: Record<string, string> } }
        expect(parsed.apiKeys.keys).toEqual({})
    })

    it('safeStorage 为 null 时不崩溃（按不可用处理）', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: null })
        const snapshot = await store.save({
            models: [makeModel({ id: 'aa' })],
            modelApiKey: { modelId: 'aa', apiKey: 'sk-null-safe-storage' }
        })
        expect(snapshot.apiKeyStorage).toBe('memory')
        expect(snapshot.models[0].apiKeyConfigured).toBe(true)
        expect(await store.getRuntimeApiKey('aa')).toBe('sk-null-safe-storage')
    })

    it('safeStorage 加密抛错时退化为仅会话内存（绝不把明文写盘）', async () => {
        const safeStorage = makeSafeStorage()
        safeStorage.encryptString.mockImplementation(() => {
            throw new Error('DPAPI unavailable')
        })
        const store = createAiConfigStore({ filePath: configPath, safeStorage })
        const snapshot = await store.save({
            models: [makeModel({ id: 'aa' })],
            modelApiKey: { modelId: 'aa', apiKey: 'sk-encrypt-failed' }
        })
        // 加密失败：本次会话内存可用，但文件里不落任何密钥（含明文）
        expect(snapshot.models[0].apiKeyConfigured).toBe(true)
        expect(await store.getRuntimeApiKey('aa')).toBe('sk-encrypt-failed')
        const raw = (await readConfigFileRaw()) as string
        expect(raw).not.toContain('sk-encrypt-failed')
        const parsed = JSON.parse(raw) as { apiKeys: { keys: Record<string, string> } }
        expect(parsed.apiKeys.keys).toEqual({})
    })
})

describe('AI 配置存储：旧单模型配置迁移', () => {
    /** 写入版本 1 旧结构文件（单模型 + 单密钥） */
    async function writeLegacyFile(
        config: Record<string, unknown>,
        cipher?: string
    ): Promise<void> {
        await fs.writeFile(
            configPath,
            JSON.stringify({
                version: 1,
                config,
                apiKey: cipher ? { encrypted: true, cipher } : null
            }),
            'utf-8'
        )
    }

    it('v1 单模型配置 → 多模型结构（稳定 id + 默认模型 + 密钥迁移），并写回版本 2', async () => {
        const legacyCipher = Buffer.from('enc:sk-legacy-key', 'utf-8').toString('base64')
        await writeLegacyFile(
            {
                enabled: true,
                provider: 'remote',
                localProvider: 'ollama',
                baseUrl: 'https://api.example.com/v1',
                model: 'deepseek-chat'
            },
            legacyCipher
        )
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.getSnapshot()
        expect(snapshot.enabled).toBe(true)
        expect(snapshot.models).toEqual([
            {
                id: AI_LEGACY_MODEL_ID,
                name: AI_LEGACY_MODEL_NAME,
                provider: 'remote',
                localProvider: 'ollama',
                baseUrl: 'https://api.example.com/v1',
                model: 'deepseek-chat',
                apiKeyConfigured: true
            }
        ])
        expect(snapshot.defaultModelId).toBe(AI_LEGACY_MODEL_ID)
        expect(await store.getRuntimeApiKey(AI_LEGACY_MODEL_ID)).toBe('sk-legacy-key')

        // 迁移只发生一次：文件已重写为当前版本，旧单密钥字段消失
        const parsed = (await readConfigFileJson()) as {
            version: number
            config: { models: unknown[] }
            apiKey?: unknown
            apiKeys: { keys: Record<string, string> }
        }
        expect(parsed.version).toBe(AI_CONFIG_VERSION)
        expect(parsed.config.models).toHaveLength(1)
        expect(parsed.apiKey).toBeUndefined()
        expect(parsed.apiKeys.keys[AI_LEGACY_MODEL_ID]).toBe(legacyCipher)
    })

    it('迁移幂等：重复读取返回相同稳定 id，不重复生成模型', async () => {
        await writeLegacyFile(
            {
                enabled: false,
                provider: 'local',
                localProvider: 'ollama',
                baseUrl: '',
                model: 'qwen2.5'
            },
            undefined
        )
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const first = await store.getSnapshot()
        const second = await store.getSnapshot()
        expect(first.models).toHaveLength(1)
        expect(first.models[0].id).toBe(AI_LEGACY_MODEL_ID)
        expect(second).toEqual(first)
    })

    it('v1 空壳配置（默认本地 + 空模型 + 无密钥）→ 空模型列表（不制造无效模型）', async () => {
        await writeLegacyFile(
            { enabled: true, provider: 'local', localProvider: 'ollama', baseUrl: '', model: '' },
            undefined
        )
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.getSnapshot()
        expect(snapshot.enabled).toBe(true)
        expect(snapshot.models).toEqual([])
        expect(snapshot.defaultModelId).toBeNull()
    })
})

describe('AI 配置存储：损坏与版本兼容', () => {
    it('JSON 损坏时改名备份为 .corrupt-<ts> 并按默认值重建', async () => {
        await fs.writeFile(configPath, '{ not-json', 'utf-8')
        const store = createAiConfigStore({
            filePath: configPath,
            safeStorage: makeSafeStorage(),
            now: () => 1700000000000
        })
        const snapshot = await store.getSnapshot()
        expect(snapshot.enabled).toBe(false)
        expect(snapshot.models).toEqual([])
        expect(snapshot.defaultModelId).toBeNull()
        const backupPath = `${configPath}.corrupt-1700000000000`
        await expect(fs.stat(backupPath)).resolves.toBeDefined()
    })

    it('版本 2 中的脏模型条目：逐项归一化（非法丢弃 / 重复 id 保留首个 / 默认回落首个）', async () => {
        await fs.writeFile(
            configPath,
            JSON.stringify({
                version: AI_CONFIG_VERSION,
                config: {
                    enabled: true,
                    models: [
                        makeModel({ id: 'aa' }),
                        makeModel({ id: 'aa', name: '重复 id 应丢弃' }),
                        { id: '含 空格', name: '非法 id' },
                        { ...makeModel({ id: 'bb' }), provider: 'unknown' }
                    ],
                    defaultModelId: 'not-exist'
                },
                apiKeys: { version: 1, keys: {} }
            }),
            'utf-8'
        )
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.getSnapshot()
        expect(snapshot.models.map((model) => model.id)).toEqual(['aa', 'bb'])
        expect(snapshot.models[0].name).toBe('模型 A')
        // 未知 provider 回落 local（结构容错），且默认模型指向不存在 id → 回落首个
        expect(snapshot.models[1].provider).toBe('local')
        expect(snapshot.defaultModelId).toBe('aa')
    })

    it('未知版本：尽力读取新结构非敏感字段并忽略密钥', async () => {
        await fs.writeFile(
            configPath,
            JSON.stringify({
                version: 99,
                config: {
                    enabled: true,
                    models: [makeModel({ id: 'aa' })],
                    defaultModelId: 'aa'
                },
                apiKeys: { version: 1, keys: { aa: 'AAAA' } }
            }),
            'utf-8'
        )
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.getSnapshot()
        expect(snapshot.enabled).toBe(true)
        expect(snapshot.models.map((model) => model.id)).toEqual(['aa'])
        expect(snapshot.models[0].apiKeyConfigured).toBe(false)
        expect(await store.getRuntimeApiKey('aa')).toBeNull()
    })

    it('下次保存会重写为当前版本（版本自愈）', async () => {
        await fs.writeFile(
            configPath,
            JSON.stringify({ version: 99, config: { enabled: false } }),
            'utf-8'
        )
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        await store.save({ enabled: true })
        const parsed = await readConfigFileJson()
        expect(parsed?.version).toBe(AI_CONFIG_VERSION)
        expect((parsed?.config as Record<string, unknown>).enabled).toBe(true)
    })
})

/**
 * 1.5.7 新功能：`statusCommand`（运行状态查询命令）配置读写兼容。
 *
 * 真源为共享归一化 `normalizeAiModelConfig`：旧配置无该字段时保持 undefined（走内置查询），
 * 保存时非空才落盘、清空即删除字段；历史脏数据中的换行/控制字符在读取时归一化为单行。
 */
describe('AI 配置存储：statusCommand（1.5.7 运行状态查询命令）', () => {
    it('保存后落盘并可按快照读回；清空后保存不再包含该字段', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const saved = await store.save({
            enabled: true,
            models: [makeModel({ id: 'aa', statusCommand: 'ollama ps' })],
            defaultModelId: 'aa'
        })
        expect(saved.models[0].statusCommand).toBe('ollama ps')
        const parsed = await readConfigFileJson()
        const models = (parsed?.config as { models: Array<Record<string, unknown>> }).models
        expect(models[0].statusCommand).toBe('ollama ps')

        const cleared = await store.save({
            models: [makeModel({ id: 'aa' })]
        })
        expect(cleared.models[0]).not.toHaveProperty('statusCommand')
        const parsedAfterClear = await readConfigFileJson()
        const modelsAfterClear = (
            parsedAfterClear?.config as { models: Array<Record<string, unknown>> }
        ).models
        expect(modelsAfterClear[0]).not.toHaveProperty('statusCommand')
    })

    it('旧版（无 statusCommand 字段）配置读取后保持 undefined（不制造空字段）', async () => {
        await fs.writeFile(
            configPath,
            JSON.stringify({
                version: AI_CONFIG_VERSION,
                config: {
                    enabled: true,
                    models: [makeModel({ id: 'aa' })],
                    defaultModelId: 'aa'
                },
                apiKeys: { version: 1, keys: {} }
            }),
            'utf-8'
        )
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.getSnapshot()
        expect(snapshot.models[0]).not.toHaveProperty('statusCommand')
    })

    it('历史脏数据中的换行/控制字符在读取时归一化为单行（不会把多行命令交给 shell）', async () => {
        await fs.writeFile(
            configPath,
            JSON.stringify({
                version: AI_CONFIG_VERSION,
                config: {
                    enabled: true,
                    models: [
                        makeModel({
                            id: 'aa',
                            statusCommand: 'ollama ps\n  --format json\t'
                        } as Partial<AiModelConfig>)
                    ],
                    defaultModelId: 'aa'
                },
                apiKeys: { version: 1, keys: {} }
            }),
            'utf-8'
        )
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.getSnapshot()
        expect(snapshot.models[0].statusCommand).toBe('ollama ps --format json')
    })
})
