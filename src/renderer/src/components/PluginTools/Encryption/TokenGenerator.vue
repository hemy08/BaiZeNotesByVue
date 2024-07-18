<template>
  <div :style="{ width: props.viewWidth }">
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
        :style="{ width: props.viewWidth }"
        placeholder="生成的令牌......"
        readonly
      ></textarea>
    </div>
    <div class="plugin-tools-btn-list" :style="{ width: props.viewWidth }">
      <button id="token-generator" class="plugin-tools-btn" @click="GeneratorToken">生成</button>
      <button id="token-refresh" class="plugin-tools-btn" @click="RefreshToken">刷新</button>
      <button id="token-clear" class="plugin-tools-btn" @click="ClearToken">清空</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps } from 'vue'
const selectedTypes = ref<string[]>(['uppercase', 'lowercase', 'number'])
const tokenLength = ref<number>(64)
const generatorTokenStr = ref<string>('')

const props = defineProps({
  // 编辑器宽度
  viewWidth: {
    type: String,
    default: '100%'
  }
})

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
  const tkOut = document.getElementById('token-output')
  if (tkOut) {
    tkOut.textContent = generatorTokenStr.value
  }
}

function RefreshToken() {
  GeneratorToken()
}

function ClearToken() {
  generatorTokenStr.value = ''
  const tkOut = document.getElementById('token-output')
  if (tkOut) {
    tkOut.textContent = ''
  }
}
</script>

<style scoped>
#token-output {
  padding: 8px;
  font-size: 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  height: 150px;
  margin: 15px 0 10px;
  display: flex;
}
</style>
