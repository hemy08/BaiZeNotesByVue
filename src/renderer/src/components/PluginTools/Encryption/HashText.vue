<template>
  <div>
    <h1 class="header-display-center">Hash 哈希文本生成，非对称加密</h1>
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
        :style="{ width: props.viewWidth, height: '100px' }"
      ></textarea>
    </div>
    <div style="margin-top: 5px"><label>摘要编码：</label></div>
    <select id="hash-text-encode-type" v-model="encodeType" :style="{ width: props.viewWidth }">
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
      <div class="hash-text-label" :style="{ width: hashLabelWidth }">
        <label>{{ item.text }}</label>
      </div>
      <input
        :id="item.id"
        type="text"
        class="hash-text-result-output"
        :style="hashResultStyle"
        :placeholder="item.text + '哈希结果...'"
        :value="item.result"
        readonly
      />
      <button
        class="hash-text-click-button"
        :style="{ width: hashButtonWidth }"
        @click="onCopyToClipboard(item.result)"
      >
        复制
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, defineProps, computed } from 'vue'

const props = defineProps({
  // 编辑器宽度
  viewWidth: {
    type: String,
    default: '100%'
  }
})

const textInput = ref('')
const encodeType = ref('Hexadecimal')
const hashLabelWidth = ref('150px')
const hashButtonWidth = ref('100px')
const hashViewWidth = ref(props.viewWidth)
const hashTextInput = [
  { id: 'hash-text-md4', text: 'MD4', result: '' },
  { id: 'hash-text-md5', text: 'MD5', result: '' },
  { id: 'hash-text-sha1', text: 'SHA1', result: '' },
  { id: 'hash-text-sha224', text: 'SHA224', result: '' },
  { id: 'hash-text-sha256', text: 'SHA256', result: '' },
  { id: 'hash-text-sha384', text: 'SHA384', result: '' },
  { id: 'hash-text-sha512', text: 'SHA512', result: '' },
  { id: 'hash-text-sha512-256', text: 'SHA512-256', result: '' },
  { id: 'hash-text-ripemd160', text: 'RIPEMD160', result: '' }
]

const hashResultStyle = computed(() => {
  const hashViewWidthValue = parseInt(hashViewWidth.value.replace('px', ''), 10)
  const hashLabelWidthValue = parseInt(hashLabelWidth.value.replace('px', ''), 10)
  const hashButtonWidthValue = parseInt(hashButtonWidth.value.replace('px', ''), 10)
  const hashResultWidthValue = hashViewWidthValue - hashLabelWidthValue - hashButtonWidthValue
  return {
    width: hashResultWidthValue + 'px'
  }
})

watch(
  () => props.viewWidth,
  (width) => {
    hashViewWidth.value = width
  }
)

function onCopyToClipboard(context: string) {
  navigator.clipboard.writeText(context)
}

watch(
  () => textInput.value,
  () => {
    getHashTextResult()
  }
)

watch(
  () => encodeType.value,
  () => {
    if (!textInput.value) {
      alert('请先输入要进行Hash的文本....')
      return
    }
    getHashTextResult()
  }
)

function getHashTextResult() {
  const result = window.electron.ipcRenderer.sendSync(
    'plugin-tools-generator-hash-text',
    textInput.value,
    encodeType.value
  )
  hashTextInput.forEach((item) => {
    item.result = result[item.text] // 使用方括号语法来动态访问属性
  })
}
</script>

<style scoped>
.hash-text-label {
  height: 30px;
  background-color: lightgreen;
  border: none;
  text-align: center;
}

.hash-text-click-button {
  margin-left: 7px;
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
  margin-left: 7px;
  border-width: 1px;
}
</style>
