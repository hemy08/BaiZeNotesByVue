<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">JSON 和 TOML 转换</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">解析JSON并将其转换为TOML。解析TOML并将其转换为JSON。</p>
    <p>
      JSON 转 TOML<a href="https://tools.w3cschool.cn/json-to-toml">
        https://tools.w3cschool.cn/json-to-toml
      </a>
    </p>
    <p>
      TOML 到 JSON<a href="https://tools.w3cschool.cn/toml-to-json">
        https://tools.w3cschool.cn/toml-to-json
      </a>
    </p>
    <div :style="{ width: props.viewWidth }">TEST</div>
  </div>
</template>

<script setup lang="ts">
import { defineProps } from 'vue'

const props = defineProps({
  // 编辑器宽度
  viewWidth: {
    type: String,
    default: '100%'
  }
})
</script>

<style scoped></style>
