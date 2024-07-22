<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 class="header-display-center">子网掩码对照表</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">IP地址 子网掩码对照表</p>
    <div>
      <input
        v-model="searchQuery"
        type="text"
        :style="{ width: subnetMaskMapTableWidth }"
        placeholder="Search ASCII..."
      />
    </div>
    <table style="margin-top: 20px" class="subnet-mask-map-table-style" :style="{ width: subnetMaskMapTableWidth }">
      <thead>
        <tr>
          <th class="subnet-mask-map-table-th">掩码</th>
          <th class="subnet-mask-map-table-th">位</th>
          <th class="subnet-mask-map-table-th">IP数</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(item, index) in filterPhysicalSymbol" :key="index">
          <td class="subnet-mask-map-table-td">{{ item.mask }}</td>
          <td class="subnet-mask-map-table-td">{{ item.bit }}</td>
          <td class="subnet-mask-map-table-td">{{ item.nums }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, defineProps } from 'vue'

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})

const subnetMaskMapTable = [
  { mask: '255.255.255.255', bit: '32', nums: '1' },
  { mask: '255.255.255.254', bit: '31', nums: '2' },
  { mask: '255.255.255.252', bit: '30', nums: '4' },
  { mask: '255.255.255.248', bit: '29', nums: '8' },
  { mask: '255.255.255.240', bit: '28', nums: '16' },
  { mask: '255.255.255.224', bit: '27', nums: '32' },
  { mask: '255.255.255.192', bit: '26', nums: '64' },
  { mask: '255.255.255.128', bit: '25', nums: '128' },
  { mask: '255.255.255.0', bit: '24', nums: '256' },
  { mask: '255.255.254.0', bit: '23', nums: '512' },
  { mask: '255.255.252.0', bit: '22', nums: '1024' },
  { mask: '255.255.248.0', bit: '21', nums: '2048' },
  { mask: '255.255.240.0', bit: '20', nums: '4096' },
  { mask: '255.255.224.0', bit: '19', nums: '8192' },
  { mask: '255.255.192.0', bit: '18', nums: '16384' },
  { mask: '255.255.128.0', bit: '17', nums: '32768' },
  { mask: '255.255.0.0', bit: '16', nums: '65536' },
  { mask: '255.254.0.0', bit: '15', nums: '131072' },
  { mask: '255.252.0.0', bit: '14', nums: '262144' },
  { mask: '255.248.0.0', bit: '13', nums: '524288' },
  { mask: '255.240.0.0', bit: '12', nums: '1048576' },
  { mask: '255.224.0.0', bit: '11', nums: '2097152' },
  { mask: '255.192.0.0', bit: '10', nums: '4194304' },
  { mask: '255.128.0.0', bit: '9', nums: '8388608' },
  { mask: '255.0.0.0', bit: '8', nums: '16777216' },
  { mask: '254.0.0.0', bit: '7', nums: '33554432' },
  { mask: '252.0.0.0', bit: '6', nums: '67108864' },
  { mask: '248.0.0.0', bit: '5', nums: '134217728' },
  { mask: '240.0.0.0', bit: '4', nums: '268435456' },
  { mask: '224.0.0.0', bit: '3', nums: '536870912' },
  { mask: '192.0.0.0', bit: '2', nums: '1073741824' },
  { mask: '128.0.0.0', bit: '1', nums: '2147483648' },
  { mask: '0.0.0.0', bit: '0', nums: '4294967296' }
]

const searchQuery = ref('')

const subnetMaskMapTableWidth = computed(() => {
  const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
  const tableWidthVal = workWidthVal - 50
  return tableWidthVal + 'px'
})

const filterPhysicalSymbol = computed(() => {
  if (!searchQuery.value) {
    return subnetMaskMapTable
  }

  return subnetMaskMapTable.filter((item) => {
    return (
      item.mask.includes(searchQuery.value) ||
      item.bit.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.nums.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })
})
</script>

<style scoped>
.subnet-mask-map-table-style {
  width: 100%;
  border-collapse: collapse;
}

.subnet-mask-map-table-th,
.subnet-mask-map-table-td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

.subnet-mask-map-table-id {
  border: 1px solid #ddd;
  padding: 8px;
  background-color: #D5FFD5;
  text-align: center;
}

.subnet-mask-map-table-th {
  background-color: #f2f2f2;
}
</style>
