/**
 * 1.5.7 LLM Wiki L3：AI 配置与 API Key 安全存储单测（`src/main/ai/config-store.ts`）
 *
 * 覆盖：
 * 1. 默认值：文件缺失时返回「默认本地 Ollama + 关闭」，不创建文件；
 * 2. 保存：非敏感配置落盘到独立 ai-config.json（版本/结构正确）；
 * 3. 密钥安全：safeStorage 可用时密文落盘（**文件内不出现明文**），运行时解密可用；
 *    清除密钥后文件与运行时均无密钥；
 * 4. 内存退化：safeStorage 不可用时密钥**绝不落盘**，仅会话内存可用，快照 storage=memory；
 * 5. 健壮性：损坏 JSON 改名备份为 `.corrupt-<ts>` 并按默认值重建；未知版本忽略密钥；
 * 6. 非法 patch 由上层 validation 拦截（本文件只验证存储层行为）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { promises as fs } from 'fs'
import * as os from 'os'
import * as path from 'path'

vi.mock('../../src/main/utils/logger', () => ({
    logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }
}))

import { createAiConfigStore, type AiSafeStorageLike } from '../../src/main/ai/config-store'
import { AI_CONFIG_VERSION } from '../../src/shared/constants/ai'

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

describe('AI 配置存储：默认值与保存', () => {
    it('文件缺失时返回「本地 Ollama + 关闭」默认值，且不创建文件', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.getSnapshot()
        expect(snapshot).toMatchObject({
            enabled: false,
            provider: 'local',
            localProvider: 'ollama',
            baseUrl: '',
            model: '',
            apiKeyConfigured: false,
            apiKeyStorage: 'safe'
        })
        expect(await readConfigFileRaw()).toBeNull()
    })

    it('保存非敏感配置：写入独立 ai-config.json（版本 + 归一化字段）', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.save({
            enabled: true,
            provider: 'remote',
            baseUrl: 'https://api.example.com/v1',
            model: 'deepseek-chat'
        })
        expect(snapshot.enabled).toBe(true)
        expect(snapshot.provider).toBe('remote')
        expect(snapshot.apiKeyConfigured).toBe(false)

        const raw = await readConfigFileRaw()
        expect(raw).not.toBeNull()
        const parsed = JSON.parse(raw as string)
        expect(parsed.version).toBe(AI_CONFIG_VERSION)
        expect(parsed.config).toMatchObject({
            enabled: true,
            provider: 'remote',
            localProvider: 'ollama',
            baseUrl: 'https://api.example.com/v1',
            model: 'deepseek-chat'
        })
        expect(parsed.apiKey ?? null).toBeNull()
    })
})

describe('AI 配置存储：API Key 安全（safeStorage 可用）', () => {
    it('密钥密文落盘，文件内不出现明文；运行时解密可用', async () => {
        const safeStorage = makeSafeStorage()
        const store = createAiConfigStore({ filePath: configPath, safeStorage })
        const plainKey = 'sk-very-secret-key-1234567890'

        const snapshot = await store.save({
            enabled: true,
            provider: 'remote',
            baseUrl: 'https://api.example.com/v1',
            model: 'deepseek-chat',
            apiKey: plainKey
        })
        expect(snapshot.apiKeyConfigured).toBe(true)
        expect(snapshot.apiKeyStorage).toBe('safe')

        const raw = await readConfigFileRaw()
        expect(raw).not.toBeNull()
        expect(raw as string).not.toContain(plainKey)
        const parsed = JSON.parse(raw as string)
        expect(parsed.apiKey).toMatchObject({ encrypted: true })
        expect(typeof parsed.apiKey.cipher).toBe('string')
        expect(safeStorage.encryptString).toHaveBeenCalledWith(plainKey)

        expect(await store.getRuntimeApiKey()).toBe(plainKey)
    })

    it('清除密钥：文件与运行时均无密钥，其余配置保持', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        await store.save({
            enabled: true,
            provider: 'remote',
            baseUrl: 'https://api.example.com/v1',
            model: 'deepseek-chat',
            apiKey: 'sk-to-clear'
        })
        const snapshot = await store.save({ clearApiKey: true })
        expect(snapshot.apiKeyConfigured).toBe(false)
        expect(await store.getRuntimeApiKey()).toBeNull()
        expect(snapshot.provider).toBe('remote')
        expect(snapshot.model).toBe('deepseek-chat')

        const parsed = JSON.parse((await readConfigFileRaw()) as string)
        expect(parsed.apiKey ?? null).toBeNull()
    })

    it('解密失败时按未配置密钥处理（不崩溃、不清空文件）', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        await store.save({ enabled: true, apiKey: 'sk-abc' })
        // 模拟系统凭据变化：把密文改为非法内容
        const parsed = JSON.parse((await readConfigFileRaw()) as string)
        parsed.apiKey.cipher = Buffer.from('garbage', 'utf-8').toString('base64')
        await fs.writeFile(configPath, JSON.stringify(parsed), 'utf-8')
        const reloaded = createAiConfigStore({
            filePath: configPath,
            safeStorage: makeSafeStorage()
        })
        expect(await reloaded.getRuntimeApiKey()).toBeNull()
        // 快照不显示「已配置」——避免设置页误导用户（实际请求会因缺密钥失败）
        expect((await reloaded.getSnapshot()).apiKeyConfigured).toBe(false)
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
            provider: 'remote',
            baseUrl: 'https://api.example.com/v1',
            model: 'deepseek-chat',
            apiKey: plainKey
        })
        expect(snapshot.apiKeyConfigured).toBe(true)
        expect(snapshot.apiKeyStorage).toBe('memory')
        expect(await store.getRuntimeApiKey()).toBe(plainKey)

        const raw = await readConfigFileRaw()
        expect(raw).not.toBeNull()
        expect(raw as string).not.toContain(plainKey)
        const parsed = JSON.parse(raw as string)
        expect(parsed.apiKey ?? null).toBeNull()
    })

    it('safeStorage 为 null 时不崩溃（按不可用处理）', async () => {
        const store = createAiConfigStore({ filePath: configPath, safeStorage: null })
        const snapshot = await store.save({ enabled: true, apiKey: 'sk-null-safe-storage' })
        expect(snapshot.apiKeyStorage).toBe('memory')
        expect(await store.getRuntimeApiKey()).toBe('sk-null-safe-storage')
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
        expect(snapshot.provider).toBe('local')
        const backupPath = `${configPath}.corrupt-1700000000000`
        await expect(fs.stat(backupPath)).resolves.toBeDefined()
    })

    it('未知版本：尽力读取非敏感字段并忽略密钥', async () => {
        await fs.writeFile(
            configPath,
            JSON.stringify({
                version: 99,
                config: { enabled: true, provider: 'remote', model: 'x' },
                apiKey: { encrypted: true, cipher: 'AAAA' }
            }),
            'utf-8'
        )
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        const snapshot = await store.getSnapshot()
        expect(snapshot.enabled).toBe(true)
        expect(snapshot.provider).toBe('remote')
        expect(snapshot.model).toBe('x')
        expect(snapshot.apiKeyConfigured).toBe(false)
        expect(await store.getRuntimeApiKey()).toBeNull()
    })

    it('下次保存会重写为当前版本（版本自愈）', async () => {
        await fs.writeFile(
            configPath,
            JSON.stringify({ version: 99, config: { enabled: false } }),
            'utf-8'
        )
        const store = createAiConfigStore({ filePath: configPath, safeStorage: makeSafeStorage() })
        await store.save({ enabled: true })
        const parsed = JSON.parse((await readConfigFileRaw()) as string)
        expect(parsed.version).toBe(AI_CONFIG_VERSION)
        expect(parsed.config.enabled).toBe(true)
    })
})
