<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">Hash 哈希文本生成</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">
      使用所需的函数哈希文本字符串：MD5、SHA1、SHA256、SHA224、SHA512、SHA384、SHA3或RIPEMD160
      <br />先将输入进行encode，然后根据算法获取对应的哈希值，最后在进行响应的编码，得到最终的结果，文中使用的是CryptoJS
      <br />二进制的编码，是将对应的16进制编码转换为二进制进行显示，不是直接对哈希结果array进行处理
    </p>
    <a href="https://tools.w3cschool.cn/hash-text"> https://tools.w3cschool.cn/hash-text </a>
    <div style="margin-top: 5px"><label>需要进行HASH的文本：</label></div>
    <div>
      <textarea
        id="hash-text-input"
        v-model="textInput"
        placeholder="请输入你的文本..."
        style="width: 60vw; height: 20vh"
      ></textarea>
    </div>
    <div style="margin-top: 5px"><label>摘要编码：</label></div>
    <select id="hash-text-encode-type" v-model="encodeType" style="width: 910px">
      <option value="Binary">Binary（base2）</option>
      <option value="Hexadecimal" selected>Hexadecimal（base16）</option>
      <option value="base64">Base64（base64）</option>
      <option value="Base64url">Base64url（base64 with url safe chars）</option>
    </select>
    <div
      v-for="item in hashTextInput"
      :key="item.text"
      style="margin-top: 15px; display: flex; flex-direction: row"
    >
      <div class="hash-text-label">
        <label>{{ item.text }}</label>
      </div>
      <input
        :id="item.id"
        type="text"
        class="hash-text-result-output"
        :placeholder="item.text + '哈希结果...'"
        :value="item.result"
        readonly
      />
      <button class="hash-text-click-button" @click="onCopyToClipboard(item.result)">复制</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch} from 'vue'
import CryptoJS from 'crypto-js'

const textInput = ref('')
const encodeType = ref('')
const hashTextInput = [
  { id: 'hash-text-md5', text: 'MD5', fn: CryptoJS.MD5, result: '' },
  { id: 'hash-text-sha1', text: 'SHA1', fn: CryptoJS.SHA1, result: '' },
  { id: 'hash-text-sha3', text: 'SHA3', fn: CryptoJS.SHA3, result: '' },
  { id: 'hash-text-sha224', text: 'SHA224', fn: CryptoJS.SHA224, result: '' },
  { id: 'hash-text-sha256', text: 'SHA256', fn: CryptoJS.SHA256, result: '' },
  { id: 'hash-text-sha384', text: 'SHA384', fn: CryptoJS.SHA384, result: '' },
  { id: 'hash-text-sha512', text: 'SHA512', fn: CryptoJS.SHA512, result: '' },
  { id: 'hash-text-ripemd160', text: 'RIPEMD160', fn: CryptoJS.RIPEMD160, result: '' }
]

function onCopyToClipboard(context: string) {
  navigator.clipboard.writeText(context)
}

watch(textInput, (newCode) => {
  hashTextInput.map((item) => {
    item.result = item.fn(newCode).toString()
  })
})

function hexStringToBinaryString(hexString) {
  return hexString
    .split('')
    .map(function (hexChar) {
      return parseInt(hexChar, 16).toString(2).padStart(4, '0')
    })
    .join('')
}

watch(encodeType, (encode) => {
  let hashBuffer = ''
  hashTextInput.map((item) => {
    const hashArray = item.fn(textInput.value)
    if (encode === 'Binary') {
      hashBuffer = hexStringToBinaryString(CryptoJS.enc.Hex.stringify(hashArray))
    } else if (encode === 'base64') {
      hashBuffer = CryptoJS.enc.Base64.stringify(hashArray)
    } else if (encode === 'Base64url') {
      hashBuffer = CryptoJS.enc.Base64url.stringify(hashArray)
    } else {
      hashBuffer = CryptoJS.enc.Hex.stringify(hashArray)
    }
    item.result = hashBuffer
  })
})
</script>

<style scoped>
.hash-text-label {
  width: 150px;
  height: 30px;
  background-color: lightgreen;
  border: none;
  text-align: center;
}

.hash-text-click-button {
  margin-left: 7px;
  width: 100px;
  height: 30px;
  background-color: deepskyblue;
  border: none;
  cursor: pointer; /* 重复设置，确保按钮样式 */
}
.hash-text-click-button:hover {
  background-color: #ff9100;
}

.hash-text-result-output {
  background-color: white;
  height: 25px;
  width: 640px;
  margin-left: 7px;
  border-width: 1px;
}
</style>
