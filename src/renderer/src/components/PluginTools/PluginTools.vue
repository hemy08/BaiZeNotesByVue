<template>
    <div id="plugin-tools-container" class="plugin-tools-container">
        <div id="plugin-tool-close" class="close-button" @click="handleClosePluginTools">
            <button>返回编辑器</button>
        </div>
        <div v-if="visibleTool" :id="`plugin-tool-${visibleTool.id}`">
            <component :is="visibleTool.component" :work-area-width="toolsViewWidth"></component>
        </div>
    </div>
</template>

<script setup lang="ts">
import { defineProps, watch, computed, ref } from 'vue'
import EventBus from '../../event-bus'
import TokenGenerator from './Encryption/TokenGenerator.vue'
import HashText from './Encryption/HashText.vue'
import UUIDSGenerator from './Encryption/UUIDSGenerator.vue'
import ULIDGenerator from './Encryption/ULIDGenerator.vue'
import EncryptDecrypt from './Encryption/EncryptDecrypt.vue'
import HmacGenerator from './Encryption/HmacGenerator.vue'
import RSAGenerator from './Encryption/RSAGenerator.vue'
import DateConvert from './Convert/DateConvert.vue'
import ColorConvert from './Convert/ColorConvert.vue'
import BaseConvert from './Convert/BaseConvert.vue'
import RomanNumber from './Convert/RomanNumber.vue'
import CaseConvert from './Convert/CaseConvert.vue'
import HtmlFormatter from './Convert/HtmlFormatter.vue'
import JsonCsvConvert from './Convert/JsonCsvConvert.vue'
import JsonFormatter from './Convert/JsonFormatter.vue'
import JsonTomlConvert from './Convert/JsonTomlConvert.vue'
import ListConvert from './Convert/ListConvert.vue'
import SqlFormatter from './Convert/SqlFormatter.vue'
import TextToBinary from './Convert/TextToBinary.vue'
import TextToUnicode from './Convert/TextToUnicode.vue'
import XmlFormatter from './Convert/XmlFormatter.vue'
import YamlFormatter from './Convert/YamlFormatter.vue'
import YamlJsonConvert from './Convert/YamlJsonConvert.vue'
import YamlTomlConvert from './Convert/YamlTomlConvert.vue'
import Ipv4AddrConvert from './NetWork/Ipv4AddrConvert.vue'
import Ipv4SubnetCalc from './NetWork/Ipv4SubnetCalc.vue'
import Ipv6UlaGenerator from './NetWork/Ipv6UlaGenerator.vue'
import MacAddrGenerator from './NetWork/MacAddrGenerator.vue'
import MacAddrLookup from './NetWork/MacAddrLookup.vue'
import QrcodeGenerator from './NetWork/QrcodeGenerator.vue'
import WifiQrcodeGenerator from './NetWork/WifiQrcodeGenerator.vue'
import CryptoEncDec from './Encryption/CryptoEncDec.vue'
import ASCIIComparison from './Informations/ASCIIComparison.vue'
import HTMLSpecialChar from './Informations/HTMLSpecialChar.vue'
import FormulaSymbol from './Informations/FormulaSymbol.vue'
import PhysicalSymbolic from './Informations/PhysicalSymbolic.vue'
import SubnetMaskMapTable from './Informations/SubnetMaskMapTable.vue'
import HttpStatusCode from './Informations/HttpStatusCode.vue'
import NumericCase from './Informations/NumericCase.vue'
import NormalFontStyle from './Informations/NormalFontStyle.vue'
import FileNameExtension from './Informations/FileNameExtension.vue'
import GreeceLetter from './Informations/GreeceLetter.vue'
import LatexEditor from './Tools/LatexEditor.vue'

let isShowPluginToolsContainer = false

const pluginTools = [
    { id: 'token-generator', component: TokenGenerator },
    { id: 'hash-text', component: HashText },
    { id: 'uuids-generator', component: UUIDSGenerator },
    { id: 'ulid-generator', component: ULIDGenerator },
    { id: 'encrypt-decrypt', component: EncryptDecrypt },
    { id: 'crypto-encrypt-decrypt', component: CryptoEncDec },
    { id: 'hmac-generator', component: HmacGenerator },
    { id: 'rsa-generator', component: RSAGenerator },
    { id: 'date-converter', component: DateConvert },
    { id: 'color-converter', component: ColorConvert },
    { id: 'base-converter', component: BaseConvert },
    { id: 'roman-numeral-converter', component: RomanNumber },
    { id: 'case-converter', component: CaseConvert },
    { id: 'text-to-binary', component: TextToBinary },
    { id: 'text-to-unicode', component: TextToUnicode },
    { id: 'yaml-json-converter', component: YamlJsonConvert },
    { id: 'yaml-toml-converter', component: YamlTomlConvert },
    { id: 'json-toml-converter', component: JsonTomlConvert },
    { id: 'json-csv-converter', component: JsonCsvConvert },
    { id: 'list-converter', component: ListConvert },
    { id: 'json-formatter', component: JsonFormatter },
    { id: 'sql-formatter', component: SqlFormatter },
    { id: 'xml-formatter', component: XmlFormatter },
    { id: 'yaml-formatter', component: YamlFormatter },
    { id: 'html-formatter', component: HtmlFormatter },
    { id: 'ipv4-subnet-calculator', component: Ipv4SubnetCalc },
    { id: 'ipv4-address-converter', component: Ipv4AddrConvert },
    { id: 'mac-address-lookup', component: MacAddrLookup },
    { id: 'mac-address-generator', component: MacAddrGenerator },
    { id: 'ipv6-ula-generator', component: Ipv6UlaGenerator },
    { id: 'wifi-qrcode-generator', component: WifiQrcodeGenerator },
    { id: 'qrcode-generator', component: QrcodeGenerator },
    { id: 'ascii-table', component: ASCIIComparison },
    { id: 'html-special-char-table', component: HTMLSpecialChar },
    { id: 'formula-symbol-table', component: FormulaSymbol },
    { id: 'physical-symbolic-constant', component: PhysicalSymbolic },
    { id: 'subnet-mask-map-table', component: SubnetMaskMapTable },
    { id: 'http-status-code-table', component: HttpStatusCode },
    { id: 'numeric-case-table', component: NumericCase },
    { id: 'normal-font-style-table', component: NormalFontStyle },
    { id: 'file-name-extension-table', component: FileNameExtension },
    { id: 'greece-letter-table', component: GreeceLetter },
    { id: 'latex', component: LatexEditor }
]

const props = defineProps({
    // 编辑器宽度
    pluginsAreaWidth: {
        type: String,
        default: '100%'
    }
})

const toolWidth = ref(props.pluginsAreaWidth)

const toolsViewWidth = computed(() => {
    const toolWidthValue = parseInt(toolWidth.value.replace('px', ''), 10)
    const conWidthValue = toolWidthValue - 100
    return conWidthValue + 'px'
})

const activeToolId = ref('')
const visibleTool = computed(() => {
    return pluginTools.find((tool) => tool.id === activeToolId.value)
})

window.electron.ipcRenderer.on('plugin-tools-show', (_, context: string) => {
    if (!isShowPluginToolsContainer) {
        EventBus.$emit('plugin-tools-container-show', true)
        isShowPluginToolsContainer = true
    }
    activeToolId.value = context
})

function handleClosePluginTools() {
    if (isShowPluginToolsContainer) {
        isShowPluginToolsContainer = false
    }
    activeToolId.value = ''
    EventBus.$emit('plugin-tools-container-show', false)
}

watch(
    () => props.pluginsAreaWidth,
    (width) => {
        toolWidth.value = width
    }
)
</script>

<style scoped>
.plugin-tools-container {
    position: relative; /* 设置为相对定位，以便子元素可以使用绝对定位 */
    width: 100%; /* 或你需要的宽度 */
    height: 100%; /* 或你需要的高度 */
    display: flex;
    flex-direction: column;
    align-items: center; /* 这不会直接影响h1的居中，但影响整个容器的子元素 */
    justify-content: flex-start; /* 你可以根据需要调整 */
    background-color: #fafafa;
    color: black;
    overflow-y: auto;
    overflow-x: auto;
}

.close-button {
    position: absolute; /* 绝对定位 */
    top: 10px; /* 距离顶部 */
    right: 10px; /* 距离右边 */
    font-size: 18px; /* 保持字体大小 */
    cursor: pointer; /* 鼠标悬停时显示指针 */
}

.close-button button {
    background-color: deepskyblue; /* 深蓝色背景 */
    color: white; /* 白色文字 */
    border: none; /* 无边框 */
    padding: 10px 20px; /* 内边距 */
    border-radius: 5px; /* 圆角 */
    cursor: pointer; /* 重复设置，确保按钮样式 */
}

.close-button button:hover {
    background-color: #ff9100; /* 深蓝色背景 */
}

.tool-section h1 {
    text-align: center; /* 居中显示 */
}
</style>
