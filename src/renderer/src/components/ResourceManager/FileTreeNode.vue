<template>
  <div class="file-tree-node" :class="{ indented: isIndented }">
    <div class="node-content" @click="handleClick(node)">
      <!-- 如果是文件夹，显示文件夹图标和名称，并提供一个展开/收起按钮 -->
      <span v-if="node.type === 'folder'">
        <button style="border: none; background-color: transparent" @click="toggleFolder">
          {{ isExpanded ? 'v' : '>' }}
        </button>
        <svg v-if="isExpanded == true" class="folder-icon" viewBox="0 0 16 16">
          <path
            id="_Compound_Path_"
            data-name="&lt;Compound Path&gt;"
            class="icon-canvas-transparent"
            d="M0,0H16V16H0Z"
          />
          <path
            class="icon-vs-out"
            d="M0,2.969v9A1.944,1.944,0,0,0,.57,13.4,2.4,2.4,0,0,0,2,13.969H13.677L16,8.165v-1.2H15v-2a1.959,1.959,0,0,0-2-2H10.116l-1-2H2A1.942,1.942,0,0,0,0,2.969Z"
          />
          <path
            class="icon-folder"
            d="M1,3v9a.958.958,0,0,0,1,.984H2V3H8L9,5h4V8H4L2,13H13l2-5H14V5c0-1-1.236-1-1-1H9.5l-1-2H2A.979.979,0,0,0,1,3Z"
          />
        </svg>
        <svg v-if="isExpanded == false" class="folder-icon" viewBox="0 0 16 16">
          <path class="icon-canvas-transparent" d="M0,0H16V16H0Z" />
          <path
            class="icon-vs-out"
            d="M1.5,1H9.61l1,2H13.5A1.5,1.5,0,0,1,15,4.5v8A1.5,1.5,0,0,1,13.5,14H1.5A1.5,1.5,0,0,1,0,12.5V2.5A1.5,1.5,0,0,1,1.5,1Z"
          />
          <path class="icon-vs-fg" d="M2,3H8.374l.5,1H2Z" />
          <path
            class="icon-folder"
            d="M13.5,4h-3.5l-1-2H1.5a.5.5,0,0,0-.5.5v10a.5.5,0,0,0,.5.5h12a.5.5,0,0,0,.5-.5v-8A.5.5,0,0,0,13.5,4ZM2,3H8.374l.5,1H2Z"
          />
        </svg>
        <span class="file-manager-node-name">{{ node.name }}</span>
      </span>
      <!-- 如果是文件，只显示文件图标和名称 -->
      <span v-else>
        <svg class="file-icon" viewBox="0 0 16 16">
          <path class="icon-canvas-transparent" d="M0 0h16v16H0z" />
          <path class="icon-vs-out" d="M2 16V0h8.832L15 4.208V16H2z" />
          <path
            class="icon-vs-bg"
            d="M8 6H5V5h3v1zm4 1H5v1h7V7zm0 2H5v1h7V9zm0 2H5v1h7v-1zM10.442 1H3v14h11V4.562L10.442 1zM10 2.207L12.793 5H10V2.207zM13 14H4V2h5v4h4v8z"
          />
          <path
            class="icon-vs-fg"
            d="M9 6V2H4v12h9V6H9zM5 5h3v1H5V5zm7 7H5v-1h7v1zm0-2H5V9h7v1zm0-2H5V7h7v1zm1-3h-3V2l3 3z"
          />
        </svg>
        <span class="file-manager-node-name">{{ node.name }}</span>
      </span>
    </div>
    <!-- 如果当前是文件夹并且已经展开，递归显示子节点 -->
    <div v-if="node.type === 'folder' && isExpanded">
      <FileTreeNode
        v-for="child in node.children"
        :key="child.id"
        v-model:is-expanded="child.isExpanded"
        :node="child"
        :is-indented="true"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, defineProps, PropType } from 'vue'

// 定义 props 类型
// @ts-ignore eslint-disable-next-line @typescript-eslint/no-unused-vars
const props = defineProps({
  node: {
    type: Object as PropType<{
      id: never
      name: string
      path: string
      type: 'folder' | 'file'
      isDirectory: boolean
      isIndented: boolean
      isExpanded: boolean
      children?: {
        id: never
        name: string
        path: string
        type: 'folder' | 'file'
        isDirectory: boolean
        isIndented: boolean
        isExpanded: boolean
        children?: never[]
      }[]
    }>,
    required: true
  },
  isIndented: {
    type: Boolean,
    default: false // 根据你的需求设置默认值
  },
  isExpanded: {
    type: Boolean,
    default: false
  }
})

// eslint-disable-next-line vue/no-dupe-keys
const isExpanded = ref(false) // 控制文件夹是否展开
const toggleFolder = () => {
  isExpanded.value = !isExpanded.value
}

function handleFileSelect(path: string) {
  window.electron.ipcRenderer.send('open-select-file', path)
}

function handleClick(node) {
  if (node.type === 'file' && node.name.endsWith('.md')) {
    handleFileSelect(node.path)
  }
}
</script>

<style scoped>
.indented {
  margin-left: 1em; /* 设置缩进 */
}

.file-tree-node {
  overflow-y: auto;
  height: 100%;
  line-height: 1.6;
}

.file-manager-node-name {
  font-size: 12pt;
}

.file-icon {
  width: 18px;
  height: 18px;
  overflow: hidden;
  display: inline;
  margin-right: 2px;
  color: #00b0ff;
}

.folder-icon {
  width: 18px;
  height: 18px;
  overflow: hidden;
  display: inline;
}

.icon-folder {
  fill: #dcb67a;
}

.icon-canvas-transparent {
  opacity: 0;
  fill: #f6f6f6;
}
.icon-vs-out {
  fill: #f6f6f6;
}
.icon-vs-bg {
  fill: #0000FF;
}
.icon-vs-fg {
  fill: deepskyblue;
}
</style>
