import { mermaid, plantuml, textblock, writing } from '../templates/templates'

export const Mermaid: MenuContext[] = [
  { label: '基础框架', context: '\n```mermaid\n\n```\n\n' },
  { label: 'flowchart', context: mermaid.flowchart },
  { label: 'BlockDiagram', context: mermaid.blockDiagram },
  { label: 'C4图', context: mermaid.C4Context },
  { label: '类图', context: mermaid.classDiagram },
  { label: '实体关系图', context: mermaid.erDiagram },
  { label: '甘特图', context: mermaid.gantt },
  { label: 'Git图', context: mermaid.gitGraph },
  { label: '基本流程图', context: mermaid.graph },
  { label: '用户旅程图', context: mermaid.journey },
  { label: '思维导图', context: mermaid.mindmap },
  { label: 'Packet', context: mermaid.packet },
  { label: '饼图', context: mermaid.pie },
  { label: '象限图', context: mermaid.quadrantChart },
  { label: '需求图', context: mermaid.requirementDiagram },
  { label: '桑基图', context: mermaid.sankey },
  { label: '序列图', context: mermaid.sequenceDiagram },
  { label: '状态图', context: mermaid.stateDiagram },
  { label: '时间线图', context: mermaid.timeline },
  { label: 'XYChart', context: mermaid.xychart },
  { label: 'Zenuml', context: mermaid.zenuml }
]

export const PlantUML: MenuContext[] = [
  { label: '基础框架', context: '\n```plantuml\n@startuml\n\n@enduml\n```\n\n' },
  { label: '活动图', context: plantuml.ActivityDiagram },
  { label: '规范和描述语言（SDL）', context: plantuml.ActivityDiagram },
  { label: '架构图', context: plantuml.ArchimateDiagram },
  { label: 'AsciiMath', context: plantuml.AsciiMath },
  { label: '类图', context: plantuml.ClassDiagram },
  { label: '组件图', context: plantuml.ComponentDiagram },
  { label: '部署图', context: plantuml.DeploymentDiagram },
  { label: 'Ditaa 图表', context: plantuml.DitaaDiagram },
  { label: '实体关系图', context: plantuml.EntityRelationship },
  { label: 'EBNF 图表', context: plantuml.ExtendedBackusNaurForm },
  { label: '甘特图', context: plantuml.GanttDiagram },
  { label: '信息工程图', context: plantuml.InformationEngineering },
  { label: 'JSON 数据', context: plantuml.JsonDiagram },
  { label: '思维导图', context: plantuml.MindmapDiagram },
  { label: '网络图', context: plantuml.nwdiag },
  { label: '对象图', context: plantuml.ObjectDiagram },
  { label: 'Regex 图表', context: plantuml.RegularExpression },
  { label: '用户界面模型', context: plantuml.salt },
  { label: '序列图', context: plantuml.SequenceDiagram },
  { label: '状态图', context: plantuml.StateDiagram },
  { label: '定时图', context: plantuml.TimingDiagram },
  { label: '用例图', context: plantuml.UseCaseDiagram },
  { label: 'WBS 图表', context: plantuml.WBSDiagram },
  { label: 'YAML 数据', context: plantuml.YamlDiagram }
]

export const TextBlock: MenuContext[] = [
  { label: '图片链接', context: textblock.image_links },
  { label: '折叠代码块', context: textblock.blockcode },
  { label: '有序链接列表', context: textblock.linksList },
  { label: '文章更新日期', context: textblock.getFmtData() }
]

export const Writing: MenuContext[] = [
  { label: '力扣题解模板', context: writing.leetcode_problem_solving },
  { label: '问题处理模板', context: writing.problemResolving },
  { label: '文章封面', context: writing.thesisTemplates },
  { label: '论文模板', context: writing.thesisCoverPage }
]

export const JYShare: MenuContext[] = [
  { label: '菜鸟SVG图片编辑器', context: 'https://www.jyshare.com/more/svgeditor/' },
  { label: '菜鸟绘图工具', context: 'https://www.jyshare.com/more/shapefly-diagram/' },
  { label: '菜鸟在线办公工具大全', context: 'https://www.jyshare.com/office/' },
  { label: '菜鸟在线表格生成', context: 'https://www.jyshare.com/front-end/7688/' }
]

export const W3School: MenuContext[] = [
  { label: 'CSV转HTML', context: 'https://www.w3cschool.cn/tools/index?name=csv2tb' },
  { label: 'SQL格式化', context: 'https://www.w3cschool.cn/tools/index?name=sql_formatter' },
  { label: '全角/半角转换工具', context: 'https://www.w3cschool.cn/tools/index?name=fullhalfcode' },
  { label: '常用对照表', context: 'https://www.w3cschool.cn/tools/index?name=checkList' },
  { label: 'YAML Lint', context: 'https://www.yamllint.com/' },
  { label: 'HTML在线验证', context: 'https://validator.w3.org/#validate_by_uri+with_options' },
  { label: '网络计算器', context: 'https://www.w3cschool.cn/tools/index?name=ipcalc' },
  { label: 'Excel/CSV转JSON', context: 'https://www.w3cschool.cn/tools/index?name=excel_col2json' },
  { label: 'XML JSON互转', context: 'https://www.w3cschool.cn/tools/index?name=xmljson' },
  { label: 'XML格式化工具', context: 'https://www.w3cschool.cn/tools/index?name=xmlformat' },
  { label: '文本美化排版', context: 'https://www.w3cschool.cn/tools/index?name=txt_paiban' },
  { label: 'HTML 拾色器', context: 'https://www.w3cschool.cn/tools/index?name=cpicker' },
  { label: 'ColorPicker', context: 'https://www.w3cschool.cn/tools/index?name=ColorPicker' },
  { label: 'WEB安全色查询', context: 'https://www.w3cschool.cn/tools/index?name=safe_color' }
]

export const EncodeDecode: MenuContext[] = [
  { label: '二维码在线生成工具', context: 'https://www.w3cschool.cn/tools/index?name=qrcode' },
  { label: '二维码在线解码', context: 'https://www.w3cschool.cn/tools/index?name=qrdecode' },
  { label: '在线编码转换', context: 'https://www.w3cschool.cn/tools/index?name=urlencode_decode' },
  { label: 'BASE64编解码', context: 'https://www.w3cschool.cn/tools/index?name=base64' },
  { label: 'UTF-8编码转换', context: 'https://www.w3cschool.cn/tools/index?name=convutf' },
  { label: 'Native/ASCII转换', context: 'https://www.w3cschool.cn/tools/index?name=native2ascii' },
  { label: 'Unicode/中文', context: 'https://www.w3cschool.cn/tools/index?name=unicode_chinese' },
  { label: '文件Hash计算', context: 'https://www.w3cschool.cn/tools/index?name=filehash' },
  { label: 'JSON格式化', context: 'https://www.w3cschool.cn/tools/index?name=jsonparse' },
  { label: 'Escape加密/解密', context: 'https://www.w3cschool.cn/tools/index?name=escapepwd' },
  { label: 'MD5在线加密', context: 'https://www.w3cschool.cn/tools/index?name=CreateMD5Password' },
  {
    label: '高强度密码生成',
    context: 'https://www.w3cschool.cn/tools/index?name=CreateStrongPassword'
  },
  { label: '摩尔斯密码', context: 'https://www.w3cschool.cn/tools/index?name=morse' },
  { label: '在线算法加密', context: 'https://www.w3cschool.cn/tools/index?name=hash_md5_sha' },
  { label: '生成htpasswd', context: 'https://www.w3cschool.cn/tools/index?name=htpasswd' },
  { label: 'URL网址16进制加密', context: 'https://www.w3cschool.cn/tools/index?name=urlencodepwd' },
  { label: '随机字符串生成', context: 'https://www.w3cschool.cn/tools/index?name=random' }
]

export const OnlineIDE: MenuContext[] = [
  { label: 'WebIDE Online', context: 'https://www.w3cschool.cn/webide' },
  { label: 'HTML语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=html' },
  { label: 'Python语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=python3' },
  { label: 'C语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=c-clang' },
  { label: 'Go语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=go' },
  { label: 'C++语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=cpp-gcc' },
  { label: 'Ruby语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=ruby' },
  { label: 'Lua语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=lua' },
  { label: 'C#语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=cs-mono' },
  { label: 'R语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=r' },
  { label: 'JavaScript语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=javascript' },
  { label: 'Pascal语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=fpc' },
  { label: 'AWK语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=awk' },
  { label: 'Emoji语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=emoji' },
  { label: 'NodeJs语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=javascript-node' },
  { label: 'TCL语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=tcl' },
  { label: 'TypeScript语言', context: 'https://www.w3cschool.cn/tryrun/runcode?lang=typescript' }
]

export const Links: MenuContext[] = [
  { label: '菜鸟工具', context: 'https://www.jyshare.com/' },
  { label: 'W3CSchool工具', context: 'https://tools.w3cschool.cn/' },
  { label: '百宝箱', context: 'https://www.box3.cn/#' },
  { label: 'ToolFK', context: 'https://www.toolfk.com/' },
  { label: 'JSON工具箱BeJson', context: 'https://www.bejson.com/' },
  { label: '即时工具67tool', context: 'https://www.67tool.com/' },
  { label: '在线工具ToolLu', context: 'https://tool.lu/' },
  { label: 'SoJSON在线解析', context: 'https://www.sojson.com/jshtml.html' },
  { label: 'Latex公式编辑器', context: 'https://www.latexlive.com/' },
  { label: 'Mermaid在线编辑器', context: 'https://mermaid.live/edit' },
  { label: 'PlantText编辑器', context: 'https://www.planttext.com/' },
  { label: '在线思维导图工具', context: 'https://www.mindline.cn/webapp' },
  { label: '在线流程图绘制', context: 'https://app.diagrams.net/' },
  { label: 'PlantUml 网页服务器', context: 'http://www.plantuml.com/plantuml/uml/' }
]

export const DevOpsTool: MenuContext[] = [
  { label: '漂亮二维码生成', context: 'https://tool.box3.cn/qrcode.html' },
  { label: '二维码解码器', context: 'https://www.box3.cn/tool/qrcode/decode.html' },
  { label: '图片格式转换', context: 'https://www.box3.cn/tool/img/convert.html' },
  { label: 'Linux Crontab', context: 'https://tool.box3.cn/crontab.html' },
  { label: 'JWT（JSON Web Tokens）在线解码', context: 'https://tool.box3.cn/jwt.html' },
  { label: 'Escape / UnEscape', context: 'https://tool.box3.cn/escape-unescape.html' },
  { label: '在线 AES-128,AES-256 加密', context: 'https://tool.box3.cn/aes-encrypt-128-256.html' },
  { label: '在线 AES-128,AES-256 解密', context: 'https://tool.box3.cn/aes-decrypt-128-256.html' },
  { label: '正则表达式在线测试', context: 'https://tool.box3.cn/regular.html' },
  { label: 'HTML/JS/CSS代码调试预览', context: 'https://tool.box3.cn/debug.html' },
  { label: '特殊符号大全', context: 'https://tool.box3.cn/teshufuhaodaquan.html' }
]

export const OpenWebTeam: MenuContext[] = [
  { label: '淘系前端团队（FED）', context: 'https://fed.taobao.org/' },
  { label: '天猫前端', context: 'https://tmallfe.github.io/' },
  { label: 'THX from Alimama FE', context: 'https://thx.github.io/' },
  { label: '阿里Node.js 性能平台', context: 'https://www.aliyun.com/product/nodejs' },
  { label: '百度 FEX', context: 'https://fex-team.github.io/' },
  { label: '腾讯前端 AlloyTeam', context: 'https://www.alloyteam.com/' },
  { label: '饿了么前端', context: 'https://www.zhihu.com/column/ElemeFE' },
  { label: '美团技术团队', context: 'https://tech.meituan.com/' },
  { label: '京东凹凸实验室', context: 'https://aotu.io/' },
  { label: '七牛技术团队', context: 'https://blog.qiniu.com/archives/all' },
  { label: '有赞技术团队', context: 'https://tech.youzan.com/' },
  { label: '奇舞团（奇虎360）', context: 'http://www.75team.com/' },
  { label: '去哪儿网大前端技术中心（YMFE）', context: 'https://ww1.ymfe.org/' },
  { label: '携程UED', context: 'http://ued.ctrip.com/' },
  { label: '蚂蚁体验科技', context: 'https://xcloud.alipay.com/' }
]

export const CloudCommunity: MenuContext[] = [
  { label: '阿里云', context: 'https://www.aliyun.com/' },
  { label: '腾讯云', context: 'https://cloud.tencent.com/' },
  { label: '华为云', context: 'https://activity.huaweicloud.com/' },
  { label: '天翼云', context: 'https://www.ctyun.cn/' },
  { label: '金山云', context: 'https://www.ksyun.com/' },
  { label: '百度智能云', context: 'https://cloud.baidu.com/' },
  { label: 'UCLOUD优刻得', context: 'https://www.ucloud.cn/' },
  { label: 'QingCloud青云科技', context: 'https://www.qingcloud.com/' },
  { label: '博云云计算', context: 'https://www.bocloud.com.cn/' },
  { label: 'Akamai阿卡迈', context: 'https://www.linode.com/' },
  { label: '网易云信', context: 'https://yunxin.163.com/' },
  { label: 'AWS 亚马逊', context: 'https://aws.amazon.com/cn/' },
  { label: 'Workday', context: 'http://workday.github.io/' },
  { label: '北京超级云计算中心', context: 'http://www.blsc.cn/' },
  { label: '微软Azure', context: 'https://azure.microsoft.com/zh-cn/' }
]

export const Encrypt: MenuContext[] = [
  { label: 'Token Generator', context: 'token-generator' },
  { label: 'Hash Text', context: 'hash-text' },
  { label: 'UUIDs 生成器', context: 'uuids-generator' },
  { label: 'ULID 生成器', context: 'ulid-generator' },
  { label: '加密/解密文本', context: 'encrypt-decrypt' },
  { label: 'Crypto加密/解密文本', context: 'crypto-encrypt-decrypt' },
  { label: 'Hmac 生成器', context: 'hmac-generator' },
  { label: 'RSA密钥对生成器', context: 'rsa-generator' }
]

export const Convert: MenuContext[] = [
  { label: '日期时间转换器', context: 'date-converter' },
  { label: '整数基转换器', context: 'base-converter' },
  { label: '罗马数字转换器', context: 'roman-numeral-converter' },
  { label: 'Color 选择器', context: 'color-converter' },
  { label: '大小写转换', context: 'case-converter' },
  { label: '文本到 ASCII 二进制', context: 'text-to-binary' },
  { label: '文本转 Unicode', context: 'text-to-unicode' },
  { label: 'YAML◀▶JSON', context: 'yaml-json-converter' },
  { label: 'YAML◀▶TOML', context: 'yaml-toml-converter' },
  { label: 'JSON◀▶TOML', context: 'json-toml-converter' },
  { label: 'JSON◀▶CSV', context: 'json-csv-converter' },
  { label: 'List 转换器', context: 'list-converter' },
  { label: 'JSON格式化', context: 'json-formatter' },
  { label: 'SQL格式化', context: 'sql-formatter' },
  { label: 'XML格式化', context: 'xml-formatter' },
  { label: 'YAML格式化', context: 'yaml-formatter' },
  { label: 'HTML格式化', context: 'html-formatter' }
]

export const NetWork: MenuContext[] = [
  { label: 'IPv4子网计算器', context: 'ipv4-subnet-calculator' },
  { label: 'Ipv4地址转换器', context: 'ipv4-address-converter' },
  { label: 'MAC地址查找', context: 'mac-address-lookup' },
  { label: 'MAC 地址生成器', context: 'mac-address-generator' },
  { label: 'IPv6 ULA生成器', context: 'ipv6-ula-generator' },
  { label: 'WiFi 二维码生成器', context: 'wifi-qrcode-generator' },
  { label: '二维码生成器', context: 'qrcode-generator' }
]

export const Information: MenuContext[] = [
  { label: 'ASCII对照表', context: 'ascii-table' },
  { label: 'HTML特殊字符查询', context: 'html-special-char-table' },
  { label: '数学公式符号', context: 'formula-symbol-table' },
  { label: '物理符号常数', context: 'physical-symbolic-constant' },
  { label: '子网掩码对照表', context: 'subnet-mask-map-table' },
  { label: 'HTTP状态码查询', context: 'http-status-code-table' },
  { label: '数字大小写', context: 'numeric-case-table' },
  { label: '常用字体对照', context: 'normal-font-style-table' },
  { label: '文件类型（MIME头）', context: 'file-name-extension-table' },
  { label: '希腊字母对照', context: 'greece-letter-table' }
]

export function GenElectronMenuItem(
  mainWindow: Electron.BrowserWindow,
  channel: string,
  items: MenuContext[]
): Electron.MenuItemConstructorOptions[] {
  return items.map((item) => {
    return {
      label: item.label, // 根据类别设置标签
      click: () => {
        mainWindow.webContents.send(channel, item.context)
      }
    }
  })
}

export interface SubMenuItems {
  label: string
  MenuContext: MenuContext[]
}

export function GenElectronSubMenuItem(
  mainWindow: Electron.BrowserWindow,
  channel: string,
  items: SubMenuItems[]
): Electron.MenuItemConstructorOptions[] {
  return items.map((item) => {
    return {
      label: item.label, // 根据类别设置标签
      submenu: GenElectronMenuItem(mainWindow, channel, item.MenuContext)
    }
  })
}

