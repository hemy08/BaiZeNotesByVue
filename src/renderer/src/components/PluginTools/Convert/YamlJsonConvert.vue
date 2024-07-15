<template>
  <div>
    <h1 style="display: flex; align-items: center; justify-content: center">YAML 和 JSON转换器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">将JSON转换为YAML。或者将YAMl转成JSON</p>
    <p>
      YAML到JSON转换器<a href="https://tools.w3cschool.cn/yaml-to-json-converter">
        https://tools.w3cschool.cn/yaml-to-json-converter
      </a>
    </p>
    <p>
      JSON到YAML转换器<a href="https://tools.w3cschool.cn/json-to-yaml-converter">
        https://tools.w3cschool.cn/json-to-yaml-converter
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
