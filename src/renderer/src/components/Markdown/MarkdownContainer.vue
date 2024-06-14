<template>
  <div id="md-edit-tools-bar" class="md-edit-tools-bar"><MdEditTools /></div>
  <div id="md-edit-component" class="md-edit-component"><MdEditComp /></div>
</template>

<script setup lang="ts">
import MdEditTools from './MarkdownEditToolsComponent.vue'
import MdEditComp from './MarkdownEditComponent.vue'
</script>

<style scoped>
#md-edit-tools-bar {
  width: 100%;
  height: 40px;
  background-color: #f2f2f2;
  color: black;
  align-items: center;
  display: flex;
}

#md-edit-component {
  height: calc(100vh - 40px - 2px - 20px);
  display: flex;
  flex-direction: row;
}
</style>
