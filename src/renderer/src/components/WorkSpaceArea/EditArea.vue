<template>
  <div id="md-tools-bar" class="md-tools-bar"><MdEditTools /></div>
  <div id="md-container" class="md-container"><MdContainer /></div>
</template>

<script setup lang="ts">
import MdEditTools from '../Markdown/MarkdownEditTools.vue'
import MdContainer from '../Markdown/MarkdownContainer.vue'
</script>

<style scoped>
#md-tools-bar {
  width: 100%;
  height: 40px;
}

#md-container {
  height: calc(100vh - 40px - 2px - 20px);
  display: flex;
  flex-direction: row;
}
</style>
