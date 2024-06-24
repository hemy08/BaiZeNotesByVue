<template>
  <!-- 标题 | 字体 加粗 倾斜 删除线 下划线 颜色 引用 | 文字左对齐 文字居中 文字右对齐 |
       有序列表 无序列表 水平线 段内换行 | 行内代码 代码块 行内公式 公式块 | 超链接 锚点链接 任务列表 |
       插入图片 图片居中 Emoji 表格 标记 分类 | material mermaid plantuml |
  -->
  <button
    v-for="(items, index) in MdEditToolButtons"
    :id="items.id"
    :key="index"
    :title="items.title"
    :class="['tool-btn', items.class]"
    @click="items.clickFn($event, items.param)"
  ></button>
</template>
<script setup lang="ts">
import { onMounted, watch, ref } from 'vue'
import { MdEditToolButtons } from './markdown-edit-tools'

const showWidth = ref('')

const props = defineProps({
  // 编辑器宽度
  toolBarWidth: {
    type: String,
    default: '100%'
  }
})

function initButtonSvg() {
  for (const key in MdEditToolButtons) {
    if (Object.prototype.hasOwnProperty.call(MdEditToolButtons, key)) {
      // 确保 key 是 svgs 对象自身的属性
      const element = document.getElementById(key)
      if (element) {
        element.innerHTML = MdEditToolButtons[key].svg
      }
    }
  }
}

onMounted(() => {
  initButtonSvg()
})

watch(
  () => props.toolBarWidth,
  (value) => {
    showWidth.value = value
  }
)
</script>

<style scoped>
.tool-btn {
  height: 35px;
  width: 35px;
  border: none;
  background-color: #f2f2f2;
  color: black;
  fill: black;
  place-items: center;
  display: inline-block;
}

.tool-btn:hover {
  background-color: #eeffff;
}
</style>
