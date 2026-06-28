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
import { markRaw } from 'vue'
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

    // ==================== 编解码转换 ====================
    // { id: 'baize:menu:plugins:convert:date-converter', component: DateConvert },
    // { id: 'baize:menu:plugins:convert:base-converter', component: BaseConvert },
    // { id: 'baize:menu:plugins:convert:roman-numeral-converter', component: RomanNumber },
    // { id: 'baize:menu:plugins:convert:color-converter', component: ColorConvert },

    // ==================== 格式化工具 ====================
    // { id: 'baize:menu:plugins:convert:json-formater', component: JsonFormatter },
    // { id: 'baize:menu:plugins:convert:yaml-formatter', component: YamlFormatter },
    // { id: 'baize:menu:plugins:convert:xml-formatter', component: XmlFormatter },
    // { id: 'baize:menu:plugins:convert:sql-formatter', component: SqlFormatter },
    // { id: 'baize:menu:plugins:convert:html-formatter', component: HtmlFormatter },

    // ==================== 格式转换器 ====================
    // { id: 'baize:menu:plugins:convert:json-to-csv', component: JsonCsvConvert },
    // { id: 'baize:menu:plugins:convert:json-to-toml', component: JsonTomlConvert },
    // { id: 'baize:menu:plugins:convert:yaml-to-json', component: YamlJsonConvert },
    // { id: 'baize:menu:plugins:convert:yaml-to-toml', component: YamlTomlConvert },
    // { id: 'baize:menu:plugins:convert:text-to-binary', component: TextToBinary },
    // { id: 'baize:menu:plugins:convert:text-to-unicode', component: TextToUnicode },

    // ==================== 大小写转换 ====================
    // { id: 'baize:menu:plugins:convert:case-converter', component: CaseConvert },
    // { id: 'baize:menu:plugins:convert:list-converter', component: ListConvert },

    // ==================== 网络计算插件 - 地址转换器 ====================
    { id: 'baize:menu:plugins:net:ipv4-subnet-calculator', component: Ipv4SubnetCalc },
    // { id: 'baize:menu:plugins:net:ipv4-address-converter', component: Ipv4AddrConvert },
    // { id: 'baize:menu:plugins:net:mac-address-lookup', component: MacAddrLookup },
    // { id: 'baize:menu:plugins:net:mac-address-generator', component: MacAddrGenerator },

    // ==================== 网络计算插件 - 解析器 ====================
    // { id: 'baize:menu:plugins:net:qr-code-generator', component: QrcodeGenerator },
    // { id: 'baize:menu:plugins:net:wifi-qr-code-generator', component: WifiQrcodeGenerator },

    // ==================== 网络计算插件 - 其他 ====================
    { id: 'baize:menu:plugins:net:http-status-codes', component: HttpStatusCode },
    // { id: 'baize:menu:plugins:net:ipv6-ula-generator', component: Ipv6UlaGenerator },
    { id: 'baize:menu:plugins:net:subnet-mask-map-table', component: SubnetMaskMapTable },

    // ==================== 语言语法关键字对照表 ====================
    // { id: 'baize:menu:plugins:info:regex-syntax-table', component: RegexSyntaxTable },
    // { id: 'baize:menu:plugins:info:markdown-syntax-table', component: MarkdownSyntaxTable },
    // { id: 'baize:menu:plugins:info:latex-syntax-table', component: LatexSyntaxTable },
    // { id: 'baize:menu:plugins:info:html-tag-table', component: HtmlTagTable },
    // { id: 'baize:menu:plugins:info:css-property-table', component: CssPropertyTable },
    // { id: 'baize:menu:plugins:info:javascript-keyword-table', component: JavascriptKeywordTable },
    // { id: 'baize:menu:plugins:info:python-keyword-table', component: PythonKeywordTable },
    // { id: 'baize:menu:plugins:info:java-keyword-table', component: JavaKeywordTable },
    // { id: 'baize:menu:plugins:info:cpp-keyword-table', component: CppKeywordTable },
    // { id: 'baize:menu:plugins:info:go-keyword-table', component: GoKeywordTable },
    // { id: 'baize:menu:plugins:info:rust-keyword-table', component: RustKeywordTable },
    // { id: 'baize:menu:plugins:info:typescript-keyword-table', component: TypescriptKeywordTable },
    // { id: 'baize:menu:plugins:info:php-keyword-table', component: PhpKeywordTable },
    // { id: 'baize:menu:plugins:info:ruby-keyword-table', component: RubyKeywordTable },
    // { id: 'baize:menu:plugins:info:swift-keyword-table', component: SwiftKeywordTable },
    // { id: 'baize:menu:plugins:info:kotlin-keyword-table', component: KotlinKeywordTable },
    // { id: 'baize:menu:plugins:info:sql-keyword-table', component: SqlKeywordTable },
    // { id: 'baize:menu:plugins:info:shell-keyword-table', component: ShellKeywordTable },
    // { id: 'baize:menu:plugins:info:powershell-keyword-table', component: PowershellKeywordTable },
    // { id: 'baize:menu:plugins:info:docker-command-table', component: DockerCommandTable },
    // { id: 'baize:menu:plugins:info:kubernetes-command-table', component: KubernetesCommandTable },

    // ==================== 常用对照表 - 对照表一 ====================
    { id: 'baize:menu:plugins:info:ascii-table', component: ASCIIComparison },
    { id: 'baize:menu:plugins:info:file-extension-table', component: FileNameExtension },
    // { id: 'baize:menu:plugins:info:programming-language-table', component: ProgrammingLanguageTable },
    // { id: 'baize:menu:plugins:info:timezone-table', component: TimezoneTable },
    // { id: 'baize:menu:plugins:info:country-code-table', component: CountryCodeTable },
    // { id: 'baize:menu:plugins:info:language-code-table', component: LanguageCodeTable },
    // { id: 'baize:menu:plugins:info:currency-code-table', component: CurrencyCodeTable },
    // { id: 'baize:menu:plugins:info:color-code-table', component: ColorCodeTable },
    // { id: 'baize:menu:plugins:info:emoji-table', component: EmojiTable },
    // { id: 'baize:menu:plugins:info:file-size-table', component: FileSizeTable },
    // { id: 'baize:menu:plugins:info:network-port-table', component: NetworkPortTable },
    { id: 'baize:menu:plugins:info:numeric-case-table', component: NumericCase },
    { id: 'baize:menu:plugins:info:normal-font-style-table', component: NormalFontStyle },
    { id: 'baize:menu:plugins:info:greece-letter-table', component: GreeceLetter },
    { id: 'baize:menu:plugins:info:html-entity-table', component: HTMLSpecialChar },

    // ==================== 常用对照表 - 科学符号对照表 ====================
    // { id: 'baize:menu:plugins:info:periodic-table', component: PeriodicTable },
    // { id: 'baize:menu:plugins:info:keyboard-shortcut-table', component: KeyboardShortcutTable },
    { id: 'baize:menu:plugins:info:math-symbol-table', component: FormulaSymbol },
    { id: 'baize:menu:plugins:info:physical-constant-table', component: PhysicalSymbolic },
    // { id: 'baize:menu:plugins:info:roman-numeral-table', component: RomanNumeralTable },
    // { id: 'baize:menu:plugins:info:number-system-table', component: NumberSystemTable },

    // ==================== 常用对照表 - 数据和命令对照表 ====================
    // { id: 'baize:menu:plugins:info:sql-data-type-table', component: SqlDataTypeTable },
    // { id: 'baize:menu:plugins:info:json-data-type-table', component: JsonDataTypeTable },
    // { id: 'baize:menu:plugins:info:xml-entity-table', component: XmlEntityTable },
    // { id: 'baize:menu:plugins:info:css-unit-table', component: CssUnitTable },
    // { id: 'baize:menu:plugins:info:http-method-table', component: HttpMethodTable },
    // { id: 'baize:menu:plugins:info:http-header-table', component: HttpHeaderTable },
    // { id: 'baize:menu:plugins:info:git-command-table', component: GitCommandTable },

    // ==================== 常用对照表 - 其他 ====================
    // { id: 'baize:menu:plugins:info:unicode-table', component: UnicodeTable },
    // { id: 'baize:menu:plugins:info:mime-type-table', component: MimeTypeTable },

])
