<template>
  <div id="custom-context-menu" class="custom-context-menu">
    <hr />
    <div
      v-if="node.type === 'folder'"
      id="file-manager-custom-menu-new"
      class="custom-menu-item-node"
      @click="handleCreateNewFolder"
    >
      新建文件夹
    </div>
    <div id="file-manager-custom-menu-new" class="custom-menu-item-node">新建Markdown文件</div>
    <hr />
    <div id="file-manager-custom-menu-cut" class="custom-menu-item-node">剪切</div>
    <div id="file-manager-custom-menu-copy" class="custom-menu-item-node" @mouseover="showCopySubmenu" @mouseleave="hideCopySubmenu">
      复制
      <div
        v-if="submenuVisible"
        class="submenu"
        @mouseover="handleSubMenuOver"
        @mouseleave="handleSubMenuLeave"
      >
        <div id="file-manager-custom-submenu-copy-file" class="custom-menu-item-node">复制</div>
        <div id="file-manager-custom-submenu-copy-full-path" class="custom-menu-item-node">
          复制文件全路径
        </div>
        <div id="file-manager-custom-submenu-copy-current-path" class="custom-menu-item-node">
          相对于当前打开文件路径
        </div>
        <div id="file-manager-custom-submenu-copy-file-link" class="custom-menu-item-node">
          复制为文件链接
        </div>
      </div>
    </div>
    <div id="file-manager-custom-menu-paste" class="custom-menu-item-node">粘贴</div>
    <div id="file-manager-custom-menu-quote" class="custom-menu-item-node">引用</div>
    <hr />
    <div id="file-manager-custom-menu-replace-in-file" class="custom-menu-item-node">
      在文件中替换
    </div>
    <div id="file-manager-custom-menu-search-in-file" class="custom-menu-item-node">
      在文件中查找
    </div>
    <hr />
    <div id="file-manager-custom-menu-delete" class="custom-menu-item-node">删除</div>
    <div id="file-manager-custom-menu-rename" class="custom-menu-item-node">重命名</div>
    <div id="file-manager-custom-menu-refresh" class="custom-menu-item-node">刷新</div>
    <hr />
    <div id="file-manager-custom-menu-open-in-explorer" class="custom-menu-item-node">
      从资源管理器打开
    </div>
    <div id="file-manager-custom-menu-reload-from-disk" class="custom-menu-item-node">
      从磁盘重新加载
    </div>
    <hr />
    <div id="file-manager-custom-menu-property" class="custom-menu-item-node">属性</div>
    <hr />
  </div>
</template>

<script setup lang="ts">
import { defineProps, PropType, ref } from 'vue'
import { FileSysItem } from './resource-manager'

const submenuVisible = ref(false)
const submenuOver = ref(false)

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
  },
  hasContextMenu: {
    type: Boolean,
    default: false
  }
})

function showCopySubmenu() {
  submenuVisible.value = true
}

function hideCopySubmenu() {
  submenuVisible.value = false
}

function handleSubMenuOver() {
  submenuOver.value = true
}

function handleSubMenuLeave() {
  if (submenuOver.value) {
    submenuVisible.value = false
    submenuOver.value = false
  }
}

function handleCreateNewFolder() {
  console.log('props', props.node)
}
</script>

<style scoped>
.custom-menu-item-node {
  padding-left: 20px;
  font-size: 15px;
}

.custom-menu-item-node:hover {
  background-color: #eaeaea;
}

.submenu {
  /* 子菜单样式 */
  position: absolute;
  top: 110px;
  left: 100%; /* 或者其他适合你的布局的值 */
  background-color: whitesmoke;
}
</style>
