<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 class="header-display-center">数字大小写单位</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">数字大小写单位</p>
    <div>
      <input
        v-model="searchQuery"
        type="text"
        :style="{ width: numericCaseTableWidth }"
        placeholder="Search ASCII..."
      />
    </div>
    <table
      style="margin-top: 20px"
      class="numeric-case-table-style"
      :style="{ width: numericCaseTableWidth }"
    >
      <thead>
        <tr>
          <th class="numeric-case-table-th">数码</th>
          <th class="numeric-case-table-th">小写数字</th>
          <th class="numeric-case-table-th">大写数字</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in filterNumericCase" :key="index">
          <td class="numeric-case-table-id">{{ item.number }}</td>
          <td class="numeric-case-table-td">{{ item.lower }}</td>
          <td class="numeric-case-table-td">{{ item.upper }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, defineProps } from 'vue'
import { NumericCaseTable } from './Information'

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})

const searchQuery = ref('')

const numericCaseTableWidth = computed(() => {
  const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
  const tableWidthVal = workWidthVal - 50
  return tableWidthVal + 'px'
})

const filterNumericCase = computed(() => {
  if (!searchQuery.value) {
    return NumericCaseTable
  }

  return NumericCaseTable.filter((item) => {
    return (
      item.number.includes(searchQuery.value) ||
      item.lower.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.upper.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })
})
</script>

<style scoped>
.numeric-case-table-style {
  width: 100%;
  border-collapse: collapse;
}

.numeric-case-table-th,
.numeric-case-table-td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: center;
}

.numeric-case-table-id {
  border: 1px solid #ddd;
  padding: 8px;
  background-color: #d5ffd5;
  text-align: center;
}

.numeric-case-table-th {
  background-color: #f2f2f2;
}
</style>
