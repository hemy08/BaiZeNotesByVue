<template>
  <div id="custom-context-menu" class="custom-context-menu">
    <ul>
      <li>菜单项1</li>
      <li>菜单项2</li>
      <!-- ... 其他菜单项 ... -->
    </ul>
  </div>
</template>

<script setup lang="ts">
import { defineProps, PropType, computed } from 'vue'
import { FileSysItem } from './resource-manager'

// @ts-ignore eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps({
  node: {
    type: Object as PropType<FileSysItem>,
    required: true
  },
  isIndented: {
    type: Boolean,
    default: false // 根据你的需求设置默认值
  },
  isExpanded: {
    type: Boolean,
    default: false
  },
  fileExtension: {
    type: String,
    default: '.md'
  }
})
</script>

<style scoped>
</style>
