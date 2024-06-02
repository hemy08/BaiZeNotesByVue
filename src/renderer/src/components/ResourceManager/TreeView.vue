<template>
  <ul>
    <li v-for="item in treeData" :key="item.id">
      {{ item.name }}
      <!-- 如果项有子项，递归调用自身 -->
      <tree-view v-if="item.children && item.children.length" :tree-data="item.children" />
    </li>
  </ul>
</template>

<script lang="ts">
import { Vue, Component, Prop } from 'vue-property-decorator';

@Component
export default class TreeView extends Vue {
  @Prop({ type: Array, required: true }) readonly treeData!: Array<never>; // 这里假设 treeData 是一个数组，每个元素包含 id, name, children 等属性
}
</script>

<style scoped>
/* 样式 */
</style>
