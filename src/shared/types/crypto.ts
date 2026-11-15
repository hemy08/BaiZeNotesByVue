/**
 * 加解密插件类型（ARC-13：主进程唯一真源，跨进程 IPC 负载）
 *
 * 收敛前 CryptoData / CryptoResult 是 src/main/global-types.d.ts 中的全局声明，
 * 主进程 encrypt-decrypt.ts / utils.ts 与 tests/unit/encrypt-decrypt.test.ts 以
 * 全局类型方式引用；现迁入 shared 并改为显式 import type，全局声明删除。
 *
 * 说明：渲染层 CryptoEncDec.vue 内另有同名本地 CryptoData（secretKey 可选、
 * 编码字段为 string）。两者形状存在实际差异（渲染层 ref 为 string，主进程按
 * Node BufferEncoding 消费），强行合并需要改动主进程实现或渲染层 ref 类型，
 * 超出纯类型层改动范围，本次保留并在 r3-types-changes.md 记为遗留项。
 * 本文件结构与收敛前主进程全局声明完全一致。
 */
export interface CryptoData {
    context: string
    secretKey: string
    secretKeyEncoding: BufferEncoding
    algorithm: string
    inputEncoding?: BufferEncoding
    outputEncoding?: BufferEncoding
    iv?: string
    /**
     * AS-13：GCM 类认证加密（AEAD）的认证标签（16 字节，hex 编码，32 个字符）。
     *
     * - 加密请求忽略该字段（由主进程在 `cipher.final()` 后 `getAuthTag()` 生成）；
     * - 解密请求对 GCM 类算法必填：主进程在 `decipher.final()` 前 `setAuthTag()`，
     *   缺失或错误都会导致认证失败（明确报错，不返回错误明文）；
     * - 非 GCM 算法忽略该字段，行为与历史版本完全一致。
     */
    authTag?: string
}

export interface CryptoResult {
    context: string
    secretKey: string
    secretKeyEncoding: BufferEncoding
    iv: string
    /**
     * AS-13：GCM 类算法加密时返回的认证标签（hex，16 字节即 32 个十六进制字符）；
     * 非 GCM 算法不返回该字段（保持历史返回结构不变）。
     */
    authTag?: string
}
