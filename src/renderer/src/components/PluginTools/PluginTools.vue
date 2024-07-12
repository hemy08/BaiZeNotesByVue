<template>
  <div class="plugin-tools-container">
    <div id="plugin-tool-close" class="close-button" @click="handleClosePluginTools">
      <button>返回编辑器</button>
    </div>
    <div v-show="showTokenGenerator" id="plugin-tool-token-generator"><TokenGenerator /></div>
    <div v-show="showHashText" id="plugin-tool-hash-text"><HashText /></div>
    <div v-show="showUUIDSGenerator" id="plugin-tool-uuids-generator"><UUIDSGenerator /></div>
    <div v-show="showULIDGenerator" id="plugin-tool-ulid-generator"><ULIDGenerator /></div>
    <div v-show="showEncryptDecrypt" id="plugin-tool-encrypt-decrypt"><EncryptDecrypt /></div>
    <div v-show="showBIP39Generator" id="plugin-tool-bip39-generator"><BIP39Generator /></div>
    <div v-show="showHmacGenerator" id="plugin-tool-hmac-generator"><HmacGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showDateConvert" id="plugin-tool-date-convert"><DateConvert /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
    <div v-show="showRSAGenerator" id="plugin-tool-rsa-generator"><RSAGenerator /></div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, ref, watch } from 'vue'
import EventBus from '../../event-bus'
import TokenGenerator from './Encryption/TokenGenerator.vue'
import HashText from './Encryption/HashText.vue'
import UUIDSGenerator from './Encryption/UUIDSGenerator.vue'
import ULIDGenerator from './Encryption/ULIDGenerator.vue'
import EncryptDecrypt from './Encryption/EncryptDecrypt.vue'
import BIP39Generator from './Encryption/BIP39Generator.vue'
import HmacGenerator from './Encryption/HmacGenerator.vue'
import RSAGenerator from './Encryption/RSAGenerator.vue'
import DateConvert from './Convert/DateConvert.vue'

const showTokenGenerator = ref(false)
const showHashText = ref(false)
const showUUIDSGenerator = ref(false)
const showULIDGenerator = ref(false)
const showEncryptDecrypt = ref(false)
const showBIP39Generator = ref(false)
const showHmacGenerator = ref(false)
const showRSAGenerator = ref(false)
const showDateConvert = ref(false)
let isShowPluginToolsContainer = false

const pluginTools = [
  { tools: 'token-generator', ref: showTokenGenerator },
  { tools: 'hash-text', ref: showHashText },
  { tools: 'uuids-generator', ref: showUUIDSGenerator },
  { tools: 'ulid-generator', ref: showULIDGenerator },
  { tools: 'encrypt-decrypt', ref: showEncryptDecrypt },
  { tools: 'bip39-generator', ref: showBIP39Generator },
  { tools: 'hmac-generator', ref: showHmacGenerator },
  { tools: 'rsa-generator', ref: showRSAGenerator },
  { tools: 'date-converter', ref: showDateConvert },
  { tools: 'base-converter', ref: show  },
  { tools: 'roman-numeral-converter', ref: show  },
  { tools: 'color-converter', ref: show  },
  { tools: 'case-converter', ref: show  },
  { tools: 'text-to-binary', ref: show  },
  { tools: 'text-to-unicode', ref: show  },
  { tools: 'yaml-json-converter', ref: show  },
  { tools: 'yaml-toml-converter', ref: show  },
  { tools: 'json-toml-converter', ref: show  },
  { tools: 'json-toml-converter', ref: show  },
  { tools: 'list-converter', ref: show  },
  { tools: 'json-formatter', ref: show  },
  { tools: 'sql-formatter', ref: show  },
  { tools: 'xml-formatter', ref: show  },
  { tools: 'yaml-formatter', ref: show  },
  { tools: 'html-formatter', ref: show  },
  { tools: 'yaml-to-toml-converter', ref: show  },
  { tools: 'ipv4-subnet-calculator', ref: show  },
  { tools: 'ipv4-address-converter', ref: show  },
  { tools: 'mac-address-lookup', ref: show  },
  { tools: 'mac-address-generator', ref: show  },
  { tools: 'ipv6-ula-generator', ref: show  },
  { tools: 'wifi-qrcode-generator', ref: show  },
  { tools: 'qrcode-generator', ref: show  }
]

const props = defineProps({
  // 编辑器宽度
  toolsAreaWidth: {
    type: String,
    default: '100%'
  }
})

window.electron.ipcRenderer.on('plugin-tools-show', (_, context: string) => {
  if (!isShowPluginToolsContainer) {
    EventBus.$emit('plugin-tools-container-show', true)
    isShowPluginToolsContainer = true
  }
  pluginTools.map((name) => {
    name.ref.value = name.tools === context
  })
})

function handleClosePluginTools() {
  if (isShowPluginToolsContainer) {
    isShowPluginToolsContainer = false
  }
  EventBus.$emit('plugin-tools-container-show', false)
}

watch(
  () => props.toolsAreaWidth,
  (width) => {
    console.log('PluginTools', width)
  }
)
</script>

<style scoped>
.plugin-tools-container {
  position: relative; /* 设置为相对定位，以便子元素可以使用绝对定位 */
  width: 100%; /* 或你需要的宽度 */
  height: 100%; /* 或你需要的高度 */
  display: flex;
  flex-direction: column;
  align-items: center; /* 这不会直接影响h1的居中，但影响整个容器的子元素 */
  justify-content: flex-start; /* 你可以根据需要调整 */
  background-color: #fafafa;
  color: black;
}

.close-button {
  position: absolute; /* 绝对定位 */
  top: 10px; /* 距离顶部 */
  right: 10px; /* 距离右边 */
  font-size: 18px; /* 保持字体大小 */
  cursor: pointer; /* 鼠标悬停时显示指针 */
}

.close-button button {
  background-color: deepskyblue; /* 深蓝色背景 */
  color: white; /* 白色文字 */
  border: none; /* 无边框 */
  padding: 10px 20px; /* 内边距 */
  border-radius: 5px; /* 圆角 */
  cursor: pointer; /* 重复设置，确保按钮样式 */
}

.tool-section h1 {
  text-align: center; /* 居中显示 */
}
</style>
