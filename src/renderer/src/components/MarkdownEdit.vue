<template>
  <div v-html="htmlContent"></div>
</template>

<script setup lang="ts">
import MarkdownIt from 'markdown-it'

// eslint-disable-next-line vue/no-export-in-script-setup
export default {
  data() {
    return {
      htmlContent: ''
    }
  },
  mounted() {
    const md = new MarkdownIt();
    this.htmlContent = md.render('# Markdown Title\nThis is a paragraph.');
  }
}
</script>

<style scoped>

</style>
