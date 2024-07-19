<template>
  <div :style="{ width: props.workAreaWidth }">
    <h1 class="header-display-center">IPv4子网计算器</h1>
    <div style="color: grey; background-color: grey; height: 2px"></div>
    <p style="color: grey">解析IPv4 CIDR块，并获取有关子网络的所有所需信息。</p>
    <a
      class="plugin-tools-openurl"
      role="button"
      @click="openUrl('https://tools.w3cschool.cn/ipv4-subnet-labelulator')"
    >
      https://tools.w3cschool.cn/ipv4-subnet-labelulator
    </a>
    <a class="plugin-tools-openurl" role="button" @click="openUrl('https://ipv4calc.bmcx.com/')">
      https://ipv4calc.bmcx.com/
    </a>
    <h3>网络和IP地址计算器</h3>
    <div style="color: grey">显示网络，广播，第一次和最后一个给定的网络地址:</div>
    <div class="div-style-display-row" style="margin-top: 10px">
      <div class="subnet-label">IP/掩码位:</div>
      <input
        v-for="(_, index) in inputIpv4Addr"
        :key="index"
        v-model="inputIpv4Addr[index]"
        type="text"
        class="ipv4-addr-text"
        :style="addrText"
      />
      <div style="margin-left: 5px; margin-right: 5px">/</div>
      <input v-model="inputIpv4Mask" type="text" class="ipv4-addr-text" :style="addrText" />
      <button style="margin-left: 10px" class="plugin-tools-btn" @click="SubnetCalc">计算</button>
      <button style="margin-left: 10px" class="plugin-tools-btn" @click="SubnetReset">重置</button>
    </div>
    <div class="div-style-display-row" style="margin-top: 10px">
      <div class="subnet-label">可用地址：</div>
      <input v-model="validAddrNumber" class="subnet-out-number" :style="addrText" readonly />
    </div>
    <div
      v-for="item in subnetOutPut"
      :key="item.id"
      class="div-style-display-row"
      style="margin-top: 10px"
    >
      <div class="subnet-label">{{ item.label }}</div>
      <input
        v-for="(_, index) in item.ip"
        :key="index"
        v-model="item.ip[index]"
        class="subnet-out-number"
        :style="addrText"
        readonly
      />
    </div>
    <div style="color: grey">在网络掩码“位格式”也被称为CIDR格式（CIDR=无类别域间路由选择）。</div>
    <h3>子网掩码转换器（对位点分十进制格式）</h3>
    <div class="div-style-display-row" style="margin-top: 10px">
      <div class="subnet-label">设置：</div>
      <input
        v-for="(octet, index) in zeroIPV4"
        :key="index"
        type="text"
        class="ipv4-addr-text"
        :style="addrText"
        :value="octet"
        @input="updateIpPart(index, $event.target.value)"
      />
      <div style="margin-left: 5px; margin-right: 5px">结果/</div>
      <input type="text" class="subnet-out-number" :style="addrText" readonly />
      <button style="margin-left: 10px" class="plugin-tools-btn" @click="SubnetCalc">计算</button>
      <button style="margin-left: 10px" class="plugin-tools-btn" @click="SubnetReset">重置</button>
    </div>
    <h3>子网掩码转换器（位点分十进制格式）</h3>
    <div class="div-style-display-row" style="margin-top: 10px">
      <div class="subnet-label">设置：</div>
      <div style="margin-left: 5px; margin-right: 5px">/</div>
      <input type="text" class="ipv4-addr-text" :style="addrText" />
      <button style="margin-left: 10px" class="plugin-tools-btn" @click="SubnetCalc">计算</button>
      <button style="margin-left: 10px" class="plugin-tools-btn" @click="SubnetReset">重置</button>
    </div>
    <div
      v-for="item in maskOutPut"
      :key="item.id"
      class="div-style-display-row"
      style="margin-top: 10px"
    >
      <div class="subnet-label">{{ item.label }}</div>
      <input
        v-for="(octet, index) in item.ip"
        :key="index"
        type="text"
        class="subnet-out-number"
        :style="addrText"
        :value="octet"
        readonly
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, defineProps, ref, watch } from 'vue'

const props = defineProps({
  // 编辑器宽度
  workAreaWidth: {
    type: String,
    default: '100%'
  }
})

const workWidthVal = ref(props.workAreaWidth)
const inputIpv4Addr = ref([192, 168, 16, 0])
const inputIpv4Mask = ref(24)
const validAddrNumber = ref(0)

interface IPNET {
  id: string
  label: string
  ip: number[]
}

const subnetOutPut: IPNET[] = ref({
  mask: { id: 'subnet-addr-input-mask', label: '掩码：', ip: [0, 0, 0, 0] },
  network: { id: 'subnet-addr-input-network', label: '网络：', ip: [0, 0, 0, 0] },
  first: { id: 'subnet-addr-input-first', label: '第一个可用：', ip: [0, 0, 0, 0] },
  last: { id: 'subnet-addr-input-last', label: '最后可用：', ip: [0, 0, 0, 0] },
  broadcasts: { id: 'subnet-addr-input-broadcasts', label: '广播：', ip: [0, 0, 0, 0] }
})

const maskOutPut: IPNET[] = [
  { id: 'mask-output-dec', label: 'Dec 十进制：', ip: [0, 0, 0, 0] },
  { id: 'mask-output-hex', label: 'Hex 十六进制：', ip: [0, 0, 0, 0] }
]

const zeroIPV4 = [0, 0, 0, 0]

watch(
  () => props.workAreaWidth,
  (width) => {
    workWidthVal.value = width
  }
)

const subnetAddrWidth = computed(() => {
  const WorkWidth = parseInt(workWidthVal.value.replace('px', ''), 10)
  return WorkWidth / 10 - 20
})

const addrText = computed(() => {
  return {
    width: subnetAddrWidth.value + 'px'
  }
})

function openUrl(link) {
  window.open(link, '_blank', 'noopener, noreferrer')
}

function CalculatedValidAddrNumber() {
  const hostAddrBits = 32 - inputIpv4Mask.value
  const hostNum1 = 2 ** hostAddrBits - 1
  // 可用地址中，去掉网络地址和广播地址
  validAddrNumber.value = hostNum1 - 2
}

// 计算地址是否有效
function isValidIPAddress(ip: number[]) {
  if (ip.length !== 4) {
    return false // IP地址应该有4个八位字节
  }
  for (let i = 0; i < 4; i++) {
    if (ip[i] < 0 || ip[i] > 255) {
      return false // 任何一个八位字节不在0-255范围内都无效
    }
  }
  return true // 所有八位字节都在0-255范围内，IP地址有效
}

// 地址偏移计算
function CalculatedValidAddr(ip: number[], offset: number) {
  ip[3] = ip[3] + offset
  if (ip[3] > 255) {
    ip[3] -= 255
    ip[2] = ip[2] + offset
    if (ip[2] > 255) {
      ip[2] -= 255
      ip[1] = ip[1] + offset
      if (ip[1] > 255) {
        ip[1] -= 255
        ip[0] = ip[0] + offset
        if (ip[0] > 255) {
          ip[0] = '无效'
          ip[1] = '无效'
          ip[2] = '无效'
          ip[3] = '无效'
        }
      }
    }
  }
}

function IpAddrAssign(dest: number[], src: number[]) {
  dest[0] = src[0]
  dest[1] = src[1]
  dest[2] = src[2]
  dest[3] = src[3]
}

function CalculatedNetworkAddr() {
  IpAddrAssign(subnetOutPut.value['network'].ip, inputIpv4Addr.value)
}

function CalculatedFirstAddr() {
  IpAddrAssign(subnetOutPut.value['first'].ip, inputIpv4Addr.value)
  CalculatedValidAddr(subnetOutPut.value['first'].ip, 1)
}

function CalculatedLastAddr() {
  IpAddrAssign(subnetOutPut.value['last'].ip, subnetOutPut.value['broadcasts'].ip)
  subnetOutPut.value['last'].ip[3] = subnetOutPut.value['broadcasts'].ip[3] - 1
}

function CalculatedBroadcastsAddr() {
  IpAddrAssign(subnetOutPut.value['broadcasts'].ip, inputIpv4Addr.value)
  subnetOutPut.value['broadcasts'].ip[3] = 255
}

function SubnetCalc() {
  console.log('inputIpv4Addr', inputIpv4Addr)
  if (!isValidIPAddress(inputIpv4Addr.value)) {
    alert('输入IP地址无效')
    return
  }
  // 计算可用地址个数
  CalculatedValidAddrNumber()
  // 网络地址和主机地址一致
  CalculatedNetworkAddr()
  // 广播地址是地址段的最后一个地址
  CalculatedBroadcastsAddr()
  // 第一个可用地址
  CalculatedFirstAddr()
  // 最后一个可用地址
  CalculatedLastAddr()
}

function SubnetReset() {
  validAddrNumber.value = 0
  Object.keys(subnetOutPut.value).forEach((key) => {
    subnetOutPut.value[key].ip = [0, 0, 0, 0]
  })
}

function updateIpPart(index, val) {
  console.log(index, val)
}
</script>

<style scoped>
.subnet-label {
  width: 120px;
  background-color: lightblue;
  border: none;
  text-align: left;
  padding: 2px 10px 2px 20px;
}

.ipv4-addr-text {
  height: 25px;
  min-width: 50px;
  margin-left: 5px;
  text-align: left;
  border: 1px solid #000; /* 可选：如果你想要边框的话，这里设置一个边框样式 */
  border-radius: 5px; /* 设置圆角边框的大小 */
}

.subnet-out-number {
  height: 25px;
  min-width: 50px;
  margin-left: 5px;
  text-align: left;
  border: 1px solid #000; /* 可选：如果你想要边框的话，这里设置一个边框样式 */
  border-radius: 5px; /* 设置圆角边框的大小 */
  background-color: #efefef;
  color: red;
}
</style>
