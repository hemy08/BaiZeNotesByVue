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
    <table style="margin-top: 20px" class="physical-symbol-table-style" :style="{ width: physicalSymbolTableWidth }">
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

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})

const physicalSymbolTable = [
  { symbol: 'm', name: '质量', mark: '单位为千克（kg），表示物体所含物质的多少。' },
  { symbol: 'v', name: '速度', mark: '单位为米每秒（m/s），表示物体运动的快慢和方向。' },
  { symbol: 'a', name: '加速度', mark: '单位为米每二次方秒（m/s²），表示物体速度变化的快慢和方向。' },
  { symbol: 'F', name: '力', mark: '单位为牛顿（N），表示物体间的相互作用。' },
  { symbol: 'p', name: '动量', mark: '单位为千克米每秒（kg·m/s），表示物体的质量和速度的乘积，是描述物体运动状态的物理量。' },
  { symbol: 'W', name: '功', mark: '单位为焦耳（J），表示力对物体做功的多少。' },
  { symbol: 'E', name: '能量', mark: '单位为焦耳（J），表示物体做功的能力。' },
  { symbol: 's 或 x', name: '位移', mark: '单位为米（m），表示物体位置的变化。' },
  { symbol: 't', name: '时间', mark: '单位为秒（s），表示运动过程所经历的时间。' },
  { symbol: 'q', name: '电荷量', mark: '单位为库仑（C），表示物体带电的多少。' },
  { symbol: 'I', name: '电流', mark: '单位为安培（A），表示电荷的定向移动。' },
  { symbol: 'R', name: '电阻', mark: '单位为欧姆（Ω），表示导体对电流的阻碍作用。' },
  { symbol: 'C', name: '电容', mark: '单位为法拉（F），表示电容器储存电荷的能力。' },
  { symbol: 'B', name: '磁场强度', mark: '单位为特斯拉（T），表示磁场的强弱和方向。' },
  { symbol: 'g', name: '重力加速度', mark: '单位为米每二次方秒（m/s²），表示在地球表面附近自由落体运动的加速度，约为9.8m/s²。' },
  { symbol: 'h', name: '普朗克常数', mark: '单位为焦耳秒（J·s），是量子力学中的一个重要常数。' },
  { symbol: 'k_B', name: '玻尔兹曼常数', mark: '单位为焦耳每开尔文（J/K），是统计力学和热力学中的一个重要常数。' },
  { symbol: 'G', name: '万有引力常数', mark: '描述两个物体之间引力大小的物理常数。约为6.67430×10^-11立方米每千克每秒的平方（m³·kg^-1·s^-2）。' },
  { symbol: 'm_e', name: '电子质量', mark: '电子的静止质量。约为9.1093837015×10^-31千克（kg）。描述电子的基本属性之一，对理解原子和分子的结构至关重要。' },
  { symbol: 'm_p', name: '质子质量', mark: '质子的静止质量。约为1.67262192369×10^-27千克（kg）。原子核的组成部分之一，对理解原子核的结构和性质有重要意义。' },
  { symbol: 'm_n', name: '中子质量。', mark: '中子的静止质量。约为1.674927471×10^-27千克（kg）。原子核的另一种组成部分，对理解原子核的稳定性和衰变过程有重要作用。' },
  { symbol: 'N_A', name: '阿伏伽德罗常数', mark: '1摩尔物质所含的基本单位（如原子、分子等）的数目。约为6.02214076×1023个/摩尔（mol-1）。化学和物理学中的基础常数，用于描述物质的微观结构和宏观性质之间的关系。' },
  { symbol: 'F', name: '法拉第常数', mark: '每摩尔电子所带的电荷量。值：约为96485.33289库仑/摩尔（C/mol）。电化学中的基础常数，用于描述电解过程中电荷的转移和物质的量的关系。' },
  { symbol: 'ε_0', name: '真空介电常数', mark: '描述真空中电场强度与电位移之间关系的物理常数。约为8.854187817×10^-12法拉/米（F/m）。电磁学中的基础常数之一，用于描述电场和磁场在真空中的传播和相互作用。' }
]

const searchQuery = ref('')

const physicalSymbolTableWidth = computed(() => {
  const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
  const tableWidthVal = workWidthVal - 50
  return tableWidthVal + 'px'
})

const filterPhysicalSymbol = computed(() => {
  if (!searchQuery.value) {
    return physicalSymbolTable
  }

  return physicalSymbolTable.filter((item) => {
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
  background-color: #D5FFD5;
  text-align: center;
}

.physical-symbol-table-th {
  background-color: #f2f2f2;
}
</style>
