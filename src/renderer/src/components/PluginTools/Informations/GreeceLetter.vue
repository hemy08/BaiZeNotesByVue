<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 class="header-display-center">希腊字母对照</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">希腊字母大小写对照</p>
    <div>
      <input
        v-model="searchQuery"
        type="text"
        :style="{ width: greeceLetterTableWidth }"
        placeholder="Search ASCII..."
      />
    </div>
    <table
      style="margin-top: 20px"
      class="greece-letter-table-style"
      :style="{ width: greeceLetterTableWidth }"
    >
      <thead>
        <tr>
          <th class="greece-letter-table-th-preview">特殊符号</th>
          <th class="greece-letter-table-th">命名实体</th>
          <th class="greece-letter-table-th">十进制编码</th>
          <th class="greece-letter-table-th-preview">特殊符号</th>
          <th class="greece-letter-table-th">命名实体</th>
          <th class="greece-letter-table-th">十进制编码</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in filterGreeceLetter" :key="index">
          <template v-for="symbol in item" :key="symbol.id">
            <td class="greece-letter-table-preview" v-html="symbol.code"></td>
            <td class="greece-letter-table-td">
              {{ symbol.char }}
            </td>
            <td class="greece-letter-table-td">
              {{ symbol.code }}
            </td>
          </template>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, defineProps } from 'vue'
import { GreeceLetterTable, CompressedArray } from './Information'

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})

const searchQuery = ref('')
const greeceLetterTableWidth = computed(() => {
  const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
  const tableWidthVal = workWidthVal - 50
  return tableWidthVal + 'px'
})

const filterGreeceLetter = computed(() => {
  if (!searchQuery.value) {
    return CompressedArray(GreeceLetterTable, 2)
  }

  const SearchQuery = GreeceLetterTable.filter((item) => {
    return (
      item.char.toLowerCase().includes(searchQuery.value) ||
      item.code.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })
  return CompressedArray(SearchQuery, 2)
})
</script>

<style scoped>
.greece-letter-table-style {
  width: 100%;
  border-collapse: collapse;
}

.greece-letter-table-th,
.greece-letter-table-td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

.greece-letter-table-preview {
  border: 1px solid #ddd;
  padding: 8px;
  background-color: #d5ffd5;
  text-align: center;
}

.greece-letter-table-th {
  background-color: #f2f2f2;
}

.greece-letter-table-th-preview {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: center;
  background-color: #f2f2f2;
}
</style>
