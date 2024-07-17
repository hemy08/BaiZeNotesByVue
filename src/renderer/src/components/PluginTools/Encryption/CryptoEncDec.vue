<template>
  <div>
    <h1 class="header-display-center">Crypto 加密/解密文本</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">使用NodeJs的crypto加解密算法，进行加解密文本处理。</p>
    <div id="encrypt-area" class="div-style-display-column" :style="{ width: cryptoWidth }">
      <label for="input-text">请输入你需要加密/解密的文本: </label>
      <textarea
        id="crypto-input-text"
        v-model="cryptoInput"
        placeholder="解密结果，或请输入你需要加密的文本..."
        :style="{ width: cryptoWidth, height: '150px' }"
      ></textarea>
      <div class="div-style-display-row" style="margin-top: 5px">
        <label for="input-crypto-secret-key" class="crypto-text-label">请输入你的秘钥</label>
        <input
          id="input-crypto-secret-key"
          v-model="cryptoSecretKey"
          :style="{ width: secretWidth, marginLeft: '20px' }"
          type="text"
          placeholder="请输入你的秘钥..."
        />
      </div>
      <div class="div-style-display-row" style="margin-top: 5px">
        <label class="crypto-text-label">请选择加密/解密算法</label>
        <select v-model="cryptoAlgorithm" style="margin-left: 20px">
          <option v-for="item in CryptoAlgorithm" :id="item.id" :key="item.id" :value="item.value">
            {{ item.text }}
          </option>
        </select>
      </div>
      <div class="div-style-display-row" style="margin-top: 5px">
        <label class="crypto-text-label">请选择输入编码方式</label>
        <select v-model="cryptoInputEncoding" style="margin-left: 20px">
          <option v-for="item in CryptoEncoding" :id="item.id" :key="item.id" :value="item.value">
            {{ item.text }}
          </option>
        </select>
      </div>
      <div class="div-style-display-row" style="margin-top: 5px">
        <label class="crypto-text-label">请选择结果编码方式</label>
        <select v-model="cryptoOutputEncoding" style="margin-left: 20px">
          <option v-for="item in CryptoEncoding" :id="item.id" :key="item.id" :value="item.value">
            {{ item.text }}
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
          placeholder="IV..."
        />
      </div>
      <div class="div-style-display-column" style="margin-top: 5px">
        <label for="encrypt-result">加密/解密结果: </label>
        <textarea
          id="encrypt-result"
          v-model="EncryptResult"
          placeholder="加密结果，或输入要进行解密的密文..."
          :style="{ width: cryptoWidth, height: '150px' }"
        ></textarea>
      </div>
    </div>
    <div class="plugin-tools-btn-list" :style="{ width: cryptoWidth }">
      <button id="text-encrypt" class="plugin-tools-btn" @click="CryptoEncryptResult">加密</button>
      <button id="text-decrypt" class="plugin-tools-btn" @click="CryptoDecryptResult">解密</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineProps, ref, watch } from 'vue'

const props = defineProps({
  // 编辑器宽度
  viewWidth: {
    type: String,
    default: '100%'
  }
})
const hashViewWidth = ref(props.viewWidth)

watch(
  () => props.viewWidth,
  (width) => {
    hashViewWidth.value = width
  }
)
const viewWidthVal = parseInt(hashViewWidth.value.replace('px', ''), 10)

const cryptoWidth = computed(() => {
  const cryptoWidthVal = viewWidthVal - 30
  return cryptoWidthVal + 'px'
})

const secretWidth = computed(() => {
  const cryptoWidthVal = viewWidthVal - 400
  return cryptoWidthVal + 'px'
})

const cryptoInput = ref('')
const cryptoSecretKey = ref('')
const cryptoAlgorithm = ref('aes-256-cbc')
const cryptoIvBuffer = ref('')
const cryptoInputEncoding = ref('utf-8')
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

const CryptoEncoding = [
  { id: 'input-encoding-ascii', value: 'ascii', text: 'ASCII' },
  { id: 'input-encoding-binary', value: 'binary', text: '二进制' },
  { id: 'input-encoding-base64', value: 'base64', text: 'BASE64' },
  { id: 'input-encoding-base64url', value: 'base64url', text: 'BASE64 URL' },
  { id: 'input-encoding-hex', value: 'hex', text: 'HEX(十六进制编码)' },
  { id: 'input-encoding-latin1', value: 'latin1', text: 'Latin1(ISO 8859-1)' },
  { id: 'input-encoding-ucs-2', value: 'ucs-2', text: 'UCS-2' },
  { id: 'input-encoding-utf8', value: 'utf-8', text: 'UTF-8' },
  { id: 'input-encoding-utf16le', value: 'utf-16le', text: 'UTF 16LE' }
]

export interface CryptoData {
  context: string
  secretKey: string
  algorithm: string
  inputEncoding?: string
  outEncoding?: string
  iv?: string
}

function checkSecretKey(): string {
  const item = CryptoAlgorithm.find((algo) => algo.value === cryptoAlgorithm.value)
  if (item.keyLength !== cryptoSecretKey.value.length) {
    return '加密算法' + item.text + '需要秘钥长度' + item.keyLength
  }
  return ''
}

function CryptoEncryptResult() {
  if (!cryptoInput.value) {
    alert('请输入要加密/解密的文本...')
  } else {
    const result = checkSecretKey()
    if (result.length) {
      alert(result)
      return
    }
    const data: CryptoData = {
      context: cryptoInput.value,
      secretKey: cryptoSecretKey.value,
      algorithm: cryptoAlgorithm.value,
      inputEncoding: cryptoInputEncoding.value,
      outEncoding: cryptoOutputEncoding.value
    }
    EncryptResult.value = window.electron.ipcRenderer.sendSync('plugin-tools-crypto-encrypt', data)
  }
}

function CryptoDecryptResult() {
  if (!EncryptResult.value) {
    alert('请输入要加密/解密的文本...')
  } else {
    const result = checkSecretKey()
    if (!result.length) {
      alert(result)
      return
    }
    const data: CryptoData = {
      context: cryptoInput.value,
      secretKey: cryptoSecretKey.value,
      algorithm: cryptoAlgorithm.value,
      inputEncoding: cryptoInputEncoding.value,
      outEncoding: cryptoOutputEncoding.value
    }
    EncryptResult.value = window.electron.ipcRenderer.sendSync('plugin-tools-crypto-decrypt', data)
  }
}
</script>

<style scoped>
.crypto-text-label {
  width: 175px;
  background-color: lightblue;
  border: none;
  text-align: center;
}
</style>
