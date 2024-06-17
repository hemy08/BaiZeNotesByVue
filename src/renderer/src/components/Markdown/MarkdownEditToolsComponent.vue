<template>
  <!-- 标题 | 字体 加粗 倾斜 删除线 下划线 颜色 引用 | 文字左对齐 文字居中 文字右对齐 |
       有序列表 无序列表 水平线 段内换行 | 行内代码 代码块 行内公式 公式块 | 超链接 锚点链接 任务列表 |
       插入图片 图片居中 Emoji 表格 标记 分类 | material mermaid plantuml |
  -->
  <!-- H1 H2 H3 H4 H5 H6 -->
  <button id="format-header-1" class="tool-button" @click="handleUpdateHeaderFormat('H1')"></button>
  <button id="format-header-2" class="tool-button" @click="handleUpdateHeaderFormat('H2')"></button>
  <button id="format-header-3" class="tool-button" @click="handleUpdateHeaderFormat('H3')"></button>
  <button id="format-header-4" class="tool-button" @click="handleUpdateHeaderFormat('H4')"></button>
  <button id="format-header-5" class="tool-button" @click="handleUpdateHeaderFormat('H5')"></button>
  <button id="format-header-6" class="tool-button" @click="handleUpdateHeaderFormat('H6')"></button>
  <div style="width: 1px; height: 30px; background-color: black; color: black; margin: 2px"></div>
  <!-- 字体 大小 加粗 倾斜 删除线 下划线 颜色 引用 -->
  <button
    id="format-font-family"
    class="tool-button"
    @click="handleUpdateFontFormat('fontfamily')"
  ></button>
  <button id="format-size" class="tool-button" @click="handleUpdateFontFormat('fontsize')"></button>
  <button id="format-bold" class="tool-button" @click="handleUpdateFontFormat('bold')"></button>
  <button id="format-italic" class="tool-button" @click="handleUpdateFontFormat('italic')"></button>
  <button
    id="format-delete-line"
    class="tool-button"
    @click="handleUpdateFontFormat('deleteline')"
  ></button>
  <button
    id="format-underline"
    class="tool-button"
    @click="handleUpdateFontFormat('underline')"
  ></button>
  <button
    id="format-color-fill"
    class="tool-button"
    @click="handleUpdateFontFormat('color')"
  ></button>
  <button
    id="font-format-quote"
    class="tool-button"
    @click="handleUpdateFontFormat('fontfamily')"
  ></button>
  <div style="width: 1px; height: 30px; background-color: black; color: black; margin: 2px"></div>
  <!-- 文字左对齐 文字居中 两边对其 文字右对齐 -->
  <button id="format-align-left" class="tool-button"></button>
  <button id="format-align-center" class="tool-button"></button>
  <button id="format-align-justify" class="tool-button"></button>
  <button id="format-align-right" class="tool-button"></button>
  <div style="width: 1px; height: 30px; background-color: black; color: black; margin: 2px"></div>
  <!-- 有序列表 无序列表 水平线 段内换行 -->
  <button id="format-list-numbered" class="tool-button"></button>
  <button id="format-list-bulleted" class="tool-button"></button>
  <button
    id="line-scan"
    class="tool-button"
    @click="handleUpdateInsertText('------------\r\n')"
  ></button>
  <button id="line-enter-icon" class="tool-button" @click="handleUpdateInsertText('\r\n')"></button>
  <div style="width: 1px; height: 30px; background-color: black; color: black; margin: 2px"></div>
  <!-- 行内代码 代码块 行内公式 公式块 -->
  <button id="code-line" class="tool-button" @click="handleUpdateFontFormat('codeline')"></button>
  <button
    id="code-block"
    class="tool-button"
    @click="handleUpdateInsertText('\r\n```\r\n\r\n```\r\n')"
  ></button>
  <button id="math-line" class="tool-button" @click="handleUpdateFontFormat('mathline')"></button>
  <button
    id="math-block"
    class="tool-button"
    @click="handleUpdateInsertText('\r\n$$\r\n\r\n$$\r\n')"
  ></button>
  <div style="width: 1px; height: 30px; background-color: black; color: black; margin: 2px"></div>
  <!-- 超链接 锚点链接 任务列表 -->
  <button id="line-links" class="tool-button" @click="handleUpdateInsertText('[]()')"></button>
  <button id="task-lists" class="tool-button"></button>
  <div style="width: 1px; height: 30px; background-color: black; color: black; margin: 2px"></div>
  <!-- 插入图片 图片居中 Emoji 表格 标记 分类 -->
  <button id="insert-images" class="tool-button"></button>
  <button id="images-center" class="tool-button"></button>
  <button id="insert-emoji" class="tool-button"></button>
  <button id="insert-table" class="tool-button"></button>
  <button id="insert-label" class="tool-button"></button>
  <button id="insert-classification" class="tool-button"></button>
  <div style="width: 1px; height: 30px; background-color: black; color: black; margin: 2px"></div>
  <!-- material mermaid plantuml -->
  <button id="insert-material" class="tool-button"></button>
  <button
    id="insert-mermaid"
    class="tool-button"
    @click="handleUpdateInsertText('\r\n```mermaid\r\n\r\n```\r\n')"
  ></button>
  <button
    id="insert-plantuml"
    class="tool-button"
    @click="handleUpdateInsertText('\r\n```plantuml\r\n@startuml\r\n\r\n@enduml\r\n```\r\n')"
  ></button>
</template>
<script setup lang="ts">
import { onMounted } from 'vue'
import EventBus from '../../event-bus'
import { MdEditToolSvgs } from './markdown-edit-tools'

onMounted(() => {
  for (const key in MdEditToolSvgs) {
    if (Object.prototype.hasOwnProperty.call(MdEditToolSvgs, key)) {
      // 确保 key 是 svgs 对象自身的属性
      const element = document.getElementById(key)
      if (element) {
        element.innerHTML = MdEditToolSvgs[key]
      }
    }
  }
})

function handleUpdateHeaderFormat(header: string) {
  EventBus.$emit('monaco-editor-update-header-format', header)
}

function handleUpdateFontFormat(header: string) {
  EventBus.$emit('monaco-editor-update-font-format', header)
}

function handleUpdateInsertText(header: string) {
  EventBus.$emit('monaco-editor-insert-text', header)
}
</script>

<style scoped>
.head-level {
  transition: color 0.3s ease; /* 添加过渡效果，使颜色变化更平滑 */
  width: 45px;
  margin: 2px;
  background-color: #f2f2f2;
  color: black;
  fill: #00b0ff;
}
.head-level:hover {
  background-color: #eeffff;
}

.tool-icon {
  margin: 2px;
  height: 30px;
  width: 30px;
  background-color: #f2f2f2;
  color: #777777;
  fill: #333333;
  font-size: 25px;
  font-weight: normal;
  place-items: center;
}

.tool-button {
  height: 40px;
  width: 40px;
  border: none;
  background-color: #f2f2f2;
  color: black;
  fill: black;
  place-items: center;
}

.tool-button:hover {
  background-color: #eeffff;
}
</style>
