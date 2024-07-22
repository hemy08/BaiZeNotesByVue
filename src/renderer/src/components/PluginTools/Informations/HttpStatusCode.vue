<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 class="header-display-center">HTTP 消息状态码</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">HTTP 消息状态码和对应的解释</p>
    <div>
      <input
        v-model="searchQuery"
        type="text"
        :style="{ width: httpStatusCodeTableWidth }"
        placeholder="Search ASCII..."
      />
    </div>
    <table
      style="margin-top: 20px"
      class="http-code-table-style"
      :style="{ width: httpStatusCodeTableWidth }"
    >
      <thead>
        <tr>
          <th class="http-code-table-th">状态码</th>
          <th class="http-code-table-th">说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in filterHttpStatusCode" :key="index">
          <td class="http-code-table-id">{{ item.code }}</td>
          <td class="http-code-table-td" v-html="cleanHtml(item.desc)"></td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, defineProps } from 'vue'
import { HTTPStatusCodeTable } from './Information'

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})

const searchQuery = ref('')

const httpStatusCodeTableWidth = computed(() => {
  const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
  const tableWidthVal = workWidthVal - 50
  return tableWidthVal + 'px'
})

const filterHttpStatusCode = computed(() => {
  if (!searchQuery.value) {
    return HTTPStatusCodeTable
  }

  return HTTPStatusCodeTable.filter((item) => {
    return (
      item.code.includes(searchQuery.value) ||
      item.desc.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })
})

function cleanHtml(desc) {
  // 替换 \r\n 为 <br />
  return desc.replace(/\r\n/g, '<br />');
}
</script>

<style scoped>
.http-code-table-style {
  width: 100%;
  border-collapse: collapse;
}

.http-code-table-th,
.http-code-table-td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

.http-code-table-id {
  border: 1px solid #ddd;
  padding: 8px;
  background-color: #d5ffd5;
  text-align: left;
}

.http-code-table-th {
  background-color: #f2f2f2;
}
</style>
