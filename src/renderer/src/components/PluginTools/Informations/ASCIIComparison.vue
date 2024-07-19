<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 class="header-display-center">ASCII 对照表</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">ASCII 对照表，支持查询</p>
    <div>
      <input
        v-model="searchQuery"
        type="text"
        :style="{ width: asciiTableWidth }"
        placeholder="Search ASCII..."
      />
    </div>
    <table style="margin-top: 20px" class="ascii-table-style" :style="{ width: asciiTableWidth }">
      <thead>
        <tr>
          <th class="ascii-table-th">Bin(二进制)</th>
          <th class="ascii-table-th">Oct(八进制)</th>
          <th class="ascii-table-th">Dec(十进制)</th>
          <th class="ascii-table-th">Hex(十六进制)</th>
          <th class="ascii-table-th">缩写/字符</th>
          <th class="ascii-table-th">解释</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="(ascii, index) in filteredAsciiTable" :key="index">
          <td class="ascii-table-td">{{ ascii.bin }}</td>
          <td class="ascii-table-td">{{ ascii.oct }}</td>
          <td class="ascii-table-td">{{ ascii.dec }}</td>
          <td class="ascii-table-td">{{ ascii.hex }}</td>
          <td class="ascii-table-td">{{ ascii.abridge }}</td>
          <td class="ascii-table-td">{{ ascii.mark }}</td>
        </tr>
      </tbody>
    </table>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, defineProps, watch } from 'vue'

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})

const asciiTable = [
  { bin: '0000 0000', oct: '00', dec: '0', hex: '0x00', abridge: 'NUL(null)', mark: '空字符' },
  {
    bin: '0000 0001',
    oct: '01',
    dec: '1',
    hex: '0x01',
    abridge: 'SOH(start of headline)',
    mark: '标题开始'
  },
  {
    bin: '0000 0010',
    oct: '02',
    dec: '2',
    hex: '0x02',
    abridge: 'STX (start of text)',
    mark: '正文开始'
  },
  {
    bin: '0000 0011',
    oct: '03',
    dec: '3',
    hex: '0x03',
    abridge: 'ETX (end of text)',
    mark: '正文结束'
  },
  {
    bin: '0000 0100',
    oct: '04',
    dec: '4',
    hex: '0x04',
    abridge: 'EOT (end of transmission)',
    mark: '传输结束'
  },
  { bin: '0000 0101', oct: '05', dec: '5', hex: '0x05', abridge: 'ENQ (enquiry)', mark: '请求' },
  {
    bin: '0000 0110',
    oct: '06',
    dec: '6',
    hex: '0x06',
    abridge: 'ACK (acknowledge)',
    mark: '收到通知'
  },
  { bin: '0000 0111', oct: '07', dec: '7', hex: '0x07', abridge: 'BEL (bell)', mark: '响铃' },
  { bin: '0000 1000', oct: '010', dec: '8', hex: '0x08', abridge: 'BS (backspace)', mark: '退格' },
  {
    bin: '0000 1001',
    oct: '011',
    dec: '9',
    hex: '0x09',
    abridge: 'HT (horizontal tab)',
    mark: '水平制表符'
  },
  {
    bin: '0000 1010',
    oct: '012',
    dec: '10',
    hex: '0x0A',
    abridge: 'LF (NL line feed, new line)',
    mark: '换行键'
  },
  {
    bin: '0000 1011',
    oct: '013',
    dec: '11',
    hex: '0x0B',
    abridge: 'VT (vertical tab)',
    mark: '垂直制表符'
  },
  {
    bin: '0000 1100',
    oct: '014',
    dec: '12',
    hex: '0x0C',
    abridge: 'FF (NP form feed, new page)',
    mark: '换页键'
  },
  {
    bin: '0000 1101',
    oct: '015',
    dec: '13',
    hex: '0x0D',
    abridge: 'CR (carriage return)',
    mark: '回车键'
  },
  {
    bin: '0000 1110',
    oct: '016',
    dec: '14',
    hex: '0x0E',
    abridge: 'SO (shift out)',
    mark: '不用切换'
  },
  {
    bin: '0000 1111',
    oct: '017',
    dec: '15',
    hex: '0x0F',
    abridge: 'SI (shift in)',
    mark: '启用切换'
  },
  {
    bin: '0001 0000',
    oct: '020',
    dec: '16',
    hex: '0x10',
    abridge: 'DLE (data link escape)',
    mark: '数据链路转义'
  },
  {
    bin: '0001 0001',
    oct: '021',
    dec: '17',
    hex: '0x11',
    abridge: 'DC1 (device control 1)',
    mark: '设备控制1'
  },
  {
    bin: '0001 0010',
    oct: '022',
    dec: '18',
    hex: '0x12',
    abridge: 'DC2 (device control 2)',
    mark: '设备控制2'
  },
  {
    bin: '0001 0011',
    oct: '023',
    dec: '19',
    hex: '0x13',
    abridge: 'DC3 (device control 3)',
    mark: '设备控制3'
  },
  {
    bin: '0001 0100',
    oct: '024',
    dec: '20',
    hex: '0x14',
    abridge: 'DC4 (device control 4)',
    mark: '设备控制4'
  },
  {
    bin: '0001 0101',
    oct: '025',
    dec: '21',
    hex: '0x15',
    abridge: 'NAK (negative acknowledge)',
    mark: '拒绝接收'
  },
  {
    bin: '0001 0110',
    oct: '026',
    dec: '22',
    hex: '0x16',
    abridge: 'SYN (synchronous idle)',
    mark: '同步空闲'
  },
  {
    bin: '0001 0111',
    oct: '027',
    dec: '23',
    hex: '0x17',
    abridge: 'ETB (end of trans. block)',
    mark: '结束传输块'
  },
  { bin: '0001 1000', oct: '030', dec: '24', hex: '0x18', abridge: 'CAN (cancel)', mark: '取消' },
  {
    bin: '0001 1001',
    oct: '031',
    dec: '25',
    hex: '0x19',
    abridge: 'EM (end of medium)',
    mark: '媒介结束'
  },
  {
    bin: '0001 1010',
    oct: '032',
    dec: '26',
    hex: '0x1A',
    abridge: 'SUB (substitute)',
    mark: '代替'
  },
  {
    bin: '0001 1011',
    oct: '033',
    dec: '27',
    hex: '0x1B',
    abridge: 'ESC (escape)',
    mark: '换码(溢出)'
  },
  {
    bin: '0001 1100',
    oct: '034',
    dec: '28',
    hex: '0x1C',
    abridge: 'FS (file separator)',
    mark: '文件分隔符'
  },
  {
    bin: '0001 1101',
    oct: '035',
    dec: '29',
    hex: '0x1D',
    abridge: 'GS (group separator)',
    mark: '分组符'
  },
  {
    bin: '0001 1110',
    oct: '036',
    dec: '30',
    hex: '0x1E',
    abridge: 'RS (record separator)',
    mark: '记录分隔符'
  },
  {
    bin: '0001 1111',
    oct: '037',
    dec: '31',
    hex: '0x1F',
    abridge: 'US (unit separator)',
    mark: '单元分隔符'
  },
  { bin: '0010 0000', oct: '040', dec: '32', hex: '0x20', abridge: '(space)', mark: '空格' },
  { bin: '0010 0001', oct: '041', dec: '33', hex: '0x21', abridge: '!', mark: '叹号' },
  { bin: '0010 0010', oct: '042', dec: '34', hex: '0x22', abridge: '"', mark: '双引号' },
  { bin: '0010 0011', oct: '043', dec: '35', hex: '0x23', abridge: '#', mark: '井号' },
  { bin: '0010 0100', oct: '044', dec: '36', hex: '0x24', abridge: '$', mark: '美元符' },
  { bin: '0010 0101', oct: '045', dec: '37', hex: '0x25', abridge: '%', mark: '百分号' },
  { bin: '0010 0110', oct: '046', dec: '38', hex: '0x26', abridge: '&', mark: '和号' },
  { bin: '0010 0111', oct: '047', dec: '39', hex: '0x27', abridge: "'", mark: '单引号' },
  { bin: '0010 1000', oct: '050', dec: '40', hex: '0x28', abridge: '(', mark: '开括号' },
  { bin: '0010 1001', oct: '051', dec: '41', hex: '0x29', abridge: ')', mark: '闭括号' },
  { bin: '0010 1010', oct: '052', dec: '42', hex: '0x2A', abridge: '*', mark: '星号' },
  { bin: '0010 1011', oct: '053', dec: '43', hex: '0x2B', abridge: '+', mark: '加号' },
  { bin: '0010 1100', oct: '054', dec: '44', hex: '0x2C', abridge: ',', mark: '逗号' },
  { bin: '0010 1101', oct: '055', dec: '45', hex: '0x2D', abridge: '-', mark: '减号/破折号' },
  { bin: '0010 1110', oct: '056', dec: '46', hex: '0x2E', abridge: '.', mark: '句号' },
  { bin: '0010 1111', oct: '057', dec: '47', hex: '0x2F', abridge: '/', mark: '斜杠' },
  { bin: '0011 0000', oct: '060', dec: '48', hex: '0x30', abridge: '0', mark: '字符0' },
  { bin: '0011 0001', oct: '061', dec: '49', hex: '0x31', abridge: '1', mark: '字符1' },
  { bin: '0011 0010', oct: '062', dec: '50', hex: '0x32', abridge: '2', mark: '字符2' },
  { bin: '0011 0011', oct: '063', dec: '51', hex: '0x33', abridge: '3', mark: '字符3' },
  { bin: '0011 0100', oct: '064', dec: '52', hex: '0x34', abridge: '4', mark: '字符4' },
  { bin: '0011 0101', oct: '065', dec: '53', hex: '0x35', abridge: '5', mark: '字符5' },
  { bin: '0011 0110', oct: '066', dec: '54', hex: '0x36', abridge: '6', mark: '字符6' },
  { bin: '0011 0111', oct: '067', dec: '55', hex: '0x37', abridge: '7', mark: '字符7' },
  { bin: '0011 1000', oct: '070', dec: '56', hex: '0x38', abridge: '8', mark: '字符8' },
  { bin: '0011 1001', oct: '071', dec: '57', hex: '0x39', abridge: '9', mark: '字符9' },
  { bin: '0011 1010', oct: '072', dec: '58', hex: '0x3A', abridge: ':', mark: '冒号' },
  { bin: '0011 1011', oct: '073', dec: '59', hex: '0x3B', abridge: ';', mark: '分号' },
  { bin: '0011 1100', oct: '074', dec: '60', hex: '0x3C', abridge: '<', mark: '小于' },
  { bin: '0011 1101', oct: '075', dec: '61', hex: '0x3D', abridge: '=', mark: '等号' },
  { bin: '0011 1110', oct: '076', dec: '62', hex: '0x3E', abridge: '>', mark: '大于' },
  { bin: '0011 1111', oct: '077', dec: '63', hex: '0x3F', abridge: '?', mark: '问号' },
  { bin: '0100 0000', oct: '0100', dec: '64', hex: '0x40', abridge: '@', mark: '电子邮件符号' },
  { bin: '0100 0001', oct: '0101', dec: '65', hex: '0x41', abridge: 'A', mark: '大写字母A' },
  { bin: '0100 0010', oct: '0102', dec: '66', hex: '0x42', abridge: 'B', mark: '大写字母B' },
  { bin: '0100 0011', oct: '0103', dec: '67', hex: '0x43', abridge: 'C', mark: '大写字母C' },
  { bin: '0100 0100', oct: '0104', dec: '68', hex: '0x44', abridge: 'D', mark: '大写字母D' },
  { bin: '0100 0101', oct: '0105', dec: '69', hex: '0x45', abridge: 'E', mark: '大写字母E' },
  { bin: '0100 0110', oct: '0106', dec: '70', hex: '0x46', abridge: 'F', mark: '大写字母F' },
  { bin: '0100 0111', oct: '0107', dec: '71', hex: '0x47', abridge: 'G', mark: '大写字母G' },
  { bin: '0100 1000', oct: '0110', dec: '72', hex: '0x48', abridge: 'H', mark: '大写字母H' },
  { bin: '0100 1001', oct: '0111', dec: '73', hex: '0x49', abridge: 'I', mark: '大写字母I' },
  { bin: '0100 1010', oct: '0112', dec: '74', hex: '0x4A', abridge: 'J', mark: '大写字母J' },
  { bin: '0100 1011', oct: '0113', dec: '75', hex: '0x4B', abridge: 'K', mark: '大写字母K' },
  { bin: '0100 1100', oct: '0114', dec: '76', hex: '0x4C', abridge: 'L', mark: '大写字母L' },
  { bin: '0100 1101', oct: '0115', dec: '77', hex: '0x4D', abridge: 'M', mark: '大写字母M' },
  { bin: '0100 1110', oct: '0116', dec: '78', hex: '0x4E', abridge: 'N', mark: '大写字母N' },
  { bin: '0100 1111', oct: '0117', dec: '79', hex: '0x4F', abridge: 'O', mark: '大写字母O' },
  { bin: '0101 0000', oct: '0120', dec: '80', hex: '0x50', abridge: 'P', mark: '大写字母P' },
  { bin: '0101 0001', oct: '0121', dec: '81', hex: '0x51', abridge: 'Q', mark: '大写字母Q' },
  { bin: '0101 0010', oct: '0122', dec: '82', hex: '0x52', abridge: 'R', mark: '大写字母R' },
  { bin: '0101 0011', oct: '0123', dec: '83', hex: '0x53', abridge: 'S', mark: '大写字母S' },
  { bin: '0101 0100', oct: '0124', dec: '84', hex: '0x54', abridge: 'T', mark: '大写字母T' },
  { bin: '0101 0101', oct: '0125', dec: '85', hex: '0x55', abridge: 'U', mark: '大写字母U' },
  { bin: '0101 0110', oct: '0126', dec: '86', hex: '0x56', abridge: 'V', mark: '大写字母V' },
  { bin: '0101 0111', oct: '0127', dec: '87', hex: '0x57', abridge: 'W', mark: '大写字母W' },
  { bin: '0101 1000', oct: '0130', dec: '88', hex: '0x58', abridge: 'X', mark: '大写字母X' },
  { bin: '0101 1001', oct: '0131', dec: '89', hex: '0x59', abridge: 'Y', mark: '大写字母Y' },
  { bin: '0101 1010', oct: '0132', dec: '90', hex: '0x5A', abridge: 'Z', mark: '大写字母Z' },
  { bin: '0101 1011', oct: '0133', dec: '91', hex: '0x5B', abridge: '[', mark: '开方括号' },
  { bin: '0101 1100', oct: '0134', dec: '92', hex: '0x5C', abridge: '\\', mark: '反斜杠' },
  { bin: '0101 1101', oct: '0135', dec: '93', hex: '0x5D', abridge: ']', mark: '闭方括号' },
  { bin: '0101 1110', oct: '0136', dec: '94', hex: '0x5E', abridge: '^', mark: '脱字符' },
  { bin: '0101 1111', oct: '0137', dec: '95', hex: '0x5F', abridge: '_', mark: '下划线' },
  { bin: '0110 0000', oct: '0140', dec: '96', hex: '0x60', abridge: '`', mark: '开单引号' },
  { bin: '0110 0001', oct: '0141', dec: '97', hex: '0x61', abridge: 'a', mark: '小写字母a' },
  { bin: '0110 0010', oct: '0142', dec: '98', hex: '0x62', abridge: 'b', mark: '小写字母b' },
  { bin: '0110 0011', oct: '0143', dec: '99', hex: '0x63', abridge: 'c', mark: '小写字母c' },
  { bin: '0110 0100', oct: '0144', dec: '100', hex: '0x64', abridge: 'd', mark: '小写字母d' },
  { bin: '0110 0101', oct: '0145', dec: '101', hex: '0x65', abridge: 'e', mark: '小写字母e' },
  { bin: '0110 0110', oct: '0146', dec: '102', hex: '0x66', abridge: 'f', mark: '小写字母f' },
  { bin: '0110 0111', oct: '0147', dec: '103', hex: '0x67', abridge: 'g', mark: '小写字母g' },
  { bin: '0110 1000', oct: '0150', dec: '104', hex: '0x68', abridge: 'h', mark: '小写字母h' },
  { bin: '0110 1001', oct: '0151', dec: '105', hex: '0x69', abridge: 'i', mark: '小写字母i' },
  { bin: '0110 1010', oct: '0152', dec: '106', hex: '0x6A', abridge: 'j', mark: '小写字母j' },
  { bin: '0110 1011', oct: '0153', dec: '107', hex: '0x6B', abridge: 'k', mark: '小写字母k' },
  { bin: '0110 1100', oct: '0154', dec: '108', hex: '0x6C', abridge: 'l', mark: '小写字母l' },
  { bin: '0110 1101', oct: '0155', dec: '109', hex: '0x6D', abridge: 'm', mark: '小写字母m' },
  { bin: '0110 1110', oct: '0156', dec: '110', hex: '0x6E', abridge: 'n', mark: '小写字母n' },
  { bin: '0110 1111', oct: '0157', dec: '111', hex: '0x6F', abridge: 'o', mark: '小写字母o' },
  { bin: '0111 0000', oct: '0160', dec: '112', hex: '0x70', abridge: 'p', mark: '小写字母p' },
  { bin: '0111 0001', oct: '0161', dec: '113', hex: '0x71', abridge: 'q', mark: '小写字母q' },
  { bin: '0111 0010', oct: '0162', dec: '114', hex: '0x72', abridge: 'r', mark: '小写字母r' },
  { bin: '0111 0011', oct: '0163', dec: '115', hex: '0x73', abridge: 's', mark: '小写字母s' },
  { bin: '0111 0100', oct: '0164', dec: '116', hex: '0x74', abridge: 't', mark: '小写字母t' },
  { bin: '0111 0101', oct: '0165', dec: '117', hex: '0x75', abridge: 'u', mark: '小写字母u' },
  { bin: '0111 0110', oct: '0166', dec: '118', hex: '0x76', abridge: 'v', mark: '小写字母v' },
  { bin: '0111 0111', oct: '0167', dec: '119', hex: '0x77', abridge: 'w', mark: '小写字母w' },
  { bin: '0111 1000', oct: '0170', dec: '120', hex: '0x78', abridge: 'x', mark: '小写字母x' },
  { bin: '0111 1001', oct: '0171', dec: '121', hex: '0x79', abridge: 'y', mark: '小写字母y' },
  { bin: '0111 1010', oct: '0172', dec: '122', hex: '0x7A', abridge: 'z', mark: '小写字母z' },
  { bin: '0111 1011', oct: '0173', dec: '123', hex: '0x7B', abridge: '{', mark: '开花括号' },
  { bin: '0111 1100', oct: '0174', dec: '124', hex: '0x7C', abridge: '|', mark: '垂线' },
  { bin: '0111 1101', oct: '0175', dec: '125', hex: '0x7D', abridge: '}', mark: '闭花括号' },
  { bin: '0111 1110', oct: '0176', dec: '126', hex: '0x7E', abridge: '~', mark: '波浪号' },
  { bin: '0111 1111', oct: '0177', dec: '127', hex: '0x7F', abridge: 'DEL (delete)', mark: '删除' }
]

const asciiViewWidth = ref(props.workAreaWidth)
const searchQuery = ref('')

watch(
  () => props.workAreaWidth,
  (newWidth) => {
    asciiViewWidth.value = newWidth
  }
)

const asciiTableWidth = computed(() => {
  const workWidthVal = parseInt(asciiViewWidth.value.replace('px', ''), 10)
  const tableWidthVal = workWidthVal - 50
  return tableWidthVal + 'px'
})

const filteredAsciiTable = computed(() => {
  if (!searchQuery.value) {
    return asciiTable
  }
  return asciiTable.filter((item) => {
    return (
      item.bin.includes(searchQuery.value) ||
      item.dec.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.oct.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.hex.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.abridge.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      item.mark.toLowerCase().includes(searchQuery.value.toLowerCase())
    )
  })
})
</script>

<style scoped>
.ascii-table-style {
  width: 100%;
  border-collapse: collapse;
}

.ascii-table-th,
.ascii-table-td {
  border: 1px solid #ddd;
  padding: 8px;
  text-align: left;
}

.ascii-table-th {
  background-color: #f2f2f2;
}
</style>
