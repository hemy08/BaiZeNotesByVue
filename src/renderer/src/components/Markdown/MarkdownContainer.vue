<template>
  <div id="md-edit" class="md-edit">
    <MdEdit />
  </div>
  <div id="resizer-md" class="md">1</div>
  <div id="md-preview" class="md-preview"><MdPreview /></div>
</template>

<script setup lang="ts">
import MdEdit from './MarkdownEdit.vue'
import MdPreview from './MarkdownPreview.vue'
// import { languages } from 'monaco-editor'
// import markdownitvue from 'markdown-it-vue'
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
</style>
