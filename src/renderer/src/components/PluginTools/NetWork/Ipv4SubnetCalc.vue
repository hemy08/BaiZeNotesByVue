<template>
    <div class="plugin-tools-theme" :style="{ width: props.workAreaWidth }">
        <h1 class="header-display-center">{{ t('toolsNetwork.network.ipv4SubnetCalc.title') }}</h1>
        <div style="color: grey; background-color: grey; height: 2px"></div>
        <p style="color: grey">{{ t('toolsNetwork.network.ipv4SubnetCalc.desc') }}</p>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://tools.w3cschool.cn/ipv4-subnet-labelulator')"
        >
            https://tools.w3cschool.cn/ipv4-subnet-labelulator
        </a>
        <a
            class="plugin-tools-openurl"
            role="button"
            @click="openUrl('https://ipv4calc.bmcx.com/')"
        >
            https://ipv4calc.bmcx.com/
        </a>
        <h3>{{ t('toolsNetwork.network.ipv4SubnetCalc.networkCalcTitle') }}</h3>
        <div style="color: grey">
            {{ t('toolsNetwork.network.ipv4SubnetCalc.networkCalcDesc') }}
        </div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="subnet-label">
                {{ t('toolsNetwork.network.ipv4SubnetCalc.ipMaskBits') }}
            </div>
            <input
                v-for="(_, index) in inputIpv4Addr"
                :key="index"
                v-model="inputIpv4Addr[index]"
                type="text"
                class="ipv4-addr-text"
                :style="addrText"
            />
            <div style="margin-left: 5px; margin-right: 5px">/</div>
            <input v-model="inputIpv4Cidr" type="number" class="ipv4-addr-text" :style="addrText" />
            <button
                style="margin-left: 10px"
                class="plugin-tools-btn"
                @click="NetWorkCalc('subnet')"
            >
                {{ t('toolsNetwork.network.ipv4SubnetCalc.calculate') }}
            </button>
            <button
                style="margin-left: 10px"
                class="plugin-tools-btn"
                @click="NetWorkReset('subnet')"
            >
                {{ t('toolsNetwork.network.ipv4SubnetCalc.reset') }}
            </button>
        </div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="subnet-label">
                {{ t('toolsNetwork.network.ipv4SubnetCalc.availableAddresses') }}
            </div>
            <input v-model="validAddrNumber" class="subnet-out-number" :style="addrText" readonly />
        </div>
        <div
            v-for="item in subnetOutPut"
            :key="item.id"
            class="div-style-display-row"
            style="margin-top: 10px"
        >
            <div class="subnet-label">{{ t(item.label) }}</div>
            <input
                v-for="(_, index) in item.ip"
                :key="index"
                v-model="item.ip[index]"
                class="subnet-out-number"
                :style="addrText"
                readonly
            />
        </div>
        <div style="color: grey">
            {{ t('toolsNetwork.network.ipv4SubnetCalc.cidrNote') }}
        </div>
        <h3>{{ t('toolsNetwork.network.ipv4SubnetCalc.maskToBitsTitle') }}</h3>
        <div style="color: grey">{{ t('toolsNetwork.network.ipv4SubnetCalc.maskToBitsDesc') }}</div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="subnet-label">{{ t('toolsNetwork.network.ipv4SubnetCalc.settings') }}</div>
            <input
                v-for="(_, index) in inputNetworkMask"
                :key="index"
                v-model="inputNetworkMask[index]"
                type="text"
                class="ipv4-addr-text"
                :style="addrText"
            />
            <div style="margin-left: 5px; margin-right: 5px">
                {{ t('toolsNetwork.network.ipv4SubnetCalc.result') }}
            </div>
            <input
                v-model="outNetworkMaskBits"
                type="text"
                class="subnet-out-number"
                :style="addrText"
                readonly
            />
            <button style="margin-left: 10px" class="plugin-tools-btn" @click="NetWorkCalc('mask')">
                {{ t('toolsNetwork.network.ipv4SubnetCalc.calculate') }}
            </button>
            <button
                style="margin-left: 10px"
                class="plugin-tools-btn"
                @click="NetWorkReset('mask')"
            >
                {{ t('toolsNetwork.network.ipv4SubnetCalc.reset') }}
            </button>
        </div>
        <h3>{{ t('toolsNetwork.network.ipv4SubnetCalc.bitsToMaskTitle') }}</h3>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="subnet-label">{{ t('toolsNetwork.network.ipv4SubnetCalc.settings') }}</div>
            <div style="margin-left: 5px; margin-right: 5px">/</div>
            <input
                v-model="inputNetMaskBits"
                type="number"
                class="ipv4-addr-text"
                :style="addrText"
            />
            <button
                style="margin-left: 10px"
                class="plugin-tools-btn"
                @click="NetWorkCalc('maskBit')"
            >
                {{ t('toolsNetwork.network.ipv4SubnetCalc.calculate') }}
            </button>
            <button
                style="margin-left: 10px"
                class="plugin-tools-btn"
                @click="NetWorkReset('maskBit')"
            >
                {{ t('toolsNetwork.network.ipv4SubnetCalc.reset') }}
            </button>
        </div>
        <div
            v-for="item in bitsMaskOutPut"
            :key="item.id"
            class="div-style-display-row"
            style="margin-top: 10px"
        >
            <div class="subnet-label">{{ t(item.label) }}</div>
            <input
                v-for="(_, index) in item.ip"
                :key="index"
                v-model="item.ip[index]"
                class="subnet-out-number"
                :style="addrText"
                readonly
            />
        </div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="subnet-label">
                {{ t('toolsNetwork.network.ipv4SubnetCalc.availableCount') }}
            </div>
            <input
                v-model="maskBitValidNumber"
                class="subnet-out-number"
                :style="addrText"
                readonly
            />
        </div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="subnet-label">
                {{ t('toolsNetwork.network.ipv4SubnetCalc.totalCount') }}
            </div>
            <input
                v-model="maskBitTotalNumber"
                class="subnet-out-number"
                :style="addrText"
                readonly
            />
        </div>
        <h3>{{ t('toolsNetwork.network.ipv4SubnetCalc.ipNumberTitle') }}</h3>
        <div style="color: grey">
            {{ t('toolsNetwork.network.ipv4SubnetCalc.ipNumberDesc') }}
        </div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="subnet-label">{{ t('toolsNetwork.network.ipv4SubnetCalc.settings') }}</div>
            <input v-model="inputIpNumber" type="number" class="ipv4-addr-text" :style="addrText" />
            <button
                style="margin-left: 10px"
                class="plugin-tools-btn"
                @click="NetWorkCalc('number')"
            >
                {{ t('toolsNetwork.network.ipv4SubnetCalc.calculate') }}
            </button>
            <button
                style="margin-left: 10px"
                class="plugin-tools-btn"
                @click="NetWorkReset('number')"
            >
                {{ t('toolsNetwork.network.ipv4SubnetCalc.reset') }}
            </button>
        </div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="subnet-label">{{ t('toolsNetwork.network.ipv4SubnetCalc.maskBits') }}</div>
            <input v-model="ipNumberBits" class="subnet-out-number" :style="addrText" readonly />
        </div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="subnet-label">
                {{ t('toolsNetwork.network.ipv4SubnetCalc.availableCount') }}
            </div>
            <input
                v-model="ipNumberBitsValid"
                class="subnet-out-number"
                :style="addrText"
                readonly
            />
        </div>
        <div class="div-style-display-row" style="margin-top: 10px">
            <div class="subnet-label">
                {{ t('toolsNetwork.network.ipv4SubnetCalc.totalCount') }}
            </div>
            <input
                v-model="ipNumberBitsTotal"
                class="subnet-out-number"
                :style="addrText"
                readonly
            />
        </div>
        <div
            v-for="item in ipNumberOutPut"
            :key="item.id"
            class="div-style-display-row"
            style="margin-top: 10px"
        >
            <div class="subnet-label">{{ t(item.label) }}</div>
            <input
                v-for="(_, index) in item.ip"
                :key="index"
                v-model="item.ip[index]"
                class="subnet-out-number"
                :style="addrText"
                readonly
            />
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { t } from '../../../common/i18n'
import * as net from './NetWork'

const props = defineProps({
    // 编辑器宽度
    workAreaWidth: {
        type: String,
        default: '100%'
    }
})

const inputIpv4Addr = ref([192, 168, 16, 0])
const inputNetworkMask = ref([255, 255, 255, 0])
const outNetworkMaskBits = ref('24')
const inputNetMaskBits = ref(24)
const inputIpv4Cidr = ref('24')
const validAddrNumber = ref(0)
const maskBitValidNumber = ref(0)
const maskBitTotalNumber = ref(0)
const inputIpNumber = ref(255)
const ipNumberBits = ref(0)
const ipNumberBitsValid = ref(0)
const ipNumberBitsTotal = ref(0)

interface IPNET {
    id: string
    label: string
    ip: string[]
}

interface CombSubNet {
    mask: IPNET
    network: IPNET
    first: IPNET
    last: IPNET
    broadcasts: IPNET
}

const subnetOutPut = ref<CombSubNet>({
    mask: {
        id: 'subnet-addr-input-mask',
        label: 'toolsNetwork.network.ipv4SubnetCalc.netmask',
        ip: ['0', '0', '0', '0']
    },
    network: {
        id: 'subnet-addr-input-network',
        label: 'toolsNetwork.network.ipv4SubnetCalc.networkAddress',
        ip: ['0', '0', '0', '0']
    },
    first: {
        id: 'subnet-addr-input-first',
        label: 'toolsNetwork.network.ipv4SubnetCalc.firstUsable',
        ip: ['0', '0', '0', '0']
    },
    last: {
        id: 'subnet-addr-input-last',
        label: 'toolsNetwork.network.ipv4SubnetCalc.lastUsable',
        ip: ['0', '0', '0', '0']
    },
    broadcasts: {
        id: 'subnet-addr-input-broadcasts',
        label: 'toolsNetwork.network.ipv4SubnetCalc.broadcast',
        ip: ['0', '0', '0', '0']
    }
})

interface CombinedIPNET {
    dec: IPNET
    hex: IPNET
}

const bitsMaskOutPut = ref<CombinedIPNET>({
    dec: {
        id: 'mask-output-dec',
        label: 'toolsNetwork.network.ipv4SubnetCalc.dec',
        ip: ['0', '0', '0', '0']
    },
    hex: {
        id: 'mask-output-hex',
        label: 'toolsNetwork.network.ipv4SubnetCalc.hex',
        ip: ['0', '0', '0', '0']
    }
})

const ipNumberOutPut = ref<CombinedIPNET>({
    dec: {
        id: 'ip-number-mask-output-dec',
        label: 'toolsNetwork.network.ipv4SubnetCalc.dec',
        ip: ['0', '0', '0', '0']
    },
    hex: {
        id: 'ip-number-mask-output-hex',
        label: 'toolsNetwork.network.ipv4SubnetCalc.hex',
        ip: ['0', '0', '0', '0']
    }
})

const subnetAddrWidth = computed(() => {
    const WorkWidth = parseInt(props.workAreaWidth.replace('px', ''), 10)
    return WorkWidth / 10 - 20
})

const addrText = computed(() => {
    return {
        width: subnetAddrWidth.value + 'px'
    }
})

function openUrl(link: string) {
    window.open(link, '_blank', 'noopener, noreferrer')
}

function SubnetCalc() {
    if (!net.isValidIPV4(inputIpv4Addr.value)) {
        alert(t('toolsNetwork.network.ipv4SubnetCalc.invalidIp'))
        return
    }
    const netIpv4 = new net.IPV4(inputIpv4Addr.value.join('.'), inputIpv4Cidr.value)
    // 计算可用地址个数
    validAddrNumber.value = netIpv4.hostNumber
    // 计算掩码
    subnetOutPut.value['broadcasts'].ip = netIpv4.broadcastAddr.split('.')
    // 网络地址和主机地址一致
    subnetOutPut.value['network'].ip = netIpv4.networkAddr.split('.')
    // 广播地址是地址段的最后一个地址
    subnetOutPut.value['mask'].ip = netIpv4.networkMask.split('.')
    subnetOutPut.value['first'].ip = netIpv4.firstAddress.split('.')
    subnetOutPut.value['last'].ip = netIpv4.lastAddress.split('.')
}

function SubnetReset() {
    validAddrNumber.value = 0
    // 显式列出输出项 key（等价于原 Object.keys(subnetOutPut.value) 的遍历顺序），
    // 使 key 具有 keyof CombSubNet 类型而不是 string，避免下标隐式 any。
    const subnetKeys: (keyof CombSubNet)[] = ['mask', 'network', 'first', 'last', 'broadcasts']
    for (const key of subnetKeys) {
        subnetOutPut.value[key].ip = ['0', '0', '0', '0']
    }
}

function getBitsByMask() {
    outNetworkMaskBits.value = net.GetBitsWithMask(inputNetworkMask.value.join('.'))
}

function getBitsByMaskReset() {
    inputNetworkMask.value = [255, 255, 255, 0]
}

function getMaskByBits() {
    bitsMaskOutPut.value.dec.ip = net.GetMaskWithBits(inputNetMaskBits.value).split('.')
    bitsMaskOutPut.value.hex.ip = net.GetMaskWithBits(inputNetMaskBits.value, 16).split('.')
    maskBitValidNumber.value = net.GetHostNumber(inputNetMaskBits.value)
    maskBitTotalNumber.value = maskBitValidNumber.value + 2
}

function getMaskByBitsReset() {
    bitsMaskOutPut.value.dec.ip = ['0', '0', '0', '0']
    bitsMaskOutPut.value.hex.ip = ['0', '0', '0', '0']
    maskBitValidNumber.value = 0
    maskBitTotalNumber.value = 0
}

function getMaskByIPNumber() {
    ipNumberBits.value = net.GetMaskByIpNumber(inputIpNumber.value)
    ipNumberOutPut.value.dec.ip = net.GetMaskWithBits(ipNumberBits.value).split('.')
    ipNumberOutPut.value.hex.ip = net.GetMaskWithBits(ipNumberBits.value, 16).split('.')
    ipNumberBitsValid.value = net.GetHostNumber(ipNumberBits.value)
    ipNumberBitsTotal.value = ipNumberBitsValid.value + 2
}

function getMaskByIPNumberReset() {
    ipNumberOutPut.value.dec.ip = ['0', '0', '0', '0']
    ipNumberOutPut.value.hex.ip = ['0', '0', '0', '0']
    ipNumberBits.value = 0
    ipNumberBitsValid.value = 0
    ipNumberBitsTotal.value = 0
    inputIpNumber.value = 255
}

const netWork = {
    subnet: { calc: SubnetCalc, reset: SubnetReset },
    mask: { calc: getBitsByMask, reset: getBitsByMaskReset },
    maskBit: { calc: getMaskByBits, reset: getMaskByBitsReset },
    number: { calc: getMaskByIPNumber, reset: getMaskByIPNumberReset }
}

function NetWorkCalc(name: keyof typeof netWork) {
    const handler = netWork[name]
    handler.calc()
}

function NetWorkReset(name: keyof typeof netWork) {
    const handler = netWork[name]
    handler.reset()
}
</script>

<style scoped>
@import '../plugin-tools-theme.css';
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
