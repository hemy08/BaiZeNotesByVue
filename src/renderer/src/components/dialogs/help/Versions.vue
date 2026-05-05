<script setup lang="ts">
import { reactive } from 'vue'

const versions = reactive({ ...window.electron.process.versions })
</script>

<template>
  <ul class="versions">
    <br class="electron-version">Electron v{{ versions.electron }}</br>
    <br class="chrome-version">Chromium v{{ versions.chrome }}</br>
    <br class="node-version">Node v{{ versions.node }}</br>
  </ul>
</template>
