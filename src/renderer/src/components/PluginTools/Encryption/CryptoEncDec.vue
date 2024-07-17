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
      <div style="margin-top: 5px">
        <label for="input-crypto-secret-key">请输入你的秘钥</label>
        <input
          id="input-crypto-secret-key"
          v-model="cryptoSecretKey"
          style="margin-left: 10px"
          type="text"
          placeholder="请输入你的秘钥..."
        />
      </div>
      <div style="margin-top: 5px">
        <label>请选择加密/解密算法</label>
        <select v-model="cryptoAlgorithm" style="margin-left: 10px">
          <option v-for="item in CryptoAlgorithm" :id="item.id" :key="item.id" :value="item.value">
            {{ item.text }}
          </option>
        </select>
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

const cryptoWidth = computed(() => {
  const viewWidthVal = parseInt(hashViewWidth.value.replace('px', ''), 10)
  const cryptoWidthVal = viewWidthVal - 30
  return cryptoWidthVal + 'px'
})

const cryptoInput = ref('')
const cryptoSecretKey = ref('')
const cryptoAlgorithm = ref('AES')
const EncryptResult = ref('')

const CryptoAlgorithm = [
  { id: 'crypto-alg-aes-128-cbc', value: 'aes-128-cbc', text: 'AES-128-CBC' },
  { id: 'crypto-alg-aes-128-cfb', value: 'aes-128-cfb', text: 'AES-128-CFB' },
  { id: 'crypto-alg-aes-128-ctr', value: 'aes-128-ctr', text: 'AES-128-CTR' },
  { id: 'crypto-alg-aes-128-ecb', value: 'aes-128-ecb', text: 'AES-128-ECB' },
  { id: 'crypto-alg-aes-128-gcm', value: 'aes-128-gcm', text: 'AES-128-GCM' },
  { id: 'crypto-alg-aes-128-ofb', value: 'aes-128-ofb', text: 'AES-128-OFB' },
  { id: 'crypto-alg-aes-192-cbc', value: 'aes-192-cbc', text: 'AES-192-CBC' },
  { id: 'crypto-alg-aes-192-ctr', value: 'aes-192-ctr', text: 'AES-192-CTR' },
  { id: 'crypto-alg-aes-192-ecb', value: 'aes-192-ecb', text: 'AES-192-ECB' },
  { id: 'crypto-alg-aes-192-gcm', value: 'aes-192-gcm', text: 'AES-192-GCM' },
  { id: 'crypto-alg-aes-192-ofb', value: 'aes-192-ofb', text: 'AES-192-OFB' },
  { id: 'crypto-alg-aes-256-cbc', value: 'aes-256-cbc', text: 'AES-256-CBC' },
  { id: 'crypto-alg-aes-256-cfb', value: 'aes-256-cfb', text: 'AES-256-CFB' },
  { id: 'crypto-alg-aes-256-ctr', value: 'aes-256-ctr', text: 'AES-256-CTR' },
  { id: 'crypto-alg-aes-256-ecb', value: 'aes-256-ecb', text: 'AES-256-ECB' },
  { id: 'crypto-alg-aes-256-gcm', value: 'aes-256-gcm', text: 'AES-256-GCM' },
  { id: 'crypto-alg-aes-256-ofb', value: 'aes-256-ofb', text: 'AES-256-OFB' },
  { id: 'crypto-alg-bf-cbc', value: 'bf-cbc', text: 'BF-CBC' },
  { id: 'crypto-alg-bf-cfb', value: 'bf-cfb', text: 'BF-CFB' },
  { id: 'crypto-alg-bf-ecb', value: 'bf-ecb', text: 'BF-ECB' },
  { id: 'crypto-alg-des-cbc', value: 'des-cbc', text: 'DES-CBC' },
  { id: 'crypto-alg-des-ecb', value: 'des-ecb', text: 'DES-ECB' },
  { id: 'crypto-alg-des-ede', value: 'des-ede', text: 'DES-EDE' },
  { id: 'crypto-alg-des-ede-cbc', value: 'des-ede-cbc', text: 'DES-EDE-CBC' },
  { id: 'crypto-alg-des-ede3', value: 'des-ede3', text: 'DES-EDE3' },
  { id: 'crypto-alg-des-ede3-cbc', value: 'des-ede3-cbc', text: 'DES-EDE3-CBC' },
  { id: 'crypto-alg-rc2-cbc', value: 'rc2-cbc', text: 'RC2-CBC' },
  { id: 'crypto-alg-rc4', value: 'rc4', text: 'RC4' }
]

function CryptoEncryptResult() {
  if (!cryptoInput.value) {
    alert('请输入要加密/解密的文本...')
  } else {
    EncryptResult.value = window.electron.ipcRenderer.sendSync(
      'plugin-tools-crypto-encrypt',
      cryptoInput.value,
      cryptoSecretKey.value,
      cryptoAlgorithm.value
    )
  }
}

function CryptoDecryptResult() {
  if (!EncryptResult.value) {
    alert('请输入要加密/解密的文本...')
  } else {
    EncryptResult.value = window.electron.ipcRenderer.sendSync(
      'plugin-tools-crypto-decrypt',
      cryptoInput.value,
      cryptoSecretKey.value,
      cryptoAlgorithm.value
    )
  }

}
</script>

<style scoped></style>
