<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 class="header-display-center">HTML特殊字符对照表</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">HTML特殊字符对照表，支持查询 &#8672</p>
    <div>
      <input
        v-model="searchQuery"
        type="text"
        :style="{ width: htmlSpecCharTableWidth }"
        placeholder="Search ASCII..."
      />
    </div>
    <table style="margin-top: 20px" class="html-spec-char-table-style" :style="{ width: htmlSpecCharTableWidth }">
      <thead>
        <tr>
          <th class="html-spec-char-table-th">预览</th>
          <th class="html-spec-char-table-th">写法</th>
          <th class="html-spec-char-table-th">说明</th>
          <th class="html-spec-char-table-th">预览</th>
          <th class="html-spec-char-table-th">写法</th>
          <th class="html-spec-char-table-th">说明</th>
          <th class="html-spec-char-table-th">预览</th>
          <th class="html-spec-char-table-th">写法</th>
          <th class="html-spec-char-table-th">说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(char, index) in filterHtmlSpecChar" :key="index">
          <td class="html-spec-char-table-preview" v-html="char.id1"></td>
          <td class="html-spec-char-table-td">{{ char.id1 }}</td>
          <td class="html-spec-char-table-td">{{ char.mark1 }}</td>
          <td class="html-spec-char-table-preview" v-html="char.id2"></td>
          <td class="html-spec-char-table-td">{{ char.id2 }}</td>
          <td class="html-spec-char-table-td">{{ char.mark2 }}</td>
          <td class="html-spec-char-table-preview" v-html="char.id3"></td>
          <td class="html-spec-char-table-td">{{ char.id3 }}</td>
          <td class="html-spec-char-table-td">{{ char.mark3 }}</td>
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

const htmlSpecCharTable = [
  { id1: '&#36', mark1: '美元符号', id2: '&#162', mark2: '分币符号', id3: '&#163', mark3: '英镑'},
  { id1: '&#164', mark1: '通用货币符号', id2: '&#165', mark2: '人民币符号', id3: '&#8364', mark3: '欧元符号'},
  { id1: '&#8369', mark1: '菲律宾比索', id2: '&#8377', mark2: '印度货币符号', id3: '&#8355', mark3: '法郎'},
  { id1: '&#9833', mark1: '四分音符', id2: '&#9834', mark2: '八分音符', id3: '&#9835', mark3: '带梁的八分音符'},
  { id1: '&#9836', mark1: '带梁的十六分音符', id2: '&#9837', mark2: '音乐的降半音标记', id3: '&#9838', mark3: '音乐的升记号'},
  { id1: '&#9839', mark1: '音乐的还原记号', id2: '&#9840', mark2: '十字几号', id3: '&#9832', mark3: '温泉符号'},
  { id1: '&#9745', mark1: '方框对号', id2: '&#9746', mark2: '方框错号', id3: '&#10016', mark3: '十字星'},
  { id1: '&#10026', mark1: '星号', id2: '&#10017', mark2: '空心六角星', id3: '&#10036', mark3: '八角星'},
  { id1: '&#10052', mark1: '雪花1', id2: '&#10053', mark2: '雪花2', id3: '&#10054', mark3: '雪花3'},
  { id1: '&#8672', mark1: '向左的虚线箭头', id2: '&#8674', mark2: '向右的虚线箭头', id3: '&#8621', mark3: '弓形双箭头'},
  { id1: '&#8606', mark1: '向左的双箭头', id2: '&#8608', mark2: '向右的双箭头', id3: '&#10224', mark3: '向上房子箭头'},
  { id1: '&#8592', mark1: '向左的箭头', id2: '&#8594', mark2: '向右的箭头', id3: '&#10225', mark3: '倒立房子箭头'},
  { id1: '&#8596', mark1: '左右箭头', id2: '&#8644', mark2: '左右的双箭头', id3: '&#8629', mark3: '回车'},
  { id1: '&#8610', mark1: '向左的鱼骨箭头', id2: '&#8611', mark2: '向右的鱼骨箭头', id3: '&#8623', mark3: '多弯道路标'},
  { id1: '&#8619', mark1: '向左的绕线箭头', id2: '&#8620', mark2: '向右的绕线箭头', id3: '&#10152', mark3: '加粗的右箭头'},
  { id1: '&#8668', mark1: '向左的绕线箭头', id2: '&#8669', mark2: '向右的绕线箭头', id3: '&#10162', mark3: '阴影的右箭头'},
  { id1: '&#8678', mark1: '左箭头', id2: '&#8680', mark2: '右箭头', id3: '&#10148', mark3: '右三角箭头'},
  { id1: '&#8630', mark1: '左弯曲箭头', id2: '&#8631', mark2: '右弯曲箭头', id3: '&#9650', mark3: '三角形'},
  { id1: '&#8634', mark1: '逆时针旋转箭头', id2: '&#8635', mark2: '顺时针旋转箭头', id3: '&#9660', mark3: '倒三角'},
  { id1: '&#10226', mark1: '逆时针旋转', id2: '&#10227', mark2: '顺时针旋转', id3: '&#10084', mark3: '心形'},
  { id1: '&#8673', mark1: '向上的虚线箭头', id2: '&#8675', mark2: '向下的虚线箭头', id3: '&#9992', mark3: '飞机'},
  { id1: '&#8607', mark1: '向上的双箭头', id2: '&#8609', mark2: '向下的双箭头', id3: '&#9733', mark3: '五角星'},
  { id1: '&#8593', mark1: '向上的箭头', id2: '&#8595', mark2: '向下的箭头', id3: '&#10022', mark3: '四角星'},
  { id1: '&#8597', mark1: '上下箭头', id2: '&#8645', mark2: '上下的双箭头', id3: '&#9728', mark3: '八角星'},
  { id1: '&#8670', mark1: '向上的鱼骨箭头', id2: '&#8671', mark2: '向下的鱼骨箭头', id3: '&#9670', mark3: '小立正方形'},
  { id1: '&#8679', mark1: '上箭头', id2: '&#8681', mark2: '下箭头', id3: '&#9672', mark3: '嵌套正方形'},
  { id1: '&#171', mark1: '左书名号', id2: '&#187', mark2: '右书名号', id3: '&#161', mark3: '倒立的感叹号'},
  { id1: '&#139', mark1: '小于号', id2: '&#155', mark2: '大于号', id3: '&#191', mark3: '倒立的问号'},
  { id1: '&#8220', mark1: '左双引号', id2: '&#8221', mark2: '右双引号', id3: '&#8453', mark3: '百分号'},
  { id1: '&#8216', mark1: '左单引号', id2: '&#8217', mark2: '右单引号', id3: '&#8470', mark3: 'Number符号'},
  { id1: '&#8226', mark1: '着重号', id2: '&#9702', mark2: '句号', id3: '&#38', mark3: '逻辑与符号'},
  { id1: '&#8478', mark1: 'R标', id2: '&#124', mark2: '竖线', id3: '&#64', mark3: '邮箱符号'},
  { id1: '&#8451', mark1: '摄氏度', id2: '&#8457', mark2: '华氏度', id3: '&#176', mark3: '度'},
  { id1: '&#166', mark1: '竖虚线', id2: '&#8211', mark2: '连接符', id3: '&#8212', mark3: '横线'},
  { id1: '&#8230', mark1: '省略号', id2: '&#182', mark2: '行首符号', id3: '&#8764', mark3: '波浪线'},
  { id1: '&#8800', mark1: '不等号', id2: '&#174', mark2: '注册商标标记', id3: '&#169', mark3: '版权符号'},
  { id1: '&#8471', mark1: '录音版符号', id2: '&#153', mark2: '暂用商标符号', id3: '&#8480', mark3: '服务标记符号'},
  { id1: '&#8220', mark1: '左双引号', id2: '&#8221', mark2: '右双引号', id3: '&#8674', mark3: '向右的箭头'}
]

const searchQuery = ref('')

const htmlSpecCharTableWidth = computed(() => {
  const workWidthVal = parseInt(props.workAreaWidth.replace('px', ''), 10)
  const tableWidthVal = workWidthVal - 50
  return tableWidthVal + 'px'
})

const filterHtmlSpecChar = computed(() => {
  if (!searchQuery.value) {
    return htmlSpecCharTable
  }

  return htmlSpecCharTable.filter((item) => {
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
.html-spec-char-table-style {
  width: 100%;
  border-collapse: collapse;
}

.html-spec-char-table-th,
.html-spec-char-table-td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

.html-spec-char-table-preview {
  border: 1px solid #ddd;
  padding: 8px;
  background-color: #D5FFD5;
  text-align: center;
}

.html-spec-char-table-th {
  background-color: #f2f2f2;
}
</style>
