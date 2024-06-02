<template>
  <ul>
    <li v-for="file in fileList" :key="file.id">
      {{ file.name }}
      <!-- 这里可以添加其他信息，如文件大小、修改日期等 -->
    </li>
  </ul>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

@Component
export default class FileList extends Vue {
  @Prop({ type: Array, required: true }) readonly fileList!: Array<any>; // 这里假设 fileList 是一个数组，每个元素包含 id, name 等属性
}
</script>

<style scoped>
/* 样式 */
</style>
