<template>
  <div id="custom-context-menu" class="custom-context-menu">
    <div class="custom-menu-item-node">新建</div>
    <hr />
    <div class="custom-menu-item-node">剪切</div>
    <div class="custom-menu-item-node">复制</div>
    <div class="custom-menu-item-node">粘贴</div>
    <div class="custom-menu-item-node">引用</div>
    <hr />
    <div class="custom-menu-item-node">在文件中替换</div>
    <div class="custom-menu-item-node">在文件中查找</div>
    <hr />
    <div class="custom-menu-item-node">删除</div>
    <div class="custom-menu-item-node">重命名</div>
    <div class="custom-menu-item-node">刷新</div>
    <hr />
    <div class="custom-menu-item-node">从资源管理器打开</div>
    <div class="custom-menu-item-node">从磁盘重新加载</div>
    <hr />
    <div class="custom-menu-item-node">属性</div>
    <div class="custom-menu-item-node"></div>
  </div>
</template>

<script setup lang="ts">
import { defineProps, PropType } from 'vue'
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
.custom-menu-item-node {
  padding-left: 20px;
  font-size: 15px;
}

.custom-menu-item-node:hover {
  background-color: #eaeaea;
}
</style>
