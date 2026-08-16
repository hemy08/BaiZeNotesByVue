import TokenGenerator from './Encryption/TokenGenerator.vue'
import HashText from './Encryption/HashText.vue'
import UUIDSGenerator from './Encryption/UUIDSGenerator.vue'
import ULIDGenerator from './Encryption/ULIDGenerator.vue'
import RSAGenerator from './Encryption/RSAGenerator.vue'
import HmacGenerator from './Encryption/HmacGenerator.vue'
import EncryptDecrypt from './Encryption/EncryptDecrypt.vue'
import CryptoEncDec from './Encryption/CryptoEncDec.vue'
import Ipv4SubnetCalc from './NetWork/Ipv4SubnetCalc.vue'
import { markRaw } from 'vue'
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

export const pluginTools = markRaw([
    // ==================== 加解密插件 ====================
    { id: 'baize:menu:plugins:encrypt:token-generator', component: TokenGenerator },
    { id: 'baize:menu:plugins:encrypt:hash-text', component: HashText },
    { id: 'baize:menu:plugins:encrypt:uuids-generator', component: UUIDSGenerator },
    { id: 'baize:menu:plugins:encrypt:ulid-generator', component: ULIDGenerator },
    { id: 'baize:menu:plugins:encrypt:encrypt-decrypt', component: EncryptDecrypt },
    { id: 'baize:menu:plugins:encrypt:crypto-encrypt-decrypt', component: CryptoEncDec },
    { id: 'baize:menu:plugins:encrypt:hmac-generator', component: HmacGenerator },
    { id: 'baize:menu:plugins:encrypt:rsa-generator', component: RSAGenerator },

    // ==================== 网络计算插件 ====================
    { id: 'baize:menu:plugins:net:ipv4-subnet-calculator', component: Ipv4SubnetCalc },
    { id: 'baize:menu:plugins:net:http-status-codes', component: HttpStatusCode },
    { id: 'baize:menu:plugins:net:subnet-mask-map-table', component: SubnetMaskMapTable },

    // ==================== 常用对照表 - 对照表一 ====================
    { id: 'baize:menu:plugins:info:ascii-table', component: ASCIIComparison },
    { id: 'baize:menu:plugins:info:file-extension-table', component: FileNameExtension },
    { id: 'baize:menu:plugins:info:numeric-case-table', component: NumericCase },
    { id: 'baize:menu:plugins:info:normal-font-style-table', component: NormalFontStyle },
    { id: 'baize:menu:plugins:info:greece-letter-table', component: GreeceLetter },
    { id: 'baize:menu:plugins:info:html-entity-table', component: HTMLSpecialChar },

    // ==================== 常用对照表 - 科学符号对照表 ====================
    { id: 'baize:menu:plugins:info:math-symbol-table', component: FormulaSymbol },
    { id: 'baize:menu:plugins:info:physical-constant-table', component: PhysicalSymbolic },

])
