// 渲染层菜单常量（在线工具 + 插件工具菜单数据源）。
// 2026-11-19 更新：PDF 预览已改 pdf.js（pdfjs-dist）渲染并恢复菜单入口
// （misc:pdf-preview，见 plugin-tools-const.ts 与 MenuBar 插件菜单）；
// HemyTools 工具面板仍不提供菜单入口（模板仅"返回编辑器"按钮，属未完成空壳，
// 其容器开关由 WorkSpace.vue 事件控制）。
//
// 2026-11-19 重构：在线工具映射项中的 url 字段属死数据——渲染层 generateMenuItems
// （menu-config.ts）只消费 id/labelKey，url 从未被读取；且该副本与主进程真源已漂移约 40%
// （w3cschool、tool.lu、latexlive 等地址不一致）。现全部删除（共 50 项），
// URL 单一真源收敛到 src/shared/constants/urls.ts，由主进程
// src/main/ipc/menu-tools.ts 按菜单动作 id 命中真正的跳转地址。
// 注意：下列映射表为兼容既有消费方仍保留 *UrlMaps 历史导出名，但已不含任何 URL 数据。

// ARC-14：插件工具显示事件名收敛至 EventBus 集中常量文件（字符串不变），
// 此处 re-export 保持历史调用方（menu-actions.ts / PluginTools.vue / 测试）兼容。
export { CHANNEL_PLUGIN_TOOL_SHOW } from '../../common/event-bus/event-bus-events'

const OnlineToolMaps = [
    // ==================== 在线工具 ====================
    {
        id: 'baize:menu:online:tools:cainiao-tools',
        labelKey: 'menu.online.tools.cainiaoTools'
    },
    {
        id: 'baize:menu:online:tools:w3cschool-tools',
        labelKey: 'menu.online.tools.w3cschoolTools'
    },
    {
        id: 'baize:menu:online:tools:baibaoxiang',
        labelKey: 'menu.online.tools.baibaoxiang'
    },
    {
        id: 'baize:menu:online:tools:toolfk',
        labelKey: 'menu.online.tools.toolfk'
    },
    {
        id: 'baize:menu:online:tools:json-bejson',
        labelKey: 'menu.online.tools.bejson'
    },
    {
        id: 'baize:menu:online:tools:67tool',
        labelKey: 'menu.online.tools.tool67'
    },
    {
        id: 'baize:menu:online:tools:toollu',
        labelKey: 'menu.online.tools.toollu'
    },
    {
        id: 'baize:menu:online:tools:sojson-parser',
        labelKey: 'menu.online.tools.sojson'
    },
    {
        id: 'baize:menu:online:tools:latex-editor',
        labelKey: 'menu.online.tools.latexEditor'
    },
    {
        id: 'baize:menu:online:tools:mermaid-editor',
        labelKey: 'menu.online.tools.mermaidEditor'
    },
    {
        id: 'baize:menu:online:tools:planttext-editor',
        labelKey: 'menu.online.tools.planttextEditor'
    },
    {
        id: 'baize:menu:online:tools:mindmap-tool',
        labelKey: 'menu.online.tools.mindmapTool'
    },
    {
        id: 'baize:menu:online:tools:diagrams-tool',
        labelKey: 'menu.online.tools.diagramsTool'
    },
    {
        id: 'baize:menu:online:tools:plantuml-server',
        labelKey: 'menu.online.tools.plantumlServer'
    },
    {
        id: 'baize:menu:online:tools:chuizi-tools',
        labelKey: 'menu.online.tools.chuiziTools'
    }
]

const CaiNiaoUrlMaps = [
    // ==================== 菜鸟在线工具 ====================
    {
        id: 'baize:menu:online:cainiao:svg-editor',
        labelKey: 'menu.online.cainiao.svgEditor'
    },
    {
        id: 'baize:menu:online:cainiao:draw-tool',
        labelKey: 'menu.online.cainiao.drawTool'
    },
    {
        id: 'baize:menu:online:cainiao:office-tools',
        labelKey: 'menu.online.cainiao.officeTools'
    },
    {
        id: 'baize:menu:online:cainiao:table-generator',
        labelKey: 'menu.online.cainiao.tableGenerator'
    }
]

const W3SchoolUrlMaps = [
    // ==================== 编程狮在线工具 ====================
    {
        id: 'baize:menu:online:encode:csv-to-html',
        labelKey: 'menu.online.w3school.csvToHtml'
    },
    {
        id: 'baize:menu:online:encode:sql-formatter',
        labelKey: 'menu.online.w3school.sqlFormatter'
    },
    {
        id: 'baize:menu:online:encode:fullwidth-halfwidth-converter',
        labelKey: 'menu.online.w3school.fullwidthHalfwidth'
    }
]

const EncDecUrlMaps = [
    // ==================== 在线编解码工具 ====================
    {
        id: 'baize:menu:online:encode:qrcode-generator',
        labelKey: 'menu.online.encode.qrcodeGenerator'
    },
    {
        id: 'baize:menu:online:encode:qrcode-decoder',
        labelKey: 'menu.online.encode.qrcodeDecoder'
    },
    {
        id: 'baize:menu:online:encode:encoding-converter',
        labelKey: 'menu.online.encode.encodingConverter'
    }
]

const IdeUrlMaps = [
    // ==================== 在线IDE编辑器 ====================
    // FE-28：WebIDE Online 为产品品牌名，按 i18n 约定保留原文 label（不翻译）
    {
        id: 'baize:menu:online:ide:webide-online',
        label: 'WebIDE Online'
    },
    {
        id: 'baize:menu:online:ide:html-lang',
        labelKey: 'menu.online.ide.html'
    },
    {
        id: 'baize:menu:online:ide:python-lang',
        labelKey: 'menu.online.ide.python'
    },
    {
        id: 'baize:menu:online:ide:c-lang',
        labelKey: 'menu.online.ide.c'
    },
    {
        id: 'baize:menu:online:ide:go-lang',
        labelKey: 'menu.online.ide.go'
    }
]

const DevelopUrlMaps = [
    // ==================== 开发者工具 ====================
    {
        id: 'baize:menu:online:dev:pretty-qrcode-generator',
        labelKey: 'menu.online.dev.prettyQrcode'
    },
    {
        id: 'baize:menu:online:dev:qrcode-decoder-box3',
        labelKey: 'menu.online.dev.qrcodeDecoder'
    },
    {
        id: 'baize:menu:online:dev:image-format-converter',
        labelKey: 'menu.online.dev.imageFormatConverter'
    },
    {
        id: 'baize:menu:online:dev:linux-crontab',
        labelKey: 'menu.online.dev.linuxCrontab'
    },
    {
        id: 'baize:menu:online:dev:jwt-decoder',
        labelKey: 'menu.online.dev.jwtDecoder'
    }
]

const TeamUrlMaps = [
    // ==================== 国内知名前端团队 ====================
    {
        id: 'baize:menu:online:team:taobao-fed',
        labelKey: 'menu.online.team.taobaoFed'
    },
    {
        id: 'baize:menu:online:team:tmall-fe',
        labelKey: 'menu.online.team.tmallFe'
    },
    // FE-28：THX from Alimama FE 为团队/品牌名，按 i18n 约定保留原文 label（不翻译）
    {
        id: 'baize:menu:online:team:thx-alimama-fe',
        label: 'THX from Alimama FE'
    },
    {
        id: 'baize:menu:online:team:ali-nodejs-platform',
        labelKey: 'menu.online.team.aliNodejs'
    },
    {
        id: 'baize:menu:online:team:baidu-fex',
        labelKey: 'menu.online.team.baiduFex'
    }
]

const CloudUrlMaps = [
    // ==================== 云计算平台 ====================
    {
        id: 'baize:menu:online:cloud:aliyun',
        labelKey: 'menu.online.cloud.aliyun'
    },
    {
        id: 'baize:menu:online:cloud:tencent-cloud',
        labelKey: 'menu.online.cloud.tencent'
    },
    {
        id: 'baize:menu:online:cloud:huawei-cloud',
        labelKey: 'menu.online.cloud.huawei'
    },
    {
        id: 'baize:menu:online:cloud:tianyi-cloud',
        labelKey: 'menu.online.cloud.tianyi'
    },
    {
        id: 'baize:menu:online:cloud:jinshan-cloud',
        labelKey: 'menu.online.cloud.jinshan'
    }
]

const GitHubUrlMaps = [
    // ==================== GitHub 开源项目 ====================
    {
        id: 'baize:menu:github:it-tools',
        labelKey: 'menu.github.itTools'
    },
    {
        id: 'baize:menu:github:ghost-website',
        labelKey: 'menu.github.ghost'
    },
    {
        id: 'baize:menu:github:priospace',
        labelKey: 'menu.github.priospace'
    },
    {
        id: 'baize:menu:github:plane-project',
        labelKey: 'menu.github.plane'
    },
    {
        id: 'baize:menu:github:openproject',
        labelKey: 'menu.github.openproject'
    }
]

const OnlineUrlMaps = [
    ...OnlineToolMaps,
    ...CaiNiaoUrlMaps,
    ...W3SchoolUrlMaps,
    ...EncDecUrlMaps,
    ...IdeUrlMaps,
    ...DevelopUrlMaps,
    ...TeamUrlMaps,
    ...CloudUrlMaps,
    ...GitHubUrlMaps
]

// 加解密插件菜单
// FE-28：Token Generator / Hash Text 原为硬编码 label，改走 menu 命名空间 i18n key。
const PluginGeneratorMaps = [
    {
        labelKey: 'menu.plugins.encrypt.tokenGenerator',
        menuAction: 'baize:menu:plugins:encrypt:token-generator'
    },
    {
        labelKey: 'menu.plugins.encrypt.hashText',
        menuAction: 'baize:menu:plugins:encrypt:hash-text'
    },
    {
        labelKey: 'menu.plugins.encrypt.uuids',
        menuAction: 'baize:menu:plugins:encrypt:uuids-generator'
    },
    {
        labelKey: 'menu.plugins.encrypt.ulid',
        menuAction: 'baize:menu:plugins:encrypt:ulid-generator'
    },
    {
        labelKey: 'menu.plugins.encrypt.encryptDecrypt',
        menuAction: 'baize:menu:plugins:encrypt:encrypt-decrypt'
    },
    {
        labelKey: 'menu.plugins.encrypt.cryptoEncryptDecrypt',
        menuAction: 'baize:menu:plugins:encrypt:crypto-encrypt-decrypt'
    },
    {
        labelKey: 'menu.plugins.encrypt.hmac',
        menuAction: 'baize:menu:plugins:encrypt:hmac-generator'
    },
    { labelKey: 'menu.plugins.encrypt.rsa', menuAction: 'baize:menu:plugins:encrypt:rsa-generator' }
]

// 转换器菜单
// A-4/ARC-09/FUN-19：以下组在 plugin_tools_const.ts 注册表中无对应组件，点击会落入
// PluginTools.vue 的"开发中"空白占位，已从渲染中隐藏。
// CMP-29：原以注释形式滞留的未实现菜单项（date/base/roman/color 等 13 项）已清理并归档至
// out/tool-results/r2-completeness-changes.md，组件补齐注册后可从归档恢复。
// 1.3.5：jyshare 常用工具集成——编解码组（Base64/URL/HTML/Unicode/图片转Base64）补齐。
const PluginCodeConvertMaps = [
    {
        labelKey: 'menu.plugins.codec.base64Codec',
        menuAction: 'baize:menu:plugins:codec:base64-codec'
    },
    {
        labelKey: 'menu.plugins.codec.urlCodec',
        menuAction: 'baize:menu:plugins:codec:url-codec'
    },
    {
        labelKey: 'menu.plugins.codec.htmlCodec',
        menuAction: 'baize:menu:plugins:codec:html-codec'
    },
    { labelKey: 'menu.plugins.codec.unicode', menuAction: 'baize:menu:plugins:codec:unicode' },
    {
        labelKey: 'menu.plugins.codec.imageBase64',
        menuAction: 'baize:menu:plugins:codec:image-base64'
    }
]

// A-4/ARC-09/FUN-19：JSON/YAML/TOML/CSV/XML/SQL/HTML 格式化 7 项无注册组件，已隐藏；
// CMP-29：注释条目已归档（见 out/tool-results/r2-completeness-changes.md）。
// 1.3.5：jyshare 常用工具集成——格式化工具组（JSON 工具/XML 格式化）补齐。
const PluginFormatMaps = [
    { labelKey: 'menu.plugins.format.jsonTool', menuAction: 'baize:menu:plugins:format:json-tool' },
    {
        labelKey: 'menu.plugins.format.xmlFormatter',
        menuAction: 'baize:menu:plugins:format:xml-format'
    }
]

// A-4/ARC-09/FUN-19：JSON/YAML/TOML 互转、文本转二进制/Unicode 等 9 项无注册组件，已隐藏；
// CMP-29：注释条目已归档（见 out/tool-results/r2-completeness-changes.md）。
// 1.3.5：jyshare 常用工具集成——格式转换组（颜色/单位/人民币/时间戳/进制）补齐。
const PluginConvertMaps = [
    {
        labelKey: 'menu.plugins.convert.colorConvert',
        menuAction: 'baize:menu:plugins:convert:color-convert'
    },
    {
        labelKey: 'menu.plugins.convert.unitConvert',
        menuAction: 'baize:menu:plugins:convert:unit-convert'
    },
    { labelKey: 'menu.plugins.convert.rmbCase', menuAction: 'baize:menu:plugins:convert:rmb-case' },
    {
        labelKey: 'menu.plugins.convert.timestampConvert',
        menuAction: 'baize:menu:plugins:convert:timestamp-convert'
    },
    {
        labelKey: 'menu.plugins.convert.baseConvert',
        menuAction: 'baize:menu:plugins:convert:base-convert'
    }
]

// A-4/ARC-09/FUN-19：大小写转换全家族 12 项无注册组件，已隐藏；
// CMP-29：注释条目已归档（见 out/tool-results/r2-completeness-changes.md）。
const PluginUpLowerMaps = []

// 网络计算插件菜单
// A-4/ARC-09/FUN-19：ipv4-address-converter/mac-address-lookup/mac-address-generator 等
// 无注册组件（点击会落入"开发中"占位），已隐藏；
// CMP-29：注释条目已归档（见 out/tool-results/r2-completeness-changes.md）。
const PluginNetAddrs = [
    {
        labelKey: 'menu.plugins.net.ipv4SubnetCalculator',
        menuAction: 'baize:menu:plugins:net:ipv4-subnet-calculator'
    }
]

// A-4/ARC-09/FUN-19：二维码生成器两项等无注册组件，已隐藏；
// CMP-29：注释条目已归档（见 out/tool-results/r2-completeness-changes.md）。
// 1.3.5：jyshare 常用工具集成——解析器组（正则表达式测试）补齐。
const PluginNetGenerators = [
    {
        labelKey: 'menu.plugins.net.regexTester',
        menuAction: 'baize:menu:plugins:net:regex-tester'
    }
]

// A-4/ARC-09/FUN-19：HTTP状态码/子网掩码对照表两项已注册（见 plugin_tools_const.ts），
// 但本组的 DNS/Ping/端口扫描等 14 项无注册组件，整组注释已清理；
// CMP-29：注释条目已归档（见 out/tool-results/r2-completeness-changes.md）。
const PluginNetWork = []

// 常用对照表菜单
// CMP-29：本组原注释项（编程语言/时区/国家代码等 14 项）已归档（见
// out/tool-results/r2-completeness-changes.md），仅保留已注册组件的条目。
const PluginInfoNormal = [
    { labelKey: 'menu.plugins.info.asciiTable', menuAction: 'baize:menu:plugins:info:ascii-table' },
    {
        labelKey: 'menu.plugins.info.fileExtensionTable',
        menuAction: 'baize:menu:plugins:info:file-extension-table'
    },
    {
        labelKey: 'menu.plugins.info.greeceLetterTable',
        menuAction: 'baize:menu:plugins:info:greece-letter-table'
    },
    {
        labelKey: 'menu.plugins.info.htmlEntityTable',
        menuAction: 'baize:menu:plugins:info:html-entity-table'
    }
]

// CMP-29：化学元素周期表/键盘快捷键等 4 项注释已归档（见
// out/tool-results/r2-completeness-changes.md），仅保留已注册组件的条目。
const PluginInfoScience = [
    {
        labelKey: 'menu.plugins.info.mathSymbolTable',
        menuAction: 'baize:menu:plugins:info:math-symbol-table'
    },
    {
        labelKey: 'menu.plugins.info.physicalConstantTable',
        menuAction: 'baize:menu:plugins:info:physical-constant-table'
    }
]

// CMP-29：SQL/JSON 数据类型、Git/NPM 命令等 10 项注释已归档（见
// out/tool-results/r2-completeness-changes.md），本组暂无可展示条目。
const PluginInfoCmd = []

// 1.3.5：jyshare 常用工具集成——常用小工具组（随机生成器/在线计算器）。
const PluginMiscToolsMaps = [
    {
        labelKey: 'menu.plugins.misc.randomGenerator',
        menuAction: 'baize:menu:plugins:misc:random-generator'
    },
    {
        labelKey: 'menu.plugins.misc.calculator',
        menuAction: 'baize:menu:plugins:misc:calculator'
    },
    // 2026-11-18（遗留清单 #9）：PDF 预览改走 pdf.js 后恢复菜单入口
    {
        labelKey: 'menu.plugins.misc.pdfPreview',
        menuAction: 'baize:menu:plugins:misc:pdf-preview'
    }
]

// 1.3.5：jyshare 常用工具集成——文本转换组（繁简/拼音/字数统计/文本比对）。
const PluginTextToolsMaps = [
    {
        labelKey: 'menu.plugins.text.chineseText',
        menuAction: 'baize:menu:plugins:text:chinese-text'
    },
    {
        labelKey: 'menu.plugins.text.wordCount',
        menuAction: 'baize:menu:plugins:text:word-count'
    },
    {
        labelKey: 'menu.plugins.text.textDiff',
        menuAction: 'baize:menu:plugins:text:text-diff'
    }
]

// CMP-29：正则/Markdown/LaTeX 语法、各语言关键字对照表等 23 项注释已归档（见
// out/tool-results/r2-completeness-changes.md），本组暂无可展示条目。
const PluginCodeDef = []

export {
    OnlineToolMaps,
    CaiNiaoUrlMaps,
    W3SchoolUrlMaps,
    EncDecUrlMaps,
    IdeUrlMaps,
    DevelopUrlMaps,
    TeamUrlMaps,
    CloudUrlMaps,
    GitHubUrlMaps,
    OnlineUrlMaps,
    PluginGeneratorMaps,
    PluginCodeConvertMaps,
    PluginFormatMaps,
    PluginConvertMaps,
    PluginUpLowerMaps,
    PluginNetAddrs,
    PluginNetGenerators,
    PluginNetWork,
    PluginInfoNormal,
    PluginInfoScience,
    PluginInfoCmd,
    PluginCodeDef,
    PluginMiscToolsMaps,
    PluginTextToolsMaps
}
