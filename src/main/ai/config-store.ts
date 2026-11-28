/**
 * 1.5.7 LLM Wiki L3：AI 配置与 API Key 安全存储（主进程）
 *
 * ## 存储方案（计划 §5.2.1：安全存储、不明文落配置）
 * - 非敏感配置（enabled / provider / localProvider / baseUrl / model）与加密后的 API Key
 *   统一持久化到**独立文件** `~/.baizenotes/config/ai-config.json`（不写入 system-setting，
 *   避免密钥随通用配置通道/备份明文扩散）；
 * - API Key 经 Electron 内置 `safeStorage.encryptString()` 加密后以 base64 落盘
 *   （Windows 走 DPAPI、macOS 走 Keychain、Linux 走 libsecret/kwallet）；
 * - **safeStorage 不可用**（Linux 无 keyring、启动早期等）时退化为**仅会话内存**：
 *   密钥只保存在主进程内存变量中、**绝不写盘**，并在设置页提示「重启后需重新输入」；
 * - 明文密钥永不写日志、永不返回渲染层（`AI.GET_CONFIG` 只返回是否已配置 + 存储形态）。
 *
 * ## 健壮性（CFG-08 口径）
 * - 文件缺失：返回默认值（不创建文件）；
 * - JSON 损坏/结构非法：改名备份 `ai-config.json.corrupt-<ts>` 后按默认值重建（不阻断启动）；
 * - 版本未知：尽力读取非敏感字段、忽略密钥（下次保存时重写为当前版本）；
 * - 写入：`mkdir -p` + 临时文件 + `rename` 原子替换；POSIX 平台收紧为 0o600（失败安全降级）。
 *
 * ## 可测试性
 * 本模块通过 `createAiConfigStore({ filePath, safeStorage, now })` 工厂创建实例，
 * 单测注入临时目录与 safeStorage 替身，不读写真实用户目录（CFG-12 同款口径）。
 */
import { promises as fs } from 'fs'
import * as path from 'path'
import type { AiConfigSnapshot, AiSaveConfigRequest, AiStoredConfig } from '../../shared/types/ai'
import {
    AI_CONFIG_VERSION,
    AI_DEFAULT_CONFIG,
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

/** 写入磁盘的密钥结构（仅 safeStorage 可解密；明文永不落盘） */
interface StoredApiKey {
    /** 固定为 true（历史文件为 false 时按「明文不可用」忽略并覆盖） */
    encrypted: boolean
    /** safeStorage 密文（Buffer → base64） */
    cipher: string
}

/** 磁盘文件结构 */
interface StoredAiConfigFile {
    version: number
    config: AiStoredConfig
    apiKey?: StoredApiKey | null
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
    /** 保存配置补丁（含密钥保存/清除），返回最新快照 */
    save: (patch: AiSaveConfigRequest) => Promise<AiConfigSnapshot>
    /** 读取运行时 API Key（无则 null；safeStorage 解密失败按不可用处理） */
    getRuntimeApiKey: () => Promise<string | null>
}

/** 判断值是否为「已加密的密钥结构」 */
function readStoredApiKey(value: unknown): StoredApiKey | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null
    }
    const record = value as Record<string, unknown>
    if (record.encrypted !== true || typeof record.cipher !== 'string') {
        return null
    }
    if (record.cipher.length === 0 || record.cipher.length > 64 * 1024) {
        return null
    }
    return { encrypted: true, cipher: record.cipher }
}

/** 判断值是否为「纯对象」（不引入 shared 依赖，保持本模块可独立测试） */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
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
    /** 会话内存密钥（safeStorage 不可用时的唯一存放处；不落盘） */
    let memoryApiKey: string | null = null
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

    /** 读取磁盘文件（缺失返回 null；损坏时备份并返回 null） */
    async function readStoredFile(): Promise<StoredAiConfigFile | null> {
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
        if (version !== AI_CONFIG_VERSION) {
            // 版本未知：保留文件（不删除用户数据），尽力读取非敏感字段并忽略密钥
            logger.warn(
                `[AI] AI 配置文件版本未知（${String(parsed.version)}，当前 ${AI_CONFIG_VERSION}），` +
                    '已忽略密钥并按非敏感字段尽力读取；下次保存会重写为当前版本'
            )
            return {
                version: AI_CONFIG_VERSION,
                config: normalizeAiStoredConfig(parsed.config),
                apiKey: null
            }
        }
        return {
            version,
            config: normalizeAiStoredConfig(parsed.config),
            apiKey: readStoredApiKey(parsed.apiKey)
        }
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
    async function writeStoredFile(data: StoredAiConfigFile): Promise<void> {
        const directory = path.dirname(filePath)
        await fs.mkdir(directory, { recursive: true })
        const tempPath = `${filePath}.tmp-${process.pid}-${now()}`
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

    /** 尝试解密已保存的密钥（仅用于「是否可用」判定；失败按不可用处理，不清空文件） */
    function canDecryptStoredKey(storedKey: StoredApiKey): boolean {
        if (!safeStorage) {
            return false
        }
        try {
            return safeStorage.decryptString(Buffer.from(storedKey.cipher, 'base64')).length > 0
        } catch {
            return false
        }
    }

    /** 读取当前配置（内存合并：内存密钥优先，用于 safeStorage 不可用会话） */
    async function readState(): Promise<{
        config: AiStoredConfig
        storedApiKey: StoredApiKey | null
        apiKeyConfigured: boolean
        apiKeyStorage: 'safe' | 'memory'
    }> {
        const stored = await readStoredFile()
        const config = stored?.config ?? { ...AI_DEFAULT_CONFIG }
        const storedApiKey = stored?.apiKey ?? null
        const safeAvailable = isSafeStorageAvailable()
        const storage = safeAvailable ? 'safe' : 'memory'
        if (!safeAvailable && !memoryWarningLogged) {
            memoryWarningLogged = true
            logger.info(
                '[AI] safeStorage 当前不可用：API Key 仅保存在本次会话内存（不落盘），重启后需重新输入'
            )
        }
        let apiKeyConfigured = false
        if (memoryApiKey !== null && memoryApiKey.length > 0) {
            apiKeyConfigured = true
        } else if (safeAvailable && storedApiKey !== null) {
            // 只展示「当前环境确实可用」的密钥：解密失败（换机/系统凭据变化）按未配置处理，
            // 避免设置页显示「已配置」但实际请求因缺密钥失败（引导用户重新输入）。
            apiKeyConfigured = canDecryptStoredKey(storedApiKey)
        }
        return { config, storedApiKey, apiKeyConfigured, apiKeyStorage: storage }
    }

    return {
        async getSnapshot(): Promise<AiConfigSnapshot> {
            const state = await readState()
            return {
                ...state.config,
                apiKeyConfigured: state.apiKeyConfigured,
                apiKeyStorage: state.apiKeyStorage
            }
        },

        async save(patch: AiSaveConfigRequest): Promise<AiConfigSnapshot> {
            const stored = await readStoredFile()
            const nextConfig: AiStoredConfig = {
                ...(stored?.config ?? AI_DEFAULT_CONFIG),
                ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
                ...(patch.provider !== undefined ? { provider: patch.provider } : {}),
                ...(patch.localProvider !== undefined
                    ? { localProvider: patch.localProvider }
                    : {}),
                ...(patch.baseUrl !== undefined ? { baseUrl: patch.baseUrl } : {}),
                ...(patch.model !== undefined ? { model: patch.model } : {})
            }
            let nextApiKey: StoredApiKey | null = stored?.apiKey ?? null
            if (patch.clearApiKey === true) {
                nextApiKey = null
                memoryApiKey = null
            } else if (patch.apiKey !== undefined) {
                const trimmed = patch.apiKey
                if (isSafeStorageAvailable() && safeStorage) {
                    try {
                        const cipher = safeStorage.encryptString(trimmed).toString('base64')
                        nextApiKey = { encrypted: true, cipher }
                        memoryApiKey = null
                    } catch (error) {
                        // 加密失败：绝不退化为明文落盘——改为仅会话内存并记录告警
                        logger.warn(
                            '[AI] safeStorage 加密 API Key 失败，本次会话改为仅内存保存：',
                            error
                        )
                        nextApiKey = null
                        memoryApiKey = trimmed
                    }
                } else {
                    // safeStorage 不可用：仅会话内存，**不写盘**
                    nextApiKey = null
                    memoryApiKey = trimmed
                }
            }
            const data: StoredAiConfigFile = {
                version: AI_CONFIG_VERSION,
                config: nextConfig,
                apiKey: nextApiKey
            }
            await writeStoredFile(data)
            logger.info(
                `[AI] AI 配置已保存（provider=${nextConfig.provider}/${nextConfig.localProvider}，` +
                    `enabled=${nextConfig.enabled}，密钥${nextApiKey ? '已加密保存' : memoryApiKey ? '仅会话内存' : '未配置'}）`
            )
            return {
                ...nextConfig,
                apiKeyConfigured: nextApiKey !== null || memoryApiKey !== null,
                apiKeyStorage: isSafeStorageAvailable() ? 'safe' : 'memory'
            }
        },

        async getRuntimeApiKey(): Promise<string | null> {
            if (memoryApiKey !== null && memoryApiKey.length > 0) {
                return memoryApiKey
            }
            if (!isSafeStorageAvailable() || !safeStorage) {
                return null
            }
            const stored = await readStoredFile()
            const storedKey = stored?.apiKey ?? null
            if (!storedKey) {
                return null
            }
            try {
                const decrypted = safeStorage.decryptString(Buffer.from(storedKey.cipher, 'base64'))
                return decrypted.length > 0 ? decrypted : null
            } catch (error) {
                // 解密失败（换机/系统凭据重置）：不清空文件，仅本次按未配置处理
                logger.warn('[AI] safeStorage 解密 API Key 失败，本次请求按未配置密钥处理：', error)
                return null
            }
        }
    }
}
