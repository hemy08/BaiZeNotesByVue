// 菜单数据结构
import { ref } from "vue";

export interface BaiZeMenuItem {
    label: string
    accelerator?: string
    click?: string
    submenu?: BaiZeMenuItem[]
    type?: string
    enabled?: boolean
}

const importMenu: BaiZeMenuItem = {
    label: '从文件导入',
    submenu: [
        { label: '从 Word 导入', click: 'baize-import-word' },
        { label: '从 HTML 导入', click: 'baize-import-html' },
        { label: '从 JSON 导入', click: 'baize-import-json' },
        { label: '从 YAML 导入', click: 'baize-import-yaml' },
        { label: '从 XML 导入', click: 'baize-import-xml' },
        { label: '从文本文件导入', click: 'baize-import-text' }
    ]
}

const exportMenu: BaiZeMenuItem = {
    label: '导出到文件',
    submenu: [
        { label: '导出为Word', click: 'baize-export-word' },
        { label: '导出为JSON', click: 'baize-export-json' },
        { label: '导出为XML', click: 'baize-export-xml' },
        { label: '导出为YAML', click: 'baize-export-yaml' },
        { label: '导出为HTML', click: 'baize-export-html' },
        { label: '导出为PDF', click: 'baize-export-pdf' }
    ]
}

const fileMenu: BaiZeMenuItem = {
    label: '文件',
    accelerator: 'Alt+N',
    submenu: [
        { label: '新建文件(N)', accelerator: 'Ctrl+N', click: 'baize-new-file' },
        { label: '新建文件夹(D)', accelerator: 'Ctrl+D', click: 'baize-new-folder' },
        { label: '打开文件', click: 'open-file' },
        { label: '打开文件夹', accelerator: 'Ctrl+O', click: 'baize-open-folder' },
        { type: 'separator'},
        importMenu,
        exportMenu,
        { type: 'separator' },
        { label: '另存为', click: 'baize-save-as' },
        { type: 'separator' },
        { label: '关闭文件', click: 'baize-close-file' }
    ]
}

const editMenu: BaiZeMenuItem = {
    label: '编辑',
    submenu: [
        { label: '撤销', accelerator: 'Ctrl+Z', click: 'baize-undo' },
        { label: '重做', accelerator: 'Ctrl+Y', click: 'baize-redo' },
        { type: 'separator' },
        { label: '剪切', accelerator: 'Ctrl+X', click: 'baize-cut' },
        { label: '复制', accelerator: 'Ctrl+C', click: 'baize-copy' },
        { label: '粘贴', accelerator: 'Ctrl+V', click: 'baize-paste' },
        { type: 'separator' },
        { label: '查找', accelerator: 'Ctrl+F', click: 'baize-find' },
        { label: '替换', accelerator: 'Ctrl+H', click: 'baize-replace' }
    ]
}

const viewMenu: BaiZeMenuItem = {
    label: '视图',
    submenu: [
        { label: '编辑模式', accelerator: 'F9', click: 'baize-view-edit' },
        { label: '预览模式', accelerator: 'F10', click: 'baize-view-preview' },
        { label: '编辑/预览模式', accelerator: 'F11', click: 'baize-view-edit-preview' },
        { label: '开发人员工具', accelerator: 'F12', click: 'baize-view-dev-tools' },
        { type: 'separator' },
        { label: '显示/隐藏资源管理器', click: 'baize-view-toggle-resource-manager' },
        { label: '显示/隐藏行号', click: 'baize-view-toggle-line-number' },
        { label: '显示/隐藏空白字符', click: 'baize-view-toggle-whitespace' },
        { label: '显示/隐藏文章大纲', click: 'baize-view-toggle-outline' },
        { type: 'separator' },
        { label: '折叠/展开标题',
            submenu: [
                { label: '一级标题', click: 'baize-view-exp-level1' },
                { label: '二级标题', click: 'baize-view-exp-level2' },
                { label: '三级标题', click: 'baize-view-exp-level3' },
                { label: '四级标题', click: 'baize-view-exp-level4' },
                { label: '五级标题', click: 'baize-view-exp-level5' },
            ]}
    ]
}

const opeFileEncoding: MenuItem = {
    label: '重新用...编码打开',
    submenu: [
        { label: 'UTF-8', click: 'baize-enc-utf8' },
        { label: 'UTF-16LE', click: 'baize-enc-utf16-le' },
        { label: 'UTF-16BE', click: 'baize-enc-utf16-be' },
        { type: 'separator' },
        { label: 'GBK(简体中文)', click: 'baize-enc-gbk' },
        { label: 'GB2312(简体中文)', click: 'baize-enc-gb2312' },
        { label: 'GB18030(简体中文)', click: 'baize-enc-gb18030' },
        { label: 'Big5(繁体中文)', click: 'baize-enc-big5' },
        { label: 'Big5-HKSCS(繁体中文)', click: 'baize-enc-big5-hkscs' },
        { type: 'separator' },
        { label: '十六进制', click: 'baize-enc-hex' },
        { label: '注意: 请勿直接编辑乱码文件。'},
    ]
}

const switchEncodingMenu: MenuItem = {
    label: '转为...编码',
    submenu: [
        { label: 'UTF-8', click: 'baize-switch-utf8' },
        { label: 'UTF-16LE', click: 'baize-switch-utf16-le' },
        { label: 'UTF-16BE', click: 'baize-switch-utf16-be' },
        { type: 'separator' },
        { label: 'GBK(简体中文)', click: 'baize-switch-gbk' },
        { label: 'GB2312(简体中文)', click: 'baize-switch-gb2312' },
        { label: 'GB18030(简体中文)', click: 'baize-switch-gb18030' },
        { label: 'Big5(繁体中文)', click: 'baize-switch-big5' },
        { label: 'Big5-HKSCS(繁体中文)', click: 'baize-switch-big5-hkscs' },
        { type: 'separator' },
        { label: '十六进制', click: 'baize-switch-hex' },
        { label: '注意: 请勿直接编辑乱码文件。'},
    ]
}
const codingMenu: MenuItem = {
    label: '编码',
    submenu: [
        opeFileEncoding, // 编码
        switchEncodingMenu, // 切换编码
    ]
}

const insertTemplate: BaiZeMenuItem = {
    label: '模板',
    submenu: [
        { label: 'Mermaid', click: 'baize-insert-mermaid' },
        { label: 'PlantUML', click: 'baize-insert-plantuml' },
        { label: '文本块', click: 'baize-insert-textblock' },
        { label: '写作', click: 'baize-insert-writing' }
    ]
}

const insertTextBlock: BaiZeMenuItem = {
    label: '文本块',
    submenu: [
        { label: '代码块', click: 'baize-insert-code-block' },
        { label: '引用块', click: 'baize-insert-quote-block' },
        { label: '数学公式块', click: 'baize-insert-math-block' },
        { label: 'Mermaid块', click: 'baize-insert-mermaid-block' },
        { label: 'PlantUML块', click: 'baize-insert-plantuml-block' }
    ]
}

const InsertFromFiles: BaiZeMenuItem = {
    label: '从文件插入',
    submenu: [
        { label: '插入图片', click: 'baize-insert-image' },
        { label: '插入视频', click: 'baize-insert-video' },
        { label: '插入音频', click: 'baize-insert-audio' },
        { label: '插入PDF', click: 'baize-insert-pdf' }
    ]
}

const insertMaterial: BaiZeMenuItem = {
    label: 'Material',
    submenu: [
        {label: 'Admonition', click: 'baize-insert-admonition'},
    ]
}

const insertMermaid: BaiZeMenuItem = {
    label: 'Mermaid',
    submenu: [
        {label: '基础框架', click: 'baize-insert-mermaid-base'},
        {label: 'flowchart', click: 'baize-insert-mermaid-flowchart'},
        {label: 'BlockDiagram', click: 'baize-insert-mermaid-blockDiagram'},
        {label: 'C4图', click: 'baize-insert-mermaid-C4Context'},
        {label: '类图', click: 'baize-insert-mermaid-classDiagram'},
        {label: '实体关系图', click: 'baize-insert-mermaid-erDiagram'},
        {label: '甘特图', click: 'baize-insert-mermaid-gantt'},
        {label: 'Git图', click: 'baize-insert-mermaid-gitGraph'},
        {label: '基本流程图', click: 'baize-insert-mermaid-graph'},
        {label: '用户旅程图', click: 'baize-insert-mermaid-journey'},
        {label: '思维导图', click: 'baize-insert-mermaid-mind-map'},
        {label: 'Packet', click: 'baize-insert-mermaid-packet'},
        {label: '饼图', click: 'baize-insert-mermaid-pie'},
        {label: '象限图', click: 'baize-insert-mermaid-quadrant-chart'},
        {label: '需求图', click: 'baize-insert-mermaid-requirement-diagram'},
        {label: '桑基图', click: 'baize-insert-mermaid-sankey'},
        {label: '序列图', click: 'baize-insert-mermaid-sequence-diagram'},
        {label: '状态图', click: 'baize-insert-mermaid-state-diagram'},
        {label: '时间线图', click: 'baize-insert-mermaid-timeline'},
        {label: 'XYChart', click: 'baize-insert-mermaid-xy-chart'},
        {label: 'ZenUml', click: 'baize-insert-mermaid-zen-uml'}
    ]
}

const insertPlantUML: BaiZeMenuItem = {
    label: 'PlantUML',
    submenu: [
        {label: '基础框架', click: 'baize-insert-plantuml-base'},
        {label: '活动图', click: 'baize-insert-plantuml-activity-diagram'},
        {label: '规范和描述语言（SDL）', click: 'baize-insert-plantuml-activity-diagram'},
        {label: '架构图', click: 'baize-insert-plantuml-archimate-diagram'},
        {label: 'AsciiMath', click: 'baize-insert-plantuml-asciiMath'},
        {label: '类图', click: 'baize-insert-plantuml-class-diagram'},
        {label: '组件图', click: 'baize-insert-plantuml-component-diagram'},
        {label: '部署图', click: 'baize-insert-plantuml-deployment-diagram'},
        {label: 'Ditaa 图表', click: 'baize-insert-plantuml-daitaa-diagram'},
        {label: '实体关系图', click: 'baize-insert-plantuml-entity-relationship'},
        {label: 'EBNF 图表', click: 'baize-insert-plantuml-extended-backus-naur-form'},
        {label: '甘特图', click: 'baize-insert-plantuml-gantt-diagram'},
        {label: '信息工程图', click: 'baize-insert-plantuml-information-engineering'},
        {label: 'JSON 数据', click: 'baize-insert-plantuml-JsonDiagram'},
        {label: '思维导图', click: 'baize-insert-plantuml-mindmap-diagram'},
        {label: '网络图', click: 'baize-insert-plantuml-nwdiag'},
        {label: '对象图', click: 'baize-insert-plantuml-object-diagram'},
        {label: 'Regex 图表', click: 'baize-insert-plantuml-regular-expression'},
        {label: '用户界面模型', click: 'baize-insert-plantuml-salt'},
        {label: '序列图', click: 'baize-insert-plantuml-sequence-diagram'},
        {label: '状态图', click: 'baize-insert-plantuml-state-diagram'},
        {label: '定时图', click: 'baize-insert-plantuml-timing-diagram'},
        {label: '用例图', click: 'baize-insert-plantuml-usecase-diagram'},
        {label: 'WBS 图表', click: 'baize-insert-plantuml-wbs-diagram'},
        {label: 'YAML 数据', click: 'baize-insert-plantuml-yaml-diagram'},
    ]
}

const insertMenu: BaiZeMenuItem = {
    label: '插入',
    submenu: [
        { label: '特殊字体', click: 'baize-insert-special-text' },
        { label: '数学公式', click: 'baize-insert-math' },
        { label: 'Markdown表格', click: 'baize-insert-md-table' },
        { label: '网页链接', click: 'baize-insert-web-link' },
        { type: 'separator' },
        insertTemplate,
        insertTextBlock,
        InsertFromFiles,
        { type: 'separator' },
        insertMaterial,
        insertMermaid, // 编码
        insertPlantUML, // 切换编码
        { type: 'separator' },
        { label: '自定义模板', click: 'baize-custom-template' },
        { label: '模板管理', click: 'baize-template-manager' }
    ]
}

const settingMenu: BaiZeMenuItem = {
    label: '设置',
    submenu: [
        { label: '主题设置', click: 'baize-settings-theme' },
        { label: '系统设置', click: 'baize-settings-system' },
        { type: 'separator' },
        { label: '快速链接设置', click: 'baize-settings-quick-link' },
        { label: '编辑器设置', click: 'baize-settings-monaco-editor' }
    ]
}

const toolsMenu: BaiZeMenuItem = {
    label: '工具',
    submenu: [
        { label: 'mermaid绘图', click: 'baize-tools-mermaid' },
        { label: '公式编辑器', click: 'baize-tools-katex' },
        { label: '电子表格', click: 'baize-tools-table' },
        { label: '配图制作', click: 'baize-tools-images' },
        { label: '绘图工具', click: 'baize-tools-drawing' }
    ]
}

// 加解密插件菜单
const encryptMenu: BaiZeMenuItem = {
    label: '加解密插件',
    submenu: [
        { label: 'Token Generator', click: 'baize-token-generator' },
        { label: 'Hash Text', click: 'baize-hash-text' },
        { label: 'UUIDs 生成器', click: 'baize-uuids-generator' },
        { label: 'ULID 生成器', click: 'baize-ulid-generator' },
        { label: '加密/解密文本', click: 'baize-encrypt-decrypt' },
        { label: 'Crypto加密/解密文本', click: 'baize-crypto-encrypt-decrypt' },
        { label: 'Hmac 生成器', click: 'baize-hmac-generator' },
        { label: 'RSA密钥对生成器', click: 'baize-rsa-generator' }
    ]
}

// 转换器菜单
const cvtEncDecMenu: BaiZeMenuItem = {
    label: '编解码转换',
    submenu: [
        { label: '日期时间转换器', click: 'baize-cvt-date-converter' },
        { label: '整数基转换器', click: 'baize-cvt-base-converter' },
        { label: '罗马数字转换器', click: 'baize-cvt-roman-numeral-converter' },
        { label: 'Color 选择器', click: 'baize-cvt-color-converter' },
        { label: '数值转换器', click: 'baize-cvt-number-converter' },
        { label: '单位转换器', click: 'baize-cvt-unit-converter' },
        { label: '字符串转换器', click: 'baize-cvt-string-converter' },
        { label: 'URL编码/解码', click: 'baize-cvt-url-encode-decode' },
        { label: 'HTML实体编码/解码', click: 'baize-cvt-html-entity-encode-decode' },
        { label: 'Base64字符串编码/解码', click: 'baize-cvt-base64-string-encode-decode' },
        { label: 'Base64文件编码/解码', click: 'baize-cvt-base64-file-encode-decode' },
        { label: 'JWT解码器', click: 'baize-cvt-jwt-decoder' },
        { label: 'Gzip压缩/解压', click: 'baize-cvt-gzip-compress-decompress' },
    ]
}

const cvtTextMenu: BaiZeMenuItem = {
    label: '文本转换器',
    submenu: [
        { label: 'JSON转换器', click: 'baize-cvt-json-converter' },
        { label: 'YAML转换器', click: 'baize-cvt-yaml-converter' },
        { label: 'TOML转换器', click: 'baize-cvt-toml-converter' },
        { label: 'CSV转换器', click: 'baize-cvt-csv-converter' },
        { label: 'XML转换器', click: 'baize-cvt-xml-converter' },
        { label: 'JSON转CSV', click: 'baize-cvt-json-to-csv' },
        { label: 'JSON转YAML', click: 'baize-cvt-json-to-yaml' },
        { label: 'JSON转TOML', click: 'baize-cvt-json-to-toml' },
        { label: 'YAML转JSON', click: 'baize-cvt-yaml-to-json' },
        { label: 'YAML转TOML', click: 'baize-cvt-yaml-to-toml' },
        { label: 'TOML转JSON', click: 'baize-cvt-toml-to-json' },
        { label: 'TOML转YAML', click: 'baize-cvt-toml-to-yaml' },
    ]
}

const cvtUpLowMenu: BaiZeMenuItem = {
    label: '大小写转换',
    submenu: [
        { label: 'Pascal大小写转换', click: 'baize-cvt-pascal-case' },
        { label: 'Camel大小写转换', click: 'baize-cvt-camel-case' },
        { label: 'Snake大小写转换', click: 'baize-cvt-snake-case' },
        { label: 'Kebab大小写转换', click: 'baize-cvt-kebab-case' },
        { label: '常量大小写转换', click: 'baize-cvt-constant-case' },
        { label: 'Dot大小写转换', click: 'baize-cvt-dot-case' },
        { label: 'Path大小写转换', click: 'baize-cvt-path-case' },
        { label: 'Space大小写转换', click: 'baize-cvt-space-case' },
        { label: 'Capital大小写转换', click: 'baize-cvt-capital-case' },
        { label: 'Header大小写转换', click: 'baize-cvt-header-case' },
        { label: 'Lower大小写转换', click: 'baize-cvt-lower-case' },
        { label: 'Upper大小写转换', click: 'baize-cvt-upper-case' }
    ]
}

const convertMenu: BaiZeMenuItem = {
    label: '各类转换器',
    submenu: [
        cvtEncDecMenu,
        cvtTextMenu,
        cvtUpLowMenu,
        { label: '日期时间转换器', click: 'baize-cvt-date-converter' },
        { label: '整数基转换器', click: 'baize-cvt-base-converter' },
        { label: '罗马数字转换器', click: 'baize-cvt-roman-numeral-converter' },
        { label: 'Color 选择器', click: 'baize-cvt-color-converter' },
        { label: '数值转换器', click: 'baize-cvt-number-converter' },
        { label: '单位转换器', click: 'baize-cvt-unit-converter' },
        { label: '字符串转换器', click: 'baize-cvt-string-converter' },
        { label: 'Gzip压缩/解压', click: 'baize-cvt-gzip-compress-decompress' },
    ]
}

// 网络计算插件菜单
const netAddrMenu: BaiZeMenuItem = {
    label: '地址转换器',
    submenu: [
        {label: 'IPv4子网计算器', click: 'baize-net-ipv4-subnet-calculator'},
        {label: 'IPv4地址转换器', click: 'baize-net-ipv4-address-converter'},
        {label: 'IPv6子网计算器', click: 'baize-net-ipv6-subnet-calculator'},
        {label: 'IPv6地址转换器', click: 'baize-net-ipv6-address-converter'},
        {label: 'IP范围扩展', click: 'baize-net-ip-range-expand'},
        {label: 'MAC地址查找器', click: 'baize-net-mac-address-lookup'},
        {label: 'MAC地址生成器', click: 'baize-net-mac-address-generator'},
        { label: '设备信息', click: 'baize-net-device-information' },
        { label: '浏览器信息', click: 'baize-net-browser-information' },
        { label: '网络配置信息', click: 'baize-net-network-configuration' }
    ]
}

const netGeneratorsMenu: BaiZeMenuItem = {
    label: '解析器',
    submenu: [
        { label: 'User-Agent解析器', click: 'baize-net-user-agent-parser' },
        { label: 'URL解析器', click: 'baize-net-url-parser' },
        { label: 'SSL证书解析器', click: 'baize-net-ssl-certificate-parser' },
        { label: 'Hash文本', click: 'baize-net-hash-text' },
        { label: 'Bcrypt', click: 'baize-net-bcrypt' },
        { label: '二维码生成器', click: 'baize-net-qr-code-generator' },
        { label: 'WiFi二维码生成器', click: 'baize-net-wifi-qr-code-generator' },
        { label: 'EUI-64计算器', click: 'baize-net-eui-64-calculator' },
        { label: '用户代理解析器', click: 'baize-net-user-agent-parser' }
    ]
}

const networkMenu: BaiZeMenuItem = {
    label: '网络计算插件',
    submenu: [
        netAddrMenu,
        netGeneratorsMenu,
        { label: 'HTTP状态码', click: 'baize-net-http-status-codes' },
        { label: 'MIME类型', click: 'baize-net-mime-types' },
        { label: 'DNS查询', click: 'baize-net-dns-lookup' },
        { label: 'Ping', click: 'baize-net-ping' },
        { label: '端口扫描器', click: 'baize-net-port-scanner' },
        { label: 'Whois查询', click: 'baize-net-whois-lookup' },
        { label: '颜色转换器', click: 'baize-net-color-converter' },
        { label: 'IP地理位置', click: 'baize-net-ip-geolocation' },
        { label: 'EUI-64计算器', click: 'baize-net-eui-64-calculator' },
        { label: 'Unicode转换器', click: 'baize-net-unicode-converter' },
        { label: 'Slugify字符串', click: 'baize-net-slugify-string' },
        { label: 'HTTP请求构建器', click: 'baize-net-http-request-builder' }
    ]
}

// 常用对照表菜单
const infoDiffMenu: BaiZeMenuItem = {
    label: '对照表一',
    submenu: [
        { label: 'ASCII码对照表', click: 'baize-info-ascii-table' },
        { label: '文件扩展名对照表', click: 'baize-info-file-extension-table' },
        { label: '编程语言对照表', click: 'baize-info-programming-language-table' },
        { label: '时区对照表', click: 'baize-info-timezone-table' },
        { label: '国家代码对照表', click: 'baize-info-country-code-table' },
        { label: '语言代码对照表', click: 'baize-info-language-code-table' },
        { label: '货币代码对照表', click: 'baize-info-currency-code-table' },
        { label: '颜色代码对照表', click: 'baize-info-color-code-table' },
        { label: 'Emoji对照表', click: 'baize-info-emoji-table' },
        { label: '文件大小对照表', click: 'baize-info-file-size-table' },
        { label: '网络端口对照表', click: 'baize-info-network-port-table' }
    ]
}

const infoScienceMenu: BaiZeMenuItem = {
    label: '科学符号对照表',
    submenu: [
        { label: '化学元素周期表', click: 'baize-info-periodic-table' },
        { label: '键盘快捷键对照表', click: 'baize-info-keyboard-shortcut-table' },
        { label: '数学符号对照表', click: 'baize-info-math-symbol-table' },
        { label: '物理常数对照表', click: 'baize-info-physical-constant-table' },
        { label: '罗马数字对照表', click: 'baize-info-roman-numeral-table' },
        { label: '数字系统对照表', click: 'baize-info-number-system-table' }
    ]
}

const infoCmdMenu: BaiZeMenuItem = {
    label: '数据和命令对照表',
    submenu: [
        { label: 'SQL数据类型对照表', click: 'baize-info-sql-data-type-table' },
        { label: 'JSON数据类型对照表', click: 'baize-info-json-data-type-table' },
        { label: 'XML实体对照表', click: 'baize-info-xml-entity-table' },
        { label: 'CSS单位对照表', click: 'baize-info-css-unit-table' },
        { label: 'HTTP方法对照表', click: 'baize-info-http-method-table' },
        { label: 'HTTP头部对照表', click: 'baize-info-http-header-table' },
        { label: 'Git命令对照表', click: 'baize-info-git-command-table' },
        { label: 'NPM命令对照表', click: 'baize-info-npm-command-table' },
        { label: 'Linux命令对照表', click: 'baize-info-linux-command-table' },
        { label: 'Windows命令对照表', click: 'baize-info-windows-command-table' }
    ]
}

const infoCodeDefMenu: BaiZeMenuItem = {
    label: '语法关键字对照表',
    submenu: [
        { label: '正则表达式语法对照表', click: 'baize-info-regex-syntax-table' },
        { label: 'Markdown语法对照表', click: 'baize-info-markdown-syntax-table' },
        { label: 'LaTeX语法对照表', click: 'baize-info-latex-syntax-table' },
        { label: 'HTML标签对照表', click: 'baize-info-html-tag-table' },
        { label: 'CSS属性对照表', click: 'baize-info-css-property-table' },
        { label: 'JavaScript关键字对照表', click: 'baize-info-javascript-keyword-table' },
        { label: 'Python关键字对照表', click: 'baize-info-python-keyword-table' },
        { label: 'Java关键字对照表', click: 'baize-info-java-keyword-table' },
        { label: 'C++关键字对照表', click: 'baize-info-cpp-keyword-table' },
        { label: 'Go关键字对照表', click: 'baize-info-go-keyword-table' },
        { label: 'Rust关键字对照表', click: 'baize-info-rust-keyword-table' },
        { label: 'TypeScript关键字对照表', click: 'baize-info-typescript-keyword-table' },
        { label: 'PHP关键字对照表', click: 'baize-info-php-keyword-table' },
        { label: 'Ruby关键字对照表', click: 'baize-info-ruby-keyword-table' },
        { label: 'Swift关键字对照表', click: 'baize-info-swift-keyword-table' },
        { label: 'Kotlin关键字对照表', click: 'baize-info-kotlin-keyword-table' },
        { label: 'SQL关键字对照表', click: 'baize-info-sql-keyword-table' },
        { label: 'Shell关键字对照表', click: 'baize-info-shell-keyword-table' },
        { label: 'PowerShell关键字对照表', click: 'baize-info-powershell-keyword-table' },
        { label: 'Docker命令对照表', click: 'baize-info-docker-command-table' },
        { label: 'Kubernetes命令对照表', click: 'baize-info-kubernetes-command-table' }
    ]
}

const informationMenu: BaiZeMenuItem = {
    label: '常用对照表',
    submenu: [
        infoDiffMenu, // 常用对照表
        infoCodeDefMenu,
        infoCmdMenu,
        infoScienceMenu,
        { label: 'Unicode编码表', click: 'baize-info-unicode-table' },
        { label: 'HTML实体编码表', click: 'baize-info-html-entity-table' },
        { label: 'MIME类型表', click: 'baize-info-mime-type-table' },
        { label: 'HTTP状态码表', click: 'baize-info-http-status-table' },
    ]
}

const pluginsMenu: BaiZeMenuItem = {
    label: '插件',
    submenu: [
        encryptMenu,
        convertMenu,
        networkMenu,
        informationMenu
    ]
}

// 在线工具菜单
const onlineMenu: BaiZeMenuItem = {
    label: '在线工具',
    submenu: [
        {label: '菜鸟工具', click: 'baize-online-cainiao-tools'},
        {label: 'W3CSchool工具', click: 'baize-online-w3cschool-tools'},
        {label: '百宝箱', click: 'baize-online-baibaoxiang'},
        {label: 'ToolFK', click: 'baize-online-toolfk'},
        {label: 'JSON工具箱BeJson', click: 'baize-online-json-bejson'},
        {label: '即时工具67tool', click: 'baize-online-67tool'},
        {label: '在线工具ToolLu', click: 'baize-online-toollu'},
        {label: 'SoJSON在线解析', click: 'baize-online-sojson-parser'},
        {label: 'Latex公式编辑器', click: 'baize-online-latex-editor'},
        {label: 'Mermaid在线编辑器', click: 'baize-online-mermaid-editor'},
        {label: 'PlantText编辑器', click: 'baize-online-planttext-editor'},
        {label: '在线思维导图工具', click: 'baize-online-mindmap-tool'},
        {label: '在线流程图绘制', click: 'baize-online-diagrams-tool'},
        {label: 'PlantUml 网页服务器', click: 'baize-online-plantuml-server'},
        {label: '锤子在线工具网', click: 'baize-online-chuizi-tools'}
    ]
}

// 快速链接菜单
const quickLinkMenu: BaiZeMenuItem = {
    label: '快速链接',
    submenu: [
        {
            label: '菜鸟在线工具',
            submenu: [
                {label: '菜鸟SVG图片编辑器', click: 'baize-online-cainiao-svg-editor'},
                {label: '菜鸟绘图工具', click: 'baize-online-cainiao-draw-tool'},
                {label: '菜鸟在线办公工具大全', click: 'baize-online-cainiao-office-tools'},
                {label: '菜鸟在线表格生成', click: 'baize-online-cainiao-table-generator'}
            ]
        },
        {
            label: '编程狮在线工具',
            submenu: [
                {label: 'CSV转HTML', click: 'baize-online-csv-to-html'},
                {label: 'SQL格式化', click: 'baize-online-sql-formatter'},
                {label: '全角/半角转换工具', click: 'baize-online-fullwidth-halfwidth-converter'}
            ]
        },
        {
            label: '在线编解码工具',
            submenu: [
                {label: '二维码在线生成工具', click: 'baize-online-qrcode-generator'},
                {label: '二维码在线解码', click: 'baize-online-qrcode-decoder'},
                {label: '在线编码转换', click: 'baize-online-encoding-converter'}
            ]
        },
        {
            label: '在线IDE编辑器',
            submenu: [
                {label: 'WebIDE Online', click: 'baize-online-webide-online'},
                {label: 'HTML语言', click: 'baize-online-html-lang'},
                {label: 'Python语言', click: 'baize-online-python-lang'},
                {label: 'C语言', click: 'baize-online-c-lang'},
                {label: 'Go语言', click: 'baize-online-go-lang'}
            ]
        },
        {
            label: '开发者工具',
            submenu: [
                {label: '漂亮二维码生成', click: 'baize-online-pretty-qrcode-generator'},
                {label: '二维码解码器', click: 'baize-online-qrcode-decoder-box3'},
                {label: '图片格式转换', click: 'baize-online-image-format-converter'},
                {label: 'Linux Crontab', click: 'baize-online-linux-crontab'},
                {label: 'JWT在线解码', click: 'baize-online-jwt-decoder'}
            ]
        },
        {
            label: '国内知名前端团队',
            submenu: [
                {label: '淘系前端团队（FED）', click: 'baize-online-taobao-fed'},
                {label: '天猫前端', click: 'baize-online-tmall-fe'},
                {label: 'THX from Alimama FE', click: 'baize-online-thx-alimama-fe'},
                {label: '阿里Node.js 性能平台', click: 'baize-online-ali-nodejs-platform'},
                {label: '百度 FEX', click: 'baize-online-baidu-fex'}
            ]
        },
        {
            label: '云计算平台',
            submenu: [
                {label: '阿里云', click: 'baize-online-aliyun'},
                {label: '腾讯云', click: 'baize-online-tencent-cloud'},
                {label: '华为云', click: 'baize-online-huawei-cloud'},
                {label: '天翼云', click: 'baize-online-tianyi-cloud'},
                {label: '金山云', click: 'baize-online-jinshan-cloud'}
            ]
        }
    ]
}

const gitHubMenu: BaiZeMenuItem = {
    label: 'GitHub',
    submenu: [
        {label: 'IT TOOLS 助力开发人员和IT工作者', click: 'baize-online-it-tools'},
        {label: 'Ghost 个人网站搭建', click: 'baize-online-ghost-website'},
        {label: 'Priospace - 集大成的效率工具', click: 'baize-online-priospace'},
        {label: 'Plane - 开发者友好的项目管理神器', click: 'baize-online-plane-project'},
        {label: 'OpenProject - 功能强大的企业级项目管理', click: 'baize-online-openproject'}
    ]
}


const helpMenu: BaiZeMenuItem = {
    label: '帮助',
    submenu: [
        { label: '版本发布', click: 'baize-help-release-notes' },
        { label: '修改日志', click: 'baize-help-change-log' },
        { type: 'separator' },
        { label: '键盘快捷方式', click: 'baize-help-shortkeys' },
        { label: '使用文档', click: 'baize-help-usage' },
        { label: '提交创意/意见', click: 'baize-help-issues' },
        { type: 'separator' },
        { label: '技术栈', click: 'baize-help-tech-stack' },
        { label: '关于', click: 'baize-help-about' },
        { label: '主页', click: 'baize-help-home' },
        { type: 'separator' },
        { label: '检查更新', click: 'baize-help-update' },
        { label: '联系我们', click: 'baize-help-contact-us' },
    ]
}

export const menuMap = ref<BaiZeMenuItem[]>([
    fileMenu, // 文件
    editMenu, // 编辑
    viewMenu, // 视图
    codingMenu, // 编码
    insertMenu,
    settingMenu,
    toolsMenu,
    pluginsMenu,
    onlineMenu,
    quickLinkMenu,
    gitHubMenu,
    helpMenu
])
