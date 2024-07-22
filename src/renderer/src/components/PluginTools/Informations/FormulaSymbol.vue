<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 class="header-display-center">数学公式符号</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">数学公式符号查询</p>
    <div>
      <input
        v-model="searchQuery"
        type="text"
        :style="{ width: formulaSymbolTableWidth }"
        placeholder="Search ASCII..."
      />
    </div>
    <table
      style="margin-top: 20px"
      class="formula-symbol-table-style"
      :style="{ width: formulaSymbolTableWidth }"
    >
      <thead>
        <tr>
          <th class="formula-symbol-table-th">符号</th>
          <th class="formula-symbol-table-th">说明</th>
          <th class="formula-symbol-table-th">符号</th>
          <th class="formula-symbol-table-th">说明</th>
          <th class="formula-symbol-table-th">符号</th>
          <th class="formula-symbol-table-th">说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in filterFormulaSymbol" :key="index">
          <template v-for="symbol in item" :key="symbol.id">
            <td class="formula-symbol-table-td">
              {{ symbol.id }}
            </td>
            <td class="formula-symbol-table-td">
              {{ symbol.mark }}
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, defineProps } from 'vue'
import { FormulaSymbolTable, CompressedArray } from './Information'

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})

const searchQuery = ref('')
const formulaSymbolTableWidth = computed(() => {
  const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
  const tableWidthVal = workWidthVal - 50
  return tableWidthVal + 'px'
})

const filterFormulaSymbol = computed(() => {
  if (!searchQuery.value) {
    return CompressedArray(FormulaSymbolTable, 3)
  }

  const SearchQuery = FormulaSymbolTable.filter((item) => {
    return (
      item.id.toLowerCase().includes(searchQuery.value) ||
      item.mark.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })
  return CompressedArray(SearchQuery, 3)
})
</script>

<style scoped>
.formula-symbol-table-style {
  width: 100%;
  border-collapse: collapse;
}

.formula-symbol-table-th,
.formula-symbol-table-td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

.formula-symbol-table-preview {
  border: 1px solid #ddd;
  padding: 8px;
  background-color: #d5ffd5;
  text-align: center;
}

.formula-symbol-table-th {
  background-color: #f2f2f2;
}
</style>
