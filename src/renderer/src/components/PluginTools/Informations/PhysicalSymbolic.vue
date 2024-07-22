<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 class="header-display-center">物理符号常量</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">物理符号常量查询</p>
    <div>
      <input
        v-model="searchQuery"
        type="text"
        :style="{ width: physicalSymbolTableWidth }"
        placeholder="Search ASCII..."
      />
    </div>
    <table
      style="margin-top: 20px"
      class="physical-symbol-table-style"
      :style="{ width: physicalSymbolTableWidth }"
    >
      <thead>
        <tr>
          <th class="physical-symbol-table-th">符号</th>
          <th class="physical-symbol-table-th">名称</th>
          <th class="physical-symbol-table-th">说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in filterPhysicalSymbol" :key="index">
          <td class="physical-symbol-table-id">{{ item.symbol }}</td>
          <td class="physical-symbol-table-td">{{ item.name }}</td>
          <td class="physical-symbol-table-td">{{ item.mark }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, defineProps } from 'vue'
import { PhysicalTable } from './Information'

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})

const searchQuery = ref('')

const physicalSymbolTableWidth = computed(() => {
  const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
  const tableWidthVal = workWidthVal - 50
  return tableWidthVal + 'px'
})

const filterPhysicalSymbol = computed(() => {
  if (!searchQuery.value) {
    return PhysicalTable
  }

  return PhysicalTable.filter((item) => {
    return (
      item.symbol.includes(searchQuery.value) ||
      item.name.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.mark.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })
})
</script>

<style scoped>
.physical-symbol-table-style {
  width: 100%;
  border-collapse: collapse;
}

.physical-symbol-table-th,
.physical-symbol-table-td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

.physical-symbol-table-id {
  border: 1px solid #ddd;
  padding: 8px;
  background-color: #d5ffd5;
  text-align: center;
}

.physical-symbol-table-th {
  background-color: #f2f2f2;
}
</style>
