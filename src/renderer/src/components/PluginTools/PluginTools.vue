<template>
    <div id="plugin-tools-container" class="plugin-tools-container">
        <div id="plugin-tool-close" class="close-button" @click="handleClosePluginTools">
            <button>返回编辑器</button>
        </div>
        <div v-if="visibleTool" :id="`plugin-tool-${visibleTool.id}`" class="plugin-tool-content">
            <component :is="visibleTool.component" :work-area-width="toolsViewWidth"></component>
        </div>
        <div v-else class="plugin-tool-placeholder">
            <p>请选择一个工具</p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { watch, computed, ref, onMounted } from 'vue'
import EventBus from '../../event-bus'
import TokenGenerator from './Encryption/TokenGenerator.vue'
import HashText from './Encryption/HashText.vue'
import UUIDSGenerator from './Encryption/UUIDSGenerator.vue'
import ULIDGenerator from './Encryption/ULIDGenerator.vue'
import RSAGenerator from './Encryption/RSAGenerator.vue'
import HmacGenerator from './Encryption/HmacGenerator.vue'
import EncryptDecrypt from './Encryption/EncryptDecrypt.vue'
import CryptoEncDec from './Encryption/CryptoEncDec.vue'
import BaseConvert from './Convert/BaseConvert.vue'
import CaseConvert from './Convert/CaseConvert.vue'
import DateConvert from './Convert/DateConvert.vue'
import ColorConvert from './Convert/ColorConvert.vue'
import TextToBinary from './Convert/TextToBinary.vue'
import TextToUnicode from './Convert/TextToUnicode.vue'
import ListConvert from './Convert/ListConvert.vue'
import JsonFormatter from './Convert/JsonFormatter.vue'
import XmlFormatter from './Convert/XmlFormatter.vue'
import YamlFormatter from './Convert/YamlFormatter.vue'
import SqlFormatter from './Convert/SqlFormatter.vue'
import HtmlFormatter from './Convert/HtmlFormatter.vue'
import JsonCsvConvert from './Convert/JsonCsvConvert.vue'
import JsonTomlConvert from './Convert/JsonTomlConvert.vue'
import YamlJsonConvert from './Convert/YamlJsonConvert.vue'
import YamlTomlConvert from './Convert/YamlTomlConvert.vue'
import RomanNumber from './Convert/RomanNumber.vue'
import Ipv4AddrConvert from './NetWork/Ipv4AddrConvert.vue'
import Ipv4SubnetCalc from './NetWork/Ipv4SubnetCalc.vue'
import Ipv6UlaGenerator from './NetWork/Ipv6UlaGenerator.vue'
import MacAddrGenerator from './NetWork/MacAddrGenerator.vue'
import MacAddrLookup from './NetWork/MacAddrLookup.vue'
import QrcodeGenerator from './NetWork/QrcodeGenerator.vue'
import WifiQrcodeGenerator from './NetWork/WifiQrcodeGenerator.vue'
import ASCIIComparison from './Informations/ASCIIComparison.vue'
import FileNameExtension from './Informations/FileNameExtension.vue'
import FormulaSymbol from './Informations/FormulaSymbol.vue'
import GreeceLetter from './Informations/GreeceLetter.vue'
import HTMLSpecialChar from './Informations/HTMLSpecialChar.vue'
import HttpStatusCode from './Informations/HttpStatusCode.vue'
import NormalFontStyle from './Informations/NormalFontStyle.vue'
import NumericCase from './Informations/NumericCase.vue'
import PhysicalSymbolic from './Informations/PhysicalSymbolic.vue'
import SubnetMaskMapTable from './Informations/SubnetMaskMapTable.vue'

const props = defineProps({
    pluginsAreaWidth: {
        type: String,
        default: '100%'
    }
})

const toolWidth = ref(props.pluginsAreaWidth)
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
    { id: 'greece-letter-table', component: GreeceLetter }
    //{ id: 'latex', component: LatexEditor }
]

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

onMounted(() => {
    // 监听主题更新事件
    EventBus.$on('theme-updated', applyThemeStyles)
})

function applyThemeStyles() {
    // 主题样式通过 CSS 变量自动应用，无需额外处理
}
</script>

<style scoped>
.plugin-tools-container {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    background-color: var(--theme-background-color);
    color: var(--theme-text-color);
    overflow-y: auto;
    overflow-x: auto;
    padding-top: 50px; /* 为绝对定位的关闭按钮留出空间 */
}

.close-button {
    position: absolute;
    top: 10px;
    right: 10px;
    font-size: 18px;
    cursor: pointer;
    z-index: 10;
}

.close-button button {
    background-color: var(--theme-button-background);
    color: var(--theme-button-text-color);
    border: none;
    padding: 10px 20px;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.2s;
}

.close-button button:hover {
    background-color: var(--theme-hover-background);
}

/* 确保动态组件容器正确显示 */
.plugin-tool-content {
    width: 100%;
    min-height: 100%;
    padding: 10px;
    box-sizing: border-box;
}

/* 占位符样式 */
.plugin-tool-placeholder {
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--theme-secondary-text-color);
}

.plugin-tool-placeholder p {
    font-size: 16px;
    text-align: center;
}

.tool-section h1 {
    text-align: center;
}
</style>
