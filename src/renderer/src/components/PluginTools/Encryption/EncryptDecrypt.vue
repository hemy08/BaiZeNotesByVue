<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 class="header-display-center">加密/解密文本，对称加密算法</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">使用加密算法(如AES、TripleDES、Rabbit或RC4)加密和解密文本明文。</p>
    <a
      class="plugin-tools-openurl"
      role="button"
      @click="openUrl('https://tools.w3cschool.cn/encryption')"
    >
      https://tools.w3cschool.cn/encryption
    </a>
    <div id="encrypt-area" class="div-style-display-column" :style="{ width: encDecWidth }">
      <label for="input-text">请输入你需要加密的文本: </label>
      <textarea
        id="input-enc-dec-text"
        v-model="encDecInput"
        placeholder="解密结果，或请输入你需要加密的文本..."
        :style="{ width: encDecWidth, height: '80px' }"
      ></textarea>
      <div style="margin-top: 5px">
        <label for="input-secret-key">请输入你的秘钥</label>
        <input
          id="input-secret-key"
          v-model="encDecSecKey"
          style="margin-left: 10px"
          type="text"
          placeholder="请输入你的秘钥..."
        />
      </div>
      <div style="margin-top: 5px">
        <label>请选择加密算法</label>
        <select v-model="encDecAlg" style="margin-left: 10px">
          <option v-for="item in EncryptAlg" :id="item.id" :key="item.id" :value="item.value">
            {{ item.text }}
          </option>
        </select>
      </div>
      <div style="margin-top: 5px">
        <label>请选择加密模式</label>
        <select v-model="encDecMod" style="margin-left: 10px">
          <option v-for="item in EncryptMode" :id="item.id" :key="item.id" :value="item.value">
            {{ item.text }}
          </option>
        </select>
      </div>
      <div style="margin-top: 5px">
        <label>请选择填充方式</label>
        <select v-model="encDecPad" style="margin-left: 10px">
          <option v-for="item in EncryptPad" :id="item.id" :key="item.id" :value="item.value">
            {{ item.text }}
          </option>
        </select>
      </div>
      <div class="div-style-display-column" style="margin-top: 5px">
        <label for="encrypt-result">加密结果: </label>
        <textarea
          id="encrypt-result"
          v-model="EncryptResult"
          placeholder="加密结果，或输入要进行解密的密文..."
          :style="{ width: encDecWidth, height: '150px' }"
        ></textarea>
      </div>
    </div>
    <div class="plugin-tools-btn-list" :style="{ width: encDecWidth }">
      <button id="text-encrypt" class="plugin-tools-btn" @click="handleEncrypt">加密</button>
      <button id="text-decrypt" class="plugin-tools-btn" @click="handleDecrypt">解密</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineProps, watch, ref } from 'vue'
import CryptoJS from 'crypto-js'

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})
const hashViewWidth = ref(props.workAreaWidth)

watch(
  () => props.workAreaWidth,
  (width) => {
    hashViewWidth.value = width
  }
)

const encDecWidth = computed(() => {
  const workWidthVal = parseInt(hashViewWidth.value.replace('px', ''), 10)
  const encDecWidthVal = workWidthVal - 30
  return encDecWidthVal + 'px'
})

const encDecInput = ref('')
const encDecSecKey = ref('')
const encDecAlg = ref('AES')
const encDecMod = ref('CBC')
const encDecPad = ref('Pkcs7')
const EncryptResult = ref('')

const EncryptAlg = [
  { id: 'encrypt-by-AES', value: 'AES', text: 'AES (默认，AES block cipher algorithm)' },
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
  { id: 'encrypt-by-DES', value: 'DES', text: 'Rabbit (Rabbit stream cipher algorithm)' },
  {
    id: 'encrypt-by-RabbitLegacy',
    value: 'RabbitLegacy',
    text: 'RabbitLegacy (Rabbit stream cipher algorithm)'
  }
]

const EncryptMode = [
  { id: 'encrypt-mod-CBC', value: 'CBC', text: 'CBC (默认，Cipher Block Chaining mode)' },
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

const EncryptPad = [
  { id: 'encrypt-pad-Pkcs7', value: 'Pkcs7', text: 'Pkcs7 (默认，PKCS #5/7 padding strategy)' },
  { id: 'encrypt-pad-AnsiX923', value: 'AnsiX923', text: 'AnsiX923 (ANSI X.923 padding strategy)' },
  { id: 'encrypt-pad-Iso10126', value: 'Iso10126', text: 'Iso10126 (ISO 10126 padding strategy)' },
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

const cryptoAlg = {
  AES: CryptoJS.AES,
  DES: CryptoJS.DES,
  TripleDES: CryptoJS.TripleDES,
  RC4: CryptoJS.RC4,
  RC4Drop: CryptoJS.RC4Drop,
  Rabbit: CryptoJS.Rabbit,
  RabbitLegacy: CryptoJS.RabbitLegacy
}

const cryptoMode = {
  CBC: CryptoJS.mode.CBC,
  CFB: CryptoJS.mode.CFB,
  CTR: CryptoJS.mode.CTR,
  CTRGladman: CryptoJS.mode.CTRGladman,
  OFB: CryptoJS.mode.OFB,
  ECB: CryptoJS.mode.ECB
}

const cryptoPad = {
  Pkcs7: CryptoJS.pad.Pkcs7,
  AnsiX923: CryptoJS.pad.AnsiX923,
  Iso10126: CryptoJS.pad.Iso10126,
  Iso97971: CryptoJS.pad.Iso97971,
  ZeroPadding: CryptoJS.pad.ZeroPadding,
  NoPadding: CryptoJS.pad.NoPadding
}

const iv = CryptoJS.lib.WordArray.random(128 / 8)

function openUrl(link) {
  window.open(link, '_blank', 'noopener, noreferrer')
}

function handleEncrypt() {
  if (!encDecInput.value) {
    alert('请输入要加密的文本...')
    return
  }
  const secretKey = CryptoJS.enc.Utf8.parse(encDecSecKey.value)

  try {
    const encrypted = cryptoAlg[encDecAlg.value].encrypt(encDecInput.value, secretKey, {
      iv: iv,
      mode: cryptoMode[encDecMod.value],
      padding: cryptoPad[encDecPad.value]
    })
    EncryptResult.value = encrypted.toString()
  } catch (error) {
    alert('加密失败：' + error)
  }
}

function handleDecrypt() {
  if (!EncryptResult.value) {
    alert('请输入要解密的文本...')
    return
  }
  const secretKey = CryptoJS.enc.Utf8.parse(encDecSecKey.value)
  // 配置对象，包含 IV、模式和填充方式
  const options = {
    iv: iv,
    mode: cryptoMode[encDecMod.value],
    padding: cryptoPad[encDecPad.value]
  }

  try {
    const decrypted = cryptoAlg[encDecAlg.value].decrypt(EncryptResult.value, secretKey, options)
    encDecInput.value = decrypted.toString(CryptoJS.enc.Utf8)
  } catch (error) {
    alert('解密失败：' + error)
  }
}
</script>

<style scoped></style>
