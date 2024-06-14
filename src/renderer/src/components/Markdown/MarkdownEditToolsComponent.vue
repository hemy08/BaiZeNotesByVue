<template>
  <!-- 标题 | 字体 加粗 倾斜 删除线 下划线 颜色 引用 | 文字左对齐 文字居中 文字右对齐 |
       有序列表 无序列表 水平线 段内换行 | 行内代码 代码块 行内公式 公式块 | 超链接 锚点链接 任务列表 |
       插入图片 图片居中 Emoji 表格 标记 分类 | material mermaid plantuml |
  -->
  <div class="head-level">
    <select class="head-level">
      <option value="H1">H1 #</option>
      <option value="H2">H2 ##</option>
      <option value="H3">H3 ###</option>
      <option value="H4">H4 ####</option>
      <option value="H5">H5 #####</option>
      <option value="H6">H6 ######</option>
    </select>
  </div>
  <div style="width: 1px; height: 30px; background-color: black; color: black; margin: 2px"></div>
  <div class="tool-icon"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#FFF" d="M5.5 22h13c.275 0 .5-.225.5-.5V7h-3.5c-.827 0-1.5-.673-1.5-1.5V2H5.5c-.275 0-.5.225-.5.5v19c0 .275.225.5.5.5z"/><path fill="#FFF" d="M18.293 6L15 2.707V5.5c0 .275.225.5.5.5h2.793z"/><path opacity=".64" fill="#605E5C" d="M19.56 5.854l-4.414-4.415A1.51 1.51 0 0014.086 1H5.5C4.673 1 4 1.673 4 2.5v19c0 .827.673 1.5 1.5 1.5h13c.827 0 1.5-.673 1.5-1.5V6.914c0-.4-.156-.777-.44-1.06zM15 2.707L18.293 6H15.5a.501.501 0 01-.5-.5V2.707zM18.5 22h-13a.501.501 0 01-.5-.5v-19c0-.275.225-.5.5-.5H14v3.5c0 .827.673 1.5 1.5 1.5H19v14.5c0 .275-.225.5-.5.5z"/><path fill="#FF5F10" d="M15.753 16.918L12.119 8h-.243l-3.714 8.937s-.28.707-1.162.75V18h2.97v-.309s-1.335.14-1.011-.956l.764-1.86h3.735l.706 1.771s.234.576-.068.83c0 0-.239.215-.844.21V18H17v-.309s-.82.098-1.247-.773zm-5.776-2.665l1.638-3.99 1.618 3.99H9.977z"/></svg></div>
  <div class="tool-icon">b</div>
  <div class="tool-icon">倾斜</div>
  <div class="tool-icon">删除线</div>
  <div class="tool-icon">下划线</div>
  <div class="tool-icon">颜色</div>
  <div class="tool-icon">引用</div>
  <div style="width: 1px; height: 30px; background-color: black; color: black; margin: 2px"></div>
</template>
<script setup lang="ts"></script>

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
  background-color: #9e9e9e;
}

.tool-icon {
  margin: 2px;
  height: 30px;
  width: 30px;
  align-items: center;
  background-color: #f2f2f2;
  color: black;
  fill: #00b0ff;
}
</style>
