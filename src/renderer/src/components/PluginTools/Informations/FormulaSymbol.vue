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
    <table style="margin-top: 20px" class="formula-symbol-table-style" :style="{ width: formulaSymbolTableWidth }">
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
          <td class="formula-symbol-table-td">{{ item.id1 }}</td>
          <td class="formula-symbol-table-td">{{ item.mark1 }}</td>
          <td class="formula-symbol-table-td">{{ item.id2 }}</td>
          <td class="formula-symbol-table-td">{{ item.mark2 }}</td>
          <td class="formula-symbol-table-td">{{ item.id3 }}</td>
          <td class="formula-symbol-table-td">{{ item.mark3 }}</td>
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

const formulaSymbolTable = [
  { id1: '≈', mark1: '约等于', id2: '≡', mark2: '恒等于', id3: '≠', mark3: '不等于'},
  { id1: '＝', mark1: '等于号', id2: '≤', mark2: '小于等于', id3: '≥', mark3: '大于等于'},
  { id1: '＜', mark1: '小于', id2: '＞', mark2: '大于', id3: '∀', mark3: '任意'},
  { id1: '∃', mark1: '存在', id2: '∷', mark2: '成比例', id3: '±', mark3: '正负号'},
  { id1: '＋', mark1: '加号', id2: '－', mark2: '减号', id3: '×', mark3: '乘号'},
  { id1: '÷', mark1: '除号', id2: '∫', mark2: '积分', id3: '∮', mark3: '闭合曲面（曲线）积分'},
  { id1: '∝', mark1: '正比例', id2: '∞', mark2: '无穷大', id3: '∧', mark3: '与（合取）'},
  { id1: '∨', mark1: '或（析取）', id2: '¬', mark2: '非（否定）', id3: '→', mark3: '蕴含'},
  { id1: '⇔', mark1: '双条件（等价', id2: '∑', mark2: '求和', id3: '∏', mark3: '求积'},
  { id1: '∪', mark1: '并集', id2: '∩', mark2: '交集', id3: '∈', mark3: '属于'},
  { id1: '∉', mark1: '不属于', id2: '⊆', mark2: '包含于', id3: '⊇', mark3: '包含'},
  { id1: '∵', mark1: '因为', id2: '∴', mark2: '所以', id3: '⊥', mark3: '垂直'},
  { id1: '‖', mark1: '平行', id2: '∠', mark2: '角', id3: '⌒', mark3: '半圆'},
  { id1: '⊙', mark1: '园', id2: '≌', mark2: '全等', id3: '∽', mark3: '相似'},
  { id1: '△', mark1: '三角形', id2: '≡', mark2: '分币符号', id3: 'π', mark3: '圆周率'},
  { id1: 'e', mark1: '自然常数', id2: 'ⁿ', mark2: 'n次方', id3: '√', mark3: '根号'},
  { id1: 'f(x)', mark1: '函数', id2: 'lim', mark2: '极限', id3: '℃', mark3: '摄氏度'},
  { id1: 'α', mark1: 'Alpha', id2: 'β', mark2: 'Beta', id3: 'γ', mark3: 'Gamma'},
  { id1: 'δ', mark1: 'Delta', id2: 'ε', mark2: 'Epsilon', id3: 'ζ', mark3: 'Zeta'},
  { id1: 'η', mark1: 'Eta', id2: 'θ', mark2: 'Theta', id3: 'ι', mark3: 'Iota'},
  { id1: 'κ', mark1: 'Kappa', id2: 'λ', mark2: 'Lambda', id3: 'μ', mark3: 'Mu'},
  { id1: 'ν', mark1: 'Nu', id2: 'ξ', mark2: 'Xi', id3: 'ο', mark3: 'Omicron'},
  { id1: 'π', mark1: 'Pi', id2: 'ρ', mark2: 'Rho', id3: 'σ', mark3: 'Sigma'},
  { id1: 'τ', mark1: 'Tau', id2: 'υ', mark2: 'Upsilon', id3: 'φ', mark3: 'Phi'},
  { id1: 'χ', mark1: 'Chi', id2: 'ψ', mark2: 'Psi', id3: 'ω', mark3: 'Omega'}
]

const searchQuery = ref('')

const formulaSymbolTableWidth = computed(() => {
  const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
  const tableWidthVal = workWidthVal - 50
  return tableWidthVal + 'px'
})

const filterFormulaSymbol = computed(() => {
  if (!searchQuery.value) {
    return formulaSymbolTable
  }

  return formulaSymbolTable.filter((item) => {
    return (
      item.id1.includes(searchQuery.value) ||
      item.mark1.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.id2.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.mark2.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.id3.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.mark3.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })
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
  background-color: #D5FFD5;
  text-align: center;
}

.formula-symbol-table-th {
  background-color: #f2f2f2;
}
</style>
