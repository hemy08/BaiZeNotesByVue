<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.crypto.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsConvert.crypto.description') }}</p>
        <!--
            AS-13（P3）安全提示：ECB/DES/RC2/RC4/Blowfish 属已淘汰弱算法；
            GCM 为认证加密（AEAD），解密必须提供 authTag（加密成功后自动展示并填入），
            authTag 缺失或错误会导致解密失败。文案统一走 i18n 词典，随界面语言实时切换。
        -->
        <div
            v-if="securityWarnings.length > 0"
            class="crypto-security-warning"
            role="alert"
            data-testid="crypto-security-warning"
        >
            <strong>{{ securityWarningTitle }}</strong>
            <ul>
                <li v-for="warning in securityWarnings" :key="warning">{{ warning }}</li>
            </ul>
        </div>
        <div id="encrypt-area" class="div-style-display-column" :style="{ width: cryptoWidth }">
            <label for="input-text">{{ t('toolsConvert.crypto.inputLabel') }}</label>
            <textarea
                id="crypto-input-text"
                v-model="cryptoInput"
                :placeholder="t('toolsConvert.crypto.inputPlaceholder')"
                :style="{ width: cryptoWidth, height: '150px' }"
            ></textarea>
            <div style="margin-left: 25px; color: grey">
                {{ t('toolsConvert.crypto.encodingNoteLine1') }}
                <br />{{ t('toolsConvert.crypto.encodingNoteLine2') }}
            </div>
            <div class="div-style-display-row" style="margin-top: 5px">
                <label for="input-crypto-secret-key" class="crypto-text-label">
                    {{ t('toolsConvert.crypto.secretKeyLabel') }}
                </label>
                <input
                    id="input-crypto-secret-key"
                    v-model="cryptoSecretKey"
                    :style="{ width: secretWidth, marginLeft: '20px' }"
                    type="text"
                    :placeholder="t('toolsConvert.crypto.secretKeyPlaceholder')"
                />
            </div>
            <div class="div-style-display-row" style="margin-top: 5px">
                <label class="crypto-text-label">{{
                    t('toolsConvert.crypto.secretEncodingLabel')
                }}</label>
                <select v-model="cryptoSecretKeyEncoding" style="margin-left: 20px">
                    <option
                        v-for="item in CryptoEncoding"
                        :id="item.id"
                        :key="item.id"
                        :value="item.value"
                    >
                        {{ encodingText(item) }}
                    </option>
                </select>
            </div>
            <div class="div-style-display-row" style="margin-top: 5px">
                <label class="crypto-text-label">{{
                    t('toolsConvert.crypto.algorithmLabel')
                }}</label>
                <select v-model="cryptoAlgorithm" style="margin-left: 20px">
                    <option
                        v-for="item in CryptoAlgorithm"
                        :id="item.id"
                        :key="item.id"
                        :value="item.value"
                    >
                        {{ item.text }}
                    </option>
                </select>
            </div>
            <div class="div-style-display-row" style="margin-top: 5px">
                <label class="crypto-text-label">{{
                    t('toolsConvert.crypto.inputEncodingLabel')
                }}</label>
                <select v-model="cryptoInputEncoding" style="margin-left: 20px">
                    <option
                        v-for="item in CryptoEncoding"
                        :id="item.id"
                        :key="item.id"
                        :value="item.value"
                    >
                        {{ encodingText(item) }}
                    </option>
                </select>
            </div>
            <div class="div-style-display-row" style="margin-top: 5px">
                <label class="crypto-text-label">{{
                    t('toolsConvert.crypto.outputEncodingLabel')
                }}</label>
                <select v-model="cryptoOutputEncoding" style="margin-left: 20px">
                    <option
                        v-for="item in CryptoEncoding"
                        :id="item.id"
                        :key="item.id"
                        :value="item.value"
                    >
                        {{ encodingText(item) }}
                    </option>
                </select>
            </div>
            <div class="div-style-display-row" style="margin-top: 5px">
                <label class="crypto-text-label" for="crypto-iv">IV</label>
                <input
                    id="crypto-iv"
                    v-model="cryptoIvBuffer"
                    :style="{ width: secretWidth, marginLeft: '20px' }"
                    type="text"
                    :placeholder="t('toolsConvert.crypto.ivPlaceholder')"
                />
            </div>
            <div style="margin-left: 25px; color: grey">
                {{ t('toolsConvert.crypto.fixedResultNoteLine1') }}
                <br />{{ t('toolsConvert.crypto.fixedResultNoteLine2') }}
            </div>
            <!-- AS-13：GCM 认证标签（加密成功后自动填入；解密前需存在） -->
            <div
                v-if="isGcmMode"
                class="div-style-display-row"
                style="margin-top: 5px"
                data-testid="crypto-auth-tag-row"
            >
                <label class="crypto-text-label" for="crypto-auth-tag">
                    {{ t('toolsConvert.crypto.authTagLabel') }}
                </label>
                <input
                    id="crypto-auth-tag"
                    v-model="cryptoAuthTag"
                    :style="{ width: secretWidth, marginLeft: '20px' }"
                    type="text"
                    :placeholder="t('toolsConvert.crypto.authTagPlaceholder')"
                />
            </div>
            <div v-if="isGcmMode" style="margin-left: 25px; color: grey">
                {{ t('toolsConvert.crypto.authTagNote') }}
            </div>
            <div class="div-style-display-column" style="margin-top: 5px">
                <label for="encrypt-result">{{ t('toolsConvert.crypto.resultLabel') }}</label>
                <textarea
                    id="encrypt-result"
                    v-model="EncryptResult"
                    :placeholder="t('toolsConvert.crypto.resultPlaceholder')"
                    :style="{ width: cryptoWidth, height: '150px' }"
                ></textarea>
            </div>
        </div>
        <div class="plugin-tools-btn-list" :style="{ width: cryptoWidth }">
            <button id="text-encrypt" class="plugin-tools-btn" @click="CryptoEncryptResult">
                {{ t('toolsConvert.crypto.encryptButton') }}
            </button>
            <button id="text-decrypt" class="plugin-tools-btn" @click="CryptoDecryptResult">
                {{ t('toolsConvert.crypto.decryptButton') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import { IPC } from '../../../../../shared/ipc-channels'
// 全局类型 BufferEncoding 由 @types/node 的 declare global 提供
/* global BufferEncoding */
// 第 2 批契约重构：加解密 IPC 契约统一引用 shared/types/crypto.ts——
// 请求载荷用 CryptoWireData（渲染层传输形态：编码字段 string、secretKey 可空），
// 加密响应直接用主进程 CryptoResult（类型对齐，运行时结构不变；cast 行为保持原样）。
import type { CryptoResult, CryptoWireData } from '../../../../../shared/types'
import { logger } from '../../../common/logger'

const props = defineProps({
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const workWidth = computed(() => parseInt(props.workAreaWidth.replace('px', ''), 10))

const cryptoWidth = computed(() => workWidth.value - 30 + 'px')

const secretWidth = computed(() => workWidth.value - 400 + 'px')

const cryptoInput = ref('')
const cryptoSecretKey = ref('')
const cryptoAlgorithm = ref('aes-256-cbc')
const cryptoIvBuffer = ref('')
/** AS-13：GCM 认证标签（加密成功后由主进程返回并自动填入；解密时需携带） */
const cryptoAuthTag = ref('')
const cryptoSecretKeyEncoding = ref('utf8')
const cryptoInputEncoding = ref('utf8')
const cryptoOutputEncoding = ref('hex')
const EncryptResult = ref('')

const CryptoAlgorithm = [
    { id: 'crypto-alg-aes-128-cbc', value: 'aes-128-cbc', text: 'AES-128-CBC', keyLength: 16 },
    { id: 'crypto-alg-aes-128-cfb', value: 'aes-128-cfb', text: 'AES-128-CFB', keyLength: 16 },
    { id: 'crypto-alg-aes-128-ctr', value: 'aes-128-ctr', text: 'AES-128-CTR', keyLength: 16 },
    { id: 'crypto-alg-aes-128-ecb', value: 'aes-128-ecb', text: 'AES-128-ECB', keyLength: 16 },
    { id: 'crypto-alg-aes-128-gcm', value: 'aes-128-gcm', text: 'AES-128-GCM', keyLength: 16 },
    { id: 'crypto-alg-aes-128-ofb', value: 'aes-128-ofb', text: 'AES-128-OFB', keyLength: 16 },
    { id: 'crypto-alg-aes-192-cbc', value: 'aes-192-cbc', text: 'AES-192-CBC', keyLength: 24 },
    { id: 'crypto-alg-aes-192-ctr', value: 'aes-192-ctr', text: 'AES-192-CTR', keyLength: 24 },
    { id: 'crypto-alg-aes-192-ecb', value: 'aes-192-ecb', text: 'AES-192-ECB', keyLength: 24 },
    { id: 'crypto-alg-aes-192-gcm', value: 'aes-192-gcm', text: 'AES-192-GCM', keyLength: 24 },
    { id: 'crypto-alg-aes-192-ofb', value: 'aes-192-ofb', text: 'AES-192-OFB', keyLength: 24 },
    { id: 'crypto-alg-aes-256-cbc', value: 'aes-256-cbc', text: 'AES-256-CBC', keyLength: 32 },
    { id: 'crypto-alg-aes-256-cfb', value: 'aes-256-cfb', text: 'AES-256-CFB', keyLength: 32 },
    { id: 'crypto-alg-aes-256-ctr', value: 'aes-256-ctr', text: 'AES-256-CTR', keyLength: 32 },
    { id: 'crypto-alg-aes-256-ecb', value: 'aes-256-ecb', text: 'AES-256-ECB', keyLength: 32 },
    { id: 'crypto-alg-aes-256-gcm', value: 'aes-256-gcm', text: 'AES-256-GCM', keyLength: 32 },
    { id: 'crypto-alg-aes-256-ofb', value: 'aes-256-ofb', text: 'AES-256-OFB', keyLength: 32 },
    { id: 'crypto-alg-bf-cbc', value: 'bf-cbc', text: 'BF-CBC', keyLength: 8 },
    { id: 'crypto-alg-bf-cfb', value: 'bf-cfb', text: 'BF-CFB', keyLength: 8 },
    { id: 'crypto-alg-bf-ecb', value: 'bf-ecb', text: 'BF-ECB', keyLength: 8 },
    { id: 'crypto-alg-des-cbc', value: 'des-cbc', text: 'DES-CBC', keyLength: 8 },
    { id: 'crypto-alg-des-ecb', value: 'des-ecb', text: 'DES-ECB', keyLength: 16 },
    { id: 'crypto-alg-des-ede', value: 'des-ede', text: 'DES-EDE', keyLength: 16 },
    { id: 'crypto-alg-des-ede-cbc', value: 'des-ede-cbc', text: 'DES-EDE-CBC', keyLength: 16 },
    { id: 'crypto-alg-des-ede3', value: 'des-ede3', text: 'DES-EDE3', keyLength: 24 },
    { id: 'crypto-alg-des-ede3-cbc', value: 'des-ede3-cbc', text: 'DES-EDE3-CBC', keyLength: 24 },
    { id: 'crypto-alg-rc2-cbc', value: 'rc2-cbc', text: 'RC2-CBC', keyLength: 16 },
    { id: 'crypto-alg-rc4', value: 'rc4', text: 'RC4', keyLength: 16 }
]

/* ============================ AS-13：算法安全提示 ============================ */

/** AS-13：已淘汰的弱算法判定（ECB 分组模式 / DES 族 / RC2 / RC4 / Blowfish） */
const WEAK_ALGORITHM_PATTERN = /^(des-|bf-|rc2|rc4)|-ecb$/i
/** AS-13：GCM 认证加密判定（GCM 解密必须携带 authTag，主进程已打通 getAuthTag/setAuthTag） */
const GCM_ALGORITHM_PATTERN = /-gcm$/i

/** AS-13：是否处于 GCM 认证加密模式（决定 authTag 输入区是否展示、解密是否校验 authTag） */
const isGcmMode = computed(() => GCM_ALGORITHM_PATTERN.test(cryptoAlgorithm.value))

const securityWarnings = computed<string[]>(() => {
    // AS-13：文案统一走 i18n 词典（t 读取响应式 currentLocale，切换语言实时更新）
    const warnings: string[] = []
    if (WEAK_ALGORITHM_PATTERN.test(cryptoAlgorithm.value)) {
        warnings.push(t('toolsConvert.crypto.weakAlgorithmWarning'))
    }
    if (isGcmMode.value) {
        warnings.push(t('toolsConvert.crypto.gcmAuthTagWarning'))
    }
    return warnings
})

const securityWarningTitle = computed(() => t('toolsConvert.crypto.securityWarningTitle'))

interface CryptoEncodingOption {
    id: string
    value: string
    /** 技术名词（ASCII/BASE64 等）：中英一致，原样展示 */
    text?: string
    /** 含中文的条目：展示时按界面语言翻译 */
    textKey?: string
}

const CryptoEncoding: CryptoEncodingOption[] = [
    { id: 'input-encoding-ascii', value: 'ascii', text: 'ASCII' },
    { id: 'input-encoding-binary', value: 'binary', textKey: 'toolsConvert.crypto.encodingBinary' },
    { id: 'input-encoding-base64', value: 'base64', text: 'BASE64' },
    { id: 'input-encoding-hex', value: 'hex', textKey: 'toolsConvert.crypto.encodingHex' },
    { id: 'input-encoding-latin1', value: 'latin1', text: 'Latin1(ISO 8859-1)' },
    { id: 'input-encoding-ucs-2', value: 'ucs2', text: 'UCS-2' },
    { id: 'input-encoding-utf8', value: 'utf8', text: 'UTF-8' },
    { id: 'input-encoding-utf16le', value: 'utf16le', text: 'UTF 16LE' }
]

/** 编码选项文案：技术名词原样展示，其余走词典（保证切换语言时随渲染更新） */
function encodingText(item: CryptoEncodingOption): string {
    return item.textKey ? t(item.textKey) : (item.text ?? '')
}

/**
 * 渲染层构造的加密/解密请求载荷。
 * 第 2 批契约重构：删除本地 partial 副本，类型别名指向 shared CryptoWireData
 * （secretKey 可选、编码字段 string——与表单 ref 的实际类型一致）；
 * 主进程仍按 shared CryptoData（Node BufferEncoding）消费，运行期校验逻辑不变。
 */
export type CryptoData = CryptoWireData

function checkSecretKey(): string {
    const item = CryptoAlgorithm.find((algo) => algo.value === cryptoAlgorithm.value)
    if (!cryptoSecretKey.value.length || !item) {
        return ''
    }
    // 输入长度不是0，且不是要求长度，则报错
    const secretKey = Buffer.from(
        cryptoSecretKey.value,
        cryptoSecretKeyEncoding.value as BufferEncoding
    )
    if (secretKey.length !== item.keyLength) {
        return t('toolsConvert.crypto.secretKeyLengthError', {
            algorithm: item.text,
            length: item.keyLength
        })
    }
    return ''
}

function fillEncDecData(): CryptoData {
    const data: CryptoData = {
        context: cryptoInput.value,
        secretKey: cryptoSecretKey.value,
        secretKeyEncoding: cryptoSecretKeyEncoding.value || 'utf8',
        algorithm: cryptoAlgorithm.value,
        inputEncoding: cryptoInputEncoding.value || 'utf8',
        outputEncoding: cryptoOutputEncoding.value || 'hex'
    }
    if (cryptoIvBuffer.value) {
        data.iv = cryptoIvBuffer.value
    }
    // AS-13：GCM 解密把 authTag 一并传入主进程（setAuthTag → final 认证）；
    // 非 GCM 算法不发送该字段，保持历史 IPC 载荷结构不变。
    if (isGcmMode.value && cryptoAuthTag.value.trim()) {
        data.authTag = cryptoAuthTag.value.trim()
    }

    return data
}

/** CQ-10/PF-11/ARC-21：invoke 返回的加密结果结构（第 2 批：统一引用 shared CryptoResult） */

/** CQ-05：异步 IPC 失败统一提示——invoke 改为 Promise 后必须 await + catch，避免静默失败 */
function showCryptoError(action: string, failedKey: string, error: unknown): void {
    logger.error(`${action}失败:`, error)
    alert(t(failedKey, { error: error instanceof Error ? error.message : String(error) }))
}

async function CryptoEncryptResult(): Promise<void> {
    if (!cryptoInput.value) {
        alert(t('toolsConvert.crypto.emptyInputAlert'))
        return
    }
    const result = checkSecretKey()
    if (result.length) {
        alert(result)
        return
    }
    const data = fillEncDecData()
    try {
        // CQ-10/PF-11/ARC-21：sendSync 同步 IPC 改为 invoke 异步，等待主进程计算期间不阻塞渲染进程
        const encRes = (await window.electron.ipcRenderer.invoke(
            IPC.PLUGIN.CRYPTO_ENCRYPT,
            data
        )) as CryptoResult
        EncryptResult.value = encRes.context
        cryptoIvBuffer.value = encRes.iv
        cryptoSecretKey.value = encRes.secretKey
        cryptoSecretKeyEncoding.value = encRes.secretKeyEncoding
        // AS-13：GCM 加密结果带回 authTag，展示并供后续解密直接复用；非 GCM 清空残留标签
        cryptoAuthTag.value = encRes.authTag ?? ''
    } catch (error) {
        showCryptoError('加密', 'toolsConvert.crypto.encryptFailed', error)
    }
}

async function CryptoDecryptResult(): Promise<void> {
    if (!cryptoInput.value) {
        alert(t('toolsConvert.crypto.emptyInputAlert'))
        return
    }
    const result = checkSecretKey()
    if (result.length) {
        alert(result)
        return
    }
    // AS-13：GCM 解密必须先有 authTag，缺失时直接提示，不发起必然失败的 IPC 调用
    if (isGcmMode.value && cryptoAuthTag.value.trim().length === 0) {
        alert(t('toolsConvert.crypto.authTagRequiredAlert'))
        return
    }
    const data = fillEncDecData()
    try {
        // CQ-10/PF-11/ARC-21：sendSync → invoke，返回字符串与原同步语义一致
        EncryptResult.value = (await window.electron.ipcRenderer.invoke(
            IPC.PLUGIN.CRYPTO_DECRYPT,
            data
        )) as string
    } catch (error) {
        showCryptoError('解密', 'toolsConvert.crypto.decryptFailed', error)
    }
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';
.crypto-text-label {
    width: 175px;
    background-color: lightblue;
    border: none;
    text-align: center;
}
/* AS-13：弱算法 / GCM 认证加密不可用的安全提示（默认随选择展示） */
.crypto-security-warning {
    margin: 8px 0;
    padding: 8px 12px;
    border: 1px solid #d97706;
    border-radius: 4px;
    background-color: rgba(217, 119, 6, 0.12);
    color: #b45309;
    font-size: 13px;
    line-height: 1.5;
}
.crypto-security-warning ul {
    margin: 4px 0 0;
    padding-left: 20px;
}
</style>
