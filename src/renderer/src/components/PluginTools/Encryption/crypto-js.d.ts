/**
 * crypto-js 4.2.0 未随包提供类型声明，项目也未安装 @types/crypto-js。
 * 开启 noImplicitAny 后，未声明模块的默认导入会触发 TS7016（隐式 any）。
 *
 * 本文件只声明项目实际用到的 API 子集（EncryptDecrypt.vue），并给出精确类型
 * 而不是 any：
 * - 7 个对称加密算法 helper：AES/DES/TripleDES/RC4/RC4Drop/Rabbit/RabbitLegacy
 * - enc.Utf8 / enc.Hex 等编解码器
 * - mode.*（分组模式）与 pad.*（填充策略）常量
 * - lib.WordArray.random 与 CipherParams/DecryptedMessage 的 toString
 *
 * 注意：
 * 1. 本文件不含顶层 import/export，保持为"环境模块声明"（ambient module），
 *    与 Markdown/monaco-worker-types.ts 的做法一致；若加上顶层导入会退化为
 *    模块增强（augmentation）而对未声明模块报错。
 * 2. 若后续通过 npm 安装 @types/crypto-js，请删除本文件避免重复声明。
 */
declare module 'crypto-js' {
    /** crypto-js WordArray：字（32 位）数组，可编码为 Hex/Utf8/Base64 等 */
    export interface WordArray {
        toString(encoder?: Encoder): string
    }

    /** 编码器/解码器（CryptoJS.enc.Utf8、CryptoJS.enc.Hex 等） */
    export interface Encoder {
        stringify(wordArray: WordArray): string
        parse(value: string): WordArray
    }

    /** 分组模式常量（CryptoJS.mode.*）：仅作为配置值透传，不直接调用 */
    export interface Mode {
        readonly __cryptoJsMode?: never
    }

    /** 填充策略常量（CryptoJS.pad.*）：仅作为配置值透传，不直接调用 */
    export interface Padding {
        readonly __cryptoJsPadding?: never
    }

    /** 加解密配置：可选的 IV、分组模式、填充策略 */
    export interface CipherConfig {
        iv?: WordArray
        mode?: Mode
        padding?: Padding
    }

    /** 解密结果：toString(CryptoJS.enc.Utf8) 还原明文 */
    export interface DecryptedMessage {
        toString(encoder?: Encoder): string
    }

    /** 加密结果（CipherParams）：toString() 默认输出 Base64 密文 */
    export interface CipherParams {
        toString(encoder?: Encoder): string
    }

    /** 算法 helper（CryptoJS.AES 等）对外暴露的加解密方法 */
    export interface CipherHelper {
        encrypt(message: string, key: WordArray, config?: CipherConfig): CipherParams
        decrypt(ciphertext: string, key: WordArray, config?: CipherConfig): DecryptedMessage
    }

    export interface ModeMap {
        CBC: Mode
        CFB: Mode
        CTR: Mode
        CTRGladman: Mode
        OFB: Mode
        ECB: Mode
    }

    export interface PadMap {
        Pkcs7: Padding
        AnsiX923: Padding
        Iso10126: Padding
        Iso97971: Padding
        ZeroPadding: Padding
        NoPadding: Padding
    }

    /** CryptoJS.enc 下项目用到的编码器集合 */
    export interface EncMap {
        Utf8: Encoder
        Hex: Encoder
        Base64: Encoder
        Latin1: Encoder
    }

    export interface LibMap {
        WordArray: {
            /** 生成指定字节数的随机 WordArray（IV 随机化用） */
            random(nBytes: number): WordArray
        }
    }

    export interface CryptoJSStatic {
        AES: CipherHelper
        DES: CipherHelper
        TripleDES: CipherHelper
        RC4: CipherHelper
        RC4Drop: CipherHelper
        Rabbit: CipherHelper
        RabbitLegacy: CipherHelper
        enc: EncMap
        mode: ModeMap
        pad: PadMap
        lib: LibMap
    }

    const CryptoJS: CryptoJSStatic
    export default CryptoJS
}
