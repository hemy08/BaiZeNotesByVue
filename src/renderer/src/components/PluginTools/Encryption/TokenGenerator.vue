<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">Token Generator</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">使用您想要的字符、大写或小写字母、数字和/或符号生成随机字符串。</p>
    <a href="https://tools.w3cschool.cn/token-generator">
      https://tools.w3cschool.cn/token-generator
    </a>
    <div>
      <div v-for="type in boxTypes" :key="type.value">
        <input
          :id="`char-${type.value}`"
          v-model="selectedTypes"
          type="checkbox"
          :value="type.value"
        />
        <label :for="`char-${type.value}`" style="font-size: 20px; margin: 8px">
          {{ type.label }}
        </label>
      </div>
    </div>
    <div style="margin-top: 15px; display: flex">
      <label for="text-token-length">长度</label>
      <input
        id="text-token-length"
        v-model.number="tokenLength"
        type="number"
        style="margin-left: 20px"
      />
    </div>
    <div>
      <textarea
        id="token-output"
        name=""
        placeholder="生成的令牌......"
        readonly="readonly"
      ></textarea>
    </div>
    <div class="button-list-style">
      <button id="token-generator" class="button-style" @click="GeneratorToken">生成</button>
      <button id="token-refresh" class="button-style" @click="RefreshToken">刷新</button>
      <button id="token-clear" class="button-style" @click="ClearToken">清空</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
const selectedTypes = ref<string[]>([])
const tokenLength = ref<number>(64)
const generatorTokenStr = ref<string>('')

const boxTypes = [
  { value: 'uppercase', label: '大写(ABCDEFGHIJKLMNOPQRSTUVWXYZ)' },
  { value: 'lowercase', label: '小写(abcdefghijklmnopqrstuvwxyz)' },
  { value: 'number', label: '数字(0123456789)' },
  { value: 'symbols', label: '符号(!@#$%^&*()_+{}:<>?[]\\|~)' }
]
function getCharacters() {
  let chars = ''
  if (selectedTypes.value.includes('uppercase')) chars += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  if (selectedTypes.value.includes('lowercase')) chars += 'abcdefghijklmnopqrstuvwxyz'
  if (selectedTypes.value.includes('number')) chars += '0123456789'
  if (selectedTypes.value.includes('symbols')) chars += '!@#$%^&*()_+{}:<>?[]\\|~'
  return chars
}

function GeneratorToken() {
  let characters = getCharacters()
  if (characters.length < 2) {
    characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
  }
  let result = ''
  const values = new Uint32Array(tokenLength.value)
  window.crypto.getRandomValues(values)

  for (let i = 0; i < tokenLength.value; i++) {
    result += characters[values[i] % characters.length]
  }
  generatorTokenStr.value = result
  document.getElementById('token-output').textContent = generatorTokenStr.value
}

function RefreshToken() {
  GeneratorToken()
}

function ClearToken() {
  generatorTokenStr.value = ''
  document.getElementById('token-output').textContent = ''
}
</script>

<style scoped>
.button-list-style {
  width: 600px;
  margin-top: 20px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 80px;
}

.button-style {
  padding: 5px 20px;
  font-size: 18px;
  color: black; /* 白色文字 */
  background-color: deepskyblue; /* 深蓝色背景 */
  border: none; /* 无边框 */
  border-radius: 5px; /* 圆角 */
  cursor: pointer; /* 重复设置，确保按钮样式 */
}

#token-output {
  padding: 8px;
  font-size: 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  width: 600px;
  height: 500px;
  margin: 15px 0 10px;
  display: flex;
}
</style>
