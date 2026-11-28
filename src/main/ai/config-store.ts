/**
 * 1.5.7 LLM Wiki L3 / 体验升级批次 C：AI 配置与 API Key 安全存储（多模型）
 *
 * ## 存储方案（计划 §5.2.1：安全存储、不明文落配置）
 * - 非敏感配置（`enabled` / `models[]` / `defaultModelId`）与**按模型 id 加密的 API Key**
 *   统一持久化到**独立文件** `~/.baizenotes/config/ai-config.json`（不写入 system-setting，
 *   避免密钥随通用配置通道/备份明文扩散）；
 * - 每个远程模型的 API Key 以「模型 id → 密文」形式独立保存，经 Electron 内置
 *   `safeStorage.encryptString()` 加密后以 base64 落盘（Windows 走 DPAPI、macOS 走 Keychain、
 *   Linux 走 libsecret/kwallet）；密钥存储结构为 `{ version, keys: { [modelId]: base64 } }`；
 * - **safeStorage 不可用**（Linux 无 keyring、启动早期等）时退化为**仅会话内存**：
 *   密钥只保存在主进程内存 Map 中、**绝不写盘**，并在设置页提示「重启后需重新输入」；
 * - 明文密钥永不写日志、永不返回渲染层（`AI.GET_CONFIG` 只返回每模型的
 *   `apiKeyConfigured` 标记 + 存储形态 `apiKeyStorage`）。
 *
 * ## 旧配置迁移（1.5.7 L3 单模型 → 多模型，只发生一次）
 * - 读取到版本 1 的旧结构（enabled/provider/localProvider/baseUrl/model + 旧单密钥）时，
 *   转换为 `models: [{ id: 'legacy-default-model', name: '默认模型', ... }]`、
 *   `defaultModelId` = 该模型 id，旧密钥迁移到该模型 id，并**立即写回新版本结构**；
 * - 迁移后文件版本为 2，后续读取不再迁移（幂等）；若旧配置为空壳（无模型/基址/密钥），
 *   迁移为空模型列表（不制造无效模型）；
 * - 无法识别/损坏的配置：JSON 损坏备份后按默认空配置重建；未知版本尽力读取且忽略密钥。
 *
 * ## 健壮性（CFG-08 口径）
 * - 文件缺失：返回默认值（不创建文件）；
 * - JSON 损坏/结构非法：改名备份 `ai-config.json.corrupt-<ts>` 后按默认值重建（不阻断启动）；
 * - 写入：`mkdir -p` + 临时文件 + `rename` 原子替换；POSIX 平台收紧为 0o600（失败安全降级）。
 *
 * ## 可测试性
 * 本模块通过 `createAiConfigStore({ filePath, safeStorage, now })` 工厂创建实例，
 * 单测注入临时目录与 safeStorage 替身，不读写真实用户目录（CFG-12 同款口径）。
 */
import { promises as fs } from 'fs'
import * as path from 'path'
import type {
    AiConfigSnapshot,
    AiModelConfig,
    AiSaveConfigRequest,
    AiStoredConfig
} from '../../shared/types/ai'
import {
    AI_CONFIG_VERSION,
    AI_DEFAULT_CONFIG,
    AI_LEGACY_MODEL_ID,
    AI_LEGACY_MODEL_NAME,
    AI_MODELS_MAX,
    isAiLocalProviderId,
    isAiModelId,
    isAiProviderKind,
    normalizeAiModelConfig,
    normalizeAiStoredConfig
} from '../../shared/constants/ai'
import { logger } from '../utils/logger'
import { AiProviderError, sanitizeErrorMessage } from './errors'

/** safeStorage 最小结构（便于单测注入替身；生产传 Electron safeStorage） */
export interface AiSafeStorageLike {
    isEncryptionAvailable: () => boolean
    encryptString: (plainText: string) => Buffer
    decryptString: (encrypted: Buffer) => string
}

/** 密钥存储结构的版本（独立于配置结构版本，便于后续单独演进） */
const API_KEYS_VERSION = 1

/** 单条密文最大长度（base64 字符数；防异常超大字符串落盘/占内存） */
const MAX_CIPHER_CHARS = 64 * 1024

/** 写入磁盘的密钥结构（仅 safeStorage 可解密；明文永不落盘） */
interface StoredApiKeysFile {
    /** 固定为当前密钥结构版本 */
    version: number
    /** 模型 id → safeStorage 密文（Buffer → base64） */
    keys: Record<string, string>
}

/** 磁盘文件结构（版本 2：多模型 + 每模型密钥） */
interface StoredAiConfigFile {
    version: number
    config: AiStoredConfig
    /** 每模型密钥（无密钥时为 `{ version, keys: {} }`，不省略结构） */
    apiKeys?: StoredApiKeysFile | null
}

/** 旧版（版本 1）单模型密钥结构 */
interface LegacyStoredApiKey {
    encrypted: boolean
    cipher: string
}

/** 读取磁盘后的内存视图 */
interface LoadedAiConfigFile {
    config: AiStoredConfig
    /** 模型 id → 密文（base64；仅 safeStorage 可解密） */
    encryptedKeys: Record<string, string>
    /** 是否由旧结构迁移而来（需要写回新结构） */
    migrated: boolean
}

/** 工厂依赖（生产用默认值；单测注入临时目录/safeStorage 替身/时钟） */
export interface AiConfigStoreDeps {
    /** 配置文件绝对路径（生产：`path.join(getConfigPath(), AI_CONFIG_FILE_NAME)`） */
    filePath: string
    /** safeStorage 实现（生产：Electron safeStorage；null 表示不可用 → 内存退化） */
    safeStorage?: AiSafeStorageLike | null
    /** 时间源（损坏备份文件名用；单测注入固定值） */
    now?: () => number
}

/** AI 配置存储实例接口 */
export interface AiConfigStore {
    /** 读取配置快照（不含密钥明文；读取失败回退默认值） */
    getSnapshot: () => Promise<AiConfigSnapshot>
    /** 保存配置补丁（含每模型密钥保存/清除），返回最新快照 */
    save: (patch: AiSaveConfigRequest) => Promise<AiConfigSnapshot>
    /** 读取指定模型的运行时 API Key（无则 null；safeStorage 解密失败按不可用处理） */
    getRuntimeApiKey: (modelId: string) => Promise<string | null>
}

/** 判断值是否为「纯对象」 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 读取旧版单模型密钥结构（非法返回 null） */
function readLegacyStoredApiKey(value: unknown): LegacyStoredApiKey | null {
    if (!isRecord(value) || value.encrypted !== true || typeof value.cipher !== 'string') {
        return null
    }
    if (value.cipher.length === 0 || value.cipher.length > MAX_CIPHER_CHARS) {
        return null
    }
    return { encrypted: true, cipher: value.cipher }
}

/** 读取新结构中的每模型密钥表（非法条目逐项丢弃；整体非法返回空表） */
function readStoredApiKeys(value: unknown): Record<string, string> {
    const keys: Record<string, string> = {}
    if (!isRecord(value) || !isRecord(value.keys)) {
        return keys
    }
    for (const [modelId, cipher] of Object.entries(value.keys)) {
        if (!isAiModelId(modelId) || typeof cipher !== 'string') {
            continue
        }
        if (cipher.length === 0 || cipher.length > MAX_CIPHER_CHARS) {
            continue
        }
        keys[modelId] = cipher
    }
    return keys
}

/**
 * 把旧版单模型配置转换为新结构（纯函数，便于单测）。
 *
 * @param legacyConfig 旧版 `config` 字段（可为脏数据）
 * @param legacyApiKey 旧版单密钥（可为 null）
 */
function migrateLegacyConfig(
    legacyConfig: unknown,
    legacyApiKey: LegacyStoredApiKey | null
): { config: AiStoredConfig; encryptedKeys: Record<string, string> } {
    const record = isRecord(legacyConfig) ? legacyConfig : {}
    const enabled = record.enabled === true
    const provider = isAiProviderKind(record.provider) ? record.provider : 'local'
    const localProvider = isAiLocalProviderId(record.localProvider)
        ? record.localProvider
        : 'ollama'
    const baseUrl = typeof record.baseUrl === 'string' ? record.baseUrl.trim() : ''
    const model = typeof record.model === 'string' ? record.model.trim() : ''
    const hasLegacyKey = legacyApiKey !== null
    // 旧默认配置（本地 + 空基址 + 空模型 + 无密钥）没有可迁移的模型：迁移为空列表，
    // 避免制造一个 model 为空的无效模型条目（设置页显示为不完整配置）。
    if (model.length === 0 && baseUrl.length === 0 && provider !== 'remote' && !hasLegacyKey) {
        return { config: { enabled, models: [], defaultModelId: null }, encryptedKeys: {} }
    }
    const migratedModel: AiModelConfig = {
        id: AI_LEGACY_MODEL_ID,
        name: AI_LEGACY_MODEL_NAME,
        provider,
        localProvider,
        baseUrl,
        model
    }
    return {
        config: { enabled, models: [migratedModel], defaultModelId: AI_LEGACY_MODEL_ID },
        encryptedKeys: hasLegacyKey ? { [AI_LEGACY_MODEL_ID]: legacyApiKey.cipher } : {}
    }
}

/**
 * 创建 AI 配置存储实例。
 *
 * @param deps 文件路径 + safeStorage 实现 + 时钟（生产/单测均显式传入，避免模块级全局状态）
 */
export function createAiConfigStore(deps: AiConfigStoreDeps): AiConfigStore {
    const filePath = deps.filePath
    const safeStorage = deps.safeStorage ?? null
    const now = deps.now ?? (() => Date.now())
    /** 会话内存密钥（safeStorage 不可用/加密失败时的唯一存放处；不落盘） */
    const memoryKeys = new Map<string, string>()
    /** 已记录过「safeStorage 不可用」提示，避免每次读取刷日志 */
    let memoryWarningLogged = false

    /** safeStorage 当前是否可用于加解密（每次实时判定；探测异常按不可用处理） */
    function isSafeStorageAvailable(): boolean {
        if (!safeStorage) {
            return false
        }
        try {
            return safeStorage.isEncryptionAvailable() === true
        } catch {
            return false
        }
    }

    /** 读取磁盘文件（缺失返回 null；损坏备份后返回 null；旧结构自动迁移并写回） */
    async function loadStoredFile(): Promise<LoadedAiConfigFile | null> {
        let raw: string
        try {
            raw = await fs.readFile(filePath, 'utf-8')
        } catch (error) {
            const code = (error as NodeJS.ErrnoException)?.code
            if (code !== 'ENOENT') {
                logger.warn('[AI] 读取 AI 配置文件失败（按默认值处理）：', error)
            }
            return null
        }
        let parsed: unknown
        try {
            parsed = JSON.parse(raw)
        } catch {
            await backupCorruptFile('JSON 解析失败')
            return null
        }
        if (!isRecord(parsed)) {
            await backupCorruptFile('顶层结构不是对象')
            return null
        }
        const version = typeof parsed.version === 'number' ? parsed.version : 0
        if (version === AI_CONFIG_VERSION) {
            return {
                config: normalizeAiStoredConfig(parsed.config),
                encryptedKeys: readStoredApiKeys(parsed.apiKeys),
                migrated: false
            }
        }
        if (version === 1) {
            // 旧版单模型结构：迁移为新结构并立即写回（只发生一次，幂等）
            const migrated = migrateLegacyConfig(
                parsed.config,
                readLegacyStoredApiKey(parsed.apiKey)
            )
            const loaded: LoadedAiConfigFile = { ...migrated, migrated: true }
            try {
                await writeStoredFile(loaded.config, loaded.encryptedKeys)
                logger.info(
                    `[AI] 旧版单模型配置已迁移为多模型结构（models=${loaded.config.models.length}，` +
                        `defaultModelId=${String(loaded.config.defaultModelId)}）`
                )
            } catch (error) {
                // 写回失败不阻断读取：下次读取会再次尝试迁移（迁移本身幂等）
                logger.warn('[AI] 旧版 AI 配置迁移写回失败（本次按迁移结果只读使用）：', error)
            }
            return loaded
        }
        // 未知版本：保留文件（不删除用户数据），尽力读取非敏感字段并忽略密钥，
        // 下次保存会重写为当前版本。
        logger.warn(
            `[AI] AI 配置文件版本未知（${String(parsed.version)}，当前 ${AI_CONFIG_VERSION}），` +
                '已忽略密钥并按非敏感字段尽力读取；下次保存会重写为当前版本'
        )
        const configRecord = isRecord(parsed.config) ? parsed.config : {}
        if (Array.isArray(configRecord.models)) {
            return {
                config: normalizeAiStoredConfig(configRecord),
                encryptedKeys: {},
                migrated: false
            }
        }
        return { ...migrateLegacyConfig(parsed.config, null), migrated: false }
    }

    /** 损坏文件改名备份（失败只记日志；不阻断后续默认值重建） */
    async function backupCorruptFile(reason: string): Promise<void> {
        const backupPath = `${filePath}.corrupt-${now()}`
        try {
            await fs.rename(filePath, backupPath)
            logger.warn(`[AI] AI 配置文件损坏（${reason}），已备份为：${backupPath}`)
        } catch (error) {
            logger.warn('[AI] AI 配置文件损坏且备份失败（将按默认值处理）：', error)
        }
    }

    /** 原子写盘（mkdir + tmp + rename；POSIX 收紧 0o600，失败安全降级） */
    async function writeStoredFile(
        config: AiStoredConfig,
        encryptedKeys: Record<string, string>
    ): Promise<void> {
        const directory = path.dirname(filePath)
        await fs.mkdir(directory, { recursive: true })
        const tempPath = `${filePath}.tmp-${process.pid}-${now()}`
        const data: StoredAiConfigFile = {
            version: AI_CONFIG_VERSION,
            config,
            apiKeys: { version: API_KEYS_VERSION, keys: encryptedKeys }
        }
        const content = `${JSON.stringify(data, null, 2)}\n`
        try {
            await fs.writeFile(tempPath, content, { encoding: 'utf-8', mode: 0o600 })
            await fs.rename(tempPath, filePath)
            if (process.platform !== 'win32') {
                await fs.chmod(filePath, 0o600)
            }
        } catch (error) {
            try {
                await fs.rm(tempPath, { force: true })
            } catch {
                // 清理失败不覆盖原始错误
            }
            throw new AiProviderError(
                'AI_CONFIG_STORE_FAILED',
                `保存 AI 配置失败：${sanitizeErrorMessage(error)}`
            )
        }
    }

    /** 尝试解密已保存的密文（仅用于「是否可用」判定；失败按不可用处理，不清空文件） */
    function canDecryptCipher(cipher: string): boolean {
        if (!safeStorage) {
            return false
        }
        try {
            return safeStorage.decryptString(Buffer.from(cipher, 'base64')).length > 0
        } catch {
            return false
        }
    }

    /** 判断指定模型当前是否已配置可用密钥（内存优先；密文需在当前环境可解密） */
    function isModelApiKeyConfigured(
        modelId: string,
        encryptedKeys: Record<string, string>
    ): boolean {
        const memoryKey = memoryKeys.get(modelId)
        if (typeof memoryKey === 'string' && memoryKey.length > 0) {
            return true
        }
        const cipher = encryptedKeys[modelId]
        if (typeof cipher !== 'string' || cipher.length === 0) {
            return false
        }
        // 只展示「当前环境确实可用」的密钥：解密失败（换机/系统凭据变化）按未配置处理，
        // 避免设置页显示「已配置」但实际请求因缺密钥失败（引导用户重新输入）。
        return isSafeStorageAvailable() && canDecryptCipher(cipher)
    }

    /** 组装快照（不含密钥明文；每个模型带 apiKeyConfigured 标记） */
    function buildSnapshot(
        config: AiStoredConfig,
        encryptedKeys: Record<string, string>
    ): AiConfigSnapshot {
        if (!isSafeStorageAvailable() && !memoryWarningLogged) {
            memoryWarningLogged = true
            logger.info(
                '[AI] safeStorage 当前不可用：API Key 仅保存在本次会话内存（不落盘），重启后需重新输入'
            )
        }
        return {
            enabled: config.enabled,
            models: config.models.map((model) => ({
                ...model,
                apiKeyConfigured: isModelApiKeyConfigured(model.id, encryptedKeys)
            })),
            defaultModelId: config.defaultModelId,
            apiKeyStorage: isSafeStorageAvailable() ? 'safe' : 'memory'
        }
    }

    /** 保存单个模型密钥（safeStorage 可用则加密落盘，否则仅会话内存） */
    function storeModelApiKey(
        modelId: string,
        plainKey: string,
        encryptedKeys: Record<string, string>
    ): void {
        if (isSafeStorageAvailable() && safeStorage) {
            try {
                encryptedKeys[modelId] = safeStorage.encryptString(plainKey).toString('base64')
                memoryKeys.delete(modelId)
                return
            } catch (error) {
                // 加密失败：绝不退化为明文落盘——改为仅会话内存并记录告警
                logger.warn('[AI] safeStorage 加密 API Key 失败，本次会话改为仅内存保存：', error)
            }
        }
        delete encryptedKeys[modelId]
        memoryKeys.set(modelId, plainKey)
    }

    return {
        async getSnapshot(): Promise<AiConfigSnapshot> {
            const loaded = await loadStoredFile()
            const config = loaded?.config ?? { ...AI_DEFAULT_CONFIG }
            return buildSnapshot(config, loaded?.encryptedKeys ?? {})
        },

        async save(patch: AiSaveConfigRequest): Promise<AiConfigSnapshot> {
            const loaded = await loadStoredFile()
            const config: AiStoredConfig = loaded
                ? {
                      enabled: loaded.config.enabled,
                      models: loaded.config.models.map((model) => ({ ...model })),
                      defaultModelId: loaded.config.defaultModelId
                  }
                : { ...AI_DEFAULT_CONFIG, models: [] }
            const encryptedKeys: Record<string, string> = { ...(loaded?.encryptedKeys ?? {}) }

            if (patch.enabled !== undefined) {
                config.enabled = patch.enabled
            }

            // 1) 模型列表全量替换（按 id 覆盖/新增，缺失的旧模型被删除）
            if (patch.models !== undefined) {
                if (patch.models.length > AI_MODELS_MAX) {
                    throw new AiProviderError(
                        'AI_INVALID_PAYLOAD',
                        `模型数量不能超过 ${AI_MODELS_MAX} 个`
                    )
                }
                const nextModels: AiModelConfig[] = []
                const seenIds = new Set<string>()
                for (const item of patch.models) {
                    const model = normalizeAiModelConfig(item)
                    if (model === null || seenIds.has(model.id)) {
                        throw new AiProviderError(
                            'AI_INVALID_PAYLOAD',
                            '模型配置非法：存在无效或重复的模型 id'
                        )
                    }
                    seenIds.add(model.id)
                    nextModels.push(model)
                }
                config.models = nextModels
                // 已删除模型的密钥同步清理（磁盘结构与会话内存），避免残留密钥
                for (const modelId of Object.keys(encryptedKeys)) {
                    if (!seenIds.has(modelId)) {
                        delete encryptedKeys[modelId]
                    }
                }
                for (const modelId of [...memoryKeys.keys()]) {
                    if (!seenIds.has(modelId)) {
                        memoryKeys.delete(modelId)
                    }
                }
            }

            // 2) 默认模型：null = 清空；指向不存在模型 → 回落首个 / null
            if (patch.defaultModelId !== undefined) {
                if (patch.defaultModelId === null) {
                    config.defaultModelId = null
                } else {
                    const requested = String(patch.defaultModelId).trim()
                    config.defaultModelId =
                        requested.length > 0 && config.models.some((m) => m.id === requested)
                            ? requested
                            : (config.models[0]?.id ?? null)
                }
            }
            if (
                config.defaultModelId !== null &&
                !config.models.some((model) => model.id === config.defaultModelId)
            ) {
                config.defaultModelId = config.models[0]?.id ?? null
            }

            // 3) 单模型密钥保存/清除（与模型列表同批次提交）
            if (patch.modelApiKey !== undefined) {
                const operation = patch.modelApiKey
                const modelId = typeof operation?.modelId === 'string' ? operation.modelId : ''
                if (!isAiModelId(modelId)) {
                    throw new AiProviderError('AI_INVALID_PAYLOAD', '密钥绑定的模型 id 非法')
                }
                if (!config.models.some((model) => model.id === modelId)) {
                    throw new AiProviderError(
                        'AI_INVALID_PAYLOAD',
                        `密钥绑定的模型不存在：${modelId}`
                    )
                }
                const hasApiKey =
                    typeof operation.apiKey === 'string' && operation.apiKey.length > 0
                if (operation.clearApiKey === true && hasApiKey) {
                    throw new AiProviderError(
                        'AI_INVALID_PAYLOAD',
                        '不能同时保存与清除同一个模型的 API Key'
                    )
                }
                if (operation.clearApiKey === true) {
                    delete encryptedKeys[modelId]
                    memoryKeys.delete(modelId)
                } else if (hasApiKey) {
                    storeModelApiKey(modelId, String(operation.apiKey), encryptedKeys)
                } else {
                    throw new AiProviderError(
                        'AI_INVALID_PAYLOAD',
                        '密钥操作非法：需提供 apiKey 或 clearApiKey'
                    )
                }
            }

            await writeStoredFile(config, encryptedKeys)
            const configuredCount = config.models.filter((model) =>
                isModelApiKeyConfigured(model.id, encryptedKeys)
            ).length
            logger.info(
                `[AI] AI 配置已保存（models=${config.models.length}，enabled=${config.enabled}，` +
                    `defaultModelId=${String(config.defaultModelId)}，已配置密钥模型数=${configuredCount}）`
            )
            return buildSnapshot(config, encryptedKeys)
        },

        async getRuntimeApiKey(modelId: string): Promise<string | null> {
            if (typeof modelId !== 'string' || modelId.length === 0) {
                return null
            }
            const memoryKey = memoryKeys.get(modelId)
            if (typeof memoryKey === 'string' && memoryKey.length > 0) {
                return memoryKey
            }
            if (!isSafeStorageAvailable() || !safeStorage) {
                return null
            }
            const loaded = await loadStoredFile()
            const cipher = loaded?.encryptedKeys[modelId]
            if (typeof cipher !== 'string' || cipher.length === 0) {
                return null
            }
            try {
                const decrypted = safeStorage.decryptString(Buffer.from(cipher, 'base64'))
                return decrypted.length > 0 ? decrypted : null
            } catch (error) {
                // 解密失败（换机/系统凭据重置）：不清空文件，仅本次按未配置处理
                logger.warn('[AI] safeStorage 解密 API Key 失败，本次请求按未配置密钥处理：', error)
                return null
            }
        }
    }
}
