/**
 * 加解密插件类型（ARC-13 / 第 2 批契约重构：主进程唯一真源，跨进程 IPC 负载）
 *
 * 收敛前 CryptoData / CryptoResult 是 src/main/global-types.d.ts 中的全局声明，
 * 主进程 encrypt-decrypt.ts / utils.ts 与 tests/unit/encrypt-decrypt.test.ts 以
 * 全局类型方式引用；现迁入 shared 并改为显式 import type，全局声明删除。
 *
 * 第 2 批补充 CryptoWireData（渲染层 → 主进程的传输形态）：
 * - 渲染层 CryptoEncDec.vue 的插件表单状态是「用户输入的字符串」（编码下拉值 ref<string>，
 *   secretKey 在用户输入前为空），无法直接满足主进程 CryptoData 的 BufferEncoding 约束；
 * - 收敛前渲染层只能自建一份 partial 副本（secretKey 可选、编码字段 string），
 *   与主进程类型形状漂移。现把该传输形态收敛进 shared，渲染层据此构造请求、
 *   主进程仍以 CryptoData（Node BufferEncoding 语义）消费——运行期校验逻辑完全不变。
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

/**
 * 加解密请求的「渲染层传输形态」：经 IPC 结构化克隆传给主进程的载荷。
 *
 * 与 CryptoData 的差异只有两处（结构对齐、不改运行时逻辑）：
 * - `secretKey` 可选：渲染层表单在用户输入前为空串/未填，主进程运行期按算法校验；
 * - 编码字段为 string：渲染层下拉框值是字符串，主进程按 Node BufferEncoding 语义消费，
 *   renderer 侧无需伪造 Node 的 BufferEncoding 联合类型。
 *
 * 消费方：渲染层 CryptoEncDec.vue `fillEncDecData()` 构造请求；
 * 主进程 `src/main/ipc/crypto-ipc.ts` 的 `requireCryptoData()` 运行期校验后按 CryptoData 使用。
 */
export interface CryptoWireData {
    context: string
    secretKey?: string
    secretKeyEncoding: string
    algorithm: string
    inputEncoding: string
    outputEncoding: string
    iv?: string
    /** AS-13：GCM 解密必填（加密结果中的 authTag，16 字节 hex），非 GCM 不发送 */
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
