<template>
  <!-- 标题 | 字体 加粗 倾斜 删除线 下划线 颜色 引用 | 文字左对齐 文字居中 文字右对齐 |
       有序列表 无序列表 水平线 段内换行 | 行内代码 代码块 行内公式 公式块 | 超链接 锚点链接 任务列表 |
       插入图片 图片居中 Emoji 表格 标记 分类 | material mermaid plantuml |
  -->
  <!-- H1 H2 H3 H4 H5 H6 -->
  <button id="h1" title="一级标题" class="tool-btn" @click="onFontHeaderFormat('H1')"></button>
  <button id="h2" title="二级标题" class="tool-btn" @click="onFontHeaderFormat('H2')"></button>
  <button id="h3" title="三级标题" class="tool-btn" @click="onFontHeaderFormat('H3')"></button>
  <button id="h4" title="四级标题" class="tool-btn" @click="onFontHeaderFormat('H4')"></button>
  <button id="h5" title="五级标题" class="tool-btn" @click="onFontHeaderFormat('H5')"></button>
  <button id="h6" title="六级标题" class="tool-btn btn-split-line" @click="onFontHeaderFormat('H6')"></button>
  <!-- 字体 大小 加粗 倾斜 删除线 下划线 颜色 引用 -->
  <button id="f-family" title="字体样式" class="tool-btn" @click="onFontFormat('fontfamily')"></button>
  <button id="f-size" title="字体大小" class="tool-btn" @click="onFontFormat('fontsize')"></button>
  <button id="f-bold" title="加粗" class="tool-btn" @click="onFontFormat('bold')"></button>
  <button id="f-italic" title="倾斜" class="tool-btn" @click="onFontFormat('italic')"></button>
  <button id="f-delete" title="删除线" class="tool-btn" @click="onFontFormat('deleteline')"></button>
  <button id="f-under" title="下划线" class="tool-btn" @click="onFontFormat('underline')"></button>
  <button id="color-fill" title="颜色" class="tool-btn" @click="onFontFormat('color')"></button>
  <button id="f-quote" title="引用" class="tool-btn" @click="onFontFormat('quote')"></button>
  <button id="f-super" title="上标" class="tool-btn" @click="onInsertText('<sup> </sup>')"></button>
  <button id="f-sub" title="下标" class="tool-btn btn-split-line" @click="onInsertText('<sub> </sub>')"></button>
  <!-- 文字左对齐 文字居中 两边对其 文字右对齐 -->
  <button id="align-left" title="左对齐" class="tool-btn"></button>
  <button id="align-center" title="文字居中" class="tool-btn"></button>
  <button id="align-justify" title="两边对齐" class="tool-btn"></button>
  <button id="align-right" title="右对齐" class="tool-btn btn-split-line"></button>
  <!-- 有序列表 无序列表 水平线 段内换行 -->
  <button id="list-numbered" title="有序列表" class="tool-btn"></button>
  <button id="list-bulleted" title="无序列表" class="tool-btn"></button>
  <button id="line-scan" class="tool-btn" title="水平线"  @click="onInsertText('\r\n------------\r\n')"></button>
  <button id="line-enter" class="tool-btn" title="段内换行 btn-split-line" @click="onInsertText('\r\n')"></button>
  <!-- 行内代码 代码块 行内公式 公式块 -->
  <button id="code-line" class="tool-btn" title="行内代码" @click="onFontFormat('codeline')"></button>
  <button id="code-block" class="tool-btn" title="代码块" @click="onInsertText('\r\n```\r\n\r\n```\r\n')"></button>
  <button id="math-line" class="tool-btn" title="行内公式" @click="onFontFormat('mathline')"></button>
  <button id="math-block" class="tool-btn" title="公式块" @click="onInsertText('\r\n$$\r\n\r\n$$\r\n')"></button>
  <!-- 超链接 锚点链接 任务列表 -->
  <button id="line-links" title="超链接" class="tool-btn" @click="onInsertText('[]()')"></button>
  <button id="task-lists" title="任务列表" class="tool-btn btn-split-line"></button>
  <!-- 插入图片 图片居中 Emoji 表格 标记 分类 -->
  <button id="i-images" title="插入图片" class="tool-btn"></button>
  <button id="images-center" title="图片居中" class="tool-btn"></button>
  <button id="i-emoji" title="Emoji" class="tool-btn"></button>
  <button id="i-table" title="表格" class="tool-btn"></button>
  <button id="i-label" title="标记" class="tool-btn"></button>
  <button id="i-classification" title="分类" class="tool-btn btn-split-line"></button>
  <!-- material mermaid plantuml -->
  <button id="i-material" title="material" class="tool-btn"></button>
  <button id="i-mermaid" title="mermaid" class="tool-btn" @click="onInsertText('\r\n```mermaid\r\n\r\n```\r\n')" ></button>
  <button id="i-plantuml" title="plantuml" class="tool-btn" @click="onInsertText('\r\n```plantuml\r\n@startuml\r\n\r\n@enduml\r\n```\r\n')" ></button>
</template>
<script setup lang="ts">
import { onMounted, watch, ref, onBeforeUnmount } from 'vue'
import EventBus from '../../event-bus'
import { MdEditToolSvgs } from './markdown-edit'

const showWidth = ref('')

const props = defineProps({
  // 编辑器宽度
  toolBarWidth: {
    type: String,
    default: '100%'
  }
})

const buttonIds = ['']

function initButtonSvg() {
  for (const key in MdEditToolSvgs) {
    if (Object.prototype.hasOwnProperty.call(MdEditToolSvgs, key)) {
      buttonIds.push(key)
      // 确保 key 是 svgs 对象自身的属性
      const element = document.getElementById(key)
      if (element) {
        element.innerHTML = MdEditToolSvgs[key]
      }
    }
  }
}

function onRearrangeMenuButtons() {
  showWidth.value = props.toolBarWidth
  const select = document.getElementById('align-options')
  if (select) {
    while (select.firstChild) {
      select.removeChild(select.firstChild)
    }
  }

  // 遍历按钮ID数组，将不在当前视口中的按钮添加到下拉框中
  console.log('showWidth ', showWidth)
  const toolBarSize = parseInt(showWidth.value.replace('px', ''), 10)
  const showMenuNum = Math.floor(toolBarSize / 40)
  console.log('showMenuNum ', showMenuNum)
  console.log('buttonIds.length ', buttonIds.length)
  if (showMenuNum > buttonIds.length) {
    return
  }
}

onMounted(() => {
  initButtonSvg()
  onRearrangeMenuButtons()
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function onShowMore() {
  const group = document.getElementById('button-group')
  if (group) {
    if (group.style.display === 'none') {
      group.style.display = 'block'
    } else {
      group.style.display = 'none'
    }
  }
}

function onHideMore() {
  const group = document.getElementById('button-group')
  if (group) {
    group.style.display = 'none'
  }
}

function onFontHeaderFormat(context: string) {
  EventBus.$emit('monaco-editor-update-header-format', context)
  onHideMore()
}

function onFontFormat(context: string) {
  EventBus.$emit('monaco-editor-update-font-format', context)
  onHideMore()
}

function onInsertText(context: string) {
  EventBus.$emit('monaco-editor-insert-text', context)
  onHideMore()
}

watch(
  () => props.toolBarWidth,
  (value) => {
    showWidth.value = value
    onRearrangeMenuButtons()
  }
)

onMounted(() => {
  window.addEventListener('resize', onRearrangeMenuButtons)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onRearrangeMenuButtons)
})
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
