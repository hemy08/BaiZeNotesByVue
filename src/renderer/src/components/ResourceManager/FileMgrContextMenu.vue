<template>
  <div id="custom-context-menu" class="custom-context-menu" :style="contentMenuStyle">
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

// 预览区域样式设置
const contentMenuStyle = computed(() => {
  return {
    marginLeft: '60px'
  }
})

</script>

<style scoped>
.custom-context-menu {
  border: 1px solid #ccc;
  border-radius: 10px;
  background-color: #f5f5f5;
  width: 200px;
  margin-left: 40px;
  position: absolute; /* 相对于最近的已定位祖先元素（或body）定位 */
  z-index: 1000; /* 确保显示在其他元素之上 */
}
</style>
