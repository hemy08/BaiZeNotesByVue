/**
 * Hash / HMAC 算法清单与摘要编码清单共享常量（公共接口归位第 1 批 1.15）。
 *
 * 现状：算法清单在 main 与 renderer 各写一份，且**主进程结果字典以显示文案（label）为 key**：
 * - main `src/main/utils/encrypt-decrypt.ts:56-66`：`hashTextInput` 的 `text`（结果字典 key）
 *   与 `algorithm`（Node crypto 算法名）；
 * - renderer `src/renderer/src/components/PluginTools/Encryption/HashText.vue:89-99` 与
 *   `HmacGenerator.vue:93-103`：同 9 项（`text` 用于结果回填与展示，`id` 为 DOM id）；
 * - 摘要编码：`HashText.vue:32-41` / `HmacGenerator.vue:30-35` 的 select 选项。
 *
 * ★ 契约：`HASH_ALGORITHMS` 的 `label` 必须与主进程 `hashTextInput[].text` 逐字一致——
 *   主进程 `CreateHash` / `CreateHmac` 返回 `{ [label]: digest }`，渲染层按 label 回填。
 *   重命名 label 会直接导致渲染层结果空白，因此本文件只抽常量、不修改任何文案值。
 * 本批次只新建常量、不改任何使用方（引用迁移由后续阶段负责）。
 */

/* ==================== 一、摘要算法清单（9 项） ==================== */

/** Hash / HMAC 算法项：id 为 Node crypto 算法名，label 为展示文案（同时是主进程结果字典 key） */
export interface HashAlgorithmOption {
    /** Node `crypto.createHash` / `createHmac` 使用的算法名 */
    readonly id: string
    /** 展示文案；必须与主进程 `hashTextInput[].text` 逐字一致（结果字典 key） */
    readonly label: string
}

/**
 * 9 项 Hash / HMAC 算法（顺序即界面展示顺序）。
 * 进程 / 用途：主进程 `CreateHash` / `CreateHmac` 计算；渲染层 HashText / HmacGenerator 展示与回填。
 * 来源：`src/main/utils/encrypt-decrypt.ts:56-66`（`text` → label、`algorithm` → id，逐字对齐）。
 */
export const HASH_ALGORITHMS: readonly HashAlgorithmOption[] = [
    { id: 'md4', label: 'MD4' },
    { id: 'md5', label: 'MD5' },
    { id: 'sha1', label: 'SHA1' },
    { id: 'sha224', label: 'SHA224' },
    { id: 'sha256', label: 'SHA256' },
    { id: 'sha384', label: 'SHA384' },
    { id: 'sha512', label: 'SHA512' },
    { id: 'sha512-256', label: 'SHA512-256' },
    { id: 'RIPEMD160', label: 'RIPEMD160' }
]

/* ==================== 二、摘要输出编码清单（4 项） ==================== */

/** 摘要输出编码项：id 为界面 select 的 value（经 IPC 传给主进程），label 为展示文案 */
export interface HashEncodingOption {
    /** 传给主进程的编码标识（主进程内部转小写后归一化：binary/base64/base64url，其余一律 hex） */
    readonly id: string
    /** 展示文案（含中文全角括号，与界面逐字一致） */
    readonly label: string
}

/**
 * 4 项摘要输出编码（顺序即界面展示顺序）。
 * 进程 / 用途：渲染层 select 选项 → 主进程 `CreateHash(context, encType)` 第三/第二参数。
 * 来源：`src/renderer/src/components/PluginTools/Encryption/HashText.vue:32-41` 与
 * `HmacGenerator.vue:30-35`（两处选项值 / 文案完全一致）。
 */
export const HASH_ENCODINGS: readonly HashEncodingOption[] = [
    { id: 'Binary', label: 'Binary（base2）' },
    { id: 'Hexadecimal', label: 'Hexadecimal（base16）' },
    { id: 'base64', label: 'Base64（base64）' },
    { id: 'Base64url', label: 'Base64url（base64 with url safe chars）' }
]
