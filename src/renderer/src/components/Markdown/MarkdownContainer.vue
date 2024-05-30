<template>
  <div id="md-edit" class="md-edit">
    <MdEdit
      v-model="markdownEditorCode"
      :code="initialCodeContent"
      @update:code="handleMarkdownCodeUpdate"
    />
  </div>
  <div id="resizer-md" class="md">1</div>
  <div id="md-preview" class="md-preview">
    <MdPreview :code="markdownEditorCode" />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import MdEdit from './MarkdownEdit.vue'
import MdPreview from './MarkdownPreview.vue'

const markdownEditorCode = ref('')
let initialCodeContent = 'Hello world'

function handleMarkdownCodeUpdate(newValue: string) {
  markdownEditorCode.value = newValue
}

window.electron.ipcRenderer.on('open-selected-file-content', (_, fileContent: string) => {
  if (fileContent) {
    initialCodeContent = fileContent
    handleMarkdownCodeUpdate(fileContent)
  } else {
    handleMarkdownCodeUpdate(initialCodeContent)
  }
})
</script>

<style scoped>
#md-edit {
  height: calc(100vh - 40px - 2px - 20px);
  width: 50%;
  margin: 0;
  overflow: hidden;
}

#resizer-md {
  cursor: col-resize;
  width: 4px; /* Adjust this based on your needs */
  color: blue;
  background-color: red;
  height: calc(100vh - 40px - 2px - 20px);
}

#md-preview {
  background-color: white;
  width: 50%;
  height: auto;
  color: black;
  overflow: auto;
}
</style>
