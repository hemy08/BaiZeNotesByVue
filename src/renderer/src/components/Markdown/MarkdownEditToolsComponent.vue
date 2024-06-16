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
  <button id="format-font-family" class="tool-button" @click="handleUpdateFontFormat('fontfamily')"></button>
  <button id="format-size" class="tool-button" @click="handleUpdateFontFormat('fontsize')"></button>
  <button id="format-bold" class="tool-button" @click="handleUpdateFontFormat('bold')"></button>
  <button id="format-italic" class="tool-button" @click="handleUpdateFontFormat('italic')"></button>
  <button id="format-delete-line" class="tool-button" @click="handleUpdateFontFormat('deleteline')"></button>
  <button id="format-underline" class="tool-button" @click="handleUpdateFontFormat('underline')"></button>
  <button id="format-color-fill" class="tool-button" @click="handleUpdateFontFormat('color')"></button>
  <button id="font-format-quote" class="tool-button" @click="handleUpdateFontFormat('fontfamily')"></button>
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
  <button id="line-scan" class="tool-button" @click="handleUpdateInsertText('------------\r\n')"></button>
  <button id="line-enter-icon" class="tool-button" @click="handleUpdateInsertText('\r\n')"></button>
  <div style="width: 1px; height: 30px; background-color: black; color: black; margin: 2px"></div>
  <!-- 行内代码 代码块 行内公式 公式块 -->
  <button id="code-line" class="tool-button" @click="handleUpdateFontFormat('codeline')"></button>
  <button id="code-block" class="tool-button" @click="handleUpdateInsertText('\r\n```\r\n\r\n```\r\n')"></button>
  <button id="math-line" class="tool-button" @click="handleUpdateFontFormat('mathline')"></button>
  <button id="math-block" class="tool-button" @click="handleUpdateInsertText('\r\n$$\r\n\r\n$$\r\n')"></button>
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
  <button id="insert-mermaid" class="tool-button" @click="handleUpdateInsertText('\r\n```mermaid\r\n\r\n```\r\n')"></button>
  <button id="insert-plantuml" class="tool-button" @click="handleUpdateInsertText('\r\n```plantuml\r\n@startuml\r\n\r\n@enduml\r\n```\r\n')"></button>
</template>
<script setup lang="ts">
import { onMounted } from 'vue'
import EventBus from '../../event-bus'

// const store = useStore()

type MappingTable = {
  [key: string]: string // 键是字符串，值是数字
}
const svgs: MappingTable = {
  'format-header-1':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m11 14v-2h2V6.31l-2.5 1.44V5.44L16 4h2v12h2v2h-6Z"/></svg>',
  'format-header-2':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m18 14h-6a2 2 0 0 1-2-2c0-.53.2-1 .54-1.36l4.87-5.23c.37-.36.59-.86.59-1.41a2 2 0 0 0-2-2 2 2 0 0 0-2 2h-2a4 4 0 0 1 4-4 4 4 0 0 1 4 4c0 1.1-.45 2.1-1.17 2.83L15 16h6v2Z"/></svg>',
  'format-header-3':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m12 0h4a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-1h2v1h4v-4h-4v-2h4V6h-4v1h-2V6a2 2 0 0 1 2-2Z"/></svg>',
  'format-header-4':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m15 14v-5h-5v-2l5-7h2v7h1v2h-1v5h-2m0-7V7.42L15.45 11H18Z"/></svg>',
  'format-header-5':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m12 0h5v2h-5v4h2a4 4 0 0 1 4 4 4 4 0 0 1-4 4h-2a2 2 0 0 1-2-2v-1h2v1h2a2 2 0 0 0 2-2 2 2 0 0 0-2-2h-2a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/></svg>',
  'format-header-6':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 4h2v6h4V4h2v14H9v-6H5v6H3V4m12 0h4a2 2 0 0 1 2 2v1h-2V6h-4v4h4a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m0 8v4h4v-4h-4Z"/></svg>',
  'format-font-family':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17 8h3v12h1v1h-4v-1h1v-3h-4l-1.5 3H14v1h-4v-1h1l6-12m1 1-3.5 7H18V9M5 3h5c1.11 0 2 .89 2 2v11H9v-5H6v5H3V5c0-1.11.89-2 2-2m1 2v4h3V5H6Z"/></svg>',
  'format-size':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 4v3h5v12h3V7h5V4H2m19 5h-9v3h3v7h3v-7h3V9Z"/></svg>',
  'format-bold':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M13.5 15.5H10v-3h3.5A1.5 1.5 0 0 1 15 14a1.5 1.5 0 0 1-1.5 1.5m-3.5-9h3A1.5 1.5 0 0 1 14.5 8 1.5 1.5 0 0 1 13 9.5h-3m5.6 1.29c.97-.68 1.65-1.79 1.65-2.79 0-2.26-1.75-4-4-4H7v14h7.04c2.1 0 3.71-1.7 3.71-3.79 0-1.52-.86-2.82-2.15-3.42Z"/></svg>',
  'format-italic':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10 4v3h2.21l-3.42 8H6v3h8v-3h-2.21l3.42-8H18V4h-8Z"/></svg>',
  'format-delete-line':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7.2 9.8c-1.2-2.3.5-5 2.9-5.5 3.1-1 7.6.4 7.5 4.2h-3c0-.3-.1-.6-.1-.8-.2-.6-.6-.9-1.2-1.1-.8-.3-2.1-.2-2.8.3C9 8.2 10.4 9.5 12 10H7.4c-.1-.1-.1-.2-.2-.2M21 13v-2H3v2h9.6c.2.1.4.1.6.2.6.3 1.1.5 1.3 1.1.1.4.2.9 0 1.3-.2.5-.6.7-1.1.9-1.8.5-4-.2-3.9-2.4h-3c-.1 2.6 2.1 4.4 4.5 4.7 3.8.8 8.3-1.6 6.3-5.9l3.7.1Z"/></svg>',
  'format-underline':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 21h14v-2H5v2m7-4a6 6 0 0 0 6-6V3h-2.5v8a3.5 3.5 0 0 1-3.5 3.5A3.5 3.5 0 0 1 8.5 11V3H6v8a6 6 0 0 0 6 6Z"/></svg>',
  'format-color-fill':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 11.5s-2 2.17-2 3.5a2 2 0 0 0 2 2 2 2 0 0 0 2-2c0-1.33-2-3.5-2-3.5M5.21 10 10 5.21 14.79 10m1.77-1.06L7.62 0 6.21 1.41l2.38 2.38-5.15 5.15c-.59.56-.59 1.53 0 2.12l5.5 5.5c.29.29.68.44 1.06.44s.77-.15 1.06-.44l5.5-5.5c.59-.59.59-1.56 0-2.12Z"/></svg>',
  'font-format-quote':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="m10 7-2 4h3v6H5v-6l2-4h3m8 0-2 4h3v6h-6v-6l2-4h3Z"/></svg>',
  'format-align-left':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v2H3V3m0 4h12v2H3V7m0 4h18v2H3v-2m0 4h12v2H3v-2m0 4h18v2H3v-2Z"/></svg>',
  'format-align-center':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v2H3V3m4 4h10v2H7V7m-4 4h18v2H3v-2m4 4h10v2H7v-2m-4 4h18v2H3v-2Z"/></svg>',
  'format-align-justify':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v2H3V3m0 4h18v2H3V7m0 4h18v2H3v-2m0 4h18v2H3v-2m0 4h18v2H3v-2Z"/></svg>',
  'format-align-right':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 3h18v2H3V3m6 4h12v2H9V7m-6 4h18v2H3v-2m6 4h12v2H9v-2m-6 4h18v2H3v-2Z"/></svg>',
  'format-list-numbered':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 13v-2h14v2H7m0 6v-2h14v2H7M7 7V5h14v2H7M3 8V5H2V4h2v4H3m-1 9v-1h3v4H2v-1h2v-.5H3v-1h1V17H2m2.25-7a.75.75 0 0 1 .75.75c0 .2-.08.39-.21.52L3.12 13H5v1H2v-.92L4 11H2v-1h2.25Z"/></svg>',
  'format-list-bulleted':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7 5h14v2H7V5m0 8v-2h14v2H7M4 4.5A1.5 1.5 0 0 1 5.5 6 1.5 1.5 0 0 1 4 7.5 1.5 1.5 0 0 1 2.5 6 1.5 1.5 0 0 1 4 4.5m0 6A1.5 1.5 0 0 1 5.5 12 1.5 1.5 0 0 1 4 13.5 1.5 1.5 0 0 1 2.5 12 1.5 1.5 0 0 1 4 10.5M7 19v-2h14v2H7m-3-2.5A1.5 1.5 0 0 1 5.5 18 1.5 1.5 0 0 1 4 19.5 1.5 1.5 0 0 1 2.5 18 1.5 1.5 0 0 1 4 16.5Z"/></svg>',
  'line-scan':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M17 22v-2h3v-3h2v3.5c0 .4-.2.7-.5 1-.3.3-.7.5-1 .5H17M7 22H3.5c-.4 0-.7-.2-1-.5-.3-.3-.5-.7-.5-1V17h2v3h3v2M17 2h3.5c.4 0 .7.2 1 .5.3.3.5.6.5 1V7h-2V4h-3V2M7 2v2H4v3H2V3.5c0-.4.2-.7.5-1s.6-.5 1-.5H7m12 9H5v2h14v-2Z"/></svg>',
  'line-enter-icon':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" ><path d="M8.95005 17.65L3.30005 12L8.95005 6.34998L10 7.39998L6.15005 11.25H19.2V7.24998H20.7001V12.75H6.15005L10 16.6L8.95005 17.65Z"/></svg>',
  'code-line':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="m14.6 16.6 4.6-4.6-4.6-4.6L16 6l6 6-6 6-1.4-1.4m-5.2 0L4.8 12l4.6-4.6L8 6l-6 6 6 6 1.4-1.4Z"/></svg>',
  'code-block':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.59 3.41 7 4.82 3.82 8 7 11.18 5.59 12.6 1 8l4.59-4.59m5.82 0L16 8l-4.59 4.6L10 11.18 13.18 8 10 4.82l1.41-1.41M22 6v12c0 1.11-.89 2-2 2H4a2 2 0 0 1-2-2v-4h2v4h16V6h-2.97V4H20c1.11 0 2 .89 2 2Z"/></svg>',
  'math-line':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11.5 19.1c-.2 1.1-.6 1.9-1.3 2.4-.7.5-1.6.6-2.7.4-.4-.1-1.2-.2-1.5-.4l.5-1.5c.3.1.9.3 1.2.3 1.1.2 1.7-.3 1.9-1.5L12 5.2c.2-1.2.7-2 1.4-2.6.7-.5 1.7-.7 2.8-.5.4.1 1.2.2 1.8.5L17.5 4c-.2-.1-.9-.2-1.2-.3-1.3-.2-2 .4-2.3 1.9l-2.5 13.5Z"/></svg>',
  'math-block':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2m-3.1 3.9s-.7-.3-1-.3c-.6-.1-1 .1-1.2 1.1L12 16.8c-.2.8-.5 1.4-1 1.8-.4.3-.8.4-1.3.4-.8 0-2-.5-2-.5l.5-1.4s.8.3 1 .3c.3.1.5 0 .7-.1.2-.1.3-.4.4-.7l1.6-9.2c.1-.8.5-1.4 1-1.9.6-.4 1.3-.5 2.1-.4.7.1 1.5.5 1.5.5l-.6 1.3Z"/></svg>',
  'line-links':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M10.59 13.41c.41.39.41 1.03 0 1.42-.39.39-1.03.39-1.42 0a5.003 5.003 0 0 1 0-7.07l3.54-3.54a5.003 5.003 0 0 1 7.07 0 5.003 5.003 0 0 1 0 7.07l-1.49 1.49c.01-.82-.12-1.64-.4-2.42l.47-.48a2.982 2.982 0 0 0 0-4.24 2.982 2.982 0 0 0-4.24 0l-3.53 3.53a2.982 2.982 0 0 0 0 4.24m2.82-4.24c.39-.39 1.03-.39 1.42 0a5.003 5.003 0 0 1 0 7.07l-3.54 3.54a5.003 5.003 0 0 1-7.07 0 5.003 5.003 0 0 1 0-7.07l1.49-1.49c-.01.82.12 1.64.4 2.43l-.47.47a2.982 2.982 0 0 0 0 4.24 2.982 2.982 0 0 0 4.24 0l3.53-3.53a2.982 2.982 0 0 0 0-4.24.973.973 0 0 1 0-1.42Z"/></svg>',
  'task-lists':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M11 15h6v2h-6v-2M9 7H7v2h2V7m2 6h6v-2h-6v2m0-4h6V7h-6v2m-2 2H7v2h2v-2m12-6v14c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V5c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2m-2 0H5v14h14V5M9 15H7v2h2v-2Z"/></svg>',
  'insert-images':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="m8.5 13.5 2.5 3 3.5-4.5 4.5 6H5m16 1V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2Z"/></svg>',
  'images-center':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9 5a7 7 0 0 0-7 7 7 7 0 0 0 7 7c1.04 0 2.06-.24 3-.68.94.44 1.96.68 3 .68a7 7 0 0 0 7-7 7 7 0 0 0-7-7c-1.04 0-2.06.24-3 .68-.94-.44-1.96-.68-3-.68m0 2c.34 0 .67.03 1 .1-1.28 1.31-2 3.07-2 4.9 0 1.83.72 3.59 2 4.89-.33.07-.66.11-1 .11a5 5 0 0 1-5-5 5 5 0 0 1 5-5m6 0a5 5 0 0 1 5 5 5 5 0 0 1-5 5c-.34 0-.67-.03-1-.1 1.28-1.31 2-3.07 2-4.9 0-1.83-.72-3.59-2-4.89.33-.07.66-.11 1-.11Z"/></svg>',
  'insert-emoji':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.5 2C3.56 2 2 3.56 2 5.5v13C2 20.44 3.56 22 5.5 22H16l6-6V5.5C22 3.56 20.44 2 18.5 2h-13m.25 2h12.5A1.75 1.75 0 0 1 20 5.75V15h-1.5c-1.94 0-3.5 1.56-3.5 3.5V20H5.75A1.75 1.75 0 0 1 4 18.25V5.75A1.75 1.75 0 0 1 5.75 4m8.69 2.77c-.16 0-.32.02-.47.06-.94.26-1.47 1.22-1.23 2.17.05.15.12.3.21.44l3.23-.88c0-.17-.02-.34-.06-.51-.21-.75-.9-1.28-1.68-1.28M8.17 8.5c-.17 0-.32 0-.47.05-.93.26-1.48 1.22-1.23 2.15.03.16.12.3.21.46l3.23-.88c0-.17-.02-.34-.06-.5A1.72 1.72 0 0 0 8.17 8.5m8.55 2.76-9.13 2.51a5.266 5.266 0 0 0 5.36 1.64 5.273 5.273 0 0 0 3.77-4.15Z"/></svg>',
  'insert-table':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5 4h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2m0 4v4h6V8H5m8 0v4h6V8h-6m-8 6v4h6v-4H5m8 0v4h6v-4h-6Z"/></svg>',
  'insert-label':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M14.4 6 14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6Z"/></svg>',
  'insert-classification':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="m18 21-4-4h3V7h-3l4-4 4 4h-3v10h3M2 19v-2h10v2M2 13v-2h7v2M2 7V5h4v2H2Z"/></svg>',
  'insert-material':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M8 16.61v-1.24l6-3.46V7.23l-5 2.89-5-2.89V13l-1 .58L2 13V5l1.07-.62L9 7.81l3.93-2.27 2-1.16L16 5v8.06L10.92 16l4.05 2.33 5.03-2.9V11l1-.58 1 .58v5.58l-7.03 4.06L8 16.61m14-6.86-1 .58-1-.58V8.58L21 8l1 .58v1.17Z"/></svg>',
  'insert-mermaid':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M1 3a2 2 0 0 1 2-2h6.5a2 2 0 0 1 2 2v6.5a2 2 0 0 1-2 2H7v4.063C7 16.355 7.644 17 8.438 17H12.5v-2.5a2 2 0 0 1 2-2H21a2 2 0 0 1 2 2V21a2 2 0 0 1-2 2h-6.5a2 2 0 0 1-2-2v-2.5H8.437A2.939 2.939 0 0 1 5.5 15.562V11.5H3a2 2 0 0 1-2-2Zm2-.5a.5.5 0 0 0-.5.5v6.5a.5.5 0 0 0 .5.5h6.5a.5.5 0 0 0 .5-.5V3a.5.5 0 0 0-.5-.5ZM14.5 14a.5.5 0 0 0-.5.5V21a.5.5 0 0 0 .5.5H21a.5.5 0 0 0 .5-.5v-6.5a.5.5 0 0 0-.5-.5Z"/></svg>',
  'insert-plantuml':
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M19.5 17c-.13 0-.26 0-.39.04l-1.61-3.25a2.5 2.5 0 0 0-1.75-4.29c-.13 0-.25 0-.39.04l-1.63-3.25c.48-.45.77-1.08.77-1.79a2.5 2.5 0 0 0-5 0c0 .71.29 1.34.76 1.79L8.64 9.54c-.14-.04-.26-.04-.39-.04a2.5 2.5 0 0 0-1.75 4.29l-1.61 3.25C4.76 17 4.63 17 4.5 17a2.5 2.5 0 0 0 0 5A2.5 2.5 0 0 0 7 19.5c0-.7-.29-1.34-.76-1.79l1.62-3.25c.14.04.26.04.39.04s.25 0 .39-.04l1.63 3.25c-.47.45-.77 1.09-.77 1.79a2.5 2.5 0 0 0 5 0A2.5 2.5 0 0 0 12 17c-.13 0-.26 0-.39.04L10 13.79c.46-.45.75-1.08.75-1.79s-.29-1.34-.75-1.79l1.61-3.25c.13.04.26.04.39.04s.26 0 .39-.04L14 10.21c-.45.45-.75 1.09-.75 1.79a2.5 2.5 0 0 0 2.5 2.5c.13 0 .25 0 .39-.04l1.63 3.25c-.47.45-.77 1.09-.77 1.79a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0-2.5-2.5Z"/></svg>'
}

onMounted(() => {
  for (const key in svgs) {
    if (Object.prototype.hasOwnProperty.call(svgs, key)) {
      // 确保 key 是 svgs 对象自身的属性
      const element = document.getElementById(key)
      if (element) {
        element.innerHTML = svgs[key]
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
