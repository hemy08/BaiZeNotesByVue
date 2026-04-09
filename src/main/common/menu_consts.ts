
const CHANNEL_PLUGIN_TOOL_SHOW = 'plugin-tools-show'

const OnlineToolMaps = [
    // ==================== 在线工具 ====================
    {id: 'baize:menu:online:tools:cainiao-tools', label: '菜鸟工具', url: 'https://www.jyshare.com/'},
    {id: 'baize:menu:online:tools:w3cschool-tools', label: 'W3CSchool工具', url: 'https://tools.w3cschool.cn/'},
    {id: 'baize:menu:online:tools:baibaoxiang', label: '百宝箱', url: 'https://www.box3.cn/#'},
    {id: 'baize:menu:online:tools:toolfk', label: 'ToolFK', url: 'https://www.toolfk.com/'},
    {id: 'baize:menu:online:tools:json-bejson', label: 'JSON工具箱BeJson', url: 'https://www.bejson.com/'},
    {id: 'baize:menu:online:tools:67tool', label: '即时工具67tool', url: 'https://www.67tool.com/'},
    {id: 'baize:menu:online:tools:toollu', label: '在线工具ToolLu', url: 'https://tool.lu/'},
    {id: 'baize:menu:online:tools:sojson-parser', label: 'SoJSON在线解析', url: 'https://www.sojson.com/jshtml.html'},
    {id: 'baize:menu:online:tools:latex-editor', label: 'Latex公式编辑器', url: 'https://www.latexlive.com/'},
    {id: 'baize:menu:online:tools:mermaid-editor', label: 'Mermaid在线编辑器', url: 'https://mermaid.live/edit'},
    {id: 'baize:menu:online:tools:planttext-editor', label: 'PlantText编辑器', url: 'https://www.planttext.com/'},
    {id: 'baize:menu:online:tools:mindmap-tool', label: '在线思维导图工具', url: 'https://www.mindline.cn/webapp'},
    {id: 'baize:menu:online:tools:diagrams-tool', label: '在线流程图绘制', url: 'https://app.diagrams.net/'},
    {id: 'baize:menu:online:tools:plantuml-server', label: 'PlantUml 网页服务器', url: 'http://www.plantuml.com/plantuml/uml/'},
    {id: 'baize:menu:online:tools:chuizi-tools', label: '锤子在线工具网', url: 'https://www.toolhelper.cn/'},
]

const CaiNiaoUrlMaps = [
    // ==================== 菜鸟在线工具 ====================
    {id: 'baize:menu:online:cainiao:svg-editor', label: '菜鸟SVG图片编辑器', url: 'https://www.jyshare.com/more/svgeditor/'},
    {id: 'baize:menu:online:cainiao:draw-tool', label: '菜鸟绘图工具', url: 'https://www.jyshare.com/more/shapefly-diagram/'},
    {id: 'baize:menu:online:cainiao:office-tools', label: '菜鸟在线办公工具大全', url: 'https://www.jyshare.com/office/'},
    {id: 'baize:menu:online:cainiao:table-generator', label: '菜鸟在线表格生成', url: 'https://www.jyshare.com/front-end/7688/'},
]

const W3SchoolUrlMaps = [
    // ==================== 编程狮在线工具 ====================
    {id: 'baize:menu:online:encode:csv-to-html', label: 'CSV转HTML', url: 'https://www.w3cschool.cn/tools/index?name=csv2tb'},
    {id: 'baize:menu:online:encode:sql-formatter', label: 'SQL格式化', url: 'https://www.w3cschool.cn/tools/index?name=sql_formatter'},
    {id: 'baize:menu:online:encode:fullwidth-halfwidth-converter', label: '全角/半角转换工具', url: 'https://www.w3cschool.cn/tools/index?name=fullhalfcode'},
]

const EncDecUrlMaps = [
    // ==================== 在线编解码工具 ====================
    {id: 'baize:menu:online:encode:qrcode-generator', label: '二维码在线生成工具', url: 'https://www.w3cschool.cn/tools/index?name=qrcode'},
    {id: 'baize:menu:online:encode:qrcode-decoder', label: '二维码在线解码', url: 'https://www.w3cschool.cn/tools/index?name=qrdecode'},
    {id: 'baize:menu:online:encode:encoding-converter', label: '在线编码转换', url: 'https://www.w3cschool.cn/tools/index?name=urlencode_decode'},
]

const IdeUrlMaps = [
    // ==================== 在线IDE编辑器 ====================
    {id: 'baize:menu:online:ide:webide-online', label: 'WebIDE Online', url: 'https://www.w3cschool.cn/webide'},
    {id: 'baize:menu:online:ide:html-lang', label: 'HTML语言', url: 'https://www.w3cschool.cn/tryrun/runcode?lang=html'},
    {id: 'baize:menu:online:ide:python-lang', label: 'Python语言', url: 'https://www.w3cschool.cn/tryrun/runcode?lang=python3'},
    {id: 'baize:menu:online:ide:c-lang', label: 'C语言', url: 'https://www.w3cschool.cn/tryrun/runcode?lang=c-clang'},
    {id: 'baize:menu:online:ide:go-lang', label: 'Go语言', url: 'https://www.w3cschool.cn/tryrun/runcode?lang=go'},
]

const DevelopUrlMaps = [
    // ==================== 开发者工具 ====================
    {id: 'baize:menu:online:dev:pretty-qrcode-generator', label: '漂亮二维码生成', url: 'https://tool.box3.cn/qrcode.html'},
    {id: 'baize:menu:online:dev:qrcode-decoder-box3', label: '二维码解码器', url: 'https://www.box3.cn/tool/qrcode/decode.html'},
    {id: 'baize:menu:online:dev:image-format-converter', label: '图片格式转换', url: 'https://www.box3.cn/tool/img/convert.html'},
    {id: 'baize:menu:online:dev:linux-crontab', label: 'Linux Crontab', url: 'https://tool.box3.cn/crontab.html'},
    {id: 'baize:menu:online:dev:jwt-decoder', label: 'JWT在线解码', url: 'https://tool.box3.cn/jwt.html'},
]

const TeamUrlMaps = [
    // ==================== 国内知名前端团队 ====================
    {id: 'baize:menu:online:team:taobao-fed', label: '淘系前端团队（FED）', url: 'https://fed.taobao.org/'},
    {id: 'baize:menu:online:team:tmall-fe', label: '天猫前端', url: 'https://tmallfe.github.io/'},
    {id: 'baize:menu:online:team:thx-alimama-fe', label: 'THX from Alimama FE', url: 'https://thx.github.io/'},
    {id: 'baize:menu:online:team:ali-nodejs-platform', label: '阿里Node.js 性能平台', url: 'https://www.aliyun.com/product/nodejs'},
    {id: 'baize:menu:online:team:baidu-fex', label: '百度 FEX', url: 'https://fex-team.github.io/'},
]

const CloudUrlMaps = [
    // ==================== 云计算平台 ====================
    {id: 'baize:menu:online:cloud:aliyun', label: '阿里云', url: 'https://www.aliyun.com/'},
    {id: 'baize:menu:online:cloud:tencent-cloud', label: '腾讯云', url: 'https://cloud.tencent.com/'},
    {id: 'baize:menu:online:cloud:huawei-cloud', label: '华为云', url: 'https://activity.huaweicloud.com/'},
    {id: 'baize:menu:online:cloud:tianyi-cloud', label: '天翼云', url: 'https://www.ctyun.cn/'},
    {id: 'baize:menu:online:cloud:jinshan-cloud', label: '金山云', url: 'https://www.ksyun.com/'},
]

const GitHubUrlMaps = [
    // ==================== GitHub 开源项目 ====================
    {id: 'baize:menu:github:it-tools', label:'IT TOOLS 助力开发人员和IT工作者', url: 'https://it-tools.tech/'},
    {id: 'baize:menu:github:ghost-website', label:'Ghost 个人网站搭建', url: 'https://ghost.org/'},
    {id: 'baize:menu:github:priospace', label:'Priospace - 集大成的效率工具', url: 'https://github.com/AnoyRC/priospace'},
    {id: 'baize:menu:github:plane-project', label:'Plane - 开发者友好的项目管理神器', url: 'https://github.com/makeplane/plane'},
    {id: 'baize:menu:github:openproject', label:'OpenProject - 功能强大的企业级项目管理', url: 'https://github.com/opf/openproject'}
]

const OnlineUrlMaps = [
    ...OnlineToolMaps,...CaiNiaoUrlMaps, ...W3SchoolUrlMaps, ...EncDecUrlMaps,
    ...IdeUrlMaps,...DevelopUrlMaps,...TeamUrlMaps,...CloudUrlMaps,...GitHubUrlMaps]


// 加解密插件菜单
const PluginGeneratorMaps = [
    { label: 'Token Generator', menu_action: 'baize:menu:plugins:encrypt:token-generator' },
    { label: 'Hash Text', menu_action: 'baize:menu:plugins:encrypt:hash-text' },
    { label: 'UUIDs 生成器', menu_action: 'baize:menu:plugins:encrypt:uuids-generator' },
    { label: 'ULID 生成器', menu_action: 'baize:menu:plugins:encrypt:ulid-generator' },
    { label: '加密/解密文本', menu_action: 'baize:menu:plugins:encrypt:encrypt-decrypt' },
    { label: 'Crypto加密/解密文本', menu_action: 'baize:menu:plugins:encrypt:crypto-encrypt-decrypt' },
    { label: 'Hmac 生成器', menu_action: 'baize:menu:plugins:encrypt:hmac-generator' },
    { label: 'RSA密钥对生成器', menu_action: 'baize:menu:plugins:encrypt:rsa-generator' }
]

// 转换器菜单
const PluginCodeConvertMaps = [
    { label: '日期时间转换器', menu_action: 'baize:menu:plugins:convert:date-converter' },
    { label: '整数基转换器', menu_action: 'baize:menu:plugins:convert:base-converter' },
    { label: '罗马数字转换器', menu_action: 'baize:menu:plugins:convert:roman-numeral-converter' },
    { label: 'Color 选择器', menu_action: 'baize:menu:plugins:convert:color-converter' },
    //{ label: '数值转换器', menu_action: 'baize:menu:plugins:convert:number-converter' },
    //{ label: '单位转换器', menu_action: 'baize:menu:plugins:convert:unit-converter' },
    //{ label: '字符串转换器', menu_action: 'baize:menu:plugins:convert:string-converter' },
    //{ label: 'URL编码/解码', menu_action: 'baize:menu:plugins:convert:url-encode-decode' },
    //{ label: 'HTML实体编码/解码', menu_action: 'baize:menu:plugins:convert:html-entity-encode-decode' },
    //{ label: 'Base64字符串编码/解码', menu_action: 'baize:menu:plugins:convert:base64-string-encode-decode' },
    //{ label: 'Base64文件编码/解码', menu_action: 'baize:menu:plugins:convert:base64-file-encode-decode' },
    //{ label: 'JWT解码器', menu_action: 'baize:menu:plugins:convert:jwt-decoder' },
    //{ label: 'Gzip压缩/解压', menu_action: 'baize:menu:plugins:convert:gzip-compress-decompress' },
]

const PluginFormatMaps = [
    { label: 'JSON格式化', menu_action: 'baize:menu:plugins:convert:json-formater' },
    { label: 'YAML格式化', menu_action: 'baize:menu:plugins:convert:yaml-formatter' },
    //{ label: 'TOML格式化', menu_action: 'baize:menu:plugins:convert:toml-formatter' },
    //{ label: 'CSV格式化', menu_action: 'baize:menu:plugins:convert:csv-formatter' },
    { label: 'XML格式化', menu_action: 'baize:menu:plugins:convert:xml-formatter' },
    { label: 'SQL格式化', menu_action: 'baize:menu:plugins:convert:sql-formatter' },
    { label: 'HTML格式化', menu_action: 'baize:menu:plugins:convert:html-formatter' },
]

const PluginConvertMaps = [
    { label: 'JSON转CSV', menu_action: 'baize:menu:plugins:convert:json-to-csv' },
    //{ label: 'JSON转YAML', menu_action: 'baize:menu:plugins:convert:json-to-yaml' },
    { label: 'JSON转TOML', menu_action: 'baize:menu:plugins:convert:json-to-toml' },
    { label: 'YAML转JSON', menu_action: 'baize:menu:plugins:convert:yaml-to-json' },
    { label: 'YAML转TOML', menu_action: 'baize:menu:plugins:convert:yaml-to-toml' },
    //{ label: 'TOML转JSON', menu_action: 'baize:menu:plugins:convert:toml-to-json' },
    //{ label: 'TOML转YAML', menu_action: 'baize:menu:plugins:convert:toml-to-yaml' },
    { label: '文本到 ASCII 二进制', menu_action: 'baize:menu:plugins:convert:text-to-binary' },
    { label: '文本转 Unicode', menu_action: 'baize:menu:plugins:convert:text-to-unicode' },
]

const PluginUpLowerMaps = [
    //{ label: 'Pascal大小写转换', menu_action: 'baize:menu:plugins:convert:pascal-case' },
    //{ label: 'Camel大小写转换', menu_action: 'baize:menu:plugins:convert:camel-case' },
    //{ label: 'Snake大小写转换', menu_action: 'baize:menu:plugins:convert:snake-case' },
    //{ label: 'Kebab大小写转换', menu_action: 'baize:menu:plugins:convert:kebab-case' },
    //{ label: '常量大小写转换', menu_action: 'baize:menu:plugins:convert:constant-case' },
    //{ label: 'Dot大小写转换', menu_action: 'baize:menu:plugins:convert:dot-case' },
    //{ label: 'Path大小写转换', menu_action: 'baize:menu:plugins:convert:path-case' },
    //{ label: 'Space大小写转换', menu_action: 'baize:menu:plugins:convert:space-case' },
    //{ label: 'Capital大小写转换', menu_action: 'baize:menu:plugins:convert:capital-case' },
    //{ label: 'Header大小写转换', menu_action: 'baize:menu:plugins:convert:header-case' },
    //{ label: 'Lower大小写转换', menu_action: 'baize:menu:plugins:convert:lower-case' },
    //{ label: 'Upper大小写转换', menu_action: 'baize:menu:plugins:convert:upper-case' }
]

// 网络计算插件菜单
const PluginNetAddrs = [
    {label: 'IPv4子网计算器', menu_action: 'baize:menu:plugins:net:ipv4-subnet-calculator'},
    {label: 'IPv4地址转换器', menu_action: 'baize:menu:plugins:net:ipv4-address-converter'},
    //{label: 'IPv6子网计算器', menu_action: 'baize:menu:plugins:net:ipv6-subnet-calculator'},
    //{label: 'IPv6地址转换器', menu_action: 'baize:menu:plugins:net:ipv6-address-converter'},
    //{label: 'IP范围扩展', menu_action: 'baize:menu:plugins:net:ip-range-expand'},
    {label: 'MAC地址查找器', menu_action: 'baize:menu:plugins:net:mac-address-lookup'},
    {label: 'MAC地址生成器', menu_action: 'baize:menu:plugins:net:mac-address-generator'},
    //{ label: '设备信息', menu_action: 'baize:menu:plugins:net:device-information' },
    //{ label: '浏览器信息', menu_action: 'baize:menu:plugins:net:browser-information' },
    //{ label: '网络配置信息', menu_action: 'baize:menu:plugins:net:network-configuration' }
]

const PluginNetGenerators = [
    //{ label: 'User-Agent解析器', menu_action: 'baize:menu:plugins:net:user-agent-parser' },
    //{ label: 'URL解析器', menu_action: 'baize:menu:plugins:net:url-parser' },
    //{ label: 'SSL证书解析器', menu_action: 'baize:menu:plugins:net:ssl-certificate-parser' },
    //{ label: 'Hash文本', menu_action: 'baize:menu:plugins:net:hash-text' },
    //{ label: 'Bcrypt', menu_action: 'baize:menu:plugins:net:bcrypt' },
    { label: '二维码生成器', menu_action: 'baize:menu:plugins:net:qr-code-generator' },
    { label: 'WiFi二维码生成器', menu_action: 'baize:menu:plugins:net:wifi-qr-code-generator' },
    //{ label: 'EUI-64计算器', menu_action: 'baize:menu:plugins:net:eui-64-calculator' },
    //{ label: '用户代理解析器', menu_action: 'baize:menu:plugins:net:user-agent-parser' }
]

const PluginNetWork = [
    //{ label: 'HTTP状态码', menu_action: 'baize:menu:plugins:net:http-status-codes' },
    //{ label: 'MIME类型', menu_action: 'baize:menu:plugins:net:mime-types' },
    //{ label: 'DNS查询', menu_action: 'baize:menu:plugins:net:dns-lookup' },
    //{ label: 'Ping', menu_action: 'baize:menu:plugins:net:ping' },
    //{ label: '端口扫描器', menu_action: 'baize:menu:plugins:net:port-scanner' },
    //{ label: 'Whois查询', menu_action: 'baize:menu:plugins:net:whois-lookup' },
    //{ label: '颜色转换器', menu_action: 'baize:menu:plugins:net:color-converter' },
    //{ label: 'IP地理位置', menu_action: 'baize:menu:plugins:net:ip-geolocation' },
    //{ label: 'EUI-64计算器', menu_action: 'baize:menu:plugins:net:eui-64-calculator' },
    //{ label: 'Unicode转换器', menu_action: 'baize:menu:plugins:net:unicode-converter' },
    //{ label: 'Slugify字符串', menu_action: 'baize:menu:plugins:net:slugify-string' },
    //{ label: 'HTTP请求构建器', menu_action: 'baize:menu:plugins:net:http-request-builder' },
    //{ label: 'IPv6 ULA生成器', menu_action: 'baize:menu:plugins:net:ipv6-ula-generator' },
    //{ label: '子网掩码对照表', menu_action: 'baize:menu:plugins:net:subnet-mask-map-table' },
]

// 常用对照表菜单
const PluginInfoNormal =[
    { label: 'ASCII码对照表', menu_action: 'baize:menu:plugins:info:ascii-table' },
    { label: '文件扩展名对照表', menu_action: 'baize:menu:plugins:info:file-extension-table' },
    //{ label: '编程语言对照表', menu_action: 'baize:menu:plugins:info:programming-language-table' },
    //{ label: '时区对照表', menu_action: 'baize:menu:plugins:info:timezone-table' },
    //{ label: '国家代码对照表', menu_action: 'baize:menu:plugins:info:country-code-table' },
    //{ label: '语言代码对照表', menu_action: 'baize:menu:plugins:info:language-code-table' },
    //{ label: '货币代码对照表', menu_action: 'baize:menu:plugins:info:currency-code-table' },
    //{ label: '颜色代码对照表', menu_action: 'baize:menu:plugins:info:color-code-table' },
    //{ label: 'Emoji对照表', menu_action: 'baize:menu:plugins:info:emoji-table' },
    //{ label: '文件大小对照表', menu_action: 'baize:menu:plugins:info:file-size-table' },
    //{ label: '网络端口对照表', menu_action: 'baize:menu:plugins:info:network-port-table' },
    //{ label: '数字大小写', menu_action: 'baize:menu:plugins:info:numeric-case-table' },
    //{ label: '常用字体对照', menu_action: 'baize:menu:plugins:info:normal-font-style-table' },
    { label: '文件类型（MIME头）', menu_action: 'baize:menu:plugins:info:file-name-extension-table' },
    { label: '希腊字母对照', menu_action: 'baize:menu:plugins:info:greece-letter-table' },
    { label: 'HTML实体编码表', menu_action: 'baize:menu:plugins:info:html-entity-table' },
]

const PluginInfoScience =[
    //{ label: '化学元素周期表', menu_action: 'baize:menu:plugins:info:periodic-table' },
    //{ label: '键盘快捷键对照表', menu_action: 'baize:menu:plugins:info:keyboard-shortcut-table' },
    { label: '数学符号对照表', menu_action: 'baize:menu:plugins:info:math-symbol-table' },
    { label: '物理常数对照表', menu_action: 'baize:menu:plugins:info:physical-constant-table' },
    //{ label: '罗马数字对照表', menu_action: 'baize:menu:plugins:info:roman-numeral-table' },
    //{ label: '数字系统对照表', menu_action: 'baize:menu:plugins:info:number-system-table' }
]

const PluginInfoCmd =[
    //{ label: 'SQL数据类型对照表', menu_action: 'baize:menu:plugins:info:sql-data-type-table' },
    //{ label: 'JSON数据类型对照表', menu_action: 'baize:menu:plugins:info:json-data-type-table' },
    //{ label: 'XML实体对照表', menu_action: 'baize:menu:plugins:info:xml-entity-table' },
    //{ label: 'CSS单位对照表', menu_action: 'baize:menu:plugins:info:css-unit-table' },
    //{ label: 'HTTP方法对照表', menu_action: 'baize:menu:plugins:info:http-method-table' },
    //{ label: 'HTTP头部对照表', menu_action: 'baize:menu:plugins:info:http-header-table' },
    //{ label: 'Git命令对照表', menu_action: 'baize:menu:plugins:info:git-command-table' },
    //{ label: 'NPM命令对照表', menu_action: 'baize:menu:plugins:info:npm-command-table' },
    { label: 'Linux命令对照表', menu_action: 'baize:menu:plugins:info:linux-command-table' },
    //{ label: 'Windows命令对照表', menu_action: 'baize:menu:plugins:info:windows-command-table' }
]

const PluginCodeDef =[
    //{ label: '正则表达式语法对照表', menu_action: 'baize:menu:plugins:info:regex-syntax-table' },
    //{ label: 'Markdown语法对照表', menu_action: 'baize:menu:plugins:info:markdown-syntax-table' },
    //{ label: 'LaTeX语法对照表', menu_action: 'baize:menu:plugins:info:latex-syntax-table' },
    //{ label: 'HTML标签对照表', menu_action: 'baize:menu:plugins:info:html-tag-table' },
    //{ label: 'CSS属性对照表', menu_action: 'baize:menu:plugins:info:css-property-table' },
    //{ label: 'JavaScript关键字对照表', menu_action: 'baize:menu:plugins:info:javascript-keyword-table' },
    //{ label: 'Python关键字对照表', menu_action: 'baize:menu:plugins:info:python-keyword-table' },
    //{ label: 'Java关键字对照表', menu_action: 'baize:menu:plugins:info:java-keyword-table' },
    { label: 'C++关键字对照表', menu_action: 'baize:menu:plugins:info:cpp-keyword-table' },
    { label: 'Go关键字对照表', menu_action: 'baize:menu:plugins:info:go-keyword-table' },
    //{ label: 'Rust关键字对照表', menu_action: 'baize:menu:plugins:info:rust-keyword-table' },
    //{ label: 'TypeScript关键字对照表', menu_action: 'baize:menu:plugins:info:typescript-keyword-table' },
    //{ label: 'PHP关键字对照表', menu_action: 'baize:menu:plugins:info:php-keyword-table' },
    //{ label: 'Ruby关键字对照表', menu_action: 'baize:menu:plugins:info:ruby-keyword-table' },
    //{ label: 'Swift关键字对照表', menu_action: 'baize:menu:plugins:info:swift-keyword-table' },
    //{ label: 'Kotlin关键字对照表', menu_action: 'baize:menu:plugins:info:kotlin-keyword-table' },
    //{ label: 'SQL关键字对照表', menu_action: 'baize:menu:plugins:info:sql-keyword-table' },
    //{ label: 'Shell关键字对照表', menu_action: 'baize:menu:plugins:info:shell-keyword-table' },
    //{ label: 'PowerShell关键字对照表', menu_action: 'baize:menu:plugins:info:powershell-keyword-table' },
    //{ label: 'Docker命令对照表', menu_action: 'baize:menu:plugins:info:docker-command-table' },
    //{ label: 'Kubernetes命令对照表', menu_action: 'baize:menu:plugins:info:kubernetes-command-table' }
]

export {
    CHANNEL_PLUGIN_TOOL_SHOW,
    OnlineToolMaps, CaiNiaoUrlMaps, W3SchoolUrlMaps, EncDecUrlMaps,
    IdeUrlMaps, DevelopUrlMaps, TeamUrlMaps, CloudUrlMaps, GitHubUrlMaps,
    OnlineUrlMaps, PluginGeneratorMaps, PluginCodeConvertMaps, PluginFormatMaps,
    PluginConvertMaps, PluginUpLowerMaps, PluginNetAddrs, PluginNetGenerators,
    PluginNetWork, PluginInfoNormal, PluginInfoScience, PluginInfoCmd, PluginCodeDef
}
