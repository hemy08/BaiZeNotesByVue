<template>
  <div id="md-edit" class="md-edit">
    <MdEdit v-model="markdownEditorCode" @update:code="handleMarkdownCodeUpdate" />
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

function handleMarkdownCodeUpdate(newValue: string) {
  markdownEditorCode.value = newValue
  console.log(newValue)
}
</script>

<style scoped>
#md-edit {
  height: calc(100vh - 40px - 2px - 20px);
  width: 50%;
  overflow: auto;
  margin: 0;
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
}
</style>
