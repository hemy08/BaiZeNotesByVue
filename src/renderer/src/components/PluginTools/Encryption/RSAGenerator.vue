<template>
  <div :style="{ width: props.viewWidth }">
    <h1 style="display: flex; align-items: center; justify-content: center">密钥对生成器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">生成新的随机RSA或者ed25519私钥和公钥pem证书。</p>
    <a href="https://tools.w3cschool.cn/rsa-key-pair-generator">
      https://tools.w3cschool.cn/rsa-key-pair-generator
    </a>
    <div class="div-style-display-row" style="margin-top: 10px">
      <div class="rsa-gen-label-style"><label>Bits：</label></div>
      <input v-model="inputBits" :style="rsaBitsStyle" type="number" step="8" placeholder="2048" />
      <button id="rsa-key-pair-refresh" class="rsa-tools-btn" @click="refreshKeyPair()">
        刷新密钥对
      </button>
    </div>
    <div class="div-style-display-row" style="margin-top: 10px">
      <div class="rsa-gen-label-style"><label>Public Key：</label></div>
      <textarea v-model="RsaPublicKey" :style="rsaPublicKeyStyle" placeholder="uuids" />
    </div>
    <div class="div-style-display-row" style="margin-top: 10px">
      <div class="rsa-gen-label-style"><label>Private Key：</label></div>
      <textarea v-model="RsaPrivateKey" :style="rsaPrivateKeyStyle" placeholder="uuids" />
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
const RsaPublicKey = ref('')
const RsaPrivateKey = ref('')
const inputBits = ref(2048)
const rsaViewWidth = ref(props.viewWidth)

watch(
  () => props.viewWidth,
  (newWidth) => {
    rsaViewWidth.value = newWidth
  }
)

watch(
  () => inputBits.value,
  () => {
    refreshKeyPair()
  }
)

const rsaKeyTextWidth = computed(() => {
  const viewWidthVal = parseInt(rsaViewWidth.value.replace('px', ''), 10)
  return viewWidthVal - 200
})

const rsaPublicKeyStyle = computed(() => {
  return {
    width: rsaKeyTextWidth.value + 'px',
    marginLeft: '20px',
    height: '150px'
  }
})

const rsaBitsStyle = computed(() => {
  return {
    width: '200px',
    marginLeft: '20px',
    height: '20px'
  }
})

const rsaPrivateKeyStyle = computed(() => {
  return {
    width: rsaKeyTextWidth.value + 'px',
    marginLeft: '20px',
    height: '500px'
  }
})

function refreshKeyPair() {
  window.electron.ipcRenderer.send('plugin-tools-generator-rsa-key-pairs', inputBits.value)
}

window.electron.ipcRenderer.on(
  'plugin-tools-generator-rsa-result',
  (_, publicKey: string, privateKey: string) => {
    RsaPublicKey.value = publicKey
    RsaPrivateKey.value = privateKey
  }
)
</script>

<style scoped>
.rsa-gen-label-style {
  width: 150px;
  text-align: justify;
  background-color: #e1e4e8;
}

.rsa-tools-btn {
  padding: 2px 20px;
  font-size: 18px;
  margin-left: 20px;
  color: black; /* 白色文字 */
  background-color: deepskyblue; /* 深蓝色背景 */
  border: none; /* 无边框 */
  border-radius: 5px; /* 圆角 */
  cursor: pointer; /* 重复设置，确保按钮样式 */
}

.rsa-tools-btn:hover {
  background-color: lightgreen;
  color: #1c7d4d;
}
</style>
