<template>
  <div>
    <h1 class="header-display-center">加密/解密文本</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">使用加密算法（如AES、TripleDES、Rabbit或RC4）加密和解密文本明文。</p>
    <a href="https://tools.w3cschool.cn/encryption"> https://tools.w3cschool.cn/encryption </a>
    <div id="encrypt-area" class="div-style-display-column" :style="{ width: encDecWidth }">
      <label for="input-text">请输入你需要加密的文本: </label>
      <textarea
        id="input-enc-dec-text"
        v-model="encDecInput"
        placeholder="请输入你需要加密的文本..."
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
          <option id="encrypt-by-AES" value="AES">AES（默认）</option>
          <option id="encrypt-by-DES" value="DES">DES</option>
          <option id="encrypt-by-TripleDES" value="TripleDES">TripleDES</option>
          <option id="encrypt-by-RC4" value="RC4">RC4</option>
          <option id="encrypt-by-RC4Drop" value="RC4Drop">RC4Drop</option>
          <option id="encrypt-by-Rabbit" value="DES">Rabbit</option>
          <option id="encrypt-by-RabbitLegacy" value="DES">RabbitLegacy</option>
        </select>
      </div>
      <div style="margin-top: 5px">
        <label>请选择加密模式</label>
        <select v-model="encDecMod" style="margin-left: 10px">
          <option id="encrypt-mod-CBC" value="CBC">CBC（默认，Cipher Block Chaining mode.）</option>
          <option id="encrypt-mod-CFB" value="CFB">CFB（Cipher Feedback block mode.）</option>
          <option id="encrypt-mod-CTR" value="CTR">CTR（Counter block mode.）</option>
          <option id="encrypt-mod-CTRGladman" value="CTRGladman">
            CTRGladman（Counter block mode compatible with Dr Brian Gladman fileenc.c）
          </option>
          <option id="encrypt-mod-OFB" value="OFB">OFB（Output Feedback block mode.）</option>
          <option id="encrypt-mod-ECB" value="ECB">ECB（Electronic Codebook block mode.）</option>
        </select>
      </div>
      <div style="margin-top: 5px">
        <label>请选择填充方式</label>
        <select v-model="encDecPad" style="margin-left: 10px">
          <option id="encrypt-pad-Pkcs7" value="Pkcs7">
            Pkcs7（默认，PKCS #5/7 padding strategy.）
          </option>
          <option id="encrypt-pad-AnsiX923" value="AnsiX923">
            AnsiX923（ANSI X.923 padding strategy.）
          </option>
          <option id="encrypt-pad-Iso10126" value="Iso10126">
            Iso10126（ISO 10126 padding strategy.）
          </option>
          <option id="encrypt-pad-Iso97971" value="Iso97971">
            Iso97971（ISO/IEC 9797-1 Padding Method 2.）
          </option>
          <option id="encrypt-pad-ZeroPadding" value="ZeroPadding">
            ZeroPadding（Zero padding strategy.）
          </option>
          <option id="encrypt-pad-NoPadding" value="NoPadding">
            NoPadding（A noop padding strategy.）
          </option>
        </select>
      </div>
      <div class="div-style-display-column" style="margin-top: 5px">
        <label for="encrypt-result">加密结果: </label>
        <textarea
          id="encrypt-result"
          v-model="EncryptResult"
          placeholder="加密结果..."
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

const encDecInput = ref('')
const encDecSecKey = ref('')
const encDecAlg = ref('AES')
const encDecMod = ref('CBC')
const encDecPad = ref('Pkcs7')
const EncryptResult = ref('')
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

const encDecWidth = computed(() => {
  const viewWidthVal = parseInt(hashViewWidth.value.replace('px', ''), 10)
  const encDecWidthVal = viewWidthVal - 30
  return encDecWidthVal + 'px'
})

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
    alert('加密失败：', error)
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
  //const encrypt_str = EncryptResult.value
  const decrypted = cryptoAlg[encDecAlg.value].decrypt(EncryptResult.value, secretKey, options)
  encDecInput.value = decrypted.toString(CryptoJS.enc.Utf8)
}
</script>

<style scoped></style>
