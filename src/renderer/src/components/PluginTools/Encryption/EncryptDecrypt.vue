<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsConvert.encryptDecrypt.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsConvert.encryptDecrypt.description') }}</p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://tools.w3cschool.cn/encryption')"
        >
            https://tools.w3cschool.cn/encryption
        </a>
        <div id="encrypt-area" class="div-style-display-column" :style="{ width: encDecWidth }">
            <label for="input-text">{{ t('toolsConvert.encryptDecrypt.inputLabel') }}</label>
            <textarea
                id="input-enc-dec-text"
                v-model="encDecInput"
                :placeholder="t('toolsConvert.encryptDecrypt.inputPlaceholder')"
                :style="{ width: encDecWidth, height: '80px' }"
            ></textarea>
            <div style="margin-top: 5px">
                <label for="input-secret-key">{{
                    t('toolsConvert.encryptDecrypt.secretKeyLabel')
                }}</label>
                <input
                    id="input-secret-key"
                    v-model="encDecSecKey"
                    style="margin-left: 10px"
                    type="text"
                    :placeholder="t('toolsConvert.encryptDecrypt.secretKeyPlaceholder')"
                />
            </div>
            <div style="margin-top: 5px">
                <label>{{ t('toolsConvert.encryptDecrypt.algorithmLabel') }}</label>
                <select v-model="encDecAlg" style="margin-left: 10px">
                    <option
                        v-for="item in EncryptAlg"
                        :id="item.id"
                        :key="item.id"
                        :value="item.value"
                    >
                        {{ optionText(item) }}
                    </option>
                </select>
            </div>
            <div style="margin-top: 5px">
                <label>{{ t('toolsConvert.encryptDecrypt.modeLabel') }}</label>
                <select v-model="encDecMod" style="margin-left: 10px">
                    <option
                        v-for="item in EncryptMode"
                        :id="item.id"
                        :key="item.id"
                        :value="item.value"
                    >
                        {{ optionText(item) }}
                    </option>
                </select>
            </div>
            <div style="margin-top: 5px">
                <label>{{ t('toolsConvert.encryptDecrypt.paddingLabel') }}</label>
                <select v-model="encDecPad" style="margin-left: 10px">
                    <option
                        v-for="item in EncryptPad"
                        :id="item.id"
                        :key="item.id"
                        :value="item.value"
                    >
                        {{ optionText(item) }}
                    </option>
                </select>
            </div>
            <div class="div-style-display-column" style="margin-top: 5px">
                <label for="encrypt-result">
                    {{ t('toolsConvert.encryptDecrypt.resultLabel') }}
                </label>
                <textarea
                    id="encrypt-result"
                    v-model="EncryptResult"
                    :placeholder="t('toolsConvert.encryptDecrypt.resultPlaceholder')"
                    :style="{ width: encDecWidth, height: '150px' }"
                ></textarea>
            </div>
            <div style="margin-top: 5px; color: grey; font-size: 12px">
                {{ t('toolsConvert.encryptDecrypt.note') }}
            </div>
        </div>
        <div class="plugin-tools-btn-list" :style="{ width: encDecWidth }">
            <button id="text-encrypt" class="plugin-tools-btn" @click="handleEncrypt">
                {{ t('toolsConvert.encryptDecrypt.encryptButton') }}
            </button>
            <button id="text-decrypt" class="plugin-tools-btn" @click="handleDecrypt">
                {{ t('toolsConvert.encryptDecrypt.decryptButton') }}
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import CryptoJS, { type CipherHelper, type Mode, type Padding, type WordArray } from 'crypto-js'
import { t } from '../../../common/i18n'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})
const encDecWidth = computed(() => {
    const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
    const encDecWidthVal = workWidthVal - 30
    return encDecWidthVal + 'px'
})

const encDecInput = ref('')
const encDecSecKey = ref('')
const encDecAlg = ref('AES')
const encDecMod = ref('CBC')
const encDecPad = ref('Pkcs7')
const EncryptResult = ref('')

interface EncryptOption {
    id: string
    value: string
    /** 英文技术描述：中英一致，原样展示 */
    text?: string
    /** 含中文“默认”说明的条目：展示时按界面语言翻译 */
    textKey?: string
}

const EncryptAlg: EncryptOption[] = [
    {
        id: 'encrypt-by-AES',
        value: 'AES',
        textKey: 'toolsConvert.encryptDecrypt.algorithmDefaultAes'
    },
    { id: 'encrypt-by-DES', value: 'DES', text: 'DES (DES block cipher algorithm)' },
    {
        id: 'encrypt-by-TripleDES',
        value: 'TripleDES',
        text: 'TripleDES (Triple-DES block cipher algorithm)'
    },
    { id: 'encrypt-by-RC4', value: 'RC4', text: 'RC4 (RC4 stream cipher algorithm)' },
    {
        id: 'encrypt-by-RC4Drop',
        value: 'RC4Drop',
        text: 'RC4Drop (Modified RC4 stream cipher algorithm)'
    },
    { id: 'encrypt-by-Rabbit', value: 'Rabbit', text: 'Rabbit (Rabbit stream cipher algorithm)' },
    {
        id: 'encrypt-by-RabbitLegacy',
        value: 'RabbitLegacy',
        text: 'RabbitLegacy (Rabbit stream cipher algorithm)'
    }
]

const EncryptMode: EncryptOption[] = [
    {
        id: 'encrypt-mod-CBC',
        value: 'CBC',
        textKey: 'toolsConvert.encryptDecrypt.modeDefaultCbc'
    },
    { id: 'encrypt-mod-CFB', value: 'CFB', text: 'CFB (Cipher Feedback block mode)' },
    { id: 'encrypt-mod-CTR', value: 'CTR', text: 'CTR (Counter block mode)' },
    {
        id: 'encrypt-mod-CTRGladman',
        value: 'CTRGladman',
        text: 'CTRGladman (Counter block mode compatible with Dr Brian Gladman fileenc.c)'
    },
    { id: 'encrypt-mod-OFB', value: 'OFB', text: 'OFB (Output Feedback block mode)' },
    { id: 'encrypt-mod-ECB', value: 'ECB', text: 'ECB (Electronic Codebook block mode)' }
]

const EncryptPad: EncryptOption[] = [
    {
        id: 'encrypt-pad-Pkcs7',
        value: 'Pkcs7',
        textKey: 'toolsConvert.encryptDecrypt.paddingDefaultPkcs7'
    },
    {
        id: 'encrypt-pad-AnsiX923',
        value: 'AnsiX923',
        text: 'AnsiX923 (ANSI X.923 padding strategy)'
    },
    {
        id: 'encrypt-pad-Iso10126',
        value: 'Iso10126',
        text: 'Iso10126 (ISO 10126 padding strategy)'
    },
    {
        id: 'encrypt-pad-Iso97971',
        value: 'Iso97971',
        text: 'Iso97971 (ISO/IEC 9797-1 Padding Method 2)'
    },
    {
        id: 'encrypt-pad-ZeroPadding',
        value: 'ZeroPadding',
        text: 'ZeroPadding (Zero padding strategy)'
    },
    { id: 'encrypt-pad-NoPadding', value: 'NoPadding', text: 'NoPadding (A noop padding strategy)' }
]

/** 选项文案：英文技术描述原样展示，含中文的默认项走词典（切换语言时随渲染更新） */
function optionText(item: EncryptOption): string {
    return item.textKey ? t(item.textKey) : (item.text ?? '')
}

const cryptoAlg: Record<string, CipherHelper> = {
    AES: CryptoJS.AES,
    DES: CryptoJS.DES,
    TripleDES: CryptoJS.TripleDES,
    RC4: CryptoJS.RC4,
    RC4Drop: CryptoJS.RC4Drop,
    Rabbit: CryptoJS.Rabbit,
    RabbitLegacy: CryptoJS.RabbitLegacy
}

const cryptoMode: Record<string, Mode> = {
    CBC: CryptoJS.mode.CBC,
    CFB: CryptoJS.mode.CFB,
    CTR: CryptoJS.mode.CTR,
    CTRGladman: CryptoJS.mode.CTRGladman,
    OFB: CryptoJS.mode.OFB,
    ECB: CryptoJS.mode.ECB
}

const cryptoPad: Record<string, Padding> = {
    Pkcs7: CryptoJS.pad.Pkcs7,
    AnsiX923: CryptoJS.pad.AnsiX923,
    Iso10126: CryptoJS.pad.Iso10126,
    Iso97971: CryptoJS.pad.Iso97971,
    ZeroPadding: CryptoJS.pad.ZeroPadding,
    NoPadding: CryptoJS.pad.NoPadding
}

function openUrl(link: string) {
    window.open(link, '_blank', 'noopener, noreferrer')
}

function handleEncrypt() {
    if (!encDecInput.value) {
        alert(t('toolsConvert.encryptDecrypt.emptyInputAlert'))
        return
    }
    const secretKey = CryptoJS.enc.Utf8.parse(encDecSecKey.value)

    // CMP-20：IV 改为每次加密时随机生成（原实现为模块级一次性 IV，多次加密复用同一 IV），
    // 并随密文以 "IV十六进制:密文Base64" 前缀形式输出，解密时可自包含还原、无需手工填写 IV。
    const iv = CryptoJS.lib.WordArray.random(128 / 8)

    try {
        const encrypted = cryptoAlg[encDecAlg.value].encrypt(encDecInput.value, secretKey, {
            iv: iv,
            mode: cryptoMode[encDecMod.value],
            padding: cryptoPad[encDecPad.value]
        })
        EncryptResult.value = CryptoJS.enc.Hex.stringify(iv) + ':' + encrypted.toString()
    } catch (error) {
        alert(
            t('toolsConvert.encryptDecrypt.encryptFailed', {
                error: error instanceof Error ? error.message : String(error)
            })
        )
    }
}

function handleDecrypt() {
    if (!EncryptResult.value) {
        alert(t('toolsConvert.encryptDecrypt.emptyCipherAlert'))
        return
    }
    const secretKey = CryptoJS.enc.Utf8.parse(encDecSecKey.value)

    // CMP-20：支持解析新格式 "<IV十六进制>:<密文Base64>" 前缀；
    // 无前缀时按旧格式兼容（不注入 IV，交由 crypto-js 按默认方式解密——
    // 注意旧格式密文未携带 IV，仅不依赖 IV 的算法/模式（如 ECB、RC4 系列）可还原，
    // CBC 等模式的旧密文缺少 IV 会提示解密失败）。
    let iv: WordArray | undefined = undefined
    let cipherText = EncryptResult.value
    const ivMatch = EncryptResult.value.match(/^([0-9a-fA-F]+):/)
    if (ivMatch && ivMatch[1].length >= 16 && ivMatch[1].length % 2 === 0) {
        iv = CryptoJS.enc.Hex.parse(ivMatch[1])
        cipherText = EncryptResult.value.slice(ivMatch[0].length)
    }

    // 配置对象，包含 IV、模式和填充方式
    const options = {
        iv: iv,
        mode: cryptoMode[encDecMod.value],
        padding: cryptoPad[encDecPad.value]
    }

    try {
        const decrypted = cryptoAlg[encDecAlg.value].decrypt(cipherText, secretKey, options)
        encDecInput.value = decrypted.toString(CryptoJS.enc.Utf8)
    } catch (error) {
        alert(
            t('toolsConvert.encryptDecrypt.decryptFailed', {
                error: error instanceof Error ? error.message : String(error)
            })
        )
    }
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';
</style>
