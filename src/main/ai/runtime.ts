/**
 * 1.5.7 LLM Wiki L3 / 体验升级批次 C：AI 运行时装配（配置存储单例 + 按需创建 Provider）
 *
 * ## 为什么单独一层
 * - `config-store` 只管持久化（可注入临时目录测试），`providers/factory` 只管按模型配置造实例；
 * - 本模块负责「生产默认依赖」装配：`~/.baizenotes/config/ai-config.json` + Electron
 *   `safeStorage` + 全局 fetch，并给单测留 `setAiRuntimeForTesting()` 注入替身的口子；
 * - 这样 `main/ipc/ai-ipc.ts` 只依赖运行时能力，单测无需真实 Electron/用户目录。
 *
 * ## 模型与密钥解析（多模型）
 * - `modelId` 显式指定 → 必须存在，否则 `AI_MODEL_NOT_FOUND`；
 * - 缺省 → `defaultModelId`；未设置/模型列表为空 → `AI_NOT_CONFIGURED`；
 * - API Key 按解析出的**模型 id** 读取（`store.getRuntimeApiKey(model.id)`），
 *   本地模型可为 null（LM Studio 例外：可选密钥）。
 *
 * ## 安全
 * - 未启用（`enabled=false`）时直接返回 AI_NOT_CONFIGURED，**不读取密钥、不发起请求**；
 * - API Key 只在 `getRuntimeApiKey()` 返回的字符串中短暂存在，不写日志、不进错误消息。
 */
import * as path from 'path'
import { safeStorage } from 'electron'
import type { AiConfigSnapshot, AiModelConfig } from '../../shared/types/ai'
import { AI_CONFIG_FILE_NAME, AI_DEFAULT_CONFIG } from '../../shared/constants/ai'
import { logger } from '../utils/logger'
import { getConfigPath } from '../utils/app-paths'
import { createAiConfigStore, type AiConfigStore, type AiSafeStorageLike } from './config-store'
import { AiProviderError } from './errors'
import { createAiProvider, resolveAiModel } from './providers/factory'
import type { AiFetchLike, AiProvider } from './providers/types'

/** 生产默认配置文件路径：`~/.baizenotes/config/ai-config.json` */
export function resolveAiConfigPath(): string {
    return path.join(getConfigPath(), AI_CONFIG_FILE_NAME)
}

/** 把 Electron safeStorage 适配为最小结构（探测失败视为不可用，退化为仅会话内存） */
function resolveSafeStorage(): AiSafeStorageLike | null {
    try {
        if (!safeStorage || typeof safeStorage.isEncryptionAvailable !== 'function') {
            return null
        }
        return {
            isEncryptionAvailable: () => {
                try {
                    return safeStorage.isEncryptionAvailable() === true
                } catch {
                    return false
                }
            },
            encryptString: (plainText: string) => safeStorage.encryptString(plainText),
            decryptString: (encrypted: Buffer) => safeStorage.decryptString(encrypted)
        }
    } catch (error) {
        logger.warn('[AI] Electron safeStorage 不可用，API Key 将仅保存在本次会话内存：', error)
        return null
    }
}

/** 运行时依赖（生产默认值；单测经 setAiRuntimeForTesting 注入） */
export interface AiRuntimeDeps {
    /** 配置存储（默认：生产独立配置文件 + safeStorage） */
    store: AiConfigStore
    /** fetch 实现（默认：globalThis.fetch） */
    fetchImpl?: AiFetchLike
}

/** 生产默认运行时（首次使用时惰性创建，避免启动早期触碰 safeStorage/app 路径） */
let productionRuntime: AiRuntimeDeps | null = null

/** 单测注入的运行时替身（非 null 时优先于生产运行时） */
let testingRuntime: AiRuntimeDeps | null = null

/** 获取运行时依赖（惰性创建生产默认值） */
export function getAiRuntime(): AiRuntimeDeps {
    if (testingRuntime) {
        return testingRuntime
    }
    if (!productionRuntime) {
        productionRuntime = {
            store: createAiConfigStore({
                filePath: resolveAiConfigPath(),
                safeStorage: resolveSafeStorage()
            })
        }
    }
    return productionRuntime
}

/**
 * 注入/清空运行时替身（仅单测使用；传 null 恢复生产默认）。
 *
 * @param runtime 替身运行时；null = 清空
 */
export function setAiRuntimeForTesting(runtime: AiRuntimeDeps | null): void {
    testingRuntime = runtime
}

/** 重置生产运行时缓存（单测切临时目录/清 safeStorage 缓存时使用） */
export function resetAiRuntimeForTesting(): void {
    productionRuntime = null
    testingRuntime = null
}

/** 默认配置快照（配置读取失败/首次使用时的安全兜底） */
export function buildDefaultAiConfigSnapshot(): AiConfigSnapshot {
    return {
        ...AI_DEFAULT_CONFIG,
        models: [],
        apiKeyStorage: 'memory'
    }
}

/** 读取 AI 配置快照（不含密钥明文；读取失败回退默认值，不抛异常） */
export async function readAiConfigSnapshot(): Promise<AiConfigSnapshot> {
    try {
        return await getAiRuntime().store.getSnapshot()
    } catch (error) {
        logger.warn('[AI] 读取 AI 配置快照失败，按默认值处理：', error)
        return buildDefaultAiConfigSnapshot()
    }
}

/** 已启用且配置完整的运行时 Provider 装配结果 */
export interface AiRuntimeProvider {
    provider: AiProvider
    /** 本次解析出的模型配置（日志/提示/UI 展示用） */
    model: AiModelConfig
}

/** Provider 装载可选参数 */
export interface AiProviderLoadOptions {
    /** fetch 覆写（单测/未来流式复用） */
    fetchImpl?: AiFetchLike
    /** 指定模型 id（缺省 = defaultModelId） */
    modelId?: string
}

/**
 * 按当前配置创建 Provider（AI 未启用/配置不完整/模型不存在/密钥缺失时抛 AiProviderError）。
 *
 * @param deps 可选 fetch 覆写 + 模型 id
 * @throws AiProviderError AI_NOT_CONFIGURED / AI_MODEL_NOT_FOUND / AI_CONFIG_STORE_FAILED
 */
export async function loadConfiguredAiProvider(
    deps: AiProviderLoadOptions = {}
): Promise<AiRuntimeProvider> {
    return loadConfiguredAiProviderWith(getAiRuntime(), deps)
}

/**
 * 从指定运行时依赖创建 Provider（供 IPC 层注入替身/单测使用，避免改全局单例）。
 *
 * @param runtime 运行时依赖（store + 可选 fetch）
 * @param deps 可选 fetch 覆写（优先级高于 runtime.fetchImpl）+ 模型 id
 */
export async function loadConfiguredAiProviderWith(
    runtime: AiRuntimeDeps,
    deps: AiProviderLoadOptions = {}
): Promise<AiRuntimeProvider> {
    const snapshot = await runtime.store.getSnapshot()
    if (!snapshot.enabled) {
        throw new AiProviderError(
            'AI_NOT_CONFIGURED',
            'AI 助手未启用：请先在「系统设置 → 功能 → AI 助手」中启用并完成配置'
        )
    }
    const model = resolveAiModel(snapshot, deps.modelId)
    const apiKey = await runtime.store.getRuntimeApiKey(model.id)
    const provider = createAiProvider(model, apiKey, {
        fetchImpl: deps.fetchImpl ?? runtime.fetchImpl
    })
    return { provider, model }
}
