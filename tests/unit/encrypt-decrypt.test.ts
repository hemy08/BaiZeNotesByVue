/**
 * encrypt_decrypt.ts 单元测试
 * 覆盖：CreateHash/CreateHmac 的算法集与编码、已知向量、边界输入；
 * CryptoEncrypt/CryptoDecrypt 的往返、幂等、自动密钥/IV、GCM、异常与边界；
 * CreateRsaKeyPair 的生成与失败路径
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import crypto from 'crypto'

vi.mock('electron', () => ({
    BrowserWindow: class {}
}))

import {
    CreateHash,
    CreateHmac,
    CreateRsaKeyPair,
    CryptoEncrypt,
    CryptoDecrypt
} from '../../src/main/utils/encrypt-decrypt'
import { appState } from '../../src/main/utils/app-state'
// ARC-13：CryptoData 已从全局声明迁入 src/shared/types/crypto.ts，测试改为显式类型导入
import type { CryptoData, CryptoResult } from '../../src/shared/types'

// 与源码 hashTextInput 一致的算法清单
const HASH_ALGORITHMS: Array<[string, string]> = [
    ['MD4', 'md4'],
    ['MD5', 'md5'],
    ['SHA1', 'sha1'],
    ['SHA224', 'sha224'],
    ['SHA256', 'sha256'],
    ['SHA384', 'sha384'],
    ['SHA512', 'sha512'],
    ['SHA512-256', 'sha512-256'],
    ['RIPEMD160', 'RIPEMD160']
]

describe('CreateHash', () => {
    it('should match known MD5 and SHA256 vectors with hex encoding', () => {
        const result = CreateHash('hello', 'hex')
        expect(result.MD5).toBe('5d41402abc4b2a76b9719d911017c592')
        expect(result.SHA256).toBe(
            '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
        )
    })

    it('should produce hex digests matching node crypto for every available algorithm', () => {
        const input = 'hello world'
        const result = CreateHash(input, 'hex')
        for (const [text, algorithm] of HASH_ALGORITHMS) {
            if (result[text] === undefined) continue
            expect(result[text], `algorithm ${text}`).toBe(
                crypto.createHash(algorithm).update(input).digest('hex')
            )
        }
    })

    it('should support base64 encoding', () => {
        const result = CreateHash('hello', 'base64')
        expect(result.MD5).toBe('XUFAKrxLKna5cZ2REBfFkg==')
        expect(result.SHA256).toBe(crypto.createHash('sha256').update('hello').digest('base64'))
    })

    it('should support base64url encoding without padding', () => {
        const result = CreateHash('hello', 'base64url')
        expect(result.MD5).toBe('XUFAKrxLKna5cZ2REBfFkg')
    })

    it('should convert the digest string to 8-bit binary strings', () => {
        const result = CreateHash('hello', 'binary')
        // 疑似 bug：DigestBufferToBinaryString 先做 Buffer.toString()（默认 utf8），
        // 大于 0x7F 的字节会变成 U+FFFD 替换符（16 位），导致 binary 输出损坏。
        // 此处按源码实际变换公式计算期望值（digest 字符串逐字符转 8 位二进制），
        // 并额外校验未损坏的 ASCII 前缀与替换符的存在。
        const digestString = crypto.createHash('md5').update('hello').digest().toString()
        const expected = digestString
            .split('')
            .map((c) => c.charCodeAt(0).toString(2).padStart(8, '0'))
            .join('')
        expect(result.MD5).toBe(expected)
        expect(result.MD5).toMatch(/^[01]+$/)
        // 正确的 ASCII 前缀：5d 41 40 2a
        expect(result.MD5.startsWith('01011101010000010100000000101010')).toBe(true)
        // 0xbc 等非法 utf8 字节被替换为 U+FFFD（65533）
        expect(result.MD5).toContain('1111111111111101')
    })

    it('should treat the encoding type case-insensitively', () => {
        const upper = CreateHash('hello', 'HEX')
        const lower = CreateHash('hello', 'hex')
        expect(upper.MD5).toBe(lower.MD5)
    })

    it('should fall back to hex for unknown encoding types', () => {
        const result = CreateHash('hello', 'rot13')
        expect(result.MD5).toBe('5d41402abc4b2a76b9719d911017c592')
    })

    it('should hash an empty input', () => {
        const result = CreateHash('', 'hex')
        expect(result.MD5).toBe('d41d8cd98f00b204e9800998ecf8427e')
        expect(result.SHA256).toBe(crypto.createHash('sha256').update('').digest('hex'))
    })

    it('should hash unicode input consistently with node crypto', () => {
        const result = CreateHash('白泽笔记', 'hex')
        expect(result.SHA256).toBe(crypto.createHash('sha256').update('白泽笔记').digest('hex'))
    })
})

describe('CreateHmac', () => {
    it('should match the RFC 4231 test case 2 vector for HMAC-SHA256', () => {
        const result = CreateHmac('The quick brown fox jumps over the lazy dog', 'key', 'hex')
        expect(result.SHA256).toBe(
            'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8'
        )
    })

    it('should produce digests matching node crypto for every available algorithm', () => {
        const input = 'payload'
        const key = 'secret-key'
        const result = CreateHmac(input, key, 'hex')
        for (const [text, algorithm] of HASH_ALGORITHMS) {
            if (result[text] === undefined) continue
            expect(result[text], `algorithm ${text}`).toBe(
                crypto.createHmac(algorithm, key).update(input).digest('hex')
            )
        }
    })

    it('should differ from plain hash for the same input', () => {
        const hash = CreateHash('message', 'hex')
        const hmac = CreateHmac('message', 'key', 'hex')
        expect(hmac.SHA256).not.toBe(hash.SHA256)
    })

    it('should work with an empty secret key', () => {
        const result = CreateHmac('message', '', 'hex')
        expect(result.SHA256).toBe(crypto.createHmac('sha256', '').update('message').digest('hex'))
    })

    it('should support base64 encoding', () => {
        const result = CreateHmac('message', 'key', 'base64')
        expect(result.SHA256).toBe(
            crypto.createHmac('sha256', 'key').update('message').digest('base64')
        )
    })
})

describe('CryptoEncrypt / CryptoDecrypt', () => {
    let key: string
    let iv: string

    beforeEach(() => {
        key = crypto.randomBytes(32).toString('hex')
        iv = crypto.randomBytes(16).toString('hex')
    })

    it('should roundtrip aes-256-cbc with explicit key and iv', () => {
        const encrypted = CryptoEncrypt({
            context: 'hello world',
            algorithm: 'aes-256-cbc',
            secretKey: key,
            secretKeyEncoding: 'hex',
            iv
        } as CryptoData)
        expect(encrypted.iv).toBe(iv)
        const decrypted = CryptoDecrypt({
            context: encrypted.context,
            algorithm: 'aes-256-cbc',
            secretKey: encrypted.secretKey,
            secretKeyEncoding: encrypted.secretKeyEncoding,
            iv: encrypted.iv
        } as CryptoData)
        expect(decrypted).toBe('hello world')
    })

    it('should be deterministic for the same key/iv/input (idempotent)', () => {
        const first = CryptoEncrypt({
            context: 'same input',
            algorithm: 'aes-256-cbc',
            secretKey: key,
            secretKeyEncoding: 'hex',
            iv
        } as CryptoData)
        const second = CryptoEncrypt({
            context: 'same input',
            algorithm: 'aes-256-cbc',
            secretKey: key,
            secretKeyEncoding: 'hex',
            iv
        } as CryptoData)
        expect(first.context).toBe(second.context)
        expect(first.iv).toBe(second.iv)
    })

    it('should generate key and iv automatically and still roundtrip', () => {
        const encrypted = CryptoEncrypt({
            context: 'auto generated',
            algorithm: 'aes-256-cbc'
        } as CryptoData)
        // 自动生成的 iv 为 16 字节 hex、key 为 32 字节 hex
        expect(encrypted.iv).toMatch(/^[0-9a-f]{32}$/)
        expect(encrypted.secretKey).toMatch(/^[0-9a-f]{64}$/)
        expect(encrypted.secretKeyEncoding).toBe('hex')
        const decrypted = CryptoDecrypt({
            context: encrypted.context,
            algorithm: 'aes-256-cbc',
            secretKey: encrypted.secretKey,
            secretKeyEncoding: encrypted.secretKeyEncoding,
            iv: encrypted.iv
        } as CryptoData)
        expect(decrypted).toBe('auto generated')
    })

    it('should generate a 12-byte iv for aes-256-gcm', () => {
        const encrypted = CryptoEncrypt({
            context: 'gcm payload',
            algorithm: 'aes-256-gcm',
            secretKey: key,
            secretKeyEncoding: 'hex'
        } as CryptoData)
        // GCM 的 ivLength 为 12 字节
        expect(encrypted.iv).toMatch(/^[0-9a-f]{24}$/)
    })

    /* ==================== AS-13：GCM authTag 认证加密协议 ==================== */

    /** AS-13：用固定 key 加密一段 GCM 明文，返回完整 CryptoResult */
    function encryptGcm(plaintext = 'gcm payload'): CryptoResult {
        return CryptoEncrypt({
            context: plaintext,
            algorithm: 'aes-256-gcm',
            secretKey: key,
            secretKeyEncoding: 'hex'
        } as CryptoData)
    }

    it('should return a 16-byte hex authTag for aes-256-gcm (AS-13)', () => {
        // Node 24 起 cipher.final(encoding) 不再返回 GCM auth tag（实测返回空串），
        // 主进程改为在 final() 后显式 cipher.getAuthTag()，标签随 CryptoResult.authTag 返回。
        const encrypted = encryptGcm()
        expect(encrypted.authTag).toMatch(/^[0-9a-f]{32}$/) // 16 字节 = 32 hex
        // 认证标签独立于密文返回：密文长度仍等于明文长度
        expect(encrypted.context).toHaveLength(2 * Buffer.byteLength('gcm payload'))
    })

    it('should roundtrip aes-256-gcm with the returned authTag (AS-13 真实往返)', () => {
        const plaintext = '白泽笔记 · GCM AEAD · 认证加密 ✅'
        const encrypted = encryptGcm(plaintext)
        expect(encrypted.authTag).toBeTruthy()

        const decrypted = CryptoDecrypt({
            context: encrypted.context,
            algorithm: 'aes-256-gcm',
            secretKey: encrypted.secretKey,
            secretKeyEncoding: encrypted.secretKeyEncoding,
            iv: encrypted.iv,
            authTag: encrypted.authTag
        } as CryptoData)
        expect(decrypted).toBe(plaintext)
    })

    it('should interop with raw node crypto GCM in both directions (AS-13 协议互操作)', () => {
        // 方向 1：本工具加密 → Node 原生解密，证明返回的 authTag 是标准 GCM tag
        const encrypted = encryptGcm('interop payload')
        expect(encrypted.authTag).toBeTruthy()
        const nodeDecipher = crypto.createDecipheriv(
            'aes-256-gcm',
            Buffer.from(encrypted.secretKey, 'hex'),
            Buffer.from(encrypted.iv, 'hex')
        )
        nodeDecipher.setAuthTag(Buffer.from(encrypted.authTag as string, 'hex'))
        const nodePlain =
            nodeDecipher.update(encrypted.context, 'hex', 'utf8') + nodeDecipher.final('utf8')
        expect(nodePlain).toBe('interop payload')

        // 方向 2：Node 原生加密 → 本工具解密，证明解密侧 setAuthTag 接线正确
        const nodeIv = crypto.randomBytes(12)
        const nodeCipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(key, 'hex'), nodeIv)
        let nodeCiphertext = nodeCipher.update('node payload', 'utf8', 'hex')
        nodeCiphertext += nodeCipher.final('hex')
        const nodeAuthTag = nodeCipher.getAuthTag().toString('hex')
        const oursPlain = CryptoDecrypt({
            context: nodeCiphertext,
            algorithm: 'aes-256-gcm',
            secretKey: key,
            secretKeyEncoding: 'hex',
            iv: nodeIv.toString('hex'),
            authTag: nodeAuthTag
        } as CryptoData)
        expect(oursPlain).toBe('node payload')
    })

    it('should roundtrip gcm with auto-generated key and iv (AS-13)', () => {
        const encrypted = CryptoEncrypt({
            context: 'auto generated gcm',
            algorithm: 'aes-256-gcm'
        } as CryptoData)
        expect(encrypted.iv).toMatch(/^[0-9a-f]{24}$/)
        expect(encrypted.secretKey).toMatch(/^[0-9a-f]{64}$/)
        expect(encrypted.authTag).toMatch(/^[0-9a-f]{32}$/)

        expect(
            CryptoDecrypt({
                context: encrypted.context,
                algorithm: 'aes-256-gcm',
                secretKey: encrypted.secretKey,
                secretKeyEncoding: encrypted.secretKeyEncoding,
                iv: encrypted.iv,
                authTag: encrypted.authTag
            } as CryptoData)
        ).toBe('auto generated gcm')
    })

    it('should throw a clear error when gcm decryption has no authTag (AS-13)', () => {
        const encrypted = encryptGcm()
        // 缺失 authTag：明确提示需要 authTag，而不是 Node 的 "Unsupported state" 模糊报错
        expect(() =>
            CryptoDecrypt({
                context: encrypted.context,
                algorithm: 'aes-256-gcm',
                secretKey: encrypted.secretKey,
                secretKeyEncoding: encrypted.secretKeyEncoding,
                iv: encrypted.iv
            } as CryptoData)
        ).toThrow('GCM 解密需要 authTag')
        // 空白字符串同样视为缺失
        expect(() =>
            CryptoDecrypt({
                context: encrypted.context,
                algorithm: 'aes-256-gcm',
                secretKey: encrypted.secretKey,
                secretKeyEncoding: encrypted.secretKeyEncoding,
                iv: encrypted.iv,
                authTag: '   '
            } as CryptoData)
        ).toThrow('GCM 解密需要 authTag')
    })

    it('should reject a malformed gcm authTag (AS-13)', () => {
        const encrypted = encryptGcm()
        const base = {
            context: encrypted.context,
            algorithm: 'aes-256-gcm',
            secretKey: encrypted.secretKey,
            secretKeyEncoding: encrypted.secretKeyEncoding,
            iv: encrypted.iv
        } as CryptoData
        // 长度不足 16 字节
        expect(() => CryptoDecrypt({ ...base, authTag: 'abcd' } as CryptoData)).toThrow(
            'authTag 格式非法'
        )
        // 非 hex 字符
        expect(() => CryptoDecrypt({ ...base, authTag: 'z'.repeat(32) } as CryptoData)).toThrow(
            'authTag 格式非法'
        )
        // 异常 IPC 载荷（非字符串）按缺失处理，不抛 TypeError
        expect(() =>
            CryptoDecrypt({ ...base, authTag: 12345 as unknown as string } as CryptoData)
        ).toThrow('GCM 解密需要 authTag')
    })

    it('should fail authentication when the gcm authTag is wrong (AS-13)', () => {
        const encrypted = encryptGcm('protected by tag')
        expect(() =>
            CryptoDecrypt({
                context: encrypted.context,
                algorithm: 'aes-256-gcm',
                secretKey: encrypted.secretKey,
                secretKeyEncoding: encrypted.secretKeyEncoding,
                iv: encrypted.iv,
                authTag: crypto.randomBytes(16).toString('hex')
            } as CryptoData)
        ).toThrow('GCM 解密认证失败')
    })

    it('should fail authentication when the gcm ciphertext is tampered (AS-13)', () => {
        const encrypted = encryptGcm('tamper me')
        const firstChar = encrypted.context[0] === '0' ? '1' : '0'
        const tamperedContext = firstChar + encrypted.context.slice(1)
        expect(() =>
            CryptoDecrypt({
                context: tamperedContext,
                algorithm: 'aes-256-gcm',
                secretKey: encrypted.secretKey,
                secretKeyEncoding: encrypted.secretKeyEncoding,
                iv: encrypted.iv,
                authTag: encrypted.authTag
            } as CryptoData)
        ).toThrow('GCM 解密认证失败')
    })

    it('should not touch authTag for non-gcm algorithms (AS-13 兼容性)', () => {
        // 非 GCM 加密结果不返回 authTag（历史返回结构保持不变）
        const encrypted = CryptoEncrypt({
            context: 'cbc payload',
            algorithm: 'aes-256-cbc',
            secretKey: key,
            secretKeyEncoding: 'hex',
            iv
        } as CryptoData)
        expect(encrypted.authTag).toBeUndefined()
        expect(encrypted).not.toHaveProperty('authTag')

        // 非 GCM 解密忽略 authTag 字段，行为与历史版本完全一致
        expect(
            CryptoDecrypt({
                context: encrypted.context,
                algorithm: 'aes-256-cbc',
                secretKey: encrypted.secretKey,
                secretKeyEncoding: encrypted.secretKeyEncoding,
                iv: encrypted.iv,
                authTag: 'unused-auth-tag'
            } as CryptoData)
        ).toBe('cbc payload')

        // 非 GCM 的 final() 失败仍抛 Node 原始错误（不被包装成 GCM 认证失败）
        let nonGcmError = ''
        try {
            CryptoDecrypt({
                context: 'ab', // 1 字节密文：不是分组长度整数倍，final() 确定性失败
                algorithm: 'aes-256-cbc',
                secretKey: key,
                secretKeyEncoding: 'hex',
                iv
            } as CryptoData)
        } catch (error) {
            nonGcmError = (error as Error).message
        }
        expect(nonGcmError).not.toContain('GCM')
        expect(nonGcmError).toMatch(/wrong final block length|bad decrypt/i)
    })

    it('should support OpenSSL GCM aliases via cipherInfo.mode fallback (AS-13)', () => {
        // "AES-256-GCM" 不含小写 "-gcm" 后缀，走 cipherInfo.mode === 'gcm' 兜底判定
        const encrypted = CryptoEncrypt({
            context: 'alias payload',
            algorithm: 'AES-256-GCM',
            secretKey: key,
            secretKeyEncoding: 'hex'
        } as CryptoData)
        expect(encrypted.authTag).toMatch(/^[0-9a-f]{32}$/)

        expect(
            CryptoDecrypt({
                context: encrypted.context,
                algorithm: 'AES-256-GCM',
                secretKey: encrypted.secretKey,
                secretKeyEncoding: encrypted.secretKeyEncoding,
                iv: encrypted.iv,
                authTag: encrypted.authTag
            } as CryptoData)
        ).toBe('alias payload')

        // 别名同样要求 authTag（不会静默进入无认证分支）
        expect(() =>
            CryptoDecrypt({
                context: encrypted.context,
                algorithm: 'AES-256-GCM',
                secretKey: encrypted.secretKey,
                secretKeyEncoding: encrypted.secretKeyEncoding,
                iv: encrypted.iv
            } as CryptoData)
        ).toThrow('GCM 解密需要 authTag')
    })

    it('should roundtrip base64 output encoding', () => {
        const encrypted = CryptoEncrypt({
            context: 'base64 test',
            algorithm: 'aes-256-cbc',
            secretKey: key,
            secretKeyEncoding: 'hex',
            iv,
            outputEncoding: 'base64'
        } as CryptoData)
        expect(() => Buffer.from(encrypted.context, 'base64').toString('base64')).not.toThrow()
        const decrypted = CryptoDecrypt({
            context: encrypted.context,
            algorithm: 'aes-256-cbc',
            secretKey: key,
            secretKeyEncoding: 'hex',
            iv,
            inputEncoding: 'base64',
            outputEncoding: 'utf8'
        } as CryptoData)
        expect(decrypted).toBe('base64 test')
    })

    it('should roundtrip unicode content', () => {
        const encrypted = CryptoEncrypt({
            context: '白泽笔记 · BaiZeNotes 🔐',
            algorithm: 'aes-256-cbc',
            secretKey: key,
            secretKeyEncoding: 'hex',
            iv
        } as CryptoData)
        const decrypted = CryptoDecrypt({
            context: encrypted.context,
            algorithm: 'aes-256-cbc',
            secretKey: key,
            secretKeyEncoding: 'hex',
            iv
        } as CryptoData)
        expect(decrypted).toBe('白泽笔记 · BaiZeNotes 🔐')
    })

    it('should roundtrip an empty string', () => {
        const encrypted = CryptoEncrypt({
            context: '',
            algorithm: 'aes-256-cbc',
            secretKey: key,
            secretKeyEncoding: 'hex',
            iv
        } as CryptoData)
        expect(encrypted.context).not.toBe('')
        const decrypted = CryptoDecrypt({
            context: encrypted.context,
            algorithm: 'aes-256-cbc',
            secretKey: key,
            secretKeyEncoding: 'hex',
            iv
        } as CryptoData)
        expect(decrypted).toBe('')
    })

    it('should throw for an unsupported cipher algorithm', () => {
        expect(() => CryptoEncrypt({ context: 'x', algorithm: 'rot13' } as CryptoData)).toThrow(
            'Unsupported cipher algorithm: rot13'
        )
    })

    it('should throw when the iv length is invalid', () => {
        expect(() =>
            CryptoEncrypt({
                context: 'x',
                algorithm: 'aes-256-cbc',
                secretKey: key,
                secretKeyEncoding: 'hex',
                iv: 'abcd'
            } as CryptoData)
        ).toThrow()
    })

    it('should throw when decrypting with a wrong key (GCM auth fails)', () => {
        const otherKey = crypto.randomBytes(32).toString('hex')
        const encrypted = CryptoEncrypt({
            context: 'protected',
            algorithm: 'aes-256-gcm',
            secretKey: key,
            secretKeyEncoding: 'hex'
        } as CryptoData)
        expect(() =>
            CryptoDecrypt({
                context: encrypted.context,
                algorithm: 'aes-256-gcm',
                secretKey: otherKey,
                secretKeyEncoding: 'hex',
                iv: encrypted.iv,
                authTag: encrypted.authTag
            } as CryptoData)
        ).toThrow('GCM 解密认证失败')
    })

    it('should throw when decrypting without a secret key', () => {
        expect(() =>
            CryptoDecrypt({ context: 'deadbeef', algorithm: 'aes-256-cbc', iv } as CryptoData)
        ).toThrow()
    })

    it('should set iv and secretKeyEncoding on the input object when missing', () => {
        const data = { context: 'mutation', algorithm: 'aes-256-cbc' } as unknown as CryptoData
        CryptoEncrypt(data)
        // 源码会直接改写传入对象：iv 存为原始字节的字符串，secretKeyEncoding 置为 hex
        expect(typeof data.iv).toBe('string')
        expect(data.iv!.length).toBeGreaterThan(0)
        expect(data.secretKeyEncoding).toBe('hex')
    })
})

describe('CreateRsaKeyPair', () => {
    beforeEach(() => {
        appState._resetForTesting()
    })

    it('should generate an RSA key pair and send PEMs to the main window', async () => {
        const send = vi.fn()
        appState.mainWindow = { webContents: { send } } as never
        CreateRsaKeyPair(1024)
        await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1), { timeout: 5000 })
        const [channel, publicKey, privateKey] = send.mock.calls[0]
        expect(channel).toBe('baize:plugin:rsa-result')
        expect(publicKey).toContain('-----BEGIN PUBLIC KEY-----')
        expect(publicKey).toContain('-----END PUBLIC KEY-----')
        expect(privateKey).toContain('-----BEGIN PRIVATE KEY-----')
        expect(privateKey).toContain('-----END PRIVATE KEY-----')
    })

    it('should not send anything when key generation fails (invalid bits)', async () => {
        const send = vi.fn()
        appState.mainWindow = { webContents: { send } } as never
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        CreateRsaKeyPair(0)
        // 等待异步 keygen 失败路径执行完毕
        await new Promise((resolve) => setTimeout(resolve, 300))
        expect(send).not.toHaveBeenCalled()
        errorSpy.mockRestore()
    })
})
