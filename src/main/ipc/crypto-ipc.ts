/**
 * IPC 注册收口（P2 架构债）：插件/加密工具通道
 *
 * 从 `src/main/utils/utils.ts` 的 `MainWindowListenUtilsEvent` 按域拆出：
 * - RSA 密钥生成（send 通道，结果经 RSA_RESULT 回推）；
 * - Hash / HMAC / 加解密四个 invoke 通道（CQ-10/PF-11/ARC-21：由 sendSync 改
 *   ipcMain.handle + 渲染层 invoke 异步应答，返回结构与异常语义保持不变）。
 *
 * AS-6 安全策略原样保留：发送方校验、RSA bits 白名单（防超大 modulusLength
 * 造成主进程 CPU/内存耗尽）、字符串/CryptoData 运行时入参校验；CQ-05 错误日志包装
 * 保证 handler 异常仍抛给 invoke 调用方（仅主进程补带通道名的日志）。
 */
import {
    CreateHash,
    CreateHmac,
    CreateRsaKeyPair,
    CryptoDecrypt,
    CryptoEncrypt
} from '../utils/encrypt-decrypt'
// AS-6：RSA 密钥长度归一化（白名单纯函数保留在 utils 层，IPC 层只消费）
import { sanitizeRsaBits } from '../utils/utils'
import { ipcListenerManager } from './ipc-listener-manager'
import { withSenderCheck } from '../utils/ipc-security'
import { IPC } from '../../shared/ipc-channels'
import type { CryptoData } from '../../shared/types'
import { withHandleErrorLog } from './handle-error-log'

/** 字符串入参校验：非字符串时抛出可被 invoke 调用方捕获的受控错误 */
function requireString(value: unknown, field: string): string {
    if (typeof value !== 'string') {
        throw new TypeError(`非法 IPC 入参：${field} 必须是字符串`)
    }
    return value
}

/** CryptoData 最小结构校验（algorithm/context 必填字符串，其余编码字段可选字符串） */
function requireCryptoData(value: unknown): CryptoData {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new TypeError('非法 IPC 入参：加密数据必须是对象')
    }
    const data = value as Record<string, unknown>
    if (typeof data.algorithm !== 'string' || data.algorithm.length === 0) {
        throw new TypeError('非法 IPC 入参：algorithm 必须是非空字符串')
    }
    if (typeof data.context !== 'string') {
        throw new TypeError('非法 IPC 入参：context 必须是字符串')
    }
    for (const field of [
        'secretKey',
        'secretKeyEncoding',
        'inputEncoding',
        'outputEncoding',
        'iv'
    ]) {
        const fieldValue = data[field]
        if (fieldValue !== undefined && typeof fieldValue !== 'string') {
            throw new TypeError(`非法 IPC 入参：${field} 必须是字符串`)
        }
    }
    // CQ-15：上一段已逐字段做运行时校验（algorithm/context 必填、5 个可选字段类型），
    // 但 TS 无法把 Record<string, unknown> 收窄为 CryptoData（字段间无判别式）；
    // 双重断言表达"校验通过即视为 CryptoData"，不改写运行时对象（保留未知可选字段）。
    return data as unknown as CryptoData
}

/**
 * 注册插件/加密工具域 IPC（RSA 生成 + Hash/HMAC/加解密四通道）。
 *
 * @param componentId 监听台账组件 ID（拆分前统一为 `global-utils-ipc`，保持不变）
 */
export function registerCryptoIpc(componentId: string): void {
    // AS-6：RSA 密钥生成通道补发送方校验 + bits 白名单（仅 1024/2048/3072/4096，
    // 非法值回退 2048；否则渲染层可传超大 modulusLength 让主进程长时间占用 CPU/内存）
    ipcListenerManager.registerOnce(
        IPC.PLUGIN.RSA_GENERATE,
        withSenderCheck(IPC.PLUGIN.RSA_GENERATE, (_: Electron.IpcMainEvent, bits: unknown) => {
            CreateRsaKeyPair(sanitizeRsaBits(bits))
        }),
        componentId
    )

    // CQ-10 / PF-11 / ARC-21：加密工具四个通道由 sendSync 同步应答（event.returnValue）
    // 改为 ipcMain.handle + 渲染层 invoke 异步应答，避免大文本计算期间冻结渲染进程。
    // 计算逻辑（CreateHash/CreateHmac/CryptoEncrypt/CryptoDecrypt）与返回结构保持不变；
    // 异常走 reject 交给 invoke 调用方 catch，主进程侧仅补日志（CQ-05）。
    // AS-6：四个通道均为主窗口专属能力（含密钥材料往返），补发送方校验 + 入参类型校验。
    ipcListenerManager.registerHandleOnce(
        IPC.PLUGIN.HASH_TEXT,
        withSenderCheck(
            IPC.PLUGIN.HASH_TEXT,
            withHandleErrorLog(
                IPC.PLUGIN.HASH_TEXT,
                (_event: Electron.IpcMainInvokeEvent, context: unknown, encType: unknown) =>
                    CreateHash(requireString(context, 'context'), requireString(encType, 'encType'))
            ),
            { kind: 'handle' }
        ),
        componentId
    )

    ipcListenerManager.registerHandleOnce(
        IPC.PLUGIN.HMAC_TEXT,
        withSenderCheck(
            IPC.PLUGIN.HMAC_TEXT,
            withHandleErrorLog(
                IPC.PLUGIN.HMAC_TEXT,
                (
                    _event: Electron.IpcMainInvokeEvent,
                    context: unknown,
                    secKey: unknown,
                    encType: unknown
                ) =>
                    CreateHmac(
                        requireString(context, 'context'),
                        requireString(secKey, 'secKey'),
                        requireString(encType, 'encType')
                    )
            ),
            { kind: 'handle' }
        ),
        componentId
    )

    ipcListenerManager.registerHandleOnce(
        IPC.PLUGIN.CRYPTO_ENCRYPT,
        withSenderCheck(
            IPC.PLUGIN.CRYPTO_ENCRYPT,
            withHandleErrorLog(
                IPC.PLUGIN.CRYPTO_ENCRYPT,
                (_event: Electron.IpcMainInvokeEvent, data: unknown) =>
                    CryptoEncrypt(requireCryptoData(data))
            ),
            { kind: 'handle' }
        ),
        componentId
    )

    ipcListenerManager.registerHandleOnce(
        IPC.PLUGIN.CRYPTO_DECRYPT,
        withSenderCheck(
            IPC.PLUGIN.CRYPTO_DECRYPT,
            withHandleErrorLog(
                IPC.PLUGIN.CRYPTO_DECRYPT,
                (_event: Electron.IpcMainInvokeEvent, data: unknown) =>
                    CryptoDecrypt(requireCryptoData(data))
            ),
            { kind: 'handle' }
        ),
        componentId
    )
}
