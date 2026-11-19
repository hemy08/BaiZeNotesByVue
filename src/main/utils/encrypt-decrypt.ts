import crypto from 'crypto'
import type { Cipher, Decipher } from 'crypto'
import { sendToMainWindow } from './app-state'
import { logger } from './logger'
import { IPC } from '../../shared/ipc-channels'
// ARC-13 / 第 2 批契约重构：CryptoData / CryptoResult 已收敛到 src/shared/types/crypto.ts，
// HashResult（算法名 → 摘要字符串映射）在 shared/types/ipc.ts 已有定义——本文件删除本地
// 重复接口，统一 import type（与渲染层 HashText/HmacGenerator 消费的返回形状同一契约）。
import type { CryptoData, CryptoResult, HashResult } from '../../shared/types'

// 生成RSA密钥对
function generateRsaKeyPair(
    bits = 2048,
    publicKeyEncoding: { type: 'spki'; format: 'pem' } = {
        type: 'spki',
        format: 'pem'
    },
    privateKeyEncoding: { type: 'pkcs8'; format: 'pem' } = {
        type: 'pkcs8',
        format: 'pem'
    }
): Promise<{ publicKey: string; privateKey: string }> {
    return new Promise((resolve, reject) => {
        crypto.generateKeyPair(
            'rsa',
            {
                modulusLength: bits,
                publicKeyEncoding: publicKeyEncoding,
                privateKeyEncoding: privateKeyEncoding
            },
            (err, publicKey, privateKey) => {
                if (err) {
                    return reject(err)
                }
                resolve({ publicKey, privateKey })
            }
        )
    })
}

export function CreateRsaKeyPair(bits: number): void {
    generateRsaKeyPair(bits)
        .then(({ publicKey, privateKey }) => {
            // P2 非空断言治理：密钥生成是异步的，回调执行时主窗口可能已销毁，
            // 经 sendToMainWindow 安全发送（窗口不可用时静默跳过）。
            sendToMainWindow(IPC.PLUGIN.RSA_RESULT, publicKey, privateKey)
        })
        .catch((err) => {
            // 主进程日志统一走 logger（文件 + 控制台 + 状态栏）
            logger.error('[Crypto] RSA 密钥对生成失败：', err)
        })
}

const hashTextInput = [
    { text: 'MD4', algorithm: 'md4' },
    { text: 'MD5', algorithm: 'md5' },
    { text: 'SHA1', algorithm: 'sha1' },
    { text: 'SHA224', algorithm: 'sha224' },
    { text: 'SHA256', algorithm: 'sha256' },
    { text: 'SHA384', algorithm: 'sha384' },
    { text: 'SHA512', algorithm: 'sha512' },
    { text: 'SHA512-256', algorithm: 'sha512-256' },
    { text: 'RIPEMD160', algorithm: 'RIPEMD160' }
]

function DigestBufferToBinaryString(hexString: Buffer): string {
    return hexString
        .toString()
        .split('')
        .map((char) => {
            const binary = char.charCodeAt(0).toString(2)
            return binary.padStart(8, '0')
        })
        .join('')
}

export function CreateHash(context: string, encType: string): HashResult {
    let encoding: 'hex' | 'base64' | 'base64url' | 'binary' = 'hex'
    if (['binary', 'base64', 'base64url'].includes(encType.toLowerCase())) {
        encoding = encType.toLowerCase() as 'binary' | 'base64' | 'base64url'
    }
    const result: HashResult = {}
    hashTextInput.forEach((item) => {
        try {
            const hash = crypto.createHash(item.algorithm)
            hash.update(context)
            if (encoding === 'binary') {
                result[item.text] = DigestBufferToBinaryString(hash.digest())
            } else {
                result[item.text] = hash.digest(encoding)
            }
        } catch (error) {
            // 主进程日志统一走 logger（部分算法在当前 Node/OpenSSL 版本可能不可用）
            logger.error('[Crypto] 摘要计算失败：', item.algorithm, error)
        }
    })
    return result
}

export function CreateHmac(context: string, secKey: string, encType: string): HashResult {
    let encoding: 'hex' | 'base64' | 'base64url' | 'binary' = 'hex'
    if (['binary', 'base64', 'base64url'].includes(encType.toLowerCase())) {
        encoding = encType.toLowerCase() as 'binary' | 'base64' | 'base64url'
    }
    const result: HashResult = {}
    hashTextInput.forEach((item) => {
        try {
            const hmac = crypto.createHmac(item.algorithm, secKey)
            hmac.update(context)
            if (encoding === 'binary') {
                result[item.text] = DigestBufferToBinaryString(hmac.digest())
            } else {
                result[item.text] = hmac.digest(encoding)
            }
        } catch (error) {
            // 主进程日志统一走 logger
            logger.error('[Crypto] HMAC 计算失败：', item.algorithm, error)
        }
    })
    return result
}

/* ============================================================================
 * AS-13：GCM 类认证加密（AEAD）的 authTag 协议
 * ----------------------------------------------------------------------------
 * Node 24 起 `cipher.final(encoding)` 不再返回 GCM auth tag（实测返回空串），
 * 因此必须显式 `cipher.getAuthTag()` 取标签；解密侧必须在 `final()` 之前
 * `decipher.setAuthTag()`，否则认证必然失败。协议约定：
 * - 加密返回 CryptoResult.authTag：固定 16 字节，hex 编码（32 个十六进制字符）；
 * - 解密入参 CryptoData.authTag：GCM 类算法必填（缺失/格式非法直接抛明确错误）；
 * - 非 GCM 算法完全不读写 authTag，返回结构/行为与历史版本一致。
 * ========================================================================== */

/** GCM 默认认证标签长度（字节）：Node createCipheriv 未指定 authTagLength 时固定 16 字节 */
const GCM_AUTH_TAG_BYTES = 16
/** 16 字节标签的 hex 表现（32 个十六进制字符），解密入参格式校验 */
const GCM_AUTH_TAG_HEX_PATTERN = /^[0-9a-fA-F]{32}$/

/**
 * AS-13：GCM 类 Cipher 的认证标签能力。
 * @types/node 只在算法名匹配 `CipherGCMTypes` 字面量的重载上返回 CipherGCM/DecipherGCM，
 * 而本模块算法来自运行时字符串（dynamic），故用结构类型显式声明 GCM 专属方法，避免 any。
 */
interface GcmCipherLike extends Cipher {
    getAuthTag(): Buffer
}

/** AS-13：GCM 类 Decipher 的认证标签能力（setAuthTag 必须在 final 之前调用） */
interface GcmDecipherLike extends Decipher {
    setAuthTag(buffer: Buffer): this
}

/**
 * AS-13：GCM 类算法判定。
 * 优先按算法名 `*-gcm` 匹配；再兜底查询 Node cipherInfo.mode，
 * 兼容 `id-aes256-GCM` 之类别名（OpenSSL 名称大小写/前缀不同）。
 */
function isGcmAlgorithm(algorithm: string): boolean {
    if (/-gcm$/i.test(algorithm)) {
        return true
    }
    try {
        return crypto.getCipherInfo(algorithm)?.mode === 'gcm'
    } catch {
        return false
    }
}

/** AS-13：GCM 解密缺少 authTag 的明确错误（渲染层直接展示给用户） */
function missingGcmAuthTagError(): Error {
    return new Error(
        'GCM 解密需要 authTag（认证标签）：请提供 CryptoEncrypt 返回的 authTag（16 字节 hex，32 个十六进制字符）后再解密'
    )
}

/** AS-13：authTag 格式非法（非 hex / 长度不是 16 字节）的明确错误 */
function invalidGcmAuthTagError(authTag: string): Error {
    return new Error(
        `authTag 格式非法：GCM 认证标签必须是 ${GCM_AUTH_TAG_BYTES} 字节的 hex 字符串（32 个十六进制字符），当前长度 ${authTag.trim().length}`
    )
}

/** AS-13：GCM 认证失败（final 抛错）的明确错误，保留原始错误信息便于排查 */
function gcmAuthFailedError(cause: unknown): Error {
    const detail = cause instanceof Error ? cause.message : String(cause)
    return new Error(
        `GCM 解密认证失败：authTag 与密文/密钥/IV 不匹配，数据可能已被篡改（原始错误：${detail}）`
    )
}

export function CryptoEncrypt(data: CryptoData): CryptoResult {
    const cipherInfo = crypto.getCipherInfo(data.algorithm)
    if (!cipherInfo) {
        throw new Error(`Unsupported cipher algorithm: ${data.algorithm}`)
    }
    const isGcm = cipherInfo.mode === 'gcm' || isGcmAlgorithm(data.algorithm)
    let bufIv: Buffer
    if (!data.iv) {
        // 如果未提供IV，则生成一个（这取决于算法是否需要IV）
        // 注意：对于某些算法（如AES-GCM），IV是必需的
        bufIv = crypto.randomBytes(cipherInfo.ivLength ?? 16)
        data.iv = bufIv.toString()
    } else {
        bufIv = Buffer.from(data.iv, 'hex')
    }
    let secretKey: Buffer
    if (!data.secretKey) {
        data.secretKeyEncoding = 'hex'
        secretKey = crypto.randomBytes(cipherInfo.keyLength ?? 32)
    } else {
        secretKey = Buffer.from(data.secretKey, data.secretKeyEncoding)
    }
    const inputEncoding = data.inputEncoding || 'utf8'
    const outputEncoding = data.outputEncoding || 'hex'

    try {
        const cipher = crypto.createCipheriv(data.algorithm, secretKey, bufIv)
        let encrypted = cipher.update(data.context, inputEncoding, outputEncoding)
        encrypted += cipher.final(outputEncoding)
        const result: CryptoResult = {
            context: encrypted,
            iv: bufIv.toString('hex'),
            secretKey: secretKey.toString(data.secretKeyEncoding),
            secretKeyEncoding: data.secretKeyEncoding
        }
        // AS-13：GCM 必须在 final() 之后显式取认证标签（Node 24 的 final 不再返回 tag）
        if (isGcm) {
            result.authTag = (cipher as GcmCipherLike).getAuthTag().toString('hex')
        }
        return result
    } catch (error) {
        // CQ-05：加密失败时抛出异常，由调用方统一处理，不再把 Error 塞进返回值
        logger.error('CryptoEncrypt 加密失败:', error)
        throw error
    }
}

export function CryptoDecrypt(data: CryptoData): string {
    // AS-13：GCM 解密必须先拿到 authTag（16 字节 hex），缺失/格式非法时立即给出明确错误，
    // 不进入 Node crypto 分支（否则只会得到难以理解的 "Unsupported state" 报错）
    const isGcm = isGcmAlgorithm(data.algorithm)
    let authTag: Buffer | undefined
    if (isGcm) {
        // 运行时入参可能来自非本工具调用（requireCryptoData 不校验 authTag 类型），
        // 非字符串一律按"缺失"处理，避免 .trim() 抛出难以理解的 TypeError
        const rawAuthTag = typeof data.authTag === 'string' ? data.authTag.trim() : ''
        if (rawAuthTag.length === 0) {
            throw missingGcmAuthTagError()
        }
        if (!GCM_AUTH_TAG_HEX_PATTERN.test(rawAuthTag)) {
            throw invalidGcmAuthTagError(rawAuthTag)
        }
        authTag = Buffer.from(rawAuthTag, 'hex')
    }
    let bufIv: Buffer
    if (data.iv) {
        bufIv = Buffer.from(data.iv, 'hex')
    } else {
        const cipherInfo = crypto.getCipherInfo(data.algorithm)
        if (!cipherInfo) {
            throw new Error(`Unsupported cipher algorithm: ${data.algorithm}`)
        }
        bufIv = crypto.randomBytes(cipherInfo.ivLength ?? 16)
    }
    const bufKey = Buffer.from(data.secretKey, data.secretKeyEncoding)
    const inputEncoding = data.inputEncoding || 'hex'
    const outputEncoding = data.outputEncoding || 'utf8'
    try {
        const decipher = crypto.createDecipheriv(data.algorithm, bufKey, bufIv)
        // AS-13：setAuthTag 必须在 final() 之前调用，认证失败的明文绝不会被返回
        if (authTag) {
            const gcmDecipher = decipher as GcmDecipherLike
            gcmDecipher.setAuthTag(authTag)
        }
        let decrypted = decipher.update(data.context, inputEncoding, outputEncoding)
        try {
            decrypted += decipher.final(outputEncoding)
        } catch (error) {
            // AS-13：GCM 认证失败（tag 不匹配 / 密文被篡改）统一转换为明确错误文案
            if (isGcm) {
                throw gcmAuthFailedError(error)
            }
            throw error
        }
        return decrypted
    } catch (error) {
        // CQ-05：解密失败时抛出异常，由调用方统一处理，不再返回 Error 对象
        logger.error('CryptoDecrypt 解密失败:', error)
        throw error
    }
}
